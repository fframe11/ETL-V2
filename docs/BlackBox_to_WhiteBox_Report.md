# รายงานวิเคราะห์เจาะลึกการทำงานของระบบ SDOQAP
**Unveiling the System: From Black Box to White Box**

เอกสารฉบับนี้จัดทำขึ้นเพื่ออธิบายกลไกการทำงานเบื้องหลัง (Behind the Scenes) ของแพลตฟอร์ม SDOQAP (Scalable Data Observability and Quality Assurance Platform) โดยนำเสนอระบบที่อาจดูเหมือน "กล่องดำ" (Black Box) สำหรับผู้ใช้งานทั่วไป มาตีแผ่และอธิบายในรูปแบบ "กล่องใส" (White Box) เพื่อให้คณะกรรมการและผู้ที่เกี่ยวข้องเข้าใจตรรกะ ลำดับการทำงาน และเทคโนโลยีเชิงลึกที่ขับเคลื่อนอยู่เบื้องหลังระบบอย่างแท้จริง

---

## 1. เครื่องยนต์ตรวจสอบคุณภาพและกักกันข้อมูล (Spark Quality Engine & Data Segregation)

**⬛ ภาพจำแบบ Black Box:**
ผู้ใช้งานอัปโหลดไฟล์ หรือส่งข้อมูลผ่าน API แล้วจู่ๆ ระบบก็แจ้งว่า "ข้อมูลนี้ได้คะแนน 95% ข้อมูลสะอาดผ่านเข้าคลัง ส่วนข้อมูลที่มีปัญหาถูกแยกออกไปกักกันเรียบร้อยแล้ว"

**⬜ อธิบายแบบ White Box (มันทำงานอย่างไร?):**
กระบวนการนี้ขับเคลื่อนด้วย **Apache Spark (Distributed Processing)** โดยมีขั้นตอนทางวิศวกรรมข้อมูลดังนี้:
1. **Data Ingestion:** เมื่อไฟล์เข้ามา ระบบ Backend (FastAPI) จะไม่ประมวลผลเอง แต่จะบันทึกไฟล์ดิบลงใน **HDFS** ที่โซน /data/raw (Bronze Layer) และส่งคำสั่ง (Submit Job) ไปยัง Spark Master
2. **Rule Application (การรันกฎ):** Spark จะโหลดข้อมูลดิบขึ้นมาในหน่วยความจำ (DataFrame) และนำกฎที่ตั้งค่าไว้จาก Rules Hub มาสร้างเป็นเงื่อนไขทาง SQL (Spark SQL Conditions) เช่น:
   - **Null Checks:** col("price").isNotNull()
   - **Range Checks:** col("score") >= 0 AND col("score") <= 100
   - **Outlier Detection (IQR):** Spark จะคำนวณสถิติ pproxQuantile เพื่อหาค่า Q1, Q3 และสร้างกรอบขีดจำกัด (Lower Bound / Upper Bound) จากนั้นสร้างเงื่อนไขกรองค่าที่อยู่นอกกรอบ
3. **Data Segregation (การแยกสายน้ำ):**
   - Spark จะสร้าง DataFrame ตัวที่ 1 (df_active) ที่ตรงตามเงื่อนไขทั้งหมด (Valid Data)
   - Spark จะสร้าง DataFrame ตัวที่ 2 (df_quarantine) ที่ละเมิดเงื่อนไขใดเงื่อนไขหนึ่ง (Invalid Data)
4. **Error Breakdown:** สำหรับ df_quarantine ระบบจะเพิ่มคอลัมน์ _error_reason เพื่อประทับตราว่าแถวนี้ผิดเพราะกฎข้อไหน (เช่น 
ull_violation หรือ outlier_detected)
5. **Storage Writing:** Spark บันทึก df_active ลง HDFS ที่ /data/active (Silver Layer) และ df_quarantine ลง HDFS ที่ /data/quarantine จากนั้นส่งผลลัพธ์คะแนน (Quality Score) กลับไปบันทึกใน Elasticsearch

---

## 2. ระบบแนะนำกฎอัตโนมัติด้วย AI (AI Rule Advisor)

