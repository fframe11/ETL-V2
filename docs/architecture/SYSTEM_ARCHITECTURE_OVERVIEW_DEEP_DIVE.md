# รายละเอียดสถาปัตยกรรมระบบเชิงลึก (Deep-Dive System Architecture Overview)

**โครงการ**: SDOQAP (Smart Data Operations & Quality Assurance Platform)  
**วันที่บันทึก**: 8 ตุลาคม 2569  
**ตรวจทานกับโค้ด**: commit `936ae76` (branch `feat/generic-profiling-rule-engine`) ข้อความอิงไฟล์ในโค้ดจริง ส่วนที่ยังไม่ได้ตรวจระบุไว้ท้ายเอกสาร  
**สถาปัตยกรรมหลัก**: Modern Medallion Lakehouse, Data Observability, Proactive Upstream Governance  

---

## 1. ภาพรวมการแบ่งชั้นสถาปัตยกรรม (High-Level Architectural Layers)

สถาปัตยกรรม SDOQAP แบ่งการทำงานออกเป็น 8 เลเยอร์หลักตามวงจรชีวิตของข้อมูล (Data Lifecycle) ตั้งแต่ต้นทางจนถึงการนำไปใช้ประโยชน์:

```
[1. Multi-Source Ingestion & Trigger]
                 │
                 ▼
[2. Bronze Storage & Pre-Flight Governance (Schema Drift & Semantic Layer)]
                 │
                 ▼
[3. Distributed Spark Compute & 21-Stage Quality Segregation Engine]
                 │
                 ▼
[4. Silver Medallion Dual-Zone Storage (Delta Lake Active vs. Delta Lake Quarantine)]
                 │
                 ▼
[5. Gold Observability & Telemetry Indices (Elasticsearch 8 / Kibana / Grafana)]
                 │
                 ▼
[6. Serving API & Business Impact Engine (FastAPI / COPDQ Estimate)]
                 │
                 ▼
[7. Central Portal UI & Two-Way Synchronized Governance (React 18 / Zustand)]
                 │
                 ▼
[8. Closed-Loop Upstream Remediation & Re-processing Trigger]
```

---

## 2. รายละเอียดการทำงานเชิงลึกแยกตามแต่ละเลเยอร์

---

### เลเยอร์ที่ 1: การนำเข้าข้อมูลและการสตรีมสด (Multi-Source Ingestion & Trigger Layer)

เลเยอร์นี้ทำหน้าที่เป็นด่านหน้าในการเปิดรับและรวบรวมข้อมูลจากแหล่งข้อมูลที่หลากหลาย (Data Ingestion Hub) โดยไม่จำกัดโครงสร้าง:

* **Batch File Ingestion**:
  * รองรับไฟล์ CSV และ Excel ผ่าน `POST /api/v1/pipeline/ingest/csv` (ตอบ 202 พร้อม `ingest_id`)
  * ตรวจ checksum ไฟล์ซ้ำ, ตรวจว่าคอลัมน์คีย์หลักอยู่ในไฟล์ก่อนลง HDFS และจำกัดขนาดไฟล์
  * การอ่านหัวคอลัมน์รองรับ UTF-8 และ UTF-8 BOM เท่านั้น ไม่พบโค้ดตรวจหรือแปลง TIS-620 / Windows-874 ไฟล์ภาษาไทยที่ไม่ใช่ UTF-8 ต้องแปลงก่อนอัปโหลด
* **Relational Database Ingestion**:
  * `POST /api/v1/pipeline/ingest/rdbms` รับเฉพาะ SELECT แบบ read-only จากโฮสต์ใน `RDBMS_ALLOWED_HOSTS` เป็นการดึงทั้งผลลัพธ์ของคำสั่ง ไม่ใช่ CDC
  * `sdoqap-postgres` (host `${POSTGRES_HOST_PORT:-5432}`) เป็นฐานข้อมูลต้นทางตัวอย่าง
* **Upstream REST API Ingestion**:
  * `POST /api/v1/pipeline/ingest/api` ดาวน์โหลด JSON/CSV จาก URL, แปลงเป็น CSV, เขียนลง HDFS แล้วสั่ง Spark
  * ส่ง header `api-key` และ `Authorization: Bearer` ให้ต้นทางเมื่อระบุ `api_key` ได้ และจำกัดโฮสต์ด้วย `API_INGEST_ALLOWED_HOSTS` (fail-closed)
  * ไม่พบโค้ด pagination, retry เมื่อได้ HTTP 429 หรือการแกะ nested JSON ในเส้นทางนี้
