# วิเคราะห์ระบบจริง (White Box) ตามเกณฑ์ Data Engineering ข้อ 2–6

> วิเคราะห์จากโค้ดของ repo `C:\ETL` (branch `new-optimizer`) ไม่ใช่จากเอกสาร/README
> **ไม่ได้ให้คะแนนตัวเอง** — เอกสารนี้ตอบเพียงว่า "ระบบทำอะไรจริง ทำอย่างไร อยู่ที่ไฟล์ไหน"

## วิธีการและข้อจำกัด (อ่านก่อน)

- อ่านโค้ดแบบ static ทั้งหมด **ไม่ได้รันระบบ ไม่ได้รัน test** — พฤติกรรมตอนรันจึงเป็นการอนุมานจากโค้ด
- แบ่งงานให้ 4 agent อ่านโค้ดคู่ขนาน (Extraction / Transformation / Loading / Utilization) แล้วรวมผล
  ผู้เขียนตรวจโค้ดซ้ำเองเฉพาะข้อที่ใช้อ้างบ่อยหรือน่าประหลาดใจ ได้แก่
  `assembly.py:43-45` (total = clean + quarantine), `cleansing.py:29-39` (ลบซ้ำไม่นับ),
  `whitebox.py:1593-1611` (ingest-source จำลอง), `Ingestion.jsx:831,868`,
  `spark_quality_engine.py:1702-1788` (ลำดับเขียน/คิดคะแนน/trigger Gold),
  `analytics.py:768-806` (Sell-In/Out mock), และการไม่มี dashboard ใน `infra/grafana/provisioning/`
  ข้อที่เหลืออ้างตาม agent พร้อม `path:line` ให้ย้อนตรวจได้
- **สถานะที่ใช้:** `REAL` = มีโค้ดและเชื่อมต่อทำงานจริง · `PARTIAL` = มีบางส่วน/มีข้อจำกัดสำคัญ ·
  `UI ONLY` = มีหน้าจอ/ข้อความแต่ไม่มี logic จริงรองรับ · `MOCK` = ข้อมูลจำลอง/ฮาร์ดโค้ด · `NOT FOUND` = ไม่พบในโค้ด
- ตัวย่อ: `SQE` = `services/spark/spark_quality_engine.py` · `S/` = `services/spark/sdoqap/` ·
  `API/` = `services/api/app/api/` · `RC` = `services/spark/rules_config.json`
- ผู้กำหนด logic: **Dev** (hard-code โดยนักพัฒนา) · **User** (ผู้ใช้/วิศวกรตั้งค่า) · **System** (ระบบตรวจจับ/อนุมานเอง) · **LLM** (โมเดลเสนอ)

---

# 0. ตารางภาพรวม

| หัวข้อ | สิ่งที่ระบบทำจริง | สถานะ | ไฟล์/Function สำคัญ |
|---|---|---|---|
| **2. กระบวนการ** | Spark pipeline 21 stage ใน 3 ช่วง (ALIGN 1 · TRANSFORM 12 · POST_LOAD 8) + ขั้นตอน inline (lock, อ่าน raw, เขียน quarantine, MERGE, OPTIMIZE/VACUUM, archive, trigger Gold) + กระบวนการนอก stage (landing/checksum ที่ API, auto-remediation, semantic auto-learn, rule governance, profile drift, Gold layer) | REAL | `S/pipeline/plan.py`, `registry.py`, `SQE:run_quality_check` (1551-1811), `API/pipeline.py:271-303` |
| **3. Extraction** | รับข้อมูล 3 แบบที่ต่อครบจริง: อัปโหลดไฟล์ CSV/Excel, REST API (fetch ฝั่ง API), PostgreSQL → แปลงเป็น CSV → เขียน raw ลง HDFS ต่อ 1 ingest + บันทึก run ใน ES; Reddit→Kafka→Spark Streaming มีจริงแต่แยกเส้น ไม่เข้า quality engine | REAL (3 แหล่ง) / PARTIAL (stream) / **UI ONLY** (แท็บ API และ Stream บนหน้า Ingestion) | `API/pipeline.py` (`ingest_csv/api/rdbms`, `land_and_queue`), `API/ingest_guards.py`, `streaming_job.py` |
| **4. Transformation** | แปลงชนิดข้อมูล, rename คอลัมน์แบบ fuzzy, ลบซ้ำตาม PK, validate (null/type/date) แล้วแยก valid/invalid, มาตรฐานวันที่ (รวม พ.ศ.→ค.ศ.), range/IQR/Z-score → quarantine, semantic standardize, DSL remediation (fillna/calculate/cast/filter) | REAL (หลัก) / PARTIAL (imputation, join, aggregation บนข้อมูลธุรกิจ) | `S/stages/schema.py`, `cleansing.py`, `standardize.py`, `rules.py`, `anomaly.py`, `SQE:819-1220` |
| **5. Loading** | เขียน Delta: quarantine (append, ลบตาม `ingest_id` ก่อน) แล้ว MERGE เข้า active ตาม PK; metadata/metrics/lineage ลง Elasticsearch; raw → archive | REAL (Delta MERGE) / **NOT FOUND** (quality gate ก่อนโหลดระดับตาราง, ตรวจนับ source vs ปลายทาง, ES bulk, incremental/CDC, rollback) | `SQE:1702-1805`, `S/stages/assembly.py`, `report.py` |
| **6. Utilization** | Create Dashboard (AI) ใช้งานได้จริงตั้งแต่เลือก dataset → LLM ออกแบบ spec → pandas คำนวณ → บันทึก; หน้า Dashboard/Analytics/Export/Trust-check ใช้ข้อมูลจาก ES และ Delta จริงบางส่วน ปนกับส่วน MOCK | REAL (Builder, Trust-check, Export) / PARTIAL (Dashboard, Analytics, Alert) / MOCK (Sell-In/Out) / **NOT FOUND** (Grafana dashboard, Prometheus ที่รันจริง) | `API/dashboards.py`, `dashboard_llm.py`, `dashboard_compute.py`, `API/analytics.py`, `API/lineage.py` |

**ข้อสังเกตเด่น 5 ข้อ** (ละเอียดในแต่ละหัวข้อ):

1. ยอดรวม `total_records` คำนวณจาก `clean + quarantine` เสมอ จึง "ลงตัว" โดยโครงสร้าง ไม่ได้เทียบกับจำนวนแถวต้นทาง
   และแถวที่ถูกลบซ้ำใน `auto_clean` ไม่อยู่ในทั้งสองฝั่ง (บันทึกเป็นข้อความ `resolved_N_duplicates` เท่านั้น)
2. คะแนนคุณภาพ (`quality_score`) ถูกคำนวณ **หลัง** เขียน Delta แล้ว → ไม่ได้ขวางการโหลด ใช้ส่งแจ้งเตือน / ติดป้าย `warnings` / ตัดสินว่าจะ rebuild Gold
3. แท็บ "API" และ "Stream" บนหน้า Ingestion เป็นการจำลอง (`"simulated": True`) ส่วนช่องทาง REST API จริงเรียกได้ทาง API ตรง, n8n หรือ `test_data_source.bat`
4. Grafana มีแค่ datasource + alert rules **ไม่มี dashboard** และไม่มี Prometheus รันอยู่ใน compose
5. บางตัวเลข/ข้อความบนหน้า Dashboard เป็น MOCK หรือฮาร์ดโค้ด (Sell-In/Out, narrative ธุรกิจ, metadata ของ lineage node)

---

# ข้อ 2 — จำนวนกระบวนการในการจัดการข้อมูล

## 2.1 โครงสร้างการทำงานจริง

ลำดับกำหนดใน `S/pipeline/plan.py:2-6` และลงทะเบียนด้วย decorator ใน `registry.py:17-21`
(รันทีละ stage และจับเวลาลง `stage_seconds` — `registry.py:24-32`) ลำดับจริงของงานหนึ่งรอบอยู่ที่ `SQE:run_quality_check` (1551-1811):

```
โหลดกฎ → อ่าน raw (ทุกคอลัมน์เป็น string) → guard ไฟล์ว่าง/long-text
→ ALIGN: schema_align
→ TRANSFORM: schema_drift → auto_clean → validation → dedup → standardize_dates → standardize_categories
             → range_rules → anomaly_iqr → anomaly_zscore → anomaly_induced → quarantine_assembly → column_filter
→ (inline) เขียน quarantine Delta → MERGE เข้า active Delta → OPTIMIZE/VACUUM ทุก N เวอร์ชัน
→ POST_LOAD: distribution → quarantine_breakdown → copdq → freshness → quality_score
             → ai_advisory → operational_impact → report
→ (inline) ถ้า score ≥ threshold สั่ง rebuild Gold → archive raw → ปล่อย lock
```

## 2.2 ตาราง 21 stage ตามลำดับรัน

