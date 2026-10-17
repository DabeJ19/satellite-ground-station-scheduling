// tests/engine.test.js — SPEC §1.3 fixtures、§8.1 邊界 D、§8.2 轉換 oracle、§8.3 閘門，以及 S1 審查 B1–B3、B6 回歸。
// 執行：node tests/engine.test.js（支援 async 測例）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../src/engine.js');
require('../src/milp.js');
const { engine: E, milp: M } = globalThis.SGS;

const DEFAULT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'default.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const sortSched = (s) => s.map((x) => `${x.req}/${x.antenna}/${x.start}`).sort();
const sortViol = (v) => v.map((x) => `${x.rule}:${x.reqs.slice().sort().join('|')}`).sort();
const close = (a, b, tol) => Math.abs(a - b) < (tol || 1e-9);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function section(name) { tests.push({ section: name }); }

// ===================== §1.3 =====================
section('§1.3 PPT fixtures');
test('(b) greedy fixture: exact set, (4,5,959/241)', () => {
  const norm = E.normalize(DEFAULT);
  const s = E.greedyDecode(norm, ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  assert.deepStrictEqual(sortSched(s), sortSched([
    { req: 'R1', antenna: 'GS_1-S', start: 0 }, { req: 'R2', antenna: 'GS_2-X', start: 5 },
    { req: 'R3', antenna: 'GS_2-S', start: 8 }, { req: 'R5', antenna: 'GS_1-S', start: 20 }]));
  const sc = E.score(norm, s);
  assert.deepStrictEqual([sc.assigned, sc.totalWait, sc.feasible], [4, 5, true]);
  assert.ok(close(sc.objective, 959 / 241));
});
test('(c) infeasible fixture: exactly 4 violations, no rule 1 for R2/R4', () => {
  const norm = E.normalize(DEFAULT);
  const s = [{ req: 'R1', antenna: 'GS_1-S', start: 0 }, { req: 'R2', antenna: 'GS_2-X', start: 3 },
    { req: 'R3', antenna: 'GS_2-S', start: 8 }, { req: 'R4', antenna: 'GS_2-X', start: 8 },
    { req: 'R5', antenna: 'GS_1-S', start: 20 }, { req: 'R6', antenna: 'GS_2-X', start: 22 }];
  const fe = E.checkFeasible(norm, s);
  assert.strictEqual(fe.ok, false);
  assert.deepStrictEqual(sortViol(fe.violations), ['2:R2|R4', '3:R1|R2', '3:R3|R4', '3:R5|R6']);
});
test('optimal (5,11) schedule is feasible and scores 1194/241', () => {
  const norm = E.normalize(DEFAULT);
  const s = [{ req: 'R1', antenna: 'GS_1-S', start: 0 }, { req: 'R2', antenna: 'GS_2-X', start: 5 },
    { req: 'R3', antenna: 'GS_2-S', start: 8 }, { req: 'R6', antenna: 'GS_2-X', start: 22 }, { req: 'R5', antenna: 'GS_1-S', start: 24 }];
  const sc = E.score(norm, s);
  assert.deepStrictEqual([sc.assigned, sc.totalWait, sc.feasible], [5, 11, true]);
  assert.ok(close(sc.objective, 1194 / 241));
});

// ===================== §8.1 =====================
section('§8.1 boundary fixture D');
const D = {
  meta: { name: 'S1 boundaries', timeOrigin: '10:00', horizonMin: 10, calibDefaultMin: 2 },
  bands: ['S', 'X'],
  satellites: [{ id: 'SAT_A', color: '#4f8ef7' }, { id: 'SAT_B', color: '#f28b5b' }],
  stations: [{ id: 'G', angleDeg: 0, antennas: [{ id: 'A', band: 'S', calibMin: null }] }],
  visibility: [{ sat: 'SAT_A', station: 'G', start: 0, end: 10 }, { sat: 'SAT_B', station: 'G', start: 0, end: 10 }],
  requests: [{ id: 'R1', sat: 'SAT_A', band: 'S', durMin: 2, start: 0, end: 10 },
             { id: 'R2', sat: 'SAT_B', band: 'S', durMin: 2, start: 0, end: 10 }],
};
const S12 = [{ req: 'R1', antenna: 'A', start: 0 }, { req: 'R2', antenna: 'A', start: 2 }];
test('D as-is (calibMin null) → calib 2; [R1/A/0,R2/A/2] only rule 2', () => {
  assert.ok(E.validateData(D).ok);
  const norm = E.normalize(D);
  assert.strictEqual(norm.antById.get('A').calib, 2);
  const fe = E.checkFeasible(norm, S12);
  assert.strictEqual(fe.ok, false);
  assert.deepStrictEqual(sortViol(fe.violations), ['2:R1|R2']);
});
test('D with calibMin field deleted → calib 2; S12 still only rule 2', () => {
  const d = clone(D); delete d.stations[0].antennas[0].calibMin;
  assert.ok(E.validateData(d).ok);
  const norm = E.normalize(d);
  assert.strictEqual(norm.antById.get('A').calib, 2);
  assert.deepStrictEqual(sortViol(E.checkFeasible(norm, S12).violations), ['2:R1|R2']);
});
test('calibMin=0 → effective 0; schedule ok, no violations', () => {
  const d = clone(D); d.stations[0].antennas[0].calibMin = 0;
  const norm = E.normalize(d);
  assert.strictEqual(norm.antById.get('A').calib, 0);
  const fe = E.checkFeasible(norm, S12);
  assert.deepStrictEqual([fe.ok, fe.violations], [true, []]);
});
test('calibMin=-1 → invalid, error path points to field; normalize throws', () => {
  const d = clone(D); d.stations[0].antennas[0].calibMin = -1;
  const v = E.validateData(d);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.path === 'stations[0].antennas[0].calibMin'));
  assert.throws(() => E.normalize(d));
});
test('calibDefaultMin=-1 → invalid', () => {
  const d = clone(D); d.meta.calibDefaultMin = -1;
  const v = E.validateData(d);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.path === 'meta.calibDefaultMin'));
});
test('duplicate request id in data → invalid', () => {
  const d = clone(D); d.requests.push(clone(d.requests[0]));
  const v = E.validateData(d);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.path === 'requests[2].id'));
});
test('schedule [R1/A/0, R1/A/4] → only duplicate-request', () => {
  const norm = E.normalize(D);
  const fe = E.checkFeasible(norm, [{ req: 'R1', antenna: 'A', start: 0 }, { req: 'R1', antenna: 'A', start: 4 }]);
  assert.strictEqual(fe.ok, false);
  assert.deepStrictEqual(sortViol(fe.violations), ['duplicate-request:R1']);
});
test('R1.end=6 & vis.end=6 → feasibleStarts [0..4]; R1/A/4 ok', () => {
  const d = clone(D); d.requests[0].end = 6; d.visibility[0].end = 6;
  const norm = E.normalize(d);
  assert.deepStrictEqual(E.feasibleStarts(norm, 'R1', 'A'), [0, 1, 2, 3, 4]);
  assert.ok(E.checkFeasible(norm, [{ req: 'R1', antenna: 'A', start: 4 }]).ok);
});
test('adjacent visibility [0,5)+[5,10) merge → [0,10); feasibleStarts 0..8; R1/A/4 ok', () => {
  const d = clone(D); d.visibility = [{ sat: 'SAT_A', station: 'G', start: 0, end: 5 }, { sat: 'SAT_A', station: 'G', start: 5, end: 10 }, d.visibility[1]];
  const norm = E.normalize(d);
  assert.deepStrictEqual(E.visSegments(norm, 'SAT_A', 'G').map((x) => x.slice()), [[0, 10]]);
  assert.deepStrictEqual(E.feasibleStarts(norm, 'R1', 'A'), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(E.checkFeasible(norm, [{ req: 'R1', antenna: 'A', start: 4 }]).ok);
});
test('[R1/A/8]: end=10=H ok, calibration crosses H', () => {
  const norm = E.normalize(D);
  assert.ok(E.feasibleStarts(norm, 'R1', 'A').includes(8));
  assert.ok(E.checkFeasible(norm, [{ req: 'R1', antenna: 'A', start: 8 }]).ok);
});
test('R1 only with durMin=11 → no candidates; M.solve returns proven empty optimum with 0 solver calls', async () => {
  const d = clone(D); d.requests = [clone(d.requests[0])]; d.requests[0].durMin = 11;
  assert.ok(E.validateData(d).ok);
  const norm = E.normalize(d);
  assert.deepStrictEqual(E.feasibleStarts(norm, 'R1', 'A'), []);
  assert.ok(E.checkFeasible(norm, []).ok);
  assert.deepStrictEqual(E.score(norm, []), { assigned: 0, totalWait: 0, objective: 0, feasible: true });
  const built = M.buildLP(norm);
  assert.strictEqual(built.vars.length, 0);
  let calls = 0;
  const glpk = Object.assign({}, M.K, { solve: async () => { calls++; throw new Error('must not be called'); } });
  const res = await M.solve(norm, { glpk, tmlim: 5 });
  assert.strictEqual(calls, 0);
  assert.strictEqual(res.status, M.K.GLP_OPT);
  assert.strictEqual(res.hasIncumbent, true);
  assert.deepStrictEqual(res.schedule, []);
  assert.deepStrictEqual([res.score.assigned, res.score.totalWait], [0, 0]);
});

// ===================== §8.2 =====================
section('§8.2 MILP transform oracle');
const OPT5 = [['R1', 'GS_1-S', 0], ['R2', 'GS_2-X', 5], ['R3', 'GS_2-S', 8], ['R6', 'GS_2-X', 22], ['R5', 'GS_1-S', 24]];
const GREEDY4 = [['R1', 'GS_1-S', 0], ['R2', 'GS_2-X', 5], ['R3', 'GS_2-S', 8], ['R5', 'GS_1-S', 20]];
function valuesFor(built, pick) {
  const values = {}; let hits = 0;
  built.vars.forEach((v) => { const on = pick.some(([r, a, t]) => v.req === r && v.antenna === a && v.start === t); values[v.name] = on ? 1 : 0; if (on) hits++; });
  assert.strictEqual(hits, pick.length, 'all picked candidates exist');
  return values;
}
const toSched = (pick) => pick.map(([req, antenna, start]) => ({ req, antenna, start }));
test('set five x=1 → exact schedule set, (5,11,1194/241); handwritten score identical', () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm);
  const dec = M.solutionToSchedule(built, valuesFor(built, OPT5));
  assert.strictEqual(dec.error, null);
  assert.deepStrictEqual(sortSched(dec.schedule), sortSched(toSched(OPT5)));
  assert.ok(E.checkFeasible(norm, dec.schedule).ok);
  const sc = E.score(norm, dec.schedule);
  assert.deepStrictEqual([sc.assigned, sc.totalWait, sc.feasible], [5, 11, true]);
  assert.ok(close(sc.objective, 1194 / 241));
  assert.deepStrictEqual(E.score(norm, toSched(OPT5)), sc);
});
test('set greedy four x=1 → exact set, (4,5,959/241); handwritten score identical', () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm);
  const dec = M.solutionToSchedule(built, valuesFor(built, GREEDY4));
  assert.deepStrictEqual(sortSched(dec.schedule), sortSched(toSched(GREEDY4)));
  const sc = E.score(norm, dec.schedule);
  assert.deepStrictEqual([sc.assigned, sc.totalWait, sc.feasible], [4, 5, true]);
  assert.ok(close(sc.objective, 959 / 241));
  assert.deepStrictEqual(E.score(norm, toSched(GREEDY4)), sc);
});
test('LP objective coefficients: 1 − ε(t − earliest), ε = 1/241; relax has 0..1 bounds and no binaries', () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm);
  assert.ok(close(built.eps, 1 / 241, 1e-15));
  const v = built.vars.find((x) => x.req === 'R2' && x.antenna === 'GS_2-X' && x.start === 5);
  assert.ok(close(v.coef, 1 - 3 / 241, 1e-12));
  assert.ok(built.stats.rows > 0 && built.lp.binaries.length === built.vars.length);
  const relax = M.buildLP(norm, { relax: true });
  assert.strictEqual(relax.lp.binaries, undefined);
  assert.strictEqual(relax.lp.generals, undefined);
  assert.strictEqual(relax.lp.bounds.length, relax.vars.length);
  relax.lp.bounds.forEach((b) => assert.deepStrictEqual([b.type, b.lb, b.ub], [M.K.GLP_DB, 0, 1]));
});
test('single-candidate model: 1 var, 0 rows, binary; relax keeps explicit bound', () => {
  const d = clone(D); d.requests = [clone(d.requests[0])]; d.requests[0].durMin = 10;
  const norm = E.normalize(d);
  const built = M.buildLP(norm);
  assert.deepStrictEqual([built.vars.length, built.lp.subjectTo.length, built.lp.binaries.length], [1, 0, 1]);
  const relax = M.buildLP(norm, { relax: true });
  assert.deepStrictEqual(relax.lp.bounds, [{ name: 'x0', type: M.K.GLP_DB, lb: 0, ub: 1 }]);
});

