// tests/browser.s1.js — SPEC §8 S1 (a)、(g) 瀏覽器驗收。需 playwright + Chromium：NODE_PATH=$(npm root -g) node tests/browser.s1.js
require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const reqs = []; p.on('request', r => { if (!r.url().startsWith('file://')) reqs.push(r.url()); });
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'dist', 'index.html'));
  await p.waitForFunction(() => document.getElementById('glpkStatus').textContent.includes('就緒'), null, { timeout: 20000 });
  // (a) MILP on default
  const res = await p.evaluate(async () => {
    const r = await SGS.app.solveMILP();
    return { status: r.status, label: r.label, feasible: r.feasible, score: r.score, schedule: r.schedule, stats: r.stats, timing: r.timing };
  });
  console.log('(a)', JSON.stringify({ status: res.status, label: res.label.text, feasible: res.feasible, Z: res.score.assigned, W: res.score.totalWait, obj: res.score.objective, stats: res.stats, ms: Math.round(res.timing.milpMs) }));
  console.log('    schedule', res.schedule.map(x => `${x.req}/${x.antenna}/${x.start}`).join(' '));
  // §8.4 data tab counts
  const counts = await p.evaluate(() => ({ sat: document.querySelectorAll('#tblSat tbody tr').length, st: document.querySelectorAll('#tblSt tbody tr').length, ant: document.querySelectorAll('#tblAnt tbody tr').length, vis: document.querySelectorAll('#tblVis tbody tr').length, req: document.querySelectorAll('#tblReq tbody tr').length }));
  console.log('(g) table counts', JSON.stringify(counts));
  await p.evaluate(() => SGS.app.showTab('sched'));
  await p.screenshot({ path: require('path').join(__dirname, 'out', 's1-gantt.png') });
  // §8.4: change R1.durMin 5→7 via the table input, apply, re-solve
  await p.evaluate(() => SGS.app.showTab('data'));
  await p.fill('input[data-path="requests[0].durMin"]', '7');
  await p.click('#btnApply');
  const rev = await p.evaluate(() => SGS.app.state.revision);
  const cards1 = await p.evaluate(() => document.getElementById('scoreCards').innerText);
  const res2 = await p.evaluate(async () => { const r = await SGS.app.solveMILP(); return { status: r.status, label: r.label.text, Z: r.score.assigned, W: r.score.totalWait, sched: r.schedule.map(x => `${x.req}/${x.antenna}/${x.start}`) }; });
  console.log('(g) after R1.durMin=7: revision', rev, JSON.stringify(res2));
  console.log('    cards before re-solve (stale marker expected):', cards1.replace(/\n/g, ' | '));
  const cards2 = await p.evaluate(() => document.getElementById('scoreCards').innerText);
  console.log('    cards after re-solve:', cards2.replace(/\n/g, ' | '));
  // negative duration rejected
  await p.fill('input[data-path="requests[0].durMin"]', '-3');
  await p.click('#btnApply');
  const errText = await p.evaluate(() => document.getElementById('dataErrors').innerText);
  const rev2 = await p.evaluate(() => SGS.app.state.revision);
  console.log('(g) negative durMin → revision unchanged', rev2 === rev, '| error:', errText.split('\n')[1]);
  await p.screenshot({ path: require('path').join(__dirname, 'out', 's1-data.png') });
  await p.evaluate(() => SGS.app.showTab('model'));
  await p.screenshot({ path: require('path').join(__dirname, 'out', 's1-model.png') });
  console.log('ERRORS:', errs, 'EXTERNAL REQUESTS:', reqs);
  await b.close();
})();
