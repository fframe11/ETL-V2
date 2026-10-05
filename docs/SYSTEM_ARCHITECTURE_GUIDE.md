# คู่มือสถาปัตยกรรมระบบ SDOQAP และการทำงานแบบ White-Box ครบวงจร
**Scalable Data Observability & Quality Assurance Platform (SDOQAP)**
*เอกสารอธิบายการทำงานเชิงวิศวกรรม ตั้งแต่ Backend Engine, Background Services, ระบบ Mapping จนถึง Frontend UI ครบทุกหน้า*

---

## 1. บทนำและปรัชญาการออกแบบระบบ (System Philosophy & White-Box Paradigm)

### 1.1 ปัญหาของระบบเดิม (Black-Box Trap) และการเปลี่ยนผ่านสู่ White-Box
ในการประเมินระบบ Data Pipeline หรือ ETL แบบดั้งเดิม กรรมการและผู้ใช้งานมักมองระบบเป็น **"กล่องดำ (Black Box)"** เพราะระบบรับข้อมูลเข้ามา (`Input`) ทำการแปลงข้อมูลในโค้ดลับหลัง (`Hidden Script`) แล้วพ่นผลลัพธ์ออกมา (`Output`) โดยที่ผู้ใช้หรือกรรมการไม่สามารถตรวจสอบได้ว่า:
- ทำไมข้อมูลแถวนี้ถึงถูกตัดสินว่าผิด?
- ระบบใช้เกณฑ์หรือค่าสถิติใดมาคำนวณ?
- หากมีค่าว่าง (Null) หรือค่าผิดปกติ (Outlier) ระบบแอบลบ แอบแทนที่ หรือแอบแปลงค่าอย่างไร?
- ค่าพารามิเตอร์แต่ละตัวที่ตั้งไว้ ส่งผลต่อผลลัพธ์ของข้อมูลจริงในระดับแถว (Row-level) อย่างไร?

**SDOQAP** ถูกออกแบบขึ้นมาเพื่อทำลายกล่องดำนี้ให้กลายเป็น **"White-Box Semi-Automated Data Engineering Platform"** ที่เปิดเผยกระบวนการคิด การให้เหตุผล (Reasoning) และเส้นทางการไหลของข้อมูลทุกขั้นตอน ผู้ใช้งานและวิศวกรสามารถมองเห็น ตรวจสอบ ปรับแก้ และมีส่วนร่วมในการตัดสินใจ (Human-in-the-Loop) ได้ในทุกจุด

```
[ แบบเดิม: Black Box ]
Raw Data ───────► [ ??? Hidden Script ??? ] ───────► Output Data (ตรวจสอบเหตุผลไม่ได้)

[ แบบใหม่: White Box SDOQAP ]
Raw Data
   │
   ▼
[Step 1: Data Profiling] ──► คำนวณค่าทางสถิติ (Null Rate, Cardinality, Min/Max, IQR)
   │
   ▼
[Step 2: Business Context] ──► รับเงื่อนไขบริบทจากผู้ใช้ (Criticality, Freshness SLA)
   │
   ▼
[Step 3: Explainable Rule Suggestion] ──► AI/Rule Advisor แนะนำกฎพร้อมระบุ "Why?"
   │
   ▼
[Step 4: Human Review & Adjust] ──► วิศวกรอนุมัติหรือปรับแก้ Threshold ก่อนรันจริง
   │
   ▼
[Step 5: Transform & Standardize] ──► Semantic Mapping (Exact + Hybrid Similarity)
   │
   ▼
[Step 6: Quality Validation] ──► ตรวจสอบ 4 มิติ (Completeness, Validity, Uniqueness, Consistency)
   │
   ▼
[Step 7: 3-Way Segregation] ──► แยกข้อมูลออกเป็น Clean (Active), Review Queue, Quarantine Lake
   │
   ▼
[Step 8: Upstream Feedback] ──► แจ้งเตือนส่ง Ticket ไปยังระบบต้นทางเพื่อแก้ปัญหาที่ต้นตอ
```

### 1.2 ปรัชญา Upstream-First Remediation (แก้ที่ต้นเหตุ ไม่ใช่แค่กักกันปลายทาง)
ตามข้อกำหนดทางวิศวกรรมของแพลตฟอร์ม:
- **Symptom-based (ไม่แนะนำ):** การกักกันข้อมูล (Quarantine) หรือการลบแถวทิ้ง เป็นเพียงการปฐมพยาบาลชั่วคราว ข้อมูลที่ไม่สมบูรณ์ยังคงไหลเข้ามาเรื่อยๆ หากต้นทางไม่ได้รับการแก้ไข
- **Root Cause-based (หัวใจของ SDOQAP):** ทุกครั้งที่ข้อมูลถูกส่งเข้า Quarantine ระบบจะต้องสร้าง **Remediation Context** ระบุสาเหตุที่แท้จริง (เช่น API ต้นทางเปลี่ยน Format, Database Constraint หลุด, หรือมี Schema Drift) พร้อมทั้งออก **Upstream Remediation Ticket** แจ้งกลับไปยังผู้ดูแลต้นทาง (Source Owners) เพื่อปิดช่องโหว่ไม่ให้ข้อมูลผิดพลาดเกิดขึ้นซ้ำ

---

## 2. ภาพรวมสถาปัตยกรรมทั้งระบบ (End-to-End System Architecture)

ระบบทำงานบนโครงสร้าง Containerized Microservices ผ่าน Docker Compose ประกอบด้วย 6 เลเยอร์หลัก:

```mermaid
flowchart TD
    subgraph Sources["1. Ingestion Sources"]
        CSV["CSV / File Upload"]
        REST["REST API (JSON)"]
        RDBMS["PostgreSQL / MySQL (DB)"]
        KAFKA["Kafka Event Stream"]
    end

    subgraph Orchestration["2. Orchestration & Gateway"]
        NGINX["Nginx Gateway (:80)"]
        N8N["n8n Workflow Engine (:5678)"]
    end

    subgraph Storage["3. Storage & Lakehouse Layer"]
        HDFS_RAW["HDFS Raw Zone (/data/raw/)"]
        HDFS_CLEAN["HDFS Active Clean Zone (/data/active/)"]
        HDFS_QUARANTINE["HDFS Quarantine Lake (/data/quarantine/)"]
        PG_META["PostgreSQL Metadata & Warehouse (:5432)"]
    end

    subgraph Engines["4. Distributed Processing Engines"]
        SPARK_MASTER["Spark Master (:7077, :8081)"]
        SPARK_WORKER["Spark Worker"]
        QUALITY_ENG["Spark Quality Engine"]
        DYNAMIC_RULES["Dynamic Rules Engine"]
        AI_ADVISOR["AI Rule Advisor"]
        STANDARDIZER["Semantic Standardizer & NLP Engine"]
        AUTO_REMEDY["Auto Remediation Engine"]
        GOLD_ENG["Spark Gold Layer Engine"]
    end

    subgraph Observability["5. Metadata & Observability"]
        ES["Elasticsearch Cluster (:9200)"]
        KIBANA["Kibana Dashboard (:5601)"]
        GRAFANA["Grafana Metrics (:3002)"]
    end

    subgraph Serving["6. Serving & Presentation Layer"]
        FASTAPI["FastAPI Modular Backend (:8002)"]
        REACT_UI["React 18 + Vite Frontend (:80)"]
    end

    Sources --> N8N
    Sources --> FASTAPI
    N8N --> HDFS_RAW
    FASTAPI --> HDFS_RAW
    HDFS_RAW --> SPARK_MASTER
    SPARK_MASTER --> SPARK_WORKER
    SPARK_WORKER --> QUALITY_ENG
    QUALITY_ENG --> DYNAMIC_RULES
    QUALITY_ENG --> STANDARDIZER
    QUALITY_ENG --> AUTO_REMEDY
    QUALITY_ENG --> HDFS_CLEAN
    QUALITY_ENG --> HDFS_QUARANTINE
    HDFS_CLEAN --> GOLD_ENG
    GOLD_ENG --> PG_META
    QUALITY_ENG --> ES
    GOLD_ENG --> ES
    ES --> KIBANA
    ES --> GRAFANA
    ES --> FASTAPI
    FASTAPI --> NGINX
    REACT_UI --> NGINX
    NGINX --> UserBrowser["User Web Browser"]
```

