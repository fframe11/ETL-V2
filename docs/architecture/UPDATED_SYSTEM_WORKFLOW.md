# สถาปัตยกรรมและขั้นตอนการทำงานฉบับปรับปรุงใหม่ (SDOQAP Updated End-to-End Workflow)

**โครงการ**: SDOQAP (Smart Data Operations & Quality Assurance Platform)  
**เวอร์ชันเอกสาร**: 2.5 (Post-Business Impact & Governance Tickets Optimization)  
**วันที่ปรับปรุง**: 7 ตุลาคม 2569  
**สถานะการทำงาน**: ผ่านการทดสอบและใช้งานบน Production Cluster  

---

## 1. แผนภาพขั้นตอนการทำงานภาพรวม (End-to-End System Workflow Diagram)

แผนภาพนี้แสดงลำดับขั้นตอนการประมวลผล การกักแยกข้อมูล การวิเคราะห์ผลกระทบทางธุรกิจ (Dynamic Business Impact) และการส่งต่องานแก้ไขเชิงลึกไปยังทีมวิศวกรต้นน้ำ (Upstream Remediation Closed-Loop)

```mermaid
flowchart TD
    %% ==========================================
    %% STYLING AND THEME DEFINITIONS
    %% ==========================================
    classDef source fill:#f8fafc,stroke:#475569,stroke-width:1.5px,color:#0f172a;
    classDef ingest fill:#eff6ff,stroke:#2563eb,stroke-width:1.5px,color:#1e3a8a;
    classDef spark fill:#faf5ff,stroke:#7c3aed,stroke-width:2px,color:#581c87;
    classDef bronze fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f;
    classDef silverClean fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#064e3b;
    classDef silverQuar fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;
    classDef esIndex fill:#fdf4ff,stroke:#c026d3,stroke-width:1.5px,color:#701a75;
    classDef bizImpact fill:#fff1f2,stroke:#e11d48,stroke-width:2px,color:#881337;
    classDef uiLayer fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,color:#14532d;
    classDef actionLoop fill:#ecfeff,stroke:#0891b2,stroke-width:2px,color:#164e63;

    %% ------------------------------------------
    %% 1. INGESTION & TRIGGER
    %% ------------------------------------------
    subgraph S1 ["1. แหล่งข้อมูลและการนำเข้า (Ingestion & Trigger)"]
        CSV["📄 Local CSV Sources<br>(Transaction / Master)"]:::source
        API_Src["🌐 Upstream REST APIs<br>(Auth, CRM, ERP)"]:::source
        Stream_Src["📡 Kafka Stream Queue<br>(Real-time Events)"]:::source
        Daemon["⚡ Spark Trigger Daemon<br>(Port 8099 : Shared Secret)"]:::actionLoop
    end

    %% ------------------------------------------
    %% 2. BRONZE & PRE-FLIGHT CHECKS
    %% ------------------------------------------
    subgraph S2 ["2. เลเยอร์จัดเก็บดิบและตรวจสอบสเปก (Bronze & Pre-Flight Gate)"]
        HDFS_Raw[("📁 HDFS Raw Bronze Zone<br>/data/raw/<table\>/")]:::bronze
        Drift_Gate{"🔍 Schema Drift Gate<br>(เปรียบเทียบ registry.json)"}:::ingest
    end

    %% ------------------------------------------
    %% 3. SPARK COMPUTATION & SEGREGATION
    %% ------------------------------------------
    subgraph S3 ["3. เครื่องคำนวณและคัดแยกข้อมูล (Spark QA & Segregation Engine)"]
        Spark_Master["⚡ Apache Spark Master & Workers<br>(Distributed Compute)"]:::spark
        Q_Rules{"🚦 3-Layer Validation<br>1. Static PK/Null<br>2. Dynamic IQR/Z-Score<br>3. Induced Tree Rules"}:::spark
    end

    %% ------------------------------------------
    %% 4. SILVER STORAGE (MEDALLION)
    %% ------------------------------------------
    subgraph S4 ["4. เลเยอร์จัดเก็บมาตรฐาน (Silver Medallion Storage)"]
        Delta_Active[("🟢 Delta Lake Active Store<br>/data/active/<table\>/<br>(MERGE INTO / ACID)")]:::silverClean
        HDFS_Quar[("🔴 HDFS Quarantine Store<br>/data/quarantine/<table\>/<br>(บันทึก reject_reason & run_id)")]:::silverQuar
    end

    %% ------------------------------------------
    %% 5. OBSERVABILITY & METADATA (GOLD)
    %% ------------------------------------------
    subgraph S5 ["5. ดัชนีสังเกตการณ์และความเสี่ยง (Observability & Gold Indices)"]
        ES_Quality[("📊 sdoqap_quality_runs<br>(DQ Score, Ingest/Delivered)")]:::esIndex
        ES_Pipeline[("⏱️ sdoqap_pipeline_runs<br>(SLA Latency, Duration)")]:::esIndex
        ES_Remediation[("🎫 sdoqap_upstream_remediations<br>(target_system, action)")]:::esIndex
    end

    %% ------------------------------------------
    %% 6. DYNAMIC BUSINESS IMPACT ENGINE
    %% ------------------------------------------
    subgraph S6 ["6. เอนจินวิเคราะห์ผลกระทบธุรกิจ (Dynamic Business Impact Engine)"]
        Biz_Mapping["🔀 Domain Impact Resolver<br>(Sales, Customer, Supply, Reporting)"]:::bizImpact
        COPDQ_Calc["💰 COPDQ Financial Loss Breakdown<br>• Cost of Correction<br>• Cost of Lost Opportunities<br>• Cost of Risk & Compliance"]:::bizImpact
        Impact_Cascade["📊 Dynamic 4-Step Impact Flow<br>Issue → Data Impact → KPI Impact → Action"]:::bizImpact
    end

    %% ------------------------------------------
    %% 7. CENTRAL COCKPIT & GOVERNANCE UI
    %% ------------------------------------------
    subgraph S7 ["7. แผงควบคุมและธรรมาภิบาล (Central Portal Dashboard)"]
        Exec_Overview["👔 Executive Overview<br>(Health Score 96.35%, SLA 81.8%)"]:::uiLayer
        Biz_Dashboard["🏢 Business Impact View<br>• Synchronized Domain Cards<br>• Flow Reconciliation Chart"]:::uiLayer
        Gov_Tickets["🎫 Upstream Governance Tickets<br>• Open vs All Tabs<br>• Target System & Action Narrative"]:::uiLayer
        Domain_Sync{{"🔄 Two-Way Domain Filter<br>(useDashboardStore : selectedAreaFilter)"}}:::uiLayer
    end

    %% ------------------------------------------
    %% CONNECTIONS & FLOW LOGIC
    %% ------------------------------------------
    CSV & API_Src & Stream_Src -->|Batch / Stream Upload| HDFS_Raw
    Daemon -.->|Trigger Ingest Command| Spark_Master
    HDFS_Raw -->|Fetch Unprocessed Batches| Spark_Master
    
    Spark_Master --> Drift_Gate
    Drift_Gate -->|Safe Drift <= 4 / No Drift| Q_Rules
    Drift_Gate -->|Dangerous Drift > 4| ES_Remediation

    Q_Rules -->|Passed All Rules| Delta_Active
    Q_Rules -->|Failed Quality Criteria| HDFS_Quar

    Delta_Active & HDFS_Quar -->|Emit Metrics & Error Rows| Spark_Master
    Spark_Master -->|Index Run Telemetry| ES_Quality & ES_Pipeline
    HDFS_Quar -->|Extract Failure Patterns| ES_Remediation

    ES_Quality & ES_Pipeline & ES_Remediation --> Biz_Mapping
    Biz_Mapping --> COPDQ_Calc & Impact_Cascade

    COPDQ_Calc & Impact_Cascade --> Biz_Dashboard
    ES_Quality & ES_Pipeline --> Exec_Overview
    ES_Remediation --> Gov_Tickets

    Domain_Sync <-->|Two-Way Filter Sync| Exec_Overview & Biz_Dashboard & Gov_Tickets

    Gov_Tickets -->|Resolve Ticket & Alert Upstream| API_Src
    API_Src -.->|Apply Bug Fix / Schema Patch| Daemon
```

