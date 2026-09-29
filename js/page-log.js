/* 로그 불러오기 · Channel Mapping(제출 기획서 4.3) · 분석 결과 */
(function (root) {
  'use strict';
  var L = root.CRLogic, C = root.CRCharts, App = root.App, esc = C.esc, fmt = C.fmt;
  var derivShow = { dArm: false, dCur: false, dP: false, dPitch: false, d2Pitch: false };

  function statusOf(lg) {
    if (lg.result && lg.result.ok) return '<span class="badge pass">분석 완료</span>';
    if (lg.mapping.confirmed) return '<span class="badge ok">매핑 확정</span>';
    return '<span class="badge caution">매핑 확인 필요</span>';
  }
  function timeSummary(lg) {
    var tr = lg.mapping.rows.time, st = tr && tr.header ? lg.stats.filter(function (s) { return s.header === tr.header; })[0] : null;
    var f = tr && tr.unit ? L.UNITS[tr.unit].f : 1, txt = '시간 열 미정';
    if (st && L.isNum(st.min)) {
      var j = st.index, dts = [];
      for (var i = 1; i < Math.min(lg.table.data.length, 2000); i++) { var a = L.num(lg.table.data[i - 1][j]), b = L.num(lg.table.data[i][j]); if (b > a) dts.push((b - a) * f); }
      txt = '시간 ' + fmt(st.min * f, 2) + '~' + fmt(st.max * f, 2) + ' s | Δt 중앙값 ' + fmt(L.percentile(dts, 50) * 1000, 2) + ' ms' + (tr.unit ? '' : ' (시간 단위 미정 — 원값 기준)');
    }
    return txt;
  }

  App.pages.log = function (main) {
    var h = '<div class="page-head"><h1>로그 · Channel Mapping</h1>' +
      '<div class="btn-row">' + App.fileInput('logFile', '.csv,.txt,.xlsx,.xls', '로그 파일 불러오기 (CSV·Excel)', true) +
      '<button class="btn" id="sampleLogs">예시 데이터 불러오기</button></div></div>' +
      '<p class="note">시험이 끝난 뒤 저장한 로그를 올립니다. 파일은 이 브라우저 안에서만 읽고, 원본은 고치지 않습니다. 로그 원본은 용량 때문에 브라우저에 저장하지 않으니, 창을 다시 열면 파일을 다시 불러오세요(확정한 매핑은 Mapping Profile 로 저장해 두면 되살아납니다).</p>';
    if (!App.logs.length) {
      main.innerHTML = h + '<div class="card empty">불러온 로그가 없습니다. 로그 파일을 올리거나 「예시 데이터 불러오기」를 누르세요.</div>';
      bindTop(main); return;
    }
    h += '<div class="card"><h2>불러온 로그</h2><div class="table-wrap scroll-y"><table class="list"><thead><tr><th>선택</th><th>파일</th><th class="num">행</th><th class="num">채널</th><th>상태</th><th>이벤트</th><th></th></tr></thead><tbody>' +
      App.logs.map(function (lg, i) {
        return '<tr class="' + (i === App.activeLog ? 'sel' : '') + '"><td><input type="radio" name="actLog" value="' + i + '"' + (i === App.activeLog ? ' checked' : '') + ' aria-label="' + esc(lg.name) + ' 선택"></td><td class="mono">' + esc(lg.name) + '</td><td class="num">' + lg.table.data.length + '</td><td class="num">' + lg.table.header.length + '</td><td>' + statusOf(lg) + '</td><td>' + (lg.result && lg.result.ok ? lg.result.events.length + '개' : '—') + '</td><td><button class="btn btn-sm btn-danger" data-rm="' + i + '">닫기</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    var lg = App.logs[App.activeLog];
    h += mappingCard(lg) + '<div id="resultArea"></div>';
    main.innerHTML = h;
    bindTop(main);
    bindMapping(main, lg);
    renderResult(lg);
  };

  function bindTop(main) {
    var f = main.querySelector('#logFile');
    if (f) f.addEventListener('change', function () {
      var files = Array.prototype.slice.call(f.files); if (!files.length) return;
      Promise.all(files.map(function (fl) { return App.readTableFile(fl).then(function (rows) { App.addLog(fl.name, rows); }); }))
        .then(function () { App.toast(files.length + '개 로그를 불러왔습니다 — 매핑을 확인하세요'); App.render(); })
        .catch(function (e) { App.toast(e.message, true); App.render(); });
    });
    var sb = main.querySelector('#sampleLogs');
    if (sb) sb.addEventListener('click', function () {
      App.dialog('예시 데이터 불러오기', '<p>합성(가상) 예시 로그 3건(3번째는 실제 로그와 같은 열 순서, 자동추천부터 시작), 예시 라벨 96건, 예시 Calibration Set 2개, 예시 채널맵을 불러옵니다. 지금 브라우저에 있는 파라미터·버전·라벨·기준은 예시로 바뀝니다.</p>', [
        { label: '취소' },
        { label: '불러오기', primary: true, onClick: function () { App.loadSample(); App.toast('예시 데이터를 불러왔습니다 — 매핑을 확인하고 Mapping Confirm 하세요'); App.go('#/log'); } }
      ]);
    });
    main.querySelectorAll('input[name=actLog]').forEach(function (r) { r.addEventListener('change', function () { App.activeLog = +r.value; App.sel.eventNo = null; App.render(); }); });
    main.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () { App.logs.splice(+b.getAttribute('data-rm'), 1); App.activeLog = App.logs.length ? 0 : -1; App.render(); }); });
  }

  // ── Channel Mapping 화면 ─────────────────────────────────────
  function mappingCard(lg) {
    var m = lg.mapping, st = lg.stats, v = L.validateMapping(m);
    var h = '<div class="card" id="mapCard"><h2>Channel Mapping</h2>';
    h += '<div class="map-info"><span>파일: <b class="mono">' + esc(lg.name) + '</b></span><span>데이터 <b>' + lg.table.data.length.toLocaleString() + '</b>행</span><span>채널 <b>' + lg.table.header.length + '</b>개</span><span>' + esc(timeSummary(lg)) + '</span></div>';
    h += '<div class="btn-row" style="margin-bottom:8px"><label class="field" style="min-width:14em"><span>Mapping Profile</span><select class="inp" id="profSel"><option value="">— 선택 —</option>' +
      App.st.profiles.map(function (p, i) { return App.opt(i, p.name + ' v' + p.version, m.profileId === p.id ? i : ''); }).join('') + '</select></label>' +
      '<button class="btn" id="profApply" style="align-self:flex-end">Profile 적용</button>' +
      '<button class="btn" id="autoRec" style="align-self:flex-end">자동추천</button>' +
      '<label class="field" style="min-width:12em"><span>Current Mode</span><select class="inp" id="curMode">' + App.opt('split', 'UP/DOWN 분리', m.mode) + App.opt('single', '단일 Current', m.mode) + '</select></label></div>';
    h += '<p class="note">매핑 출처: ' + esc(lg.mappingFrom || '') + '. 자동추천·Profile 복원은 <b>제안</b>일 뿐입니다. 행마다 헤더·단위·역할을 보고 「확인」을 체크한 뒤 Mapping Confirm 하세요. 헤더·단위·역할을 바꾸면 그 행의 확인과 Mapping Confirm 이 풀립니다.</p>';
    if (lg.profileChanges && lg.profileChanges.length) h += '<div class="alert warn"><b>Profile 과 달라진 점</b><ul class="msgs">' + lg.profileChanges.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>';
    h += '<div class="table-wrap scroll-y"><table class="list" id="mapTable"><thead><tr><th>표준 신호</th><th>필수 여부</th><th>CSV 헤더 (원문)</th><th>역할</th><th>원단위</th><th>분석단위·변환</th><th>추천 이유</th><th>미리보기</th><th>확인</th></tr></thead><tbody>';
    L.signalsForMode(m.mode).forEach(function (sg) {
      var r = m.rows[sg.id] || (m.rows[sg.id] = { header: '', role: '', unit: '', confirmed: false, reason: '' });
      var s = st.filter(function (x) { return x.header === r.header; })[0];
      var opts = '<option value="">미매핑</option>' + st.map(function (x) { return App.opt(x.header, x.header + ((r.candidates || []).indexOf(x.header) >= 0 ? '  (후보)' : ''), r.header); }).join('');
      var role = sg.kind === 'current' ? '<select class="inp" data-role="' + sg.id + '" aria-label="' + esc(sg.label) + ' 역할">' + App.opt('', '미확정', r.role) + App.opt('command', 'Command', r.role) + App.opt('actual', 'Actual Coil', r.role) + '</select>' : '—';
      var unit = '<select class="inp" data-unit="' + sg.id + '" aria-label="' + esc(sg.label) + ' 원단위">' + App.opt('', '미확정', r.unit) + sg.units.map(function (u) { return App.opt(u, u === 'degC' ? '°C' : u, r.unit); }).join('') + '</select>' + (s && s.unit ? '<small class="note"> 헤더 표기 [' + esc(s.unit) + ']</small>' : '');
      var conv = r.unit ? esc(L.UNITS[r.unit].to === 'degC' ? '°C' : L.UNITS[r.unit].to) + '<br><small class="note">' + esc(L.UNITS[r.unit].text) + '</small>' : '—';
      if (sg.kind === 'current' && r.unit) conv += '<br><small class="note">% 는 보정 I0·I100 이 있을 때만</small>';
      var prev = s && L.isNum(s.min) ? fmt(s.min, 3) + ' ~ ' + fmt(s.max, 3) + (r.unit ? '<br>→ ' + fmt(s.min * L.UNITS[r.unit].f, 3) + ' ~ ' + fmt(s.max * L.UNITS[r.unit].f, 3) : '') : '—';
      var needCls = sg.need === 'req' ? 'need-req' : sg.need === 'rec' ? 'need-rec' : '';
      h += '<tr class="' + (r.changed ? 'row-changed' : '') + '"><td><b>' + esc(sg.label) + '</b></td><td class="' + needCls + '">' + L.NEED_TEXT[sg.need] + '</td>' +
        '<td><select class="inp hdr-sel" data-hdr="' + sg.id + '" aria-label="' + esc(sg.label) + ' CSV 헤더">' + opts + '</select></td><td>' + role + '</td><td>' + unit + '</td><td>' + conv + '</td>' +
        '<td><span class="reason">' + esc(r.reason || '') + '</span></td><td class="preview">' + prev + '</td>' +
        '<td><input type="checkbox" data-ok="' + sg.id + '"' + (r.confirmed ? ' checked' : '') + (r.header ? '' : ' disabled') + ' aria-label="' + esc(sg.label) + ' 확인"></td></tr>';
    });
    h += '</tbody></table></div>';
    // 전류 % 보정
    var dirs = m.mode === 'split' ? ['UP', 'DOWN'] : ['ALL'];
    h += '<h3 style="margin-top:14px">전류 % 보정 (선형, 선택)</h3><p class="note">ECU/밸브 보정이 선형으로 확인된 경우에만 넣습니다: Current(%) = 100 × (I − I0) / (I100 − I0). 비워 두면 mA·mA/s 로 비교하고 %/sec 비교·추천은 막힙니다.</p><div class="form-grid">' +
      dirs.map(function (d) { var c = m.cal[d] || {}; return '<label class="field"><span>' + (d === 'ALL' ? '단일' : d) + ' I0 (0% 전류, mA)</span><input class="inp" type="number" step="any" data-cal="' + d + ':i0" value="' + esc(c.i0 == null ? '' : c.i0) + '"></label><label class="field"><span>' + (d === 'ALL' ? '단일' : d) + ' I100 (100% 전류, mA)</span><input class="inp" type="number" step="any" data-cal="' + d + ':i100" value="' + esc(c.i100 == null ? '' : c.i100) + '"></label>'; }).join('') + '</div>';
    if (m.mode === 'single') h += '<p class="note">단일 Current 모드: 부호·방향 규칙이 확인되지 않아 전류 크기(절댓값)로 Ramp 를 잽니다(가정). 방향은 Arm Angle 미분으로 정합니다.</p>';
    // 검증
    var q = L.qualityReport(lg.table, m, App.S());
    var fz = q.some(function (x) { return x.code === 'firstZero'; });
    h += '<h3 style="margin-top:14px">검증 결과</h3>';
    if (fz || m.excludeFirstRow) h += '<label class="check"><input type="checkbox" id="exFirst"' + (m.excludeFirstRow ? ' checked' : '') + '> 첫 행을 분석에서 제외합니다 (원본은 그대로, 제외 여부는 매핑 스냅샷에 기록)</label>';
    h += '<ul class="msgs">' + v.errors.map(function (e) { return '<li class="error">[차단] ' + esc(e) + '</li>'; }).join('') + v.warnings.map(function (e) { return '<li class="warn">[경고] ' + esc(e) + '</li>'; }).join('') +
      q.map(function (x) { return '<li class="' + (x.level === 'error' ? 'error' : x.level === 'warn' ? 'warn' : 'info') + '">[' + (x.level === 'error' ? '데이터 오류' : x.level === 'warn' ? '데이터 경고' : '정보') + '] ' + esc(x.msg) + (x.where ? ' — ' + esc(x.where) : '') + '</li>'; }).join('') + '</ul>';
    var used = {}; Object.keys(m.rows).forEach(function (k) { if (m.rows[k].header) used[m.rows[k].header] = true; });
    var unused = st.filter(function (x) { return !used[x.header]; }).map(function (x) { return x.header; });
    h += '<p class="note">미사용 헤더: ' + (unused.length ? unused.map(function (u) { return '<code>' + esc(u) + '</code>'; }).join(' ') : '없음') + '</p>';
    h += '<div class="btn-row"><button class="btn" id="reval">다시 검증</button><button class="btn" id="allOk">매핑된 행 모두 확인 표시</button>' +
      '<button class="btn btn-primary" id="mapConfirm"' + (v.canConfirm && !m.confirmed ? '' : ' disabled') + '>' + (m.confirmed ? 'Mapping Confirm 완료' : 'Mapping Confirm') + '</button>' +
      '<button class="btn" id="profSave"' + (m.confirmed ? '' : ' disabled') + '>Profile 저장</button>' +
      '<button class="btn btn-primary" id="runAn"' + (m.confirmed ? '' : ' disabled') + '>분석 시작</button></div>';
    if (m.confirmed) h += '<p class="note">확정: ' + esc(m.confirmedAt || '') + ' · ' + esc(m.confirmedBy || '') + (m.profileId ? ' · Profile ' + esc(m.profileId) + ' v' + m.profileVersion : ' · Profile 로 저장 안 됨') + '</p>';
    else if (!v.canConfirm) h += '<p class="note">[차단] 항목을 모두 풀어야 Mapping Confirm 과 분석 시작이 켜집니다.</p>';
    return h + '</div>';
  }

  function unconfirm(lg, rowId) {
    var m = lg.mapping;
    if (rowId && m.rows[rowId]) { m.rows[rowId].confirmed = false; m.rows[rowId].changed = false; }
    m.confirmed = false; lg.result = null;
  }
  function bindMapping(main, lg) {
    var m = lg.mapping;
    main.querySelectorAll('[data-hdr]').forEach(function (el) {
      el.addEventListener('change', function () {
        var id = el.getAttribute('data-hdr'), r = m.rows[id], sg = L.sigDef(id);
        r.header = el.value; r.reason = el.value ? '사용자 선택' : '미매핑';
        var st = lg.stats.filter(function (x) { return x.header === el.value; })[0];
        r.unit = st && st.unit && sg.units.indexOf(st.unit) >= 0 ? st.unit : (sg.units.length === 1 ? sg.units[0] : '');
        if (sg.kind === 'current') r.role = '';
        unconfirm(lg, id); App.render();
      });
    });
    main.querySelectorAll('[data-role]').forEach(function (el) { el.addEventListener('change', function () { var id = el.getAttribute('data-role'); m.rows[id].role = el.value; unconfirm(lg, id); App.render(); }); });
    main.querySelectorAll('[data-unit]').forEach(function (el) { el.addEventListener('change', function () { var id = el.getAttribute('data-unit'); m.rows[id].unit = el.value; unconfirm(lg, id); App.render(); }); });
    main.querySelectorAll('[data-ok]').forEach(function (el) { el.addEventListener('change', function () { m.rows[el.getAttribute('data-ok')].confirmed = el.checked; if (!el.checked) unconfirm(lg); App.render(); }); });
    main.querySelectorAll('[data-cal]').forEach(function (el) {
      el.addEventListener('change', function () {
        var p = el.getAttribute('data-cal').split(':'); m.cal[p[0]] = m.cal[p[0]] || {};
        m.cal[p[0]][p[1]] = el.value === '' ? null : L.num(el.value); unconfirm(lg); App.render();
      });
    });
    var ex = main.querySelector('#exFirst'); if (ex) ex.addEventListener('change', function () { m.excludeFirstRow = ex.checked; unconfirm(lg); App.render(); });
    main.querySelector('#curMode').addEventListener('change', function (e) { lg.mapping = L.recommendMapping(lg.stats, e.target.value); lg.mappingFrom = '자동추천 (' + (e.target.value === 'split' ? 'UP/DOWN 분리' : '단일 Current') + ')'; lg.profileChanges = []; lg.result = null; App.render(); });
    main.querySelector('#autoRec').addEventListener('click', function () { lg.mapping = L.recommendMapping(lg.stats, m.mode); lg.mappingFrom = '자동추천'; lg.profileChanges = []; lg.result = null; App.render(); });
    main.querySelector('#profApply').addEventListener('click', function () {
      var i = main.querySelector('#profSel').value; if (i === '') { App.toast('적용할 Profile 을 고르세요', true); return; }
      var pr = App.st.profiles[+i], ap = L.applyProfile(pr, lg.stats);
      lg.mapping = ap.mapping; lg.profileChanges = ap.changes; lg.mappingFrom = 'Profile 「' + pr.name + '」 v' + pr.version + ' 에서 제안'; lg.result = null; App.render();
    });
    main.querySelector('#reval').addEventListener('click', function () { App.render(); App.toast('다시 검증했습니다'); });
    main.querySelector('#allOk').addEventListener('click', function () { Object.keys(m.rows).forEach(function (k) { if (m.rows[k].header) m.rows[k].confirmed = true; }); App.render(); });
    main.querySelector('#mapConfirm').addEventListener('click', function () {
      if (!L.validateMapping(m).canConfirm) return;
      m.confirmed = true; m.confirmedAt = App.nowStr(); m.confirmedBy = App.user(); App.toast('Mapping Confirm 했습니다 — 분석 시작을 누르세요'); App.render();
    });
    main.querySelector('#profSave').addEventListener('click', function () { saveProfileDialog(lg); });
    main.querySelector('#runAn').addEventListener('click', function () { runAnalysis(lg); App.render(); });
  }

  function saveProfileDialog(lg) {
    var m = lg.mapping, cur = App.st.profiles.filter(function (p) { return p.id === m.profileId; })[0];
    App.dialog('Mapping Profile 저장', '<label class="field"><span>이름</span><input class="inp" id="pfName" value="' + esc(cur ? cur.name : '') + '" placeholder="예: 시험장비 A 채널맵"></label><p class="note">같은 이름이 있으면 새 버전으로 저장합니다. 감성 평가용 기준 시험원 Profile 과는 다른 것입니다.</p>', [
      { label: '취소' },
      { label: '저장', primary: true, onClick: function (d) {
        var name = d.querySelector('#pfName').value.trim(); if (!name) { App.toast('이름을 넣으세요', true); return false; }
        var same = App.st.profiles.filter(function (p) { return p.name === name; });
        var id = same.length ? same[0].id : 'MP-' + String(App.st.profiles.length + 1).padStart(3, '0');
        var ver = same.length ? Math.max.apply(null, same.map(function (p) { return p.version; })) + 1 : 1;
        var pr = L.mappingToProfile(m, lg.stats, { id: id, name: name, version: ver, author: App.user(), time: App.nowStr() });
        App.st.profiles.push(pr); m.profileId = id; m.profileVersion = ver;
        if (lg.result && lg.result.ok) lg.result.mappingRef = id + ' v' + ver;
        App.save(); App.toast('Profile 「' + name + '」 v' + ver + ' 저장'); App.render();
      } }
    ]);
  }

  function runAnalysis(lg) {
    var r = L.analyze(lg.table, lg.mapping, App.S());
    if (r.ok) r.mappingSnapshot = L.mappingToProfile(lg.mapping, lg.stats, { id: lg.mapping.profileId || '(미저장)', name: lg.mapping.profileId ? '' : '저장 안 된 매핑', version: lg.mapping.profileVersion || 0, author: lg.mapping.confirmedBy, time: lg.mapping.confirmedAt });
    lg.result = r;
    if (!r.ok) App.toast('분석할 수 없습니다: ' + r.missing.join(', '), true);
    else App.toast('이벤트 ' + r.events.length + '개를 찾았습니다');
    return r;
  }
  App.runAnalysis = runAnalysis;

  // ── 분석 결과 ─────────────────────────────────────────────────
  function renderResult(lg) {
    var area = document.getElementById('resultArea'); if (!area) return;
    var r = lg.result;
    if (!r || !r.ok) { area.innerHTML = ''; return; }
    var s = App.S(), det = s.detect;
    var h = '<div class="card"><h2>분석 결과 — Movement Start/Stop 이벤트</h2>' +
      '<p class="note">계산·검출 Version: <code>' + esc(r.version) + '</code><br>Mapping: <code>' + esc(r.mappingRef) + '</code> · Current: UP=' + esc(r.sig.curRole.UP || '없음') + ' [' + esc(r.sig.curUnit.UP || '') + '], DOWN=' + esc(r.sig.curRole.DOWN || '없음') + ' [' + esc(r.sig.curUnit.DOWN || '') + ']' + (lg.mapping.excludeFirstRow ? ' · 첫 행 제외' : '') + '</p>' +
      '<details><summary>검출 설정 바꾸기 (설정값은 모두 가정 — 실제 로그로 맞춥니다)</summary><div class="form-grid" style="margin-top:8px">' +
      [['smoothWin', 'smoothing 창(점)'], ['startThr', 'Start Threshold |dArm/dt| (%/s)'], ['stopThr', 'Stop Threshold (%/s)'], ['hold', 'Hold Time (s)'], ['pre', '분석 Window 앞 (s)'], ['post', '분석 Window 뒤 (s)']]
        .map(function (x) { return '<label class="field"><span>' + x[1] + '</span><input class="inp" type="number" step="any" data-det="' + x[0] + '" value="' + det[x[0]] + '"></label>'; }).join('') +
      '</div><button class="btn" id="reAn" style="margin-top:8px">이 설정으로 다시 분석</button></details>';
    h += '<div class="deriv-pick"><b>파생 신호 표시:</b>' + [['dArm', 'd(Arm%)/dt'], ['dCur', 'dCurrent/dt'], ['dP', 'dP/dt'], ['dPitch', 'dPitch/dt'], ['d2Pitch', 'd²Pitch/dt²']].map(function (x) { return '<label class="check"><input type="checkbox" data-dv="' + x[0] + '"' + (derivShow[x[0]] ? ' checked' : '') + '> ' + x[1] + '</label>'; }).join('') + '</div>';
    h += '<div id="logTracks"></div>';
    h += '<div class="btn-row" style="margin:10px 0"><button class="btn" id="evCsv">이벤트 결과 CSV</button><button class="btn" id="evXlsx">이벤트 결과 Excel (매핑 스냅샷 포함)</button></div>';
    h += '<div class="table-wrap scroll-y"><table class="list" id="evTable"><thead><tr><th>#</th><th>이벤트</th><th class="num">시각(s)</th><th>방향</th><th>Zone</th><th class="num">Arm %</th><th class="num">응답(s)</th><th class="num">실측 Ramp</th><th class="num">ΔP</th><th class="num">max|dP/dt|</th><th class="num">ΔPitch</th><th class="num">max|d²Pitch|</th><th class="num">Settling(s)</th><th class="num">Shock Index</th><th class="num">종합 점수</th><th>판정</th></tr></thead><tbody>' +
      r.events.map(function (e) {
        var f = e.f, j = App.judge(e);
        return '<tr class="click" data-ev="' + e.no + '" tabindex="0"><td>' + e.no + '</td><td>' + (e.type === 'start' ? 'Start' : 'Stop') + '</td><td class="num">' + fmt(e.t, 2) + '</td><td>' + e.dir + '</td><td>' + e.zone + '</td><td class="num">' + fmt(e.arm, 1) + '</td><td class="num">' + fmt(f.response, 3) + '</td><td class="num">' + fmt(f.rampMeasured, 1) + ' ' + esc(f.curUnit ? f.curUnit + '/s' : '') + '</td><td class="num">' + fmt(f.dP) + '</td><td class="num">' + fmt(f.dpdtMax) + '</td><td class="num">' + fmt(f.dPitch, 3) + '</td><td class="num">' + fmt(f.d2PitchMax) + '</td><td class="num">' + fmt(f.settling, 2) + '</td><td class="num">' + fmt(f.shockIndex, 3) + '</td><td class="num">' + (L.isNum(j.score) ? fmt(j.score, 1) + '%' : '—') + '</td><td>' + App.badge(j.status) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="note">표가 길면 머리줄은 그대로 두고 표 안에서 스크롤합니다. 종합 점수는 Zone별 배율을 적용한 세 항목 한계 사용률 중 가장 큰 값입니다(설정 → Zone별 점수 배율). 행을 누르면 Calibration 화면에서 그 이벤트의 Zone·방향과 판정표를 엽니다.</p></div>';
    area.innerHTML = h;
    drawLogTracks(lg);
    App.onResize = function () { drawLogTracks(lg); };
    area.querySelectorAll('[data-det]').forEach(function (el) { el.addEventListener('change', function () { var v = L.num(el.value); if (L.isNum(v)) { s.detect[el.getAttribute('data-det')] = v; App.save(); } }); });
    area.querySelector('#reAn').addEventListener('click', function () { runAnalysis(lg); App.render(); });
    area.querySelectorAll('[data-dv]').forEach(function (el) { el.addEventListener('change', function () { derivShow[el.getAttribute('data-dv')] = el.checked; drawLogTracks(lg); }); });
    area.querySelectorAll('[data-ev]').forEach(function (tr) {
      function open() { var e = r.events[+tr.getAttribute('data-ev') - 1]; App.sel.dir = e.dir; App.sel.zone = e.zone; App.sel.eventNo = e.no; App.go('#/cal'); }
      tr.addEventListener('click', open); tr.addEventListener('keydown', function (k) { if (k.key === 'Enter') open(); });
    });
    area.querySelector('#evCsv').addEventListener('click', function () { App.downloadCsv('이벤트판정_' + lg.name.replace(/\.\w+$/, ''), L.EVENT_HEADER, L.eventRows(r.events, App.judge)); });
    area.querySelector('#evXlsx').addEventListener('click', function () {
      var snap = r.mappingSnapshot, info = [['파일', lg.name], ['계산·검출 Version', r.version], ['Mapping', r.mappingRef], ['Current Mode', snap.mode], ['첫 행 제외', snap.excludeFirstRow ? '예' : '아니오'], ['확정', snap.confirmedAt + ' ' + snap.author]];
      Object.keys(snap.rows).forEach(function (k) { var x = snap.rows[k]; if (x.header) info.push([L.sigDef(k).label, x.header + ' | 역할 ' + (x.role || '-') + ' | ' + x.convert]); });
      ['UP', 'DOWN', 'ALL'].forEach(function (d) { var c = snap.cal[d]; if (c && c.i0 != null) info.push(['전류 보정 ' + d, 'I0=' + c.i0 + ' mA, I100=' + c.i100 + ' mA']); });
      App.downloadXlsx('이벤트판정_' + lg.name.replace(/\.\w+$/, ''), [{ name: '이벤트판정', header: L.EVENT_HEADER, rows: L.eventRows(r.events, App.judge) }, { name: '분석정보·매핑', header: ['항목', '값'], rows: info }]);
    });
  }

  // 트랙 구성: 원신호 4종 + 선택한 파생 신호 (같은 시간축, 신호마다 따로)
  App.trackSpec = function (r, t0, t1, selNo, win, show) {
    var sig = r.sig, d = r.d, tracks = [
      { label: 'Arm Angle %', unit: '%', series: [{ y: sig.arm, color: '#19222d' }], bands: [30, 50, 70], fixed: [0, 100] },
      { label: 'Current UP / DOWN', unit: (sig.curUnit.UP || '') + (sig.curUnit.DOWN && sig.curUnit.DOWN !== sig.curUnit.UP ? ' / ' + sig.curUnit.DOWN : ''), series: [{ y: sig.cur.UP, color: '#1d5ea8', name: 'UP' }, { y: sig.mode === 'split' ? sig.cur.DOWN : null, color: '#c0392b', dash: [5, 3], name: 'DOWN' }] },
      { label: 'Head Pressure', unit: 'bar', series: [{ y: sig.p, color: '#8a5a00' }] },
      { label: 'Pitch Angle', unit: 'deg', series: [{ y: sig.pitch, color: '#1b6e3a' }] }
    ];
    if (show.dArm) tracks.push({ label: 'd(Arm%)/dt', unit: '%/s', series: [{ y: d.dArm, color: '#19222d' }] });
    if (show.dCur) tracks.push({ label: 'dCurrent/dt UP / DOWN', unit: '', series: [{ y: d.dCur.UP, color: '#1d5ea8', name: 'UP' }, { y: sig.mode === 'split' ? d.dCur.DOWN : null, color: '#c0392b', dash: [5, 3], name: 'DOWN' }] });
    if (show.dP) tracks.push({ label: 'dP/dt', unit: 'bar/s', series: [{ y: d.dP, color: '#8a5a00' }] });
    if (show.dPitch) tracks.push({ label: 'dPitch/dt', unit: 'deg/s', series: [{ y: d.dPitch, color: '#1b6e3a' }] });
    if (show.d2Pitch) tracks.push({ label: 'd²Pitch/dt²', unit: 'deg/s²', series: [{ y: d.d2Pitch, color: '#1b6e3a' }] });
    return { t: sig.t, t0: t0, t1: t1, tracks: tracks, events: r.events, selNo: selNo, win: win };
  };
  function drawLogTracks(lg) {
    var host = document.getElementById('logTracks'); if (!host || !lg.result || !lg.result.ok) return;
    var t = lg.result.sig.t;
    C.drawTracks(host, App.trackSpec(lg.result, t[0], t[t.length - 1], null, null, derivShow));
  }
})(window);
