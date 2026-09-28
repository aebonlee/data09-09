// 실행: node test/logic.test.mjs   (의존성 없음)
// 기대값은 모두 손으로 계산한 값입니다(주석에 계산 과정).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const Smp = require('../js/sample-data.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const S = () => L.defaultSettings();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` ${a} ≈ ${b} ±${tol}`);

console.log('Zone · 16개 파라미터');
test('파라미터 16개, 중복 없음', () => { assert.equal(L.PARAM_KEYS.length, 16); assert.equal(new Set(L.PARAM_KEYS).size, 16); });
test('Zone 판정: 경계값은 위쪽 Zone (가정)', () => {
  assert.deepEqual([-3, 0, 29.99, 30, 49.9, 50, 69.99, 70, 100].map(L.zoneOf), [1, 1, 1, 2, 2, 3, 3, 4, 4]);
});
test('100% Endpoint 는 Zone 4 값 (AC-02)', () => {
  const v = Smp.sampleSet();
  assert.equal(L.endpointValue(v, 'UP', 'start'), 80); assert.equal(L.endpointValue(v, 'UP', 'stop'), 100);
});

console.log('세 방식 환산 (AC-03)');
test('기울기 120 × 배율 2.5 = ECU 300, 거꾸로 300 → 120', () => {
  const s = S(); s.param.ecuScale = 2.5;
  assert.equal(L.slopeToEcu(120, s), 300); assert.equal(L.ecuToSlope(300, s), 120);
});
test('그래프 시간 0.5 s 에 100% → 200 %/s', () => assert.equal(L.timeToSlope(0.5, 100, S()), 200));
test('Profile 점: Start 200, Stop 100, 유지 1 s', () => {
  // 100/200 = 0.5 s 상승, 1 s 유지, 100/100 = 1 s 하강
  assert.deepEqual(L.profilePoints(200, 100, { amp: 100, hold: 1 }), [[0, 0], [0.5, 100], [1.5, 100], [2.5, 0]]);
});

console.log('Calibration Set 검증');
test('범위 밖은 error, Step 어긋남은 warn', () => {
  const v = {}; L.PARAM_KEYS.forEach(k => v[k] = 100);
  v.UP_1_start = 5; v.DOWN_1_stop = 100.5;
  const r = L.validateSet(v, S());
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues.filter(i => i.code === 'range').map(i => i.key), ['UP_1_start']);
  assert.deepEqual(r.issues.filter(i => i.code === 'step').map(i => i.key), ['DOWN_1_stop']);
});
test('인접 Zone 연속성: 100 과 250 은 60% 차이 → 경고 2건', () => {
  // |100-250|/250 = 60% > 50% : Zone1–2, Zone2–3 두 곳
  const v = {}; L.PARAM_KEYS.forEach(k => v[k] = 100); v.UP_2_start = 250;
  const c = L.validateSet(v, S()).issues.filter(i => i.code === 'continuity');
  assert.equal(c.length, 2);
});
test('버전 번호: V009 다음은 V010', () => assert.equal(L.nextVersionId([{ id: 'V001' }, { id: 'V009' }]), 'V010'));
test('변경 이력: 바뀐 파라미터만 기록', () => {
  const a = Smp.sampleSet(), b = { ...a, UP_3_stop: 120 };
  const ch = L.changeEntries(a, b, { time: 't', user: 'u', source: 'drag' });
  assert.deepEqual(ch.map(c => [c.key, c.from, c.to]), [['UP_3_stop', 100, 120]]);
});