* **Real-Time Streaming Queue**:
  * ใช้ **Apache Kafka** กับ **Zookeeper** (profile `streaming`) ทั้งคู่ไม่เปิดพอร์ตให้ host ยกเว้น Kafka ที่ map `9092:29092`
  * ใช้กับสตรีม Reddit (`POST /api/v1/pipeline/ingest/reddit`) แล้ว Spark Structured Streaming (`streaming_job.py`) อ่านต่อ ไม่มี clickstream ในโค้ด
* **Spark Trigger Daemon**:
  * Background service ที่พอร์ต `8099` ของ Spark Master ป้องกันด้วย `TRIGGER_SHARED_SECRET` (header `X-Trigger-Secret`)
  * `POST /retry` ส่งงานเข้าคิว FIFO ต่อตาราง ถูกเรียกเมื่อมีการนำเข้าไฟล์ใหม่ และเมื่อกด Resolve ตั๋วงานที่หน้าเว็บ

---

### เลเยอร์ที่ 2: โซนข้อมูลดิบและธรรมาภิบาลโครงสร้าง (Bronze Storage & Pre-Flight Governance Layer)

ข้อมูลที่เข้าสู่ระบบจะต้องผ่านกระบวนการคัดกรองความปลอดภัยของโครงสร้างก่อนเข้าสู่กระบวนการประมวลผลหลัก:

* **HDFS Raw Bronze Zone**:
  * ข้อมูลดิบถูกบันทึกลง **HDFS** ที่ `/data/raw/<table_name>/<ingest_id>/` ตามสภาพเดิม ไม่แก้ไข และหลังประมวลผลเสร็จย้ายไป `/data/archive/<table_name>/<ingest_id>` (ไม่ลบ) เพื่อใช้ตรวจย้อนหลังและรันซ้ำได้ (`POST /api/v1/pipeline/retry/{run_id}`) Time-Travel เป็นคุณสมบัติของตาราง Delta ไม่ใช่ของโซน raw
* **Schema Drift Pre-Flight Gate** (stage `schema_drift`):
  * เทียบ Schema ของข้อมูลชุดใหม่กับ `schema_registry.json` ก่อนตรวจคุณภาพ
  * บันทึกคะแนน `drift_severity` ของรอบนั้น: คอลัมน์ใหม่ +1, คอลัมน์หาย +5, ชนิดข้อมูลไม่ตรง +5
  * **Safe Drift**: ถ้าพบ **เฉพาะคอลัมน์ใหม่** และนโยบายอนุญาต (`policy_allow_new`, ไม่ต้องขออนุมัติ, จำนวนคอลัมน์ไม่เกินเพดาน) ระบบ **Auto-Evolve** registry และบันทึก proposal ลง `sdoqap_schema_proposals` (คะแนน `drift_severity` ใช้บันทึกและแสดงผล ไม่ได้เป็นตัวตัดสิน)
  * **คอลัมน์หาย**: เติมค่า NULL ตามชนิดที่คาดไว้ แล้วส่งแจ้งเตือนระดับ critical (ฟังก์ชัน `send_n8n_alert` ยิง webhook ของ n8n และเรียก `alert_router` ส่งเข้า Slack เมื่อตั้ง `SLACK_WEBHOOK_URL` หรือ LINE Notify เมื่อตั้ง `LINE_NOTIFY_TOKEN` ถ้าไม่ตั้งทั้งสองจะบันทึก log เท่านั้น ไม่มี Microsoft Teams)
  * **ชนิดข้อมูลไม่ตรง**: แคสต์คอลัมน์นั้นเป็น string
  * drift แบบอื่นที่ไม่ใช่คอลัมน์ใหม่ล้วน สร้าง proposal รออนุมัติที่หน้า `/schema` (ผลทดสอบ: ลบหรือเปลี่ยนชื่อคอลัมน์ทำให้ทั้งรอบเข้า Quarantine ดู `docs/reports/DataServe_Technical_Report_verified.md` หัวข้อ 6.3)
