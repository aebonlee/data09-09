/* 브라우저 저장소 — localStorage 를 쓰되, 막혀 있으면 메모리로만 동작합니다.
   로그 원본은 용량 때문에 저장하지 않습니다(파일로 다시 불러옵니다). */
(function (root) {
  'use strict';
  var KEY = 'data09-09.state';
  var memory = {};
  var ok = true;
  function get(k) {
    try { return root.localStorage.getItem(k); } catch (e) { ok = false; return memory[k] == null ? null : memory[k]; }
  }
  function set(k, v) {
    try { root.localStorage.setItem(k, v); return true; } catch (e) { ok = false; memory[k] = v; return false; }
  }
  function del(k) {
    try { root.localStorage.removeItem(k); } catch (e) { ok = false; delete memory[k]; }
  }
  function emptyState() {
    return { settings: root.CRLogic.defaultSettings(), values: null, versions: [], history: [], labels: [], criteria: {}, profiles: [], refVersionId: '', sample: false };
  }
  function load() {
    var st = emptyState(), raw = get(KEY);
    if (!raw) return st;
    try {
      var p = JSON.parse(raw);
      st.settings = root.CRLogic.mergeSettings(p.settings);
      ['versions', 'history', 'labels', 'profiles'].forEach(function (k) { if (Array.isArray(p[k])) st[k] = p[k]; });
      if (p.values && typeof p.values === 'object') st.values = p.values;
      if (p.criteria && typeof p.criteria === 'object') st.criteria = p.criteria;
      st.refVersionId = p.refVersionId || '';
      st.sample = !!p.sample;
    } catch (e) { /* 깨진 값은 무시 */ }
    return st;
  }
  root.CRStore = {
    emptyState: emptyState,
    load: load,
    save: function (st) { return set(KEY, JSON.stringify(st)); },
    clear: function () { del(KEY); },
    available: function () { get(KEY); return ok; }
  };
})(window);