console.log('신호 처리');
test('이동평균 3점: [0,0,3,0,0] → [0,1,1,1,0]', () => assert.deepEqual(L.smooth([0, 0, 3, 0, 0], 3), [0, 1, 1, 1, 0]));
test('중앙차분: x=t² → [1,2,4,5]', () => assert.deepEqual(L.derivative([0, 1, 4, 9], [0, 1, 2, 3]), [1, 2, 4, 5]));
test('결측 이어 계산: 허용 길이 이내는 앞 값, 넘으면 mask', () => {
  const m1 = [false, false, false, false]; assert.deepEqual(L.fillGaps([1, NaN, NaN, 4], m1, 3), [1, 1, 1, 4]); assert.deepEqual(m1, [false, false, false, false]);
  const m2 = [false, false, false, false]; L.fillGaps([1, NaN, NaN, 4], m2, 1); assert.deepEqual(m2, [false, true, true, false]);
});
test('Movement Start/Stop 검출 — Hold Time 과 방향', () => {
  const t = [], arm = [], d = [];
  for (let i = 0; i <= 20; i++) { t.push(L.round(i * 0.01, 2)); arm.push(40); d.push(i >= 5 && i < 15 ? -10 : 0); }
  const ev = L.detectEvents(t, arm, d, { startThr: 3, stopThr: 1.5, hold: 0.025 });
  // 5번째 점(0.05 s)부터 넘기 시작 → Start, 15번째(0.15 s)부터 내려감 → Stop, 부호 음수 → DOWN, 40% → Zone 2
  assert.deepEqual(ev.map(e => [e.type, e.t, e.dir, e.zone, e.key]), [['start', 0.05, 'DOWN', 2, 'DOWN_2_start'], ['stop', 0.15, 'DOWN', 2, 'DOWN_2_stop']]);
});
test('짧은 튐(Hold 미만)은 이벤트가 아님', () => {
  const t = [], arm = [], d = [];
  for (let i = 0; i <= 20; i++) { t.push(L.round(i * 0.01, 2)); arm.push(10); d.push(i === 5 || i === 6 ? 10 : 0); }
  assert.equal(L.detectEvents(t, arm, d, { startThr: 3, stopThr: 1.5, hold: 0.025 }).length, 0);
});
test('실측 Ramp: 100 %/s 직선 → 10→90% 기울기 100', () => {
  const t = [], c = []; for (let i = 0; i <= 10; i++) { t.push(L.round(i * 0.1, 1)); c.push(i * 10); }
  assert.equal(L.measuredRamp(t, c, 0, 10, 0, 100), 100);
});
test('Settling Time: 0.2 s 뒤로 ±0.1 안 → 0.3 s', () => {
  const t = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1], p = [0, 1, .5, .05, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(L.settlingTime(t, p, 0, 10, { settleBand: 0.1, settleTail: 0.2 }), 0.3);
});
test('Shock Index: 0.5×200/400 + 0.5×30/60 = 0.5', () => assert.equal(L.shockIndex({ dpdtMax: 200, d2PitchMax: 30 }, S()), 0.5));

console.log('판정 (AC-06, AC-09)');
test('항목 판정: 상한 0.5, CAUTION 10% → 0.40 OK · 0.47 CAUTION · 0.6 NG', () => {
  assert.equal(L.judgeItem(0.4, null, 0.5, 10).state, 'ok');
  assert.equal(L.judgeItem(0.47, null, 0.5, 10).state, 'caution');
  assert.equal(L.judgeItem(0.6, null, 0.5, 10).state, 'fail');
  assert.equal(L.judgeItem(0.6, null, null, 10).state, 'nodata');
});
const crit = { stabMin: 0.1, stabMax: 1, shockMax: 0.5, respMax: 0.3 };
test('충격 초과 → FAIL-SHOCK', () => assert.equal(L.judgeEvent({ dPitch: 0.5, shockIndex: 0.6, response: 0.2 }, crit, S()).status, 'FAIL-SHOCK'));
test('충격은 낮고 응답 느림 → FAIL-SLOW', () => assert.equal(L.judgeEvent({ dPitch: 0.5, shockIndex: 0.3, response: 0.4 }, crit, S()).status, 'FAIL-SLOW'));
test('ΔPitch 초과 → FAIL-PITCH', () => assert.equal(L.judgeEvent({ dPitch: 1.2, shockIndex: 0.3, response: 0.2 }, crit, S()).status, 'FAIL-PITCH'));
test('모두 안쪽 → PASS', () => assert.equal(L.judgeEvent({ dPitch: 0.5, shockIndex: 0.3, response: 0.2 }, crit, S()).status, 'PASS'));
test('기준 없음 → NO DATA', () => assert.equal(L.judgeEvent({ dPitch: 0.5, shockIndex: 0.3, response: 0.2 }, undefined, S()).status, 'NO DATA'));
test('Safety Limit 이 감성보다 우선: 기준은 PASS 여도 압력 초과면 FAIL', () => {
  const s = S(); s.safety.pressureMax = 100;
  const j = L.judgeEvent({ dPitch: 0.5, shockIndex: 0.3, response: 0.2, pPeak: 120 }, crit, s);
  assert.equal(j.status, 'FAIL-SHOCK'); assert.equal(j.safety, true);
});
test('결측·공백 구간 이벤트 → NO DATA', () => assert.equal(L.judgeEvent({ dPitch: 0.5, shockIndex: 0.3, response: 0.2, noData: '공백' }, crit, S()).status, 'NO DATA'));

