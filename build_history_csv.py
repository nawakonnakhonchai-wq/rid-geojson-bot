"""
รวม history/*.csv เป็น CSV สำหรับ ArcGIS Online (เพิ่มเป็น layer จาก URL แล้วทำกราฟ)

ผลลัพธ์:
- history_wl.csv     : 1 แถว = 1 สถานี x 1 วัน, มี latitude/longitude ในตัว, ย้อนหลัง HISTORY_DAYS วัน
- history_wl_all.csv : เหมือนกันแต่เก็บทุกวัน (สำหรับดาวน์โหลด/Excel ไม่แนะนำให้ ArcGIS ดึงตรง)

คอลัมน์ใช้ชื่ออังกฤษสั้น ๆ เพื่อให้ ArcGIS ตั้งชื่อ field ได้ถูกต้อง
date เป็น ISO 8601 ให้ ArcGIS อ่านเป็น Date field และเปิด Time / ทำ line chart ได้
"""
import glob
import os

import pandas as pd

HISTORY_DAYS = int(os.environ.get("HISTORY_DAYS", "90"))

files = sorted(glob.glob("history/*.csv"))
if not files:
    raise SystemExit("ยังไม่มีไฟล์ใน history/")

df = pd.concat((pd.read_csv(f, dtype={"รหัสสถานี": str}) for f in files), ignore_index=True)
df = df.rename(columns={
    "รหัสสถานี": "station_code",
    "ชื่อสถานี": "station_name",
    "จังหวัด": "province",
    "ระดับน้ำปัจจุบัน (ม.รทก.)": "wl",
    "ระดับน้ำเทียบตลิ่ง (%)": "wl_pct",
    "อัตราการไหล (ลบ.ม./วิ)": "q",
    "Latitude": "latitude",
    "Longitude": "longitude",
})
for c in ["wl", "wl_pct", "q", "latitude", "longitude"]:
    df[c] = pd.to_numeric(df[c], errors="coerce")
df = df.dropna(subset=["station_code", "latitude", "longitude"])
df = df.sort_values(["station_code", "snapshot_date"]).drop_duplicates(
    ["station_code", "snapshot_date"], keep="last")

# ใช้ชื่อ/พิกัดล่าสุดของแต่ละสถานี ทุกแถวของสถานีเดียวกันจะได้ค่าเหมือนกัน (กราฟ/filter ไม่แตก)
latest = df.groupby("station_code")[["station_name", "province", "latitude", "longitude"]].last()
df = df.drop(columns=["station_name", "province", "latitude", "longitude"]).join(latest, on="station_code")

df["date"] = df["snapshot_date"] + "T17:00:00+07:00"
out = df[["station_code", "station_name", "province", "latitude", "longitude",
          "date", "wl", "wl_pct", "q"]].copy()
out["latitude"] = out["latitude"].round(6)
out["longitude"] = out["longitude"].round(6)
out = out.sort_values(["date", "station_code"])

out.to_csv("history_wl_all.csv", index=False, encoding="utf-8")
recent = sorted(df["snapshot_date"].unique())[-HISTORY_DAYS:]
out[df.loc[out.index, "snapshot_date"].isin(recent)].to_csv(
    "history_wl.csv", index=False, encoding="utf-8")

print(f"รวม {len(files)} วัน | {out['station_code'].nunique()} สถานี | "
      f"history_wl.csv {len(recent)} วัน | history_wl_all.csv {len(out)} แถว")
