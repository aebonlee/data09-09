/* 그래프 — 외부 라이브러리 없이 canvas(트랙)·SVG(Arm 자세, Ramp Profile)로 그립니다 */
(function (root) {
  'use strict';
  var L = root.CRLogic;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(v, d) { return L.isNum(v) ? String(L.round(v, d == null ? 2 : d)) : '—'; }

  // ── 시간 동기 트랙: 신호마다 캔버스 하나, 같은 시간 범위 ──────────
  // spec: { t, t0, t1, tracks:[{label, unit, series:[{y, color, dash}], bands?}], events, selNo, win:[a,b] }
  function drawTracks(host, spec) {
    host.innerHTML = '';
    var box = document.createElement('div'); box.className = 'tracks'; host.appendChild(box);
    spec.tracks.forEach(function (tr) {
      var wrap = document.createElement('div'); wrap.className = 'track';
      var cv = document.createElement('canvas');
      var lab = document.createElement('div'); lab.className = 'tl'; lab.textContent = tr.label + (tr.unit ? ' [' + tr.unit + ']' : '');
      wrap.appendChild(cv); wrap.appendChild(lab); box.appendChild(wrap);
      drawOne(cv, spec, tr);
    });
    // 시간축 눈금
    var ax = document.createElement('div'); ax.className = 'note'; ax.style.display = 'flex'; ax.style.justifyContent = 'space-between';
    ax.innerHTML = '<span>' + fmt(spec.t0, 2) + ' s</span><span>Time</span><span>' + fmt(spec.t1, 2) + ' s</span>';
    box.appendChild(ax);
  }
  function drawOne(cv, spec, tr) {
    var dpr = root.devicePixelRatio || 1, W = Math.max(200, cv.clientWidth || 600), H = cv.clientHeight || 92;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var t = spec.t, i0 = L.idxAt(t, spec.t0), i1 = L.idxAt(t, spec.t1);
    var lo = Infinity, hi = -Infinity;
    tr.series.forEach(function (s) { if (!s.y) return; for (var i = i0; i <= i1; i++) { var v = s.y[i]; if (L.isNum(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } });
    if (tr.fixed) { lo = Math.min(lo, tr.fixed[0]); hi = Math.max(hi, tr.fixed[1]); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var X = function (tt) { return (tt - spec.t0) / (spec.t1 - spec.t0) * W; };
    var Y = function (v) { return H - 4 - (v - lo) / (hi - lo) * (H - 18); };
    // 분석 Window 음영
    if (spec.win) { g.fillStyle = 'rgba(255, 196, 0, .18)'; g.fillRect(X(spec.win[0]), 0, X(spec.win[1]) - X(spec.win[0]), H); }
    // Zone 경계 밴드 (Arm % 트랙)
    if (tr.bands) {
      tr.bands.forEach(function (b) { var y = Y(b); if (y > 0 && y < H) { g.strokeStyle = '#9aa6b2'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]); g.fillStyle = '#6b7682'; g.font = '10px sans-serif'; g.fillText(b + '%', W - 30, y - 2); } });
    }
    // 이벤트 Marker: Start 실선, Stop 점선
    (spec.events || []).forEach(function (e) {
      if (e.t < spec.t0 || e.t > spec.t1) return;
      var x = X(e.t);
      g.strokeStyle = e.type === 'start' ? 'rgba(29,94,168,.75)' : 'rgba(192,57,43,.75)';
      g.lineWidth = e.no === spec.selNo ? 2.5 : 1;
      g.setLineDash(e.type === 'start' ? [] : [5, 3]);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
    });
    // 선: 픽셀마다 최소·최대로 줄여 그립니다
    tr.series.forEach(function (s) {
      if (!s.y) return;
      g.strokeStyle = s.color || '#222'; g.lineWidth = s.width || 1.4; g.setLineDash(s.dash || []);
      g.beginPath();
      var n = i1 - i0 + 1, per = Math.max(1, Math.floor(n / W)), first = true;
      for (var i = i0; i <= i1; i += per) {
        var mn = Infinity, mx = -Infinity, j2 = Math.min(i1, i + per - 1);
        for (var j = i; j <= j2; j++) { var v = s.y[j]; if (L.isNum(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
        if (!isFinite(mn)) continue;
        var x = X(t[i]);
        if (first) { g.moveTo(x, Y(mn)); first = false; } else g.lineTo(x, Y(mn));
        if (mx !== mn) g.lineTo(x, Y(mx));
      }
      g.stroke(); g.setLineDash([]);
    });
    g.fillStyle = '#6b7682'; g.font = '10px sans-serif';
    g.fillText(fmt(hi - pad, 2), W - 60, 12); g.fillText(fmt(lo + pad, 2), W - 60, H - 6);
  }

  // ── 좌측 Arm Position: 0/30/50/70/100% 와 선택 Zone 강조 ──────────
  function armSvg(selZone, dir, lastArm) {
    var W = 200, H = 300, top = 20, bot = 280;
    var Y = function (p) { return bot - (bot - top) * p / 100; };
    var s = '<svg class="arm-svg" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Arm Position — Zone 선택">';
    L.ZONES.slice().reverse().forEach(function (z) {
      var sel = z.id === selZone;
      s += '<g class="zone" tabindex="0" role="button" data-zone="' + z.id + '" aria-pressed="' + sel + '" aria-label="' + z.label + ' ' + z.range + '">' +
        '<rect x="60" y="' + Y(z.hi) + '" width="130" height="' + (Y(z.lo) - Y(z.hi)) + '" fill="' + (sel ? 'var(--zone-sel)' : '#f4f6f8') + '" stroke="#b7c0ca"/>' +
        '<text x="125" y="' + ((Y(z.hi) + Y(z.lo)) / 2 + 4) + '" text-anchor="middle" font-size="13" font-weight="' + (sel ? 800 : 500) + '" fill="#19222d">' + z.label + '</text>' +
        '<text x="125" y="' + ((Y(z.hi) + Y(z.lo)) / 2 + 19) + '" text-anchor="middle" font-size="10" fill="#56616f">' + z.range + '</text></g>';
    });
    [0, 30, 50, 70, 100].forEach(function (p) { s += '<text x="52" y="' + (Y(p) + 4) + '" text-anchor="end" font-size="11" fill="#56616f">' + p + '%</text><line x1="55" x2="60" y1="' + Y(p) + '" y2="' + Y(p) + '" stroke="#56616f"/>'; });
    // 암 막대(선택 Zone 가운데 자세) + 방향 화살표
    var z = L.ZONES[selZone - 1], ang = L.isNum(lastArm) ? lastArm : (z.lo + z.hi) / 2, y = Y(ang);
    s += '<line x1="6" y1="' + Y(0) + '" x2="24" y2="' + y + '" stroke="#19222d" stroke-width="5" stroke-linecap="round"/>';
    s += '<circle cx="24" cy="' + y + '" r="6" fill="#19222d"/>';
    s += '<text x="12" y="' + (dir === 'UP' ? top - 4 : H - 4) + '" font-size="12" font-weight="800" fill="' + (dir === 'UP' ? 'var(--start)' : 'var(--stop)') + '">' + (dir === 'UP' ? 'UP ↑' : 'DOWN ↓') + '</text>';
    s += '<text x="125" y="' + (top - 6) + '" text-anchor="middle" font-size="10" fill="#56616f">100% Endpoint = Zone 4 값</text>';
    return s + '</svg>';
  }

  // ── 중앙 Ramp Profile: X=Time(s) 또는 정규화 Phase, Y=Current(%) ────
  // lines: [{name, start, stop, style:'cur'|'prev'|'ref'|'rec'}]
  var STYLE = {
    cur: { color: '#19222d', dash: '', w: 3, label: '현재값' },
    prev: { color: '#6b7682', dash: '7 5', w: 2, label: '직전값' },
    ref: { color: '#1b6e3a', dash: '2 4', w: 2.2, label: '기준 Reference' },
    rec: { color: '#7b3fa0', dash: '10 4 2 4', w: 2, label: '추천값' }
  };
  function rampSvg(o) {
    var W = 640, H = 300, L0 = 48, R0 = 16, T0 = 30, B0 = 40;
    var prof = o.prof, cur = o.lines[0];
    var tMax = 0;
    o.lines.forEach(function (ln) { if (L.isNum(ln.start) && L.isNum(ln.stop)) tMax = Math.max(tMax, L.profilePoints(ln.start, ln.stop, prof)[3][0]); });
    tMax = tMax * 1.05 || 1;
    var curPts = L.profilePoints(cur.start, cur.stop, prof), curEnd = curPts[3][0];
    var X = function (tt, ln) {
      if (o.norm) { var e = L.profilePoints(ln.start, ln.stop, prof)[3][0]; return L0 + (W - L0 - R0) * (tt / e); }
      return L0 + (W - L0 - R0) * tt / tMax;
    };
    var Y = function (v) { return H - B0 - (H - B0 - T0) * v / prof.amp; };
    var s = '<svg class="ramp-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ramp Profile 그래프">';
    // Start / Stop 구간 음영과 이름
    var x1 = X(curPts[1][0], cur), x2 = X(curPts[2][0], cur), x3 = X(curPts[3][0], cur);
    s += '<rect x="' + L0 + '" y="' + T0 + '" width="' + (x1 - L0) + '" height="' + (H - B0 - T0) + '" fill="rgba(29,94,168,.07)"/>';
    s += '<rect x="' + x2 + '" y="' + T0 + '" width="' + (x3 - x2) + '" height="' + (H - B0 - T0) + '" fill="rgba(192,57,43,.07)"/>';
    s += '<text x="' + (L0 + 6) + '" y="' + (T0 - 10) + '" font-size="13" font-weight="800" fill="var(--start)">Start Ramp</text>';
    s += '<text x="' + Math.min(W - 130, x2 + 6) + '" y="' + (T0 - 10) + '" font-size="13" font-weight="800" fill="var(--stop)">Stop(End) Ramp</text>';
    // 축
    s += '<line x1="' + L0 + '" y1="' + (H - B0) + '" x2="' + (W - R0) + '" y2="' + (H - B0) + '" stroke="#56616f"/><line x1="' + L0 + '" y1="' + T0 + '" x2="' + L0 + '" y2="' + (H - B0) + '" stroke="#56616f"/>';
    [0, 50, 100].forEach(function (p) { var v = prof.amp * p / 100; s += '<text x="' + (L0 - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="11" fill="#56616f">' + L.round(v, 1) + '</text><line x1="' + L0 + '" x2="' + (W - R0) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#e1e6ec"/>'; });
    s += '<text x="12" y="' + (T0 + 4) + '" font-size="11" fill="#56616f" transform="rotate(-90 12 ' + (T0 + 60) + ')">Current(%)</text>';
    var ticks = o.norm ? [0, 0.25, 0.5, 0.75, 1] : niceTicks(tMax);
    ticks.forEach(function (tt) { var x = o.norm ? L0 + (W - L0 - R0) * tt : X(tt, cur); s += '<text x="' + x + '" y="' + (H - B0 + 15) + '" text-anchor="middle" font-size="11" fill="#56616f">' + (o.norm ? tt : L.round(tt, 2)) + '</text>'; });
    s += '<text x="' + ((W + L0) / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="#56616f">' + (o.norm ? 'Normalized Transition Phase (0~1)' : 'Time (s)') + '</text>';
    // 선 — 비교선 먼저, 현재값을 맨 위에
    o.lines.slice().reverse().forEach(function (ln) {
      if (!L.isNum(ln.start) || !L.isNum(ln.stop)) return;
      var st = STYLE[ln.style], pts = L.profilePoints(ln.start, ln.stop, prof);
      s += '<polyline fill="none" stroke="' + st.color + '" stroke-width="' + st.w + '" stroke-dasharray="' + st.dash + '" points="' + pts.map(function (p) { return X(p[0], ln).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') + '"><title>' + esc(st.label) + '</title></polyline>';
    });
    // 기울기 숫자(%/s)를 선분 위에
    s += '<text x="' + ((L0 + x1) / 2 + 8) + '" y="' + ((Y(0) + Y(prof.amp)) / 2) + '" font-size="14" font-weight="800" fill="var(--start)">' + L.round(cur.start, 2) + ' %/s</text>';
    s += '<text x="' + ((x2 + x3) / 2 + 8) + '" y="' + ((Y(0) + Y(prof.amp)) / 2) + '" font-size="14" font-weight="800" fill="var(--stop)">' + L.round(cur.stop, 2) + ' %/s</text>';
    // 드래그 핸들 (Time 축에서만)
    if (!o.norm) {
      s += '<g class="handle" data-h="start" tabindex="0" role="slider" aria-label="Start Ramp 핸들 — 좌우로 끌거나 화살표 키" aria-valuenow="' + cur.start + '"><circle cx="' + x1 + '" cy="' + Y(prof.amp) + '" r="11" fill="var(--start)" stroke="#fff" stroke-width="2"/></g>';
      s += '<g class="handle" data-h="stop" tabindex="0" role="slider" aria-label="Stop(End) Ramp 핸들 — 좌우로 끌거나 화살표 키" aria-valuenow="' + cur.stop + '"><circle cx="' + x3 + '" cy="' + Y(0) + '" r="11" fill="var(--stop)" stroke="#fff" stroke-width="2"/></g>';
    }
    s += '</svg>';
    return { svg: s, geo: { W: W, L0: L0, R0: R0, tMax: tMax, curEnd: curEnd, x1: x1, x2: x2 } };
  }
  function niceTicks(max) {
    var raw = max / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    var st = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p, out = [];
    for (var v = 0; v <= max + 1e-9; v += st) out.push(L.round(v, 4));
    return out;
  }
  function legendItem(style) {
    var st = STYLE[style];
    return '<svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="34" y2="5" stroke="' + st.color + '" stroke-width="' + st.w + '" stroke-dasharray="' + st.dash + '"/></svg>' + esc(st.label);
  }

  root.CRCharts = { drawTracks: drawTracks, armSvg: armSvg, rampSvg: rampSvg, legendItem: legendItem, STYLE: STYLE, esc: esc, fmt: fmt };
})(window);