// ===================== §8.3 =====================
section('§8.3 revision gate (pure)');
test('stale run result after revision change is rejected', () => {
  const gate = M.createGate();
  const run1 = gate.begin(1);
  gate.setRevision(2);
  assert.strictEqual(gate.accepts({ revision: 1, runId: run1 }), false);
  assert.strictEqual(gate.state.activeRunId, null);
});
test('cancel invalidates runId; new run invalidates old run', () => {
  const gate = M.createGate();
  const run1 = gate.begin(1);
  assert.strictEqual(gate.accepts({ revision: 1, runId: run1 }), true);
  gate.cancel();
  assert.strictEqual(gate.accepts({ revision: 1, runId: run1 }), false);
  const run2 = gate.begin(1);
  assert.strictEqual(gate.accepts({ revision: 1, runId: run1 }), false);
  assert.strictEqual(gate.accepts({ revision: 1, runId: run2 }), true);
});

// ===================== B1 =====================
section('B1 validateData never throws; normalize never throws after ok');
test('requests={} → ok=false with path, no throw', () => {
  const d = clone(DEFAULT); d.requests = {};
  const v = E.validateData(d);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.path === 'requests'));
});
test('missing stations[0].antennas → ok=false (not accepted then crash)', () => {
  const d = clone(DEFAULT); delete d.stations[0].antennas;
  const v = E.validateData(d);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.path === 'stations[0].antennas'));
});
test('every collection set to {}, null, or bad elements → ok=false, no throw', () => {
  for (const key of ['satellites', 'stations', 'visibility', 'requests', 'bands']) {
    for (const bad of [{}, null, 'x', 5, [null], [{}], ['x']]) {
      const d = clone(DEFAULT); d[key] = bad;
      let v; assert.doesNotThrow(() => { v = E.validateData(d); });
      assert.strictEqual(v.ok, false, key + ' ' + JSON.stringify(bad));
    }
  }
  for (const bad of [{}, null, [null], [{}], ['x'], [{ id: 'q' }]]) {
    const d = clone(DEFAULT); d.stations[0].antennas = bad;
    let v; assert.doesNotThrow(() => { v = E.validateData(d); });
    assert.strictEqual(v.ok, false);
  }
  for (const bad of [null, 1, 'x', [], {}]) { let v; assert.doesNotThrow(() => { v = E.validateData(bad); }); assert.strictEqual(v.ok, false); }
  const d = clone(DEFAULT); d.meta = null;
  assert.strictEqual(E.validateData(d).ok, false);
});
test('string durMin with HTML → ok=false at requests[0].durMin', () => {
  const d = clone(DEFAULT); d.requests[0].durMin = '"><img src="data:," onerror="globalThis.__reviewProbe=1">';
  const v = E.validateData(d);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.path === 'requests[0].durMin'));
});

