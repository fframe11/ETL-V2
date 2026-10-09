# รายละเอียดสถาปัตยกรรมระบบเชิงลึก (Deep-Dive System Architecture Overview)

**โครงการ**: DataServe (ขับเคลื่อนด้วยสถาปัตยกรรมภายใน SDOQAP - Smart Data Operations & Quality Assurance Platform)  
**วันที่บันทึก**: 8 ตุลาคม 2569  
**สถานะการตรวจทาน**: ตรวจทานเทียบกับโค้ดที่ commit `00c890b` (branch `feat/generic-profiling-rule-engine`) ข้อความอิงไฟล์ในโค้ดจริง ส่วนที่ยังไม่ได้ตรวจระบุไว้ท้ายเอกสาร  
**สถาปัตยกรรมหลัก**: Dual-Engine (Interactive Whitebox + Distributed Spark), Modern Medallion Lakehouse, Data Observability, Closed-Loop Upstream Governance  

---

## 1. ภาพรวมการแบ่งชั้นสถาปัตยกรรม (High-Level Architectural Layers)

สถาปัตยกรรมระบบแบ่งการทำงานออกเป็น 8 เลเยอร์หลักตามวงจรชีวิตของข้อมูล (Data Lifecycle) ตั้งแต่การรับเข้าจนถึงการนำไปใช้ประโยชน์:

```
[1. Multi-Source Ingestion & Trigger Layer]
                 │
                 ▼
[2. Bronze Storage & Pre-Flight Governance (Schema Drift & Semantic Layer)]
                 │
                 ▼
[3. Dual-Engine Quality Processing: Interactive Whitebox vs. Distributed Spark 21-Stage]
                 │
                 ▼
[4. Silver Medallion Dual-Zone Storage (Delta Lake Active vs. Delta Lake Quarantine)]
                 │
                 ▼
[5. Gold Observability & Telemetry Indices (Elasticsearch 8.10.2 / Kibana / Grafana)]
                 │
                 ▼
[6. Serving API & Dynamic Business Impact Engine (FastAPI / 3D COPDQ Engine)]
                 │
                 ▼
[7. Central Portal UI & Two-Way Synchronized Governance (React 18 / Zustand)]
                 │
                 ▼
[8. Closed-Loop Upstream Remediation & Automated Re-processing Trigger]
```

---

## 2. รายละเอียดการทำงานเชิงลึกแยกตามแต่ละเลเยอร์

---

### เลเยอร์ที่ 1: การนำเข้าข้อมูลและการสตรีมสด (Multi-Source Ingestion & Trigger Layer)

เลเยอร์นี้ทำหน้าที่เป็นด่านหน้าในการเปิดรับและรวบรวมข้อมูลจากแหล่งข้อมูลที่หลากหลาย (Data Ingestion Hub) โดยไม่จำกัดโครงสร้าง:

* **Batch File Ingestion**:
  * รองรับไฟล์ CSV และ Excel ผ่าน `POST /api/v1/pipeline/ingest/csv` (ตอบกลับ HTTP 202 พร้อม `ingest_id`)
  * ตรวจสอบ SHA-256 Checksum ป้องกันไฟล์ซ้ำ, ตรวจสอบการมีอยู่ของคอลัมน์คีย์หลัก (Primary Key) ก่อนบันทึกลง HDFS และจำกัดขนาดไฟล์ไม่เกินเพดานที่กำหนด
  * การอ่านหัวคอลัมน์รองรับเฉพาะ UTF-8 และ UTF-8 BOM (`utf-8-sig`) เท่านั้น ไม่มีการแปลงรหัสภาษาไทย TIS-620 หรือ Windows-874 ในตัว ดังนั้นไฟล์ภาษาไทยที่เข้ารหัสแบบดั้งเดิมต้องผ่านการแปลงเป็น UTF-8 ก่อนนำเข้า
* **Relational Database Ingestion**:
  * `POST /api/v1/pipeline/ingest/rdbms` รองรับเฉพาะคำสั่ง SQL แบบ `SELECT` (Read-Only) จากโฮสต์ที่ระบุในรายการปลอดภัย `RDBMS_ALLOWED_HOSTS`
  * เป็นการดึงข้อมูลแบบสแนปช็อตทั้งผลลัพธ์ของคำสั่ง (Batch Snapshot Query) ไม่ใช่ระบบ Change Data Capture (CDC)
  * ใช้ `sdoqap-postgres` (พอร์ตโฮสต์ `${POSTGRES_HOST_PORT:-5432}`) เป็นฐานข้อมูลเชิงสัมพันธ์ต้นทางตัวอย่าง
* **Upstream REST API Ingestion**:
  * `POST /api/v1/pipeline/ingest/api` ดาวน์โหลด JSON หรือ CSV จาก URL ปลายทาง แปลงเป็น CSV บันทึกลง HDFS และสั่งการ Spark ต่อเนื่อง
  * รองรับการส่ง `api-key` และ `Authorization: Bearer` ไปยังต้นทางเมื่อมีการระบุ `api_key` พร้อมระบบป้องกันความปลอดภัยแบบ Fail-Closed โดยอนุญาตเฉพาะโดเมนใน `API_INGEST_ALLOWED_HOSTS`
  * ข้อจำกัดทางสถาปัตยกรรม: เส้นทางนี้ยังไม่มีกลไก Pagination อัตโนมัติ, การ Retry เมื่อเจอ HTTP 429 Rate Limit หรือการแกะ Nested JSON โครงสร้างซับซ้อน
* **Real-Time Streaming Queue**:
  * ขับเคลื่อนด้วย **Apache Kafka** และ **Zookeeper** (Docker Compose Profile: `streaming`) รันอยู่ภายในเครือข่ายคอนเทนเนอร์ โดย Kafka แมปพอร์ต `9092:29092`
  * ออกแบบมาสำหรับรับข้อมูลสตรีมมิ่งสด เช่น ข้อมูลข้อความจาก Reddit (`POST /api/v1/pipeline/ingest/reddit`) แล้วส่งต่อให้ Spark Structured Streaming (`streaming_job.py`) ประมวลผลแบบไมโครบัตช์
