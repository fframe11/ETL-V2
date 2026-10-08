# รายละเอียดสถาปัตยกรรมระบบเชิงลึก (Deep-Dive System Architecture Overview)

**โครงการ**: SDOQAP (Smart Data Operations & Quality Assurance Platform)  
**เวอร์ชันระบบ**: 2.5 (Enterprise Production Release)  
**วันที่บันทึก**: 8 ตุลาคม 2569  
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
[3. Distributed Spark Compute & 3-Tier Quality Segregation Engine]
                 │
                 ▼
[4. Silver Medallion Dual-Zone Storage (Delta Lake Active vs. HDFS Quarantine)]
                 │
                 ▼
[5. Gold Observability & Telemetry Indices (Elasticsearch 8 / Kibana / Grafana)]
                 │
                 ▼
[6. Serving API & Dynamic Business Impact Engine (FastAPI / 3D COPDQ)]
                 │
                 ▼
[7. Central Portal UI & Two-Way Synchronized Governance (React 18 / Zustand)]
                 │
                 ▼
[8. Closed-Loop Upstream Remediation & Automated Re-conciliation]
```

---

## 2. รายละเอียดการทำงานเชิงลึกแยกตามแต่ละเลเยอร์

---

### เลเยอร์ที่ 1: การนำเข้าข้อมูลและการสตรีมสด (Multi-Source Ingestion & Trigger Layer)

เลเยอร์นี้ทำหน้าที่เป็นด่านหน้าในการเปิดรับและรวบรวมข้อมูลจากแหล่งข้อมูลที่หลากหลาย (Data Ingestion Hub) โดยไม่จำกัดโครงสร้าง:

* **Batch File Ingestion**:
  * รองรับไฟล์ข้อมูลแบทช์รูปแบบ CSV, TSV และ Parquet ผ่านสคริปต์ Batch Uploader
  * จัดการปัญหาการเข้ารหัสตัวอักษรภาษาไทย (Encoding) อัตโนมัติ รองรับทั้ง UTF-8, TIS-620 และ Windows-874 เพื่อป้องกันตัวอักษรเพี้ยน
  * จัดการ Delimiter, Quoting และตัวแบ่งบรรทัดที่ซ้อนอยู่ภายในฟิลด์ข้อความ
* **Relational Database Ingestion (RDBMS / CDC)**:
  * เชื่อมต่อฐานข้อมูล **PostgreSQL 15** (`sdoqap-postgres` พอร์ต 5432)
  * ใช้สำหรับการทำ Ingestion จากระบบฐานข้อมูลธุรกรรม (OLTP) และการเก็บข้อมูลแค็ตตาล็อกอ้างอิง
* **Upstream REST API Ingestion**:
  * ระบบดึงข้อมูลจากภายนอกผ่าน HTTP GET/POST เช่น ระบบยืนยันตัวตน (Upstream Auth API), ระบบคลังสินค้า (ERP Database) และระบบลูกค้าสัมพันธ์ (CRM Exporter)
  * มีระบบจัดการ Token Authentication, Pagination (การแบ่งหน้า), Rate Limit Handling (HTTP 429 Retry Backoff) และการแกะ Nested JSON
* **Real-Time Streaming Queue**:
  * ใช้ **Apache Kafka** (`sdoqap-kafka` พอร์ต 9092) ภายใต้การควบคุมของ **Zookeeper** (พอร์ต 2181)
  * ทำหน้าที่เป็น Ingestion Buffer สำหรับสตรีมข้อมูลที่มีความถี่สูง (High-Velocity Event Streams เช่น Live Reddit Stream และ User Clickstream)
* **Spark Trigger Daemon**:
  * ทำงานเป็น Background Service ประจำอยู่ที่พอร์ต `8099` ของ Spark Master
  * มีระบบรักษาความปลอดภัยด้วย `TRIGGER_SHARED_SECRET`
  * รองรับการสั่งทริกเกอร์รัน Pipeline แบบ On-Demand ทันทีที่มีการนำเข้าข้อมูลใหม่ หรือเมื่อวิศวกรสั่งปิดตั๋วงานแก้ไขที่หน้าเว็บ

---

### เลเยอร์ที่ 2: โซนข้อมูลดิบและธรรมาภิบาลโครงสร้าง (Bronze Storage & Pre-Flight Governance Layer)

ข้อมูลที่เข้าสู่ระบบจะต้องผ่านกระบวนการคัดกรองความปลอดภัยของโครงสร้างก่อนเข้าสู่กระบวนการประมวลผลหลัก:

* **HDFS Raw Bronze Zone**:
  * ข้อมูลดิบทั้งหมดจะถูกบันทึกสำเนาลงใน **HDFS NameNode/DataNode** (`/data/raw/<table_name>/`) ตามสภาพเดิม 100% เพื่อใช้เป็น Immutable Audit Trail และรองรับการประมวลผลย้อนหลัง (Time-Travel & Reprocessing)
* **Schema Drift Pre-Flight Gate**:
  * ก่อนที่ Spark Job จะเริ่มอ่านข้อมูล ระบบจะนำ Schema ของข้อมูลชุดใหม่มาเปรียบเทียบกับสเปกมาตรฐานใน `schema_registry.json`
  * ประเมินคะแนนความรุนแรงของการเปลี่ยนแปลง (Severity Score: $S$):
    $$S = (N_{\text{new}} \times 1) + (N_{\text{missing}} \times 5) + (N_{\text{type\_mismatch}} \times 5)$$
  * **Safe Drift ($S \le 4$)**: หากพบเฉพาะคอลัมน์ใหม่ที่ปลอดภัย ระบบจะทำการ **Auto-Evolve** อัปเดตไฟล์สเปกบนดิสก์และส่งข้อมูลเข้าประมวลผลต่อทันที
  * **Dangerous Drift ($S > 4$)**: หากพบคอลัมน์หลักหายไป หรือ Data Type มีการขัดแย้งรุนแรง ระบบจะระงับการอัปเดตสเปก ทำการแคสต์ข้อมูลที่มีปัญหาเป็น String ชั่วคราวเพื่อป้องกัน Pipeline ล่ม ส่งข้อเสนอรออนุมัติไปยัง Elasticsearch และส่งแจ้งเตือนระดับวิกฤตผ่าน **n8n Webhook**
* **Semantic Layer & Data Privacy Guardrails**:
  * ทำงานผ่าน REST Endpoint `/api/v1/semantic`
  * วิเคราะห์ความหมายของคอลัมน์ (Column Meaning & Roles เช่น Dimension, Metric, Identifier)
  * มีระบบตรวจจับข้อมูลส่วนบุคคล (PII Detection) และทำการซ่อน/Mask คอลัมน์ข้อมูลส่วนบุคคลโดยอัตโนมัติ เพื่อป้องกันการรั่วไหลสู่แดชบอร์ดสาธารณะ

---

### เลเยอร์ที่ 3: เอนจินประมวลผลและการคัดแยกข้อมูลระดับแถว (Distributed Spark QA & Segregation Engine)

หัวใจสำคัญของการประมวลผลคือ **Apache Spark Cluster** (Master-Worker Architecture บน Bitnami Image) ที่ทำหน้าที่ตรวจสอบและคัดแยกข้อมูลแบบแถวต่อแถว (Row-Level Segregation):

* **Distributed Compute Topology**:
  * **Spark Master**: จัดการคิวงาน, จัดสรรทรัพยากร และรัน Trigger Daemon (พอร์ต 7077, 8081 Web UI, 8099 Daemon)
  * **Spark Worker**: ประมวลผลงานแบบกระจายศูนย์ในหน่วยความจำ (In-Memory Processing) พร้อมระบบปรับจำนวนพาร์ทิชันอัตโนมัติ (Dynamic Partition Tuning) ตามขนาดของข้อมูล
* **3-Tier Quality Validation Gates (ระบบตรวจสอบคุณภาพ 3 ชั้น)**:
  1. **Tier 1: Static Quality Rules (ความถูกต้องเชิงโครงสร้างพื้นฐาน)**:
     - ตรวจสอบค่าว่าง (Null Checks) ในคอลัมน์สำคัญที่เป็น Primary Key และ Date
     - ตรวจสอบและตัดข้อมูลซ้ำซ้อน (Deduplication) โดยเลือกเก็บแถวที่มี Timestamp ล่าสุด
  2. **Tier 2: Statistical Dynamic Rules (ความถูกต้องเชิงสถิติและพฤติกรรมข้อมูล)**:
     - อัลกอริทึม **Auto-IQR (Interquartile Range)**: ตรวจสอบหาค่า Outliers ที่หลุดขอบเขตปกติเกิน $Q3 + 1.5 \times \text{IQR}$ หรือต่ำกว่า $Q1 - 1.5 \times \text{IQR}$
     - อัลกอริทึม **Z-Score Anomaly Detection**: ตรวจจับความผันผวนของค่าตัวเลขที่แกว่งเกิน $\pm 3\sigma$ จากค่าเฉลี่ย
  3. **Tier 3: Business Logic & Induced Tree Rules (ความถูกต้องเชิงตรรกะธุรกิจ)**:
     - กฎเงื่อนไขข้ามคอลัมน์ (Multi-Column Business Constraints) เช่น ความสัมพันธ์ระหว่างราคาสินค้า, ปริมาณ และยอดเงินรวม
     - ตรวจสอบความถูกต้องของรหัสสถานะและเงื่อนไขความสัมพันธ์ข้ามตาราง (Multi-Table Integrity)

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
  * เทคโนโลยี: **HDFS CSV Storage** ทำหน้าที่เป็น Dead-Letter Queue (DLQ)
  * วิธีการบันทึก: แถวที่ไม่ผ่านเกณฑ์จะถูกคัดแยกออกมาทันที โดยคงค่าดั้งเดิมของแถวนั้นไว้ครบทุกคอลัมน์ พร้อมทั้งแนบคอลัมน์กำกับระบบ:
    - `run_id`: รหัสรอบการประมวลผลของ Pipeline
    - `table_name`: ชื่อตารางต้นตอ
    - `timestamp`: เวลาที่ตรวจพบความผิดปกติ
    - `reject_reason`: รหัสและข้อความระบุสาเหตุที่ตกเกณฑ์ (เช่น `missing_primary_key`, `iqr_outlier`, `schema_type_mismatch`)
  * ประโยชน์: ข้อมูลเสียหายจะไม่ปนเปื้อนเข้าสู่ตารางหลัก และไม่ถูกทิ้งเงียบๆ (No Silent Failure) สามารถนำไปตรวจสอบย้อนหลังและนับบัญชีกระทบยอดได้ 100%

---

### เลเยอร์ที่ 5: การสังเกตการณ์ ดัชนีเมทาดาต้า และความเสี่ยง (Observability & Gold Telemetry Layer)

สถิติ ข้อมูลสรุป และประวัติการทำงานทั้งหมดจะถูกแปลงเป็นเอกสาร JSON และทำดัชนีเข้าสู่ **Elasticsearch 8.10.2** (พอร์ต 9200) เพื่อรองรับการค้นหาและวิเคราะห์แบบมิลลิวินาที:

* **ดัชนีหลักในระบบ (Core Elasticsearch Indices)**:
  * `sdoqap_quality_runs`: เก็บสถิติสรุปรายรอบ ได้แก่ จำนวนแถวรับเข้า (Ingested), จำนวนแถวสะอาด (Delivered), จำนวนแถวติดกักกัน (Quarantined) และคะแนนคุณภาพรวม (Data Health Score คำนวณจาก Accuracy, Completeness, Consistency, Timeliness, Uniqueness, Validity)
  * `sdoqap_pipeline_runs`: เก็บสถิติเวลาการทำงานของแต่ละงาน, ความหน่วงเวลา (Latency) และการปฏิบัติตามข้อตกลงระดับบริการ (SLA Compliance)
  * `sdoqap_upstream_remediations`: เก็บบัตรงานแก้ไขปัญหาข้อมูลที่ต้นทาง พร้อมระบุชื่อระบบเป้าหมาย (`target_system`), คำแนะนำการแก้ปัญหา (`remediation_action`), ระดับความรุนแรง (`severity`) และสถานะงาน (`OPEN` หรือ `RESOLVED`)
  * `sdoqap_schema_proposals`: เก็บประวัติข้อเสนอการเปลี่ยนแปลงโครงสร้างข้อมูล ทั้งที่ผ่านการ Auto-Evolve และที่รอการอนุมัติจากวิศวกร
  * `sdoqap_semantic_views`: เก็บนิยามความหมายของคอลัมน์ สิทธิการเข้าถึงข้อมูล และสูตรคำนวณ Metric ต่างๆ
* **เครื่องมือวิเคราะห์เชิงสังเกตการณ์ (Observability UIs)**:
  * **Kibana** (พอร์ต 5601): สำหรับการสืบค้นข้อมูลเชิงลึก (White-Box Exploration), ตรวจสอบ Log และค้นหาเอกสารต้นตอ
  * **Grafana** (พอร์ต 3002): แสดงผลกราฟ Time-Series สรุปสถานะการทำงานของคอนเทนเนอร์, Throughput และอัตราความผิดปกติของ Pipeline

---

### เลเยอร์ที่ 6: การให้บริการข้อมูลและการวิเคราะห์ผลกระทบทางธุรกิจ (FastAPI Serving & Business Impact Engine)

ส่วนหลังบ้านพัฒนาด้วย **FastAPI** (Python 3.10) ทำหน้าที่ประมวลผล Business Logic และให้บริการ REST Endpoints ผ่านพอร์ต `8002` (ภายนอก) / `8000` (ภายใน):

* **Domain Mapping Architecture**:
  * ระบบทำการแมปปิ้งความสัมพันธ์ของตารางฐานข้อมูลเข้ากับ 5 แผนกธุรกิจหลักขององค์กร:
    - *Sales & Revenue*: ตาราง `orders`, `transaction_records`
    - *Customer Insights*: ตาราง `users`, `mbti`
    - *Supply Chain & Operations*: ตาราง `products`, `dirty_dataset`
    - *Executive Reporting*: ตาราง `customers`, `users`
    - *Finance & Audit*: ตารางการกระทบยอดบัญชี
  * รองรับ Query Parameter `business_area` ในทุก Endpoint สถิติ เพื่อให้สามารถกรองคะแนน Health Score, อัตรา SLA, ปริมาณแถว และความเสียหายเฉพาะแผนกได้ทันที
* **COPDQ 3D Financial Loss Engine**:
  * แปลงความผิดปกติของข้อมูล (Bad Data) ให้อยู่ในรูปตัวเงินความเสียหายทางการเงิน (Cost of Poor Data Quality) โดยแจกแจงเป็น 3 มิติ:
    $$\text{Total COPDQ} = C_{\text{correction}} + C_{\text{opportunity}} + C_{\text{risk}}$$
    1. *Cost of Correction*: ต้นทุนด้านวิศวกรรมและการคำนวณในการดึงข้อมูลที่ติดกักกันกลับมาล้างและประมวลผลใหม่
    2. *Cost of Lost Opportunities*: มูลค่าความสูญเสียจากโอกาสทางธุรกิจที่ล่าช้า และความคลาดเคลื่อนของยอดขาย
    3. *Cost of Risk & Compliance*: มูลค่าความเสี่ยงจากการละเมิด SLA ของ Pipeline และความเสี่ยงต่อการผิดระเบียบธรรมาภิบาลข้อมูล
* **Dynamic 4-Step Impact Cascade Resolver**:
  * เอนจินวิเคราะห์ความสัมพันธ์แบบอัตโนมัติ 4 ขั้นตอน:
    $$\text{Technical Issue} \longrightarrow \text{Technical Impact} \longrightarrow \text{KPI Impact} \longrightarrow \text{Business Action}$$
  * ดึง Incident ล่าสุดจาก Elasticsearch มาสร้างคำอธิบายเชิงธุรกิจที่ตรงกับสถานการณ์จริงของคลัสเตอร์
* **Trust-Check Gate API**:
  * Endpoint `/api/data/trust-check` ออกแบบตามสถาปัตยกรรม Zero-Trust Data Serving
  * ระบบภายนอก (เช่น โมเดล Machine Learning หรือ Dashboard BI) ต้องส่ง Request มาตรวจเช็คความน่าเชื่อถือของตารางก่อน หากคะแนนคุณภาพผ่านเกณฑ์ SLA และไม่มีตั๋วงานระดับวิกฤตค้างอยู่ ระบบจะอนุญาตให้เข้าถึง Delta Lake ได้ แต่หากไม่ผ่านจะระงับการเข้าถึงทันที

---

### เลเยอร์ที่ 7: แผงควบคุมกลางและส่วนประสานผู้ใช้ (Central Portal UI Layer)

หน้าบ้านพัฒนาด้วย **React 18**, **Vite 5**, **Zustand State Store** และ **Apache ECharts** ให้บริการผ่าน **Nginx Gateway** (พอร์ต 80):

* **4 มุมมองหลักบนหน้าจอ (4 Core Operational Views)**:
  1. **Executive Overview**: แสดงตัวชี้วัดระดับผู้บริหาร Data Health Score (96.35%), Pipeline SLA Availability (81.8%), ส่วนต่างการรับส่งข้อมูล (Volume Gap), กราฟ Area Trend และ SLA Compliance Bars
  2. **Business Impact Dashboard**: แสดงการ์ดสถานะของทั้ง 5 แผนกธุรกิจ, ไดอะแกรม Business Impact Cascade 4 ขั้นตอน, กราฟเปรียบเทียบการรับเข้าเทียบการส่งมอบ (Flow Reconciliation Ingestion vs. Delivery) และตารางแจกแจงความเสียหาย COPDQ
  3. **Data Quality & Telemetry**: แสดงคอมโพเนนต์ `DataFlowStreamChart` ซึ่งเป็น Real-Time Streaming Telemetry Flow พล็อตเส้นการไหลของข้อมูลสดพร้อม Ingestion Beacon และตัววัด Throughput ควบคู่กับผัง Medallion DAG Network
  4. **Dashboard Builder & Semantic Editor**: เครื่องมือสร้างแดชบอร์ดด้วย AI สำหรับกลุ่มผู้ใช้งาน Data Steward พร้อมแผงสูตร Metric, การปรับแต่งมุมมองข้อมูลเชิงความหมาย และปุ่ม Export CSV ที่มีตัวเลือกควบคุมข้อมูลส่วนบุคคล (PII Toggle)
* **Two-Way Global State Synchronization**:
  * การคลิกเลือกการ์ดแผนกบนหน้า Business Impact จะซิงค์ค่าเข้าสู่ Zustand Store (`selectedAreaFilter`) ทันที
  * ส่งผลให้ดรอปดาวน์ Filter By ด้านบน และข้อมูลทุกส่วนบนหน้าจอ (กราฟกระทบยอด, ตัวเลข COPDQ และตารางบัตรงาน) ถูกกรองตามแผนกนั้นพร้อมกันโดยอัตโนมัติ พร้อมปุ่ม `Reset Filter` เพื่อคืนค่าภาพรวม
* **Upstream Governance Panel**:
  * แสดงรายการตั๋วงานแก้ไขที่ส่งไปยังทีมต้นน้ำ โดยมีแท็บแยก **Open** (เฉพาะที่ค้างอยู่) และ **All** (ทั้งหมด)
  * แสดงป้ายระบุระบบต้นทาง (`target_system`) และคำแนะนำการแก้ไขเชิงปฏิบัติการ (`remediation_action`) อย่างชัดเจน

---

### เลเยอร์ที่ 8: วงจรปิดแก้ไขปัญหาข้อมูลต้นน้ำและการกู้คืนอัตโนมัติ (Closed-Loop Upstream Healing Layer)

SDOQAP ไม่หยุดอยู่แค่การตรวจจับความผิดปกติ แต่มีระบบปฏิบัติการแบบวงจรปิด (Closed-Loop Automation) เพื่อแก้ไขปัญหาให้จบถึงต้นน้ำ:

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
[FastAPI ปรับสถานะเป็น RESOLVED และยิงคำสั่งไปยัง Spark Daemon :8099]
         │
         ▼
[Spark ทำการ Re-ingest ข้อมูลต้นน้ำชุดใหม่เข้า Delta Lake Active Store]
         │
         ▼
[หน้าเว็บ Refetch ข้อมูลอัตโนมัติ (no-cache) -> คะแนน Health ปรับขึ้นเป็น 100%]
```

