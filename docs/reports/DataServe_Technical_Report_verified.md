# รายงานทางเทคนิค DataServe (ฉบับตรวจทานกับระบบจริง)
## ระบบบริหารจัดการ บริการข้อมูล และประกันคุณภาพข้อมูล (ชื่อโค้ดใน repo: SDOQAP)

**เวอร์ชันเอกสาร**: ตรวจทานกับโค้ดและหลักฐานใน repo ณ 8 ตุลาคม 2569 (branch `feat/generic-profiling-rule-engine`, commit `33ff867`)
**ที่มา**: ปรับจากรายงานฉบับเพื่อน แล้วแก้ให้ตรงกับโค้ด `docker-compose.yml`, `services/*` และไฟล์ใน `docs/evaluation/evidence/` ทุกตัวเลขในบทที่ 6 มาจากการรันจริง ไม่มีตัวเลขที่ประมาณขึ้นเอง ข้อที่ยังไม่มีหลักฐานระบุไว้ในหัวข้อ "ข้อจำกัดและสิ่งที่ยังไม่ได้พิสูจน์"

---

## ข้อมูลทั่วไป

| หัวข้อ | ค่าจริงในระบบ |
|---|---|
| ประเภทระบบ | แพลตฟอร์มตรวจคุณภาพข้อมูลแบบ white-box บนสถาปัตยกรรม Medallion (Bronze, Silver Active, Silver Quarantine, Gold) |
| Compute | Apache Spark **3.4.1** (`bitnamilegacy/spark:3.4.1`), Python ใน container Spark |
| Storage | HDFS (Hadoop **3.2.1**), Delta Lake **2.4.0** |
| Index และ Governance Store | Elasticsearch **8.10.2** และ Kibana 8.10.2 |
| API | FastAPI บน Python 3.10 |
| UI | React 18 + Vite 5 (หลัง nginx) |
| Orchestration | n8n (ตั้งเวลา เรียก API ด้วย `X-Service-Key` และรับ webhook แจ้งเตือน) |
| Streaming | Kafka (Confluent 7.5.0) + Zookeeper, Spark Structured Streaming (`streaming_job.py`) |
| LLM | Groq `openai/gpt-oss-120b` เป็นค่าเริ่มต้น (ตั้งผ่าน `GROQ_MODEL`) และ Ollama ในเครื่องเป็นตัวเลือก (profile `ai`) |
| Container | **16 ตัว** เมื่อเปิดครบตาม `.env` (`COMPOSE_PROFILES=streaming,ai,tools`) เส้นทางหลักใช้ 8 ตัว |

---

# บทที่ 1 บทนำ

## 1.1 ปัญหา
ท่อ ETL แบบเดิมมีปัญหา 3 ข้อที่ระบบนี้ตั้งใจแก้:
1. **กฎฝังในโค้ด**: เมื่อชนิดข้อมูลหรือคอลัมน์เปลี่ยน pipeline พัง
2. **ข้อมูลเสียหลุดเงียบ**: แถวที่ผิดผ่านไปถึงรายงานโดยไม่มีใครรู้
3. **ทิ้งแถวโดยไม่เก็บหลักฐาน**: ตรวจย้อนหลังไม่ได้ว่าทิ้งเพราะอะไร

## 1.2 วัตถุประสงค์
1. นำเข้าข้อมูลหลายชนิดแหล่ง และตรวจคุณภาพด้วย Spark บน Delta Lake
2. แยกแถวผ่านเกณฑ์ลง Silver Active และแถวไม่ผ่านลง Quarantine พร้อมเหตุผลทุกแถว (ไม่ทิ้งเงียบ)
3. สร้างกฎจากโปรไฟล์ข้อมูลจริงและอธิบายเหตุผลของกฎ (white-box) ให้คนอนุมัติได้
4. ใช้ AI ช่วยเสนอกฎและตีความ โดยไม่ให้ AI คำนวณตัวเลขของ dashboard
5. แปลงปัญหาคุณภาพเป็นตัวชี้วัดผลกระทบ (COPDQ)

## 1.3 ขอบเขตและข้อจำกัดของระบบ
- **แหล่งข้อมูล**: CSV/Excel, REST API (JSON/CSV, มี resolver สำหรับ data.go.th), PostgreSQL (SELECT แบบ read-only) และ stream จาก Reddit ผ่าน Kafka
- **การใช้งาน**: ผู้ดูแลระบบคนเดียว (ล็อกอินจากค่า `ADMIN_USERNAME` / `ADMIN_PASSWORD` ใน env) ยังไม่มี RBAC หลายบทบาท
- **การติดตั้ง**: Docker Compose บนเครื่องเดียว ยังไม่มี Helm chart หรือ Kubernetes manifest ใน repo

---

# บทที่ 2 ข้อมูลและสภาพแวดล้อม

## 2.1 ช่องทางนำเข้า (4 แหล่งข้อมูล)

| ชนิด | จุดเข้า | หมายเหตุ |
|---|---|---|
| file | `POST /api/v1/pipeline/ingest/csv` | CSV และ Excel ตอบ 202 พร้อม `ingest_id` |
| api | `POST /api/v1/pipeline/ingest/api` | allowlist URL แบบ fail-closed |
| rdbms | `POST /api/v1/pipeline/ingest/rdbms` | รับเฉพาะ SELECT (read-only) |
| stream | `POST /api/v1/pipeline/ingest/reddit` (+ `/status`, `/stop`) | Reddit → Kafka → Spark Structured Streaming |

