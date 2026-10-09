# สไลด์นำเสนอสถาปัตยกรรมระบบเชิงลึก: DataServe Platform (10 สไลด์)

> **เอกสารอ้างอิงหลัก**: [`docs/architecture/SYSTEM_ARCHITECTURE_OVERVIEW_DEEP_DIVE.md`](../architecture/SYSTEM_ARCHITECTURE_OVERVIEW_DEEP_DIVE.md)  
> **เวอร์ชันโค้ดที่ตรวจทาน**: commit `936ae76` (branch `feat/generic-profiling-rule-engine`)  
> **แนวทางการนำเสนอ**: Professional Engineering & System Architecture Presentation (มุ่งเน้นความโปร่งใส ความถูกต้องเชิงวิศวกรรม และการเชื่อมโยงคุณค่าทางธุรกิจ)  
> **รูปแบบในแต่ละสไลด์**: ประกอบด้วย (1) หัวสไลด์และประเด็นสำคัญ (2) เนื้อหาที่แสดงบนจอ (3) แผนภาพประกอบ (4) บทพูดผู้บรรยาย (Speaker Script) และ (5) หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)

---

## Slide 1: บทนำและภาพรวมแพลตฟอร์ม DataServe (Platform Architecture Overview)

### ประเด็นสำคัญ (Key Message)
DataServe คือแพลตฟอร์มบริหารจัดการและประกันคุณภาพข้อมูลสมัยใหม่ (Smart Data Operations & Quality Assurance Platform) ที่ออกแบบด้วยสถาปัตยกรรมเอนจินคู่ (Dual-Engine) ทำงานบน Modern Medallion Lakehouse พร้อมระบบปฏิบัติการแก้ไขปัญหาข้อมูลแบบวงจรปิด (Closed-Loop Upstream Governance)

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: DataServe: Enterprise Data Operations & Quality Assurance Platform
* **หัวข้อย่อย**: สถาปัตยกรรมทะเลสาบข้อมูลและการประกันคุณภาพข้อมูลอัตโนมัติแบบวงจรปิด
* **4 เสาหลักทางสถาปัตยกรรม (Architectural Pillars)**:
  1. **Dual-Engine Architecture**: ผสานความเร็วของ Interactive Whitebox Engine (FastAPI/Pandas) เข้ากับพลังประมวลผลขนาดใหญ่ของ Distributed Spark Batch Engine
  2. **Silver Medallion Dual-Zone**: คัดแยกข้อมูลระดับแถวเป็น 2 ท่อเอกเทศ ได้แก่ Active Store (Clean Delta Lake) และ Quarantine Store (Dead-Letter Queue Delta Lake)
  3. **3D COPDQ Financial Impact**: เปลี่ยนข้อผิดพลาดทางเทคนิคให้เป็นมูลค่าความเสียหายทางการเงินและต้นทุนการจัดการที่แท้จริง
  4. **Closed-Loop Upstream Healing**: ปิดวงจรปัญหาด้วยการแปลงแถวกักกันเป็นตั๋วงาน และสั่งประมวลผลซ้ำอัตโนมัติเมื่อต้นทางแก้ไขเสร็จสิ้น
* **แถบสรุปท้ายสไลด์**: "ไม่เพียงแค่ตรวจจับข้อผิดพลาด แต่คัดแยก ปกป้องระบบปลายทาง และส่งแรงขับเคลื่อนกลับไปแก้ถึงต้นน้ำ"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ Multi-Source Ingestion ] ──► [ Dual-Engine QA ] ──┬──► [ Active Store (Delta Lake) ] ──► BI / AI
                                                     └──► [ Quarantine (Dead-Letter) ] ──► [ Closed-Loop Trigger ]
                                                                                                  │
                                                                                                  ▼
                                                                                       [ Upstream Rectification ]
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"สวัสดีคณะกรรมการและทุกท่านครับ วันนี้ผมขอพาทุกท่านเจาะลึกสถาปัตยกรรมของ DataServe แพลตฟอร์มปฏิบัติการข้อมูลและการประกันคุณภาพข้อมูลระดับองค์กร 

ในระบบ Data Pipeline ทั่วไป เมื่อข้อมูลมีข้อผิดพลาด ข้อมูลเสียมักจะหลุดรอดไปทำลายรายงานผู้บริหาร หรือไม่ก็ทำให้ไปป์ไลน์หยุดชะงักทั้งระบบ DataServe เข้ามาแก้ปัญหานี้ด้วยสถาปัตยกรรม Modern Medallion Lakehouse ที่มีหัวใจสำคัญ 4 ด้าน: หนึ่ง คือการใช้สถาปัตยกรรมเอนจินคู่ ทั้งการโต้ตอบหน้าเว็บที่รวดเร็วและการประมวลผลคลัสเตอร์แบบกระจายศูนย์ สอง คือการแยกข้อมูลระดับแถวเข้าสู่ Active Zone และ Quarantine Zone บน Delta Lake อย่างเด็ดขาด สาม คือการประเมินความเสียหายออกมาเป็นตัวเงิน COPDQ เพื่อให้ฝ่ายบริหารตัดสินใจได้ และสี่ คือวงจรปิด Closed-Loop ที่ผลักดันการแก้ไขกลับไปยังระบบต้นน้ำ พร้อมสั่งรันข้อมูลใหม่อัตโนมัติครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `SYSTEM_ARCHITECTURE_OVERVIEW_DEEP_DIVE.md` (ภาพรวมเลเยอร์ 1–8)
* `services/spark/spark_quality_engine.py:1718-1737` (Active Delta MERGE INTO)
* `services/api/app/api/system.py:480-525` (Closed-Loop Reprocessing Trigger)

---

## Slide 2: แผนผังภาพรวมสถาปัตยกรรม 8 เลเยอร์ (8-Layer Architectural Blueprint)

