// ui.js — 分頁、主題、資料編輯、MILP 求解面板、解槽評分卡、唯讀甘特圖、localStorage（S1 範圍）
(function (root) {
  'use strict';
  const SGS = (root.SGS = root.SGS || {});
  const E = SGS.engine, M = SGS.milp;
  const $ = (sel) => document.querySelector(sel);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const LS_KEY = 'sgs.state.v1';

  // ---------- 狀態 ----------
  const state = {
    draft: null,                       // 編輯中的資料（未驗證）
    data: null, norm: null, revision: 0, // 已提交（通過驗證）的版本
    slots: { manual: null, milp: null, ga: null }, // {schedule, score, feasible, violations, revision, norm, meta}
    activeSlot: 'milp',
    settings: { tmlim: 30 },
    solving: false,
  };
  const gate = M.createGate();
  let glpk = null;

  // ---------- 持久化（try/catch 降級） ----------
  function saveLS() {
    try {
      const slots = {};
      Object.keys(state.slots).forEach((k) => { const s = state.slots[k]; slots[k] = s ? { schedule: s.schedule, revision: s.revision, meta: s.meta, data: s.data } : null; });
      localStorage.setItem(LS_KEY, JSON.stringify({ data: state.data, revision: state.revision, settings: state.settings, slots, activeSlot: state.activeSlot }));
      return true;
    } catch (_) { return false; }
  }
  function loadLS() {
    try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
  }

  // ---------- 提交資料（新版本） ----------
  function commit(data, opts) {
    opts = opts || {};
    const v = E.validateData(data);
    if (!v.ok) return v;
    cancelSolve();
    state.data = clone(data);
    state.norm = E.normalize(state.data);
    state.revision = (opts.revision != null) ? opts.revision : state.revision + 1;
    gate.setRevision(state.revision);
    state.draft = clone(state.data);
    saveLS();
    renderAll();
    return v;
  }

  function setSlot(name, slot) {
    state.slots[name] = slot;
    saveLS();
    renderSched();
  }

  function makeSlot(norm, data, schedule, meta, revision) {
    const fe = E.checkFeasible(norm, schedule);
    return { schedule, feasible: fe.ok, violations: fe.violations, score: E.score(norm, schedule), norm, data, meta: meta || {}, revision };
  }

  // ---------- 分頁 / 主題 ----------
  function initChrome() {
    const tabs = $('#tabs');
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]'); if (!b) return;
      showTab(b.dataset.tab);
    });
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
  }

  // ---------- 資料分頁 ----------
  function initData() {
    $('#btnLoadDefault').onclick = () => { state.draft = clone(root.SGS_DEFAULT_DATA); renderDataTab(); applyDraft(); };
    $('#btnExport').onclick = () => download('sgs-data.json', JSON.stringify(state.draft, null, 2), 'application/json');
    $('#btnImport').onclick = () => $('#fileImport').click();
    $('#fileImport').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => { try { state.draft = JSON.parse(fr.result); renderDataTab(); applyDraft(); } catch (err) { showErrors([{ path: 'file', msg: 'JSON 解析失敗：' + err.message }]); } };
      fr.readAsText(f); e.target.value = '';
    };
    $('#btnRevert').onclick = () => { state.draft = clone(state.data); renderDataTab(); showErrors(null); };
    $('#btnApply').onclick = () => applyDraft();
    document.querySelectorAll('button[data-add]').forEach((b) => b.onclick = () => addRow(b.dataset.add));
    $('#tab-data').addEventListener('input', onDraftInput);
    $('#tab-data').addEventListener('change', onDraftInput);
    $('#tab-data').addEventListener('click', (e) => {
      const d = e.target.closest('button[data-del]'); if (!d) return;
      const [kind, i, j] = d.dataset.del.split(':');
      if (kind === 'antennas') state.draft.stations[+i].antennas.splice(+j, 1);
      else state.draft[kind].splice(+i, 1);
      renderDataTab();
    });
  }

  function applyDraft() {
    const v = commit(state.draft);
    showErrors(v.ok ? null : v.errors);
    if (v.ok) { renderDataTab(); }
    return v;
  }

  function showErrors(errors) {
    const el = $('#dataErrors');
    document.querySelectorAll('#tab-data input, #tab-data select').forEach((i) => i.classList.remove('invalid'));
    if (!errors || !errors.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = '<b>資料驗證失敗，未建立新版本：</b><ul>' + errors.map((e) => `<li><code>${esc(e.path)}</code> — ${esc(e.msg)}</li>`).join('') + '</ul>';
    errors.forEach((e) => { const inp = document.querySelector(`[data-path="${cssEsc(e.path)}"]`); if (inp) inp.classList.add('invalid'); });
  }

  function onDraftInput(e) {
    const el = e.target; if (!el.dataset) return;
    if (el.dataset.meta) {
      const k = el.dataset.meta;
      if (k === 'bands') state.draft.bands = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (k === 'horizonMin' || k === 'calibDefaultMin') state.draft.meta[k] = numOrRaw(el.value);
      else state.draft.meta[k] = el.value;
      return;
    }
    const p = el.dataset.path; if (!p) return;
    const parts = p.replace(/\[(\d+)\]/g, '.$1').split('.');
    let o = state.draft;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    const key = parts[parts.length - 1];
    const type = el.dataset.type || 'text';
    let val = el.value;
    if (type === 'int') val = numOrRaw(val);
    else if (type === 'intOrNull') val = val.trim() === '' ? null : numOrRaw(val);
    else if (type === 'float') val = val.trim() === '' ? null : (isNaN(Number(val)) ? val : Number(val));
    if (key === 'station' && el.dataset.moveAntenna != null) { // 天線換站
      const [si, ai] = el.dataset.moveAntenna.split(':').map(Number);
      const ant = state.draft.stations[si].antennas.splice(ai, 1)[0];
      const target = state.draft.stations.find((s) => s.id === val);
      (target || state.draft.stations[si]).antennas.push(ant);
      renderDataTab();
      return;
    }
    o[key] = val;
  }
  function numOrRaw(v) { if (String(v).trim() === '') return ''; const n = Number(v); return Number.isFinite(n) ? n : v; }

  function addRow(kind) {
    const d = state.draft;
    if (kind === 'satellites') d.satellites.push({ id: 'SAT_' + (d.satellites.length + 1), color: palette(d.satellites.length) });
    if (kind === 'stations') d.stations.push({ id: 'GS_' + (d.stations.length + 1), angleDeg: 0, antennas: [] });
    if (kind === 'antennas') { if (!d.stations.length) d.stations.push({ id: 'GS_1', angleDeg: 0, antennas: [] }); const st = d.stations[0]; st.antennas.push({ id: st.id + '-' + (d.bands[0] || 'S') + (st.antennas.length + 1), band: d.bands[0] || 'S', calibMin: null }); }
    if (kind === 'visibility') d.visibility.push({ sat: (d.satellites[0] || {}).id || '', station: (d.stations[0] || {}).id || '', start: 0, end: Math.min(10, d.meta.horizonMin || 10) });
    if (kind === 'requests') d.requests.push({ id: 'R' + (d.requests.length + 1), sat: (d.satellites[0] || {}).id || '', band: d.bands[0] || 'S', durMin: 1, start: 0, end: Math.min(10, d.meta.horizonMin || 10) });
    renderDataTab();
  }

  function renderDataTab() {
    const d = state.draft;
    document.querySelectorAll('[data-meta]').forEach((el) => {
      const k = el.dataset.meta;
      el.value = k === 'bands' ? (d.bands || []).join(', ') : (d.meta[k] == null ? '' : d.meta[k]);
    });
    const satOpts = (sel) => d.satellites.map((s) => `<option ${s.id === sel ? 'selected' : ''}>${esc(s.id)}</option>`).join('');
    const stOpts = (sel) => d.stations.map((s) => `<option ${s.id === sel ? 'selected' : ''}>${esc(s.id)}</option>`).join('');
    const bandOpts = (sel) => d.bands.map((b) => `<option ${b === sel ? 'selected' : ''}>${esc(b)}</option>`).join('');
    const del = (k, i, j) => `<td class="act"><button class="mini" data-del="${k}:${i}${j != null ? ':' + j : ''}" title="刪除">✕</button></td>`;

    $('#tblSat tbody').innerHTML = d.satellites.map((s, i) => `<tr>
      <td><input data-path="satellites[${i}].id" value="${esc(s.id)}"></td>
      <td><input type="color" data-path="satellites[${i}].color" value="${esc(s.color || palette(i))}"></td>${del('satellites', i)}</tr>`).join('');
    $('#tblSt tbody').innerHTML = d.stations.map((s, i) => `<tr>
      <td><input data-path="stations[${i}].id" value="${esc(s.id)}"></td>
      <td class="num"><input type="number" step="1" data-type="float" data-path="stations[${i}].angleDeg" value="${s.angleDeg == null ? '' : s.angleDeg}"></td>${del('stations', i)}</tr>`).join('');
    $('#tblAnt tbody').innerHTML = d.stations.flatMap((s, i) => s.antennas.map((a, j) => `<tr>
      <td><select data-path="stations[${i}].antennas[${j}].station" data-move-antenna="${i}:${j}">${stOpts(s.id)}</select></td>
      <td><input data-path="stations[${i}].antennas[${j}].id" value="${esc(a.id)}"></td>
      <td><select data-path="stations[${i}].antennas[${j}].band">${bandOpts(String(a.band))}</select></td>
      <td class="num"><input type="number" step="1" min="0" data-type="intOrNull" data-path="stations[${i}].antennas[${j}].calibMin" value="${a.calibMin == null ? '' : a.calibMin}"></td>${del('antennas', i, j)}</tr>`)).join('');
    $('#tblVis tbody').innerHTML = d.visibility.map((v, i) => `<tr>
      <td><select data-path="visibility[${i}].sat">${satOpts(v.sat)}</select></td>
      <td><select data-path="visibility[${i}].station">${stOpts(v.station)}</select></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="visibility[${i}].start" value="${v.start}"></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="visibility[${i}].end" value="${v.end}"></td>${del('visibility', i)}</tr>`).join('');
    $('#tblReq tbody').innerHTML = d.requests.map((r, i) => `<tr>
      <td><input data-path="requests[${i}].id" value="${esc(r.id)}" style="width:60px"></td>
      <td><select data-path="requests[${i}].sat">${satOpts(r.sat)}</select></td>
      <td><select data-path="requests[${i}].band">${bandOpts(String(r.band))}</select></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="requests[${i}].durMin" value="${r.durMin}"></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="requests[${i}].start" value="${r.start}"></td>
      <td class="num"><input type="number" step="1" data-type="int" data-path="requests[${i}].end" value="${r.end}"></td>${del('requests', i)}</tr>`).join('');
  }

  // ---------- 模型分頁 ----------
  function initModel() {
    $('#tmlim').value = state.settings.tmlim;
    $('#tmlim').onchange = () => { state.settings.tmlim = Math.max(1, parseInt($('#tmlim').value, 10) || 30); $('#tmlim').value = state.settings.tmlim; saveLS(); };
    $('#btnSolve').onclick = () => solveMILP();
    $('#btnCancel').onclick = () => { cancelSolve(); setStatus('<span class="badge bad">已取消</span>'); };
    initGLPK().then((g) => { $('#glpkStatus').textContent = `GLPK ${g.version} 已就緒（WebAssembly，Worker）`; }).catch((e) => { $('#glpkStatus').textContent = 'glpk 載入失敗：' + e; });
  }
  async function initGLPK() { if (!glpk) glpk = await root.GLPK(); return glpk; }
  function cancelSolve() {
    gate.cancel();
    if (state.solving && glpk) { try { glpk.terminate(); } catch (_) {} glpk = null; }
    state.solving = false;
    $('#btnSolve').disabled = false; $('#btnCancel').disabled = true;
  }
  function setStatus(html) { $('#milpStatus').innerHTML = html; }

  async function solveMILP() {
    if (!state.norm) return null;
    cancelSolve();
    const revision = state.revision;
    const runId = gate.begin(revision);
    state.solving = true;
    $('#btnSolve').disabled = true; $('#btnCancel').disabled = false;
    setStatus(`<span class="badge run">求解中…</span> 版本 r${revision}，時間上限 ${state.settings.tmlim}s`);
    let res = null;
    try {
      const g = await initGLPK();
      res = await M.solve(state.norm, { glpk: g, tmlim: state.settings.tmlim, revision, runId });
    } catch (err) {
      res = { error: String(err), revision, runId, label: { kind: 'bad', text: '求解失敗' } };
    }
    if (!gate.accepts(res)) return null;   // 版本閘門：過期結果整包丟棄
    state.solving = false;
    $('#btnSolve').disabled = false; $('#btnCancel').disabled = true;
    if (res.error && !res.schedule) { setStatus(`<span class="badge bad">${esc(res.label.text)}</span> ${esc(res.error)}`); return res; }
    if (res.schedule && res.feasible) {
      setSlot('milp', makeSlot(state.norm, state.data, res.schedule, { source: 'MILP', label: res.label, bound: res.bound, timing: res.timing, stats: res.stats, status: res.status }, revision));
    }
    renderMilpStatus(res);
    return res;
  }

  function renderMilpStatus(res) {
    const s = res.score || { assigned: 0, totalWait: 0, objective: 0 };
    let html = `<span class="badge ${res.label.kind}">${esc(res.label.text)}</span> 版本 r${res.revision}<br>`;
    if (res.error) html += `<span style="color:var(--bad)">${esc(res.error)}</span><br>`;
    if (res.schedule) html += `Z = <b>${s.assigned}</b>　總等待 = <b>${s.totalWait}</b> 分鐘　objective = ${s.objective.toFixed(6)}（ε = 1/${Math.round(1 / res.eps)}）<br>`;
    if (res.label.kind === 'feas') {
      if (res.bound && !res.bound.error) html += `LP 鬆弛上界 U = ${res.bound.U.toFixed(6)}，absoluteGap = ${res.bound.absoluteGap.toFixed(6)}，relativeGap = ${(res.bound.relativeGap * 100).toFixed(3)}%（加權目標的 LP 鬆弛 gap，非原生 B&B gap，亦非任務數差距）<br>`;
      else if (res.bound && res.bound.error) html += `<span style="color:var(--bad)">${esc(res.bound.error)}</span><br>`;
      else html += `上界／gap 尚未取得<br>`;
    }
    const t = res.timing || {}, st = res.stats || {};
    html += `<span class="muted">候選變數 ${st.candidates}、限制列 ${st.rows}、非零係數 ${st.nonzeros}；建模 ${fmtMs(t.buildMs)}，MILP ${fmtMs(t.milpMs)}（上限 ${t.milpLimit}s），LP ${fmtMs(t.lpMs)}</span>`;
    setStatus(html);
  }
  const fmtMs = (ms) => ms == null ? '—' : (ms < 1000 ? ms.toFixed(0) + ' ms' : (ms / 1000).toFixed(2) + ' s');

  // ---------- 排程分頁 ----------
  function initSched() {
    $('#slotSel').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-slot]'); if (!b) return;
      state.activeSlot = b.dataset.slot; saveLS(); renderSched();
    });
    $('#btnGanttPng').onclick = () => { const c = $('#gantt'); c.toBlob((blob) => downloadBlob('gantt.png', blob)); };
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

  function drawGantt() {
    const canvas = $('#gantt'); if (!canvas) return;
    const slot = state.slots[state.activeSlot];
    const norm = slot ? slot.norm : state.norm;
    const viol = $('#ganttViol');
    if (slot && !slot.feasible) { viol.classList.remove('hidden'); viol.innerHTML = '<b>違規：</b><ul>' + slot.violations.map((v) => `<li>[規則 ${esc(String(v.rule))}] ${esc(v.msg)}</li>`).join('') + '</ul>'; }
    else { viol.classList.add('hidden'); viol.innerHTML = ''; }
    if (!norm) return;
    const schedule = slot ? slot.schedule : [];
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 1000;
    const rowH = 44, top = 34, left = 120, right = 20, bottom = 10;
    const rows = norm.antennas;
    const cssH = top + rows.length * rowH + bottom;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const C = (n) => cs.getPropertyValue(n).trim();
    ctx.clearRect(0, 0, cssW, cssH);
    const H = norm.H, plotW = cssW - left - right;
    const x = (t) => left + (t / H) * plotW;
    const satColor = (id) => (norm.satById[id] && norm.satById[id].color) || palette(norm.satellites.findIndex((s) => s.id === id));
    // 時間軸
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const step = H <= 60 ? 5 : H <= 240 ? 15 : 60;
    for (let t = 0; t <= H; t += step) {
      ctx.strokeStyle = C('--grid'); ctx.beginPath(); ctx.moveTo(x(t), top - 6); ctx.lineTo(x(t), cssH - bottom); ctx.stroke();
      ctx.fillStyle = C('--muted'); ctx.textAlign = 'center'; ctx.fillText(E.minutesToHHMM(norm, t), x(t), top - 16);
    }
    rows.forEach((a, i) => {
      const y = top + i * rowH;
      ctx.fillStyle = C('--panel2'); ctx.fillRect(left, y + 6, plotW, rowH - 12);
      // 可見時窗底色（依衛星）
      norm.satellites.forEach((s) => {
        E.visSegments(norm, s.id, a.station).forEach(([vs, ve]) => {
          ctx.fillStyle = withAlpha(satColor(s.id), 0.18); ctx.fillRect(x(vs), y + 6, x(ve) - x(vs), rowH - 12);
        });
      });
      ctx.fillStyle = C('--text'); ctx.textAlign = 'left'; ctx.fillText(`${a.id}  (${a.band}, c=${a.calib})`, 8, y + rowH / 2);
    });
    // 任務與校準
    const rowIdx = Object.fromEntries(rows.map((a, i) => [a.id, i]));
    schedule.forEach((it) => {
      const r = norm.reqById[it.req], a = norm.antById[it.antenna];
      if (!r || !a || rowIdx[a.id] == null || !Number.isInteger(it.start)) return;
      const y = top + rowIdx[a.id] * rowH;
      const s = it.start, e = s + r.durMin;
      ctx.fillStyle = C('--calib'); ctx.fillRect(x(e), y + 10, x(Math.min(e + a.calib, H)) - x(e), rowH - 20);
      ctx.fillStyle = satColor(r.sat); roundRect(ctx, x(s), y + 9, Math.max(2, x(e) - x(s)), rowH - 18, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(r.id, (x(s) + x(e)) / 2, y + rowH / 2);
      ctx.font = '11px system-ui, sans-serif';
    });
    // 違規標紅
    if (slot && !slot.feasible) {
      const bad = new Set(slot.violations.flatMap((v) => v.reqs));
      ctx.strokeStyle = C('--bad'); ctx.lineWidth = 2;
      schedule.forEach((it) => {
        if (!bad.has(it.req)) return;
        const r = norm.reqById[it.req], a = norm.antById[it.antenna]; if (!r || !a) return;
        const y = top + rowIdx[a.id] * rowH; roundRect(ctx, x(it.start), y + 9, Math.max(2, x(it.start + r.durMin) - x(it.start)), rowH - 18, 4); ctx.stroke();
      });
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
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function download(name, text, type) { downloadBlob(name, new Blob([text], { type })); }
  function downloadBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  function renderAll() {
    $('#revInfo').textContent = state.data ? `${state.data.meta.name || ''} · 版本 r${state.revision} · ${state.norm.requests.length} 需求 / ${state.norm.antennas.length} 天線` : '';
    renderSched();
  }

  // ---------- 啟動 ----------
  function boot() {
    initChrome(); initData(); initModel(); initSched();
    const saved = loadLS();
    let loaded = false;
    if (saved && saved.data && E.validateData(saved.data).ok) {
      state.settings = Object.assign(state.settings, saved.settings || {});
      state.activeSlot = saved.activeSlot || 'milp';
      commit(saved.data, { revision: saved.revision || 1 });
      Object.keys(saved.slots || {}).forEach((k) => {
        const s = saved.slots[k]; if (!s || !s.data || !E.validateData(s.data).ok) return;
        const norm = E.normalize(s.data);
        state.slots[k] = makeSlot(norm, s.data, s.schedule, s.meta, s.revision);
      });
      loaded = true;
    }
    if (!loaded) commit(clone(root.SGS_DEFAULT_DATA), { revision: 1 });
    state.draft = clone(state.data);
    $('#tmlim').value = state.settings.tmlim;
    renderDataTab(); renderAll();
  }

  // 測試／自動化用 API
  SGS.app = {
    state, gate,
    showTab, loadData: (d) => { state.draft = clone(d); renderDataTab(); return applyDraft(); },
    applyDraft, solveMILP, cancelSolve, setSlot, makeSlot, renderSched,
    getDraft: () => state.draft,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