1. **Ticket Dispatching**: เมื่อข้อมูลถูกคัดแยกเข้า Quarantine ระบบจะดึงตัวอย่างแถวและระบุระบบต้นทางที่ส่งข้อมูลผิดพลาด (เช่น Upstream Auth API ส่งอีเวนต์ซ้ำซ้อน) พร้อมสร้างคำแนะนำทางเทคนิค (เช่น การเพิ่ม Idempotency Key หรือ NOT NULL Check Constraint)
2. **Upstream Rectification**: ทีมวิศวกรต้นทางดำเนินการปรับปรุงโค้ดหรือฐานข้อมูลต้นทางตามคำแนะนำ
3. **Automated Re-conciliation Trigger**:
   - เมื่อวิศวกรตรวจสอบความถูกต้องแล้ว สามารถกดปุ่ม **Resolve** บนหน้าแดชบอร์ด
   - ระบบจะส่งคำสั่งไปยัง API เพื่อเปลี่ยนสถานะตั๋วใน Elasticsearch เป็น `RESOLVED`
   - API จะทำการยิงคำสั่ง HTTP POST ไปยัง **Spark Trigger Daemon** (พอร์ต 8099) เพื่อสั่งรันประมวลผลข้อมูลใหม่โดยอัตโนมัติ
   - ข้อมูลชุดใหม่ที่แก้ไขแล้วจะไหลผ่านการตรวจสอบเข้าสู่ Delta Lake Active Store ส่งผลให้ยอด Clean Records เพิ่มขึ้น ยอด Quarantine ลดลง และคะแนน Data Health Score กลับคืนสู่สภาวะปกติอย่างสมบูรณ์

