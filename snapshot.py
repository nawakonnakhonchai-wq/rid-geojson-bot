import json, pathlib, datetime as dt
import pandas as pd

TH = dt.timezone(dt.timedelta(hours=7))
now = dt.datetime.now(TH)
pathlib.Path("history").mkdir(exist_ok=True)
out = pathlib.Path("history") / f"{now.date()}.csv"

# ยังไม่ถึง 17:00 หรือบันทึกของวันนี้ไปแล้ว -> ข้าม
if now.hour < 17 or out.exists():
    raise SystemExit(0)

with open("rid_realtime.geojson", encoding="utf-8") as f:
    gj = json.load(f)
df = pd.DataFrame([ft["properties"] for ft in gj["features"]])

# ตรวจว่าข้อมูลสดจริง (ถ้า API ล่ม ไฟล์จะเก่า)
t = pd.to_datetime(df["เวลาบันทึกข้อมูล (UTC)"], utc=True, errors="coerce")
if t.max() < pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=3):
    print("ข้อมูลเก่าเกินไป ข้ามรอบนี้ รอรอบถัดไป")
    raise SystemExit(0)

df.insert(0, "snapshot_date", now.date().isoformat())
df["เวลาบันทึกข้อมูล (เวลาไทย)"] = (
    t.dt.tz_convert("Asia/Bangkok").dt.strftime("%Y-%m-%d %H:%M:%S")
)
df.to_csv(out, index=False, encoding="utf-8-sig")
print(f"บันทึก {out} จำนวน {len(df)} สถานี")