* **Semantic Layer & Data Privacy Guardrails**:
  * ทำงานผ่าน `/api/v1/semantic` (ต้องล็อกอิน, ผู้ใช้อนุมัติ draft ก่อนใช้)
  * วิเคราะห์ความหมายคอลัมน์ (บทบาท หน่วย สกุลเงิน) และ **ตั้งธง PII** ด้วยรายชื่อคำภาษาอังกฤษและไทย ผู้ใช้แก้ธงได้
  * ธง PII ใช้ **กันคอลัมน์ออก** ไม่ได้ปิดบังค่า (mask): Dashboard Builder ไม่ส่งแถวข้อมูลให้ LLM และการส่งออก CSV ไม่รวมคอลัมน์ PII เป็นค่าเริ่มต้น

---

### เลเยอร์ที่ 3: เอนจินประมวลผลและการคัดแยกข้อมูลระดับแถว (Distributed Spark QA & Segregation Engine)

หัวใจสำคัญของการประมวลผลคือ **Apache Spark Cluster** (Master-Worker Architecture บน Bitnami Image) ที่ทำหน้าที่ตรวจสอบและคัดแยกข้อมูลแบบแถวต่อแถว (Row-Level Segregation):

* **Distributed Compute Topology**:
  * **Spark Master**: จัดการคิวงาน, จัดสรรทรัพยากร และรัน Trigger Daemon (พอร์ต 7077, 8081 Web UI, 8099 Daemon)
  * **Spark Worker**: ประมวลผลแบบกระจาย ตั้ง `spark.sql.shuffle.partitions=200` คงที่ ไม่พบโค้ดปรับจำนวนพาร์ทิชันอัตโนมัติตามขนาดข้อมูล
* **เส้นทาง 21 stage** (นิยามด้วย `@stage` ใน `services/spark/sdoqap/stages/` และจับเวลาแยกใน `stage_seconds`) จัดเป็น 3 ช่วง:
  1. **align**: `schema_align`
  2. **transform**: `schema_drift`, `auto_clean`, `validation` (null, ชนิด, วันที่), `dedup` (เก็บแถวล่าสุดตามคีย์), `standardize_dates` (รวม พ.ศ.), `standardize_categories`, `range_rules` (ช่วงค่าตามธุรกิจ), `anomaly_iqr` (Tukey IQR, ค่า default 1.5× ตั้งต่อตารางได้ใน `rules_config.json`), `anomaly_zscore` (เกณฑ์ 3σ), `anomaly_induced` (กฎที่เรียนจาก Decision Tree), `quarantine_assembly`, `column_filter`
  3. **post_load**: `distribution`, `quarantine_breakdown`, `copdq`, `freshness`, `quality_score`, `ai_advisory`, `operational_impact`, `report`
* กฎข้ามตาราง (Multi-Table) อยู่ในเอนจินโต้ตอบ `/api/v1/whitebox/multi-table/*` ไม่ใช่ใน stage ของ Spark

---

### เลเยอร์ที่ 4: สถาปัตยกรรมการจัดเก็บข้อมูลแบบแยกคุณภาพ (Silver Medallion Dual-Zone Storage Layer)

ผลลัพธ์จากการคัดแยกของ Spark จะถูกแยกเส้นทางและบันทึกไปยังพื้นที่จัดเก็บ 2 ส่วนอย่างเป็นเอกเทศ:

* **Active Store (Clean Silver Zone)**:
  * ตำแหน่งจัดเก็บ: `/data/active/<table_name>/`
  * เทคโนโลยี: **Delta Lake (Parquet + Transaction Log)**
  * วิธีการบันทึก: ใช้คำสั่ง **`MERGE INTO` (Upsert)** ตาม Primary Key
  * คุณสมบัติเด่น:
    - รองรับ **ACID Transactions** การันตีว่าข้อมูลจะไม่เสียหายขณะเขียนพร้อมกัน
    - มีคุณสมบัติ **Idempotency** (รันซ้ำกี่ครั้งก็ได้ผลลัพธ์เหมือนเดิม ไม่เกิดแถวเบิ้ลซ้ำ)
    - เป็นพื้นที่จัดเก็บสำหรับส่งต่อให้ระบบ BI, Data Analytics และโมเดล Machine Learning
