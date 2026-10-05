# วิเคราะห์ UI ทีละหน้า (ภาค 1): Home / แถบเมนู NavBar / Login / Learn & Architecture

> เอกสารนี้อ่านจากโค้ดจริงใน `C:\ETL` ทุกข้อมีการอ้างอิง `ไฟล์:บรรทัด` ข้อไหนตรวจในโค้ดไม่พบจะระบุว่า "ตรวจไม่พบในโค้ด"
> (path ย่อ: `UI/` = `services/ui/src/`, `API/` = `services/api/app/api/`, `SPARK/` = `services/spark/`)

## คำอธิบายป้ายกำกับแหล่งข้อมูล

| ป้าย | ความหมาย |
|---|---|
| 🟢 | ข้อมูลจริงจาก Backend (ดึงจาก API / Elasticsearch / บริการจริง) |
| 🟡 | ข้อมูลที่คำนวณจากระบบ (คำนวณจากข้อมูลจริงในหน้าเว็บหรือ Backend, ระบุสูตร) |
| 🔴 | Mock / Static / ค่าคงที่ฮาร์ดโค้ด (เขียนตายตัวในโค้ด หรือค่า fallback ตัวอย่าง) |
| ⚪ | UI ที่มีแต่ยังไม่ได้เชื่อมระบบจริง (ปุ่ม/ส่วนที่ไม่ทำอะไร หรือเรียกสิ่งที่ไม่มี) |

## ภาพรวมสถาปัตยกรรมที่ใช้ร่วมกันทุกหน้า (อธิบายครั้งเดียว)

- เบราว์เซอร์เรียก `/api/v1/...` -> nginx (`services/ui/nginx.conf`: บล็อก `location /api/` ส่งต่อไป `http://api:8000/api/`) -> FastAPI (`services/api/main.py:72-84` ลงทะเบียน router ทั้งหมด)
- ฟังก์ชันดึงข้อมูลกลางคือ `useApi(endpoint, {refreshInterval})` (`UI/hooks/useApi.js:5-33`): เรียก `fetch("/api/v1"+endpoint)` (บรรทัด 14), ถ้าได้ 401 และไม่ได้อยู่หน้า login จะเด้งไป `/login` (บรรทัด 15-18), ถ้า error จะเก็บข้อความไว้ใน `error` **แต่ไม่ล้างข้อมูลเก่าที่เคยได้มา** (บรรทัด 24 ไม่เรียก `setData(null)`) และถ้าตั้ง `refreshInterval` จะดึงซ้ำเป็นรอบ ๆ (บรรทัด 31-34)
- "Elasticsearch (ES)" คือฐานข้อมูลค้นหาที่ Spark เขียนผลการตรวจคุณภาพลงไป; Home/NavBar ไม่ได้สั่งให้ Spark ทำงานเลย แค่อ่านผลที่ Spark เขียนไว้แล้ว

---

# หน้า 1: Home (หน้าแรก `/`)

| Frontend file | API endpoints | Backend handler | Storage |
|---|---|---|---|
| `UI/pages/Home.jsx` (+ `config/pages.js`) | `GET /api/v1/services/status` (รีเฟรชทุก 30 วิ, Home.jsx:9) | `API/system.py:42-84` `get_services_status()` | ไม่แตะที่เก็บข้อมูล: ลองเปิด TCP port ของแต่ละบริการ |
| | `GET /api/v1/kpi/stats` (ทุก 30 วิ, Home.jsx:10) | `API/analytics.py:12-88` `get_kpi_stats()` | Elasticsearch index `sdoqap_quality_runs` (+ `sdoqap_pipeline_runs` สำหรับ MTTD ที่ Home ไม่ได้ใช้) |
| | `GET /api/v1/schema/proposals` (ทุก 10 วิ, Home.jsx:19) | `API/schema.py:38-52` `list_proposals()` | ES index `sdoqap_schema_proposals` |
| | `GET /api/v1/rules/ai-proposals` (ทุก 10 วิ, Home.jsx:30) | `API/dynamic_rules.py:422-470` `list_ai_proposals()` | ES index `sdoqap_ai_rule_proposals` (หรือตัวอย่างฮาร์ดโค้ด ถ้าว่าง) |

**ข้อสังเกตด้านสิทธิ์:** Route `/` ของ Home **ไม่ได้ห่อด้วย `RequireAuth`** (`UI/App.jsx:100`) ใครก็เปิดดูได้โดยไม่ต้อง login ส่วนหน้าอื่น ๆ ห่อด้วย `RequireAuth` (App.jsx:101-111) และทั้ง 4 endpoint ข้างบนเป็น GET ที่ **ไม่มี `Depends(require_session)`** (ตรวจที่ system.py:42, analytics.py:12, schema.py:38, dynamic_rules.py:422) จึงเรียกได้โดยไม่ล็อกอิน

## 1.1 ส่วนหัว (Hero) ซ้ายมือ

- **[ป้าย "SDOQAP Observability Platform", หัวข้อ "More than observability. Complete Data Quality Management.", คำอธิบาย "ตรวจ คัดแยก และติดตามคุณภาพข้อมูลในที่เดียว"]** 🔴 → (2) ข้อความโฆษณาระบบ เขียนตายตัวใน Home.jsx:65-72 ไม่ได้ดึงจากไหน (3) ไม่มี API (4) แสดงผลอย่างเดียว
- **[ปุ่ม "เริ่มนำเข้าข้อมูล"]** 🔴 (เป็นลิงก์นำทางล้วน ไม่มีข้อมูลจริง) → (1) กดแล้วไปหน้า `/ingestion` (Data Ingestion, ขั้นตอนที่ 1) ถ้ายังไม่ login จะถูก `RequireAuth` ส่งไป `/login` ก่อน (App.jsx:20-31) (3) `<Link to="/ingestion">` Home.jsx:74 ไม่เรียก API (4) หน้า Ingestion โหลดขึ้นมา
- **[ปุ่ม "อ่านคู่มือ"]** 🔴 → (1) กดแล้วไปหน้า `/guide` (Learn & Architecture) Home.jsx:77 (ต้อง login เช่นกัน เพราะ `/guide` อยู่ใน RequireAuth, App.jsx:107) (3) ไม่เรียก API

## 1.2 กล่อง "LIVE INGESTION CHANNELS" (Home.jsx:85-111)

ส่วนนี้ **ไม่ได้ดึงข้อมูลช่องทางนำเข้าข้อมูลจริง** แต่หยิบ "สถานะพอร์ต" ของ 3 บริการจาก `/services/status` มาตั้งชื่อเป็นช่องทางเอง