**n8n ไม่ใช่แหล่งข้อมูล** เป็นตัวตั้งเวลาและรับ-ส่งสัญญาณ: เรียก API ด้วย header `X-Service-Key` (ฝั่ง API ยอมรับเมื่อมี session cookie หรือ service key) และ endpoint `/api/v1/system/alert` ป้องกันด้วย `X-Webhook-Secret`

## 2.2 การป้องกันตอนนำเข้า (มีในโค้ด `pipeline.py`, `ingest_guards.py`, `run_registry.py`)
- แต่ละการนำเข้าได้ `ingest_id` และโฟลเดอร์ `/data/raw/<table>/<ingest_id>/` ของตัวเอง
- ตรวจ checksum ไฟล์ซ้ำ ถ้าไฟล์เดิมกำลัง `QUEUED/RUNNING` จะตอบ `duplicate` และไม่ส่งซ้ำ
- ตรวจคีย์หลักก่อนลง HDFS, จำกัดขนาดไฟล์
- หลังประมวลผลเสร็จ ย้าย raw ไป `/data/archive/<table>/<ingest_id>` ไม่ลบ

## 2.3 ขนาดข้อมูลที่ระบบเคยประมวลผลจริง
จาก `d-source-inventory.json` (นับจาก Elasticsearch):
- ประมวลผลผ่าน Spark แล้ว **187 รอบ** จาก **22 ตาราง** รวม **3,586,969 แถว** รอบใหญ่สุด **990,100 แถว**
- การนำเข้าที่ลงทะเบียน: file 15 ครั้ง (สำเร็จ 12) รวม 260,269,126 ไบต์, rdbms 1 ครั้ง (สำเร็จ 1)
- ไฟล์ข้อมูลใน `data/`: 33 ไฟล์ รวม 2,178,676 แถว (ชุดขยายสำหรับ benchmark เป็นสำเนาซ้ำ ไม่ใช่ข้อมูลใหม่)

ชุดข้อมูลที่ใช้ประเมินจริงในรายงานนี้:

| ชุดข้อมูล | แถว | คอลัมน์ | ที่มา |
|---|---:|---:|---|
| `dirty_dataset.csv` (คะแนนนักศึกษา) | 10,100 | 8 | `data/evaluation/original/` มี ground truth 700 แถวที่ผิดโดยตั้งใจ |
| `customers_{10k,50k,100k,500k}.csv` | 10,000 ถึง 500,000 | 10 | สังเคราะห์จาก `make_synthetic_customers.py` พร้อม ground truth |
| `drift/v1..v4` | 2,000 | ผันแปร | ชุดทดสอบ schema drift (เพิ่ม ลบ เปลี่ยนชนิด เปลี่ยนชื่อคอลัมน์) |

> ชุด Olist, `retail_transactions_raw` ที่กล่าวถึงในรายงานต้นฉบับ ไม่มีผลรันเป็นหลักฐานใน `docs/evaluation/evidence/` จึงตัดออกจากตารางผลลัพธ์

## 2.4 โปรไฟล์อัตโนมัติ
ทุกตารางได้โปรไฟล์ต่อคอลัมน์: ชนิดข้อมูล, null count และ null rate, distinct count, min, max, mean, median, Q1, Q3, IQR, fence ล่างและบน, จำนวน outlier และตรวจคีย์ซ้ำแบบ composite (ตัวอย่างจริง `d-profile-before.json`: 10,100 แถว, score ว่าง 305, score นอกช่วง 204, คีย์ซ้ำ 100, study_hours outlier 100)

---

# บทที่ 3 สถาปัตยกรรม

## 3.1 Container (16 ตัว)

| กลุ่ม | Container | หน้าที่ | Profile |
|---|---|---|---|
| เส้นทางหลัก | `sdoqap-nginx` | reverse proxy พอร์ต host `${NGINX_HOST_PORT:-80}` | ไม่มี |
| | `sdoqap-ui` | React/Vite (ไม่เปิดพอร์ตตรง) | ไม่มี |
| | `sdoqap-api` | FastAPI (`${API_PORT}:8000`) | ไม่มี |
| | `sdoqap-spark-master` | Spark master (7077), Spark UI (8081:8080), trigger daemon (8099) | ไม่มี |
| | `sdoqap-spark-worker` | Spark worker | ไม่มี |
| | `sdoqap-namenode` | HDFS NameNode (9870, RPC 9002:9000) | ไม่มี |
| | `sdoqap-datanode` | HDFS DataNode | ไม่มี |
| | `sdoqap-elasticsearch` | index และ governance store (9200) | ไม่มี |
| เสริม | `sdoqap-kibana`, `sdoqap-grafana`, `sdoqap-n8n`, `sdoqap-postgres` | สำรวจ log, กราฟระบบ, ตั้งเวลาและแจ้งเตือน, ฐานข้อมูลต้นทางตัวอย่าง | ไม่มี |
| | `sdoqap-pgadmin` | จัดการ Postgres | `tools` |
| | `sdoqap-ollama` | LLM ในเครื่อง | `ai` |
| | `sdoqap-zookeeper`, `sdoqap-kafka` | stream (host 9092 ต่อกับ 29092 ใน container) | `streaming` |

ปิดกลุ่มเสริมได้ด้วย `COMPOSE_PROFILES` ใน `.env`