| # | Stage | หน้าที่ / ทำงานอย่างไร | Input | Output | ไฟล์ : function | ใครกำหนด logic | อัตโนมัติ? |
|---|---|---|---|---|---|---|---|
| 1 | `schema_align` | ล้างชื่อคอลัมน์, สร้าง `row_hash` (md5), rename แบบ fuzzy ให้ตรงชื่อใน registry, promote Integer→Double ถ้ามีทศนิยม, cast ตามชนิด (Integer/Double/Timestamp 6 รูปแบบ + epoch), `repartition(10)` | DF string + spec | DF ที่ cast แล้ว | `S/stages/schema.py:10-98` | Dev (อัลกอริทึม) + System (spec อนุมานจากข้อมูลถ้าเป็นตารางใหม่ `SQE:1840-1925`) | อัตโนมัติ |
| 2 | `schema_drift` | เทียบกับ spec: คอลัมน์หาย→เติม NULL+alert, ชนิดไม่ตรง→cast เป็น string, คอลัมน์ใหม่→เพิ่มใน spec; บันทึก `sdoqap_schema_drifts` / `sdoqap_schema_proposals` | DF + spec + `rules.schema_evolution` | DF + drift record | `schema.py:101-243` | Dev (gate) + User (policy; คนอนุมัติผ่าน `API/schema.py:63-183`) | อัตโนมัติ |
| 3 | `auto_clean` | (ถ้า `auto_clean=true` ค่าเริ่มต้น) apply DSL remediation → `dropDuplicates` ตาม PK (แถว PK ว่างถูกแยกไว้ไป quarantine) | DF | DF ลบซ้ำแล้ว | `S/stages/cleansing.py:6-44` | Dev (ลบซ้ำ) + User/LLM (DSL) | อัตโนมัติ |
| 4 | `validation` | ตั้ง flag รายแถว: `missing_primary_key`, `null_value_in_<col>`, `invalid_type_<col>`, `missing_date` แล้วแยก `valid_df` / `invalid_df` | DF | valid + invalid | `cleansing.py:47-115` | Dev (rule ฮาร์ดโค้ด) | อัตโนมัติ |
| 5 | `dedup` | `dropDuplicates` ตาม PK บน valid; แถวที่ถูกตัดไป quarantine เหตุผล `duplicate_records` | valid_df | clean_df + duplicate_df | `cleansing.py:118-138` | Dev | อัตโนมัติ (ปกติว่างเมื่อ auto_clean เปิด) |
| 6 | `standardize_dates` | UDF กับคอลัมน์ชื่อ `วันที่`/`date`/`Date` เท่านั้น รองรับ `d Mon yyyy`, `d-m-yyyy`, `yyyy-m-d`, ปี > 2500 ลบ 543 → `YYYY-MM-DD` | clean_df | วันที่เป็นมาตรฐาน | `S/stages/standardize.py:6-57` | Dev | อัตโนมัติ |
| 7 | `standardize_categories` | map คำหลัก→หมวด จาก `standardization_rules` ใน registry | clean_df | คอลัมน์ถูกแทนที่ | `standardize.py:60-103` | User (rule เป็นข้อมูล) | อัตโนมัติ — แต่ไม่พบที่ใดใน repo เขียน `standardization_rules` จึงเกือบไม่ถูกใช้ |
| 8 | `range_rules` | ค่า < min หรือ > max ตาม `range_checks` → quarantine `out_of_range_<col>` | clean_df | clean + range_violation | `S/stages/rules.py:15-33` | User (`range_checks`; มีแค่ `student_course_scores`, `RC:530-539`) | อัตโนมัติ |
| 9 | `anomaly_iqr` | รันเมื่อ `value_range.mode` เป็น `auto`/`adaptive`: fence = Q1−k·IQR, Q3+k·IQR (k ค่าเริ่มต้น 1.5) ทุกคอลัมน์ตัวเลข → quarantine | clean_df | clean + outlier | `S/stages/anomaly.py:6-44`; `dynamic_rules_engine.py:185-242` | Dev (อัลกอริทึม) + User (mode,k) + System (ขอบเขต) | อัตโนมัติ |
| 10 | `anomaly_zscore` | `abs(x−mean)/std > 3.0` (ฮาร์ดโค้ด ไม่มีสวิตช์) ข้ามคอลัมน์ variance 0 | clean_df | clean + outlier | `anomaly.py:47-75` | Dev | อัตโนมัติ |
| 11 | `anomaly_induced` | OR เงื่อนไข SQL จาก `rules.induced.*.condition` (กฎจาก decision tree ที่คนอนุมัติ) | clean_df | clean + match | `anomaly.py:78-118` | LLM/ML เสนอ + คนอนุมัติ | อัตโนมัติ (มักว่าง) |
| 12 | `quarantine_assembly` | union quarantine ทุกประเภท + `run_id`, `rejected_at`; นับ clean/quarantine; `total = clean + quarantine` | DFs ข้างบน | counts | `S/stages/assembly.py:6-49` (total บรรทัด 45) | Dev | อัตโนมัติ |
| 13 | `column_filter` | ตัดคอลัมน์ที่ไม่อยู่ใน `schema_spec` | clean_df | clean_df แคบลง | `assembly.py:52-75` | Dev + spec | อัตโนมัติ |
| 14 | `distribution` | สัดส่วนคลาส (ชื่อคอลัมน์ที่รู้จัก 11 ชื่อ หรือคอลัมน์ string 2-25 ค่า) | active Delta | class_balance | `S/stages/metrics.py:8-59` | Dev + System | อัตโนมัติ |
| 15 | `quarantine_breakdown` | group by `reject_reason` | quarantine (run นี้) | `{reason: count}` | `metrics.py:62-91` | Dev | อัตโนมัติ |
| 16 | `copdq` | รวมมูลค่าคอลัมน์การเงิน (ชื่อ total_sales/sales/revenue/profit/price/amount/total) ของแถวที่ถูก quarantine | quarantine | `quarantined_financial_value` | `metrics.py:94-116` | Dev | อัตโนมัติ |
| 17 | `freshness` | `now − max(date)` เป็นชั่วโมงของแถว active รอบนี้ | active | `max_lag_hours` | `metrics.py:119-158` | Dev | อัตโนมัติ |
| 18 | `quality_score` | `clean/total×100`; alert ถ้าต่ำกว่า threshold; Z-score ของอัตรา quarantine เทียบประวัติ (ต้องมี ≥ 3 รอบ) | counts + ประวัติจาก ES | score, z, is_anomaly | `metrics.py:161-213` | Dev (สูตร) + User/System (threshold) | อัตโนมัติ |
| 19 | `ai_advisory` | วิเคราะห์ profile drift (PSI) → ให้ LLM (Groq→Ollama→heuristic) เสนอกฎ → เก็บเป็น `PROPOSED` ใน ES; ฝึก decision tree หา rule | metrics + ตัวอย่าง quarantine | proposal | `S/stages/advisory.py:6-167` | LLM/ML เสนอ + คนอนุมัติ | อัตโนมัติ (`ai_advisor.enabled=true`, `trigger="always"` ใน `RC:42-48`) |
| 20 | `operational_impact` | คะแนนผลกระทบถ่วงน้ำหนักต่อแถวที่ล้มเหลว | quarantine + `column_weights` | `operational_impact_score` | `metrics.py:216-261` | Dev (น้ำหนัก User ปรับได้) | อัตโนมัติ |
| 21 | `report` | เขียน `sdoqap_quality_runs`, `sdoqap_lineage_runs`, `sdoqap_pipeline_runs` | ctx | เอกสารใน ES | `S/stages/report.py:52-80` | Dev | อัตโนมัติ |

## 2.3 กระบวนการที่อยู่นอกรายการ stage

| กระบวนการ | ทำอะไร | ไฟล์ | ผู้เริ่ม |
|---|---|---|---|
| รับเข้า + normalize | Excel→CSV (pandas), JSON/API→CSV (รวม key ทั้งหมดเรียงตัวอักษร, nested เก็บเป็น JSON string), RDBMS→CSV | `API/pipeline.py:327, 465-508, 577-610` | User |
| ตรวจไฟล์ซ้ำ (checksum) | SHA-256 + ค้นใน `sdoqap_runs`; ซ้ำที่สถานะ QUEUED/RUNNING/SUCCEEDED จะไม่รับซ้ำ | `API/pipeline.py:272-284`, `run_registry.py:21-47` | อัตโนมัติ |
| ตรวจคอลัมน์ PK ในหัวไฟล์ | ถ้ามี PK ลงทะเบียนแล้วแต่ไฟล์ขาด → HTTP 400 | `pipeline.py:250-259` | อัตโนมัติ |
| อนุมาน schema + PK ตารางใหม่ | `inferSchema`, สแกนหา leading zero (บังคับเป็น string), หา PK ที่ไม่ซ้ำ ≥ 90%, สำรอง `row_hash` | `SQE:1840-1925`, `S/common/keys.py:14-55` | อัตโนมัติ |
| สร้างกฎเริ่มต้น | `generate_rules_from_schema` เขียนกฎลง `rules_config.json` | `dynamic_rules_engine.py:660-731` | อัตโนมัติ |
| คิวงาน + lock | 1 งาน/ตาราง (FIFO ในหน่วยความจำ) + lock ใน ES พร้อม heartbeat | `trigger_core.py:53-82`, `SQE:126-218` | อัตโนมัติ |
| Auto-remediation (LLM) | เมื่อมี quarantine > 0 daemon เรียกให้ LLM สร้างกฎ DSL เก็บกฎที่ `confidence ≥ 0.80` เขียนลง registry แล้วรันซ้ำ | `spark_trigger_daemon.py:137-179`, `auto_remediation_engine.py` | อัตโนมัติ (ไม่ต้องคนอนุมัติ) |
| Semantic auto-learn | คะแนนความเหมือน 0.90–1.0 เขียน mapping memory เอง; 0.60–0.90 ส่งคนรีวิว | `SQE:687-817` | อัตโนมัติ + คนรีวิว |
| Governance ของกฎ | audit log + สำรอง 10 เวอร์ชัน + rollback; อนุมัติ AI proposal ผ่าน guardrail (พื้น 70, ลดได้ ≤ 10%) | `API/dynamic_rules.py:99-192, 472-636` | User |
| Profile store | EMA ต่อคอลัมน์, PSI drift (เตือน 0.1 / วิกฤต 0.25) | `data_profile_store.py` | อัตโนมัติ |
| Gold layer | รวมสถิติจาก **metadata ของ run ใน ES** (ไม่ใช่ข้อมูลธุรกิจ) เขียน 4 index | `spark_gold_layer.py:184-430` | อัตโนมัติหลังรันผ่าน / ปุ่ม rebuild |
| Archive raw | ย้าย raw ไป `/data/archive/<table>/<ingest_id>` | `SQE:1790-1805` | อัตโนมัติ |
| Streaming (Reddit) | Kafka → Parquet + ES แยกเส้น | `streaming_job.py` | User |
| Whitebox module | pandas pipeline ใน API process ผูกกับชุดข้อมูลคะแนนนักเรียน | `API/whitebox.py` | User |

**สรุปจำนวน:** ใน Spark pipeline มี **21 stage ที่ลงทะเบียน** (1 + 12 + 8) และมีขั้นตอน inline อีก 7 (lock, อ่าน raw, เขียน quarantine,
MERGE, OPTIMIZE/VACUUM, trigger Gold, archive) นอกจากนี้ยังมีกระบวนการฝั่ง API/daemon อีกอย่างน้อย 10 รายการตามตารางด้านบน
ผู้อ่านควรระบุให้ชัดว่านับ "stage ใน pipeline" หรือนับ "กระบวนการทั้งระบบ" เพราะตัวเลขต่างกัน
บาง stage ทำงานแต่ผลน้อยหรือแทบไม่ถูกใช้ (เช่น `standardize_categories`, `anomaly_induced`)

---

# ข้อ 3 — Data Extraction

## 3.1 แหล่งข้อมูลที่ระบบรองรับจริง

| แหล่ง | จุดเข้า | รูปแบบที่จัดการ | สถานะ |
|---|---|---|---|
| ไฟล์ CSV (อัปโหลด) | `POST /api/v1/pipeline/ingest/csv` — `API/pipeline.py:315-333` (`ingest_csv`); UI แท็บ "ไฟล์" `Ingestion.jsx:213-313` | เขียน bytes ลง HDFS ตามที่ได้รับ ชื่อ `<table>.csv` | REAL |
| Excel `.xlsx/.xls` | route เดียวกัน `pipeline.py:324-329` | `pd.read_excel(...).to_csv()` (อ่านเฉพาะ sheet แรก) | REAL |
| REST API → JSON/CSV | `POST /ingest/api` — `pipeline.py:335-508`; relay ผ่าน n8n webhook (`ingestion_workflow.json:48-72`); `test_data_source.bat:109-135` | JSON (list / `result.records` / `records` / `data` / `items` / dict เดี่ยว) หรือ CSV; มี resolver data.go.th (CKAN) | REAL ที่ฝั่ง API/n8n · **UI ONLY** บนแท็บ "API" ของหน้า Ingestion |
| PostgreSQL | `POST /ingest/rdbms` — `pipeline.py:567-613`; UI แท็บ "ฐานข้อมูล" `Ingestion.jsx:233-274` | `db_type` ต้องเป็น `postgresql` | REAL (เปิดใช้เมื่อตั้ง `RDBMS_ALLOWED_HOSTS`) |
| n8n schedule ทุก 30 นาที | `infra/n8n/ingestion_workflow.json:8-17` | Olist CSV, data.go.th `limit=10000`, `SELECT * FROM sales_records` — แหล่งตายตัว | REAL แต่เป็นแหล่งเดโมฮาร์ดโค้ด |
| Reddit → Kafka → Spark Streaming | `POST /ingest/reddit` → daemon `/stream/start` → `reddit_stream.py`, `streaming_job.py` | โพสต์ Reddit | PARTIAL: ข้อมูลลงจริงแต่ **ไม่เชื่อมกับ quality engine** |
| JSON/Parquet/Avro/XML (ไฟล์) | มีไฟล์ตัวอย่างใน `data/samples/formats/` แต่ไม่มี code ที่อ่าน | — | NOT FOUND |
| MySQL/Oracle/Mongo/JDBC | ถูกปฏิเสธ HTTP 400 (`pipeline.py:586-587`) | — | NOT FOUND |