- **[ป้ายสถานะรวมมุมขวาบน ACTIVE / PARTIAL / OFFLINE]** 🟡 → (2) สรุปสถานะรวม (3) ใช้ข้อมูลจาก `/services/status` ของ Kafka Broker, Postgres DB, REST Ingestion API (Home.jsx:45-58) (4) สูตร: ทั้ง 3 บริการ online = **ACTIVE** (สีเขียว); online อย่างน้อย 1 = **PARTIAL** (เหลือง); ไม่มีเลย = **OFFLINE** (แดง) **ข้อควรระวัง:** ระหว่างกำลังโหลด หรือเมื่อ API ล้ม (ข้อมูล `services` เป็น null) ตัวแปรจะประเมินเป็น false หมด จึงโชว์ **OFFLINE สีแดง** ทั้งที่จริงคือ "ไม่รู้สถานะ" (ไม่มี guard `loading`/`error` ในส่วนนี้ ต่างจากกล่อง Infrastructure ด้านล่าง)
- **[แถว "Kafka reddit_streaming" + ป้าย Ingesting/Offline]** 🟡 (ชื่อแถวเป็น 🔴) → (2) ถ้าพอร์ต Kafka (kafka:9092) เปิดอยู่ แสดง "Ingesting" ถ้าไม่ แสดง "Offline" (Home.jsx:91-96) **ความจริง:** คำว่า Ingesting หมายถึง "Kafka เปิดพอร์ตอยู่" เท่านั้น ไม่ได้ตรวจว่ากำลังมีข้อมูลไหลเข้าจริง และชื่อ `reddit_streaming` ตรวจไม่พบในโค้ด Backend/Spark เป็น topic ที่ชื่อนี้เลย (ค้นแล้วพบเฉพาะใน Home.jsx:92)
- **[แถว "Postgres JDBC Ingest" + ป้าย Idle/Offline]** 🟡 (ชื่อแถวเป็น 🔴) → (2) พอร์ต Postgres (postgres:5432) เปิด = แสดง "Idle" ตายตัว (Home.jsx:98-102) **ไม่มีการตรวจว่ามีงาน JDBC ทำอยู่หรือไม่** ป้าย "Idle" เป็นคำเขียนตายตัว ไม่เคยเปลี่ยนเป็นสถานะอื่น
- **[แถว "REST telemetry_api" + ป้าย Active/Offline]** 🟡 (ชื่อแถวเป็น 🔴) → (2) ตรวจพอร์ต `api:8000` (คือตัว FastAPI เอง) เปิด = "Active" (Home.jsx:104-110; พอร์ตระบุที่ system.py:69) ถ้าหน้าเว็บโหลดข้อมูลมาได้ ค่านี้แทบจะเป็น Active เสมอ เพราะเป็นการเช็กตัวเอง ชื่อ `telemetry_api` ตรวจไม่พบในโค้ดส่วนอื่น

## 1.3 การ์ดตัวเลข 3 ใบใต้กล่อง (Home.jsx:112-137)

ทั้ง 3 ใบใช้ข้อมูลจาก `GET /api/v1/kpi/stats` -> `get_kpi_stats()` (analytics.py:12-88) ซึ่งทำงานดังนี้: (ก) ลองต่อ TCP ไปที่ ES ภายใน 0.1 วิ ถ้าไม่ติดตอบ HTTP 503 (analytics.py:15-26) (ข) ถ้ายังไม่มี index `sdoqap_quality_runs` ตอบ `{total_records_ingested:0, global_quality_score:null,...}` (บรรทัด 30-36) (ค) ไม่งั้นยิง aggregation เดียวบน index นั้น: `sum(total_records)`, `sum(quarantined_records)`, `avg(quality_score)` (บรรทัด 37-47) **ไม่กรองตามตารางหรือช่วงเวลา = รวมทุกรอบที่เคยรันทุกตาราง** แต่ละเอกสารใน `sdoqap_quality_runs` ถูกสร้างโดย Spark ตอนจบทุกการรันตรวจคุณภาพ (`SPARK/sdoqap/stages/report.py:60`, สร้างฟิลด์ที่ report.py:18-21)