### รายละเอียดโครงสร้างแต่ละส่วน:
1. **Nginx Reverse Proxy (`nginx/nginx.conf`):** รับ Traffic ที่พอร์ต 80 ทำหน้าที่สลับเส้นทาง:
   - Request ที่ขึ้นต้นด้วย `/api/` จะถูก Proxy ไปยัง FastAPI Backend (`http://sdoqap-api:8000`)
   - Request ทั่วไปจะถูกส่งไปยัง React Production Web Application
2. **FastAPI Serving Layer (`api/app/api/`):** สถาปัตยกรรมแบบ Modular Router แยกหน้าที่ชัดเจน:
   - `whitebox.py`: ดูแลขั้นตอน White-Box 10 สเต็ป, Data Profiling, Ground Truth Benchmarking
   - `pipeline.py`: จัดการการรัน Pipeline, จัดการ Ingestion จากไฟล์, API, RDBMS และ Kafka
   - `quality.py`: ดึงประวัติผลคะแนนคุณภาพข้อมูล (Quality Runs)
   - `dynamic_rules.py`: อ่าน/เขียนกฎใน `rules_config.json` และซิงค์กับ Elasticsearch
   - `schema.py`: Schema Registry & การจัดการ Schema Drift Proposals
   - `standardize.py`: ตรวจสอบคำที่ยังแมปไม่ได้ (Unmapped Terms) และระบบ Active Learning
   - `gold.py`: ทริกเกอร์การประมวลผล Gold Layer และสรุปสถิติสำหรับ BI
   - `lineage.py`: ให้บริการกราฟ Data Lineage และ Trust-Check API
   - `analytics.py`: ให้บริการ Query ข้อมูลเชิงวิเคราะห์และคำนวณแนวโน้ม
   - `auth.py`: ตรวจสอบสิทธิ์การใช้งาน (Session Authentication)
3. **Apache Spark Cluster (`spark/`):** Engine หลักที่ใช้ประมวลผลข้อมูลขนาดใหญ่แบบ Distributed รองรับทั้ง Batch และ Structured Streaming เขียนทับลง Delta Lake / Parquet format
4. **Elasticsearch (`:9200`):** ทำหน้าที่เป็น Metadata Store, Audit Log และ Search Engine สำหรับดัชนีสำคัญ เช่น `sdoqap_quality_runs`, `sdoqap_schema_proposals`, `sdoqap_unmapped_terms`, `sdoqap_pipeline_runs`
5. **Hadoop HDFS (`hdfs://namenode:9000`):** Data Lake ที่แบ่ง Partition เป็น 3 Zone:
   - `/data/raw/<table_name>/`: ข้อมูลดิบที่รับเข้ามาจากภายนอก
   - `/data/active/<table_name>/`: ข้อมูลที่ผ่านการตรวจสอบคุณภาพแล้ว (Clean Data)
   - `/data/quarantine/<table_name>/`: ข้อมูลที่มีข้อผิดพลาด ถูกแยกออกเพื่อความปลอดภัย

---

## 3. เจาะลึก 10 Engine การประมวลผลในพื้นหลัง (Background Engines Deep Dive)

