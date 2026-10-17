// engine.js — 共用核心（SPEC §1、§2.1、§3）。唯一的規則來源。
// 純函式，掛在 globalThis.SGS.engine；同一份原始碼內嵌於主頁與 worker。
// 索引一律使用 Map（任意字串 id 安全，無原型鍵問題）；複合鍵用巢狀 Map；去重鍵用 JSON.stringify。
(function (root) {
  'use strict';
  const SGS = (root.SGS = root.SGS || {});

  const isInt = (v) => Number.isInteger(v);
  const isNonNegInt = (v) => isInt(v) && v >= 0;
  const isPosInt = (v) => isInt(v) && v > 0;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isId = (v) => typeof v === 'string' && v.length > 0;
  // 安全格式化：對物件／陣列不呼叫 String()（{"toString":null} 會拋 TypeError）
  function fmt(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    const t = typeof v;
    if (t === 'string') return JSON.stringify(v);
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
    if (t === 'symbol' || t === 'function') return '<' + t + '>';
    try { const j = JSON.stringify(v); return j.length > 80 ? j.slice(0, 77) + '...' : j; } catch (_) { return '<object>'; }
  }

  // ---------- validateData (§2.1) ----------
  // 任何 JSON 值都回 {ok,errors}，不拋例外。先驗型別再遍歷。
  function validateData(data) {
    const errors = [];
    const err = (path, msg) => errors.push({ path, msg });
    if (!isObj(data)) return { ok: false, errors: [{ path: '', msg: '資料必須為物件' }] };
    const meta = isObj(data.meta) ? data.meta : null;
    if (!meta) err('meta', 'meta 必須為物件');
    const H = meta && isPosInt(meta.horizonMin) ? meta.horizonMin : null;
    if (meta && !isPosInt(meta.horizonMin)) err('meta.horizonMin', 'H 必須為正整數');
    if (meta && !isNonNegInt(meta.calibDefaultMin)) err('meta.calibDefaultMin', '全域校準必須為非負整數');
    if (meta && meta.name != null && typeof meta.name !== 'string') err('meta.name', '名稱必須為字串');
    if (meta && meta.timeOrigin != null && (typeof meta.timeOrigin !== 'string' || !/^\d{1,2}:\d{2}$/.test(meta.timeOrigin))) err('meta.timeOrigin', '時間原點須為 HH:MM 字串');

    const arr = (key) => {
      if (!Array.isArray(data[key])) { err(key, `${key} 必須為陣列`); return []; }
      return data[key];
    };
    const bands = arr('bands');
    const bandSet = new Set();
    bands.forEach((b, i) => { if (!isId(b)) err(`bands[${i}]`, '頻段必須為非空字串'); else if (bandSet.has(b)) err(`bands[${i}]`, `頻段重複：${b}`); else bandSet.add(b); });
    if (Array.isArray(data.bands) && bands.length === 0) err('bands', '至少一個頻段');

    const satIds = new Set();
    arr('satellites').forEach((s, i) => {
      const p = `satellites[${i}]`;
      if (!isObj(s)) { err(p, '衛星必須為物件'); return; }
      if (!isId(s.id)) err(`${p}.id`, '衛星 id 必須為非空字串');
      else if (satIds.has(s.id)) err(`${p}.id`, `衛星 id 重複：${s.id}`);
      else satIds.add(s.id);
      if (s.color != null && typeof s.color !== 'string') err(`${p}.color`, '顏色必須為字串');
    });

    const stIds = new Set(), antIds = new Set();
    arr('stations').forEach((st, i) => {
      const p = `stations[${i}]`;
      if (!isObj(st)) { err(p, '地面站必須為物件'); return; }
      if (!isId(st.id)) err(`${p}.id`, '地面站 id 必須為非空字串');
      else if (stIds.has(st.id)) err(`${p}.id`, `地面站 id 重複：${st.id}`);
      else stIds.add(st.id);
      if (st.angleDeg != null && typeof st.angleDeg !== 'number') err(`${p}.angleDeg`, '角度必須為數字');
      if (!Array.isArray(st.antennas)) { err(`${p}.antennas`, 'antennas 必須為陣列'); return; }
      st.antennas.forEach((a, j) => {
        const q = `${p}.antennas[${j}]`;
        if (!isObj(a)) { err(q, '天線必須為物件'); return; }
        if (!isId(a.id)) err(`${q}.id`, '天線 id 必須為非空字串');
        else if (antIds.has(a.id)) err(`${q}.id`, `天線 id 重複：${a.id}`);
        else antIds.add(a.id);
        if (!isId(a.band)) err(`${q}.band`, `頻段必須為非空字串：${fmt(a.band)}`); else if (!bandSet.has(a.band)) err(`${q}.band`, `頻段不存在：${fmt(a.band)}`);
        if (a.calibMin != null && !isNonNegInt(a.calibMin)) err(`${q}.calibMin`, '天線校準必須為非負整數或 null');
      });
    });

    arr('visibility').forEach((v, i) => {
      const p = `visibility[${i}]`;
      if (!isObj(v)) { err(p, '時窗必須為物件'); return; }
      if (!isId(v.sat)) err(`${p}.sat`, `衛星 id 必須為非空字串：${fmt(v.sat)}`); else if (!satIds.has(v.sat)) err(`${p}.sat`, `衛星不存在：${fmt(v.sat)}`);
      if (!isId(v.station)) err(`${p}.station`, `地面站 id 必須為非空字串：${fmt(v.station)}`); else if (!stIds.has(v.station)) err(`${p}.station`, `地面站不存在：${fmt(v.station)}`);
      checkWindow(v, p, H, err);
    });

    const reqIds = new Set();
    arr('requests').forEach((r, i) => {
      const p = `requests[${i}]`;
      if (!isObj(r)) { err(p, '需求必須為物件'); return; }
      if (!isId(r.id)) err(`${p}.id`, '需求 id 必須為非空字串');
      else if (reqIds.has(r.id)) err(`${p}.id`, `需求 id 重複：${r.id}`);
      else reqIds.add(r.id);
      if (!isId(r.sat)) err(`${p}.sat`, `衛星 id 必須為非空字串：${fmt(r.sat)}`); else if (!satIds.has(r.sat)) err(`${p}.sat`, `衛星不存在：${fmt(r.sat)}`);
      if (!isId(r.band)) err(`${p}.band`, `頻段必須為非空字串：${fmt(r.band)}`); else if (!bandSet.has(r.band)) err(`${p}.band`, `頻段不存在：${fmt(r.band)}`);
      if (!isPosInt(r.durMin)) err(`${p}.durMin`, '時長必須為正整數');
      checkWindow(r, p, H, err);
    });

    return { ok: errors.length === 0, errors };
  }

  function checkWindow(w, p, H, err) {
    if (!isInt(w.start)) err(`${p}.start`, 'start 必須為整數');
    if (!isInt(w.end)) err(`${p}.end`, 'end 必須為整數');
    if (isInt(w.start) && isInt(w.end)) {
      if (w.start < 0) err(`${p}.start`, 'start 不得小於 0');
      if (w.start >= w.end) err(`${p}.start`, 'start 必須小於 end');
      if (H != null && w.end > H) err(`${p}.end`, `end 不得大於 H=${H}`);
    }
  }

  // ---------- normalize (§2.1 / §3) ----------
  // 僅接受通過 validateData 的資料；回傳不可變快照（Map 索引、visibility 合併、校準解析）。
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
        antennas.push(Object.freeze({ id: a.id, station: st.id, band: a.band, calib }));
      });
    });
    // visibility：Map<sat, Map<station, [[s,e],...]>>，合併重疊／相鄰
    const visBySat = new Map();
    d.visibility.forEach((w) => {
      if (!visBySat.has(w.sat)) visBySat.set(w.sat, new Map());
      const m = visBySat.get(w.sat);
      if (!m.has(w.station)) m.set(w.station, []);
      m.get(w.station).push([w.start, w.end]);
    });
    const visibilityMerged = [];
    visBySat.forEach((m, sat) => {
      m.forEach((segs, station) => {
        segs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const merged = [];
        segs.forEach(([s, e]) => {
          const last = merged[merged.length - 1];
          if (last && s <= last[1]) last[1] = Math.max(last[1], e);
          else merged.push([s, e]);
        });
        m.set(station, merged.map((x) => Object.freeze(x)));
        merged.forEach(([start, end]) => visibilityMerged.push({ sat, station, start, end }));
      });
    });
    const norm = {
      meta: d.meta, bands: d.bands.slice(),
      satellites: d.satellites, stations: d.stations, requests: d.requests,
      H, calibDefault, antennas,
      antById: new Map(antennas.map((a) => [a.id, a])),
      reqById: new Map(d.requests.map((r) => [r.id, r])),
      satById: new Map(d.satellites.map((s) => [s.id, s])),
      visBySat, visibilityMerged,
    };
    deepFreeze(norm);
    return norm;
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !(o instanceof Map) && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach((k) => deepFreeze(o[k]));
    }
    return o;
  }

  function expandAntennas(norm) { return norm.antennas.slice(); }

  function visSegments(norm, sat, station) {
    const m = norm.visBySat.get(sat);
    return (m && m.get(station)) || [];
  }

  // ---------- feasibleStarts (§3) ----------
  function feasibleStarts(norm, reqId, antId) {
    const r = norm.reqById.get(reqId); const a = norm.antById.get(antId);
    if (!r || !a || r.band !== a.band) return [];
    const out = [];
    const d = r.durMin;
    visSegments(norm, r.sat, a.station).forEach(([vs, ve]) => {
      const lo = Math.max(r.start, vs, 0);
      const hi = Math.min(r.end, ve, norm.H) - d;   // [t, t+d) ⊆ 交集；t+d == end 合法
      for (let t = lo; t <= hi; t++) out.push(t);
    });
    return out;
  }

  function inWindows(norm, r, a, t) {
    const d = r.durMin;
    if (t < 0 || t + d > norm.H || t < r.start || t + d > r.end) return false;
    return visSegments(norm, r.sat, a.station).some(([vs, ve]) => t >= vs && t + d <= ve);
  }

  // ---------- checkFeasible (§3) ----------
  // rule ∈ 1|2|3|4|5|'window'|'schema'|'duplicate-request'；依 (rule, reqs) 去重（JSON 鍵）。
  function checkFeasible(norm, schedule) {
    const viol = [];
    const seen = new Set();
    const add = (rule, reqs, msg) => {
      const sorted = reqs.slice().sort();
      const key = JSON.stringify([rule, sorted]);
      if (seen.has(key)) return;
      seen.add(key);
      viol.push({ rule, reqs: sorted, msg });
    };
    if (!Array.isArray(schedule)) return { ok: false, violations: [{ rule: 'schema', reqs: [], msg: 'schedule 必須為陣列' }] };

    const tasks = [];
    const seenReq = new Set();
    schedule.forEach((it, i) => {
      const label = isObj(it) && isId(it.req) ? it.req : `#${i}`;
      if (!isObj(it)) { add('schema', [label], `第 ${i} 筆不是物件`); return; }
      const r = isId(it.req) ? norm.reqById.get(it.req) : undefined;
      const a = isId(it.antenna) ? norm.antById.get(it.antenna) : undefined;
      if (!r) { add('schema', [label], isId(it.req) ? `未知需求：${fmt(it.req)}` : `需求 id 型別錯誤：${fmt(it.req)}`); return; }
      if (!a) { add('schema', [r.id], isId(it.antenna) ? `未知天線：${fmt(it.antenna)}` : `天線 id 型別錯誤：${fmt(it.antenna)}`); return; }
      if (!isNonNegInt(it.start)) { add('schema', [r.id], `起始必須為非負整數：${fmt(it.start)}`); return; }
      if (seenReq.has(r.id)) { add('duplicate-request', [r.id], `需求重複排入：${r.id}`); return; }
      seenReq.add(r.id);
      tasks.push({ req: r, ant: a, start: it.start, end: it.start + r.durMin });
    });

    tasks.forEach((t) => {
      if (t.req.band !== t.ant.band) add(5, [t.req.id], `頻段不相容：${t.req.id}(${t.req.band}) → ${t.ant.id}(${t.ant.band})`);
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
  // 結構非法（非陣列／未知 id／重複）的筆不計入；回傳 feasible=false 與 error。永不產生 NaN。
  function score(norm, schedule) {
    const n = norm.requests.length;
    if (!Array.isArray(schedule)) return { assigned: 0, totalWait: 0, objective: 0, feasible: false, error: 'schedule 必須為陣列' };
    const fe = checkFeasible(norm, schedule);
    if (n === 0) return { assigned: 0, totalWait: 0, objective: 0, feasible: fe.ok };
    const seenReq = new Set();
    let assigned = 0, totalWait = 0;
    schedule.forEach((it) => {
      if (!isObj(it) || !isId(it.req) || !isId(it.antenna)) return;
      const r = norm.reqById.get(it.req);
      if (!r || !norm.antById.has(it.antenna) || !isNonNegInt(it.start) || seenReq.has(r.id)) return;
      seenReq.add(r.id);
      assigned += 1;
      totalWait += it.start - r.start;   // 可行時 ≥ 0；罰則模式可能為負（僅 raw fitness）
    });
    const objective = assigned - totalWait / (n * norm.H + 1);
    const out = { assigned, totalWait, objective, feasible: fe.ok };
    const structural = fe.violations.find((v) => v.rule === 'schema' || v.rule === 'duplicate-request');
    if (structural) out.error = structural.msg;
    return out;
  }

  function compareScores(a, b) {
    if (a.assigned !== b.assigned) return a.assigned - b.assigned;
    return b.totalWait - a.totalWait;
  }

  // ---------- greedyDecode (§3 / §5.1) ----------
  function greedyDecode(norm, order, antennaPref) {
    const pref = antennaPref instanceof Map ? antennaPref : new Map(Object.entries(antennaPref || {}));
    const schedule = [];
    const placed = [];
    order.forEach((reqId) => {
      const r = norm.reqById.get(reqId);
      if (!r) return;
      const compat = norm.antennas.filter((a) => a.band === r.band);
      const p = pref.get(reqId);
      const tryList = p && compat.some((a) => a.id === p)
        ? [compat.find((a) => a.id === p)].concat(compat.filter((a) => a.id !== p))
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
        if (t < p.end + c && p.start < end + c) return false;
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

  // ---------- 隨機實例產生器（§3；seeded，可重現） ----------
  // opts: { nSat, nStation, nAntennaPerStation, nReq, windowDensity, bands, H, calibDefaultMin }
  function generateInstance(seed, opts) {
    opts = opts || {};
    const rnd = mulberry32(seed >>> 0);
    const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)); // [lo, hi]
    const nSat = Math.max(1, opts.nSat || 4), nSt = Math.max(1, opts.nStation || 2), nAnt = Math.max(1, opts.nAntennaPerStation || 2);
    const nReq = Math.max(1, opts.nReq || 12), density = Math.min(1, Math.max(0, opts.windowDensity == null ? 0.7 : opts.windowDensity));
    const bands = (opts.bands && opts.bands.length ? opts.bands : ['S', 'X']).map(String);
    const H = Math.max(10, opts.H || 120), calib = opts.calibDefaultMin == null ? 10 : opts.calibDefaultMin;
    const PAL = ['#4f8ef7', '#f28b5b', '#b48ee0', '#3ccf8e', '#f5b64c', '#e05c8e', '#52c7d8', '#9aa84b'];
    const satellites = Array.from({ length: nSat }, (_, i) => ({ id: 'SAT_' + (i + 1), color: PAL[i % PAL.length] }));
    const stations = Array.from({ length: nSt }, (_, i) => ({ id: 'GS_' + (i + 1), angleDeg: Math.round(360 * i / nSt), antennas: [] }));
    stations.forEach((st) => { for (let k = 0; k < nAnt; k++) { const b = bands[k % bands.length]; st.antennas.push({ id: `${st.id}-${b}${k >= bands.length ? k + 1 : ''}`, band: b, calibMin: null }); } });
    const visibility = [];
    satellites.forEach((s) => {
      let any = false;
      stations.forEach((st) => {
        if (rnd() < density) { const len = ri(8, 15), start = ri(0, Math.max(0, H - len)); visibility.push({ sat: s.id, station: st.id, start, end: start + len }); any = true; }
      });
      if (!any) { const st = stations[ri(0, nSt - 1)]; const len = ri(8, 15), start = ri(0, Math.max(0, H - len)); visibility.push({ sat: s.id, station: st.id, start, end: start + len }); }
    });
    const requests = [];
    for (let i = 0; i < nReq; i++) {
      const s = satellites[ri(0, nSat - 1)];
      const vis = visibility.filter((v) => v.sat === s.id);
      const w = vis[ri(0, vis.length - 1)];
      const dur = ri(2, 5);
      const slack = ri(2, 8);
      const start = Math.max(0, w.start - ri(0, 3));
      const end = Math.min(H, Math.max(start + dur, w.start + dur + slack));
      requests.push({ id: 'R' + (i + 1), sat: s.id, band: bands[ri(0, bands.length - 1)], durMin: dur, start, end });
    }
    return { meta: { name: `random seed=${seed} n=${nReq}`, timeOrigin: '10:00', horizonMin: H, calibDefaultMin: calib }, bands, satellites, stations, visibility, requests };
  }

  function minutesToHHMM(norm, m) {
    const [h0, m0] = String(norm.meta.timeOrigin || '00:00').split(':').map(Number);
    const total = h0 * 60 + m0 + m;
    const h = ((Math.floor(total / 60) % 24) + 24) % 24, mm = ((total % 60) + 60) % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  SGS.engine = {
    validateData, normalize, expandAntennas, feasibleStarts, checkFeasible, score, compareScores,
    greedyDecode, mulberry32, minutesToHHMM, visSegments, fmt, generateInstance,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