**แท็บ "API" และ "Stream" บนหน้า Ingestion เป็นของจำลอง:**
ปุ่มเรียก `handleConnectSourceAndProfile` (`Ingestion.jsx:831, 868`) → `POST /whitebox/ingest-source`
ซึ่ง `whitebox.py:1593-1618` ไม่ได้เชื่อมต่อแหล่งใดจริง ตอบ `"simulated": True` และแสดงป้าย "โหมดสาธิต" (`Ingestion.jsx:179-181`)
ฟังก์ชันที่ทำงานจริง (`handleApiSubmit` :568, `handleCsvSubmit` :530, `handleRdbmsSubmit` :628) ถูกประกาศไว้
แต่ไม่พบ JSX ที่เรียกใช้ ช่องกรอก broker/topic/group ของ Kafka ไม่มีผลต่อการทำงานจริง (broker ฮาร์ดโค้ดใน `reddit_stream.py:39-43`, `streaming_job.py:9`)

## 3.2 ขั้นตอนการรับข้อมูล

**อัปโหลดไฟล์** (`pipeline.py:315-303`, `land_and_queue` 271-303):

1. ยืนยันตัวตน (session cookie หรือ `X-Service-Key`) — `auth.py:88-102`
2. ตรวจชื่อตาราง regex `^[A-Za-z0-9_-]{1,128}$` — `validation.py:4-18`
3. จำกัดขนาด 200 MB (ค่าเริ่มต้น `MAX_UPLOAD_MB`) เกิน → HTTP 413 — `ingest_guards.py:96-109`
4. ไฟล์ว่าง → HTTP 400; Excel → แปลงเป็น CSV
5. คำนวณ SHA-256, ตรวจไฟล์ซ้ำ, ตรวจคอลัมน์ PK ในหัวไฟล์
6. เขียน raw ลง HDFS ผ่าน WebHDFS: `/data/raw/<table>/<ingest_id>/<table>.csv` (retry 5 ครั้ง ห่าง 3 วินาที — `pipeline.py:194-227`)
7. สร้างเอกสาร run ใน ES `sdoqap_runs` สถานะ QUEUED (`run_registry.py:50-65`)
8. เรียก Spark trigger daemon `/retry` (`pipeline.py:230-242`) → รัน `spark-submit` ต่อ

**REST API:** SSRF guard (host ต้องเป็น data.go.th หรืออยู่ใน `API_INGEST_ALLOWED_HOSTS`, **ปิดโดยค่าเริ่มต้น** ถ้าไม่ตั้ง), GET เดียว timeout 15 วินาที,
redirect ≤ 3 ครั้งพร้อมตรวจ host ใหม่ (`ingest_guards.py:22-51`) → parse JSON/CSV → flatten เป็น CSV (`pipeline.py:481-503`)
**ไม่มี pagination และไม่มี retry** ในฝั่ง API (n8n มี retry 3 ครั้งและส่ง `limit=10000`)

**PostgreSQL:** host ต้องอยู่ใน allowlist, อนุญาตเฉพาะ `SELECT` (ห้าม `;`), session read-only, `statement_timeout` 30 วินาที,
เกิน `RDBMS_MAX_ROWS` (1,000,000) → 413 (`ingest_guards.py:54-93`) → เขียน CSV (NULL กับ string ว่างกลายเป็นช่องว่างเหมือนกัน)

**อ่านที่ Spark:** `csv(header=true, multiLine=true, escape=", quote=")` อ่านทุกคอลัมน์เป็น string (`SQE:1643-1644`)
**ไม่มีการตรวจ delimiter/encoding** — ใช้ comma และ UTF-8 ตามค่าเริ่มต้นของ Spark ไฟล์ที่ไม่ใช่ UTF-8 (เช่น cp874) จะไม่ถูกตรวจพบหรือแปลง
ข้อมูลจาก Excel/API ถูก normalize เป็น UTF-8 ก่อนลง HDFS

## 3.3 สิ่งที่ตรวจก่อนข้อมูลเข้า pipeline

| รายการตรวจ | เงื่อนไขจริง | อยู่ที่ | สถานะ |
|---|---|---|---|
| ชื่อตาราง (path traversal) | regex ข้างบน | `validation.py:4-18` | REAL |
| ขนาดไฟล์ | ≤ 200 MB | `ingest_guards.py:96-109` | REAL (ใช้กับ `/ingest/csv`; `/whitebox/upload-csv` ไม่จำกัด) |
| ไฟล์ว่าง | 0 byte → 400; ที่ Spark: 0 คอลัมน์/0 แถว → exit 75 → `SKIPPED` | `pipeline.py:322`, `SQE:1670-1674` | REAL |
| นามสกุล/MIME/โครงสร้าง CSV | ไม่มี (ไฟล์ใดก็ผ่าน) | — | NOT FOUND |
| คอลัมน์ PK ในหัวไฟล์ | ตรวจเมื่อมี PK ลงทะเบียนแล้ว | `pipeline.py:250-259` | PARTIAL (ไม่ตรวจคอลัมน์อื่น) |
| Schema / ชนิด / Null | ตรวจ **หลัง** landing ที่ Spark ระดับแถว | `schema.py`, `cleansing.py` | REAL (หลังลงไฟล์) |
| ไฟล์ซ้ำ (checksum) | SHA-256 + สถานะ QUEUED/RUNNING/SUCCEEDED | `run_registry.py:21-47` | REAL (มีช่อง race; n8n ข้ามการตรวจนี้) |
| จำนวน record ต้นทาง vs ที่รับ | **ไม่มี** (บันทึกเพียง `size_bytes`; `rows_ingested` มีเฉพาะ response ของ RDBMS) | — | NOT FOUND |
| Checksum หลังเขียน HDFS | ไม่มีการอ่านกลับตรวจ | — | NOT FOUND |
| Long-text CSV guard | เตือนเมื่อค่าเฉลี่ยความยาว > 150 ตัวอักษร บล็อกได้เฉพาะเมื่อ `strict_csv_guard` ซึ่งไม่มีใครตั้ง และเงื่อนไข `"csv" in raw_path` เป็นจริงเฉพาะเมื่อชื่อตารางมีคำว่า csv | `SQE:1646-1668` | PARTIAL (แทบไม่ทำงาน) |

## 3.4 การเก็บ raw และ metadata

- **Raw:** `/data/raw/<table>/<ingest_id>/<table>.csv` → หลังรันสำเร็จย้ายไป `/data/archive/<table>/<ingest_id>` (`SQE:1790-1805`)
  เส้นทางเก่า (n8n/`test_data_source.bat`) เขียนแบบแบน `/data/raw/<table>/<table>.csv` และ **ลบ raw ทิ้งเมื่อไม่มี quarantine** (`SQE:1798-1803`)
  มี retention ลบของเก่า > 30 วันใน `/data/raw` และ `/data/quarantine` (`scripts/ops/data_retention_cleanup.py`) แต่ไม่แตะ archive
- **Metadata ต่อ ingest** (`sdoqap_runs`, `_id = ingest_id`): `table_name, checksum, source (file|api|rdbms), size_bytes, raw_path, state` + daemon เติม `started_at, finished_at, exit_code, error`
  สถานะ: QUEUED → RUNNING → SUCCEEDED / FAILED / SKIPPED / TRIGGER_FAILED
- **เส้นทาง n8n แบบเก่าไม่มี `ingest_id`** จึงไม่มีเอกสารใน `sdoqap_runs`
- **Run id ตอนประมวลผล:** `run_YYYYmmdd_HHMMSS_ffffff` (`SQE:1564`) ปรากฏใน quality/lineage/pipeline docs และคอลัมน์ `run_id` ของ active/quarantine

## 3.5 เมื่อ extraction ผิดพลาด

| เหตุการณ์ | การจัดการ |
|---|---|
| เกิน limit / ไฟล์ว่าง / Excel เสีย / ชื่อผิด / PK ขาด | HTTP 413/400 ทันที ไม่ลงไฟล์ |
| ไฟล์ซ้ำ | ตอบ 200 `status:"duplicate"` พร้อม `ingest_id` เดิม |
| REST: host/redirect ไม่ผ่าน, ไม่ใช่ 200, parse ไม่ได้, ว่าง | HTTP 400 ไม่ retry ไม่ alert |
| WebHDFS เขียนล้มเหลว | retry 5 ครั้งแล้ว HTTP 500 (ยังไม่มีเอกสาร run) |
| Daemon ติดต่อไม่ได้ | HTTP 503, run = `TRIGGER_FAILED`, raw ยังอยู่, กู้ด้วย `POST /pipeline/retry/<ingest_id>` |
| Spark อ่าน/แปลงล้มเหลว | เขียน `sdoqap_pipeline_runs {state:"failed", error_msg}`, ปล่อย lock, exit 1 → run = `FAILED`; raw ไม่ถูก archive จึงรันซ้ำได้ |
| แถวเสียระดับแถว | quarantine พร้อม `reject_reason` ใน Delta `/data/quarantine/<table>` |
| แจ้งเตือน | schema drift ส่ง alert; **ไม่พบ alert เฉพาะสำหรับรันที่ failed/skipped** (ดูสถานะได้จาก API `GET /pipeline/runs/<id>` และ UI) |

## 3.6 เส้นทาง Streaming

`POST /ingest/reddit` → daemon เปิด `reddit_stream.py` (PRAW ถ้ามี credential, ไม่เช่นนั้น RSS; สำรองสุดท้ายคือโพสต์จำลอง `sim_...`)
→ Kafka topic `reddit_raw` → `streaming_job.py` (Spark Structured Streaming, `startingOffsets=earliest`, `failOnDataLoss=false`)
→ Parquet `/data/reddit/parquet` (partition ตาม `subreddit`) + ES index `reddit` (ไม่กำหนด doc id)
**ไม่มี validation / dedup / quarantine / run registry** และไม่พบการอ้างถึง `/data/reddit` ใน `spark_quality_engine.py`
(`grep reddit` ใน engine ไม่พบ) — จึงไม่เชื่อมกับ pipeline คุณภาพ งานจำกัดเวลาโดย daemon (ค่าเริ่มต้น 40 วินาที)
ป้าย "Ingesting" ของ Kafka บนหน้า Home เป็นการเช็ค TCP port `kafka:9092` ไม่ใช่การเช็คว่ามีข้อมูลไหล (`system.py:42-84`)

## 3.7 Workflow จริง (เฉพาะขั้นตอนที่พบในโค้ด)