* **Quarantine Store (Error Isolation Zone)**:
  * ตำแหน่งจัดเก็บ: `/data/quarantine/<table_name>/`
  * เทคโนโลยี: **Delta Lake** แบ่งพาร์ทิชันตาม `run_id` ทำหน้าที่เป็น Dead-Letter Queue
  * วิธีการบันทึก: ก่อนเขียน ลบแถวเดิมของ `ingest_id` นั้นออก แล้ว append ใหม่ (idempotent) แถวที่ไม่ผ่านเกณฑ์คงค่าเดิมครบทุกคอลัมน์ พร้อมคอลัมน์กำกับ:
    - `run_id`, `ingest_id`: รอบการประมวลผลและการนำเข้า
    - `reject_reason`: ข้อความสาเหตุ เช่น `missing_primary_key`, `null_value_in_<คอลัมน์>`, `out_of_range_<คอลัมน์>`, `<คอลัมน์>=<ค่า> (expected [<ช่วง>])` สำหรับ IQR และ `<คอลัมน์>_zscore=<ค่า>` สำหรับ Z-score (หลายสาเหตุในแถวเดียวต่อกันด้วย `|`)
  * ประโยชน์: ข้อมูลเสียไม่ปนเข้าตารางหลัก และตรวจย้อนหลังได้ การกระทบยอด: นำเข้า = Active + Quarantine ยกเว้นแถวคีย์ซ้ำที่ `auto_clean` ตัดก่อนนับ (ตัวอย่าง: 10,100 แถว ตัดซ้ำ 100 เหลือ 10,000 → Active 9,370 + Quarantine 630)

---

### เลเยอร์ที่ 5: การสังเกตการณ์ ดัชนีเมทาดาต้า และความเสี่ยง (Observability & Gold Telemetry Layer)

สถิติ ข้อมูลสรุป และประวัติการทำงานทั้งหมดจะถูกแปลงเป็นเอกสาร JSON และทำดัชนีเข้าสู่ **Elasticsearch 8.10.2** (พอร์ต 9200) เพื่อรองรับการค้นหาและวิเคราะห์แบบมิลลิวินาที:

* **ดัชนีหลักในระบบ (Core Elasticsearch Indices)**:
  * `sdoqap_quality_runs`: เก็บสถิติสรุปรายรอบ ได้แก่ จำนวนแถวรับเข้า, แถวสะอาด, แถวติดกักกัน, คะแนนคุณภาพ (stage `quality_score` คำนวณจากอัตรากักกันเทียบประวัติ พร้อมตรวจความผิดปกติด้วย z-score ของอัตรากักกัน) และ `stage_seconds`
  * `sdoqap_pipeline_runs`: เก็บสถิติเวลาการทำงานของแต่ละงาน, ความหน่วงเวลา (Latency) และการปฏิบัติตามข้อตกลงระดับบริการ (SLA Compliance)
  * `sdoqap_upstream_remediations`: เก็บบัตรงานแก้ไขปัญหาข้อมูลที่ต้นทาง พร้อมระบุชื่อระบบเป้าหมาย (`target_system`), คำแนะนำการแก้ปัญหา (`remediation_action`), ระดับความรุนแรง (`severity`) และสถานะงาน (`OPEN` หรือ `RESOLVED`)
  * `sdoqap_schema_proposals`: เก็บประวัติข้อเสนอการเปลี่ยนแปลงโครงสร้างข้อมูล ทั้งที่ผ่านการ Auto-Evolve และที่รอการอนุมัติจากวิศวกร
  * `sdoqap_semantic_layer`: เอกสารละหนึ่งชุดข้อมูล เก็บความหมายคอลัมน์ (บทบาท หน่วย สกุลเงิน ธง PII) ที่ผู้ใช้อนุมัติ
  * ดัชนีอื่น: `sdoqap_runs`, `sdoqap_run_locks`, `sdoqap_schema_registry`, `sdoqap_rules_registry`, `sdoqap_ai_rule_proposals`, `sdoqap_gold_*`
* **เครื่องมือวิเคราะห์เชิงสังเกตการณ์ (Observability UIs)**:
  * **Kibana** (พอร์ต 5601): สำหรับการสืบค้นข้อมูลเชิงลึก (White-Box Exploration), ตรวจสอบ Log และค้นหาเอกสารต้นตอ
  * **Grafana** (พอร์ต 3002): แสดงผลกราฟ Time-Series สรุปสถานะการทำงานของคอนเทนเนอร์, Throughput และอัตราความผิดปกติของ Pipeline