// ===================== B2 =====================
section('B2 safe ids and dedup keys');
test('request id "constructor" works end-to-end; unknown prototype ids → schema', () => {
  const d = clone(DEFAULT); d.requests[0].id = 'constructor';
  const norm = E.normalize(d);
  const built = M.buildLP(norm);
  assert.ok(built.vars.some((v) => v.req === 'constructor'));
  const fe = E.checkFeasible(norm, [{ req: 'constructor', antenna: 'GS_1-S', start: 0 }]);
  assert.ok(fe.ok);
  const n0 = E.normalize(DEFAULT);
  for (const id of ['toString', '__proto__', 'hasOwnProperty']) {
    const f = E.checkFeasible(n0, [{ req: id, antenna: 'GS_1-S', start: 0 }]);
    assert.deepStrictEqual(sortViol(f.violations), ['schema:' + id]);
    const sc = E.score(n0, [{ req: id, antenna: 'GS_1-S', start: 0 }]);
    assert.deepStrictEqual([sc.assigned, sc.totalWait, sc.objective, sc.feasible], [0, 0, 0, false]);
    assert.ok(Number.isFinite(sc.objective));
  }
  const f2 = E.checkFeasible(n0, [{ req: 'R1', antenna: 'constructor', start: 0 }]);
  assert.deepStrictEqual(sortViol(f2.violations), ['schema:R1']);
});
test('ids with commas: exactly 6 rule-1 pairs (dedup key must not collide)', () => {
  const ids = ['a,b', 'c', 'a', 'b,c'];
  const d = { meta: { horizonMin: 10, calibDefaultMin: 0 }, bands: ['S'],
    satellites: ids.map((id) => ({ id: 'sat-' + id })),
    stations: [{ id: 'G', antennas: [{ id: 'A', band: 'S' }] }],
    visibility: ids.map((id) => ({ sat: 'sat-' + id, station: 'G', start: 0, end: 10 })),
    requests: ids.map((id) => ({ id, sat: 'sat-' + id, band: 'S', durMin: 1, start: 0, end: 10 })) };
  const norm = E.normalize(d);
  const fe = E.checkFeasible(norm, ids.map((id) => ({ req: id, antenna: 'A', start: 0 })));
  assert.strictEqual(fe.violations.filter((v) => v.rule === 1).length, 6);
});
test('NUL inside ids must not merge (sat,station) visibility keys', () => {
  const d = { meta: { horizonMin: 6, calibDefaultMin: 0 }, bands: ['S'],
    satellites: [{ id: 'a\u0000b' }, { id: 'a' }],
    stations: [{ id: 'c', antennas: [{ id: 'u', band: 'S' }] }, { id: 'b\u0000c', antennas: [{ id: 'v', band: 'S' }] }],
    visibility: [{ sat: 'a\u0000b', station: 'c', start: 0, end: 1 }, { sat: 'a', station: 'b\u0000c', start: 5, end: 6 }],
    requests: [{ id: 'r', sat: 'a', band: 'S', durMin: 1, start: 0, end: 1 }] };
  const norm = E.normalize(d);
  assert.deepStrictEqual(E.feasibleStarts(norm, 'r', 'v'), []);
  const fe = E.checkFeasible(norm, [{ req: 'r', antenna: 'v', start: 0 }]);
  assert.deepStrictEqual(sortViol(fe.violations), ['window:r']);
});
test('score/checkFeasible on non-array schedule → controlled error, no throw', () => {
  const norm = E.normalize(DEFAULT);
  for (const bad of [{}, null, 'x', 5]) {
    let sc; assert.doesNotThrow(() => { sc = E.score(norm, bad); });
    assert.deepStrictEqual([sc.assigned, sc.feasible], [0, false]);
    assert.ok(sc.error);
    assert.strictEqual(E.checkFeasible(norm, bad).ok, false);
  }
  const fe = E.checkFeasible(norm, [null, 5, { req: 'R1' }]);
  assert.strictEqual(fe.ok, false);
});