- **[การ์ด "AVG Quality Score"]** 🟢 (ตัวเลข) + 🟡 (การปัดเศษ) → (2) คะแนนคุณภาพเฉลี่ยทั้งระบบ แสดงเป็น `xx.x%` หรือ `---` ถ้าไม่มีค่า (Home.jsx:114-117) (3) ค่า `global_quality_score` = `round(avg(quality_score), 2)` จาก ES (analytics.py:49-52) แล้วหน้าเว็บ `.toFixed(1)` (4) สูตรของคะแนนต่อ 1 รอบที่ Spark คำนวณ: `quality_score = (จำนวนแถวสะอาด / จำนวนแถวทั้งหมด) × 100` (`SPARK/sdoqap/stages/metrics.py:172-174`) และถ้าไฟล์ว่าง (0 แถว) ถูกกำหนดเป็น 0.0% (metrics.py:170-171) ดังนั้นค่าบนการ์ดคือ **"ค่าเฉลี่ยของคะแนนทุกรอบ" ไม่ถ่วงน้ำหนักด้วยจำนวนแถว** รอบที่เล็ก ๆ มีผลเท่ารอบใหญ่
- **[การ์ด "Records Checked"]** 🟢 → (2) จำนวนแถวข้อมูลที่ถูกตรวจทั้งหมด (3) `total_records_ingested = int(sum(total_records))` (analytics.py:49,79) (4) แสดง `1.2M` ถ้า ≥ 1,000,000 ไม่งั้นแสดงตัวเลขคั่นหลักพัน (Home.jsx:121-125) แสดง `---` ถ้ายังไม่ได้ข้อมูล **ข้อควรรู้:** ถ้ารันตารางเดิมซ้ำหลายครั้ง แถวจะถูกนับซ้ำทุกรอบ (เป็น "จำนวนแถวที่ตรวจสะสมทุกรอบ" ไม่ใช่ "จำนวนแถวไม่ซ้ำ")
- **[การ์ด "Quarantine Rate"]** 🟡 → (2) อัตราข้อมูลที่ถูกกักกัน (Quarantine = พื้นที่กักข้อมูลเสียไว้ก่อนใช้งาน) (3) ใช้ `quarantined_records` = `int(sum(quarantined_records))` (analytics.py:50,81) และ `total_records_ingested` (4) **สูตรคำนวณในเบราว์เซอร์** (Home.jsx:131-133): `(quarantined_records ÷ total_records_ingested) × 100` แสดงทศนิยม 3 ตำแหน่ง **ข้อควรระวัง (ค่าศูนย์ปลอม):** ถ้า API ล้ม (`kpis.data` เป็น null) หรือยอดรวม = 0 การ์ดนี้จะโชว์ **`0.000%`** ตายตัว (Home.jsx:134 เงื่อนไข else) ขณะที่สองใบแรกโชว์ `---` จึงอาจทำให้เข้าใจผิดว่า "ไม่มีข้อมูลเสียเลย" ทั้งที่จริงคือ "ไม่มีข้อมูล/ต่อไม่ได้"
- **หมายเหตุ:** `/kpi/stats` ยังส่ง `mttd_minutes` (เวลาเฉลี่ยของงาน = เฉลี่ย `duration_seconds` ของ 20 รันล่าสุดที่ไม่ fail ÷ 60; analytics.py:54-76) แต่ Home.jsx **ไม่ได้ใช้** ค่านี้
- **ถ้า ES ล่ม:** API ตอบ 503 -> `useApi` ตั้ง `error` แต่ไม่ล้าง `data` เก่า (useApi.js:24) ถ้าเคยโหลดสำเร็จมาก่อน ตัวเลขเก่าจะค้างอยู่ในหน้าจอโดยไม่มีข้อความเตือน; ถ้ายังไม่เคยสำเร็จ จะเห็น `---`, `---`, `0.000%`
- **มีข้อมูลสาธิตปลอมไหม:** `API/analytics.py` ตั้งใจไม่ส่งเลขปลอม (คอมเมนต์ analytics.py:14) มีสคริปต์ `services/api/seed_es.py` สำหรับยัดข้อมูลทดสอบลง ES (รีเซ็ต 5 index รวม `sdoqap_quality_runs` ที่ seed_es.py:30) แต่ตรวจไม่พบว่าถูกเรียกอัตโนมัติจาก `docker-compose.yml` (พบอ้างถึงใน CI `.github/workflows/ci.yml` เท่านั้น) ถ้าเดโมด้วยข้อมูลที่ seed ไว้ ตัวเลขจะมาจากข้อมูลทดสอบนั้น (ควรเช็กก่อนพรีเซนต์)

## 1.4 กล่อง "Live Infrastructure Connections" (Home.jsx:143-167)

- **[หัวข้อ + คำอธิบาย "Real-time service nodes configuration checks"]** 🔴 → ข้อความตายตัว (Home.jsx:145-146)
- **[ข้อความ "Checking health..."]** 🔴 → แสดงตอนยังโหลดครั้งแรก (Home.jsx:147-150)
- **[แถบแดง "Failed to connect to health check API service."]** 🔴 → แสดงเมื่อเรียก `/services/status` ล้มเหลว (Home.jsx:151-154) (เป็นข้อความตายตัว แต่ถูกต้องตามเหตุการณ์ ไม่ได้แสดงเลขปลอม)
- **[การ์ดบริการ 11 ใบ: HDFS Namenode, HDFS Datanode, Elasticsearch, Kibana, Grafana, n8n Orchestrator, Spark Master, Spark Worker, Kafka Broker, Postgres DB, REST Ingestion API]** 🟢 → (1) ไม่ใช่ปุ่ม กดไม่ได้ (2) จุดสีเขียว = online, แดง = offline พร้อมตัวอักษร `ONLINE/OFFLINE` (Home.jsx:157-163) รายชื่อ 11 บริการมาจากตัวแปร `services` ที่ Backend กำหนดไว้ตายตัว (system.py:58-70) (3) `get_services_status()` (system.py:42-84) สั่งเช็กทุกบริการพร้อมกันด้วย thread pool: เปิดการเชื่อมต่อ TCP ไปที่ host:port ของบริการ (เช่น `elasticsearch:9200`, `kafka:9092`, `postgres:5432`) ด้วย timeout 0.2 วิ ต่อครั้ง และลองซ้ำที่ `127.0.0.1` เป็นตัวสำรอง (system.py:44-55) รอผลสูงสุด 0.5 วิ ไม่ทันนับเป็น offline (system.py:76-78) (4) ผลไม่ถูกเก็บไว้ที่ไหน คำนวณใหม่ทุกครั้งที่เรียก **ข้อจำกัด:** "online" แปลว่า "พอร์ตเปิดรับการเชื่อมต่อ" ไม่ได้แปลว่าบริการทำงานถูกต้อง (เช่น ES เปิดพอร์ตแต่ cluster อาจไม่พร้อม) Backend ส่งฟิลด์ `url` มาด้วย (ลิงก์ไป Kibana/Grafana/Spark UI ฯลฯ) แต่ Home.jsx **ไม่ได้ใช้ ฟิลด์ `url`** การ์ดจึงคลิกไปเปิดบริการไม่ได้ (⚪ ฟิลด์ที่ส่งมาแต่ไม่ใช้)

## 1.5 ส่วน "4 ขั้นตอน" (Home.jsx:169-180)

- **[การ์ดลำดับ 1-4: Data Ingestion / Expectations & Alerts / Jobs & Pipelines / Workspace Exports]** 🔴 → (1) กดแล้วไปหน้านั้น (Link ไป `p.path`) (2) ชื่อ คำอธิบาย และลำดับ มาจากรายการตายตัว `PAGES` ที่มี `step` (`UI/config/pages.js:10-13`, สร้าง `WORKFLOW_STEPS` ที่ pages.js:21) (3) ไม่เรียก API (4) นำทางไปหน้าตามเส้นทาง `/ingestion`, `/rules`, `/pipeline`, `/export`

## 1.6 ส่วน "เริ่มจากบทบาทของคุณ" (Home.jsx:182-200)

- **[การ์ด 4 ใบ: Data Engineer->Data Ingestion, Data Steward/Compliance->Catalog, ผู้บริหาร->Dashboards, Analyst/ML->Workspace Exports]** 🔴 → (1) กดแล้วไปหน้าที่แนะนำ (2) การจับคู่บทบาท->หน้า เขียนเป็นอาร์เรย์ตายตัวใน Home.jsx:185-190; ชื่อหน้าอ้างจาก `getPage(page)` (pages.js:23-27) (3) ไม่เรียก API **ไม่มีระบบบทบาทผู้ใช้จริง** (ตรวจไม่พบในโค้ด; ระบบ login มีผู้ดูแลคนเดียว ดูหน้า Login) การ์ดเป็นแค่ทางลัดแนะนำ

