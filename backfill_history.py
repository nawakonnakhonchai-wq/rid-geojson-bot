"""
เติม history/YYYY-MM-DD.csv ย้อนหลัง จากประวัติ git ของ rid_realtime.geojson
(บอตอัปเดตไฟล์นี้ทุกชั่วโมงมาตั้งแต่ พ.ค. 2026 ทุกเวอร์ชันยังอยู่ใน git)

วิธีเลือก: แต่ละวัน ใช้ commit ที่ใกล้เวลา 17:00 น. (เวลาไทย) ที่สุด
ให้ตรงกับที่ snapshot.py ทำอยู่ทุกวัน  ไม่เขียนทับไฟล์ที่มีอยู่แล้ว

รันครั้งเดียว:  python backfill_history.py
(ต้อง checkout แบบเต็ม: actions/checkout ใส่ fetch-depth: 0)
"""
import io
import json
import pathlib
import subprocess
import datetime as dt

import pandas as pd

TH = dt.timezone(dt.timedelta(hours=7))
SRC = "rid_realtime.geojson"
OUT = pathlib.Path("history")
OUT.mkdir(exist_ok=True)

log = subprocess.run(["git", "log", "--format=%H %ct", "--", SRC],
                     capture_output=True, text=True, check=True).stdout.split()
commits = [(log[i], dt.datetime.fromtimestamp(int(log[i + 1]), TH)) for i in range(0, len(log), 2)]

# เลือก commit ที่ใกล้ 17:00 ที่สุดในแต่ละวัน
best = {}
for sha, t in commits:
    d = t.date()
    target = dt.datetime.combine(d, dt.time(17), TH)
    diff = abs((t - target).total_seconds())
    if d not in best or diff < best[d][1]:
        best[d] = (sha, diff)

today = dt.datetime.now(TH).date()
added = 0
for d, (sha, diff) in sorted(best.items()):
    out = OUT / f"{d}.csv"
    if out.exists() or d >= today or diff > 3 * 3600:   # ข้ามวันที่มีแล้ว/วันนี้/ไม่มีข้อมูลช่วงเย็น
        continue
    raw = subprocess.run(["git", "show", f"{sha}:{SRC}"], capture_output=True, check=True).stdout
    try:
        gj = json.load(io.BytesIO(raw))
    except json.JSONDecodeError:
        continue
    df = pd.DataFrame([f["properties"] for f in gj.get("features", [])])
    if df.empty or "เวลาบันทึกข้อมูล (UTC)" not in df:
        continue
    t = pd.to_datetime(df["เวลาบันทึกข้อมูล (UTC)"], utc=True, errors="coerce")
    df.insert(0, "snapshot_date", d.isoformat())
    df["เวลาบันทึกข้อมูล (เวลาไทย)"] = t.dt.tz_convert("Asia/Bangkok").dt.strftime("%Y-%m-%d %H:%M:%S")
    df.to_csv(out, index=False, encoding="utf-8-sig")
    added += 1

print(f"เติมย้อนหลัง {added} วัน")