## 3.2 ชั้นข้อมูล (Medallion)
| ชั้น | ที่เก็บ | เนื้อหา |
|---|---|---|
| Bronze | HDFS `/data/raw/<table>/<ingest_id>/` | ไฟล์ดิบตามที่รับ หลังรันย้ายไป `/data/archive/` |
| Silver Active | Delta `/data/active/<table>` | แถวผ่านเกณฑ์ เขียนด้วย `MERGE` (`whenMatchedUpdateAll` และ `whenNotMatchedInsertAll`) |
| Silver Quarantine | Delta `/data/quarantine/<table>` | แถวไม่ผ่าน พร้อม `reject_reason` เขียนแบบ idempotent: ลบตาม `ingest_id` แล้วเขียนใหม่ **ก่อน** MERGE |
| Gold | Elasticsearch | `sdoqap_quality_runs`, `sdoqap_pipeline_runs`, `sdoqap_runs`, `sdoqap_gold_daily_quality`, `sdoqap_gold_error_patterns`, `sdoqap_gold_financial_impact`, `sdoqap_gold_schema_drift`, `sdoqap_schema_registry`, `sdoqap_schema_proposals`, `sdoqap_rules_registry`, `sdoqap_ai_rule_proposals`, `sdoqap_upstream_remediations`, `sdoqap_run_locks` ฯลฯ |

บำรุงรักษา Delta: เปิด `autoOptimize.optimizeWrite` และ `autoCompact`; เมื่อถึงรอบที่ `should_optimize` กำหนด รัน `OPTIMIZE ... ZORDER BY (row_hash)` และ `VACUUM 168h`

## 3.3 กระบวนการ 21 stage (เส้นทาง Spark)
กำหนดด้วย decorator `@stage` ใน `services/spark/sdoqap/stages/` มี unit test ต่อ stage และจับเวลาใน `stage_seconds`

| ช่วง | Stage |
|---|---|
| align | `schema_align` |
| transform | `schema_drift`, `auto_clean`, `validation`, `dedup`, `standardize_dates` (รวม พ.ศ.), `standardize_categories`, `range_rules`, `anomaly_iqr`, `anomaly_zscore`, `anomaly_induced` (กฎที่เรียนจาก Decision Tree), `quarantine_assembly`, `column_filter` |
| post_load | `distribution`, `quarantine_breakdown`, `copdq`, `freshness`, `quality_score`, `ai_advisory`, `operational_impact`, `report` |

การจัดคิว: trigger daemon ทำ FIFO ต่อตาราง (ผลทดสอบอัปโหลดสองไฟล์ติดกันใน `b-e2e-ingest-check.txt`: ไฟล์ A รัน ไฟล์ B รอ `QUEUED` แล้วรันต่อเมื่อ A เสร็จ ทั้งคู่ `SUCCEEDED`) สถานะรอบ: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `SKIPPED` พร้อม lock ที่มี heartbeat

## 3.4 เอนจินโต้ตอบ (Whitebox)
เส้นทางที่สองใน `/api/v1/whitebox/*` สำหรับทดลองกฎทันที: อัปโหลดและโปรไฟล์, `recommend-rules` (สร้างกฎพร้อมเหตุผล "Why?" และการกระทำ `QUARANTINE`, `REVIEW` หรือ `WARNING`), `execute`, แยก 3 โซน (Clean, Human Review, Quarantine), multi-table analyze และ join, `run-all`, export CSV ต่อโซน เส้นทางนี้เก็บสถานะชุดเดียวร่วมกันทุกผู้ใช้ จึงเหมาะกับการสาธิตทีละคน

---

# บทที่ 4 การทำงานของแต่ละขั้น

## 4.1 Extraction
ดูหัวข้อ 2.2 หลักการกระทบยอด: ยอดนำเข้า = แถว Active + แถว Quarantine (+ แถวคีย์ซ้ำที่ `auto_clean` ตัดก่อนนับ ซึ่งมีหมายเหตุกำกับ) ตัวอย่างจริง: ไฟล์ 10,100 แถว ตัดคีย์ซ้ำ 100 เหลือ 10,000 → Active 9,370 + Quarantine 630

## 4.2 Transformation: ลำดับการตรวจ
ไม่ได้เป็น "4 ประตู" ตามรายงานต้นฉบับ แต่เป็นลำดับ stage ใน 3.3 โดยหลักคือ
1. จัดชื่อและชนิดคอลัมน์, ตรวจ schema drift, แก้อัตโนมัติด้วยกฎ DSL, ตรวจ null/ชนิด/วันที่
2. คัดแถวซ้ำตามคีย์และเก็บแถวล่าสุด
3. กฎช่วงค่าตามธุรกิจ (`range_rules`)
4. outlier ทางสถิติ: Tukey IQR (ค่า default ใน `dynamic_rules_engine.py` คือ **1.5×** บางตารางตั้ง 2.5 หรือ 3.0 ใน `rules_config.json`) และ Z-score (มีพื้น std 5% กัน false alarm)

## 4.3 Loading
```python
delta_table.alias("old").merge(source, key_condition) \
    .whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
```
(`spark_quality_engine.py` บรรทัด 1726 คีย์ตามที่ลงทะเบียนต่อตาราง) ตารางที่ไม่มีคีย์หลักที่ลงทะเบียนจะไม่ถูกตัดแถวซ้ำ (ดู `d-rdbms-ingest.json`: ตาราง `pg_student_scores` ไม่ตัดคีย์ซ้ำ 100 แถว ต่างจาก `student_course_scores`)