---

## 2. แผนผังวงจรปิดการแก้ไขปัญหาข้อมูลต้นน้ำ (Closed-Loop Upstream Remediation Flow)

ไดอะแกรมนี้แสดงขั้นตอนการตรวจจับความผิดปกติ การกระจายตั๋วงานที่มีคำแนะนำเชิงเทคนิค (Target System & Remediation Action) ไปยังวิศวกรต้นน้ำ และการสั่ง Re-run Pipeline แบบวงจรปิด

```mermaid
sequenceDiagram
    autonumber
    actor DE as 👨‍💻 Upstream Data Engineer
    participant UI as 💻 SDOQAP Dashboard (Business Impact)
    participant API as ⚡ FastAPI Backend
    participant ES as 🔍 Elasticsearch (Remediations Index)
    participant Spark as ⚡ Spark Master (Trigger Daemon : 8099)
    participant Lake as 🟢 Delta Lake (Silver Active Store)

    Note over Spark, Lake: 1. ตรวจพบข้อมูลชำรุดรายแถว (Quarantined Records)
    Spark->>ES: บันทึก Ticket (table_name, target_system, remediation_action, severity)
    
    Note over UI, API: 2. ผู้ใช้เข้าหน้า Business Impact & เลือกแผนกธุรกิจ
    UI->>API: GET /api/analytics/upstream-remediations?business_area=Customer
    API->>ES: Query open tickets matching domain datasets
    ES-->>API: คืนค่า tickets พร้อม target_system และ action
    API-->>UI: แสดงผล Open (1) / All (1) พร้อมป้าย Scope และ Action Narrative

    Note over UI, DE: 3. วิศวกรตรวจดูคำแนะนำและดำเนินการแก้ไขที่ต้นทาง
    UI-->>DE: "API sent duplicate registration events. Investigate idempotency key handling"
    DE->>DE: แก้ไขโค้ดที่ Upstream Auth API และปรับ Check Constraints
    
    Note over DE, UI: 4. ปิดบัตรงานและสั่งรันประมวลผลข้อมูลใหม่
    DE->>UI: คลิกปุ่ม "Resolve" บนบัตรงาน
    UI->>API: POST /api/system/remediations/{ticket_id}/resolve
    API->>ES: อัปเดตสถานะเป็น "RESOLVED"
    API->>Spark: POST http://spark-master:8099/trigger (พร้อม SHARED_SECRET)
    
    Note over Spark, Lake: 5. Pipeline ทำงานใหม่แบบอัตโนมัติ (Re-conciliation)
    Spark->>Lake: Re-ingest ข้อมูลต้นน้ำชุดใหม่ → ผ่านเกณฑ์เข้า Silver Active
    Spark->>ES: บันทึก Quality Run ใหม่ (Score ปรับขึ้นเป็น 100%)
    UI->>API: Auto Refetch (no-cache)
    API-->>UI: กราฟ Flow Reconciliation อัปเดตยอด Clean Records เพิ่มขึ้น
```

