// milp.js — 時間索引 MILP（SPEC §4.1、§4.2）。建模／解碼為純函式；solve 需 glpk.js（window.GLPK）。
(function (root) {
  'use strict';
  const SGS = (root.SGS = root.SGS || {});
  const E = () => SGS.engine;

  // GLPK 常數（glpk.js 5.0 固定值；solve 時以實例值覆寫）
  const K = { GLP_MIN: 1, GLP_MAX: 2, GLP_FR: 1, GLP_LO: 2, GLP_UP: 3, GLP_DB: 4, GLP_FX: 5,
              GLP_UNDEF: 1, GLP_FEAS: 2, GLP_INFEAS: 3, GLP_NOFEAS: 4, GLP_OPT: 5, GLP_UNBND: 6,
              GLP_MSG_OFF: 0, GLP_MSG_ERR: 1 };

  // ---------- 建模 ----------
  // 回傳 { lp, vars:[{name, req, antenna, start, coef}], stats, eps }
  function buildLP(norm, opts) {
    opts = opts || {};
    const G = Object.assign({}, K, opts.constants || {});
    const relax = !!opts.relax;
    const n = norm.requests.length, H = norm.H;
    const eps = 1 / (n * H + 1);
    const vars = [];
    const byAnt = {}, bySat = {};
    norm.requests.forEach((r) => {
      norm.antennas.forEach((a) => {
        E().feasibleStarts(norm, r.id, a.id).forEach((t) => {
          const v = { name: 'x' + vars.length, req: r.id, antenna: a.id, start: t,
                      coef: 1 - eps * (t - r.start), end: t + r.durMin, occEnd: t + r.durMin + a.calib, sat: r.sat };
          vars.push(v);
          (byAnt[a.id] = byAnt[a.id] || []).push(v);
          (bySat[r.sat] = bySat[r.sat] || []).push(v);
        });
      });
    });
    const rows = [];
    let nnz = 0;
    const addRow = (name, list) => {
      if (list.length < 2) return; // 單變數列由 0..1 界隱含
      rows.push({ name, vars: list.map((v) => ({ name: v.name, coef: 1 })), bnds: { type: G.GLP_UP, ub: 1, lb: 0 } });
      nnz += list.length;
    };
    // 每需求至多一次
    const byReq = {};
    vars.forEach((v) => (byReq[v.req] = byReq[v.req] || []).push(v));
    Object.keys(byReq).forEach((rid) => addRow('req_' + rid, byReq[rid]));
    // 天線 + 校準：τ ∈ [t, occEnd)
    Object.keys(byAnt).forEach((aid) => {
      for (let tau = 0; tau < H; tau++) addRow(`ant_${aid}_${tau}`, byAnt[aid].filter((v) => v.start <= tau && tau < v.occEnd));
    });
    // 衛星互斥：τ ∈ [t, end)
    Object.keys(bySat).forEach((sid) => {
      for (let tau = 0; tau < H; tau++) addRow(`sat_${sid}_${tau}`, bySat[sid].filter((v) => v.start <= tau && tau < v.end));
    });
    const lp = {
      name: relax ? 'sgs_lp_relax' : 'sgs_milp',
      objective: { direction: G.GLP_MAX, name: 'obj', vars: vars.map((v) => ({ name: v.name, coef: v.coef })) },
      subjectTo: rows,
    };
    if (relax) lp.bounds = vars.map((v) => ({ name: v.name, type: G.GLP_DB, lb: 0, ub: 1 }));
    else lp.binaries = vars.map((v) => v.name);
    return { lp, vars, eps, stats: { candidates: vars.length, rows: rows.length, nonzeros: nnz } };
  }

  // 解 → Schedule（值 > 0.5 視為 1）
  function solutionToSchedule(built, values) {
    const out = [];
    built.vars.forEach((v) => {
      const x = values ? values[v.name] : 0;
      if (typeof x === 'number' && x > 0.5) out.push({ req: v.req, antenna: v.antenna, start: v.start });
    });
    return out;
  }

  // ---------- 版本閘門（§4.2 第 6 點；MILP 與 GA 共用） ----------
  function createGate() {
    const st = { revision: 0, activeRunId: null, counter: 0 };
    return {
      state: st,
      setRevision(rev) { st.revision = rev; st.activeRunId = null; },
      begin(rev) { st.revision = rev; st.activeRunId = 'run' + (++st.counter); return st.activeRunId; },
      cancel() { st.activeRunId = null; },
      accepts(msg) { return !!msg && msg.revision === st.revision && msg.runId != null && msg.runId === st.activeRunId; },
    };
  }

  function statusLabel(status, G, timedOut) {
    G = Object.assign({}, K, G || {});
    if (status === G.GLP_OPT) return { kind: 'opt', text: '已證明最佳' };
    if (status === G.GLP_FEAS) return { kind: 'feas', text: '有可行解，未證明最佳' + (timedOut ? '（超時）' : '') };
    return { kind: 'bad', text: '模型／數值異常，待診斷（status=' + status + '）' };
  }

  // ---------- 求解（需 glpk 實例） ----------
  // 回傳 { status, label, schedule, score, bound:{U, absoluteGap, relativeGap}|null, stats, timing, revision, runId }
  async function solve(norm, options) {
    options = options || {};
    const glpk = options.glpk || (await root.GLPK());
    const G = { GLP_MAX: glpk.GLP_MAX, GLP_UP: glpk.GLP_UP, GLP_DB: glpk.GLP_DB, GLP_OPT: glpk.GLP_OPT, GLP_FEAS: glpk.GLP_FEAS };
    const tmlim = Math.max(1, Math.floor(options.tmlim || 30));
    const milpLimit = Math.max(1, Math.floor(tmlim * 0.8));
    const t0 = now();
    const built = buildLP(norm, { constants: G });
    const buildMs = now() - t0;
    const empty = built.vars.length === 0;
    let status, values = {}, z = 0, milpMs = 0;
    if (empty) { status = G.GLP_OPT; }
    else {
      const t1 = now();
      const res = await glpk.solve(built.lp, { msglev: glpk.GLP_MSG_OFF, presol: true, tmlim: milpLimit });
      milpMs = now() - t1;
      status = res.result.status; values = res.result.vars || {}; z = res.result.z;
    }
    const timedOut = status === G.GLP_FEAS && milpMs >= milpLimit * 1000 * 0.95;
    const schedule = status === G.GLP_OPT || status === G.GLP_FEAS ? solutionToSchedule(built, values) : [];
    const fe = E().checkFeasible(norm, schedule);
    const sc = E().score(norm, schedule);
    let bound = null, lpMs = 0;
    if (status === G.GLP_FEAS && fe.ok) {
      const remaining = tmlim - milpLimit;
      if (remaining >= 1) {
        const relax = buildLP(norm, { constants: G, relax: true });
        const t2 = now();
        const lr = await glpk.solve(relax.lp, { msglev: glpk.GLP_MSG_OFF, presol: true, tmlim: remaining });
        lpMs = now() - t2;
        if (lr.result.status === G.GLP_OPT) {
          const U = lr.result.z, L = sc.objective;
          if (U < L - 1e-6) bound = { error: 'LP 上界小於可行解目標值，計算錯誤', U, L };
          else { const abs = Math.max(0, U - L); bound = { U, L, absoluteGap: abs, relativeGap: abs / Math.max(1, Math.abs(L)) }; }
        }
      }
    }
    return {
      status, label: statusLabel(status, G, timedOut), timedOut,
      schedule, feasible: fe.ok, violations: fe.violations, score: sc, z,
      bound, stats: built.stats, eps: built.eps,
      timing: { buildMs, milpMs, lpMs, tmlim, milpLimit },
      revision: options.revision, runId: options.runId,
      error: !fe.ok && schedule.length ? 'MILP 解未通過 checkFeasible（視為錯誤）' : null,
    };
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  SGS.milp = { buildLP, solutionToSchedule, createGate, statusLabel, solve, K };
})(typeof globalThis !== 'undefined' ? globalThis : this);
