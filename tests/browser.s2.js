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
      assert.ok(lines[0].startsWith('runId,runIndex,seed,assigned'));
      assert.strictEqual(lines.length, 1 + 20 + 1 + 2, 'rows: ' + lines.length);
      assert.ok(/^summary,run\d+,20,5,11/.test(lines[lines.length - 1]), lines[lines.length - 1]);
      assert.ok(lines[lines.length - 1].endsWith(',true,0'), 'gapZ 0 at end: ' + lines[lines.length - 1]);
      const c = r.curves.trim().split('\n');
      assert.strictEqual(c[0], 'runId,runIndex,seed,generation,best,avg,bestAssigned,bestWait'); assert.ok(c.length > 21);
      await page.screenshot({ path: path.join(OUT, 's2-ga-multi.png') });
    });
    await step('B1: cancel via button → promise resolves null promptly, status 已取消, slot unchanged', async () => {
      const r = await page.evaluate(async () => {
        const before = JSON.stringify(SGS.app.state.slots.ga.schedule);
        SGS.app.writeGaParams({ generations: 5000, stagnation: 5000, popSize: 200, seed: 1, runs: 50 });
        const p = SGS.app.runGA(50);
        await window.__waitFor(() => SGS.app.state.ga.running && !!SGS.app.state.ga.worker, 'worker started');
        document.getElementById('btnGaCancel').click();
        const t0 = Date.now();
        const res = await Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT'), 2000))]);
        const status = document.getElementById('gaStatus').innerText;
        const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.name = 'after-cancel'; SGS.app.loadData(d);
        await new Promise((r) => setTimeout(r, 100));
        return { res, ms: Date.now() - t0, status, same: before === JSON.stringify(SGS.app.state.slots.ga.schedule), running: SGS.app.state.ga.running, btn: document.getElementById('btnGaOne').disabled, slotRev: SGS.app.state.slots.ga.revision, rev: SGS.app.state.revision };
      });
      assert.strictEqual(r.res, null, 'promise must resolve null, got ' + r.res);
      assert.ok(/已取消/.test(r.status), r.status);
      assert.strictEqual(r.same, true); assert.strictEqual(r.running, false); assert.strictEqual(r.btn, false);
      assert.strictEqual(r.slotRev, r.rev - 1);
      await page.evaluate(() => SGS.app.writeGaParams({ generations: 200, stagnation: 50, popSize: 50, seed: 42, runs: 20 }));
    });
    await step('B1 (controlled worker): cancel / commit / replace each settle A with null and terminate(A) exactly once; done terminates too; stale messages ignored', async () => {
      const r = await page.evaluate(async () => {
        const log = [];
        const mk = (id) => { const w = { id, posted: [], terminate() { log.push('terminate:' + id); }, postMessage(m) { w.posted.push(m); }, onmessage: null, onerror: null }; return w; };
        const workers = [];
        SGS.app._setWorkerFactory(() => { const w = mk('W' + (workers.length + 1)); workers.push(w); return w; });
        const out = {};
        // (1) cancel
        let pA = SGS.app.runGA(1); const wA = workers[0];
        SGS.app.cancelGA();
        out.cancel = { resA: await pA, log: log.slice() };
        // (2) commit while running
        log.length = 0; pA = SGS.app.runGA(1); const wB = workers[1];
        const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.name = 'commit-during-ga'; SGS.app.loadData(d);
        out.commit = { resA: await pA, log: log.slice() };
        // (3) replace by new run
        log.length = 0; pA = SGS.app.runGA(1); const wC = workers[2];
        const pB = SGS.app.runGA(1); const wD = workers[3];
        out.replace = { resA: await pA, log: log.slice(), bRunning: SGS.app.state.ga.running, bWorker: SGS.app.state.ga.worker === wD };
        // stale messages from C after replacement must not affect B
        const stale = wC.posted[0];
        wC.onmessage && wC.onmessage({ data: { type: 'done', runId: stale.runId, revision: stale.revision, results: [] } });
        out.staleIgnored = SGS.app.state.ga.running === true && SGS.app.state.ga.results.length === 0;
        // (4) success done for D → results, terminate(D) once; duplicate done ignored
        const m = wD.posted[0];
        const norm = SGS.app.state.norm;
        const res = SGS.ga.run(norm, Object.assign({}, m.params, { seed: m.seeds[0] }));
        const result = { seed: m.seeds[0], best: res.best, bestGen: res.bestGen, generations: res.generations, stopReason: res.stopReason, history: res.history, elapsedMs: 1, params: res.params };
        log.length = 0;
        wD.onmessage({ data: { type: 'run-done', runId: m.runId, revision: m.revision, runIndex: 0, result } });
        wD.onmessage({ data: { type: 'done', runId: m.runId, revision: m.revision, results: [result] } });
        const resB = await pB;
        wD.onmessage && wD.onmessage({ data: { type: 'done', runId: m.runId, revision: m.revision, results: [result] } });
        out.done = { n: resB && resB.length, log: log.slice(), slotZ: SGS.app.state.slots.ga.score.assigned, running: SGS.app.state.ga.running, status: document.getElementById('gaStatus').innerText };
        // cancel after done must not terminate again
        SGS.app.cancelGA(); out.afterDoneLog = log.slice();
        SGS.app._setWorkerFactory(null);
        return out;
      });
      assert.strictEqual(r.cancel.resA, null); assert.deepStrictEqual(r.cancel.log, ['terminate:W1']);
      assert.strictEqual(r.commit.resA, null); assert.deepStrictEqual(r.commit.log, ['terminate:W2']);
      assert.strictEqual(r.replace.resA, null); assert.deepStrictEqual(r.replace.log, ['terminate:W3']); assert.ok(r.replace.bRunning && r.replace.bWorker);
      assert.strictEqual(r.staleIgnored, true);
      assert.strictEqual(r.done.n, 1); assert.deepStrictEqual(r.done.log, ['terminate:W4']); assert.strictEqual(r.done.slotZ, 5); assert.strictEqual(r.done.running, false);
      assert.deepStrictEqual(r.afterDoneLog, ['terminate:W4']);
    });
    await step('B4: invalid params (popSize=1, elite=20, pc=2) rejected, fields marked, no worker; λ=0 runs with warning; effective params frozen in CSV', async () => {
      const r = await page.evaluate(async () => {
        let created = 0; SGS.app._setWorkerFactory(() => { created++; throw new Error('should not create'); });
        SGS.app.writeGaParams({ encoding: 'direct', directMode: 'penalty', popSize: 1, elite: 20, pc: 2, lambda: 0 });
        const res = await SGS.app.runGA(1);
        const bad = { res, created, invalid: Array.from(document.querySelectorAll('[data-ga].invalid')).map((e) => e.dataset.ga).sort(), status: document.getElementById('gaStatus').innerText };
        SGS.app._setWorkerFactory(null);
        SGS.app.writeGaParams({ popSize: 10, elite: 2, pc: 0.9, lambda: 0, generations: 20, stagnation: 10, seed: 42, runs: 1 });
        const ok = await SGS.app.runGA(1);
        const csv = SGS.app.csvStats();
        SGS.app.writeGaParams({ popSize: 999 });   // 執行後改控制項，不得改舊批 CSV
        const csv2 = SGS.app.csvStats();
        return { bad, okN: ok && ok.length, warn: document.getElementById('gaStatus').innerText, lambda: SGS.app.state.ga.params.lambda, csvLine: csv.split('\n')[1], same: csv === csv2 };
      });
      assert.strictEqual(r.bad.res, null); assert.strictEqual(r.bad.created, 0);
      assert.deepStrictEqual(r.bad.invalid, ['elite', 'pc', 'popSize']);
      assert.strictEqual(r.okN, 1); assert.ok(/不再保證可行解優先/.test(r.warn), r.warn);
      assert.strictEqual(r.lambda, 0);
      const cols = r.csvLine.split(',');
      assert.strictEqual(cols[16], '10'); assert.strictEqual(cols[22], '2'); assert.strictEqual(cols[23], '0');   // popSize, elite, lambda
      assert.strictEqual(r.same, true);
      await page.evaluate(() => SGS.app.writeGaParams({ encoding: 'indirect', directMode: 'repair', lambda: null, popSize: 50, generations: 200, stagnation: 50, seed: 42, runs: 20 }));
    });
    await step('N1: auto λ recomputed per data (n=6 → 7, n=30 → 31); manual λ kept with warning; auto survives reload', async () => {
      const r = await page.evaluate(async () => {
        await SGS.app.loadData(window.SGS_DEFAULT_DATA);
        SGS.app.writeGaParams({ encoding: 'direct', directMode: 'penalty', lambda: null, popSize: 10, generations: 10, stagnation: 10, seed: 42, runs: 1 });
        await SGS.app.runGA(1);
        const first = { lambda: SGS.app.state.ga.params.lambda, mode: SGS.app.state.ga.params.lambdaMode, input: document.querySelector('[data-ga="lambda"]').value, csv: SGS.app.csvStats().split('\n')[1].split(',')[23], warn: /不再保證/.test(document.getElementById('gaStatus').innerText) };
        SGS.app.loadData(SGS.engine.generateInstance(1, { nReq: 30, nSat: 6, nStation: 3 }));
        await SGS.app.runGA(1);
        const second = { lambda: SGS.app.state.ga.params.lambda, input: document.querySelector('[data-ga="lambda"]').value, csv: SGS.app.csvStats().split('\n')[1].split(',')[23], warn: /不再保證/.test(document.getElementById('gaStatus').innerText), text: /auto = \|R\|\+1/.test(document.getElementById('gaResult').innerText) };
        // manual 7 stays manual on n=30 and warns
        SGS.app.writeGaParams({ lambda: 7 }); document.querySelector('[data-ga="lambda"]').dispatchEvent(new Event('change'));
        await SGS.app.runGA(1);
        const manual = { lambda: SGS.app.state.ga.params.lambda, mode: SGS.app.state.ga.params.lambdaMode, warn: /不再保證/.test(document.getElementById('gaStatus').innerText) };
        // indirect then penalty keeps auto intent
        SGS.app.writeGaParams({ lambda: null, encoding: 'indirect' }); document.querySelector('[data-ga="lambda"]').dispatchEvent(new Event('change'));
        await SGS.app.runGA(1);
        SGS.app.writeGaParams({ encoding: 'direct', directMode: 'penalty' });
        await SGS.app.runGA(1);
        const again = { lambda: SGS.app.state.ga.params.lambda, mode: SGS.app.state.ga.params.lambdaMode, input: document.querySelector('[data-ga="lambda"]').value };
        return { first, second, manual, again, saved: JSON.parse(localStorage.getItem('sgs.state.v1')).settings.ga.lambda };
      });
      assert.deepStrictEqual([r.first.lambda, r.first.mode, r.first.input, r.first.csv, r.first.warn], [7, 'auto', '', '7', false]);
      assert.deepStrictEqual([r.second.lambda, r.second.input, r.second.csv, r.second.warn, r.second.text], [31, '', '31', false, true]);
      assert.deepStrictEqual([r.manual.lambda, r.manual.mode, r.manual.warn], [7, 'manual', true]);
      assert.deepStrictEqual([r.again.lambda, r.again.mode, r.again.input], [31, 'auto', '']);
      assert.strictEqual(r.saved, null);
      // reload → auto persists and recomputes
      await page.reload();
      await page.waitForFunction(() => document.getElementById('glpkStatus').textContent.includes('就緒'), null, { timeout: 20000 });
      const r2 = await page.evaluate(async () => { const inp = document.querySelector('[data-ga="lambda"]').value; await SGS.app.runGA(1); return { inp, lambda: SGS.app.state.ga.params.lambda, n: SGS.app.state.norm.requests.length }; });
      assert.deepStrictEqual([r2.inp, r2.lambda], ['', r2.n + 1]);
      await page.evaluate(async () => { await SGS.app.loadData(window.SGS_DEFAULT_DATA); SGS.app.writeGaParams({ encoding: 'indirect', directMode: 'repair', lambda: null, popSize: 50, generations: 200, stagnation: 50, seed: 42, runs: 20 }); await SGS.app.solveMILP(); });
    });
    await step('A2: saved GA params (direct/penalty, λ=7, N=10, G=10) restored after reload; manual 7 kept on n=30 with warning', async () => {
      await page.evaluate(() => { SGS.app.writeGaParams({ encoding: 'direct', directMode: 'penalty', lambda: 7, popSize: 10, generations: 10, stagnation: 10, seed: 42, runs: 1 }); document.querySelector('[data-ga="lambda"]').dispatchEvent(new Event('change')); });
      await page.reload();
      await page.waitForFunction(() => document.getElementById('glpkStatus').textContent.includes('就緒'), null, { timeout: 20000 });
      const r = await page.evaluate(async () => {
        const v = (k) => document.querySelector(`[data-ga="${k}"]`).value;
        const ctl = { encoding: v('encoding'), directMode: v('directMode'), lambda: v('lambda'), popSize: v('popSize'), generations: v('generations') };
        SGS.app.loadData(SGS.engine.generateInstance(1, { nReq: 30, nSat: 6, nStation: 3 }));
        await SGS.app.runGA(1);
        return { ctl, lambda: SGS.app.state.ga.params.lambda, mode: SGS.app.state.ga.params.lambdaMode, warn: /不再保證/.test(document.getElementById('gaStatus').innerText) };
      });
      assert.deepStrictEqual(r.ctl, { encoding: 'direct', directMode: 'penalty', lambda: '7', popSize: '10', generations: '10' });
      assert.deepStrictEqual([r.lambda, r.mode, r.warn], [7, 'manual', true]);
      await page.evaluate(async () => { await SGS.app.loadData(window.SGS_DEFAULT_DATA); SGS.app.writeGaParams({ encoding: 'indirect', directMode: 'repair', lambda: null, popSize: 50, generations: 200, stagnation: 50, seed: 42, runs: 20 }); document.querySelector('[data-ga="lambda"]').dispatchEvent(new Event('change')); await SGS.app.solveMILP(); });
    });
    await step('N2: chart axis uses gen 0..maxGen; generations=1 → gen0 at plotLeft, gen1 at plotRight, ticks [0,1]', async () => {
      await page.evaluate(() => SGS.app.showTab('ga'));
      const r = await page.evaluate(async () => {
        SGS.app.writeGaParams({ generations: 1, stagnation: 50, seed: 1, runs: 1 });
        await SGS.app.runGA(1);
        const c = SGS.app.state.lastGaChart;
        return { gens: SGS.app.state.ga.results[0].history.map((h) => h.gen), ticks: c.ticks.map((t) => t.gen), pts: c.points[0], L: c.plotLeft, R: c.plotRight, maxGen: c.maxGen };
      });
      assert.deepStrictEqual(r.gens, [0, 1]); assert.deepStrictEqual(r.ticks, [0, 1]);
      assert.strictEqual(r.pts[0].x, r.L); assert.strictEqual(r.pts[1].x, r.R);
      r.pts.forEach((p) => assert.ok(p.x >= r.L && p.x <= r.R));
      const r3 = await page.evaluate(async () => {
        SGS.app.writeGaParams({ encoding: 'direct', directMode: 'repair', generations: 100, stagnation: 50, seed: 1, runs: 3 });
        await SGS.app.runGA(3);
        const c = SGS.app.state.lastGaChart; const res = SGS.app.state.ga.results;
        const r0 = res[0];
        const firstHit = r0.history.find((h) => h.bestAssigned === 5 && h.bestWait === 11);
        return { maxGen: c.maxGen, lastGens: res.map((x) => x.history[x.history.length - 1].gen), allIn: c.points.every((pts) => pts.every((p) => p.x >= c.plotLeft && p.x <= c.plotRight)), lastX: c.points.map((pts) => pts[pts.length - 1].x), R: c.plotRight, bestGen: r0.best.gen, firstHitGen: firstHit && firstHit.gen, tick0: c.ticks[0].gen };
      });
      assert.strictEqual(r3.maxGen, Math.max(...r3.lastGens)); assert.ok(r3.allIn); assert.strictEqual(r3.tick0, 0);
      assert.ok(r3.lastX.some((x) => x === r3.R), 'longest curve ends at plotRight');
      assert.strictEqual(r3.bestGen, r3.firstHitGen);
      await page.evaluate(() => SGS.app.writeGaParams({ encoding: 'indirect', directMode: 'repair', generations: 200, stagnation: 50, seed: 42, runs: 20 }));
    });
    await step('B5: two batches with same seed → distinct runId in curve CSV; rows map back to history', async () => {
      const r = await page.evaluate(async () => {
        await SGS.app.runGA(1); const c1 = SGS.app.csvCurves(); const id1 = SGS.app.state.ga.runId; const h1 = SGS.app.state.ga.results[0].history;
        await SGS.app.runGA(1); const c2 = SGS.app.csvCurves(); const id2 = SGS.app.state.ga.runId;
        const rows = c1.trim().split('\n').slice(1).map((l) => l.split(','));
        return { id1, id2, allId1: rows.every((x) => x[0] === id1), allId2: c2.trim().split('\n').slice(1).every((l) => l.startsWith(id2 + ',')), n: rows.length, hn: h1.length, first: rows[0], h0: h1[0] };
      });
      assert.notStrictEqual(r.id1, r.id2); assert.ok(r.allId1 && r.allId2);
      assert.strictEqual(r.n, r.hn);
      assert.deepStrictEqual(r.first.slice(3, 6), [String(r.h0.gen), String(r.h0.best), String(r.h0.avg)]);
    });
    await step('B6: incumbent reference (4,5) feas vs GA (5,11) → gapZ −1 shown as GA 多 1 個任務 and in CSV', async () => {
      const r = await page.evaluate(async () => {
        const norm = SGS.app.state.norm, data = SGS.app.state.data;
        const greedy = SGS.engine.greedyDecode(norm, ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
        SGS.app.setSlot('milp', SGS.app.makeSlot(norm, data, greedy, { source: 'MILP', label: { kind: 'feas', text: '有可行解，未證明最佳' } }, SGS.app.state.revision));
        await SGS.app.runGA(1);
        const s = SGS.app.state.ga.summary;
        const text = document.getElementById('gaResult').innerText;
        const last = SGS.app.csvStats().trim().split('\n').pop();
        return { gapZ: s.gapZ, text, last, hitLabel: /命中 MILP incumbent 率/.test(text) };
      });
      assert.strictEqual(r.gapZ, -1);
      assert.ok(/gapZ[\s\S]*-1/.test(r.text) && /GA 多 1 個任務/.test(r.text), r.text.slice(0, 400));
      assert.ok(r.hitLabel);
      assert.ok(r.last.endsWith(',false,-1'), r.last);
      await page.evaluate(async () => { await SGS.app.solveMILP(); });
    });
    await step('B2 UI: generator rejects nSat=1.5 / H=5 / empty nReq with located errors, revision unchanged; H=10 generates valid data', async () => {
      await page.evaluate(() => SGS.app.showTab('data'));
      const rev0 = await page.evaluate(() => SGS.app.state.revision);
      for (const [field, val, expectPath] of [['nSat', '1.5', 'generator.nSat'], ['H', '5', 'generator.H'], ['nReq', '', 'generator.nReq']]) {
        await page.evaluate(() => document.querySelectorAll('[data-gen]').forEach((el) => { const d = { seed: 1, nSat: 6, nStation: 3, nAntennaPerStation: 2, nReq: 30, windowDensity: 0.7, H: 120, calibDefaultMin: 10 }; el.value = d[el.dataset.gen]; }));
        await page.fill(`input[data-gen="${field}"]`, val);
        await page.click('#btnGenerate');
        const r = await page.evaluate(() => ({ rev: SGS.app.state.revision, err: document.getElementById('dataErrors').innerText, invalid: !!document.querySelector('[data-gen].invalid') }));
        assert.strictEqual(r.rev, rev0, field); assert.ok(r.err.includes(expectPath), field + ': ' + r.err); assert.ok(r.invalid, field);
      }
      await page.evaluate(() => document.querySelectorAll('[data-gen]').forEach((el) => { const d = { seed: 1, nSat: 6, nStation: 3, nAntennaPerStation: 2, nReq: 30, windowDensity: 0.7, H: 10, calibDefaultMin: 10 }; el.value = d[el.dataset.gen]; }));
      await page.click('#btnGenerate');
      const r2 = await page.evaluate(() => ({ rev: SGS.app.state.revision, H: SGS.app.state.norm.H, ok: SGS.app.state.data.visibility.every((v) => v.end <= 10) }));
      assert.strictEqual(r2.rev, rev0 + 1); assert.strictEqual(r2.H, 10); assert.ok(r2.ok);
    });
    await step('generator seed=1, 30 requests → MILP (tmlim 30) vs GA gap reported', async () => {
      await page.evaluate(() => SGS.app.showTab('data'));
      await page.fill('input[data-gen="seed"]', '1'); await page.fill('input[data-gen="nReq"]', '30'); await page.fill('input[data-gen="nSat"]', '6'); await page.fill('input[data-gen="nStation"]', '3'); await page.fill('input[data-gen="H"]', '120');
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
