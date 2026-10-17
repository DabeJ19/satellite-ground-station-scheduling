// tests/engine.test.js — SPEC §1.3 fixtures、§8.1 邊界 D、§8.2 轉換 oracle、§8.3 閘門。
// 執行：node tests/engine.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../src/engine.js');
require('../src/milp.js');
const { engine: E, milp: M } = globalThis.SGS;

const DEFAULT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'default.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const sortSched = (s) => s.map((x) => `${x.req}/${x.antenna}/${x.start}`).sort();
const sortViol = (v) => v.map((x) => `${x.rule}:${x.reqs.slice().sort().join(',')}`).sort();

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✘', name, '\n    ', e.message); process.exitCode = 1; }
}

console.log('§1.3 PPT fixtures');
test('(b) greedy fixture Z=4, W=5', () => {
  const norm = E.normalize(DEFAULT);
  const s = E.greedyDecode(norm, ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  assert.deepStrictEqual(sortSched(s), sortSched([
    { req: 'R1', antenna: 'GS_1-S', start: 0 }, { req: 'R2', antenna: 'GS_2-X', start: 5 },
    { req: 'R3', antenna: 'GS_2-S', start: 8 }, { req: 'R5', antenna: 'GS_1-S', start: 20 }]));
  const sc = E.score(norm, s);
  assert.deepStrictEqual([sc.assigned, sc.totalWait, sc.feasible], [4, 5, true]);
  assert.ok(Math.abs(sc.objective - 959 / 241) < 1e-9);
});
test('(c) infeasible fixture: exactly 4 violations, no rule 1 for R2/R4', () => {
  const norm = E.normalize(DEFAULT);
  const s = [{ req: 'R1', antenna: 'GS_1-S', start: 0 }, { req: 'R2', antenna: 'GS_2-X', start: 3 },
    { req: 'R3', antenna: 'GS_2-S', start: 8 }, { req: 'R4', antenna: 'GS_2-X', start: 8 },
    { req: 'R5', antenna: 'GS_1-S', start: 20 }, { req: 'R6', antenna: 'GS_2-X', start: 22 }];
  const fe = E.checkFeasible(norm, s);
  assert.strictEqual(fe.ok, false);
  assert.deepStrictEqual(sortViol(fe.violations), ['2:R2,R4', '3:R1,R2', '3:R3,R4', '3:R5,R6']);
});
test('optimal (5,11) schedule is feasible and scores 1194/241', () => {
  const norm = E.normalize(DEFAULT);
  const s = [{ req: 'R1', antenna: 'GS_1-S', start: 0 }, { req: 'R2', antenna: 'GS_2-X', start: 5 },
    { req: 'R3', antenna: 'GS_2-S', start: 8 }, { req: 'R6', antenna: 'GS_2-X', start: 22 }, { req: 'R5', antenna: 'GS_1-S', start: 24 }];
  const sc = E.score(norm, s);
  assert.deepStrictEqual([sc.assigned, sc.totalWait, sc.feasible], [5, 11, true]);
  assert.ok(Math.abs(sc.objective - 1194 / 241) < 1e-9);
});

console.log('§8.1 boundary fixture D');
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
  assert.strictEqual(norm.antById.A.calib, 2);
  const fe = E.checkFeasible(norm, S12);
  assert.strictEqual(fe.ok, false);
  assert.deepStrictEqual(sortViol(fe.violations), ['2:R1,R2']);
});
test('D with calibMin field deleted → calib 2', () => {
  const d = clone(D); delete d.stations[0].antennas[0].calibMin;
  assert.ok(E.validateData(d).ok);
  assert.strictEqual(E.normalize(d).antById.A.calib, 2);
});
test('calibMin=0 → effective 0; schedule ok, no violations', () => {
  const d = clone(D); d.stations[0].antennas[0].calibMin = 0;
  const norm = E.normalize(d);
  assert.strictEqual(norm.antById.A.calib, 0);
  const fe = E.checkFeasible(norm, S12);
  assert.deepStrictEqual([fe.ok, fe.violations], [true, []]);
});
test('calibMin=-1 → invalid, error path points to field', () => {
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
  assert.deepStrictEqual(E.visSegments(norm, 'SAT_A', 'G'), [[0, 10]]);
  assert.deepStrictEqual(E.feasibleStarts(norm, 'R1', 'A'), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(E.checkFeasible(norm, [{ req: 'R1', antenna: 'A', start: 4 }]).ok);
});
test('[R1/A/8]: end=10=H ok, calibration crosses H', () => {
  const norm = E.normalize(D);
  assert.ok(E.feasibleStarts(norm, 'R1', 'A').includes(8));
  assert.ok(E.checkFeasible(norm, [{ req: 'R1', antenna: 'A', start: 8 }]).ok);
});
test('R1 only with durMin=11 → no candidates; empty schedule optimal', () => {
  const d = clone(D); d.requests = [clone(d.requests[0])]; d.requests[0].durMin = 11;
  assert.ok(E.validateData(d).ok);
  const norm = E.normalize(d);
  assert.deepStrictEqual(E.feasibleStarts(norm, 'R1', 'A'), []);
  assert.ok(E.checkFeasible(norm, []).ok);
  assert.deepStrictEqual(E.score(norm, []), { assigned: 0, totalWait: 0, objective: 0, feasible: true });
  const built = M.buildLP(norm);
  assert.strictEqual(built.vars.length, 0);
});

console.log('§8.2 MILP transform oracle');
test('set five x=1 → schedule set, (5,11,1194/241)', () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm);
  const pick = [['R1', 'GS_1-S', 0], ['R2', 'GS_2-X', 5], ['R3', 'GS_2-S', 8], ['R6', 'GS_2-X', 22], ['R5', 'GS_1-S', 24]];
  const values = {};
  built.vars.forEach((v) => { values[v.name] = pick.some(([r, a, t]) => v.req === r && v.antenna === a && v.start === t) ? 1 : 0; });
  assert.strictEqual(Object.values(values).filter((x) => x === 1).length, 5, 'all five candidates exist');
  const s = M.solutionToSchedule(built, values);
  assert.deepStrictEqual(sortSched(s), sortSched(pick.map(([req, antenna, start]) => ({ req, antenna, start }))));
  assert.ok(E.checkFeasible(norm, s).ok);
  const sc = E.score(norm, s);
  assert.deepStrictEqual([sc.assigned, sc.totalWait], [5, 11]);
  assert.ok(Math.abs(sc.objective - 1194 / 241) < 1e-9);
  const sc2 = E.score(norm, pick.map(([req, antenna, start]) => ({ req, antenna, start })));
  assert.deepStrictEqual(sc2, sc);
});
test('set greedy four x=1 → (4,5,959/241)', () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm);
  const pick = [['R1', 'GS_1-S', 0], ['R2', 'GS_2-X', 5], ['R3', 'GS_2-S', 8], ['R5', 'GS_1-S', 20]];
  const values = {};
  built.vars.forEach((v) => { values[v.name] = pick.some(([r, a, t]) => v.req === r && v.antenna === a && v.start === t) ? 1 : 0; });
  const s = M.solutionToSchedule(built, values);
  const sc = E.score(norm, s);
  assert.deepStrictEqual([sc.assigned, sc.totalWait, sc.feasible], [4, 5, true]);
  assert.ok(Math.abs(sc.objective - 959 / 241) < 1e-9);
});
test('LP objective coefficients: 1 − ε(t − earliest), ε = 1/241', () => {
  const norm = E.normalize(DEFAULT);
  const built = M.buildLP(norm);
  assert.ok(Math.abs(built.eps - 1 / 241) < 1e-15);
  const v = built.vars.find((x) => x.req === 'R2' && x.antenna === 'GS_2-X' && x.start === 5);
  assert.ok(Math.abs(v.coef - (1 - 3 / 241)) < 1e-12);
  assert.ok(built.stats.rows > 0 && built.lp.binaries.length === built.vars.length);
});

