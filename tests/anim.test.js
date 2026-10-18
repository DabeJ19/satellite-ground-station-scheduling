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

section('phase fit — multi-basin tie-breaking (S3-r2 B3)');
test('seven rotation-equivalent minima → smallest normalized angle 0.1°, reproducible, RMS 720/7', () => {
  const st = [], vis = [];
  for (let i = 0; i < 7; i++) { st.push({ id: 'G' + i, angleDeg: (180.1 + 360 * i / 7) % 360, antennas: [{ id: 'a' + i, band: 'S' }] }); vis.push({ sat: 'A', station: 'G' + i, start: 0, end: 60 }); }
  const norm = E.normalize({ meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }], stations: st, visibility: vis, requests: [] });
  for (let k = 0; k < 3; k++) {
    const f = A.fitAll(norm).sats.get('A');
    assert.ok(Math.abs(A.circDiff(f.phi, 0.1)) <= 0.001, 'phi=' + f.phi);
    assert.ok(Math.abs(f.residual - 720 / 7) <= 0.001, 'rms=' + f.residual);
    assert.strictEqual(f.candidates, 7);
  }
});
test('single point whose optimum straddles the 359.5°/0° grid boundary is refined and normalized to [0,360)', () => {
  // H=120 → ω=3；站角 2.9°，時窗 [0,2) tMid=1 → 3·1+φ ≡ 2.9 → φ=359.9（盆地跨 359.5/0 交界）
  const d = { meta: { horizonMin: 120, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }], stations: [{ id: 'G', angleDeg: 2.9, antennas: [{ id: 'a', band: 'S' }] }], visibility: [{ sat: 'A', station: 'G', start: 0, end: 2 }], requests: [] };
  const f = A.fitAll(E.normalize(d)).sats.get('A');
  assert.ok(f.phi >= 0 && f.phi < 360);
  assert.ok(Math.abs(A.circDiff(f.phi, 359.9)) <= 0.001, 'phi=' + f.phi);
  assert.ok(f.residual <= 0.001);
  // 同一點改成 0.1° 目標（φ=357.1→ 正規化不跨界）仍一致
  d.stations[0].angleDeg = 0.1;
  const g = A.fitAll(E.normalize(d)).sats.get('A');
  assert.ok(Math.abs(A.circDiff(g.phi, 357.1)) <= 0.001, 'phi=' + g.phi);
});

section('drawFrame rendering decisions (S3-r2 B4/B5)');
const stubCtx = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
const theme = { bg: '#000', panel: '#111', text: '#fff', muted: '#888', line: '#333', accent: '#4f8ef7', calib: '#555' };
const draw = (norm, schedule, t) => A.drawFrame(stubCtx(), norm, schedule, t, A.fitAll(norm), { w: 600, h: 400, theme, satColor: () => '#f00', showResidual: true });
test('B4: ids containing NUL do not collide — only the station actually in a window glows', () => {
  // sat 'A\u0000B' @ station 'C'  vs  sat 'A' @ station 'B\u0000C'：舊鍵 sat+NUL+station 兩者相同
  const d = { meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A\u0000B' }, { id: 'A' }],
    stations: [{ id: 'C', angleDeg: 0, antennas: [{ id: 'c', band: 'S' }] }, { id: 'B\u0000C', angleDeg: 180, antennas: [{ id: 'bc', band: 'S' }] }],
    visibility: [{ sat: 'A\u0000B', station: 'C', start: 0, end: 10 }], requests: [] };
  const norm = E.normalize(d);
  const st = draw(norm, [], 5);
  assert.deepStrictEqual(st.visible.map((v) => [v.sat, v.station]), [['A\u0000B', 'C']]);
  assert.deepStrictEqual(st.render.litStations, ['C']);        // 'B\u0000C' 不得發光
  assert.deepStrictEqual(st.render.litSats, ['A\u0000B']);     // 'A' 不得發光
});
test('B5: full-horizon window [0,H) is drawn as a full 2π arc; partial window spans ω·(end−start)', () => {
  const norm = E.normalize({ meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }], stations: [{ id: 'G', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }],
    visibility: [{ sat: 'A', station: 'G', start: 0, end: 60 }], requests: [] });
  const st = draw(norm, [], 1);
  assert.strictEqual(st.render.arcs.length, 1);
  assert.ok(Math.abs(st.render.arcs[0].spanRad - 2 * Math.PI) < 1e-9, 'span=' + st.render.arcs[0].spanRad);
  const norm2 = E.normalize({ meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: [{ id: 'A' }], stations: [{ id: 'G', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }],
    visibility: [{ sat: 'A', station: 'G', start: 50, end: 60 }], requests: [] });   // 跨 360°：a0 在 300°−90°，跨度 60°
  const st2 = draw(norm2, [], 1);
  assert.ok(Math.abs(st2.render.arcs[0].spanRad - Math.PI / 3) < 1e-9, 'span=' + st2.render.arcs[0].spanRad);
  assert.ok(st2.render.arcs[0].a1 > st2.render.arcs[0].a0);
});

