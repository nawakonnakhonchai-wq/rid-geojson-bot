"""
ดึงข้อมูลเขื่อน/อ่างเก็บน้ำจาก repo Dam_Daily แล้วสร้างไฟล์สำหรับ dashboard
  - data/dams.json        : ค่าล่าสุดที่ "ใช้ได้" ของแต่ละเขื่อน
  - data/dam_history.json : ประวัติรายวัน (% ความจุ, ปริมาตร, น้ำไหลเข้า, น้ำระบาย)

ช่วงเช้าของวันใหม่ API กรมชลฯ มักส่งค่า 0 มาก่อนจะอัปเดต สคริปต์นี้จึงไม่เขียนทับ
ค่าเดิมด้วยแถวที่ปริมาตรและ % เป็น 0 ทั้งคู่

ใช้งาน:
  python build_dam_data.py                 # ดึงจาก GitHub (ใช้ใน workflow)
  python build_dam_data.py path/to.geojson # อ่านจากไฟล์ในเครื่อง
"""
import json
import math
import pathlib
import sys
import urllib.request

SRC_URL = "https://raw.githubusercontent.com/nawakonnakhonchai-wq/Dam_Daily/main/rid_dams_updated.geojson"
LATEST = pathlib.Path("data/dams.json")
HIST = pathlib.Path("data/dam_history.json")


def load_source(arg):
    if arg:
        return json.loads(pathlib.Path(arg).read_text(encoding="utf-8"))
    with urllib.request.urlopen(SRC_URL, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    return round(f, 3) if math.isfinite(f) else 0.0


def main(arg=None):
    src = load_source(arg)
    latest = json.loads(LATEST.read_text(encoding="utf-8")) if LATEST.exists() else {"dams": {}}
    hist = json.loads(HIST.read_text(encoding="utf-8")) if HIST.exists() else {"dates": [], "dams": {}}
    dams = latest["dams"]

    fresh = 0
    for ft in src.get("features", []):
        p = ft.get("properties") or {}
        did = str(p.get("id") or "").strip()
        if not did:
            continue
        d = dams.setdefault(did, {})
        d["name"] = p.get("name") or d.get("name", "")
        d["region"] = p.get("region") or d.get("region", "")
        d["large"] = not did.startswith("rsv")
        geom = ft.get("geometry") or {}
        if geom.get("coordinates") and None not in geom["coordinates"][:2]:
            d["lon"], d["lat"] = [round(float(c), 6) for c in geom["coordinates"][:2]]
        if num(p.get("capacity")) > 0:
            d["cap"] = num(p.get("capacity"))
        for k_src, k in (("active_storage", "active"), ("dead_storage", "dead")):
            if num(p.get(k_src)) > 0:
                d[k] = num(p.get(k_src))

        vol, pct = num(p.get("volume")), num(p.get("percent_storage"))
        date = str(p.get("date") or "")[:10]
        if (vol <= 0 and pct <= 0) or not date:
            continue  # ยังไม่มีข้อมูลของวันนี้ เก็บค่าเดิมไว้
        if d.get("date") and date < d["date"]:
            continue
        fresh += 1
        d.update(vol=vol, pct=pct, inflow=num(p.get("inflow")), outflow=num(p.get("outflow")), date=date)

        # ประวัติรายวัน
        if date not in hist["dates"]:
            hist["dates"].append(date)
            hist["dates"].sort()
            for h in hist["dams"].values():
                for arr in h.values():
                    arr.insert(hist["dates"].index(date), None)
        i = hist["dates"].index(date)
        h = hist["dams"].setdefault(did, {k: [None] * len(hist["dates"]) for k in ("pct", "vol", "in", "out")})
        h["pct"][i], h["vol"][i] = pct, vol
        h["in"][i], h["out"][i] = d["inflow"], d["outflow"]

    LATEST.parent.mkdir(exist_ok=True)
    LATEST.write_text(json.dumps({"dams": dams}, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False), encoding="utf-8")
    HIST.write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False), encoding="utf-8")
    print(f"เขื่อน {len(dams)} แห่ง, อัปเดตค่าใหม่ {fresh} แห่ง, ประวัติ {len(hist['dates'])} วัน")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