```
[File/API/Postgres]
 User (UI/API/n8n) ──► API: ตรวจ auth·ชื่อตาราง·ขนาด·ว่าง·SSRF/SQL guard·checksum·PK header   (Dev rules)
                   ──► API: แปลง Excel/JSON/DB → CSV
                   ──► API: เขียน raw → HDFS /data/raw/<table>/<ingest_id>/  (retry 5)
                   ──► API: สร้าง sdoqap_runs (QUEUED)
                   ──► API → Spark daemon /retry ──► spark-submit  ──► (ต่อข้อ 4)

[n8n schedule ทุก 30 นาที]  แหล่งตายตัว → n8n เขียน HDFS ตรง (เส้นแบน, ไม่มี ingest_id) → daemon /retry

[Reddit stream]  User → API → daemon → Kafka → Spark Streaming → Parquet + ES   (จบ ไม่เข้า quality engine)
```

LLM ไม่เกี่ยวข้องกับ extraction

---

# ข้อ 4 — Data Transformation

## 4.1 Transformation ที่มีจริง (พร้อม Before → Logic → After)

> ตัวอย่างที่มีเครื่องหมาย (T) มาจาก unit test ใน `services/spark/tests/unit/`; (D) มาจากไฟล์ตัวอย่างใน repo
> ทั้งหมด **ยังไม่ได้รันซ้ำ** After ที่ระบุเป็นผลที่อ่านได้จาก logic/test

### (1) แปลงชนิดข้อมูล — REAL
- **Before (T `test_stage_schema.py:6-14`):** spec `{student_id: String, score: Integer, updated_at: Timestamp}`, แถว `("S1","1,234","2026-09-15 14:00:00")`
- **Logic (`schema.py:64-93`):** Integer = ตัดอักขระที่ไม่ใช่ `[\d-]` แล้ว cast double→int; Double = ตัดที่ไม่ใช่ `[\d.-]`; Timestamp = `coalesce` 6 รูปแบบ + epoch ms/sec
- **After:** `score = 1234`, `updated_at` เป็น Timestamp
- **Promotion (T `test_stage_schema.py:17-21`):** `"12.50"`, `"3"` ในคอลัมน์ Integer → Double `12.5`, `3.0`
- **ผู้กำหนด:** spec มาจาก registry หรือ `inferSchema` · อัตโนมัติ (stage 1)
- **ข้อควรระวังจากโค้ด (ไม่ได้รัน):** regex ของ Integer ตัด "." ทิ้ง ดังนั้น `"12.00"` จะกลายเป็น `1200` ขณะที่เงื่อนไข promote `\.[0-9]*[1-9]+` ไม่จับ ".00" ทั้งที่คอมเมนต์ `schema.py:67` ระบุว่าจัดการได้
  ชนิดอื่นนอกจาก Integer/Double/Timestamp ไม่ถูก cast

### (2) Rename / mapping คอลัมน์ — REAL (heuristic)
- **Before (T):** หัวคอลัมน์ `"Student ID"` → `clean_column_name` ได้ `Student_ID` → `normalize_name` = `studentid` ตรงกับ `student_id` ใน registry
- **After:** คอลัมน์ `student_id` (พิมพ์ `[RENAME]` ใน log) — `schema.py:28-35`, `names.py:4-15`
- ไม่พบ rename map ที่ผู้ใช้กำหนดเอง (มีเฉพาะใน whitebox: `studentId→student_id`, `fullName→student_name` `whitebox.py:1103-1105`)

### (3) ลบข้อมูลซ้ำ — REAL (มีข้อจำกัด)
- **Logic:** 2 ชั้นตาม PK — `auto_clean` (`cleansing.py:29-39`) แล้ว `dedup` (`cleansing.py:118-138`)
- **Test:** `test_stage_cleansing.py:8-12` (3 แถว → 2 แถว) และ `:31-37`
- **ข้อจำกัดที่ยืนยันจากโค้ด:** แถวที่ `auto_clean` ลบ **ไม่ถูกส่ง quarantine และไม่ถูกนับใน total** (เหลือแค่ข้อความ `resolved_N_duplicates`);
  `orderBy(date desc)` ตามด้วย `dropDuplicates` ไม่รับประกันว่า "แถวล่าสุด" จะอยู่รอด (คอมเมนต์ในโค้ดบอกว่า keep latest);
  Delta MERGE ไม่มีเงื่อนไข "newer wins" ข้ามรอบ
- **ตัวอย่าง (D `services/spark/users.csv`):** `id=2` ซ้ำ → ลบเงียบ; แถวไม่มี id → `missing_primary_key`; `id=3` email ว่าง → `null_value_in_email`
- **ผู้กำหนด:** PK จาก registry/อนุมาน (System); พฤติกรรม Dev; สวิตช์ `duplicate_check.enabled` ใน rules **ไม่ถูกอ่านโดย engine**

### (4) จัดการค่าว่าง — PARTIAL
- **ทางเลือกค่าเริ่มต้น (Dev):** NULL ในคอลัมน์ schema ใดก็ตาม → quarantine `null_value_in_<col>` (`cleansing.py:62-76`)
- **ทางเติมค่า (User/LLM ผ่าน DSL):** `fillna`, `calculate`, `auto_strategy` (`SQE:851-883, 1068`)
- **ตัวอย่างจริง `student_course_scores` (`RC:596-608`):** กฎ 2 ข้อ `fillna score=0` แล้ว `calculate score = study_hours*1.5 when score IS NULL`
  เพราะ `fillna` ทำงานก่อน เงื่อนไข `score IS NULL` จึงไม่มีวันเป็นจริง → แถวคะแนนว่างกลายเป็น `0` ผ่าน validation และถูกโหลด
  (ขัดกับ ground truth ใน `data/evaluation` ที่คาดว่า "Missing Score" ต้อง quarantine) — เป็นข้อสรุปจากการอ่าน logic ไม่ได้รัน
- ไม่พบการเติมด้วย mean/median/mode

### (5) Standardization — REAL (หลายกลไก ขอบเขตจำกัด)

| ชนิด | รายละเอียด | หลักฐาน |
|---|---|---|
| วันที่ + พ.ศ.→ค.ศ. | เฉพาะคอลัมน์ชื่อ `วันที่`/`date`/`Date`; ปี > 2500 → ลบ 543; ผลเป็น string `YYYY-MM-DD` | `standardize.py:6-57` |
| จับคู่คำหลัก→หมวด | `standardization_rules` ใน registry (ไม่พบตัวที่เขียนค่านี้ใน repo จึงแทบไม่ถูกใช้) | `standardize.py:60-103` |
| exact/substring (DSL `standardize`) | | `SQE:266-297` |
| Semantic/fuzzy | คะแนน = 0.4·substring + 0.3·token-overlap + 0.3·bigram-cosine; threshold ค่าเริ่มต้น 0.85 | `S/semantic/similarity.py:35-69`, `SQE:382-623` |
| Regex เป็น rule ผู้ใช้ | ไม่พบ | NOT FOUND |

- **ตัวอย่างวันที่ (D `grocery_sales.csv`, T `test_stage_cleansing.py:40-43`):** `22-7-2569`→`2026-07-22` · `20/07/2026`→`2026-07-20` · `14 Jul 2026`→`2026-07-14`
- **ข้อจำกัดจากโค้ด:** ไม่ตรวจความถูกต้องของปฏิทิน (`31-02-2026` → `2026-02-31`), ชื่อเดือนที่ไม่รู้จักถูกตีเป็นมกราคม, ไม่รองรับชื่อเดือนภาษาไทย
- **Semantic ใน strict mode (ค่าเริ่มต้น)** เขียนทับค่าเดิม ไม่มีคอลัมน์สำรอง (`SQE:939-941`)

### (6) Filtering — PARTIAL
DSL `filter` ตัดแถวใน `auto_clean` แบบเงียบ ไม่ quarantine ไม่นับ (`SQE:1174-1181`)

### (7) Aggregation — REAL แต่ไม่ใช่บนข้อมูลธุรกิจใน Spark path
- **Gold layer:** รวมค่าจาก metadata ของ run ใน ES (daily quality, error patterns, financial impact, schema drift) ไม่ใช่ข้อมูลธุรกิจ และเขียนด้วย Python `requests` (ไม่ใช้ Spark) `spark_gold_layer.py:25-29, 184-430`
- **Dashboard Builder:** pandas group-by (sum/avg/min/max/count/count_distinct + time bucket) บน active layer ตามต้องการ — `API/dashboard_compute.py`
- **Whitebox:** สถิติรายวิชา/เกรด บน CSV คะแนนนักเรียน `whitebox.py:871-944`

### (8) Join / Merge — PARTIAL
Spark: ไม่พบการ join หลายตารางสำหรับผู้ใช้ (มี broadcast join ภายในสำหรับ semantic mapping และ anti-join หา duplicate; Delta MERGE เป็น upsert ไม่ใช่ join)
Whitebox: `pd.merge` กับตาราง demographics ที่สร้างสังเคราะห์ตอนเริ่มระบบ (`whitebox.py:134-153, 1081-1135`)

### (9) คอลัมน์ที่สร้างขึ้น/คำนวณ — PARTIAL
`row_hash`, `_meta`, DSL `calculate`, คอลัมน์ semantic (`<col>_semantic` ฯลฯ ใน evolve/enriched mode)
พบบั๊กจากการอ่านโค้ด: `dry_run` ถูกกำหนดเฉพาะในแขนง `semantic_standardize` (`SQE:933`) แต่ถูกอ่านที่ `SQE:1080` — อาจ error แล้วถูก `except` กลืนไว้ (`SQE:1171`)

### (10) แยก Valid/Invalid — REAL
quarantine เก็บคอลัมน์เดิม + `is_invalid`, `reject_reason`, `run_id`, `rejected_at`, `ingest_id`; รันซ้ำ ingest เดิมจะลบแถวเก่าแล้วเขียนใหม่ (`assembly.py:36-37`, `SQE:1704-1711`)

### (11) Schema evolution — PARTIAL
ตรวจ drift ได้จริงและมี API อนุมัติ แต่ค่าเริ่มต้น `require_approval=true` (`schema.py:180`) และ `RC` ไม่มีบล็อก `schema_evolution` ทำให้ทุก drift เป็น PENDING
**อย่างไรก็ตามสถานะ PENDING ไม่ได้หยุดข้อมูล** คอลัมน์ใหม่ถูกเพิ่มเข้า spec ในหน่วยความจำ (`schema.py:146-148`) แล้ว Delta `autoMerge` ทำให้ตาราง active ขยาย schema (`SQE:85`)
ข้อความ "ไม่แก้ registry" หมายถึงไฟล์ registry เท่านั้น
การ auto-heal คอลัมน์ที่หายด้วย NULL ทำให้ทุกแถวถูกตีเป็น `null_value_in_<col>` (ตัวอย่าง: registry ของ `users` มี `age` แต่ `users.csv` ไม่มี)

### (12) Outlier — REAL (quarantine ไม่แก้ค่า)
`range_rules`, IQR, Z-score 3.0, induced rules; `value_range.column_overrides` ใน `RC` **ไม่ถูกอ่าน** (ใช้เฉพาะ `iqr_multiplier` รวม);
เมื่อ IQR = 0 ขอบเขตจะหดเป็นจุดเดียวและทุกค่าอื่นถูกตีเป็น outlier (จากการอ่านโค้ด); IQR/Z-score รันกับทุกคอลัมน์ตัวเลขรวมถึงที่เป็น id/ปี

