// engine.js — 共用核心（SPEC §1、§2.1、§3）。唯一的規則來源。
// 純函式，掛在 globalThis.SGS.engine；同一份原始碼內嵌於主頁與 worker。
(function (root) {
  'use strict';
  const SGS = (root.SGS = root.SGS || {});

  const isInt = (v) => Number.isInteger(v);
  const isNonNegInt = (v) => isInt(v) && v >= 0;
  const isPosInt = (v) => isInt(v) && v > 0;

  // ---------- validateData (§2.1) ----------
  function validateData(data) {
    const errors = [];
    const err = (path, msg) => errors.push({ path, msg });
    if (!data || typeof data !== 'object') return { ok: false, errors: [{ path: '', msg: '資料不是物件' }] };
    const meta = data.meta || {};
    if (!isPosInt(meta.horizonMin)) err('meta.horizonMin', 'H 必須為正整數');
    if (!isNonNegInt(meta.calibDefaultMin)) err('meta.calibDefaultMin', '全域校準必須為非負整數');
    const H = isPosInt(meta.horizonMin) ? meta.horizonMin : Infinity;
    const bands = Array.isArray(data.bands) ? data.bands : [];
    if (!Array.isArray(data.bands) || bands.length === 0) err('bands', '至少一個頻段');
    const bandSet = new Set(bands.map(String));

    const satIds = new Set();
    (data.satellites || []).forEach((s, i) => {
      if (!s || typeof s.id !== 'string' || !s.id) err(`satellites[${i}].id`, '衛星 id 必須為非空字串');
      else if (satIds.has(s.id)) err(`satellites[${i}].id`, `衛星 id 重複：${s.id}`);
      else satIds.add(s.id);
    });
    if (!Array.isArray(data.satellites)) err('satellites', '必須為陣列');

    const stIds = new Set();
    const antIds = new Set();
    (data.stations || []).forEach((st, i) => {
      if (!st || typeof st.id !== 'string' || !st.id) err(`stations[${i}].id`, '地面站 id 必須為非空字串');
      else if (stIds.has(st.id)) err(`stations[${i}].id`, `地面站 id 重複：${st.id}`);
      else stIds.add(st.id);
      if (st && st.angleDeg != null && typeof st.angleDeg !== 'number') err(`stations[${i}].angleDeg`, '角度必須為數字');
      const ants = (st && st.antennas) || [];
      if (!Array.isArray(ants)) err(`stations[${i}].antennas`, '必須為陣列');
      ants.forEach((a, j) => {
        const p = `stations[${i}].antennas[${j}]`;
        if (!a || typeof a.id !== 'string' || !a.id) err(`${p}.id`, '天線 id 必須為非空字串');
        else if (antIds.has(a.id)) err(`${p}.id`, `天線 id 重複：${a.id}`);
        else antIds.add(a.id);
        if (!a || !bandSet.has(String(a.band))) err(`${p}.band`, `頻段不存在：${a && a.band}`);
        if (a && a.calibMin != null && !isNonNegInt(a.calibMin)) err(`${p}.calibMin`, '天線校準必須為非負整數或 null');
      });
    });
    if (!Array.isArray(data.stations)) err('stations', '必須為陣列');

    (data.visibility || []).forEach((v, i) => {
      const p = `visibility[${i}]`;
      if (!v || !satIds.has(v.sat)) err(`${p}.sat`, `衛星不存在：${v && v.sat}`);
      if (!v || !stIds.has(v.station)) err(`${p}.station`, `地面站不存在：${v && v.station}`);
      checkWindow(v, p, H, err);
    });
    if (!Array.isArray(data.visibility)) err('visibility', '必須為陣列');

    const reqIds = new Set();
    (data.requests || []).forEach((r, i) => {
      const p = `requests[${i}]`;
      if (!r || typeof r.id !== 'string' || !r.id) err(`${p}.id`, '需求 id 必須為非空字串');
      else if (reqIds.has(r.id)) err(`${p}.id`, `需求 id 重複：${r.id}`);
      else reqIds.add(r.id);
      if (!r || !satIds.has(r.sat)) err(`${p}.sat`, `衛星不存在：${r && r.sat}`);
      if (!r || !bandSet.has(String(r.band))) err(`${p}.band`, `頻段不存在：${r && r.band}`);
      if (!r || !isPosInt(r.durMin)) err(`${p}.durMin`, '時長必須為正整數');
      checkWindow(r, p, H, err);
    });
    if (!Array.isArray(data.requests)) err('requests', '必須為陣列');

    return { ok: errors.length === 0, errors };
  }

  function checkWindow(w, p, H, err) {
    if (!w) return;
    if (!isInt(w.start)) err(`${p}.start`, 'start 必須為整數');
    if (!isInt(w.end)) err(`${p}.end`, 'end 必須為整數');
    if (isInt(w.start) && isInt(w.end)) {
      if (w.start < 0) err(`${p}.start`, 'start 不得小於 0');
      if (w.start >= w.end) err(`${p}.start`, 'start 必須小於 end');
      if (w.end > H) err(`${p}.end`, `end 不得大於 H=${H}`);
    }
  }

  // ---------- normalize (§2.1 / §3) ----------
  // 回傳不可變快照（deep copy），含：antennas 展開、校準解析、visibility 合併、索引表。
  function normalize(data) {
    const v = validateData(data);
    if (!v.ok) { const e = new Error('資料不合法'); e.errors = v.errors; throw e; }
    const d = JSON.parse(JSON.stringify(data));
    const H = d.meta.horizonMin;
    const calibDefault = d.meta.calibDefaultMin;
    const antennas = [];
    d.stations.forEach((st) => {
      st.antennas.forEach((a) => {
        const calib = a.calibMin == null ? calibDefault : a.calibMin; // nullish：0 為有效覆寫
        antennas.push({ id: a.id, station: st.id, band: String(a.band), calib });
      });
    });
    const vis = {};
    d.visibility.forEach((w) => {
      const k = w.sat + '\u0000' + w.station;
      (vis[k] = vis[k] || []).push([w.start, w.end]);
    });
    Object.keys(vis).forEach((k) => {
      const segs = vis[k].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const merged = [];
      segs.forEach(([s, e]) => {
        const last = merged[merged.length - 1];
        if (last && s <= last[1]) last[1] = Math.max(last[1], e); // 重疊或相鄰 → 合併
        else merged.push([s, e]);
      });
      vis[k] = merged;
    });
    const norm = {
      meta: d.meta, bands: d.bands.map(String),
      satellites: d.satellites, stations: d.stations, requests: d.requests,
      H, calibDefault, antennas,
      antById: Object.fromEntries(antennas.map((a) => [a.id, a])),
      reqById: Object.fromEntries(d.requests.map((r) => [r.id, r])),
      satById: Object.fromEntries(d.satellites.map((s) => [s.id, s])),
      visByKey: vis,
      visibilityMerged: Object.keys(vis).flatMap((k) => {
        const [sat, station] = k.split('\u0000');
        return vis[k].map(([start, end]) => ({ sat, station, start, end }));
      }),
    };
    deepFreeze(norm);
    return norm;
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach((k) => deepFreeze(o[k]));
    }
    return o;
  }

  function expandAntennas(norm) { return norm.antennas.slice(); }

  function visSegments(norm, sat, station) {
    return norm.visByKey[sat + '\u0000' + station] || [];
  }

  // ---------- feasibleStarts (§3) ----------
  function feasibleStarts(norm, reqId, antId) {
    const r = norm.reqById[reqId]; const a = norm.antById[antId];
    if (!r || !a || String(r.band) !== a.band) return [];
    const out = [];
    const d = r.durMin;
    visSegments(norm, r.sat, a.station).forEach(([vs, ve]) => {
      const lo = Math.max(r.start, vs, 0);
      const hi = Math.min(r.end, ve, norm.H) - d;   // [t, t+d) ⊆ 交集；t+d == end 合法
      for (let t = lo; t <= hi; t++) out.push(t);
    });
    return out;
  }

  // 是否 [t,t+d) 落在需求時窗 ∩ 某段 visibility ∩ [0,H)
  function inWindows(norm, r, a, t) {
    const d = r.durMin;
    if (t < 0 || t + d > norm.H || t < r.start || t + d > r.end) return false;
    return visSegments(norm, r.sat, a.station).some(([vs, ve]) => t >= vs && t + d <= ve);
  }

  // ---------- checkFeasible (§3) ----------
  // rule ∈ 1|2|3|4|5|'window'|'schema'|'duplicate-request'；依 (rule, reqs) 去重。
  function checkFeasible(norm, schedule) {
    const viol = [];
    const seen = new Set();
    const add = (rule, reqs, msg) => {
      const key = rule + '|' + reqs.slice().sort().join(',');
      if (seen.has(key)) return;
      seen.add(key);
      viol.push({ rule, reqs: reqs.slice().sort(), msg });
    };
    if (!Array.isArray(schedule)) return { ok: false, violations: [{ rule: 'schema', reqs: [], msg: 'schedule 必須為陣列' }] };

    const tasks = []; // 結構合法的任務
    const seenReq = new Set();
    schedule.forEach((it, i) => {
      const reqId = it && it.req; const antId = it && it.antenna;
      const r = norm.reqById[reqId]; const a = norm.antById[antId];
      const label = typeof reqId === 'string' ? reqId : `#${i}`;
      if (!r) { add('schema', [label], `未知需求：${reqId}`); return; }
      if (!a) { add('schema', [reqId], `未知天線：${antId}`); return; }
      if (!isNonNegInt(it.start)) { add('schema', [reqId], `起始必須為非負整數：${it.start}`); return; }
      if (seenReq.has(reqId)) { add('duplicate-request', [reqId], `需求重複排入：${reqId}`); return; }
      seenReq.add(reqId);
      tasks.push({ req: r, ant: a, start: it.start, end: it.start + r.durMin });
    });

    tasks.forEach((t) => {
      if (String(t.req.band) !== t.ant.band) add(5, [t.req.id], `頻段不相容：${t.req.id}(${t.req.band}) → ${t.ant.id}(${t.ant.band})`);
      else if (!inWindows(norm, t.req, t.ant, t.start)) add('window', [t.req.id], `${t.req.id} 不在需求時窗 ∩ 飛越時窗內`);
    });

    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const x = tasks[i], y = tasks[j];
        const commOverlap = x.start < y.end && y.start < x.end;
        if (x.req.sat === y.req.sat && commOverlap) add(3, [x.req.id, y.req.id], `${x.req.sat} 同時進行 ${x.req.id} 與 ${y.req.id}`);
        if (x.ant.id === y.ant.id) {
          if (commOverlap) add(1, [x.req.id, y.req.id], `${x.ant.id} 同時服務 ${x.req.id} 與 ${y.req.id}`);
          else {
            const c = x.ant.calib;
            const first = x.start <= y.start ? x : y, second = first === x ? y : x;
            if (second.start < first.end + c) add(2, [x.req.id, y.req.id], `${x.ant.id}：${first.req.id} 結束後只隔 ${second.start - first.end} 分鐘（需 ${c}）才開始 ${second.req.id}`);
          }
        }
      }
    }
    return { ok: viol.length === 0, violations: viol };
  }

  // ---------- score (§1.1) ----------
  function score(norm, schedule) {
    const fe = checkFeasible(norm, schedule);
    const n = norm.requests.length;
    if (n === 0) return { assigned: 0, totalWait: 0, objective: 0, feasible: fe.ok };
    const seenReq = new Set();
    let assigned = 0, totalWait = 0;
    (schedule || []).forEach((it) => {
      const r = it && norm.reqById[it.req];
      if (!r || !norm.antById[it.antenna] || !isNonNegInt(it.start) || seenReq.has(r.id)) return;
      seenReq.add(r.id);
      assigned += 1;
      totalWait += it.start - r.start;   // 可行時 ≥ 0；罰則模式可能為負（僅 raw fitness）
    });
    const objective = assigned - totalWait / (n * norm.H + 1);
    return { assigned, totalWait, objective, feasible: fe.ok };
  }

  // 字典序比較：(assigned 降序, totalWait 升序)。回傳 >0 表示 a 較佳。
  function compareScores(a, b) {
    if (a.assigned !== b.assigned) return a.assigned - b.assigned;
    return b.totalWait - a.totalWait;
  }

  // ---------- greedyDecode (§3 / §5.1) ----------
  // order: 需求 id 陣列（優先序）；antennaPref: {reqId: antennaId}（可省略）。
  // 對每支被嘗試的天線掃描完整 feasibleStarts，可插入空隙；找不到即不排入。
  function greedyDecode(norm, order, antennaPref) {
    antennaPref = antennaPref || {};
    const schedule = [];
    const placed = []; // {req, ant, start, end}
    order.forEach((reqId) => {
      const r = norm.reqById[reqId];
      if (!r) return;
      const compat = norm.antennas.filter((a) => a.band === String(r.band));
      const pref = antennaPref[reqId];
      const tryList = pref && compat.some((a) => a.id === pref)
        ? [compat.find((a) => a.id === pref)].concat(compat.filter((a) => a.id !== pref))
        : compat;
      let best = null;
      for (const a of tryList) {
        const starts = feasibleStarts(norm, reqId, a.id);
        for (const t of starts) {
          if (fits(norm, placed, r, a, t)) { best = { ant: a, start: t }; break; }
        }
        if (best) break;
      }
      if (best) {
        placed.push({ req: r, ant: best.ant, start: best.start, end: best.start + r.durMin });
        schedule.push({ req: reqId, antenna: best.ant.id, start: best.start });
      }
    });
    return schedule;
  }

  function fits(norm, placed, r, a, t) {
    const end = t + r.durMin;
    for (const p of placed) {
      if (p.req.sat === r.sat && t < p.end && p.start < end) return false;
      if (p.ant.id === a.id) {
        const c = a.calib;
        if (t < p.end + c && p.start < end + c) return false; // 占用區間 [start, end+c) 不重疊
      }
    }
    return true;
  }

  // ---------- PRNG ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 工具 ----------
  function minutesToHHMM(norm, m) {
    const [h0, m0] = String(norm.meta.timeOrigin || '00:00').split(':').map(Number);
    const total = h0 * 60 + m0 + m;
    const h = Math.floor(total / 60) % 24, mm = ((total % 60) + 60) % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  SGS.engine = {
    validateData, normalize, expandAntennas, feasibleStarts, checkFeasible, score, compareScores,
    greedyDecode, mulberry32, minutesToHHMM, visSegments,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