console.log('§8.3 revision gate');
test('stale run result after revision change is rejected', () => {
  const gate = M.createGate();
  const run1 = gate.begin(1);
  gate.setRevision(2);           // 資料變動 → 舊 run 失效
  assert.strictEqual(gate.accepts({ revision: 1, runId: run1, schedule: [{ req: 'R1', antenna: 'A', start: 0 }] }), false);
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
  assert.strictEqual(gate.accepts({ revision: 1, runId: run2, error: 'x' }), true); // 同 run 的錯誤訊息仍屬當前 run
});
test('gate with controlled stub solver: old message order independent', () => {
  // 模擬：run1(rev1) 回覆延後到 rev2 提交之後
  const gate = M.createGate();
  const slot = { schedule: null, revision: null };
  const deliver = (msg) => { if (gate.accepts(msg)) { slot.schedule = msg.schedule; slot.revision = msg.revision; } };
  const run1 = gate.begin(1);
  gate.setRevision(2);
  deliver({ revision: 1, runId: run1, schedule: [{ req: 'R1', antenna: 'A', start: 0 }] });
  assert.deepStrictEqual(slot, { schedule: null, revision: null });
  const run2 = gate.begin(2);
  deliver({ revision: 2, runId: run2, schedule: [] });
  assert.deepStrictEqual(slot, { schedule: [], revision: 2 });
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
