import requests
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

def fetch_rid_realtime(basin="", province="", region="", rid="", date=""):
    """
    ดึงข้อมูลสถานีวัดน้ำแบบ Real-time จากกรมชลประทาน 
    พร้อมอัปเดตคีย์ข้อมูลล่าสุดปี 2026 และคำนวณ % ระดับน้ำให้โดยอัตโนมัติหากข้อมูลขาดหาย
    """
    # ลิงก์ API ของกรมชลประทาน พร้อมรองรับการใส่พารามิเตอร์ฟิลเตอร์
    api_url = f"https://bigdata-swoc.rid.go.th/api/ma/pier/all/get_pier_data?date=&basin=&province=&region=&rid="
    
    # เพิ่ม Headers เพื่อลดโอกาสโดนปฏิเสธการเชื่อมต่อจาก Server ภาครัฐ
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        # ส่งคำขอดึงข้อมูล (ใส่ timeout เผื่อกรณีเซิร์ฟเวอร์ตอบสนองช้า)
        response = requests.get(api_url, headers=headers, verify=True, timeout=30)
        
        if response.status_code != 200:
            print(f"ไม่สามารถเชื่อมต่อ API ได้ รหัสข้อผิดพลาด: {response.status_code}")
            return
            
        raw_data = response.json()
        
        # ตรวจสอบโครงสร้างข้อมูลที่ส่งกลับมา (ดึงจาก data หรือ result หรือใช้ตัวหลัก)
        items_list = raw_data.get("data", raw_data.get("result", raw_data))
        
        if not isinstance(items_list, list):
            print("โครงสร้างข้อมูลที่ส่งกลับมาไม่ใช่รูปแบบ List (Array)")
            return
            
        parsed_records = []
        
        for item in items_list:
            # 1. ดึงค่าเปอร์เซ็นต์ระดับน้ำจาก API โดยตรง (เช็คคีย์ที่เป็นไปได้ทั้งหมด)
            wl_pct = item.get("wlpercent") or item.get("wl_pct") or item.get("wl_percent")
            
            # 2. ดึงค่าระดับน้ำปัจจุบัน และระดับตลิ่งจากคีย์ใหม่ล่าสุด (wl_values และ bank_values)
            wl_current = pd.to_numeric(item.get("wl_values"), errors='coerce')
            # API ปัจจุบันส่งระดับตลิ่งในช่อง brae_level (bank_values ไม่มีแล้ว) — ยังรองรับชื่อเดิมไว้
            bank_raw = item.get("bank_values")
            if bank_raw is None:
                bank_raw = item.get("brae_level")
            bank_level = pd.to_numeric(bank_raw, errors='coerce')
            
            # 3. ถ้าระบบส่งค่า wl_pct มาเป็นข้อความ (String) ที่มีเครื่องหมาย % ติดมาด้วย ให้คลีนออกก่อน
            if isinstance(wl_pct, str):
                try:
                    wl_pct = float(wl_pct.replace('%', '').strip())
                except:
                    wl_pct = None
            else:
                wl_pct = pd.to_numeric(wl_pct, errors='coerce')

            # 4. ตรรกะ Fallback: ถ้าเปอร์เซ็นต์จาก API หายไป (เป็น None หรือ NaN) ให้ใช้สูตรคำนวณย้อนกลับทันที
            if wl_pct is None or pd.isna(wl_pct):
                try:
                    # % เทียบตลิ่งของกรมชลฯ วัดจากท้องน้ำ: (ระดับน้ำ - ท้องน้ำ) / (ตลิ่ง - ท้องน้ำ) x 100
                    # ถ้าไม่มีระดับท้องน้ำ ปล่อยเป็น None ดีกว่าคำนวณผิด
                    ground = pd.to_numeric(item.get("ground_level"), errors='coerce')
                    if pd.notna(wl_current) and pd.notna(bank_level) and pd.notna(ground) and bank_level > ground:
                        wl_pct = round((wl_current - ground) / (bank_level - ground) * 100, 2)
                except Exception:
                    wl_pct = None # ถ้าข้อมูลไม่พอที่จะคำนวณ ให้ปล่อยเป็น None เพื่อไม่ให้บอตรันพัง
            
            # จัดรูปแบบตารางตามโครงสร้างฟิลด์ที่คุณต้องการใช้แสดงผล
            record = {
                "รหัสสถานี": item.get("station_code"),
                "ชื่อสถานี": item.get("station_detail"),
                "จังหวัด": item.get("province_t"),
                "ระดับน้ำปัจจุบัน (ม.รทก.)": wl_current,  # เปลี่ยนมาใช้ค่าตัวเลขที่อัปเดตคีย์แล้ว
                "ระดับตลิ่ง (ม.รทก.)": bank_level,      # เปลี่ยนมาใช้ค่าตัวเลขที่อัปเดตคีย์แล้ว
                "ระดับน้ำเทียบตลิ่ง (%)": wl_pct,          # ช่องข้อมูลนี้จะกลับมาแสดงผลได้อย่างสมบูรณ์
                "แนวโน้มระดับน้ำ": item.get("wl_trend"),
                "ระยะจากตลิ่ง (ม.)": item.get("pier_diff"),
                "อัตราการไหล (ลบ.ม./วิ)": item.get("q_values"),
                "% อัตราการไหล": item.get("qpercent"),
                "แนวโน้มอัตราการไหล": item.get("q_trend"),
                "Latitude": item.get("latitude"),
                "Longitude": item.get("longitude"),
                "เวลาบันทึกข้อมูล (UTC)": item.get("hourly_time_utc"),
            }
            
            # --- แปลงเวลา UTC เป็นเวลาไทย (+7 ชั่วโมง) ---
            utc_time_str = item.get("hourly_time_utc")
            if utc_time_str:
                try:
                    utc_time = pd.to_datetime(utc_time_str).tz_localize('UTC')
                    thai_time = utc_time.tz_convert('Asia/Bangkok')
                    record["เวลาบันทึกข้อมูล (เวลาไทย)"] = thai_time.strftime('%Y-%m-%d %H:%M:%S')
                except:
                    record["เวลาบันทึกข้อมูล (เวลาไทย)"] = None
            else:
                record["เวลาบันทึกข้อมูล (เวลาไทย)"] = None

            # --- คอลัมน์เพิ่มเติม (ต่อท้ายเสมอ เพื่อไม่ให้กระทบคอลัมน์เดิมที่ระบบอื่นใช้อยู่) ---
            # ชื่อลุ่มน้ำใน API มีทั้ง "มูล" และ "ลุ่มน้ำมูล" จึงตัดคำนำหน้าให้เป็นแบบเดียวกัน
            basin = (item.get("basin_name") or "").strip()
            if basin.startswith("ลุ่มน้ำ"):
                basin = basin[len("ลุ่มน้ำ"):].strip()
            record["ลุ่มน้ำ"] = basin or None
            record["แม่น้ำ/ลำน้ำ"] = (item.get("river") or "").strip() or None
            record["อำเภอ"] = item.get("amphoe")
            record["ภาค"] = item.get("region")
            record["สำนักชลประทาน"] = item.get("rid_name")

            parsed_records.append(record)
            
        # 1. จัดทำเป็นตาราง DataFrame
        df = pd.DataFrame(parsed_records)
        
        if df.empty:
            print("ไม่พบข้อมูลสถานีใดๆ จาก API")
            return

        # 2. คลีนข้อมูลพิกัด (แปลงค่าสตริงให้เป็นตัวเลข และตัดแถวที่ไม่มีพิกัดทิ้ง)
        df["Latitude"] = pd.to_numeric(df["Latitude"], errors='coerce')
        df["Longitude"] = pd.to_numeric(df["Longitude"], errors='coerce')
        df = df.dropna(subset=["Latitude", "Longitude"])
        
        # ตรวจสอบอีกครั้งว่ามีข้อมูลพิกัดเหลือไหม
        if df.empty:
            print("ไม่มีข้อมูลที่มีพิกัด Latitude/Longitude ที่สมบูรณ์")
            return
            
        # 3. สร้างเป็น GeoDataFrame พิกัดภูมิศาสตร์ WGS84 (EPSG:4326)
        geometry = [Point(xy) for xy in zip(df["Longitude"], df["Latitude"])]
        gdf = gpd.GeoDataFrame(df, geometry=geometry, crs="EPSG:4326")
        
        # 4. ส่งออกไฟล์ .geojson เพื่อให้ GitHub Actions นำไปอัปเดตต่อในคลังข้อมูล (Repository)
        output_file = "rid_realtime.geojson"
        gdf.to_file(output_file, driver="GeoJSON", encoding="utf-8")
        print(f"สำเร็จ! ดึงข้อมูลและสร้างไฟล์สำเร็จจำนวน {len(gdf)} สถานี (กู้คืนช่องระดับน้ำเทียบตลิ่งเรียบร้อยแล้ว)")
        
    except Exception as e:
        print(f"เกิดข้อผิดพลาดระหว่างประมวลผล: {e}")

if __name__ == "__main__":
    # รันดึงข้อมูลสถานีทั้งหมดเป็นค่าเริ่มต้นตามที่บอตของคุณเรียกใช้งาน
    fetch_rid_realtime()