console.log('라벨 · 허용 범위 · 추천 (AC-07, AC-09)');
const lab = (ramp, over, dp, sh, rs) => L.normalizeLabel({ direction: 'UP', zone: 1, event: 'Start', ramp_value: ramp, overall: over, delta_pitch: dp, shock_index: sh, response_s: rs });
const labels = [lab(100, 'Accept', .2, .5, .1), lab(200, 'Accept', .4, .7, .2), lab(300, 'Accept', .3, .6, .15), lab(400, 'Reject', .9, 1.2, .05)];
test('Accepted 3건의 최소~최대로 허용 범위', () => {
  const r = L.criteriaFromLabels(labels, 'UP_1_start', 3);
  assert.equal(r.ok, true);
  assert.deepEqual([r.crit.stabMin, r.crit.stabMax, r.crit.shockMax, r.crit.respMax], [0.2, 0.4, 0.7, 0.2]);
  assert.equal(L.criteriaFromLabels(labels, 'UP_1_start', 4).ok, false);
});
test('추천: 상위 75% = 250, 현재 200 에서 ±20%(40) 제한 → 240', () => {
  // 백분위 위치 (3−1)×0.75 = 1.5 → 200 + (300−200)×0.5 = 250
  const r = L.recommend('UP_1_start', 200, labels, S());
  assert.deepEqual([r.status, r.value, r.delta, r.target], ['CHANGE', 240, 40, 250]);
});
test('추천: 이미 목표값이면 유지', () => assert.equal(L.recommend('UP_1_start', 250, labels, S()).status, 'KEEP'));
test('추천: Accepted 2건 < 최소 3건 → NO DATA, 값 없음', () => {
  const r = L.recommend('UP_1_start', 200, labels.slice(1), S());
  assert.equal(r.status, 'NO DATA'); assert.equal(r.value, null); assert.match(r.reason, /데이터 부족/);
});
test('라벨 파일 읽기: 잘못된 overall 행은 건너뜀', () => {
  const r = L.labelsFromTable(['direction', 'zone', 'event', 'overall'], [['UP', '2', 'Stop', 'Accept'], ['DOWN', '1', 'Start', 'OK?']]);
  assert.equal(r.labels.length, 1); assert.equal(L.labelKey(r.labels[0]), 'UP_2_stop'); assert.equal(r.problems.length, 1);
});
test('Calibration Set 표 왕복', () => {
  const s = S(), v = Smp.sampleSet(), rows = L.setToRows(v, s);
  const back = L.setFromTable(L.SET_HEADER, rows);
  assert.equal(back.ok, true); assert.deepEqual(back.values, v);
});

console.log('CSV');
test('따옴표·쉼표·세미콜론 구분자', () => {
  assert.deepEqual(L.parseCsv('a,b\n"x,1","y""z"\n'), [['a', 'b'], ['x,1', 'y"z']]);
  assert.deepEqual(L.parseCsv('a;b\r\n1;2'), [['a', 'b'], ['1', '2']]);
});

