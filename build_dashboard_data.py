"""
รวมไฟล์ history/*.csv เป็น data/history.json ขนาดกะทัดรัดสำหรับหน้า dashboard
โครงสร้าง:
{
  "dates": ["2026-05-22", ...],
  "stations": {
     "<รหัสสถานี>": {"n": ชื่อ, "p": จังหวัด, "pct": [..ต่อวัน..], "wl": [..ต่อวัน..]}
  }
}
ค่าที่ไม่มีข้อมูลเป็น null
"""
import glob
import json
import math
import pathlib

import pandas as pd

files = sorted(glob.glob("history/*.csv"))
if not files:
    raise SystemExit("ยังไม่มีไฟล์ใน history/")

dates = [pathlib.Path(f).stem for f in files]
idx = {d: i for i, d in enumerate(dates)}
stations = {}

cols = {
    "รหัสสถานี": "code",
    "ชื่อสถานี": "name",
    "จังหวัด": "prov",
    "ระดับน้ำเทียบตลิ่ง (%)": "pct",
    "ระดับน้ำปัจจุบัน (ม.รทก.)": "wl",
}


def num(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) else round(v, 2)


for f in files:
    i = idx[pathlib.Path(f).stem]
    df = pd.read_csv(f, usecols=list(cols), dtype={"รหัสสถานี": str}).rename(columns=cols)
    for r in df.itertuples(index=False):
        if not isinstance(r.code, str):
            continue
        s = stations.get(r.code)
        if s is None:
            s = stations[r.code] = {
                "n": r.name, "p": r.prov,
                "pct": [None] * len(dates), "wl": [None] * len(dates),
            }
        s["n"], s["p"] = r.name, r.prov  # ใช้ชื่อล่าสุด
        s["pct"][i] = num(r.pct)
        s["wl"][i] = num(r.wl)

out = pathlib.Path("data/history.json")
out.parent.mkdir(exist_ok=True)
out.write_text(
    json.dumps({"dates": dates, "stations": stations}, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)
print(f"สร้าง {out} : {len(dates)} วัน, {len(stations)} สถานี, {out.stat().st_size/1e6:.1f} MB")
