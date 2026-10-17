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
    play: { t: 0, playing: false, speed: 1, raf: null, last: null },
    drag: null,
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
    pausePlay();                       // 提交即暫停播放，清 rAF/last（B2）
    cancelDrag();                      // 提交期間的拖曳作廢（B1）
    syncPlay();                        // t 依播放資料來源重新夾住、同步拉桿
    state.draft = clone(state.data);
    saveLS();
    renderAll();
    return v;
  }

  // 所有解槽寫入（MILP／GA／手動）共用：若寫入的是目前選中槽，播放資料來源可能已換 → 先依新 viewNorm() 同步游標（N1）
  function setSlot(name, slot) { state.slots[name] = slot; if (name === state.activeSlot) syncPlay(); saveLS(); renderSched(); }

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
    if (name === 'data' && SGS.app && SGS.app._drawWinEditor) SGS.app._drawWinEditor();
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
      document.querySelectorAll('[data-gen]').forEach((el) => { o[el.dataset.gen] = el.value.trim() === '' ? NaN : Number(el.value); });
      document.querySelectorAll('[data-gen]').forEach((el) => el.classList.remove('invalid'));
      let d;
      try { d = E.generateInstance(o.seed, o); }
      catch (err) { const errs = err.errors || [{ path: '', msg: String(err && err.message) }]; showErrors(errs.map((e) => ({ path: 'generator.' + e.path, msg: e.msg }))); errs.forEach((e) => { const el = document.querySelector(`[data-gen="${e.path}"]`); if (el) el.classList.add('invalid'); }); return; }
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
      if (k === 'horizonMin' && SGS.app && SGS.app._drawWinEditor) SGS.app._drawWinEditor();   // A1：H 改變立即重畫時窗編輯器
      return;
    }
    const p = el.dataset.path; if (!p) return;
    if (el.dataset.moveAntenna != null) return; // 換站在 change 處理
    setByPath(state.draft, p, parseByType(el.dataset.type || 'text', el.value));
    if (/\.(start|end|durMin|sat|station|id)$/.test(p) && SGS.app && SGS.app._drawWinEditor) SGS.app._drawWinEditor();   // A1：影響列標籤／範圍的欄位都重畫
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
    if (SGS.app && SGS.app._drawWinEditor) SGS.app._drawWinEditor();
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
  let workerFactory = null;   // 測試可注入受控 worker
  function makeWorker() {
    if (workerFactory) return workerFactory();
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
      else p[k] = el.value.trim() === '' ? NaN : Number(el.value);
    });
    return p;
  }
  function writeGaParams(p) {
    document.querySelectorAll('[data-ga]').forEach((el) => { const k = el.dataset.ga; if (k in p) el.value = p[k] == null ? '' : p[k]; });
  }
  // B4：執行前驗證；回 { ok, errors:[{path,msg}] }
  function validateGaParams(p) {
    const errors = [];
    const isInt = Number.isInteger;
    if (!['indirect', 'direct'].includes(p.encoding)) errors.push({ path: 'encoding', msg: '編碼必須為 indirect 或 direct' });
    if (!['repair', 'penalty'].includes(p.directMode)) errors.push({ path: 'directMode', msg: '模式必須為 repair 或 penalty' });
    if (!(p.lambda == null || (Number.isFinite(p.lambda) && p.lambda >= 0))) errors.push({ path: 'lambda', msg: 'λ 必須為非負有限數或留空' });
    if (!isInt(p.popSize) || p.popSize < 2) errors.push({ path: 'popSize', msg: '族群必須為 ≥ 2 的整數' });
    if (!isInt(p.generations) || p.generations < 1) errors.push({ path: 'generations', msg: '世代上限必須為 ≥ 1 的整數' });
    if (!isInt(p.stagnation) || p.stagnation < 1) errors.push({ path: 'stagnation', msg: '停滯代數必須為 ≥ 1 的整數' });
    if (!(Number.isFinite(p.pc) && p.pc >= 0 && p.pc <= 1)) errors.push({ path: 'pc', msg: '交叉率必須在 0..1' });
    if (!(Number.isFinite(p.pm) && p.pm >= 0 && p.pm <= 1)) errors.push({ path: 'pm', msg: '突變率必須在 0..1' });
    if (!isInt(p.tournamentK) || p.tournamentK < 1) errors.push({ path: 'tournamentK', msg: '錦標賽 k 必須為 ≥ 1 的整數' });
    if (!isInt(p.elite) || p.elite < 0 || (isInt(p.popSize) && p.elite > p.popSize - 1)) errors.push({ path: 'elite', msg: '菁英數必須為 0..族群−1 的整數' });
    if (!isInt(p.seed) || p.seed < 0 || p.seed > 0xFFFFFFFF) errors.push({ path: 'seed', msg: 'seed 必須為 0..4294967295 的整數' });
    if (!isInt(p.runs) || p.runs < 1) errors.push({ path: 'runs', msg: 'run 次數必須為 ≥ 1 的整數' });
    return { ok: errors.length === 0, errors };
  }
  function markGaErrors(errors) {
    document.querySelectorAll('[data-ga]').forEach((el) => el.classList.remove('invalid'));
    (errors || []).forEach((e) => { const el = document.querySelector(`[data-ga="${e.path}"]`); if (el) el.classList.add('invalid'); });
  }
  function initGA() {
    $('#btnGaOne').onclick = () => runGA(1);
    $('#btnGaMulti').onclick = () => runGA(readGaParams().runs);
    $('#btnGaCancel').onclick = () => { cancelGA(); setGaStatus('<span class="badge bad">已取消</span>'); };
    $('#btnGaCsvCurve').onclick = () => download('ga-curves.csv', csvCurves(), 'text/csv');
    $('#btnGaCsvStats').onclick = () => download('ga-stats.csv', csvStats(), 'text/csv');
    $('#btnGaCsvSched').onclick = () => download('ga-schedule.csv', csvSchedule(state.slots.ga), 'text/csv');
    document.querySelectorAll('[data-ga]').forEach((el) => el.addEventListener('change', () => { state.settings.ga = readGaParams(); saveLS(); }));
    if (state.settings.ga) writeGaParams(state.settings.ga);
    window.addEventListener('resize', () => { if (!$('#tab-ga').classList.contains('hidden')) drawGaChart(); });
  }
  function setGaStatus(html) { $('#gaStatus').innerHTML = html; }

  // ---- B1：每個 run 一個生命週期物件；結案只執行一次（取消／過期／錯誤 → null；成功 → results）
  function settleRun(run, value) {
    if (!run || run.settled) return;
    run.settled = true;
    if (run.worker) { try { run.worker.onmessage = null; run.worker.onerror = null; run.worker.terminate(); } catch (_) {} run.worker = null; }
    if (state.ga.run === run) { state.ga.run = null; state.ga.worker = null; state.ga.running = false; }
    $('#btnGaOne').disabled = false; $('#btnGaMulti').disabled = false; $('#btnGaCancel').disabled = true;
    run.resolve(value);
  }
  function cancelGA() {
    gateGA.cancel();
    if (state.ga.run) settleRun(state.ga.run, null);
    state.ga.running = false; state.ga.worker = null;
    $('#btnGaOne').disabled = false; $('#btnGaMulti').disabled = false; $('#btnGaCancel').disabled = true;
  }

  // 回傳 Promise<results|null>（null = 取消、過期或錯誤）
  function runGA(runs) {
    if (!state.norm) return Promise.resolve(null);
    cancelGA();
    const input = readGaParams(); input.runs = runs;
    const v = validateGaParams(input);
    markGaErrors(v.errors);
    if (!v.ok) { setGaStatus('<span class="badge bad">參數錯誤</span> ' + v.errors.map((e) => esc(e.path + '：' + e.msg)).join('；')); return Promise.resolve(null); }
    const norm = state.norm, data = state.data, revision = state.revision;   // 快照
    const effective = Object.freeze(Object.assign({}, SGS.ga.resolveParams(norm, input), { runs, lambdaMode: input.lambda == null ? 'auto' : 'manual' }));   // 本批有效參數快照（auto λ 依當次 norm 重算）
    state.settings.ga = Object.assign({}, input); saveLS();   // 使用者設定（λ 留空 = auto）與每批 effective 分開保存，不回寫控制項
    const runId = gateGA.begin(revision);
    const seeds = SGS.ga.runSeeds(effective.seed, runs);
    const progressEvery = Math.max(1, Math.floor(effective.generations / 50));
    const lambdaWarn = effective.encoding === 'direct' && effective.directMode === 'penalty' && effective.lambdaMode === 'manual' && effective.lambda < norm.requests.length + 1;
    let worker;
    try { worker = makeWorker(); } catch (err) { setGaStatus(`<span class="badge bad">無法建立 worker</span> ${esc(err.message)}`); return Promise.resolve(null); }
    let resolveFn;
    const promise = new Promise((resolve) => { resolveFn = resolve; });
    const run = { runId, revision, worker, resolve: resolveFn, settled: false, params: effective, seeds, norm, data };
    state.ga = Object.assign(state.ga, { running: true, worker, run, results: [], curves: [], summary: null, mode: runs > 1 ? 'multi' : 'single', norm, data, revision, params: effective, seeds, runId, lambdaWarn });
    $('#btnGaOne').disabled = true; $('#btnGaMulti').disabled = true; $('#btnGaCancel').disabled = false;
    setGaStatus(`<span class="badge run">執行中…</span> 版本 r${revision}，${runs} 次 run，seeds ${seeds[0]}..${seeds[seeds.length - 1]}${lambdaWarn ? ' <span style="color:var(--warn)">λ 低於 |R|+1，不再保證可行解優先</span>' : ''}`);
    $('#gaResult').innerHTML = '<span class="muted">執行中…</span>';
    worker.onmessage = (e) => {
      const m = e.data;
      if (run.settled || !gateGA.accepts(m) || m.runId !== runId) return;      // 版本閘門：過期／取消／非本 run 的訊息全部丟棄
      if (m.type === 'progress') { setGaStatus(`<span class="badge run">執行中…</span> run ${m.runIndex + 1}/${seeds.length}，第 ${m.gen} 代，目前最佳 Z=${m.bestScore.assigned} W=${m.bestScore.totalWait}`); return; }
      if (m.type === 'run-done') { state.ga.results.push(m.result); state.ga.curves = state.ga.results.map((r) => r.history); drawGaChart(); return; }
      if (m.type === 'error') { setGaStatus(`<span class="badge bad">GA 錯誤</span> ${esc(m.error)}`); gateGA.cancel(); settleRun(run, null); return; }
      if (m.type === 'done') {
        try { finishGA(m.results, run); settleRun(run, m.results); }
        catch (err) { setGaStatus(`<span class="badge bad">結果處理失敗</span> ${esc(err && err.message)}`); gateGA.cancel(); settleRun(run, null); }
      }
    };
    worker.onerror = (err) => { if (run.settled || !gateGA.accepts({ revision, runId })) return; setGaStatus(`<span class="badge bad">worker 失敗</span> ${esc(err && (err.message || err))}`); gateGA.cancel(); settleRun(run, null); };
    worker.postMessage({ cmd: 'run', data, params: effective, seeds, runId, revision, progressEvery });
    return promise;
  }

  function gaReference() {
    const m = state.slots.milp;
    if (!m || m.revision !== state.revision || !m.feasible) return null;
    return { score: m.score, proven: !!(m.meta && m.meta.label && m.meta.label.kind === 'opt') };
  }
  function finishGA(results, run) {
    const { norm, data, revision } = run;
    state.ga.results = results; state.ga.curves = results.map((r) => r.history);
    const ref = gaReference();
    const summary = SGS.ga.summarize(results, ref);
    state.ga.summary = summary;
    const bestRun = results[summary.bestRunIndex];
    const fe = E.checkFeasible(norm, bestRun.best.schedule);
    if (fe.ok) setSlot('ga', makeSlot(norm, data, bestRun.best.schedule, { source: 'GA', label: { kind: 'feas', text: `GA 最佳（${results.length} run）` }, params: run.params, runId: run.runId, seed: bestRun.seed, bestGen: bestRun.best.gen }, revision));
    setGaStatus(`<span class="badge opt">完成</span> 版本 r${revision}，${results.length} 次 run，runId ${esc(run.runId)}${state.ga.lambdaWarn ? ' <span style="color:var(--warn)">λ 低於 |R|+1，不再保證可行解優先</span>' : ''}`);
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
      const gapTxt = s.gapZ === 0 ? '相等' : (s.gapZ < 0 ? `GA 多 ${-s.gapZ} 個任務` : `GA 少 ${s.gapZ} 個任務`);
      html += `<div>任務數差距 gapZ = Z* − Z_GA<b>${s.gapZ}</b><span class="muted small">${gapTxt}（負值 = GA 任務數較多）</span></div>`;
      html += `</div><p class="muted small">參考：MILP ${ref.proven ? '已證明最佳' : '未證明最佳（incumbent）'} (Z*, W*) = (${ref.score.assigned}, ${ref.score.totalWait})，版本 r${state.revision}。${ref.proven ? '' : '未證明最佳時只報對 incumbent 的差距，不稱最佳命中率，差距不代表最優性。'}</p>`;
    } else html += `</div><p class="muted small">目前版本沒有可比較的 MILP 解（先在「模型」分頁求解），只列 GA 自身統計。</p>`;
    const p = state.ga.params || {};
    html += `<p class="muted small">本批有效參數（runId ${esc(state.ga.runId)}）：${esc(p.encoding)}${p.encoding === 'direct' ? '/' + esc(p.directMode) + '，λ=' + p.lambda + (p.lambdaMode === 'auto' ? '（auto = |R|+1）' : '（手動）') : ''}，N=${p.popSize}，G=${p.generations}，S=${p.stagnation}，pc=${p.pc}，pm=${p.pm}，k=${p.tournamentK}，e=${p.elite}，seed=${p.seed}</p>`;
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
    // 繪圖範圍依 history 實際 gen 值：minGen=0、maxGen=各曲線最後世代的最大值（與 history／CSV 同一編號）
    const minGen = 0, maxGen = Math.max(0, ...curves.map((h) => (h.length ? h[h.length - 1].gen : 0)));
    let lo = Infinity, hi = -Infinity;
    curves.forEach((h) => h.forEach((p) => { lo = Math.min(lo, p.avg, p.best); hi = Math.max(hi, p.avg, p.best); }));
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; } if (hi - lo < 1e-9) { hi = lo + 1; }
    const span = Math.max(1, maxGen - minGen);
    const x = (g) => L + ((g - minGen) / span) * (cssW - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (cssH - T - B);
    const tickStep = Math.max(1, Math.ceil(span / 8));
    const ticks = []; for (let g = minGen; g <= maxGen; g += tickStep) ticks.push(g); if (ticks[ticks.length - 1] !== maxGen) ticks.push(maxGen);
    state.lastGaChart = { minGen, maxGen, ticks: ticks.map((g) => ({ gen: g, x: x(g) })), points: curves.map((h) => h.map((p) => ({ gen: p.gen, x: x(p.gen) }))), plotLeft: L, plotRight: cssW - R };
    ctx.strokeStyle = C('--grid'); ctx.lineWidth = 1; ctx.font = '11px system-ui'; ctx.fillStyle = C('--muted');
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(cssW - R, y(v)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(v.toFixed(2), L - 6, y(v) + 4); }
    ctx.textAlign = 'center'; ticks.forEach((g) => ctx.fillText(String(g), x(g), cssH - 10));
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
    const rows = [['runId', 'runIndex', 'seed', 'generation', 'best', 'avg', 'bestAssigned', 'bestWait']];
    (state.ga.results || []).forEach((r, i) => r.history.forEach((p) => rows.push([state.ga.runId, i, r.seed, p.gen, p.best, p.avg, p.bestAssigned, p.bestWait])));
    return rows.map((r) => r.map(csvEsc).join(',')).join('\n') + '\n';
  }
  function csvStats() {
    const s = state.ga.summary; const res = state.ga.results || [];
    const rows = [['runId', 'runIndex', 'seed', 'assigned', 'totalWait', 'objective', 'bestGen', 'generations', 'stopReason', 'elapsedMs', 'hitZ', 'hitZW', 'dataName', 'revision', 'encoding', 'directMode', 'popSize', 'generationsMax', 'stagnation', 'pc', 'pm', 'tournamentK', 'elite', 'lambda']];
    const p = state.ga.params || {};
    res.forEach((r, i) => rows.push([state.ga.runId, i, r.seed, r.best.score.assigned, r.best.score.totalWait, r.best.score.objective, r.best.gen, r.generations, r.stopReason, Math.round(r.elapsedMs),
      s && s.reference ? (r.best.score.assigned === s.reference.assigned ? 1 : 0) : '', s && s.reference ? (r.best.score.assigned === s.reference.assigned && r.best.score.totalWait === s.reference.totalWait ? 1 : 0) : '',
      state.ga.data && state.ga.data.meta.name, state.ga.revision, p.encoding, p.directMode, p.popSize, p.generations, p.stagnation, p.pc, p.pm, p.tournamentK, p.elite, r.params ? r.params.lambda : '']));
    if (s) {
      rows.push([]); rows.push(['summary', 'runId', 'runs', 'bestZ', 'bestW', 'meanZ', 'sdZ', 'meanW', 'sdW', 'meanGenerations', 'meanMs', 'hitZ', 'hitZW', 'hitZRate', 'hitZWRate', 'meanGenToHit', 'missZW', 'refZ', 'refW', 'refProven', 'gapZ']);
      rows.push(['summary', state.ga.runId, s.runs, s.bestZ, s.bestW, s.meanZ, s.sdZ == null ? 'N/A' : s.sdZ, s.meanW, s.sdW == null ? 'N/A' : s.sdW, s.meanGenerations, s.meanMs, s.hitZ == null ? '' : s.hitZ, s.hitZW == null ? '' : s.hitZW, s.hitZRate == null ? '' : s.hitZRate, s.hitZWRate == null ? '' : s.hitZWRate, s.meanGenToHit == null ? 'N/A' : s.meanGenToHit, s.missZW == null ? '' : s.missZW, s.reference ? s.reference.assigned : '', s.reference ? s.reference.totalWait : '', s.reference ? s.reference.proven : '', s.gapZ == null ? '' : s.gapZ]);
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
    $('#slotSel').addEventListener('click', (e) => { const b = e.target.closest('button[data-slot]'); if (!b) return; state.activeSlot = b.dataset.slot; cancelDrag(); saveLS(); syncPlay(); renderSched(); });
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
    drawGantt(); drawAnim();
    const vn = viewNorm();
    $('#playTime').textContent = vn ? E.minutesToHHMM(vn, Math.floor(state.play.t)) : '';
    const hint = $('#ganttHint');
    if (hint) { const stale = isViewStale(); hint.classList.toggle('hidden', !stale); hint.textContent = stale ? '此解槽屬於舊版本資料，無法拖曳；請切換到目前版本的解槽，或重新求解。' : ''; }
  }

  // 播放／甘特／動畫共用的資料來源：選中的解槽之 norm；沒有解槽時用目前資料（B2）
  function viewNorm() { const slot = state.slots[state.activeSlot]; return slot ? slot.norm : state.norm; }
  function isViewStale() { const slot = state.slots[state.activeSlot]; return !!(slot && slot.revision !== state.revision); }
  function syncPlay() {
    const vn = viewNorm(); const H = vn ? vn.H : 100;
    state.play.t = Math.max(0, Math.min(H, state.play.t));
    const scrub = $('#playScrub'); if (scrub) scrub.value = (state.play.t / H * 100).toFixed(1);
    const lab = $('#playTime'); if (lab) lab.textContent = vn ? E.minutesToHHMM(vn, Math.floor(state.play.t)) : '';
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
    state.lastGanttLayout = L;
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
      const dragging = state.drag && state.drag.kind === 'block' && state.drag.req === b.req;
      ctx.globalAlpha = dragging ? 0.35 : 1;
      ctx.fillStyle = C('--calib'); ctx.fillRect(b.cx, b.y + 1, b.cw, b.h - 2);
      ctx.fillStyle = satColor(b.sat); roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill();
      ctx.globalAlpha = 1;
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
    // 拖曳中的 ghost
    if (state.drag && state.drag.ghost) {
      const g = state.drag.ghost;
      const r = norm.reqById.get(g.req);
      if (r) {
        const ri = L.rows.indexOf(g.antenna);
        const y = ri >= 0 ? L.top + ri * L.rowH + 9 : (state.drag.lastY - (L.rowH - 18) / 2);
        ctx.globalAlpha = 0.8; ctx.fillStyle = satColor(r.sat);
        roundRect(ctx, L.x(g.start), y, Math.max(2, L.x(g.start + r.durMin) - L.x(g.start)), L.rowH - 18, 4); ctx.fill();
        ctx.strokeStyle = g.ok ? C('--ok') : C('--bad'); ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
        ctx.fillStyle = C('--text'); ctx.textAlign = 'left'; ctx.fillText(`${r.id} → ${g.antenna || '?'} @ ${E.minutesToHHMM(norm, g.start)}`, L.x(g.start), y - 6);
      }
    }
    // 時間游標（與動畫同步）
    const t = state.play.t;
    if (t >= 0 && t <= norm.H) {
      ctx.strokeStyle = C('--warn'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L.x(t), L.top - 6); ctx.lineTo(L.x(t), L.height - 10); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = C('--warn'); ctx.textAlign = 'center'; ctx.fillText(E.minutesToHHMM(norm, Math.floor(t)), L.x(t), L.top - 28);
    }
    $('#legend').innerHTML = norm.satellites.map((s) => `<span><i class="sw" style="background:${esc(satColor(s.id))}"></i>${esc(s.id)}</span>`).join('') +
      `<span><i class="sw" style="background:${C('--calib')}"></i>校準</span><span><i class="sw" style="background:${withAlpha('#888', .3)}"></i>飛越時窗（淡色 = 該衛星）</span><span><i class="sw" style="background:${C('--warn')}"></i>時間游標</span>`;
    renderTray(norm, schedule);
  }

  // ---------- 托盤（未排入需求） ----------
  function renderTray(norm, schedule) {
    const assigned = new Set((schedule || []).map((it) => it.req));
    const chips = norm.requests.filter((r) => !assigned.has(r.id));
    $('#trayChips').innerHTML = chips.length ? chips.map((r) => `<span class="chip" data-chip="${esc(r.id)}" style="background:${esc((norm.satById.get(r.sat) || {}).color || '#888')}">${esc(r.id)} · ${esc(r.band)} · ${r.durMin}m</span>`).join('') : '<span class="muted small">（全部已排入）</span>';
  }

  // ---------- 甘特圖拖曳（§6）：操作一律落在「手動」解槽 ----------
  // 手動解槽的基底排程（ghost 可行性檢查與 ensureManual 共用同一定義，B1）
  function manualBase() {
    const cur = state.slots[state.activeSlot];
    if (cur && cur.revision === state.revision) return cur.schedule;
    if (state.slots.manual && state.slots.manual.revision === state.revision) return state.slots.manual.schedule;
    return [];
  }
  function ensureManual() {
    if (state.activeSlot === 'manual' && state.slots.manual && state.slots.manual.revision === state.revision) return state.slots.manual;
    const slot = makeSlot(state.norm, state.data, clone(manualBase()), { source: 'manual', label: { kind: 'feas', text: '手動' }, basedOn: state.activeSlot }, state.revision);
    state.slots.manual = slot; state.activeSlot = 'manual'; syncPlay();
    return slot;
  }
  function setManualTask(req, antenna, start) {
    const slot = ensureManual();
    const sched = slot.schedule.filter((it) => it.req !== req);
    if (antenna != null) sched.push({ req, antenna, start });
    setSlot('manual', makeSlot(state.norm, state.data, sched, { source: 'manual', label: { kind: 'feas', text: '手動' } }, state.revision));
    return state.slots.manual;
  }
  function ganttPointToSlot(L, px, py, H) {
    const ri = Math.floor((py - L.top) / L.rowH);
    const antenna = ri >= 0 && ri < L.rows.length ? L.rows[ri] : null;
    const t = Math.round(((px - L.left) / L.plotW) * H);
    return { antenna, t, inRows: antenna != null && px >= L.left && px <= L.left + L.plotW };
  }
  function initGanttDrag() {
    const canvas = $('#gantt');
    const tray = $('#ganttTray');
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    // 拖曳只允許在「目前版本」上進行：選中解槽為舊版本時拒絕（B1）
    const canDrag = () => !!state.norm && !isViewStale();
    const startDrag = (kind, req, offsetT, e) => {
      if (!canDrag() || !state.norm.reqById.has(req)) { state.dragRefused = { kind, req, reason: isViewStale() ? 'stale-slot' : 'unknown-request' }; renderSched(); return; }
      state.dragRefused = null;
      state.drag = { kind, req, offsetT, ghost: null, lastY: 0, revision: state.revision };   // 記住起始版本
      canvas.classList.add('dragging');
      moveDrag(e);
    };
    const moveDrag = (e) => {
      const d = state.drag; if (!d) return;
      if (d.revision !== state.revision || !state.norm) { cancelDrag(); return; }   // 版本已變 → 拖曳作廢
      const L = state.lastGanttLayout; if (!L) return;
      const p = pos(e); d.lastY = p.y;
      const r = state.norm.reqById.get(d.req);
      if (!r) { cancelDrag(); return; }
      const { antenna, t } = ganttPointToSlot(L, p.x, p.y, state.norm.H);
      const start = Math.max(0, Math.min(state.norm.H - r.durMin, t - d.offsetT));
      const overTray = e.target === tray || tray.contains(e.target);
      tray.classList.toggle('over', overTray);
      if (overTray || !antenna) { d.ghost = null; drawGantt(); return; }
      const base = manualBase().filter((it) => it.req !== d.req);   // 與 ensureManual 同一基底
      const ok = E.checkFeasible(state.norm, base.concat([{ req: d.req, antenna, start }])).ok;
      d.ghost = { req: d.req, antenna, start, ok };
      drawGantt();
    };
    const endDrag = (e) => {
      const d = state.drag; if (!d) return;
      if (d.revision !== state.revision || !state.norm || !state.norm.reqById.has(d.req)) { cancelDrag(); return; }
      const overTray = e && (e.target === tray || tray.contains(e.target));
      state.drag = null; canvas.classList.remove('dragging'); tray.classList.remove('over');
      if (overTray) { setManualTask(d.req, null, null); return; }
      if (d.ghost) setManualTask(d.ghost.req, d.ghost.antenna, d.ghost.start); else drawGantt();
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!state.lastGanttLayout) return;
      const p = pos(e);
      const hits = state.lastGanttLayout.blocks.filter((bl) => p.x >= bl.x && p.x <= bl.x + bl.w && p.y >= bl.y && p.y <= bl.y + bl.h);
      const b = hits[hits.length - 1];   // 重疊時取最後繪製（最上層）的區塊
      if (!b) return;
      e.preventDefault();
      const vn = viewNorm();
      const tAt = ((p.x - state.lastGanttLayout.left) / state.lastGanttLayout.plotW) * vn.H;
      startDrag('block', b.req, Math.round(tAt - b.start), e);
    });
    $('#trayChips').addEventListener('pointerdown', (e) => {
      const c = e.target.closest('[data-chip]'); if (!c) return;
      e.preventDefault();
      startDrag('chip', c.dataset.chip, 0, e);
    });
    window.addEventListener('pointermove', (e) => { if (state.drag) moveDrag(e); });
    window.addEventListener('pointerup', (e) => { if (state.drag) endDrag(e); });
    window.addEventListener('pointercancel', () => { if (state.drag) cancelDrag(); });
  }
  // 放棄進行中的拖曳：不寫入任何解槽、清 ghost 與樣式（commit / pointercancel / 版本變更時呼叫）
  function cancelDrag() {
    if (!state.drag) return;
    state.drag = null;
    const canvas = $('#gantt'), tray = $('#ganttTray');
    if (canvas) canvas.classList.remove('dragging');
    if (tray) tray.classList.remove('over');
    drawGantt();
  }

  // ---------- 播放控制 + 動畫（§6） ----------
  let animFit = null, animFitKey = null;
  function getFit(norm) {
    if (animFit && animFitKey === norm) return animFit;
    animFit = SGS.anim.fitAll(norm); animFitKey = norm; return animFit;
  }
  function initPlayback() {
    $('#btnPlay').onclick = () => (state.play.playing ? pausePlay() : startPlay());
    $('#playSpeed').onchange = () => { state.play.speed = Number($('#playSpeed').value) || 1; };
    $('#playScrub').oninput = () => { const vn = viewNorm(); const H = vn ? vn.H : 100; setTime(Number($('#playScrub').value) / 100 * H); };
    $('#showResidual').onchange = () => drawAnim();
    $('#btnAnimPng').onclick = () => { $('#anim').toBlob((blob) => downloadBlob('animation-frame.png', blob)); };
    window.addEventListener('resize', () => { if (!$('#tab-sched').classList.contains('hidden')) drawAnim(); });
  }
  function setTime(t) {
    const vn = viewNorm(); const H = vn ? vn.H : 100;
    state.play.t = Math.max(0, Math.min(H, t));
    syncPlay();
    drawGantt(); drawAnim();
  }
  function startPlay() {
    state.play.playing = true; state.play.last = null; $('#btnPlay').textContent = '❚❚ 暫停';
    const step = (ts) => {
      if (!state.play.playing) return;
      if (state.play.last != null) {
        const dt = (ts - state.play.last) / 1000;             // 秒
        let t = state.play.t + dt * state.play.speed;        // 1× = 每秒 1 分鐘
        const vn = viewNorm(); const H = vn ? vn.H : 100;
        if (t > H) t = 0;                                     // 循環（以播放資料來源的 H 為準）
        setTime(t);
      }
      state.play.last = ts;
      state.play.raf = requestAnimationFrame(step);
    };
    state.play.raf = requestAnimationFrame(step);
  }
  function pausePlay() { state.play.playing = false; if (state.play.raf) cancelAnimationFrame(state.play.raf); state.play.raf = null; state.play.last = null; const b = $('#btnPlay'); if (b) b.textContent = '▶ 播放'; }
  function drawAnim() {
    const canvas = $('#anim'); if (!canvas) return;
    const slot = state.slots[state.activeSlot];
    const norm = slot ? slot.norm : state.norm; if (!norm) return;
    const dpr = window.devicePixelRatio || 1, cssW = canvas.clientWidth || 500, cssH = 420;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement); const C = (n) => cs.getPropertyValue(n).trim();
    const theme = { bg: C('--bg'), panel: C('--panel'), text: C('--text'), muted: C('--muted'), line: C('--line'), accent: C('--accent'), calib: C('--calib') };
    const satColor = (id) => { const s = norm.satById.get(id); return (s && s.color) || palette(norm.satellites.findIndex((q) => q.id === id)); };
    const fit = getFit(norm);
    state.lastAnim = SGS.anim.drawFrame(ctx, norm, slot ? slot.schedule : [], state.play.t, fit, { w: cssW, h: cssH, theme, satColor, showResidual: $('#showResidual').checked });
    state.lastAnim.t = state.play.t; state.lastAnim.fit = { omega: fit.omega, phis: Object.fromEntries(Array.from(fit.sats.entries()).map(([k, v]) => [k, v.phi])), residuals: Object.fromEntries(Array.from(fit.sats.entries()).map(([k, v]) => [k, v.residual])) };
  }

  // ---------- 時窗時間軸編輯（資料分頁，拖曳改 start/end；改 draft，需套用） ----------
  function initWinEditor() {
    const canvas = $('#winEditor');
    let drag = null;
    const layoutRows = () => {
      const d = state.draft; if (!d) return null;
      const rows = [];
      (d.visibility || []).forEach((v, i) => rows.push({ kind: 'visibility', index: i, label: `${v.sat} @ ${v.station}`, start: v.start, end: v.end, color: (d.satellites.find((s) => s.id === v.sat) || {}).color || '#888' }));
      (d.requests || []).forEach((r, i) => rows.push({ kind: 'requests', index: i, label: `${r.id} (${r.sat}, ${r.band}, ${r.durMin}m)`, start: r.start, end: r.end, color: (d.satellites.find((s) => s.id === r.sat) || {}).color || '#888', hatched: true }));
      const H = Number.isInteger(d.meta.horizonMin) && d.meta.horizonMin > 0 ? d.meta.horizonMin : 1;
      return { rows, H };
    };
    const geom = (cssW) => ({ left: 170, right: 16, top: 24, rowH: 22 });
    function draw() {
      const Lr = layoutRows(); if (!Lr) return;
      const dpr = window.devicePixelRatio || 1, cssW = canvas.clientWidth || 800;
      const G = geom(cssW); const cssH = G.top + Lr.rows.length * G.rowH + 8;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); canvas.style.height = cssH + 'px';
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      const cs = getComputedStyle(document.documentElement); const C = (n) => cs.getPropertyValue(n).trim();
      ctx.clearRect(0, 0, cssW, cssH);
      const plotW = cssW - G.left - G.right, x = (t) => G.left + (t / Lr.H) * plotW;
      ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
      const step = Lr.H <= 60 ? 5 : Lr.H <= 240 ? 15 : 60;
      for (let t = 0; t <= Lr.H; t += step) { ctx.strokeStyle = C('--grid'); ctx.beginPath(); ctx.moveTo(x(t), G.top - 4); ctx.lineTo(x(t), cssH - 8); ctx.stroke(); ctx.fillStyle = C('--muted'); ctx.textAlign = 'center'; ctx.fillText(String(t), x(t), 10); }
      Lr.rows.forEach((r, i) => {
        const y = G.top + i * G.rowH;
        ctx.fillStyle = C('--text'); ctx.textAlign = 'left'; ctx.fillText(r.label, 6, y + G.rowH / 2);
        if (!Number.isInteger(r.start) || !Number.isInteger(r.end)) return;
        const bx = x(Math.max(0, r.start)), bw = Math.max(2, x(Math.min(Lr.H, r.end)) - bx);
        ctx.fillStyle = r.hatched ? withAlpha(r.color, 0.45) : withAlpha(r.color, 0.8);
        ctx.fillRect(bx, y + 4, bw, G.rowH - 8);
        ctx.fillStyle = C('--text'); ctx.fillRect(bx, y + 4, 3, G.rowH - 8); ctx.fillRect(bx + bw - 3, y + 4, 3, G.rowH - 8);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '10px system-ui, sans-serif'; ctx.fillText(`${r.start}–${r.end}`, bx + bw / 2, y + G.rowH / 2); ctx.font = '11px system-ui, sans-serif';
      });
      state.lastWinEditor = { rows: Lr.rows.map((r) => ({ kind: r.kind, index: r.index, start: r.start, end: r.end })), H: Lr.H, left: G.left, plotW, top: G.top, rowH: G.rowH };
    }
    const hit = (px, py) => {
      const W = state.lastWinEditor; if (!W) return null;
      const i = Math.floor((py - W.top) / W.rowH); if (i < 0 || i >= W.rows.length) return null;
      const r = W.rows[i]; const x = (t) => W.left + (t / W.H) * W.plotW;
      const bx = x(r.start), ex = x(r.end);
      if (Math.abs(px - bx) <= 6) return { row: r, part: 'start' };
      if (Math.abs(px - ex) <= 6) return { row: r, part: 'end' };
      if (px > bx && px < ex) return { row: r, part: 'move' };
      return null;
    };
    const toT = (px) => { const W = state.lastWinEditor; return Math.round(((px - W.left) / W.plotW) * W.H); };
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
      if (!drag) { const h = hit(px, py); canvas.style.cursor = h ? (h.part === 'move' ? 'grab' : 'ew-resize') : 'default'; return; }
      const W = state.lastWinEditor; const item = state.draft[drag.row.kind][drag.row.index]; if (!item) return;
      const t = toT(px);
      if (drag.part === 'start') item.start = Math.max(0, Math.min(item.end - 1, t));
      else if (drag.part === 'end') item.end = Math.max(item.start + 1, Math.min(W.H, t));
      else { const len = drag.len; let ns = Math.max(0, Math.min(W.H - len, t - drag.offset)); item.start = ns; item.end = ns + len; }
      draw();
    });
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
      const h = hit(px, py); if (!h) return;
      e.preventDefault();
      drag = { row: h.row, part: h.part, len: h.row.end - h.row.start, offset: toT(px) - h.row.start };
      canvas.setPointerCapture(e.pointerId);
    });
    const end = () => { if (!drag) return; drag = null; renderDataTab(); draw(); };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => { if (!$('#tab-data').classList.contains('hidden')) draw(); });
    SGS.app._drawWinEditor = draw;
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
    initChrome(); initData(); initModel(); initGA(); initSched(); initGanttDrag(); initPlayback(); initWinEditor();
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
        syncPlay();
        loaded = true;
      }
    }
    if (!loaded) commit(clone(root.SGS_DEFAULT_DATA), { revision: 1 });
    state.draft = clone(state.data);
    $('#tmlim').value = state.settings.tmlim;
    if (state.settings.ga && Object.keys(state.settings.ga).length) writeGaParams(state.settings.ga);   // A2：重開頁面回填已保存的 GA 參數（λ null → 空白）
    renderDataTab(); renderAll();
  }

  // 測試／自動化用 API
  SGS.app = {
    state, gate,
    showTab, loadData, importJSONText, applyDraft, solveMILP, cancelSolve, setSlot, makeSlot, renderSched, ganttLayout,
    runGA, cancelGA, readGaParams, writeGaParams, validateGaParams, csvCurves, csvStats, csvSchedule, gaReference,
    _setWorkerFactory: (fn) => { workerFactory = fn; },
    setTime, startPlay, pausePlay, setManualTask, ensureManual, manualBase, viewNorm, isViewStale, cancelDrag, drawAnim, getFit,
    getDraft: () => state.draft,
    _setGLPKFactory: (fn) => { destroyGLPK(); glpkFactory = fn; },
    _glpkDebug: () => ({ inst: glpkInst, pending: !!glpkPromise, gen: glpkGen }),
    _warmGLPK: () => initGLPK(),   // 模擬 boot 的閒置初始化（測試用）
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