### ประเด็นสำคัญ (Key Message)
การไหลของข้อมูลใน DataServe ถูกแบ่งออกเป็น 8 เลเยอร์อย่างเป็นระบบ ครอบคลุมวงจรชีวิตของข้อมูลตั้งแต่การรับเข้า การกลั่นกรองโครงสร้าง การคัดแยกคุณภาพ การจัดเก็บ การสังเกตการณ์ ไปจนถึงการส่งมอบและการแก้ไขต้นทาง

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: 8-Layer Architectural Blueprint: End-to-End Data Lifecycle
* **ผังการไหลของข้อมูล 8 ชั้น (8 Core Architectural Layers)**:
  * **Layer 1: Ingestion & Trigger**: รับข้อมูลหลายรูปแบบ (Batch File, RDBMS, REST API, Kafka) พร้อม Background Trigger Daemon
  * **Layer 2: Bronze & Pre-Flight**: HDFS Raw Bronze Zone, Schema Drift Gate (+1/+5/+5) และ Semantic Privacy Guardrail
  * **Layer 3: Dual-Engine Quality Processing**: Interactive Whitebox Engine (Pandas) และ Distributed Spark 21-Stage Engine
  * **Layer 4: Silver Medallion Dual-Zone**: Active Store (Upsert Delta Lake) คู่กับ Quarantine Store (Partitioned Delta Lake)
  * **Layer 5: Gold Observability**: ดัชนีเมทาดาต้าและประสิทธิภาพบน Elasticsearch 8.10.2 เชื่อมต่อ Kibana และ Grafana
  * **Layer 6: Serving API & Impact Engine**: FastAPI Serving, การจับคู่ 5 สายธุรกิจ และโมเดลประเมินความเสียหาย COPDQ
  * **Layer 7: Central Portal UI**: React 18, Zustand State Sync และการจำลอง Stream Flow บน Dashboard
  * **Layer 8: Closed-Loop Healing**: ระบบออกตั๋วแก้ไขต้นทางและการสั่งรันซ้ำอัตโนมัติผ่านพอร์ต 8099
* **แถบสรุปท้ายสไลด์**: "ท่อส่งข้อมูลที่มีระเบียบธรรมาภิบาลในตัว (Self-Governing Pipeline) ปลอดภัยในทุกจุดสัมผัส"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[1. Multi-Source Ingestion & Trigger]
                 │
                 ▼
[2. Bronze Storage & Pre-Flight Governance]
                 │
                 ▼
[3. Dual-Engine Compute (Whitebox & Spark 21-Stage)]
                 │
                 ▼
[4. Silver Dual-Zone: Active vs. Quarantine]
                 │
                 ▼
[5. Gold Observability & Telemetry (Elasticsearch)]
                 │
                 ▼
[6. Serving API & Dynamic COPDQ Impact Engine]
                 │
                 ▼
[7. Central Portal UI & Two-Way State Sync]
                 │
                 ▼
[8. Closed-Loop Upstream Healing & Trigger]
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"จากแผนภาพนี้ ทุกท่านจะเห็นวงจรชีวิตข้อมูลที่สมบูรณ์ 8 เลเยอร์ครับ เริ่มต้นจากเลเยอร์ 1 การรับข้อมูลเข้าที่มีเกราะป้องกันความปลอดภัย ส่งต่อไปยังเลเยอร์ 2 ในโซน Bronze บน HDFS ซึ่งมีด่านตรวจ Schema Drift และตั้งธง PII ก่อนเริ่มประมวลผล 

จากนั้นในเลเยอร์ 3 ข้อมูลจะถูกประมวลผลผ่านเอนจินคู่ คัดแยกแถวดีแถวเสียส่งต่อไปยังเลเยอร์ 4 บน Silver Delta Lake ซึ่งข้อมูลสะอาดจะถูก Upsert เข้า Active Store ส่วนข้อมูลติดกักกันจะเข้า Quarantine Store โดยมีเลเยอร์ 5 เก็บ Telemetry เข้า Elasticsearch เลเยอร์ 6 ให้บริการ API และคำนวณมูลค่าความเสียหาย เลเยอร์ 7 แสดงผลบนหน้าเว็บแบบซิงก์สถานะสองทาง และจบวงจรที่เลเยอร์ 8 ด้วยการส่งตั๋วงานให้ทีมต้นน้ำแก้ปัญหาและยิงคำสั่งกลับมารันใหม่โดยอัตโนมัติครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `docker-compose.yml` (คอนเทนเนอร์ 14 เซอร์วิสหลักที่ประกอบกันเป็น 8 เลเยอร์)
* `SYSTEM_ARCHITECTURE_OVERVIEW_DEEP_DIVE.md` (หัวข้อ 1 และ 2)

---

## Slide 3: เลเยอร์ที่ 1 & 2: ประตูด่านหน้าและธรรมาภิบาลโครงสร้าง (Ingestion & Pre-Flight Governance)

### ประเด็นสำคัญ (Key Message)
ระบบป้องกันความล้มเหลวแบบเงียบ (Zero Silent Failure) เริ่มตั้งแต่จุดรับเข้า ด้วยการตรวจสอบความปลอดภัยของอินพุต และด่านตรวจ Schema Drift ที่มีตรรกะแยกแยะระหว่างการเปลี่ยนแปลงที่ปลอดภัยกับความผิดปกติวิกฤต

### เนื้อหาบนสไลด์ (Slide Content)
* **Layer 1: Multi-Source Ingestion Hub**:
  * **Batch File Ingestion**: รองรับ CSV/Excel ผ่าน `POST /api/v1/pipeline/ingest/csv` ตรวจ SHA-256 Checksum ป้องกันไฟล์ซ้ำ และตรวจคีย์หลักล่วงหน้า (รองรับเฉพาะ `utf-8-sig`/UTF-8)
  * **Relational Database**: `POST /api/v1/pipeline/ingest/rdbms` จำกัดเฉพาะคำสั่ง `SELECT` อ่านอย่างเดียว พร้อมกรองโฮสต์ผ่าน `RDBMS_ALLOWED_HOSTS`
  * **REST API Ingestion**: `POST /api/v1/pipeline/ingest/api` แบบ Fail-Closed รับเฉพาะ `data.go.th` และโฮสต์ใน `API_INGEST_ALLOWED_HOSTS`
  * **Trigger Daemon**: เซอร์วิสพอร์ต `8099` บน Spark Master รองรับคำสั่ง FIFO จัดการคิวรันไปป์ไลน์
