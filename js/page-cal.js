/* Calibration 메인 화면 — 좌 Arm Position · 중앙 Ramp Profile · 우 추천 · 하단 판정 (제출 기획서 3.4, AC-12) */
(function (root) {
  'use strict';
  var L = root.CRLogic, C = root.CRCharts, App = root.App, esc = C.esc, fmt = C.fmt;
  var evShow = { dArm: false, dCur: false, dP: false, dPitch: false, d2Pitch: false };

  function key(evt) { return L.paramKey(App.sel.dir, App.sel.zone, evt); }
  function S() { return App.S(); }
  function clampSnap(v) { var s = S(); return L.snap(L.clamp(v, s.param.min, s.param.max), s.param.step); }

  App.pages.cal = function (main) {
    var sel = App.sel, lg = App.logs[App.activeLog], r = App.activeResult();
    var h = '<div class="cal-top"><h1 class="spacer" style="margin:0">Calibration</h1>' +
      '<a class="btn" href="#/log">시험 로그 불러오기 / 분석 실행</a>' +
      '<button class="btn btn-primary" id="saveSet">Calibration Set 저장</button>' +
      '<button class="btn" id="exportSet">Parameter Export</button>' +
      '<button class="btn" id="undo"' + (App.undo.length ? '' : ' disabled') + '>Undo</button><button class="btn" id="redo"' + (App.redo.length ? '' : ' disabled') + '>Redo</button></div>';
    h += '<p class="note">분석 중인 로그: ' + (lg ? '<b class="mono">' + esc(lg.name) + '</b> ' + (r ? '(이벤트 ' + r.events.length + '개)' : '(매핑 확정·분석 전)') : '없음') + ' · 기준 Reference: ' + (App.refVersion() ? esc(App.refVersion().id + ' ' + App.refVersion().name) : '지정 안 됨') + ' · 직전값: ' + (App.latestVersion() ? esc(App.latestVersion().id) : '저장된 버전 없음') + ' · ECU Write 는 하지 않습니다(Export 파일로 적용).</p>';
    h += '<div class="btn-row" style="margin-bottom:10px"><div class="seg" role="group" aria-label="조작 방향">' +
      ['UP', 'DOWN'].map(function (d) { return '<button type="button" data-dir="' + d + '" aria-pressed="' + (sel.dir === d) + '">암 ' + (d === 'UP' ? '업 (UP)' : '다운 (DOWN)') + '</button>'; }).join('') + '</div>' +
      '<div class="seg" role="group" aria-label="Zone">' + L.ZONES.map(function (z) { return '<button type="button" data-zone="' + z.id + '" aria-pressed="' + (sel.zone === z.id) + '">' + z.label + ' <small>' + z.range + '</small></button>'; }).join('') + '</div></div>';
    h += '<div class="cal-grid">';
    // 좌: Arm Position
    var ev = currentEvent(r);
    h += '<div class="card cal-arm"><h2>Arm Position</h2><div id="armHost">' + C.armSvg(sel.zone, sel.dir, ev ? ev.arm : null) + '</div>' +
      '<p class="note">Zone 을 누르면 그 Zone·방향의 Ramp 와 이벤트를 불러옵니다. 0/30/50/70% 는 이벤트가 아니라 Zone 분류 기준이며, 정확히 경계값이면 위쪽 Zone 으로 봅니다(가정).</p>' +
      '<p class="note">100% Endpoint: ' + sel.dir + ' Start ' + fmt(L.endpointValue(App.st.values, sel.dir, 'start')) + ' / Stop ' + fmt(L.endpointValue(App.st.values, sel.dir, 'stop')) + ' %/s — Zone 4 값과 같음 <span class="badge pass">검증 OK</span></p></div>';
    // 중앙: Ramp Profile
    h += '<div class="card cal-ramp"><h2>Ramp Profile — ' + sel.dir + ' ' + L.ZONES[sel.zone - 1].label + ' (' + L.ZONES[sel.zone - 1].range + ')</h2>' +
      '<div class="btn-row" style="margin-bottom:6px"><div class="seg" role="group" aria-label="X축"><button type="button" data-x="time" aria-pressed="' + !sel.norm + '">X축 Time</button><button type="button" data-x="norm" aria-pressed="' + sel.norm + '">정규화 Phase</button></div>' +
      '<span class="legend"><span>' + C.legendItem('cur') + '</span>' +
      ['prev', 'ref', 'rec'].map(function (k) { return '<label><input type="checkbox" data-ov="' + k + '"' + (sel.show[k] ? ' checked' : '') + '>' + C.legendItem(k) + '</label>'; }).join('') + '</span></div>' +
      '<div id="rampHost"></div>' +
      '<p class="note">그래프 표시는 목표 Current ' + S().profile.amp + '% · 유지 ' + S().profile.hold + ' s 로 그린 개념 Profile 입니다(설정에서 바꿈). ' + (sel.norm ? '정규화 Phase 에서는 드래그를 끕니다.' : '파란·빨간 핸들을 좌우로 끌거나, 핸들에 초점을 두고 화살표 키로 바꿉니다.') + '</p>' +
      '<div class="edit-grid" id="editHost"></div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn btn-sm" id="rsPrev">직전 적용값 복원 (이 Zone·방향)</button><button class="btn btn-sm" id="rsRef">기준 Profile 값 복원 (이 Zone·방향)</button></div>' +
      '<div id="issueHost"></div></div>';
    // 우: 추천
    h += '<div class="card cal-rec"><h2>Recommendation (참고)</h2><div id="recHost"></div></div>';
    h += '</div>';
    // 하단: 이벤트 판정
    h += '<div class="card"><h2>Start/Stop 이벤트 판정 — ' + sel.dir + ' ' + L.ZONES[sel.zone - 1].label + '</h2><div id="judgeHost"></div></div>';
    // 16개 전체
    h += '<div class="card"><h2>16개 Ramp 파라미터</h2><div id="allHost"></div></div>';
    main.innerHTML = h;
    bind(main);
    renderRamp(); renderRec(); renderJudge(); renderAll();
    App.onResize = function () { renderJudge(); };
  };

  function currentEvent(r) {
    if (!r) return null;
    var list = r.events.filter(function (e) { return e.dir === App.sel.dir && e.zone === App.sel.zone; });
    var e = list.filter(function (x) { return x.no === App.sel.eventNo; })[0];
    return e || list[0] || null;
  }

  function lines() {
    var sel = App.sel, v = App.st.values, out = [{ style: 'cur', start: v[key('start')], stop: v[key('stop')] }];
    var pv = App.latestVersion(), rf = App.refVersion();
    if (sel.show.prev && pv) out.push({ style: 'prev', start: pv.values[key('start')], stop: pv.values[key('stop')] });
    if (sel.show.ref && rf) out.push({ style: 'ref', start: rf.values[key('start')], stop: rf.values[key('stop')] });
    if (sel.show.rec && !App.recBlocked()) {
      var a = L.recommend(key('start'), v[key('start')], App.st.labels, S()), b = L.recommend(key('stop'), v[key('stop')], App.st.labels, S());
      if (a.value != null || b.value != null) out.push({ style: 'rec', start: a.value != null ? a.value : v[key('start')], stop: b.value != null ? b.value : v[key('stop')] });
    }
    return out;
  }

  function renderRamp() {
    var host = document.getElementById('rampHost'); if (!host) return;
    var res = C.rampSvg({ prof: S().profile, lines: lines(), norm: App.sel.norm });
    host.innerHTML = res.svg;
    bindHandles(host, res.geo);
    renderEdit();
  }
  function renderEdit() {
    var host = document.getElementById('editHost'); if (!host) return;
    var s = S(), v = App.st.values;
    host.innerHTML = ['start', 'stop'].map(function (e) {
      var k = key(e);
      return '<div class="edit-box ' + e + '"><h3>' + L.EVENT_LABEL[e] + ' <small class="note">(' + L.EVENT_ECU[e] + ')</small></h3><div class="pair">' +
        '<label class="field"><span>② 기울기 (%/sec)</span><input class="inp" type="number" step="' + s.param.step + '" data-slope="' + k + '" value="' + v[k] + '"></label>' +
        '<label class="field"><span>③ Parameter 값 (ECU)</span><input class="inp" type="number" step="any" data-ecu="' + k + '" value="' + L.slopeToEcu(v[k], s) + '"></label></div>' +
        '<small class="note">범위 ' + s.param.min + '~' + s.param.max + ', Step ' + s.param.step + ', ECU 값 = 기울기 × ' + s.param.ecuScale + ' (가정) · 표시 시간 ' + fmt(L.slopeToTime(v[k], s.profile.amp), 3) + ' s</small></div>';
    }).join('');
    host.querySelectorAll('[data-slope]').forEach(function (el) {
      el.addEventListener('change', function () {
        var val = L.num(el.value); if (!L.isNum(val) || val <= 0) { App.toast('0 보다 큰 수를 넣으세요', true); renderEdit(); return; }
        App.setOne(el.getAttribute('data-slope'), L.snap(val, S().param.step), { source: '기울기 입력' }); refresh();
      });
    });
    host.querySelectorAll('[data-ecu]').forEach(function (el) {
      el.addEventListener('change', function () {
        var val = L.num(el.value); if (!L.isNum(val) || val <= 0) { App.toast('0 보다 큰 수를 넣으세요', true); renderEdit(); return; }
        App.setOne(el.getAttribute('data-ecu'), L.ecuToSlope(val, S()), { source: 'Parameter 직접 입력' }); refresh();
      });
    });
    renderIssues();
  }
  function renderIssues() {
    var host = document.getElementById('issueHost'); if (!host) return;
    var vr = L.validateSet(App.st.values, S());
    host.innerHTML = vr.issues.length ? '<ul class="msgs">' + vr.issues.map(function (i) { return '<li class="' + i.level + '">[' + (i.level === 'error' ? '저장 불가' : '경고') + '] ' + esc(i.msg) + '</li>'; }).join('') + '</ul>' : '<p class="note">Min/Max · Step · Zone 경계 연속성 검사: 문제 없음</p>';
  }
  // 값이 바뀌면 그래프·수치·추천·전체표를 함께 갱신합니다(세 방식 양방향 동기화, AC-03)
  function refresh() {
    renderRamp(); renderRec(); renderAll();
    var u = document.getElementById('undo'), rd = document.getElementById('redo');
    if (u) u.disabled = !App.undo.length; if (rd) rd.disabled = !App.redo.length;
    var arm = document.getElementById('armHost'); if (arm) { var ev = currentEvent(App.activeResult()); arm.innerHTML = C.armSvg(App.sel.zone, App.sel.dir, ev ? ev.arm : null); bindArm(); }
  }

  // ① 그래프 드래그 · 키보드
  function bindHandles(host, geo) {
    var svg = host.querySelector('svg'), s = S();
    host.querySelectorAll('.handle').forEach(function (hd) {
      var which = hd.getAttribute('data-h'), k = key(which), before = null, tMax = geo.tMax;
      function toT(ev) {
        var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
        var p = pt.matrixTransform(svg.getScreenCTM().inverse());
        return (p.x - geo.L0) / (geo.W - geo.L0 - geo.R0) * tMax;
      }
      hd.addEventListener('pointerdown', function (ev) {
        ev.preventDefault(); before = Object.assign({}, App.st.values); tMax = geo.tMax;
        svg.setPointerCapture(ev.pointerId);
        function move(e2) {
          var t = toT(e2), amp = s.profile.amp, slope;
          if (which === 'start') slope = amp / Math.max(0.001, t);
          else slope = amp / Math.max(0.001, t - amp / App.st.values[key('start')] - s.profile.hold);
          App.st.values = Object.assign({}, App.st.values); App.st.values[k] = clampSnap(slope);
          var res = C.rampSvg({ prof: s.profile, lines: lines(), norm: false });
          // 드래그 중에는 그래프·수치만 다시 그립니다(핸들 요소는 유지)
          var tmp = document.createElement('div'); tmp.innerHTML = res.svg;
          svg.innerHTML = tmp.firstChild.innerHTML;
          var inp = document.querySelector('[data-slope="' + k + '"]'), ecu = document.querySelector('[data-ecu="' + k + '"]');
          if (inp) inp.value = App.st.values[k]; if (ecu) ecu.value = L.slopeToEcu(App.st.values[k], s);
        }
        function up() {
          svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up);
          var next = App.st.values; App.st.values = before;
          App.setValues(next, { source: '그래프 드래그' }); refresh();
        }
        svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
      });
      hd.addEventListener('keydown', function (e) {
        var d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (!d) return;
        e.preventDefault();
        App.setOne(k, clampSnap(App.st.values[k] + d * s.param.step * (e.shiftKey ? 10 : 1)), { source: '그래프 핸들(키보드)' });
        refresh(); var again = document.querySelector('.handle[data-h="' + which + '"]'); if (again) again.focus();
      });
    });
  }

  function renderRec() {
    var host = document.getElementById('recHost'); if (!host) return;
    var blocked = App.recBlocked(), recs = App.recommendations(), v = App.st.values, dir = App.sel.dir;
    var h = '<p class="note">기준 시험원 Accepted 라벨의 범위에 근거한 Rule 기반 참고값입니다. 「적용」을 누르기 전에는 값이 바뀌지 않습니다. 최종 결정은 시험원이 합니다.</p>';
    if (blocked) { host.innerHTML = h + '<div class="alert warn">' + esc(blocked) + '</div>'; return; }
    h += '<div class="table-wrap"><table class="list rec-table"><thead><tr><th>Zone</th><th>Start</th><th>Stop(End)</th></tr></thead><tbody>';
    L.ZONES.slice().reverse().forEach(function (z) {
      h += '<tr' + (z.id === App.sel.zone ? ' class="sel"' : '') + '><td><b>' + z.label + '</b><br><small class="note">' + z.range + '</small></td>' + ['start', 'stop'].map(function (e) {
        var k = L.paramKey(dir, z.id, e), rc = recs[k];
        if (rc.status === 'NO DATA') return '<td><span class="badge nodata">NO DATA</span><span class="rec-reason">' + esc(rc.reason) + '</span></td>';
        var sign = rc.delta > 0 ? '+' : '';
        return '<td>' + fmt(v[k]) + ' → <b>' + fmt(rc.value) + '</b> <small>(' + sign + fmt(rc.delta) + ')</small>' + (rc.status === 'CHANGE' ? ' <button class="btn btn-sm" data-apply="' + k + '">적용</button>' : ' <span class="badge ok">유지</span>') + '<span class="rec-reason">' + esc(rc.reason) + '</span></td>';
      }).join('') + '</tr>';
    });
    host.innerHTML = h + '</tbody></table></div>';
    host.querySelectorAll('[data-apply]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-apply'), rc = recs[k];
        App.setOne(k, rc.value, { source: '추천값 적용', reason: rc.reason }); App.toast(L.paramLabel(k) + ' → ' + rc.value + ' %/s 적용'); refresh();
      });
    });
  }

  function renderJudge() {
    var host = document.getElementById('judgeHost'); if (!host) return;
    var r = App.activeResult();
    if (!r) { host.innerHTML = '<p class="empty">분석한 로그가 없습니다. 「시험 로그 불러오기 / 분석 실행」에서 로그를 올리고 Mapping Confirm 뒤 분석하세요.</p>'; return; }
    var list = r.events.filter(function (e) { return e.dir === App.sel.dir && e.zone === App.sel.zone; });
    if (!list.length) { host.innerHTML = '<p class="empty">이 로그에는 ' + App.sel.dir + ' ' + L.ZONES[App.sel.zone - 1].label + ' 에서 난 Start/Stop 이벤트가 없습니다.</p>'; return; }
    var ev = currentEvent(r), f = ev.f, j = App.judge(ev), crit = App.st.criteria[ev.key], unit = f.curUnit ? f.curUnit + '/s' : '';
    var setV = App.st.values[ev.key];
    var h = '<div class="btn-row"><label class="field" style="min-width:18em"><span>이벤트</span><select class="inp" id="evSel">' + list.map(function (e) { return App.opt(e.no, '#' + e.no + ' ' + (e.type === 'start' ? 'Movement Start' : 'Movement Stop') + ' · ' + fmt(e.t, 2) + ' s · Arm ' + fmt(e.arm, 1) + '%', ev.no); }).join('') + '</select></label>' +
      '<button class="btn" id="labelBtn" style="align-self:flex-end">이 이벤트에 라벨 기록</button><a class="btn" href="#/profile" style="align-self:flex-end">기준 범위 편집</a></div>';
    h += '<div class="judge-grid"><div>';
    h += '<div class="overall">종합 판정 ' + App.badge(j.status) + ' <span class="note">' + esc(L.STATUS[j.status].show) + '</span></div>';
    if (j.reasons.length) h += '<ul class="msgs">' + j.reasons.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    h += '<div class="table-wrap"><table class="list"><thead><tr><th>항목별 점수 (' + esc(L.paramLabel(ev.key)) + ')</th><th>기준 범위</th><th class="num">측정값</th><th>판정</th></tr></thead><tbody>' +
      j.items.map(function (it) { return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.crit) + (it.unit ? ' ' + it.unit : '') + '</td><td class="num">' + fmt(it.value, 3) + '</td><td>' + App.itemBadge(it.state) + ' <small class="note">' + esc(it.why) + '</small></td></tr>'; }).join('') +
      '<tr><td><b>종합 판정</b></td><td colspan="2">' + (crit && crit.source ? '<small class="note">기준 출처: ' + esc(crit.source) + '</small>' : (crit ? '' : '<small class="note">이 파라미터의 기준이 없습니다</small>')) + '</td><td>' + App.badge(j.status) + '</td></tr></tbody></table></div>';
    h += '<div class="kv-grid">' + [
      ['설정 Ramp (' + L.EVENT_LABEL[ev.type] + ')', fmt(setV) + ' %/s'],
      ['실측 Ramp (10→90%)', fmt(f.rampMeasured, 1) + ' ' + unit + (f.curUnit === 'mA' ? ' — % 보정 없음, %/s 비교 불가' : '')],
      [ev.type === 'start' ? 'Response Delay' : 'Stop Response Time', fmt(f.response, 3) + ' s'],
      ['Head P 이전 → Peak', fmt(f.pBefore) + ' → ' + fmt(f.pPeak) + ' bar'], ['ΔP', fmt(f.dP) + ' bar'], ['max |dP/dt|', fmt(f.dpdtMax) + ' bar/s'],
      ['max |dCurrent/dt|', fmt(f.dCurMax) + ' ' + unit], ['Settling Time', L.isNum(f.settling) ? fmt(f.settling, 2) + ' s' : '창 안에서 정착 안 함'], ['Shock Index (가정 식)', fmt(f.shockIndex, 3)]
    ].map(function (x) { return '<div><span>' + esc(x[0]) + '</span>' + esc(x[1]) + '</div>'; }).join('') + '</div>';
    h += '<h3>' + (ev.dir === 'DOWN' ? 'DOWN Pitch 평가 (Absolute Pitch · ΔPitch 별도 표시)' : 'Pitch 응답') + '</h3><div class="kv-grid">' + [
      ['Absolute Pitch (최대 크기)', fmt(f.pitchAbs, 3) + ' deg'], ['ΔPitch', fmt(f.dPitch, 3) + ' deg'], ['Pitch Peak-to-Peak', fmt(f.pitchP2P, 3) + ' deg'],
      ['max |dPitch/dt|', fmt(f.dPitchMax, 3) + ' deg/s'], ['max |d²Pitch/dt²|', fmt(f.d2PitchMax) + ' deg/s²']
    ].map(function (x) { return '<div><span>' + esc(x[0]) + '</span>' + esc(x[1]) + '</div>'; }).join('') + '</div>';
    h += '</div><div><div class="deriv-pick"><b>파생 신호:</b>' + [['dArm', 'd(Arm%)/dt'], ['dCur', 'dCurrent/dt'], ['dP', 'dP/dt'], ['dPitch', 'dPitch/dt'], ['d2Pitch', 'd²Pitch/dt²']].map(function (x) { return '<label class="check"><input type="checkbox" data-edv="' + x[0] + '"' + (evShow[x[0]] ? ' checked' : '') + '> ' + x[1] + '</label>'; }).join('') + '</div>' +
      '<div id="evTracks"></div><p class="note">노란 음영 = 분석 Window, 파란 실선 = Movement Start, 빨간 점선 = Movement Stop, 굵은 선 = 선택 이벤트. 모든 트랙이 같은 시간축입니다.</p></div></div>';
    host.innerHTML = h;
    var t0 = Math.max(r.sig.t[0], f.windowStart - 0.5), t1 = Math.min(r.sig.t[r.sig.t.length - 1], f.windowEnd + 0.5);
    C.drawTracks(document.getElementById('evTracks'), App.trackSpec(r, t0, t1, ev.no, [f.windowStart, f.windowEnd], evShow));
    host.querySelector('#evSel').addEventListener('change', function (e) { App.sel.eventNo = +e.target.value; renderJudge(); var arm = document.getElementById('armHost'); if (arm) { arm.innerHTML = C.armSvg(App.sel.zone, App.sel.dir, currentEvent(r).arm); bindArm(); } });
    host.querySelectorAll('[data-edv]').forEach(function (el) { el.addEventListener('change', function () { evShow[el.getAttribute('data-edv')] = el.checked; renderJudge(); }); });
    host.querySelector('#labelBtn').addEventListener('click', function () { labelDialog(ev); });
  }

  function labelDialog(ev) {
    var lg = App.logs[App.activeLog], r = lg.result, vs = App.st.versions;
    var sel = function (name, codes, cur) { return '<label class="field"><span>' + name + '</span><select class="inp" data-lab="' + name + '">' + codes.map(function (c) { return App.opt(c, c, cur); }).join('') + '</select></label>'; };
    var html = '<p class="note">' + esc(L.paramLabel(ev.key)) + ' · 이벤트 #' + ev.no + ' (' + fmt(ev.t, 2) + ' s). 계산된 Feature 와 함께 기준 시험원 라벨 DB 에 저장합니다.</p><div class="form-grid">' +
      '<label class="field"><span>기준 시험원</span><input class="inp" id="labExpert" value="' + esc(App.S().user || '') + '"></label>' +
      '<label class="field"><span>이 시험에 쓴 Calibration Set</span><select class="inp" id="labSet">' + App.opt('__cur', '현재 편집값', vs.length ? vs[vs.length - 1].id : '__cur') + vs.map(function (v) { return App.opt(v.id, v.id + ' ' + v.name, vs[vs.length - 1].id); }).join('') + '</select></label>' +
      sel('shock_label', L.LABEL_CODES.shock_label, 'OK') + sel('pitch_label', L.LABEL_CODES.pitch_label, 'OK') + sel('resp_label', L.LABEL_CODES.resp_label, 'Good') + sel('overall', L.LABEL_CODES.overall, 'Accept') +
      '</div><label class="field" style="margin-top:8px"><span>메모 (정성 코멘트)</span><textarea class="inp" id="labMemo" placeholder="예: 상단 DOWN 에서 앞쪽 쏠림이 큼"></textarea></label>';
    App.dialog('라벨 기록', html, [{ label: '취소' }, { label: '저장', primary: true, onClick: function (d) {
      var setId = d.querySelector('#labSet').value, vals = setId === '__cur' ? App.st.values : vs.filter(function (v) { return v.id === setId; })[0].values;
      var meta = { id: 'L' + String(App.st.labels.length + 1).padStart(4, '0') + '-' + Date.now().toString(36).slice(-4), date: App.nowStr().slice(0, 10), expert: d.querySelector('#labExpert').value.trim(),
        logName: lg.name, setVersion: setId === '__cur' ? '현재 편집값' : setId, mappingRef: r.mappingRef, rampValue: vals[ev.key], memo: d.querySelector('#labMemo').value.trim() };
      d.querySelectorAll('[data-lab]').forEach(function (s) { meta[s.getAttribute('data-lab')] = s.value; });
      var i0 = L.idxAt(r.sig.t, ev.f.windowStart), i1 = L.idxAt(r.sig.t, ev.f.windowEnd);
      function mean(a) { if (!a) return ''; var s = 0, n = 0; for (var i = i0; i <= i1; i++) if (L.isNum(a[i])) { s += a[i]; n++; } return n ? L.round(s / n, 1) : ''; }
      meta.rpm = mean(r.sig.rpm); meta.payload = mean(r.sig.payload); meta.oilTemp = mean(r.sig.oilTemp);
      App.st.labels.push(L.labelFromEvent(ev, meta)); App.save(); App.toast('라벨을 저장했습니다 (총 ' + App.st.labels.length + '건)'); refresh();
    } }]);
  }

  function renderAll() {
    var host = document.getElementById('allHost'); if (!host) return;
    var v = App.st.values, s = S(), pv = App.latestVersion(), rf = App.refVersion();
    var h = '<div class="table-wrap"><table class="list"><thead><tr><th>방향</th><th>Zone</th><th class="num">Start (%/s)</th><th class="num">Start ECU</th><th class="num">Stop(End) (%/s)</th><th class="num">Stop ECU</th><th class="num">직전 ' + (pv ? esc(pv.id) : '') + '</th><th class="num">기준 ' + (rf ? esc(rf.id) : '') + '</th></tr></thead><tbody>';
    L.DIRS.forEach(function (d) {
      L.ZONES.forEach(function (z) {
        var ks = L.paramKey(d, z.id, 'start'), kt = L.paramKey(d, z.id, 'stop');
        h += '<tr class="click' + (d === App.sel.dir && z.id === App.sel.zone ? ' sel' : '') + '" data-pick="' + d + ':' + z.id + '" tabindex="0"><td>' + d + '</td><td>' + z.label + ' ' + z.range + '</td><td class="num">' + fmt(v[ks]) + '</td><td class="num">' + L.slopeToEcu(v[ks], s) + '</td><td class="num">' + fmt(v[kt]) + '</td><td class="num">' + L.slopeToEcu(v[kt], s) + '</td>' +
          '<td class="num">' + (pv ? fmt(pv.values[ks]) + ' / ' + fmt(pv.values[kt]) : '—') + '</td><td class="num">' + (rf ? fmt(rf.values[ks]) + ' / ' + fmt(rf.values[kt]) : '—') + '</td></tr>';
      });
    });
    host.innerHTML = h + '</tbody></table></div><p class="note">100% Endpoint 는 독립 파라미터가 없고 Zone 4(70~100%) 값을 씁니다.</p>';
    host.querySelectorAll('[data-pick]').forEach(function (tr) {
      function go() { var p = tr.getAttribute('data-pick').split(':'); App.sel.dir = p[0]; App.sel.zone = +p[1]; App.sel.eventNo = null; App.render(); }
      tr.addEventListener('click', go); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    });
  }

  function bindArm() {
    document.querySelectorAll('#armHost .zone').forEach(function (g) {
      function go() { App.sel.zone = +g.getAttribute('data-zone'); App.sel.eventNo = null; App.render(); }
      g.addEventListener('click', go); g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  function restore(ver, what) {
    if (!ver) { App.toast(what === 'prev' ? '저장된 버전이 없습니다' : '기준 Reference 버전을 「버전·이력」에서 지정하세요', true); return; }
    var next = Object.assign({}, App.st.values);
    ['start', 'stop'].forEach(function (e) { next[key(e)] = ver.values[key(e)]; });
    if (App.setValues(next, { source: what === 'prev' ? '직전 적용값 복원' : '기준 Profile 값 복원', reason: ver.id })) App.toast(ver.id + ' 값으로 복원했습니다'); else App.toast('이미 같은 값입니다');
    refresh();
  }

  function bind(main) {
    main.querySelectorAll('[data-dir]').forEach(function (b) { b.addEventListener('click', function () { App.sel.dir = b.getAttribute('data-dir'); App.sel.eventNo = null; App.render(); }); });
    main.querySelectorAll('.seg [data-zone]').forEach(function (b) { b.addEventListener('click', function () { App.sel.zone = +b.getAttribute('data-zone'); App.sel.eventNo = null; App.render(); }); });
    main.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', function () { App.sel.norm = b.getAttribute('data-x') === 'norm'; App.render(); }); });
    main.querySelectorAll('[data-ov]').forEach(function (c) { c.addEventListener('change', function () { App.sel.show[c.getAttribute('data-ov')] = c.checked; renderRamp(); }); });
    bindArm();
    main.querySelector('#undo').addEventListener('click', function () { if (App.doUndo()) refresh(); });
    main.querySelector('#redo').addEventListener('click', function () { if (App.doRedo()) refresh(); });
    main.querySelector('#rsPrev').addEventListener('click', function () { restore(App.latestVersion(), 'prev'); });
    main.querySelector('#rsRef').addEventListener('click', function () { restore(App.refVersion(), 'ref'); });
    main.querySelector('#saveSet').addEventListener('click', saveDialog);
    main.querySelector('#exportSet').addEventListener('click', exportDialog);
  }

  // Calibration Set 저장 — 범위 오류는 막고, 경고는 확인을 받고, Safety Limit 초과 로그가 있으면 최종 Confirm 을 막습니다
  function saveDialog() {
    var vr = L.validateSet(App.st.values, S()), errs = vr.issues.filter(function (i) { return i.level === 'error'; }), warns = vr.issues.filter(function (i) { return i.level === 'warn'; });
    var r = App.activeResult(), unsafe = r ? r.events.filter(function (e) { return App.judge(e).safety; }) : [];
    if (errs.length) { App.dialog('저장할 수 없습니다', '<ul class="msgs">' + errs.map(function (i) { return '<li class="error">' + esc(i.msg) + '</li>'; }).join('') + '</ul>'); return; }
    var id = L.nextVersionId(App.st.versions), pv = App.latestVersion();
    var html = '<div class="form-grid"><label class="field"><span>버전</span><input class="inp" value="' + id + '" readonly></label><label class="field"><span>이름</span><input class="inp" id="svName" placeholder="예: 2차 시험용"></label><label class="field"><span>작성자</span><input class="inp" id="svAuthor" value="' + esc(App.S().user || '') + '"></label></div>' +
      '<label class="field" style="margin-top:8px"><span>변경 사유·메모</span><textarea class="inp" id="svMemo"></textarea></label>' +
      '<p class="note">부모 버전: ' + (pv ? pv.id : '없음') + ' · 바뀐 파라미터 ' + (pv ? L.diffSets(pv.values, App.st.values).filter(function (d) { return d.changed; }).length : 16) + '개</p>' +
      (warns.length ? '<div class="alert warn"><ul class="msgs">' + warns.map(function (i) { return '<li>' + esc(i.msg) + '</li>'; }).join('') + '</ul><label class="check"><input type="checkbox" id="svWarnOk"> 위 경고를 확인했습니다</label></div>' : '') +
      '<label class="check"><input type="checkbox" id="svConfirm"' + (unsafe.length ? ' disabled' : '') + '> 최종 Confirm (시험원 확정)</label>' +
      (unsafe.length ? '<div class="alert error">분석 중인 로그에 Safety Limit 초과 이벤트가 ' + unsafe.length + '개 있어 최종 Confirm 을 막았습니다(작업본 저장은 됩니다).</div>' : '') +
      '<label class="field" style="margin-top:8px"><span>승인 메모 (Confirm 할 때)</span><input class="inp" id="svAppr"></label>';
    App.dialog('Calibration Set 저장', html, [{ label: '취소' }, { label: '저장', primary: true, onClick: function (d) {
      var w = d.querySelector('#svWarnOk'); if (w && !w.checked) { App.toast('경고를 확인해 주세요', true); return false; }
      var conf = d.querySelector('#svConfirm').checked;
      App.st.versions.push({ id: id, name: d.querySelector('#svName').value.trim() || id, author: d.querySelector('#svAuthor').value.trim() || App.user(), date: App.nowStr(), parent: pv ? pv.id : '',
        memo: d.querySelector('#svMemo').value.trim(), confirmed: conf, approvalMemo: conf ? d.querySelector('#svAppr').value.trim() : '', values: Object.assign({}, App.st.values) });
      App.st.history.push({ time: App.nowStr(), user: App.user(), key: '(버전)', from: pv ? pv.id : '', to: id, source: conf ? '저장·최종 Confirm' : '저장', reason: d.querySelector('#svMemo').value.trim() });
      App.save(); App.toast(id + ' 저장' + (conf ? ' · 최종 Confirm' : '')); App.render();
    } }]);
  }
  App.exportSet = function (fmt2, values, base) {
    var s = S(), rows = L.setToRows(values, s);
    if (fmt2 === 'csv') App.downloadCsv(base, L.SET_HEADER, rows);
    else if (fmt2 === 'xlsx') App.downloadXlsx(base, [{ name: 'CalibrationSet', header: L.SET_HEADER, rows: rows }]);
    else App.downloadJson(base, { type: 'CalibrationSet', exportedAt: App.nowStr(), by: App.user(), unit: '%/s', ecuScale: s.param.ecuScale, endpoint100: 'Zone 4 값 유지', values: values, rows: rows.map(function (r) { var o = {}; L.SET_HEADER.forEach(function (h, i) { o[h] = r[i]; }); return o; }) });
  };
  function exportDialog() {
    var vr = L.validateSet(App.st.values, S()), errs = vr.issues.filter(function (i) { return i.level === 'error'; });
    if (errs.length) { App.dialog('내보낼 수 없습니다', '<ul class="msgs">' + errs.map(function (i) { return '<li class="error">' + esc(i.msg) + '</li>'; }).join('') + '</ul>'); return; }
    App.dialog('Parameter Export', '<p>현재 편집값 16개(%/s 와 ECU 값)를 파일로 내보냅니다. 장비 적용은 이 파일로 따로 합니다(ECU 직접 Write 없음).</p>', [
      { label: '닫기' },
      { label: 'CSV', onClick: function () { App.exportSet('csv', App.st.values, 'CalibrationSet_현재값'); } },
      { label: 'Excel', onClick: function () { App.exportSet('xlsx', App.st.values, 'CalibrationSet_현재값'); } },
      { label: 'JSON', primary: true, onClick: function () { App.exportSet('json', App.st.values, 'CalibrationSet_현재값'); } }
    ]);
  }
})(window);