## 4.2 กฎคุณภาพข้อมูล (Data Quality Rules) — เงื่อนไขจริง

| Rule | เงื่อนไขในโค้ด | `reject_reason` | ฮาร์ดโค้ด/ตั้งค่า |
|---|---|---|---|
| PK ว่าง | PK ใดว่าง (`cleansing.py:51-60`) | `missing_primary_key` | Dev (key `null_primary_key` ใน rules ไม่ถูกอ่าน) |
| ค่า NULL | คอลัมน์ schema ที่ไม่ใช่ PK เป็น NULL (`:62-76`) | `null_value_in_<col>` | Dev (`null_checks` ไม่ถูกบังคับใช้) |
| ชนิดข้อมูล | Integer/Double ที่มีค่าแต่ cast ไม่ได้ (`:78-98`) | `invalid_type_<col>` | Dev |
| วันที่ว่าง | คอลัมน์วันที่เป็น NULL (`:100-109`) | `missing_date` | Dev (`null_date_column.enabled=false` ถูกละเลย) |
| ซ้ำ | PK ซ้ำ (`:130-135`) | `duplicate_records` | Dev |
| ช่วงค่า | < min หรือ > max (`rules.py:6-12`) | `out_of_range_<col>` | User |
| IQR | นอก [Q1−k·IQR, Q3+k·IQR] | `<col>=<val> (expected [lo, hi])` | User (mode,k) |
| Z-score | `abs(x−mean)/std > 3.0` | `<col>_zscore=...` | Dev |
| Induced | OR ของ SQL expression | `induced_tree_rule_match` | ML + คนอนุมัติ |

**มิติคุณภาพที่วัดจริง:**

| มิติ | มีจริงอย่างไร | บังคับ/แสดงผลเฉยๆ |
|---|---|---|
| Completeness | ปฏิเสธแถว NULL; null rate ต่อคอลัมน์ใน profile (`profile.py:17-40`, tolerance 0.05) | ปฏิเสธ = บังคับ; tolerance = แสดงผล |
| Uniqueness | ลบซ้ำตาม PK | บังคับ |
| Validity | cast ชนิด, range, IQR, Z-score | บังคับ |
| Timeliness | `max_lag_hours` ต่อรอบ | แสดงผลเท่านั้น (`freshness_threshold_hours` ถูกบันทึกแต่ไม่ถูกนำมาเทียบ) |
| Consistency | ไม่พบกฎข้ามฟิลด์/ข้ามตาราง | NOT FOUND |
| Accuracy | เทียบ ground truth เฉพาะ whitebox benchmark (ข้อมูลนักเรียน) | NOT FOUND ในเส้นหลัก |

**สูตร Quality Score:** `clean_count / (clean_count + quarantine_count) × 100` (`metrics.py:168-175`; รับ 0 ถ้าไม่มีข้อมูล) — pass-rate เดียว ไม่มีน้ำหนักตามมิติ
**Threshold:** ค่าเริ่มต้น 90 พื้น 70; โหมด adaptive = `max(mean(N คะแนนล่าสุด) − stdev, min)` (N=15, ต้องมี ≥ 2 รอบ) — `dynamic_rules_engine.py:249-335`
→ ประวัติแย่ของตารางหนึ่ง ๆ ทำให้เกณฑ์ลดลงได้ (ภายใต้พื้น)
**ผลเมื่อไม่ผ่าน:** critical alert, สถานะ run เป็น `warnings` แทน `success` (`report.py:75`), ไม่ trigger Gold rebuild (`SQE:1778`),
AI advisor ทำงานเมื่อ score < threshold − 15 (`advisory.py:44-46`) — **ไม่ขวางการเขียน Delta**

## 4.3 ความครบถ้วนของการ transform เอง

- **ไม่มี reconciliation ว่า "แถวเข้า = แถวออก + ถูกปฏิเสธ"** ใน Spark path: `total_records` = ผลรวมของ output (`assembly.py:45`) ไม่เคยนับแถวนำเข้า
  แถวที่หายนอกบัญชี: ลบซ้ำใน `auto_clean` และ DSL `filter`; ยิ่งกว่านั้น `assembly.py:15-33` ห่อการ `.count()` ของ DF anomaly ด้วย `try/except: pass`
  ถ้า count ล้มเหลวหลังตัดแถวออกจาก clean แล้ว แถวนั้นจะไม่อยู่ทั้งสองฝั่ง
- **ที่มี reconciliation:** whitebox — ทุกแถวมีสถานะเดียว (`Valid/Review/Quarantine`) (`whitebox.py:1386-1388`)
- **สิ่งที่บันทึก:** แถว quarantine พร้อมเหตุผล (ระดับแถว), `quarantine_breakdown` (ต่อเหตุผล), `remediation_logs` (ข้อความ), `stage_seconds`, `fallback_metrics` ของ semantic, `drift_details`, audit log การแก้กฎ
- **ไม่บันทึก:** จำนวนแถวที่ถูกแก้โดย DSL/cast/standardize แต่ละกฎ, ค่าก่อน–หลังของเซลล์ที่ถูกแก้ (ยกเว้นคอลัมน์สำรอง `_raw_<col>` ใน evolve mode)
- **Lineage:** ระดับตารางเท่านั้น (`report.py:61-70`) ไม่มี column/step lineage; หน้า lineage inspector มี metadata ฮาร์ดโค้ด (ดูข้อ 6)

---

# ข้อ 5 — Data Loading

## 5.1 ปลายทางที่เขียนจริง

| ปลายทาง | ที่อยู่ | รูปแบบ | เนื้อหา | ผู้เขียน |
|---|---|---|---|---|
| HDFS raw | `/data/raw/<table>/<ingest_id>/<table>.csv` | CSV | ข้อมูลดิบ | API (WebHDFS) `pipeline.py:194-227` |
| HDFS archive | `/data/archive/<table>/<ingest_id>` | CSV | raw ที่ประมวลผลแล้ว | Spark `SQE:1790-1805` |
| **HDFS active** | `/data/active/<table>` | **Delta Lake** | แถว valid | Spark `SQE:1713-1735` |
| **HDFS quarantine** | `/data/quarantine/<table>` | **Delta** `partitionBy(run_id)` | แถว invalid + เหตุผล | Spark `SQE:1704-1711` |
| HDFS Reddit | `/data/reddit/parquet/subreddit=*` | Parquet | โพสต์ Reddit (ไม่มี quality gate) | `streaming_job.py:48-55` |
| ES run metadata | `sdoqap_quality_runs`, `sdoqap_lineage_runs`, `sdoqap_pipeline_runs`, `sdoqap_runs`, `sdoqap_run_locks` | JSON | จำนวน/คะแนน/พาธ/สถานะ | `report.py`, `run_registry.py` |
| ES registries | `sdoqap_schema_registry`, `sdoqap_rules_registry`, `sdoqap_schema_drifts`, `sdoqap_schema_proposals`, ฯลฯ | JSON | schema, กฎ, drift | engine/API |
| ES Gold | `sdoqap_gold_*` (4 index, มี explicit mapping) | JSON | สรุปจาก metadata ของ run | `spark_gold_layer.py` |
| ES `reddit` | index ของ stream | JSON | โพสต์ Reddit | `streaming_job.py:62-72` |

**ยืนยันว่าไม่มี (grep ทั่ว repo):** `_bulk`/`helpers.bulk`, `.jdbc(`, `INSERT INTO`, `saveAsTable`, `foreachBatch`
Postgres เป็นแหล่งเท่านั้น ไม่ใช่ปลายทาง · Grafana ไม่ได้ถูกเขียน (เป็นผู้อ่าน ES)
**ข้อมูลระดับแถวทั้ง valid และ invalid อยู่ใน Delta บน HDFS เท่านั้น** ส่วน Elasticsearch เก็บ metadata/เมตริก/ทะเบียน

## 5.2 กลไกการเขียน

| ด้าน | Active (Delta) | Quarantine (Delta) |
|---|---|---|
| โหมด | รอบแรก `overwrite`; รอบต่อไป `MERGE ... whenMatchedUpdateAll().whenNotMatchedInsertAll()` ตามเงื่อนไข `old.pk = new.pk` (`SQE:1718-1735`) | `append` (`:1710`) |
| Idempotency | key = PK (upsert) | ลบแถวที่ `ingest_id` เท่ากันก่อนแล้วจึง append — **เมื่อมี `ingest_id` และตารางมีคอลัมน์ `ingest_id` แล้วเท่านั้น** (`:1706-1709`); เส้นทางเก่า/n8n จะ append ซ้ำทุกรอบ |
| Retry/backoff | ไม่มี (MERGE ล้ม → fail-closed ไม่แตะตาราง `:1737-1753`) | ไม่มี |
| Schema | `autoMerge=true` (`:85`) | `mergeSchema=true` |
| Maintenance | ทุก 10 เวอร์ชัน `OPTIMIZE ZORDER BY (row_hash)` + `VACUUM 168h` (`:1756-1761`) — ถ้าตารางไม่มีคอลัมน์ `row_hash` จะ error ถูกกลืน และ VACUUM ไม่ทำงาน (อนุมานจากโค้ด) | — |

- **ลำดับสำคัญ:** เขียน **quarantine ก่อน แล้ว MERGE active** — สองตารางไม่อยู่ใน transaction เดียวกัน
- **ES:** เขียนทีละเอกสาร `POST /{index}/_doc` timeout 10 วินาที ไม่ retry; ถ้าเขียนล้มเหลวแค่ `print` แล้วรันต่อ (`SQE:96-121`)
  → รันอาจขึ้น SUCCEEDED ทั้งที่ log ลง ES ไม่สำเร็จ แล้ว trust-check จะตอบ "ไม่พบ quality run" → `HALT_INGEST` (`lineage.py:367-373`)
- **ไม่มี index template** — index ถูกสร้างด้วย dynamic mapping ยกเว้น Gold 4 index; ฟิลด์ `quarantine_breakdown`/`null_profile` จะงอก mapped field ใหม่ตามชื่อคอลัมน์/เหตุผล

## 5.3 กันข้อมูลซ้ำและบังคับ schema

| ชั้น | กลไก | ข้อจำกัด |
|---|---|---|
| ไฟล์ | SHA-256 + สถานะ run | ไม่มี atomic claim (อัปโหลดซ้ำพร้อมกันอาจผ่านทั้งคู่); n8n ข้าม |
| ในแบตช์ | `dropDuplicates(pk)` 2 ชั้น | ลำดับแถวที่เก็บไม่รับประกัน; ชั้นแรกไม่ถูกนับ |
| active | Delta MERGE ตาม PK | ถ้า PK ที่อนุมานซ้ำกันบางส่วน (เกณฑ์ ≥ 90% ไม่ซ้ำ) แถวอาจยุบเงียบ ๆ |
| ES metadata | `_doc` ไม่กำหนด id | รันซ้ำ/remediation re-validate เพิ่มเอกสารใหม่ → Gold รวมซ้ำหลายรอบ |
| Gold | `_id` กำหนดแน่นอน เขียนทับได้ | input อาจถูกนับซ้ำตามข้างบน |