## 4.4 Governance
- **Schema drift**: stage `schema_drift` เทียบกับ `schema_registry.json` สร้าง proposal ที่หน้า `/schema` (approve, reject, approve-all, reject-all) อนุมัติอัตโนมัติเฉพาะการเพิ่มคอลัมน์
- **Standardize**: review queue สำหรับค่าที่จับคู่ไม่มั่นใจ (approve, override, reject) และ rollback
- **Dynamic Rules**: `/api/v1/rules` แก้กฎต่อตาราง และรับข้อเสนอกฎจาก AI ให้คนอนุมัติ
- **Lineage**: `/api/v1/lineage/{table}` และ `/{table}/trust-check` ให้ระบบปลายทางตรวจความน่าเชื่อถือของตาราง
- **Audit**: ประวัติรันทั้งหมดอยู่ใน Elasticsearch

---

# บทที่ 5 จุดเด่นทางวิศวกรรม

## 5.1 AI ไม่คำนวณตัวเลข (Dashboard Builder)
`services/api/app/api/dashboard_llm.py`: prompt มีเฉพาะ **โปรไฟล์คอลัมน์** (ชื่อ ชนิด จำนวน distinct/missing ช่วงค่า) และคำขอของผู้ใช้ **ไม่ส่งแถวหรือค่าหมวดหมู่ไปยัง LLM** LLM ตอบเป็น spec JSON แล้ว `dashboard_spec.validate_spec()` ตรวจและตัดทุกอย่างที่ไม่อยู่ในรายการที่อนุญาต (widget 7 ชนิด, aggregation 7 ชนิด: count, count_distinct, count_missing, sum, avg, min, max) จากนั้นตัวเลขคำนวณโดย query engine ฝั่ง API ไม่มี spec ใดถูกรันเป็นโค้ดหรือ SQL ถ้าไม่มี key หรือ Groq ล้มเหลว จะสร้าง spec ด้วยกฎ (rule-based) แทน

ฟีเจอร์ที่เกี่ยวข้อง: semantic layer ต่อตาราง (บทบาทคอลัมน์, หน่วย, สกุลเงิน, ธง PII ทั้งชื่ออังกฤษและไทย) ที่ต้อง approve, บันทึกและแก้ dashboard, ส่งออก CSV ของแถวที่กรอง (ค่าเริ่มต้นไม่รวมคอลัมน์ข้อมูลส่วนบุคคล และต้องเลือกยืนยันก่อนรวม)

## 5.2 การเยียวยาด้วย AI (สถานะจริง)
`services/spark/auto_remediation_engine.py` สุ่มแถวจาก Quarantine (สูงสุด 5 แถวต่อชุด) ให้ LLM เสนอกฎ DSL 4 ชนิด:

| ชนิด | รูปแบบ |
|---|---|
| `fillna` | เติมค่าคงที่ที่ไม่ใช่ null |
| `calculate` | คำนวณจากคอลัมน์อื่น (+ - * /) พร้อมเงื่อนไข |
| `cast` | แปลงชนิด (double, integer, string) |
| `filter` | กรองแถวด้วยเงื่อนไข |

ทุกกฎมีฟิลด์ `confidence` และบันทึกลง `sdoqap_rules_registry` กับ `rules_config.json` ตัวอย่าง DSL ในรายงานต้นฉบับ (`impute_median`, `set_absolute_value`, `group_by`) **ไม่มีในระบบ**

ส่วนวงจรปิดฝั่งต้นน้ำ: `/api/v1/system/remediations` ออกตั๋วงานพร้อมระบบเป้าหมายและคำแนะนำ และ `/{ticket_id}/resolve` ปิดตั๋ว (บันทึก `resolved_by`) แล้วเรียก `POST /retry` ของ trigger daemon (พอร์ต 8099, header `X-Trigger-Secret`) เพื่อประมวลผลตารางนั้นใหม่ ผลตอบกลับมี `spark_triggered` บอกว่าเรียก daemon สำเร็จหรือไม่ (เพิ่มใน commit `33ff867` ของเพื่อน ก่อนหน้านั้น endpoint นี้แค่ตั้งสถานะ `RESOLVED` ไม่ได้ trigger อะไร) ข้อสังเกต: ถ้าเรียก daemon ไม่สำเร็จ โค้ดกลืนข้อผิดพลาดและตอบ `spark_triggered: false` โดยตั๋วยังถูกปิดแล้ว

**ข้อจำกัดที่วัดได้** (`e-runs.jsonl`, 8 ต.ค. 2569): ในรอบทดสอบ 10,000 แถวสังเคราะห์ เมื่อรัน `auto_remediation_engine.py` ด้วยมือแล้วประมวลผลซ้ำ ได้ `rows_recovered_by_revalidation = 0` และเส้นทางอัตโนมัติถูกบล็อกเพราะ container Spark ไม่มีตัวแปร `ELASTICSEARCH_URL` ดังนั้น **ยังไม่มีหลักฐานอัตราการกู้คืนข้อมูล** (ตัวเลข 78.4% ในรายงานต้นฉบับไม่มีที่มา)

