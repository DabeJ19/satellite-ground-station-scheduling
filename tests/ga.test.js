// tests/ga.test.js — SPEC §5、§3 generateInstance、§8 S2 驗收（Node 部分）。執行：node tests/ga.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../src/engine.js');
require('../src/milp.js');
require('../src/ga.js');
const { engine: E, milp: M, ga: G } = globalThis.SGS;
const DEFAULT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'default.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const tests = []; const test = (name, fn) => tests.push({ name, fn }); const section = (name) => tests.push({ section: name });

section('§5.1 encodings & decode consistency (§8.2 for GA phenotypes)');
test('indirect decode == greedyDecode; score identical to engine.score of the phenotype', () => {
  const norm = E.normalize(DEFAULT);
  const p = G.resolveParams(norm, { encoding: 'indirect' });
  const ctx = G.buildContext(norm);
  const ch = { perm: [0, 1, 2, 3, 4, 5], pref: [0, 0, 0, 0, 0, 0] };
  const ev = G.decode(ctx, p, ch);
  const expect = E.greedyDecode(norm, ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], { R1: 'GS_1-S', R2: 'GS_2-X', R3: 'GS_1-S', R4: 'GS_2-X', R5: 'GS_1-S', R6: 'GS_2-X' });
  assert.deepStrictEqual(ev.schedule, expect);
  assert.deepStrictEqual(ev.score, E.score(norm, ev.schedule));
  assert.deepStrictEqual([ev.score.assigned, ev.score.totalWait], [4, 5]);
});
test('indirect: a chromosome reconstructing the (5,11) optimum exists (Codex §B proof)', () => {
  const norm = E.normalize(DEFAULT);
  const p = G.resolveParams(norm, { encoding: 'indirect' });
  const ctx = G.buildContext(norm);
  // order by optimal start: R1(0) R2(5) R3(8) R6(22) R5(24), then R4 last; prefs = optimal antennas
  const idx = Object.fromEntries(norm.requests.map((r, i) => [r.id, i]));
  const perm = ['R1', 'R2', 'R3', 'R6', 'R5', 'R4'].map((id) => idx[id]);
  const prefAnt = { R1: 'GS_1-S', R2: 'GS_2-X', R3: 'GS_2-S', R6: 'GS_2-X', R5: 'GS_1-S', R4: 'GS_2-X' };
  const pref = norm.requests.map((r, i) => ctx.compat[i].indexOf(prefAnt[r.id]));
  const ev = G.decode(ctx, p, { perm, pref });
  assert.deepStrictEqual([ev.score.assigned, ev.score.totalWait], [5, 11]);
});
test('direct/repair: phenotype always feasible; score == engine.score', () => {
  const norm = E.normalize(DEFAULT);
  const p = G.resolveParams(norm, { encoding: 'direct', directMode: 'repair' });
  const ctx = G.buildContext(norm);
  const rnd = E.mulberry32(3);
  for (let i = 0; i < 50; i++) {
    const ev = G.decode(ctx, p, G.randomChromosome(ctx, p, rnd));
    assert.ok(E.checkFeasible(norm, ev.schedule).ok);
    assert.deepStrictEqual(ev.score, E.score(norm, ev.schedule));
  }
});
test('direct/repair removes a gene violating its own window (not only pairwise conflicts)', () => {
  const norm = E.normalize(DEFAULT);
  const p = G.resolveParams(norm, { encoding: 'direct', directMode: 'repair' });
  const ctx = G.buildContext(norm);
  const genes = norm.requests.map(() => ({ assign: 0, ant: -1, start: 0 }));
  genes[0] = { assign: 1, ant: 0, start: 30 }; // R1 at GS_1-S start 30: outside request window → window violation alone
  const ev = G.decode(ctx, p, { genes });
  assert.deepStrictEqual(ev.schedule, []);
});
test('direct/penalty: λ default n+1; infeasible raw fitness < 0 (≤ −(n+1)/(nH+1)); feasible equals objective', () => {
  const norm = E.normalize(DEFAULT);
  const p = G.resolveParams(norm, { encoding: 'direct', directMode: 'penalty' });
  assert.strictEqual(p.lambda, 7);
  const ctx = G.buildContext(norm);
  const genes = norm.requests.map(() => ({ assign: 0, ant: -1, start: 0 }));
  genes[0] = { assign: 1, ant: 0, start: 30 }; // one window violation
  const ev = G.decode(ctx, p, { genes });
  assert.strictEqual(ev.feasible, false); assert.strictEqual(ev.violations, 1);
  assert.ok(ev.fitness < 0 && ev.fitness <= -7 / 241 + 1e-12, 'fitness=' + ev.fitness);
  const g2 = norm.requests.map(() => ({ assign: 0, ant: -1, start: 0 })); g2[0] = { assign: 1, ant: 0, start: 0 };
  const ev2 = G.decode(ctx, p, { genes: g2 });
  assert.strictEqual(ev2.feasible, true); assert.ok(Math.abs(ev2.fitness - ev2.score.objective) < 1e-12);
});
test('N1 counterexample shape: penalty with negative wait stays < 0', () => {
  const d = { meta: { horizonMin: 10, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }],
    stations: [{ id: 'G', antennas: [{ id: 'a', band: 'S' }] }], visibility: [{ sat: 'A', station: 'G', start: 0, end: 10 }],
    requests: [{ id: 'r', sat: 'A', band: 'S', durMin: 1, start: 9, end: 10 }] };
  const norm = E.normalize(d);
  const p = G.resolveParams(norm, { encoding: 'direct', directMode: 'penalty' });
  const ctx = G.buildContext(norm);
  const ev = G.decode(ctx, p, { genes: [{ assign: 1, ant: 0, start: 0 }] });
  assert.strictEqual(ev.feasible, false);
  assert.ok(Math.abs(ev.fitness - (-2 / 11)) < 1e-12, 'fitness=' + ev.fitness);
});

