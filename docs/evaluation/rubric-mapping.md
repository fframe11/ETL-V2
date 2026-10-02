# ความสอดคล้องกับเกณฑ์การให้คะแนน (Data Eng)

สร้างโดย `python scripts/evaluation/build_rubric_report.py` จากไฟล์ใน `docs/evaluation/evidence/` — ตัวเลขทุกตัวมาจากการรันจริง

## CLO5 · ปริมาณและขอบเขต (25%)

### จำนวนแหล่งข้อมูลและปริมาณข้อมูล (10)

| ชนิด | แหล่งข้อมูล | จุดเข้า | โค้ด |
|---|---|---|---|
| file | CSV / Excel upload | `POST /api/v1/pipeline/ingest/csv` | `services/api/app/api/pipeline.py` |
| api | REST API (JSON/CSV) + data.go.th resolver | `POST /api/v1/pipeline/ingest/api` | `services/api/app/api/pipeline.py` |
| rdbms | PostgreSQL (read-only SELECT) | `POST /api/v1/pipeline/ingest/rdbms` | `services/api/app/api/pipeline.py` |
| stream | Reddit → Kafka → Spark Structured Streaming | `POST /api/v1/pipeline/ingest/reddit` | `services/spark/streaming_job.py` |

ไฟล์ข้อมูลต้นทางใน `data/`: 33 ไฟล์ รวม 2,178,676 แถว (นับเฉพาะ CSV)
ชุดขยายสำหรับ benchmark (สำเนาซ้ำของชุดประเมินชุดเดียว ไม่ใช่ข้อมูลใหม่): 8 ไฟล์ รวม 3,220,000 แถว
การนำเข้าที่ลงทะเบียนแยกตามชนิดแหล่งข้อมูล: file 12/15 สำเร็จ (260,269,126 ไบต์), rdbms 1/1 สำเร็จ (615,037 ไบต์)
ประมวลผลผ่าน Spark แล้ว 187 รอบ จาก 22 ตาราง รวม 3,586,969 แถว (รอบใหญ่สุด 990,100 แถว)

### จำนวนกระบวนการในการจัดการข้อมูล (15)

เส้นทาง Spark มี 21 กระบวนการ แต่ละตัวมีเทสต์ใน `services/spark/tests/unit/` และจับเวลาแยกใน `stage_seconds`

| # | phase | stage | หน้าที่ |
|---:|---|---|---|
| 1 | align | `schema_align` | จัดชื่อคอลัมน์และแปลงชนิดข้อมูล |
| 2 | transform | `schema_drift` | ตรวจการเปลี่ยนโครงสร้างตาราง |
| 3 | transform | `auto_clean` | แก้ข้อมูลอัตโนมัติด้วยกฎ DSL และลบแถวซ้ำตามคีย์ |
| 4 | transform | `validation` | ตรวจค่าว่าง ชนิดข้อมูล และวันที่ |
| 5 | transform | `dedup` | คัดแถวซ้ำและเก็บแถวล่าสุด |
| 6 | transform | `standardize_dates` | ปรับรูปแบบวันที่ (รวม พ.ศ.) |
| 7 | transform | `standardize_categories` | จัดหมวดค่าตามคำสำคัญ |
| 8 | transform | `range_rules` | ตรวจช่วงค่าตามกฎธุรกิจ |
| 9 | transform | `anomaly_iqr` | หา outlier ด้วย IQR |
| 10 | transform | `anomaly_zscore` | หา anomaly ด้วย Z-score |
| 11 | transform | `anomaly_induced` | ใช้กฎที่เรียนรู้จาก Decision Tree |
| 12 | transform | `quarantine_assembly` | รวมแถวที่ไม่ผ่านเข้าโซนกักกัน |
| 13 | transform | `column_filter` | ตัดคอลัมน์ที่ไม่อยู่ใน schema |
| 14 | post_load | `distribution` | สรุปการกระจายของข้อมูล |
| 15 | post_load | `quarantine_breakdown` | สรุปเหตุผลที่กักกัน |
| 16 | post_load | `copdq` | ประเมินมูลค่าความเสียหาย (COPDQ) |
| 17 | post_load | `freshness` | วัดความสดใหม่ของข้อมูล |
| 18 | post_load | `quality_score` | คำนวณคะแนนคุณภาพและ anomaly ของอัตรากักกัน |
| 19 | post_load | `ai_advisory` | วิเคราะห์ด้วย AI และเสนอกฎ |
| 20 | post_load | `operational_impact` | คะแนนผลกระทบเชิงปฏิบัติการแบบถ่วงน้ำหนัก |
| 21 | post_load | `report` | บันทึกผลลง Elasticsearch |