## 5.3 การเสนอกฎด้วยข้อมูลและ AI
- ปรับเกณฑ์ตามประวัติ (`dynamic_rules_engine.py`): tolerance ของ null = `max(null_rate x 1.5, 0.01)` ไม่เกิน 0.50
- ตรวจ distribution drift ด้วย PSI และโปรไฟล์ EMA (`data_profile_store.py`)
- เสนอกฎด้วย LLM หรือ heuristic (`ai_rule_advisor.py`, `/api/v1/rules/ai-proposals/*`) ต้องให้คน approve หรือ reject
- จัดหมวดข้อความแบบ hybrid similarity รองรับภาษาไทยไม่เว้นวรรค (`sdoqap/semantic/similarity.py`)

## 5.4 ที่เก็บแบบไฮบริด
Delta Lake เก็บข้อมูลแถวและรองรับ ACID กับ `MERGE`; Elasticsearch เก็บ metadata, ประวัติรัน, proposal และ metrics เพื่อค้นและรวมผลเร็ว

## 5.5 ความปลอดภัยและข้อมูลส่วนบุคคล (สถานะจริง)
- **Auth**: session cookie (HttpOnly, SameSite=lax, `secure` ตามค่าตั้ง) จากการล็อกอินผู้ดูแลระบบ เทียบรหัสด้วย `hmac.compare_digest`; n8n ใช้ `X-Service-Key`; webhook แจ้งเตือนใช้ `X-Webhook-Secret`
- **ต้องล็อกอิน**: ทุก endpoint ของ dashboards และ semantic, ส่วนที่เขียนหรือประมวลผลของ whitebox, และ route ส่งออกแถวระดับ row ของ Data Export (`preview`, `records`, `raw`, `active`, `quarantine`, `reddit`) ซึ่งยังไม่ปิดบังค่าตามการออกแบบ
- **PII ใน dashboard**: ไม่ส่งแถวให้ LLM (หัวข้อ 5.1) และ export ไม่รวมคอลัมน์ PII เป็นค่าเริ่มต้น
- **ช่องว่างที่ต้องปิด**: `auto_remediation_engine.py` ส่งตัวอย่างแถวจาก Quarantine ให้ LLM **โดยไม่มีขั้นตอนปิดบังข้อมูลส่วนบุคคล** (ค้นหา redact/mask/pii ในไฟล์นี้และ `ai_rule_advisor.py` ไม่พบ) รายงานต้นฉบับกล่าวว่ามี "PII Redactor" ซึ่งไม่เป็นจริงในส่วนนี้ ควรเพิ่มก่อนเปิดใช้กับข้อมูลที่มีตัวตนบุคคล

---

# บทที่ 6 ผลการประเมิน (จากการรันจริง)

> ไม่มีคะแนนรวม 100/100 ในฉบับนี้ รายงานต้นฉบับให้น้ำหนักและคะแนนโดยไม่มีหลักฐาน ฉบับนี้รายงานตัวเลขที่วัดได้พร้อมข้อจำกัด

## 6.1 ชุดคะแนนนักศึกษา 10,100 แถว (ground truth 700 แถว)

| การวัด | IQR 3.0× (ค่าที่ใช้) | IQR 1.5× |
|---|---:|---:|
| นำเข้า (หลังตัดคีย์ซ้ำ) | 10,000 | 10,000 |
| Active | 9,370 | 9,299 |
| Quarantine | 630 | 701 |
| TP / FP / FN / TN | 700 / 30 / 0 / 9,370 | 700 / 101 / 0 / 9,299 |
| Precision | **0.9589** | 0.8739 |
| Recall | **1.0** | 1.0 |
| Accuracy | 0.997 | 0.99 |
| เวลาใน engine | 98.5 วินาที | 66.6 วินาที |

ตรวจพบครบทุกชนิด: Missing Score 300/300, Invalid Score Range 200/200, Study Hours Outlier 100/100, Duplicate 100/100 false positive ส่วนใหญ่มาจาก Z-score ที่ 3.0 ถึง 4.1σ ค่า IQR ที่เหมาะสมขึ้นกับข้อมูล (ผลนี้ไม่ใช่ค่าที่ถูกต้องสำหรับข้อมูลทุกชนิด)

**เอนจินโต้ตอบ** (`d-whitebox-evaluation.txt`): 10,100 แถว ประมวลผล 881 มิลลิวินาที ได้ Clean 9,400 / Human Review 100 / Quarantine 600, คะแนนคุณภาพก่อน 93.07% หลัง 100%, ตรงกับ ground truth 100%

**Golden test** (แยก stage ออกจากโค้ดเดิม): 250 แถว ผลก่อนและหลังแยก stage ตรงกันทุกตัวเลข (Clean 227, Quarantine 23)

## 6.2 ชุดลูกค้าสังเคราะห์ (`e-runs.jsonl`, 8 ต.ค. 2569)

| ขนาด | แถวหลังตัดซ้ำ | Active | Quarantine | เวลา engine (วินาที) | แถว/วินาที | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10,000 | 9,800 | 8,855 | 945 | 74.9 | 131 | 0.924 | 0.588 | 0.719 |
| 50,000 | 49,000 | 44,329 | 4,671 | 74.9 | 655 | 0.933 | 0.587 | 0.720 |
| 100,000 | 98,000 | 88,691 | 9,309 | 99.4 | 986 | 0.939 | 0.589 | 0.724 |

อ่านผลอย่างตรงไปตรงมา:
- **ความเร็ว**: ประมาณ 1,000 แถว/วินาทีที่ 100,000 แถว (เวลาไม่โตตามจำนวนแถวเพราะมีต้นทุนคงที่ราว 60 ถึง 75 วินาทีต่อรอบ) ไม่ใช่ 12,500 แถว/วินาทีตามรายงานต้นฉบับ
- **Recall ต่ำ (ราว 0.59)** เพราะกฎที่ระบบสร้างเองยังจับข้อผิดพลาดบางชนิดแทบไม่ได้:

