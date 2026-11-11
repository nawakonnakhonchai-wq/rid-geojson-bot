"""
สร้าง data/ieat_estates.geojson จาก data/ieat_source.geojson (ตำแหน่งนิคมอุตสาหกรรม กนอ.)
- ใช้พิกัดจาก geometry (ช่อง ละต/ลอง บางแถวเป็นพิกัดสำนักงานที่ดูแล ไม่ใช่ตัวนิคม)
- ไม่รวมสำนักงานใหญ่และจุดที่เป็น "สำนักงาน..." ซึ่งไม่ใช่นิคม
- ปรับชื่อสายปฏิบัติการให้สะกดถูกและอ่านง่าย
"""
import json
import pathlib
import re

SRC = pathlib.Path("data/ieat_source.geojson")
OUT = pathlib.Path("data/ieat_estates.geojson")

src = json.loads(SRC.read_text(encoding="utf-8"))
feats, skipped = [], []
for f in src["features"]:
    p = f.get("properties") or {}
    name = (p.get("สำน") or "").strip()
    ops = (p.get("Operations") or "").strip()
    if not name or not f.get("geometry"):
        continue
    if name.startswith("สำนักงาน") or ops == "สำนักงานใหญ่":
        skipped.append(name)
        continue
    lon, lat = f["geometry"]["coordinates"][:2]
    ops = ops.replace("ปฎิบัติ", "ปฏิบัติ")
    m = re.match(r"สายปฏิบัติการ\s*(\d*)$", ops)
    ops_label = (f"สายปฏิบัติการ {m.group(1)}" if m and m.group(1) else "ไม่ระบุสายปฏิบัติการ") if m else ops
    feats.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
        "properties": {"id": p.get("FID"), "name": name, "operations": ops_label},
    })

OUT.write_text(json.dumps({
    "type": "FeatureCollection",
    "attribution": "ตำแหน่งนิคมอุตสาหกรรม: การนิคมอุตสาหกรรมแห่งประเทศไทย (กนอ.)",
    "features": feats,
}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{OUT}: {len(feats)} นิคม (ข้าม {len(skipped)}: {', '.join(skipped)})")
