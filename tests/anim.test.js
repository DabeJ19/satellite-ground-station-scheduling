// tests/anim.test.js — SPEC §6 動畫純函式：相位擬合（ω=360/H、圓周角距離、殘差、多解取最小）、接觸狀態、幾何。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../src/engine.js');
require('../src/anim.js');
const { engine: E, anim: A } = globalThis.SGS;
const DEFAULT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'default.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const tests = []; const test = (n, f) => tests.push({ name: n, fn: f }); const section = (n) => tests.push({ section: n });

section('circular distance & station angles');
test('circDiff uses circular distance: 359 vs 1 → −2 / 2, not 358', () => {
  assert.strictEqual(A.circDiff(359, 1), -2); assert.strictEqual(A.circDiff(1, 359), 2); assert.strictEqual(A.circDiff(180, 0), 180);
});
test('stationAngles: explicit angleDeg normalized; missing → equally spaced', () => {
  const d = clone(DEFAULT); d.stations[0].angleDeg = -90; delete d.stations[1].angleDeg;
  const norm = E.normalize(d);
  const ang = A.stationAngles(norm);
  assert.strictEqual(ang.get('GS_1'), 270); assert.strictEqual(ang.get('GS_2'), 180);
});

section('phase fit');
test('ω = 360/H; consistent windows fit with residual 0; φ reproducible', () => {
  // one satellite, one station at 0°, window [10,20) → tMid 15; H=60 → ω=6; need 6·15+φ ≡ 0 → φ=270
  const d = { meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }], stations: [{ id: 'G', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }],
    visibility: [{ sat: 'A', station: 'G', start: 10, end: 20 }], requests: [] };
  const norm = E.normalize(d);
  const fit = A.fitAll(norm);
  assert.strictEqual(fit.omega, 6);
  const f = fit.sats.get('A');
  assert.ok(Math.abs(f.phi - 270) < 1e-6, 'phi=' + f.phi); assert.ok(f.residual < 1e-6);
  assert.deepStrictEqual(A.fitAll(norm).sats.get('A'), f);
  assert.ok(Math.abs(A.satAngle(fit, 'A', 15) - 0) < 1e-6);
});
test('two stations consistent with orbit → residual 0; inconsistent → positive residual, reported', () => {
  // H=60, ω=6: windows over G0 (0°) at tMid 15 and over G1 (90°) at tMid 30 → 6·15+φ=0 → φ=270; 6·30+270=450≡90 ✓
  const d = { meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }],
    stations: [{ id: 'G0', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }, { id: 'G1', angleDeg: 90, antennas: [{ id: 'b', band: 'S' }] }],
    visibility: [{ sat: 'A', station: 'G0', start: 10, end: 20 }, { sat: 'A', station: 'G1', start: 25, end: 35 }], requests: [] };
  const f = A.fitAll(E.normalize(d)).sats.get('A');
  assert.ok(f.residual < 1e-6 && Math.abs(f.phi - 270) < 1e-6);
  d.visibility[1] = { sat: 'A', station: 'G1', start: 10, end: 20 };   // same time over two stations 90° apart → residual 45°
  const g = A.fitAll(E.normalize(d)).sats.get('A');
  assert.ok(Math.abs(g.residual - 45) < 0.6, 'residual=' + g.residual);
});
test('no windows → φ by index spacing; degenerate multi-solution picks the smallest angle', () => {
  const d = { meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], stations: [{ id: 'G', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }], visibility: [], requests: [] };
  const fit = A.fitAll(E.normalize(d));
  assert.deepStrictEqual([fit.sats.get('A').phi, fit.sats.get('B').phi, fit.sats.get('C').phi], [0, 120, 240]);
  assert.strictEqual(fit.sats.get('A').residual, null);
  // two opposite stations, windows at the same tMid → cost symmetric: φ and φ+180 tie → smallest chosen
  const d2 = { meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }], stations: [{ id: 'G0', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }, { id: 'G1', angleDeg: 180, antennas: [{ id: 'b', band: 'S' }] }],
    visibility: [{ sat: 'A', station: 'G0', start: 0, end: 60 }, { sat: 'A', station: 'G1', start: 0, end: 60 }], requests: [] };
  const f2 = A.fitAll(E.normalize(d2)).sats.get('A');   // tMid 30, ω·30=180：cost 最小在 φ ∈ {90, 270}（兩站各差 90°）→ 取最小角度 90
  assert.ok(Math.abs(f2.phi - 90) < 1e-6, 'phi=' + f2.phi);
  assert.ok(Math.abs(f2.residual - 90) < 1e-6);
});
test('PPT instance: residuals finite and displayed-ready; φ in [0,360)', () => {
  const fit = A.fitAll(E.normalize(DEFAULT));
  fit.sats.forEach((f) => { assert.ok(f.phi >= 0 && f.phi < 360); assert.ok(Number.isFinite(f.residual)); });
});

section('contact state (data-driven)');
test('(5,11) schedule: t=22 → SAT_C visible at GS_2, R6 active on GS_2-X, GS_1-S calibrating until 15? no; t=12 → GS_1-S calibrating; t=24 → R5 active', () => {
  const norm = E.normalize(DEFAULT);
  const s = [{ req: 'R1', antenna: 'GS_1-S', start: 0 }, { req: 'R2', antenna: 'GS_2-X', start: 5 }, { req: 'R3', antenna: 'GS_2-S', start: 8 }, { req: 'R6', antenna: 'GS_2-X', start: 22 }, { req: 'R5', antenna: 'GS_1-S', start: 24 }];
  let st = A.contactState(norm, s, 22);
  assert.ok(st.visible.some((v) => v.sat === 'SAT_C' && v.station === 'GS_2'));
  assert.deepStrictEqual(st.active.map((a) => a.req), ['R6']);
  st = A.contactState(norm, s, 12);
  assert.deepStrictEqual(st.calibrating.map((c) => c.antenna).sort(), ['GS_1-S', 'GS_2-X']);   // R1 end 5→15, R2 end 7→17
  assert.deepStrictEqual(st.active.map((a) => a.req), ['R3']);
  st = A.contactState(norm, s, 24.5);
  assert.deepStrictEqual(st.active.map((a) => a.req), ['R5']);
  assert.ok(st.calibrating.some((c) => c.antenna === 'GS_2-X'));   // R6 end 24 → calib to 34
  st = A.contactState(norm, s, 39.5);
  assert.deepStrictEqual([st.active.length, st.calibrating.length], [0, 0]);   // R5 end 29 + 10 = 39
});
test('contactState ignores malformed items', () => {
  const norm = E.normalize(DEFAULT);
  const st = A.contactState(norm, [{ req: 'nope', antenna: 'GS_1-S', start: 0 }, { req: 'R1', antenna: 'GS_1-S', start: 'x' }], 1);
  assert.deepStrictEqual([st.active.length, st.calibrating.length], [0, 0]);
});

section('layout');
test('orbit radii strictly increasing per satellite; all inside canvas', () => {
  const norm = E.normalize(DEFAULT);
  const L = A.layout(norm, 600, 400);
  const rs = norm.satellites.map((s) => L.orbitR.get(s.id));
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i] > rs[i - 1]);
  assert.ok(rs[rs.length - 1] <= 200);
});

(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) { if (t.section) { console.log(t.section); continue; } try { await t.fn(); passed++; console.log('  ✔', t.name); } catch (e) { failed++; console.log('  ✘', t.name, '\n    ', e.message); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
})();