เพื่อให้เห็นการทำงานอย่างเป็น White-Box นี่คือกลไกภายในของ Engine ทั้ง 10 ตัวที่ทำงานอยู่เบื้องหลัง:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SDOQAP 10 CORE BACKGROUND ENGINES                   │
├───────────────────────────────────┬────────────────────────────────────┤
│ 1. Spark Quality Engine           │ 6. Schema Drift Governance Engine  │
│ 2. Dynamic Rules Engine           │ 7. Spark Gold Layer Engine         │
│ 3. AI Rule Advisor Engine         │ 8. Streaming Quality Engine        │
│ 4. Auto-Remediation Engine        │ 9. Upstream Remediation Router     │
│ 5. Semantic Standardization (NLP) │ 10. White-Box Explainability Engine│
└───────────────────────────────────┴────────────────────────────────────┘
```

---

### Engine 1: Spark Quality Engine (`spark/spark_quality_engine.py`)
**หน้าที่:** เป็นแกนกลางในการคำนวณคุณภาพข้อมูลระดับ Distributed บน Apache Spark โดยประเมินคุณภาพข้อมูล 4 มิติหลัก (Four Pillars of Data Quality):
1. **Completeness (ความครบถ้วน):** อัตราส่วนของข้อมูลที่ไม่เป็นค่าว่าง (`Null` หรือช่องว่างเปล่า) เทียบกับจำนวนเรคคอร์ดทั้งหมด
2. **Validity (ความถูกต้องตามกฎเกณฑ์):** ตรวจสอบว่าค่าของข้อมูลอยู่ในช่วงที่กำหนด (Range Check), เป็นไปตาม Regular Expression, หรือตรงตาม Data Type ที่ระบุหรือไม่
3. **Uniqueness (ความไม่ซ้ำซ้อน):** ตรวจสอบว่าค่าใน Primary Key หรือ Unique Combination ซ้ำซ้อนกันหรือไม่
4. **Consistency (ความสอดคล้องเชิงตรรกะ):** ตรวจสอบความสัมพันธ์ข้ามคอลัมน์ (เช่น หาก `status = 'COMPLETED'` ค่า `completed_at` ต้องไม่เป็น Null)

**กลไกทางเทคนิคที่สำคัญ:**
- **Distributed Concurrency Lock (OCC Lock):** ก่อนเริ่มงาน Spark Engine จะทำการจอง Lock ที่ Elasticsearch ดัชนี `sdoqap_run_locks` โดยใช้ `seq_no` และ `primary_term` เพื่อป้องกันปัญหา Race Condition กรณีมี Job อื่นพยายามรันเขียนข้อมูลลงตารางเดียวกันในเวลาเดียวกัน หาก Lock หมดอายุ (Timeout 15 นาที) ระบบจะ Re-acquire ให้อัตโนมัติ
- **3-Way Data Segregation:**
  ```python
  # ข้อมูลที่ผ่านเกณฑ์ทั้งหมด -> Active Clean Lake
  clean_df = df.filter(F.col("whitebox_status") == "CLEAN")
  clean_df.write.mode("append").parquet(f"{HDFS_URL}/data/active/{table_name}")

  # ข้อมูลที่ผิดเงื่อนไข Critical -> Quarantine Lake
  quarantine_df = df.filter(F.col("whitebox_status") == "QUARANTINE")
  quarantine_df.write.mode("append").parquet(f"{HDFS_URL}/data/quarantine/{table_name}")

  # ข้อมูลที่คะแนนก้ำกึ่ง -> Review Queue เพื่อรอการตรวจสอบจากวิศวกร
  ```

---

### Engine 2: Dynamic Rules Engine (`spark/dynamic_rules_engine.py`)
**หน้าที่:** แปลงการตั้งค่าจากไฟล์ `spark/rules_config.json` ให้กลายเป็น Spark SQL Expressions และฟังก์ชันตรวจสอบที่ประมวลผลบนคลัสเตอร์ โดยไม่ต้องคอมไพล์โค้ดใหม่

**ประเภทของกฎที่รองรับ:**
- `expect_column_values_to_not_be_null`: ตรวจจับค่า Missing Value
- `expect_column_values_to_be_between`: ตรวจสอบค่าตัวเลข เช่น `min_value: 0`, `max_value: 100`
- `expect_column_values_to_match_regex`: ตรวจสอบรูปแบบข้อความ เช่น รูปแบบอีเมล รหัสนักศึกษา หรือเบอร์โทรศัพท์
- `expect_column_values_to_be_in_set`: ตรวจสอบค่า Categorical ที่อนุญาต เช่น `["Math", "Physics", "Chemistry"]`
- `custom_sql`: เงื่อนไขตรรกะระดับสูง เช่น `study_hours >= 0 AND score >= 0`

**ระดับความรุนแรง (Severity Gates):**
- **Critical (CRITICAL):** หากข้อมูลตกเกณฑ์นี้ แถวนั้นจะถูกส่งเข้า Quarantine ทันที และตัดคะแนนภาพรวมของตาราง
- **Warning (WARNING):** แจ้งเตือนใน Dashboard และบันทึกลง Log แต่ยังคงอนุญาตให้ข้อมูลผ่านเข้าสู่ Active Zone ได้ (สำหรับการนำไปทำ Data Profiling หรือสถิติเบื้องต้น)

---

### Engine 3: AI Rule Advisor Engine (`spark/ai_rule_advisor.py`)
**หน้าที่:** วิเคราะห์สถิติของการกระจายตัวของข้อมูล (Data Distribution) จากการทำ Profiling แล้วสังเคราะห์ออกมาเป็น **"ข้อเสนอกฎคุณภาพข้อมูล (Rule Proposals)"** พร้อมคะแนนความมั่นใจ (Confidence Score) และเหตุผลประกอบที่เป็นรูปธรรม

**วิธีการคำนวณข้อเสนอแนะ:**
1. **คอลัมน์ประเภทตัวเลข (Numerical Columns):**
   - คำนวณ Quartile ($Q_1, Q_3$) และช่วง Interquartile Range ($IQR = Q_3 - Q_1$)
   - กำหนดขอบเขตที่ไม่รวม Outlier: $[\max(0, Q_1 - 1.5 \times IQR), Q_3 + 1.5 \times IQR]$
   - แนะนำกฎ `expect_column_values_to_be_between` พร้อมบอกเหตุผลว่า: *"จากข้อมูลตัวอย่าง 10,100 แถว พบว่า 99% ของค่าอยู่ในช่วง 0 ถึง 100 ดังนั้นค่าที่เกิน 100 มีแนวโน้มสูงที่จะเป็น Human Input Error"*
2. **คอลัมน์ประเภทข้อความ (String Columns):**
   - คำนวณ Cardinality (จำนวนค่าที่ไม่ซ้ำ) หากพบน้อยกว่า 20 รูปแบบ ระบบจะแนะนำกฎ `expect_column_values_to_be_in_set`
   - ตรวจสอบ Pattern ด้วย RegEx Heuristics หากตรวจพบโครงสร้างเฉพาะ เช่น รหัสนักศึกษา 8 หลัก จะแนะนำกฎ `^[0-9]{8}$` พร้อม Confidence Score 0.95

---

### Engine 4: Auto-Remediation Engine (`spark/auto_remediation_engine.py`)
**หน้าที่:** แก้ไขข้อผิดพลาดของข้อมูลโดยอัตโนมัติตามนโยบายที่ผู้ใช้กำหนด (Deterministic Cleaning Policy) แทนที่จะตัดทิ้งเพียงอย่างเดียว

**ยุทธศาสตร์การแก้ไข (Remediation Strategies):**
- **Imputation (การแทนที่ค่าว่าง):**
  - `mean`: แทนที่ด้วยค่าเฉลี่ยของคอลัมน์นั้น (เหมาะสำหรับตัวเลขที่มีการกระจายตัวแบบ Normal)
  - `median`: แทนที่ด้วยค่ามัธยฐาน (เหมาะสำหรับตัวเลขที่มี Outlier สูง เช่น ชั่วโมงเรียน)
  - `mode`: แทนที่ด้วยค่าฐานนิยมที่พบบ่อยสุด (เหมาะสำหรับ Categorical Data)
  - `constant`: แทนที่ด้วยค่าคงที่ เช่น `"UNKNOWN"` หรือ `0`
- **String Sanitization:** ตัดช่องว่างหัวท้าย (`trim`), แปลงตัวพิมพ์เล็กพิมพ์ใหญ่ (`lowercase`/`uppercase`), และลบอักขระพิเศษแปลกปลอม
- **Deduplication:** จัดการแถวที่ซ้ำซ้อนโดยยึดตามเรคคอร์ดล่าสุด (`Keep Latest by updated_at`)

---

### Engine 5: Semantic Standardization & NLP Fuzzy Engine (`LocalSemanticStandardizer` & `api/app/api/standardize.py`)
**หน้าที่:** แก้ไขปัญหาการสะกดคำผิด คำพ้องความหมาย ตัวย่อ และภาษาไทยปนภาษาอังกฤษ (รายละเอียดเชิงลึกจะอธิบายในข้อ 4)

---

### Engine 6: Schema Drift Governance Engine (`api/app/api/schema.py` & `spark/spark_quality_engine.py`)
**หน้าที่:** เฝ้าระวังการเปลี่ยนแปลงโครงสร้างตาราง (Schema Evolution) แบบอัตโนมัติ
- เมื่อมีไฟล์หรือข้อมูลชุดใหม่เข้ามา Spark จะดึงโครงสร้างตาราง (Column Name และ Data Type) มาเปรียบเทียบกับ `spark/schema_registry.json`
- **กรณีพบ Column แปลกปลอม หรือ Type เปลี่ยนแปลง:**
  ระบบจะไม่ยอมให้ Pipeline ล่มหรือแอบรับข้อมูลเข้าไปทันที แต่จะสร้างเอกสาร **"Schema Proposal"** ขึ้นใน Elasticsearch ดัชนี `sdoqap_schema_proposals` ด้วยสถานะ `PENDING`
- **Human Approval Gate:** วิศวกรข้อมูลสามารถเข้ามาตรวจสอบที่หน้า Catalog (`/schema`) และกดยอมรับ (`APPROVE`) หรือปฏิเสธ (`REJECT`)
- หากกดยอมรับ ระบบจะอัปเดต `schema_registry.json` และปรับปรุงตารางปลายทางแบบ Non-breaking Schema Evolution

---

### Engine 7: Spark Gold Layer Engine (`spark/spark_gold_layer.py`)
**หน้าที่:** รับข้อมูลที่ผ่านการคัดกรองระดับ Silver (Active Clean Lake) มาทำการสรุปผล (Aggregation) และจัดทำตารางระดับ Business Metrics สำหรับการทำรายงานและ BI Dashboard
- คำนวณคะแนนเฉลี่ยจำแนกตามรายวิชา (`average_score_by_course`)
- คำนวณอัตราการสอบผ่าน/ตก (`pass_fail_rate`)
- คำนวณการกระจายตัวของเกรดและช่วงคะแนน (`score_distribution`)
- สร้างตารางรายชื่อนักศึกษาที่ต้องได้รับการติดตามช่วยเหลือ (`students_at_risk_list`)
- ส่งผลลัพธ์ต่อไปยัง PostgreSQL Table และ Index บน Elasticsearch เพื่อให้ Dashboard เรียกใช้งานได้ด้วยความเร็วระดับ Millisecond

---

### Engine 8: Streaming Ingestion & Real-Time Quality Engine (`spark/streaming_job.py`)
**หน้าที่:** ประมวลผลข้อมูลแบบ Real-Time Streaming จาก Apache Kafka โดยใช้ Spark Structured Streaming
- อ่าน Event Payload จาก Kafka Topic แบบ Micro-batch (Window ขนาด 5-10 วินาที)
- รันกฎ Dynamic Quality Rules บน Stream โดยตรง
- เรคคอร์ดที่ผ่านจะถูกส่งต่อไปยัง downstream consumer และเรคคอร์ดที่ตกเกณฑ์จะถูกคัดแยกเข้า Quarantine Topic เพื่อไม่ให้ข้อมูลสกปรกหลุดเข้าไปในระบบ Production

---

### Engine 9: Upstream Remediation & Alert Router (`spark/alert_router.py` & `api/app/api/pipeline.py`)
**หน้าที่:** เชื่อมต่อผลการตรวจสอบคุณภาพกลับไปยังผู้สร้างข้อมูล (Source Producers)
- ตรวจจับความผิดปกติที่เกินค่าพิกัดวิกฤต เช่น อัตราส่วนความล้มเหลว (Failure Rate) พุ่งเกิน 15% หรือมี Null ค่าแปลกปลอมเข้ามาเป็นชุด
- สังเคราะห์ข้อความแจ้งเตือนที่มี Root-Cause Detail (ไม่ใช่แค่บอกว่าพัง แต่ระบุชัดเจนว่าพังที่บรรทัดใด ค่าอะไรผิด)
- ส่ง Webhook แจ้งเตือนไปยัง Slack, Microsoft Teams, n8n Automation หรือเปิด Ticket บน Jira/Elasticsearch โดยอัตโนมัติ

---

### Engine 10: White-Box Transparent Quality Governance Engine (`api/app/api/whitebox.py`)
**หน้าที่:** ดูแลวงจรการตัดสินใจแบบโปร่งใส 10 ขั้นตอน (White-Box Decision Lifecycle)
- เชื่อมต่อระหว่างข้อมูลทดสอบสกปรก (`dirty_dataset.csv`) กับเฉลยจริง (`ground_truth.csv`)
- บันทึกการตัดสินใจของผู้ใช้ (User Overrides) ลงใน `_LATEST_EXECUTION_RESULTS`
- ประเมินความแม่นยำของระบบออกมาเป็นตัวเลขทางสถิติที่ตรวจสอบได้ (Confusion Matrix, Precision, Recall, F1-Score) เพื่อพิสูจน์ให้กรรมการเห็นว่าการตัดสินใจของระบบไม่ใช่การเดา แต่มีหลักฐานอ้างอิงชัดเจน

---

## 4. เจาะลึกระบบ Schema Mapping & Data Standardization (Comprehensive Mapping System)

ระบบ Mapping ของ SDOQAP แบ่งออกเป็น 2 มิติที่ทำงานร่วมกัน: **Column-Level Mapping** (ระดับคอลัมน์) และ **Value-Level Semantic Mapping** (ระดับค่าของข้อมูล)

```
[ ข้อมูลดิบที่รับเข้ามา ]
    │
    ├── 1. Column-Level Mapping: แมปชื่อคอลัมน์ที่ไม่ตรงกับ Schema Registry
    │      (เช่น "std_id" -> "student_id", "คะแนน" -> "score")
    │
    └── 2. Value-Level Semantic Mapping: จัดระเบียบคำและความหมายภายในแถว
           (Tier 1: Hash Exact -> Tier 2: Hybrid NLP Fuzzy -> Tier 3: Review Queue)