## 1.7 โค้ดที่ไม่ได้ใช้ในหน้านี้ (ควรรู้)

- `schemaCount` / `aiRulesCount` ใน Home.jsx:13-14 และ `useEffect` ดึงตัวเลขรอบ 10 วินาที (Home.jsx:16-43) **ถูกเขียนค่าแต่ไม่ถูกนำไปแสดงที่ใดใน JSX ของ Home** (ค้นแล้วไม่พบการใช้ในส่วน render) ⚪ แต่ยังยิง API ทุก 10 วิ โดยเปล่าประโยชน์ (ตัวนับที่แสดงจริงอยู่ที่ NavBar)

**สรุป 3 คำตอบ — หน้า Home**
- **หน้านี้มีไว้ทำอะไร?** หน้าต้อนรับที่สรุปสุขภาพระบบ ตัวเลขคุณภาพข้อมูลโดยรวม และทางลัดไปยัง 4 ขั้นตอนการทำงาน
- **ผู้ใช้ทำอะไรได้?** ดูสถานะบริการ/ตัวเลข KPI และกดลิงก์ไปหน้านำเข้าข้อมูล คู่มือ ขั้นตอนทั้ง 4 หรือหน้าตามบทบาท (ไม่มีปุ่มที่แก้ไขข้อมูลใด ๆ)
- **ระบบทำอะไรเบื้องหลัง?** ทุก 30 วิ เช็กพอร์ต 11 บริการ (TCP) และรวมยอด/เฉลี่ยจาก ES index `sdoqap_quality_runs` ที่ Spark เขียนไว้; ทุก 10 วิ นับข้อเสนอ Schema/กฎ AI (แต่ผลไม่ถูกแสดงบน Home)

---

# หน้า 2: แถบเมนูด้านข้างและสถานะระบบ (NavBar — แสดงในทุกหน้า ยกเว้น /login)

| Frontend file | API endpoints | Backend handler | Storage |
|---|---|---|---|
| `UI/components/NavBar.jsx`, `UI/config/pages.js`, `UI/hooks/useApi.js`, `UI/hooks/useAuth.js`, `UI/utils/serviceHealth.js`, `UI/App.jsx` | `GET /services/status` (ทุก 15 วิ, NavBar.jsx:127) | `API/system.py:42-84` | พอร์ต TCP ของบริการ |
| | `GET /schema/proposals` + `GET /rules/ai-proposals` (ทุก 10 วิ, NavBar.jsx:95,106) | `API/schema.py:38`, `API/dynamic_rules.py:422` | ES `sdoqap_schema_proposals`, `sdoqap_ai_rule_proposals` |
| | `GET /auth/me`, `POST /auth/logout` | `API/auth.py:139-141`, `auth.py:133-136` | คุกกี้ `sdoqap_session` (ไม่มีตารางเก็บ session) |

(NavBar ไม่แสดงบนหน้า `/login` เพราะ App.jsx:75-83 คืนค่าเฉพาะ `<Login/>` เมื่ออยู่ที่ `/login`)

## 2.1 ส่วนหัวและปุ่มพับเมนู

- **[โลโก้ "SDOQAP / Lakehouse Engine"]** 🔴 → (1) กดแล้วไปหน้า Home `/` (NavBar.jsx:234) (2) ข้อความตายตัว (NavBar.jsx:241-242) แสดงเฉพาะตอนเมนูกาง
- **[ปุ่มขีด 3 ขีด (Hamburger)]** 🔴 (UI ล้วน แต่ทำงานจริง) → (1) พับ/กางแถบเมนู (NavBar.jsx:246-261 เรียก `toggleSidebar`) (3) `toggleSidebar` ใน App.jsx:126-132 สลับค่า `isSidebarOpen` และบันทึกลง **localStorage ของเบราว์เซอร์** คีย์ `sdoqap_sidebar_open` (App.jsx:122,128) (4) ค่านี้จำอยู่ที่เครื่องผู้ใช้ ไม่ส่งไป Backend
- **[แถบขอบขวาของเมนู (Edge Rail)]** 🔴 → (1) คลิกที่ขอบเมนูเพื่อพับ/กางเช่นเดียวกับ Hamburger (NavBar.jsx:220-229)

## 2.2 ปุ่ม "+ นำเข้าข้อมูล"

- **[ปุ่ม "+ นำเข้าข้อมูล"]** 🔴 → (1) ลัดไปหน้า `/ingestion` (NavBar.jsx:267-287; เมนูพับจะเหลือปุ่ม "+" NavBar.jsx:291-311) (3) ลิงก์ล้วน ไม่เรียก API

## 2.3 รายการเมนู (กลุ่มและหน้า)

เมนูสร้างจากรายการตายตัว `PAGES` / `NAV_GROUPS` (pages.js:1-19) ผ่าน NavBar.jsx:141-152 ชื่อ/คำอธิบายจึงตายตัว 🔴 แต่ตัวเลข badge เป็น 🟢 (ดูข้อ 2.4)

| กลุ่ม | หน้า (ป้าย -> path) |
|---|---|
| (ไม่มีหัวข้อ) | Home `/`, Learn & Architecture `/guide` |
| ขั้นตอนการทำงาน | 1 Data Ingestion `/ingestion`, 2 Expectations & Alerts `/rules`, 3 Jobs & Pipelines `/pipeline`, 4 Workspace Exports `/export` |
| ติดตามและตรวจสอบ | Dashboards `/dashboard`, Create Dashboard `/dashboard-builder`, Query & Metrics `/analytics`, Catalog `/schema`, Audit Trail `/whitebox` |

- **[หัวข้อกลุ่ม "ขั้นตอนการทำงาน" / "ติดตามและตรวจสอบ"]** 🔴 → (1) กดเพื่อพับ/กางกลุ่ม (NavBar.jsx:322-330) (2) สถานะพับเก็บใน state ของ React ชั่วคราว (`collapsedGroups`, NavBar.jsx:84-88) **ไม่ถูกจำข้ามการรีโหลดหน้า**
- **[รายการเมนูแต่ละหน้า]** 🔴 → (1) กดแล้วเปลี่ยนหน้าด้วย React Router (NavBar.jsx:338-394) รายการที่ตรงกับ path ปัจจุบันจะถูกไฮไลต์ (บรรทัด 335-336 และ `/guideline` ถือเป็น `/guide`) (3) ไม่เรียก API ถ้ายังไม่ล็อกอิน การเข้าหน้าที่ห่อ `RequireAuth` จะเด้งไป `/login` (App.jsx:20-31)
- **[ป้ายตัวเลขขั้น 1-4 ข้างชื่อเมนู]** 🔴 → มาจาก `step` ตายตัวใน pages.js (NavBar.jsx:148,355-384) (ตัวเลือกสีเขียว `highlightTag` ไม่เคยถูกตั้งค่า จึงไม่ถูกใช้ ⚪)