| ชนิดความผิด (ชุด 10,000) | แถวจริง | ตรวจพบ | อัตรา |
|---|---:|---:|---:|
| null_age, null_income, null_customer_id | 200, 200, 100 | ครบ | 100% |
| duplicate | 200 | 200 | 100% |
| outlier_income, outlier_quantity | 200, 100 | ครบ | 100% |
| outlier_price | 100 | 53 | 53% |
| date_format_variant | 500 | 6 | 1.2% (ระบบรับ 494 แถวเป็นวันที่ถูกต้องโดยการ normalize) |
| impossible_date | 100 | 1 | 1% |
| invalid_email | 300 | 3 | 1% |
| invalid_phone | 300 | 1 | 0.3% |

ข้อสรุป: ตรวจ null, ซ้ำ และ outlier เชิงตัวเลขได้ดี แต่ **ยังไม่ตรวจรูปแบบอีเมล เบอร์โทร และวันที่ที่เป็นไปไม่ได้** ในการตั้งค่าเริ่มต้น

## 6.3 Schema drift (ตาราง `eval_drift`, 2,000 แถวต่อรอบ)

| รอบ | การเปลี่ยนแปลง | พบ drift | proposal | ผลการประมวลผล |
|---|---|:---:|:---:|---|
| v0a, v0b | ต้นฉบับและ control | ไม่ | ไม่ | Active 1,765 / 1,768 |
| v1 | เพิ่มคอลัมน์ | ใช่ | 1 | ประมวลผลต่อได้ Active 1,773 |
| v2 | ลบคอลัมน์ | ใช่ | 1 | **ทั้ง 1,960 แถวเข้า Quarantine** |
| v3 | เปลี่ยนชนิดข้อมูล | ไม่ | ไม่ | ประมวลผลต่อได้ Active 1,773 |
| v4 | เปลี่ยนชื่อคอลัมน์ | ใช่ | 1 | **ทั้ง 1,960 แถวเข้า Quarantine** ใช้เวลา 203 วินาที |

ข้อสรุป: การเพิ่มคอลัมน์รับได้อัตโนมัติ การลบหรือเปลี่ยนชื่อคอลัมน์ทำให้ทั้งรอบถูกกักกัน (ไม่สูญหาย แต่ต้องมีคนอนุมัติ proposal)

## 6.4 Pipeline และการประมวลผลหลายไฟล์
- อัปโหลดสองไฟล์ติดกัน: ได้ `ingest_id` ต่างกัน รันต่อคิวจนสำเร็จทั้งคู่ (ภายใน 150 วินาที) ไฟล์ซ้ำถูกตรวจพบ และ raw ของทั้งคู่ถูกย้ายไป archive ไม่ถูกลบ
- ingest จาก PostgreSQL: 10,100 แถว → Active 9,441 + Quarantine 659 ใช้เวลา 79.6 วินาที
- เอกสาร `d-scale.json`: ไฟล์ผล benchmark ที่ commit ไว้มีสถานะ `FAILED` ทุกขนาด (error ว่าง) ส่วนฉบับที่แก้ในเครื่องมีรอบ 100,000 แถว `SUCCEEDED` (engine 173 วินาที, end-to-end 232 วินาที, Quarantine 6,238) ส่วนรอบ 500,000 และ 1,000,000 ยัง `FAILED` **ฉบับนี้จึงไม่อ้างว่าผ่านการทดสอบ 1,000,000 แถวจากไฟล์นี้** หลักฐานที่มีคือรอบจริงที่ใหญ่ที่สุดใน Elasticsearch (990,100 แถว) ซึ่งควรตรวจซ้ำและเก็บเป็นหลักฐานก่อนนำเสนอ

## 6.5 การใช้ประโยชน์จากข้อมูลสะอาด
ข้อมูลสะอาด 9,370 แถว (นักศึกษา 9,370 คน) สรุปคะแนนเฉลี่ยรายวิชา อัตราผ่าน 99.95% (คะแนนผ่าน 50) การกระจายคะแนน 6 ช่วง และรายชื่อนักศึกษาที่ต้องติดตาม 5 คน:

| วิชา | จำนวน | คะแนนเฉลี่ย | อัตราผ่าน |
|---|---:|---:|---:|
| Big Data | 1,938 | 77.91 | 99.95% |
| Data Warehouse | 1,822 | 77.93 | 99.89% |
| Database | 1,874 | 77.66 | 99.89% |
| Python | 1,845 | 78.45 | 100% |
| Statistics | 1,891 | 78.03 | 100% |

## 6.6 COPDQ (วิธีคำนวณจริง)
สูตร `$25 x น้ำหนัก 2.5/1.8/1.2/1.0` ในรายงานต้นฉบับ **ไม่มีในโค้ด** ระบบคำนวณ 3 แบบ:
1. **มูลค่าการเงินที่ถูกกักกัน** (`stages/metrics.py`, stage `copdq`): ผลรวมของคอลัมน์การเงินตัวแรกที่พบ (`total_sales`, `sales`, `revenue`, `profit`, `price`, `amount`, `total`) บนแถว Quarantine ถ้าไม่มีคอลัมน์เหล่านี้ ค่าเป็น 0
2. **Operational impact score** (stage `operational_impact`): ผลรวมของน้ำหนักสูงสุดต่อแถว (ตาม `column_weights`, คีย์หลักใช้น้ำหนักเต็ม, ขั้นต่ำ 0.2 ต่อแถวที่ถูกกักกัน) หารจำนวนแถวทั้งหมด คูณ 100
3. **หน้า Analytics** (`analytics.py`): กรอบ Cost of Correction + Cost of Lost Opportunities + Cost of Risk และกรณีไม่มีข้อมูลการเงินใช้ `ส่วนต่าง x 2.50`