```

---

### 4.1 Column-Level Schema Mapping & Normalization
เมื่อข้อมูลจากแหล่งภายนอกถูกส่งเข้ามา ชื่อคอลัมน์มักมีความหลากหลาย เช่น มีช่องว่าง ตัวพิมพ์เล็กพิมพ์ใหญ่ หรืออักขระพิเศษ ระบบจะใช้ฟังก์ชันการทำความสะอาดระดับโครงสร้าง:

```python
def clean_column_name(name: str) -> str:
    # แปลงช่องว่าง, จุลภาค, เซมิโคลอน, วงเล็บ ให้กลายเป็นเครื่องหมาย Underscore
    cleaned = re.sub(r'[ ,;{}()\n\t=]', '_', name)
    # รวม underscore ที่ติดกันหลายตัวให้เหลือตัวเดียว
    cleaned = re.sub(r'_{2,}', '_', cleaned)
    return cleaned.strip('_').lower()
```

จากนั้นจะเทียบกับ `schema_registry.json` หากพบว่าคอลัมน์ตรงกับ Alias ที่บันทึกไว้ในพจนานุกรม ระบบจะทำการ Rename อัตโนมัติ หากเป็นคอลัมน์ใหม่ที่ยังไม่เคยมีมาก่อน ระบบจะส่งต่อไปยัง **Schema Drift Governance** เพื่อรอการอนุมัติ

---

### 4.2 Value-Level Semantic Mapping ด้วย Hybrid Similarity Algorithm
ในระดับค่าของข้อมูล เช่น ชื่อรายวิชา ข้อมูลดิบมักมีคำหลากหลายรูปแบบ:
- `คณิต 1`, `คณิตศาสตร์ 1`, `Math I`, `MATH101`, `calculus i` -> ทั้งหมดนี้ควรถูกจัดเป็นหมวด `"Mathematics"`

SDOQAP ไม่ได้ใช้การ Hardcode แต่ใช้ **3-Tier Mapping Architecture**:

```
[ ค่าข้อมูลดิบ (Raw Value) ]
             │
             ▼
     ┌────────────────┐
     │ Tier 1: Memory │ ──► เจอใน Cache/พจนานุกรม ──► คืนค่าทันที (ความเร็ว O(1), Confidence = 1.0)
     │   Hash Match   │
     └────────────────┘
             │ ไม่เจอ
             ▼
     ┌────────────────┐
     │ Tier 2: Hybrid │ ──► คำนวณ 3 ปัจจัยร่วมกัน
     │ NLP Similarity │     Score = (0.4 * Substring) + (0.3 * TokenOverlap) + (0.3 * NgramCosine)
     └────────────────┘
             │
             ├──────► Score >= 0.85 ──► อนุมัติจัดเข้าหมวดหมู่อัตโนมัติ (Auto-Standardized)
             │
             ▼ Score < 0.85
     ┌────────────────┐
     │ Tier 3: Human  │ ──► ส่งเข้าคิว Elasticsearch (sdoqap_unmapped_terms)
     │  Review Queue  │     เพื่อรอให้ Data Engineer ตัดสินใจบน Web UI
     └────────────────┘