## 2.4 ตัวเลข badge "N รอ" (รออนุมัติ)

- **[Badge ข้างเมนู Catalog (`/schema`)]** 🟢 + 🟡 → (2) จำนวน "ข้อเสนอเปลี่ยนโครงสร้างตาราง (Schema Drift = โครงสร้างข้อมูลต้นทางเปลี่ยนไป) ที่รอการอนุมัติ" (3) `fetch("/api/v1/schema/proposals")` NavBar.jsx:95 -> `list_proposals()` (schema.py:38-52) อ่าน ES index `sdoqap_schema_proposals` กรอง `status = PENDING` เรียงใหม่สุด ดึงสูงสุด **50 รายการ** (schema.py:51-53 ด้วยค่า size 50) (4) หน้าเว็บกรองซ้ำ `status === "PENDING"` แล้ว `.length` (NavBar.jsx:98-99) ถ้าไม่มี index หรือ ES ล่ม ตอบ `[]` ตัวเลขเป็น 0 แบบเงียบ ๆ (schema.py:43-47) -> ไม่แสดง badge (NAV_BADGES, NavBar.jsx:137-140) แสดงตัวเลขเฉพาะตอนล็อกอิน (NavBar.jsx:92) เพราะมี `if (!isAuthenticated) return;`
- **[Badge ข้างเมนู Expectations & Alerts (`/rules`)]** 🟢 แต่ **อาจเป็น 🔴 ตัวอย่างปลอม** → (2) จำนวน "ข้อเสนอกฎคุณภาพจาก AI (AI Rule Proposals) ที่รออนุมัติ" (3) `fetch("/api/v1/rules/ai-proposals")` NavBar.jsx:106 -> `list_ai_proposals()` (dynamic_rules.py:422-470) อ่าน ES index `sdoqap_ai_rule_proposals` กรอง `status = PROPOSED` (บรรทัด 433-446) (4) **ข้อเท็จจริงสำคัญ:** ถ้าใน ES ไม่มีข้อเสนอเลย (หรือ ES ล่ม) Backend จะ **เติม "ข้อเสนอตัวอย่าง 3 รายการ" ที่เขียนตายตัวไว้ในโค้ด** (`_FALLBACK_AI_PROPOSALS`, dynamic_rules.py:383-418 เช่น `student_course_scores`, `users`) แล้วคืน `count: 3` พร้อมธง `is_example: true` (dynamic_rules.py:454-468) หน้า NavBar อ่านแต่ `aiData.count` (NavBar.jsx:109) **ไม่ได้ดูธง `is_example`** จึงอาจแสดง badge "3 รอ" ทั้งที่เป็นข้อมูลตัวอย่าง ไม่ใช่ข้อเสนอจริงของ AI และเมื่อ count > 0 ลิงก์เมนู Rules จะเปลี่ยนเป็น `/rules?tab=proposals` (NavBar.jsx:145)
- **[จุดแดงเล็ก ๆ (badge dot) ตอนเมนูพับ]** 🟢 → แสดงเมื่อมีตัวเลขรอ (NavBar.jsx:346-348) ใช้ข้อมูลเดียวกับด้านบน
- **การดึงซ้ำสามที่:** ตัวนับนี้ถูกดึงทุก 10 วิ ที่ NavBar (NavBar.jsx:116-119), App.jsx:46-74 (ค่าใน App ไม่ถูกส่งไปใช้ ที่ไหน ⚪ ค้นแล้ว `schemaCount`/`aiRulesCount` ใน App.jsx ถูกตั้งค่าแต่ไม่ถูกอ่านไปแสดง) และ Home.jsx:16-43 (ไม่ถูกแสดงเช่นกัน) แต่ใช้เป็นภาระ API ซ้ำซ้อน

## 2.5 ช่องค้นหาด่วน (Command Palette)

- **[กด Ctrl+K หรือ Cmd+K]** 🔴 → (1) เปิด/ปิดหน้าต่างค้นหาหน้า (NavBar.jsx:173-182) พิมพ์ชื่อหน้า ลูกศรขึ้น/ลงเลือก Enter เปิดหน้านั้น Esc ปิด (NavBar.jsx:196-212) (2) ค้นจากรายการเมนูตายตัวด้วย ชื่อ/หมวด/คำอธิบาย (NavBar.jsx:165-170) (3) ไม่เรียก API ไม่ได้ค้นข้อมูลจริง ค้นเฉพาะชื่อหน้า **ไม่มีปุ่มบนจอให้กดเปิด** (ต้องใช้คีย์ลัดเท่านั้น; ไอคอน `SearchIcon` ถูกประกาศ NavBar.jsx:54 แต่ไม่ได้ถูกใช้ ⚪)

## 2.5.1 ส่วนล่างของแถบเมนู