---

## 3. ขั้นตอนการดำเนินงานอย่างละเอียด (Detailed Workflow Steps)

### ขั้นที่ 1: การนำเข้าข้อมูลและการสตรีมสด (Ingestion & Stream Telemetry)
* ข้อมูลนำเข้าจาก 3 ช่องทางหลัก: แฟ้ม CSV ประจำวัน, Webhook/REST API จากระบบภายนอก (Auth API, ERP, CRM) และ Kafka Event Streams
* ระบบเชื่อมต่อกับ `DataFlowStreamChart` ซึ่งเป็น Real-Time Streaming Telemetry Flow บนหน้าเว็บ แสดงสถานะ Ingestion Beacon แบบสด
* **Spark Trigger Daemon**: ทำงานเป็น Background Service ที่พอร์ต `8099` ของคอนเทนเนอร์ `sdoqap-spark-master` เพื่อรับสัญญาณทริกเกอร์การประมวลผลทั้งแบบ Scheduled และ On-demand

### ขั้นที่ 2: การตรวจสอบโครงสร้างกลายพันธุ์ (Schema Drift Governance)
* ทุกแบตช์ข้อมูลจะถูกเปรียบเทียบกับ `schema_registry.json`
* **Auto-Evolution**: หากพบเฉพาะคอลัมน์ใหม่ที่ปลอดภัย (Severity Score $\le 4$) ระบบจะอัปเดตสเปกบนดิสก์และ Elasticsearch โดยอัตโนมัติ
* **Strict Gate**: หากพบคอลัมน์สำคัญขาดหาย หรือชนิดข้อมูลไม่ตรงกัน (Severity Score $> 4$) ระบบจะแปลงคอลัมน์เป็น String เพื่อรักษาการประมวลผลภาพรวม และสร้างบัตรงานแจ้งเตือนระดับ CRITICAL

