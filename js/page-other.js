/* 기준 Profile·라벨 / 버전·이력 / 설정·데이터 */
(function (root) {
  'use strict';
  var L = root.CRLogic, C = root.CRCharts, App = root.App, esc = C.esc, fmt = C.fmt;
  var labFilter = '';
  // 안정도 ΔPitch 하한(stabMin)은 2026-09-29 수강생 요청으로 뺐습니다 — 세 항목 모두 상한으로 봅니다
  var CRIT_FIELDS = [['stabMax', '안정도 ΔPitch 상한 (°)'], ['shockMax', 'Shock Index 상한'], ['respMax', '응답 시간 상한 (s)']];

  // ── 기준 시험원 Profile · 라벨 DB ──────────────────────────────
  App.pages.profile = function (main) {
    var st = App.st, s = App.S();
    var h = '<div class="page-head"><h1>기준 시험원 Profile · 라벨</h1></div>';
    h += '<div class="card"><h2>허용 범위 (Zone × 방향 × Start/Stop)</h2><p class="note">판정표의 기준입니다. 비워 둔 칸은 「기준 없음」으로 NO DATA 가 됩니다. 안정도(ΔPitch)·충격지수·응답성 모두 상한으로 봅니다(안정도 하한은 2026-09-29 요청으로 뺐습니다). 상한 안쪽 ' + s.cautionPct + '% 이내는 CAUTION 입니다(설정에서 바꿈).</p>' +
      '<div class="btn-row" style="margin-bottom:8px"><button class="btn btn-primary" id="fromLabels">Accepted 라벨로 허용 범위 만들기</button><button class="btn" id="critCsv">허용 범위 CSV</button>' + App.fileInput('critFile', '.csv,.xlsx,.xls', '허용 범위 가져오기') + '</div>' +
      '<div class="table-wrap"><table class="list"><thead><tr><th>파라미터</th>' + CRIT_FIELDS.map(function (f) { return '<th>' + f[1] + '</th>'; }).join('') + '<th>출처</th></tr></thead><tbody>' +
      L.PARAM_KEYS.map(function (k) {
        var c = st.criteria[k] || {};
        return '<tr><td>' + esc(L.paramLabel(k)) + '</td>' + CRIT_FIELDS.map(function (f) { return '<td><input class="inp" type="number" step="any" data-crit="' + k + ':' + f[0] + '" value="' + (L.isNum(c[f[0]]) ? c[f[0]] : '') + '" aria-label="' + esc(L.paramLabel(k) + ' ' + f[1]) + '"></td>'; }).join('') + '<td><small class="note">' + esc(c.source || (Object.keys(c).length ? '직접 입력' : '없음')) + '</small></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    // 라벨 DB
    var cnt = { Accept: 0, Borderline: 0, Reject: 0 };
    st.labels.forEach(function (l) { cnt[l.overall] = (cnt[l.overall] || 0) + 1; });
    var rows = st.labels.filter(function (l) { return !labFilter || L.labelKey(l) === labFilter; });
    h += '<div class="card"><h2>라벨 DB (' + st.labels.length + '건 — Accept ' + cnt.Accept + ' · Borderline ' + cnt.Borderline + ' · Reject ' + cnt.Reject + ')</h2>' +
      '<p class="note">Calibration 화면의 「이 이벤트에 라벨 기록」으로 쌓거나, 파일로 가져옵니다. 열 이름은 아래 표 머리와 같습니다(필수: direction, zone, event, overall). 제출자가 준비 중인 라벨 파일을 이 형식으로 맞추면 됩니다.</p>' +
      '<div class="btn-row" style="margin-bottom:8px"><label class="field" style="min-width:16em"><span>파라미터로 거르기</span><select class="inp" id="labFilter">' + App.opt('', '전체', labFilter) + L.PARAM_KEYS.map(function (k) { return App.opt(k, L.paramLabel(k), labFilter); }).join('') + '</select></label>' +
      App.fileInput('labFile', '.csv,.xlsx,.xls', '라벨 가져오기 (CSV·Excel)') + '<button class="btn" id="labCsv">라벨 CSV</button><button class="btn" id="labXlsx">라벨 Excel</button><button class="btn btn-danger" id="labClear">라벨 모두 지우기</button></div>';
    if (!rows.length) h += '<p class="empty">라벨이 없습니다.</p>';
    else {
      var cols = ['label_id', 'date', 'expert', 'set_version', 'direction', 'zone', 'event', 'ramp_value', 'response_s', 'delta_pitch', 'shock_index', 'shock_label', 'pitch_label', 'resp_label', 'overall', 'memo'];
      h += '<div class="table-wrap scroll-y"><table class="list"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
        rows.slice(0, 300).map(function (l) { return '<tr>' + cols.map(function (c) { return '<td' + (typeof l[c] === 'number' ? ' class="num"' : '') + '>' + esc(l[c]) + '</td>'; }).join('') + '<td><button class="btn btn-sm btn-danger" data-dl="' + esc(l.label_id) + '">삭제</button></td></tr>'; }).join('') +
        '</tbody></table></div>' + (rows.length > 300 ? '<p class="note">처음 300건만 보입니다. 전체는 내보내기로 확인하세요.</p>' : '');
    }
    h += '</div>';
    main.innerHTML = h;
    main.querySelectorAll('[data-crit]').forEach(function (el) {
      el.addEventListener('change', function () {
        var p = el.getAttribute('data-crit').split(':'), c = st.criteria[p[0]] = st.criteria[p[0]] || {};
        var v = L.num(el.value); c[p[1]] = L.isNum(v) ? v : null; c.source = '직접 입력 ' + App.nowStr().slice(0, 10); App.save();
      });
    });
    main.querySelector('#fromLabels').addEventListener('click', function () {
      var made = [], lack = [];
      L.PARAM_KEYS.forEach(function (k) { var r = L.criteriaFromLabels(st.labels, k, s.recommend.minLabels); if (r.ok) { st.criteria[k] = r.crit; made.push(k); } else lack.push(L.paramLabel(k) + ' (Accepted ' + r.n + '건)'); });
      App.save(); App.render();
      App.dialog('허용 범위 만들기', '<p>' + made.length + '개 파라미터의 허용 범위를 Accepted 라벨의 최댓값(ΔPitch·Shock Index·응답 시간 상한)으로 바꿨습니다.</p>' + (lack.length ? '<p>Accepted 라벨이 ' + s.recommend.minLabels + '건 미만이라 그대로 둔 것:</p><ul class="msgs">' + lack.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''));
    });
    main.querySelector('#critCsv').addEventListener('click', function () {
      App.downloadCsv('허용범위', ['parameter_key', 'parameter'].concat(CRIT_FIELDS.map(function (f) { return f[0]; })).concat(['source']), L.PARAM_KEYS.map(function (k) { var c = st.criteria[k] || {}; return [k, L.paramLabel(k)].concat(CRIT_FIELDS.map(function (f) { return c[f[0]]; })).concat([c.source || '']); }));
    });
    main.querySelector('#critFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      App.readTableFile(f).then(function (rows) {
        var tb = L.tableFromRows(rows), ki = tb.header.indexOf('parameter_key'), n = 0;
        if (ki < 0) throw new Error('parameter_key 열이 필요합니다');
        tb.data.forEach(function (r) {
          var k = r[ki]; if (L.PARAM_KEYS.indexOf(k) < 0) return;
          var c = {}; CRIT_FIELDS.forEach(function (fd) { var i = tb.header.indexOf(fd[0]), v = i >= 0 ? L.num(r[i]) : NaN; c[fd[0]] = L.isNum(v) ? v : null; });
          c.source = '파일 ' + f.name; st.criteria[k] = c; n++;
        });
        App.save(); App.toast('허용 범위 ' + n + '개를 가져왔습니다'); App.render();
      }).catch(function (er) { App.toast(er.message, true); });
    });
    main.querySelector('#labFilter').addEventListener('change', function (e) { labFilter = e.target.value; App.render(); });
    main.querySelector('#labFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      App.readTableFile(f).then(function (rows) {
        var tb = L.tableFromRows(rows), r = L.labelsFromTable(tb.header, tb.data);
        st.labels = st.labels.concat(r.labels); App.save(); App.render();
        App.dialog('라벨 가져오기', '<p>' + r.labels.length + '건을 추가했습니다.</p>' + (r.problems.length ? '<p>건너뛴 행:</p><ul class="msgs">' + r.problems.slice(0, 30).map(function (p) { return '<li class="warn">' + esc(p) + '</li>'; }).join('') + '</ul>' : ''));
      }).catch(function (er) { App.toast(er.message, true); });
    });
    function labRows() { return st.labels.map(function (l) { return L.LABEL_FIELDS.map(function (k) { return l[k]; }); }); }
    main.querySelector('#labCsv').addEventListener('click', function () { App.downloadCsv('라벨DB', L.LABEL_FIELDS, labRows()); });
    main.querySelector('#labXlsx').addEventListener('click', function () { App.downloadXlsx('라벨DB', [{ name: '라벨DB', header: L.LABEL_FIELDS, rows: labRows() }]); });
    main.querySelector('#labClear').addEventListener('click', function () {
      App.dialog('라벨 모두 지우기', '<p>라벨 ' + st.labels.length + '건을 지웁니다. 먼저 내보내 두세요.</p>', [{ label: '취소' }, { label: '지우기', onClick: function () { st.labels = []; App.save(); App.render(); } }]);
    });
    main.querySelectorAll('[data-dl]').forEach(function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-dl'); st.labels = st.labels.filter(function (l) { return String(l.label_id) !== id; }); App.save(); App.render(); }); });
  };

  // ── 버전 · 이력 (AC-08) ────────────────────────────────────────
  var cmp = { a: '', b: '__cur' };
  App.pages.versions = function (main) {
    var st = App.st, vs = st.versions;
    if (!cmp.a && vs.length) cmp.a = vs[vs.length - 1].id;
    var h = '<div class="page-head"><h1>버전 · 이력</h1><div class="btn-row">' + App.fileInput('setFile', '.csv,.xlsx,.xls,.json', 'Calibration Set 가져오기') + '</div></div>';
    h += '<div class="card"><h2>Calibration Set 버전</h2>' + (vs.length ? '<div class="table-wrap"><table class="list"><thead><tr><th>버전</th><th>이름</th><th>작성자</th><th>날짜</th><th>부모</th><th>상태</th><th>메모</th><th></th></tr></thead><tbody>' +
      vs.slice().reverse().map(function (v) {
        return '<tr><td><b>' + esc(v.id) + '</b>' + (v.id === st.refVersionId ? ' <span class="badge ok">기준</span>' : '') + '</td><td>' + esc(v.name) + '</td><td>' + esc(v.author) + '</td><td class="num">' + esc(v.date) + '</td><td>' + esc(v.parent || '—') + '</td><td>' + (v.confirmed ? '<span class="badge pass">Confirm</span>' + (v.approvalMemo ? '<br><small class="note">' + esc(v.approvalMemo) + '</small>' : '') : '작업본') + '</td><td>' + esc(v.memo || '') + '</td>' +
          '<td><div class="btn-row"><button class="btn btn-sm" data-restore="' + esc(v.id) + '">복원</button><button class="btn btn-sm" data-ref="' + esc(v.id) + '">기준으로 지정</button><button class="btn btn-sm" data-exp="' + esc(v.id) + '">JSON</button></div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="empty">저장한 버전이 없습니다. Calibration 화면의 「Calibration Set 저장」으로 만듭니다.</p>') + '</div>';
    // 비교
    var optsFor = function (cur) { return App.opt('__cur', '현재 편집값', cur) + App.opt('__rec', '추천값', cur) + vs.map(function (v) { return App.opt(v.id, v.id + ' ' + v.name, cur); }).join(''); };
    h += '<div class="card"><h2>비교 (현재 · 기준 · 이전 버전 · 추천값)</h2><div class="btn-row" style="margin-bottom:8px"><label class="field"><span>A</span><select class="inp" id="cmpA">' + optsFor(cmp.a) + '</select></label><label class="field"><span>B</span><select class="inp" id="cmpB">' + optsFor(cmp.b) + '</select></label></div>';
    var A = valuesOf(cmp.a), B = valuesOf(cmp.b), rf = App.refVersion();
    h += '<div class="table-wrap"><table class="list"><thead><tr><th>파라미터</th><th class="num">A</th><th class="num">B</th><th class="num">B − A</th><th class="num">기준 ' + (rf ? esc(rf.id) : '') + '</th></tr></thead><tbody>' +
      L.diffSets(A, B).map(function (d) { return '<tr' + (d.changed ? ' class="sel"' : '') + '><td>' + esc(L.paramLabel(d.key)) + '</td><td class="num">' + fmt(d.a) + '</td><td class="num">' + fmt(d.b) + '</td><td class="num">' + (d.changed ? fmt(d.delta) : '') + '</td><td class="num">' + (rf ? fmt(rf.values[d.key]) : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="note">추천값은 근거가 부족한 파라미터(NO DATA)를 현재값으로 채워 보여 줍니다.' + (App.recBlocked() ? ' 지금은 전류 % 보정이 없는 로그를 보고 있어 추천이 막혀 있습니다.' : '') + '</p></div>';
    // 이력
    h += '<div class="card"><h2>변경 이력 (' + st.history.length + '건)</h2><div class="btn-row" style="margin-bottom:8px"><button class="btn" id="histCsv">이력 CSV</button></div>' +
      (st.history.length ? '<div class="table-wrap scroll-y"><table class="list"><thead><tr><th>시간</th><th>변경자</th><th>파라미터</th><th class="num">이전값</th><th class="num">변경값</th><th>방법</th><th>사유</th></tr></thead><tbody>' +
        st.history.slice(-200).reverse().map(function (x) { return '<tr><td class="num">' + esc(x.time) + '</td><td>' + esc(x.user) + '</td><td>' + esc(L.PARAM_KEYS.indexOf(x.key) >= 0 ? L.paramLabel(x.key) : x.key) + '</td><td class="num">' + esc(x.from) + '</td><td class="num">' + esc(x.to) + '</td><td>' + esc(x.source) + '</td><td>' + esc(x.reason) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">이력이 없습니다.</p>') + '</div>';
    main.innerHTML = h;
    main.querySelector('#cmpA').addEventListener('change', function (e) { cmp.a = e.target.value; App.render(); });
    main.querySelector('#cmpB').addEventListener('change', function (e) { cmp.b = e.target.value; App.render(); });
    main.querySelectorAll('[data-restore]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = vs.filter(function (x) { return x.id === b.getAttribute('data-restore'); })[0];
        if (App.setValues(Object.assign({}, v.values), { source: '버전 복원', reason: v.id })) App.toast(v.id + ' 을(를) 현재 편집값으로 복원했습니다'); else App.toast('이미 같은 값입니다');
        App.render();
      });
    });
    main.querySelectorAll('[data-ref]').forEach(function (b) { b.addEventListener('click', function () { st.refVersionId = b.getAttribute('data-ref'); App.save(); App.toast(st.refVersionId + ' 을(를) 기준 Reference 로 지정'); App.render(); }); });
    main.querySelectorAll('[data-exp]').forEach(function (b) { b.addEventListener('click', function () { var v = vs.filter(function (x) { return x.id === b.getAttribute('data-exp'); })[0]; App.exportSet('json', v.values, 'CalibrationSet_' + v.id); }); });
    main.querySelector('#histCsv').addEventListener('click', function () { App.downloadCsv('변경이력', ['time', 'user', 'parameter', 'from', 'to', 'source', 'reason'], st.history.map(function (x) { return [x.time, x.user, L.PARAM_KEYS.indexOf(x.key) >= 0 ? L.paramLabel(x.key) : x.key, x.from, x.to, x.source, x.reason]; })); });
    main.querySelector('#setFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var p = /\.json$/i.test(f.name) ? App.readJsonFile(f).then(function (o) { var vals = o && o.values; var miss = L.PARAM_KEYS.filter(function (k) { return !vals || !L.isNum(L.num(vals[k])); }); if (miss.length) throw new Error('JSON 의 values 에 16개 값이 모두 있어야 합니다'); var v = {}; L.PARAM_KEYS.forEach(function (k) { v[k] = L.num(vals[k]); }); return v; })
        : App.readTableFile(f).then(function (rows) { var tb = L.tableFromRows(rows), r = L.setFromTable(tb.header, tb.data); if (!r.ok) throw new Error(r.msg); return r.values; });
      p.then(function (vals) {
        App.setValues(vals, { source: '파일 가져오기', reason: f.name }); App.toast(f.name + ' 을(를) 현재 편집값으로 불러왔습니다 — 저장하면 버전이 됩니다'); App.render();
      }).catch(function (er) { App.toast(er.message, true); });
    });
  };
  function valuesOf(id) {
    if (id === '__cur') return App.st.values;
    if (id === '__rec') { var recs = App.recBlocked() ? {} : App.recommendations(), o = {}; L.PARAM_KEYS.forEach(function (k) { o[k] = recs[k] && recs[k].value != null ? recs[k].value : App.st.values[k]; }); return o; }
    var v = App.st.versions.filter(function (x) { return x.id === id; })[0];
    return v ? v.values : {};
  }

  // ── 설정 · 데이터 ─────────────────────────────────────────────
  var GROUPS = [
    ['사용자', [['user', '', '작업자 이름 (이력·라벨에 기록)', 'text']]],
    ['Ramp 파라미터 사양 (가정 — 실제 사양 받으면 바꿈)', [['param', 'min', '최솟값 (%/s)'], ['param', 'max', '최댓값 (%/s)'], ['param', 'step', '변화 Step'], ['param', 'ecuScale', 'ECU 값 = 기울기 × 배율'], ['param', 'ecuDecimals', 'ECU 값 소수 자리'],
      ['', 'continuityPct', '인접 Zone 차이 경고 (%)'], ['', 'maxDeltaPct', '추천 1회 변화폭 한도 (현재값 대비 %)'], ['profile', 'amp', '그래프 목표 Current (%)'], ['profile', 'hold', '그래프 유지 시간 (s)']]],
    ['데이터 검증', [['signal', 'dt', '목표 Sampling (s)'], ['quality', 'maxFillSamples', '이어 계산할 최대 결측 행 수'], ['quality', 'gapFactor', 'Sampling 공백 판정 (Δt 중앙값의 배수)']]],
    ['이벤트 검출 · Feature', [['detect', 'smoothWin', 'smoothing 창 (점)'], ['detect', 'startThr', 'Start Threshold |d(Arm%)/dt| (%/s)'], ['detect', 'stopThr', 'Stop Threshold (%/s)'], ['detect', 'hold', 'Hold Time (s)'], ['detect', 'pre', '분석 Window 앞 (s)'], ['detect', 'post', '분석 Window 뒤 (s)'],
      ['detect', 'onsetFrac', 'Current 상승·감소 시작 판정 (변화폭 비율)'], ['detect', 'minStepFrac', 'Ramp 로 볼 최소 변화폭 (로그 전체 범위 비율)'], ['detect', 'settleBand', 'Settling 허용 Band (deg)'], ['detect', 'settleTail', 'Settling 최종값 평균 구간 (s)']]],
    ['Shock Index (가정 식: 가중치 × max|dP/dt|/기준 + 가중치 × max|d²Pitch/dt²|/기준)', [['shock', 'refDpdt', 'dP/dt 기준값 (bar/s)'], ['shock', 'refD2pitch', 'd²Pitch/dt² 기준값 (deg/s²)'], ['shock', 'wDpdt', 'dP/dt 가중치'], ['shock', 'wD2pitch', 'd²Pitch/dt² 가중치']]],
    ['판정 · Safety · 추천', [['', 'cautionPct', 'CAUTION 폭 (한계 안쪽 %)'], ['safety', 'pressureMax', 'Safety Limit — Head Pressure 최대 (bar, 비우면 끔)'], ['safety', 'pitchAbsMax', 'Safety Limit — |Pitch| 최대 (deg, 비우면 끔)'],
      ['recommend', 'minLabels', '추천·기준에 필요한 Accepted 라벨 최소 건수'], ['recommend', 'percentile', '추천 목표: Accepted ramp 값의 상위 백분위']]]
  ];
  // ── 소제목 옆 i 말풍선 (2026-09-29 수강생 요청) ─────────────────────
  // 문구는 기획서(docs/01_프로젝트_기획서.md)의 정의와 js/logic.js 의 실제 계산을 그대로 옮겼습니다.
  // 뜻이나 값이 아직 정해지지 않은 것은 「확인 필요」로 적었습니다(기획서 10장·11장 목록과 같음).
  // HELP[소제목 순서] = { items: [[이름, 설명]], src: 출처 }
  var HELP = [
    { items: [['작업자 이름', '변경 이력의 「변경자」, 버전의 「작성자」로 기록되고, 라벨 기록 창의 「기준 시험원」 칸에 미리 채워집니다.']],
      src: '출처: 코드(변경 이력·라벨 기록)' },
    { items: [
      ['최솟값 · 최댓값 (%/s)', '16개 Ramp 파라미터(단위 %/sec)가 가질 수 있는 범위입니다. 벗어나면 「저장 불가」로 Calibration Set 저장·Export 를 막고, 추천값도 이 안에서만 냅니다.'],
      ['변화 Step', '값을 바꾸는 최소 단위입니다. 입력·드래그 값은 이 단위로 맞추고, 단위가 아니면 경고합니다. 그래프 핸들을 화살표 키로 옮기면 1 Step(Shift 는 10 Step)씩 바뀝니다.'],
      ['ECU 값 = 기울기 × 배율', 'Calibration 화면 「② 기울기(%/sec)」와 「③ Parameter 값(ECU)」 사이의 환산 배율입니다. 1단계는 배율 하나로 가정했습니다 — 실제 관계는 확인 필요(기획서 10장 4번).'],
      ['ECU 값 소수 자리', '기울기를 ECU 값으로 바꿀 때 반올림하는 소수 자리 수입니다(화면·Export 공통).'],
      ['인접 Zone 차이 경고 (%)', '같은 방향·같은 Start/Stop 에서 이웃한 두 Zone 값의 차이가 두 값 중 큰 쪽의 이 % 를 넘으면 「Zone 경계 연속성」 경고를 띄웁니다. 저장은 확인 후 됩니다.'],
      ['추천 1회 변화폭 한도 (%)', '추천이 한 번에 바꿀 수 있는 크기를 현재값의 이 % 로 제한합니다(기획서의 Max Delta per Iteration).'],
      ['그래프 목표 Current (%) · 유지 시간 (s)', 'Ramp Profile 그래프를 그리는 데만 씁니다. Start Ramp 로 0 → 목표 Current 까지 오르고(시간 = 목표 ÷ 기울기), 유지 시간만큼 머문 뒤 Stop(End) Ramp 로 0 까지 내려가는 개념 Profile 입니다. 판정·추천에는 쓰지 않습니다. 실제 ECU Current Profile 의 어느 구간을 지배하는지는 확인 필요(기획서 10장 5번).']],
      src: '출처: 기획서 3.3·5장(편집 안전장치·추천 Side Panel)·8장 1단계 2번, 코드(validateSet·recommend·profilePoints). 기본값은 모두 가정 — 실제 명칭·Min/Max·Step 은 확인 필요(10장 4번)' },
    { items: [
      ['목표 Sampling (s)', '로그의 기대 샘플 간격입니다(제출 기획서: 10 ms). Δt 중앙값이 이 값과 10% 넘게 다르면 경고합니다. 미분은 이 값이 아니라 실제 시간값으로 계산합니다.'],
      ['이어 계산할 최대 결측 행 수', '결측·숫자 변환 실패가 연속 이 행 수 이하이면 앞 값으로 이어 계산하고, 넘으면 그 구간을 표시해 분석 Window 에 걸린 이벤트를 NO DATA 로 둡니다. 결측을 0 으로 채우지 않습니다.'],
      ['Sampling 공백 판정 (Δt 중앙값의 배수)', '두 샘플 사이 간격이 Δt 중앙값 × 이 배수보다 크면 Sampling 공백으로 봅니다. 공백을 포함한 이벤트는 NO DATA 입니다.']],
      src: '출처: 기획서 3.2 데이터 검증, 코드(qualityReport·buildSignals·fillGaps)' },
    { items: [
      ['smoothing 창 (점)', '미분하기 전에 신호를 매끄럽게 하는 가운데 이동평균의 점 수입니다(짝수면 1 을 더해 홀수로). Arm %·Current·Head P·Pitch 에 쓰고, d²Pitch/dt² 는 dPitch/dt 에 한 번 더 씁니다. 그 뒤 중앙차분으로 미분합니다.'],
      ['Start Threshold |d(Arm%)/dt| (%/s)', '정지 상태에서 |d(Arm%)/dt| 가 이 값을 넘은 상태가 Hold Time 이상 이어지면 Movement Start 입니다(넘기 시작한 시점).'],
      ['Stop Threshold (%/s)', '움직이는 중 |d(Arm%)/dt| 가 이 값 아래에 Hold Time 이상 머물면 Movement Stop 입니다. Start 보다 낮게 두어 노이즈로 반복 검출되지 않게 합니다(hysteresis).'],
      ['Hold Time (s)', '위 두 조건이 끊기지 않고 이어져야 하는 최소 시간입니다.'],
      ['분석 Window 앞 · 뒤 (s)', '이벤트 시각의 앞 · 뒤 이 시간만큼을 Feature 계산 구간으로 씁니다(그래프의 노란 음영).'],
      ['Current 상승·감소 시작 판정 (변화폭 비율)', 'Start 는 Window 안 Current 의 최저→최고 변화폭에서 이 비율만큼 오른 지점을, Stop 은 최고에서 이 비율만큼 내려간 지점을 상승·감소 시작으로 봅니다. 여기서 암 움직임 시작·정지까지가 Response Delay · Stop Response Time 입니다.'],
      ['Ramp 로 볼 최소 변화폭 (로그 전체 범위 비율)', 'Window 안 Current 변화폭이 로그 전체 Current 범위 × 이 비율 이하이면 Ramp 로 보지 않고 응답 시간·실측 Ramp 를 계산하지 않습니다.'],
      ['Settling 허용 Band (deg)', '이벤트 뒤 Pitch 가 최종값 ± 이 폭 안에 계속 머물기 시작할 때까지의 시간이 Settling Time 입니다(허용 Band 안으로 돌아오는 시간).'],
      ['Settling 최종값 평균 구간 (s)', 'Window 끝의 이 시간 동안 Pitch 평균을 최종값으로 씁니다. 이 구간에 들어와서야 Band 안에 들면 「창 안에서 정착 안 함」으로 표시합니다.']],
      src: '출처: 기획서 4장(이벤트 검출·Start/Stop 이벤트·수치미분)·5.1 Feature, 코드(smooth·detectEvents·eventFeatures·settlingTime). 초기값은 가정 — 실제 로그로 맞춤(기획서 10장 7번)' },
    { items: [
      ['Shock Index 식 (가정)', 'dP/dt 가중치 × (max|dP/dt| ÷ dP/dt 기준값) + d²Pitch/dt² 가중치 × (max|d²Pitch/dt²| ÷ d²Pitch/dt² 기준값). 물리량 「충격량」이 아니라 시험팀이 정하는 「충격감 지수」이며, 조합식·가중치는 확인 필요(기획서 10장 8번).'],
      ['dP/dt 기준값 (bar/s) · d²Pitch/dt² 기준값 (deg/s²)', '각 Feature 를 나누는 값입니다. 측정값이 기준값과 같으면 그 항은 가중치만큼 더해집니다.'],
      ['dP/dt 가중치 · d²Pitch/dt² 가중치', '두 항을 더할 때의 비중입니다.']],
      src: '출처: 기획서 5.1(Shock Index 가정 식), 코드(shockIndex)' },
    { items: [
      ['CAUTION 폭 (한계 안쪽 %)', '측정값이 상한 안쪽 이 % 이내(상한 × (1 − 폭/100) 보다 큼)이면 CAUTION(Borderline, 반복시험 권장)입니다. 경계 폭은 제출 자료에 없어 가정한 값입니다(기획서 5.2).'],
      ['Safety Limit — Head Pressure 최대 (bar)', '분석 Window 안(Current 상승·감소 시작 이후) Head Pressure 최고값이 이 값을 넘으면 감성 기준과 관계없이 FAIL-SHOCK 이고, 분석 중인 로그에 이런 이벤트가 있으면 최종 Confirm 을 막습니다. 비우면 끕니다.'],
      ['Safety Limit — |Pitch| 최대 (deg)', 'Absolute Pitch 의 크기가 이 값을 넘으면 FAIL-PITCH 이고, 최종 Confirm 을 막습니다. 비우면 끕니다.'],
      ['Accepted 라벨 최소 건수', '파라미터별 Accept 라벨이 이 건수보다 적으면 추천은 「추천 불가/데이터 부족」(NO DATA)이고, 「Accepted 라벨로 허용 범위 만들기」도 그 파라미터를 건너뜁니다.'],
      ['추천 목표 백분위', 'Accept 라벨의 ramp 값 가운데 이 백분위 값을 목표로 삼습니다(높을수록 빠른 응답 쪽). 그 뒤 1회 변화폭 한도·Min/Max·Step 을 적용합니다. 목표가 「충격 최소화」가 아니라 「감성 허용범위 안에서 가장 좋은 응답성」이기 때문입니다.']],
      src: '출처: 기획서 1장·5장(판정 상태·추천 Side Panel)·5.2, 코드(judgeItem·judgeEvent·recommend). Safety 값·CAUTION 폭은 확인 필요(기획서 10장 8번)' }
  ];
  var DATA_HELP = { items: [
    ['전체 백업 내보내기 · 가져오기', '파라미터·버전·이력·라벨·허용 범위·Mapping Profile·설정을 JSON 파일 하나로 저장하고 되살립니다. 로그 원본은 들어가지 않습니다.'],
    ['예시 데이터 불러오기', '합성(가상) 로그 3개(3번째는 실제 로그와 같은 열 순서)·예시 Set·가상 라벨을 불러옵니다. 실제 장비·시험 결과가 아닙니다.'],
    ['모두 지우기', '이 브라우저에 저장된 위 항목을 모두 지웁니다. 되돌릴 수 없으니 먼저 백업하세요.'],
    ['Mapping Profile', '로그·Channel Mapping 화면에서 확정해 저장한 매핑(원문 헤더·단위·역할·보정값)입니다. 같은 구조의 로그를 올리면 제안 상태로 되살아납니다. 감성 평가용 기준 시험원 Profile 과는 별개입니다.']],
    src: '출처: 기획서 3.2 Mapping Profile·7장, 코드(백업·예시 데이터)' };
  // Zone별 점수 배율 — 설정 화면 표와 Calibration 판정표가 같은 설명을 씁니다 (2026-09-29 오전 2차 요청)
  var WEIGHT_HELP = { items: [
    ['배율이 들어가는 곳', '측정값에 이벤트가 난 Zone 의 배율을 곱한 「배율 적용값」을 허용 범위의 상한과 비교합니다. 상한 자체는 바꾸지 않습니다.'],
    ['항목 점수 (%)', '배율 적용값 ÷ 상한 × 100 입니다(한계 사용률). 100 을 넘으면 그 항목은 FAIL, 100 − CAUTION 폭(기본 90)을 넘으면 CAUTION 입니다.'],
    ['종합 점수 · 종합 판정', '종합 점수는 세 항목 점수 가운데 가장 큰 값입니다. 가장 한계에 가까운 항목이 종합 판정을 정합니다. 100 초과 항목이 있으면 FAIL(여럿이면 충격 → 안정도 → 응답성 순으로 대표), 없고 기준·값이 빠진 항목이 있으면 NO DATA, 그다음 CAUTION, 모두 안쪽이면 PASS 입니다. Safety Limit 초과는 배율과 관계없이 먼저 FAIL 입니다.'],
    ['배율 값의 뜻', '1 = 배율 없음(기본값, 배율을 넣기 전과 같은 판정). 1 보다 크면 그 Zone 에서 그 항목을 더 엄하게, 1 보다 작으면 느슨하게 봅니다. 0 이면 그 항목을 판정에서 빼는 것과 같습니다. 0~10 사이만 받습니다.'],
    ['예', 'Zone 1 의 충격지수 배율 1.2, Shock Index 0.45, 상한 0.5 → 적용값 0.54, 점수 108% → FAIL-SHOCK. 배율 1 이면 90% 로 PASS 입니다.'],
    ['저장', '배율은 설정에 들어가 이 브라우저에 저장되고, 전체 백업(JSON)·이벤트 결과 CSV/Excel(w_stab·w_shock·w_resp·overall_score 열)에 함께 나갑니다. Zone 별 배율 값은 제출 자료에 없어 기본 1 로 두었습니다 — 실제 값은 시험팀이 정합니다.']],
    src: '출처: 2026-09-29 수강생 추가 요청 4번, 기획서 11장, 코드(judgeEvent·zoneWeights)' };
  App.WEIGHT_HELP = WEIGHT_HELP;
  var W_COLS = [['stab', '안정도 (ΔPitch)'], ['shock', '충격지수 (Shock Index)'], ['resp', '응답성']];
  App.W_COLS = W_COLS;
  var helpN = 0;
  function helpIcon(title, hp) {
    if (!hp) return '';
    var id = 'help-' + (++helpN);
    return '<span class="info-i"><button type="button" class="info-btn" aria-label="' + esc(title) + ' — 설명 보기" aria-describedby="' + id + '" aria-expanded="false">i</button>' +
      '<span class="info-tip" role="tooltip" id="' + id + '"><dl>' + hp.items.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl><span class="src">' + esc(hp.src) + '</span></span></span>';
  }
  // 마우스 올림·키보드 초점은 CSS 로, 모바일 탭은 누를 때마다 열고 닫습니다. Esc·바깥 누름으로 닫힘
  function bindHelp(main) {
    main.querySelectorAll('.info-i').forEach(function (w) {
      var b = w.querySelector('.info-btn');
      function place() { var tip = w.querySelector('.info-tip'); tip.style.setProperty('--tip-arrow', Math.max(8, b.offsetLeft + b.offsetWidth / 2 - 7) + 'px'); }
      place();
      b.addEventListener('click', function () {
        var open = !w.classList.contains('open');
        main.querySelectorAll('.info-i.open').forEach(function (o) { o.classList.remove('open'); o.querySelector('.info-btn').setAttribute('aria-expanded', 'false'); });
        if (open) { w.classList.add('open'); b.setAttribute('aria-expanded', 'true'); } else b.blur();
      });
      w.addEventListener('keydown', function (e) { if (e.key === 'Escape') { w.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); b.blur(); } });
    });
    if (!App._helpDoc) {
      App._helpDoc = true;
      document.addEventListener('pointerdown', function (e) {
        if (e.target.closest && e.target.closest('.info-i')) return;
        document.querySelectorAll('.info-i.open').forEach(function (o) { o.classList.remove('open'); o.querySelector('.info-btn').setAttribute('aria-expanded', 'false'); });
      });
    }
  }

  App.helpIcon = helpIcon;
  App.bindHelp = bindHelp;

  App.pages.settings = function (main) {
    var s = App.S();
    var h = '<div class="page-head"><h1>설정 · 데이터</h1></div><div class="alert info">아래 기본값은 모두 <b>가정</b>입니다. 제출자의 실제 사양·로그·기준을 받으면 이 화면에서 바꿉니다. 바꾼 설정은 이 브라우저에 저장되고 백업 파일에도 들어갑니다.</div>';
    GROUPS.forEach(function (g, gi) {
      h += '<div class="card"><h2 class="help-head"><span>' + esc(g[0]) + '</span>' + helpIcon(g[0], HELP[gi]) + '</h2><div class="form-grid">' + g[1].map(function (f) {
        var v = f[0] ? s[f[0]][f[1]] : s[f[1] || f[0]];
        if (f[0] === 'user') v = s.user;
        return '<label class="field"><span>' + esc(f[2]) + '</span><input class="inp" ' + (f[3] === 'text' ? 'type="text"' : 'type="number" step="any"') + ' data-set="' + f[0] + ':' + f[1] + '" value="' + esc(v == null ? '' : v) + '"></label>';
      }).join('') + '</div></div>';
    });
    h += '<div class="card"><h2 class="help-head"><span>Zone별 점수 배율 (종합 판정)</span>' + helpIcon('Zone별 점수 배율', WEIGHT_HELP) + '</h2>' +
      '<p class="note">이벤트가 난 암 위치 Zone 에 따라 안정도·충격지수·응답성 측정값에 곱할 배율입니다. 모두 1 이면 배율을 넣기 전과 같은 판정입니다. 1 보다 크게 하면 그 Zone 에서 더 엄하게 봅니다.' + (L.isDefaultWeights(s) ? '' : ' <b>지금은 기본값(1)과 다른 배율이 있습니다.</b>') + '</p>' +
      '<div class="table-wrap"><table class="list" id="zwTable"><thead><tr><th>Zone (암 위치)</th>' + W_COLS.map(function (c) { return '<th class="num">' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      L.ZONES.map(function (z) {
        var w = s.zoneWeight[z.id];
        return '<tr><td><b>' + z.label + '</b> <small class="note">' + z.range + '</small></td>' + W_COLS.map(function (c) {
          return '<td class="num"><input class="inp' + (w[c[0]] !== 1 ? ' changed' : '') + '" type="number" min="0" max="' + L.WEIGHT_MAX + '" step="0.05" data-zw="' + z.id + ':' + c[0] + '" value="' + w[c[0]] + '" aria-label="' + esc(z.label + ' ' + c[1] + ' 배율') + '"></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="btn-row" style="margin-top:8px"><button class="btn" id="zwReset">배율 모두 1 로</button></div></div>';
    h += '<div class="btn-row" style="margin-bottom:16px"><button class="btn" id="setDefault">설정만 기본값으로</button></div>';
    h += '<div class="card"><h2 class="help-head"><span>데이터</span>' + helpIcon('데이터', DATA_HELP) + '</h2><p class="note">파라미터·버전·이력·라벨·허용 범위·Mapping Profile·설정을 한 파일로 백업하고 되살립니다. 로그 원본은 들어가지 않습니다.</p><div class="btn-row">' +
      '<button class="btn" id="backup">전체 백업 내보내기 (JSON)</button>' + App.fileInput('restoreFile', '.json', '백업 가져오기') +
      '<button class="btn" id="sampleAll">예시 데이터 불러오기</button><button class="btn btn-danger" id="wipe">모두 지우기</button></div>' +
      '<h3 style="margin-top:14px">Mapping Profile (' + App.st.profiles.length + '개)</h3>' + (App.st.profiles.length ? '<ul class="msgs">' + App.st.profiles.map(function (p, i) { return '<li>' + esc(p.id + ' · ' + p.name + ' v' + p.version + ' · ' + (p.author || '') + ' · ' + (p.confirmedAt || '')) + ' <button class="btn btn-sm btn-danger" data-rmp="' + i + '">삭제</button></li>'; }).join('') + '</ul>' : '<p class="note">저장된 Profile 이 없습니다.</p>') + '</div>';
    main.innerHTML = h;
    bindHelp(main);
    main.querySelectorAll('[data-set]').forEach(function (el) {
      el.addEventListener('change', function () {
        var p = el.getAttribute('data-set').split(':');
        if (p[0] === 'user') { s.user = el.value.trim(); App.save(); return; }
        var v = el.value === '' ? null : L.num(el.value);
        if (v !== null && !L.isNum(v)) { App.toast('숫자를 넣으세요', true); return; }
        var nullable = p[0] === 'safety';
        if (v === null && !nullable) { App.toast('비울 수 없는 값입니다', true); App.render(); return; }
        if (p[0]) s[p[0]][p[1]] = v; else s[p[1]] = v;
        App.save(); App.toast('저장했습니다 — 분석 결과는 「다시 분석」 해야 반영됩니다');
      });
    });
    main.querySelectorAll('[data-zw]').forEach(function (el) {
      el.addEventListener('change', function () {
        var p = el.getAttribute('data-zw').split(':');
        if (!App.setWeight(+p[0], p[1], el.value)) { App.render(); return; }
        App.render();
      });
    });
    main.querySelector('#zwReset').addEventListener('click', function () { s.zoneWeight = L.defaultZoneWeights(); App.save(); App.toast('배율을 모두 1 로 되돌렸습니다'); App.render(); });
    main.querySelector('#setDefault').addEventListener('click', function () { App.st.settings = L.defaultSettings(); App.st.settings.user = s.user; App.save(); App.render(); });
    main.querySelector('#backup').addEventListener('click', function () { var o = JSON.parse(JSON.stringify(App.st)); o._type = 'data09-09 backup'; o._at = App.nowStr(); App.downloadJson('CurrentRampCal_백업', o); });
    main.querySelector('#restoreFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      App.readJsonFile(f).then(function (o) {
        if (!o || o._type !== 'data09-09 backup') throw new Error('이 도구의 백업 파일이 아닙니다');
        var st = root.CRStore.emptyState();
        st.settings = L.mergeSettings(o.settings); st.values = o.values; ['versions', 'history', 'labels', 'profiles'].forEach(function (k) { if (Array.isArray(o[k])) st[k] = o[k]; });
        st.criteria = o.criteria || {}; st.refVersionId = o.refVersionId || ''; st.sample = !!o.sample;
        if (!st.values || L.PARAM_KEYS.some(function (k) { return !L.isNum(st.values[k]); })) throw new Error('백업의 파라미터 값이 온전하지 않습니다');
        App.st = st; App.undo = []; App.redo = []; App.save(); App.toast('백업을 되살렸습니다'); App.render();
      }).catch(function (er) { App.toast(er.message, true); });
    });
    main.querySelector('#sampleAll').addEventListener('click', function () { App.loadSample(); App.toast('예시 데이터를 불러왔습니다'); App.go('#/log'); });
    main.querySelector('#wipe').addEventListener('click', function () {
      App.dialog('모두 지우기', '<p>이 브라우저에 저장된 파라미터·버전·이력·라벨·허용 범위·Profile·설정을 모두 지웁니다. 먼저 백업하세요.</p>', [{ label: '취소' }, { label: '지우기', onClick: function () { App.clearAll(); App.toast('모두 지웠습니다'); App.go('#/cal'); } }]);
    });
    main.querySelectorAll('[data-rmp]').forEach(function (b) { b.addEventListener('click', function () { App.st.profiles.splice(+b.getAttribute('data-rmp'), 1); App.save(); App.render(); }); });
  };
})(window);
