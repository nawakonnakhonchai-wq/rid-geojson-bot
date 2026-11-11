/* Dashboard ระดับน้ำ - อ่าน rid_realtime.geojson (ล่าสุด) และ data/history.json (ย้อนหลังรายวัน) */
(() => {
  "use strict";

  const STATUS = [
    { key: "flood", label: "ล้นตลิ่ง", test: p => p > 100, css: "--s-flood" },
    { key: "high", label: "น้ำมาก", test: p => p > 70, css: "--s-high" },
    { key: "normal", label: "ปกติ", test: p => p > 30, css: "--s-normal" },
    { key: "low", label: "น้ำน้อย", test: () => true, css: "--s-low" },
  ];
  const NA = { key: "na", label: "ไม่มีข้อมูล", css: "--s-na" };
  const statusOf = p => (p == null || isNaN(p)) ? NA : STATUS.find(s => s.test(p));
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const color = s => cssVar(s.css);

  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const SVG = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs = {}) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const fmt = (v, d = 2) => (v == null || isNaN(v)) ? "–" : Number(v).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const thDate = iso => new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

  let stations = [];       // ข้อมูลล่าสุด
  let history = null;      // {dates, stations}
  let filtered = [];
  let selected = null;
  let markers = new Map();
  let map, layer;
  let sortKey = "pct", sortAsc = false, shown = 50;

  /* ---------- tooltip ---------- */
  const tip = $("tip");
  function showTip(evt, title, rows) {
    tip.replaceChildren(el("div", { class: "t" }, title));
    for (const r of rows) {
      const row = el("div", { class: "r" });
      const lab = el("span");
      if (r.color) { const k = el("i", { class: "k" }); k.style.background = r.color; lab.append(k); }
      lab.append(document.createTextNode(r.label));
      row.append(lab, el("b", {}, r.value));
      tip.append(row);
    }
    tip.hidden = false;
    const x = Math.min(evt.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.min(evt.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  /* ---------- load ---------- */
  async function load() {
    const bust = "?t=" + Math.floor(Date.now() / 300000); // cache 5 นาที
    const gj = await fetch("rid_realtime.geojson" + bust).then(r => r.json());
    stations = gj.features.map(f => {
      const p = f.properties;
      return {
        code: p["รหัสสถานี"], name: p["ชื่อสถานี"] || "", prov: p["จังหวัด"] || "",
        wl: num(p["ระดับน้ำปัจจุบัน (ม.รทก.)"]), pct: num(p["ระดับน้ำเทียบตลิ่ง (%)"]),
        diff: num(p["ระยะจากตลิ่ง (ม.)"]), trend: p["แนวโน้มระดับน้ำ"] || "",
        q: num(p["อัตราการไหล (ลบ.ม./วิ)"]), qTrend: p["แนวโน้มอัตราการไหล"] || "",
        lat: num(p["Latitude"]), lon: num(p["Longitude"]),
        time: p["เวลาบันทึกข้อมูล (UTC)"] ? new Date(p["เวลาบันทึกข้อมูล (UTC)"]) : null,
      };
    });
    const latest = stations.reduce((m, s) => (s.time && s.time > m ? s.time : m), new Date(0));
    $("updated").textContent = "ข้อมูลล่าสุด " + latest.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) + " น.";

    const provs = [...new Set(stations.map(s => s.prov).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    for (const p of provs) $("fProv").append(el("option", { value: p }, p));
    for (const s of [...STATUS, NA]) $("fStatus").append(el("option", { value: s.key }, s.label));

    initMap();
    legend($("mapLegend"), [...STATUS, NA], "dot");
    legend($("trendLegend"), STATUS, "dot");
    apply();

    fetch("data/history.json" + bust).then(r => r.json()).then(h => {
      history = h;
      renderTrend();
      if (selected) renderDetail(selected);
    }).catch(() => { $("trendChart").textContent = "โหลดข้อมูลย้อนหลังไม่สำเร็จ"; });
  }

  function legend(box, list, kind) {
    box.replaceChildren();
    for (const s of list) {
      const sp = el("span"); const d = el("i", { class: kind });
      d.style.background = color(s); sp.append(d, document.createTextNode(s.label)); box.append(sp);
    }
  }

  /* ---------- filtering ---------- */
  function apply() {
    const prov = $("fProv").value, st = $("fStatus").value, tr = $("fTrend").value;
    const q = $("fSearch").value.trim().toLowerCase();
    filtered = stations.filter(s =>
      (!prov || s.prov === prov) && (!st || statusOf(s.pct).key === st) && (!tr || s.trend === tr) &&
      (!q || s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q)));
    shown = 50;
    renderKpis(); renderMap(); renderTable();
    if (history) renderTrend();
  }

  function renderKpis() {
    const box = $("kpis"); box.replaceChildren();
    const count = k => filtered.filter(s => statusOf(s.pct).key === k).length;
    const tile = (label, val, note, dot) => {
      const t = el("div", { class: "kpi" }); const l = el("div", { class: "lab" });
      if (dot) { const d = el("i", { class: "dot" }); d.style.background = dot; l.append(d); }
      l.append(document.createTextNode(label));
      t.append(l, el("div", { class: "val" }, val.toLocaleString("th-TH")));
      if (note) t.append(el("div", { class: "note" }, note));
      box.append(t);
    };
    const n = filtered.length;
    tile("สถานีทั้งหมด", n, `มีค่า % ตลิ่ง ${filtered.filter(s => s.pct != null).length} สถานี`);
    for (const s of STATUS) {
      const c = count(s.key);
      tile(s.label, c, n ? `${Math.round(c / n * 100)}% ของสถานี` : "", color(s));
    }
    tile("ระดับน้ำเพิ่มขึ้น", filtered.filter(s => s.trend === "เพิ่มขึ้น").length, "แนวโน้มชั่วโมงล่าสุด");
  }

  /* ---------- map ---------- */
  function initMap() {
    if (typeof L === "undefined") { $("map").textContent = "โหลดแผนที่ไม่สำเร็จ"; return; }
    map = L.map("map", { preferCanvas: true }).setView([13.5, 101], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, attribution: "© OpenStreetMap",
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  function renderMap() {
    if (!map) return;
    layer.clearLayers(); markers.clear();
    const surface = cssVar("--surface");
    // วาดสถานะรุนแรงทีหลังให้อยู่ด้านบน
    const order = s => ["na", "low", "normal", "high", "flood"].indexOf(statusOf(s.pct).key);
    const pts = filtered.filter(s => s.lat != null && s.lon != null).sort((a, b) => order(a) - order(b));
    for (const s of pts) {
      const st = statusOf(s.pct);
      const m = L.circleMarker([s.lat, s.lon], {
        radius: st.key === "flood" ? 7 : 5, color: surface, weight: 1.5,
        fillColor: color(st), fillOpacity: 1,
      }).addTo(layer);
      m.bindTooltip(() => {
        const d = el("div");
        d.append(el("b", {}, s.name), el("br"), document.createTextNode(`${s.prov} · ${fmt(s.pct, 1)}% · ${s.trend}`));
        return d;
      });
      m.on("click", () => select(s, false));
      markers.set(s.code, m);
    }
    $("mapCount").textContent = `${pts.length.toLocaleString("th-TH")} จุด`;
    if (pts.length && $("fProv").value) map.fitBounds(L.latLngBounds(pts.map(s => [s.lat, s.lon])), { padding: [20, 20], maxZoom: 11 });
  }

  /* ---------- table ---------- */
  function renderTable() {
    const rows = [...filtered].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x == null) return 1; if (y == null) return -1;
      const c = typeof x === "string" ? x.localeCompare(y, "th") : x - y;
      return sortAsc ? c : -c;
    });
    const tb = document.querySelector("#tbl tbody"); tb.replaceChildren();
    for (const s of rows.slice(0, shown)) {
      const tr = el("tr");
      if (selected && selected.code === s.code) tr.classList.add("sel");
      const st = statusOf(s.pct);
      const pctTd = el("td", { class: "num" });
      const d = el("i", { class: "dot", title: st.label }); d.style.background = color(st); d.style.marginRight = "6px";
      pctTd.append(d, document.createTextNode(fmt(s.pct, 1)));
      tr.append(el("td", {}, s.code), el("td", {}, s.name), el("td", {}, s.prov), pctTd,
        el("td", { class: "num" }, fmt(s.wl)), el("td", { class: "num" }, fmt(s.diff)), el("td", {}, s.trend));
      tr.addEventListener("click", () => select(s, true));
      tb.append(tr);
    }
    $("tableCount").textContent = `แสดง ${Math.min(shown, rows.length).toLocaleString("th-TH")} จาก ${rows.length.toLocaleString("th-TH")}`;
    $("moreBtn").hidden = shown >= rows.length;
    document.querySelectorAll("#tbl th").forEach(th => {
      th.classList.toggle("sorted", th.dataset.k === sortKey);
      th.classList.toggle("asc", th.dataset.k === sortKey && sortAsc);
    });
  }

  /* ---------- detail ---------- */
  function select(s, fly) {
    selected = s;
    renderDetail(s);
    renderTable();
    if (fly && map && s.lat != null) {
      map.setView([s.lat, s.lon], Math.max(map.getZoom(), 10));
      const m = markers.get(s.code); if (m) m.openTooltip();
    }
    if (window.innerWidth < 860) $("detail").scrollIntoView({ behavior: "smooth" });
  }

  function renderDetail(s) {
    $("dTitle").textContent = `${s.name} (${s.code})`;
    const body = $("dBody"); body.replaceChildren(); body.classList.remove("muted");
    const st = statusOf(s.pct);
    const badge = el("span", { class: "badge" }); const d = el("i", { class: "dot" }); d.style.background = color(st);
    badge.append(d, document.createTextNode(st.label));
    const head = el("p", { class: "muted" }, s.prov + " · ");
    head.append(badge);
    body.append(head);

    const stats = el("div", { class: "stats" });
    const stat = (lab, val) => { const x = el("div", {}, lab); x.prepend(el("b", {}, val)); stats.append(x); };
    stat("% เทียบตลิ่ง", fmt(s.pct, 1) + "%");
    stat("ระดับน้ำ (ม.รทก.)", fmt(s.wl));
    stat("ห่างจากตลิ่ง (ม.)", fmt(s.diff));
    stat("แนวโน้ม", s.trend || "–");
    if (s.q != null) stat("อัตราการไหล (ลบ.ม./วิ)", fmt(s.q, 1));
    if (s.time) stat("เวลาตรวจวัด", s.time.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }));
    body.append(stats);

    body.append(el("h2", { style: "margin-bottom:8px" }, "% ระดับน้ำเทียบตลิ่ง ย้อนหลังรายวัน"));
    const box = el("div", { class: "chart" }); body.append(box);
    if (!history) { box.textContent = "กำลังโหลดข้อมูลย้อนหลัง…"; return; }
    const h = history.stations[s.code];
    if (!h || !h.pct.some(v => v != null)) { box.textContent = "ไม่มีข้อมูลย้อนหลังของสถานีนี้"; return; }
    lineChart(box, history.dates, h);
  }

  /* ---------- charts ---------- */
  let W = 640; const PAD = { l: 40, r: 12, t: 12, b: 26 };

  function xTicks(dates, x, g, H) {
    let lastM = "", lastX = -1e9;
    dates.forEach((d, i) => {
      const m = d.slice(0, 7);
      if (m !== lastM) {
        lastM = m;
        if (x(i) > W - PAD.r - 20 || x(i) - lastX < 36) return;
        lastX = x(i);
        const t = sv("text", { x: x(i), y: H - 8, "text-anchor": "start" });
        t.textContent = new Date(d + "T00:00:00").toLocaleDateString("th-TH", { month: "short" });
        g.append(t);
      }
    });
  }
  function yAxis(g, y, ticks, H, suffix = "") {
    for (const v of ticks) {
      g.append(sv("line", { class: v === ticks[0] ? "baseline" : "gridline", x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v) }));
      const t = sv("text", { x: PAD.l - 6, y: y(v) + 4, "text-anchor": "end" }); t.textContent = v + suffix; g.append(t);
    }
  }
  function niceTicks(lo, hi, n = 4) {
    const step0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= step0);
    const out = [], end = Math.ceil(hi / step) * step; for (let v = Math.floor(lo / step) * step; v <= end + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function crosshair(svg, dates, x, H, onMove) {
    const line = sv("line", { class: "xhair", y1: PAD.t, y2: H - PAD.b, visibility: "hidden" });
    const hit = sv("rect", { x: PAD.l, y: 0, width: W - PAD.l - PAD.r, height: H, fill: "transparent" });
    svg.append(line, hit);
    const move = evt => {
      const r = svg.getBoundingClientRect();
      const px = (evt.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(dates.length - 1, Math.round((px - PAD.l) / ((W - PAD.l - PAD.r) / Math.max(1, dates.length - 1)))));
      line.setAttribute("x1", x(i)); line.setAttribute("x2", x(i)); line.setAttribute("visibility", "visible");
      onMove(evt, i);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => { line.setAttribute("visibility", "hidden"); hideTip(); onMove(null); });
  }

  function lineChart(box, dates, h) {
    W = Math.max(280, box.clientWidth || 640);
    const H = 240;
    const vals = h.pct.filter(v => v != null);
    const lo = Math.min(0, ...vals), hi = Math.max(110, ...vals);
    const ticks = niceTicks(lo, hi);
    const x = i => PAD.l + i * (W - PAD.l - PAD.r) / Math.max(1, dates.length - 1);
    const y = v => H - PAD.b - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]) * (H - PAD.t - PAD.b);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "กราฟ % ระดับน้ำเทียบตลิ่งย้อนหลัง" });
    const g = sv("g"); svg.append(g);
    yAxis(g, y, ticks, H, "%");
    xTicks(dates, x, g, H);
    // เส้นตลิ่ง 100%
    g.append(sv("line", { x1: PAD.l, x2: W - PAD.r, y1: y(100), y2: y(100), stroke: cssVar("--s-flood"), "stroke-width": 1, "stroke-dasharray": "4 3" }));
    const bl = sv("text", { x: PAD.l + 4, y: y(100) - 4, "text-anchor": "start" }); bl.textContent = "ตลิ่ง 100%"; g.append(bl);
    // เส้นข้อมูล (ขาดช่วงเมื่อไม่มีค่า)
    let d = "", pen = false;
    h.pct.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); pen = true; });
    const accent = cssVar("--accent");
    g.append(sv("path", { d, fill: "none", stroke: accent, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const dot = sv("circle", { r: 4, fill: accent, stroke: cssVar("--surface"), "stroke-width": 2, visibility: "hidden" });
    // ค่าล่าสุด
    const li = h.pct.map((v, i) => v == null ? -1 : i).filter(i => i >= 0).pop();
    g.append(sv("circle", { cx: x(li), cy: y(h.pct[li]), r: 4, fill: accent, stroke: cssVar("--surface"), "stroke-width": 2 }));
    svg.append(dot);
    crosshair(svg, dates, x, H, (evt, i) => {
      if (!evt) { dot.setAttribute("visibility", "hidden"); return; }
      const v = h.pct[i];
      if (v != null) { dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(v)); dot.setAttribute("visibility", "visible"); }
      else dot.setAttribute("visibility", "hidden");
      showTip(evt, thDate(dates[i]), [
        { label: "% ตลิ่ง", value: v == null ? "ไม่มีข้อมูล" : fmt(v, 1) + "%", color: accent },
        { label: "ระดับน้ำ", value: h.wl[i] == null ? "–" : fmt(h.wl[i]) + " ม.รทก." },
      ]);
    });
    box.replaceChildren(svg);
  }

  function renderTrend() {
    const box = $("trendChart");
    const codes = new Set(filtered.map(s => s.code));
    const series = STATUS.map(() => new Array(history.dates.length).fill(0));
    for (const [code, h] of Object.entries(history.stations)) {
      if (!codes.has(code)) continue;
      h.pct.forEach((v, i) => {
        if (v == null) return;
        series[STATUS.indexOf(statusOf(v))][i]++;
      });
    }
    $("trendScope").textContent = `${history.dates.length} วัน · ${codes.size.toLocaleString("th-TH")} สถานีตามตัวกรอง`;
    // ซ้อนจากล่าง: น้ำน้อย -> ปกติ -> น้ำมาก -> ล้นตลิ่ง
    const stackOrder = [3, 2, 1, 0];
    W = Math.max(280, box.clientWidth || 640);
    const n = history.dates.length, H = W < 500 ? 220 : 300;
    const totals = history.dates.map((_, i) => series.reduce((a, s) => a + s[i], 0));
    const ticks = niceTicks(0, Math.max(1, ...totals));
    const x = i => PAD.l + i * (W - PAD.l - PAD.r) / Math.max(1, n - 1);
    const y = v => H - PAD.b - v / ticks[ticks.length - 1] * (H - PAD.t - PAD.b);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "กราฟพื้นที่ซ้อน จำนวนสถานีตามสถานะรายวัน" });
    const g = sv("g"); svg.append(g);
    yAxis(g, y, ticks, H);
    xTicks(history.dates, x, g, H);
    const base = new Array(n).fill(0);
    const surface = cssVar("--surface");
    for (const si of stackOrder) {
      const top = base.map((b, i) => b + series[si][i]);
      let d = "M" + top.map((v, i) => x(i).toFixed(1) + " " + y(v).toFixed(1)).join("L");
      d += "L" + base.map((v, i) => [i, v]).reverse().map(([i, v]) => x(i).toFixed(1) + " " + y(v).toFixed(1)).join("L") + "Z";
      g.append(sv("path", { d, fill: color(STATUS[si]), stroke: surface, "stroke-width": 1 }));
      top.forEach((v, i) => { base[i] = v; });
    }
    crosshair(svg, history.dates, x, H, (evt, i) => {
      if (!evt) return;
      showTip(evt, thDate(history.dates[i]), [
        ...STATUS.map((s, si) => ({ label: s.label, value: series[si][i].toLocaleString("th-TH"), color: color(s) })),
        { label: "รวม", value: totals[i].toLocaleString("th-TH") },
      ]);
    });
    box.replaceChildren(svg);
  }

  /* ---------- events ---------- */
  let rz, lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      if (history) renderTrend(); if (selected) renderDetail(selected);
    }, 200);
  });
  ["fProv", "fStatus", "fTrend"].forEach(id => $(id).addEventListener("change", apply));
  let deb; $("fSearch").addEventListener("input", () => { clearTimeout(deb); deb = setTimeout(apply, 200); });
  $("moreBtn").addEventListener("click", () => { shown += 100; renderTable(); });
  document.querySelectorAll("#tbl th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k;
    if (k === sortKey) sortAsc = !sortAsc; else { sortKey = k; sortAsc = typeof stations[0]?.[k] === "string"; }
    renderTable();
  }));
  $("themeBtn").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* ignore */ }
    legend($("mapLegend"), [...STATUS, NA], "dot"); legend($("trendLegend"), STATUS, "dot");
    renderKpis(); renderMap(); renderTable(); if (history) renderTrend(); if (selected) renderDetail(selected);
  });
  try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }

  load().catch(err => { $("updated").textContent = "โหลดข้อมูลไม่สำเร็จ: " + err.message; });
})();
