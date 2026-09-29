/*
 * 암 Current Ramp Calibration — 순수 로직 모듈 (화면·저장소와 무관)
 * 용어는 수강생 제출 기획서(docs/source/02_…해제본.docx)를 따릅니다.
 * 브라우저에서는 window.CRLogic, Node(테스트)에서는 module.exports 로 씁니다.
 * ES module 이 아닌 이유: index.html 을 로컬 파일(file://)로 열면
 * 브라우저가 module 스크립트를 막기 때문입니다.
 */
(function (root) {
  'use strict';

  // ── Zone · 파라미터 구조 (제출 기획서 2장) ──────────────────────
  var ZONES = [
    { id: 1, label: 'Zone 1', range: '0~30%', lo: 0, hi: 30 },
    { id: 2, label: 'Zone 2', range: '30~50%', lo: 30, hi: 50 },
    { id: 3, label: 'Zone 3', range: '50~70%', lo: 50, hi: 70 },
    { id: 4, label: 'Zone 4', range: '70~100%', lo: 70, hi: 100 }
  ];
  var DIRS = ['UP', 'DOWN'];
  var EVENTS = ['start', 'stop'];
  var EVENT_LABEL = { start: 'Start Ramp', stop: 'Stop(End) Ramp' };
  var EVENT_ECU = { start: 'Start Current Ramp', stop: 'End Current Ramp' };

  function paramKey(dir, zone, evt) { return dir + '_' + zone + '_' + evt; }
  var PARAM_KEYS = [];
  DIRS.forEach(function (d) { ZONES.forEach(function (z) { EVENTS.forEach(function (e) { PARAM_KEYS.push(paramKey(d, z.id, e)); }); }); });
  function parseKey(k) { var p = String(k).split('_'); return { dir: p[0], zone: +p[1], evt: p[2] }; }
  function paramLabel(k) {
    var p = parseKey(k);
    return p.dir + ' ' + ZONES[p.zone - 1].range + ' ' + EVENT_ECU[p.evt];
  }

  // 정확히 30/50/70% 는 위쪽 Zone 에 넣습니다 (가정 — 기획서 10장 4번 확인 필요)
  function zoneOf(pct) {
    if (!(pct >= 30)) return 1;
    if (pct < 50) return 2;
    if (pct < 70) return 3;
    return 4;
  }
  // 100% Endpoint 는 독립 파라미터가 없고 Zone 4 값을 씁니다 (AC-02)
  function endpointValue(values, dir, evt) { return values[paramKey(dir, 4, evt)]; }

  // ── 설정 기본값 — 전부 (가정). 실제 사양·로그를 받으면 설정 화면에서 바꿉니다 ──
  function defaultSettings() {
    return {
      param: { min: 10, max: 1000, step: 1, ecuScale: 1, ecuDecimals: 0 },
      continuityPct: 50,      // 인접 Zone 값 차이가 큰 쪽의 이 % 를 넘으면 경고
      maxDeltaPct: 20,        // 추천 1회 변화폭 한도(현재값 대비 %)
      profile: { amp: 100, hold: 1.0 }, // 그래프 표시용: 목표 Current(%)·유지 시간(s)
      signal: { dt: 0.01 },   // 목표 Sampling (제출 기획서: 10 ms)
      quality: { maxFillSamples: 3, gapFactor: 5 }, // 이어 계산할 최대 결측 행 수, 공백 판정 배수
      detect: { smoothWin: 5, startThr: 3, stopThr: 1.5, hold: 0.05, pre: 1.0, post: 1.5, onsetFrac: 0.05, minStepFrac: 0.1, settleBand: 0.1, settleTail: 0.2 },
      shock: { refDpdt: 400, refD2pitch: 60, wDpdt: 0.5, wD2pitch: 0.5 },
      cautionPct: 10,         // 허용 한계 안쪽 이 % 이내면 CAUTION
      safety: { pressureMax: null, pitchAbsMax: null },
      recommend: { minLabels: 3, percentile: 75 },
      // Zone별 점수 배율 (2026-09-29 오전 2차 요청). 1 이면 예전 판정과 같습니다
      zoneWeight: defaultZoneWeights(),
      user: ''
    };
  }
  // ── Zone별 점수 배율 ─────────────────────────────────────────────
  // 측정값에 배율을 곱한 값을 허용 상한과 비교합니다. 1 보다 크면 그 Zone 에서 그 항목을 더 엄하게,
  // 1 보다 작으면 느슨하게, 0 이면 그 항목을 판정에서 빼는 것과 같습니다.
  var WEIGHT_ITEMS = ['stab', 'shock', 'resp'];
  var WEIGHT_MAX = 10;
  function defaultZoneWeights() {
    var o = {};
    ZONES.forEach(function (z) { o[z.id] = { stab: 1, shock: 1, resp: 1 }; });
    return o;
  }
  // 저장본·백업·가져온 값을 정리합니다. 숫자가 아니거나 0~10 밖이면 1 로 둡니다
  function normalizeZoneWeights(src) {
    var o = defaultZoneWeights();
    if (!src || typeof src !== 'object') return o;
    ZONES.forEach(function (z) {
      var r = src[z.id] || src[String(z.id)];
      if (!r || typeof r !== 'object') return;
      WEIGHT_ITEMS.forEach(function (k) { var v = num(r[k]); if (isNum(v) && v >= 0 && v <= WEIGHT_MAX) o[z.id][k] = v; });
    });
    return o;
  }
  function zoneWeights(s, zone) {
    var w = s && s.zoneWeight && s.zoneWeight[zone];
    return {
      stab: w && isNum(w.stab) ? w.stab : 1,
      shock: w && isNum(w.shock) ? w.shock : 1,
      resp: w && isNum(w.resp) ? w.resp : 1
    };
  }
  function isDefaultWeights(s) {
    return ZONES.every(function (z) { var w = zoneWeights(s, z.id); return w.stab === 1 && w.shock === 1 && w.resp === 1; });
  }
  function mergeSettings(saved) {
    var d = defaultSettings();
    if (!saved || typeof saved !== 'object') return d;
    Object.keys(d).forEach(function (k) {
      if (saved[k] == null) return;
      if (typeof d[k] === 'object' && d[k] !== null) {
        Object.keys(d[k]).forEach(function (j) { if (saved[k][j] !== undefined) d[k][j] = saved[k][j]; });
      } else d[k] = saved[k];
    });
    d.zoneWeight = normalizeZoneWeights(saved.zoneWeight);
    return d;
  }

  // ── 수 처리 ──────────────────────────────────────────────────
  function num(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    var s = String(v).trim().replace(/,/g, '');
    if (s === '') return NaN;
    return Number(s);
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function round(v, d) { if (!isNum(v)) return v; var m = Math.pow(10, d == null ? 3 : d); return Math.round(v * m) / m; }
  function snap(v, step) { if (!step) return v; return round(Math.round(v / step) * step, 6); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function percentile(arr, p) {
    var a = arr.filter(isNum).slice().sort(function (x, y) { return x - y; });
    if (!a.length) return NaN;
    var pos = (a.length - 1) * p / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }

  // ── Ramp 값 환산: 기울기(%/sec) ↔ ECU 값 ↔ 그래프 시간 (AC-03) ──
  // ECU 값 = 기울기 × ecuScale (가정 — 실제 환산식은 기획서 10장 2번)
  function slopeToEcu(slope, s) { return round(slope * s.param.ecuScale, s.param.ecuDecimals); }
  function ecuToSlope(ecu, s) { return snap(ecu / s.param.ecuScale, s.param.step); }
  function slopeToTime(slope, amp) { return amp / slope; }
  function timeToSlope(t, amp, s) { return snap(amp / t, s.param.step); }
  // 그래프 점: Start 로 0 → amp, hold 유지, Stop 으로 amp → 0
  function profilePoints(startSlope, stopSlope, prof) {
    var t1 = prof.amp / startSlope, t2 = t1 + prof.hold, t3 = t2 + prof.amp / stopSlope;
    return [[0, 0], [t1, prof.amp], [t2, prof.amp], [t3, 0]];
  }

  // ── Calibration Set 검증 (Min/Max · Step · 연속성) ─────────────
  function validateSet(values, s) {
    var issues = [];
    PARAM_KEYS.forEach(function (k) {
      var v = values[k];
      if (!isNum(v)) { issues.push({ key: k, level: 'error', code: 'missing', msg: paramLabel(k) + ': 값이 없습니다' }); return; }
      if (v < s.param.min || v > s.param.max) issues.push({ key: k, level: 'error', code: 'range', msg: paramLabel(k) + ': ' + v + ' 이(가) 허용 범위 ' + s.param.min + '~' + s.param.max + ' 밖입니다' });
      if (s.param.step && Math.abs(snap(v, s.param.step) - v) > 1e-9) issues.push({ key: k, level: 'warn', code: 'step', msg: paramLabel(k) + ': ' + v + ' 이(가) 변화 Step ' + s.param.step + ' 단위가 아닙니다' });
    });
    DIRS.forEach(function (d) {
      EVENTS.forEach(function (e) {
        for (var z = 1; z < 4; z++) {
          var a = values[paramKey(d, z, e)], b = values[paramKey(d, z + 1, e)];
          if (!isNum(a) || !isNum(b)) continue;
          var diff = Math.abs(a - b) / Math.max(a, b) * 100;
          if (diff > s.continuityPct) issues.push({ key: paramKey(d, z + 1, e), level: 'warn', code: 'continuity', msg: d + ' ' + EVENT_LABEL[e] + ': ' + ZONES[z - 1].range + '(' + a + ') 와 ' + ZONES[z].range + '(' + b + ') 차이 ' + round(diff, 1) + '% — 경계 연속성 기준 ' + s.continuityPct + '% 초과' });
        }
      });
    });
    return { ok: !issues.some(function (i) { return i.level === 'error'; }), issues: issues };
  }

  // ── 버전 · 이력 ───────────────────────────────────────────────
  function nextVersionId(versions) {
    var max = 0;
    (versions || []).forEach(function (v) { var m = /^V(\d+)$/.exec(v.id); if (m) max = Math.max(max, +m[1]); });
    var n = String(max + 1); while (n.length < 3) n = '0' + n;
    return 'V' + n;
  }
  function diffSets(a, b) {
    return PARAM_KEYS.map(function (k) {
      var x = a ? a[k] : NaN, y = b ? b[k] : NaN;
      return { key: k, a: x, b: y, delta: isNum(x) && isNum(y) ? round(y - x, 3) : NaN, changed: x !== y };
    });
  }
  function changeEntries(before, after, meta) {
    var out = [];
    PARAM_KEYS.forEach(function (k) {
      if (before[k] !== after[k]) out.push({ time: meta.time, user: meta.user || '', key: k, from: before[k], to: after[k], source: meta.source || '', reason: meta.reason || '' });
    });
    return out;
  }

  // ── CSV ───────────────────────────────────────────────────────
  function detectDelimiter(line) {
    var c = { ',': 0, ';': 0, '\t': 0 };
    for (var i = 0; i < line.length; i++) if (c[line[i]] !== undefined) c[line[i]]++;
    var best = ',';
    Object.keys(c).forEach(function (k) { if (c[k] > c[best]) best = k; });
    return best;
  }
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    var firstLine = text.split(/\r?\n/, 1)[0] || '';
    var d = detectDelimiter(firstLine);
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }
  function csvCell(v) {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '';
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(header, rows) {
    return [header].concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }
  // 머리행이 숫자가 아닌 첫 행이라고 보고, 단위 행(숫자 아님)이 이어지면 건너뜁니다
  function tableFromRows(rows) {
    if (!rows.length) return { header: [], data: [] };
    var header = rows[0].map(function (h) { return String(h).trim(); });
    var start = 1;
    while (start < rows.length && rows[start].every(function (c) { return String(c).trim() === '' || !isFinite(num(c)); })) start++;
    return { header: header, data: rows.slice(start), skipped: start - 1 };
  }

  // ── Channel Mapping (제출 기획서 4.3) ─────────────────────────
  // 원단위 → 분석단위 변환 (s/ms, A/mA, MPa/bar, rad/deg)
  var UNITS = {
    s: { to: 's', f: 1, text: 's' }, ms: { to: 's', f: 0.001, text: 'ms ÷ 1,000' },
    '%': { to: '%', f: 1, text: '%' },
    mA: { to: 'mA', f: 1, text: 'mA' }, A: { to: 'mA', f: 1000, text: 'A × 1,000' },
    bar: { to: 'bar', f: 1, text: 'bar' }, MPa: { to: 'bar', f: 10, text: 'MPa × 10' },
    deg: { to: 'deg', f: 1, text: 'deg' }, rad: { to: 'deg', f: 180 / Math.PI, text: 'rad × 180/π' },
    rpm: { to: 'rpm', f: 1, text: 'rpm' }, degC: { to: 'degC', f: 1, text: '°C' },
    kg: { to: 'kg', f: 1, text: 'kg' }, t: { to: 'kg', f: 1000, text: 't × 1,000' },
    raw: { to: 'raw', f: 1, text: '원단위 그대로' }
  };
  // 표준 신호. mode 가 있으면 그 Current 모드에서만 보입니다.
  var STD_SIGNALS = [
    { id: 'time', label: 'Time / Timestamp', need: 'req', units: ['s', 'ms'], alias: /(^|[^a-z])(time|timestamp)([^a-z]|$)|시간/i, range: 'mono' },
    { id: 'arm', label: 'Arm Angle Percent', need: 'req', units: ['%'], alias: /(arm|boom).*(angle|percent|pct)|(angle|percent).*(arm|boom)|암.*각/i, range: [-1, 101] },
    { id: 'curUp', label: 'Current — UP', need: 'req', units: ['mA', 'A'], kind: 'current', mode: 'split', dir: 'UP', alias: /(eppr|current|cur|전류).*(up|raise|상승)|(up|raise).*(eppr|current)/i, range: [0, Infinity] },
    { id: 'curUp2', label: 'Current — UP 추가 채널', need: 'opt', units: ['mA', 'A'], kind: 'current', mode: 'split', dir: 'UP', noAuto: true },
    { id: 'curDown', label: 'Current — DOWN', need: 'req', units: ['mA', 'A'], kind: 'current', mode: 'split', dir: 'DOWN', alias: /(eppr|current|cur|전류).*(down|lower|하강)|(down|lower).*(eppr|current)/i, range: [0, Infinity] },
    { id: 'curDown2', label: 'Current — DOWN 추가 채널', need: 'opt', units: ['mA', 'A'], kind: 'current', mode: 'split', dir: 'DOWN', noAuto: true },
    { id: 'cur', label: 'Current — 단일', need: 'req', units: ['mA', 'A'], kind: 'current', mode: 'single', dir: 'ALL', alias: /eppr|current|전류/i },
    { id: 'cur2', label: 'Current — 단일 추가 채널', need: 'opt', units: ['mA', 'A'], kind: 'current', mode: 'single', dir: 'ALL', noAuto: true },
    { id: 'headP', label: 'Arm Cylinder Head Pressure', need: 'req', units: ['bar', 'MPa'], alias: /head.*press|press.*head|헤드.*압/i, range: [-5, Infinity] },
    { id: 'pitch', label: 'Pitch Angle', need: 'req', units: ['deg', 'rad'], alias: /pitch|피치/i, range: [-90, 90] },
    { id: 'rpm', label: 'Engine RPM', need: 'rec', units: ['rpm'], alias: /rpm|eng.*speed/i, range: [0, 5000] },
    { id: 'oilTemp', label: 'Hydraulic Oil Temperature', need: 'rec', units: ['degC'], alias: /oil.*temp|유온/i },
    { id: 'payload', label: 'Payload / Bucket Load', need: 'rec', units: ['kg', 't'], alias: /payload|bucket.*load|하중/i },
    { id: 'joystick', label: 'Joystick Position / Direction', need: 'opt', units: ['raw'], alias: /joy|lever|레버/i },
    { id: 'rideCtrl', label: 'Ride Control State', need: 'opt', units: ['raw'], alias: /ride/i },
    { id: 'rodP', label: 'Rod Pressure', need: 'opt', units: ['bar', 'MPa'], alias: /rod.*press/i }
  ];
  var NEED_TEXT = { req: '필수', rec: '선택 권장', opt: '선택' };
  function sigDef(id) { for (var i = 0; i < STD_SIGNALS.length; i++) if (STD_SIGNALS[i].id === id) return STD_SIGNALS[i]; return null; }
  function signalsForMode(mode) { return STD_SIGNALS.filter(function (s) { return !s.mode || s.mode === mode; }); }
  // 헤더 끝의 [단위] 를 읽습니다. 표기 차이는 표준 단위 이름으로 맞춥니다.
  function headerUnit(h) {
    var m = /\[([^\]]*)\]\s*$/.exec(String(h));
    if (!m) return '';
    var u = m[1].trim(), l = u.toLowerCase();
    var map = { s: 's', sec: 's', ms: 'ms', '%': '%', ma: 'mA', a: 'A', bar: 'bar', mpa: 'MPa', deg: 'deg', '°': 'deg', rad: 'rad', rpm: 'rpm', '°c': 'degC', degc: 'degC', kg: 'kg', t: 't', mv: 'mV', v: 'V' };
    return map[l] || u;
  }
  // 열 통계: 숫자 비율, 최소·최대, 단조 증가 여부, 첫 값
  function columnStats(table) {
    return table.header.map(function (h, j) {
      var n = table.data.length, ok = 0, mn = Infinity, mx = -Infinity, mono = true, prev = NaN;
      for (var r = 0; r < n; r++) {
        var v = num(table.data[r][j]);
        if (!isNum(v)) continue;
        ok++; if (v < mn) mn = v; if (v > mx) mx = v;
        if (isNum(prev) && v <= prev) mono = false;
        prev = v;
      }
      return { header: h, index: j, unit: headerUnit(h), numeric: n ? ok / n : 0, min: ok ? mn : NaN, max: ok ? mx : NaN, mono: mono && ok > 1 };
    });
  }
  // 헤더 하나가 표준 신호에 얼마나 맞는지: 별칭 +2, 단위 호환 +2(비호환이면 제외), 범위 +1/−2
  function scoreHeader(sg, st) {
    if (!sg.alias || !sg.alias.test(st.header)) return null;
    var score = 2, why = ['이름이 별칭 사전과 일치'];
    if (st.unit) {
      if (sg.units.indexOf(st.unit) < 0) return { score: -1, why: ['단위 [' + st.unit + '] 가 ' + sg.label + ' 와 맞지 않음'] };
      score += 2; why.push('단위 [' + st.unit + '] 호환');
    }
    if (st.numeric < 0.5) return { score: -1, why: ['숫자 값이 절반 미만'] };
    if (sg.range === 'mono') {
      if (st.mono) { score += 1; why.push('값이 계속 증가'); } else { score -= 2; why.push('값이 단조 증가가 아님'); }
    } else if (sg.range && isNum(st.min)) {
      if (st.min >= sg.range[0] && st.max <= sg.range[1]) { score += 1; why.push('값 범위 ' + round(st.min, 2) + '~' + round(st.max, 2) + ' 적합'); }
      else { score -= 2; why.push('값 범위 ' + round(st.min, 2) + '~' + round(st.max, 2) + ' 가 예상 밖'); }
    }
    return { score: score, why: why };
  }
  function guessRole(h) {
    if (/cmd|command|ref|지령/i.test(h)) return 'command';
    if (/actual|feedback|fb|coil|실측/i.test(h)) return 'actual';
    return '';
  }
  function emptyMapping(mode) {
    return { mode: mode || 'split', rows: {}, cal: { UP: { i0: null, i100: null }, DOWN: { i0: null, i100: null }, ALL: { i0: null, i100: null } }, excludeFirstRow: false, confirmed: false, profileId: '', profileVersion: 0 };
  }
  // 자동추천 — 결과는 모두 「제안」이며 confirmed=false 입니다.
  function recommendMapping(stats, mode) {
    var m = emptyMapping(mode);
    var taken = {};
    signalsForMode(m.mode).forEach(function (sg) {
      var row = { header: '', role: '', unit: '', confirmed: false, reason: '', candidates: [], ambiguous: false };
      m.rows[sg.id] = row;
      if (sg.noAuto) { row.reason = '자동추천 없음 — 필요하면 직접 선택'; return; }
      var cands = [], unitOff = [];
      stats.forEach(function (st) {
        if (taken[st.header]) return;
        var sc = scoreHeader(sg, st);
        if (sc && sc.score > 0) cands.push({ header: st.header, score: sc.score, why: sc.why });
        else if (sc && st.unit && sg.units.indexOf(st.unit) < 0) unitOff.push(st.header);
      });
      cands.sort(function (a, b) { return b.score - a.score; });
      row.candidates = cands.map(function (c) { return c.header; });
      // 이름은 맞는데 단위가 달라 뺀 열(예: 실제 로그의 AngleSensorVoltage_Arm[mV] 는 Arm % 가 아니라 원시 전압)
      // 은 자동 선택하지 않고 이유에 남깁니다 — 어느 쪽이 맞는지는 사람이 확인합니다 (2026-09-29 실제 로그 확인)
      row.unitRejected = unitOff;
      var offNote = unitOff.length ? ' · 이름은 맞지만 단위가 달라 뺀 열: ' + unitOff.join(', ') + ' — 어느 열이 맞는지 확인 필요' : '';
      if (!cands.length) { row.reason = '맞는 헤더 없음 — 미매핑' + offNote; return; }
      if (cands.length > 1 && cands[0].score === cands[1].score) {
        row.ambiguous = true;
        row.reason = '확인 필요 — 같은 점수 후보 ' + cands.filter(function (c) { return c.score === cands[0].score; }).map(function (c) { return c.header; }).join(', ') + offNote;
        return;
      }
      var best = cands[0], st = stats.filter(function (x) { return x.header === best.header; })[0];
      row.header = best.header; taken[best.header] = true;
      row.reason = '추천: ' + best.why.join(', ') + offNote;
      row.unit = st.unit && sg.units.indexOf(st.unit) >= 0 ? st.unit : (sg.units.length === 1 ? sg.units[0] : '');
      if (sg.kind === 'current') row.role = guessRole(best.header);
    });
    return m;
  }
  // 저장한 Mapping Profile 을 새 파일에 「제안」 상태로 되살립니다 (AC-18)
  function applyProfile(profile, stats) {
    var m = emptyMapping(profile.mode);
    m.cal = JSON.parse(JSON.stringify(profile.cal || m.cal));
    m.profileId = profile.id; m.profileVersion = profile.version;
    var byHeader = {}; stats.forEach(function (st) { byHeader[st.header] = st; });
    var changes = [];
    signalsForMode(m.mode).forEach(function (sg) {
      var pr = (profile.rows || {})[sg.id] || {};
      var row = { header: '', role: pr.role || '', unit: pr.unit || '', confirmed: false, reason: '', candidates: [], ambiguous: false };
      m.rows[sg.id] = row;
      if (!pr.header) { row.reason = 'Profile 에서 미매핑'; return; }
      var st = byHeader[pr.header];
      if (!st) { row.reason = '변경 — Profile 의 헤더 「' + pr.header + '」 가 이 파일에 없습니다'; row.changed = true; changes.push(sg.label + ': 헤더 없음'); return; }
      row.header = pr.header;
      row.reason = 'Profile 에서 복원 — 다시 확인하세요';
      if (pr.index != null && pr.index !== st.index) { row.reason += ' (열 위치 ' + (pr.index + 1) + ' → ' + (st.index + 1) + ')'; }
      if (st.unit && pr.headerUnit && st.unit !== pr.headerUnit) { row.changed = true; row.reason = '변경 — 헤더 단위 [' + pr.headerUnit + '] → [' + st.unit + '], 단위를 다시 고르세요'; row.unit = ''; changes.push(sg.label + ': 단위 변경'); }
    });
    var used = {}; Object.keys(m.rows).forEach(function (k) { if (m.rows[k].header) used[m.rows[k].header] = true; });
    var fresh = stats.filter(function (st) { return !used[st.header] && (profile.headers || []).indexOf(st.header) < 0; }).map(function (st) { return st.header; });
    if (fresh.length) changes.push('Profile 에 없던 새 헤더: ' + fresh.join(', '));
    return { mapping: m, changes: changes };
  }
  function mappingToProfile(m, stats, meta) {
    var rows = {};
    Object.keys(m.rows).forEach(function (k) {
      var r = m.rows[k], st = stats.filter(function (x) { return x.header === r.header; })[0];
      rows[k] = { header: r.header, index: st ? st.index : null, headerUnit: st ? st.unit : '', role: r.role, unit: r.unit, convert: r.unit ? UNITS[r.unit].text + ' → ' + UNITS[r.unit].to : '' };
    });
    return { id: meta.id, name: meta.name, version: meta.version, author: meta.author || '', confirmedAt: meta.time, mode: m.mode, rows: rows,
      cal: JSON.parse(JSON.stringify(m.cal)), headers: stats.map(function (s) { return s.header; }), excludeFirstRow: !!m.excludeFirstRow };
  }
  function calOk(c) { return c && isNum(num(c.i0)) && isNum(num(c.i100)) && num(c.i100) !== num(c.i0); }
  // 전류 % 보정이 방향별로 있는지
  function calibrationState(m) {
    if (m.mode === 'single') return { UP: calOk(m.cal.ALL), DOWN: calOk(m.cal.ALL) };
    return { UP: calOk(m.cal.UP), DOWN: calOk(m.cal.DOWN) };
  }

  // 매핑 검증 — errors 가 있으면 Mapping Confirm · 분석 시작을 막습니다 (AC-14, AC-15)
  function validateMapping(m) {
    var errors = [], warnings = [], seen = {};
    signalsForMode(m.mode).forEach(function (sg) {
      var r = m.rows[sg.id] || {};
      if (!r.header) {
        if (sg.need === 'req') errors.push(sg.label + ': 필수 신호가 미매핑입니다');
        else if (sg.need === 'rec') warnings.push(sg.label + ': 미매핑(선택) — 관련 보정·조건 비교가 제한됩니다');
        return;
      }
      if (seen[r.header]) warnings.push('「' + r.header + '」 가 ' + seen[r.header] + ' 와 ' + sg.label + ' 에 중복 연결되었습니다');
      else seen[r.header] = sg.label;
      if (!r.unit) (sg.need === 'req' ? errors : warnings).push(sg.label + ': 단위를 고르세요' + (sg.id === 'headP' ? ' (압력 단위는 추정으로 정하지 않습니다)' : ''));
      if (sg.kind === 'current' && !r.role) (sg.need === 'req' ? errors : warnings).push(sg.label + ': Command / Actual 역할을 지정하세요');
      if (sg.need === 'req' && !r.confirmed) errors.push(sg.label + ': 「확인」 체크가 필요합니다');
    });
    ['2'].forEach(function () {
      var pairs = m.mode === 'split' ? [['curUp', 'curUp2'], ['curDown', 'curDown2']] : [['cur', 'cur2']];
      pairs.forEach(function (p) {
        var a = m.rows[p[0]] || {}, b = m.rows[p[1]] || {};
        if (a.header && b.header && a.role && a.role === b.role) warnings.push(sigDef(p[0]).label + ' 와 추가 채널의 역할이 같습니다(' + a.role + ') — 둘 중 하나는 다른 역할이어야 각각 보존됩니다');
      });
    });
    var cs = calibrationState(m);
    if (!cs.UP || !cs.DOWN) warnings.push('전류 % 보정(I0·I100) 없음' + (m.mode === 'split' ? ' — ' + ['UP', 'DOWN'].filter(function (d) { return !cs[d]; }).join('·') : '') + ': mA·mA/s 로만 비교하고 %/sec 비교·추천은 막습니다');
    return { errors: errors, warnings: warnings, canConfirm: errors.length === 0 };
  }

  // 데이터 품질 검증 (제출 기획서 4.3 검증 항목, AC-17)
  function qualityReport(table, m, s) {
    var items = [], n = table.data.length, idx = {};
    table.header.forEach(function (h, i) { idx[h] = i; });
    var q = s.quality;
    // 첫 행 전 채널 0
    if (n && table.data[0].every(function (c) { return num(c) === 0; })) items.push({ level: 'warn', code: 'firstZero', where: '1행', msg: '첫 데이터 행이 전 채널 0 입니다 — 초기화 샘플일 수 있습니다. 자동 삭제하지 않으며, 「첫 행 분석 제외」로 처리 여부를 기록합니다' });
    signalsForMode(m.mode).forEach(function (sg) {
      var r = m.rows[sg.id]; if (!r || !r.header || idx[r.header] == null) return;
      var j = idx[r.header], bad = 0, firstBad = -1, run = 0, maxRun = 0, maxRunAt = -1, mn = Infinity, mx = -Infinity;
      for (var i = 0; i < n; i++) {
        var raw = table.data[i][j], v = num(raw);
        if (!isNum(v)) { bad++; if (firstBad < 0) firstBad = i; run++; if (run > maxRun) { maxRun = run; maxRunAt = i - run + 1; } }
        else { run = 0; if (v < mn) mn = v; if (v > mx) mx = v; }
      }
      if (bad) items.push({ level: maxRun > q.maxFillSamples ? 'error' : 'warn', code: 'missing', signal: sg.id, where: (firstBad + 2) + '행부터', msg: sg.label + ': 결측·숫자 변환 실패 ' + bad + '건(' + round(bad / n * 100, 2) + '%), 최장 연속 ' + maxRun + '행(' + (maxRunAt + 2) + '행~). ' + (maxRun > q.maxFillSamples ? '허용 길이 ' + q.maxFillSamples + '행 초과 구간의 이벤트는 NO DATA' : '허용 길이 이내 — 앞 값으로 이어 계산') });
      if (isNum(mn) && mn === mx) items.push({ level: 'warn', code: 'constant', signal: sg.id, msg: sg.label + ': 값이 전 구간 ' + mn + ' 로 고정입니다' });
      if (sg.id === 'arm' && isNum(mn) && (mn < 0 || mx > 100)) items.push({ level: 'warn', code: 'range', signal: sg.id, msg: 'Arm Angle Percent: 0~100% 밖의 값이 있습니다(최소 ' + round(mn, 2) + ', 최대 ' + round(mx, 2) + '). 잘라내지 않습니다' });
      if (isNum(mn)) items.push({ level: 'info', code: 'stats', signal: sg.id, msg: sg.label + ': ' + round(mn, 3) + ' ~ ' + round(mx, 3) + ' [' + (r.unit ? r.unit : '단위 미정') + ']' });
    });
    var tr = m.rows.time;
    if (tr && tr.header && idx[tr.header] != null) {
      var f = tr.unit ? UNITS[tr.unit].f : 1, j2 = idx[tr.header], dts = [], rev = 0, dup = 0, firstRev = -1;
      for (var k = 1; k < n; k++) {
        var a = num(table.data[k - 1][j2]), b = num(table.data[k][j2]);
        if (!isNum(a) || !isNum(b)) continue;
        var dt = (b - a) * f;
        if (dt < 0) { rev++; if (firstRev < 0) firstRev = k; } else if (dt === 0) { dup++; if (firstRev < 0) firstRev = k; } else dts.push(dt);
      }
      if (rev || dup) items.push({ level: 'warn', code: 'timeOrder', where: (firstRev + 2) + '행부터', msg: 'Time: 역전 ' + rev + '건, 중복 ' + dup + '건 — 해당 지점 주변 이벤트는 NO DATA' });
      if (dts.length) {
        var med = percentile(dts, 50), gaps = dts.filter(function (x) { return x > med * q.gapFactor; }).length;
        items.push({ level: 'info', code: 'dt', msg: 'Δt 최소 ' + round(Math.min.apply(null, dts) * 1000, 2) + ' ms · 중앙값 ' + round(med * 1000, 2) + ' ms · 최대 ' + round(Math.max.apply(null, dts) * 1000, 2) + ' ms (목표 ' + round(s.signal.dt * 1000, 2) + ' ms)' });
        if (Math.abs(med - s.signal.dt) > s.signal.dt * 0.1) items.push({ level: 'warn', code: 'dtTarget', msg: 'Δt 중앙값이 목표 ' + round(s.signal.dt * 1000, 2) + ' ms 와 10% 넘게 다릅니다. 실제 시간값으로 미분합니다' });
        if (gaps) items.push({ level: 'warn', code: 'gap', msg: 'Sampling 공백(Δt > 중앙값 × ' + q.gapFactor + ') ' + gaps + '곳 — 공백을 포함한 이벤트는 NO DATA' });
      }
    }
    return items;
  }

  // ── 신호 준비 · 파생 신호 (AC-10) ──────────────────────────────
  function column(table, name) {
    var i = table.header.indexOf(name);
    if (i < 0) return null;
    var out = new Array(table.data.length);
    for (var r = 0; r < table.data.length; r++) out[r] = num(table.data[r][i]);
    return out;
  }
  // 확정 매핑으로 분석단위 신호를 만듭니다. 원본 표는 고치지 않습니다.
  function buildSignals(table, m, s) {
    var from = m.excludeFirstRow ? 1 : 0;
    var t0 = { header: table.header, data: table.data.slice(from) };
    var n = t0.data.length, mask = new Array(n);
    for (var z = 0; z < n; z++) mask[z] = false;
    function conv(id) {
      var r = m.rows[id]; if (!r || !r.header) return null;
      var c = column(t0, r.header); if (!c) return null;
      var f = r.unit ? UNITS[r.unit].f : 1;
      return c.map(function (v) { return v * f; });
    }
    var t = conv('time');
    for (var i = 1; i < n; i++) if (!(t[i] > t[i - 1])) { mask[i] = true; mask[i - 1] = true; }
    var dts = []; for (var i2 = 1; i2 < n; i2++) if (t[i2] > t[i2 - 1]) dts.push(t[i2] - t[i2 - 1]);
    var med = percentile(dts, 50);
    for (var i3 = 1; i3 < n; i3++) if (t[i3] - t[i3 - 1] > med * s.quality.gapFactor) { mask[i3] = true; mask[i3 - 1] = true; }
    // 단위 변환의 부동소수 오차로 검출이 달라지지 않게 1 ns 단위로 맞춥니다
    var tStart = t[0]; t = t.map(function (v) { return Math.round((v - tStart) * 1e9) / 1e9; });
    var sig = { t: t, n: n, mask: mask, dtMedian: med, mode: m.mode, cal: calibrationState(m), cur: {}, curRole: {}, curUnit: {} };
    ['arm', 'headP', 'pitch'].forEach(function (id) { sig[id] = fillGaps(conv(id), mask, s.quality.maxFillSamples); });
    sig.p = sig.headP;
    // Current: 방향별 채널. Command 역할을 우선, 없으면 Actual. 분리 채널을 합치지 않습니다.
    var dirs = m.mode === 'split' ? { UP: ['curUp', 'curUp2'], DOWN: ['curDown', 'curDown2'] } : { UP: ['cur', 'cur2'], DOWN: ['cur', 'cur2'] };
    Object.keys(dirs).forEach(function (d) {
      var ids = dirs[d].filter(function (id) { return m.rows[id] && m.rows[id].header; });
      ids.sort(function (a, b) { return (m.rows[a].role === 'command' ? 0 : 1) - (m.rows[b].role === 'command' ? 0 : 1); });
      if (!ids.length) return;
      var c = fillGaps(conv(ids[0]), mask, s.quality.maxFillSamples);
      if (m.mode === 'single') c = c.map(Math.abs); // 단일 모드: 크기로 봅니다(부호 규칙은 확인 필요)
      var cal = m.mode === 'single' ? m.cal.ALL : m.cal[d];
      if (calOk(cal)) { var i0 = num(cal.i0), i100 = num(cal.i100); c = c.map(function (v) { return 100 * (v - i0) / (i100 - i0); }); sig.curUnit[d] = '%'; }
      else sig.curUnit[d] = 'mA';
      sig.cur[d] = c; sig.curRole[d] = m.rows[ids[0]].role + ' · ' + m.rows[ids[0]].header;
    });
    ['rpm', 'oilTemp', 'payload'].forEach(function (id) { sig[id] = conv(id); });
    return sig;
  }
  // 허용 길이 이하 결측만 앞 값으로 잇고, 넘는 구간은 mask 에 표시합니다(0 으로 채우지 않음)
  function fillGaps(a, mask, maxFill) {
    if (!a) return null;
    var out = a.slice(), n = out.length, i = 0;
    while (i < n) {
      if (isNum(out[i])) { i++; continue; }
      var j = i; while (j < n && !isNum(out[j])) j++;
      var len = j - i, prev = i > 0 ? out[i - 1] : (j < n ? out[j] : 0);
      for (var k = i; k < j; k++) { out[k] = prev; if (len > maxFill) mask[k] = true; }
      i = j;
    }
    return out;
  }
  // 가운데 정렬 이동평균 (창은 홀수로 맞춤)
  function smooth(a, win) {
    win = Math.max(1, Math.floor(win)); if (win % 2 === 0) win += 1;
    var h = (win - 1) / 2, n = a.length, out = new Array(n);
    for (var i = 0; i < n; i++) {
      var lo = Math.max(0, i - h), hi = Math.min(n - 1, i + h), sum = 0;
      for (var k = lo; k <= hi; k++) sum += a[k];
      out[i] = sum / (hi - lo + 1);
    }
    return out;
  }
  // 중앙차분 (양 끝은 한쪽 차분)
  function derivative(a, t) {
    var n = a.length, out = new Array(n);
    if (n < 2) return n ? [0] : [];
    for (var i = 0; i < n; i++) {
      var i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      out[i] = (a[i1] - a[i0]) / (t[i1] - t[i0]);
    }
    return out;
  }
  function deriveSignals(sig, s) {
    var w = s.detect.smoothWin;
    var d = {};
    d.armS = smooth(sig.arm, w);
    d.dArm = derivative(d.armS, sig.t);
    d.curS = {}; d.dCur = {}; d.curRange = {};
    Object.keys(sig.cur).forEach(function (dir) {
      d.curS[dir] = smooth(sig.cur[dir], w);
      d.dCur[dir] = derivative(d.curS[dir], sig.t);
      var mn = Infinity, mx = -Infinity; d.curS[dir].forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; });
      d.curRange[dir] = mx - mn;
    });
    d.pS = smooth(sig.p, w);
    d.dP = derivative(d.pS, sig.t);
    d.pitchS = smooth(sig.pitch, w);
    d.dPitch = derivative(d.pitchS, sig.t);
    d.d2Pitch = derivative(smooth(d.dPitch, w), sig.t);
    d.version = derivationVersion(s);
    return d;
  }
  function derivationVersion(s) {
    var dt = s.detect;
    return 'calc-v1 · 이동평균 ' + dt.smoothWin + '점 · 중앙차분 · Start ' + dt.startThr + ' / Stop ' + dt.stopThr + ' %/s · Hold ' + dt.hold + ' s · Window -' + dt.pre + '/+' + dt.post + ' s';
  }

  // ── Movement Start/Stop 검출 (AC-04) ───────────────────────────
  // Start: 정지 중 |d(Arm%)/dt| > startThr 가 hold 이상 지속 → 넘기 시작한 시점
  // Stop : 이동 중 |d(Arm%)/dt| < stopThr 가 hold 이상 지속 → 내려가기 시작한 시점
  function detectEvents(t, armS, dArm, det) {
    var ev = [], moving = false, runStart = -1, dir = null;
    for (var i = 0; i < t.length; i++) {
      var v = Math.abs(dArm[i]);
      if (!moving) {
        if (v > det.startThr) {
          if (runStart < 0) runStart = i;
          if (t[i] - t[runStart] >= det.hold - 1e-9) {
            var sum = 0; for (var k = runStart; k <= i; k++) sum += dArm[k];
            dir = sum >= 0 ? 'UP' : 'DOWN';
            ev.push({ type: 'start', idx: runStart, t: t[runStart], arm: armS[runStart], zone: zoneOf(armS[runStart]), dir: dir });
            moving = true; runStart = -1;
          }
        } else runStart = -1;
      } else {
        if (v < det.stopThr) {
          if (runStart < 0) runStart = i;
          if (t[i] - t[runStart] >= det.hold - 1e-9) {
            ev.push({ type: 'stop', idx: runStart, t: t[runStart], arm: armS[runStart], zone: zoneOf(armS[runStart]), dir: dir });
            moving = false; runStart = -1;
          }
        } else runStart = -1;
      }
    }
    ev.forEach(function (e, i) { e.no = i + 1; e.key = paramKey(e.dir, e.zone, e.type); });
    return ev;
  }

  function idxAt(t, time) { // time 이상인 첫 인덱스
    var lo = 0, hi = t.length - 1;
    if (time <= t[0]) return 0;
    if (time >= t[hi]) return hi;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (t[mid] < time) lo = mid + 1; else hi = mid; }
    return lo;
  }
  // ── 차트 커서 (2026-09-29 수강생 요청: Tracking · Value Difference) ──────
  // 오름차순 x 축(t)에서 위치 x 의 y 를 이웃 두 점 선형 보간으로 구합니다.
  // 범위 밖이거나 이웃 값이 숫자가 아니면 NaN(표시는 「—」) — 값을 지어내지 않습니다.
  function interpAt(t, y, x) {
    if (!t || !y || !t.length || !isNum(x)) return NaN;
    var n = t.length;
    if (x < t[0] || x > t[n - 1]) return NaN;
    var i = idxAt(t, x);
    if (t[i] === x || i === 0) return isNum(y[i]) ? y[i] : NaN;
    var a = y[i - 1], b = y[i], ta = t[i - 1], tb = t[i];
    if (!isNum(a) || !isNum(b)) return NaN;
    if (tb === ta) return b;
    return a + (b - a) * (x - ta) / (tb - ta);
  }
  // 두 커서 A(xa)·B(xb) 의 값과 차 — Δy = yB − yA, Δx = xB − xA
  function cursorDiff(t, y, xa, xb) {
    var ya = interpAt(t, y, xa), yb = interpAt(t, y, xb);
    return { ya: ya, yb: yb, dy: isNum(ya) && isNum(yb) ? yb - ya : NaN, dx: isNum(xa) && isNum(xb) ? xb - xa : NaN };
  }
  // 화면 위치 비율(0~1) → 축 값. 차트 밖으로 끌어도 양 끝에 멈춥니다
  function fracToX(frac, x0, x1) { return x0 + clamp(isNum(frac) ? frac : 0, 0, 1) * (x1 - x0); }

  function maxAbs(a, i0, i1) { var m = NaN; for (var i = i0; i <= i1; i++) { var v = Math.abs(a[i]); if (!(m >= v)) m = v; } return m; }

  // ── 이벤트 Window Feature (제출 기획서 5장) ─────────────────────
  function eventFeatures(sig, d, ev, s) {
    var det = s.detect, t = sig.t;
    var i0 = idxAt(t, ev.t - det.pre), i1 = idxAt(t, ev.t + det.post), ie = ev.idx;
    var f = { windowStart: t[i0], windowEnd: t[i1] };
    var c = d.curS[ev.dir], ref = i0;
    f.curUnit = sig.curUnit[ev.dir] || '';
    for (var mi = i0; mi <= i1; mi++) if (sig.mask[mi]) { f.noData = '결측·시간 역전·Sampling 공백 구간이 분석 Window 에 들어 있습니다'; break; }
    if (!c) f.noData = f.noData || ev.dir + ' Current 채널이 없습니다';
    if (c) {
      var minStep = d.curRange[ev.dir] * det.minStepFrac;
      if (ev.type === 'start') {
        // 기준 = 이벤트 앞 Window 의 최저값, 목표 = 이벤트 뒤 최고값
        var base = Infinity, top = -Infinity;
        for (var ib = i0; ib <= ie; ib++) base = Math.min(base, c[ib]);
        for (var i = ie; i <= i1; i++) top = Math.max(top, c[i]);
        var step = top - base, on = null;
        if (step > minStep && step > 0) {
          var lvl0 = base + step * det.onsetFrac;
          for (var j = ie; j >= i0; j--) { if (c[j] <= lvl0) { on = Math.min(j + 1, ie); break; } }
          if (on == null) on = i0;
        }
        if (on != null) {
          ref = on;
          f.onsetT = t[on];
          f.response = round(ev.t - t[on], 3);
          f.rampMeasured = measuredRamp(t, c, on, i1, base, base + step);
        }
      } else {
        // 유지 수준 = 이벤트 앞 Window 의 최고값, 끝 = 이벤트 뒤 최저값
        var lvl = -Infinity, low = Infinity;
        for (var il = i0; il <= ie; il++) lvl = Math.max(lvl, c[il]);
        for (var i2 = ie; i2 <= i1; i2++) low = Math.min(low, c[i2]);
        var drop = lvl - low, dc = null;
        if (drop > minStep && drop > 0) {
          var lvl1 = lvl - drop * det.onsetFrac;
          for (var j2 = ie; j2 >= i0; j2--) { if (c[j2] >= lvl1) { dc = Math.min(j2 + 1, ie); break; } }
          if (dc == null) dc = i0;
        }
        if (dc != null) {
          ref = dc;
          f.decayT = t[dc];
          f.response = round(ev.t - t[dc], 3);
          f.rampMeasured = measuredRamp(t, c, dc, i1, lvl, low);
        }
      }
      f.dCurMax = round(maxAbs(d.dCur[ev.dir], i0, i1), 2);
    }
    // Pressure
    var pBefore = d.pS[ref], pPeak = -Infinity;
    for (var k = ref; k <= i1; k++) pPeak = Math.max(pPeak, d.pS[k]);
    f.pBefore = round(pBefore, 2); f.pPeak = round(pPeak, 2); f.dP = round(pPeak - pBefore, 2);
    f.dpdtMax = round(maxAbs(d.dP, ref, i1), 2);
    // Pitch
    var pb = d.pitchS[ref], absP = pb, dMax = 0, mn = Infinity, mx = -Infinity;
    for (var q = ref; q <= i1; q++) {
      var pv = d.pitchS[q];
      if (Math.abs(pv) > Math.abs(absP)) absP = pv;
      dMax = Math.max(dMax, Math.abs(pv - pb));
      mn = Math.min(mn, pv); mx = Math.max(mx, pv);
    }
    f.pitchBefore = round(pb, 3); f.pitchAbs = round(absP, 3); f.dPitch = round(dMax, 3); f.pitchP2P = round(mx - mn, 3);
    f.dPitchMax = round(maxAbs(d.dPitch, ref, i1), 3);
    f.d2PitchMax = round(maxAbs(d.d2Pitch, ref, i1), 2);
    f.settling = settlingTime(t, d.pitchS, ie, i1, det);
    f.shockIndex = shockIndex(f, s);
    return f;
  }
  // 10%→90% 구간 기울기(%/s). from→to 가 감소면 절댓값
  function measuredRamp(t, c, i0, i1, from, to) {
    var a = from + (to - from) * 0.1, b = from + (to - from) * 0.9, ta = null, tb = null, up = to > from;
    for (var i = i0; i <= i1; i++) {
      if (ta == null && (up ? c[i] >= a : c[i] <= a)) ta = t[i];
      if (ta != null && (up ? c[i] >= b : c[i] <= b)) { tb = t[i]; break; }
    }
    if (ta == null || tb == null || tb <= ta) return NaN;
    return round(Math.abs(b - a) / (tb - ta), 1);
  }
  // 이벤트 뒤 Pitch 가 마지막 settleTail 초 평균 ± settleBand 안에 계속 머무르기 시작한 시간
  function settlingTime(t, pitch, ie, i1, det) {
    var tailStart = idxAt(t, t[i1] - det.settleTail), sum = 0, cnt = 0;
    for (var i = tailStart; i <= i1; i++) { sum += pitch[i]; cnt++; }
    var fin = sum / cnt, last = -1;
    for (var j = ie; j <= i1; j++) if (Math.abs(pitch[j] - fin) > det.settleBand) last = j;
    if (last < 0) return 0;
    if (last >= tailStart) return NaN; // 창 안에서 정착하지 않음
    return round(t[last + 1] - t[ie], 3);
  }
  // Shock Index (가정): 가중치 × (max|dP/dt| / 기준값) + 가중치 × (max|d²Pitch/dt²| / 기준값)
  function shockIndex(f, s) {
    var sh = s.shock;
    if (!isNum(f.dpdtMax) || !isNum(f.d2PitchMax) || !sh.refDpdt || !sh.refD2pitch) return NaN;
    return round(sh.wDpdt * f.dpdtMax / sh.refDpdt + sh.wD2pitch * f.d2PitchMax / sh.refD2pitch, 3);
  }

  function analyze(table, mapping, s) {
    var v = validateMapping(mapping);
    if (!v.canConfirm) return { ok: false, missing: v.errors };
    if (!mapping.confirmed) return { ok: false, missing: ['Mapping Confirm 을 먼저 하세요'] };
    var sig = buildSignals(table, mapping, s);
    if (sig.n < 3) return { ok: false, missing: ['데이터 행이 너무 적습니다'] };
    var d = deriveSignals(sig, s);
    var events = detectEvents(sig.t, d.armS, d.dArm, s.detect);
    events.forEach(function (e) { e.f = eventFeatures(sig, d, e, s); });
    return { ok: true, sig: sig, d: d, events: events, version: d.version, mappingRef: mapping.profileId ? mapping.profileId + ' v' + mapping.profileVersion : '저장 안 된 매핑' };
  }

  // ── 판정 (제출 기획서 10.1, AC-06) ──────────────────────────────
  var STATUS = {
    PASS: { label: 'PASS', show: 'Acceptable', cls: 'pass' },
    CAUTION: { label: 'CAUTION', show: 'Borderline', cls: 'caution' },
    'FAIL-SHOCK': { label: 'FAIL-SHOCK', show: 'Reject', cls: 'fail' },
    'FAIL-PITCH': { label: 'FAIL-PITCH', show: 'Reject', cls: 'fail' },
    'FAIL-SLOW': { label: 'FAIL-SLOW', show: 'Reject', cls: 'fail' },
    'NO DATA': { label: 'NO DATA', show: '분석 불가', cls: 'nodata' }
  };
  // 한 항목 판정: 범위 [lo, hi] (lo 는 비워도 됨)
  function judgeItem(v, lo, hi, cautionPct) {
    var hasLo = isNum(lo), hasHi = isNum(hi);
    if (!hasLo && !hasHi) return { state: 'nodata', why: '기준 없음' };
    if (!isNum(v)) return { state: 'nodata', why: '값 없음' };
    if (hasHi && v > hi) return { state: 'fail', why: '상한 ' + hi + ' 초과' };
    if (hasLo && v < lo) return { state: 'fail', why: '하한 ' + lo + ' 미만' };
    var m = cautionPct / 100;
    if (hasHi && v > hi - Math.abs(hi) * m) return { state: 'caution', why: '상한 근처' };
    if (hasLo && v < lo + Math.abs(lo) * m) return { state: 'caution', why: '하한 근처' };
    return { state: 'ok', why: '' };
  }
  function critText(lo, hi) {
    var a = isNum(lo), b = isNum(hi);
    if (a && b) return lo + ' ~ ' + hi;
    if (b) return hi + ' 이하';
    if (a) return lo + ' 이상';
    return '—';
  }
  // 안정도(ΔPitch)는 상한만 봅니다. 예전에 저장한 stabMin 이 남아 있어도 판정에 쓰지 않습니다(2026-09-29 요청)
  // Zone별 점수 배율(2026-09-29 오전 2차 요청):
  //   배율 적용값 = 측정값 × 배율(zone, 항목)   → 이 값을 허용 상한과 비교해 항목 판정(judgeItem)
  //   항목 점수  = 배율 적용값 ÷ 상한 × 100   (한계 사용률 %, 100 초과 = FAIL, 100 − CAUTION 폭 초과 = CAUTION)
  //   종합 점수  = 세 항목 점수 중 가장 큰 값 (가장 한계에 가까운 항목이 종합 판정을 정합니다)
  // 배율이 모두 1 이면 배율 적용값 = 측정값이라 예전 판정과 똑같습니다. zone 을 안 주면 배율 1.
  function judgeEvent(f, crit, s, zone) {
    crit = crit || {};
    var w = zoneWeights(s, zone);
    var items = [
      { id: 'stability', wkey: 'stab', name: '안정도 (ΔPitch)', unit: '°', value: f.dPitch, lo: null, hi: crit.stabMax, fail: 'FAIL-PITCH' },
      { id: 'shock', wkey: 'shock', name: '충격지수 (Shock Index)', unit: '', value: f.shockIndex, lo: null, hi: crit.shockMax, fail: 'FAIL-SHOCK' },
      { id: 'response', wkey: 'resp', name: '응답성 (' + (f.decayT != null ? 'Stop Response Time' : 'Response Delay') + ')', unit: 's', value: f.response, lo: null, hi: crit.respMax, fail: 'FAIL-SLOW' }
    ];
    items.forEach(function (it) {
      it.weight = w[it.wkey];
      it.weighted = isNum(it.value) ? it.value * it.weight : it.value; // 배율 1 이면 값이 한 비트도 바뀌지 않습니다
      var r = judgeItem(it.weighted, it.lo, it.hi, s.cautionPct);
      it.state = r.state; it.why = r.why;
      if (it.weight !== 1 && (r.state === 'fail' || r.state === 'caution')) it.why = '배율 ×' + it.weight + ' 적용값 ' + round(it.weighted, 3) + ' — ' + r.why;
      it.crit = critText(it.lo, it.hi);
      it.score = isNum(it.weighted) && isNum(it.hi) && it.hi > 0 ? round(it.weighted / it.hi * 100, 1) : NaN;
    });
    var scores = items.map(function (i) { return i.score; }).filter(isNum);
    var score = scores.length === items.length ? Math.max.apply(null, scores) : NaN;
    var reasons = [], status;
    if (f.noData) return { status: 'NO DATA', items: items, reasons: [f.noData], safety: false, score: NaN, weights: w };
    var sf = s.safety, safety = [];
    if (isNum(sf.pressureMax) && isNum(f.pPeak) && f.pPeak > sf.pressureMax) safety.push({ st: 'FAIL-SHOCK', msg: 'Safety Limit 초과: Head Pressure ' + f.pPeak + ' > ' + sf.pressureMax });
    if (isNum(sf.pitchAbsMax) && isNum(f.pitchAbs) && Math.abs(f.pitchAbs) > sf.pitchAbsMax) safety.push({ st: 'FAIL-PITCH', msg: 'Safety Limit 초과: |Pitch| ' + Math.abs(f.pitchAbs) + ' > ' + sf.pitchAbsMax });
    var fails = items.filter(function (i) { return i.state === 'fail'; });
    if (safety.length) {
      status = safety[0].st;
      safety.forEach(function (x) { reasons.push(x.msg); });
      fails.forEach(function (i) { reasons.push(i.name + ' ' + i.why); });
    } else if (fails.length) {
      var order = ['FAIL-SHOCK', 'FAIL-PITCH', 'FAIL-SLOW'];
      status = order.filter(function (o) { return fails.some(function (i) { return i.fail === o; }); })[0];
      fails.forEach(function (i) { reasons.push(i.name + ' ' + i.why); });
    } else if (items.some(function (i) { return i.state === 'nodata'; })) {
      status = 'NO DATA';
      items.filter(function (i) { return i.state === 'nodata'; }).forEach(function (i) { reasons.push(i.name + ': ' + i.why); });
    } else if (items.some(function (i) { return i.state === 'caution'; })) {
      status = 'CAUTION';
      items.filter(function (i) { return i.state === 'caution'; }).forEach(function (i) { reasons.push(i.name + ' ' + i.why + ' — 반복시험 권장'); });
    } else status = 'PASS';
    return { status: status, items: items, reasons: reasons, safety: safety.length > 0, score: score, weights: w };
  }

  // ── 라벨 DB (제출 기획서 9장 저장 항목) ────────────────────────
  var LABEL_FIELDS = ['label_id', 'date', 'expert', 'log_name', 'set_version', 'mapping_profile', 'direction', 'zone', 'event', 'arm_pct', 'ramp_value',
    'rpm', 'payload', 'oil_temp', 'response_s', 'ramp_measured', 'ramp_unit', 'dp_dt_max', 'delta_p', 'pitch_abs', 'delta_pitch', 'd2pitch_max', 'settling_s', 'shock_index',
    'shock_label', 'pitch_label', 'resp_label', 'overall', 'memo'];
  var LABEL_CODES = {
    shock_label: ['OK', 'NG'], pitch_label: ['OK', 'NG'],
    resp_label: ['Too Slow', 'Good', 'Too Aggressive'], overall: ['Accept', 'Borderline', 'Reject']
  };
  function labelKey(r) {
    var e = String(r.event || '').toLowerCase();
    return paramKey(String(r.direction || '').toUpperCase(), +r.zone, e === 'stop' || e === 'end' ? 'stop' : 'start');
  }
  function labelFromEvent(ev, meta) {
    var f = ev.f;
    return {
      label_id: meta.id, date: meta.date, expert: meta.expert || '', log_name: meta.logName || '', set_version: meta.setVersion || '', mapping_profile: meta.mappingRef || '',
      direction: ev.dir, zone: ev.zone, event: ev.type === 'start' ? 'Start' : 'Stop', arm_pct: round(ev.arm, 1), ramp_value: meta.rampValue,
      rpm: meta.rpm, payload: meta.payload, oil_temp: meta.oilTemp,
      response_s: f.response, ramp_measured: f.rampMeasured, ramp_unit: f.curUnit ? f.curUnit + '/s' : '', dp_dt_max: f.dpdtMax, delta_p: f.dP, pitch_abs: f.pitchAbs, delta_pitch: f.dPitch,
      d2pitch_max: f.d2PitchMax, settling_s: f.settling, shock_index: f.shockIndex,
      shock_label: meta.shock_label, pitch_label: meta.pitch_label, resp_label: meta.resp_label, overall: meta.overall, memo: meta.memo || ''
    };
  }
  function normalizeLabel(r) {
    var o = {};
    LABEL_FIELDS.forEach(function (k) { o[k] = r[k] == null ? '' : r[k]; });
    ['zone', 'arm_pct', 'ramp_value', 'rpm', 'payload', 'oil_temp', 'response_s', 'ramp_measured', 'dp_dt_max', 'delta_p', 'pitch_abs', 'delta_pitch', 'd2pitch_max', 'settling_s', 'shock_index']
      .forEach(function (k) { var v = num(o[k]); o[k] = isNum(v) ? v : ''; });
    o.direction = String(o.direction).toUpperCase();
    var e = String(o.event).toLowerCase(); o.event = e === 'stop' || e === 'end' ? 'Stop' : 'Start';
    return o;
  }
  function labelsFromTable(header, data) {
    var problems = [], out = [];
    var miss = ['direction', 'zone', 'event', 'overall'].filter(function (k) { return header.indexOf(k) < 0; });
    if (miss.length) return { labels: [], problems: ['필수 열 없음: ' + miss.join(', ')] };
    data.forEach(function (row, i) {
      var o = {}; header.forEach(function (h, j) { o[h] = row[j]; });
      var l = normalizeLabel(o);
      if (DIRS.indexOf(l.direction) < 0 || !(l.zone >= 1 && l.zone <= 4)) { problems.push((i + 2) + '행: direction/zone 값이 올바르지 않습니다'); return; }
      if (LABEL_CODES.overall.indexOf(l.overall) < 0) { problems.push((i + 2) + '행: overall 은 Accept/Borderline/Reject 중 하나여야 합니다'); return; }
      if (!l.label_id) l.label_id = 'L' + (i + 1);
      out.push(l);
    });
    return { labels: out, problems: problems };
  }

  // Accepted 라벨의 범위로 허용 기준 만들기 — 안정도는 ΔPitch 상한만(2026-09-29 수강생 요청으로 하한 삭제)
  function criteriaFromLabels(labels, key, minLabels) {
    var acc = labels.filter(function (l) { return labelKey(l) === key && l.overall === 'Accept'; });
    if (acc.length < minLabels) return { ok: false, n: acc.length };
    function col(k) { return acc.map(function (l) { return num(l[k]); }).filter(isNum); }
    var dp = col('delta_pitch'), sh = col('shock_index'), rs = col('response_s');
    return {
      ok: true, n: acc.length,
      crit: {
        stabMax: dp.length ? round(Math.max.apply(null, dp), 3) : null,
        shockMax: sh.length ? round(Math.max.apply(null, sh), 3) : null,
        respMax: rs.length ? round(Math.max.apply(null, rs), 3) : null,
        source: 'Accepted 라벨 ' + acc.length + '건'
      }
    };
  }

  // ── Rule 기반 추천 (AC-07, AC-09) ───────────────────────────────
  // Accepted 라벨의 ramp 값 가운데 상위 percentile 값을 목표로(충격이 허용되는 한 빠른 응답),
  // 한 번 변화폭은 현재값의 maxDeltaPct% 로 제한, Min/Max·Step 안에서만 냅니다.
  function recommend(key, current, labels, s) {
    var acc = labels.filter(function (l) { return labelKey(l) === key && l.overall === 'Accept' && isNum(num(l.ramp_value)); })
      .map(function (l) { return num(l.ramp_value); });
    if (acc.length < s.recommend.minLabels) {
      return { key: key, status: 'NO DATA', value: null, delta: null, n: acc.length, reason: '추천 불가/데이터 부족 — Accepted 라벨 ' + acc.length + '건 (최소 ' + s.recommend.minLabels + '건 필요)' };
    }
    if (!isNum(current)) return { key: key, status: 'NO DATA', value: null, delta: null, n: acc.length, reason: '현재값이 없습니다' };
    var target = percentile(acc, s.recommend.percentile);
    var lim = Math.abs(current) * s.maxDeltaPct / 100;
    var delta = clamp(target - current, -lim, lim);
    var v = snap(clamp(current + delta, s.param.min, s.param.max), s.param.step);
    delta = round(v - current, 3);
    var lo = Math.min.apply(null, acc), hi = Math.max.apply(null, acc);
    var why = 'Accepted ' + acc.length + '건 범위 ' + lo + '~' + hi + ' %/s, 상위 ' + s.recommend.percentile + '% 값 ' + round(target, 1);
    if (Math.abs(target - current) > lim) why += ', 1회 변화폭 ±' + s.maxDeltaPct + '% 로 제한';
    return { key: key, status: delta === 0 ? 'KEEP' : 'CHANGE', value: v, delta: delta, n: acc.length, target: round(target, 1), reason: delta === 0 ? '유지 — ' + why : why };
  }
  function recommendAll(values, labels, s) {
    var out = {};
    PARAM_KEYS.forEach(function (k) { out[k] = recommend(k, values[k], labels, s); });
    return out;
  }

  // ── 내보내기 형식 ─────────────────────────────────────────────
  var SET_HEADER = ['parameter', 'direction', 'zone', 'arm_range', 'event', 'value_pct_per_s', 'ecu_value'];
  function setToRows(values, s) {
    return PARAM_KEYS.map(function (k) {
      var p = parseKey(k);
      return [EVENT_ECU[p.evt].replace(/ /g, '_') + '_' + p.dir + '_Z' + p.zone, p.dir, p.zone, ZONES[p.zone - 1].range + (p.zone === 4 ? ' (100% Endpoint 포함)' : ''),
        p.evt === 'start' ? 'Start' : 'Stop(End)', values[k], isNum(values[k]) ? slopeToEcu(values[k], s) : ''];
    });
  }
  function setFromTable(header, data) {
    var di = header.indexOf('direction'), zi = header.indexOf('zone'), ei = header.indexOf('event'), vi = header.indexOf('value_pct_per_s');
    if (di < 0 || zi < 0 || ei < 0 || vi < 0) return { ok: false, msg: 'direction, zone, event, value_pct_per_s 열이 필요합니다' };
    var values = {};
    data.forEach(function (r) {
      var e = String(r[ei]).toLowerCase().indexOf('start') === 0 ? 'start' : 'stop';
      var k = paramKey(String(r[di]).toUpperCase(), +r[zi], e);
      if (PARAM_KEYS.indexOf(k) >= 0) values[k] = num(r[vi]);
    });
    var miss = PARAM_KEYS.filter(function (k) { return !isNum(values[k]); });
    if (miss.length) return { ok: false, msg: '값이 없는 파라미터 ' + miss.length + '개: ' + miss.map(paramLabel).join(', ') };
    return { ok: true, values: values };
  }
  var EVENT_HEADER = ['no', 'event', 'time_s', 'direction', 'zone', 'arm_pct', 'parameter', 'response_s', 'ramp_measured', 'ramp_unit', 'p_before', 'p_peak', 'delta_p', 'dp_dt_max',
    'pitch_abs', 'delta_pitch', 'pitch_p2p', 'dpitch_dt_max', 'd2pitch_max', 'settling_s', 'shock_index', 'w_stab', 'w_shock', 'w_resp', 'overall_score', 'status', 'reasons'];
  function eventRows(events, judge) {
    return events.map(function (e) {
      var f = e.f, j = judge(e);
      return [e.no, e.type === 'start' ? 'Start' : 'Stop', round(e.t, 3), e.dir, e.zone, round(e.arm, 1), paramLabel(e.key), f.response, f.rampMeasured, f.curUnit ? f.curUnit + '/s' : '', f.pBefore, f.pPeak, f.dP, f.dpdtMax,
        f.pitchAbs, f.dPitch, f.pitchP2P, f.dPitchMax, f.d2PitchMax, f.settling, f.shockIndex, j.weights.stab, j.weights.shock, j.weights.resp, j.score, j.status, j.reasons.join(' / ')];
    });
  }

  var api = {
    ZONES: ZONES, DIRS: DIRS, EVENTS: EVENTS, EVENT_LABEL: EVENT_LABEL, EVENT_ECU: EVENT_ECU, PARAM_KEYS: PARAM_KEYS, STD_SIGNALS: STD_SIGNALS, UNITS: UNITS, NEED_TEXT: NEED_TEXT, STATUS: STATUS,
    LABEL_FIELDS: LABEL_FIELDS, LABEL_CODES: LABEL_CODES, SET_HEADER: SET_HEADER, EVENT_HEADER: EVENT_HEADER,
    paramKey: paramKey, parseKey: parseKey, paramLabel: paramLabel, zoneOf: zoneOf, endpointValue: endpointValue,
    defaultSettings: defaultSettings, mergeSettings: mergeSettings, num: num, isNum: isNum, round: round, snap: snap, clamp: clamp, percentile: percentile,
    slopeToEcu: slopeToEcu, ecuToSlope: ecuToSlope, slopeToTime: slopeToTime, timeToSlope: timeToSlope, profilePoints: profilePoints,
    validateSet: validateSet, nextVersionId: nextVersionId, diffSets: diffSets, changeEntries: changeEntries,
    parseCsv: parseCsv, toCsv: toCsv, tableFromRows: tableFromRows,
    sigDef: sigDef, signalsForMode: signalsForMode, headerUnit: headerUnit, columnStats: columnStats, scoreHeader: scoreHeader, emptyMapping: emptyMapping,
    recommendMapping: recommendMapping, applyProfile: applyProfile, mappingToProfile: mappingToProfile, calibrationState: calibrationState,
    validateMapping: validateMapping, qualityReport: qualityReport, buildSignals: buildSignals, fillGaps: fillGaps, smooth: smooth, derivative: derivative, deriveSignals: deriveSignals, derivationVersion: derivationVersion,
    detectEvents: detectEvents, idxAt: idxAt, interpAt: interpAt, cursorDiff: cursorDiff, fracToX: fracToX, eventFeatures: eventFeatures, measuredRamp: measuredRamp, settlingTime: settlingTime, shockIndex: shockIndex, analyze: analyze,
    judgeItem: judgeItem, judgeEvent: judgeEvent, WEIGHT_ITEMS: WEIGHT_ITEMS, WEIGHT_MAX: WEIGHT_MAX, defaultZoneWeights: defaultZoneWeights, normalizeZoneWeights: normalizeZoneWeights, zoneWeights: zoneWeights, isDefaultWeights: isDefaultWeights, labelKey: labelKey, labelFromEvent: labelFromEvent, normalizeLabel: normalizeLabel, labelsFromTable: labelsFromTable,
    criteriaFromLabels: criteriaFromLabels, recommend: recommend, recommendAll: recommendAll,
    setToRows: setToRows, setFromTable: setFromTable, eventRows: eventRows
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CRLogic = api;
})(typeof window !== 'undefined' ? window : this);