- **[ปุ่ม "Admin Login" (เมื่อยังไม่ล็อกอิน)]** 🔴 → (1) ไปหน้า `/login` (NavBar.jsx:419) สถานะล็อกอินมาจาก `useAuth()` (NavBar.jsx:78-79)
- **[ปุ่ม "Logout" (เมื่อล็อกอินแล้ว)]** 🟢 → (1) กดแล้วเรียก `logout()` แล้วไปหน้า `/login` (NavBar.jsx:121-124) (3) `logout()` ใน useAuth.js:50-57 ยิง `POST /api/v1/auth/logout` -> `auth.py:133-136` ลบคุกกี้ `sdoqap_session` (4) ฝั่งหน้าเว็บตั้งสถานะเป็นไม่ล็อกอินแม้การยิงล้มเหลว (บล็อก `finally`, useAuth.js:53-56) **หมายเหตุความปลอดภัย:** โทเค็นเป็นแบบไม่มีสถานะที่ฝั่งเซิร์ฟเวอร์ (stateless) ออกจากระบบ = ลบคุกกี้ที่เบราว์เซอร์เท่านั้น โทเค็นที่ถูกคัดลอกไปแล้วยังใช้ได้จนครบ 12 ชั่วโมง (auth.py:13,30-35,38-54 ไม่มีรายการเพิกถอน)
- **[แถบสถานะระบบ "ระบบปกติ / N บริการออฟไลน์ / เชื่อมต่อ API ไม่ได้ / กำลังตรวจสอบระบบ…"]** 🟡 → (2) สรุปสุขภาพรวมของ 11 บริการเป็นบรรทัดเดียว พร้อมจุดสี (3) เรียก `useApi('/services/status', 15 วิ)` (NavBar.jsx:127) แล้วส่งให้ `summarizeServiceHealth` (`UI/utils/serviceHealth.js:1-13`) (4) กฎ: ยังโหลดและไม่มีข้อมูล = `unknown` "กำลังตรวจสอบระบบ…" (บรรทัด 4); error/ไม่มีข้อมูล = `down` "เชื่อมต่อ API ไม่ได้" (บรรทัด 5-7); ทุกบริการ online = `ok` "ระบบปกติ" (บรรทัด 11); มีบริการ offline = `degraded` "N บริการออฟไลน์" (บรรทัด 12) เมื่อเอาเมาส์ชี้จะเห็นรายชื่อบริการที่ออฟไลน์ (NavBar.jsx:432) **ข้อดี:** ต่างจากกล่องใน Home ตรงที่แยกกรณี "API ล้ม" ออกจาก "บริการปิด" อย่างถูกต้อง แสดงเฉพาะตอนเมนูกาง (NavBar.jsx:429)
- **[ไอคอน GitHub]** 🔴 → ลิงก์ภายนอกไป `https://github.com/ohmiler/gridgeist` (NavBar.jsx:440) ซึ่งชื่อ repo `gridgeist` ไม่เกี่ยวกับชื่อ SDOQAP อาจเป็นร่องรอยจากเทมเพลตเดิม (ตรวจไม่พบในโค้ดว่าเป็น repo ของโปรเจกต์นี้) ควรตรวจก่อนพรีเซนต์
- **[ข้อความ "v1.1.0"]** 🔴 → เลขเวอร์ชันฮาร์ดโค้ด (NavBar.jsx:444) ไม่ได้อ่านจาก package.json หรือ Backend

## 2.6 การตรวจสิทธิ์ที่เกี่ยวกับ NavBar (App.jsx)

- **[ตัวป้องกันหน้า `RequireAuth`]** 🟢 → (App.jsx:20-31) เรียก `useAuth()` ซึ่งยิง `GET /api/v1/auth/me` (useAuth.js:14) ระหว่างรอแสดง "Checking session…" ถ้าไม่ผ่านจะส่งไป `/login` พร้อมจำหน้าที่ตั้งใจจะไป (`state.from`) ฝั่ง Backend `GET /auth/me` ต้องมีคุกกี้ที่ลายเซ็นถูกต้องและยังไม่หมดอายุ (auth.py:61-68,139-141) **ข้อสังเกต:** `useAuth` ถูกเรียกแยกกันใน NavBar, AppContent และ RequireAuth ทุกที่มี state ของตัวเอง จึงเรียก `/auth/me` ซ้ำหลายครั้งต่อการโหลดหน้า (ไม่ใช่ข้อบกพร่องด้านข้อมูล แต่เป็นการเรียกซ้ำ)

**สรุป 3 คำตอบ — แถบเมนู NavBar**
- **หน้านี้มีไว้ทำอะไร?** เป็นแถบนำทางหลักของทุกหน้า แสดงเมนูเรียงตามขั้นตอนงาน ตัวนับงานรออนุมัติ และสถานะสุขภาพระบบ
- **ผู้ใช้ทำอะไรได้?** สลับหน้า พับ/กางเมนู ค้นหาหน้าด้วย Ctrl+K ล็อกอิน/ล็อกเอาต์ และกดไปเริ่มนำเข้าข้อมูล
- **ระบบทำอะไรเบื้องหลัง?** ทุก 10 วิ นับข้อเสนอ Schema (จาก ES) และข้อเสนอกฎ AI (จาก ES หรือตัวอย่างฮาร์ดโค้ดถ้าว่าง), ทุก 15 วิ เช็กพอร์ต 11 บริการ, และตรวจคุกกี้ session กับ `/auth/me`

---

# หน้า 3: Login (`/login`)

| Frontend file | API endpoints | Backend handler | Storage |
|---|---|---|---|
| `UI/pages/Login.jsx` + `UI/hooks/useAuth.js` | `POST /api/v1/auth/login` | `API/auth.py:110-130` `login()` | ไม่มีฐานข้อมูลผู้ใช้: เทียบกับตัวแปรสภาพแวดล้อม `ADMIN_USERNAME` / `ADMIN_PASSWORD`; ผลคือคุกกี้ `sdoqap_session` ในเบราว์เซอร์ |
| | `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` | `auth.py:139-141`, `auth.py:133-136` | คุกกี้เดียวกัน |

ค่าตัวแปรที่ต้องตั้งใน `.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET_KEY`, (ตัวเลือก) `SESSION_COOKIE_SECURE` (`.env.example:29-36`) ถ้าขาด Backend จะไม่ยอมทำงานกับ login (`_required_env` โยน error, auth.py:16-23) ค่าจริงใน `.env` ไม่ได้ถูกเปิดอ่านในการวิเคราะห์นี้

