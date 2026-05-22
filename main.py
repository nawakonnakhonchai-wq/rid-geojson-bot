import requests
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

def fetch_rid_realtime():
    # ลิงก์ API ของกรมชลประทานที่คุณระบุ
    api_url = "https://bigdata-api.rid.go.th/api/v1/ma/pier/all/get_pier_data?date=&basin=&province=&region=&rid="
    
    try:
        # ส่งคำขอดึงข้อมูล (ใส่ verify=True เป็นค่าเริ่มต้น หรือเป็น False หากมีปัญหาเรื่อง SSL Certificate)
        response = requests.get(api_url, verify=True)
        
        if response.status_code != 200:
            print(f"ไม่สามารถเชื่อมต่อ API ได้ รหัสข้อผิดพลาด: {response.status_code}")
            return
            
        raw_data = response.json()
        
        # จากโครงสร้างปกติของ API เส้นนี้ ข้อมูลมักจะถูกครอบไว้ด้วย key 'data' หรือ 'result'
        # โค้ดนี้จะพยายามดึงจากคีย์ 'data' หากไม่มีจะใช้ข้อมูลดิบทั้งหมด
        items_list = raw_data.get("data", raw_data)
        
        if not isinstance(items_list, list):
            print("โครงสร้างข้อมูลที่ส่งกลับมาไม่ใช่รูปแบบ List (Array)")
            return
            
        parsed_records = []
        
        for item in items_list:
            # ดึงค่าระดับน้ำมาคำนวณหรือใช้ตรงๆ ตามตัวแปรของคุณ (สมมติว่าดึงมาตรงๆ จากคีย์ที่ระบุ)
            wl_pct = item.get("wl_pct") 
            
            # จัดรูปแบบตารางตามโครงสร้างฟิลด์ที่คุณต้องการ
            record = {
                "รหัสสถานี": item.get("station_code"),
                "ชื่อสถานี": item.get("station_detail"),
                "จังหวัด": item.get("province_t"),
                "ระดับน้ำเทียบตลิ่ง (%)": wl_pct,
                "แนวโน้มระดับน้ำ": item.get("wl_trend"),
                "ระยะจากตลิ่ง (ม.)": item.get("pier_diff"),
                "อัตราการไหล (ลบ.ม./วิ)": item.get("q_values"),
                "% อัตราการไหล": item.get("qpercent"),
                "แนวโน้มอัตราการไหล": item.get("q_trend"),
                "Latitude": item.get("latitude"),
                "Longitude": item.get("longitude"),
                "เวลาบันทึกข้อมูล (UTC)": item.get("hourly_time_utc"),
            }
            
            # --- ส่วนเสริม: แปลงเวลา UTC เป็นเวลาไทย (+7 ชั่วโมง) ---
            utc_time_str = item.get("hourly_time_utc")
            if utc_time_str:
                try:
                    # แปลงข้อความเป็นวัตถุวันที่ และบอกระบบว่าเป็นเวลา UTC
                    utc_time = pd.to_datetime(utc_time_str).tz_localize('UTC')
                    # แปลงสลับให้กลายเป็นเวลาโซนเอเชีย/กรุงเทพฯ (+7)
                    thai_time = utc_time.tz_convert('Asia/Bangkok')
                    # จัดฟอร์แมตให้อ่านง่าย เช่น 2026-05-22 10:40:51
                    record["เวลาบันทึกข้อมูล (เวลาไทย)"] = thai_time.strftime('%Y-%m-%d %H:%M:%S')
                except:
                    record["เวลาบันทึกข้อมูล (เวลาไทย)"] = None
            else:
                record["เวลาบันทึกข้อมูล (เวลาไทย)"] = None
                
            parsed_records.append(record)
            
        # 1. จัดทำเป็นตาราง DataFrame
        df = pd.DataFrame(parsed_records)
        
        # 2. คลีนข้อมูลพิกัด (แปลงค่าสตริงให้เป็นตัวเลข และตัดแถวที่ไม่มีพิกัดทิ้ง)
        df["Latitude"] = pd.to_numeric(df["Latitude"], errors='coerce')
        df["Longitude"] = pd.to_numeric(df["Longitude"], errors='coerce')
        df = df.dropna(subset=["Latitude", "Longitude"])
        
        # ตรวจสอบว่ามีข้อมูลเหลือให้แปลงพิกัดไหม
        if df.empty:
            print("ไม่มีข้อมูลที่มีพิกัด Latitude/Longitude ที่สมบูรณ์")
            return
            
        # 3. สร้างเป็น GeoDataFrame พิกัดภูมิศาสตร์ WGS84 (EPSG:4326)
        geometry = [Point(xy) for xy in zip(df["Longitude"], df["Latitude"])]
        gdf = gpd.GeoDataFrame(df, geometry=geometry, crs="EPSG:4326")
        
        # 4. ส่งออกไฟล์ .geojson เพื่อให้ GitHub Actions นำไปอัปเดตต่อ
        output_file = "rid_realtime.geojson"
        gdf.to_file(output_file, driver="GeoJSON", encoding="utf-8")
        print(f"สำเร็จ! ดึงข้อมูลและสร้างไฟล์สำเร็จจำนวน {len(gdf)} สถานี")
        
    except Exception as e:
        print(f"เกิดข้อผิดพลาดระหว่างประมวลผล: {e}")

if __name__ == "__main__":
    fetch_rid_realtime()