---

## 3. ตารางสรุปข้อมูลจำเพาะทางเทคนิคและพอร์ตเชื่อมต่อ (Technical Specifications & Port Matrix)

| Service Name | Container Name | Technology Stack | Port Mapping | Primary Function |
| :--- | :--- | :--- | :--- | :--- |
| **Nginx Web Gateway** | `sdoqap-nginx` | Nginx Alpine | `80:80` | Reverse Proxy & Routing `/api/` to Backend, `/` to UI |
| **Frontend Portal** | `sdoqap-ui` | React 18, Vite 5, ECharts | `80/tcp` (Internal) | Central Dashboard, Business Impact, Lineage DAG |
| **Backend Serving** | `sdoqap-api` | FastAPI, Python 3.10, Uvicorn | `8002:8000` | REST Endpoints, COPDQ Engine, Trust-Check Gate |
| **Spark Master** | `sdoqap-spark-master` | Apache Spark 3.4.1 (Bitnami) | `7077:7077`<br/>`8081:8080`<br/>`8099:8099` | Distributed Cluster Master, Spark Web UI, Trigger Daemon |
| **Spark Worker** | `sdoqap-spark-worker` | Apache Spark 3.4.1 (Bitnami) | Dynamic | Distributed In-Memory QA Processing |
| **HDFS NameNode** | `sdoqap-namenode` | Hadoop 3.2.1 | `9870:9870`<br/>`9002:9000` | Master File System Metadata, Bronze & Quarantine Storage |
| **HDFS DataNode** | `sdoqap-datanode` | Hadoop 3.2.1 | `9864:9864` | Distributed Block Storage Data Transfer |
| **Observability DB** | `sdoqap-elasticsearch` | Elasticsearch 8.10.2 | `9200:9200` | Telemetry Indices, Quality Runs, Remediation Tickets |
| **Kibana Explorer** | `sdoqap-kibana` | Kibana 8.10.2 | `5601:5601` | White-Box Log Visualizer & Document Exploration |
| **Telemetry Dashboard** | `sdoqap-grafana` | Grafana OSS 10.1.5 | `3002:3000` | Infrastructure Monitoring & Time-Series Graphs |
| **Event Message Broker**| `sdoqap-kafka` | Confluent Kafka 7.5.0 | `9092:9092`<br/>`29092:29092` | Real-Time Event Streaming & Ingestion Buffer |
| **Cluster Coordinator**| `sdoqap-zookeeper` | Confluent Zookeeper 7.5.0 | `2181:2181` | Kafka Cluster Configuration & Leader Election |
| **Relational Metadata** | `sdoqap-postgres` | PostgreSQL 15 Alpine | `5432:5432` | Relational Staging, Catalog & Metadata Storage |
| **Workflow Automation** | `sdoqap-n8n` | n8n Latest | `5678:5678` | Critical Alert Webhooks (Slack/Teams) |
| **Semantic AI Engine**  | `sdoqap-ollama` | Ollama / Groq Llama 3.3 | `11434:11434` | Root Cause Classification & Error Pattern Analysis |