- **[หัวข้อ "Admin Login" + ข้อความ "Access the governance & observability control plane" + โลโก้ "SDOQAP Platform"]** 🔴 → ข้อความตายตัว (Login.jsx:42-43,35)
- **[ช่อง Username]** 🔴 (ช่องกรอก) → (1) รับชื่อผู้ใช้ จำเป็นต้องกรอก (`required`) ปิดช่องระหว่างกำลังล็อกอิน (Login.jsx:60-69)
- **[ช่อง Password]** 🔴 → (1) รับรหัสผ่านแบบซ่อนตัวอักษร จำเป็นต้องกรอก (Login.jsx:77-86) ไม่มีปุ่มแสดงรหัสผ่าน ไม่มีลิงก์ลืมรหัสผ่าน/สมัครสมาชิก (ตรวจไม่พบในโค้ด)
- **[ปุ่ม "Login" (ขณะทำงานเป็น "Authenticating...")]** 🟢 → (1) ส่งฟอร์ม `handleLogin` (Login.jsx:17-30) (3) เรียก `login()` ใน useAuth.js:33-48 ยิง `POST /api/v1/auth/login` ส่ง `{username, password}` เป็น JSON พร้อม `credentials: "same-origin"` ฝั่ง Backend (auth.py:110-130): อ่าน `ADMIN_USERNAME`/`ADMIN_PASSWORD` จาก env (112-113) เทียบด้วย `hmac.compare_digest` (เทียบแบบเวลาคงที่ป้องกันการเดารหัสจากความเร็วตอบ, 115-116) ถ้าไม่ตรงตอบ **HTTP 401** "Invalid username or password." (118) ถ้าตรง สร้างโทเค็น `base64(username:เวลาหมดอายุ).HMAC-SHA256` ด้วย `SESSION_SECRET_KEY` (auth.py:30-35) แล้วตั้งคุกกี้ `sdoqap_session` แบบ `HttpOnly` (JavaScript อ่านไม่ได้), `SameSite=Lax`, อายุ **12 ชั่วโมง** (auth.py:13,121-129), `Secure` ตามค่า env (auth.py:57-58) (4) ถ้าสำเร็จหน้าเว็บไปยังหน้าที่ตั้งใจจะเข้า (`location.state.from`) หรือ `/dashboard` เป็นค่าเริ่มต้น (Login.jsx:15,22-23)
- **[แถบแดงแสดงข้อผิดพลาด]** 🟢 → แสดงข้อความ `detail` ที่ Backend ส่งกลับ หรือ "Invalid username or password." ถ้าอ่านไม่ได้ (useAuth.js:38-40, Login.jsx:25-26,47-54)
- **[ข้อความท้ายการ์ด "Protected by SDOQAP Security Agent • Session Cookie v2.0"]** 🔴 → ข้อความตายตัว (Login.jsx:100) คำว่า "Security Agent" ไม่มีส่วนประกอบใดในโค้ดที่ชื่อนี้ (ตรวจไม่พบ) เป็นเพียงข้อความตกแต่ง
- **ข้อสังเกตเชิงข้อเท็จจริงเกี่ยวกับระบบ login:**
  - มี "ผู้ดูแลระบบ" **คนเดียว** (ค่าจาก env) ไม่มีตารางผู้ใช้/บทบาท/หลายผู้ใช้ ตรวจไม่พบในโค้ด
  - ไม่มีการล็อกบัญชีเมื่อใส่ผิดหลายครั้ง มีเพียงตัวจำกัดอัตราทั่วไปของทั้ง API 100 คำขอ/นาที/IP (`services/api/main.py:46-49`)
  - `hmac.compare_digest` กับข้อความที่มีอักขระนอก ASCII (เช่น ภาษาไทย) ตามพฤติกรรมมาตรฐานของ Python จะโยน TypeError (ยังไม่ได้ทดสอบรันจริง ระบุไว้เพื่อให้ตรวจ)
  - คอมเมนต์ใน system.py:57 บอกว่า "หน้า login อ่านข้อมูล services/status" แต่ `Login.jsx` **ไม่ได้เรียก API ใด ๆ นอกจาก login** (ตรวจแล้ว ข้อความนั้นล้าสมัย)
  - นอกจากหน้าเว็บ การตรวจสิทธิ์ฝั่ง Backend ใช้กับ endpoint ที่แก้ไขข้อมูลเป็นหลัก (`Depends(require_session)` เช่น approve/reject/ingest) ส่วน GET จำนวนมากยังเปิดโล่ง (รวม 4 ตัวที่ Home/NavBar เรียก) ในขณะที่ตัวป้องกันหน้า (RequireAuth) เป็นการป้องกันที่ฝั่งเบราว์เซอร์

**สรุป 3 คำตอบ — หน้า Login**
- **หน้านี้มีไว้ทำอะไร?** ยืนยันตัวตนผู้ดูแลระบบก่อนเข้าหน้าทำงานที่ต้องล็อกอิน (ทุกหน้ายกเว้น Home)
- **ผู้ใช้ทำอะไรได้?** กรอก Username/Password แล้วกด Login; ไม่มีสมัครสมาชิกหรือกู้รหัสผ่าน
- **ระบบทำอะไรเบื้องหลัง?** Backend เทียบกับ `ADMIN_USERNAME/ADMIN_PASSWORD` ใน `.env` แล้วออกคุกกี้ลงลายเซ็น HMAC อายุ 12 ชม. ที่ทุกหน้าใช้ตรวจผ่าน `/auth/me`

---

# หน้า 4: Learn & Architecture (`/guide` และ `/guideline`)

| Frontend file | API endpoints | Backend handler | Storage |
|---|---|---|---|
| `UI/pages/ConfigGuide.jsx` (+ `components/ui/PageHeader.jsx`, `LearnMore.jsx`, `config/pages.js`) | **ไม่มี** (ค้นแล้วไม่พบ `fetch`/`useApi`/`postApi` ในไฟล์นี้) | ไม่มี | ไม่มี |

**สรุปสถานะ: หน้านี้เป็นเนื้อหา Static (ข้อความฮาร์ดโค้ด) เกือบทั้งหมด 🔴** ไม่มีข้อมูลจากระบบจริง ต้องล็อกอิน (`RequireAuth`, App.jsx:107-108) ทั้ง `/guide` และ `/guideline` ชี้ไปคอมโพเนนต์เดียวกัน

- **[หัวหน้า (PageHeader) "Learn & Architecture" + คำอธิบาย]** 🔴 → ดึงชื่อ/คำอธิบายจากรายการ `PAGES` (ConfigGuide.jsx:103 -> `PageHeader` อ่าน `getPage("guide")`; pages.js:9)
- **[กล่องพับ "หลักการ: แก้ปัญหาที่ต้นน้ำ"]** 🔴 → (1) กดเพื่อกาง/พับ (`<details>`, `LearnMore.jsx`) (2) ข้อความอธิบายหลักการ: ระบบสแกนสถิติ แสดงหลักฐาน ให้ผู้ใช้ยืนยันกฎ และแจ้งข้อมูลเสียกลับไปแก้ที่ต้นทาง (ConfigGuide.jsx:105-107)
- **[การ์ด "ขั้นที่ 1-4" (Data Ingestion / Expectations & Alerts / Jobs & Pipelines / Workspace Exports)]** 🔴 → (1) กดแล้วไปหน้านั้น (ConfigGuide.jsx:109-117) รายการมาจาก `WORKFLOW_STEPS` ตายตัว (pages.js:21)
- **[แท็บ 4 ปุ่ม: พารามิเตอร์ / แต่ละหน้า / สถาปัตยกรรม / กรณีศึกษา]** 🔴 → (1) สลับเนื้อหาด้วย state `activeTab` (ConfigGuide.jsx:96,119-150) ไม่มีการเรียก API แท็บเริ่มต้นคือ "พารามิเตอร์"

