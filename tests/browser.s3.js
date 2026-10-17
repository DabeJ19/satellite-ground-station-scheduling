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
    await step('B1: drag on a stale-revision slot is refused (hint shown, no slot write, no error even if the request was deleted)', async () => {
      // 刪掉 R1 後套用 → 新版本；MILP 解槽（舊版本）仍畫出 R1 區塊，拖它不得拋錯、不得寫入任何解槽
      await page.evaluate(() => { const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.requests = d.requests.filter((r) => r.id !== 'R1'); SGS.app.loadData(d); SGS.app.showTab('sched'); SGS.app.state.activeSlot = 'milp'; SGS.app.renderSched(); });
      const before = await page.evaluate(() => ({ rev: SGS.app.state.revision, milpRev: SGS.app.state.slots.milp.revision, slots: JSON.stringify(Object.fromEntries(Object.entries(SGS.app.state.slots).map(([k, v]) => [k, v && [v.revision, v.schedule]]))), hasR1: SGS.app.state.lastGanttLayout.blocks.some((b) => b.req === 'R1'), stale: SGS.app.isViewStale() }));
      assert.ok(before.milpRev < before.rev && before.hasR1 && before.stale, JSON.stringify(before));
      const from = await blockCenter('R1'); const to = await rowPoint('GS_2-S', 10);
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 });
      const mid = await page.evaluate(() => ({ drag: SGS.app.state.drag, refused: SGS.app.state.dragRefused, dragging: document.getElementById('gantt').classList.contains('dragging'), hint: document.getElementById('ganttHint').textContent, hintHidden: document.getElementById('ganttHint').classList.contains('hidden') }));
      await page.mouse.up();
      assert.strictEqual(mid.drag, null); assert.ok(mid.refused && mid.refused.req === 'R1' && mid.refused.reason === 'stale-slot', JSON.stringify(mid.refused));
      assert.strictEqual(mid.dragging, false); assert.ok(!mid.hintHidden && /舊版本/.test(mid.hint));
      // 托盤 chip 同樣拒絕
      const chipSel = await page.evaluate(() => { const c = document.querySelector('[data-chip]'); return c ? c.dataset.chip : null; });
      if (chipSel) {
        const chip = await page.evaluate((id) => { const b = document.querySelector(`[data-chip="${id}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, chipSel);
        await page.mouse.move(chip.x, chip.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
      }
      const after = await page.evaluate(() => ({ active: SGS.app.state.activeSlot, slots: JSON.stringify(Object.fromEntries(Object.entries(SGS.app.state.slots).map(([k, v]) => [k, v && [v.revision, v.schedule]]))) }));
      assert.strictEqual(after.active, 'milp'); assert.strictEqual(after.slots, before.slots, 'no slot written');
      assert.deepStrictEqual(errs, []);
    });
    await step('B1: commit during a drag cancels it (no write on pointerup); pointercancel also clears the drag; ghost base == ensureManual base', async () => {
      // 以目前版本建立手動解槽（空排程），從托盤拖 R5 → 拖曳中提交資料 → 放開不得寫入
      await page.evaluate(() => { SGS.app.setSlot('manual', SGS.app.makeSlot(SGS.app.state.norm, SGS.app.state.data, [], { source: 'manual', label: { kind: 'feas', text: '手動' } }, SGS.app.state.revision)); SGS.app.state.activeSlot = 'manual'; SGS.app.renderSched(); });
      let chip = await page.evaluate(() => { const b = document.querySelector('[data-chip="R5"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      let to = await rowPoint('GS_1-S', 24);
      await page.mouse.move(chip.x, chip.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 });
      const g = await page.evaluate(() => { const d = SGS.app.state.drag; const base = SGS.app.manualBase(); return { rev: d && d.revision, ghost: d && d.ghost, baseLen: base.length, sameAsSlot: base === SGS.app.state.slots.manual.schedule }; });
      assert.ok(g.ghost && g.ghost.req === 'R5' && g.ghost.ok === true, JSON.stringify(g)); assert.strictEqual(g.baseLen, 0); assert.ok(g.sameAsSlot);
      const revBefore = await page.evaluate(() => SGS.app.state.revision);
      await page.evaluate(() => { SGS.app.loadData(JSON.parse(JSON.stringify(SGS.app.state.data))); });   // 提交 → 新版本
      const afterCommit = await page.evaluate(() => ({ drag: SGS.app.state.drag, dragging: document.getElementById('gantt').classList.contains('dragging'), rev: SGS.app.state.revision }));
      assert.strictEqual(afterCommit.drag, null); assert.strictEqual(afterCommit.dragging, false); assert.strictEqual(afterCommit.rev, revBefore + 1);
      await page.mouse.move(to.x + 3, to.y); await page.mouse.up();
      const r = await page.evaluate(() => ({ manualRev: SGS.app.state.slots.manual.revision, hasR5: SGS.app.state.slots.manual.schedule.some((x) => x.req === 'R5'), rev: SGS.app.state.revision }));
      assert.ok(r.manualRev === r.rev - 1 && !r.hasR5, 'stale drag must not write: ' + JSON.stringify(r));
      // pointercancel：在目前版本上開始拖曳，再送 pointercancel → drag 清空、不寫入
      await page.evaluate(() => { SGS.app.setSlot('manual', SGS.app.makeSlot(SGS.app.state.norm, SGS.app.state.data, [], { source: 'manual', label: { kind: 'feas', text: '手動' } }, SGS.app.state.revision)); SGS.app.state.activeSlot = 'manual'; SGS.app.renderSched(); });
      chip = await page.evaluate(() => { const b = document.querySelector('[data-chip="R5"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await page.mouse.move(chip.x, chip.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 4 });
      const pc = await page.evaluate(() => { const had = !!SGS.app.state.drag; window.dispatchEvent(new Event('pointercancel')); return { had, drag: SGS.app.state.drag, dragging: document.getElementById('gantt').classList.contains('dragging'), over: document.getElementById('ganttTray').classList.contains('over') }; });
      await page.mouse.up();
      assert.ok(pc.had); assert.strictEqual(pc.drag, null); assert.strictEqual(pc.dragging, false); assert.strictEqual(pc.over, false);
      const r2 = await page.evaluate(() => SGS.app.state.slots.manual.schedule.length);
      assert.strictEqual(r2, 0, 'pointercancel must not write');
      assert.deepStrictEqual(errs, []);
    });
    await step('B2: playback source == selected slot norm (H, time origin); re-clamp + scrub sync on slot switch and commit; commit pauses', async () => {
      // 目前版本 H=40；改成 H=80、時間原點 08:00 並提交；舊版本 MILP 解槽（H=40）仍以自己的 H/原點播放
      await page.evaluate(() => { const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.horizonMin = 80; d.meta.timeOrigin = '08:00'; SGS.app.loadData(d); SGS.app.showTab('sched'); SGS.app.state.activeSlot = 'milp'; SGS.app.renderSched(); });
      let r = await page.evaluate(() => { SGS.app.setTime(60); return { t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value), label: document.getElementById('playTime').textContent, H: SGS.app.viewNorm().H, cur: SGS.app.state.norm.H }; });
      assert.deepStrictEqual([r.H, r.cur, r.t, r.scrub, r.label], [40, 80, 40, 100, '10:40'], JSON.stringify(r));
      r = await page.evaluate(() => { const s = document.getElementById('playScrub'); s.value = '50'; s.dispatchEvent(new Event('input')); return { t: SGS.app.state.play.t, label: document.getElementById('playTime').textContent, anim: SGS.app.state.lastAnim.t }; });
      assert.deepStrictEqual([r.t, r.label, r.anim], [20, '10:20', 20]);
      // 切到沒有解槽的槽位（→ 目前資料 H=80，原點 08:00）：t 保持 20、拉桿改為 25%、標籤用新原點
      r = await page.evaluate(() => { document.querySelector('#slotSel button[data-slot="ga"]') && (SGS.app.state.slots.ga = null); document.querySelector('#slotSel button[data-slot="ga"]').click(); return { active: SGS.app.state.activeSlot, t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value), label: document.getElementById('playTime').textContent, H: SGS.app.viewNorm().H }; });
      assert.deepStrictEqual([r.active, r.H, r.t, r.scrub, r.label], ['ga', 80, 20, 25, '08:20'], JSON.stringify(r));
      // t=70 在 H=80 下合法；切回 MILP（H=40）→ 夾到 40、拉桿 100
      r = await page.evaluate(() => { SGS.app.setTime(70); document.querySelector('#slotSel button[data-slot="milp"]').click(); return { t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value), label: document.getElementById('playTime').textContent }; });
      assert.deepStrictEqual([r.t, r.scrub, r.label], [40, 100, '10:40'], JSON.stringify(r));
      // 受控時戳：以 stub rAF 驗證 1×=每秒 1 分鐘、循環以解槽 H=40 為準、暫停後重播不跳動
      r = await page.evaluate(() => {
        const raf0 = window.requestAnimationFrame, caf0 = window.cancelAnimationFrame; const cbs = [];
        window.requestAnimationFrame = (f) => { cbs.push(f); return cbs.length; }; window.cancelAnimationFrame = () => {};
        const tick = (ts) => { const f = cbs.shift(); f(ts); return SGS.app.state.play.t; };
        try {
          SGS.app.setTime(39); document.getElementById('playSpeed').value = '1'; document.getElementById('playSpeed').dispatchEvent(new Event('change'));
          SGS.app.startPlay();
          const a = tick(1000), b = tick(1500), c = tick(2200);      // 39 → 39.5 → (40.2 > 40) 0
          const scrubC = Number(document.getElementById('playScrub').value), labelC = document.getElementById('playTime').textContent;
          SGS.app.pausePlay(); const last = SGS.app.state.play.last, raf = SGS.app.state.play.raf; cbs.length = 0;
          SGS.app.setTime(10); SGS.app.startPlay();
          const d = tick(9000), e = tick(9250);                        // 重播：第一幀不跳、第二幀 +0.25
          SGS.app.pausePlay();
          return { a, b, c, scrubC, labelC, last, raf, d, e, playing: SGS.app.state.play.playing };
        } finally { window.requestAnimationFrame = raf0; window.cancelAnimationFrame = caf0; }
      });
      assert.deepStrictEqual([r.a, r.b, r.c, r.scrubC, r.labelC], [39, 39.5, 0, 0, '10:00'], JSON.stringify(r));
      assert.strictEqual(r.last, null); assert.strictEqual(r.raf, null);
      assert.deepStrictEqual([r.d, r.e, r.playing], [10, 10.25, false]);
      // 提交資料 → 播放暫停、rAF/last 清空、t 依播放來源重新夾住
      r = await page.evaluate(() => { SGS.app.startPlay(); const was = SGS.app.state.play.playing; SGS.app.loadData(JSON.parse(JSON.stringify(SGS.app.state.data))); return { was, playing: SGS.app.state.play.playing, raf: SGS.app.state.play.raf, last: SGS.app.state.play.last, btn: document.getElementById('btnPlay').textContent, t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value) }; });
      assert.ok(r.was); assert.strictEqual(r.playing, false); assert.strictEqual(r.raf, null); assert.strictEqual(r.last, null); assert.ok(/播放/.test(r.btn));
      assert.ok(r.t <= 40 && Math.abs(r.scrub - r.t / 40 * 100) < 0.1, JSON.stringify(r));
      assert.deepStrictEqual(errs, []);
    });
    await step('N1: solve result replacing the selected slot re-syncs playback (GA path, MILP zero-candidate path, unselected slot untouched)', async () => {
      // H=80 建 GA 槽、選中、t=70 → 提交 H=40 → 重新跑 GA 寫入目前版本的 H=40 槽 → t 夾到 40、拉桿 100、標籤 10:40、動畫 t=40
      await page.evaluate(async () => { const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.horizonMin = 80; d.meta.timeOrigin = '10:00'; SGS.app.loadData(d); SGS.app.writeGaParams({ runs: 1, seed: 7, popSize: 4, elite: 1, generations: 2, stagnation: 2 }); await SGS.app.runGA(1); SGS.app.showTab('sched'); SGS.app.state.activeSlot = 'ga'; SGS.app.renderSched(); SGS.app.setTime(70); });
      let r = await page.evaluate(() => ({ H: SGS.app.viewNorm().H, t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value) }));
      assert.deepStrictEqual([r.H, r.t, r.scrub], [80, 70, 87.5], JSON.stringify(r));
      await page.evaluate(() => { const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.horizonMin = 40; SGS.app.loadData(d); });
      r = await page.evaluate(() => ({ H: SGS.app.viewNorm().H, t: SGS.app.state.play.t, playing: SGS.app.state.play.playing }));
      assert.deepStrictEqual([r.H, r.t, r.playing], [80, 70, false], 'old GA slot kept: ' + JSON.stringify(r));
      await page.evaluate(async () => { await SGS.app.runGA(1); });
      r = await page.evaluate(() => ({ gaRev: SGS.app.state.slots.ga.revision, rev: SGS.app.state.revision, H: SGS.app.viewNorm().H, t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value), label: document.getElementById('playTime').textContent, anim: SGS.app.state.lastAnim.t, playing: SGS.app.state.play.playing }));
      assert.strictEqual(r.gaRev, r.rev);
      assert.deepStrictEqual([r.H, r.t, r.scrub, r.label, r.anim, r.playing], [40, 40, 100, '10:40', 40, false], JSON.stringify(r));
      // 一般同步（非超界）：t=20 於 H=80 槽為 25% → 換成 H=40 槽後 t 仍 20、拉桿 50%；timeOrigin 改 20:00 → 標籤 20:20
      await page.evaluate(async () => { const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.horizonMin = 80; SGS.app.loadData(d); await SGS.app.runGA(1); SGS.app.setTime(20); });
      r = await page.evaluate(() => Number(document.getElementById('playScrub').value)); assert.strictEqual(r, 25);
      await page.evaluate(async () => { const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.horizonMin = 40; d.meta.timeOrigin = '20:00'; SGS.app.loadData(d); await SGS.app.runGA(1); });
      r = await page.evaluate(() => ({ t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value), label: document.getElementById('playTime').textContent }));
      assert.deepStrictEqual([r.t, r.scrub, r.label], [20, 50, '20:20'], JSON.stringify(r));
      // 更新未選中的槽（MILP 零候選：requests=[] 的合法資料）不得改動選中 GA 槽的 t／H／標籤
      await page.evaluate(async () => { const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.horizonMin = 120; d.requests = []; SGS.app.loadData(d); await SGS.app.solveMILP(); });
      r = await page.evaluate(() => ({ milpRev: SGS.app.state.slots.milp.revision, rev: SGS.app.state.revision, active: SGS.app.state.activeSlot, H: SGS.app.viewNorm().H, t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value), label: document.getElementById('playTime').textContent }));
      assert.strictEqual(r.milpRev, r.rev, 'MILP zero-candidate solved into current revision');
      assert.deepStrictEqual([r.active, r.H, r.t, r.scrub, r.label], ['ga', 40, 20, 50, '20:20'], JSON.stringify(r));
      // MILP 路徑：選中 MILP（H=40 舊槽... 此時 MILP 為 H=120 現版）→ setTime(100) → 提交 H=40、requests=[] → 再 solveMILP 替換選中槽 → t=40、100%
      await page.evaluate(async () => { SGS.app.state.activeSlot = 'milp'; SGS.app.renderSched(); SGS.app.setTime(100); const d = JSON.parse(JSON.stringify(SGS.app.state.data)); d.meta.horizonMin = 40; SGS.app.loadData(d); await SGS.app.solveMILP(); });
      r = await page.evaluate(() => ({ H: SGS.app.viewNorm().H, t: SGS.app.state.play.t, scrub: Number(document.getElementById('playScrub').value), label: document.getElementById('playTime').textContent, anim: SGS.app.state.lastAnim.t, playing: SGS.app.state.play.playing }));
      assert.deepStrictEqual([r.H, r.t, r.scrub, r.label, r.anim, r.playing], [40, 40, 100, '20:40', 40, false], JSON.stringify(r));
      assert.deepStrictEqual(errs, []);
    });
    await step('A1: editing H or a row label in the data tab redraws the window editor immediately', async () => {
      await page.evaluate(() => { SGS.app.loadData(JSON.parse(JSON.stringify(SGS.app.state.data))); SGS.app.showTab('data'); });
      await page.click('#btnLoadDefault');
      const r = await page.evaluate(() => {
        const h0 = SGS.app.state.lastWinEditor.H;
        const orig = SGS.app._drawWinEditor; let n = 0; SGS.app._drawWinEditor = () => { n++; orig(); };
        try {
          const inp = document.querySelector('input[data-meta="horizonMin"]'); inp.value = '60'; inp.dispatchEvent(new Event('input', { bubbles: true }));
          const h1 = SGS.app.state.lastWinEditor.H, n1 = n;
          const idIn = document.querySelector('input[data-path="requests[0].id"]'); idIn.value = 'R1x'; idIn.dispatchEvent(new Event('input', { bubbles: true }));
          return { h0, h1, n1, n2: n, draftId: SGS.app.getDraft().requests[0].id };
        } finally { SGS.app._drawWinEditor = orig; }
      });
      assert.deepStrictEqual([r.h0, r.h1, r.n1, r.n2, r.draftId], [40, 60, 1, 2, 'R1x'], JSON.stringify(r));
      await page.click('#btnRevert');
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