ตัวเลข $42,750 ในรายงานต้นฉบับไม่มีที่มา

---

# บทที่ 7 สรุป ข้อจำกัด และแนวทางต่อยอด

## 7.1 สรุป
ระบบทำงานครบวงจรตั้งแต่นำเข้า 4 แหล่ง ตรวจคุณภาพ 21 stage บน Spark และ Delta Lake แยกแถวเสียลง Quarantine พร้อมเหตุผล ไม่ทิ้งเงียบ มี governance ของ schema และกฎ มี Dashboard Builder ที่ AI ไม่แตะตัวเลข และวัดผลได้จริง: precision 0.96 และ recall 1.0 บนชุดคะแนนนักศึกษา, กระทบยอดครบทุกรอบ

## 7.2 ข้อจำกัดและสิ่งที่ยังไม่ได้พิสูจน์
1. **Recall บนข้อมูลสังเคราะห์ราว 0.59** ยังไม่ตรวจอีเมล เบอร์โทร และวันที่ไม่สมเหตุสมผล
2. **การเยียวยาด้วย AI ยังไม่มีหลักฐานอัตรากู้คืน** (วัดได้ 0 แถว) เส้นทางอัตโนมัติขาด `ELASTICSEARCH_URL` ใน container Spark และ advisor ที่ทดสอบเสนอกฎที่ชี้ไปคอลัมน์ที่ไม่มีอยู่จริง (`value_in_age` แทน `age`) ได้กฎที่นำไปใช้ได้ 0 ข้อ
3. **ส่งตัวอย่างแถวให้ LLM โดยไม่ปิดบัง PII** ในเส้นทางเยียวยา
4. **ลบหรือเปลี่ยนชื่อคอลัมน์ทำให้ทั้งรอบถูกกักกัน**
5. **benchmark 500,000 และ 1,000,000 แถวยังไม่มีผลที่ commit** และ `d-scale.json` ขัดกับผลรันใน Elasticsearch
6. เอนจินโต้ตอบเก็บสถานะร่วมกันทุกผู้ใช้, rate limit นับตาม IP ของ nginx, ผู้ดูแลระบบมีบัญชีเดียว
7. ยังไม่มี Kubernetes และ Helm ใน repo (เป็นแผนเท่านั้น)

## 7.3 แนวทางต่อยอด
1. เพิ่มกฎตรวจรูปแบบอีเมล เบอร์โทร และวันที่ไม่สมเหตุสมผลจากโปรไฟล์
2. เพิ่มขั้นปิดบัง PII ก่อนส่งตัวอย่างให้ LLM และใส่ `ELASTICSEARCH_URL` ให้ container Spark
3. ทำ benchmark 500,000 และ 1,000,000 แถวให้ผ่านและเก็บหลักฐาน
4. เพิ่มบทบาทผู้ใช้ (RBAC) และแยกสถานะเอนจินโต้ตอบรายผู้ใช้
5. ทำ Helm chart และ connector ไป object storage ตามที่วางแผน

---

# ภาคผนวก

## ก. ชุดข้อมูลทดสอบหลัก: `dirty_dataset.csv` (10,100 แถว, 8 คอลัมน์)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `dirty_row_id` | Integer | ลำดับแถว |
| `record_id` | String | รหัสบันทึก |
| `student_id` | String | รหัสนักศึกษา (คีย์ composite คู่กับ `course`, `semester`) |
| `course` | String | วิชา (5 วิชา) |
| `score` | Float | คะแนน (ช่วงที่ถูกต้อง 0 ถึง 100) |
| `semester` | String | ภาคการศึกษา |
| `study_hours` | Float | ชั่วโมงเรียน (outlier 30 ถึง 60 ที่ใส่ไว้ 100 แถว) |
| `updated_at` | Timestamp | ใช้ตรวจความสดใหม่ |

ปัญหาที่ใส่ไว้ (ground truth): ค่า score ว่าง 300, score นอกช่วง 200, study_hours ผิดปกติ 100, แถวซ้ำ 100

## ข. โครงสร้าง `services/spark/rules_config.json`
ไฟล์มีกฎต่อตาราง และ `_default` ซึ่งมีหมวด `null_primary_key`, `null_date_column`, `duplicate_check`, `null_checks`, `value_range`, `freshness_threshold_hours`, `quality_score_threshold`, `ai_advisor`, `auto_clean` (บางตารางมี `range_checks`, `remediation_rules`) ตัวอย่างหมวด `value_range`:

```json
"value_range": {
  "method": "iqr",
  "iqr_multiplier": 1.5
}
```
ค่า `iqr_multiplier` เปลี่ยนต่อตารางได้ (ในไฟล์พบ 1.5 และ 2.5) และไฟล์นี้ถูกแก้ระหว่างรอบประเมิน (มีตารางทดสอบปะปน เช่น `eval_cust_*`, `e2e_ingest_*`) ควรทำสำเนาก่อนนำไปใช้เป็นตัวอย่างเผยแพร่