---

### เลเยอร์ที่ 6: การให้บริการข้อมูลและการวิเคราะห์ผลกระทบทางธุรกิจ (FastAPI Serving & Business Impact Engine)

ส่วนหลังบ้านพัฒนาด้วย **FastAPI** (Python 3.10) ทำหน้าที่ประมวลผล Business Logic และให้บริการ REST Endpoints ผ่านพอร์ต `8002` (ภายนอก) / `8000` (ภายใน):

* **Domain Mapping Architecture**:
  * `AREA_TABLE_MAPPING` ใน `analytics.py` จับคู่คำในชื่อตารางกับ 5 กลุ่มธุรกิจ (`sales`, `customer`, `operations`, `reporting`, `finance`) เป็นการแมปตามชื่อ (hardcode) ตารางที่ชื่อไม่ตรงจะไม่ถูกจัดเข้ากลุ่ม และชุดนักศึกษา (`student*`) ยังอยู่ในกลุ่ม `customer`
  * `GET /api/v1/executive/overview` รับพารามิเตอร์ `business_area` (ค่า `all` = ทุกกลุ่ม) เพื่อกรองผล
* **COPDQ (ค่าประเมินความเสียหายจากข้อมูลคุณภาพต่ำ)** ใน `GET /api/v1/analytics/impact`:
  $$	ext{Total COPDQ} = C_{	ext{correction}} + C_{	ext{opportunity}} + C_{	ext{risk}}$$
  1. *Cost of Correction* = จำนวนแถวที่ถูกกักกัน x 2 ดอลลาร์ (ค่าคงที่ที่สมมติจากต้นทุนวิศวกรรมต่อแถว)
  2. *Cost of Lost Opportunities* = มูลค่าการเงินจริงของแถวที่ถูกกักกัน (ผลรวมคอลัมน์ยอดเงินที่ตรวจพบ) ถ้าไม่มีคอลัมน์ยอดเงิน ใช้ค่าประมาณ 2.5 ดอลลาร์ต่อแถว (สมมติข้อผิดพลาด 5% ของธุรกรรม 50 ดอลลาร์)
  3. *Cost of Risk* = จำนวนแถวที่ถูกกักกัน x คะแนน `drift_severity` (ถ้าไม่มี schema drift ใช้ตัวคูณ 1)
  * เป็น **ค่าประมาณจากสมมติฐาน** ไม่ใช่ความเสียหายที่วัดได้จริง ควรนำเสนอว่า "ประเมิน" เสมอ
* **Business Impact Cascade**:
  * ห่วงโซ่ 4 ขั้น: Technical Issue → Impacted KPI → Business Impact → Business Action
  * รายการเป็น **5 สถานการณ์ที่เขียนไว้ล่วงหน้า** (API Ingestor Failure, Schema Drift, Data Quarantine, Data Latency, Duplicate Transactions) ข้อความอธิบายตายตัว ส่วน severity และ status ปรับตามค่าจริง (จำนวน pipeline ที่ล้ม, จำนวน drift, จำนวนแถวกักกัน, ความล่าช้าของข้อมูล) รายการ Duplicate Transactions แสดงสถานะ Normal / Resolved เสมอ
* **Trust-Check Gate API**:
  * Endpoint: `GET /api/v1/lineage/{table_name}/trust-check`
  * ดู run ล่าสุดของตารางใน `sdoqap_quality_runs` แล้วตรวจคะแนนคุณภาพเทียบเกณฑ์ที่ใช้ในรอบนั้น, proposal ของ schema ที่ค้างอยู่ และความสดใหม่ ตอบ `is_safe_to_consume` พร้อม `recommendation` (ถ้าไม่มี run ตอบ `false` และ `HALT_INGEST`)
  * เป็นคำตอบให้ระบบปลายทางตัดสินใจเอง **ไม่ได้ปิดกั้นการเข้าถึง Delta Lake** และไม่ได้ตรวจตั๋วงานวิกฤตที่ค้างอยู่

---

### เลเยอร์ที่ 7: แผงควบคุมกลางและส่วนประสานผู้ใช้ (Central Portal UI Layer)

