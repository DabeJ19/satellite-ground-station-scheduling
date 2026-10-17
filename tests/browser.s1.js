// tests/browser.s1.js — SPEC §8 S1 (a)(f)(g) 瀏覽器驗收 + S1 審查 B1/B4/B5 的 UI 路徑測試（硬斷言，非零退出）。
// 需 playwright + Chromium：NODE_PATH=$(npm root -g) node tests/browser.s1.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html');
let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✘', name, '\n    ', e.message); throw e; }
}

(async () => {
  // 無法下載 Chromium 的環境：PW_CHANNEL=msedge 或 chrome 可用本機已安裝的瀏覽器
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errs = [], ext = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('blob:')) ext.push(u); });
    await page.goto(URL);
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await page.reload();
    await page.waitForFunction(() => document.getElementById('glpkStatus').textContent.includes('就緒'), null, { timeout: 20000 });

    await step('(a) default.json MILP: GLP_OPT, feasible, Z=5, W=11', async () => {
      const r = await page.evaluate(async () => { const x = await SGS.app.solveMILP(); return { status: x.status, feasible: x.feasible, Z: x.score.assigned, W: x.score.totalWait, kind: x.label.kind, sched: x.schedule.map((s) => `${s.req}/${s.antenna}/${s.start}`).sort() }; });
      assert.strictEqual(r.status, 5); assert.strictEqual(r.kind, 'opt'); assert.strictEqual(r.feasible, true);
      assert.deepStrictEqual([r.Z, r.W], [5, 11]);
      assert.strictEqual(r.sched.length, 5);
    });
    await step('(g) data tables 3/2/3/6/6', async () => {
      const c = await page.evaluate(() => ['tblSat', 'tblSt', 'tblAnt', 'tblVis', 'tblReq'].map((id) => document.querySelectorAll(`#${id} tbody tr`).length));
      assert.deepStrictEqual(c, [3, 2, 3, 6, 6]);
    });
    await step('(g) Gantt: 3 rows, 5 blocks with handwritten times and calibration', async () => {
      await page.evaluate(() => SGS.app.showTab('sched'));
      const g = await page.evaluate(() => SGS.app.state.lastGantt);
      assert.deepStrictEqual(g.rows, ['GS_1-S', 'GS_2-S', 'GS_2-X']);
      const by = Object.fromEntries(g.blocks.map((b) => [b.req, b]));
      assert.deepStrictEqual(Object.keys(by).sort(), ['R1', 'R2', 'R3', 'R5', 'R6']);
      assert.deepStrictEqual([by.R1.start, by.R1.end, by.R1.calibEnd, by.R1.antenna], [0, 5, 15, 'GS_1-S']);
      assert.deepStrictEqual([by.R2.start, by.R2.end, by.R2.calibEnd], [5, 7, 17]);
      assert.deepStrictEqual([by.R3.start, by.R6.start, by.R5.start], [8, 22, 24]);
      assert.deepStrictEqual([by.R5.end, by.R5.calibEnd], [29, 39]);
      await page.screenshot({ path: path.join(OUT, 's1-gantt.png') });
    });
    await step('(g) R1.durMin 5→7: revision +1 only, old slot flagged stale, re-solve OPT (5,14)', async () => {
      await page.evaluate(() => SGS.app.showTab('data'));
      const rev0 = await page.evaluate(() => SGS.app.state.revision);
      await page.fill('input[data-path="requests[0].durMin"]', '7');
      await page.click('#btnApply');
      const rev1 = await page.evaluate(() => SGS.app.state.revision);
      assert.strictEqual(rev1, rev0 + 1);
      const cards = await page.evaluate(() => document.getElementById('scoreCards').innerText);
      assert.ok(cards.includes('舊版本資料'), 'stale marker shown: ' + cards);
      const r = await page.evaluate(async () => { const x = await SGS.app.solveMILP(); return { kind: x.label.kind, Z: x.score.assigned, W: x.score.totalWait }; });
      assert.deepStrictEqual([r.kind, r.Z, r.W], ['opt', 5, 14]);
      const cards2 = await page.evaluate(() => document.getElementById('scoreCards').innerText);
      assert.ok(!cards2.includes('舊版本資料') && cards2.includes('14'), cards2);
    });
    await step('(g) negative durMin rejected: revision & committed data unchanged, error located', async () => {
      const before = await page.evaluate(() => ({ rev: SGS.app.state.revision, d: JSON.stringify(SGS.app.state.data) }));
      await page.fill('input[data-path="requests[0].durMin"]', '-3');
      await page.click('#btnApply');
      const after = await page.evaluate(() => ({ rev: SGS.app.state.revision, d: JSON.stringify(SGS.app.state.data), err: document.getElementById('dataErrors').innerText, invalid: !!document.querySelector('input[data-path="requests[0].durMin"].invalid') }));
      assert.strictEqual(after.rev, before.rev); assert.strictEqual(after.d, before.d);
      assert.ok(after.err.includes('requests[0].durMin')); assert.ok(after.invalid);
      await page.screenshot({ path: path.join(OUT, 's1-data.png') });
    });
    await step('A1: meta errors (H=0, calibDefaultMin=-1) highlight fields', async () => {
      await page.click('#btnRevert');
      await page.fill('input[data-path="meta.horizonMin"]', '0');
      await page.fill('input[data-path="meta.calibDefaultMin"]', '-1');
      await page.click('#btnApply');
      const r = await page.evaluate(() => ({ h: !!document.querySelector('input[data-path="meta.horizonMin"].invalid'), c: !!document.querySelector('input[data-path="meta.calibDefaultMin"].invalid'), err: document.getElementById('dataErrors').innerText }));
      assert.ok(r.h && r.c, r.err);
      await page.click('#btnRevert');
      const cleared = await page.evaluate(() => document.querySelectorAll('#tab-data .invalid').length);
      assert.strictEqual(cleared, 0);
    });

    // ---- B1: import must validate before rendering; no HTML injection; state untouched
    await step('B1: invalid import (HTML in durMin) → no img in DOM, revision/data/slots unchanged', async () => {
      const before = await page.evaluate(() => ({ rev: SGS.app.state.revision, d: JSON.stringify(SGS.app.state.data), slot: JSON.stringify(SGS.app.state.slots.milp.schedule) }));
      const r = await page.evaluate(() => {
        const bad = JSON.parse(JSON.stringify(window.SGS_DEFAULT_DATA));
        bad.requests[0].durMin = '"><img src="data:," onerror="globalThis.__reviewProbe=1">';
        const v = SGS.app.loadData(bad);
        return { ok: v.ok, imgs: document.querySelectorAll('#tab-data img').length, probe: !!globalThis.__reviewProbe, html: document.querySelector('#tblReq tbody').innerHTML.includes('onerror='), err: document.getElementById('dataErrors').innerText };
      });
      assert.strictEqual(r.ok, false); assert.strictEqual(r.imgs, 0); assert.strictEqual(r.probe, false); assert.strictEqual(r.html, false);
      assert.ok(r.err.includes('requests[0].durMin'));
      const after = await page.evaluate(() => ({ rev: SGS.app.state.revision, d: JSON.stringify(SGS.app.state.data), slot: JSON.stringify(SGS.app.state.slots.milp.schedule) }));
      assert.deepStrictEqual(after, before);
      const r2 = await page.evaluate(() => { const v = SGS.app.importJSONText('{"requests": {}'); return { ok: v.ok, err: document.getElementById('dataErrors').innerText }; });
      assert.strictEqual(r2.ok, false); assert.ok(r2.err.includes('JSON 解析失敗'));
      const r3 = await page.evaluate(() => SGS.app.importJSONText(JSON.stringify(Object.assign(JSON.parse(JSON.stringify(window.SGS_DEFAULT_DATA)), { requests: {} }))).ok);
      assert.strictEqual(r3, false);
      const ok = await page.evaluate(() => SGS.app.loadData(window.SGS_DEFAULT_DATA).ok);
      assert.strictEqual(ok, true);
    });

    // ---- B5: band rename / station rename / antenna move
    await step('B5: bands S→Ku rebuilds selects (Ku selectable, old S flagged); fix refs then apply once', async () => {
      await page.click('#btnLoadDefault');
      const sel = 'input[data-path="bands"]';
      await page.fill(sel, 'Ku, X');
      await page.dispatchEvent(sel, 'change');
      const opts = await page.evaluate(() => Array.from(document.querySelectorAll('#tblAnt select[data-path$=".band"]')[0].options).map((o) => o.textContent));
      assert.ok(opts.includes('Ku'), 'Ku option present: ' + opts);
      assert.ok(opts.some((o) => o.includes('S（無效）')), 'invalid S kept: ' + opts);
      const rev0 = await page.evaluate(() => SGS.app.state.revision);
      await page.click('#btnApply');
      assert.strictEqual(await page.evaluate(() => SGS.app.state.revision), rev0, 'apply must fail while refs invalid');
      await page.evaluate(() => {
        document.querySelectorAll('#tblAnt select[data-path$=".band"], #tblReq select[data-path$=".band"]').forEach((s) => { if (s.value === 'S') { s.value = 'Ku'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
      });
      await page.click('#btnApply');
      const st = await page.evaluate(() => ({ rev: SGS.app.state.revision, bands: SGS.app.state.data.bands, ants: SGS.app.state.norm.antennas.map((a) => a.band), reqs: SGS.app.state.data.requests.map((r) => r.band), ui: Array.from(document.querySelectorAll('#tblAnt select[data-path$=".band"]')).map((s) => s.value) }));
      assert.strictEqual(st.rev, rev0 + 1);
      assert.deepStrictEqual(st.bands, ['Ku', 'X']);
      assert.deepStrictEqual(st.ants, ['Ku', 'Ku', 'X']);
      assert.deepStrictEqual(st.reqs, ['Ku', 'X', 'Ku', 'X', 'Ku', 'X']);
      assert.deepStrictEqual(st.ui, st.ants);
    });
    await step('B5: station GS_1→G_NEW, fix visibility refs, apply ok', async () => {
      await page.click('#btnLoadDefault');
      await page.fill('input[data-path="stations[0].id"]', 'G_NEW');
      await page.dispatchEvent('input[data-path="stations[0].id"]', 'change');
      const rev0 = await page.evaluate(() => SGS.app.state.revision);
      await page.click('#btnApply');
      assert.strictEqual(await page.evaluate(() => SGS.app.state.revision), rev0);
      await page.evaluate(() => { document.querySelectorAll('#tblVis select[data-path$=".station"]').forEach((s) => { if (s.value === 'GS_1') { s.value = 'G_NEW'; s.dispatchEvent(new Event('change', { bubbles: true })); } }); });
      await page.click('#btnApply');
      const st = await page.evaluate(() => ({ rev: SGS.app.state.revision, stations: SGS.app.state.norm.antennas.map((a) => a.station) }));
      assert.strictEqual(st.rev, rev0 + 1);
      assert.deepStrictEqual(st.stations, ['G_NEW', 'GS_2', 'GS_2']);
    });
    await step('B5: move GS_1-S to GS_2 → nested 0/3, candidates for R1 on it = [3,4,5]', async () => {
      await page.click('#btnLoadDefault');
      await page.selectOption('#tblAnt select[data-move-antenna="0:0"]', 'GS_2');
      await page.click('#btnApply');
      const st = await page.evaluate(() => ({ counts: SGS.app.state.data.stations.map((s) => s.antennas.length), station: SGS.app.state.norm.antById.get('GS_1-S').station, starts: SGS.engine.feasibleStarts(SGS.app.state.norm, 'R1', 'GS_1-S') }));
      assert.deepStrictEqual(st.counts, [0, 3]); assert.strictEqual(st.station, 'GS_2'); assert.deepStrictEqual(st.starts, [3, 4, 5]);
    });

    // ---- B4 / §8.3: controlled GLPK factory on the real UI path
    await step('B4/§8.3: init race — cancel A, solve B, A init completes late → A never solves, cancel B terminates B only', async () => {
      await page.click('#btnLoadDefault');
      const r = await page.evaluate(async () => {
        const log = { started: [], terminated: [] };
        const pend = {};
        let n = 0;
        SGS.app._setGLPKFactory(() => new Promise((resolve) => { const id = String.fromCharCode(65 + n++); pend[id] = resolve; }));
        const mkInst = (id) => Object.assign({}, SGS.milp.K, { version: id, solve: async () => { log.started.push(id); return new Promise(() => {}); }, terminate: () => log.terminated.push(id) });
        const pA = SGS.app.solveMILP();            // run A, init A pending
        await new Promise((r) => setTimeout(r, 0));
        SGS.app.cancelSolve();                     // cancel A
        const pB = SGS.app.solveMILP();            // run B, init B pending
        await new Promise((r) => setTimeout(r, 0));
        pend.B(mkInst('B')); await new Promise((r) => setTimeout(r, 10));
        pend.A(mkInst('A')); await new Promise((r) => setTimeout(r, 10));
        const afterA = { started: log.started.slice(), terminated: log.terminated.slice(), inst: SGS.app._glpkDebug().inst && SGS.app._glpkDebug().inst.version };
        SGS.app.cancelSolve();                     // cancel B
        await new Promise((r) => setTimeout(r, 10));
        const resA = await pA;                     // A：初始化失效 → null；B 的 solve 永不回（stub），不等待
        return { afterA, terminated: log.terminated, started: log.started, resA, btn: document.getElementById('btnSolve').disabled };
      });
      assert.deepStrictEqual(r.afterA.started, ['B']);
      assert.deepStrictEqual(r.afterA.terminated, ['A']);
      assert.strictEqual(r.afterA.inst, 'B');
      assert.deepStrictEqual(r.terminated, ['A', 'B']);
      assert.deepStrictEqual(r.started, ['B']);
      assert.strictEqual(r.resA, null);
      assert.strictEqual(r.btn, false);
    });
    await step('§8.3: old run result after commit (rev+1) is dropped; new run accepted', async () => {
      const r = await page.evaluate(async () => {
        const deferred = [];
        const inst = Object.assign({}, SGS.milp.K, { version: 'T', solve: () => new Promise((resolve, reject) => deferred.push({ resolve, reject })), terminate: () => {} });
        SGS.app._setGLPKFactory(() => Promise.resolve(inst));
        const built = SGS.milp.buildLP(SGS.app.state.norm);
        const vals = {}; built.vars.forEach((v) => { vals[v.name] = (v.req === 'R1' && v.antenna === 'GS_1-S' && v.start === 0) ? 1 : 0; });
        const z = 1;
        const waitFor = (f) => new Promise((res) => { const t = setInterval(() => { if (f()) { clearInterval(t); res(); } }, 1); });
        const p1 = SGS.app.solveMILP();                               // run1 @ rev r
        await waitFor(() => deferred.length === 1);
        const before = JSON.stringify(SGS.app.state.slots.milp && SGS.app.state.slots.milp.schedule);
        const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.visibility = d.visibility.filter((v) => v.sat !== 'SAT_A');
        SGS.app.loadData(d);                                          // rev r+1 → run1 失效（worker 已 terminate）
        const rev = SGS.app.state.revision;
        deferred[0].resolve({ result: { status: SGS.milp.K.GLP_OPT, vars: vals, z } }); // 舊 run 的 R1/GS_1-S/0 可行結果遲到
        const r1 = await p1;                                          // 必須被丟棄 → null
        const afterOld = { slot: JSON.stringify(SGS.app.state.slots.milp && SGS.app.state.slots.milp.schedule), status: document.getElementById('milpStatus').innerText };
        // 新 run2 @ rev r+1
        const p2 = SGS.app.solveMILP();
        await waitFor(() => deferred.length === 2);
        const ok2 = deferred.length;
        deferred[deferred.length - 1].resolve({ result: { status: SGS.milp.K.GLP_OPT, vars: {}, z: 0 } }); // OPT 空解（不觸發 LP）
        const res2 = await p2;
        const slot = SGS.app.state.slots.milp;
        return { r1, before, afterOld, rev, slotRev: slot && slot.revision, slotSched: JSON.stringify(slot && slot.schedule), res2kind: res2 && res2.label.kind, status: document.getElementById('milpStatus').innerText, ok2 };
      });
      assert.strictEqual(r.r1, null);
      assert.strictEqual(r.afterOld.slot, r.before, 'old result must not land');
      assert.ok(!r.afterOld.status.includes('Z = 1'), 'old status must not render');
      assert.strictEqual(r.slotRev, r.rev);
      assert.strictEqual(r.slotSched, '[]');
      assert.strictEqual(r.res2kind, 'opt');
      assert.ok(r.status.includes('r' + r.rev));
    });
    await step('N1: import with band={"toString":null} → ok=false at requests[0].band, state untouched, default loads after', async () => {
      await page.click('#btnLoadDefault');
      const before = await page.evaluate(() => ({ rev: SGS.app.state.revision, d: JSON.stringify(SGS.app.state.data), draft: JSON.stringify(SGS.app.getDraft()), slot: JSON.stringify(SGS.app.state.slots.milp && SGS.app.state.slots.milp.schedule) }));
      const r = await page.evaluate(() => {
        const d = JSON.parse(JSON.stringify(window.SGS_DEFAULT_DATA)); d.requests[0].band = JSON.parse('{"toString":null}');
        let v; try { v = SGS.app.importJSONText(JSON.stringify(d)); } catch (e) { return { threw: String(e) }; }
        return { ok: v.ok, err: document.getElementById('dataErrors').innerText };
      });
      assert.strictEqual(r.threw, undefined, r.threw);
      assert.strictEqual(r.ok, false); assert.ok(r.err.includes('requests[0].band'), r.err);
      const after = await page.evaluate(() => ({ rev: SGS.app.state.revision, d: JSON.stringify(SGS.app.state.data), draft: JSON.stringify(SGS.app.getDraft()), slot: JSON.stringify(SGS.app.state.slots.milp && SGS.app.state.slots.milp.schedule) }));
      assert.deepStrictEqual(after, before);
      assert.strictEqual(await page.evaluate(() => SGS.app.loadData(window.SGS_DEFAULT_DATA).ok), true);
    });
    await step('A3: run A solver rejects after commit + run B started → A null; B state/ownership intact; B result lands', async () => {
      const r = await page.evaluate(async () => {
        const waitFor = (f) => new Promise((res) => { const t = setInterval(() => { if (f()) { clearInterval(t); res(); } }, 1); });
        const pend = []; const term = [];
        const inst = Object.assign({}, SGS.milp.K, { version: 'A3', solve: () => new Promise((resolve, reject) => pend.push({ resolve, reject })), terminate: () => term.push('t') });
        SGS.app._setGLPKFactory(() => Promise.resolve(inst));
        const pA = SGS.app.solveMILP();
        await waitFor(() => pend.length === 1);                       // A 已進入求解
        const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.name = 'rev+1';
        SGS.app.loadData(d);                                           // 新版本 → A 失效，實例被 terminate
        const pB = SGS.app.solveMILP();
        await waitFor(() => pend.length === 2);                       // B 已進入求解
        const snap = () => ({ status: document.getElementById('milpStatus').innerText, btn: document.getElementById('btnSolve').disabled, inst: SGS.app._glpkDebug().inst && SGS.app._glpkDebug().inst.version, slot: JSON.stringify(SGS.app.state.slots.milp && SGS.app.state.slots.milp.schedule) });
        const beforeReject = snap();
        pend[0].reject(new Error('old run failed'));                   // A 的 solver 失敗（遲到）
        const resA = await pA;
        const afterReject = snap();
        pend[1].resolve({ result: { status: SGS.milp.K.GLP_OPT, vars: {}, z: 0 } });
        const resB = await pB;
        return { resA, same: JSON.stringify(beforeReject) === JSON.stringify(afterReject), afterReject, resBkind: resB && resB.label.kind, slotRev: SGS.app.state.slots.milp.revision, rev: SGS.app.state.revision, term: term.length };
      });
      assert.strictEqual(r.resA, null);
      assert.strictEqual(r.same, true, JSON.stringify(r.afterReject));
      assert.strictEqual(r.afterReject.btn, true, 'B still running');
      assert.strictEqual(r.resBkind, 'opt');
      assert.strictEqual(r.slotRev, r.rev);
    });
    await step('A3: boot-style idle init pending + first solve → factory called once, solve runs on that instance', async () => {
      const r = await page.evaluate(async () => {
        const waitFor = (f) => new Promise((res) => { const t = setInterval(() => { if (f()) { clearInterval(t); res(); } }, 1); });
        let factoryCalls = 0; let release = null; const started = [];
        SGS.app._setGLPKFactory(() => { factoryCalls++; return new Promise((res) => { release = res; }); });
        SGS.app._warmGLPK();                                           // boot 的閒置初始化（pending）
        await waitFor(() => release !== null);
        const inst = Object.assign({}, SGS.milp.K, { version: 'boot', solve: async () => { started.push('boot'); return { result: { status: SGS.milp.K.GLP_OPT, vars: {}, z: 0 } }; }, terminate: () => {} });
        const p = SGS.app.solveMILP();                                 // 首次 solve 共用同一個初始化
        await new Promise((r) => setTimeout(r, 0));
        const callsBeforeRelease = factoryCalls;
        release(inst);
        const res = await p;
        return { callsBeforeRelease, factoryCalls, started, kind: res && res.label.kind };
      });
      assert.strictEqual(r.callsBeforeRelease, 1); assert.strictEqual(r.factoryCalls, 1);
      assert.deepStrictEqual(r.started, ['boot']); assert.strictEqual(r.kind, 'opt');
    });
    await step('A3: commit while a run is initializing → late instance terminated, solve never called, run returns null', async () => {
      const r = await page.evaluate(async () => {
        const waitFor = (f) => new Promise((res) => { const t = setInterval(() => { if (f()) { clearInterval(t); res(); } }, 1); });
        let release = null; const started = []; const term = [];
        SGS.app._setGLPKFactory(() => new Promise((res) => { release = res; }));
        const p = SGS.app.solveMILP();                                 // run：初始化 pending
        await waitFor(() => release !== null);
        const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.name = 'during-init';
        SGS.app.loadData(d);                                           // 初始化中 commit → run 失效
        const late = Object.assign({}, SGS.milp.K, { version: 'late', solve: () => { started.push('late'); return new Promise(() => {}); }, terminate: () => term.push('late') });
        release(late);                                                 // 遲到的初始化完成
        await waitFor(() => term.includes('late'));
        const res = await p;
        return { started, term, res, btn: document.getElementById('btnSolve').disabled };
      });
      assert.deepStrictEqual(r.started, []);
      assert.deepStrictEqual(r.term, ['late']);
      assert.strictEqual(r.res, null);
      assert.strictEqual(r.btn, false);
      await page.evaluate(() => SGS.app._setGLPKFactory(() => window.GLPK()));
    });
    await step('B3 on UI: NOFEAS result does not overwrite existing MILP slot', async () => {
      const r = await page.evaluate(async () => {
        await SGS.app.loadData(window.SGS_DEFAULT_DATA);
        SGS.app._setGLPKFactory(() => window.GLPK());
        const good = await SGS.app.solveMILP();
        const before = JSON.stringify(SGS.app.state.slots.milp.schedule);
        SGS.app._setGLPKFactory(() => Promise.resolve(Object.assign({}, SGS.milp.K, { version: 'N', solve: async () => ({ result: { status: SGS.milp.K.GLP_NOFEAS, vars: {}, z: 0 } }), terminate: () => {} })));
        const bad = await SGS.app.solveMILP();
        return { goodZ: good.score.assigned, badInc: bad.hasIncumbent, same: JSON.stringify(SGS.app.state.slots.milp.schedule) === before, status: document.getElementById('milpStatus').innerText };
      });
      assert.strictEqual(r.goodZ, 5); assert.strictEqual(r.badInc, false); assert.strictEqual(r.same, true);
      assert.ok(r.status.includes('解槽未更新'));
      await page.evaluate(() => SGS.app._setGLPKFactory(() => window.GLPK()));
    });
    await step('A2: localStorage failure shows backup banner, operations continue', async () => {
      const r = await page.evaluate(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); };
        const ok = SGS.app.loadData(window.SGS_DEFAULT_DATA).ok;
        const shown = !document.getElementById('storageWarn').classList.contains('hidden');
        Storage.prototype.setItem = orig;
        SGS.app.loadData(window.SGS_DEFAULT_DATA);
        const cleared = document.getElementById('storageWarn').classList.contains('hidden');
        return { ok, shown, cleared };
      });
      assert.deepStrictEqual(r, { ok: true, shown: true, cleared: true });
    });
    await step('no page errors, no external requests', async () => {
      assert.deepStrictEqual(errs, []);
      assert.deepStrictEqual(ext, []);
    });
    await page.evaluate(() => SGS.app.showTab('model'));
    await page.screenshot({ path: path.join(OUT, 's1-model.png') });
    console.log(`\n${passed} browser steps passed`);
  } catch (e) {
    process.exitCode = 1;
    console.log('\nFAILED:', e && e.message);
  } finally {
    await browser.close();
  }
})();
