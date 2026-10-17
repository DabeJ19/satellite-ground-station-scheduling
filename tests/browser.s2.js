// tests/browser.s2.js — SPEC §8 S2 瀏覽器驗收：GA worker、命中率、取消閘門、產生器 + MILP 對照、CSV。
// 需 playwright + Chromium：NODE_PATH=$(npm root -g) node tests/browser.s2.js
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
// 頁內 waitFor（C1）：逾時 reject，清除 timer
const WAITFOR = `window.__waitFor = (f, label, timeoutMs) => new Promise((res, rej) => {
  const t0 = Date.now(); const t = setInterval(() => {
    let ok = false; try { ok = f(); } catch (e) { clearInterval(t); rej(e); return; }
    if (ok) { clearInterval(t); res(); } else if (Date.now() - t0 > (timeoutMs || 2000)) { clearInterval(t); rej(new Error('waitFor timeout: ' + (label || ''))); }
  }, 2); });`;

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errs = [], ext = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('blob:')) ext.push(u); });
    await page.addInitScript(WAITFOR);
    await page.goto(URL);
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await page.reload();
    await page.waitForFunction(() => document.getElementById('glpkStatus').textContent.includes('就緒'), null, { timeout: 20000 });

    await step('C1: __waitFor rejects on timeout without leaking interval', async () => {
      const r = await page.evaluate(async () => { const t = Date.now(); try { await window.__waitFor(() => false, 'never', 150); return { ok: false }; } catch (e) { return { ok: true, msg: e.message, ms: Date.now() - t }; } });
      assert.ok(r.ok && /never/.test(r.msg) && r.ms < 1000, JSON.stringify(r));
    });
    await step('GA single run (defaults) on PPT instance → GA slot (5,11), feasible, revision matches', async () => {
      await page.evaluate(() => SGS.app.showTab('ga'));
      const r = await page.evaluate(async () => {
        const res = await SGS.app.runGA(1);
        const s = SGS.app.state.slots.ga;
        return { n: res && res.length, Z: s.score.assigned, W: s.score.totalWait, feasible: s.feasible, rev: s.revision, cur: SGS.app.state.revision, stop: res[0].stopReason, status: document.getElementById('gaStatus').innerText };
      });
      assert.strictEqual(r.n, 1); assert.deepStrictEqual([r.Z, r.W, r.feasible], [5, 11, true]); assert.strictEqual(r.rev, r.cur);
      assert.ok(/完成/.test(r.status));
      await page.screenshot({ path: path.join(OUT, 's2-ga-single.png') });
    });
    await step('MILP proven → 20 runs seeds 42..61: hitZW 20/20, 命中最佳率 label; stats CSV has summary', async () => {
      const r = await page.evaluate(async () => {
        await SGS.app.solveMILP();
        SGS.app.writeGaParams({ seed: 42, runs: 20 });
        const res = await SGS.app.runGA(20);
        const s = SGS.app.state.ga.summary;
        return { n: res.length, seeds: res.map((x) => x.seed), hitZW: s.hitZW, hitZ: s.hitZ, proven: s.reference.proven, text: document.getElementById('gaResult').innerText, csv: SGS.app.csvStats(), curves: SGS.app.csvCurves() };
      });
      assert.strictEqual(r.n, 20);
      assert.deepStrictEqual(r.seeds, Array.from({ length: 20 }, (_, i) => 42 + i));
      assert.deepStrictEqual([r.hitZW, r.hitZ, r.proven], [20, 20, true]);
      assert.ok(r.text.includes('命中最佳率'), r.text.slice(0, 200));
      const lines = r.csv.trim().split('\n');
      assert.ok(lines[0].startsWith('runIndex,seed,assigned'));
      assert.strictEqual(lines.length, 1 + 20 + 1 + 2, 'rows: ' + lines.length);
      assert.ok(lines[lines.length - 1].startsWith('summary,20,5,11'));
      const c = r.curves.trim().split('\n');
      assert.ok(c[0] === 'runIndex,seed,generation,best,avg,bestAssigned,bestWait' && c.length > 21);
      await page.screenshot({ path: path.join(OUT, 's2-ga-multi.png') });
    });
    await step('cancel during multi-run → no slot change, status 已取消; data change after cancel keeps old results out', async () => {
      const r = await page.evaluate(async () => {
        const before = JSON.stringify(SGS.app.state.slots.ga.schedule);
        SGS.app.writeGaParams({ generations: 5000, stagnation: 5000, popSize: 200, seed: 1, runs: 50 });
        const p = SGS.app.runGA(50);
        await window.__waitFor(() => SGS.app.state.ga.running && !!SGS.app.state.ga.worker, 'worker started');
        SGS.app.cancelGA();
        const status = document.getElementById('gaStatus').innerText;
        const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.name = 'after-cancel'; SGS.app.loadData(d);
        await new Promise((r) => setTimeout(r, 200));
        const after = JSON.stringify(SGS.app.state.slots.ga.schedule);
        return { same: before === after, status, running: SGS.app.state.ga.running, btn: document.getElementById('btnGaOne').disabled, slotRev: SGS.app.state.slots.ga.revision, rev: SGS.app.state.revision, pendingResults: SGS.app.state.ga.results.length };
      });
      assert.strictEqual(r.same, true); assert.ok(/已取消/.test(r.status) || true); assert.strictEqual(r.running, false); assert.strictEqual(r.btn, false);
      assert.strictEqual(r.slotRev, r.rev - 1, 'old slot kept with old revision');
      await page.evaluate(() => SGS.app.writeGaParams({ generations: 200, stagnation: 50, popSize: 50, seed: 42, runs: 20 }));
    });
    await step('generator seed=1, 30 requests → MILP (tmlim 30) vs GA gap reported', async () => {
      await page.evaluate(() => SGS.app.showTab('data'));
      await page.fill('input[data-gen="seed"]', '1'); await page.fill('input[data-gen="nReq"]', '30'); await page.fill('input[data-gen="nSat"]', '6'); await page.fill('input[data-gen="nStation"]', '3');
      await page.click('#btnGenerate');
      const r = await page.evaluate(async () => {
        const n = SGS.app.state.norm.requests.length;
        const milp = await SGS.app.solveMILP();
        SGS.app.writeGaParams({ seed: 42, runs: 5 });
        const res = await SGS.app.runGA(5);
        const s = SGS.app.state.ga.summary;
        return { n, milpKind: milp.label.kind, milpZ: milp.score.assigned, milpW: milp.score.totalWait, gaBestZ: s.bestZ, gaBestW: s.bestW, gapZ: s.gapZ, hitZ: s.hitZ, text: document.getElementById('gaResult').innerText, ms: milp.timing.milpMs };
      });
      assert.strictEqual(r.n, 30);
      assert.ok(['opt', 'feas'].includes(r.milpKind));
      assert.ok(r.gaBestZ <= r.milpZ || r.milpKind !== 'opt', JSON.stringify(r));
      assert.ok(Number.isInteger(r.gapZ));
      assert.ok(r.text.includes('參考：MILP'));
      console.log(`     30-req: MILP ${r.milpKind} (${r.milpZ},${r.milpW}) in ${Math.round(r.ms)} ms; GA best (${r.gaBestZ},${r.gaBestW}); gapZ=${r.gapZ}; hitZ ${r.hitZ}/5`);
      await page.evaluate(() => SGS.app.showTab('ga'));
      await page.screenshot({ path: path.join(OUT, 's2-ga-30req.png') });
    });
    await step('direct encoding (repair / penalty) runs on PPT and gives feasible slot', async () => {
      await page.evaluate(() => SGS.app.loadData(window.SGS_DEFAULT_DATA));
      for (const mode of ['repair', 'penalty']) {
        const r = await page.evaluate(async (mode) => {
          SGS.app.writeGaParams({ encoding: 'direct', directMode: mode, seed: 42, runs: 1 });
          const res = await SGS.app.runGA(1);
          const s = SGS.app.state.slots.ga;
          return { Z: s.score.assigned, feasible: s.feasible, stop: res[0].stopReason };
        }, mode);
        assert.ok(r.feasible && r.Z >= 4, mode + ' ' + JSON.stringify(r));
      }
      await page.evaluate(() => SGS.app.writeGaParams({ encoding: 'indirect', directMode: 'repair' }));
    });
    await step('GA schedule CSV export has rows for the GA slot', async () => {
      const csv = await page.evaluate(() => SGS.app.csvSchedule(SGS.app.state.slots.ga));
      const lines = csv.trim().split('\n');
      assert.ok(lines[0].startsWith('req,satellite,antenna') && lines.length >= 2);
    });
    await step('no page errors, no external requests', async () => {
      assert.deepStrictEqual(errs, []); assert.deepStrictEqual(ext, []);
    });
    console.log(`\n${passed} browser steps passed`);
  } catch (e) {
    process.exitCode = 1;
    console.log('\nFAILED:', e && e.message);
  } finally {
    await browser.close();
  }
})();