console.log('Channel Mapping (제출 기획서 4.3, AC-13~16)');
const H = Smp.HEADERS;
const smallTable = () => L.tableFromRows(Smp.sampleLog(Smp.sampleSet()).slice(0, 400));
test('헤더 단위 읽기', () => assert.deepEqual(['Time[s]', 'LOGE_::EPPR_ArmUp[mA]', 'LABHRP::FFD2_ArmCylinderHeadPressure', 'LOGI_::AngleSensorVoltage_Arm[mV]'].map(L.headerUnit), ['s', 'mA', '', 'mV']));
test('자동추천: 제출 기획서 표와 같은 연결, 전압 채널은 Arm 으로 안 고름', () => {
  const m = L.recommendMapping(L.columnStats(smallTable()), 'split');
  assert.equal(m.rows.time.header, 'Time[s]');
  assert.equal(m.rows.arm.header, 'LASP::FFD3_BoomAnglePercentage');
  assert.equal(m.rows.curUp.header, 'LOGE_::EPPR_ArmUp[mA]');
  assert.equal(m.rows.curDown.header, 'LOGE_::EPPR_ArmDown[mA]');
  assert.equal(m.rows.headP.header, 'LABHRP::FFD2_ArmCylinderHeadPressure');
  assert.equal(m.rows.pitch.header, 'Body_IMU_Angle_SQ::PitchAngle[deg]');
  assert.equal(m.rows.rpm.header, 'EEC1::EngSpeed[rpm]');
  assert.ok(Object.values(m.rows).every(r => r.header !== 'LOGI_::AngleSensorVoltage_Arm[mV]'));
  assert.equal(m.rows.headP.unit, '', '압력 단위는 추정하지 않음');
  assert.equal(m.rows.curUp.role, '', 'EPPR 이름만으로 Command/Actual 을 정하지 않음');
  assert.ok(Object.values(m.rows).every(r => !r.confirmed), '추천은 확인 완료가 아님');
});
test('확인 전에는 차단, 단위·역할·확인을 채우면 통과, 선택 미매핑은 경고만', () => {
  const m = L.recommendMapping(L.columnStats(smallTable()), 'split');
  let v = L.validateMapping(m);
  assert.equal(v.canConfirm, false);
  assert.ok(v.errors.some(e => /Head Pressure: 단위/.test(e)));
  assert.ok(v.errors.some(e => /UP: Command \/ Actual/.test(e)));
  m.rows.headP.unit = 'bar'; m.rows.curUp.role = 'command'; m.rows.curDown.role = 'actual';
  Object.values(m.rows).forEach(r => { if (r.header) r.confirmed = true; });
  v = L.validateMapping(m);
  assert.equal(v.canConfirm, true);
  assert.ok(v.warnings.some(w => /Oil Temperature: 미매핑/.test(w)));
  assert.ok(v.warnings.some(w => /전류 % 보정/.test(w)));
});
test('같은 헤더를 두 신호에 연결하면 경고', () => {
  const m = L.recommendMapping(L.columnStats(smallTable()), 'split');
  m.rows.rodP.header = m.rows.headP.header;
  assert.ok(L.validateMapping(m).warnings.some(w => /중복 연결/.test(w)));
});
test('Confirm 전 분석 시작은 막힘', () => {
  const m = Smp.mappingFromProfile(Smp.sampleProfile()); m.confirmed = false;
  const r = L.analyze(smallTable(), m, S());
  assert.equal(r.ok, false);
});
test('Profile 재사용: 헤더가 바뀌면 변경으로 표시하고 확인은 다시', () => {
  const tb = smallTable(), st = L.columnStats(tb);
  const pr = Smp.sampleProfile();
  const st2 = st.map(x => x.header === H[5] ? { ...x, header: 'IMU::Pitch[deg]' } : x);
  const ap = L.applyProfile(pr, st2);
  assert.equal(ap.mapping.rows.pitch.header, '');
  assert.ok(ap.changes.some(c => /Pitch Angle: 헤더 없음/.test(c)));
  assert.ok(Object.values(ap.mapping.rows).every(r => !r.confirmed));
  assert.equal(ap.mapping.rows.arm.header, H[1]);
});
test('단위 변환: ms→s, MPa→bar(×10), rad→deg, mA→% (I0 100, I100 600: 350 mA = 50%)', () => {
  const tb = L.tableFromRows([['T[ms]', 'A', 'U[mA]', 'D[mA]', 'P', 'Pi[rad]'], ['0', '10', '350', '100', '1.5', '0'], ['10', '10', '350', '100', '1.5', String(Math.PI / 2)], ['20', '10', '350', '100', '1.5', '0']]);
  const m = L.emptyMapping('split');
  m.rows = { time: { header: 'T[ms]', unit: 'ms' }, arm: { header: 'A', unit: '%' }, curUp: { header: 'U[mA]', unit: 'mA', role: 'command' }, curDown: { header: 'D[mA]', unit: 'mA', role: 'command' }, headP: { header: 'P', unit: 'MPa' }, pitch: { header: 'Pi[rad]', unit: 'rad' } };
  m.cal.UP = { i0: 100, i100: 600 };
  const sig = L.buildSignals(tb, m, S());
  assert.deepEqual(sig.t.map(x => L.round(x, 6)), [0, 0.01, 0.02]);
  assert.equal(sig.p[0], 15);
  assert.equal(L.round(sig.pitch[1], 6), 90);
  assert.equal(sig.cur.UP[0], 50); assert.equal(sig.curUnit.UP, '%');
  assert.equal(sig.cur.DOWN[0], 100); assert.equal(sig.curUnit.DOWN, 'mA', '보정 없으면 mA 그대로');
});

