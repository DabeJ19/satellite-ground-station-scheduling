// tests/browser.s4.js — SPEC §8 S4 單檔離線驗收：file:// + 斷網、smoke z=3 GLP_OPT、PPT 實例 (5,11)、GA worker 啟動／取消、
// 零外部請求、全部匯出可下載、工作區 JSON 匯入匯出、localStorage 失敗不阻止操作、主題切換、A1／A2 剩餘項。
// 產生 tests/out/acceptance-s4.json（docs/ACCEPTANCE_S4.md 的資料來源）。
// 需 playwright + Chromium：NODE_PATH=$(npm root -g) node tests/browser.s4.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html');
let passed = 0;
const rec = { date: new Date().toISOString(), url: URL, offline: true, steps: [] };
async function step(name, fn) { try { const info = await fn(); passed++; rec.steps.push({ name, ok: true, info: info || null }); console.log('  ✔', name); } catch (e) { rec.steps.push({ name, ok: false, error: e.message }); console.log('  ✘', name, '\n    ', e.message); throw e; } }
const WAITFOR = `window.__waitFor = (f, label, timeoutMs) => new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { let ok = false; try { ok = f(); } catch (e) { clearInterval(t); rej(e); return; } if (ok) { clearInterval(t); res(); } else if (Date.now() - t0 > (timeoutMs || 2000)) { clearInterval(t); rej(new Error('waitFor timeout: ' + (label || ''))); } }, 2); });`;

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  rec.browser = { name: process.env.PW_CHANNEL || 'chromium', version: browser.version() };
  try {
    // ---- 斷網 context：所有非 file:// / blob: 請求都算外部請求（也會因 offline 失敗）----
    const ctx = await browser.newContext({ offline: true, acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    const errs = [], ext = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('blob:') && !u.startsWith('data:')) ext.push(u); });
    await page.addInitScript(WAITFOR);
    await page.goto(URL);
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await page.reload();

    await step('offline + file://: page boots, GLPK worker ready (Blob URL, no fetch), zero external requests so far', async () => {
      await page.waitForFunction(() => document.getElementById('glpkStatus').textContent.includes('就緒'), null, { timeout: 20000 });
      const r = await page.evaluate(() => ({ status: document.getElementById('glpkStatus').textContent, online: navigator.onLine, proto: location.protocol }));
      assert.ok(/GLPK 5\.0/.test(r.status), r.status); assert.strictEqual(r.proto, 'file:'); assert.strictEqual(r.online, false);
      assert.deepStrictEqual(ext, []);
      return r;
    });
    await step('smoke LP: max x+y s.t. x+y ≤ 3 → z=3, GLP_OPT', async () => {
      const r = await page.evaluate(async () => {
        const g = await SGS.app._warmGLPK();
        const res = await g.solve({ name: 'smoke', objective: { direction: g.GLP_MAX, name: 'z', vars: [{ name: 'x', coef: 1 }, { name: 'y', coef: 1 }] },
          subjectTo: [{ name: 'c1', vars: [{ name: 'x', coef: 1 }, { name: 'y', coef: 1 }], bnds: { type: g.GLP_UP, ub: 3, lb: 0 } }] }, { msglev: g.GLP_MSG_OFF });
        return { z: res.result.z, status: res.result.status, opt: g.GLP_OPT, version: g.version };
      });
      assert.strictEqual(r.z, 3); assert.strictEqual(r.status, r.opt);
      return r;
    });
    await step('PPT instance MILP offline: (Z,W)=(5,11), 已證明最佳, feasible', async () => {
      const r = await page.evaluate(async () => { await SGS.app.solveMILP(); const s = SGS.app.state.slots.milp; return { Z: s.score.assigned, W: s.score.totalWait, label: s.meta.label.text, feasible: s.feasible }; });
      assert.deepStrictEqual([r.Z, r.W, r.feasible], [5, 11, true]); assert.ok(/最佳/.test(r.label));
      return r;
    });
    await step('GA worker starts (Blob worker, offline) and cancel settles the run without writing a slot', async () => {
      const r = await page.evaluate(async () => {
        SGS.app.writeGaParams({ runs: 1, seed: 1, popSize: 60, generations: 5000, stagnation: 5000 });
        const p = SGS.app.runGA(1);
        await window.__waitFor(() => SGS.app.state.ga.running && !!SGS.app.state.ga.worker, 'worker running', 5000);
        const running = SGS.app.state.ga.running, hadWorker = !!SGS.app.state.ga.worker;
        SGS.app.cancelGA();
        const res = await p;
        return { running, hadWorker, res, afterRunning: SGS.app.state.ga.running, gaSlot: SGS.app.state.slots.ga, cancelDisabled: document.getElementById('btnGaCancel').disabled };
      });
      assert.ok(r.running && r.hadWorker); assert.strictEqual(r.res, null); assert.strictEqual(r.afterRunning, false); assert.strictEqual(r.gaSlot, null); assert.strictEqual(r.cancelDisabled, true);
      const r2 = await page.evaluate(async () => { SGS.app.writeGaParams({ runs: 2, seed: 42, popSize: 30, generations: 60, stagnation: 30 }); const res = await SGS.app.runGA(2); return { n: res && res.length, Z: SGS.app.state.slots.ga && SGS.app.state.slots.ga.score.assigned }; });
      assert.strictEqual(r2.n, 2); assert.ok(r2.Z >= 4);
      return { cancel: r.res, rerun: r2 };
    });

    // ---- 全部匯出可下載（file:// + blob: URL + a[download]）----
    const dl = async (clickFn) => {
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), clickFn()]);
      const p = await d.path(); const buf = fs.readFileSync(p);
      return { name: d.suggestedFilename(), bytes: buf.length, text: buf.length < 2e6 ? buf.toString('utf8') : '' , head: buf.slice(0, 8) };
    };
    await step('exports download from the single file: data JSON, workspace JSON, schedule CSV/JSON, gantt PNG, anim PNG, GA curves/stats/schedule CSV', async () => {
      await page.evaluate(() => SGS.app.showTab('data'));
      const dataJson = await dl(() => page.click('#btnExport'));
      assert.strictEqual(dataJson.name, 'sgs-data.json'); assert.ok(JSON.parse(dataJson.text).requests.length === 6);
      const ws = await dl(() => page.click('#btnExportWs'));
      const wsObj = JSON.parse(ws.text);
      assert.strictEqual(ws.name, 'sgs-workspace.json'); assert.strictEqual(wsObj.format, 'sgs-workspace'); assert.ok(wsObj.slots.milp && wsObj.slots.ga && wsObj.settings && wsObj.data);
      await page.evaluate(() => { SGS.app.showTab('sched'); SGS.app.state.activeSlot = 'milp'; SGS.app.renderSched(); });
      const csv = await dl(() => page.click('#btnSchedCsv'));
      assert.strictEqual(csv.name, 'schedule-milp.csv'); assert.ok(/^req,satellite,antenna,station,band,start,end,startHHMM,endHHMM,wait\n/.test(csv.text)); assert.strictEqual(csv.text.trim().split('\n').length, 6);
      const sj = await dl(() => page.click('#btnSchedJson'));
      const sjObj = JSON.parse(sj.text);
      assert.strictEqual(sj.name, 'schedule-milp.json'); assert.deepStrictEqual([sjObj.format, sjObj.slot, sjObj.score.assigned, sjObj.score.totalWait, sjObj.feasible, sjObj.schedule.length], ['sgs-schedule', 'milp', 5, 11, true, 5]);
      const png1 = await dl(() => page.click('#btnGanttPng'));
      assert.strictEqual(png1.name, 'gantt.png'); assert.ok(png1.bytes > 1000 && png1.head.toString('hex').startsWith('89504e47'));
      const png2 = await dl(() => page.click('#btnAnimPng'));
      assert.strictEqual(png2.name, 'animation-frame.png'); assert.ok(png2.bytes > 1000 && png2.head.toString('hex').startsWith('89504e47'));
      await page.evaluate(() => SGS.app.showTab('ga'));
      const c1 = await dl(() => page.click('#btnGaCsvCurve')); assert.strictEqual(c1.name, 'ga-curves.csv'); assert.ok(/runId/.test(c1.text.split('\n')[0]) && c1.text.trim().split('\n').length > 2);
      const c2 = await dl(() => page.click('#btnGaCsvStats')); assert.strictEqual(c2.name, 'ga-stats.csv'); assert.ok(/summary/.test(c2.text));
      const c3 = await dl(() => page.click('#btnGaCsvSched')); assert.strictEqual(c3.name, 'ga-schedule.csv'); assert.ok(/^req,satellite/.test(c3.text));
      return { files: [dataJson, ws, csv, sj, png1, png2, c1, c2, c3].map((f) => ({ name: f.name, bytes: f.bytes })) };
    });
    await step('workspace JSON round trip: import restores data/settings/slots/activeSlot; plain data JSON still imports; invalid workspace rejected without state change', async () => {
      const r = await page.evaluate(() => {
        const ws = SGS.app.exportWorkspace();
        const before = JSON.stringify({ rev: SGS.app.state.revision, slots: Object.fromEntries(Object.entries(SGS.app.state.slots).map(([k, v]) => [k, v && [v.revision, v.schedule]])), ga: SGS.app.state.settings.ga, tmlim: SGS.app.state.settings.tmlim, active: SGS.app.state.activeSlot });
        // 改資料、清解槽後匯入工作區 → 應回到匯出時的狀態
        const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.requests.pop(); SGS.app.loadData(d);
        SGS.app.state.slots.ga = null; SGS.app.state.activeSlot = 'manual';
        const mid = SGS.app.state.data.requests.length;
        const res = SGS.app.importJSONText(JSON.stringify(ws));
        const after = JSON.stringify({ rev: SGS.app.state.revision, slots: Object.fromEntries(Object.entries(SGS.app.state.slots).map(([k, v]) => [k, v && [v.revision, v.schedule]])), ga: SGS.app.state.settings.ga, tmlim: SGS.app.state.settings.tmlim, active: SGS.app.state.activeSlot });
        // 純資料 JSON 仍走 loadData
        const plain = SGS.app.importJSONText(JSON.stringify(d));
        const plainOk = plain.ok && SGS.app.state.data.requests.length === 5;
        // 無效工作區：data 壞 → 拒絕、狀態不變
        const snap = JSON.stringify([SGS.app.state.revision, SGS.app.state.data]);
        const bad = SGS.app.importJSONText(JSON.stringify({ format: 'sgs-workspace', data: { meta: {} }, slots: {} }));
        const unchanged = snap === JSON.stringify([SGS.app.state.revision, SGS.app.state.data]);
        const errShown = !document.getElementById('dataErrors').classList.contains('hidden');
        return { ok: res.ok, same: before === after, mid, plainOk, badOk: bad.ok, unchanged, errShown };
      });
      assert.ok(r.ok); assert.ok(r.same, 'workspace restored'); assert.strictEqual(r.mid, 5); assert.ok(r.plainOk); assert.strictEqual(r.badOk, false); assert.ok(r.unchanged && r.errShown);
      return r;
    });
    await step('theme toggle: switches data-theme and persists across reload (storage available)', async () => {
      const r = await page.evaluate(() => { const el = document.documentElement; const t0 = el.dataset.theme || 'dark'; document.getElementById('themeToggle').click(); return { t0, t1: el.dataset.theme }; });
      assert.notStrictEqual(r.t0, r.t1);
      await page.reload(); await page.waitForFunction(() => window.SGS && SGS.app && SGS.app.state.norm);
      const t2 = await page.evaluate(() => document.documentElement.dataset.theme);
      assert.strictEqual(t2, r.t1);
      await page.evaluate(() => { document.getElementById('themeToggle').click(); });
      return r;
    });
    await step('A1: band/color edits redraw the window editor; invalid H shows hint, disables dragging, and restores after fix', async () => {
      await page.evaluate(() => { SGS.app.loadData(window.SGS_DEFAULT_DATA); SGS.app.showTab('data'); });
      const r = await page.evaluate(() => {
        const orig = SGS.app._drawWinEditor; let n = 0; SGS.app._drawWinEditor = () => { n++; orig(); };
        try {
          const fire = (sel, v, ev) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); };
          fire('select[data-path="requests[0].band"]', 'X', 'change'); const n1 = n;
          fire('input[data-path="satellites[0].color"]', '#123456'); const n2 = n;
          fire('input[data-meta="horizonMin"]', ''); const n3 = n;
          const W = SGS.app.state.lastWinEditor;
          const hint = document.getElementById('winEditorHint');
          return { n1, n2, n3, validH: W.validH, H: W.H, hintShown: !hint.classList.contains('hidden'), hintText: hint.textContent, disabled: document.getElementById('winEditor').classList.contains('disabled') };
        } finally { SGS.app._drawWinEditor = orig; }
      });
      assert.deepStrictEqual([r.n1, r.n2, r.n3, r.validH, r.H, r.hintShown, r.disabled], [1, 2, 3, false, 40, true, true], JSON.stringify(r));
      // 無效 H 下嘗試拖 visibility[0] 的 end → draft 不變
      await page.evaluate(() => document.getElementById('winEditor').scrollIntoView({ block: 'center' }));
      const pts = await page.evaluate(() => { const W = SGS.app.state.lastWinEditor; const r = document.getElementById('winEditor').getBoundingClientRect(); const x = (t) => W.left + (t / W.H) * W.plotW; return { from: { x: r.left + x(12), y: r.top + W.top + W.rowH / 2 }, to: { x: r.left + x(15), y: r.top + W.top + W.rowH / 2 } }; });
      await page.mouse.move(pts.from.x, pts.from.y); await page.mouse.down(); await page.mouse.move(pts.to.x, pts.to.y, { steps: 5 }); await page.mouse.up();
      const end1 = await page.evaluate(() => SGS.app.getDraft().visibility[0].end);
      assert.strictEqual(end1, 12, 'drag ignored while H invalid');
      // 修正 H=80 → 提示消失、可拖
      await page.evaluate(() => { const el = document.querySelector('input[data-meta="horizonMin"]'); el.value = '80'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      const ok = await page.evaluate(() => ({ validH: SGS.app.state.lastWinEditor.validH, H: SGS.app.state.lastWinEditor.H, hintHidden: document.getElementById('winEditorHint').classList.contains('hidden'), disabled: document.getElementById('winEditor').classList.contains('disabled') }));
      assert.deepStrictEqual([ok.validH, ok.H, ok.hintHidden, ok.disabled], [true, 80, true, false]);
      const pts2 = await page.evaluate(() => { const W = SGS.app.state.lastWinEditor; const r = document.getElementById('winEditor').getBoundingClientRect(); const x = (t) => W.left + (t / W.H) * W.plotW; return { from: { x: r.left + x(12), y: r.top + W.top + W.rowH / 2 }, to: { x: r.left + x(16), y: r.top + W.top + W.rowH / 2 } }; });
      await page.mouse.move(pts2.from.x, pts2.from.y); await page.mouse.down(); await page.mouse.move(pts2.to.x, pts2.to.y, { steps: 5 }); await page.mouse.up();
      const end2 = await page.evaluate(() => SGS.app.getDraft().visibility[0].end);
      assert.strictEqual(end2, 16);
      await page.click('#btnRevert');
      return r;
    });
    await step('A2: 60 satellites → animation canvas enlarges inside a scrollable wrapper; all orbits fit; 3 satellites unchanged', async () => {
      const r = await page.evaluate(() => {
        const base = SGS.app.state.lastAnim && SGS.app.state.lastAnim.size;
        const d = { meta: { horizonMin: 60, calibDefaultMin: 0, name: 'many' }, bands: ['S'], satellites: Array.from({ length: 60 }, (_, i) => ({ id: 'S' + i })), stations: [{ id: 'G', angleDeg: 0, antennas: [{ id: 'a', band: 'S' }] }], visibility: [], requests: [] };
        SGS.app.loadData(d); SGS.app.showTab('sched'); SGS.app.state.slots.manual = null; SGS.app.state.activeSlot = 'manual'; SGS.app.renderSched();   // 檢視目前資料（無解槽）
        const size = SGS.app.state.lastAnim.size; const wrap = document.querySelector('.animWrap'); const canvas = document.getElementById('anim');
        const L = SGS.anim.layout(SGS.app.state.norm, size.w, size.h); const rs = Array.from(L.orbitR.values());
        const out = { base, size, scrollClass: wrap.classList.contains('scroll'), scrollable: wrap.scrollWidth > wrap.clientWidth || wrap.scrollHeight > wrap.clientHeight, canvasW: canvas.getBoundingClientRect().width, wrapW: wrap.clientWidth, outer: Math.max(...rs), minGap: Math.min(...rs.slice(1).map((v, i) => v - rs[i])) };
        SGS.app.loadData(window.SGS_DEFAULT_DATA); SGS.app.state.activeSlot = 'milp'; SGS.app.renderSched();
        out.after = SGS.app.state.lastAnim.size;
        return out;
      });
      assert.ok(r.size.scroll && r.scrollClass && r.scrollable, JSON.stringify(r));
      assert.ok(r.canvasW > r.wrapW, 'canvas wider than wrapper → scroll: ' + JSON.stringify(r));
      assert.ok(r.outer + 24 <= r.size.w / 2 + 1e-6 && r.minGap >= 8 - 1e-9);
      assert.strictEqual(r.after.scroll, false); assert.strictEqual(r.after.h, 420);
      return r;
    });
    await step('no page errors, zero external requests (offline context)', async () => { assert.deepStrictEqual(errs, []); assert.deepStrictEqual(ext, []); return { errors: 0, external: 0 }; });
    await page.screenshot({ path: path.join(OUT, 's4-offline.png') });
    await ctx.close();

    // ---- localStorage 失敗 context：setItem/getItem 一律拋錯 ----
    const ctx2 = await browser.newContext({ offline: true, acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
    const page2 = await ctx2.newPage();
    const errs2 = [], ext2 = [];
    page2.on('pageerror', (e) => errs2.push('pageerror: ' + e.message));
    page2.on('console', (m) => { if (m.type() === 'error') errs2.push('console: ' + m.text()); });
    page2.on('request', (r) => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('blob:') && !u.startsWith('data:')) ext2.push(u); });
    await page2.addInitScript(WAITFOR + `
      (() => { const boom = (m) => { const e = new Error(m); e.name = 'QuotaExceededError'; throw e; };
        Storage.prototype.setItem = function () { boom('QuotaExceededError (simulated)'); };
        Storage.prototype.getItem = function () { boom('SecurityError (simulated)'); };
        Storage.prototype.removeItem = function () { boom('SecurityError (simulated)'); };
        Storage.prototype.clear = function () { boom('SecurityError (simulated)'); }; })();`);
    await page2.goto(URL);
    await step('storage failure: page boots with defaults, warning banner shown, operations (edit/commit/manual drag/MILP/theme/export) still work, saveLS returns false', async () => {
      await page2.waitForFunction(() => window.SGS && SGS.app && SGS.app.state.norm);
      const r = await page2.evaluate(async () => {
        const banner = document.getElementById('storageWarn');
        const bannerShown = !banner.classList.contains('hidden');
        const saved = SGS.app.saveLS();
        const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.requests[0].durMin = 7; const load = SGS.app.loadData(d).ok;
        SGS.app.showTab('sched'); SGS.app.setManualTask('R1', 'GS_1-S', 0);
        const manual = SGS.app.state.slots.manual && SGS.app.state.slots.manual.schedule.length;
        const t0 = document.documentElement.dataset.theme || 'dark'; document.getElementById('themeToggle').click(); const t1 = document.documentElement.dataset.theme;
        const ws = SGS.app.exportWorkspace();
        return { bannerShown, saved, load, manual, themeChanged: t0 !== t1, rev: SGS.app.state.revision, wsOk: ws.format === 'sgs-workspace' && ws.data.requests[0].durMin === 7, bannerText: banner.textContent };
      });
      assert.ok(r.bannerShown, 'banner'); assert.strictEqual(r.saved, false); assert.ok(r.load); assert.strictEqual(r.manual, 1); assert.ok(r.themeChanged); assert.strictEqual(r.rev, 2); assert.ok(r.wsOk);
      assert.ok(/匯出 JSON/.test(r.bannerText), 'banner prompts JSON backup');
      await page2.waitForFunction(() => document.getElementById('glpkStatus').textContent.includes('就緒'), null, { timeout: 20000 });
      const m = await page2.evaluate(async () => { await SGS.app.solveMILP(); const s = SGS.app.state.slots.milp; return { Z: s.score.assigned, W: s.score.totalWait }; });
      assert.deepStrictEqual(m, { Z: 5, W: 14 });   // R1.durMin=7 → (5,14)
      const [d] = await Promise.all([page2.waitForEvent('download', { timeout: 10000 }), page2.evaluate(() => { SGS.app.showTab('data'); document.getElementById('btnExportWs').click(); })]);
      assert.strictEqual(d.suggestedFilename(), 'sgs-workspace.json');
      assert.deepStrictEqual(errs2, []); assert.deepStrictEqual(ext2, []);
      await page2.screenshot({ path: path.join(OUT, 's4-storage-failure.png') });
      return r;
    });
    await ctx2.close();

    rec.passed = passed; rec.errors = errs.concat(errs2); rec.external = ext.concat(ext2);
    fs.writeFileSync(path.join(OUT, 'acceptance-s4.json'), JSON.stringify(rec, null, 2));
    console.log(`\n${passed} browser steps passed · ${rec.browser.name} ${rec.browser.version}`);
  } catch (e) { process.exitCode = 1; rec.failed = e && e.message; fs.writeFileSync(path.join(OUT, 'acceptance-s4.json'), JSON.stringify(rec, null, 2)); console.log('\nFAILED:', e && e.message); }
  finally { await browser.close(); }
})();