## ค. API (prefix จริงตาม router)
| กลุ่ม | Prefix | ตัวอย่าง endpoint |
|---|---|---|
| Auth | `/api/v1/auth` | `POST /login`, `POST /logout`, `GET /me` |
| Pipeline | `/api/v1/pipeline` | `POST /ingest/csv`, `/ingest/api`, `/ingest/rdbms`, `/ingest/reddit`, `GET /runs/{ingest_id}`, `POST /retry/{run_id}`, `POST /acknowledge/{run_id}` |
| Quality | `/api/v1/quality` | `GET /`, `GET /{table_name}` |
| Whitebox | `/api/v1/whitebox` | `POST /profile/upload`, `POST /recommend-rules`, `POST /execute`, `GET/POST /state`, `POST /upload-csv`, `POST /ingest-source`, `GET/POST /run-all`, `/multi-table/*`, `GET /export-csv/{zone}` |
| Rules | `/api/v1/rules` | `GET/PUT /{table_name}`, `GET /profiles/{table_name}`, `/ai-proposals/*` |
| Schema | `/api/v1/schema` | `/proposals`, `/proposals/{id}/approve`, `/proposals/{id}/reject`, `/tables` |
| Standardize | `/api/v1/standardize` | `/review-queue`, `/rollback` |
| Lineage | `/api/v1/lineage` | `/{table_name}`, `/{table_name}/trust-check` |
| Gold | `/api/v1/gold` | `/daily-quality`, `/error-patterns`, `/financial-impact`, `/schema-drift`, `POST /rebuild` |
| Dashboards | `/api/v1/dashboards` | `/datasets`, `/generate`, `/refine`, `/render`, `/export`, `/saved` |
| Semantic | `/api/v1/semantic` | `GET /{table}`, `/{table}/draft`, `/{table}/approve` |
| Data Export | `/api/v1/export` | `/tables`, `/preview/{layer}/{table}`, `/records/...`, `/raw`, `/active`, `/quarantine` |
| System | `/api/v1` | `/services/status`, `/performance/metrics`, `/system/settings`, `/system/alert`, `/system/remediations` |

## ง. การติดตั้ง
```bash
cp .env.example .env          # ตั้งค่า ADMIN_USERNAME, ADMIN_PASSWORD, GROQ_API_KEY (ถ้าใช้ AI) และพอร์ต
docker compose up -d --build  # ตามค่า COMPOSE_PROFILES ใน .env
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```
หน้าเว็บผ่าน nginx ที่ `http://localhost` (หรือพอร์ตตาม `NGINX_HOST_PORT`): `/` หน้าแรก, `/pipeline`, `/ingestion`, `/rules`, `/schema`, `/dashboard`, `/dashboard-builder`, `/analytics`, `/export`, `/whitebox`, `/guide` (ทุกหน้าที่ไม่ใช่หน้าแรกและ `/login` ต้องล็อกอิน) ไม่ต้องใช้ `-p etl-v2` เว้นแต่ต้องการตั้งชื่อโปรเจกต์เอง

สร้างหลักฐานประเมินใหม่ได้ตาม `docs/evaluation/README.md` (stack ต้องรันอยู่)

## จ. สิ่งที่แก้จากรายงานต้นฉบับ
| หัวข้อ | ต้นฉบับ | ฉบับนี้ (ตามระบบจริง) |
|---|---|---|
| จำนวน container | 14 | 16 (หลัก 8) |
| Spark / Delta / ES / Hadoop / Grafana | 3.5 / 3.2 / 8.11.0 / 3.3 / 10.2 | 3.4.1 / 2.4.0 / 8.10.2 / 3.2.1 / 10.1.5 |
| ช่องทางที่ 4 | n8n | PostgreSQL (n8n เป็นตัวตั้งเวลา) |
| Auth | API Key, Bearer, IP whitelist | session cookie, `X-Service-Key`, `X-Webhook-Secret` |
| ประตูตรวจ | 4 ประตู | 21 stage |
| IQR | 3.0× | default 1.5× (ตั้งต่อตารางได้) |
| ZORDER | `event_date` ทุก 10 รอบ | `row_hash` ตามรอบ `should_optimize` + VACUUM 168h |
| DSL เยียวยา | `impute_median`, `set_absolute_value` | `fillna`, `calculate`, `cast`, `filter` |
| COPDQ | $25 x น้ำหนัก | 3 วิธีในหัวข้อ 6.6 |
| PII Redactor | มี (regex และ NER) | ไม่มีในเส้นทางเยียวยา dashboard ไม่ส่งแถวให้ LLM |
| ชุดข้อมูลประเมิน | Olist, retail 500k+ | คะแนนนักศึกษา, ลูกค้าสังเคราะห์, drift |
| Throughput | 12,500 แถว/วินาที | ราว 986 แถว/วินาที ที่ 100,000 แถว |
| Precision | 99.85% | 95.89% (นักศึกษา), 92 ถึง 94% (สังเคราะห์) |
| การกู้คืนข้อมูล | 78.4% | ยังไม่มีหลักฐาน (วัดได้ 0 แถว) |
| คะแนนรวม | 100/100 | ไม่ให้คะแนนรวม รายงานตัวเลขดิบ |
| หน้าจอ | แดชบอร์ด 4 มุมมอง | 11 หน้าหลัก (รวม Dashboard Builder และ Data Export) |
