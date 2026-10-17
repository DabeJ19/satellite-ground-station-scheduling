// ga.js — 基因演算法（SPEC §5）。純函式，掛在 globalThis.SGS.ga；同一份原始碼內嵌於主頁與 Blob worker。
// 兩種編碼：indirect（優先序排列 + 天線偏好 + 貪婪解碼）、direct（assign/antenna/start 基因，修復或罰則）。
(function (root) {
  'use strict';
  const SGS = (root.SGS = root.SGS || {});
  const E = () => SGS.engine;

  const DEFAULTS = Object.freeze({
    encoding: 'indirect',      // 'indirect' | 'direct'
    directMode: 'repair',      // 'repair' | 'penalty'（僅 direct）
    lambda: null,              // 罰則權重；null → |R|+1
    popSize: 50, generations: 200, stagnation: 50,
    pc: 0.9, pm: 0.1, tournamentK: 3, elite: 2,
    seed: 42,
  });

  function resolveParams(norm, p) {
    const q = Object.assign({}, DEFAULTS, p || {});
    q.popSize = Math.max(2, q.popSize | 0); q.generations = Math.max(1, q.generations | 0); q.stagnation = Math.max(1, q.stagnation | 0);
    q.tournamentK = Math.max(1, q.tournamentK | 0); q.elite = Math.max(0, Math.min(q.popSize - 1, q.elite | 0));
    q.pc = Math.min(1, Math.max(0, +q.pc)); q.pm = Math.min(1, Math.max(0, +q.pm));
    q.seed = q.seed >>> 0;
    q.lambda = (q.lambda == null || !Number.isFinite(+q.lambda)) ? norm.requests.length + 1 : +q.lambda;
    return q;
  }

  // ---------- 問題結構（候選快取） ----------
  function buildContext(norm) {
    const reqs = norm.requests;
    const compat = reqs.map((r) => norm.antennas.filter((a) => a.band === r.band).map((a) => a.id));
    const starts = reqs.map((r, i) => compat[i].map((aid) => E().feasibleStarts(norm, r.id, aid)));
    return { norm, reqs, compat, starts, n: reqs.length };
  }

  // ---------- 編碼 ----------
  // indirect: { perm: [reqIndex...], pref: [compatIndex | -1] }
  // direct:   { genes: [{ assign:0|1, ant: compatIndex, start: int }] }
  function randomChromosome(ctx, p, rnd) {
    if (p.encoding === 'indirect') {
      const perm = ctx.reqs.map((_, i) => i);
      for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      const pref = ctx.reqs.map((_, i) => ctx.compat[i].length ? Math.floor(rnd() * ctx.compat[i].length) : -1);
      return { perm, pref };
    }
    const genes = ctx.reqs.map((_, i) => {
      const c = ctx.compat[i];
      if (!c.length) return { assign: 0, ant: -1, start: 0 };
      const ant = Math.floor(rnd() * c.length);
      const st = ctx.starts[i][ant];
      return { assign: rnd() < 0.8 ? 1 : 0, ant, start: st.length ? st[Math.floor(rnd() * st.length)] : 0 };
    });
    return { genes };
  }

  function decode(ctx, p, ch) {
    const norm = ctx.norm;
    if (p.encoding === 'indirect') {
      const order = ch.perm.map((i) => ctx.reqs[i].id);
      const pref = new Map();
      ch.pref.forEach((k, i) => { if (k >= 0 && ctx.compat[i][k]) pref.set(ctx.reqs[i].id, ctx.compat[i][k]); });
      const schedule = E().greedyDecode(norm, order, pref);
      const sc = E().score(norm, schedule);
      return { schedule, score: sc, fitness: sc.objective, rawFitness: sc.objective, feasible: true, violationCount: 0, violations: [] };
    }
    // direct：依 requests 陣列順序組 phenotype
    const raw = [];
    ch.genes.forEach((g, i) => {
      if (!g.assign || g.ant < 0 || !ctx.compat[i][g.ant] || !Number.isInteger(g.start) || g.start < 0) return;
      raw.push({ req: ctx.reqs[i].id, antenna: ctx.compat[i][g.ant], start: g.start });
    });
    if (p.directMode === 'repair') {
      // 逐筆試加，對試加後的 Schedule 呼叫完整 checkFeasible；任一違規即移除該筆
      const kept = [];
      raw.forEach((it) => { kept.push(it); if (!E().checkFeasible(norm, kept).ok) kept.pop(); });
      const sc = E().score(norm, kept);
      return { schedule: kept, score: sc, fitness: sc.objective, rawFitness: sc.objective, feasible: true, violationCount: 0, violations: [] };
    }
    // penalty：V = 共用檢查器去重後的違規筆數；保留集合供診斷
    const fe = E().checkFeasible(norm, raw);
    const sc = E().score(norm, raw);
    const V = fe.violations.length;
    const raw_f = sc.objective - p.lambda * V;
    return { schedule: raw, score: sc, fitness: raw_f, rawFitness: raw_f, feasible: fe.ok, violationCount: V, violations: fe.violations };
  }

  // ---------- 算子 ----------
  function tournament(pop, fits, k, rnd) {
    let best = -1;
    for (let i = 0; i < k; i++) { const j = Math.floor(rnd() * pop.length); if (best < 0 || fits[j] > fits[best]) best = j; }
    return pop[best];
  }
  function ox(a, b, rnd) {           // Order Crossover（排列）
    const n = a.length; if (n < 2) return a.slice();
    let i = Math.floor(rnd() * n), j = Math.floor(rnd() * n); if (i > j) [i, j] = [j, i];
    const child = new Array(n).fill(-1); const used = new Set();
    for (let k = i; k <= j; k++) { child[k] = a[k]; used.add(a[k]); }
    let pos = (j + 1) % n;
    for (let k = 0; k < n; k++) { const g = b[(j + 1 + k) % n]; if (!used.has(g)) { child[pos] = g; pos = (pos + 1) % n; } }
    return child;
  }
  function crossover(ctx, p, a, b, rnd) {
    if (rnd() >= p.pc) return clone(a);
    if (p.encoding === 'indirect') {
      return { perm: ox(a.perm, b.perm, rnd), pref: a.pref.map((x, i) => (rnd() < 0.5 ? x : b.pref[i])) };
    }
    return { genes: a.genes.map((g, i) => clone(rnd() < 0.5 ? g : b.genes[i])) };
  }
  function mutate(ctx, p, ch, rnd) {
    if (p.encoding === 'indirect') {
      if (rnd() < p.pm && ch.perm.length > 1) { const i = Math.floor(rnd() * ch.perm.length), j = Math.floor(rnd() * ch.perm.length); [ch.perm[i], ch.perm[j]] = [ch.perm[j], ch.perm[i]]; }
      ch.pref.forEach((_, i) => { if (rnd() < p.pm && ctx.compat[i].length) ch.pref[i] = Math.floor(rnd() * ctx.compat[i].length); });
      return ch;
    }
    ch.genes.forEach((g, i) => {
      const c = ctx.compat[i]; if (!c.length) return;
      if (rnd() < p.pm) g.assign = g.assign ? 0 : 1;
      if (rnd() < p.pm) { g.ant = Math.floor(rnd() * c.length); const st = ctx.starts[i][g.ant]; g.start = st.length ? st[Math.floor(rnd() * st.length)] : 0; }
      if (rnd() < p.pm) { const st = ctx.starts[i][g.ant] || []; if (st.length) { const d = Math.floor(rnd() * 5) - 2; const cur = Math.max(0, st.indexOf(g.start)); g.start = st[Math.min(st.length - 1, Math.max(0, cur + d))]; } }
    });
    return ch;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- 單次 run ----------
  // onGeneration(info) 每代呼叫（可用於進度回報）；shouldStop() 回 true 時提前結束（stopReason='cancelled'）
  function run(norm, params, hooks) {
    hooks = hooks || {};
    const p = resolveParams(norm, params);
    const ctx = buildContext(norm);
    const rnd = E().mulberry32(p.seed);
    const t0 = nowMs();
    const history = [];
    let best = { schedule: [], score: E().score(norm, []), gen: 0 };   // 最佳「可行」phenotype（空排程保底）
    let bestFit = -Infinity, bestGen = 0, stagnant = 0, stopReason = 'generations';
    const consider = (ev, g) => { if (ev.feasible && E().compareScores(ev.score, best.score) > 0) best = { schedule: ev.schedule, score: ev.score, gen: g }; };
    // 世代編號統一：初始族群 = 第 0 代；第 k 批子代 = 第 k 代。history / onGeneration / best.gen / bestGen 全用同一編號。
    const record = (g, evals) => {
      const fits = evals.map((e) => e.fitness);
      const genBest = Math.max(...fits), genAvg = fits.reduce((a, b) => a + b, 0) / fits.length;
      if (genBest > bestFit + 1e-12) { bestFit = genBest; stagnant = 0; bestGen = g; } else stagnant++;
      history.push({ gen: g, best: genBest, avg: genAvg, bestAssigned: best.score.assigned, bestWait: best.score.totalWait });
      if (hooks.onGeneration) hooks.onGeneration({ gen: g, best: genBest, avg: genAvg, bestScore: best.score });
      return fits;
    };
    let pop = Array.from({ length: p.popSize }, () => randomChromosome(ctx, p, rnd));
    let evals = pop.map((ch) => decode(ctx, p, ch));
    let gen = 0;
    evals.forEach((ev) => consider(ev, 0));
    let fits = record(0, evals);
    while (gen < p.generations) {
      if (hooks.shouldStop && hooks.shouldStop()) { stopReason = 'cancelled'; break; }
      if (stagnant >= p.stagnation) { stopReason = 'stagnation'; break; }
      const idx = fits.map((f, i) => i).sort((a, b) => fits[b] - fits[a]);
      const next = idx.slice(0, p.elite).map((i) => clone(pop[i]));
      while (next.length < p.popSize) {
        const a = tournament(pop, fits, p.tournamentK, rnd), b = tournament(pop, fits, p.tournamentK, rnd);
        next.push(mutate(ctx, p, crossover(ctx, p, a, b, rnd), rnd));
      }
      pop = next; gen++;
      evals = pop.map((ch) => decode(ctx, p, ch));
      evals.forEach((ev) => consider(ev, gen));
      fits = record(gen, evals);
    }
    return {
      params: p, best, bestFitness: bestFit, bestGen, generations: gen, stopReason, history,
      elapsedMs: nowMs() - t0,
      lastPopulation: evals.map((e) => ({ feasible: e.feasible, violationCount: e.violationCount, violations: e.violations, rawFitness: e.rawFitness, score: e.score })),
    };
  }

  // ---------- 多次 run 統計（§5.3；run seed = (baseSeed + i) >>> 0，i 從 0） ----------
  function runSeeds(baseSeed, runs) { return Array.from({ length: runs }, (_, i) => (baseSeed + i) >>> 0); }
  function summarize(results, reference) {
    // reference: { score:{assigned,totalWait}, proven:boolean } | null
    const n = results.length;
    const Z = results.map((r) => r.best.score.assigned), W = results.map((r) => r.best.score.totalWait);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = (xs) => xs.length < 2 ? null : Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1));
    const out = { runs: n, bestZ: Math.max(...Z), meanZ: mean(Z), sdZ: sd(Z), bestW: null, meanW: mean(W), sdW: sd(W), meanGenerations: mean(results.map((r) => r.generations)), meanMs: mean(results.map((r) => r.elapsedMs)) };
    const bestIdx = results.reduce((b, r, i) => (b < 0 || E().compareScores(r.best.score, results[b].best.score) > 0 ? i : b), -1);
    out.bestW = results[bestIdx].best.score.totalWait;
    out.bestRunIndex = bestIdx;
    if (reference && reference.score) {
      const hitZ = results.filter((r) => r.best.score.assigned === reference.score.assigned);
      const hitZW = hitZ.filter((r) => r.best.score.totalWait === reference.score.totalWait);
      out.reference = { assigned: reference.score.assigned, totalWait: reference.score.totalWait, proven: !!reference.proven };
      out.hitZ = hitZ.length; out.hitZW = hitZW.length;
      out.hitZRate = hitZ.length / n; out.hitZWRate = hitZW.length / n;
      out.meanGenToHit = hitZW.length ? mean(hitZW.map((r) => r.best.gen)) : null;
      out.missZW = n - hitZW.length;
      out.gapZ = reference.score.assigned - out.bestZ;
    }
    return out;
  }

  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  SGS.ga = { DEFAULTS, resolveParams, buildContext, randomChromosome, decode, run, runSeeds, summarize, ox };
})(typeof globalThis !== 'undefined' ? globalThis : this);
