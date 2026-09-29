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
const crit = { stabMax: 1, shockMax: 0.5, respMax: 0.3 };
test('충격 초과 → FAIL-SHOCK', () => assert.equal(L.judgeEvent({ dPitch: 0.5, shockIndex: 0.6, response: 0.2 }, crit, S()).status, 'FAIL-SHOCK'));
test('충격은 낮고 응답 느림 → FAIL-SLOW', () => assert.equal(L.judgeEvent({ dPitch: 0.5, shockIndex: 0.3, response: 0.4 }, crit, S()).status, 'FAIL-SLOW'));
test('ΔPitch 초과 → FAIL-PITCH', () => assert.equal(L.judgeEvent({ dPitch: 1.2, shockIndex: 0.3, response: 0.2 }, crit, S()).status, 'FAIL-PITCH'));
test('안정도 하한 삭제(09-29 요청): 옛 저장값 stabMin 이 남아 있어도 작은 ΔPitch 는 FAIL 이 아님', () => {
  const j = L.judgeEvent({ dPitch: 0.05, shockIndex: 0.3, response: 0.2 }, Object.assign({ stabMin: 0.1 }, crit), S());
  assert.equal(j.status, 'PASS'); assert.equal(j.items[0].crit, '1 이하');
});
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
  assert.deepEqual([r.crit.stabMax, r.crit.shockMax, r.crit.respMax], [0.4, 0.7, 0.2]);
  assert.equal('stabMin' in r.crit, false, '안정도 하한은 만들지 않음(09-29 요청)');
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

console.log('차트 커서 — Tracking · Value Difference (09-29 요청)');
{
  const t = [0, 0.01, 0.02, 0.03], y = [0, 10, 30, NaN];
  test('보간: 0.015 s 는 10 과 30 사이 가운데 → 20, 샘플 위치는 그 값', () => {
    near(L.interpAt(t, y, 0.015), 20, 1e-9); assert.equal(L.interpAt(t, y, 0.01), 10); assert.equal(L.interpAt(t, y, 0), 0);
    near(L.interpAt(t, y, 0.0025), 2.5, 1e-9); // 0 + (10−0)×0.25
  });
  test('보간: 범위 밖·결측 이웃은 NaN (값을 지어내지 않음)', () => {
    assert.ok(Number.isNaN(L.interpAt(t, y, -0.001))); assert.ok(Number.isNaN(L.interpAt(t, y, 0.031)));
    assert.ok(Number.isNaN(L.interpAt(t, y, 0.025))); assert.ok(Number.isNaN(L.interpAt(t, y, 0.03)));
  });
  test('Value Difference: A 0.005 s(5) · B 0.015 s(20) → Δy 15, Δx 0.01', () => {
    const d = L.cursorDiff(t, y, 0.005, 0.015);
    near(d.ya, 5, 1e-9); near(d.yb, 20, 1e-9); near(d.dy, 15, 1e-9); near(d.dx, 0.01, 1e-12);
    const r = L.cursorDiff(t, y, 0.015, 0.005); near(r.dy, -15, 1e-9); near(r.dx, -0.01, 1e-12); // 순서를 바꾸면 부호가 바뀜
    assert.ok(Number.isNaN(L.cursorDiff(t, y, 0.005, 0.025).dy));
  });
  test('Ramp Profile 선에서도 같은 보간: Start 100 %/s·유지 1 s·Stop 50 %/s, 0.5 s → 50 %, 2.5 s → 75 %', () => {
    const pts = L.profilePoints(100, 50, { amp: 100, hold: 1 }); // [0,0] [1,100] [2,100] [4,0]
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    near(L.interpAt(xs, ys, 0.5), 50, 1e-9); near(L.interpAt(xs, ys, 1.5), 100, 1e-9); near(L.interpAt(xs, ys, 2.5), 75, 1e-9);
    near(L.interpAt(xs, ys, 3.5), 25, 1e-9);
  });
  test('화면 비율 → 축 값: 양 끝에서 멈춤', () => {
    assert.equal(L.fracToX(0.5, 10, 20), 15); assert.equal(L.fracToX(-1, 10, 20), 10); assert.equal(L.fracToX(3, 10, 20), 20);
  });
}


