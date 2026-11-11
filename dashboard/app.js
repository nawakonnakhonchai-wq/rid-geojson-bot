/* Dashboard สถานการณ์น้ำ
 * - rid_realtime.geojson      : ระดับน้ำสถานีล่าสุด
 * - data/history.json         : % ตลิ่งย้อนหลังรายวัน
 * - data/dams.json            : เขื่อน/อ่างเก็บน้ำ ค่าล่าสุดที่ใช้ได้
 * - data/dam_history.json     : % ความจุย้อนหลังรายวัน
 */
(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style") e.style.cssText = v; else e.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) e.append(k);
    return e;
  };
  const SVG = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs = {}) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const color = s => cssVar(s.css);
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const fmt = (v, d = 2) => (v == null || isNaN(v)) ? "–" : Number(v).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
  const nf = v => Number(v).toLocaleString("th-TH");
  const thDate = iso => new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  const thDateLong = iso => new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };
  const dotEl = c => { const d = el("i", { class: "dot" }); d.style.background = c; return d; };
  const sortRows = (rows, key, asc) => [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null) return 1; if (y == null) return -1;
    const c = typeof x === "string" ? x.localeCompare(y, "th") : x - y;
    return asc ? c : -c;
  });

  const NA = { key: "na", label: "ไม่มีข้อมูล", css: "--s-na" };
  const mkStatus = (top, high, mid) => [
    { key: "flood", label: top, test: p => p > 100, css: "--s-flood" },
    { key: "high", label: "น้ำมาก", test: p => p > high, css: "--s-high" },
    { key: "normal", label: "ปกติ", test: p => p > mid, css: "--s-normal" },
    { key: "low", label: "น้ำน้อย", test: () => true, css: "--s-low" },
  ];
  const ST = mkStatus("ล้นตลิ่ง", 70, 30);       // สถานีวัดน้ำ (% ตลิ่ง)
  const DST = mkStatus("เกินเก็บกักปกติ", 80, 30); // เขื่อน (% ของระดับเก็บกักปกติ)
  const statusIn = list => p => (p == null || isNaN(p)) ? NA : list.find(s => s.test(p));
  const stStatus = statusIn(ST), dStatus = statusIn(DST);

  const ICON = {
    station: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M8 7h4M8 11h4M8 15h4"/><path d="M3 18c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    drop: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/></svg>',
    in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M12 6l6 6-6 6"/></svg>',
  };
  const svgIcon = key => { const t = document.createElement("template"); t.innerHTML = ICON[key]; return t.content.firstChild; };

  /* ---------- tooltip ---------- */
  const tip = $("tip");
  function showTip(evt, title, rows) {
    tip.replaceChildren(el("div", { class: "t" }, title));
    for (const r of rows) {
      const lab = el("span");
      if (r.color) { const k = el("i", { class: "k" }); k.style.background = r.color; lab.append(k); }
      lab.append(r.label);
      tip.append(el("div", { class: "r" }, lab, el("b", {}, r.value)));
    }
    tip.hidden = false;
    tip.style.left = Math.min(evt.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = Math.min(evt.clientY + 14, innerHeight - tip.offsetHeight - 8) + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  /* ---------- maps ---------- */
  const maps = [];
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
  function makeMap(id) {
    if (typeof L === "undefined") { $(id).replaceChildren(el("div", { class: "msg" }, "โหลดแผนที่ไม่สำเร็จ")); return null; }
    const m = L.map(id, { scrollWheelZoom: false, zoomSnap: 0.5, preferCanvas: true }).setView([13.2, 100.9], 6);
    m._tiles = []; maps.push(m); setTiles(m); riverLayer(m);
    return m;
  }
  function setTiles(m) {
    const tone = document.documentElement.dataset.theme === "light" ? "Light" : "Dark";
    m._tiles.forEach(t => t.remove());
    const opt = { maxZoom: 16, maxNativeZoom: 16 };
    m._tiles = [
      L.tileLayer(`${ESRI}World_${tone}_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
        ...opt, attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | ข้อมูล: กรมชลประทาน',
      }),
      L.tileLayer(`${ESRI}World_${tone}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { ...opt, pane: "overlayPane" }),
    ];
    m._tiles.forEach(t => t.addTo(m));
    m._tiles[1].bringToBack();
  }
  function legend(box, list) {
    box.replaceChildren(...list.map(s => el("span", {}, dotEl(color(s)), s.label)));
    if (RIV.data) {
      const k = el("i", { class: "rk" }); k.style.background = cssVar("--blue");
      box.append(el("span", { class: "riv-key" + (RIV.on ? "" : " off") }, k, "แม่น้ำสายหลัก"));
    }
  }

  /* ---------- ชั้นเส้นทางแม่น้ำ ---------- */
  const RIV = { data: null, on: store.get("rid-rivers") !== "0" };
  function riverLayer(m) {
    if (!RIV.data || !m) return;
    if (!m.getPane("rivers")) m.createPane("rivers").style.zIndex = 390;
    if (m._riv) m._riv.remove();
    const blue = cssVar("--blue");
    const base = f => ({ color: blue, weight: (f.properties.length_km || 0) >= 300 ? 2.6 : 1.6, opacity: .8, lineCap: "round" });
    m._riv = L.geoJSON(RIV.data, {
      pane: "rivers", renderer: L.svg({ pane: "rivers", padding: 0.5 }),
      filter: f => !!f.geometry, style: base,
      onEachFeature: (f, lyr) => {
        const p = f.properties;
        lyr.bindTooltip(() => el("div", {}, el("b", {}, p.name), el("br"),
          `ยาว ${fmt(p.length_km, 0)} กม. · ไหลผ่าน ${p.n_prov} จังหวัด`, el("br"),
          el("span", { style: "color:var(--muted)" }, p.provinces)), { sticky: true });
        lyr.on("mouseover", () => lyr.setStyle({ weight: base(f).weight + 2.5, opacity: 1 }));
        lyr.on("mouseout", () => lyr.setStyle(base(f)));
      },
    });
    if (RIV.on) m._riv.addTo(m);
  }
  function setRivers(on) {
    RIV.on = on; store.set("rid-rivers", on ? "1" : "0");
    document.querySelectorAll("[data-rivers]").forEach(b => b.classList.toggle("on", on));
    document.querySelectorAll(".riv-key").forEach(k => k.classList.toggle("off", !on));
    maps.forEach(m => { if (m._riv) on ? m._riv.addTo(m) : m._riv.remove(); });
  }
  async function loadRivers(bust) {
    try {
      const gj = await fetch("data/rivers.geojson" + bust).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
      RIV.data = gj;
      document.querySelectorAll("[data-rivers]").forEach(b => { b.hidden = false; b.classList.toggle("on", RIV.on); });
      maps.forEach(riverLayer);
      if (S.all.length) legend($("mapLegend"), [...ST, NA]);
      if (D.all.length) legend($("damLegend"), [...DST, NA]);
    } catch (e) { /* ยังไม่มีไฟล์แม่น้ำ */ }
  }

  /* ---------- gauge (ภาพถังน้ำในการ์ดหลัก) ---------- */
  function gauge(pct, st, refLabel) {
    const W = 150, H = 140, top = 14, bot = H - 6, max = 125;
    const y = v => bot - Math.max(0, Math.min(max, v)) / max * (bot - top);
    const s = sv("svg", { class: "gauge", viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
    const clipId = "gc" + Math.random().toString(36).slice(2, 8);
    const defs = sv("defs"); const cp = sv("clipPath", { id: clipId });
    cp.append(sv("rect", { x: 22, y: top, width: 76, height: bot - top, rx: 16 })); defs.append(cp); s.append(defs);
    s.append(sv("rect", { x: 22, y: top, width: 76, height: bot - top, rx: 16, fill: cssVar("--tile") }));
    const g = sv("g", { "clip-path": `url(#${clipId})` });
    if (pct != null) {
      const wy = y(pct), c = color(st);
      g.append(sv("path", { d: `M22 ${wy} q9.5 -5 19 0 t19 0 t19 0 t19 0 V${bot} H22 Z`, fill: c, opacity: ".9" }));
      g.append(sv("path", { d: `M22 ${wy + 6} q9.5 5 19 0 t19 0 t19 0 t19 0 V${bot} H22 Z`, fill: c, opacity: ".55" }));
    }
    s.append(g);
    s.append(sv("rect", { x: 22, y: top, width: 76, height: bot - top, rx: 16, fill: "none", stroke: cssVar("--line"), "stroke-width": 2 }));
    const y100 = y(100);
    s.append(sv("line", { x1: 16, x2: 100, y1: y100, y2: y100, stroke: cssVar("--text"), "stroke-width": 1.5, "stroke-dasharray": "4 3", opacity: ".7" }));
    const t = sv("text", { x: 104, y: y100 + 4, "font-size": 11, fill: cssVar("--muted") }); t.textContent = refLabel;
    s.append(t);
    return s;
  }

  /* ---------- charts ---------- */
  const PAD = { l: 40, r: 12, t: 14, b: 26 };
  function niceTicks(lo, hi, n = 4) {
    const step0 = (hi - lo) / n || 1, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= step0);
    const out = [], end = Math.ceil(hi / step) * step;
    for (let v = Math.floor(lo / step) * step; v <= end + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function frame(box, dates, ticks, H, suffix = "") {
    const W = Math.max(280, box.clientWidth || 640);
    const x = i => PAD.l + i * (W - PAD.l - PAD.r) / Math.max(1, dates.length - 1);
    const y = v => H - PAD.b - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]) * (H - PAD.t - PAD.b);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
    for (const v of ticks) {
      svg.append(sv("line", { class: v === ticks[0] ? "baseline" : "gridline", x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v) }));
      const t = sv("text", { x: PAD.l - 6, y: y(v) + 4, "text-anchor": "end" }); t.textContent = nf(v) + suffix; svg.append(t);
    }
    let lastM = "", lastX = -1e9;
    dates.forEach((d, i) => {
      const m = d.slice(0, 7);
      if (m === lastM) return;
      lastM = m;
      if (x(i) > W - PAD.r - 20 || x(i) - lastX < 36) return;
      lastX = x(i);
      const t = sv("text", { x: x(i), y: H - 8 });
      t.textContent = new Date(d + "T00:00:00").toLocaleDateString("th-TH", { month: "short" });
      svg.append(t);
    });
    return { svg, W, x, y };
  }
  function crosshair(f, dates, H, onMove) {
    const { svg, W, x } = f;
    const line = sv("line", { class: "xhair", y1: PAD.t, y2: H - PAD.b, visibility: "hidden" });
    const hit = sv("rect", { x: PAD.l, y: 0, width: W - PAD.l - PAD.r, height: H, fill: "transparent" });
    svg.append(line, hit);
    const step = (W - PAD.l - PAD.r) / Math.max(1, dates.length - 1);
    hit.addEventListener("pointermove", evt => {
      const r = svg.getBoundingClientRect();
      const px = (evt.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(dates.length - 1, Math.round((px - PAD.l) / step)));
      line.setAttribute("x1", x(i)); line.setAttribute("x2", x(i)); line.setAttribute("visibility", "visible");
      onMove(evt, i);
    });
    hit.addEventListener("pointerleave", () => { line.setAttribute("visibility", "hidden"); hideTip(); onMove(null); });
  }

  // กราฟเส้น % ย้อนหลัง พร้อมเส้นอ้างอิง 100%
  function lineChart(box, dates, vals, { refLabel, aria, rows }) {
    const H = 260;
    const v = vals.filter(a => a != null);
    const f = frame(box, dates, niceTicks(Math.min(0, ...v), Math.max(110, ...v)), H, "%");
    const { svg, W, x, y } = f;
    svg.setAttribute("aria-label", aria);
    const accent = cssVar("--blue");
    // พื้นที่ใต้เส้น
    const gid = "ga" + Math.random().toString(36).slice(2, 8);
    const defs = sv("defs"), lg = sv("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.append(sv("stop", { offset: 0, "stop-color": accent, "stop-opacity": ".35" }), sv("stop", { offset: 1, "stop-color": accent, "stop-opacity": "0" }));
    defs.append(lg); svg.prepend(defs);
    let d = "", area = "", seg = [];
    const flush = () => {
      if (seg.length > 1) area += `M${x(seg[0])} ${y(0)}` + seg.map(i => `L${x(i).toFixed(1)} ${y(vals[i]).toFixed(1)}`).join("") + `L${x(seg[seg.length - 1])} ${y(0)}Z`;
      seg = [];
    };
    vals.forEach((val, i) => {
      if (val == null) { flush(); return; }
      d += (seg.length ? "L" : "M") + x(i).toFixed(1) + " " + y(val).toFixed(1); seg.push(i);
    });
    flush();
    svg.append(sv("path", { d: area, fill: `url(#${gid})` }));
    svg.append(sv("line", { x1: PAD.l, x2: W - PAD.r, y1: y(100), y2: y(100), stroke: cssVar("--s-flood"), "stroke-width": 1, "stroke-dasharray": "4 3" }));
    const bl = sv("text", { x: PAD.l + 4, y: y(100) - 5 }); bl.textContent = refLabel; svg.append(bl);
    svg.append(sv("path", { d, fill: "none", stroke: accent, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const li = vals.map((a, i) => a == null ? -1 : i).filter(i => i >= 0).pop();
    const surface = cssVar("--card");
    svg.append(sv("circle", { cx: x(li), cy: y(vals[li]), r: 4, fill: accent, stroke: surface, "stroke-width": 2 }));
    const dot = sv("circle", { r: 4, fill: accent, stroke: surface, "stroke-width": 2, visibility: "hidden" });
    svg.append(dot);
    crosshair(f, dates, H, (evt, i) => {
      if (!evt) { dot.setAttribute("visibility", "hidden"); return; }
      if (vals[i] != null) { dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(vals[i])); dot.setAttribute("visibility", "visible"); }
      else dot.setAttribute("visibility", "hidden");
      showTip(evt, thDate(dates[i]), rows(i));
    });
    box.replaceChildren(svg);
  }

  /* =================== สถานีวัดน้ำ =================== */
  const S = { all: [], list: [], hist: null, sel: null, map: null, layer: null, markers: new Map(), tSort: "pct", tAsc: false, shown: 50 };

  async function loadStations(bust) {
    const gj = await fetch("rid_realtime.geojson" + bust).then(r => r.json());
    S.all = gj.features.map(f => {
      const p = f.properties;
      return {
        code: p["รหัสสถานี"], name: p["ชื่อสถานี"] || "", prov: p["จังหวัด"] || "",
        wl: num(p["ระดับน้ำปัจจุบัน (ม.รทก.)"]), pct: num(p["ระดับน้ำเทียบตลิ่ง (%)"]),
        diff: num(p["ระยะจากตลิ่ง (ม.)"]), trend: p["แนวโน้มระดับน้ำ"] || "",
        q: num(p["อัตราการไหล (ลบ.ม./วิ)"]),
        lat: num(p["Latitude"]), lon: num(p["Longitude"]),
        time: p["เวลาบันทึกข้อมูล (UTC)"] ? new Date(p["เวลาบันทึกข้อมูล (UTC)"]) : null,
      };
    });
    const latest = S.all.reduce((m, s) => (s.time && s.time > m ? s.time : m), new Date(0));
    $("updated").textContent = "ข้อมูล ณ " + latest.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) + " น.";
    const provs = [...new Set(S.all.map(s => s.prov).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    for (const p of provs) $("fProv").append(el("option", { value: p }, p));
    for (const s of [...ST, NA]) $("fStatus").append(el("option", { value: s.key }, s.label));
    const saved = store.get("rid-prov"); if (saved && provs.includes(saved)) $("fProv").value = saved;
    S.map = makeMap("map");
    if (S.map) S.layer = L.layerGroup().addTo(S.map);
    legend($("mapLegend"), [...ST, NA]);
    legend($("trendLegend"), ST);
    applyStations();
    fetch("data/history.json" + bust).then(r => r.json()).then(h => {
      S.hist = h; renderTrend(); renderHist();
    }).catch(() => { $("trendChart").replaceChildren(el("div", { class: "msg" }, "โหลดข้อมูลย้อนหลังไม่สำเร็จ")); });
  }

  function applyStations() {
    const prov = $("fProv").value, st = $("fStatus").value, tr = $("fTrend").value;
    const q = $("fSearch").value.trim().toLowerCase();
    const base = S.all.filter(s => (!prov || s.prov === prov) && (!st || stStatus(s.pct).key === st) && (!tr || s.trend === tr));
    S.list = base;
    S.tableRows = q ? base.filter(s => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q)) : base;
    S.shown = 50;
    // เลือกสถานีที่ % ตลิ่งสูงสุดเมื่อสถานีเดิมไม่อยู่ในตัวกรอง
    if (!S.sel || !base.includes(S.sel)) S.sel = sortRows(base.filter(s => s.pct != null), "pct", false)[0] || null;
    renderNow(); renderKpis(); renderList(); renderMap(true); renderTable(); renderHist();
    if (S.hist) renderTrend();
  }

  function selectStation(s, opts = {}) {
    S.sel = s;
    renderNow(); renderList(); renderTable(); renderHist();
    if (opts.fly && S.map && s.lat != null) {
      S.map.flyTo([s.lat, s.lon], Math.max(S.map.getZoom(), 10), { duration: .6 });
      const m = S.markers.get(s.code); if (m) setTimeout(() => m.openTooltip(), 650);
    }
    if (opts.top) $("overview").scrollIntoView({ behavior: "smooth" });
  }

  function renderNow() {
    const box = $("nowcard"), s = S.sel;
    if (!s) { box.replaceChildren(el("div", { class: "msg" }, "ไม่มีสถานีตามตัวกรอง")); return; }
    const st = stStatus(s.pct);
    const chip = el("div", { class: "chip" }); chip.append(svgIcon("station"), `${s.prov} · ${s.code}`);
    const badge = el("div", { class: "badge-st" }, dotEl(color(st)), st.label);
    const left = el("div", {},
      el("div", { class: "name" }, s.name),
      el("div", { class: "date" }, s.time ? "ข้อมูลเวลา " + s.time.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) + " น." : ""),
      gauge(s.pct, st, "ตลิ่ง"));
    const big = el("div", { class: "big" }, s.pct == null ? "–" : fmt(s.pct, 1)); big.append(el("small", {}, "%"));
    const right = el("div", { class: "right" }, big, el("div", { class: "sub" }, "ระดับน้ำ " + fmt(s.wl) + " ม.รทก."));
    const diffTxt = s.diff == null ? "–" : s.diff >= 0 ? `สูงกว่าตลิ่ง ${fmt(s.diff)} ม.` : `ต่ำกว่าตลิ่ง ${fmt(-s.diff)} ม.`;
    box.replaceChildren(chip, badge, left, right,
      el("div", { class: "left-bottom" }, s.q != null ? `อัตราการไหล ${fmt(s.q, 1)} ลบ.ม./วิ` : "เทียบกับระดับตลิ่ง"),
      el("div", { class: "desc" }, el("b", {}, "แนวโน้ม" + (s.trend || "–")), el("span", {}, diffTxt)));
  }

  function tile(label, value, unit, sub, dot, wide) {
    const k = el("div", { class: "k" }); if (dot) k.append(dotEl(dot)); k.append(label);
    const v = el("div", { class: "v" }, value); if (unit) v.append(el("small", {}, unit));
    return el("div", { class: "tile" + (wide ? " wide" : "") }, k, v, sub ? el("div", { class: "s" }, sub) : null);
  }
  // ภาพรวม: ตัวเลขรวม → แถบสัดส่วนสถานะ → การ์ดสถานะ (กดเพื่อกรอง) → แนวโน้ม (กดเพื่อกรอง)
  // ตัวเลขแต่ละส่วนไม่นับตัวกรองของตัวเอง เพื่อให้ยังเห็นภาพรวมขณะเลือกกรองอยู่
  function renderKpis() {
    const prov = $("fProv").value, stSel = $("fStatus").value, trSel = $("fTrend").value;
    const inProv = S.all.filter(s => !prov || s.prov === prov);
    const forStatus = inProv.filter(s => !trSel || s.trend === trSel);
    const forTrend = inProv.filter(s => !stSel || stStatus(s.pct).key === stSel);
    const n = forStatus.length;
    const cnt = k => forStatus.filter(s => stStatus(s.pct).key === k).length;
    const pctOf = c => n ? Math.round(c / n * 100) : 0;

    // 1) ตัวเลขรวม
    const head = el("div", { class: "ov-head" },
      el("div", {}, el("div", { class: "ov-big" }, nf(n), el("small", {}, " สถานี")),
        el("div", { class: "muted" }, (prov || "ทั้งประเทศ") + (trSel ? ` · แนวโน้ม${trSel}` : ""))),
      el("div", { class: "ov-side muted" }, `มีค่า % ตลิ่ง ${nf(forStatus.filter(s => s.pct != null).length)} สถานี`));

    // 2) แถบสัดส่วน
    const bar = el("div", { class: "ov-bar", role: "img", "aria-label": ST.map(st => `${st.label} ${cnt(st.key)}`).join(", ") });
    for (const st of [...ST, NA]) {
      const c = cnt(st.key); if (!c) continue;
      const seg = el("i", { class: "seg" + (stSel && stSel !== st.key ? " dim" : "") });
      seg.style.flexGrow = c; seg.style.background = color(st);
      seg.addEventListener("pointermove", e => showTip(e, st.label, [{ label: "จำนวน", value: `${nf(c)} สถานี (${pctOf(c)}%)`, color: color(st) }]));
      seg.addEventListener("pointerleave", hideTip);
      bar.append(seg);
    }

    // 3) การ์ดสถานะ เรียงจากรุนแรง
    const grid = el("div", { class: "ov-grid" });
    for (const st of ST) {
      const c = cnt(st.key);
      const on = stSel === st.key;
      const b = el("button", { type: "button", class: "ov-st" + (on ? " on" : "") + (stSel && !on ? " dim" : ""), "aria-pressed": on ? "true" : "false" });
      b.style.setProperty("--c", color(st));
      b.append(el("div", { class: "lab" }, dotEl(color(st)), st.label),
        el("div", { class: "cnt" }, nf(c)),
        el("div", { class: "pc" }, `${pctOf(c)}%`));
      b.addEventListener("click", () => { $("fStatus").value = on ? "" : st.key; applyStations(); });
      grid.append(b);
    }

    // 4) แนวโน้ม
    const trends = [["เพิ่มขึ้น", "↑", "up"], ["คงที่", "→", "flat"], ["ลดลง", "↓", "down"]];
    const tr = el("div", { class: "ov-trend" }, el("span", { class: "muted" }, "แนวโน้มระดับน้ำ"));
    for (const [t, arrow, cls] of trends) {
      const c = forTrend.filter(s => s.trend === t).length, on = trSel === t;
      const b = el("button", { type: "button", class: `chip-t ${cls}` + (on ? " on" : ""), "aria-pressed": on ? "true" : "false" },
        el("b", {}, arrow), ` ${t} `, el("strong", {}, nf(c)));
      b.addEventListener("click", () => { $("fTrend").value = on ? "" : t; applyStations(); });
      tr.append(b);
    }
    $("kpis").replaceChildren(head, bar, grid, tr);
  }

  function renderList() {
    const k = $("lSort").value;
    let rows = S.list.filter(s => s.pct != null);
    if (k === "pct_desc") rows = sortRows(rows, "pct", false);
    else if (k === "pct_asc") rows = sortRows(rows, "pct", true);
    else if (k === "diff_desc") rows = sortRows(rows.filter(s => s.diff != null), "diff", false);
    else rows = sortRows(rows, "name", true);
    const box = $("plist");
    box.replaceChildren(...rows.slice(0, 40).map(s => {
      const st = stStatus(s.pct);
      const b = el("button", { class: "pitem" + (S.sel === s ? " on" : ""), type: "button" },
        el("div", {}, el("div", { class: "rg" }, s.prov), el("div", { class: "nm" }, s.name),
          el("div", { class: "ds" }, dotEl(color(st)), `${st.label} · ${s.trend}`)),
        el("div", { class: "tp" }, fmt(s.pct, 1) + "%", el("small", {}, s.diff == null ? "" : (s.diff >= 0 ? "+" : "") + fmt(s.diff) + " ม.")));
      b.addEventListener("click", () => selectStation(s, { fly: true, top: innerWidth <= 1180 }));
      return b;
    }));
    if (!rows.length) box.replaceChildren(el("div", { class: "msg" }, "ไม่มีสถานีตามตัวกรอง"));
  }

  function renderMap(fit) {
    if (!S.map) return;
    S.layer.clearLayers(); S.markers.clear();
    const ring = cssVar("--card");
    const order = ["na", "low", "normal", "high", "flood"];
    const pts = S.list.filter(s => s.lat != null && s.lon != null).sort((a, b) => order.indexOf(stStatus(a.pct).key) - order.indexOf(stStatus(b.pct).key));
    for (const s of pts) {
      const st = stStatus(s.pct);
      const m = L.circleMarker([s.lat, s.lon], { radius: st.key === "flood" ? 7 : 5, color: ring, weight: 1.5, fillColor: color(st), fillOpacity: 1 })
        .bindTooltip(() => el("div", {}, el("b", {}, s.name), el("br"), `${s.prov} · ${fmt(s.pct, 1)}% · ${s.trend}`), { direction: "top", offset: [0, -6] })
        .on("click", () => selectStation(s))
        .addTo(S.layer);
      S.markers.set(s.code, m);
    }
    $("mapCount").textContent = `${nf(pts.length)} จุด`;
    if (fit && pts.length) S.map.fitBounds(L.latLngBounds(pts.map(s => [s.lat, s.lon])), { padding: [20, 20], maxZoom: 11 });
  }

  function renderTable() {
    const rows = sortRows(S.tableRows, S.tSort, S.tAsc);
    const tb = document.querySelector("#tbl tbody");
    tb.replaceChildren(...rows.slice(0, S.shown).map(s => {
      const st = stStatus(s.pct);
      const pct = el("td", { class: "num" }, dotEl(color(st)), " " + fmt(s.pct, 1));
      const tr = el("tr", { class: S.sel === s ? "on" : "" },
        el("td", {}, s.code), el("td", {}, s.name), el("td", { class: "hide-sm" }, s.prov), pct,
        el("td", { class: "num hide-sm" }, fmt(s.wl)), el("td", { class: "num" }, fmt(s.diff)),
        el("td", { class: s.trend === "เพิ่มขึ้น" ? "trend-up" : s.trend === "ลดลง" ? "trend-down" : "" }, s.trend));
      tr.addEventListener("click", () => selectStation(s, { fly: true, top: true }));
      return tr;
    }));
    $("tableCount").textContent = `${nf(Math.min(S.shown, rows.length))} / ${nf(rows.length)}`;
    $("moreBtn").hidden = S.shown >= rows.length;
    markSort("#tbl", S.tSort, S.tAsc);
  }
  function markSort(sel, key, asc) {
    document.querySelectorAll(sel + " th").forEach(th => {
      th.classList.toggle("sorted", th.dataset.k === key);
      th.classList.toggle("asc", th.dataset.k === key && asc);
    });
  }

  function renderHist() {
    const box = $("histChart"), s = S.sel;
    $("histName").textContent = s ? s.name : "";
    if (!s) { box.replaceChildren(el("div", { class: "msg" }, "เลือกสถานีเพื่อดูกราฟ")); return; }
    if (!S.hist) { box.replaceChildren(el("div", { class: "msg" }, "กำลังโหลดข้อมูลย้อนหลัง…")); return; }
    const h = S.hist.stations[s.code];
    if (!h || !h.pct.some(v => v != null)) { box.replaceChildren(el("div", { class: "msg" }, "ไม่มีข้อมูลย้อนหลังของสถานีนี้")); return; }
    lineChart(box, S.hist.dates, h.pct, {
      refLabel: "ตลิ่ง 100%", aria: "กราฟ % ระดับน้ำเทียบตลิ่งย้อนหลังของ " + s.name,
      rows: i => [
        { label: "% ตลิ่ง", value: h.pct[i] == null ? "ไม่มีข้อมูล" : fmt(h.pct[i], 1) + "%", color: cssVar("--blue") },
        { label: "ระดับน้ำ", value: h.wl[i] == null ? "–" : fmt(h.wl[i]) + " ม.รทก." },
      ],
    });
  }

  function renderTrend() {
    const box = $("trendChart"), H = (box.clientWidth || 600) < 500 ? 220 : 300;
    const dates = S.hist.dates, codes = new Set(S.list.map(s => s.code));
    const series = ST.map(() => new Array(dates.length).fill(0));
    for (const [code, h] of Object.entries(S.hist.stations)) {
      if (!codes.has(code)) continue;
      h.pct.forEach((v, i) => { if (v != null) series[ST.indexOf(stStatus(v))][i]++; });
    }
    const totals = dates.map((_, i) => series.reduce((a, s) => a + s[i], 0));
    $("trendScope").textContent = `${nf(dates.length)} วัน · ${nf(codes.size)} สถานี`;
    const f = frame(box, dates, niceTicks(0, Math.max(1, ...totals)), H);
    const { svg, x, y } = f;
    svg.setAttribute("aria-label", "กราฟพื้นที่ซ้อน จำนวนสถานีตามสถานะรายวัน");
    const base = new Array(dates.length).fill(0), ring = cssVar("--card");
    for (const si of [3, 2, 1, 0]) {   // ซ้อนจากล่าง: น้ำน้อย → ล้นตลิ่ง
      const top = base.map((b, i) => b + series[si][i]);
      const d = "M" + top.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("L") +
        "L" + base.map((v, i) => [i, v]).reverse().map(([i, v]) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("L") + "Z";
      svg.append(sv("path", { d, fill: color(ST[si]), stroke: ring, "stroke-width": 1 }));
      top.forEach((v, i) => { base[i] = v; });
    }
    crosshair(f, dates, H, (evt, i) => {
      if (!evt) return;
      showTip(evt, thDate(dates[i]), [
        ...ST.map((s, si) => ({ label: s.label, value: nf(series[si][i]), color: color(s) })),
        { label: "รวม", value: nf(totals[i]) },
      ]);
    });
    box.replaceChildren(svg);
  }

  /* =================== เขื่อน / อ่างเก็บน้ำ =================== */
  const D = { all: [], list: [], hist: null, sel: null, map: null, layer: null, markers: new Map(), size: "", tSort: "pct", tAsc: false, shown: 30, latest: "" };

  async function loadDams(bust) {
    const j = await fetch("data/dams.json" + bust).then(r => r.json());
    D.all = Object.entries(j.dams).map(([id, d]) => ({
      id, name: d.name || "", region: d.region || "", large: !!d.large,
      cap: d.cap ?? null, vol: d.vol ?? null, pct: d.pct ?? null, dead: d.dead ?? null, active: d.active ?? null,
      inflow: d.inflow ?? null, outflow: d.outflow ?? null,
      date: d.date || "", lat: d.lat ?? null, lon: d.lon ?? null,
    }));
    // % ของกรมชลฯ เทียบกับ "ระดับเก็บกักปกติ" (= ใช้การได้ + ก้นอ่าง) ไม่ใช่ช่อง capacity
    for (const d of D.all) {
      d.normal = d.pct > 0 && d.vol > 0 ? d.vol * 100 / d.pct
        : d.active ? d.active + (d.dead || 0) : d.cap;
    }
    D.latest = D.all.reduce((m, d) => d.date > m ? d.date : m, "");
    $("damUpdated").textContent = D.latest ? "ข้อมูลล่าสุดวันที่ " + thDate(D.latest) : "";
    const regions = [...new Set(D.all.map(d => d.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    for (const r of regions) $("dRegion").append(el("option", { value: r }, r));
    D.map = makeMap("damMap");
    if (D.map) D.layer = L.layerGroup().addTo(D.map);
    legend($("damLegend"), [...DST, NA]);
    applyDams();
    fetch("data/dam_history.json" + bust).then(r => r.json()).then(h => { D.hist = h; renderDamHist(); }).catch(() => {});
  }

  function applyDams() {
    const r = $("dRegion").value, q = $("dSearch").value.trim().toLowerCase();
    D.list = D.all.filter(d => (!r || d.region === r) && (!D.size || (D.size === "large") === d.large));
    D.tableRows = q ? D.list.filter(d => d.name.toLowerCase().includes(q)) : D.list;
    D.shown = 30;
    if (!D.sel || !D.list.includes(D.sel)) {
      // เริ่มที่เขื่อนใหญ่ที่สุดในกลุ่ม
      D.sel = sortRows(D.list.filter(d => d.pct != null), "cap", false)[0] || null;
    }
    $("damScope").textContent = `${nf(D.list.length)} แห่ง`;
    renderDamNow(); renderDamKpis(); renderDamBars(); renderDamMap(true); renderDamTable(); renderDamHist();
  }

  function selectDam(d, opts = {}) {
    D.sel = d;
    renderDamNow(); renderDamTable(); renderDamHist(); renderDamBars();
    if (opts.fly && D.map && d.lat != null) {
      D.map.flyTo([d.lat, d.lon], Math.max(D.map.getZoom(), 9), { duration: .6 });
      const m = D.markers.get(d.id); if (m) setTimeout(() => m.openTooltip(), 650);
    }
    if (opts.top) $("dams").scrollIntoView({ behavior: "smooth" });
  }

  function renderDamNow() {
    const box = $("damNow"), d = D.sel;
    if (!d) { box.replaceChildren(el("div", { class: "msg" }, "ไม่มีเขื่อนตามตัวกรอง")); return; }
    const st = dStatus(d.pct);
    const chip = el("div", { class: "chip" }); chip.append(svgIcon("drop"), `${d.region} · ${d.large ? "เขื่อนขนาดใหญ่" : "อ่างขนาดกลาง"}`);
    const left = el("div", {},
      el("div", { class: "name" }, d.name),
      el("div", { class: "date" }, d.date ? "ข้อมูล" + thDateLong(d.date) + (d.date < D.latest ? " (ยังไม่อัปเดตวันล่าสุด)" : "") : ""),
      gauge(d.pct, st, "เก็บกัก"));
    const big = el("div", { class: "big" }, d.pct == null ? "–" : fmt(d.pct, 1)); big.append(el("small", {}, "%"));
    const usable = d.vol != null && d.dead != null ? Math.max(0, d.vol - d.dead) : null;
    box.replaceChildren(chip, el("div", { class: "badge-st" }, dotEl(color(st)), st.label), left,
      el("div", { class: "right" }, big, el("div", { class: "sub" }, `${fmt(d.vol, 0)} / ${fmt(d.normal, 0)} ล้าน ลบ.ม.`)),
      el("div", { class: "left-bottom" }, usable != null ? `ใช้การได้ ${fmt(usable, 1)} ล้าน ลบ.ม.` : ""),
      el("div", { class: "desc" }, el("b", {}, `ไหลเข้า ${fmt(d.inflow)} · ระบาย ${fmt(d.outflow)}`), el("span", {}, "ล้าน ลบ.ม. ต่อวัน")));
  }

  function renderDamKpis() {
    const w = D.list.filter(d => d.vol != null && d.normal);
    const vol = w.reduce((a, d) => a + d.vol, 0), cap = w.reduce((a, d) => a + d.normal, 0);
    const inflow = D.list.reduce((a, d) => a + (d.inflow || 0), 0), outflow = D.list.reduce((a, d) => a + (d.outflow || 0), 0);
    const tiles = [
      tile("ปริมาตรน้ำรวม (เทียบเก็บกักปกติ)", cap ? fmt(vol / cap * 100, 0) : "–", "%", `${fmt(vol, 0)} / ${fmt(cap, 0)} ล้าน ลบ.ม.`),
      tile("ไหลเข้า / ระบาย", `${fmt(inflow, 1)} / ${fmt(outflow, 1)}`, "", "ล้าน ลบ.ม. ต่อวัน", null, true),
    ];
    for (const st of DST) {
      const c = D.list.filter(d => dStatus(d.pct).key === st.key).length;
      tiles.push(tile(st.label, nf(c), "แห่ง", `จาก ${nf(D.list.length)} แห่ง`, color(st)));
    }
    tiles.push(tile("ยังไม่อัปเดตวันล่าสุด", nf(D.list.filter(d => d.date && d.date < D.latest).length), "แห่ง", "แสดงค่าล่าสุดที่มี"));
    $("damKpis").replaceChildren(...tiles);
  }

  // รางยาวเท่ากัน = ระดับเก็บกักปกติ (100% ตามที่กรมชลฯ รายงาน), แถบสี = น้ำปัจจุบัน,
  // ส่วนที่เกิน 100% แยกเป็นแถบสีแดงหลังเส้น "เต็ม"
  function renderDamBars() {
    const box = $("damBars");
    const key = $("barSort").value;
    const big = sortRows(D.list.filter(d => d.large && d.pct != null), key, false);
    $("damBarsCard").hidden = D.size === "medium";
    if (!big.length) { box.replaceChildren(el("div", { class: "msg" }, "ไม่มีเขื่อนขนาดใหญ่ตามตัวกรอง")); $("barSummary").replaceChildren(); return; }
    const over = big.filter(d => d.pct > 100);
    const overMax = big.filter(d => d.cap && d.vol > d.cap);
    const short = d => d.name.replace(/^เขื่อน/, "");
    const sum = [];
    if (over.length) {
      sum.push(el("div", { class: "over" }, `▲ ${over.length} เขื่อน มีน้ำเกินระดับเก็บกักปกติ (เกิน 100%): `, el("b", {}, over.map(short).join(", "))));
      sum.push(el("div", { class: "note" }, overMax.length
        ? `⚠ เกินความจุสูงสุดของเขื่อนด้วย: ${overMax.map(short).join(", ")}`
        : "ยังไม่มีเขื่อนใดเกินความจุสูงสุดของเขื่อน (ระดับเก็บกักสูงสุด)"));
    } else sum.push(el("div", {}, "✓ ไม่มีเขื่อนขนาดใหญ่ที่น้ำเกินระดับเก็บกักปกติ"));
    $("barSummary").replaceChildren(...sum);

    const w = Math.max(280, box.clientWidth || 600), wide = w >= 640, rowH = 30, top = 20;
    const labW = Math.min(150, w * 0.3), valW = wide ? 270 : 64;
    const H = top + big.length * rowH + 4, max = Math.max(100, ...big.map(d => d.pct)) * 1.02;
    const x = v => labW + Math.max(0, v) / max * (w - labW - valW);
    const svg = sv("svg", { viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": "ปริมาณน้ำปัจจุบันเทียบระดับเก็บกักปกติ เขื่อนขนาดใหญ่" });
    const text = cssVar("--text"), muted = cssVar("--muted"), track = cssVar("--tile-hover"), line = cssVar("--line"), card = cssVar("--card");
    const red = cssVar("--s-flood");
    const fx = x(100);
    svg.append(sv("line", { x1: fx, x2: fx, y1: top - 4, y2: H, stroke: text, "stroke-width": 1.5, "stroke-dasharray": "4 3", opacity: ".7" }));
    const ft = sv("text", { x: fx, y: 12, "text-anchor": "middle", style: `fill:${text};font-weight:600` }); ft.textContent = "เต็มระดับเก็บกักปกติ 100%"; svg.append(ft);
    big.forEach((d, i) => {
      const y = top + i * rowH, g = sv("g", { tabindex: 0 }), bh = rowH - 14, by = y + 7;
      const isOver = d.pct > 100, c = color(dStatus(d.pct));
      g.append(sv("rect", { class: "hit", x: 0, y, width: w, height: rowH, rx: 8, fill: D.sel === d ? cssVar("--tile") : "transparent" }));
      const lab = sv("text", { x: labW - 8, y: y + rowH / 2 + 4, "text-anchor": "end" }); lab.textContent = short(d); g.append(lab);
      g.append(sv("rect", { x: labW, y: by, width: fx - labW, height: bh, rx: 4, fill: track, stroke: line }));
      g.append(sv("rect", { x: labW, y: by, width: Math.max(2, x(Math.min(d.pct, 100)) - labW), height: bh, rx: 4, fill: c }));
      if (isOver) g.append(sv("rect", { x: fx + 2, y: by - 2, width: Math.max(4, x(d.pct) - fx - 2), height: bh + 4, rx: 3, fill: red, stroke: card, "stroke-width": 1 }));
      const tx = Math.max(fx, x(d.pct)) + 10, ty = y + rowH / 2 + 4;
      const val = sv("text", { x: tx, y: ty, style: `fill:${text};font-weight:700` }); val.textContent = fmt(d.pct, 0) + "%"; g.append(val);
      const diff = Math.abs(d.vol - d.normal);
      if (wide) {
        const note = sv("text", { x: tx + 44, y: ty, style: isOver ? `fill:${red};font-weight:600` : `fill:${muted}` });
        note.textContent = isOver ? `▲ เกินระดับเก็บกักปกติ ${fmt(diff, 0)} ล้าน ลบ.ม.` : `รับน้ำได้อีก ${fmt(diff, 0)} ล้าน ลบ.ม.`;
        g.append(note);
      } else if (isOver) {
        const note = sv("text", { x: tx + 40, y: ty, style: `fill:${red};font-weight:700` }); note.textContent = "▲"; g.append(note);
      }
      const usable = d.dead != null ? Math.max(0, d.vol - d.dead) : null;
      const rows = () => [
        { label: "น้ำปัจจุบัน", value: `${fmt(d.vol, 0)} ล้าน ลบ.ม. (${fmt(d.pct, 1)}%)`, color: c },
        { label: "ระดับเก็บกักปกติ (100%)", value: fmt(d.normal, 0) + " ล้าน ลบ.ม." },
        isOver ? { label: "เกินระดับเก็บกักปกติ", value: fmt(diff, 0) + " ล้าน ลบ.ม.", color: red }
               : { label: "รับน้ำได้อีก", value: fmt(diff, 0) + " ล้าน ลบ.ม." },
        { label: "ความจุสูงสุดของเขื่อน", value: d.cap ? fmt(d.cap, 0) + " ล้าน ลบ.ม." : "–" },
        { label: "น้ำใช้การได้", value: usable == null ? "–" : fmt(usable, 0) + " ล้าน ลบ.ม." },
        { label: "ไหลเข้า / ระบาย", value: `${fmt(d.inflow)} / ${fmt(d.outflow)}` },
      ];
      g.addEventListener("pointermove", e => showTip(e, d.name, rows()));
      g.addEventListener("pointerleave", hideTip);
      g.addEventListener("focus", () => { const r = g.getBoundingClientRect(); showTip({ clientX: r.left + labW, clientY: r.bottom }, d.name, rows()); });
      g.addEventListener("blur", hideTip);
      g.addEventListener("click", () => selectDam(d, { fly: true }));
      g.addEventListener("keydown", e => { if (e.key === "Enter") selectDam(d, { fly: true }); });
      svg.append(g);
    });
    box.replaceChildren(svg);
    const sw = bg => { const i = el("i", { class: "sw" }); i.style.background = bg; return i; };
    const trackSw = sw(track); trackSw.style.outline = `1px solid ${line}`;
    $("barLegend").replaceChildren(
      el("span", {}, trackSw, "ระดับเก็บกักปกติ (เต็ม = 100%)"),
      el("span", {}, sw(color(DST[1])), "น้ำปัจจุบัน (สีตามสถานะ)"),
      el("span", {}, sw(red), "ส่วนที่เกินระดับเก็บกักปกติ"));
  }

  function renderDamMap(fit) {
    if (!D.map) return;
    D.layer.clearLayers(); D.markers.clear();
    const ring = cssVar("--card");
    const pts = D.list.filter(d => d.lat != null).sort((a, b) => (a.large - b.large) || ((a.cap || 0) - (b.cap || 0)));
    for (const d of pts) {
      const st = dStatus(d.pct);
      const m = L.circleMarker([d.lat, d.lon], {
        radius: d.large ? 5 + Math.min(10, Math.sqrt(d.cap || 0) / 12) : 4,
        color: ring, weight: 1.5, fillColor: color(st), fillOpacity: 1,
      }).bindTooltip(() => el("div", {}, el("b", {}, d.name), el("br"), `${fmt(d.pct, 1)}% · ${fmt(d.vol, 1)} ล้าน ลบ.ม.`), { direction: "top", offset: [0, -6] })
        .on("click", () => selectDam(d))
        .addTo(D.layer);
      D.markers.set(d.id, m);
    }
    $("damCount").textContent = `${nf(pts.length)} แห่ง`;
    if (fit && pts.length) D.map.fitBounds(L.latLngBounds(pts.map(d => [d.lat, d.lon])), { padding: [20, 20], maxZoom: 10 });
  }

  function renderDamTable() {
    const rows = sortRows(D.tableRows, D.tSort, D.tAsc);
    const tb = document.querySelector("#damTbl tbody");
    tb.replaceChildren(...rows.slice(0, D.shown).map(d => {
      const st = dStatus(d.pct);
      const tr = el("tr", { class: D.sel === d ? "on" : "" },
        el("td", {}, d.name), el("td", { class: "hide-sm" }, d.region),
        el("td", { class: "num" }, dotEl(color(st)), " " + fmt(d.pct, 1)),
        el("td", { class: "num" }, fmt(d.vol, 1)), el("td", { class: "num hide-sm" }, fmt(d.normal, 1)),
        el("td", { class: "num hide-sm" }, fmt(d.inflow)), el("td", { class: "num hide-sm" }, fmt(d.outflow)),
        el("td", { class: d.date && d.date < D.latest ? "stale" : "" }, d.date ? thDate(d.date) : "–"));
      tr.addEventListener("click", () => selectDam(d, { fly: true, top: true }));
      return tr;
    }));
    $("damTableCount").textContent = `${nf(Math.min(D.shown, rows.length))} / ${nf(rows.length)}`;
    $("damMore").hidden = D.shown >= rows.length;
    markSort("#damTbl", D.tSort, D.tAsc);
  }

  function renderDamHist() {
    const box = $("damChart"), d = D.sel;
    $("damHistName").textContent = d ? d.name : "";
    if (!d) { box.replaceChildren(el("div", { class: "msg" }, "เลือกเขื่อนเพื่อดูกราฟ")); return; }
    if (!D.hist) { box.replaceChildren(el("div", { class: "msg" }, "กำลังโหลดข้อมูลย้อนหลัง…")); return; }
    const h = D.hist.dams[d.id];
    if (!h || !h.pct.some(v => v != null)) { box.replaceChildren(el("div", { class: "msg" }, "ไม่มีข้อมูลย้อนหลังของแห่งนี้")); return; }
    lineChart(box, D.hist.dates, h.pct, {
      refLabel: "เก็บกักปกติ 100%", aria: "กราฟ % เทียบระดับเก็บกักปกติย้อนหลังของ " + d.name,
      rows: i => [
        { label: "% ความจุ", value: h.pct[i] == null ? "ไม่มีข้อมูล" : fmt(h.pct[i], 1) + "%", color: cssVar("--blue") },
        { label: "ปริมาตร", value: h.vol[i] == null ? "–" : fmt(h.vol[i], 1) + " ล้าน ลบ.ม." },
        { label: "ไหลเข้า / ระบาย", value: h.in[i] == null ? "–" : `${fmt(h.in[i])} / ${fmt(h.out[i])}` },
      ],
    });
  }

  /* =================== ปุ่มและเหตุการณ์ =================== */
  const syncSeg = (attr, val) => document.querySelectorAll(`[${attr}]`).forEach(b => b.classList.toggle("on", b.getAttribute(attr) === val));
  const redrawAll = () => {
    if (S.all.length) { renderNow(); renderKpis(); renderList(); renderMap(false); renderTable(); renderHist(); legend($("mapLegend"), [...ST, NA]); legend($("trendLegend"), ST); if (S.hist) renderTrend(); }
    if (D.all.length) { renderDamNow(); renderDamKpis(); renderDamBars(); renderDamMap(false); renderDamTable(); renderDamHist(); legend($("damLegend"), [...DST, NA]); }
  };
  document.querySelectorAll("[data-theme-btn]").forEach(b => b.addEventListener("click", () => {
    document.documentElement.dataset.theme = b.dataset.themeBtn; store.set("rid-theme", b.dataset.themeBtn);
    syncSeg("data-theme-btn", b.dataset.themeBtn);
    maps.forEach(setTiles); maps.forEach(riverLayer); redrawAll();
  }));
  syncSeg("data-theme-btn", document.documentElement.dataset.theme);
  document.querySelectorAll("[data-rivers]").forEach(b => b.addEventListener("click", () => setRivers(!RIV.on)));
  document.querySelectorAll("[data-size]").forEach(b => b.addEventListener("click", () => {
    D.size = b.dataset.size; syncSeg("data-size", D.size); applyDams();
  }));

  $("fProv").addEventListener("change", () => { store.set("rid-prov", $("fProv").value); applyStations(); $("fProv").blur(); });
  ["fStatus", "fTrend"].forEach(id => $(id).addEventListener("change", () => applyStations()));
  $("lSort").addEventListener("change", renderList);
  let deb1, deb2;
  $("fSearch").addEventListener("input", () => { clearTimeout(deb1); deb1 = setTimeout(() => {
    const q = $("fSearch").value.trim().toLowerCase();
    S.tableRows = q ? S.list.filter(s => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q)) : S.list;
    S.shown = 50; renderTable();
  }, 200); });
  $("dSearch").addEventListener("input", () => { clearTimeout(deb2); deb2 = setTimeout(() => {
    const q = $("dSearch").value.trim().toLowerCase();
    D.tableRows = q ? D.list.filter(d => d.name.toLowerCase().includes(q)) : D.list;
    D.shown = 30; renderDamTable();
  }, 200); });
  $("dRegion").addEventListener("change", () => { applyDams(); $("dRegion").blur(); });
  $("barSort").addEventListener("change", renderDamBars);
  $("moreBtn").addEventListener("click", () => { S.shown += 100; renderTable(); });
  $("damMore").addEventListener("click", () => { D.shown += 100; renderDamTable(); });
  document.querySelectorAll("#tbl th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k;
    if (k === S.tSort) S.tAsc = !S.tAsc; else { S.tSort = k; S.tAsc = ["code", "name", "prov", "trend"].includes(k); }
    renderTable();
  }));
  document.querySelectorAll("#damTbl th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k;
    if (k === D.tSort) D.tAsc = !D.tAsc; else { D.tSort = k; D.tAsc = ["name", "region"].includes(k); }
    renderDamTable();
  }));

  let rz, lastW = innerWidth;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (innerWidth === lastW) return;
      lastW = innerWidth;
      if (S.hist) renderTrend(); renderHist(); renderDamHist(); renderDamBars();
    }, 200);
  });

  // ไฮไลต์เมนูตามส่วนที่กำลังดู
  const navLinks = [...document.querySelectorAll(".nav a")];
  const SECTIONS = navLinks.map(a => $(a.getAttribute("href").slice(1)));
  function syncNav() {
    let cur = SECTIONS[0];
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1];
    else for (const sec of SECTIONS) if (sec.getBoundingClientRect().top <= innerHeight * 0.35) cur = sec;
    navLinks.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + cur.id));
  }
  addEventListener("scroll", syncNav, { passive: true });
  syncNav();

  (function greet() {
    const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date()));
    $("greet").textContent = h >= 5 && h < 12 ? "สวัสดีตอนเช้า ☀️" : h >= 12 && h < 17 ? "สวัสดีตอนบ่าย 🌤️" : h >= 17 && h < 20 ? "สวัสดีตอนเย็น 🌇" : "สวัสดีตอนค่ำ 🌙";
  })();

  const bust = "?t=" + Math.floor(Date.now() / 300000); // cache 5 นาที
  loadRivers(bust);
  loadStations(bust).catch(err => { console.error(err); $("nowcard").replaceChildren(el("div", { class: "msg" }, "โหลดข้อมูลสถานีไม่สำเร็จ")); });
  loadDams(bust).catch(err => { console.error(err); $("damNow").replaceChildren(el("div", { class: "msg" }, "โหลดข้อมูลเขื่อนไม่สำเร็จ")); });
})();
