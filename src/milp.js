// milp.js — 時間索引 MILP（SPEC §4.1、§4.2）。建模／解碼為純函式；solve 需 glpk 實例（可注入，測試用）。
(function (root) {
  'use strict';
  const SGS = (root.SGS = root.SGS || {});
  const E = () => SGS.engine;

  // GLPK 常數（glpk.js 5.0 固定值；solve 時以實例值覆寫）
  const K = { GLP_MIN: 1, GLP_MAX: 2, GLP_FR: 1, GLP_LO: 2, GLP_UP: 3, GLP_DB: 4, GLP_FX: 5,
              GLP_UNDEF: 1, GLP_FEAS: 2, GLP_INFEAS: 3, GLP_NOFEAS: 4, GLP_OPT: 5, GLP_UNBND: 6,
              GLP_MSG_OFF: 0, GLP_MSG_ERR: 1 };

  // ---------- 建模 ----------
  function buildLP(norm, opts) {
    opts = opts || {};
    const G = Object.assign({}, K, opts.constants || {});
    const relax = !!opts.relax;
    const n = norm.requests.length, H = norm.H;
    const eps = 1 / (n * H + 1);
    const vars = [];
    const byAnt = new Map(), bySat = new Map(), byReq = new Map();
    const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    norm.requests.forEach((r) => {
      norm.antennas.forEach((a) => {
        E().feasibleStarts(norm, r.id, a.id).forEach((t) => {
          const v = { name: 'x' + vars.length, req: r.id, antenna: a.id, start: t,
                      coef: 1 - eps * (t - r.start), end: t + r.durMin, occEnd: t + r.durMin + a.calib, sat: r.sat };
          vars.push(v);
          push(byAnt, a.id, v); push(bySat, r.sat, v); push(byReq, r.id, v);
        });
      });
    });
    const rows = [];
    let nnz = 0;
    const addRow = (name, list) => {
      if (list.length < 2) return; // 單變數列由 0..1 界隱含；空列恆真
      rows.push({ name, vars: list.map((v) => ({ name: v.name, coef: 1 })), bnds: { type: G.GLP_UP, ub: 1, lb: 0 } });
      nnz += list.length;
    };
    let ri = 0;
    byReq.forEach((list) => addRow('req_' + (ri++), list));
    let ai = 0;
    byAnt.forEach((list) => { for (let tau = 0; tau < H; tau++) addRow(`ant_${ai}_${tau}`, list.filter((v) => v.start <= tau && tau < v.occEnd)); ai++; });
    let si = 0;
    bySat.forEach((list) => { for (let tau = 0; tau < H; tau++) addRow(`sat_${si}_${tau}`, list.filter((v) => v.start <= tau && tau < v.end)); si++; });
    const lp = {
      name: relax ? 'sgs_lp_relax' : 'sgs_milp',
      objective: { direction: G.GLP_MAX, name: 'obj', vars: vars.map((v) => ({ name: v.name, coef: v.coef })) },
      subjectTo: rows,
    };
    if (relax) lp.bounds = vars.map((v) => ({ name: v.name, type: G.GLP_DB, lb: 0, ub: 1 }));
    else lp.binaries = vars.map((v) => v.name);
    return { lp, vars, eps, stats: { candidates: vars.length, rows: rows.length, nonzeros: nnz } };
  }

  // 解 → Schedule。回傳 { schedule, error }：非有限值或非近似整數 → error。
  function solutionToSchedule(built, values, tol) {
    tol = tol == null ? 1e-6 : tol;
    const out = [];
    if (!values || typeof values !== 'object') return { schedule: null, error: '求解器未回傳變數值' };
    for (const v of built.vars) {
      const x = Object.prototype.hasOwnProperty.call(values, v.name) ? values[v.name] : 0;
      if (typeof x !== 'number' || !Number.isFinite(x)) return { schedule: null, error: `變數 ${v.name} 非有限值` };
      if (Math.abs(x - Math.round(x)) > tol || x < -tol || x > 1 + tol) return { schedule: null, error: `變數 ${v.name} 非 0/1：${x}` };
      if (Math.round(x) === 1) out.push({ req: v.req, antenna: v.antenna, start: v.start });
    }
    return { schedule: out, error: null };
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

  function statusLabel(status, G) {
    G = Object.assign({}, K, G || {});
    if (status === G.GLP_OPT) return { kind: 'opt', text: '已證明最佳' };
    if (status === G.GLP_FEAS) return { kind: 'feas', text: '有可行解，未證明最佳' };
    const names = { [G.GLP_UNDEF]: 'UNDEF', [G.GLP_INFEAS]: 'INFEAS', [G.GLP_NOFEAS]: 'NOFEAS', [G.GLP_UNBND]: 'UNBND' };
    return { kind: 'bad', text: `模型／數值異常，待診斷（${names[status] || 'status=' + status}）` };
  }

  // ---------- 求解 ----------
  // options: { glpk, tmlim, revision, runId, now }（now 可注入假時鐘，單位 ms）
  // 回傳 { status, label, hasIncumbent, schedule|null, feasible, violations, score|null, z, bound|null, bound.warning, stats, timing, revision, runId, error }
  async function solve(norm, options) {
    options = options || {};
    const now = options.now || defaultNow;
    const glpk = options.glpk || (await root.GLPK());
    const G = { GLP_MAX: glpk.GLP_MAX, GLP_UP: glpk.GLP_UP, GLP_DB: glpk.GLP_DB, GLP_OPT: glpk.GLP_OPT, GLP_FEAS: glpk.GLP_FEAS,
                GLP_UNDEF: glpk.GLP_UNDEF, GLP_INFEAS: glpk.GLP_INFEAS, GLP_NOFEAS: glpk.GLP_NOFEAS, GLP_UNBND: glpk.GLP_UNBND };
    const tmlim = Math.max(1, Math.floor(options.tmlim || 30));
    const milpLimit = Math.max(1, Math.floor(tmlim * 0.8));
    const lpQuota = tmlim - milpLimit;              // 保留配額（可能為 0）
    const t0 = now();
    const deadline = t0 + tmlim * 1000;
    const built = buildLP(norm, { constants: G });
    const buildMs = now() - t0;
    const base = { stats: built.stats, eps: built.eps, revision: options.revision, runId: options.runId };

    let status, values = {}, z = 0, milpMs = 0, solverCalls = 0;
    if (built.vars.length === 0) { status = G.GLP_OPT; }   // 零候選：已證明最佳的空解，不呼叫求解器
    else {
      const t1 = now();
      const res = await glpk.solve(built.lp, { msglev: glpk.GLP_MSG_OFF, presol: true, tmlim: milpLimit });
      solverCalls++;
      milpMs = now() - t1;
      if (!res || !res.result) throw new Error('求解器回傳格式錯誤');
      status = res.result.status; values = res.result.vars || {}; z = res.result.z;
    }
    const label = statusLabel(status, G);
    const timing = { buildMs, milpMs, lpMs: 0, tmlim, milpLimit, lpQuota };
    const hasIncumbent = status === G.GLP_OPT || status === G.GLP_FEAS;

    // 無 incumbent：不解碼、不給 schedule
    if (!hasIncumbent) {
      return Object.assign(base, { status, label, hasIncumbent: false, schedule: null, feasible: false, violations: [], score: null, z, bound: null, timing, solverCalls,
        error: '求解器未回傳可用整數解（' + label.text + '）' });
    }
    // 解碼並驗證有效性
    const dec = solutionToSchedule(built, values);
    if (dec.error) return Object.assign(base, { status, label: { kind: 'bad', text: '結果無效' }, hasIncumbent: false, schedule: null, feasible: false, violations: [], score: null, z, bound: null, timing, solverCalls, error: dec.error });
    const schedule = dec.schedule;
    const fe = E().checkFeasible(norm, schedule);
    const sc = E().score(norm, schedule);
    if (!fe.ok) return Object.assign(base, { status, label: { kind: 'bad', text: '結果無效' }, hasIncumbent: false, schedule: null, feasible: false, violations: fe.violations, score: null, z, bound: null, timing, solverCalls,
      error: 'MILP 解未通過 checkFeasible（視為錯誤）' });
    if (built.vars.length > 0 && (!Number.isFinite(z) || Math.abs(z - sc.objective) > 1e-6)) {
      return Object.assign(base, { status, label: { kind: 'bad', text: '結果無效' }, hasIncumbent: false, schedule: null, feasible: false, violations: [], score: null, z, bound: null, timing, solverCalls,
        error: `求解器目標值 ${z} 與重算 objective ${sc.objective} 不一致` });
    }

    // LP 鬆弛上界：僅 FEAS 時；獨立 try/catch；預算 = min(保留配額, 實際剩餘)
    let bound = null;
    if (status === G.GLP_FEAS) {
      const remainingSec = Math.floor((deadline - now()) / 1000);
      const lpLimit = Math.min(lpQuota, remainingSec);
      if (lpLimit >= 1) {
        try {
          const relax = buildLP(norm, { constants: G, relax: true });
          const t2 = now();
          const lr = await glpk.solve(relax.lp, { msglev: glpk.GLP_MSG_OFF, presol: true, tmlim: lpLimit });
          solverCalls++;
          timing.lpMs = now() - t2;
          timing.lpLimit = lpLimit;
          if (lr && lr.result && lr.result.status === G.GLP_OPT && Number.isFinite(lr.result.z)) {
            const U = lr.result.z, L = sc.objective;
            if (U < L - 1e-6) bound = { error: 'LP 上界小於可行解目標值，計算錯誤', U, L };
            else { const abs = Math.max(0, U - L); bound = { U, L, absoluteGap: abs, relativeGap: abs / Math.max(1, Math.abs(L)) }; }
          } else bound = { unavailable: true, warning: 'LP 鬆弛未解到最佳（status=' + (lr && lr.result ? lr.result.status : '?') + '），上界／gap 尚未取得' };
        } catch (e) {
          bound = { unavailable: true, warning: 'LP 鬆弛求解失敗：' + (e && e.message ? e.message : e) };
        }
      } else bound = { unavailable: true, warning: '無剩餘時間預算，未執行 LP 鬆弛' };
    }
    return Object.assign(base, { status, label, hasIncumbent: true, schedule, feasible: true, violations: [], score: sc, z, bound, timing, solverCalls, error: null,
      note: status === G.GLP_FEAS ? `MILP 用時 ${(milpMs / 1000).toFixed(1)} s／上限 ${milpLimit} s（求解器未回報停止原因）` : null });
  }

  const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  SGS.milp = { buildLP, solutionToSchedule, createGate, statusLabel, solve, K };
})(typeof globalThis !== 'undefined' ? globalThis : this);
