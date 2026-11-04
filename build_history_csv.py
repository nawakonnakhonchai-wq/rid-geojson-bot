"""
รวม history/*.csv เป็น CSV สำหรับ ArcGIS Online (เพิ่มเป็น layer จาก URL แล้วทำกราฟ)

ผลลัพธ์:
- history_wl.csv     : 1 แถว = 1 สถานี x 1 วัน, มี latitude/longitude ในตัว, ย้อนหลัง HISTORY_DAYS วัน
- history_wl_wide.csv: 1 แถวต่อสถานี ค่า 30 วันล่าสุดเป็นคอลัมน์ wl_d01..wl_d30 (เบาที่สุด เหมาะกับ ArcGIS popup chart)
- history_wl_all.csv : แบบเดียวกับ history_wl.csv แต่เก็บทุกวัน (สำหรับดาวน์โหลด/Excel ไม่แนะนำให้ ArcGIS ดึงตรง)

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

# ---------- แบบกว้าง: 1 แถวต่อสถานี (สำหรับ popup chart ใน ArcGIS) ----------
# wl_d01 = วันเก่าสุด ... wl_dNN = วันล่าสุด  ชื่อคอลัมน์คงที่ทุกวัน
# ArcGIS จึงไม่ต้องตั้งค่ากราฟใหม่เมื่อข้อมูลเลื่อนไปวันถัดไป
WIDE_DAYS = int(os.environ.get("WIDE_DAYS", "30"))
wide_dates = sorted(df["snapshot_date"].unique())[-WIDE_DAYS:]
slot = {d: f"d{i + 1:02d}" for i, d in enumerate(wide_dates)}
w = df[df["snapshot_date"].isin(wide_dates)].copy()
w["slot"] = w["snapshot_date"].map(slot)

wide = latest.copy()
for col in ["wl", "wl_pct"]:
    p = w.pivot(index="station_code", columns="slot", values=col)
    p = p.reindex(columns=list(slot.values()))
    p.columns = [f"{col}_{c}" for c in p.columns]
    wide = wide.join(p)

last = df.groupby("station_code").last()
wide.insert(4, "latest_date", last["snapshot_date"])
wide.insert(5, "wl_latest", last["wl"])
wide.insert(6, "wl_pct_latest", last["wl_pct"])
wide.insert(7, "start_date", wide_dates[0])
wide.insert(8, "end_date", wide_dates[-1])
wide["latitude"] = wide["latitude"].round(6)
wide["longitude"] = wide["longitude"].round(6)
# ตัดสถานีที่ไม่มีข้อมูลเลยในช่วงนี้
wide = wide.dropna(subset=[c for c in wide.columns if c.startswith("wl_d")], how="all")
wide.reset_index().to_csv("history_wl_wide.csv", index=False, encoding="utf-8")
print(f"history_wl_wide.csv {len(wide)} สถานี x {len(wide_dates)} วัน ({wide_dates[0]} ถึง {wide_dates[-1]})")

# ---------- แบบยาว 30 วัน (เบา) สำหรับ Serial chart ที่แกน X เป็นวันที่จริง ----------
# ใช้คู่กับ history_wl_wide.csv: แผนที่ใช้ไฟล์ wide (1 จุด/สถานี), กราฟใช้ไฟล์นี้
# แล้ว filter ข้าม layer ด้วย station_code
DAYS_30 = int(os.environ.get("CHART_DAYS", "30"))
d30 = sorted(df["snapshot_date"].unique())[-DAYS_30:]
c = out[df.loc[out.index, "snapshot_date"].isin(d30)]
c = c[["station_code", "station_name", "latitude", "longitude", "date", "wl", "wl_pct"]]
c.to_csv("history_wl_30d.csv", index=False, encoding="utf-8")
print(f"history_wl_30d.csv {len(c)} แถว")
