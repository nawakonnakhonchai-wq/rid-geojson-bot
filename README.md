# rid-geojson-bot
## Dashboard

หน้า `index.html` แสดงสถานการณ์ระดับน้ำจาก `rid_realtime.geojson` (ล่าสุด) และ `data/history.json` (ย้อนหลังรายวัน)

- `data/history.json` สร้างโดย `build_dashboard_data.py` จากไฟล์ `history/*.csv` (รันอัตโนมัติใน workflow ทุก 15 นาที)
- เปิดใช้งาน: Settings → Pages → Source: *Deploy from a branch* → Branch `main` / `(root)`
- ทดสอบในเครื่อง: `python -m http.server` แล้วเปิด http://localhost:8000