### แท็บ "พารามิเตอร์" (ConfigGuide.jsx:154-340) 🔴 ข้อความอธิบายตายตัว

อธิบาย 5 กฎ แต่ละกฎพับดูรายละเอียดได้ (`LearnMore`):
- **RULE 01 Target Quality Score** (`quality_score_threshold`) — ค่าคะแนนขั้นต่ำ ถ้าแบตช์ต่ำกว่าเกณฑ์จะกักกัน/เตือน ตัวเลขแนะนำ 95-100% / 90-94.9% / 80-89.9% (บรรทัด 165-198) *ความสอดคล้องกับโค้ด:* ค่าเริ่มต้น `adjustment_window_runs = 15` ตรงกับ Spark (`SPARK/dynamic_rules_engine.py:398`) และ ค่าเริ่มต้น 90.0 สอดคล้องกับค่า fallback `quality_score_threshold: 90.0` ใน `SPARK/spark_quality_engine.py:1406`
- **RULE 02 Primary Key & Null Checks** — คอลัมน์ ID ต้องห้ามว่าง (บรรทัด 200-228)
- **RULE 03 Value Range & Outlier (IQR)** — ช่วงปลอดภัย `[Q1 - k×IQR, Q3 + k×IQR]` ด้วย k = 1.5 / 2.0-2.5 / 3.0 (บรรทัด 230-272)
- **RULE 04 Data Freshness SLA** — ความสดของข้อมูล (ชั่วโมง) (บรรทัด 274-302) *หมายเหตุ:* ตัวเลขแนะนำ (≤1-2 ชม./24/168) เป็นแนวทางทั่วไปที่ผู้เขียนใส่เอง ไม่ได้ผูกกับระบบ
- **RULE 05 AI Remediation & Adaptive Rules** — ผู้ดูแลต้องกด Approve ก่อนใช้กฎจาก AI ทุกครั้ง ค่า `confidence_threshold: 0.70` ตรงกับ `SPARK/dynamic_rules_engine.py:720` (บรรทัด 304-337)
- ไม่มีปุ่ม "บันทึก/ใช้ค่า" ในหน้านี้เลย ค่าพวกนี้ไม่ได้ถูกอ่านหรือเขียนจากหน้าคู่มือ (การตั้งค่าจริงอยู่ที่หน้า Expectations & Alerts)

### แท็บ "แต่ละหน้า" (ConfigGuide.jsx:343-364)

- **[รายการหน้าทั้ง 10 หน้า (ยกเว้น Home) พร้อมคำอธิบายหนึ่งบรรทัด]** 🔴 → (1) กดชื่อเพื่อไปหน้านั้น (2) สร้างจากรายการ `PAGES` ตายตัว (บรรทัด 355-358 -> pages.js:8-19) ชื่อ/คำอธิบายจึงตรงกับเมนูข้าง ๆ เสมอ

### แท็บ "สถาปัตยกรรม" (ConfigGuide.jsx:368-437)

แสดง "End-to-End Data Pipeline Architecture" 4 เฟส เป็นอาร์เรย์ตายตัวในบรรทัด 383-415 🔴 (แต่ละเฟสพับดูรายละเอียดได้):
- **PHASE 1 Ingestion & Data Lake Landing** — "FastAPI Ingestion -> HDFS /data/landing/ -> Metadata Registry" (บรรทัด 385-391)
- **PHASE 2 Schema Drift & Contract Verification** — "Schema Registry Diff -> Drift Alert -> Governance Approval" (บรรทัด 392-398)
- **PHASE 3 Spark Quality Audit & 3-Way Routing** — "PySpark Engine -> Active Rules Config -> 3-Zone Segregation" คัดแยกเป็น Clean / Review Queue / Quarantine (บรรทัด 399-405)
- **PHASE 4 Serving Layer & Upstream Remediation** — "Gold Layer Serving + Export Hub CSV + Upstream Remediation Ticket" (บรรทัด 406-413)
- *หมายเหตุ:* เฟส 4 ระบุ "PostgreSQL/Elasticsearch" ใช้ส่งมอบข้อมูล แต่ข้อความนี้เป็นคำอธิบายตายตัว ไม่ได้ผูกกับโค้ดที่ทำงานจริง (ไม่ได้ตรวจเทียบทุกเส้นทางข้อมูลในภาคนี้ ควรไปเทียบกับเอกสารสถาปัตยกรรมส่วนอื่น) และไม่มีแผนภาพ ECharts/แผนผังโต้ตอบ ในหน้านี้ (ตรวจไม่พบ)

### แท็บ "กรณีศึกษา" (ConfigGuide.jsx:440-503)

- **[ตาราง "Business & Technical Policy Mapping" 5 แถว: Identifier Integrity / Score Bound / Outlier Multiplier / Batch Freshness / AI Imputation]** 🔴 → ตัวอย่างการแมปความต้องการทางธุรกิจ (ตัวอย่างนักศึกษา: คะแนน 0-100, `study_hours: iqr_multiplier=2.5`, `freshness_threshold_hours: 24`, `calculate: study_hours * 1.5`) เป็นตัวอย่างสมมุติที่เขียนไว้ในโค้ด (บรรทัด 466-498) ไม่ได้อ่านจากกฎที่ใช้งานจริงของระบบ

**สรุป 3 คำตอบ — หน้า Learn & Architecture**
- **หน้านี้มีไว้ทำอะไร?** คู่มือในตัวระบบที่อธิบายความหมายพารามิเตอร์กฎ แผนที่หน้า สถาปัตยกรรม 4 เฟส และกรณีศึกษา
- **ผู้ใช้ทำอะไรได้?** อ่าน สลับ 4 แท็บ กางรายละเอียด และกดลิงก์ไปหน้าต่าง ๆ (ไม่มีปุ่มบันทึกหรือแก้ค่า)
- **ระบบทำอะไรเบื้องหลัง?** ไม่ทำอะไร: เป็นเนื้อหาตายตัวใน `ConfigGuide.jsx` ไม่เรียก API เลย (เพียงตรวจ session ผ่าน `RequireAuth` ก่อนเข้า)