**Schema:** cast เป็นชนิดตาม registry แล้ว validate; ES ไม่บังคับ schema (ยกเว้น Gold); Delta ชนชนิดไม่ได้ → MERGE ล้ม → fail-closed

## 5.4 Quality gate ก่อนโหลด — อธิบายให้ชัด

- **ระดับแถว:** มีจริง — แถวที่ไม่ผ่าน validation/dedup/range/anomaly ถูกแยกไป quarantine **ก่อน** เขียน
- **ระดับตาราง:** **ไม่มี gate ก่อนโหลด** — `quality_score` เป็น stage POST_LOAD (`plan.py`) คำนวณหลัง quarantine append และ active MERGE (`SQE:1704-1735` แล้วจึง `:1774`)
  ตารางที่คะแนน 0% ยังโหลดแถว valid ที่มีเข้า active
- **gate ที่มีจริงฝั่งผู้บริโภค:** `GET /api/v1/lineage/{table}/trust-check` (`lineage.py:340-447`) ให้ `is_safe_to_consume` = score ≥ threshold และไม่มี schema proposal ค้าง; ไม่พบ run → `HALT_INGEST` — เป็น advisory (ผู้เรียกเลือกใช้เอง)
- **เงื่อนไขที่ยกเลิกก่อนโหลดได้:** ไฟล์ว่าง (exit 75/SKIPPED), lock ชนกัน (SKIPPED), PK ที่ลงทะเบียนไว้ขาดในหัวไฟล์ (API 400), `strict_csv_guard` (ไม่มีใครตั้ง)

## 5.5 ตรวจหลังโหลด

| รายการ | สถานะ |
|---|---|
| Delta commit สำเร็จ | จับ exception เฉพาะ MERGE |
| อ่านกลับ active/quarantine | มี แต่ใช้คำนวณ metrics (distribution/freshness/breakdown) **ไม่ได้เทียบกับ `clean_count`/`quarantine_count`** |
| นับ Spark vs ES/Delta ปลายทาง | NOT FOUND |
| จัดการ failed item ของ ES | NOT FOUND (ไม่มี bulk) |
| Run ID / ingest ID / สถานะ | REAL (`SUCCEEDED` = exit code 0 ไม่ได้สะท้อนคุณภาพหรือผล log ลง ES) |
| Lineage | ระดับตารางเท่านั้น |
| Rollback / Delta time-travel | NOT FOUND |
| Staging แล้ว rename เข้า active | NOT FOUND (`staging_path` ประกาศแต่ไม่ใช้ `SQE:1625`) |

## 5.6 ชนิดของ Loading

| ชนิด | มีจริงไหม |
|---|---|
| Batch ต่อ ingest | REAL |
| Full load ซ้ำตามรอบ | REAL (n8n ทุก 30 นาทีดึงทั้งแหล่ง; `ingest/api` ดาวน์โหลดทั้งชุด) |
| Incremental ฝั่งต้นทาง (watermark/CDC) | **NOT FOUND** |
| Incremental ฝั่งปลายทาง (upsert) | REAL (Delta MERGE) |
| Streaming | PARTIAL (Reddit เท่านั้น, จำกัดเวลา, ไม่มี gate/quarantine/registry) |
| Micro-batch สำหรับ pipeline หลัก | NOT FOUND (ข้อความ "Micro-batch Streaming" ใน `lineage.py:261` เป็นฮาร์ดโค้ด) |

## 5.7 เมื่อเกิดข้อผิดพลาด

| กรณี | การจัดการ | สิ่งที่ผู้ใช้เห็น |
|---|---|---|
| อ่าน/ALIGN ล้ม | เขียน `sdoqap_pipeline_runs failed`, ปล่อย lock, exit 1 | "ตรวจไม่สำเร็จ" |
| MERGE ล้ม | `[CRITICAL]`, บันทึก failure "active table left untouched", ไม่ fallback เป็น overwrite | FAILED |
| POST_LOAD ล้ม | exception ไม่ถูกจับ (lock ปล่อยโดย `lock_protector`) — ข้อมูลโหลดไปแล้ว แต่ raw ไม่ถูก archive | UI แสดงล้มเหลวทั้งที่ข้อมูลเข้าแล้ว |
| ES metadata ล้ม | print อย่างเดียว | ยัง SUCCEEDED |
| Lock ถูกใช้อยู่ | SKIPPED (exit 75) | "ข้าม เพราะมีรอบอื่นกำลังใช้ตารางนี้" |
| สถานะ run ใน UI | แสดงป้ายสถานะ ไม่แสดงจำนวนแถวหรือข้อความ error (`RunStatusLine.jsx`) | |

ไม่มีตัวกู้ run ที่ค้าง RUNNING/QUEUED (queue อยู่ในหน่วยความจำ daemon รีสตาร์ทแล้ว QUEUED ค้างและยังบล็อกการอัปโหลดซ้ำ)

## 5.8 Flow จริง

```
ข้อมูลหลัง transform (Spark)
 ├─ แยกระดับแถว: Valid / Invalid                                        (Dev rules)
 ├─ Invalid ──► ลบแถวของ ingest_id เดิม ──► append → Delta /data/quarantine   [ทำก่อน]
 ├─ Valid   ──► MERGE (PK) → Delta /data/active ; ล้มเหลว = fail-closed
 ├─ POST_LOAD: คิด quality_score หลังโหลด ──► alert / state=warnings / ตัดสิน Gold   (ไม่ขวางโหลด)
 ├─ เขียน ES: quality_runs · lineage_runs · pipeline_runs
 ├─ ถ้า score ≥ threshold: spawn Gold rebuild (subprocess ไม่ตรวจผล)
 ├─ archive raw ; ปล่อย lock
 └─ daemon: ถ้า quarantine > 0 ──► auto-remediation (LLM) ──► รันซ้ำ ingest เดิม (1 รอบ/ตาราง)
```

---

# ข้อ 6 — การใช้ประโยชน์จากข้อมูล

## 6.1 หน้า UI และสิ่งที่แต่ละหน้าทำจริง (`App.jsx:99-112`)

| Route | หน้า | ทำอะไร / API ที่เรียก | สถานะ |
|---|---|---|---|
| `/` | Home | สถานะบริการ (`/services/status`), KPI (`/kpi/stats`), badge proposal | REAL (badge นับตัวอย่าง 3 รายการเมื่อ ES ว่าง) |
| `/ingestion` | Ingestion | ingest ไฟล์/DB จริง; แท็บ API/Stream จำลอง | REAL / UI ONLY |
| `/rules` | Rules Config | CRUD กฎ, AI proposal (สร้าง/อนุมัติ/ปฏิเสธ), ตั้งค่า Groq | REAL (มีป้าย "ตัวอย่าง") |
| `/pipeline` | Jobs & Pipelines | ดู run, retry, rebuild Gold, benchmark | REAL |
| `/export` | Workspace Exports | preview/ดาวน์โหลด CSV (active/quarantine/raw/gold), banner trust-check | REAL (มีค่า fallback 9400/100/600/93.1) |
| `/dashboard` | Dashboards (4 แท็บ) | Executive, Business Impact, Data Quality, Technical | **PARTIAL** (ปนข้อมูลจริงกับ MOCK) |
| `/dashboard-builder` | Create Dashboard (AI) | ดูข้อ 6.2 | **REAL** |
| `/analytics` | Query & Metrics | projection, clustering, impact, recommendations | PARTIAL |
| `/schema` | Catalog | อนุมัติ/ปฏิเสธการเปลี่ยน schema | REAL |
| `/whitebox` | Audit Trail | pandas pipeline บนชุดคะแนนนักเรียน | REAL (ข้อมูลตายตัว) |

## 6.2 Create Dashboard (AI) แบบ end-to-end — REAL

```
UI (DashboardBuilder.jsx)  4 ขั้น: เลือก dataset → ดูตัวอย่าง → เขียนความต้องการ+กลุ่มผู้ชม → แดชบอร์ด
 ① GET  /dashboards/datasets        dashboards.py:73   รายการจาก /data/active (Delta ที่ผ่าน gate แล้ว) + dataset เสมือน _quality_runs
 ② GET  /datasets/{t}/preview       profile + 20 แถว
 ③ โหลดตารางทั้งก้อนเข้า API ผ่าน WebHDFS+pandas (cache 120 วินาที, ไม่เกิน 4 เฟรม)  dashboard_data.py:157-171
 ④ POST /generate                   dashboards.py:85
      dashboard_llm.generate_spec() → Groq (openai/gpt-oss-120b, temp 0.2, timeout 20 วินาที, retry 1 ครั้ง)
      ส่งเฉพาะ: ชื่อ dataset, ความต้องการ, profile (ชื่อคอลัมน์, ชนิด, distinct, missing%, min/max ตัวเลข/วันที่)
      ไม่ส่ง: แถวข้อมูลและค่าหมวดหมู่ใด ๆ ; คอลัมน์ที่ดูเป็น identifier จะไม่ส่ง min/max
      ถ้าไม่มี key/ล้ม/spec ไม่ผ่าน → fallback_spec() แบบกฎอัตโนมัติ
 ⑤ validate_spec()  dashboard_spec.py:191   whitelist ชนิด widget/aggregation/time grain, จำกัด 16 widget/6 filter, ตัดคอลัมน์ที่ไม่มีจริง
 ⑥ compute_dashboard()  dashboard_compute.py:211   pandas คำนวณ KPI/bar/line/area/pie/table — LLM ไม่ได้สร้างตัวเลข
 ⑦ แสดงผล  DashboardCanvas (grid 12 คอลัมน์) + Recharts
 ⑧ โต้ตอบ  POST /render (กรอง/คลิกกราฟ drill), POST /refine (สั่งแก้ด้วย LLM, ได้รายการ changes, สูงสุด 50 ครั้ง)
 ⑨ บันทึก  POST/PUT /saved → ES sdoqap_dashboards (เก็บ spec ไม่ใช่ตัวเลข; เปิดซ้ำจะ render ใหม่ จึงสดตามข้อมูลปัจจุบัน)
```

**ผู้ใช้ตรวจผลได้อย่างไร:** ตัวนับ `rows_after_filter / rows_total`, ตัวอย่าง 20 แถวในขั้นที่ 2, widget ตารางที่แสดงแถวจริงและ `total_rows`,
แบนเนอร์บอกว่าใช้ `groq (<model>)` หรือ `rules` พร้อม warnings ของ widget ที่ถูกตัด, และเทียบกับ CSV จาก `/export/active/{table}`
**มี test** ฝั่ง API 8 ไฟล์ (`services/api/tests/test_dashboard_*.py`, `test_dashboards_*.py`) และ UI 3 ไฟล์ (ยังไม่ได้รัน)
**ข้อจำกัด:** โหลดทั้งตารางเข้าหน่วยความจำ API ไม่มี cap จำนวนแถว (API memory limit 2G); refine ต้องใช้ LLM (ไม่มี fallback); แดชบอร์ดที่บันทึกใช้ร่วมกันได้ทุกผู้ใช้ที่ล็อกอิน (ไม่มี permission รายแดชบอร์ด)

## 6.3 รายการตามที่ถามทีละหัวข้อ