หน้าบ้านพัฒนาด้วย **React 18**, **Vite 5**, **Zustand State Store** และ **Apache ECharts** ให้บริการผ่าน **Nginx Gateway** (พอร์ต 80):

* **หน้าจอหลัก**: หน้า `/dashboard` มี 3 โหมด (`viewMode`: `executive`, `business`, `quality`) และ Dashboard Builder เป็นอีกหน้า `/dashboard-builder` รวมเป็น 4 มุมมอง ส่วนหน้าอื่นที่ต้องล็อกอิน: `/pipeline`, `/ingestion`, `/rules`, `/schema`, `/analytics`, `/export`, `/whitebox`, `/guide`
  1. **Executive**: ตัวชี้วัดระดับผู้บริหารจาก `/api/v1/executive/overview` (คะแนนคุณภาพ, SLA, ส่วนต่างปริมาณ)
  2. **Business**: สถานะตามกลุ่มธุรกิจ, ผลกระทบทางธุรกิจ, กราฟเทียบปริมาณนำเข้ากับปริมาณส่งมอบ และมูลค่าความเสียหาย (COPDQ)
  3. **Quality**: ประวัติ run ต่อตาราง และกราฟ `DataFlowStreamChart` ซึ่งเอา run จริงจาก API มาพล็อต **แล้วเติมจุดสุ่มต่อท้ายทุก 1.5 วินาที** (throughput ที่แสดง 1,150 ถึง 1,850 แถว/วินาทีมาจาก `Math.random()` และมีปุ่มจำลองข้อมูลผิดปกติ) จึงเป็นภาพสาธิตการไหล ไม่ใช่ telemetry จริง ห้ามใช้ตัวเลข throughput บนกราฟนี้เป็นหลักฐานประสิทธิภาพ
  4. **Dashboard Builder** (`/dashboard-builder`): LLM สร้าง spec จากโปรไฟล์คอลัมน์ ตัวเลขคำนวณฝั่ง API มี semantic editor และปุ่ม Export CSV ที่เลือกรวมคอลัมน์ข้อมูลส่วนบุคคลได้ (ค่าเริ่มต้นไม่รวม)
* **Two-Way Global State Synchronization**:
  * การคลิกการ์ดแผนกบนหน้า Business Impact และดรอปดาวน์ Filter By ใช้ค่าเดียวกันใน Zustand Store (`useDashboardStore`, `selectedAreaFilter`) คลิกการ์ดซ้ำหรือกด `Reset Filter` เพื่อกลับเป็น `All`
  * ค่านี้ถูกส่งเป็นพารามิเตอร์ `business_area` ไปที่ API และใช้กรองรายการตั๋วงานกับรายการผลกระทบฝั่งหน้าจอ
* **Upstream Governance Panel**:
  * แสดงรายการตั๋วงานแก้ไขที่ส่งไปยังทีมต้นน้ำ โดยมีแท็บแยก **Open** (เฉพาะที่ค้างอยู่) และ **All** (ทั้งหมด)
  * แสดงป้ายระบุระบบต้นทาง (`target_system`) และคำแนะนำการแก้ไขเชิงปฏิบัติการ (`remediation_action`) อย่างชัดเจน

---

### เลเยอร์ที่ 8: วงจรปิดแก้ไขปัญหาข้อมูลต้นน้ำและสั่งประมวลผลซ้ำ (Closed-Loop Upstream Remediation Layer)

SDOQAP ไม่หยุดอยู่แค่การตรวจจับความผิดปกติ แต่ออกตั๋วงานให้ทีมต้นน้ำ และสั่งประมวลผลซ้ำเมื่อปิดตั๋ว:

```
[Spark ตรวจพบแถวเสีย]
         │
         ▼
[บันทึก Ticket พร้อม Action Narrative ลง Elasticsearch]
         │
         ▼
[วิศวกรเปิดตั๋วดูบน Dashboard และเข้าไปแก้โค้ด/สเปกที่ระบบต้นทาง]
         │
         ▼
[วิศวกรกดปุ่ม "Resolve" บนหน้าเว็บ]
         │
         ▼
[FastAPI ปรับสถานะเป็น RESOLVED (บันทึก resolved_by) แล้วเรียก POST /retry ที่ Spark Daemon :8099]
         │
         ▼
[Spark ประมวลผลตารางนั้นซ้ำ ผลตอบกลับมี spark_triggered true/false]
         │
         ▼
[หน้าเว็บ Refetch รายการตั๋ว]
```