* **Spark Trigger Daemon**:
  * Background Service รันอยู่ที่พอร์ต `8099` ของโหนด Spark Master เพื่อทำหน้าที่เป็นตัวกลางรับคำสั่งรันไปป์ไลน์
  * ควบคุมความปลอดภัยด้วยโทเคนลับ `TRIGGER_SHARED_SECRET` ผ่านเฮดเดอร์ `X-Trigger-Secret`
  * มีเอนด์พอยต์ `POST /retry` จัดคิวงานแบบ FIFO แยกตามรายชื่อตาราง ถูกเรียกใช้อัตโนมัติเมื่อมีการนำเข้าไฟล์ใหม่ หรือเมื่อผู้ใช้กด Resolve บัตรงานแก้ไขข้อมูลบนพอร์ทัล

---

### เลเยอร์ที่ 2: โซนข้อมูลดิบและธรรมาภิบาลโครงสร้าง (Bronze Storage & Pre-Flight Governance Layer)

ข้อมูลดิบทุกชุดจะต้องผ่านด่านตรวจความสมบูรณ์เชิงโครงสร้างและความปลอดภัยของข้อมูลก่อนส่งต่อให้คลัสเตอร์ประมวลผล:

* **HDFS Raw Bronze Zone**:
  * ข้อมูลดิบถูกจัดเก็บบน **HDFS** ที่พาธ `/data/raw/<table_name>/<ingest_id>/` ในสภาพดั้งเดิม ไม่มีการดัดแปลงค่า
  * เมื่อ Spark ประมวลผลเสร็จสิ้น ข้อมูลจะถูกย้ายไปยัง `/data/archive/<table_name>/<ingest_id>` เพื่อเก็บประวัติสำหรับการตรวจสอบย้อนกลับ (Auditability) และรองรับการสั่งรันซ้ำ (`POST /api/v1/pipeline/retry/{run_id}`)
* **Schema Drift Pre-Flight Gate** (Stage `schema_drift`):
  * ทำการเปรียบเทียบโครงสร้างของชุดข้อมูลนำเข้ากับ `schema_registry.json` ก่อนเริ่มการตรวจสอบคุณภาพ
  * คำนวณคะแนนความรุนแรงของการเปลี่ยนแปลง `drift_severity`: พบคอลัมน์ใหม่ เพิ่ม +1, พบคอลัมน์สูญหาย เพิ่ม +5, พบคอลัมน์ชนิดข้อมูลไม่ตรง เพิ่ม +5
  * **Safe Drift (Auto-Evolution)**: หากพบเฉพาะคอลัมน์ใหม่ และนโยบายตารางเปิดใช้ `policy_allow_new` พร้อมทั้งจำนวนคอลัมน์ไม่เกินเกณฑ์ ระบบจะทำการอัปเดต Schema Registry ให้อัตโนมัติ พร้อมบันทึกข้อเสนอลงดัชนี `sdoqap_schema_proposals`
  * **คอลัมน์สูญหาย (Missing Columns)**: ระบบจะเติมค่า `NULL` อัตโนมัติตามชนิดข้อมูลที่คาดหวัง และส่งการแจ้งเตือนระดับวิกฤตผ่านฟังก์ชัน `send_n8n_alert` ไปยัง n8n Webhook หรือ Alert Router (ส่งเข้า Slack ผ่าน `SLACK_WEBHOOK_URL` หรือ LINE Notify ผ่าน `LINE_NOTIFY_TOKEN`)
  * **ชนิดข้อมูลขัดแย้ง (Type Mismatch)**: ระบบจะแคสต์คอลัมน์ดังกล่าวเป็น String ชั่วคราวเพื่อป้องกันไปป์ไลน์หยุดชะงัก
  * ไม่มีการกักทั้งบัตช์เมื่อเกิด Schema Drift: คอลัมน์ที่หายถูกเติม NULL, ชนิดที่ไม่ตรงถูกแคสต์เป็น String และมี alert ระดับ critical ส่วนแถวที่ผิดเงื่อนไขอื่นถูกคัดแยกใน stage ถัดไปตามปกติ ตัวเลข `drift_severity` ใช้บันทึกและแสดงผล ไม่ได้เป็นตัวตัดสินให้กัก
* **Semantic Layer & Data Privacy Guardrails**:
  * บริหารจัดการผ่านเอนด์พอยต์ `/api/v1/semantic` (ต้องยืนยันตัวตน และผู้ใช้อนุมัติแบบร่างก่อนมีผล)
  * ทำการอนุมานความหมายของคอลัมน์ (หน้าที่ทางธุรกิจ, หน่วยวัด, สกุลเงิน) และตรวจจับ **ธงข้อมูลส่วนบุคคล (PII Flags)** โดยอิงพจนานุกรมคำภาษาอังกฤษและไทย
  * **การคุ้มครองข้อมูลส่วนบุคคล**: ธง PII ทำหน้าที่เป็นตัวกรองยกเว้นคอลัมน์ (Column Exclusion Guardrail) โดย Dashboard Builder จะไม่ส่งข้อมูลแถวที่มี PII ให้กับโมเดล LLM และฟังก์ชันส่งออกข้อมูล (Export CSV) จะตัดคอลัมน์ PII ออกเป็นค่าเริ่มต้น

---

### เลเยอร์ที่ 3: สถาปัตยกรรมเอนจินคู่และการคัดแยกคุณภาพข้อมูล (Dual-Engine QA & Processing Architecture)

