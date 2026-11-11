# rid-geojson-bot

## Dashboard

หน้า `index.html` แสดงสถานการณ์ระดับน้ำ (สถานีวัดน้ำ) และเขื่อน/อ่างเก็บน้ำ

- `data/history.json` สร้างโดย `build_dashboard_data.py` จากไฟล์ `history/*.csv` (รันอัตโนมัติใน workflow ทุก 15 นาที)
- `data/dams.json`, `data/dam_history.json` สร้างโดย `build_dam_data.py` จาก repo [Dam_Daily](https://github.com/nawakonnakhonchai-wq/Dam_Daily) (เก็บค่าล่าสุดที่ใช้ได้ ไม่ทับด้วยค่า 0 ช่วงเช้า)
- เปิดใช้งาน: Settings → Pages → Source: *Deploy from a branch* → Branch `main` / `(root)`
- ทดสอบในเครื่อง: `python -m http.server` แล้วเปิด http://localhost:8000

## คอลัมน์ใน `rid_realtime.geojson`

คอลัมน์เดิม 15 ช่องคงไว้ครบตามชื่อและลำดับเดิม คอลัมน์ใหม่ต่อท้ายเสมอ:

| คอลัมน์ | ที่มา (API) | หมายเหตุ |
|---|---|---|
| `ลุ่มน้ำ` | `basin_name` | ตัดคำนำหน้า "ลุ่มน้ำ" ให้เป็นแบบเดียวกัน เช่น "มูล" |
| `แม่น้ำ/ลำน้ำ` | `river` | |
| `อำเภอ` | `amphoe` | |
| `ภาค` | `region` | |
| `สำนักชลประทาน` | `rid_name` | |

`ระดับตลิ่ง (ม.รทก.)` อ่านจาก `brae_level` (API ไม่มี `bank_values` แล้ว)