เวลาต่อ stage ในรอบประเมิน (วินาที): `schema_align` 0.199, `schema_drift` 0.001, `auto_clean` 4.043, `validation` 0.844, `dedup` 0.243, `standardize_dates` 0.001, `standardize_categories` 0.007, `range_rules` 6.26, `anomaly_iqr` 8.991, `anomaly_zscore` 3.438, `anomaly_induced` 0.0, `quarantine_assembly` 9.911, `column_filter` 0.002, `distribution` 2.546, `quarantine_breakdown` 1.163, `copdq` 0.0, `freshness` 0.768, `quality_score` 0.011, `ai_advisory` 9.458, `operational_impact` 4.604

## CLO5 · คุณภาพและความสมบูรณ์ (30%)

### ความครบถ้วนของการสกัดข้อมูล — Data extraction (10)

- แต่ละการนำเข้าได้ `ingest_id` และโฟลเดอร์ `/data/raw/<table>/<ingest_id>/` ของตัวเอง, ตรวจ checksum ซ้ำ, ตรวจคีย์หลักก่อนลง HDFS, allowlist URL แบบ fail-closed, SQL แบบ read-only, จำกัดขนาดไฟล์ (`services/api/app/api/{pipeline,ingest_guards,run_registry}.py`)

ผลทดสอบ end-to-end (`docs/evaluation/evidence/b-e2e-ingest-check.txt`):

- PASS distinct ingest ids
- PASS duplicate detected
- PASS both processed

### ความครบถ้วนของการเปลี่ยนแปลงข้อมูล — Data transformation (10)

**ก่อน transform** (`d-profile-before.json`): 10,100 แถว, score ว่าง 305, score นอกช่วง 204, คีย์ซ้ำ 100, study_hours outlier 100

**Detection เทียบ ground truth** (`d-detection.json`, IQR multiplier ตามค่าใน `services/spark/rules_config.json`):

| ชนิดปัญหา | จริง | ตรวจพบ | อัตรา |
|---|---:|---:|---:|
| Missing Score | 300 | 300 | 100.00% |
| Invalid Score Range | 200 | 200 | 100.00% |
| Study Hours Outlier | 100 | 100 | 100.00% |
| Duplicate | 100 | 100 | 100.00% |

precision 0.9589 · recall 1.0 · accuracy 0.997 (TP 700, FP 30, FN 0, TN 9,370)

สาเหตุ false positive อันดับต้น: `study_hours_zscore=3.34 (val=study_hours deviates > 3.0σ)` ×8; `score_zscore=3.1 (val=score deviates > 3.0σ)` ×5; `score_zscore=3.3 (val=score deviates > 3.0σ)` ×4

**เปรียบเทียบการตั้งค่า IQR** (ค่าตั้งของ test case นี้ ไม่ใช่ค่าที่ถูกต้องสำหรับข้อมูลทุกชนิด):

| IQR multiplier | precision | recall | accuracy | false positive |
|---|---:|---:|---:|---:|
| 1.5 | 0.8739 | 1.0 | 0.99 | 101 |
| 3.0 | 0.9589 | 1.0 | 0.997 | 30 |

Golden test ก่อน/หลังแยก stage: ตรงกันทุกตัวเลข

### ความครบถ้วนของการถ่ายโอนข้อมูล — Data loading (5)