### Dashboard
- **Grafana — PARTIAL:** มี datasource `SDOQAP_Elasticsearch` (`infra/grafana/provisioning/datasources/elasticsearch.yaml`) และ alert rules เท่านั้น **ไม่มี dashboard JSON/provider**
  UI ไม่ลิงก์ไป Grafana (grep `grafana|iframe|kibana|prometheus` ใน `services/ui/src` ไม่พบ) ผู้ใช้ต้องสร้าง panel เองใน Grafana (admin/admin ใน compose)
- **หน้า `/dashboard` — PARTIAL:** ดูข้อ 6.4
- **Create Dashboard (AI) — REAL**

### KPI — REAL (บางตัวติดป้ายผิด)
- แหล่ง: `sdoqap_quality_runs`, `sdoqap_pipeline_runs`, `sdoqap_schema_drifts` ผ่าน `/kpi/stats` และ `/executive/overview` (`analytics.py:12-377`)
- ที่คำนวณจริง: Data Health Score (เกณฑ์ 95/88), Pipeline SLA availability (สัดส่วน run ที่ไม่ล้มเหลว), freshness (สัดส่วน lag ≤ 1 ชม.), COPDQ (`analytics.py:673-766`)
- ข้อควรรู้: `mttd_minutes` คือเวลา pipeline เฉลี่ย ไม่ใช่เวลาตรวจพบปัญหา; การ์ด **Sell-In/Out Gap เป็น MOCK**; การ์ด Completeness/Validity อาจใกล้ 0 เพราะ key ใน `data_quality_breakdown` (`null_primary_key`, `missing_values`, `invalid_type`...) ไม่ตรงกับเหตุผลจริงที่ engine เขียน (`missing_primary_key`, `null_value_in_<col>`, `invalid_type_<col>`) มีเพียง `duplicate_records` ที่ตรง (อนุมานจากโค้ด); การ์ด "Consistency" แสดงคะแนนสุขภาพรวมกับข้อความตายตัว "Cross-table checks OK" (`Dashboard.jsx:1181`)
- COPDQ มี 2 โมเดลต้นทุนที่ไม่ตรงกัน: `analytics.py:704-721` ($2/แถว, `rows×0.05×50`, risk ตาม drift) กับ Gold ($11/แถว ฮาร์ดโค้ด `spark_gold_layer.py:48`)

### Data Visualization

| ที่ | กราฟ | ข้อมูล | จริงหรือไม่ |
|---|---|---|---|
| Builder | bar/line/area/pie/donut/KPI/table (Recharts) | pandas บนตารางที่เลือก | REAL |
| Dashboard Executive | SLA bars + area trend | `/anomaly/sources` (ค่า quality_score ล่าสุด 12 รายการ) | PARTIAL: **แกนเวลาถูกสร้างขึ้น** `now − (11−i)×10 นาที` ไม่ใช่เวลา run จริง (`analytics.py:383-387`) |
| Dashboard Business | Sell-In vs Sell-Out | `/analytics/sell-in-out` | **MOCK** (timeline 7 วันฮาร์ดโค้ด `analytics.py:799-807`; โค้ดมี TODO และ `is_example: True`) |
| Dashboard Data Quality | leaderboard + การ์ดมิติ | `/quality?limit=50` | REAL (มีข้อควรระวังเรื่อง key ข้างบน) |
| Dashboard Technical | ECharts lineage graph | run ที่เลือก / `/whitebox/state` | PARTIAL (จำนวนจริง แต่มีค่าตั้งต้น 10100/600/93.1 และโหนดตกแต่ง) |
| Analytics | forecast + confidence band | `/analytics/projection` | PARTIAL: วัน 1–7 จาก regression, วัน 8+ ขยายต่อฝั่งเบราว์เซอร์ (หน้าเว็บแจ้งไว้) |
| Analytics | error clusters | `/analytics/clustering` | PARTIAL (จับคีย์เวิร์ดแล้วตั้งชื่อ source เช่น "Database Sync" เป็นการเดา) |

### Data Analytics — PARTIAL
- Projection: linear regression ของ `quality_score` 10 ค่าล่าสุด, band โตตาม horizon, Stability Index `100−4σ`, ความน่าจะเป็นฝ่าฝืน SLA ด้วย normal CDF (`analytics.py:460-597`)
- Clustering: รวม `quarantine_breakdown` แล้ว map substring → ชื่อกลุ่ม (`analytics.py:599-671`)
- Whitebox downstream: pass rate, เกรด, ช่วงคะแนน, benchmark precision/recall/F1 เทียบ `ground_truth.csv` (`whitebox.py:740-944`)
- Gold: เป็นข้อมูลสรุปของ metadata ไม่มีกราฟใดใช้ ใช้ในตารางพรีวิว/ CSV ของหน้า Export เท่านั้น และ rebuild ต้องกดปุ่ม/trigger หลังรันผ่าน (ไม่มี schedule)

### Business Insight — PARTIAL
`/executive/overview` (`analytics.py:166-307`) ผสมตัวเลขจริง (จำนวน quarantine/drift/run ล้มเหลว, COPDQ) กับข้อความและระยะเวลาฮาร์ดโค้ด
เช่น "รายงานผู้บริหารรอบเช้าล่าช้า 25 นาที", ระยะเวลาปัญหา "24 mins/45 mins/1 hr 12 mins", แถว "Duplicate Transactions" ที่เป็น Normal/Resolved เสมอ และการจับคู่ business area กับชื่อ dataset `users`/`grocery_sales`/`products`

### Monitoring — PARTIAL
- จริง: feed กิจกรรมรวม 3 index (`system.py:212-288`), probe พอร์ต 11 บริการ (`system.py:42-84`), CPU/Mem จาก `/proc`
- `/performance/metrics` สร้างประวัติ CPU/Mem สังเคราะห์ และไม่มีหน้าใดเรียก
- Prometheus มีไฟล์ config (`infra/prometheus/prometheus.yml`) แต่ **ไม่มี service ใน compose/swarm** และ Grafana ไม่มี Prometheus datasource → ไม่ได้ deploy

### Data Quality Monitoring และ Alert — PARTIAL
| ช่องทาง | เงื่อนไข | ส่งออก | สถานะ |
|---|---|---|---|
| Spark engine | score < threshold, Z-score อัตรา quarantine > 3.0, schema drift | `send_n8n_alert` → `alert_router` + n8n webhook | REAL ในโค้ด; ส่งถึงปลายทางต้องตั้ง `SLACK_WEBHOOK_URL`/`LINE_NOTIFY_TOKEN` ซึ่ง `.env.example` ไม่ได้ระบุ (ไม่ตั้ง = พิมพ์ log เท่านั้น `alert_router.py:83-88`) |
| n8n polling | ทุก 15 นาที: quarantine > 0 หรือ score ต่ำกว่าเกณฑ์ | `POST /system/alert` | PARTIAL: compose ไม่ได้ import workflow ให้ ต้อง import เอง |
| Grafana rules | quality_score < 80; quarantined_records > 0 เฉลี่ย > 20 | webhook → `/system/alert` | PARTIAL: กฎที่ 2 ข้อความบอก "20% ของ records" แต่คำนวณเฉลี่ยจำนวน ไม่ใช่อัตรา; ไม่ยืนยันว่า Grafana ยอมรับ rule model/uid ตรงกัน |
| trust-check API | score ≥ threshold และไม่มี proposal ค้าง | JSON `SAFE/WARNING_SUSPECT/HALT_INGEST` | REAL |

### Recommendation
- `/analytics/recommendations` (`analytics.py:833-891`): กฎตายตัว 3 แบบ (`NOTIFY_DEV`, `HALT_INGEST`, `RESTORE_BACKUP`) หน้าเว็บระบุว่า "ไม่ใช่คำแนะนำจากโมเดล AI" — ข้อความ REAL
- ปุ่ม "นำไปใช้" — **UI ONLY**: แค่เซ็ต state + toast แล้ว POST `/whitebox/state {confirm_rules:true}` ซึ่ง backend เก็บแค่เวลา `confirmed_at` (`Analytics.jsx:32-41`, `whitebox.py:1471`) ไม่มี endpoint ที่ halt/แจ้ง dev/restore จริง
- AI rule proposals + remediation tickets: REAL และมีคนอนุมัติ; ถ้า ES ไม่มีข้อมูลจะแสดงตัวอย่าง 3 รายการที่มี `is_example` (อนุมัติแล้วไม่เปลี่ยนอะไร) ; โครงสร้าง rule จาก LLM ไม่ตรงกับที่ขั้นอนุมัติ merge (ต้องมี `rule_path`) จึงอนุมัติแล้วอาจไม่มีผลต่อ `rules_config.json` (`promoted_count` = 0)

### AI / LLM — ใช้ที่ไหน ส่วนไหน LLM ส่วนไหนกฎตายตัว

| ฟีเจอร์ | โมเดล | ส่งอะไรให้ LLM | ส่วนที่ไม่ใช่ LLM / guard |
|---|---|---|---|
| Dashboard builder (generate/refine) | Groq `openai/gpt-oss-120b` (หรือค่าที่บันทึกไว้) | profile คอลัมน์ + ข้อความผู้ใช้ (ไม่มีแถว/ค่าหมวดหมู่) | validate/layout/คำนวณ/diff/fallback ทั้งหมดเป็นโค้ด |
| AI context บน Dashboard | Groq (model ฮาร์ดโค้ด, timeout 12 วินาที) | ข้อความข้อเท็จจริงที่คำนวณจากกฎ | ข้อความหลักเป็นกฎ; LLM เรียบเรียง 7 คีย์; มีป้าย "โดย AI" เมื่อสร้างจริง (`whitebox.py:1774-1856`) |
| AI rule advisor (ใน Spark) | Groq → Ollama `qwen2.5:3b` → heuristic | ตัวอย่าง quarantine ≤ 20 แถว (ปิดบังคอลัมน์ที่เป็น identifier) | ผลเป็น `PROPOSED` ต้องมีคนอนุมัติ; decision tree เป็น Spark ML ไม่ใช่ LLM |
| Auto-remediation | Ollama → Groq | ตัวอย่าง quarantine 5 แถว **ไม่มีการปิดบัง** (รวมถึงตอน fallback ไป Groq cloud) | บังคับใช้เมื่อ `confidence ≥ 0.80` โดยไม่ต้องมีคนอนุมัติ |
| Alert, anomaly, forecast, COPDQ | **ไม่ใช้ LLM** | — | Z-score, linear regression, keyword clustering |

หมายเหตุ: Ollama ผูกกับ compose profile `ai` และไม่พบสคริปต์ที่ pull โมเดล `qwen2.5:3b` (ถ้ายังไม่ pull ระบบจะตกไป heuristic — ยังไม่ได้ยืนยันตอนรัน)

### Decision Support — การกระทำที่ทำได้จริง
trust-check API · ดาวน์โหลด CSV (clean/quarantine/gold) · อนุมัติ/ปฏิเสธ schema drift และ AI rule · resolve ticket · retry run · แก้กฎ · บันทึกแดชบอร์ด · review รายแถวใน whitebox
ส่วนที่เป็นประมาณการ: ตัวเลข COPDQ (ค่าคงที่สมมติ), forecast (regression ≤ 10 จุด), คะแนนสุขภาพรายพื้นที่ธุรกิจ

## 6.4 REAL เทียบกับ UI ONLY / MOCK (เช็คลิสต์)

