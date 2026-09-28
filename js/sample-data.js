/*
 * 예시 데이터 생성기 — 전부 합성(가상) 데이터입니다. 실제 장비·시험 결과가 아닙니다.
 * 열 이름만 수강생 제출 기획서 4.3 의 sample data.csv 헤더 8개를 그대로 씁니다.
 * 값은 단순한 가상 물리 모델(전류 → 암 속도 1차 지연, 가속도 → 압력·Pitch 과도응답)로 만듭니다.
 * 브라우저에서는 window.CRSample, Node 에서는 module.exports.
 */
(function (root) {
  'use strict';
  var L = root.CRLogic || (typeof require !== 'undefined' ? require('./logic.js') : null);

  var HEADERS = ['Time[s]', 'LASP::FFD3_BoomAnglePercentage', 'LOGE_::EPPR_ArmUp[mA]', 'LOGE_::EPPR_ArmDown[mA]',
    'LABHRP::FFD2_ArmCylinderHeadPressure', 'Body_IMU_Angle_SQ::PitchAngle[deg]', 'EEC1::EngSpeed[rpm]', 'LOGI_::AngleSensorVoltage_Arm[mV]'];

  // 예시 전용 가상 보정값: 이 합성 데이터는 100 mA(대기) = 0%, 650 mA = 100% 로 만들었습니다
  var SAMPLE_CAL = { i0: 100, i100: 650 };

  // 예시 Calibration Set (%/s). UP 값은 제출자 UI 스케치(그림 1)에 적힌 숫자를 예시로 옮긴 것, DOWN 은 임의값
  function sampleSet() {
    var v = {};
    var up = { start: [300, 150, 120, 80], stop: [300, 180, 100, 100] };
    var down = { start: [200, 160, 120, 100], stop: [250, 200, 150, 120] };
    [1, 2, 3, 4].forEach(function (z) {
      v[L.paramKey('UP', z, 'start')] = up.start[z - 1]; v[L.paramKey('UP', z, 'stop')] = up.stop[z - 1];
      v[L.paramKey('DOWN', z, 'start')] = down.start[z - 1]; v[L.paramKey('DOWN', z, 'stop')] = down.stop[z - 1];
    });
    return v;
  }

  // 재현 가능한 난수 (시드 고정)
  function rng(seed) {
    var s = seed >>> 0;
    function u() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
    return function () { return Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()); };
  }

  /*
   * moves: [{ dir:'UP'|'DOWN', to: 목표 Arm %, idle: 시작 전 대기(s) }]
   * values: 16개 Ramp 값 (%/s). 누를 때 그 순간 Zone 의 Start Ramp, 놓을 때 그 순간 Zone 의 Stop Ramp 로 전류를 올리고 내립니다.
   */
  function simulate(values, moves, opt) {
    opt = opt || {};
    var dt = 0.01, g = rng(opt.seed || 7), noise = opt.noise == null ? 1 : opt.noise;
    var arm = opt.start == null ? 5 : opt.start, v = 0, vPrev = 0, pitch = 0, pRate = 0, p = 30, cPct = { UP: 0, DOWN: 0 };
    var rows = [HEADERS.slice()], t = 0;
    if (opt.zeroFirstRow !== false) rows.push([0, 0, 0, 0, 0, 0, 0, 0]);
    var DEAD = 15, VMAX = { UP: 25, DOWN: 30 }, TAU = 0.03;
    function step(press) {
      ['UP', 'DOWN'].forEach(function (d) {
        var on = press && press.dir === d;
        var key = L.paramKey(d, L.zoneOf(arm), on ? 'start' : 'stop');
        var slope = values[key];
        if (on) cPct[d] = Math.min(100, cPct[d] + slope * dt);
        else cPct[d] = Math.max(0, cPct[d] - slope * dt);
      });
      var vt = 0;
      ['UP', 'DOWN'].forEach(function (d) { var e = Math.max(0, (cPct[d] - DEAD) / (100 - DEAD)); vt += (d === 'UP' ? 1 : -1) * VMAX[d] * e; });
      v += (vt - v) * dt / TAU;
      arm += v * dt;
      if (arm < 0) { arm = 0; v = Math.max(0, v); } if (arm > 100) { arm = 100; v = Math.min(0, v); }
      var a = (v - vPrev) / dt; vPrev = v;
      var load = 30 + 0.3 * arm + (v > 0 ? 25 * v / VMAX.UP : 8 * v / VMAX.DOWN);
      var pTarget = Math.max(0, load + 0.35 * a);
      p += (pTarget - p) * dt / 0.03;
      var w = 2 * Math.PI * 1.4, zeta = 0.22, gain = 0.02 * (1 + (v < 0 || a > 0 ? arm / 60 : 0));
      var pitchStatic = -0.4 + 0.015 * arm;
      var acc = -2 * zeta * w * pRate - w * w * (pitch - pitchStatic) + gain * w * w * a / 10;
      pRate += acc * dt; pitch += pRate * dt;
      t += dt;
      var mA = function (d) { return SAMPLE_CAL.i0 + (SAMPLE_CAL.i100 - SAMPLE_CAL.i0) * cPct[d] / 100; };
      rows.push([
        L.round(t, 2),
        L.round(arm + 0.03 * noise * g(), 2),
        L.round(mA('UP') + 1.5 * noise * g(), 1),
        L.round(mA('DOWN') + 1.5 * noise * g(), 1),
        L.round(p + 0.25 * noise * g(), 2),
        L.round(pitch + 0.003 * noise * g(), 3),
        L.round(1800 + 6 * noise * g(), 0),
        L.round(500 + 40 * arm + 3 * noise * g(), 0)
      ]);
    }
    moves.forEach(function (mv) {
      var n0 = Math.round((mv.idle == null ? 1.5 : mv.idle) / dt);
      for (var i = 0; i < n0; i++) step(null);
      // 놓은 뒤에도 전류가 Stop Ramp 로 줄어드는 동안 더 움직이므로, 그만큼 앞에서 놓습니다
      var guard = 0;
      while (guard++ < 3000) {
        var lead = Math.abs(v) * (cPct[mv.dir] / values[L.paramKey(mv.dir, L.zoneOf(arm), 'stop')]) * 0.55 + 0.3;
        if (mv.dir === 'UP' ? arm >= mv.to - lead : arm <= mv.to + lead) break;
        step({ dir: mv.dir });
      }
    });
    for (var k = 0; k < 200; k++) step(null);
    return rows;
  }

  // 시연용 시험 로그 한 건 (~60 s)
  var LOG_MOVES = [
    { dir: 'UP', to: 22 }, { dir: 'UP', to: 42 }, { dir: 'UP', to: 62 }, { dir: 'UP', to: 88 },
    { dir: 'DOWN', to: 62 }, { dir: 'DOWN', to: 42 }, { dir: 'DOWN', to: 22 }, { dir: 'DOWN', to: 8 },
    { dir: 'UP', to: 85 }, { dir: 'DOWN', to: 76 }, { dir: 'DOWN', to: 12 },
    { dir: 'UP', to: 36 }, { dir: 'UP', to: 56 }, { dir: 'DOWN', to: 34 }, { dir: 'UP', to: 80 }, { dir: 'DOWN', to: 10 }
  ];
  function sampleLog(values, seed) { return simulate(values, LOG_MOVES, { seed: seed || 11 }); }

  // 예시 채널맵 — 실제 역할·단위가 아니라 이 합성 데이터에 맞춘 값입니다
  function sampleProfile() {
    var m = L.emptyMapping('split');
    var H = HEADERS;
    m.rows = {
      time: { header: H[0], unit: 's' }, arm: { header: H[1], unit: '%' },
      curUp: { header: H[2], unit: 'mA', role: 'command' }, curUp2: { header: '', unit: '', role: '' },
      curDown: { header: H[3], unit: 'mA', role: 'command' }, curDown2: { header: '', unit: '', role: '' },
      headP: { header: H[4], unit: 'bar' }, pitch: { header: H[5], unit: 'deg' }, rpm: { header: H[6], unit: 'rpm' },
      oilTemp: { header: '', unit: '' }, payload: { header: '', unit: '' }, joystick: { header: '' }, rideCtrl: { header: '' }, rodP: { header: '' }
    };
    Object.keys(m.rows).forEach(function (k) { var r = m.rows[k]; r.role = r.role || ''; r.unit = r.unit || ''; r.confirmed = !!r.header; r.reason = ''; r.candidates = []; });
    m.cal.UP = { i0: SAMPLE_CAL.i0, i100: SAMPLE_CAL.i100 };
    m.cal.DOWN = { i0: SAMPLE_CAL.i0, i100: SAMPLE_CAL.i100 };
    m.excludeFirstRow = true;
    var stats = L.columnStats(L.tableFromRows(sampleLog(sampleSet()).slice(0, 50)));
    return L.mappingToProfile(m, stats, { id: 'MP-EX1', name: '예시 채널맵 (예시 데이터 전용)', version: 1, author: '예시', time: '2026-09-28 00:00' });
  }
  function mappingFromProfile(pr) {
    var m = L.emptyMapping(pr.mode);
    Object.keys(pr.rows).forEach(function (k) { var r = pr.rows[k]; m.rows[k] = { header: r.header, unit: r.unit, role: r.role, confirmed: !!r.header, reason: '', candidates: [] }; });
    m.cal = JSON.parse(JSON.stringify(pr.cal)); m.excludeFirstRow = pr.excludeFirstRow; m.confirmed = true;
    m.profileId = pr.id; m.profileVersion = pr.version;
    return m;
  }

  // 가상 기준 시험원 규칙 (예시 라벨을 만들 때만 씀 — 실제 감성 기준이 아닙니다)
  var VIRTUAL_EXPERT = { shockMax: 1.0, respMax: { start: 0.35, stop: 0.6 }, pitchMax: 0.55 };
  function virtualLabel(f, evt) {
    var rMax = VIRTUAL_EXPERT.respMax[evt];
    var shockOk = f.shockIndex <= VIRTUAL_EXPERT.shockMax, pitchOk = f.dPitch <= VIRTUAL_EXPERT.pitchMax, slow = f.response > rMax;
    var resp = slow ? 'Too Slow' : (f.shockIndex > VIRTUAL_EXPERT.shockMax * 1.4 ? 'Too Aggressive' : 'Good');
    var near = f.shockIndex > VIRTUAL_EXPERT.shockMax * 0.9 || f.response > rMax * 0.9;
    var overall = shockOk && pitchOk && !slow ? (near ? 'Borderline' : 'Accept') : 'Reject';
    return { shock_label: shockOk ? 'OK' : 'NG', pitch_label: pitchOk ? 'OK' : 'NG', resp_label: resp, overall: overall };
  }
  // 파라미터마다 값을 바꿔 가며 짧은 동작을 시뮬레이션하고 가상 규칙으로 라벨을 붙입니다
  function sampleLabels(settings) {
    var s = settings || L.defaultSettings(), base = sampleSet(), out = [], n = 0;
    var profile = sampleProfile(), mapping = mappingFromProfile(profile);
    var factors = [0.5, 0.7, 0.85, 1, 1.2, 1.5];
    L.PARAM_KEYS.forEach(function (key, ki) {
      var p = L.parseKey(key), z = L.ZONES[p.zone - 1], mid = (z.lo + z.hi) / 2, start, to;
      if (p.evt === 'start') { start = mid; to = p.dir === 'UP' ? Math.min(98, mid + 12) : Math.max(2, mid - 12); }
      else { to = mid; start = p.dir === 'UP' ? Math.max(2, mid - 14) : Math.min(98, mid + 14); }
      factors.forEach(function (fa, fi) {
        var vals = Object.assign({}, base);
        vals[key] = L.snap(base[key] * fa, s.param.step);
        if (p.evt === 'stop') { var sk = L.paramKey(p.dir, L.zoneOf(start), 'start'); vals[sk] = base[sk]; }
        var rows = simulate(vals, [{ dir: p.dir, to: to, idle: 1.2 }], { start: start, seed: 100 + ki * 10 + fi });
        var r = L.analyze(L.tableFromRows(rows), mapping, s);
        if (!r.ok) return;
        var ev = r.events.filter(function (e) { return e.key === key; })[0];
        if (!ev) return;
        n++;
        var lab = virtualLabel(ev.f, p.evt);
        out.push(L.labelFromEvent(ev, Object.assign({ id: 'EX-L' + ('00' + n).slice(-3), date: '2026-09-28', expert: '예시 기준시험원', logName: '예시 라벨 시뮬레이션',
          setVersion: '예시', mappingRef: profile.id + ' v' + profile.version, rampValue: vals[key], rpm: 1800, memo: '예시 데이터 — 가상 규칙으로 만든 라벨' }, lab)));
      });
    });
    return out;
  }

  var api = { HEADERS: HEADERS, SAMPLE_CAL: SAMPLE_CAL, VIRTUAL_EXPERT: VIRTUAL_EXPERT, sampleSet: sampleSet, simulate: simulate, sampleLog: sampleLog,
    sampleProfile: sampleProfile, mappingFromProfile: mappingFromProfile, sampleLabels: sampleLabels, virtualLabel: virtualLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CRSample = api;
})(typeof window !== 'undefined' ? window : this);
