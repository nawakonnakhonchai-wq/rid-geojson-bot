"""
สร้าง data/rivers.geojson : เส้นทางแม่น้ำสายหลัก
  - รายชื่อ ความยาว และจังหวัดที่ไหลผ่าน จาก data/rivers_md.json (กรมเจ้าท่า dataset_09_01)
  - เส้นทางจริงจาก OpenStreetMap (Overpass API) ค้นตามชื่อภายในกรอบรอบจุดเริ่ม-สิ้นสุด
ข้อมูลเส้นทาง © OpenStreetMap contributors (ODbL)

รันผ่าน workflow "Build river paths" (กดรันเอง) เพราะเป็นข้อมูลที่แทบไม่เปลี่ยน
"""
import json
import math
import pathlib
import re
import time
import urllib.parse
import urllib.request

SRC = pathlib.Path("data/rivers_md.json")
OUT = pathlib.Path("data/rivers.geojson")
OVERPASS = "https://overpass-api.de/api/interpreter"
PAD = 0.7            # ขยายกรอบค้นหา (องศา) เพราะแม่น้ำคดเคี้ยวเกินจุดเริ่ม-สิ้นสุด
TOL = 0.0015         # ความคลาดเคลื่อนตอนลดจุด (~150 ม.)


def f(v):
    try:
        return float(str(v).strip())
    except ValueError:
        return None


def name_variants(name):
    base = re.sub(r"\s*\(.*?\)\s*", "", name).strip()
    out = {base}
    for pre in ("แม่น้ำ", "ลำน้ำ"):
        if base.startswith(pre):
            rest = base[len(pre):]
            out |= {"น้ำ" + rest, "ลำน้ำ" + rest, "แม่น้ำ" + rest}
    return sorted(out)


def overpass(query, tries=4):
    data = urllib.parse.urlencode({"data": query}).encode()
    for i in range(tries):
        req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": "rid-geojson-bot river builder"})
        try:
            with urllib.request.urlopen(req, timeout=200) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # 429 / 504 ฯลฯ รอแล้วลองใหม่
            print(f"   overpass error ({e}), retry {i + 1}")
            time.sleep(15 * (i + 1))
    return {"elements": []}


def dp(pts, tol):
    """Douglas-Peucker แบบไม่ใช้ไลบรารีภายนอก"""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy) or 1e-12
        best, idx = 0, -1
        for i in range(a + 1, b):
            x, y = pts[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / n
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def km(line):
    s = 0
    for (x1, y1), (x2, y2) in zip(line, line[1:]):
        s += math.hypot((x2 - x1) * 111.32 * math.cos(math.radians((y1 + y2) / 2)), (y2 - y1) * 110.57)
    return s


def main():
    rows = json.loads(SRC.read_text(encoding="utf-8-sig"))
    feats = []
    for r in rows:
        r = {k.lstrip("﻿"): v for k, v in r.items()}
        name = r["River_Name"].strip()
        lat = [f(r["Start_Latitude"]), f(r["End_Latitude"])]
        lon = [f(r["Start_Longitude"]), f(r["End_Longitude"])]
        bbox = (min(lat) - PAD, min(lon) - PAD, max(lat) + PAD, max(lon) + PAD)
        names = "|".join(re.escape(n) for n in name_variants(name))
        b = ",".join(f"{v:.4f}" for v in bbox)
        q = (f'[out:json][timeout:180];('
             f'way["waterway"~"^(river|stream|canal)$"]["name"~"^({names})$"]({b});'
             f'way["waterway"~"^(river|stream|canal)$"]["name:th"~"^({names})$"]({b});'
             f');out geom;')
        res = overpass(q)
        lines = []
        for el in res.get("elements", []):
            g = el.get("geometry")
            if g and len(g) > 1:
                lines.append(dp([(round(p["lon"], 5), round(p["lat"], 5)) for p in g], TOL))
        lines = [[[round(x, 4), round(y, 4)] for x, y in ln] for ln in lines if len(ln) > 1]
        osm_km = sum(km(ln) for ln in lines)
        md_km = f(r["Distance_KM"])
        print(f"{name}: {len(lines)} เส้น, OSM {osm_km:.0f} กม. / กรมเจ้าท่า {md_km} กม.")
        props = {
            "name": name, "length_km": md_km,
            "provinces": ", ".join(p.strip() for p in r["Province_Via"].split(",") if p.strip()),
            "n_prov": int(f(r["No_Province"]) or 0),
            "start": [lon[0], lat[0]], "end": [lon[1], lat[1]],
            "osm_km": round(osm_km),
        }
        geom = {"type": "MultiLineString", "coordinates": lines} if lines else None
        feats.append({"type": "Feature", "properties": props, "geometry": geom})
        time.sleep(2)

    OUT.write_text(json.dumps({
        "type": "FeatureCollection",
        "attribution": "เส้นทาง © OpenStreetMap contributors (ODbL); ข้อมูลแม่น้ำ: กรมเจ้าท่า",
        "features": feats,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    found = sum(1 for x in feats if x["geometry"])
    print(f"สร้าง {OUT}: พบเส้นทาง {found}/{len(feats)} สาย, {OUT.stat().st_size / 1e6:.2f} MB")
    missing = [x["properties"]["name"] for x in feats if not x["geometry"]]
    if missing:
        print("ไม่พบเส้นทาง:", ", ".join(missing))


if __name__ == "__main__":
    main()