- เขียน quarantine แบบ idempotent (ลบตาม `ingest_id` แล้วเขียนใหม่) **ก่อน** Delta MERGE, ย้าย raw ไป `/data/archive/` แทนการลบ, lock มี heartbeat, สถานะ QUEUED→RUNNING→SUCCEEDED/FAILED/SKIPPED ใน `sdoqap_runs`
- รอบประเมิน: รับเข้า 10,000 แถว → active 9,370 + quarantine 630 (ครบถ้วน), เวลาใน engine 98.489 วินาที
- ไฟล์ต้นทางมี 10,100 แถว ส่วนต่าง 100 แถวคือแถวคีย์ซ้ำที่ `auto_clean` ตัดทิ้งก่อนนับ (ไม่ถูกเก็บใน quarantine) — ตัวตรวจ detection นับว่าเป็น `dropped`

| แถว | สถานะ | เวลาใน engine (s) | end-to-end (s) | หมายเหตุ |
|---:|---|---:|---:|---|
| 10,000 | FAILED | — | 1 |  |
| 100,000 | FAILED | — | 1 |  |
| 500,000 | FAILED | — | 1 |  |
| 1,000,000 | FAILED | — | 1 |  |

### ประสิทธิผลของการใช้ประโยชน์จากข้อมูล (5)

ข้อมูลสะอาด 9,370 แถวของนักศึกษา 9,370 คน ถูกนำไปสรุปคะแนนเฉลี่ยรายวิชา อัตราผ่าน (99.95%) การกระจายคะแนน และรายชื่อนักศึกษาที่ต้องติดตาม 5 คน — ดู [d-utilization.md](d-utilization.md)

## CLO6 · นวัตกรรม (15%)

### ขอบเขตโครงงานน่าสนใจ/แปลกใหม่
แพลตฟอร์มตรวจคุณภาพข้อมูลที่อธิบายเหตุผลได้ทุกขั้น (white-box) มีสองเส้นทาง: เอนจินโต้ตอบสำหรับทดลองกฎทันที และ Spark สำหรับข้อมูลจริงหลายแหล่ง พร้อม governance ของ schema และกฎ

### Component ที่ใช้นวัตกรรม
- ปรับเกณฑ์คุณภาพตามประวัติ (adaptive threshold) — `services/spark/dynamic_rules_engine.py`
- ตรวจ distribution drift ด้วย PSI และโปรไฟล์ EMA — `services/spark/data_profile_store.py`
- เรียนรู้กฎจากข้อมูลด้วย Decision Tree และเสนอกฎด้วย LLM ผ่านการอนุมัติของคน — `services/spark/ai_rule_advisor.py`
- จัดหมวดข้อความแบบ hybrid similarity ที่รองรับภาษาไทยไม่เว้นวรรค — `services/spark/sdoqap/semantic/similarity.py`
- Schema drift gate ที่อนุมัติอัตโนมัติเฉพาะการเพิ่มคอลัมน์ — stage `schema_drift`

### ดัดแปลงเทคนิคที่มีอยู่
Tukey IQR, Z-score (มีพื้น std 5% กัน false alarm), Delta Lake MERGE/idempotent quarantine, คิวต่อตารางแบบ FIFO, character n-gram cosine, Buddhist-year date normalisation

## ข้อจำกัดที่ทราบ

- เอนจินโต้ตอบ (Audit Trail/Ingestion แท็บ File) เก็บสถานะชุดเดียวร่วมกันทุกผู้ใช้ — ใช้สาธิตได้ทีละคน
- Rate limit ของ API นับตาม IP ของ nginx (ผู้ใช้ทุกคนใช้โควตาเดียวกัน)
- ฟอร์มนำเข้าในหน้า Data Ingestion เรียกเอนจินโต้ตอบเท่านั้น การนำเข้า HDFS/Spark ใช้ผ่าน API, n8n หรือ `test_data_source.bat`
- เกณฑ์ IQR/Z-score ที่ใช้เป็นค่าของ test case นี้ ไม่ใช่ค่าที่ถูกต้องสำหรับข้อมูลทุกประเภท