* **Layer 2: Bronze Storage & Pre-Flight Gate**:
  * **HDFS Raw Storage**: เก็บข้อมูลดิบต้นฉบับที่ `/data/raw/` และย้ายไป `/data/archive/` เพื่อใช้ตรวจสอบย้อนหลัง
  * **Schema Drift Scoring & Self-Healing**:
    * คำนวณคะแนนความรุนแรง: คอลัมน์ใหม่ $+1$, คอลัมน์สูญหาย $+5$, ชนิดข้อมูลไม่ตรง $+5$
    * **Safe Drift**: หากพบคอลัมน์ใหม่ล้วน ร่วมกับนโยบาย `policy_allow_new` ระบบจะ **Auto-Evolve** อัตโนมัติ
    * **Missing Columns**: เติมค่า `NULL` อัตโนมัติ พร้อมส่งแจ้งเตือนระดับวิกฤตผ่าน `send_n8n_alert` (Slack / LINE Notify)
    * **Type Mismatch**: แคสต์เป็น String ป้องกันไปป์ไลน์หยุดชะงัก
  * **Semantic Privacy Guardrail**: ตรวจจับธง PII ภาษาไทย-อังกฤษ เพื่อกันคอลัมน์ออกจากการส่งออก CSV และการประมวลผลของ LLM

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ Ingest Sources ] ──( SHA-256 / Allowlist Check )──► [ HDFS /data/raw/ ]
                                                              │
                                                              ▼
                                                   [ Schema Drift Gate ]
                                                ┌─────────────┴─────────────┐
                                                ▼                           ▼
                                    ( Only New Columns )         ( Missing / Mismatch )
                                                │                           │
                                                ▼                           ▼
                                      [ Auto-Evolve Schema ]      [ Auto-Fill NULL + Alert ]
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"ในเลเยอร์ที่ 1 และ 2 DataServe ให้ความสำคัญกับความปลอดภัยตั้งแต่ก้าวแรกครับ การรับไฟล์ CSV หรือ Excel มีการตรวจ SHA-256 Checksum ป้องกันการนำเข้าซ้ำ และตรวจคีย์หลักก่อนส่งเข้า HDFS ฝั่งฐานข้อมูลเราล็อกคำสั่งให้เป็น SELECT แบบอ่านอย่างเดียว และฝั่ง API เราจำกัดเฉพาะโดเมนปลอดภัยใน Allowlist 