---

## 4. มาตรการความปลอดภัยและคุณสมบัติทางวิศวกรรม (Security & Engineering Invariants)

1. **Zero Silent Failure Policy**: ข้อมูลทุกแถวที่เข้าสู่ระบบจะต้องได้รับการตรวจสอบและระบุปลายทางชัดเจน โดยผลรวมของแถวที่ผ่านเกณฑ์ใน Delta Lake รวมกับแถวที่ติดกักกันใน HDFS Quarantine จะต้องเท่ากับยอดนำเข้าจากต้นทาง 100% เสมอ
2. **Idempotency Invariant**: การรันคำสั่งประมวลผลซ้ำ (Retry/Re-run) ด้วยคำสั่ง `MERGE INTO` บน Delta Lake จะไม่ทำให้เกิดแถวซ้ำซ้อนในตารางปลายทาง
3. **Data Privacy Guardrails (PII Protection)**: ข้อมูลส่วนบุคคล (เช่น เลขบัตรประชาชน, เบอร์โทรศัพท์, ข้อมูลการเงิน) จะถูกตรวจจับและ Mask ด้วย Semantic Layer ก่อนส่งออกไปยังแดชบอร์ดสาธารณะหรือการส่งออกไฟล์ CSV
4. **Least-Privilege API Protection**: เส้นทาง API สำหรับการดาวน์โหลดข้อมูลดิบ การเข้าถึงแถวกักกัน และการสั่งประมวลผลระบบ ถูกปกป้องด้วย Session Authentication และ Secret Header Verification (`TRIGGER_SHARED_SECRET`, `INGEST_SERVICE_KEY`)