```

#### สูตรการคำนวณ Hybrid Similarity ใน `LocalSemanticStandardizer`:
ความท้าทายสำคัญของภาษาไทยคือ **"ไม่มีการเว้นวรรคระหว่างคำ"** ทำให้การตัดคำ (Tokenization) แบบทั่วไปล้มเหลว SDOQAP จึงออกแบบสูตรคณิตศาสตร์แบบลูกผสม (Hybrid Formula):

$$\text{Final Score} = (0.4 \times S_{\text{substring}}) + (0.3 \times S_{\text{token}}) + (0.3 \times S_{\text{ngram}})$$

1. **Substring Containment ($S_{\text{substring}}$ - น้ำหนัก 40%):**
   ตรวจสอบว่าคำเป้าหมายเป็นส่วนหนึ่งของข้อความหรือไม่ (เช่น `"คณิต"` อยู่ใน `"วิชาคณิตศาสตร์พื้นฐาน"`)
2. **Token Overlap Jaccard Index ($S_{\text{token}}$ - น้ำหนัก 30%):**
   คำนวณสัดส่วนคำที่ตรงกันสำหรับภาษาที่มีการเว้นวรรค:
   $$S_{\text{token}} = \frac{|T_1 \cap T_2|}{\min(|T_1|, |T_2|)}$$
3. **Character N-gram Cosine Similarity ($S_{\text{ngram}}$ - น้ำหนัก 30%):**
   สร้าง Bigram (คู่ตัวอักษร 2 ตัวติดกัน) ของทั้งสองคำ แล้วคำนวณ Cosine Similarity ระหว่าง Vector:
   $$S_{\text{ngram}} = \frac{\sum (v_1 \cdot v_2)}{\sqrt{\sum v_1^2} \times \sqrt{\sum v_2^2}}$$
   *จุดนี้ช่วยให้ตรวจจับคำสะกดผิดในภาษาไทยได้อย่างแม่นยำ เช่น "คนิตศาสตร์" กับ "คณิตศาสตร์" จะได้คะแนน Cosine สูงมากแม้จะสะกดผิดพยัญชนะก็ตาม*

---

### 4.3 Human-in-the-Loop Review Queue และ Active Learning Loop
เมื่อมีคำแปลกใหม่ที่ได้คะแนนต่ำกว่าเกณฑ์ 0.85 ระบบจะไม่ทึกทักเดาเอง แต่จะส่งเข้า **Unmapped Review Queue** (`/api/v1/standardize/review-queue`):
1. วิศวกรเปิดหน้าเว็บ **Expectations & Alerts** หรือ **Catalog**
2. ระบบจะแสดงรายการคำที่รอตรวจสอบ พร้อมคำแนะนำจาก AI เช่น:
   - คำดิบ: `"calc-101"`
   - ข้อเสนอแนะ: `"Mathematics"` (ความมั่นใจ 0.78)
3. วิศวกรสามารถเลือกทำได้ 3 ทาง:
   - **Approve (อนุมัติ):** ยืนยันว่าคำนี้ตรงกับหมวดที่ AI แนะนำ
   - **Override (แก้ไข):** กำหนดหมวดหมู่ใหม่ที่ถูกต้องด้วยตนเอง
   - **Reject (ปฏิเสธ):** จัดเป็นหมวด `"อื่นๆ"` หรือส่งเข้า Quarantine
4. **Active Learning Feedback:** เมื่อวิศวกรกดยืนยัน ระบบจะเรียกฟังก์ชัน `_update_memory_registry()`:
   - บันทึกคู่คำใหม่นี้ลงใน `spark/rules_config.json` และ Elasticsearch ทันที
   - ในการรันครั้งถัดไป คำนี้จะถูกประมวลผลที่ **Tier 1 (Memory Hash Match)** ด้วยความเร็วสูงสุดและไม่ต้องรอการตรวจสอบซ้ำอีก

---

### 4.4 Multi-Table Relational Mapping & Referential Integrity
ในกระบวนการทำงานระดับ White-Box ระบบรองรับการเชื่อมโยงข้อมูลหลายตาราง (Multi-Table Join):
- ตารางข้อเท็จจริง (Fact): `dirty_dataset.csv` (มี `student_id`, `course`, `score`)
- ตารางมิติ (Dimension): `student_demographics.csv` (มี `student_id`, `faculty`, `admission_year`, `gpa`)
- **กลไกการตรวจสอบ:**
  - ตรวจสอบ Foreign Key Integrity: ค้นหา Orphan Rows (นักศึกษาที่มีคะแนนสอบแต่ไม่มีประวัติในฝ่ายทะเบียน)
  - ผสานข้อมูล (Enrichment) เพื่อสร้าง Dataset กลางสำหรับการประเมินภาพรวมทางวิชาการ

---

## 5. คู่มือเจาะลึก 10 หน้าเว็บบน Web UI (Frontend Pages Walkthrough)

Web Application ของ SDOQAP พัฒนาด้วย React 18 จัดหน้าตาตามมาตรฐาน Databricks Enterprise UX โดยแบ่งออกเป็น 3 หมวดหมู่หลักตาม `ui/src/config/pages.js`:

```
┌────────────────────────────────────────────────────────┐
│                   SDOQAP NAVIGATION                    │
├─────────────────┬───────────────────┬──────────────────┤
│ หมวดที่ 1:      │ หมวดที่ 2:        │ หมวดที่ 3:       │
│ เริ่มต้นใช้งาน   │ ขั้นตอนการทำงาน   │ ติดตามและตรวจสอบ │
├─────────────────┼───────────────────┼──────────────────┤
│ 1. Home         │ 3. Ingestion      │ 7. Dashboards    │
│ 2. Learn & Arch │ 4. Expectations   │ 8. Query/Metrics │
│                 │ 5. Pipeline       │ 9. Catalog       │
│                 │ 6. Exports        │ 10. Audit Trail  │
└─────────────────┴───────────────────┴──────────────────┘
```

---

### หน้าที่ 1: Home (`/`)
**บทบาท:** ศูนย์รวมทางลัดการทำงานและภาพรวมสถานะระบบ (Workflow Overview & Role Shortcuts)
- **Workflow Journey Grid:** แสดงขั้นตอนการทำงานหลัก 4 ลำดับ (Ingestion -> Expectations -> Pipeline -> Export) ให้ผู้ใช้งานเห็นภาพรวมของงาน
- **Role-Based Shortcuts:** ปุ่มทางลัดสำหรับผู้ใช้แต่ละกลุ่ม:
  - *Data Engineer:* นำทางไปยังการตั้งค่ากฎและตรวจจับ Schema Drift
  - *Data Steward / Governance Lead:* นำทางไปยัง Review Queue เพื่ออนุมัติคำศัพท์
  - *Business Analyst:* นำทางไปยัง Dashboard ภาพรวมและส่งออกข้อมูล Clean
- **System Health Status:** แถบแสดงสถานะความพร้อมของ Docker Containers ทั้งหมดในเครื่อง

---

### หน้าที่ 2: Learn & Architecture (`/guide`)
**บทบาท:** ศูนย์การเรียนรู้ คู่มือพารามิเตอร์ และแผนผังสถาปัตยกรรม (Architecture & Parameter Glossary)
- **System Architecture Blueprint:** แสดงผังความสัมพันธ์ระหว่าง Microservices (Nginx, Spark, HDFS, Elasticsearch, PostgreSQL)
- **Parameter Explanations:** อธิบายความหมายของค่าคอนฟิกทุกตัวในระบบอย่างละเอียด เช่น:
  - `quality_score_threshold`: ค่าคะแนนขั้นต่ำที่ยอมรับได้ (เช่น 95%) หากต่ำกว่านี้จะทริกเกอร์แจ้งเตือน
  - `semantic_threshold`: ค่าความคล้ายคลึงขั้นต่ำสำหรับจับคู่คำศัพท์ (ค่าตั้งต้น 0.85)
  - `iqr_multiplier`: ตัวคูณช่วงกว้างสำหรับการตัด Outlier (ค่าสากล 1.5)
- **Design Decisions:** บันทึกเหตุผลทางวิศวกรรมว่าทำไมระบบถึงเลือกใช้เทคโนโลยีแต่ละตัว

---

### หน้าที่ 3: Data Ingestion (`/ingestion` - Step 1)
**บทบาท:** สถานีนำเข้าข้อมูลจาก 4 แหล่ง พร้อมระบบ Data Profiling แบบเปิดเผยค่าสถิติ
- **4 Ingestion Modalities:**
  1. *File Upload:* อัปโหลดไฟล์ CSV/Parquet ผ่าน Drag-and-Drop
  2. *REST API Ingestion:* ดึงข้อมูลจาก Web API ภายนอก รองรับการตั้ง Polling Interval และระบบป้องกัน SSRF (Allowlist Domain)
  3. *RDBMS Database:* เชื่อมต่อไปยัง PostgreSQL, MySQL เพื่อดึงข้อมูลด้วยคำสั่ง `SELECT` ที่จำกัดสิทธิ์ Read-Only เพื่อความปลอดภัย
  4. *Kafka Event Stream:* สตรีมข้อมูลแบบ Real-Time จาก Kafka Broker
- **Empirical Data Profiling Widget:** เมื่อนำเข้าข้อมูลแล้ว ระบบจะคำนวณและแสดงผลค่าสถิติ 6 ด้านทันที:
  - จำนวนเรคคอร์ดทั้งหมด (Row Count)
  - สัดส่วนค่าว่าง (Null Rate) แยกรายคอลัมน์
  - จำนวนค่าที่ไม่ซ้ำ (Distinct / Cardinality)
  - ค่าต่ำสุด / ค่าสูงสุด (Min / Max)
  - จำนวนแถวที่ซ้ำซ้อนกันทั้งหมด (Duplicate Rows)
  - ตรวจจับ Outlier ด้วยวิธี IQR

---

### หน้าที่ 4: Expectations & Alerts (`/rules` - Step 2)
**บทบาท:** ศูนย์กำหนดและบริหารจัดการกฎคุณภาพข้อมูล (Rule Management & Governance)
- **Table Rules Tab:** ปรับแต่งกฎของแต่ละตารางแบบละเอียด มีตัวแปลงออกเป็น **YAML DSL** เพื่อความสะดวกในการทำ Version Control
- **AI Proposals Tab:** หน้าต่างแสดงรายการกฎที่ AI Rule Advisor แนะนำ โดยระบุคะแนนความมั่นใจ (Confidence Score) และเหตุผล "Why?" ผู้ใช้สามารถกด *Accept Rule* เพื่อบรรจุเข้าสู่ระบบ หรือกด *Dismiss* เพื่อปฏิเสธ
- **Upstream Remediation Tickets Tab:** หน้าติดตามสถานะ Ticket ที่ถูกส่งกลับไปยังทีมต้นทาง พร้อมปุ่ม *Mark Resolved* เมื่อได้รับการแก้ไข
- **Standardization Review Queue:** ตารางจัดการคำศัพท์ที่ยังแมปไม่ได้ ให้ผู้ใช้เลือก Approve, Override หรือ Reject

---

### หน้าที่ 5: Jobs & Pipelines (`/pipeline` - Step 3)
**บทบาท:** ห้องควบคุมการประมวลผล Spark Pipeline และการตรวจสอบข้อมูลระดับแถว (Row-level Inspection)
- **Execution Controls:** ปุ่มกดสั่งรัน Pipeline (`Execute Job`), ปุ่ม Re-run สำหรับงานที่ล้มเหลว, และปุ่ม `Rebuild Gold Layer`
- **Interactive 3-Way Segregation Zones:** ตัวสลับมุมมองระหว่าง 3 โซน:
  - 🟢 **Clean Data Zone:** แถวที่ผ่านเกณฑ์คุณภาพทั้งหมด
  - 🟡 **Review Queue Zone:** แถวที่มีความผิดปกติระดับเตือน หรือมีค่าคำศัพท์ก้ำกึ่ง
  - 🔴 **Quarantine Lake Zone:** แถวที่ผิดกฎขั้นวิกฤต เช่น รหัสนักศึกษาว่าง หรือคะแนนติดลบ
- **Record-Level Inspection Table:** ตารางเจาะลึกระดับแถว ผู้ใช้งานสามารถคลิกดูได้ว่าแต่ละแถวติด Error ประเภทใด เพราะเหตุใด และมีปุ่มให้ผู้ใช้สั่ง Override รายแถวได้โดยตรง (Keep / Quarantine / Impute)

---

### หน้าที่ 6: Workspace Exports (`/export` - Step 4)
**บทบาท:** สถานีส่งออกข้อมูลที่ผ่านการรับรองคุณภาพแล้วสำหรับนำไปใช้งานต่อ
- **Zone Selector:** เลือกดาวน์โหลดข้อมูลจาก Clean Zone, Review Queue หรือ Quarantine Lake
- **Format Options:** รองรับการส่งออกเป็นไฟล์ `.csv` และ `.parquet`
- **Trust-Check Verification Badge:** มีระบบตรวจสอบความน่าเชื่อถือก่อนดาวน์โหลด โดยยิง API ไปยัง `/api/v1/lineage/{table}/trust-check` หากตารางนั้นมีคะแนนคุณภาพไม่ถึงเกณฑ์ หรือมี Schema Drift ค้างอยู่ ระบบจะขึ้นป้ายเตือนให้ผู้ใช้วิเคราะห์ข้อมูลทราบทันที

---

### หน้าที่ 7: Dashboards (`/dashboard`)
**บทบาท:** แดชบอร์ดสรุปผลภาพรวมระดับผู้บริหาร (SDOQAP Executive Dashboard) ตาม Master Spec แบ่งออกเป็น 4 แท็บ:
1. **Executive Overview:** สรุปคะแนน Data Quality Score ภาพรวม, เรดาร์ 4 มิติคุณภาพ, และการประเมินผลกระทบทางธุรกิจ (Cost & Waste Saved)
2. **Quality Drilldown:** กราฟจำแนกข้อผิดพลาดตามประเภท (Missing Value, Outlier, Duplicate, Invalid Format)
3. **Operations & SLA:** สถิติเวลาในการประมวลผล (Pipeline Runtime), ปริมาณข้อมูล Throughput และสถานะการบรรลุเป้าหมายตาม SLA
4. **Interactive Data Lineage:** แผนผังเส้นทางข้อมูลที่สร้างด้วย Apache ECharts แสดงความเชื่อมโยงตั้งแต่ Data Source -> HDFS Raw -> Spark Engine -> Active/Quarantine Lake -> Gold Mart

---

### หน้าที่ 8: Query & Metrics (`/analytics`)
**บทบาท:** เครื่องมือสืบค้นเชิงลึกและการวิเคราะห์แนวโน้มของคุณภาพข้อมูล
- **Time-Series Trend Analysis:** ดูกราฟแนวโน้มของคะแนนคุณภาพข้อมูลย้อนหลังตามช่วงเวลา
- **Column-Level Anomaly Detection:** วิเคราะห์ความผิดปกติที่เกิดขึ้นซ้ำๆ ในรายคอลัมน์
- **AI Trend Insight:** บทวิเคราะห์สรุปแนวโน้มโดยอัตโนมัติ ชี้เป้าว่ามีคอลัมน์ใดที่เริ่มมีสัญญาณเสื่อมสภาพของคุณภาพ (Degrading Quality)

---

### หน้าที่ 9: Catalog (`/schema`)
**บทบาท:** ทะเบียนโครงสร้างข้อมูลกลางและการควบคุม Schema Drift (Schema Governance)
- **Schema Registry List:** รายการตารางทั้งหมดในระบบ แสดงคอลัมน์ ชนิดข้อมูล (Data Type), Primary Key และ Partition Key
- **Schema Drift Proposals Queue:** แสดงรายการตารางที่มีการเปลี่ยนแปลงโครงสร้างจากต้นทาง โดยแสดงตารางเปรียบเทียบแบบ Diff (สีเขียว = คอลัมน์ที่เพิ่มขึ้น, สีแดง = คอลัมน์ที่หายไป, สีเหลือง = Type เปลี่ยน)
- **Governance Approval Gate:** วิศวกรสามารถกดปุ่ม *Approve Proposal* เพื่ออัปเดต Schema ของระบบ หรือกด *Reject* เพื่อปฏิเสธการเปลี่ยนแปลง

---

### หน้าที่ 10: Audit Trail / White-Box Pipeline (`/whitebox`)
**บทบาท:** หัวใจสำคัญของการพิสูจน์ระบบ White-Box แสดงหลักฐานการทำงาน 10 ขั้นตอนแบบทีละสเต็ป
- **Step-by-Step Transparency Timeline:** แสดงสถานะและความโปร่งใสในทุกช่วงการประมวลผล
- **Multi-Table Relational Joining:** แสดงผลการผสานตารางระหว่าง `dirty_dataset.csv` กับ `student_demographics.csv`
- **Ground Truth Benchmark Matrix (การประเมินเทียบเฉลยจริง):** แสดงตารางเปรียบเทียบความแม่นยำ 7 มิติเทียบกับ `ground_truth.csv`:
  1. *Missing Score Detection Rate*
  2. *Invalid Score Range Detection Rate*
  3. *Study Hours Outlier Detection Rate*
  4. *Duplicate Row Elimination Rate*
  5. *Overall Classification Accuracy*
  6. *Precision & Recall Rate*
  7. *F1-Score Measurement*
- **Audit Reasoning Log:** บันทึกเหตุผลทุกข้อที่ระบบและวิศวกรได้ตัดสินใจ สามารถดาวน์โหลดเป็นหลักฐานสำหรับส่งกรรมการตรวจสอบได้

---

## 6. การเดินทางของข้อมูล 1 เรคคอร์ด (End-to-End Life of a Record Walkthrough)

เพื่อให้เห็นภาพการทำงานจริง นี่คือตัวอย่างการเดินทางของข้อมูลคะแนนนักศึกษา 3 เรคคอร์ดที่มีปัญหาแตกต่างกัน:

```
[ ข้อมูลดิบที่ส่งเข้ามา ]
Row 101: student_id="STD_001", course="math I", score="95", study_hours="10"
Row 102: student_id="STD_002", course="คนิตศาสตร์", score="-15", study_hours="12"
Row 103: student_id="",        course="Physics", score="80",  study_hours="500"
```

### การประมวลผลทีละขั้นตอน:

#### เรคคอร์ดที่ 1 (Row 101: ข้อมูลปกติแต่มีข้อความหลากหลาย):
1. **Ingestion & Profiling:** อ่านข้อมูลเข้ามา ระบบตรวจพบว่าทุกช่องมีค่าครบ
2. **Semantic Standardization (Engine 5):**
   - คำว่า `"math I"` เข้าสู่ Tier 2 (Hybrid NLP) ระบบตรวจพบคำว่า `"math"` ในคำศัพท์เป้าหมาย `"Mathematics"` ได้คะแนน Similarity = 0.92 (เกินเกณฑ์ 0.85)
   - ปรับค่าคอลัมน์ `course` จาก `"math I"` กลายเป็น `"Mathematics"` อัตโนมัติ
3. **Dynamic Rule Validation (Engine 2):** ผ่านเกณฑ์ทุกข้อ (คะแนน 95 อยู่ในช่วง 0-100, รหัสนักศึกษาครบ)
4. **Segregation:** ถูกส่งเข้าสู่ **Active Clean Lake (`/data/active/`)**
5. **Gold Aggregation (Engine 7):** คะแนน 95 ถูกนำไปรวมคำนวณค่าเฉลี่ยของวิชา Mathematics บน Dashboard

#### เรคคอร์ดที่ 2 (Row 102: มีคำสะกดผิดและคะแนนติดลบ):
1. **Ingestion & Profiling:** อ่านข้อมูลเข้ามา ค่าคะแนนเป็นตัวเลขติดลบ
2. **Semantic Standardization (Engine 5):**
   - คำว่า `"คนิตศาสตร์"` สะกดผิด (ใช้ น หนู แทน ณ เณร) เมื่อคำนวณด้วย N-gram Cosine Similarity เทียบกับ `"คณิตศาสตร์"` ได้คะแนน = 0.88 (เกินเกณฑ์ 0.85)
   - ปรับแก้คำสะกดผิดให้กลายเป็น `"Mathematics"` โดยอัตโนมัติ
3. **Dynamic Rule Validation (Engine 2):**
   - ตกกฎวิกฤต: `expect_column_values_to_be_between` (คะแนน -15 ไม่อยู่ในช่วง 0 ถึง 100)
   - ติดแท็กข้อผิดพลาด: `whitebox_error_type: "INVALID_SCORE_RANGE"`
4. **Segregation:** ถูกคัดแยกเข้าสู่ **Quarantine Lake (`/data/quarantine/`)** ทันที ไม่ยอมให้หลุดไปปนกับข้อมูลดี
5. **Upstream Remediation (Engine 9):** สร้าง Ticket แจ้งเตือนไปยังระบบทะเบียนต้นทางว่าอาจารย์ผู้สอนอาจกรอกคะแนนผิดพลาด

#### เรคคอร์ดที่ 3 (Row 103: รหัสนักศึกษาว่าง และชั่วโมงเรียนสูงผิดปกติ):
1. **Ingestion & Profiling:** ตรวจพบว่าคอลัมน์ `student_id` เป็นค่าว่าง (`Null`) และชั่วโมงเรียนมีค่า 500 ชม.
2. **Auto-Remediation & Outlier Analysis (Engine 3 & 4):**
   - ชั่วโมงเรียน 500 ชม. เกินขอบเขต $Q_3 + 1.5 \times IQR$ (ระบบประเมินว่าเป็น Outlier)
   - กฎการซ่อมแซม: ใช้ยุทธศาสตร์ Imputation แบบ `median` ปรับค่าชั่วโมงเรียนให้กลับมาอยู่ที่ค่ามัธยฐาน 12 ชม.
3. **Dynamic Rule Validation (Engine 2):**
   - อย่างไรก็ตาม คอลัมน์ `student_id` เป็น Primary Key และตกกฎวิกฤต `not_be_null` ซึ่งระบบไม่อนุญาตให้เดาหรือแทนที่รหัสนักศึกษาได้
4. **Segregation:** ส่งเข้าสู่ **Quarantine Lake** พร้อมบันทึกเหตุผลว่า *"Primary Key is Missing"* และตัดคะแนน Completeness ของรอบการประมวลผลนั้น

---

## 7. สถาปัตยกรรมความปลอดภัยและเสถียรภาพ (Security & Fail-Safe Architecture)

SDOQAP ได้รับการเสริมความปลอดภัยระดับ Enterprise DevSecOps ครบทุกจุด:
1. **SSRF Prevention ใน API Ingestion (`api/app/api/pipeline.py`):** มีระบบ Allowlist Hostname (`API_INGEST_ALLOWED_HOSTS`) ป้องกันไม่ให้ผู้ใช้ป้อน URL ภายในระบบเพื่อโจมตีโครงสร้างพื้นฐานภายใน
2. **SQL Injection Defense ใน RDBMS Ingestion:** ป้องกันคำสั่งอันตรายด้วยการตรวจสอบไวยากรณ์ อนุญาตเฉพาะคำสั่ง `SELECT` เท่านั้น และห้ามไม่ให้มีเครื่องหมาย Semicolon (`;`) สำหรับการรันคำสั่งซ้อน (Multiple Statements/DDL)
3. **Concurrency Race Condition Prevention:** ใช้ Optimistic Concurrency Control (OCC) บน Elasticsearch Lock เพื่อการันตีว่า Spark Job จะไม่เขียนทับไฟล์ Parquet/Delta พร้อมกัน
4. **Fail-Closed Principle:** หากระบบ Metadata (Elasticsearch) ขัดข้องหรือออฟไลน์ ไพป์ไลน์จะหยุดทำงานทันที (Fail Closed) แทนที่จะปล่อยให้ข้อมูลไหลผ่านไปโดยไม่ได้ตรวจสอบคุณภาพ

---

## 8. สรุปภาพรวมสำหรับตอบคำถามกรรมการ (Summary for Committee Presentation)

| ประเด็นข้อสงสัยของกรรมการ | คำตอบเชิงสถาปัตยกรรมของ SDOQAP |
| :--- | :--- |
| **1. ระบบเป็น Black Box หรือไม่?** | **ไม่ใช่ Black Box** เพราะระบบมี White-Box 10 สเต็ป เปิดเผยค่า Profiling สถิติทุกตัว กฎที่ใช้ และมี Record-Level Inspection Table ให้ตรวจสอบเหตุผลในระดับแถว |
| **2. กฎคุณภาพข้อมูลมาจากไหน ใครตั้ง?** | กฎมาจาก 2 ทางผสานกัน: **AI Rule Advisor** วิเคราะห์สถิติ (IQR, Cardinality) มาแนะนำเบื้องต้น และ **Human-in-the-Loop** วิศวกรเป็นผู้อนุมัติหรือแก้ไขผ่านหน้าจอ Expectations ก่อนรันจริง |
| **3. ระบบจัดการคำสะกดผิดหรือคำหลากหลายอย่างไร?** | ใช้ **3-Tier Mapping**: เริ่มจาก Memory Hash Lookup -> Hybrid NLP Similarity (40% Substring + 30% Token + 30% N-gram Cosine) -> Unmapped Review Queue ให้คนอนุมัติเพื่อสอนระบบกลับแบบ Active Learning |
| **4. เมื่อพบข้อมูลเสีย ระบบทำอย่างไร?** | แยกข้อมูล 3 ทาง (Clean, Review Queue, Quarantine) ข้อมูลผิดจะไม่ถูกลบเงียบๆ แต่ถูกเก็บใน Quarantine Lake พร้อมส่ง **Upstream Remediation Ticket** แจ้งเตือนต้นทางให้แก้ที่ต้นตอ |
| **5. วัดผลความแม่นยำได้อย่างไรว่าทำงานได้จริง?** | มี **Ground Truth Benchmark Matrix** ที่รันเทียบกับ `ground_truth.csv` จำนวน 10,100 แถว แสดงค่า Precision, Recall และ F1-Score ในระดับ 98-100% ครบทุกมิติ |
