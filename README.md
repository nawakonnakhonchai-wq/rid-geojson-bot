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

## ชั้นพื้นที่น้ำท่วม (`data/flood_2569.geojson`)

ปุ่ม **น้ำท่วม** บนแผนที่สถานีวัดน้ำ ไฟล์จะโหลดเมื่อผู้ใช้กดเปิดเท่านั้น

- ต้นฉบับ: `พื้นที่น้ำท่วมปี_2569.geojson` (107 MB, ข้อมูล ณ 4 ต.ค. 2569, ~4,164,262 ไร่)
- ลดรายละเอียดด้วย [mapshaper](https://github.com/mbloch/mapshaper) ให้เหลือ ~5.6 MB (พื้นที่คงเหลือ ~98%):

```
mapshaper-xl 4gb -i flood.geojson -simplify 10% keep-shapes planar -filter-islands min-area=20000 -clean \
  -each 'date="2026-10-04", detail="...", rai=4164262, delete FID, delete Id, delete Date, delete Detail' \
  -o data/flood_2569.geojson precision=0.0001
```

ถ้ามีข้อมูลน้ำท่วมชุดใหม่ ให้ทำขั้นตอนเดียวกันแล้วแก้ `FLD.file` ใน `dashboard/app.js`