// ===================== N1 =====================
section('N1 {"toString":null} values never throw');
const BAD = JSON.parse('{"toString":null}');
test('six data fields set to the object → ok=false at that path, no throw', () => {
  const cases = [['requests[0].band', (d) => { d.requests[0].band = BAD; }], ['meta.timeOrigin', (d) => { d.meta.timeOrigin = BAD; }],
    ['stations[0].antennas[0].band', (d) => { d.stations[0].antennas[0].band = BAD; }], ['visibility[0].sat', (d) => { d.visibility[0].sat = BAD; }],
    ['visibility[0].station', (d) => { d.visibility[0].station = BAD; }], ['requests[0].sat', (d) => { d.requests[0].sat = BAD; }]];
  for (const [path, mut] of cases) {
    const d = clone(DEFAULT); mut(d);
    let v; assert.doesNotThrow(() => { v = E.validateData(d); }, path);
    assert.strictEqual(v.ok, false, path);
    assert.ok(v.errors.some((e) => e.path === path), path + ' ' + JSON.stringify(v.errors));
    assert.throws(() => E.normalize(d));
  }
  const d = clone(DEFAULT); d.requests[0].band = [BAD];
  const v = E.validateData(d); assert.strictEqual(v.ok, false); assert.ok(v.errors.some((e) => e.path === 'requests[0].band'));
});
test('schedule req/antenna/start set to the object (and wrapped in array) → schema, finite score, no throw', () => {
  const norm = E.normalize(DEFAULT);
  for (const bad of [BAD, [BAD]]) {
    for (const s of [[{ req: bad, antenna: 'GS_1-S', start: 0 }], [{ req: 'R1', antenna: bad, start: 0 }], [{ req: 'R1', antenna: 'GS_1-S', start: bad }]]) {
      let fe, sc;
      assert.doesNotThrow(() => { fe = E.checkFeasible(norm, s); sc = E.score(norm, s); });
      assert.strictEqual(fe.ok, false);
      assert.strictEqual(fe.violations[0].rule, 'schema');
      assert.deepStrictEqual([sc.assigned, sc.feasible], [0, false]);
      assert.ok(Number.isFinite(sc.objective) && sc.error);
    }
  }
});