console.log('Zone별 점수 배율 (2026-09-29 오전 2차 요청)');
{
  test('기본 배율은 4 Zone × 3 항목 모두 1', () => {
    const w = S().zoneWeight;
    assert.deepEqual(Object.keys(w), ['1', '2', '3', '4']);
    Object.values(w).forEach(r => assert.deepEqual(r, { stab: 1, shock: 1, resp: 1 }));
    assert.equal(L.isDefaultWeights(S()), true);
  });
  // 경계값을 포함한 격자: 상한 0.5 · 1 · 0.3 과 CAUTION 10% 경계(0.45·0.9·0.27) 바로 안팎, 부동소수 값 포함
  const vals = { dPitch: [0, 0.3, 0.9, 0.9000001, 0.8999999, 1, 1.0000001, 1.2, NaN], shockIndex: [0.1, 0.45, 0.4500001, 0.5, 0.5000001, 0.1 + 0.2, NaN], response: [0.2, 0.27, 0.2700001, 0.3, 0.3000001, 0.7 * 0.3 / 0.7, NaN] };
  test('기본 배율(1)에서는 모든 Zone·경계값 조합의 판정이 배율 도입 전과 같다', () => {
    let n = 0;
    for (const a of vals.dPitch) for (const b of vals.shockIndex) for (const c of vals.response) for (const z of [1, 2, 3, 4]) {
      const f = { dPitch: a, shockIndex: b, response: c };
      const j = L.judgeEvent(f, crit, S(), z), j0 = L.judgeEvent(f, crit, S());
      assert.equal(j.status, j0.status); assert.deepEqual(j.reasons, j0.reasons);
      // 항목 판정은 배율 없이 측정값 그대로 judgeItem 에 넣은 결과와 같다(배율 도입 전 식)
      [[a, crit.stabMax], [b, crit.shockMax], [c, crit.respMax]].forEach(([v, hi], i) => {
        const r = L.judgeItem(v, null, hi, 10); assert.equal(j.items[i].state, r.state); assert.equal(j.items[i].why, r.why);
      });
      n++;
    }
    assert.equal(n, 9 * 7 * 7 * 4);
  });
  test('기본 배율에서 예시 로그 32개 이벤트 판정이 배율 도입 전(dea45da)과 한 글자도 같다', () => {
    const s = S(), lbs = Smp.sampleLabels(s), cr = {};
    L.PARAM_KEYS.forEach(k => { const r = L.criteriaFromLabels(lbs, k, s.recommend.minLabels); if (r.ok) cr[k] = r.crit; });
    const rs = L.analyze(L.tableFromRows(Smp.sampleLog(Smp.sampleSet())), Smp.mappingFromProfile(Smp.sampleProfile()), s);
    // 아래 문자열은 배율을 넣기 전 코드(커밋 dea45da)로 같은 계산을 돌려 얻은 값입니다
    const before = 'PASS,FAIL-PITCH,CAUTION,FAIL-PITCH,PASS,NO DATA,FAIL-PITCH,NO DATA,PASS,FAIL-SLOW,FAIL-PITCH,CAUTION,FAIL-PITCH,PASS,NO DATA,PASS,FAIL-PITCH,NO DATA,PASS,FAIL-SHOCK,FAIL-PITCH,PASS,FAIL-PITCH,CAUTION,PASS,NO DATA,FAIL-PITCH,CAUTION,FAIL-PITCH,NO DATA,FAIL-PITCH,PASS';
    assert.equal(rs.events.map(e => L.judgeEvent(e.f, cr[e.key], s, e.zone).status).join(','), before);
  });
  test('배율 2: ΔPitch 0.6(상한 1) → 적용값 1.2 로 FAIL-PITCH, 다른 Zone 은 그대로 PASS', () => {
    const s = S(); s.zoneWeight[2].stab = 2;
    const f = { dPitch: 0.6, shockIndex: 0.3, response: 0.2 };
    const j = L.judgeEvent(f, crit, s, 2);
    assert.equal(j.status, 'FAIL-PITCH'); near(j.items[0].weighted, 1.2, 1e-12); near(j.items[0].score, 120, 1e-9);
    assert.match(j.items[0].why, /배율 ×2/);
    assert.equal(L.judgeEvent(f, crit, s, 1).status, 'PASS');
  });
  test('배율 0.5: 응답 0.4(상한 0.3) → 적용값 0.2 로 FAIL-SLOW 가 풀림', () => {
    const s = S(); s.zoneWeight[4].resp = 0.5;
    const f = { dPitch: 0.5, shockIndex: 0.3, response: 0.4 };
    assert.equal(L.judgeEvent(f, crit, s, 3).status, 'FAIL-SLOW');
    assert.equal(L.judgeEvent(f, crit, s, 4).status, 'PASS');
  });
  test('배율 1.1: 충격 0.42(상한 0.5, 84%) → 적용값 0.462(92.4%) 로 CAUTION', () => {
    const s = S(); s.zoneWeight[1].shock = 1.1;
    const j = L.judgeEvent({ dPitch: 0.5, shockIndex: 0.42, response: 0.2 }, crit, s, 1);
    assert.equal(j.status, 'CAUTION'); near(j.items[1].score, 92.4, 1e-9);
  });
  test('종합 점수 = 세 항목 점수 중 최댓값: 0.5/1=50 · 0.3/0.5=60 · 0.2/0.3=66.7 → 66.7', () => {
    const j = L.judgeEvent({ dPitch: 0.5, shockIndex: 0.3, response: 0.2 }, crit, S(), 1);
    assert.deepEqual(j.items.map(i => i.score), [50, 60, 66.7]); assert.equal(j.score, 66.7);
    assert.ok(Number.isNaN(L.judgeEvent({ dPitch: 0.5, shockIndex: 0.3, response: NaN }, crit, S(), 1).score));
  });
  test('배율 0 은 그 항목을 판정에서 빼는 것과 같다(적용값 0)', () => {
    const s = S(); s.zoneWeight[3].shock = 0;
    assert.equal(L.judgeEvent({ dPitch: 0.5, shockIndex: 9, response: 0.2 }, crit, s, 3).status, 'PASS');
  });
  test('저장본·백업의 배율 정리: 문자열 숫자는 받고, 음수·10 초과·글자는 1 로, 빠진 Zone 은 1', () => {
    const m = L.mergeSettings({ zoneWeight: { 1: { stab: '1.5', shock: -1, resp: 11 }, 3: { stab: 'x', shock: 0, resp: 2 } } });
    assert.deepEqual(m.zoneWeight[1], { stab: 1.5, shock: 1, resp: 1 });
    assert.deepEqual(m.zoneWeight[2], { stab: 1, shock: 1, resp: 1 });
    assert.deepEqual(m.zoneWeight[3], { stab: 1, shock: 0, resp: 2 });
    assert.deepEqual(L.mergeSettings({}).zoneWeight, S().zoneWeight); // 배율이 없던 옛 저장본
    assert.equal(L.isDefaultWeights(m), false);
  });
  test('백업 JSON 왕복: 내보낸 배율이 그대로 되살아난다', () => {
    const s = S(); s.zoneWeight[2].resp = 1.25; s.zoneWeight[4].stab = 0.8;
    const back = L.mergeSettings(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(back.zoneWeight, s.zoneWeight);
  });
  test('이벤트 결과 CSV 에 배율 3칸·종합 점수가 들어간다', () => {
    const iw = L.EVENT_HEADER.indexOf('w_stab'), io = L.EVENT_HEADER.indexOf('overall_score');
    assert.ok(iw > 0 && io === iw + 3 && L.EVENT_HEADER[io + 1] === 'status');
    const s = S(); s.zoneWeight[1].shock = 1.6;
    const ev = [{ no: 1, type: 'start', t: 1, dir: 'UP', zone: 1, arm: 10, key: 'UP_1_start', f: { dPitch: 0.5, shockIndex: 0.3, response: 0.2 } }];
    const row = L.eventRows(ev, e => L.judgeEvent(e.f, crit, s, e.zone))[0];
    assert.deepEqual(row.slice(iw, io + 2), [1, 1.6, 1, 96, 'CAUTION']);
  });
}

console.log('실제 로그 열 형식 (2026-09-29 메일로 받은 sample data.csv 와 같은 열 이름·순서, 값은 가상)');
{
  const rows = Smp.realOrderLog(Smp.sampleSet(), 31), tb = L.tableFromRows(rows), m = L.recommendMapping(L.columnStats(tb), 'split');
  test('열 순서가 실제 로그와 같다 (Time, EngSpeed, Pitch, BoomAngle%, HeadPressure, AngleVoltage, EPPR Up, EPPR Down)', () => assert.deepEqual(rows[0], Smp.REAL_ORDER));
  test('자동추천이 실제 채널명을 표준 신호에 잇는다', () => {
    const got = Object.fromEntries(['time', 'arm', 'curUp', 'curDown', 'headP', 'pitch', 'rpm'].map(k => [k, m.rows[k].header]));
    assert.deepEqual(got, { time: 'Time[s]', arm: 'LASP::FFD3_BoomAnglePercentage', curUp: 'LOGE_::EPPR_ArmUp[mA]', curDown: 'LOGE_::EPPR_ArmDown[mA]',
      headP: 'LABHRP::FFD2_ArmCylinderHeadPressure', pitch: 'Body_IMU_Angle_SQ::PitchAngle[deg]', rpm: 'EEC1::EngSpeed[rpm]' });
  });
  test('Arm: 이름은 맞지만 [mV] 인 AngleSensorVoltage_Arm 은 자동 선택하지 않고 「확인 필요」로 남긴다', () => {
    assert.deepEqual(m.rows.arm.unitRejected, ['LOGI_::AngleSensorVoltage_Arm[mV]']); assert.match(m.rows.arm.reason, /확인 필요/);
    assert.deepEqual(m.rows.pitch.unitRejected, []);
  });
  test('단위 없는 Head Pressure 와 EPPR 역할은 추정하지 않아 Confirm 전에 사람이 정해야 한다', () => {
    assert.equal(m.rows.headP.unit, ''); assert.equal(m.rows.curUp.role, '');
    Object.values(m.rows).forEach(r => { if (r.header) r.confirmed = true; });
    const v = L.validateMapping(m); assert.equal(v.canConfirm, false);
    assert.ok(v.errors.some(e => /Head Pressure: 단위/.test(e)) && v.errors.some(e => /Command \/ Actual/.test(e)));
  });
  test('단위·역할을 정하면 끝까지 분석된다: 4 Zone × UP/DOWN × Start/Stop 이 모두 검출', () => {
    m.rows.headP.unit = 'bar'; m.rows.curUp.role = 'command'; m.rows.curDown.role = 'command'; m.excludeFirstRow = true;
    assert.equal(L.validateMapping(m).canConfirm, true); m.confirmed = true;
    const r = L.analyze(tb, m, S()); assert.equal(r.ok, true);
    const keys = new Set(r.events.map(e => e.key));
    assert.equal(keys.size, 16, '검출된 파라미터 키 ' + [...keys].join(','));
    r.events.forEach(e => assert.ok(['PASS', 'CAUTION', 'FAIL-SHOCK', 'FAIL-PITCH', 'FAIL-SLOW', 'NO DATA'].includes(L.judgeEvent(e.f, { stabMax: 1, shockMax: 1, respMax: 1 }, S(), e.zone).status)));
  });
}

console.log(`\n${passed}개 통과${process.exitCode ? ' — 실패 있음' : ''}`);
