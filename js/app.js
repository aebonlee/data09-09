/* 앱 공통 — 상태·저장·화면 전환·대화상자·파일 입출력. 화면별 코드는 page-*.js */
(function (root) {
  'use strict';
  var L = root.CRLogic, C = root.CRCharts, esc = C.esc;
  var App = root.App = {};
  App.pages = {};

  // ── 상태 ──────────────────────────────────────────────────────
  App.st = root.CRStore.load();
  if (!App.st.values) App.st.values = defaultValues();
  // 로그는 메모리에만 둡니다: { name, rows(표), stats, mapping, applied, quality, result }
  App.logs = [];
  App.activeLog = -1;
  App.sel = { dir: 'UP', zone: 1, eventNo: null, norm: false, show: { prev: true, ref: true, rec: true } };
  App.undo = []; App.redo = [];

  function defaultValues() {
    // 실제 초기값을 모르므로 설정 범위 안의 같은 값으로 시작합니다(가정) — 예시 데이터나 파일로 바꿉니다
    var v = {}, s = L.defaultSettings();
    L.PARAM_KEYS.forEach(function (k) { v[k] = L.snap(Math.min(s.param.max, Math.max(s.param.min, 100)), s.param.step); });
    return v;
  }
  App.save = function () {
    var ok = root.CRStore.save(App.st);
    document.getElementById('storageBanner').hidden = ok && root.CRStore.available();
    document.getElementById('sampleBanner').hidden = !App.st.sample;
  };
  App.S = function () { return App.st.settings; };
  App.nowStr = function () {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  };
  App.user = function () { return App.S().user || '(이름 미입력)'; };

  // ── 파라미터 변경: Undo 스택 + 변경 이력 ────────────────────────
  App.setValues = function (next, meta) {
    var before = App.st.values;
    var ch = L.changeEntries(before, next, { time: App.nowStr(), user: App.user(), source: meta.source, reason: meta.reason });
    if (!ch.length) return false;
    if (!meta.noUndo) { App.undo.push(before); if (App.undo.length > 200) App.undo.shift(); App.redo = []; }
    App.st.values = next;
    if (!meta.skipHistory) App.st.history = App.st.history.concat(ch);
    App.save();
    return true;
  };
  App.setOne = function (key, val, meta) {
    var next = Object.assign({}, App.st.values); next[key] = val;
    return App.setValues(next, meta);
  };
  App.doUndo = function () {
    if (!App.undo.length) return false;
    App.redo.push(App.st.values);
    var prev = App.undo.pop();
    App.st.history = App.st.history.concat(L.changeEntries(App.st.values, prev, { time: App.nowStr(), user: App.user(), source: 'undo' }));
    App.st.values = prev; App.save(); return true;
  };
  App.doRedo = function () {
    if (!App.redo.length) return false;
    App.undo.push(App.st.values);
    var nx = App.redo.pop();
    App.st.history = App.st.history.concat(L.changeEntries(App.st.values, nx, { time: App.nowStr(), user: App.user(), source: 'redo' }));
    App.st.values = nx; App.save(); return true;
  };
  App.latestVersion = function () { var v = App.st.versions; return v.length ? v[v.length - 1] : null; };
  App.refVersion = function () { return App.st.versions.filter(function (v) { return v.id === App.st.refVersionId; })[0] || null; };

  // ── 판정·추천 도우미 ──────────────────────────────────────────
  // Zone별 점수 배율 한 칸 바꾸기 — 설정 화면·Calibration 판정표가 함께 씁니다. 잘못된 값이면 false
  App.setWeight = function (zone, key, raw) {
    var v = L.num(raw);
    if (!L.isNum(v) || v < 0 || v > L.WEIGHT_MAX) { App.toast('배율은 0 ~ ' + L.WEIGHT_MAX + ' 사이 숫자로 넣으세요', true); return false; }
    App.S().zoneWeight[zone][key] = v; App.save();
    App.toast('Zone ' + zone + ' 배율을 저장했습니다 — 판정에 바로 반영됩니다');
    return true;
  };
  App.judge = function (ev) { return L.judgeEvent(ev.f, App.st.criteria[ev.key], App.S(), ev.zone); };
  App.activeResult = function () { var lg = App.logs[App.activeLog]; return lg && lg.result && lg.result.ok ? lg.result : null; };
  // 전류 % 보정이 없는 로그를 보고 있으면 %/sec 비교·추천을 막습니다 (제출 기획서 4.3, AC-16)
  App.recBlocked = function () {
    var r = App.activeResult();
    if (!r) return '';
    var cs = r.sig.cal, miss = ['UP', 'DOWN'].filter(function (d) { return !cs[d]; });
    return miss.length ? '지금 분석 중인 로그에 ' + miss.join('·') + ' 전류 % 보정(I0·I100)이 없어 %/sec 비교·추천을 막았습니다. 「로그·Channel Mapping」에서 보정값을 넣고 다시 확정하세요.' : '';
  };
  App.recommendations = function () { return L.recommendAll(App.st.values, App.st.labels, App.S()); };

  // ── 화면 전환 ─────────────────────────────────────────────────
  var main = document.getElementById('main');
  function route() {
    var h = location.hash || '#/cal', name = h.replace(/^#\//, '').split('/')[0] || 'cal';
    if (!App.pages[name]) name = 'cal';
    document.querySelectorAll('#nav a').forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#/' + name ? 'page' : 'false'); });
    App.save();
    try { App.pages[name](main); }
    catch (e) { main.innerHTML = '<div class="alert error">화면을 그리다 오류가 났습니다: ' + esc(e.message) + '</div>'; if (root.console) console.error(e); }
    // 다른 화면으로 옮겨 가면 맨 위부터 보여 줍니다(같은 화면 다시 그리기는 위치 유지)
    if (App._lastRoute !== name) root.scrollTo(0, 0);
    App._lastRoute = name;
    main.setAttribute('data-route', '#/' + name);
  }
  App.render = route;
  App.go = function (h) { if (location.hash === h) route(); else location.hash = h; };
  root.addEventListener('hashchange', route);
  root.addEventListener('resize', function () { clearTimeout(App._rs); App._rs = setTimeout(function () { if (App.onResize) App.onResize(); }, 150); });

  // ── 알림·대화상자 ─────────────────────────────────────────────
  App.toast = function (msg, isErr) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast' + (isErr ? ' error' : ''); t.hidden = false;
    clearTimeout(App._tt); App._tt = setTimeout(function () { t.hidden = true; }, 3200);
  };
  // buttons: [{label, value, primary, onClick(dialogEl) → false 면 닫지 않음}]
  App.dialog = function (title, html, buttons) {
    var d = document.getElementById('dialog');
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('dialogContent').innerHTML = html;
    var act = document.getElementById('dialogActions'); act.innerHTML = '';
    (buttons || [{ label: '닫기' }]).forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button'; el.className = 'btn' + (b.primary ? ' btn-primary' : ''); el.textContent = b.label;
      el.addEventListener('click', function () { var r = b.onClick ? b.onClick(d) : true; if (r !== false) d.close(); });
      act.appendChild(el);
    });
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    return d;
  };

  // ── 파일 입출력 ───────────────────────────────────────────────
  // CSV·TXT 는 직접 읽고, xlsx/xls 는 SheetJS(vendor) 로 첫 시트를 읽습니다 → 2차원 배열
  App.readTableFile = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader(), isX = /\.(xlsx|xls)$/i.test(file.name);
      fr.onerror = function () { reject(new Error('파일을 읽지 못했습니다')); };
      fr.onload = function () {
        try {
          if (isX) {
            if (!root.XLSX) throw new Error('엑셀 라이브러리를 불러오지 못했습니다');
            var wb = root.XLSX.read(new Uint8Array(fr.result), { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            resolve(root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }));
          } else resolve(L.parseCsv(fr.result));
        } catch (e) { reject(e); }
      };
      if (isX) fr.readAsArrayBuffer(file); else fr.readAsText(file, 'utf-8');
    });
  };
  App.readJsonFile = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('파일을 읽지 못했습니다')); };
      fr.onload = function () { try { resolve(JSON.parse(fr.result)); } catch (e) { reject(new Error('JSON 형식이 아닙니다')); } };
      fr.readAsText(file, 'utf-8');
    });
  };
  function blobDownload(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  App.fileName = function (base, ext) { return (App.st.sample ? '예시데이터_' : '') + base + '.' + ext; };
  App.downloadCsv = function (base, header, rows) { blobDownload(new Blob(['﻿' + L.toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }), App.fileName(base, 'csv')); };
  App.downloadJson = function (base, obj) { blobDownload(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), App.fileName(base, 'json')); };
  // sheets: [{name, header, rows}]
  App.downloadXlsx = function (base, sheets) {
    if (!root.XLSX) { App.toast('엑셀 라이브러리가 없어 CSV 로 내보내세요', true); return; }
    var wb = root.XLSX.utils.book_new();
    sheets.forEach(function (s) { root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.aoa_to_sheet([s.header].concat(s.rows)), s.name.slice(0, 31)); });
    var out = root.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    blobDownload(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), App.fileName(base, 'xlsx'));
  };

  // ── 로그 추가 (Channel Mapping 은 page-log.js) ───────────────────
  // opt.auto = true 면 저장된 Profile 이 있어도 자동추천으로 시작합니다(처음 보는 로그를 올린 것과 같은 흐름)
  App.addLog = function (name, rows, opt) {
    var tb = L.tableFromRows(rows);
    if (!tb.header.length || !tb.data.length) throw new Error(name + ': 머리행 또는 데이터가 없습니다');
    var stats = L.columnStats(tb);
    var lg = { name: name, table: tb, stats: stats, mapping: null, profileChanges: [], result: null };
    // 같은 헤더 구조의 Mapping Profile 이 있으면 제안 상태로 되살리고, 없으면 자동추천
    var pr = opt && opt.auto ? null : App.bestProfile(stats);
    if (pr) { var ap = L.applyProfile(pr, stats); lg.mapping = ap.mapping; lg.profileChanges = ap.changes; lg.mappingFrom = 'Profile 「' + pr.name + '」 v' + pr.version + ' 에서 제안'; }
    else { lg.mapping = L.recommendMapping(stats, 'split'); lg.mappingFrom = '자동추천'; }
    App.logs.push(lg); App.activeLog = App.logs.length - 1;
    return lg;
  };
  App.bestProfile = function (stats) {
    var hs = stats.map(function (s) { return s.header; }), best = null, bestN = 0;
    App.st.profiles.forEach(function (p) {
      var n = 0; Object.keys(p.rows).forEach(function (k) { if (p.rows[k].header && hs.indexOf(p.rows[k].header) >= 0) n++; });
      if (n > bestN || (n === bestN && best && p.version > best.version && p.id === best.id)) { best = p; bestN = n; }
    });
    return bestN >= 3 ? best : null;
  };

  // ── 예시 데이터 ───────────────────────────────────────────────
  App.loadSample = function () {
    var Smp = root.CRSample, s = App.S();
    var v1 = Smp.sampleSet(), v2 = Object.assign({}, v1);
    v2[L.paramKey('UP', 3, 'stop')] = 120; v2[L.paramKey('UP', 4, 'stop')] = 120; v2[L.paramKey('DOWN', 1, 'start')] = 140;
    App.st.values = Object.assign({}, v2);
    App.st.versions = [
      { id: 'V001', name: '예시 초기값', author: '예시', date: '2026-09-28 09:00:00', parent: '', memo: '예시 데이터 — UP 값은 제출자 UI 스케치의 숫자를 옮긴 것', confirmed: true, values: v1 },
      { id: 'V002', name: '예시 조정안', author: '예시', date: '2026-09-28 10:00:00', parent: 'V001', memo: '예시 데이터 — UP Zone 3·4 Stop, DOWN Zone 1 Start 조정', confirmed: false, values: v2 }
    ];
    App.st.refVersionId = 'V001';
    App.st.history = L.changeEntries(v1, v2, { time: '2026-09-28 10:00:00', user: '예시', source: '예시', reason: '예시 조정' });
    App.st.labels = Smp.sampleLabels(s);
    App.st.criteria = {};
    L.PARAM_KEYS.forEach(function (k) { var c = L.criteriaFromLabels(App.st.labels, k, s.recommend.minLabels); if (c.ok) App.st.criteria[k] = c.crit; });
    var pr = Smp.sampleProfile();
    App.st.profiles = App.st.profiles.filter(function (p) { return p.id !== pr.id; }).concat([pr]);
    App.st.sample = true;
    App.undo = []; App.redo = [];
    App.logs = [];
    App.addLog('예시데이터_시험로그1_V001.csv', Smp.sampleLog(v1, 11));
    App.addLog('예시데이터_시험로그2_V002.csv', Smp.sampleLog(v2, 23));
    // 실제 로그의 열 순서로 만든 가상 로그 — Profile 없이 자동추천부터 시작합니다 (2026-09-29 실제 로그 확인)
    App.addLog('예시데이터_시험로그3_실제열순서.csv', Smp.realOrderLog(v2, 31), { auto: true });
    App.activeLog = 0;
    App.save();
  };
  App.clearAll = function () {
    root.CRStore.clear();
    App.st = root.CRStore.emptyState(); App.st.values = defaultValues();
    App.logs = []; App.activeLog = -1; App.undo = []; App.redo = [];
    App.save();
  };

  // 공통 HTML 조각
  App.badge = function (status) { var m = L.STATUS[status] || L.STATUS['NO DATA']; return '<span class="badge ' + m.cls + '">' + esc(m.label) + '</span>'; };
  App.itemBadge = function (state) {
    var m = { ok: ['pass', 'OK'], caution: ['caution', 'CAUTION'], fail: ['fail', 'NG'], nodata: ['nodata', 'NO DATA'] }[state] || ['nodata', '—'];
    return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
  };
  App.opt = function (val, label, cur) { return '<option value="' + esc(val) + '"' + (String(val) === String(cur) ? ' selected' : '') + '>' + esc(label) + '</option>'; };
  App.fileInput = function (id, accept, label, multiple) {
    return '<label class="btn"><span>' + esc(label) + '</span><input type="file" id="' + id + '" accept="' + accept + '"' + (multiple ? ' multiple' : '') + ' class="sr"></label>';
  };

  document.addEventListener('DOMContentLoaded', function () {
    App.save();
    route();
  });
})(window);