// ===================== B3 / B6 =====================
section('B3 incumbent validity, LP isolation; B6 deadline');
const fakeGlpk = (solveFn) => Object.assign({}, M.K, { solve: solveFn });
test('status NOFEAS/UNDEF → no incumbent, schedule null, score null', async () => {
  const norm = E.normalize(DEFAULT);
  for (const st of [M.K.GLP_NOFEAS, M.K.GLP_UNDEF, M.K.GLP_INFEAS, M.K.GLP_UNBND]) {
    const res = await M.solve(norm, { glpk: fakeGlpk(async () => ({ result: { status: st, vars: {}, z: 0 } })), tmlim: 5 });
    assert.strictEqual(res.hasIncumbent, false);
    assert.strictEqual(res.schedule, null);
    assert.strictEqual(res.score, null);
    assert.ok(res.error);
  }
});
test('OPT with empty vars but z=5 → inconsistent → invalid, no "已證明最佳"', async () => {
  const norm = E.normalize(DEFAULT);
  const res = await M.solve(norm, { glpk: fakeGlpk(async () => ({ result: { status: M.K.GLP_OPT, vars: {}, z: 5 } })), tmlim: 5 });
  assert.strictEqual(res.hasIncumbent, false);
  assert.strictEqual(res.schedule, null);
  assert.notStrictEqual(res.label.kind, 'opt');
  assert.ok(/不一致/.test(res.error));
});
test('FEAS all-zero incumbent with z=0 → legal empty schedule', async () => {
  const norm = E.normalize(DEFAULT);
  const res = await M.solve(norm, { glpk: fakeGlpk(async (lp) => ({ result: { status: lp.name === 'sgs_milp' ? M.K.GLP_FEAS : M.K.GLP_OPT, vars: {}, z: 0 } })), tmlim: 5 });
  assert.strictEqual(res.hasIncumbent, true);
  assert.deepStrictEqual(res.schedule, []);
  assert.strictEqual(res.label.kind, 'feas');
});
test('FEAS valid incumbent then LP rejects → incumbent kept, bound unavailable', async () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm);
  const vals = valuesFor(built, OPT5);
  const res = await M.solve(norm, { glpk: fakeGlpk(async (lp) => { if (lp.name === 'sgs_milp') return { result: { status: M.K.GLP_FEAS, vars: vals, z: 1194 / 241 } }; throw new Error('LP failed'); }), tmlim: 10 });
  assert.strictEqual(res.hasIncumbent, true);
  assert.deepStrictEqual([res.score.assigned, res.score.totalWait], [5, 11]);
  assert.ok(res.bound && res.bound.unavailable && /LP failed/.test(res.bound.warning));
});
test('LP FEAS does not provide U; LP OPT with U<L → explicit error; non-finite U → unavailable', async () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm);
  const vals = valuesFor(built, OPT5);
  const mk = (lpStatus, lpZ) => fakeGlpk(async (lp) => lp.name === 'sgs_milp' ? { result: { status: M.K.GLP_FEAS, vars: vals, z: 1194 / 241 } } : { result: { status: lpStatus, vars: {}, z: lpZ } });
  let res = await M.solve(norm, { glpk: mk(M.K.GLP_FEAS, 99), tmlim: 10 });
  assert.ok(res.bound.unavailable);
  res = await M.solve(norm, { glpk: mk(M.K.GLP_OPT, 1), tmlim: 10 });
  assert.ok(res.bound.error);
  res = await M.solve(norm, { glpk: mk(M.K.GLP_OPT, NaN), tmlim: 10 });
  assert.ok(res.bound.unavailable);
  res = await M.solve(norm, { glpk: mk(M.K.GLP_OPT, 5.2), tmlim: 10 });
  assert.ok(close(res.bound.U, 5.2) && close(res.bound.absoluteGap, 5.2 - 1194 / 241));
});
test('OPT with non-integer var → invalid', async () => {
  const norm = E.normalize(DEFAULT);
  const res = await M.solve(norm, { glpk: fakeGlpk(async () => ({ result: { status: M.K.GLP_OPT, vars: { x0: 0.5 }, z: 0.5 } })), tmlim: 5 });
  assert.strictEqual(res.hasIncumbent, false);
  assert.ok(/非 0\/1/.test(res.error));
});
test('B6: FEAS near limit is NOT labelled 超時; tmlim=1 → no LP', async () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm); const vals = valuesFor(built, OPT5);
  let clock = 0; const now = () => clock;
  const calls = [];
  const glpk = fakeGlpk(async (lp, opt) => { calls.push(opt.tmlim); clock += 960; return { result: { status: M.K.GLP_FEAS, vars: vals, z: 1194 / 241 } }; });
  const res = await M.solve(norm, { glpk, tmlim: 1, now });
  assert.strictEqual(res.label.text, '有可行解，未證明最佳');
  assert.ok(!/超時/.test(res.label.text));
  assert.deepStrictEqual(calls, [1]);
  assert.ok(res.bound.unavailable);
});
test('B6: MILP overran whole budget → LP skipped; remaining 2 s with quota 6 → LP tmlim ≤ 2', async () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm); const vals = valuesFor(built, OPT5);
  let clock = 0; const now = () => clock; let calls = [];
  const over = fakeGlpk(async (lp, opt) => { calls.push(opt.tmlim); clock += 31000; return { result: { status: M.K.GLP_FEAS, vars: vals, z: 1194 / 241 } }; });
  let res = await M.solve(norm, { glpk: over, tmlim: 30, now });
  assert.deepStrictEqual(calls, [24]);
  assert.ok(res.bound.unavailable);
  clock = 0; calls = [];
  const late = fakeGlpk(async (lp, opt) => { calls.push(opt.tmlim); if (lp.name === 'sgs_milp') clock += 28000; return { result: { status: lp.name === 'sgs_milp' ? M.K.GLP_FEAS : M.K.GLP_OPT, vars: lp.name === 'sgs_milp' ? vals : {}, z: lp.name === 'sgs_milp' ? 1194 / 241 : 5 } }; });
  res = await M.solve(norm, { glpk: late, tmlim: 30, now });
  assert.deepStrictEqual(calls, [24, 2]);
  assert.ok(res.bound && res.bound.U === 5);
});
test('OPT is never labelled 超時 even when slow', async () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm); const vals = valuesFor(built, OPT5);
  let clock = 0; const now = () => clock;
  const glpk = fakeGlpk(async () => { clock += 100000; return { result: { status: M.K.GLP_OPT, vars: vals, z: 1194 / 241 } }; });
  const res = await M.solve(norm, { glpk, tmlim: 1, now });
  assert.strictEqual(res.label.kind, 'opt');
  assert.ok(!res.note);
});

// ===================== runner =====================
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
