import glob
import pandas as pd

files = sorted(glob.glob("history/*.csv"))
if not files:
    raise SystemExit("ยังไม่มีไฟล์ใน history/")

df = pd.concat((pd.read_csv(f) for f in files), ignore_index=True)

df = df.rename(columns={
    "รหัสสถานี": "station_code",
    "ชื่อสถานี": "station_name",
    "จังหวัด": "province",
    "ระดับน้ำปัจจุบัน (ม.รทก.)": "wl",
    "ระดับตลิ่ง (ม.รทก.)": "bank_level",
    "ระดับน้ำเทียบตลิ่ง (%)": "wl_pct",
    "แนวโน้มระดับน้ำ": "wl_trend",
    "ระยะจากตลิ่ง (ม.)": "dist_bank",
    "อัตราการไหล (ลบ.ม./วิ)": "q",
    "% อัตราการไหล": "q_pct",
    "แนวโน้มอัตราการไหล": "q_trend",
    "เวลาบันทึกข้อมูล (UTC)": "time_utc",
    "เวลาบันทึกข้อมูล (เวลาไทย)": "time_th",
    "Latitude": "lat",
    "Longitude": "lon",
})

for c in ["wl", "bank_level", "wl_pct", "dist_bank", "q", "q_pct", "lat", "lon"]:
    df[c] = pd.to_numeric(df[c], errors="coerce")

df["snapshot_date"] = pd.to_datetime(df["snapshot_date"]).dt.strftime("%Y-%m-%d")
df.to_csv("history_all.csv", index=False, encoding="utf-8-sig")
print(f"รวม {len(files)} วัน, {len(df)} แถว")