**⬛ ภาพจำแบบ Black Box:**
ผู้ใช้กดปุ่ม "Ask AI" ระบบคิดสักพักแล้วกรอกค่าพารามิเตอร์ (Null %, IQR Multiplier) หรือสร้างกฎการแปลงคำศัพท์ให้แบบอัตโนมัติ

**⬜ อธิบายแบบ White Box (มันทำงานอย่างไร?):**
ระบบไม่ได้มีเวทมนตร์ แต่ใช้หลักการ **Data Profiling + Prompt Engineering + Local LLM**
1. **Data Sampling:** FastAPI Backend จะไปดึงข้อมูลตัวอย่าง (Sample Data) 100 แถวแรกจากตารางใน HDFS
2. **Metadata Profiling:** ระบบจะคำนวณสถิติพื้นฐานด้วย Pandas (เช่น % ของค่าว่าง, ค่า Min/Max, ชนิดข้อมูลเบื้องต้น)
3. **Prompt Construction:** นำสถิติที่ได้มาประกอบรวมกับคำสั่งแม่แบบ (System Prompt) ที่เขียนบังคับให้ AI สวมบทบาทเป็น Data Engineer และบังคับให้ตอบกลับในรูปแบบ JSON เท่านั้น
4. **LLM Inference:** ส่ง Prompt ไปที่ **Ollama** (Local LLM ที่รันโมเดลอยู่ใน Docker Container ภายในเซิร์ฟเวอร์ โดยไม่ต้องพึ่งพาอินเทอร์เน็ต) 
5. **Response Parsing:** เมื่อ Ollama ตอบกลับมาเป็น JSON, ระบบ Backend จะทำการตรวจสอบโครงสร้าง (Validation) ถ้าถูกต้อง จะส่ง JSON นั้นไปที่ UI (React) เพื่อนำค่าไปเติมลงในฟอร์มของ Rules Hub ทันที

---

## 3. ระบบตรวจจับโครงสร้างข้อมูลเปลี่ยน (Schema Drift Detection)

**⬛ ภาพจำแบบ Black Box:**
เมื่อข้อมูลต้นทางมีการแอบเปลี่ยนโครงสร้าง (เช่น เพิ่มคอลัมน์ ลบคอลัมน์) ระบบจะหยุดรับข้อมูลชั่วคราวและแจ้งเตือนผู้ใช้ในหน้า Schema Drift

**⬜ อธิบายแบบ White Box (มันทำงานอย่างไร?):**
กระบวนการนี้เป็นเรื่องของการเปรียบเทียบ Metadata ของตาราง (Set Theory):
1. **Fetch Current Schema:** ก่อนที่ Spark จะเริ่มกระบวนการคลีนข้อมูล ระบบจะดึง "โครงสร้างข้อมูลล่าสุดที่ได้รับการอนุมัติ" (Expected Schema) จาก Elasticsearch
2. **Extract Incoming Schema:** ดึงโครงสร้างข้อมูลของ DataFrame ชุดใหม่ที่เพิ่งเข้ามา (Actual Schema)
3. **Comparison (การเทียบเคียง):** 
   - ระบบจะทำ Set Difference ระหว่าง Actual Columns กับ Expected Columns 
   - หากเจอ Actual - Expected = พบคอลัมน์ใหม่ (New Fields)
   - หากเจอ Expected - Actual = พบคอลัมน์หายไป (Missing Fields)
   - เช็ค Data Type แบบ 1:1 ว่าตรงกันหรือไม่
4. **Drift Handling:** หากพบความแตกต่าง ระบบจะตั้งสถานะการรันนั้นเป็น PENDING เก็บลง Elasticsearch และหยุดการทำงาน (ไม่เขียนข้อมูลลง Data Lake) เพื่อรอให้ Data Engineer มากดปุ่มอนุมัติ (Accept) หรือปฏิเสธ (Reject) ก่อน

---

## 4. ระบบการติดตามเส้นทางข้อมูล (Real-time Data Lineage)

**⬛ ภาพจำแบบ Black Box:**
ในแดชบอร์ดมีผังกราฟแสดงก้อนข้อมูล (Nodes) และเส้นเชื่อมโยง (Edges) ที่เคลื่อนไหวและเปลี่ยนสี (เช่น กลายเป็นสีแดงเมื่อข้อมูลถูกกักกัน) โดยอัตโนมัติ

