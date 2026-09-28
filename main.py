import json
import re
import pandas as pd
import requests

# พิกัดสำรองสำหรับเขื่อนสำคัญ (กรณีชื่อใน API กับ GIS ไม่ตรงกันและแมทช์ไม่ติด)
# สามารถเพิ่มชื่อเขื่อนและพิกัด (lat, lon) ตรงนี้ได้ตามต้องการ
MANUAL_COORDS = {
    "ประแสร์": {"latitude": 13.141667, "longitude": 101.725000},  # ตัวอย่างพิกัดเขื่อนประแสร์ จ.ระยอง
    # "เขื่อนอื่นๆ": {"latitude": xx.xxxx, "longitude": yy.yyyy}
}


def clean_name(name):
    if pd.isna(name):
        return ""
    text = str(name)
    # ลบข้อความในวงเล็บทั้งหมด (เช่น (ระยอง), (สาขา 2) ฯลฯ)
    text = re.sub(r"\(.*?\)", "", text)
    # ตัดคำนำหน้าและคำส่วนเกินออก
    for kw in ["เขื่อน", "อ่างเก็บน้ำ", "ขนาดกลาง", "ขนาดใหญ่", "โครงการ"]:
        text = text.replace(kw, "")
    # ตัดอักขระพิเศษและเว้นวรรคออก เหลือเฉพาะตัวอักษรไทย อังกฤษ และตัวเลข
    text = re.sub(r"[^\ก-ฮa-zA-Z0-9]", "", text)
    return text.strip()


def safe_value(val, default_type="str"):
    if pd.isna(val) or val is None:
        return 0 if default_type == "num" else ""
    if default_type == "num":
        try:
            if isinstance(val, str):
                val = val.replace(",", "").strip()
                if val == "-" or val == "":
                    return 0
            return float(val)
        except:
            return 0
    return str(val).strip()


def get_val(item, keys, default_type="num"):
    val = None
    for k in keys:
        if k in item and item[k] is not None:
            val = item[k]
            break
    return safe_value(val, default_type)


def fetch_rid_data(url):
    try:
        res = requests.get(url, timeout=15)
        if res.status_code != 200:
            return [], ""
        data = res.json()
        api_date = data.get("date", "")
        items = []

        raw_data = data.get("data", data)
        if isinstance(raw_data, list):
            for region_group in raw_data:
                if isinstance(region_group, dict):
                    region_name = region_group.get("region", "")
                    sub_items = []
                    for k in ["dam", "reservoir", "data", "list"]:
                        if k in region_group and isinstance(region_group[k], list):
                            sub_items = region_group[k]
                            break

                    if sub_items:
                        for item in sub_items:
                            item["region"] = region_name
                            items.append(item)
                    else:
                        if "name" in region_group or "id" in region_group:
                            items.append(region_group)
        return items, api_date
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return [], ""


print("กำลังดึงข้อมูลเขื่อนขนาดใหญ่...")
url_large = "https://app.rid.go.th/reservoir/api/dam/public"
large_list, date_large = fetch_rid_data(url_large)

print("กำลังดึงข้อมูลอ่างเก็บน้ำขนาดกลาง...")
url_medium = "https://app.rid.go.th/reservoir/api/reservoir/public"
medium_list, date_medium = fetch_rid_data(url_medium)

all_water_data = large_list + medium_list
df_api = pd.DataFrame(all_water_data)
api_date = date_large if date_large else date_medium

if not df_api.empty:
    df_api["clean_name"] = df_api["name"].apply(clean_name)
    if "id" in df_api.columns:
        df_api = df_api.drop_duplicates(subset=["id"], keep="first")
    else:
        df_api = df_api.drop_duplicates(subset=["clean_name"], keep="first")

print("กำลังดึงข้อมูลพิกัด GIS จาก IEAT...")
url_gis = "https://emonitor.ieat.go.th/call_feed/geog/GeoData/rid_conv_gis.json"
gis_rows = []
try:
    res_gis = requests.get(url_gis, timeout=15)
    if res_gis.status_code == 200:
        gis_data = res_gis.json()
        for feat in gis_data.get("features", []):
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            coords = geom.get("coordinates", [None, None]) if geom else [None, None]

            raw_name = props.get("name") or props.get("DAM_NAME") or ""
            gis_rows.append({
                "name_gis": raw_name,
                "clean_name": clean_name(raw_name),
                "longitude": coords[0],
                "latitude": coords[1],
            })
except Exception as e:
    print(f"Error fetching GIS data: {e}")

df_gis = pd.DataFrame(gis_rows)
if not df_gis.empty:
    df_gis = df_gis.drop_duplicates(subset=["clean_name"], keep="first")

# รวมข้อมูล (Merge) ระหว่าง API น้ำกับ GIS
if not df_api.empty and not df_gis.empty:
    df_merged = pd.merge(
        df_api,
        df_gis[["clean_name", "longitude", "latitude"]],
        on="clean_name",
        how="left",
    )
else:
    df_merged = df_api

# สร้างโครงสร้าง GeoJSON พร้อมเช็ค Manual Override สำหรับเขื่อนที่พิกัดยังขาด
final_features = []
missing_count = 0

for _, row in df_merged.iterrows():
    lat = row.get("latitude")
    lon = row.get("longitude")
    original_name = str(row.get("name", ""))
    cleaned = row.get("clean_name", "")

    # ตรวจสอบระบบ Manual Override หากพิกัดยังว่าง
    if (pd.isna(lat) or pd.isna(lon)) and cleaned in MANUAL_COORDS:
        lat = MANUAL_COORDS[cleaned]["latitude"]
        lon = MANUAL_COORDS[cleaned]["longitude"]

    if pd.notna(lat) and pd.notna(lon):
        try:
            geometry = {"type": "Point", "coordinates": [float(lon), float(lat)]}
        except:
            geometry = None
            missing_count += 1
    else:
        geometry = None
        missing_count += 1

    feature = {
        "type": "Feature",
        "geometry": geometry,
        "properties": {
            "id": get_val(row, ["id"], "str"),
            "name": original_name,
            "region": get_val(row, ["region"], "str"),
            "capacity": get_val(row, ["capacity", "max_capacity"], "num"),
            "volume": get_val(row, ["volume", "water_volume", "storage"], "num"),
            "percent_storage": get_val(row, ["percent_storage", "percent"], "num"),
            "inflow": get_val(row, ["inflow", "water_in"], "num"),
            "outflow": get_val(row, ["outflow", "water_out"], "num"),
            "date": get_val(row, ["date"], "str") if get_val(row, ["date"], "str") else safe_value(api_date, "str"),
        },
    }
    final_features.append(feature)

geojson_output = {"type": "FeatureCollection", "features": final_features}

output_filename = "rid_dams_updated.geojson"
with open(output_filename, "w", encoding="utf-8") as f:
    json.dump(geojson_output, f, ensure_ascii=False, indent=4)

print(f"\n--- สรุปผลการสร้าง GeoJSON ---")
print(f"ข้อมูลน้ำรวมทั้งหมด: {len(final_features)} แห่ง")
print(f"ที่มีพิกัดครบถ้วน: {len(final_features) - missing_count} แห่ง")
print(f"ที่ยังขาดพิกัด: {missing_count} แห่ง")