section('§5.2 operators, determinism, stopping');
test('OX crossover yields a permutation', () => {
  const rnd = E.mulberry32(1);
  for (let i = 0; i < 100; i++) {
    const a = [0, 1, 2, 3, 4, 5, 6].sort(() => rnd() - 0.5), b = [0, 1, 2, 3, 4, 5, 6].sort(() => rnd() - 0.5);
    const c = G.ox(a, b, rnd);
    assert.deepStrictEqual(c.slice().sort(), [0, 1, 2, 3, 4, 5, 6]);
  }
});
test('same seed → identical history and best; different seed → may differ', () => {
  const norm = E.normalize(DEFAULT);
  const a = G.run(norm, { seed: 7 }), b = G.run(norm, { seed: 7 });
  assert.deepStrictEqual(a.history, b.history); assert.deepStrictEqual(a.best, b.best);
});
test('stop reasons: stagnation vs generations; shouldStop → cancelled', () => {
  const norm = E.normalize(DEFAULT);
  assert.strictEqual(G.run(norm, { seed: 1, generations: 500, stagnation: 5 }).stopReason, 'stagnation');
  assert.strictEqual(G.run(norm, { seed: 1, generations: 3, stagnation: 500 }).stopReason, 'generations');
  let calls = 0;
  const r = G.run(norm, { seed: 1, generations: 100, stagnation: 100 }, { shouldStop: () => ++calls >= 2 });
  assert.strictEqual(r.stopReason, 'cancelled'); assert.strictEqual(r.generations, 2);
});
test('run seeds: (base+i)>>>0 from i=0; default 42,20 → 42..61', () => {
  assert.deepStrictEqual(G.runSeeds(42, 20), Array.from({ length: 20 }, (_, i) => 42 + i));
  assert.deepStrictEqual(G.runSeeds(0xFFFFFFFF, 2), [0xFFFFFFFF, 0]);
});

section('§8 S2 acceptance (Node part)');
test('PPT instance, defaults, seeds 42..61: 20/20 hit (5,11)', () => {
  const norm = E.normalize(DEFAULT);
  const results = G.runSeeds(42, 20).map((seed) => G.run(norm, { seed }));
  const s = G.summarize(results, { score: { assigned: 5, totalWait: 11 }, proven: true });
  assert.strictEqual(s.hitZW, 20); assert.strictEqual(s.hitZWRate, 1);
  assert.strictEqual(s.hitZ, 20);
  results.forEach((r) => assert.ok(E.checkFeasible(norm, r.best.schedule).ok));
});
test('summarize edge cases: runs=1 → sd N/A; zero hits → meanGenToHit N/A, miss=runs', () => {
  const norm = E.normalize(DEFAULT);
  const one = G.summarize([G.run(norm, { seed: 1 })], { score: { assigned: 5, totalWait: 11 }, proven: true });
  assert.strictEqual(one.sdZ, null); assert.strictEqual(one.sdW, null);
  const none = G.summarize([G.run(norm, { seed: 1 }), G.run(norm, { seed: 2 })], { score: { assigned: 6, totalWait: 0 }, proven: false });
  assert.strictEqual(none.hitZW, 0); assert.strictEqual(none.meanGenToHit, null); assert.strictEqual(none.missZW, 2);
  assert.strictEqual(none.gapZ, 1);
});
test('generateInstance: seeded & reproducible, validateData ok, candidates exist', () => {
  for (const seed of [1, 2, 3, 42]) {
    const d = E.generateInstance(seed, { nReq: 30, nSat: 6, nStation: 3 });
    assert.ok(E.validateData(d).ok);
    assert.deepStrictEqual(d, E.generateInstance(seed, { nReq: 30, nSat: 6, nStation: 3 }));
    const norm = E.normalize(d);
    assert.strictEqual(norm.requests.length, 30);
    const cands = norm.requests.reduce((c, r) => c + norm.antennas.reduce((cc, a) => cc + E.feasibleStarts(norm, r.id, a.id).length, 0), 0);
    assert.ok(cands > 0);
  }
  assert.notDeepStrictEqual(E.generateInstance(1, { nReq: 5 }), E.generateInstance(2, { nReq: 5 }));
});
test('30-request instance: GA runs, feasible best, finishes under 5 s', () => {
  const norm = E.normalize(E.generateInstance(1, { nReq: 30, nSat: 6, nStation: 3 }));
  const t = Date.now();
  const r = G.run(norm, { seed: 42 });
  assert.ok(Date.now() - t < 5000);
  assert.ok(E.checkFeasible(norm, r.best.schedule).ok);
  assert.ok(r.best.score.assigned > 0);
  const built = M.buildLP(norm);
  assert.ok(built.vars.length > 0 && built.stats.rows > 0);
});

(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) {
    if (t.section) { console.log(t.section); continue; }
    try { await t.fn(); passed++; console.log('  ✔', t.name); }
    catch (e) { failed++; console.log('  ✘', t.name, '\n    ', e.message); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
