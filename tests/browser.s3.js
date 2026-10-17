// tests/browser.s3.js — SPEC §8 S3 瀏覽器驗收：三解槽可播放、游標同步、甘特圖拖曳即時標紅、時窗拖曳、殘差顯示。
// 需 playwright + Chromium：NODE_PATH=$(npm root -g) node tests/browser.s3.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html');
let passed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log('  ✔', name); } catch (e) { console.log('  ✘', name, '\n    ', e.message); throw e; } }
const WAITFOR = `window.__waitFor = (f, label, timeoutMs) => new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { let ok = false; try { ok = f(); } catch (e) { clearInterval(t); rej(e); return; } if (ok) { clearInterval(t); res(); } else if (Date.now() - t0 > (timeoutMs || 2000)) { clearInterval(t); rej(new Error('waitFor timeout: ' + (label || ''))); } }, 2); });`;

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
    await page.evaluate(async () => { await SGS.app.solveMILP(); SGS.app.writeGaParams({ runs: 1, seed: 42 }); await SGS.app.runGA(1); SGS.app.showTab('sched'); });

    // helpers in page: canvas-relative → page coords
    const blockCenter = async (req) => page.evaluate((req) => { const L = SGS.app.state.lastGanttLayout; const b = L.blocks.find((x) => x.req === req); const r = document.getElementById('gantt').getBoundingClientRect(); return { x: r.left + b.x + b.w / 2, y: r.top + b.y + b.h / 2 }; }, req);
    const blockPoint = async (req, t) => page.evaluate(([req, t]) => { const L = SGS.app.state.lastGanttLayout; const b = L.blocks.find((x) => x.req === req); const r = document.getElementById('gantt').getBoundingClientRect(); return { x: r.left + L.x(t), y: r.top + b.y + b.h / 2 }; }, [req, t]);
    const rowPoint = async (antenna, t) => page.evaluate(([antenna, t]) => { const L = SGS.app.state.lastGanttLayout; const ri = L.rows.indexOf(antenna); const r = document.getElementById('gantt').getBoundingClientRect(); return { x: r.left + L.x(t), y: r.top + L.top + ri * L.rowH + L.rowH / 2 }; }, [antenna, t]);

    await step('MILP and GA slots play: contact state at t=22.5 matches data (R6 active, SAT_C visible at GS_2, GS_2-X not calibrating)', async () => {
      for (const slot of ['milp', 'ga']) {
        const r = await page.evaluate((slot) => { SGS.app.state.activeSlot = slot; SGS.app.renderSched(); SGS.app.setTime(22.5); const a = SGS.app.state.lastAnim; return { t: a.t, active: a.active.map((x) => x.req), visible: a.visible.map((v) => v.sat + '@' + v.station), calib: a.calibrating.map((c) => c.antenna), residuals: a.fit.residuals, omega: a.fit.omega }; }, slot);
        assert.strictEqual(r.t, 22.5); assert.deepStrictEqual(r.active, ['R6']);
        assert.ok(r.visible.includes('SAT_C@GS_2') && r.visible.includes('SAT_C@GS_1'));
        assert.ok(!r.calib.includes('GS_2-X'));
        assert.ok(Math.abs(r.omega - 9) < 1e-9, 'ω = 360/40');
        Object.values(r.residuals).forEach((v) => assert.ok(Number.isFinite(v)));
      }
    });
    await step('cursor sync: Gantt cursor time == animation t; scrub input sets both; speed/pause work; loops at H', async () => {
      const r = await page.evaluate(async () => {
        SGS.app.setTime(10);
        const scrub = document.getElementById('playScrub');
        scrub.value = '50'; scrub.dispatchEvent(new Event('input'));
        const afterScrub = { t: SGS.app.state.play.t, anim: SGS.app.state.lastAnim.t, label: document.getElementById('playTime').textContent };
        document.getElementById('playSpeed').value = '4'; document.getElementById('playSpeed').dispatchEvent(new Event('change'));
        document.getElementById('btnPlay').click();
        const t0 = SGS.app.state.play.t; const w0 = performance.now();
        await new Promise((r) => setTimeout(r, 600));
        document.getElementById('btnPlay').click();
        const dtReal = (performance.now() - w0) / 1000; const t1 = SGS.app.state.play.t;
        await new Promise((r) => setTimeout(r, 200));
        const t2 = SGS.app.state.play.t;
        SGS.app.setTime(39.9); document.getElementById('playSpeed').value = '8'; document.getElementById('playSpeed').dispatchEvent(new Event('change'));
        document.getElementById('btnPlay').click(); await new Promise((r) => setTimeout(r, 300)); document.getElementById('btnPlay').click();
        const looped = SGS.app.state.play.t;
        return { afterScrub, t0, t1, dtReal, t2, playing: SGS.app.state.play.playing, looped, btn: document.getElementById('btnPlay').textContent };
      });
      assert.strictEqual(r.afterScrub.t, 20); assert.strictEqual(r.afterScrub.anim, 20); assert.strictEqual(r.afterScrub.label, '10:20');
      const advanced = r.t1 - r.t0, expected = r.dtReal * 4;
      assert.ok(advanced > expected * 0.5 && advanced < expected * 1.5, `advanced ${advanced} vs expected ${expected}`);
      assert.strictEqual(r.t2, r.t1, 'paused');
      assert.ok(r.looped < 10, 'looped to start: ' + r.looped);
      assert.strictEqual(r.playing, false); assert.ok(/播放/.test(r.btn));
      await page.evaluate(() => { document.getElementById('playSpeed').value = '1'; document.getElementById('playSpeed').dispatchEvent(new Event('change')); });
    });
    await step('drag R1 from GS_1-S onto GS_2-S overlapping R3 → manual slot created, rule 1 violation marked red, MILP slot unchanged', async () => {
      await page.evaluate(() => { SGS.app.state.activeSlot = 'milp'; SGS.app.renderSched(); });
      const before = await page.evaluate(() => JSON.stringify(SGS.app.state.slots.milp.schedule));
      const from = await blockCenter('R1'); const to = await rowPoint('GS_2-S', 10);
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 5, from.y + 2); await page.mouse.move(to.x, to.y, { steps: 8 });
      const ghost = await page.evaluate(() => SGS.app.state.drag && SGS.app.state.drag.ghost);
      assert.ok(ghost && ghost.antenna === 'GS_2-S' && ghost.ok === false, JSON.stringify(ghost));
      await page.mouse.up();
      const r = await page.evaluate(() => { const m = SGS.app.state.slots.manual; return { active: SGS.app.state.activeSlot, feasible: m.feasible, rules: m.violations.map((v) => v.rule + ':' + v.reqs.join('+')), r1: m.schedule.find((x) => x.req === 'R1'), violVisible: !document.getElementById('ganttViol').classList.contains('hidden'), violText: document.getElementById('ganttViol').innerText, milp: JSON.stringify(SGS.app.state.slots.milp.schedule), cards: document.getElementById('scoreCards').innerText }; });
      assert.strictEqual(r.active, 'manual'); assert.strictEqual(r.feasible, false);
      assert.ok(r.rules.includes('1:R1+R3'), r.rules.join(','));
      assert.strictEqual(r.r1.antenna, 'GS_2-S');
      assert.ok(r.violVisible && /規則 1/.test(r.violText));
      assert.strictEqual(r.milp, before);
      assert.ok(/不可行/.test(r.cards));
      await page.screenshot({ path: path.join(OUT, 's3-drag-violation.png') });
    });
    await step('drag R1 back to GS_1-S @ 0 → manual feasible again; drag R5 to tray → unassigned chip; drag chip back onto GS_1-S @ 24 → assigned', async () => {
      const r1now = await page.evaluate(() => SGS.app.state.slots.manual.schedule.find((x) => x.req === 'R1').start);
      let from = await blockPoint('R1', r1now + 4.5); let to = await rowPoint('GS_1-S', 4.5);   // 抓 R1 不與 R3 重疊的尾段；偏移 4 → 起始 0
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
      let r = await page.evaluate(() => ({ feasible: SGS.app.state.slots.manual.feasible, r1: SGS.app.state.slots.manual.schedule.find((x) => x.req === 'R1'), viol: SGS.app.state.slots.manual.violations.map((v) => v.msg), sched: SGS.app.state.slots.manual.schedule }));
      assert.strictEqual(r.feasible, true, JSON.stringify(r)); assert.deepStrictEqual([r.r1.antenna, r.r1.start], ['GS_1-S', 0]);
      from = await blockCenter('R5');
      const tray = await page.evaluate(() => { const b = document.getElementById('ganttTray').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(tray.x, tray.y, { steps: 6 }); await page.mouse.up();
      r = await page.evaluate(() => ({ has: SGS.app.state.slots.manual.schedule.some((x) => x.req === 'R5'), chips: Array.from(document.querySelectorAll('[data-chip]')).map((c) => c.dataset.chip), Z: SGS.app.state.slots.manual.score.assigned }));
      assert.strictEqual(r.has, false); assert.ok(r.chips.includes('R5')); assert.strictEqual(r.Z, 4);
      const chip = await page.evaluate(() => { const b = document.querySelector('[data-chip="R5"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      to = await rowPoint('GS_1-S', 24);
      await page.mouse.move(chip.x, chip.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
      r = await page.evaluate(() => ({ r5: SGS.app.state.slots.manual.schedule.find((x) => x.req === 'R5'), feasible: SGS.app.state.slots.manual.feasible, Z: SGS.app.state.slots.manual.score.assigned, W: SGS.app.state.slots.manual.score.totalWait }));
      assert.deepStrictEqual([r.r5.antenna, r.r5.start, r.feasible, r.Z, r.W], ['GS_1-S', 24, true, 5, 11]);
    });
    await step('manual slot plays in animation (t=24.5 → R5 active)', async () => {
      const r = await page.evaluate(() => { SGS.app.setTime(24.5); return { active: SGS.app.state.lastAnim.active.map((x) => x.req), slot: SGS.app.state.activeSlot }; });
      assert.strictEqual(r.slot, 'manual'); assert.deepStrictEqual(r.active, ['R5']);
    });
    await step('window editor: drag visibility[0] end 12 → 15 updates draft + table; apply → new revision', async () => {
      await page.evaluate(() => SGS.app.showTab('data'));
      await page.click('#btnLoadDefault');
      const rev0 = await page.evaluate(() => SGS.app.state.revision);
      await page.evaluate(() => document.getElementById('winEditor').scrollIntoView({ block: 'center' }));
      const pts = await page.evaluate(() => { const W = SGS.app.state.lastWinEditor; const r = document.getElementById('winEditor').getBoundingClientRect(); const x = (t) => W.left + (t / W.H) * W.plotW; return { from: { x: r.left + x(12), y: r.top + W.top + 0 * W.rowH + W.rowH / 2 }, to: { x: r.left + x(15), y: r.top + W.top + W.rowH / 2 } }; });
      await page.mouse.move(pts.from.x, pts.from.y); await page.mouse.down(); await page.mouse.move(pts.to.x, pts.to.y, { steps: 6 }); await page.mouse.up();
      const r = await page.evaluate(() => ({ end: SGS.app.getDraft().visibility[0].end, input: document.querySelector('input[data-path="visibility[0].end"]').value, committed: SGS.app.state.data.visibility[0].end }));
      assert.strictEqual(r.end, 15); assert.strictEqual(r.input, '15'); assert.strictEqual(r.committed, 12, 'not applied yet');
      await page.click('#btnApply');
      const r2 = await page.evaluate(() => ({ rev: SGS.app.state.revision, end: SGS.app.state.data.visibility[0].end }));
      assert.strictEqual(r2.rev, rev0 + 1); assert.strictEqual(r2.end, 15);
      // move whole R2 request window by +3
      await page.evaluate(() => document.getElementById('winEditor').scrollIntoView({ block: 'center' }));
      const pts2 = await page.evaluate(() => { const W = SGS.app.state.lastWinEditor; const i = W.rows.findIndex((x) => x.kind === 'requests' && x.index === 1); const r = document.getElementById('winEditor').getBoundingClientRect(); const x = (t) => W.left + (t / W.H) * W.plotW; return { from: { x: r.left + x(5), y: r.top + W.top + i * W.rowH + W.rowH / 2 }, to: { x: r.left + x(8), y: r.top + W.top + i * W.rowH + W.rowH / 2 } }; });
      await page.mouse.move(pts2.from.x, pts2.from.y); await page.mouse.down(); await page.mouse.move(pts2.to.x, pts2.to.y, { steps: 6 }); await page.mouse.up();
      const r3 = await page.evaluate(() => { const q = SGS.app.getDraft().requests[1]; return [q.start, q.end]; });
      assert.deepStrictEqual(r3, [5, 11]);
      await page.click('#btnRevert');
      await page.screenshot({ path: path.join(OUT, 's3-data-editor.png') });
    });
    await step('residual toggle + PNG export produce a frame', async () => {
      await page.evaluate(() => SGS.app.showTab('sched'));
      const r = await page.evaluate(() => { document.getElementById('showResidual').checked = false; document.getElementById('showResidual').dispatchEvent(new Event('change')); const len = document.getElementById('anim').toDataURL('image/png').length; document.getElementById('showResidual').checked = true; SGS.app.drawAnim(); return { len, res: SGS.app.state.lastAnim.fit.residuals }; });
      assert.ok(r.len > 5000); assert.ok(Object.keys(r.res).length === 3);
      await page.screenshot({ path: path.join(OUT, 's3-sched.png') });
    });
    await step('no page errors, no external requests', async () => { assert.deepStrictEqual(errs, []); assert.deepStrictEqual(ext, []); });
    console.log(`\n${passed} browser steps passed`);
  } catch (e) { process.exitCode = 1; console.log('\nFAILED:', e && e.message); }
  finally { await browser.close(); }
})();