1. **Ticket Dispatching**: stage `ai_advisory` (`ai_rule_advisor.py`) วิเคราะห์แถวใน Quarantine แล้วเขียนตั๋วลง `sdoqap_upstream_remediations` พร้อม `target_system` และ `remediation_action` ใช้ LLM เมื่อมี `GROQ_API_KEY` มิฉะนั้นใช้ heuristic (`local_heuristic_v2`) ที่มีข้อความสำเร็จรูปตามสาเหตุหลัก (เช่น ซ้ำบนคีย์หลัก)
2. **Upstream Rectification**: ทีมวิศวกรต้นทางแก้ตามคำแนะนำ (ทำนอกระบบ)
3. **Automated Re-processing Trigger** (เพิ่มใน commit `33ff867`):
   - กดปุ่ม **Resolve** → `POST /api/v1/system/remediations/{ticket_id}/resolve` (ต้องล็อกอิน)
   - API เปลี่ยนสถานะตั๋วเป็น `RESOLVED` แล้วเรียก `POST http://spark-master:8099/retry` ด้วย `{"table": <ชื่อตาราง>}` และ `X-Trigger-Secret`
   - ถ้าเรียก daemon ไม่ได้ ตั๋วยังถูกปิด แต่ตอบ `spark_triggered: false` พร้อม `trigger_error`, บันทึก log ระดับ warning และ UI แสดง toast สีเหลืองว่ายังไม่ได้เริ่มประมวลผล
   - เป็นการสั่งประมวลผลตารางนั้นซ้ำ ระบบไม่ได้ดึงข้อมูลชุดใหม่จากต้นทางเอง ผลลัพธ์จะดีขึ้นก็ต่อเมื่อมีข้อมูลที่แก้แล้วนำเข้าใหม่ จึงยังไม่มีหลักฐานว่าคะแนนคุณภาพกลับเป็นปกติหลังกด Resolve

---

## 3. ตารางสรุปข้อมูลจำเพาะทางเทคนิคและพอร์ตเชื่อมต่อ (Technical Specifications & Port Matrix)

| Service Name | Container Name | Technology Stack | Port Mapping | Primary Function |
| :--- | :--- | :--- | :--- | :--- |
| **Nginx Web Gateway** | `sdoqap-nginx` | Nginx Alpine | `${NGINX_HOST_PORT:-80}:80` | Reverse Proxy & Routing `/api/` to Backend, `/` to UI |
| **Frontend Portal** | `sdoqap-ui` | React 18, Vite 5, ECharts, Recharts, Zustand | ไม่เปิดพอร์ตตรง (ผ่าน nginx) | Central Dashboard, Dashboard Builder, Pipeline, Schema, Rules |
| **Backend Serving** | `sdoqap-api` | FastAPI, Python 3.10, Uvicorn | `${API_PORT}:8000` (`.env` ตั้ง 8002) | REST Endpoints, COPDQ, Trust-Check |
| **Spark Master** | `sdoqap-spark-master` | Apache Spark 3.4.1 (Bitnami) | `7077:7077`<br/>`8081:8080`<br/>`8099:8099` | Distributed Cluster Master, Spark Web UI, Trigger Daemon |
| **Spark Worker** | `sdoqap-spark-worker` | Apache Spark 3.4.1 (Bitnami) | Dynamic | Distributed In-Memory QA Processing |
| **HDFS NameNode** | `sdoqap-namenode` | Hadoop 3.2.1 | `9870:9870`<br/>`9002:9000` | Master File System Metadata, Bronze & Quarantine Storage |
| **HDFS DataNode** | `sdoqap-datanode` | Hadoop 3.2.1 | `9864:9864` | Distributed Block Storage Data Transfer |
| **Observability DB** | `sdoqap-elasticsearch` | Elasticsearch 8.10.2 | `${ES_HOST_PORT:-9200}:9200` | Telemetry Indices, Quality Runs, Remediation Tickets |
| **Kibana Explorer** | `sdoqap-kibana` | Kibana 8.10.2 | `${KIBANA_PORT}:5601` | White-Box Log Visualizer & Document Exploration |
| **Telemetry Dashboard** | `sdoqap-grafana` | Grafana OSS 10.1.5 | `${GRAFANA_PORT}:3000` (`.env` ตั้ง 3002) | Infrastructure Monitoring & Time-Series Graphs |
| **Event Message Broker**<br/>(profile `streaming`) | `sdoqap-kafka` | Confluent Kafka 7.5.0 | `9092:29092` | Real-Time Event Streaming & Ingestion Buffer |
| **Cluster Coordinator**<br/>(profile `streaming`) | `sdoqap-zookeeper` | Confluent Zookeeper 7.5.0 | ไม่เปิดพอร์ตให้ host | Kafka Cluster Configuration |
| **Relational Source** | `sdoqap-postgres` | PostgreSQL 15 Alpine | `${POSTGRES_HOST_PORT:-5432}:5432` | ฐานข้อมูลต้นทางตัวอย่างสำหรับ ingest/rdbms |
| **Workflow Automation** | `sdoqap-n8n` | n8n Latest | `${N8N_PORT}:5678` | ตั้งเวลา เรียก API ด้วย `X-Service-Key` และรับ/ส่ง webhook แจ้งเตือน |
| **Local LLM**<br/>(profile `ai`) | `sdoqap-ollama` | Ollama | ไม่เปิดพอร์ตให้ host | ตัวเลือก LLM ในเครื่อง (ค่าเริ่มต้นของระบบคือ Groq `openai/gpt-oss-120b` ตั้งผ่าน `GROQ_MODEL`) |
| **DB Admin**<br/>(profile `tools`) | `sdoqap-pgadmin` | pgAdmin 4 | `${PGADMIN_HOST_PORT:-5050}:80` | จัดการ PostgreSQL |

