"""ตรวจโครงสร้างข้อมูลดิบจาก API สถานีวัดน้ำของกรมชลฯ (ไม่เขียนไฟล์ใดๆ) — ใช้หาช่องลุ่มน้ำ"""
import collections
import json
import requests

URL = "https://bigdata-swoc.rid.go.th/api/ma/pier/all/get_pier_data?date=&basin=&province=&region=&rid="
r = requests.get(URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
print("status", r.status_code)
raw = r.json()
if isinstance(raw, dict):
    print("top-level keys:", list(raw.keys()))
items = raw.get("data", raw.get("result", raw)) if isinstance(raw, dict) else raw
print("items:", len(items))
keys = collections.Counter(k for it in items for k in it)
print("all keys:", json.dumps(sorted(keys), ensure_ascii=False))
print("first item:", json.dumps(items[0], ensure_ascii=False)[:3000])
for k in sorted(keys):
    if any(w in k.lower() for w in ("basin", "river", "region", "rid", "office", "sub", "lumnam", "zone")):
        c = collections.Counter(str(it.get(k)) for it in items)
        print(f"\n== {k}: {len(c)} distinct values; top 40:")
        for v, n in c.most_common(40):
            print(f"   {n:5d}  {v}")
