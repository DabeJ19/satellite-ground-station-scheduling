// anim.js — 衛星繞地示意動畫（SPEC §6）。純函式部分（相位擬合、接觸狀態、幾何）可在 Node 測試；drawFrame 需 canvas。
// 軌道為示意：ω = 360/H 度／分鐘（視覺參數）；φ 以各時窗中點對站角度的「圓周角距離」平方和最小化擬合；
// 接觸狀態一律以輸入資料（時窗／排程）為準，不由幾何判斷。
(function (root) {
  'use strict';
  const SGS = (root.SGS = root.SGS || {});
  const E = () => SGS.engine;

  const norm360 = (a) => ((a % 360) + 360) % 360;
  // 圓周角距離（−180, 180]
  const circDiff = (a, b) => { let d = norm360(a - b); if (d > 180) d -= 360; return d; };

  function stationAngles(norm) {
    const n = norm.stations.length;
    const out = new Map();
    norm.stations.forEach((st, i) => out.set(st.id, typeof st.angleDeg === 'number' && Number.isFinite(st.angleDeg) ? norm360(st.angleDeg) : norm360(360 * i / Math.max(1, n))));
    return out;
  }

  // 對單一衛星擬合 φ：最小化 Σ circDiff(ω·t_mid + φ, θ_station)²；格點 0.5° 再局部細化；多解取最小角度。
  function fitPhase(norm, satId, omega, angles) {
    const pts = [];
    const m = norm.visBySat.get(satId);
    if (m) m.forEach((segs, station) => segs.forEach(([a, b]) => pts.push({ tMid: (a + b) / 2, theta: angles.get(station) })));
    if (!pts.length) return { phi: null, residual: null, points: 0 };
    const cost = (phi) => pts.reduce((s, p) => s + circDiff(omega * p.tMid + phi, p.theta) ** 2, 0);
    // 0.5° 格點（含 359.5°/0° 交界）→ 找出所有局部最低盆地 → 各自細化 → cost 等價（容差）者取最小角度
    const STEP = 0.5, N = Math.round(360 / STEP);
    const grid = new Array(N);
    for (let i = 0; i < N; i++) grid[i] = cost(i * STEP);
    const basins = [];
    for (let i = 0; i < N; i++) {
      const prev = grid[(i - 1 + N) % N], next = grid[(i + 1) % N];
      if (grid[i] <= prev && grid[i] <= next) basins.push(i * STEP);
    }
    const refine = (phi0) => {
      let phi = phi0, c = cost(phi0), step = STEP / 2;
      while (step > 1e-5) {
        let moved = false;
        for (const cand of [phi - step, phi + step]) { const v = cost(cand); if (v < c - 1e-12) { c = v; phi = cand; moved = true; } }
        if (!moved) step /= 2;
      }
      return { phi: norm360(phi), c };
    };
    const cands = basins.map(refine);
    const minC = Math.min(...cands.map((x) => x.c));
    const TOL = 1e-6 * Math.max(1, minC);
    const ties = cands.filter((x) => x.c <= minC + TOL).map((x) => x.phi).sort((a, b) => a - b);
    const phi = ties[0];
    return { phi, residual: Math.sqrt(minC / pts.length), points: pts.length, candidates: cands.length };
  }

  // 整體擬合結果：{ omega, angles: Map, sats: Map<satId, {phi, residual, points}> }
  function fitAll(norm) {
    const omega = 360 / norm.H;
    const angles = stationAngles(norm);
    const sats = new Map();
    const nSat = Math.max(1, norm.satellites.length);
    norm.satellites.forEach((s, i) => {
      const f = fitPhase(norm, s.id, omega, angles);
      if (f.phi == null) f.phi = norm360(360 * i / nSat);   // 沒有時窗：依索引等距
      sats.set(s.id, f);
    });
    return { omega, angles, sats };
  }

  const satAngle = (fit, satId, t) => norm360(fit.omega * t + fit.sats.get(satId).phi);

  // 接觸狀態（以資料為準）：在時窗內的 (sat, station)、進行中的任務、校準中的天線
  function contactState(norm, schedule, t) {
    const visible = [];
    norm.visibilityMerged.forEach((w) => { if (t >= w.start && t < w.end) visible.push({ sat: w.sat, station: w.station }); });
    const active = [], calibrating = [];
    (schedule || []).forEach((it) => {
      const r = norm.reqById.get(it.req), a = norm.antById.get(it.antenna);
      if (!r || !a || !Number.isInteger(it.start)) return;
      const end = it.start + r.durMin;
      if (t >= it.start && t < end) active.push({ req: r.id, sat: r.sat, antenna: a.id, station: a.station, start: it.start, end });
      else if (t >= end && t < end + a.calib) calibrating.push({ antenna: a.id, station: a.station, until: end + a.calib });
    });
    return { visible, active, calibrating };
  }

  // 幾何：地球圓心 (cx, cy)、半徑 Re；衛星 i 軌道半徑 Re + base + gap·i
  function layout(norm, w, h) {
    const cx = w / 2, cy = h / 2;
    const n = Math.max(1, norm.satellites.length);
    const minDim = Math.min(w, h);
    let Re = Math.max(30, minDim * 0.16);
    let gap = (minDim / 2 - Re - 24) / n;          // 外圈留 24px 給衛星符號與標籤
    if (gap < 8) { Re = Math.max(12, minDim / 2 - 24 - 8 * n); gap = Math.max(3, (minDim / 2 - Re - 24) / n); }
    const orbitR = new Map();
    norm.satellites.forEach((s, i) => orbitR.set(s.id, Re + gap * (i + 1)));
    return { cx, cy, Re, gap, orbitR };
  }
  // 畫布容量（S4 A2）：給定可用寬高，回傳能容納全部軌道（gap ≥ 8px、Re ≥ 12、外圈留 24px）的正方形邊長；
  // 不超過可用尺寸時回傳 {w,h} 原值；超過時回傳較大的 side（呼叫端把畫布放進可捲動容器）。
  const MIN_GAP = 8, MIN_RE = 12, MARGIN = 24;
  function fitSize(norm, w, h) {
    const n = Math.max(1, norm.satellites.length);
    const need = 2 * (MIN_RE + MIN_GAP * n + MARGIN);
    const minDim = Math.min(w, h);
    if (need <= minDim) return { w, h, scroll: false, need };
    return { w: Math.max(w, need), h: Math.max(h, need), scroll: true, need };
  }
  const polar = (cx, cy, r, deg) => { const a = (deg - 90) * Math.PI / 180; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; };

  // 繪製一幀。theme: { bg, panel, text, muted, line, accent, calib }；satColor(id)
  function drawFrame(ctx, norm, schedule, t, fit, opts) {
    const { w, h, theme, satColor, showResidual } = opts;
    const L = layout(norm, w, h);
    ctx.clearRect(0, 0, w, h);
    const st = contactState(norm, schedule, t);
    const visKey = (sat, station) => JSON.stringify([sat, station]);
    const visibleSet = new Set(st.visible.map((v) => visKey(v.sat, v.station)));
    const activeByStation = new Map(); st.active.forEach((a) => { if (!activeByStation.has(a.station)) activeByStation.set(a.station, []); activeByStation.get(a.station).push(a); });
    const calibSet = new Set(st.calibrating.map((c) => c.antenna));
    const render = { arcs: [], litStations: [], litSats: [] };   // 可觀測的渲染決策（測試用）

    // 軌道 + 時窗對應的軌道弧（發光）
    norm.satellites.forEach((s) => {
      const r = L.orbitR.get(s.id);
      ctx.strokeStyle = theme.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(L.cx, L.cy, r, 0, Math.PI * 2); ctx.stroke();
      const m = norm.visBySat.get(s.id);
      if (m) m.forEach((segs) => segs.forEach(([a, b]) => {
        const a0 = (satAngle(fit, s.id, a) - 90) * Math.PI / 180, a1 = a0 + fit.omega * (b - a) * Math.PI / 180;   // 弧長用未取模的跨度
        ctx.strokeStyle = satColor(s.id); ctx.globalAlpha = (t >= a && t < b) ? 0.9 : 0.3; ctx.lineWidth = (t >= a && t < b) ? 4 : 2;
        ctx.beginPath(); ctx.arc(L.cx, L.cy, r, a0, a1); ctx.stroke(); ctx.globalAlpha = 1;
        render.arcs.push({ sat: s.id, start: a, end: b, a0, a1, spanRad: a1 - a0 });
      }));
    });
    // 地球
    const g = ctx.createRadialGradient(L.cx - L.Re * 0.3, L.cy - L.Re * 0.3, L.Re * 0.2, L.cx, L.cy, L.Re);
    g.addColorStop(0, '#3a7bd5'); g.addColorStop(1, '#17325e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.cx, L.cy, L.Re, 0, Math.PI * 2); ctx.fill();
    // 地面站：覆蓋錐、站點、天線點（校準灰）、名稱
    norm.stations.forEach((s) => {
      const ang = fit.angles.get(s.id);
      const p = polar(L.cx, L.cy, L.Re, ang);
      const outer = L.Re + L.gap * norm.satellites.length + 6;
      const anyVisible = norm.satellites.some((sat) => visibleSet.has(visKey(sat.id, s.id)));
      if (anyVisible) render.litStations.push(s.id);
      const cone = 14;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      const q1 = polar(L.cx, L.cy, outer, ang - cone), q2 = polar(L.cx, L.cy, outer, ang + cone);
      ctx.lineTo(q1.x, q1.y); ctx.arc(L.cx, L.cy, outer, (ang - cone - 90) * Math.PI / 180, (ang + cone - 90) * Math.PI / 180); ctx.lineTo(p.x, p.y);
      ctx.fillStyle = anyVisible ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)'; ctx.fill();
      // 站點（時窗內發光）
      if (anyVisible) { ctx.shadowColor = theme.accent; ctx.shadowBlur = 14; }
      ctx.fillStyle = anyVisible ? theme.accent : theme.text; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // 天線點：沿站外側排列
      const ants = norm.antennas.filter((a) => a.station === s.id);
      ants.forEach((a, k) => {
        const q = polar(L.cx, L.cy, L.Re + 10, ang + (k - (ants.length - 1) / 2) * 7);
        const busy = (activeByStation.get(s.id) || []).some((x) => x.antenna === a.id);
        ctx.fillStyle = calibSet.has(a.id) ? theme.calib : (busy ? theme.accent : theme.muted);
        ctx.beginPath(); ctx.arc(q.x, q.y, 2.6, 0, Math.PI * 2); ctx.fill();
      });
      const lp = polar(L.cx, L.cy, L.Re + 22, ang);
      ctx.fillStyle = theme.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.id, lp.x, lp.y);
    });
    // 衛星 + 任務連線
    norm.satellites.forEach((s) => {
      const r = L.orbitR.get(s.id);
      const p = polar(L.cx, L.cy, r, satAngle(fit, s.id, t));
      st.active.filter((a) => a.sat === s.id).forEach((a) => {
        const sp = polar(L.cx, L.cy, L.Re, fit.angles.get(a.station));
        ctx.strokeStyle = satColor(s.id); ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = satColor(s.id); ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(a.req, (sp.x + p.x) / 2, (sp.y + p.y) / 2 - 8);
      });
      const inWin = norm.stations.some((stn) => visibleSet.has(visKey(s.id, stn.id)));
      if (inWin) render.litSats.push(s.id);
      if (inWin) { ctx.shadowColor = satColor(s.id); ctx.shadowBlur = 16; }
      ctx.fillStyle = satColor(s.id); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = theme.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(s.id, p.x + 9, p.y);
    });
    // 時間與殘差
    ctx.fillStyle = theme.text; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(E().minutesToHHMM(norm, Math.floor(t)) + '  (t = ' + t.toFixed(1) + ' min)', 10, 8);
    ctx.fillStyle = theme.muted; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('軌道為示意，接觸狀態以輸入時窗為準', 10, 28);
    if (showResidual) {
      let y = 44;
      fit.sats.forEach((f, id) => { ctx.fillText(`${id}: φ=${f.phi.toFixed(1)}°${f.residual == null ? '（無時窗）' : ' 擬合殘差 RMS ' + f.residual.toFixed(1) + '°'}`, 10, y); y += 14; });
    }
    st.render = render;
    return st;
  }

  SGS.anim = { norm360, circDiff, stationAngles, fitPhase, fitAll, satAngle, contactState, layout, fitSize, polar, drawFrame };
})(typeof globalThis !== 'undefined' ? globalThis : this);