| รายการ | ที่อยู่ | ประเภท |
|---|---|---|
| Sell-In vs Sell-Out timeline + ยอดสรุป | `analytics.py:776-831` (สำเนาใน `Dashboard.jsx:79-97`) | MOCK |
| การ์ด KPI "Sell-In/Out Volume Gap" (ไม่มีป้ายตัวอย่าง) | `Dashboard.jsx` ส่วน hero | MOCK ที่แสดงเป็น KPI |
| narrative/ระยะเวลาปัญหาของ business insight | `analytics.py:176-301` | MOCK/ฮาร์ดโค้ด |
| แกนเวลาของกราฟ anomaly | `analytics.py:383-387` | สร้างขึ้น |
| ปุ่ม "นำไปใช้" ของ recommendation | `Analytics.jsx:32-41` | UI ONLY |
| AI proposal ตัวอย่าง 3 รายการ | `dynamic_rules.py:383-420` | MOCK (มีป้าย) |
| ค่าสำรอง 9400/100/600/93.1 | `DataExport.jsx:77-80`, `EchartsDataLineage.jsx:9-12` | ฮาร์ดโค้ด |
| "Consistency: Cross-table checks OK" | `Dashboard.jsx:1181` | ข้อความล้วน |
| metadata ของ lineage node (Spark 14.8 วินาที, "2 Workers 4 Cores 8GB", n8n 1.0.5, `prod-db-replica`, "Parquet/Snappy", "JSON-Lines/Gzip", CDC) | `lineage.py:156-301` | MOCK (ของจริงคือ CSV + Delta) |
| `/performance/metrics` | `system.py:174-177` | MOCK (ไม่มี UI เรียก) |
| Grafana dashboards / Prometheus ที่รัน | — | NOT FOUND |
| n8n workflow import อัตโนมัติ / ตัวแปร Slack-LINE | — | NOT FOUND |
| backend ของ HALT_INGEST/NOTIFY_DEV/RESTORE_BACKUP | — | NOT FOUND |
| `seed_es.py` ข้อมูลสังเคราะห์ | `services/api/seed_es.py` | MOCK (รันมือเท่านั้น) |

**ข้อสังเกตด้านการเข้าถึงข้อมูล:** route `/export/gold/*`, `/export/tables`, `/quality`, `/analytics/*`, `/gold/*` ไม่พบ dependency `require_session`
(ต้องล็อกอิน: `/dashboards/*`, `/export/records`, `/export/preview|raw|active|quarantine|reddit` ซึ่งเพิ่มการบังคับ login เมื่อ 2026-10-08 โดยยังส่งทุกคอลัมน์ไม่ปิดบังตามที่ตั้งใจ และ endpoint ที่เขียน) ควรรู้ไว้เผื่ออาจารย์ถามเรื่องความปลอดภัย

---

# 7. System Actual Workflow (จากโค้ดจริงทั้งระบบ)

ตัวย่อผู้ทำงาน: **U**=User · **API**=FastAPI · **n8n** · **D**=Spark trigger daemon · **S**=Spark engine · **Dev**=กฎฮาร์ดโค้ด · **LLM**

```
[แหล่งข้อมูล]  CSV/Excel (U) · REST API (U/n8n) · PostgreSQL (U/n8n) · [n8n schedule ทุก 30 นาที: แหล่งตายตัว]
        │
        ▼  EXTRACTION / INGESTION  (ข้อ 3)
 API  ตรวจ auth · ชื่อตาราง · ขนาด ≤200MB · ไฟล์ว่าง · SSRF/SQL guard · SHA-256 ซ้ำ · PK ในหัวไฟล์        [Dev]
 API  แปลง Excel/JSON/DB → CSV  →  เขียน raw → HDFS /data/raw/<table>/<ingest_id>/  (retry 5)
 API  สร้าง sdoqap_runs (QUEUED)  →  เรียก daemon /retry
        │
        ▼  ORCHESTRATION
 D    คิว FIFO ต่อ 1 ตาราง → spark-submit → state RUNNING
 S    ขอ lock ใน ES (heartbeat 60 วินาที, fail-closed)
        │
        ▼  TRANSFORMATION + VALIDATION  (ข้อ 4)
 S    อ่าน raw เป็น string → [ALIGN] schema_align
 S    [TRANSFORM] schema_drift → auto_clean (DSL ที่ User/LLM กำหนด + ลบซ้ำ) → validation → dedup
      → standardize_dates → standardize_categories → range_rules → anomaly_iqr → anomaly_zscore → anomaly_induced
 S    แยก Valid / Invalid (ระดับแถว)  → quarantine_assembly → column_filter
        │
        ▼  LOADING  (ข้อ 5)
 S    Invalid → Delta /data/quarantine (ลบ ingest_id เดิมก่อน)
 S    Valid   → Delta MERGE ตาม PK → /data/active
        │
        ▼  DATA QUALITY (หลังโหลด)
 S    [POST_LOAD] distribution · quarantine_breakdown · copdq · freshness · quality_score · ai_advisory[LLM] · operational_impact · report
 S    เขียน ES: quality_runs · lineage_runs · pipeline_runs  →  alert ถ้า score < threshold / drift
 S    ถ้า score ≥ threshold → rebuild Gold (metadata aggregates → ES sdoqap_gold_*)
 S    archive raw → /data/archive ; ปล่อย lock
 D    ถ้า quarantine > 0 → auto_remediation [LLM สร้างกฎ, confidence ≥ 0.80] → รันซ้ำ ingest เดิม (1 รอบ) ; อัปเดต state SUCCEEDED/FAILED/SKIPPED
        │
        ▼  UTILIZATION  (ข้อ 6)
 U    Create Dashboard (AI): API อ่าน Delta active → LLM ออกแบบ spec → pandas คำนวณ → ES sdoqap_dashboards
 U    Export CSV · trust-check · Dashboards/Analytics (ES metrics) · อนุมัติ schema/rule · retry · แก้กฎ
 Grafana อ่าน ES (มีแค่ datasource + alert rules; ไม่มี dashboard)

[เส้นแยก] Reddit: U → API → D → Kafka → Spark Streaming → Parquet + ES  (ไม่เข้า quality engine)
```

**ใครทำอะไร:**
- **Dev** — กฎ validation, ลำดับ stage, สูตรคะแนน, SSRF/SQL guard
- **User** — อัปโหลด/สั่ง ingest, ตั้งกฎ (`range_checks`, `value_range`, DSL), อนุมัติ schema/rule/proposal, สร้างและบันทึกแดชบอร์ด
- **System/Spark** — อนุมาน schema+PK, drift, anomaly, MERGE, คำนวณ metrics
- **LLM** — ออกแบบ dashboard spec (ต้องผ่าน validation), เสนอกฎ (advisor, ต้องมีคนอนุมัติ), สร้างกฎ remediation (บังคับใช้อัตโนมัติ), เรียบเรียงข้อความ AI context
- **n8n** — ตั้งเวลา ingest แหล่งตายตัว, relay webhook, ส่ง alert (ต้อง import workflow เอง)

---

# 8. จุดที่เอกสาร/UI ในโปรเจกต์พูดไม่ตรงกับโค้ด (เผื่ออาจารย์ถาม)

| ที่ | ข้อความ/ที่มา | ความจริงในโค้ด |
|---|---|---|
| `README.md:230` | host ว่างหมายถึงอนุญาตทุก host | โค้ด fail-closed: ไม่ตั้ง `API_INGEST_ALLOWED_HOSTS` อนุญาตเฉพาะ data.go.th (`ingest_guards.py:23-37`) |
| UI แท็บ API / Stream | ดูเหมือน ingest จริง | เรียก endpoint จำลอง ช่อง broker/topic/group ไม่มีผล |
| Home "Kafka Ingesting" | ดูเหมือนมีข้อมูลไหล | เป็นผลเช็ค TCP port |
| `docs/presentation/03-rubric-scorecard.md:84` | "ยอดตรงกัน 10,000 = 9,370 + 630" เป็นหลักฐานความครบถ้วน | `total` = clean + quarantine เสมอ (`assembly.py:45`) พิสูจน์ความสอดคล้องภายใน ไม่ได้เทียบต้นทาง (docs เองก็ระบุช่องว่าง 100 แถว) |
| `docs/presentation/03-rubric-scorecard.md:145` (FR-09) | เขียน staging แล้ว rename เข้า active | ไม่ได้ทำ ใช้ Delta MERGE |
| `docs/presentation/01-system-explainer.md:108` | Idempotent: รันซ้ำผลเท่าเดิม | จริงสำหรับ active ตาม PK; ไม่จริงสำหรับ quarantine เส้นเก่า/n8n, ES metadata, ยอดรวม Gold |
| `docs/architecture/data_flow.md` | Great Expectations, dbt, Airflow | ไม่พบในโค้ด/compose |
| `docs/architecture/*` | quarantine เป็น HDFS CSV | เขียนเป็น Delta |
| `docs/architecture/schema_drift_governance.md` | gate ตามคะแนนความรุนแรง ≤ 4 | gate จริง = ทุกการเปลี่ยนเป็นคอลัมน์ใหม่ + policy (`schema.py:174-190`) |
| `ConfigGuide.jsx:203-217` | แจ้งเตือนทันทีเมื่อ null เกิน tolerance | engine ปฏิเสธทุก NULL และไม่มี alert tolerance (`null_checks` แค่ profile) |
| `ConfigGuide.jsx:245,483` | `value_range` mode auto/manual และ iqr ต่อคอลัมน์ | รันเฉพาะ `auto`/`adaptive`; override ต่อคอลัมน์ไม่ถูกอ่าน |
| `schema.py:67` | "12.00" ไม่กลายเป็น null | regex ทำให้กลายเป็น `1200` (จากการอ่านโค้ด) |
| `cleansing.py:129` | เก็บแถวล่าสุด | ไม่รับประกันด้วย `dropDuplicates` หลัง `orderBy` |
| `rules_config.json` ฟิลด์ `ai_advisor.model` | ระบุโมเดล | ถูกละเลย (อ่านจาก ES settings/env) |
| `scripts/tests/test_ingest.py` | ทดสอบ ingest | payload/route/ตารางไม่ตรง workflow จึงผ่านไม่ได้ตามที่เขียน |

---

# 9. สิ่งที่ยังไม่ได้ยืนยัน (ต้องรันระบบจริง)

- พฤติกรรมตอนรัน Spark/Delta/ES ทั้งหมด (เอกสารนี้อ่านจากโค้ด)
- Spark ตัด UTF-8 BOM ที่หัวคอลัมน์แรกหรือไม่
- ค่า default page size ของ CKAN เมื่อไม่ส่ง `limit`
- OPTIMIZE ZORDER ล้มเหลวกับตารางที่ไม่มี `row_hash` จริงหรือไม่
- retention ลบโฟลเดอร์ partition ของ Delta quarantine แล้วทิ้ง reference ค้างใน `_delta_log` หรือไม่
- Grafana ยอมรับ alert rules และ `datasourceUid` ตรงกันหรือไม่
- Ollama pull โมเดลแล้วหรือยัง; Groq/Slack/LINE เข้าถึงได้หรือไม่
- ผลของ unit/integration test (ไม่ได้รัน)

---

*ไม่มีการให้คะแนนในเอกสารนี้ ตามที่ผู้ใช้กำหนด*