**⬜ อธิบายแบบ White Box (มันทำงานอย่างไร?):**
การสร้าง Lineage แบบ Real-time ใช้สถาปัตยกรรม **Event-Driven & Graph Rendering**:
1. **Event Emitting:** ในโค้ดของ Spark ทุกครั้งที่มีการกระทำสำคัญ เช่น (1) เริ่มอ่านไฟล์ดิบ (2) สแกนกฎคุณภาพ (3) เขียนข้อมูลลง Active หรือ Quarantine โค้ดจะยิง HTTP POST (Event Log) ไปหา Backend
2. **Lineage Indexing:** Event เหล่านี้จะถูกบันทึกลง **Elasticsearch** (Index: sdoqap_pipeline_logs) พร้อมกับ un_id, 	imestamp และ status
3. **UI Polling & Graphing:** หน้า React แดชบอร์ดจะยิง API ไปหา Backend ทุกๆ 5-10 วินาที เพื่อดึงสถานะล่าสุดของแต่ละโหนด 
4. **Conditional Rendering:** โค้ด Frontend ฝั่ง React (ใช้ไลบรารีในการวาดโหนด) จะอ่านสถานะ:
   - ถ้าสถานะเป็น SUCCESS -> วาดเส้นสีเขียว (ข้อมูลไหลผ่านปกติ)
   - ถ้าสถานะเป็น QUARANTINED หรือมีจำนวนแถวที่ตกเกณฑ์ > 0 -> วาดเส้นเชื่อมไปยังโหนด Quarantine ด้วย "สีแดง" เพื่อสื่อสารถึง Danger Path หรือท่อข้อมูลที่มีรอยรั่ว

---

## 5. การพยากรณ์คุณภาพล่วงหน้า 7 วัน (7-Day Quality Forecast)

**⬛ ภาพจำแบบ Black Box:**
หน้า Analytics แสดงกราฟเส้นพยากรณ์ว่าคุณภาพข้อมูลในอนาคตจะเป็นอย่างไร พร้อมกรอบความเชื่อมั่น (แถบสีอ่อน)

**⬜ อธิบายแบบ White Box (มันทำงานอย่างไร?):**
ระบบใช้หลักการทางสถิติและการเรียนรู้ของเครื่องอย่างง่าย (Statistical Machine Learning):
1. **Data Aggregation:** Backend จะ Query ดึงคะแนนคุณภาพของตารางนั้นๆ ย้อนหลัง 15-30 รันล่าสุดจาก Elasticsearch (Gold Layer) มาเรียงตามลำดับเวลา ($ = วันที่, $ = คะแนนคุณภาพ)
2. **Linear Regression:** ใช้ไลบรารีสถิติใน Python (เช่น scipy.stats.linregress หรืออัลกอริทึมคณิตศาสตร์แบบ Least Squares) ค้นหาสมการเส้นตรง  = mx + c$ ที่ลากผ่านจุดข้อมูลเหล่านั้นได้ดีที่สุด
3. **Confidence Interval (CI):** คำนวณค่าความคลาดเคลื่อนมาตรฐาน (Standard Error) จากข้อมูลจริง เพื่อหาช่วง Upper Bound และ Lower Bound ของเส้นพยากรณ์ (เช่น ความมั่นใจ 95%)
4. **Extrapolation:** แทนค่า $ ไปข้างหน้าอีก 7 วัน เพื่อให้ได้ผลลัพธ์ $ ล่วงหน้า จากนั้นส่งชุดตัวเลขเหล่านั้นกลับไปให้ React นำไปพล็อตเป็นเส้นประบนกราฟ (Recharts)

---
**บทสรุป (Conclusion)**
ด้วยการเปิดกล่องดำของระบบ SDOQAP จะเห็นได้ว่าระบบนี้ถูกสร้างขึ้นด้วยหลักการทาง Data Engineering ที่โปร่งใสและตรวจสอบได้ในทุกขั้นตอน ไม่ได้พึ่งพาปาฏิหาริย์ แต่ใช้การผสานระหว่าง **Distributed Computing (Spark)**, **Statistical Math**, และ **Event-driven Architecture** เพื่อสร้างท่อข้อมูลที่แข็งแกร่งและไว้ใจได้อย่างเป็นรูปธรรม