section('layout');
test('orbit radii strictly increasing per satellite; all inside canvas', () => {
  const norm = E.normalize(DEFAULT);
  const L = A.layout(norm, 600, 400);
  const rs = norm.satellites.map((s) => L.orbitR.get(s.id));
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i] > rs[i - 1]);
  assert.ok(rs[rs.length - 1] <= 200);
});
test('A2: many satellites still fit inside the canvas (orbits shrink Earth radius / gap)', () => {
  const sats = Array.from({ length: 14 }, (_, i) => ({ id: 'S' + i }));
  const norm = E.normalize({ meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: sats, stations: [{ id: 'G', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }], visibility: [], requests: [] });
  const L = A.layout(norm, 500, 420);
  const rs = sats.map((s) => L.orbitR.get(s.id));
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i] > rs[i - 1]);
  assert.ok(rs[rs.length - 1] + 24 <= Math.min(500, 420) / 2 + 1e-9, 'outer=' + rs[rs.length - 1]);
  assert.ok(L.Re >= 12);
});

test('S4 A2: fitSize keeps small instances at the given size; 60/100 satellites → enlarged square canvas where layout keeps gap ≥ 8 and fits', () => {
  const mk = (n) => E.normalize({ meta: { horizonMin: 60, calibDefaultMin: 0 }, bands: ['S'], satellites: Array.from({ length: n }, (_, i) => ({ id: 'S' + i })), stations: [{ id: 'G', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }], visibility: [], requests: [] });
  for (const n of [3, 14, 20]) { const f = A.fitSize(mk(n), 600, 420); assert.deepStrictEqual([f.w, f.h, f.scroll], [600, 420, false], 'n=' + n); }
  for (const n of [60, 100]) {
    const norm = mk(n); const f = A.fitSize(norm, 600, 420);
    assert.ok(f.scroll && f.w === f.h && f.w >= 600, JSON.stringify(f));
    const L = A.layout(norm, f.w, f.h);
    const rs = norm.satellites.map((s) => L.orbitR.get(s.id));
    for (let i = 1; i < rs.length; i++) assert.ok(rs[i] - rs[i - 1] >= 8 - 1e-9, 'gap n=' + n);
    assert.ok(rs[rs.length - 1] + 24 <= f.w / 2 + 1e-9, 'outer n=' + n + ' ' + rs[rs.length - 1] + ' vs ' + f.w / 2);
    assert.ok(L.Re >= 12);
  }
  // 窄畫布：以 min(w,h) 判斷；需要時兩邊都放大
  const f = A.fitSize(mk(60), 300, 420); assert.ok(f.scroll && f.w >= 300 && f.h >= 420 && f.w === f.h);
});

(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) { if (t.section) { console.log(t.section); continue; } try { await t.fn(); passed++; console.log('  ✔', t.name); } catch (e) { failed++; console.log('  ✘', t.name, '\n    ', e.message); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
})();
