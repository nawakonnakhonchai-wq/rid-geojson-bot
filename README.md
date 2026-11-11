# rid-geojson-bot

## Dashboard

หน้า `index.html` แสดงสถานการณ์ระดับน้ำ (สถานีวัดน้ำ) และเขื่อน/อ่างเก็บน้ำ

- `data/history.json` สร้างโดย `build_dashboard_data.py` จากไฟล์ `history/*.csv` (รันอัตโนมัติใน workflow ทุก 15 นาที)
- `data/dams.json`, `data/dam_history.json` สร้างโดย `build_dam_data.py` จาก repo [Dam_Daily](https://github.com/nawakonnakhonchai-wq/Dam_Daily) (เก็บค่าล่าสุดที่ใช้ได้ ไม่ทับด้วยค่า 0 ช่วงเช้า)
- เปิดใช้งาน: Settings → Pages → Source: *Deploy from a branch* → Branch `main` / `(root)`
- ทดสอบในเครื่อง: `python -m http.server` แล้วเปิด http://localhost:8000