เมื่อข้อมูลเข้าสู่โซน Bronze บน HDFS จะต้องผ่านด่านตรวจ Schema Drift ซึ่งมีตรรกะแยกแยะความเสี่ยงอย่างละเอียด หากเป็นเพียงคอลัมน์ใหม่ที่ปลอดภัย ระบบจะทำการ Auto-Evolve โครงสร้างตารางให้อัตโนมัติ แต่หากมีคอลัมน์หลักสูญหาย ระบบจะเยียวยาด้วยการเติมค่า NULL เพื่อให้ไปป์ไลน์เดินหน้าต่อได้ พร้อมยิงแจ้งเตือนระดับวิกฤตไปยัง Slack หรือ Webhook ทันที นอกจากนี้ Semantic Layer ยังตั้งธง PII เพื่อปกป้องข้อมูลส่วนบุคคลไม่ให้หลุดไปยัง LLM ภายนอกครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/api/app/api/pipeline.py:315-333` (`ingest_csv`), `:274-285` (Checksum & PK check)
* `services/api/app/api/ingest_guards.py:22-37` (`API_INGEST_ALLOWED_HOSTS`), `:54-72` (`validate_select_only`)
* `services/spark/sdoqap/stages/schema.py:100-208` (Drift severity $+1/+5/+5$ และ Auto-Evolution Gate)

---

## Slide 4: เลเยอร์ที่ 3: สถาปัตยกรรมเอนจินคู่ (Dual-Engine Architecture)

### ประเด็นสำคัญ (Key Message)
DataServe แยกบทบาทการทำงานระหว่างการวิเคราะห์แนะนำกฎเชิงโต้ตอบที่ต้องตอบสนองทันทีบนหน้าเว็บ ออกจากการประมวลผลขนาดใหญ่แบบกระจายศูนย์บนคลัสเตอร์ Spark อย่างชัดเจน

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Dual-Engine Architecture: Interactive Whitebox vs. Distributed Spark
* **ตารางเปรียบเทียบเอนจินคู่ (Dual-Engine Comparison Matrix)**:

| คุณสมบัติ | 1. Interactive Whitebox Engine | 2. Distributed Spark Batch Engine |
| :--- | :--- | :--- |
| **เทคโนโลยีหลัก** | FastAPI, Python 3.10, Pandas | Apache Spark 3.4.1 (Bitnami Image) |
| **รูปแบบการประมวลผล** | Synchronous In-Memory Profiling | Distributed Batch Compute (Master-Worker) |
| **จุดเชื่อมต่อหลัก** | `/api/v1/whitebox/*`, `/rules` | Spark Trigger Daemon (พอร์ต `8099`) |
| **เป้าหมายทางวิศวกรรม** | การตอบสนองทันทีบนหน้าพอร์ทัล (Zero-Wait) | การประมวลผลชุดข้อมูลขนาดใหญ่ระดับล้านแถว |
| **หน้าที่เฉพาะ** | แนะนำกฎ 3 มิติ และตรวจความสัมพันธ์ข้ามตาราง | ดำเนินการ 21 Stages, คัดแยกแถว และเขียน Delta Lake |

* **3 มิติของกฎที่ Whitebox Engine แนะนำ**:
  1. **Completeness Guardrail**: แนะนำเกณฑ์ห้ามเป็นค่าว่าง สำหรับคอลัมน์ที่มีอัตราความสมบูรณ์สูง
  2. **Non-Negative / Domain Range**: แนะนำเกณฑ์ค่าต้องไม่ติดลบ (`>= 0`) สำหรับตัวเลขทางการเงินและปริมาณ
  3. **Outlier Boundary (Tukey IQR)**: แสดงสถิติผิดปกติด้วยช่วง $1.5 \times \text{IQR}$ และแนะนำกฎ `auto_iqr` ที่ตัวคูณ $3.0 \times \text{IQR}$ (Tukey Outer Fence)
* **แถบสรุปท้ายสไลด์**: "เร็วเมื่อต้องโต้ตอบกับมนุษย์ หนักแน่นเมื่อต้องจัดการบิ๊กดาต้าบนคลัสเตอร์"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
                                  ┌──────────────────────────────────────────────────────────┐
                                  │                 DUAL-ENGINE ARCHITECTURE                 │
                                  └────────────────────────────┬─────────────────────────────┘
                                                               │
                         ┌─────────────────────────────────────┴─────────────────────────────────────┐
                         ▼                                                                           ▼
       [ Interactive Whitebox Engine ]                                             [ Distributed Spark Engine ]
       • FastAPI + Pandas (In-Memory)                                              • Apache Spark 3.4.1 Cluster
       • Zero-Wait Rule Recommendation                                             • 21-Stage Batch Execution
       • 3 Rule Types: Completeness, >=0, IQR                                      • Row-Level Quarantine Assembly
       • Multi-Table Referential Integrity                                         • Delta Lake Active/Quarantine Write
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"หนึ่งในความโดดเด่นทางสถาปัตยกรรมของ DataServe คือสถาปัตยกรรมเอนจินคู่ หรือ Dual-Engine ครับ เราตระหนักดีว่าการให้ผู้ใช้รอกระบวนการ Spark Submit เพียงเพื่อดูสถิติหรือสร้างกฎบนหน้าเว็บ จะทำให้ประสบการณ์การใช้งานช้าเกินไป 

เราจึงออกแบบให้มี Interactive Whitebox Engine รันอยู่บน FastAPI ด้วย Pandas ดึงข้อมูลตัวอย่างมาคำนวณสถิติเชิงพรรณนา และสร้างการ์ดแนะนำกฎคุณภาพข้อมูล 3 ด้านทันที ได้แก่ กฎความสมบูรณ์ห้ามเป็นค่าว่าง, กฎตัวเลขต้องไม่ติดลบ, และกฎ Outlier ด้วยวิธี Tukey IQR โดยนำเสนอที่ $3.0 \times \text{IQR}$ เพื่อดักจับค่าหลุดโลกที่ชัดเจน พร้อมรองรับการตรวจ Foreign Key ข้ามตาราง และเมื่อผู้ใช้กำหนดกฎเรียบร้อย กฎเหล่านั้นจะถูกส่งต่อไปให้ Distributed Spark Engine ทำหน้าที่รันแบตช์ขนาดใหญ่บนคลัสเตอร์แบบกระจายศูนย์ครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/api/app/api/whitebox.py:515-576` (สร้างข้อเสนอกฎ Completeness, Non-Negative, และ Tukey $3.0 \times \text{IQR}$)
* `services/spark/spark_quality_engine.py` (รันบน Spark Cluster Master-Worker)

---

## Slide 5: เจาะลึกกระบวนการประมวลผล 21 Stages บน Spark Cluster

### ประเด็นสำคัญ (Key Message)
ไปป์ไลน์ของ Spark ดำเนินการตามแผนงาน 21 Stages ที่เคร่งครัด แบ่งเป็น 3 ช่วงการทำงาน ครอบคลุมการจัดระเบียบโครงสร้าง การล้างข้อมูล การตรวจจับความผิดปกติเชิงสถิติ และการวิเคราะห์ผลลัพธ์รอบด้าน

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Spark Distributed Compute: The 21-Stage Quality Pipeline
* **โครงสร้างการประมวลผล 21 Stages ตามแผนงาน (`plan.py`)**:
  * **ช่วงที่ 1: Align (1 Stage)**:
    - `schema_align`: ปรับชื่อคอลัมน์และโครงสร้างพื้นฐานให้ตรงกับข้อกำหนด
  * **ช่วงที่ 2: Transform & Cleanse (12 Stages)**:
    - โครงสร้างและข้อมูลซ้ำ: `schema_drift`, `auto_clean`, `validation`, `dedup`
    - มาตรฐานข้อมูล: `standardize_dates` (แปลง พ.ศ. เป็น ค.ศ.), `standardize_categories`
    - กฎธุรกิจและสถิติ: `range_rules`, `anomaly_iqr` ($1.5 \times \text{IQR}$), `anomaly_zscore` ($3\sigma$), `anomaly_induced` (Decision Tree)
    - รวบรวมและกรอง: `quarantine_assembly` (สร้าง `reject_reason`), `column_filter`
  * **ช่วงที่ 3: Post-Load & Analytics (8 Stages)**:
    - สถิติและการเงิน: `distribution`, `quarantine_breakdown`, `copdq` (คำนวณมูลค่าสูญเสีย)
    - ความสดและคะแนน: `freshness`, `quality_score` (เทียบประวัติในอดีต)
    - ปัญญาประดิษฐ์และรายงาน: `ai_advisory` (สร้างตั๋วงานต้นทาง), `operational_impact`, `report`
* **พารามิเตอร์คลัสเตอร์**: กำหนด `spark.sql.shuffle.partitions=200` คงที่เพื่อรองรับการประมวลผลแบบขนาน

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ ALIGN (1) ] ────────► [ TRANSFORM & CLEANSE (12) ] ────────► [ POST-LOAD & ANALYTICS (8) ]
• schema_align          • schema_drift   • range_rules         • distribution    • quality_score
                        • auto_clean     • anomaly_iqr         • quarantine_bd   • ai_advisory
                        • validation     • anomaly_zscore      • copdq           • op_impact
                        • dedup          • anomaly_induced     • freshness       • report
                        • std_dates      • quarantine_assembly
                        • std_categories • column_filter
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"เมื่อข้อมูลเข้าสู่ Spark Cluster กระบวนการทำงานจะถูกควบคุมด้วยแผนการทำงาน 21 Stages อย่างเคร่งครัดตามที่กำหนดไว้ในไฟล์ `plan.py` ครับ โดยแบ่งออกเป็น 3 ช่วง: 

ช่วงแรกคือ Align มี 1 Stage ปรับโครงสร้างพื้นฐาน ช่วงที่สองคือ Transform มี 12 Stages ตั้งแต่การตัดช่องว่าง ลบข้อมูลซ้ำ การปรับมาตรฐานวันที่ พ.ศ. เป็น ค.ศ. ไปจนถึงการตรวจจับค่าผิดปกติด้วยสถิติ ทั้ง Tukey IQR 1.5 เท่า, Z-Score 3 ซิกม่า และกฎที่เรียนรู้จาก Decision Tree ก่อนจะประกอบแถวเสียเข้าสู่ Quarantine Assembly และช่วงสุดท้ายคือ Post-Load มี 8 Stages ทำหน้าที่คำนวณมูลค่าความเสียหายทางการเงิน COPDQ, ประเมินความสดใหม่, คำนวณคะแนนคุณภาพรวม และส่งตัวอย่างแถวเสียให้โมเดล AI วิเคราะห์สาเหตุเพื่อสร้างตั๋วแก้ไขปัญหาต่อไปครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/sdoqap/pipeline/plan.py:1-7` (นิยาม ALIGN, TRANSFORM, POST_LOAD รวม 21 stages)
* `services/spark/spark_quality_engine.py:1693-1775` (การเรียก `run_stages` ตามลำดับ)

---

## Slide 6: เลเยอร์ที่ 4: สถาปัตยกรรมจัดเก็บข้อมูล Silver Dual-Zone บน Delta Lake

### ประเด็นสำคัญ (Key Message)
DataServe ไม่ทิ้งข้อมูลเสียและไม่ยอมให้ข้อมูลเสียปนเปื้อนข้อมูลดี โดยจัดเก็บข้อมูลลงบน Delta Lake ทั้งสองโซนอย่างเป็นเอกเทศ รับประกันความเป็นกรด (ACID) และการรันซ้ำได้ผลลัพธ์คงเดิม (Idempotency)

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Silver Medallion Dual-Zone Storage: Active vs. Quarantine
* **Active Store (Clean Silver Zone)**:
  * **ตำแหน่งและเทคโนโลยี**: `/data/active/<table_name>/` จัดเก็บบน **Delta Lake**
  * **การเขียนข้อมูล**: ใช้คำสั่ง **`MERGE INTO` (Upsert)** ตาม Primary Key
  * **คุณสมบัติทางวิศวกรรม**: รองรับ ACID Transactions ป้องกันข้อมูลชนกัน, มีคุณสมบัติ Idempotency รันซ้ำกี่ครั้งก็ได้ผลถูกต้องเท่าเดิม ไม่เกิดแถวเบิ้ล, เป็นแหล่งข้อมูลสะอาดสำหรับ BI และ AI
* **Quarantine Store (Error Isolation Zone)**:
  * **ตำแหน่งและเทคโนโลยี**: `/data/quarantine/<table_name>/` จัดเก็บบน **Delta Lake** (ไม่ใช่ไฟล์ CSV)
  * **การเขียนข้อมูล**: มีระบบลบข้อมูลเดิมของ `ingest_id` ออกก่อนทำการ Append ใหม่ ป้องกันแถวกักกันซ้ำซ้อน
  * **เมทาดาต้ากำกับแถวเสีย**: เก็บข้อมูลเดิมครบทุกคอลัมน์ พร้อมฟิลด์ `run_id`, `ingest_id`, และ `reject_reason` (เชื่อมหลายสาเหตุด้วย `; `)
* **สมดุลการกระทบยอดข้อมูล (Volume Reconciliation Invariant)**:
  $$\text{Inbound Volume} = \text{Active Rows} + \text{Quarantined Rows} + \text{Pre-Clean Duplicate Rows}$$
  เป็นเป้าหมายทางวิศวกรรมที่ใช้ตรวจสอบใน Stage `quarantine_breakdown` เพื่อความโปร่งใส

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
                                        [ Validated Clean Rows ] ──► MERGE INTO ──► [ Active Store (Delta Lake) ]
                                                   ▲                                  • ACID Transactions
                                                   │                                  • True Idempotent Upsert
[ 21-Stage Spark Quality Engine ] ─────────────────┤
                                                   │
                                                   ▼
                                       [ Quarantined Bad Rows ]  ──► Append    ──► [ Quarantine Store (Delta) ]
                                                                                      • Partitioned by run_id
                                                                                      • Delete-before-append
                                                                                      • reject_reason tag (; )
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"ในเลเยอร์ที่ 4 คือหัวใจของการปกป้องข้อมูลครับ ข้อมูลที่ผ่านการตรวจสอบจะถูกแยกทางเดินอย่างเด็ดขาด แถวที่สะอาดสมบูรณ์จะเข้าสู่ Active Store บน Delta Lake โดยใช้คำสั่ง MERGE INTO ตาม Primary Key ซึ่งการันตี ACID Transactions และความเป็น Idempotent อย่างแท้จริง รันซ้ำกี่ครั้งข้อมูลก็ไม่เบิ้ลซ้ำ 

ส่วนแถวที่มีข้อผิดพลาด ไม่ว่าจะผิดช่วงค่า มีค่าว่าง หรือเป็น Outlier จะถูกส่งเข้า Quarantine Store ซึ่งจัดเก็บบน Delta Lake เช่นกัน โดยระบบจะลบข้อมูลเก่าของรอบนั้นออกก่อนเขียนใหม่ เพื่อป้องกันการสะสมข้อมูลกักกันซ้ำซ้อน แถวเสียทุกแถวจะคงค่าดั้งเดิมไว้ครบถ้วน พร้อมระบุสาเหตุในฟิลด์ reject_reason ทำให้ทีมงานสามารถตรวจสอบย้อนกลับและกระทบยอดปริมาณข้อมูลเข้าและออกได้อย่างโปร่งใสทุกประการครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/spark_quality_engine.py:1718-1730` (`DeltaTable.alias("old").merge(...)`)
* `services/spark/spark_quality_engine.py:1705-1712` (Quarantine delete-before-append บน Delta Lake)
* `services/spark/sdoqap/stages/cleansing.py:70-72` (การเชื่อมข้อความ `reject_reason` ด้วย `; `)

---

## Slide 7: เลเยอร์ที่ 5 & 6: การสังเกตการณ์ การให้บริการ API และการควบคุมความเสี่ยง

### ประเด็นสำคัญ (Key Message)
การแปลงข้อมูลเชิงปฏิบัติการให้เป็นดัชนีชี้วัดที่สืบค้นได้แบบมิลลิวินาทีบน Elasticsearch พร้อมโครงสร้างการให้บริการ API ที่จับคู่สายงานธุรกิจและระบบตรวจสอบความน่าเชื่อถือของข้อมูล (Trust-Check)

### เนื้อหาบนสไลด์ (Slide Content)
* **Layer 5: Gold Observability & Telemetry (Elasticsearch 8.10.2)**:
  * จัดเก็บดัชนีชี้วัดหลัก:
    * `sdoqap_quality_runs`: สถิติการตรวจรายรอบ, อัตรากักกัน, คะแนนคุณภาพ, และเวลาแต่ละ Stage
    * `sdoqap_pipeline_runs`: เวลาการทำงาน, ความหน่วง (Latency), และสถานะ SLA
    * `sdoqap_upstream_remediations`: รายการตั๋วงานแก้ไขข้อมูลต้นทาง
    * `sdoqap_schema_proposals`: ประวัติข้อเสนอและการอนุมัติโครงสร้างตาราง
  * **Observability UIs**: Kibana (พอร์ต 5601) สำหรับสืบค้น Log และ Grafana (พอร์ต 3002) สำหรับกราฟ Time-Series
* **Layer 6: FastAPI Serving & Domain Mapping Architecture**:
  * รันบน Python 3.10 ผ่านพอร์ต `8002` (ภายนอก) / `8000` (ภายใน)
  * โครงสร้าง `AREA_TABLE_MAPPING`: แมปตารางเข้ากับ 5 สายงานธุรกิจ (`sales`, `customer`, `operations`, `reporting`, `finance`) รองรับการกรอง `business_area`
* **Trust-Check Gate API (`GET /api/v1/lineage/{table_name}/trust-check`)**:
  * ด่านตรวจความพร้อมใช้งานสำหรับระบบปลายทาง โดยประเมิน 3 ปัจจัย:
    1. คะแนนคุณภาพรอบล่าสุดผ่านเกณฑ์ที่กำหนด
    2. ไม่มี Schema Proposal สถานะ `PENDING` ค้างอยู่
    3. การตรวจสอบความสมบูรณ์ของ Schema สำเร็จ
  * ตอบกลับสถานะ `is_safe_to_consume` พร้อมคำแนะนำการใช้งานเชิงคุณภาพ

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ Spark Engine Telemetry ] ──► [ Elasticsearch 8.10.2 ] ──┬──► Kibana :5601 (Log Search)
                                                          ├──► Grafana :3002 (Metrics)
                                                          └──► FastAPI :8002
                                                                   │
                                        ┌──────────────────────────┴──────────────────────────┐
                                        ▼                                                     ▼
                            [ 5-Domain Area Mapping ]                             [ Trust-Check Gate API ]
                            sales · customer · operations                         is_safe_to_consume (T/F)
                            reporting · finance                                   Advisory Gate for Consumers
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"ในเลเยอร์ที่ 5 และ 6 คือส่วนของการนำสถิติมาสร้างการมองเห็นและการให้บริการครับ เมทาดาต้าและตัวชี้วัดทั้งหมดจะถูกจัดเก็บเข้า Elasticsearch 8.10.2 แบบเรียลไทม์ ทำให้วิศวกรสามารถค้นหา Log บน Kibana หรือดู Throughput บน Grafana ได้ทันที 

ฝั่งหลังบ้านพัฒนาด้วย FastAPI มีการจัดกลุ่มตารางเข้ากับ 5 สายงานธุรกิจหลัก เพื่อให้แดชบอร์ดสามารถกรองดูตามแผนกได้ และเรายังมี Trust-Check API ให้บริการที่ `/api/v1/lineage/{table_name}/trust-check` ทำหน้าที่เป็นเกราะป้องกันเชิงคุณภาพให้ระบบปลายทาง ไม่ว่าจะเป็นระบบ BI หรือบริการ AI ภายนอก โดยระบบจะตรวจทั้งคะแนนคุณภาพและสถานะการปรับโครงสร้างตาราง เพื่อยืนยันว่าตารางนั้นปลอดภัยและพร้อมให้นำไปใช้งานต่อหรือไม่ครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/api/app/api/analytics.py:32-38` (`AREA_TABLE_MAPPING` 5 กลุ่มธุรกิจ)
* `services/api/app/api/lineage.py:340-395` (`GET /{table_name}/trust-check`)

---

## Slide 8: เอนจินประเมินความเสียหายทางการเงินจากข้อมูลด้อยคุณภาพ (3D COPDQ Engine)

### ประเด็นสำคัญ (Key Message)
DataServe แปลงปัญหาทางเทคนิค (เช่น ข้อมูลหาย หลุดช่วงค่า หรือ Schema เพี้ยน) ให้กลายเป็นตัวเลขความเสียหายทางการเงินและต้นทุนการจัดการที่ฝ่ายบริหารเข้าใจและประเมินผลกระทบได้ทันที

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Dynamic COPDQ Engine: Cost of Poor Data Quality
* **สูตรประเมินความเสียหายทางการเงิน 3 มิติ (3D COPDQ Model)**:
  $$\text{Total Financial Impact (USD)} = C_{\text{correction}} + C_{\text{opportunity}} + C_{\text{risk}}$$
  1. **Cost of Correction ($C_{\text{correction}}$)**:
     - ต้นทุนวิศวกรรมในการแก้ไขและประมวลผลข้อมูลใหม่ คิดคงที่ $\$2.00$ ต่อแถวกักกัน:
     $$C_{\text{correction}} = \text{quarantined\_records} \times 2.0$$
  2. **Cost of Lost Opportunities ($C_{\text{opportunity}}$)**:
     - มูลค่าทางการเงินจริงของแถวที่ติดกักกัน (`quarantined_financial_value`) ที่ Spark สรุปมาจากคอลัมน์การเงิน เช่น `total_sales`, `price`, หรือ `amount` (หากไม่มี ใช้โมเดลสำรอง $5\% \times \$50$):
     $$C_{\text{opportunity}} = \sum \text{Quarantined Monetary Values}$$
  3. **Cost of Risk & Compliance ($C_{\text{risk}}$)**:
     - มูลค่าความเสี่ยงจากการเปลี่ยนแปลงโครงสร้างตาราง โดยนำจำนวนแถวกักกันคูณด้วย `drift_severity`:
     $$C_{\text{risk}} = \text{quarantined\_records} \times \text{drift\_severity}$$
* **Gartner TCO Operational Waste Mode**:
  - ในการกระทบยอดปริมาณข้อมูล (`sell_in_out_reconciliation`) หากไม่มีคอลัมน์การเงิน ระบบจะคิดต้นทุนสูญเปล่าด้านการประมวลผลที่ $\$2.50$ ต่อแถว
* **การแสดงผลค่าเงิน**: คำนวณเป็นดอลลาร์สหรัฐ (USD) เป็นหลัก และแปลงแสดงผลเป็นเงินบาท (THB) ด้วยอัตราคงที่ 36.5 THB/USD

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 TOTAL COPDQ IMPACT                                     │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ 1. Cost of Correction    │ 2. Cost of Lost Opportunity │ 3. Cost of Risk & Compliance  │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ $2.00 × Quarantined Rows │ Actual Quarantined Sales    │ Quarantined Rows × Severity   │
│ ต้นทุนแรงงานและรันซ้ำ    │ มูลค่ายอดขายที่ถูกกักกันจริง│ ความเสี่ยงโครงสร้างตารางเพี้ยน│
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"หนึ่งในความท้าทายของงาน Data Quality คือ ฝ่ายบริหารมักไม่เห็นภาพว่า 'คะแนนตกเหลือ 70%' ส่งผลกระทบอย่างไร DataServe จึงพัฒนาเอนจินประเมินความเสียหายทางการเงิน หรือ COPDQ เข้ามาตอบโจทย์นี้ครับ 

ระบบแจกแจงความเสียหายออกเป็น 3 มิติ: มิติแรกคือต้นทุนการแก้ไข คิดที่ 2 ดอลลาร์ต่อแถว มิติที่สองคือโอกาสทางธุรกิจที่สูญเสียไป โดย Spark จะไปดึงผลรวมยอดขายจริงจากแถวที่ติดกักกันขึ้นมาคำนวณ เช่น หากออเดอร์มูลค่า 10,000 ดอลลาร์ติดกักกัน ยอดนี้จะถูกนับเป็นความเสี่ยงทางรายได้ทันที และมิติที่สามคือความเสี่ยงของโครงสร้างข้อมูล โดยนำแถวเสียไปคูณกับระดับความรุนแรงของ Schema Drift ทำให้ผู้บริหารและทีมธุรกิจเข้าใจตรงกันว่าความล่าช้าหรือข้อผิดพลาดนี้ คิดเป็นมูลค่าความเสียหายเท่าใดในเชิงธุรกิจครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/api/app/api/analytics.py:704-726` (สูตรคำนวณ $C_{\text{correction}} + C_{\text{opportunity}} + C_{\text{risk}}$)
* `services/api/app/api/analytics.py:1050` (Operational Waste $\$2.50$ ต่อแถว)
* `services/ui/src/utils/currency.js:14` (อัตราแลกเปลี่ยนคงที่ 36.5 THB/USD)

---

## Slide 9: เลเยอร์ที่ 7 & 8: พอร์ทัลกลางและวงจรปิดแก้ไขปัญหาถึงต้นน้ำ (Central Portal & Closed-Loop Healing)

### ประเด็นสำคัญ (Key Message)
การนำเสนอข้อมูลบนหน้าจอที่ซิงก์สถานะสองทางแบบไร้ความหน่วง พร้อมวงจรปิด Closed-Loop ที่เปลี่ยนแถวเสียให้เป็นตั๋วงานเชิงรุก และสั่งรันข้อมูลซ้ำใหม่อัตโนมัติเมื่อวิศวกรกด Resolve

### เนื้อหาบนสไลด์ (Slide Content)
* **Layer 7: Central Portal UI Layer (React 18 & Zustand)**:
  * พัฒนาด้วย React 18, Vite 5, Zustand Store และชุดกราฟ ECharts
  * **4 มุมมองหลัก**: Executive (ตัวชี้วัดภาพรวม), Business (การกระทบยอดและ COPDQ), Quality (ประวัติรันและกฎ), และ Dashboard Builder (ออกแบบรายงาน)
  * **Two-Way State Synchronization**: คลิกการ์ดแผนกจะซิงก์ตัวแปร `selectedAreaFilter` ใน Zustand Store กรองข้อมูลทั้งหน้าจอพร้อมกันโดยไม่ต้องรีโหลด
  * **Real-Time Stream Flow Simulation**: คอมโพเนนต์ `DataFlowStreamChart.jsx` จำลองสัญญาณ Throughput $1,150 - 1,800$ แถวต่อวินาที เพื่อสาธิตพลวัตของข้อมูลสด
* **Layer 8: Closed-Loop Upstream Remediation Flow**:
  1. **ตรวจพบและสร้างตั๋ว**: Stage `ai_advisory` วิเคราะห์แถวกักกัน และสร้างตั๋วงานลง `sdoqap_upstream_remediations` ระบุ `target_system` และ `remediation_action`
  2. **วิศวกรแก้ไขที่ต้นทาง**: ทีมงานต้นน้ำปรับแก้ข้อผิดพลาดตามคำแนะนำ
  3. **สั่งรันซ้ำอัตโนมัติ (Automated Trigger)**:
     - เมื่อวิศวกรกดปุ่ม **Resolve** บนหน้าเว็บ ระบบเรียก `POST /api/v1/system/remediations/{ticket_id}/resolve`
     - API เปลี่ยนสถานะเป็น `RESOLVED` และส่งคำสั่งต่อทันทีไปยัง `POST http://spark-master:8099/retry`
     - Spark Trigger Daemon รับงานเข้าคิว FIFO และสั่งประมวลผลตารางนั้นใหม่อัตโนมัติ โดยหน้าเว็บจะแสดงผลยืนยันทันที

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ Spark Engine ตรวจพบแถวเสีย ] ──► [ AI สร้าง Ticket ระบุ target_system & action ]
                                                        │
                                                        ▼
[ วิศวกรกดปุ่ม "Resolve" ] ◄── [ วิศวกรแก้ไขปัญหาที่ระบบต้นทางสำเร็จ ]
            │
            ▼
[ FastAPI: ปรับสถานะ RESOLVED ] ──► [ POST http://spark-master:8099/retry ]
                                                        │
                                                        ▼
                                      [ Spark คลัสเตอร์เริ่มรันตารางใหม่ทันที ]
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"ในเลเยอร์ที่ 7 และ 8 คือจุดสิ้นสุดและจุดเริ่มต้นใหม่ของวงจรข้อมูลครับ หน้าเว็บพอร์ทัลของเราใช้ React 18 และ Zustand Store ทำให้เมื่อผู้ใช้คลิกเลือกแผนกใด ข้อมูลทั้งหน้าจอจะกรองตามแผนกนั้นทันทีโดยไม่ต้องโหลดหน้าเว็บใหม่ 

และที่สำคัญที่สุดคือเลเยอร์ที่ 8 วงจรปิด Closed-Loop ครับ เมื่อ Spark พบแถวเสีย ระบบจะไม่เพียงแค่เก็บไว้ แต่จะวิเคราะห์และสร้างตั๋วงานระบุระบบต้นทางและวิธีแก้ให้วิศวกรเข้าไปจัดการ เมื่อวิศวกรแก้เสร็จแล้วกลับมากดปุ่ม Resolve บนพอร์ทัล ระบบหลังบ้านจะยิงคำขอตรงไปยัง Spark Trigger Daemon ที่พอร์ต 8099 ทันที เพื่อสั่งให้คลัสเตอร์ดึงข้อมูลมาประมวลผลใหม่โดยอัตโนมัติ ทำให้วงจรการแก้ไขปัญหาข้อมูลจบลงได้อย่างสมบูรณ์แบบโดยไม่ต้องสั่งรันมือครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/ui/src/store/useDashboardStore.js:10-17` (`selectedAreaFilter` Zustand State)
* `services/ui/src/components/DataFlowStreamChart.jsx:138` (จำลองสตรีมมิ่ง $1,150 - 1,800$ แถว/วินาที)
* `services/api/app/api/system.py:480-525` (`resolve_remediation_ticket` เรียก daemon `:8099/retry`)

---

## Slide 10: ข้อมูลจำเพาะทางเทคนิค มาตรการความปลอดภัย และความโปร่งใสทางวิศวกรรม

### ประเด็นสำคัญ (Key Message)
DataServe สร้างขึ้นบนโครงสร้างพื้นฐาน 14 เซอร์วิสที่มีมาตรการความปลอดภัยเชิงลึก และยึดมั่นในความโปร่งใสทางวิศวกรรมด้วยการระบุขอบเขตและข้อจำกัดของระบบตามข้อเท็จจริงในโค้ดจริง

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Technical Specifications, Security Invariants & Code Parity
* **ตารางสรุปโครงสร้างพื้นฐานและพอร์ต (Technical Port Matrix)**:
  * `sdoqap-nginx`: Reverse Proxy & Web Gateway (พอร์ต `80:80`)
  * `sdoqap-api`: FastAPI Serving & Whitebox Engine (พอร์ต `${API_PORT:-8002}:8000`)
  * `sdoqap-spark-master`: Spark Cluster Master, Web UI & Trigger Daemon (พอร์ต `7077`, `8081`, `8099`)
  * `sdoqap-namenode` & `datanode`: HDFS Storage (พอร์ต `9870`, `9002` และ DataNode รันเฉพาะใน Docker)
  * `sdoqap-elasticsearch`: Telemetry Store (พอร์ต `9200`) และ Kibana (`5601`) / Grafana (`3002`)
* **มาตรการความปลอดภัยและคุณสมบัติทางวิศวกรรม (Security Invariants)**:
  * **Zero Silent Failure & Idempotency**: รับประกันข้อมูลไม่สูญหายและไม่เกิดแถวซ้ำด้วย Delta Lake `MERGE INTO`
  * **Data Privacy Guardrails**: ตัดคอลัมน์ PII ออกจากการส่งออก และแทนค่าข้อมูลระบุตัวตนด้วย `<redacted>` ก่อนส่งให้ LLM
  * **API Protection**: บังคับใช้ Session Cookie สำหรับการส่งออกข้อมูลระดับแถว, `X-Service-Key` สำหรับ n8n, และ `X-Trigger-Secret` สำหรับ Trigger Daemon
* **ความโปร่งใสทางวิศวกรรม (Code Parity & Honest Bounding)**:
  * ระบุชัดเจนเรื่องการจำลองสตรีมมิ่งบนหน้าเว็บด้วย `Math.random()` เพื่อสาธิตระบบ
  * รับทราบข้อจำกัดเรื่องการยุติบริการของ LINE Notify ตั้งแต่ มี.ค. 2025 และการไม่มี Microsoft Teams ในระบบ
  * ล้อมกรอบการทดสอบเฉพาะกรณีที่ตรวจสอบและยืนยันผลกับโค้ดจริงใน Repository แล้วเท่านั้น

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         ENTERPRISE ENGINEERING INVARIANTS                              │
├─────────────────────────┬────────────────────────────┬─────────────────────────────────┤
│ 1. ACID & Idempotency   │ 2. Data Privacy Guardrails │ 3. Defense-in-Depth Security    │
├─────────────────────────┼────────────────────────────┼─────────────────────────────────┤
│ • Delta Lake MERGE INTO │ • Column Exclusion for PII │ • Session Cookie for Data Export│
│ • No Duplicate Rows     │ • <redacted> for LLM Prompts│ • X-Trigger-Secret for Daemon   │
│ • Idempotent Quarantine │ • CSV Auto-strip PII Fields│ • Fail-Closed Network Whitelist │
└─────────────────────────┴────────────────────────────┴─────────────────────────────────┘
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"สุดท้ายนี้ DataServe ดำเนินงานบนโครงสร้างพื้นฐานระดับโปรดักชันที่มีมาตรการความปลอดภัยเข้มงวดครับ ทุกจุดเชื่อมต่อมีระบบรักษาความปลอดภัยแบบหลายชั้น ทั้งการใช้ Session Cookie ควบคุมการดาวน์โหลดข้อมูลดิบ, การใช้ Secret Key ควบคุม Trigger Daemon, และการปิดบังค่า PII ด้วยคำว่า redacted เสมอก่อนส่งให้ AI 

และที่สำคัญที่สุด ทีมวิศวกรของเรายึดมั่นในความโปร่งใสทางวิศวกรรม เอกสารและสไลด์ชุดนี้เขียนขึ้นจากข้อเท็จจริงในซอร์สโค้ดจริง 100% ส่วนใดที่เป็นการจำลองหน้าจอ หรือส่วนใดที่มีข้อจำกัดทางเทคนิค เราได้ระบุไว้อย่างตรงไปตรงมา เพื่อให้มั่นใจว่า DataServe เป็นแพลตฟอร์มที่พร้อมใช้งานจริง และสามารถเป็นรากฐานที่น่าเชื่อถือที่สุดสำหรับสถาปัตยกรรมข้อมูลขององค์กรครับ ขอบคุณครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `docker-compose.yml` (พอร์ตและคอนฟิกคอนเทนเนอร์)
* `services/spark/ai_rule_advisor.py` (การแทนค่า `<redacted>` สำหรับข้อมูลระบุตัวตน)
* `SYSTEM_ARCHITECTURE_OVERVIEW_DEEP_DIVE.md` (หัวข้อ 3, 4, 5, และ 6)