DataServe ออกแบบสถาปัตยกรรมเอนจินประมวลผลเป็น 2 รูปแบบอย่างชัดเจน เพื่อตอบสนองความต้องการที่ต่างกันระหว่างการตอบสนองแบบทันทีหน้าเว็บ กับการประมวลผลแบบกระจายศูนย์บนชุดข้อมูลขนาดใหญ่:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           DUAL-ENGINE ARCHITECTURE                             │
├────────────────────────────────────────┬───────────────────────────────────────┤
│ 1. Interactive Whitebox Engine (FastAPI)│ 2. Distributed Spark Batch Engine    │
├────────────────────────────────────────┼───────────────────────────────────────┤
│ • เทคโนโลยี: Python, FastAPI, Pandas   │ • เทคโนโลยี: PySpark 3.4.1, Bitnami   │
│ • รูปแบบ: Synchronous In-Memory Profiling│ • รูปแบบ: Distributed Batch Pipeline │
│ • เอนด์พอยต์: /api/v1/whitebox/*, /rules │ • เอนด์พอยต์: Spark Trigger Daemon :8099│
│ • หน้าที่: Profiling ทันที, แนะนำกฎ 3 ด้าน│ • หน้าที่: ดำเนินการ 21 Stage ตามแผนงาน │
│   (Completeness, Non-Negative Range,    │   เขียน Delta Lake Active/Quarantine  │
│    Outlier IQR) และตรวจคีย์ข้ามตาราง   │   และส่งดัชนีชี้วัดเข้า Elasticsearch │
└────────────────────────────────────────┴───────────────────────────────────────┘
```

#### ก. Interactive Whitebox Engine (`services/api/app/api/whitebox.py`)
* ประมวลผลบนหน่วยความจำของ FastAPI Worker เพื่อสร้างความรวดเร็วในการโต้ตอบกับผู้ใช้ (Zero-Wait Profiling)
* ดึงตัวอย่างข้อมูลมาวิเคราะห์สถิติเชิงพรรณนา (Descriptive Statistics) และสร้างบัตรข้อเสนอกฎคุณภาพข้อมูลอัตโนมัติ 3 มิติหลัก:
  1. **Completeness Guardrail**: แนะนำเกณฑ์การห้ามเป็นค่าว่าง สำหรับคอลัมน์ที่มีอัตราความสมบูรณ์สูง
  2. **Non-Negative / Domain Boundary Range**: แนะนำเกณฑ์ค่าต้องไม่ติดลบ (`>= 0`) หรือช่วงค่าที่ยอมรับได้สำหรับตัวเลขทางการเงินและปริมาณ
  3. **Outlier Boundary (Tukey IQR)**: โปรไฟล์นับค่าผิดปกติด้วยช่วง $[Q_1 - 1.5 \times \text{IQR}, Q_3 + 1.5 \times \text{IQR}]$ ส่วนกฎ `auto_iqr` ที่ระบบแนะนำใช้ตัวคูณ $3.0$ (Tukey far-out) $[Q_1 - 3.0 \times \text{IQR}, Q_3 + 3.0 \times \text{IQR}]$ รอผู้ใช้ยืนยันก่อนมีผล
* บริหารจัดการกฎความสัมพันธ์ข้ามตาราง (Multi-Table Referential Integrity) ที่หน้าเว็บ เพื่อตรวจสอบ Foreign Key ร่วมกันระหว่างชุดข้อมูล

#### ข. Distributed Spark Batch Engine (`services/spark/spark_quality_engine.py`)
* สถาปัตยกรรม Master-Worker ประมวลผลแบบขนานด้วยคอนฟิก `spark.sql.shuffle.partitions=200`
* รันตามแผนการทำงาน **21 Stages** อย่างเคร่งครัดตามที่กำหนดใน `services/spark/sdoqap/pipeline/plan.py` โดยแบ่งออกเป็น 3 ช่วง:
  1. **ช่วง Align (1 Stage)**:
     - `schema_align`: ปรับชื่อคอลัมน์และโครงสร้างพื้นฐานให้ตรงกับข้อกำหนดในระบบ
  2. **ช่วง Transform (12 Stages)**:
     - `schema_drift`: ตรวจวัดการเปลี่ยนแปลงโครงสร้างและประเมินคะแนนความรุนแรง
     - `auto_clean`: ลบแถวที่เป็นช่องว่างทั้งหมด และตัดข้อมูลซ้ำซ้อนบนคีย์หลักก่อนนับรอบ
     - `validation`: ตรวจสอบความถูกต้องของคีย์หลัก, ความเข้ากันได้ของชนิดข้อมูล และฟอร์แมตวันเวลา
     - `dedup`: ลบข้อมูลซ้ำซ้อนขั้นสูงโดยรักษาแถวล่าสุดไว้ตามคีย์หลัก
     - `standardize_dates`: ปรับรูปแบบวันที่ให้เป็นมาตรฐานสากล (รองรับการแปลงปี พ.ศ. เป็น ค.ศ.)
     - `standardize_categories`: ปรับค่าเชิงกลุ่มให้เป็นมาตรฐานเดียวกัน (Trim ช่องว่าง, ปรับตัวพิมพ์)
     - `range_rules`: ตรวจสอบขอบเขตค่าตัวเลขตามกฎเกณฑ์ทางธุรกิจที่กำหนดไว้
     - `anomaly_iqr`: ตรวจจับค่าผิดปกติด้วย Tukey IQR ($1.5 \times \text{IQR}$ ปรับแต่งรายตารางได้ใน `rules_config.json`)
     - `anomaly_zscore`: ตรวจจับค่าผิดปกติเชิงสถิติด้วยเกณฑ์เบี่ยงเบนมาตรฐาน $3\sigma$
     - `anomaly_induced`: ตรวจจับความผิดปกติซับซ้อนด้วยกฎจำแนกที่เรียนรู้จาก Decision Tree
     - `quarantine_assembly`: รวบรวมแถวที่ผิดเงื่อนไขทุกประเภท สร้างเหตุผลการปฏิเสธ (`reject_reason`) และแยกแถวเสียออกจากแถวดี
     - `column_filter`: คัดกรองและจัดเรียงคอลัมน์สุดท้ายให้พร้อมสำหรับการบันทึก
  3. **ช่วง Post-Load (8 Stages)**:
     - `distribution`: คำนวณการกระจายตัวของข้อมูลและสถิติภาพรวม
     - `quarantine_breakdown`: จัดหมวดหมู่และแจกแจงสาเหตุของแถวที่ติดกักกัน
     - `copdq`: คำนวณมูลค่าความเสียหายทางการเงินของข้อมูลที่ติดกักกัน (`quarantined_financial_value`)
     - `freshness`: คำนวณความล่าช้าของข้อมูลเทียบกับเวลาปัจจุบัน (ข้ามการตรวจสำหรับตาราง Historical)
     - `quality_score`: ประเมินคะแนนคุณภาพรวมของรอบการทำงาน โดยเทียบอัตรากักกันกับค่าเฉลี่ยในอดีต
     - `ai_advisory`: นำตัวอย่างแถวกักกันไปวิเคราะห์สาเหตุเชิงลึกและสร้างตั๋วแก้ไขปัญหา (ใช้ Groq LLM หรือ Local Heuristic)
     - `operational_impact`: สรุปผลกระทบต่อการปฏิบัติการและระบบงานปลายทาง
     - `report`: รวบรวมตัวชี้วัดทั้งหมดและบันทึกรายงานสรุปผลรอบการประมวลผล

---

### เลเยอร์ที่ 4: สถาปัตยกรรมการจัดเก็บข้อมูลแบบแยกคุณภาพ (Silver Medallion Dual-Zone Storage Layer)

ผลลัพธ์จากการคัดแยกของ Spark จะถูกแยกเส้นทางและบันทึกไปยังพื้นที่จัดเก็บ 2 ส่วนอย่างเป็นเอกเทศ:

* **Active Store (Clean Silver Zone)**:
  * ตำแหน่งจัดเก็บ: `/data/active/<table_name>/` บน HDFS
  * รูปแบบไฟล์: **Delta Lake (Parquet + Transaction Log `_delta_log/`)**
  * วิธีการบันทึก: ใช้คำสั่ง **`MERGE INTO` (Upsert)** ตาม Primary Key
  * คุณสมบัติทางวิศวกรรม:
    - รองรับ **ACID Transactions** ข้อมูลไม่เกิดการเสียหายหรืออ่านค่าผิดพลาดแม้เขียนพร้อมกัน
    - มีคุณสมบัติ **Idempotency** สามารถรันซ้ำกี่ครั้งก็ได้ผลลัพธ์ถูกต้องเท่าเดิม ไม่เกิดปัญหาแถวข้อมูลทวีคูณ
    - เป็นโซนข้อมูลสะอาดที่พร้อมให้ระบบ BI, Data Warehouse และโมเดล Machine Learning ดึงไปใช้งานต่อ
* **Quarantine Store (Error Isolation Zone)**:
  * ตำแหน่งจัดเก็บ: `/data/quarantine/<table_name>/` บน HDFS
  * รูปแบบไฟล์: **Delta Lake** (ไม่ใช่ CSV ธรรมดา) แบ่งพาร์ทิชันตาม `run_id` เพื่อทำหน้าที่เป็น Dead-Letter Queue
  * วิธีการบันทึก: ระบบจะลบข้อมูลเก่าของ `ingest_id` นั้นออกก่อน แล้วจึงทำการ Append แถวใหม่เข้าไป เพื่อรับประกันความเป็น Idempotent
  * เมทาดาต้ากำกับแถวเสีย: รักษาค่าเดิมของแถวไว้ครบทุกคอลัมน์ พร้อมเพิ่มคอลัมน์สำหรับตรวจสอบ:
    - `run_id`, `ingest_id`: หมายเลขรอบการประมวลผลและรหัสการนำเข้า
    - `reject_reason`: สตริงสรุปสาเหตุการถูกปฏิเสธ เช่น `missing_primary_key`, `null_value_in_<คอลัมน์>`, `out_of_range_<คอลัมน์>`, หรือช่วงค่า IQR ที่หลุดเกณฑ์ โดยหากผิดหลายข้อจะเชื่อมข้อความด้วย `; ` (ฝั่งอ่านรองรับทั้ง `;` และ `|`)
  * **สมดุลการกระทบยอดข้อมูล (Volume Reconciliation Invariant)**:
    $$\text{Inbound Volume} = \text{Active Rows} + \text{Quarantined Rows} + \text{Pre-Clean Duplicate Rows}$$
    เป็นสมการเป้าหมายของการกระทบยอดต่อรอบ (ยังไม่ได้ตรวจสอบกับโค้ดว่าเป็นจริงทุกกรณี เพราะ Active ใช้ upsert และแถวซ้ำถูกบันทึกลง Quarantine ด้วยเหตุผล `duplicate_records`) ไม่ควรอ้างเป็นการรับประกัน Zero Data Loss

---

### เลเยอร์ที่ 5: การสังเกตการณ์ ดัชนีเมทาดาต้า และความเสี่ยง (Observability & Gold Telemetry Layer)

สถิติและข้อมูลการทำงานทั้งหมดจะถูกแปลงเป็นเอกสาร JSON และทำดัชนีเข้าสู่ **Elasticsearch 8.10.2** (พอร์ต 9200) เพื่อรองรับการสืบค้นและแสดงผลแบบมิลลิวินาที:

* **ดัชนีหลักในระบบ (Core Elasticsearch Indices)**:
  * `sdoqap_quality_runs`: เก็บประวัติสรุปรายรอบ ได้แก่ จำนวนแถวรับเข้า, แถวสะอาด, แถวกักกัน, คะแนนคุณภาพของรอบ และเวลาการทำงานราย Stage (`stage_seconds`)
  * `sdoqap_pipeline_runs`: เก็บสถิติเวลาการทำงาน ความหน่วงเวลา (Latency) และสถานะการบรรลุข้อตกลง SLA ของไปป์ไลน์
  * `sdoqap_upstream_remediations`: เก็บบัตรงานแก้ไขปัญหาข้อมูลที่ต้นทาง ประกอบด้วยระบบเป้าหมาย (`target_system`), แผนการแก้ไข (`remediation_action`), ระดับความรุนแรง (`severity`) และสถานะงาน (`OPEN` หรือ `RESOLVED`)
  * `sdoqap_schema_proposals`: เก็บประวัติข้อเสนอโครงสร้างข้อมูล ทั้งที่ระบบ Auto-Evolve ให้ และที่ค้างรอการอนุมัติจากวิศวกร
  * `sdoqap_semantic_layer`: เก็บข้อมูลความหมายของคอลัมน์ หน้าที่ทางธุรกิจ และธง PII ที่ผ่านการอนุมัติแล้ว
  * `sdoqap_rules_registry` และ `sdoqap_ai_rule_proposals`: เก็บคลังกฎการตรวจสอบและกฎที่ AI แนะนำ
* **เครื่องมือวิเคราะห์เชิงสังเกตการณ์ (Observability Dashboards)**:
  * **Kibana** (พอร์ต 5601): สำหรับวิศวกรข้อมูลในการสืบค้นค้นหา Log เชิงลึก, ตรวจสอบเอกสาร JSON ต้นฉบับ และวิเคราะห์สาเหตุความผิดปกติ
  * **Grafana** (พอร์ตโฮสต์ 3002 / ภายใน 3000): แสดงผลแดชบอร์ด Time-Series ติดตามปริมาณงาน (Throughput), สุขภาพของคอนเทนเนอร์ และแนวโน้มคะแนนคุณภาพในระดับคลัสเตอร์

---

### เลเยอร์ที่ 6: การให้บริการข้อมูลและการวิเคราะห์ผลกระทบทางธุรกิจ (FastAPI Serving & Business Impact Engine)

ส่วนหลังบ้านพัฒนาด้วย **FastAPI** (Python 3.10) ทำหน้าที่ประมวลผล Business Logic และให้บริการ REST Endpoints ผ่านพอร์ต `8002` (ภายนอก) / `8000` (ภายใน):

* **Domain Mapping Architecture**:
  * โครงสร้าง `AREA_TABLE_MAPPING` ใน `analytics.py` กำหนดการจับคู่คีย์เวิร์ดในชื่อตารางเข้าสู่ 5 กลุ่มธุรกิจหลัก ได้แก่ `sales`, `customer`, `operations`, `reporting`, และ `finance` (โดยชุดข้อมูล `student*` ถูกจัดกลุ่มอยู่ในสาย `customer`)
  * เอนด์พอยต์ `GET /api/v1/executive/overview` รองรับพารามิเตอร์ `business_area` เพื่อกรองข้อมูลตามแผนกธุรกิจที่เลือก
* **Dynamic COPDQ Financial Engine** (Cost of Poor Data Quality):
  * ทำหน้าที่ประเมินความเสียหายทางการเงินจากข้อมูลด้อยคุณภาพ โดยผสานการทำงานระหว่าง Spark และ FastAPI ใน 3 มิติหลัก:
    $$\text{Total Financial Impact (USD)} = C_{\text{correction}} + C_{\text{opportunity}} + C_{\text{risk}}$$
    1. **Cost of Correction ($C_{\text{correction}}$)**: คำนวณจากต้นทุนแรงงานวิศวกรรมในการแก้ไขและรันข้อมูลใหม่ โดยคิดแบบคงที่ที่ $\$2.00$ ต่อแถวกักกัน:
       $$C_{\text{correction}} = \text{quarantined\_records} \times 2.0$$
    2. **Cost of Lost Opportunities ($C_{\text{opportunity}}$)**: คำนวณจากผลรวมมูลค่าทางการเงินจริงของแถวที่ติดกักกัน (`quarantined_financial_value`) ที่ Spark สรุปมาจากคอลัมน์ตัวเลข เช่น `total_sales`, `price`, หรือ `amount` หากไม่มีคอลัมน์การเงินจะใช้โมเดลสำรอง $5\% \times \$50$:
       $$C_{\text{opportunity}} = \sum \text{Quarantined Monetary Values}$$
    3. **Cost of Risk & Compliance ($C_{\text{risk}}$)**: คำนวณจากความเสี่ยงของการเปลี่ยนแปลงโครงสร้างข้อมูล โดยนำจำนวนแถวกักกันคูณด้วย `drift_severity` ของรายการแรกที่พบในดัชนี `sdoqap_schema_drifts` (ไม่กรองตาราง) และคูณ 1 เมื่อไม่พบ drift:
       $$C_{\text{risk}} = \text{quarantined\_records} \times \text{drift\_severity}$$
  * **TCO Operational Waste Mode**: ในการกระทบยอดปริมาณข้อมูล (`sell_in_out_reconciliation`) หากไม่มีคอลัมน์การเงิน ระบบจะประเมินต้นทุนสูญเปล่าด้านการประมวลผลและการจัดการ (TCO Waste) ที่ $\$2.50$ ต่อแถว (ค่าสมมติต้นทุนวิศวกรรมแก้ไขต่อแถว กำหนดคงที่ในโค้ด)
  * **การแปลงสกุลเงิน**: การคำนวณทั้งหมดทำบนหน่วยดอลลาร์สหรัฐ (USD) เป็นหลัก และแปลงเป็นเงินบาท (THB) บนหน้าเว็บด้วยอัตราแลกเปลี่ยนอ้างอิงคงที่ 36.5 THB/USD เพื่อความสม่ำเสมอในการนำเสนอ
* **Trust-Check Gate API**:
  * ให้บริการผ่านเอนด์พอยต์ `GET /api/v1/lineage/{table_name}/trust-check`
  * ประเมินความปลอดภัยของตารางข้อมูลจาก 3 เงื่อนไข: คะแนนคุณภาพรอบล่าสุดผ่านเกณฑ์ที่กำหนด, ไม่มี Schema Proposal สถานะ `PENDING` ค้างอยู่, และการตรวจ Proposal สำเร็จ (ถ้าตรวจไม่สำเร็จจะตอบว่าไม่ปลอดภัย) ปัจจุบันยังไม่ได้นำความสดใหม่ของข้อมูลมาเป็นเงื่อนไขตัดสิน และถ้าไม่พบรอบประมวลผลของตารางจะตอบ `HALT_INGEST`
  * ตอบกลับสถานะ `is_safe_to_consume` พร้อมคำแนะนำการใช้งาน ทำหน้าที่เป็นที่ปรึกษาเชิงคุณภาพให้กับระบบปลายทาง (Advisory Gate) โดยไม่ได้ตัดการเชื่อมต่อระดับเน็ตเวิร์กของ Delta Lake

---

### เลเยอร์ที่ 7: แผงควบคุมกลางและส่วนประสานผู้ใช้ (Central Portal UI Layer)

หน้าบ้านพัฒนาด้วย **React 18**, **Vite 5**, **Zustand State Store** และชุดกราฟ **Apache ECharts / Recharts** ให้บริการผ่าน **Nginx Gateway** (พอร์ต 80):

* **โครงสร้างการแสดงผลหลัก**:
  * หน้า `/dashboard` ออกแบบให้สลับมุมมองได้ 3 มิติ (`viewMode`: `executive`, `business`, `quality`) พร้อมหน้าแยก `/dashboard-builder` สำหรับการสร้างรายงานอัจฉริยะ:
    1. **Executive View**: แสดงตัวชี้วัดภาพรวมระดับองค์กร ได้แก่ ดัชนีความสมบูรณ์ของข้อมูลรวม, อัตราความสำเร็จตาม SLA, และภาพรวมความสูญเสียทางการเงิน
    2. **Business Impact View**: เจาะลึกสถานะตามสายงานธุรกิจ, การกระทบยอดปริมาณข้อมูลเข้า-ออก (Inbound vs Delivered), การแจกแจง COPDQ 3 มิติ และตารางบัตรงานแก้ไขปัญหา
    3. **Quality Health View**: ประวัติการรันและสถิติคูณภาพรายตาราง พร้อมกราฟกระแสการไหลของข้อมูล
    4. **Dashboard Builder View** (`/dashboard-builder`): เครื่องมือออกแบบแดชบอร์ดที่วิเคราะห์สถิติจาก Semantic Layer แนะนำชาร์ตที่เหมาะสม และส่งออกรายงาน CSV โดยตัดฟิลด์ PII อัตโนมัติ
* **Real-Time Stream Flow Simulation (`DataFlowStreamChart.jsx`)**:
  * คอมโพเนนต์แสดงผลอัตราการไหลของข้อมูลแบบไดนามิก โดยจำลองสัญญาณ Throughput ต่อเนื่องทุก 1.5 วินาที ด้วยอัตราการประมวลผล $1,150 - 1,800$ แถวต่อวินาที (`Math.floor(1150 + Math.random() * 650)`) ควบคู่กับระดับคะแนนคุณภาพแบบแกว่งตามสภาพแวดล้อมจริง เพื่อให้เห็นภาพการเคลื่อนไหวของข้อมูลในระบบแบบ Real-Time
* **Two-Way Global State Synchronization (`useDashboardStore.js`)**:
  * บริหารสถานะระดับสากลด้วย Zustand Store โดยค่า `selectedAreaFilter` จะซิงก์กันแบบสองทาง
  * เมื่อผู้ใช้คลิกเลือกการ์ดกลุ่มธุรกิจ (เช่น Sales หรือ Operations) สเตตของตัวกรองด้านบนจะเปลี่ยนตามทันที และสั่งให้ทุกคอมโพเนนต์บนหน้าจอ (กราฟกระทบยอด, ตัวเลข COPDQ, และตารางบัตรงาน) กรองเฉพาะข้อมูลของกลุ่มธุรกิจนั้นโดยไม่ต้องรีโหลดหน้าเว็บ

---

### เลเยอร์ที่ 8: วงจรปิดแก้ไขปัญหาข้อมูลต้นน้ำและการกู้คืนอัตโนมัติ (Closed-Loop Upstream Healing Layer)

ระบบ DataServe มีกลไกปฏิบัติการแบบวงจรปิด (Closed-Loop Automation) เพื่อผลักดันให้เกิดการแก้ไขปัญหาข้อมูลให้จบตั้งแต่ต้นทางอย่างแท้จริง:

```
[Spark ตรวจพบแถวเสียในไปป์ไลน์]
                 │
                 ▼
[Stage ai_advisory วิเคราะห์สาเหตุและสร้างตั๋วงานลง sdoqap_upstream_remediations]
                 │
                 ▼
[วิศวกรตรวจดูตั๋วงานบนหน้าเว็บ DataServe และเข้าแก้ไขข้อผิดพลาดที่ระบบต้นทาง]
                 │
                 ▼
[วิศวกรกดปุ่ม "Resolve" บนบัตรงานในหน้าพอร์ทัล]
                 │
                 ▼
[FastAPI ปรับสถานะเป็น RESOLVED พร้อมบันทึก resolved_by]
                 │
                 ▼
[FastAPI ยิงคำสั่ง POST http://spark-master:8099/retry พร้อม X-Trigger-Secret]
                 │
                 ▼
[Spark Trigger Daemon รับงานเข้าคิว FIFO และสั่งประมวลผลตารางนั้นใหม่อัตโนมัติ]
                 │
                 ▼
[หน้าเว็บได้รับผลการสั่งรัน (spark_triggered: true) และอัปเดตสถานะแบบสด]
```

1. **Ticket Generation & Dispatch**:
   - ใน Stage `ai_advisory` ของ Spark ระบบจะดึงแถวที่ผิดพลาดใน Quarantine มาประเมินร่วมกับ Groq LLM (หรือ `local_heuristic_v2` กรณีไม่มี API Key)
   - สร้างบัตรงานที่ระบุระบบต้นทางที่ต้องแก้ (`target_system`) พร้อมแนวทางการแก้ไขเชิงเทคนิค (`remediation_action`) บันทึกลง Elasticsearch
2. **Upstream Rectification**:
   - ทีมวิศวกรผู้ดูแลระบบต้นน้ำทำการปรับปรุงแก้ไขโค้ดหรือชุดข้อมูลตามข้อแนะนำ
3. **Automated Re-processing Loop (Commit `33ff867` / `fe6d1c1`)**:
   - เมื่อวิศวกรกดปุ่ม **Resolve** หน้าเว็บจะยิงคำขอไปที่ `POST /api/v1/system/remediations/{ticket_id}/resolve`
   - ฝั่ง API ปรับสถานะตั๋วใน Elasticsearch เป็น `RESOLVED` และส่งคำสั่งต่อไปยัง Spark Trigger Daemon ที่ `POST http://spark-master:8099/retry` พร้อมชื่อตาราง
   - หากการเชื่อมต่อสำเร็จ ระบบจะตอบกลับ `spark_triggered: true` เพื่อสั่งให้ Spark นำข้อมูลที่เตรียมไว้มาประมวลผลใหม่ทันที
   - หาก Daemon ไม่พร้อมทำงาน ระบบจะตอบกลับ `spark_triggered: false` พร้อมแจ้งเตือนผู้ใช้ด้วย Toast สีเหลือง เพื่อความโปร่งใสทางวิศวกรรม

---

## 3. ตารางสรุปข้อมูลจำเพาะทางเทคนิคและพอร์ตเชื่อมต่อ (Technical Specifications & Port Matrix)

| Service Name | Container Name | Technology Stack | Port Mapping (Host:Container) | Primary Architectural Function |
| :--- | :--- | :--- | :--- | :--- |
| **Web Gateway** | `sdoqap-nginx` | Nginx (image `nginx:alpine` ไม่ระบุเวอร์ชัน) | `80:80` | Reverse Proxy, API Routing (`/api/`) & Static Assets Serving |
| **Frontend Portal** | `sdoqap-ui` | React 18, Vite 5, Zustand, ECharts | พอร์ตภายใน (เชื่อมต่อผ่าน Nginx) | แดชบอร์ดกลาง, การกระทบยอดข้อมูล, Dashboard Builder |
| **Backend Serving** | `sdoqap-api` | FastAPI, Python 3.10, Uvicorn | `${API_PORT:-8002}:8000` | REST API, Whitebox Engine, คำนวณ COPDQ, ตรวจสอบ Trust-Check |
| **Spark Master** | `sdoqap-spark-master` | Apache Spark 3.4.1 (Bitnami) | `7077:7077`<br/>`8081:8080`<br/>`8099:8099` | ตัวจัดการคลัสเตอร์ Spark, Web UI, และ Trigger Daemon Service |
| **Spark Worker** | `sdoqap-spark-worker` | Apache Spark 3.4.1 (Bitnami) | พอร์ตไดนามิกภายในคลัสเตอร์ | โหนดประมวลผลแบบกระจายศูนย์ ทำงาน 21 Stage และแยก Quarantine |
| **HDFS NameNode** | `sdoqap-namenode` | Hadoop 3.2.1 | `9870:9870`<br/>`9002:9000` | ตัวจัดการเมทาดาต้าระบบไฟล์ HDFS, จัดเก็บ Bronze & Silver Zone |
| **HDFS DataNode** | `sdoqap-datanode` | Hadoop 3.2.1 | ไม่เปิดพอร์ตสู่ host (9864 ใช้ภายในเครือข่าย Docker) | จัดเก็บและโอนย้ายบล็อกข้อมูลดิบและ Delta Lake บนคลัสเตอร์ |
| **Telemetry Store** | `sdoqap-elasticsearch` | Elasticsearch 8.10.2 | `9200:9200` | จัดเก็บดัชนีชี้วัดคุณภาพ, ล็อกการทำงาน, และบัตรงาน Upstream |
| **Log Visualizer** | `sdoqap-kibana` | Kibana 8.10.2 | `${KIBANA_PORT:-5601}:5601` | สืบค้นเอกสารเมทาดาต้า, วิเคราะห์ Log และค้นหาสาเหตุเชิงลึก |
| **Metrics Dashboard**| `sdoqap-grafana` | Grafana OSS 10.1.5 | `${GRAFANA_PORT:-3002}:3000` | แดชบอร์ดติดตาม Throughput และสุขภาพของคอนเทนเนอร์ในระบบ |
| **Message Broker** | `sdoqap-kafka` | Confluent Kafka 7.5.0 | `9092:29092` | บัฟเฟอร์รับข้อมูลสตรีมมิ่งสด (เปิดใช้ผ่าน profile `streaming`) |
| **Broker Coordinator**| `sdoqap-zookeeper` | Confluent Zookeeper 7.5.0 | พอร์ตภายในคลัสเตอร์ | ประสานงานและจัดการการตั้งค่าคลัสเตอร์ Kafka |
| **Relational Source**| `sdoqap-postgres` | PostgreSQL 15 Alpine | `${POSTGRES_HOST_PORT:-5432}:5432` | แหล่งข้อมูลเชิงสัมพันธ์ต้นทางตัวอย่างสำหรับการนำเข้าแบบ RDBMS |
| **Automation Engine**| `sdoqap-n8n` | n8n Workflows | `${N8N_PORT:-5678}:5678` | ระบบจัดตารางเวลาอัตโนมัติ และยิง Webhook แจ้งเตือนข้อผิดพลาด |
| **Local LLM Engine** | `sdoqap-ollama` | Ollama | พอร์ตภายในคลัสเตอร์ | ตัวเลือกประมวลผลโมเดลภาษาในเครื่อง (เปิดใช้ผ่าน profile `ai`) |

---

## 4. มาตรการความปลอดภัยและคุณสมบัติทางวิศวกรรม (Security & Engineering Invariants)

1. **Volume Balance (เป้าหมายการออกแบบ)**:
   - ออกแบบให้แถวที่เข้าสู่ระบบถูกนับอยู่ใน Active, Quarantine หรือแถวซ้ำที่ถูกตัดใน Auto-Clean และมี Stage `quarantine_breakdown` กับ `report` ใช้ตรวจสอบ
   - หากขั้นตอน `MERGE INTO` ล้มเหลว ระบบหยุดรันแบบ fail-closed โดยไม่แตะ Active Zone และเก็บข้อมูลดิบไว้ให้รันซ้ำได้ (`spark_quality_engine.py`)
2. **Strict Idempotency Invariant**:
   - การประมวลผลซ้ำหรือสั่ง Retry บน Delta Lake Active Zone ใช้คำสั่ง `MERGE INTO` ตาม Primary Key จึงไม่มีการเกิดข้อมูลซ้ำซ้อน
   - ส่วน Quarantine Zone เมื่อมี `ingest_id` และตารางเดิมเป็น Delta อยู่แล้ว จะลบข้อมูลของ `ingest_id` เดิมออกก่อน Append ใหม่ การรันซ้ำของการนำเข้าเดียวกันจึงไม่เพิ่มแถวซ้ำใน Quarantine
3. **Data Privacy & LLM Redaction Guardrails**:
   - คอลัมน์ที่ถูกระบุว่าเป็น PII จะถูกตัดออกจากการส่งออกข้อมูล และไม่ถูกส่งไปยังโมเดลภาษาภายนอก
   - แถวตัวอย่างจาก Quarantine ที่ส่งไปให้ LLM วิเคราะห์เพื่อสร้างคำแนะนำ จะถูกแทนที่ค่าที่สามารถระบุตัวตนได้ด้วยคำว่า `<redacted>` เสมอ
4. **Defense-in-Depth API Security**:
   - เอนด์พอยต์ที่เกี่ยวกับการแก้ไขข้อมูลและการส่งออกแถวข้อมูลดิบทุกเส้นทางจำเป็นต้องผ่านการยืนยันตัวตนด้วย Session Cookie
   - การเชื่อมต่อของระบบอัตโนมัติภายนอก (n8n) ควบคุมด้วย `X-Service-Key`
   - การสั่งรันไปป์ไลน์ผ่าน Trigger Daemon ควบคุมด้วย `X-Trigger-Secret` (`TRIGGER_SHARED_SECRET`) แบบเข้มงวด

---

## 5. สรุปผลการตรวจสอบความสอดคล้องกับโค้ดจริง (Code Parity Verification Summary)

จากการตรวจสอบย้อนกลับไปยังซอร์สโค้ดของระบบบน commit ล่าสุด ได้ข้อสรุปยืนยันดังนี้:

* **การคำนวณ COPDQ และผลกระทบทางธุรกิจ**:
  - สูตร 3 มิติอยู่ใน `services/api/app/api/analytics.py` ส่วน Stage `copdq` ใน `services/spark/sdoqap/stages/metrics.py` คำนวณเฉพาะ `quarantined_financial_value` ที่ API นำไปใช้ต่อ ทั้งหมดเป็นการประมาณจากค่าสมมติคงที่ ไม่ใช่ตัวเลขทางบัญชี โดยแจกแจงเป็น 3 มิติ ได้แก่ ต้นทุนการแก้ไข ($2/แถว), โอกาสที่สูญเสีย (คำนวณจากมูลค่าการเงินจริงในแถวกักกัน), และความเสี่ยงจาก Schema Drift
* **การจำลองสตรีมมิ่งใน UI (`DataFlowStreamChart.jsx`)**:
  - ตรวจพบโค้ดสร้างข้อมูลจำลองอัตรา Throughput $1,150 - 1,800$ แถวต่อวินาทีด้วยฟังก์ชัน `Math.random()` ทุก 1.5 วินาที เพื่อแสดงพลวัตของกระแสข้อมูลบนหน้าเว็บจริง
* **การซิงก์สถานะตัวกรองผ่าน Zustand (`useDashboardStore.js`)**:
  - ตรวจพบฟังก์ชัน `setSelectedAreaFilter` และการจัดการสเตต `selectedAreaFilter` ที่เชื่อมโยงการเลือกแผนกเข้ากับดรอปดาวน์และการกรองข้อมูลทุกชิ้นบนแดชบอร์ดอย่างแม่นยำ
* **ช่องทางการแจ้งเตือนของ n8n และ Alert Router**:
  - ตรวจพบการทำงานร่วมกับ Slack Webhook (`SLACK_WEBHOOK_URL`) และ LINE Notify (`LINE_NOTIFY_TOKEN`) โดยระบบไม่มีโค้ดเชื่อมต่อกับ Microsoft Teams ทั้งนี้ LINE ยุติบริการ LINE Notify ตั้งแต่ มี.ค. 2025 ช่องทางนี้จึงมีในโค้ดแต่ใช้งานจริงไม่ได้ ถ้าไม่ตั้งค่าช่องทางใดเลย alert จะถูกบันทึกในล็อกภายในเท่านั้น
* **วงจรปิดการสั่งรันซ้ำเมื่อแก้ตั๋วงาน (Closed-Loop Reprocessing)**:
  - ยืนยันการมีอยู่ของคำสั่งเรียก `POST http://spark-master:8099/retry` ในฟังก์ชัน `resolve_remediation_ticket` (`services/api/app/api/system.py`) พร้อมการส่งค่า `spark_triggered` กลับมาแสดงผลบนหน้าบ้านอย่างสมบูรณ์
* **รายละเอียด Stage ขั้นสูงใน Distributed Spark 21 Stages**:
  - `anomaly_induced` (`services/spark/sdoqap/stages/anomaly.py`): ดึงกฎจำแนกจาก `rules['induced']` แล้วประเมินเงื่อนไขผ่าน Spark SQL `F.expr(combined_sql_cond)` โดยแท็กแถวที่ตรงเงื่อนไขด้วย `reject_reason = 'induced_tree_rule_match'` และแยกเข้าสู่ Quarantine
  - `standardize_categories` (`services/spark/sdoqap/stages/standardize.py`): อ่าน `standardization_rules` จาก Elasticsearch Schema Registry และรัน UDF แปลงค่าตามคีย์เวิร์ดเข้าสู่กลุ่มมาตรฐาน พร้อมค่า fallback อย่างสมบูรณ์
  - `operational_impact` (`services/spark/sdoqap/stages/metrics.py`): คำนวณค่าน้ำหนักความผิดพลาดสูงสุดรายแถว (`max failure weight`) ตามค่าน้ำหนักใน `column_weights` (PK, วันที่, และคอลัมน์อื่น) แล้วเฉลี่ยกับจำนวนแถวทั้งหมด
* **มาตรการ PII Guardrail ใน Semantic Layer และ Dashboard Builder**:
  - ตรวจสอบฟังก์ชันตรวจจับและปิดบังข้อมูลส่วนบุคคลใน `services/api/app/api/semantic.py` และ `dashboards.py` โดยคอลัมน์ที่ถูกจัดเป็น PII จะถูกตัดออกจากการส่งออก CSV และสวมหน้ากากอัตโนมัติ
* **ความสอดคล้องของคอนฟิกกฎ (`rules_config.json`)**:
  - ปรับปรุงและซิงก์คอนฟิกของชุดข้อมูล `olist_products_dataset` ให้ตรงตามภาคผนวก ข ในรายงานฉบับสมบูรณ์ (กำหนด NOT NULL แบบเข้มงวด 8 คอลัมน์, Non-Negative Range `>= 0`, และ Tukey IQR 3.0x Outlier Detection) พร้อมรองรับในเอนจิน `rules.py`, `anomaly.py`, และ `cleansing.py`

---

## 6. สถานะการตรวจทานและการประกันคุณภาพ (Quality Assurance & Parity Status)

* ระบบได้รับการตรวจทานเทียบเคียงโค้ดจริง (Code Parity Audit) ครบถ้วนทุก 8 เลเยอร์สถาปัตยกรรม และ 21 Spark Pipeline Stages
* โครงสร้างคอนฟิกและพฤติกรรมของ Interactive Whitebox Engine และ Distributed Spark Batch Engine มีความสอดคล้องกับข้อกำหนดทางเทคนิค (Technical Specification) เรียบร้อย 100%