console.log('데이터 품질 (AC-17)');
test('첫 행 전 채널 0 · 시간 역전 · 긴 결측을 위치와 함께 표시', () => {
  const rows = [['Time[s]', 'Arm%', 'P']];
  rows.push(['0', '0', '0']);
  for (let i = 1; i <= 20; i++) rows.push([String(L.round(i * 0.01, 2)), String(i), String(50 + i)]);
  rows[8][0] = '0.05'; // 7행째 시간 0.07 → 0.05 로 역전
  for (let i = 12; i <= 16; i++) rows[i][2] = ''; // 결측 5행 > 허용 3행
  const tb = L.tableFromRows(rows), m = L.emptyMapping('split');
  m.rows = { time: { header: 'Time[s]', unit: 's' }, arm: { header: 'Arm%', unit: '%' }, headP: { header: 'P', unit: 'bar' } };
  const q = L.qualityReport(tb, m, S());
  const codes = q.map(x => x.code);
  assert.ok(codes.includes('firstZero')); assert.ok(codes.includes('timeOrder'));
  const miss = q.find(x => x.code === 'missing');
  assert.equal(miss.level, 'error'); assert.match(miss.msg, /결측·숫자 변환 실패 5건/); assert.match(miss.msg, /최장 연속 5행\(13행~\)/);
});

console.log('예시 데이터 전체 흐름 · 회귀 (AC-04, AC-10, AC-19)');
const full = L.tableFromRows(Smp.sampleLog(Smp.sampleSet()));
const mapping = Smp.mappingFromProfile(Smp.sampleProfile());
const res = L.analyze(full, mapping, S());
test('예시 로그 분석: 이벤트 검출, Start·Stop 번갈아', () => {
  assert.equal(res.ok, true); assert.ok(res.events.length >= 20);
  res.events.forEach((e, i) => assert.equal(e.type, i % 2 ? 'stop' : 'start'));
});
test('실측 Ramp 가 설정값을 되찾음 (UP Zone 1 Start 300 %/s → ±5%)', () => {
  const e = res.events.find(x => x.key === 'UP_1_start');
  near(e.f.rampMeasured, 300, 15, 'rampMeasured');
  assert.equal(e.f.curUnit, '%');
});
test('다른 헤더·단위(ms, MPa)로 같은 신호를 넣으면 같은 이벤트·Feature', () => {
  const idxT = 0, idxP = 4;
  const rows2 = [full.header.map((h, i) => i === idxT ? 'Timestamp[ms]' : i === idxP ? 'HeadPress[MPa]' : h)]
    .concat(full.data.map(r => r.map((c, i) => i === idxT ? L.round(Number(c) * 1000, 3) : i === idxP ? Number(c) / 10 : c)));
  const tb2 = L.tableFromRows(rows2), m2 = JSON.parse(JSON.stringify(mapping));
  m2.rows.time = { header: 'Timestamp[ms]', unit: 'ms', confirmed: true }; m2.rows.headP = { header: 'HeadPress[MPa]', unit: 'MPa', confirmed: true };
  const r2 = L.analyze(tb2, m2, S());
  assert.equal(r2.events.length, res.events.length);
  r2.events.forEach((e, i) => {
    const a = res.events[i];
    assert.equal(e.key, a.key); near(e.t, a.t, 1e-6);
    near(e.f.dpdtMax, a.f.dpdtMax, 0.02, 'dP/dt'); near(e.f.shockIndex, a.f.shockIndex, 0.002, 'SI');
  });
});
test('보정 없는 매핑이면 실측 Ramp 는 mA/s', () => {
  const m3 = JSON.parse(JSON.stringify(mapping)); m3.cal.UP = { i0: null, i100: null };
  const r3 = L.analyze(full, m3, S());
  const e = r3.events.find(x => x.key === 'UP_1_start');
  assert.equal(e.f.curUnit, 'mA');
  near(e.f.rampMeasured, 300 * 5.5, 80, 'mA/s'); // 1% = (650−100)/100 = 5.5 mA
});

console.log(`\n${passed}개 통과${process.exitCode ? ' — 실패 있음' : ''}`);