---

## 4. มาตรการความปลอดภัยและคุณสมบัติทางวิศวกรรม (Security & Engineering Invariants)

1. **Zero Silent Failure Policy**: แถวที่เข้าสู่ระบบมีปลายทางชัดเจน ผลรวมของแถว Active ใน Delta Lake กับแถวใน Quarantine เท่ากับจำนวนแถวที่เข้าขั้นตรวจ ยกเว้นแถวคีย์ซ้ำที่ `auto_clean` ตัดก่อนนับ (ระบุเป็นส่วนต่างในรายงาน)
2. **Idempotency Invariant**: การรันคำสั่งประมวลผลซ้ำ (Retry/Re-run) ด้วยคำสั่ง `MERGE INTO` บน Delta Lake จะไม่ทำให้เกิดแถวซ้ำซ้อนในตารางปลายทาง
3. **Data Privacy Guardrails**: Semantic Layer ตั้งธง PII ต่อคอลัมน์ Dashboard Builder ไม่ส่งแถวให้ LLM และการส่งออก CSV ตัดคอลัมน์ PII เป็นค่าเริ่มต้น ตัวอย่างแถวจาก Quarantine ที่ส่งให้ LLM (`ai_rule_advisor.py`, `auto_remediation_engine.py`) แทนค่าคอลัมน์ระบุตัวตนด้วย `<redacted>` ตามชื่อคอลัมน์และคีย์หลัก ข้อจำกัด: ไม่ได้ mask ค่าในการส่งออก และคอลัมน์ PII ที่ชื่อนอกรายการ (เช่น `dob`) กับข้อความอิสระยังหลุดได้
4. **API Protection**: dashboards, semantic, whitebox ส่วนที่เขียนหรือประมวลผล และ route ส่งออกแถวระดับ row ของ Data Export (`preview`, `records`, `raw`, `active`, `quarantine`, `reddit`) ต้องล็อกอินด้วย session cookie ส่วน n8n ใช้ `X-Service-Key` และ trigger daemon ใช้ `X-Trigger-Secret` (`TRIGGER_SHARED_SECRET`) ข้อมูลผ่านการส่งออกแถวยังไม่ถูก mask ตามการออกแบบ

---

## 5. ขอบเขตการตรวจ

ทุกหัวข้อในเอกสารนี้ตรวจกับโค้ดและไฟล์ใน repo ที่ commit `936ae76` แล้ว ไม่ได้รัน stack จริง จึงยังไม่ยืนยันพฤติกรรมตอนรันและตัวเลขประสิทธิภาพ (ตัวเลขที่วัดได้ดู `docs/reports/DataServe_Technical_Report_verified.md` บทที่ 6)
