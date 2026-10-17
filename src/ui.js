// ui.js — 分頁、主題、資料編輯、MILP 求解面板、解槽評分卡、唯讀甘特圖、localStorage 降級（S1 範圍）
(function (root) {
  'use strict';
  const SGS = (root.SGS = root.SGS || {});
  const E = SGS.engine, M = SGS.milp;
  const $ = (sel) => document.querySelector(sel);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const LS_KEY = 'sgs.state.v1';

  // ---------- 狀態 ----------
  const state = {
    draft: null,                         // 編輯中的資料（未驗證）
    data: null, norm: null, revision: 0, // 已提交（通過驗證）的版本
    slots: { manual: null, milp: null, ga: null }, // {schedule, score, feasible, violations, revision, norm, data, meta}
    activeSlot: 'milp',
    settings: { tmlim: 30, ga: {} },
    solving: false,
    storageWarned: false,
    ga: { running: false, worker: null, results: [], curves: [], summary: null, mode: null, norm: null, revision: null },
  };
  const gate = M.createGate();
  const gateGA = M.createGate();

  // ---------- GLPK 初始化 ownership（B4） ----------
  // single-flight promise + 世代號：cancel 會遞增世代，過期初始化完成後自行 terminate，不覆寫現用實例。
  let glpkFactory = () => root.GLPK();
  let glpkInst = null, glpkPromise = null, glpkGen = 0;
  function initGLPK() {
    if (glpkInst) return Promise.resolve(glpkInst);
    if (glpkPromise) return glpkPromise;
    const gen = ++glpkGen;
    glpkPromise = Promise.resolve().then(glpkFactory).then((g) => {
      if (gen !== glpkGen) { try { g.terminate(); } catch (_) {} throw new Error('stale-glpk-init'); }
      glpkInst = g; glpkPromise = null; return g;
    }, (err) => { if (gen === glpkGen) glpkPromise = null; throw err; });
    return glpkPromise;
  }
  function destroyGLPK() {
    glpkGen++;                       // 使進行中的初始化失效
    glpkPromise = null;
    if (glpkInst) { try { glpkInst.terminate(); } catch (_) {} glpkInst = null; }
  }

  // ---------- 持久化（try/catch 降級；失敗提示備份，A2） ----------
  function saveLS() {
    try {
      const slots = {};
      Object.keys(state.slots).forEach((k) => { const s = state.slots[k]; slots[k] = s ? { schedule: s.schedule, revision: s.revision, meta: s.meta, data: s.data } : null; });
      localStorage.setItem(LS_KEY, JSON.stringify({ data: state.data, revision: state.revision, settings: state.settings, slots, activeSlot: state.activeSlot }));
      if (state.storageWarned) { state.storageWarned = false; const b = $('#storageWarn'); if (b) b.classList.add('hidden'); }
      return true;
    } catch (_) {
      if (!state.storageWarned) { state.storageWarned = true; const b = $('#storageWarn'); if (b) b.classList.remove('hidden'); }
      return false;
    }
  }
  function loadLS() {
    try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
  }

  // ---------- 提交資料（新版本） ----------
  // 先在區域變數完成 validate → normalize；成功才取代 state，失敗不動任何既有狀態。
  function commit(data, opts) {
    opts = opts || {};
    const v = E.validateData(data);
    if (!v.ok) return v;
    let norm;
    try { norm = E.normalize(data); } catch (e) { return { ok: false, errors: (e && e.errors) || [{ path: '', msg: '正規化失敗：' + (e && e.message) }] }; }
    cancelSolve();
    cancelGA();
    state.data = clone(data);
    state.norm = norm;
    state.revision = (opts.revision != null) ? opts.revision : state.revision + 1;
    gate.setRevision(state.revision);
    gateGA.setRevision(state.revision);
    state.draft = clone(state.data);
    saveLS();
    renderAll();
    return v;
  }

  function setSlot(name, slot) { state.slots[name] = slot; saveLS(); renderSched(); }

  function makeSlot(norm, data, schedule, meta, revision) {
    const fe = E.checkFeasible(norm, schedule);
    return { schedule, feasible: fe.ok, violations: fe.violations, score: E.score(norm, schedule), norm, data, meta: meta || {}, revision };
  }

  // ---------- 分頁 / 主題 ----------
  function initChrome() {
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
    const rootEl = document.documentElement;
    try { const t = localStorage.getItem('sgs.theme'); if (t) rootEl.dataset.theme = t; } catch (_) {}
    $('#themeToggle').onclick = () => {
      rootEl.dataset.theme = rootEl.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('sgs.theme', rootEl.dataset.theme); } catch (_) {}
      renderSched();
    };
  }
  function showTab(name) {
    $('#tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('hidden', s.id !== 'tab-' + name));
    if (name === 'sched') renderSched();
    if (name === 'ga') drawGaChart();
  }

  // ---------- 資料分頁 ----------
  function initData() {
    $('#btnLoadDefault').onclick = () => loadData(root.SGS_DEFAULT_DATA);
    $('#btnExport').onclick = () => download('sgs-data.json', JSON.stringify(state.draft, null, 2), 'application/json');
    $('#btnImport').onclick = () => $('#fileImport').click();
    $('#fileImport').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => importJSONText(fr.result);
      fr.readAsText(f); e.target.value = '';
    };
    $('#btnRevert').onclick = () => { state.draft = clone(state.data); renderDataTab(); showErrors(null); };
    $('#btnGenerate').onclick = () => {
      const o = {};
      document.querySelectorAll('[data-gen]').forEach((el) => { o[el.dataset.gen] = Number(el.value); });
      const d = E.generateInstance(o.seed | 0, o);
      loadData(d);
    };
    $('#btnApply').onclick = () => applyDraft();
    document.querySelectorAll('button[data-add]').forEach((b) => b.onclick = () => addRow(b.dataset.add));
    const tab = $('#tab-data');
    tab.addEventListener('input', onDraftInput);
    tab.addEventListener('change', onDraftChange);
    tab.addEventListener('click', (e) => {
      const d = e.target.closest('button[data-del]'); if (!d) return;
      const [kind, i, j] = d.dataset.del.split(':');
      if (kind === 'antennas') state.draft.stations[+i].antennas.splice(+j, 1);
      else state.draft[kind].splice(+i, 1);
      renderDataTab();
    });
  }

  // 匯入：parse → validate 在區域變數完成；失敗保留原 draft／committed／解槽，不渲染輸入內容
  function importJSONText(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (err) { showErrors([{ path: 'file', msg: 'JSON 解析失敗：' + err.message }]); return { ok: false }; }
    return loadData(obj);
  }
  function loadData(obj) {
    const v = E.validateData(obj);
    if (!v.ok) { showErrors(v.errors); return v; }
    const r = commit(obj);
    if (!r.ok) { showErrors(r.errors); return r; }
    showErrors(null); renderDataTab();
    return r;
  }
  function applyDraft() {
    const v = commit(state.draft);
    showErrors(v.ok ? null : v.errors);
    if (v.ok) renderDataTab();
    return v;
  }

  function showErrors(errors) {
    const el = $('#dataErrors');
    document.querySelectorAll('#tab-data input, #tab-data select').forEach((i) => i.classList.remove('invalid'));
    if (!errors || !errors.length) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = '<b>資料驗證失敗，未建立新版本：</b><ul>' + errors.map((e) => `<li><code>${esc(e.path)}</code> — ${esc(e.msg)}</li>`).join('') + '</ul>';
    errors.forEach((e) => { const inp = document.querySelector(`[data-path="${cssEsc(e.path)}"]`); if (inp) inp.classList.add('invalid'); });
  }

  function setByPath(obj, pathStr, val) {
    const parts = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (!o || typeof o !== 'object') return; o = o[parts[i]]; }
    if (o && typeof o === 'object') o[parts[parts.length - 1]] = val;
  }
  function parseByType(type, raw) {
    const s = String(raw);
    if (type === 'int') { if (s.trim() === '') return ''; const n = Number(s); return Number.isFinite(n) ? n : s; }
    if (type === 'intOrNull') { if (s.trim() === '') return null; const n = Number(s); return Number.isFinite(n) ? n : s; }
    if (type === 'float') { if (s.trim() === '') return null; const n = Number(s); return Number.isFinite(n) ? n : s; }
    return raw;
  }
  // 每次按鍵：更新 draft（不重繪，保留焦點）
  function onDraftInput(e) {
    const el = e.target; if (!el || !el.dataset) return;
    if (el.dataset.meta) {
      const k = el.dataset.meta;
      if (k === 'bands') state.draft.bands = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (k === 'horizonMin' || k === 'calibDefaultMin') state.draft.meta[k] = parseByType('int', el.value);
      else state.draft.meta[k] = el.value;
      return;
    }
    const p = el.dataset.path; if (!p) return;
    if (el.dataset.moveAntenna != null) return; // 換站在 change 處理
    setByPath(state.draft, p, parseByType(el.dataset.type || 'text', el.value));
  }
  // change（失焦／選單）：引用 id 或頻段改變 → 重建選單；天線換站
  function onDraftChange(e) {
    const el = e.target; if (!el || !el.dataset) return;
    if (el.dataset.moveAntenna != null) {
      const [si, ai] = el.dataset.moveAntenna.split(':').map(Number);
      const target = state.draft.stations.find((s) => s.id === el.value);
      if (!target) { showErrors([{ path: el.dataset.path, msg: `找不到地面站 ${el.value}，天線未移動` }]); renderDataTab(); return; }
      const ant = state.draft.stations[si].antennas.splice(ai, 1)[0];
      target.antennas.push(ant);
      renderDataTab(); return;
    }
    onDraftInput(e);
    const rerender = el.dataset.meta === 'bands' || /^(satellites|stations)\[\d+\]\.id$/.test(el.dataset.path || '');
    if (rerender) renderDataTab();
  }

  function addRow(kind) {
    const d = state.draft;
    if (kind === 'satellites') d.satellites.push({ id: 'SAT_' + (d.satellites.length + 1), color: palette(d.satellites.length) });
    if (kind === 'stations') d.stations.push({ id: 'GS_' + (d.stations.length + 1), angleDeg: 0, antennas: [] });
    if (kind === 'antennas') { if (!d.stations.length) d.stations.push({ id: 'GS_1', angleDeg: 0, antennas: [] }); const st = d.stations[0]; st.antennas.push({ id: st.id + '-' + (d.bands[0] || 'S') + (st.antennas.length + 1), band: d.bands[0] || 'S', calibMin: null }); }
    if (kind === 'visibility') d.visibility.push({ sat: (d.satellites[0] || {}).id || '', station: (d.stations[0] || {}).id || '', start: 0, end: Math.min(10, d.meta.horizonMin || 10) });
    if (kind === 'requests') d.requests.push({ id: 'R' + (d.requests.length + 1), sat: (d.satellites[0] || {}).id || '', band: d.bands[0] || 'S', durMin: 1, start: 0, end: Math.min(10, d.meta.horizonMin || 10) });
    renderDataTab();
  }

  // 選單：目前值不在清單內時保留一個標示「無效」的 option，不自動改成第一項
  function optionList(values, sel) {
    const list = values.map((v) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`);
    if (sel != null && !values.includes(sel)) list.unshift(`<option value="${esc(sel)}" selected class="invalid-opt">${esc(sel)}（無效）</option>`);
    return list.join('');
  }
  function renderDataTab() {
    const d = state.draft; if (!d) return;
    document.querySelectorAll('[data-meta]').forEach((el) => {
      const k = el.dataset.meta;
      el.value = k === 'bands' ? (d.bands || []).join(', ') : (d.meta[k] == null ? '' : d.meta[k]);
    });
    const satIds = d.satellites.map((s) => s.id), stIds = d.stations.map((s) => s.id), bands = d.bands.map(String);
    const del = (k, i, j) => `<td class="act"><button class="mini" data-del="${k}:${i}${j != null ? ':' + j : ''}" title="刪除">✕</button></td>`;
    const val = (v) => esc(v == null ? '' : v);

    $('#tblSat tbody').innerHTML = d.satellites.map((s, i) => `<tr>
      <td><input data-path="satellites[${i}].id" value="${val(s.id)}"></td>
      <td><input type="color" data-path="satellites[${i}].color" value="${val(s.color || palette(i))}"></td>${del('satellites', i)}</tr>`).join('');
    $('#tblSt tbody').innerHTML = d.stations.map((s, i) => `<tr>
      <td><input data-path="stations[${i}].id" value="${val(s.id)}"></td>
      <td class="num"><input type="number" step="1" data-type="float" data-path="stations[${i}].angleDeg" value="${val(s.angleDeg)}"></td>${del('stations', i)}</tr>`).join('');
    $('#tblAnt tbody').innerHTML = d.stations.flatMap((s, i) => (s.antennas || []).map((a, j) => `<tr>
      <td><select data-path="stations[${i}].antennas[${j}].station" data-move-antenna="${i}:${j}">${optionList(stIds, s.id)}</select></td>
      <td><input data-path="stations[${i}].antennas[${j}].id" value="${val(a.id)}"></td>
      <td><select data-path="stations[${i}].antennas[${j}].band">${optionList(bands, a.band == null ? null : String(a.band))}</select></td>
      <td class="num"><input type="number" step="1" min="0" data-type="intOrNull" data-path="stations[${i}].antennas[${j}].calibMin" value="${val(a.calibMin)}"></td>${del('antennas', i, j)}</tr>`)).join('');
    $('#tblVis tbody').innerHTML = d.visibility.map((v, i) => `<tr>
      <td><select data-path="visibility[${i}].sat">${optionList(satIds, v.sat)}</select></td>
      <td><select data-path="visibility[${i}].station">${optionList(stIds, v.station)}</select></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="visibility[${i}].start" value="${val(v.start)}"></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="visibility[${i}].end" value="${val(v.end)}"></td>${del('visibility', i)}</tr>`).join('');
    $('#tblReq tbody').innerHTML = d.requests.map((r, i) => `<tr>
      <td><input data-path="requests[${i}].id" value="${val(r.id)}" style="width:60px"></td>
      <td><select data-path="requests[${i}].sat">${optionList(satIds, r.sat)}</select></td>
      <td><select data-path="requests[${i}].band">${optionList(bands, r.band == null ? null : String(r.band))}</select></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="requests[${i}].durMin" value="${val(r.durMin)}"></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="requests[${i}].start" value="${val(r.start)}"></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="requests[${i}].end" value="${val(r.end)}"></td>${del('requests', i)}</tr>`).join('');
  }

  // ---------- 模型分頁 ----------
  function initModel() {
    $('#tmlim').value = state.settings.tmlim;
    $('#tmlim').onchange = () => { state.settings.tmlim = Math.max(1, parseInt($('#tmlim').value, 10) || 30); $('#tmlim').value = state.settings.tmlim; saveLS(); };
    $('#btnSolve').onclick = () => solveMILP();
    $('#btnCancel').onclick = () => { cancelSolve(); setStatus('<span class="badge bad">已取消</span>'); };
    initGLPK().then((g) => { $('#glpkStatus').textContent = `GLPK ${g.version} 已就緒（WebAssembly，Worker）`; })
      .catch((e) => { if (String(e && e.message) !== 'stale-glpk-init') $('#glpkStatus').textContent = 'glpk 載入失敗：' + e; });
  }
  function cancelSolve() {
    gate.cancel();
    if (state.solving) destroyGLPK();   // 只終止進行中 run 擁有的 worker／未完成初始化；閒置實例保留
    state.solving = false;
    $('#btnSolve').disabled = false; $('#btnCancel').disabled = true;
  }
  function setStatus(html) { $('#milpStatus').innerHTML = html; }

  async function solveMILP() {
    if (!state.norm) return null;
    cancelSolve();
    const norm = state.norm, data = state.data, revision = state.revision;   // 快照
    const runId = gate.begin(revision);
    const isCurrent = () => gate.accepts({ revision, runId });
    state.solving = true;
    $('#btnSolve').disabled = true; $('#btnCancel').disabled = false;
    setStatus(`<span class="badge run">求解中…</span> 版本 r${revision}，時間上限 ${state.settings.tmlim}s`);
    let res = null;
    try {
      const g = await initGLPK();
      if (!isCurrent()) return null;                          // 初始化期間已取消／改版
      res = await M.solve(norm, { glpk: g, tmlim: state.settings.tmlim, revision, runId });
    } catch (err) {
      res = { error: String(err && err.message || err), revision, runId, label: { kind: 'bad', text: '求解失敗' }, hasIncumbent: false, schedule: null };
    }
    if (!isCurrent()) return null;                            // 版本閘門：過期結果整包丟棄（含錯誤）
    state.solving = false;
    $('#btnSolve').disabled = false; $('#btnCancel').disabled = true;
    if (res.hasIncumbent && res.schedule && res.feasible) {
      setSlot('milp', makeSlot(norm, data, res.schedule, { source: 'MILP', label: res.label, bound: res.bound, timing: res.timing, stats: res.stats, status: res.status, note: res.note }, revision));
    }
    renderMilpStatus(res);
    return res;
  }

  function renderMilpStatus(res) {
    let html = `<span class="badge ${res.label.kind}">${esc(res.label.text)}</span> 版本 r${res.revision}<br>`;
    if (res.error) html += `<span style="color:var(--bad)">${esc(res.error)}</span>（解槽未更新）<br>`;
    if (res.schedule && res.score) {
      const s = res.score;
      html += `Z = <b>${s.assigned}</b>　總等待 = <b>${s.totalWait}</b> 分鐘　objective = ${s.objective.toFixed(6)}（ε = 1/${Math.round(1 / res.eps)}）<br>`;
    }
    if (res.note) html += `<span class="muted">${esc(res.note)}</span><br>`;
    if (res.label.kind === 'feas') {
      const b = res.bound;
      if (b && !b.error && !b.unavailable) html += `LP 鬆弛上界 U = ${b.U.toFixed(6)}，absoluteGap = ${b.absoluteGap.toFixed(6)}，relativeGap = ${(b.relativeGap * 100).toFixed(3)}%（加權目標的 LP 鬆弛 gap，非原生 B&B gap，亦非任務數差距）<br>`;
      else if (b && b.error) html += `<span style="color:var(--bad)">${esc(b.error)}</span><br>`;
      else html += `上界／gap 尚未取得${b && b.warning ? '：' + esc(b.warning) : ''}<br>`;
    }
    const t = res.timing || {}, st = res.stats || {};
    if (res.stats) html += `<span class="muted">候選變數 ${st.candidates}、限制列 ${st.rows}、非零係數 ${st.nonzeros}；建模 ${fmtMs(t.buildMs)}，MILP ${fmtMs(t.milpMs)}（上限 ${t.milpLimit}s），LP ${fmtMs(t.lpMs)}${t.lpLimit ? '（上限 ' + t.lpLimit + 's）' : ''}</span>`;
    setStatus(html);
  }
  const fmtMs = (ms) => ms == null ? '—' : (ms < 1000 ? ms.toFixed(0) + ' ms' : (ms / 1000).toFixed(2) + ' s');

  // ---------- GA 實驗分頁（§5.3；Blob worker，內嵌同一份 engine/ga 原始碼） ----------
  const WORKER_MAIN = `
self.onmessage = function (e) {
  var m = e.data; if (!m || m.cmd !== 'run') return;
  try {
    var norm = SGS.engine.normalize(m.data);
    var results = [];
    for (var i = 0; i < m.seeds.length; i++) {
      var seed = m.seeds[i];
      var res = SGS.ga.run(norm, Object.assign({}, m.params, { seed: seed }), { onGeneration: function (info) {
        if (info.gen % m.progressEvery === 0) postMessage({ type: 'progress', runId: m.runId, revision: m.revision, runIndex: i, gen: info.gen, best: info.best, avg: info.avg, bestScore: info.bestScore });
      } });
      var r = { seed: seed, best: res.best, bestGen: res.bestGen, generations: res.generations, stopReason: res.stopReason, history: res.history, elapsedMs: res.elapsedMs, params: res.params };
      results.push(r);
      postMessage({ type: 'run-done', runId: m.runId, revision: m.revision, runIndex: i, result: r });
    }
    postMessage({ type: 'done', runId: m.runId, revision: m.revision, results: results });
  } catch (err) { postMessage({ type: 'error', runId: m.runId, revision: m.revision, error: String(err && err.message || err) }); }
};`;
  let workerUrl = null;
  function makeWorker() {
    if (!workerUrl) {
      const src = (root.SGS_SOURCES && root.SGS_SOURCES.engine) ? root.SGS_SOURCES.engine + '\n' + root.SGS_SOURCES.ga + '\n' + WORKER_MAIN : null;
      if (!src) throw new Error('worker 原始碼未內嵌（需經 build.js）');
      workerUrl = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    }
    return new Worker(workerUrl);
  }

  function readGaParams() {
    const p = {};
    document.querySelectorAll('[data-ga]').forEach((el) => {
      const k = el.dataset.ga;
      if (k === 'encoding' || k === 'directMode') p[k] = el.value;
      else if (k === 'lambda') p[k] = el.value.trim() === '' ? null : Number(el.value);
      else p[k] = Number(el.value);
    });
    return p;
  }
  function writeGaParams(p) {
    document.querySelectorAll('[data-ga]').forEach((el) => { const k = el.dataset.ga; if (p[k] != null) el.value = p[k]; });
  }
  function initGA() {
    $('#btnGaOne').onclick = () => runGA(1);
    $('#btnGaMulti').onclick = () => runGA(Math.max(1, readGaParams().runs | 0));
    $('#btnGaCancel').onclick = () => { cancelGA(); setGaStatus('<span class="badge bad">已取消</span>'); };
    $('#btnGaCsvCurve').onclick = () => download('ga-curves.csv', csvCurves(), 'text/csv');
    $('#btnGaCsvStats').onclick = () => download('ga-stats.csv', csvStats(), 'text/csv');
    $('#btnGaCsvSched').onclick = () => download('ga-schedule.csv', csvSchedule(state.slots.ga), 'text/csv');
    document.querySelectorAll('[data-ga]').forEach((el) => el.addEventListener('change', () => { state.settings.ga = readGaParams(); saveLS(); }));
    if (state.settings.ga) writeGaParams(state.settings.ga);
    window.addEventListener('resize', () => { if (!$('#tab-ga').classList.contains('hidden')) drawGaChart(); });
  }
  function setGaStatus(html) { $('#gaStatus').innerHTML = html; }
  function cancelGA() {
    gateGA.cancel();
    if (state.ga.worker) { try { state.ga.worker.terminate(); } catch (_) {} state.ga.worker = null; }
    state.ga.running = false;
    $('#btnGaOne').disabled = false; $('#btnGaMulti').disabled = false; $('#btnGaCancel').disabled = true;
  }

  // 回傳 Promise<results|null>（null = 取消或過期）
  function runGA(runs) {
    if (!state.norm) return Promise.resolve(null);
    cancelGA();
    const params = readGaParams(); state.settings.ga = params; saveLS();
    const norm = state.norm, data = state.data, revision = state.revision;   // 快照
    const runId = gateGA.begin(revision);
    const seeds = SGS.ga.runSeeds(params.seed >>> 0, runs);
    const progressEvery = Math.max(1, Math.floor((params.generations || 200) / 50));
    state.ga = Object.assign(state.ga, { running: true, results: [], curves: [], summary: null, mode: runs > 1 ? 'multi' : 'single', norm, data, revision, params, seeds, runId });
    $('#btnGaOne').disabled = true; $('#btnGaMulti').disabled = true; $('#btnGaCancel').disabled = false;
    setGaStatus(`<span class="badge run">執行中…</span> 版本 r${revision}，${runs} 次 run，seeds ${seeds[0]}..${seeds[seeds.length - 1]}`);
    $('#gaResult').innerHTML = '<span class="muted">執行中…</span>';
    let worker;
    try { worker = makeWorker(); } catch (err) { cancelGA(); setGaStatus(`<span class="badge bad">無法建立 worker</span> ${esc(err.message)}`); return Promise.resolve(null); }
    state.ga.worker = worker;
    return new Promise((resolve) => {
      worker.onmessage = (e) => {
        const m = e.data;
        if (!gateGA.accepts(m)) return;                                   // 版本閘門：過期／取消的訊息全部丟棄
        if (m.type === 'progress') {
          setGaStatus(`<span class="badge run">執行中…</span> run ${m.runIndex + 1}/${seeds.length}，第 ${m.gen} 代，目前最佳 Z=${m.bestScore.assigned} W=${m.bestScore.totalWait}`);
          return;
        }
        if (m.type === 'run-done') {
          state.ga.results.push(m.result);
          state.ga.curves = state.ga.results.map((r) => r.history);
          drawGaChart();
          return;
        }
        if (m.type === 'error') { cancelGA(); setGaStatus(`<span class="badge bad">GA 錯誤</span> ${esc(m.error)}`); resolve(null); return; }
        if (m.type === 'done') {
          state.ga.worker = null; state.ga.running = false;
          $('#btnGaOne').disabled = false; $('#btnGaMulti').disabled = false; $('#btnGaCancel').disabled = true;
          finishGA(m.results, norm, data, revision);
          resolve(m.results);
        }
      };
      worker.onerror = (err) => { if (!gateGA.accepts({ revision, runId })) return; cancelGA(); setGaStatus(`<span class="badge bad">worker 失敗</span> ${esc(err.message || err)}`); resolve(null); };
      worker.postMessage({ cmd: 'run', data, params, seeds, runId, revision, progressEvery });
    });
  }

  function gaReference() {
    const m = state.slots.milp;
    if (!m || m.revision !== state.revision || !m.feasible) return null;
    return { score: m.score, proven: !!(m.meta && m.meta.label && m.meta.label.kind === 'opt') };
  }
  function finishGA(results, norm, data, revision) {
    state.ga.results = results; state.ga.curves = results.map((r) => r.history);
    const ref = gaReference();
    const summary = SGS.ga.summarize(results, ref);
    state.ga.summary = summary;
    const bestRun = results[summary.bestRunIndex];
    // GA 解槽：所有 run 的最佳可行 phenotype（再過一次 checkFeasible）
    const fe = E.checkFeasible(norm, bestRun.best.schedule);
    if (fe.ok) setSlot('ga', makeSlot(norm, data, bestRun.best.schedule, { source: 'GA', label: { kind: 'feas', text: `GA 最佳（${results.length} run）` }, params: state.ga.params, seed: bestRun.seed, bestGen: bestRun.best.gen }, revision));
    setGaStatus(`<span class="badge opt">完成</span> 版本 r${revision}，${results.length} 次 run`);
    renderGaResult(summary, results, ref);
    drawGaChart();
  }

  function renderGaResult(s, results, ref) {
    const f = (x, d) => (x == null ? 'N/A' : (typeof x === 'number' ? x.toFixed(d == null ? 2 : d) : x));
    let html = `<div class="kv">
      <div>最佳 Z<b>${s.bestZ}</b></div><div>最佳解總等待<b>${s.bestW}</b></div>
      <div>平均 Z<b>${f(s.meanZ)}</b></div><div>Z 樣本標準差<b>${f(s.sdZ, 3)}</b></div>
      <div>平均總等待<b>${f(s.meanW)}</b></div><div>平均世代數<b>${f(s.meanGenerations, 1)}</b></div>
      <div>平均耗時<b>${f(s.meanMs, 0)} ms</b></div>`;
    if (ref) {
      const name = ref.proven ? '命中最佳率' : '命中 MILP incumbent 率';
      html += `<div>${name}（Z*）<b>${s.hitZ}/${s.runs}</b></div><div>${name}（Z*,W*）<b>${s.hitZW}/${s.runs}</b></div>
        <div>平均達最佳世代（命中者）<b>${f(s.meanGenToHit, 1)}</b></div><div>未命中數<b>${s.missZW}</b></div>`;
      html += `</div><p class="muted small">參考：MILP ${ref.proven ? '已證明最佳' : '未證明最佳（incumbent）'} (Z*, W*) = (${ref.score.assigned}, ${ref.score.totalWait})，版本 r${state.revision}。${ref.proven ? '' : '未證明最佳時只報對 incumbent 的差距，不稱最佳命中率。'}</p>`;
    } else html += `</div><p class="muted small">目前版本沒有可比較的 MILP 解（先在「模型」分頁求解），只列 GA 自身統計。</p>`;
    html += `<table class="stats"><thead><tr><th>#</th><th>seed</th><th>Z</th><th>W</th><th>objective</th><th>達最佳世代</th><th>世代數</th><th>停止原因</th><th>ms</th></tr></thead><tbody>` +
      results.map((r, i) => `<tr><td>${i + 1}</td><td>${r.seed}</td><td>${r.best.score.assigned}</td><td>${r.best.score.totalWait}</td><td>${r.best.score.objective.toFixed(4)}</td><td>${r.best.gen}</td><td>${r.generations}</td><td>${esc(r.stopReason)}</td><td>${Math.round(r.elapsedMs)}</td></tr>`).join('') + '</tbody></table>';
    $('#gaResult').innerHTML = html;
  }

  function drawGaChart() {
    const canvas = $('#gaChart'); if (!canvas) return;
    const curves = state.ga.curves || [];
    const dpr = window.devicePixelRatio || 1, cssW = canvas.clientWidth || 600, cssH = 260;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement); const C = (n) => cs.getPropertyValue(n).trim();
    ctx.clearRect(0, 0, cssW, cssH);
    $('#gaCurveTitle').textContent = curves.length ? `（${curves.length} 次 run，每代 best／avg fitness）` : '';
    if (!curves.length) { ctx.fillStyle = C('--muted'); ctx.font = '13px system-ui'; ctx.fillText('尚無資料', 20, 30); return; }
    const L = 48, R = 12, T = 12, B = 28;
    const maxGen = Math.max(...curves.map((h) => h.length));
    let lo = Infinity, hi = -Infinity;
    curves.forEach((h) => h.forEach((p) => { lo = Math.min(lo, p.avg, p.best); hi = Math.max(hi, p.avg, p.best); }));
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; } if (hi - lo < 1e-9) { hi = lo + 1; }
    const x = (g) => L + ((g - 1) / Math.max(1, maxGen - 1)) * (cssW - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (cssH - T - B);
    ctx.strokeStyle = C('--grid'); ctx.lineWidth = 1; ctx.font = '11px system-ui'; ctx.fillStyle = C('--muted');
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(cssW - R, y(v)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(v.toFixed(2), L - 6, y(v) + 4); }
    ctx.textAlign = 'center'; for (let g = 1; g <= maxGen; g += Math.max(1, Math.ceil(maxGen / 8))) ctx.fillText(String(g), x(g), cssH - 10);
    ctx.textAlign = 'left'; ctx.fillText('世代 →', L, cssH - 10 + 0); ctx.textAlign = 'right'; ctx.fillText('fitness', L - 6, T + 4);
    const alpha = curves.length > 1 ? 0.35 : 1;
    curves.forEach((h) => {
      [['avg', C('--muted')], ['best', C('--accent')]].forEach(([k, col]) => {
        ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = k === 'best' ? 1.6 : 1; ctx.beginPath();
        h.forEach((p, i) => { if (i === 0) ctx.moveTo(x(p.gen), y(p[k])); else ctx.lineTo(x(p.gen), y(p[k])); });
        ctx.stroke(); ctx.globalAlpha = 1;
      });
    });
  }

  // CSV（§5.3、C1）
  const csvEsc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function csvCurves() {
    const rows = [['runIndex', 'seed', 'generation', 'best', 'avg', 'bestAssigned', 'bestWait']];
    (state.ga.results || []).forEach((r, i) => r.history.forEach((p) => rows.push([i, r.seed, p.gen, p.best, p.avg, p.bestAssigned, p.bestWait])));
    return rows.map((r) => r.map(csvEsc).join(',')).join('\n') + '\n';
  }
  function csvStats() {
    const s = state.ga.summary; const res = state.ga.results || [];
    const rows = [['runIndex', 'seed', 'assigned', 'totalWait', 'objective', 'bestGen', 'generations', 'stopReason', 'elapsedMs', 'hitZ', 'hitZW', 'dataName', 'revision', 'encoding', 'directMode', 'popSize', 'generationsMax', 'stagnation', 'pc', 'pm', 'tournamentK', 'elite', 'lambda']];
    const p = state.ga.params || {};
    res.forEach((r, i) => rows.push([i, r.seed, r.best.score.assigned, r.best.score.totalWait, r.best.score.objective, r.best.gen, r.generations, r.stopReason, Math.round(r.elapsedMs),
      s && s.reference ? (r.best.score.assigned === s.reference.assigned ? 1 : 0) : '', s && s.reference ? (r.best.score.assigned === s.reference.assigned && r.best.score.totalWait === s.reference.totalWait ? 1 : 0) : '',
      state.ga.data && state.ga.data.meta.name, state.ga.revision, p.encoding, p.directMode, p.popSize, p.generations, p.stagnation, p.pc, p.pm, p.tournamentK, p.elite, r.params ? r.params.lambda : '']));
    if (s) {
      rows.push([]); rows.push(['summary', 'runs', 'bestZ', 'bestW', 'meanZ', 'sdZ', 'meanW', 'sdW', 'meanGenerations', 'meanMs', 'hitZ', 'hitZW', 'hitZRate', 'hitZWRate', 'meanGenToHit', 'missZW', 'refZ', 'refW', 'refProven']);
      rows.push(['summary', s.runs, s.bestZ, s.bestW, s.meanZ, s.sdZ == null ? 'N/A' : s.sdZ, s.meanW, s.sdW == null ? 'N/A' : s.sdW, s.meanGenerations, s.meanMs, s.hitZ == null ? '' : s.hitZ, s.hitZW == null ? '' : s.hitZW, s.hitZRate == null ? '' : s.hitZRate, s.hitZWRate == null ? '' : s.hitZWRate, s.meanGenToHit == null ? 'N/A' : s.meanGenToHit, s.missZW == null ? '' : s.missZW, s.reference ? s.reference.assigned : '', s.reference ? s.reference.totalWait : '', s.reference ? s.reference.proven : '']);
    }
    return rows.map((r) => r.map(csvEsc).join(',')).join('\n') + '\n';
  }
  function csvSchedule(slot) {
    const rows = [['req', 'satellite', 'antenna', 'station', 'band', 'start', 'end', 'startHHMM', 'endHHMM', 'wait']];
    if (slot) slot.schedule.forEach((it) => { const r = slot.norm.reqById.get(it.req), a = slot.norm.antById.get(it.antenna); if (!r || !a) return; rows.push([r.id, r.sat, a.id, a.station, r.band, it.start, it.start + r.durMin, E.minutesToHHMM(slot.norm, it.start), E.minutesToHHMM(slot.norm, it.start + r.durMin), it.start - r.start]); });
    return rows.map((r) => r.map(csvEsc).join(',')).join('\n') + '\n';
  }

  // ---------- 排程分頁 ----------
  function initSched() {
    $('#slotSel').addEventListener('click', (e) => { const b = e.target.closest('button[data-slot]'); if (!b) return; state.activeSlot = b.dataset.slot; saveLS(); renderSched(); });
    $('#btnGanttPng').onclick = () => { $('#gantt').toBlob((blob) => downloadBlob('gantt.png', blob)); };
    window.addEventListener('resize', () => { if (!$('#tab-sched').classList.contains('hidden')) drawGantt(); });
  }

  function renderSched() {
    $('#slotSel').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.slot === state.activeSlot));
    const names = { manual: '手動', milp: 'MILP', ga: 'GA' };
    $('#scoreCards').innerHTML = ['manual', 'milp', 'ga'].map((k) => {
      const s = state.slots[k];
      const stale = s && s.revision !== state.revision;
      if (!s) return `<div class="scard ${k === state.activeSlot ? 'active' : ''}"><div class="t"><span>${names[k]}</span><span>—</span></div><div class="big muted">—</div><div class="sub">尚無解</div></div>`;
      return `<div class="scard ${k === state.activeSlot ? 'active' : ''}"><div class="t"><span>${names[k]}${s.meta && s.meta.label ? ' · ' + esc(s.meta.label.text) : ''}</span><span>r${s.revision}${stale ? ' <span class="stale">（舊版本資料）</span>' : ''}</span></div>
        <div class="big">Z = ${s.score.assigned}</div>
        <div class="sub">總等待 ${s.score.totalWait} 分鐘 · objective ${s.score.objective.toFixed(4)} · ${s.feasible ? '<span style="color:var(--ok)">可行</span>' : '<span style="color:var(--bad)">不可行（' + s.violations.length + ' 條違規）</span>'}</div></div>`;
    }).join('');
    drawGantt();
  }

  // 甘特圖幾何（可觀測，供測試核對）：回傳 {rows:[antennaId], blocks:[{req, antenna, start, end, calibEnd, x, y, w, h}]}
  function ganttLayout(norm, schedule, cssW) {
    const rowH = 44, top = 34, left = 120, right = 20;
    const rows = norm.antennas.map((a) => a.id);
    const plotW = cssW - left - right;
    const x = (t) => left + (t / norm.H) * plotW;
    const blocks = [];
    (schedule || []).forEach((it) => {
      const r = norm.reqById.get(it.req), a = norm.antById.get(it.antenna);
      const ri = a ? rows.indexOf(a.id) : -1;
      if (!r || !a || ri < 0 || !Number.isInteger(it.start)) return;
      const e = it.start + r.durMin;
      blocks.push({ req: r.id, antenna: a.id, sat: r.sat, start: it.start, end: e, calibEnd: Math.min(e + a.calib, norm.H), x: x(it.start), y: top + ri * rowH + 9, w: Math.max(2, x(e) - x(it.start)), h: rowH - 18, cx: x(e), cw: x(Math.min(e + a.calib, norm.H)) - x(e) });
    });
    return { rows, blocks, rowH, top, left, right, plotW, x, height: top + rows.length * rowH + 10 };
  }

  function drawGantt() {
    const canvas = $('#gantt'); if (!canvas) return;
    const slot = state.slots[state.activeSlot];
    const norm = slot ? slot.norm : state.norm;
    const viol = $('#ganttViol');
    if (slot && !slot.feasible) { viol.classList.remove('hidden'); viol.innerHTML = '<b>違規：</b><ul>' + slot.violations.map((v) => `<li>[規則 ${esc(String(v.rule))}] ${esc(v.msg)}</li>`).join('') + '</ul>'; }
    else { viol.classList.add('hidden'); viol.textContent = ''; }
    if (!norm) return;
    const schedule = slot ? slot.schedule : [];
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 1000;
    const L = ganttLayout(norm, schedule, cssW);
    state.lastGantt = { rows: L.rows, blocks: L.blocks.map((b) => ({ req: b.req, antenna: b.antenna, start: b.start, end: b.end, calibEnd: b.calibEnd })) };
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(L.height * dpr); canvas.style.height = L.height + 'px';
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const C = (n) => cs.getPropertyValue(n).trim();
    ctx.clearRect(0, 0, cssW, L.height);
    const satColor = (id) => { const s = norm.satById.get(id); return (s && s.color) || palette(norm.satellites.findIndex((q) => q.id === id)); };
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const step = norm.H <= 60 ? 5 : norm.H <= 240 ? 15 : 60;
    for (let t = 0; t <= norm.H; t += step) {
      ctx.strokeStyle = C('--grid'); ctx.beginPath(); ctx.moveTo(L.x(t), L.top - 6); ctx.lineTo(L.x(t), L.height - 10); ctx.stroke();
      ctx.fillStyle = C('--muted'); ctx.textAlign = 'center'; ctx.fillText(E.minutesToHHMM(norm, t), L.x(t), L.top - 16);
    }
    norm.antennas.forEach((a, i) => {
      const y = L.top + i * L.rowH;
      ctx.fillStyle = C('--panel2'); ctx.fillRect(L.left, y + 6, L.plotW, L.rowH - 12);
      norm.satellites.forEach((s) => {
        E.visSegments(norm, s.id, a.station).forEach(([vs, ve]) => { ctx.fillStyle = withAlpha(satColor(s.id), 0.18); ctx.fillRect(L.x(vs), y + 6, L.x(ve) - L.x(vs), L.rowH - 12); });
      });
      ctx.fillStyle = C('--text'); ctx.textAlign = 'left'; ctx.fillText(`${a.id}  (${a.band}, c=${a.calib})`, 8, y + L.rowH / 2);
    });
    L.blocks.forEach((b) => {
      ctx.fillStyle = C('--calib'); ctx.fillRect(b.cx, b.y + 1, b.cw, b.h - 2);
      ctx.fillStyle = satColor(b.sat); roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(b.req, b.x + b.w / 2, b.y + b.h / 2);
      ctx.font = '11px system-ui, sans-serif';
    });
    if (slot && !slot.feasible) {
      const bad = new Set(slot.violations.flatMap((v) => v.reqs));
      ctx.strokeStyle = C('--bad'); ctx.lineWidth = 2;
      L.blocks.forEach((b) => { if (bad.has(b.req)) { roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.stroke(); } });
      ctx.lineWidth = 1;
    }
    $('#legend').innerHTML = norm.satellites.map((s) => `<span><i class="sw" style="background:${esc(satColor(s.id))}"></i>${esc(s.id)}</span>`).join('') +
      `<span><i class="sw" style="background:${C('--calib')}"></i>校準</span><span><i class="sw" style="background:${withAlpha('#888', .3)}"></i>飛越時窗（淡色 = 該衛星）</span>`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function withAlpha(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(136,136,136,${a})`;
    const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const PAL = ['#4f8ef7', '#f28b5b', '#b48ee0', '#3ccf8e', '#f5b64c', '#e05c8e', '#52c7d8', '#9aa84b'];
  const palette = (i) => PAL[((i % PAL.length) + PAL.length) % PAL.length];

  // ---------- 工具 ----------
  function esc(s) { const str = (s == null) ? '' : (typeof s === 'object' ? E.fmt(s) : String(s)); return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function download(name, text, type) { downloadBlob(name, new Blob([text], { type })); }
  function downloadBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  function renderAll() {
    $('#revInfo').textContent = state.data ? `${state.data.meta.name || ''} · 版本 r${state.revision} · ${state.norm.requests.length} 需求 / ${state.norm.antennas.length} 天線` : '';
    renderSched();
  }

  // ---------- 啟動 ----------
  function boot() {
    initChrome(); initData(); initModel(); initGA(); initSched();
    const saved = loadLS();
    let loaded = false;
    if (saved && saved.data && E.validateData(saved.data).ok) {
      state.settings = Object.assign(state.settings, saved.settings || {});
      state.activeSlot = saved.activeSlot || 'milp';
      if (commit(saved.data, { revision: saved.revision || 1 }).ok) {
        Object.keys(saved.slots || {}).forEach((k) => {
          const s = saved.slots[k]; if (!s || !s.data || !Array.isArray(s.schedule) || !E.validateData(s.data).ok) return;
          try { const norm = E.normalize(s.data); state.slots[k] = makeSlot(norm, s.data, s.schedule, s.meta, s.revision); } catch (_) {}
        });
        loaded = true;
      }
    }
    if (!loaded) commit(clone(root.SGS_DEFAULT_DATA), { revision: 1 });
    state.draft = clone(state.data);
    $('#tmlim').value = state.settings.tmlim;
    renderDataTab(); renderAll();
  }

  // 測試／自動化用 API
  SGS.app = {
    state, gate,
    showTab, loadData, importJSONText, applyDraft, solveMILP, cancelSolve, setSlot, makeSlot, renderSched, ganttLayout,
    runGA, cancelGA, readGaParams, writeGaParams, csvCurves, csvStats, csvSchedule, gaReference,
    getDraft: () => state.draft,
    _setGLPKFactory: (fn) => { destroyGLPK(); glpkFactory = fn; },
    _glpkDebug: () => ({ inst: glpkInst, pending: !!glpkPromise, gen: glpkGen }),
    _warmGLPK: () => initGLPK(),   // 模擬 boot 的閒置初始化（測試用）
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