### ขั้นที่ 3: เอนจินคัดแยกข้อมูลระดับแถว (Row-Level Segregation Engine)
* ข้อมูลวิ่งผ่านการตรวจสอบ 3 ชั้น:
  1. *Static Checks*: ตรวจสอบค่าว่างใน Primary Key และการตรวจจับข้อมูลซ้ำซ้อน (Deduplication)
  2. *Statistical & Dynamic Checks*: ตรวจจับความผิดปกติด้วยขอบเขต IQR (Interquartile Range) และ Z-Score Anomaly
  3. *Business Rule Constraints*: ตรวจสอบตามกฎเฉพาะของแต่ละชุดข้อมูล (เช่น เงื่อนไขรายได้, รหัสสถานะ)
* **การแยกพื้นที่จัดเก็บ (Medallion Storage)**:
  * **แถวที่สะอาด (Clean Records)**: เขียนเข้า Delta Lake Active Store ด้วยคำสั่ง `MERGE INTO` รองรับ ACID Transactions
  * **แถวที่ชำรุด (Quarantined Records)**: แยกบันทึกลง HDFS Quarantine Zone ทันที โดยแนบ `reject_reason` และ `run_id` เพื่อไม่ให้กระทบต่อตารางหลัก

### ขั้นที่ 4: เอนจินวิเคราะห์ผลกระทบทางธุรกิจ (Dynamic Business Impact Engine)
* ระบบนำ Incident ล่าสุดมาจำแนกตาม **Business Area**:
  * **Sales & Revenue**: เชื่อมโยงกับ `orders`, `transaction_records`
  * **Customer Insights**: เชื่อมโยงกับ `users`, `mbti`
  * **Supply Chain & Operations**: เชื่อมโยงกับ `products`, `dirty_dataset`
  * **Executive Reporting**: เชื่อมโยงกับ `customers`, `users`
* คำนวณความสูญเสียทางการเงิน **COPDQ (Cost of Poor Data Quality)** แบบ 3 มิติ:
  $$\text{Total COPDQ} = \text{Cost of Correction} + \text{Cost of Lost Opportunities} + \text{Cost of Risk}$$
* สร้าง Dynamic Impact Cascade 4 ขั้นตอน: ปัญหาทางเทคนิค $\rightarrow$ ผลกระทบต่อปริมาณข้อมูล $\rightarrow$ ผลกระทบต่อ KPI และ แดชบอร์ด $\rightarrow$ แนวทางปฏิบัติการ

### ขั้นที่ 5: การทำงานร่วมกันผ่านแดชบอร์ดและการซิงค์ตัวกรอง (Two-Way Filter Synchronization)
* เมื่อผู้ใช้คลิกเลือกการ์ดแผนกบนหน้าจอ Business Impact หรือเลือกจากดรอปดาวน์ด้านบน:
  * ข้อมูลทั้งหน้าจอ (Executive Overview, กราฟแนวโน้มคุณภาพ, ชาร์ต Reconciliation, และตารางบัตรงาน) จะปรับขอบเขตเข้าสู่แผนกนั้นทันที
  * ผู้ใช้สามารถคลิกปุ่ม `Reset Filter` เพื่อกลับสู่ภาพรวมระดับองค์กรได้ในคลิกเดียว

### ขั้นที่ 6: วงจรปิดแก้ไขปัญหาและซ่อมแซมข้อมูลต้นน้ำ (Closed-Loop Upstream Remediation)
* ตาราง **Upstream Governance Tickets** จะแสดงรายละเอียด:
  * บัตรงานที่ยังเปิดอยู่ (**Open**) เทียบกับทั้งหมด (**All**)
  * ระบบเป้าหมายที่ต้องแก้ไข (**Target System**) เช่น `Upstream Auth API`
  * คำแนะนำการแก้ไขเชิงลึก (**Remediation Action Narrative**) เช่น แนะนำการตั้งค่า Idempotency Key หรือ NOT NULL Constraint
* เมื่อทีมวิศวกรต้นน้ำแก้ไขที่ระบบต้นทางแล้ว สามารถกดปุ่ม `Resolve` บนหน้าเว็บ เพื่อปิดบัตรงานและส่งสัญญาณให้ Spark Trigger Daemon ประมวลผลข้อมูลรอบใหม่อย่างต่อเนื่อง
