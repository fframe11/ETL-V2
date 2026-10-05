# แผนหาข้อมูลและเก็บหลักฐานเพื่อประเมิน SDOQAP (6 หัวข้อ · 55 คะแนน)

ขอบเขต: เฉพาะ 6 เกณฑ์ใน CLO5 (10+15+10+10+5+5) — ไม่รวม CLO6 และหัวข้ออื่น
ที่มาของข้อมูล "มีอยู่แล้ว": อ่านจากโค้ดและไฟล์ใน repo (branch `new-optimizer`, HEAD `e068c13`) — **ยังไม่ได้รันระบบ**
กติกา: ไม่ใส่ตัวเลขที่สร้างขึ้นเอง ตัวเลขที่ปรากฏเป็น "ตัวอย่างจากหลักฐานเดิมใน repo" พร้อมระบุไฟล์ที่มา และต้องรันซ้ำก่อนใช้จริง

สัญลักษณ์: ✅ = ระบบมีอยู่แล้ว · ➕ = **ควรเพิ่ม** · ⚠️ = มีแต่มีปัญหา อย่าใช้เป็นหลักฐานตรง ๆ

---

## 0. สิ่งที่ต้องแก้/รู้ก่อนเก็บหลักฐาน (พบจากการอ่านโค้ด)

| # | ปัญหา | ผลต่อคะแนน | ทางแก้ |
|---:|---|---|---|
| 1 | **ไม่มีการกระทบยอด (reconciliation) Source → Raw → Processed → Destination ที่ไหนเลย** `total_records` = clean + quarantine *หลัง* transform ไม่ใช่จำนวนแถวที่รับเข้า (`sdoqap/stages/assembly.py:43-45`) | เกณฑ์ 3, 4, 5 โดยตรง | ➕ สร้างตารางกระทบยอด 4 จุด (หัวข้อ 3–5) |
| 2 | แถวซ้ำที่ `auto_clean` ตัดทิ้ง (`dropDuplicates`, `cleansing.py:33`) **ไม่ถูกนับ** ใน `total_records` และไม่เข้า quarantine เก็บเป็นแค่ข้อความ `resolved_N_duplicates` ใน `remediation_logs` ตัวอย่างจากหลักฐานเดิม: ไฟล์ 1,000,000 แถว → `total_records` 990,100 (`data/evaluation/output/bench_1000000.json`) ส่วนต่างคือแถวที่หายจากสมการ | เกณฑ์ 3, 4, 5 | ➕ เก็บ `dropped_duplicates` เป็นฟิลด์ตัวเลข + สมการ conservation |
| 3 | ไม่เก็บจำนวนแถวต้นทาง/แถว raw ที่ลง HDFS (`sdoqap_runs` มีแค่ bytes, checksum, state) จำนวนแถวของ RDBMS มีใน HTTP response แต่ไม่บันทึก | เกณฑ์ 1, 3 | ➕ เพิ่ม `source_rows`, `raw_rows`, `columns`, `extract_seconds` ใน `sdoqap_runs` |
| 4 | ไม่มี metric ของ Delta MERGE (inserted/updated/rows written/เวลาโหลด) `schema.autoMerge.enabled=true` จึงไม่บังคับ schema ตอน MERGE | เกณฑ์ 5 | ➕ เก็บ `operationMetrics` ของ Delta + เวลา load |
| 5 | `d-scale.json` ใน HEAD เป็น **FAILED ทั้ง 4 ขนาด** (end-to-end 1 วินาที) ทั้งที่ผลจริงอยู่ใน commit `3013226` และ `data/evaluation/output/bench_*.json` (มีสถานะ SUCCEEDED) ถูกเขียนทับหลังรันซ้ำผิด (สคริปต์เรียก `bash` ของ WSL ตาม scorecard) | เกณฑ์ 1, 5 — กรรมการเปิดไฟล์นี้จะเห็น FAILED | ➕ รันซ้ำให้ได้ SUCCEEDED แล้ว commit ใหม่ ห้ามใช้ไฟล์ปัจจุบัน |
| 6 | จำนวน stage ขัดกัน: `c-stage-list.txt` = 20 (เก่า), `d-stage-list.json` + `plan.py` = **21** (มี `range_rules`) | เกณฑ์ 2 | ใช้ 21 และสร้างรายการใหม่จาก `python -m sdoqap.pipeline` |
| 7 | ตัวเลขภาพรวมไม่ตรงกัน: rubric-mapping = 187 รอบ/3,586,969 แถว, scorecard = 183 รอบ/3,576,836 แถว และ `/kpi/stats.total_records_ingested` นับ **ซ้ำเมื่อ retry/rerun** | เกณฑ์ 1 | ➕ ตัดตัวเลขเดียวด้วยสคริปต์เดียว ณ เวลาเก็บหลักฐาน (snapshot) |
| 8 | `/lineage/inspect/...` มีค่าที่ hardcode/แต่งขึ้น (เช่น `duration_sec: 14.8`, `records_read` fallback `1355767`, "PostgreSQL 15.3") | เกณฑ์ 3, 5 ถ้าเอาไปอ้าง | ⚠️ ห้าม screenshot หน้านี้เป็นหลักฐาน |
| 9 | `sdoqap_pipeline_runs` ไม่มี `duration_seconds` (อยู่ใน `sdoqap_quality_runs`) หน้า Pipeline คอลัมน์ Duration จึงเป็น `-` | เกณฑ์ 5 (loading time) | ➕ แก้หรืออ้างจาก `sdoqap_quality_runs` |
| 10 | ปุ่ม connect DB/API/Stream ในหน้า Ingestion เรียก `/whitebox/ingest-source` ซึ่งเป็น **simulated** (`"simulated": True`) การนำเข้าจริงอยู่ที่ `/pipeline/ingest/{csv,api,rdbms,reddit}` | เกณฑ์ 1, 3 | demo ผ่าน API จริงหรือ `test_data_source.bat` ห้ามใช้ปุ่มจำลอง |
| 11 | Dashboard ฝั่ง Executive มีบั๊กที่ scorecard บันทึกไว้ (F-21/22/23: คีย์ไม่ตรงทำให้ missing/duplicate/invalid แสดง 0%) และ Grafana ไม่มี dashboard provision | เกณฑ์ 6 | ใช้ **Create Dashboard** เป็นหลักฐานหลัก ไม่ใช้หน้า Executive จนกว่าแก้ |
| 12 | สองเอนจิน ให้ผลต่างกัน: Interactive (whitebox) 9,400 / 100 review / 600 quarantine, Spark 9,370 / 630 (ไม่มี review) (`03-rubric-scorecard.md`) | เกณฑ์ 2, 4 | เลือก Spark เป็นเอนจินหลักของหลักฐาน; whitebox เป็นหลักฐานเสริมที่ระบุชื่อเอนจินทุกครั้ง |

---

## 1. ตารางหลัก

| เกณฑ์ | สิ่งที่ต้องพิสูจน์ | ข้อมูลที่ต้องเก็บ | Metrics | วิธีทดสอบ | หลักฐานที่ต้องเก็บ |
|---|---|---|---|---|---|
| **1. แหล่งข้อมูลและปริมาณ (10)** | รับข้อมูลได้หลายชนิด *จริง* (ไม่ใช่จำลอง) และปริมาณต่อแหล่งตรวจสอบได้ | ต่อแหล่ง: ชนิด, `ingest_id`, rows, columns, bytes, checksum, state; สตรีม: จำนวนข้อความที่ผลิต/ที่เขียนปลายทาง | N_connector_types (ใช้งานจริง), N_distinct_datasets (distinct checksum), ตารางปริมาณต่อแหล่ง (rows/cols/bytes), Σrows (แยก "ข้อมูลจริง" กับ "ข้อมูลขยาย benchmark") | ingest จริงอย่างน้อย 1 ชุดต่อชนิด (CSV/Excel, REST API, PostgreSQL, Reddit stream) แล้วดึง inventory ด้วยสคริปต์เดียว | `d-source-inventory.json` ใหม่, รายการ `sdoqap_runs`, screenshot ผล ingest ต่อแหล่ง, ตารางปริมาณ |
| **2. จำนวนกระบวนการ (15)** | ระบบมีกระบวนการจัดการข้อมูลกี่ขั้น *แยกจาก feature* นับด้วยกติกาที่ตรวจซ้ำได้ | Process Register: id, ชื่อ, phase, โค้ด, input→output, unit test, เวลา/รอบ, สถานะรันจริง | N_registered, N_with_test, N_executed_in_run (`stage_seconds` > 0), Coverage = executed/registered, N_with_row_in_out | แสดงรายการจาก registry + รันหนึ่งรอบแล้วเทียบ `stage_seconds`; รัน unit test | `python -m sdoqap.pipeline` output, `stage_seconds` ของรอบประเมิน, ผล pytest Spark, Process Register |
| **3. ความครบถ้วน Extraction (10)** | แถว/คอลัมน์จาก source = ที่ลง raw ไม่หาย ไม่เพิ่ม; ความล้มเหลวถูกบันทึก | `source_rows`, `raw_rows`, key set ทั้งสองฝั่ง, คอลัมน์, checksum ต้นทาง/ปลายทาง, เวลา extract, ผล attempt สำเร็จ/ล้มเหลว+error | Record Completeness (key-level), Count Delta, Missing/Extra, Column Completeness, Extraction Success Rate, Error Rate, Extraction time/throughput | ingest ชุดที่รู้จำนวนแน่นอนครบ 4 แหล่ง + กรณีผิดปกติ (ไฟล์ว่าง, ใหญ่เกิน, host ไม่อนุญาต, ซ้ำ) | ตารางกระทบยอด Source↔Raw, log, response JSON, HDFS `ls`/count, test result |
| **4. ความสมบูรณ์ Transformation (10)** | แต่ละ rule ทำงานถูก ไม่ทำข้อมูลดีเสีย ทุกแถวมีที่ไป | rows ก่อน/หลัง, per-stage in/out/flagged, profile ก่อน-หลัง, ground truth, ตัวอย่างแถวก่อน-หลัง | Conservation (N_in = clean+quarantine+dropped), per-issue Precision/Recall/F1, False Quarantine Rate, Residual Error in Active, Null/Dup/Invalid before→after, Type Conversion Success, Standardization Conformity | รัน dirty dataset + negative control (clean dataset) + test matrix T1–T10 | `d-profile-before.json`, `d-detection.json`, golden before/after, Before/After sample, test result |
| **5. ความถูกต้อง Loading (5)** | ที่ควรโหลด = ที่โหลดจริง schema/ค่าตรงกัน ล้มเหลวแล้วปลอดภัย | rows ที่ตั้งใจโหลด (clean, quarantine), rows อ่านกลับจากปลายทาง, key set, schema ปลายทาง vs registry, MERGE metrics, เวลา load, state | Load Completeness (key-level), Load Success Rate (run และ row), Integrity Match %, Schema Match, Load time, Idempotency check | โหลดครั้งแรก (overwrite) + ครั้งที่สอง (MERGE) + retry + กรณีล้มเหลวจงใจ | ตาราง 4 จุด, `export/records` total_rows, Delta history, `sdoqap_runs` state, screenshot ปลายทาง |
| **6. ประสิทธิผลการใช้ประโยชน์ (5)** | ข้อมูลที่ผ่าน pipeline ใช้ตอบโจทย์จริงได้ และตัวเลขใน dashboard ถูกต้อง | requirement ที่ผู้ใช้พิมพ์, spec ที่ได้, ค่า KPI/กราฟที่ระบบแสดง, ค่าที่คำนวณอิสระ, latency, engine (ai/rules), warnings, ผล save/reopen | KPI Accuracy (ค่าตรงกับการคำนวณอิสระ), Requirement Coverage, Spec Validity Rate, AI vs Rules Rate, Generation Latency, Refinement Success Rate, Save/Reopen Fidelity, Utilization Gap เทียบข้อมูลอ้างอิง | สร้าง dashboard จาก active table ด้วย requirement ที่กำหนดล่วงหน้า → ตรวจตัวเลข → refine → save → เปิดใหม่ | screenshot ทุกขั้น, JSON spec, ตารางเทียบตัวเลข, test result, `d-utilization.md` |

---

## 2. รายละเอียดแต่ละเกณฑ์

### เกณฑ์ 1 · จำนวนแหล่งข้อมูลและปริมาณข้อมูล (10)

**1. สิ่งที่ต้องพิสูจน์**
- กรรมการต้องเห็น: แหล่งข้อมูลหลายชนิดที่ *นำเข้าได้จริง* และปริมาณต่อแหล่งที่ตรวจย้อนได้
- ระบบต้องแสดง: connector จริง 4 ชนิด (file, api, rdbms, stream) และปริมาณที่ไม่ถูกขยายด้วยข้อมูลซ้ำ

**2. ข้อมูลที่ต้องหา**
- ต่อแหล่ง: ชนิด, ชื่อ dataset, `ingest_id`, rows, columns, bytes, checksum, state, วันที่เวลา
- จากไหน: ES `sdoqap_runs` (ทุกฟิลด์), HDFS `/data/raw` และ `/data/archive`, Delta `/data/active` (ผ่าน `GET /api/v1/export/records/active/{table}` → `total_rows`), `GET /api/v1/dashboards/datasets` (records/columns/source ต่อ active table)
- สตรีม: ES index `reddit` (นับเอกสาร), parquet `/data/reddit/parquet`, จำนวนที่ producer ส่ง
- ก่อน/หลัง: ก่อน = นับที่ต้นทาง, หลัง = นับใน raw และ active (ใช้ต่อใน 3, 4, 5)

**3. Metrics**

| Metric | วิธีคำนวณ | หน่วย | รูปแบบผล |
|---|---|---|---|
| N_connector_types | จำนวนชนิดที่มี ingest สำเร็จจริงอย่างน้อย 1 ครั้ง | ชนิด | `N = <นับจริง>` + รายชื่อ |
| N_distinct_datasets | จำนวน checksum ที่ไม่ซ้ำ (ไม่นับสำเนา benchmark) | datasets | `<n>` |
| Rows ต่อแหล่ง | `source_rows` ของแต่ละ ingest | แถว | ตารางต่อแหล่ง |
| Columns ต่อแหล่ง | จำนวนคอลัมน์ใน raw | คอลัมน์ | ตารางต่อแหล่ง |
| Size ต่อแหล่ง | `size_bytes` (รายงานเป็น MB) | MB | ตารางต่อแหล่ง |
| Σ rows (จริง) / Σ rows (benchmark) | แยกสองผลรวม | แถว | 2 บรรทัด |
| Largest single run | max(`total_records` + dropped) | แถว | `<n>` |

ตัวอย่างตาราง (ค่า `<…>` ให้เติมจากการรันจริงเท่านั้น):

| แหล่ง | ชนิด | dataset | rows | columns | MB | ingest_id | state |
|---|---|---|---:|---:|---:|---|---|
| CSV | file | `<…>` | `<…>` | `<…>` | `<…>` | `<…>` | `<…>` |
| REST API | api | `<…>` | `<…>` | `<…>` | `<…>` | `<…>` | `<…>` |
| PostgreSQL | rdbms | `<…>` | `<…>` | `<…>` | `<…>` | `<…>` | `<…>` |
| Reddit | stream | `reddit` | `<ข้อความ>` | `<…>` | — | — | — |

**ระบบมีอยู่แล้ว ✅**
- 4 connector และ endpoint (`pipeline.py`), `source_inventory.py` + `d-source-inventory.json` (นับไฟล์/แถว/คอลัมน์ในโฟลเดอร์ `data/`), ตัวอย่าง RDBMS ingest จริง (`d-rdbms-ingest.json`: rows ต้นทางเท่ากับ rows ที่ ingest), bench ขนาด 10K/100K/500K/1M, `/dashboards/datasets` แสดง source/records/columns

**ควรเพิ่ม ➕**
- ➕ บันทึก `source_rows` และ `columns` ลง `sdoqap_runs` (ตอนนี้ไม่มี; API ingest คำนวณ `len(records)` แต่ทิ้ง)
- ➕ endpoint/สคริปต์ `GET /pipeline/runs` (list) หรือสคริปต์ inventory ที่ query `sdoqap_runs` ทั้ง index เพื่อสรุปต่อ source ตอนนี้ดูได้ทีละ `ingest_id`
- ➕ metric ของสตรีม (ตอนนี้ไม่มี `StreamingQueryListener`/`numInputRows`/lag): นับ ES `reddit` `_count` ก่อน-หลังช่วงรัน + จำนวนที่ producer ส่ง และบันทึกเป็นไฟล์
- ➕ ข้อมูลที่ไม่ใช่ไฟล์ให้มีปริมาณพอเป็นหลักฐาน (scorecard ระบุว่า gov_data และ Reddit ปริมาณน้อย; dataset ที่ distinct จริงมีไม่มาก) — เลือก API/RDBMS ชุดจริงที่ใหญ่กว่านี้ หรือรายงานตามจริงว่าเล็ก
- ➕ ตัดตัวเลขรวมด้วยสคริปต์เดียว ณ วันเก็บหลักฐาน (ดูข้อ 7 ในหัวข้อ 0)

**4. หลักฐาน**: `d-source-inventory.json` (รันใหม่), export รายการ `sdoqap_runs` เป็น JSON, screenshot ผล ingest แต่ละแหล่ง (response + สถานะ SUCCEEDED), ไฟล์ตัวอย่างต้นทาง, ตารางปริมาณ

**5. วิธีทดสอบ**
- Input: ไฟล์ CSV 1 ชุด + Excel 1 ชุด, REST API 1 endpoint (allowlist), ตาราง PostgreSQL 1 ตาราง, Reddit stream 1 รอบ (กำหนด subreddit/ระยะเวลา)
- Process: เรียก endpoint จริงครบ → รอ state SUCCEEDED → รันสคริปต์ inventory
- Expected: ทุกแหล่งมี `ingest_id` + แถวใน registry; ตารางปริมาณตรงกับที่ต้นทางนับ; สตรีมมีเอกสารใน `reddit` > 0
- เก็บ: JSON inventory, screenshot, ตารางปริมาณ

---

### เกณฑ์ 2 · จำนวนกระบวนการในการจัดการข้อมูล (15)

**1. สิ่งที่ต้องพิสูจน์**
- กรรมการต้องเห็น: รายการกระบวนการที่ชัดเจน นับได้ มีเกณฑ์นับ และรันจริงทุกตัว ไม่ใช่นับ feature หน้าจอรวมเข้าไป
- ระบบต้องแสดง: pipeline หลายขั้นที่แยกตรวจสอบ/ทดสอบ/จับเวลาได้เป็นรายขั้น

**กติกานับ "กระบวนการ" (เสนอ — ให้ทีมยืนยันก่อนใช้)** นับเป็นกระบวนการเมื่อครบ 4 ข้อ:
1. เปลี่ยน/คัดกรอง/ย้าย/วัดสถานะของ *ข้อมูล* (มี input และ output ที่ชัด)
2. เป็นหน่วยโค้ดที่ระบุชื่อได้ (stage ใน registry หรือ endpoint/โมดูลเฉพาะ)
3. มีหลักฐานการทำงาน (เวลา/ตัวนับ/log) *และ* unit test
4. ถอดออกแล้วผลลัพธ์ข้อมูลหรือรายงานเปลี่ยน

ไม่นับ = **Feature**: หน้าจอ/มุมมองที่แค่อ่านผล (dashboard, lineage view, export, trust-check, forecast, Grafana alert) แสดงในตารางแยกเป็น "ผู้ใช้ประโยชน์จากผลลัพธ์ของกระบวนการ"

**การจัดประเภทหัวข้อที่ผู้ใช้ให้มา (ตามโค้ดปัจจุบัน)**

| หัวข้อ | จัดเป็น | เหตุผล/โค้ด |
|---|---|---|
| Data Ingestion | กระบวนการ | `land_and_queue()` ตรวจ checksum ซ้ำ ตรวจ key ก่อนลง HDFS สร้าง `ingest_id` และคิวงาน |
| Data Extraction | กระบวนการ (ถ้าแยกจาก Ingestion) | อ่านจาก CSV/API/DB แล้วแปลงเป็น CSV เข้า `/data/raw/...`; ถ้าไม่แยกหลักฐานได้ ให้นับรวมกับ Ingestion |
| Data Validation | กระบวนการ | stage `validation` |
| Data Cleaning | กระบวนการ | `auto_clean`, `standardize_dates`, `standardize_categories` |
| Data Transformation | กระบวนการ | `schema_align`, `column_filter` ฯลฯ |
| Data Quality Check | กระบวนการ | `range_rules`, `anomaly_iqr`, `anomaly_zscore`, `anomaly_induced`, `dedup` |
| Data Profiling | ⚠️ กึ่งกระบวนการ | ผลอยู่ใน `null_profile`/`value_range_profile`/`distribution` แต่ไม่มี stage ชื่อ profiling → ➕ ถ้าจะนับต้องแยก stage |
| Data Storage / Loading | กระบวนการ แต่ ⚠️ ไม่ได้ลงทะเบียนเป็น stage | Delta MERGE + quarantine write อยู่ใน `run_quality_check` ไม่มีใน `plan.py` และไม่มีเวลา/ตัวนับ → ➕ แยกเป็น stage |
| Data Quarantine | กระบวนการ | `quarantine_assembly` + เขียน `/data/quarantine` แบบ idempotent |
| Data Monitoring | กระบวนการ (ส่วนวัด) | `quality_score`, `freshness`, `operational_impact`, `report`; ส่วน Grafana alert = feature/ops |
| Data Visualization / Dashboard | **Feature** | ผู้ใช้ประโยชน์จากข้อมูล นับในเกณฑ์ 6 ไม่นับเป็นกระบวนการ |

**2. ข้อมูลที่ต้องหา — Process Register** (1 แถวต่อกระบวนการ)
`id | ชื่อ | phase | โค้ด | input | output | unit test | เวลาในรอบประเมิน | ทำงานจริงในรอบ? | rows in/out`
- จาก: `services/spark/sdoqap/pipeline/plan.py` + `registry.py` (21 stage), `python -m sdoqap.pipeline`, `stage_seconds` ใน `sdoqap_quality_runs`, `services/spark/tests/unit/`

**โครงสร้างที่ตรวจได้จาก `plan.py` (ข้อเท็จจริงปัจจุบัน)**
- ALIGN 1 + TRANSFORM 12 = 13 stage ที่จัดการตัวข้อมูลโดยตรง · POST_LOAD 8 stage (สรุป/วัด/รายงาน) · รวม 21
- นอก registry แต่เป็นกระบวนการจริง: Ingestion+Extraction (API), Load Active (Delta MERGE), Load Quarantine, Archive raw
- การนับที่เสนอให้ระบุ 3 ระดับพร้อมกัน เพื่อให้กรรมการเลือกระดับเองได้ ไม่ต้องโต้แย้ง:
  - **A เข้ม**: เฉพาะที่ "จัดการตัวข้อมูล" = 13 stage + กระบวนการนอก registry (หลังเพิ่ม stage load แล้ว)
  - **B ปกติ**: A + stage วัดคุณภาพที่ persist ผล (`quality_score`, `freshness`, `quarantine_breakdown`, `distribution`, `report`)
  - **C รวมทั้งหมด**: 21 stage + นอก registry
- และสรุปเป็น 5 กลุ่มตามเอกสารนำเสนอเดิม (structure / cleaning / anomaly detection / segregation / post-load measurement) เพื่อสื่อสาร

**3. Metrics**

| Metric | วิธีคำนวณ | หน่วย |
|---|---|---|
| N_registered | จำนวนแถวใน Process Register ตามกติกา 4 ข้อ (รายงาน A/B/C) | กระบวนการ |
| N_with_unit_test | นับ stage ที่มี test ใน `tests/unit` | กระบวนการ |
| N_executed | stage ที่มีใน `stage_seconds` ของรอบประเมินและ **activated** (ประมวลผลข้อมูลจริง ไม่ใช่ผ่านเฉย ๆ) | กระบวนการ |
| Coverage_exec | N_executed / N_registered × 100 | % |
| Coverage_rowcount | stage ที่มี rows_in/rows_out ÷ N_registered × 100 (ตอนนี้ต่ำ → ➕) | % |
| Time share | `stage_seconds[s]` / Σ`stage_seconds` × 100 | % |

**ระบบมีอยู่แล้ว ✅**: registry 21 stage พร้อม `@stage(name, title, phase)`, `stage_seconds` ต่อ stage ในทุก quality run, unit test (scorecard ระบุ 60 tests ที่รันเมื่อ 2026-10-01 — ยังไม่ได้รันซ้ำ), golden test ก่อน/หลังแยก stage, เอกสาร `01-system-explainer.md` จัด 5 กลุ่ม

**ควรเพิ่ม ➕**
- ➕ stage ที่ยังไม่ลงทะเบียน: `load_active`, `load_quarantine`, `archive_raw` (และ `profiling` ถ้าจะนับ) เพื่อให้นับ/จับเวลา/ทดสอบได้
- ➕ per-stage `rows_in / rows_out / rows_flagged` ใน `ctx.metrics` และ quality run doc (ตอนนี้เป็นแค่ string ใน `remediation_logs`)
- ➕ ชุดข้อมูลที่ทำให้ stage ที่ "ว่าง" ในรอบประเมินทำงานจริง — scorecard ระบุว่า 6 stage ใช้เวลา ≤ 0.007 วินาที (`schema_drift`, `standardize_dates`, `standardize_categories`, `anomaly_induced`, `column_filter`, `copdq`) เพราะชุดคะแนนนักศึกษาไม่มีวันที่/หมวด/คอลัมน์เงิน หากไม่แสดงว่าทำงานจริง กรรมการอาจนับเป็นศูนย์
- ➕ อธิบายเหตุผลที่ `auto_clean` กับ `dedup` ต่างกัน (ตัดซ้ำตามคีย์แบบเงียบ vs. คัดซ้ำเข้า quarantine พร้อมเหตุผล) หรือรวมเป็นหนึ่งเพื่อไม่ให้ถูกมองว่านับซ้ำ
- ➕ สคริปต์ `build_process_register.py` สร้างตารางจาก registry + `stage_seconds` อัตโนมัติ ลดความเสี่ยงตัวเลขขัดกัน (20 vs 21)

**4. หลักฐาน**: เอาต์พุต `python -m sdoqap.pipeline`, `stage_seconds` ของรอบประเมิน (JSON), ผล pytest Spark (log), Process Register (ตาราง), screenshot รายการ stage จากหน้าที่ใช้อยู่ (ถ้ามี), diagram 5 กลุ่ม

**5. วิธีทดสอบ**
- Input: ชุดข้อมูลปนปัญหา (dirty student scores) + ชุดที่มีวันที่/หมวด/คอลัมน์เงิน (➕)
- Process: รัน `python -m sdoqap.pipeline` → รัน 1 รอบ → อ่าน `stage_seconds` + rows in/out → รัน pytest Spark
- Expected: stage ทุกตัวใน register ปรากฏใน `stage_seconds`; ทุกตัวมี test ผ่าน; stage ที่ตั้งใจให้ทำงานมีค่า rows_flagged > 0 ในอย่างน้อยหนึ่งชุดข้อมูล
- เก็บ: ไฟล์ทั้งหมดข้างต้น + Process Register ฉบับ commit

---

### เกณฑ์ 3 · ความครบถ้วนของ Data Extraction (10)

**ประเมินสูตรตัวอย่าง** `Extraction Completeness = Extracted / Source × 100`
- ใช้เป็น **ตัวหยาบ** ได้ แต่ไม่พอ: (1) เทียบแค่จำนวน แถวหายแล้วมีแถวซ้ำมาแทนจะได้ 100% ปลอม; (2) ถ้า Extracted > Source จะเกิน 100% และไม่บอกว่าเกินเพราะอะไร; (3) ตัวหารต้องมาจาก *การนับอิสระที่ต้นทาง* ไม่ใช่ตัวเลขที่ระบบเองบันทึก; (4) ไม่ครอบคลุมคอลัมน์/ความเสียหายของค่า
- ในระบบนี้ **ห้ามใช้ `total_records` เป็นตัว Extracted** เพราะเป็นค่าหลัง transform (clean + quarantine ไม่รวมแถวที่ถูกตัดซ้ำ)
- สูตรที่เสนอ:
  - **Count Delta** = Raw_rows − Source_rows (ต้อง = 0; ติดลบ = หาย, บวก = เกิน)
  - **Record Completeness (key-level)** = |Source_keys ∩ Raw_keys| / |Source_keys| × 100
  - **Missing** = |Source_keys − Raw_keys| · **Extra** = |Raw_keys − Source_keys| · **Duplicated** = Raw_rows − |Raw_keys|
  - **Column Completeness** = |expected_columns ∩ raw_columns| / |expected_columns| × 100
  - **Byte/Content Fidelity**: sha256 ไฟล์ต้นทางเทียบไฟล์ที่ลง HDFS (ไฟล์ CSV); ถ้าผ่านการแปลง (Excel/API/DB → CSV) ให้เทียบ checksum หลังแปลงกับไฟล์ใน HDFS
  - **Extraction Success Rate** = attempts สำเร็จ / attempts ทั้งหมด × 100 (นับ attempt ที่ล้มเหลวก่อนลง HDFS ด้วย — ปัจจุบันไม่ถูกบันทึก)
  - **Extraction Error Rate** = attempts ล้มเหลว / attempts ทั้งหมด × 100 แยกตามสาเหตุ
  - **Extraction Time** = เวลา request → raw พร้อม (วินาที) และ **Throughput** = Raw_rows / Extraction Time (แถว/วินาที)

**1. สิ่งที่ต้องพิสูจน์**: ข้อมูลที่ลง raw ตรงกับต้นทางทั้งจำนวนและตัวตนของแถว/คอลัมน์ และความล้มเหลวถูกตรวจจับ ไม่เงียบ

**2. ข้อมูลที่ต้องหา**

| แหล่ง | นับต้นทางอย่างอิสระ | นับ Raw |
|---|---|---|
| CSV/Excel | อ่านด้วย parser (ไม่ใช้ `wc -l` เพราะ field มี newline/คอมมาได้); Excel นับแถวของ sheet | นับแถวในไฟล์ `/data/raw/<table>/<ingest_id>/<table>.csv` (ก่อน Spark อ่าน) |
| REST API | จำนวนที่ API รายงาน (เช่น `total` ของ CKAN) หรือ `len(records)` | แถวใน raw |
| PostgreSQL | `SELECT COUNT(*)` แยกต่างหากกับ query ที่ใช้ ingest | แถวใน raw |
| Stream | จำนวนที่ producer ส่งเข้า Kafka `reddit_raw` | เอกสารใน ES `reddit` / แถวใน parquet |

- เก็บเพิ่ม: key set ของทั้งสองฝั่ง (หรือ hash ต่อแถว), คอลัมน์, เวลาเริ่ม/จบ extract, สถานะและข้อความ error ของ *ทุก* attempt
- จาก: `sdoqap_runs`, HDFS (WebHDFS), response ของ endpoint

**ระบบมีอยู่แล้ว ✅**: `ingest_id` + โฟลเดอร์ raw แยกต่อครั้ง, checksum กันไฟล์ซ้ำ (`status: duplicate`), ตรวจ primary-key ก่อนลง HDFS, allowlist fail-closed, SQL read-only, จำกัดขนาด, archive แทนลบ, state machine, `POST /pipeline/retry/{ingest_id}`, `b-e2e-ingest-check.txt` (3 PASS), `d-rdbms-ingest.json` (rows ต้นทาง = rows ที่ ingest)

**ควรเพิ่ม ➕**
- ➕ `scripts/evaluation/extraction_reconcile.py`: อ่าน raw จาก HDFS นับแถว/คีย์ เทียบ source ที่นับอิสระ แล้วออก JSON + ตาราง
- ➕ บันทึก `source_rows`, `raw_rows`, `columns`, `extract_seconds`, `extract_status` ใน `sdoqap_runs`
- ➕ บันทึก attempt ที่ล้มเหลวก่อนลง HDFS (ตอนนี้แค่ HTTP error ไม่มีเอกสาร) เพื่อคำนวณ Success Rate ได้จริง
- ➕ ตรวจ raw count ในเอนจิน (ตอนนี้ไม่มี `df.count()` ของ raw) เพื่อใช้เป็นตัวตั้งของ conservation ใน 4, 5
- ➕ หลักฐานสตรีม: producer count vs ปลายทาง

**4. หลักฐาน**: ตารางกระทบยอด Source↔Raw ต่อแหล่ง, JSON ของสคริปต์, response ของ ingest, ผลลัพธ์ `hdfs dfs -ls` ของ raw/archive, log ของกรณีล้มเหลว, ผล `e2e_ingest_check.sh` ใหม่

**5. วิธีทดสอบ** (แต่ละกรณี: Input → Process → Expected)

| # | Input | Process | Expected |
|---|---|---|---|
| E1 | CSV รู้จำนวนแถวแน่นอน | ingest → นับ raw | Count Delta = 0, Missing = 0, Extra = 0 |
| E2 | CSV มีข้อความไทย (UTF-8/BOM), คอมมา และ newline ในช่อง | ingest → เทียบ key/แถว | Record Completeness = 100% (ไม่ใช่แค่จำนวนเท่ากัน) |
| E3 | Excel (.xlsx) | ingest → เทียบแถว sheet กับ raw | Count Delta = 0 |
| E4 | ไฟล์เดิมซ้ำ | ingest ซ้ำ | `status: duplicate`, ไม่มี raw ใหม่ (มีหลักฐานเดิมแล้ว) |
| E5 | ไฟล์ว่าง / เกิน `MAX_UPLOAD_MB` | ingest | ถูกปฏิเสธพร้อมรหัส (400/413) และ ➕ ถูกนับเป็น attempt ล้มเหลว |
| E6 | REST API (allowlist) | ingest เทียบ `total` ของ API | Count Delta = 0 |
| E7 | URL ที่ไม่อยู่ใน allowlist | ingest | ปฏิเสธ fail-closed + บันทึก error |
| E8 | ตาราง PostgreSQL | ingest เทียบ `COUNT(*)` | Count Delta = 0 |
| E9 | Reddit stream ช่วงเวลาสั้น | เทียบ producer vs ปลายทาง | รายงานส่วนต่างตามจริง (สตรีมอาจไม่เท่ากัน ต้องอธิบายสาเหตุ) |
| E10 | ไฟล์ขนาด 10K/100K/1M | ingest + จับเวลา | Extraction time และ throughput ตามขนาด |

เก็บ: ผลทุกกรณีในตารางเดียว + ไฟล์ดิบ

---

### เกณฑ์ 4 · ความสมบูรณ์ของ Data Transformation (10)

**1. สิ่งที่ต้องพิสูจน์**: (ก) ทุกแถวที่เข้ามีที่ไป — ไม่มีแถวหายเงียบ (ข) ปัญหาที่ใส่ไว้ถูกตรวจจับตรงกับ ground truth (ค) แถวที่ถูกต้องไม่ถูกทำลาย (ง) ค่าที่แก้/แปลง/มาตรฐานถูกต้อง

**2. ข้อมูลที่ต้องหา**
- ก่อน: rows, null/invalid/dup/outlier ต่อคอลัมน์ (`d-profile-before.json`), ground truth ต่อแถว (`ground_truth.csv`)
- ระหว่าง: ต่อ stage `rows_in, rows_out, rows_flagged` (➕)
- หลัง: active (`active.csv`), quarantine (`quarantine.csv`) พร้อม `reject_reason`, profile หลัง, quality run doc
- ตัวอย่างแถว Before/After: เลือกแถวที่รู้ ground truth อย่างน้อยชนิดละ 3–5 แถว (ID เดียวกันก่อน→หลัง)

**3. Metrics**

| Metric | วิธีคำนวณ | หน่วย |
|---|---|---|
| Conservation | N_in = N_clean + N_quarantine + N_dropped_dup (+ N_filtered) — แสดงสมการและส่วนต่าง (ต้อง 0) | แถว |
| Accounted Rate | (N_clean + N_quarantine + N_dropped) / N_in × 100 | % |
| Detection ต่อชนิด | Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1; แยก Missing / Invalid Range / Outlier / Duplicate | อัตราส่วน |
| False Quarantine Rate | แถวที่ ground truth = Valid แต่ถูก quarantine / แถว Valid ทั้งหมด × 100 | % |
| Residual Error in Active | แถวที่ ground truth = Error แต่หลุดเข้า active (= FN ที่ปลายทาง) / แถว Error ทั้งหมด × 100 | % |
| Null / Invalid / Dup Rate ก่อน→หลัง (ใน active) | นับในชุดก่อนและหลัง | % |
| Type Conversion Success | ค่าที่ cast สำเร็จ / ค่าที่ต้อง cast × 100 ต่อคอลัมน์ | % |
| Standardization Conformity | ค่าที่ตรงรูปแบบมาตรฐาน (เช่น วันที่ ISO, หมวดที่รวมแล้ว) / ทั้งหมด × 100; จำนวนค่า distinct ก่อน→หลัง | % / ค่า |
| Derived Column Accuracy | ค่าที่ระบบคำนวณ ตรงกับการคำนวณอิสระ / แถวที่ตรวจ × 100 | % |
| Idempotency | รันซ้ำ ingest เดิม → clean/quarantine เท่าเดิม | pass/fail |

หมายเหตุสำคัญ: label ตามชนิดปัญหา *ที่ ground truth ระบุ* ไม่ใช่ตามเหตุผลที่ระบบเขียน เพราะ scorecard พบว่า score ว่างถูกเติม 0 แล้วถูกจับด้วย IQR/range (ชนิดตรวจพบ ≠ เหตุผลที่แท้จริง) และ ground truth แถวหนึ่งอาจมีหลายป้าย

**ตัวอย่างจากหลักฐานเดิม (ต้องรันซ้ำ)** — `d-detection.json` (IQR 3.0): TP 700, FP 30, FN 0, TN 9,370, precision 0.9589, recall 1.0; `d-profile-before.json`: 10,100 แถวก่อน transform; รอบประเมิน 10,000 = 9,370 active + 630 quarantine โดย 100 แถวซ้ำถูกตัดก่อนนับ — เมื่อเขียนสมการ conservation ต้องแสดงบรรทัด `dropped_dup` นี้อย่างชัดเจน

**ระบบมีอยู่แล้ว ✅**: `scripts/evaluation/{prepare_datasets,profile_before,detection,compare_golden}.py`, ground truth, golden test (ก่อน/หลัง refactor ตรงทุกตัวเลข), detection เทียบ IQR 1.5 กับ 3.0, ผลคำนวณ quality score, `quarantine_breakdown` ต่อเหตุผล, whitebox benchmark `error_reconciliation`, unit test ต่อ stage

**ควรเพิ่ม ➕**
- ➕ per-stage rows_in/out/flagged เป็นตัวเลข (ดูเกณฑ์ 2) และฟิลด์ `dropped_duplicates` เป็นตัวเลข
- ➕ **negative control**: รัน `clean_dataset.csv` (10,000 แถวที่ถูกต้อง) ผ่านระบบ แล้วรายงาน False Quarantine Rate ตามจริง — ถ้าไม่มี กรรมการจะถามว่าระบบทำลายข้อมูลดีไหม; scorecard ระบุว่า FP 30 แถวส่วนหนึ่งคือนักศึกษาจริงที่ได้คะแนนต่ำ
- ➕ เก็บ `Residual Error in Active` (ตอนนี้รายงานแค่ detection ต่อชนิดที่ตรวจพบ)
- ➕ test matrix ชนิดข้อมูลอื่น (วันที่ พ.ศ./หลายรูปแบบ, หมวดสะกดต่าง, ค่าไม่ใช่ตัวเลขในคอลัมน์ตัวเลข, คอลัมน์เงิน) เพื่อแสดง cleaning/standardization/type conversion จริง — ชุดคะแนนนักศึกษาไม่ทำให้ `standardize_*`/`copdq` ทำงาน
- ➕ ตรวจว่าระบบมี "derived column" จริงหรือไม่ ถ้าไม่มีให้ **ไม่นับ/ไม่อ้าง** ถ้าต้องการให้เพิ่มอย่างน้อยหนึ่งคอลัมน์ (เช่นสถานะผ่าน/ไม่ผ่าน) ใน transform พร้อม test
- ➕ ตัดสินใจเรื่องเอนจิน: ใช้ผล Spark (9,370/630) เป็นหลัก หรือรายงานคู่กับ interactive (9,400/100/600) พร้อมอธิบายความต่างของ rule

**4. หลักฐาน**: Before/After profile (JSON), ตัวอย่างแถวก่อน→หลัง (ตาราง, ID เดียวกัน), `d-detection.json` ใหม่ + confusion matrix, golden test output, รายการ quarantine พร้อมเหตุผล, สมการ conservation, ผล negative control, screenshot หน้า quality result

**5. วิธีทดสอบ**

| # | Input | Process | Expected |
|---|---|---|---|
| T1 Missing | แถว score ว่าง (ground truth ระบุ) | transform | แถวถูก quarantine/จัดการตามนโยบาย; ไม่หลุดเข้า active |
| T2 Range | score นอก 0–100 | transform | quarantine ครบตาม ground truth |
| T3 Duplicate | คีย์ซ้ำ | transform | active ไม่มีคีย์ซ้ำ และ **นับแถวที่ตัดทิ้ง** ได้ |
| T4 Outlier | ค่าผิดปกติใน study_hours | transform + IQR 1.5 vs 3.0 | เปรียบเทียบ precision/recall ตามค่า config (ระบุว่าเป็นค่าของเคสนี้) |
| T5 Type | ข้อความในคอลัมน์ตัวเลข | transform | Type Conversion Success ตามจริง; ค่าเสียไม่เข้า active |
| T6 Date | วันที่หลายรูปแบบ/พ.ศ. | `standardize_dates` | Conformity = ค่าที่วัดได้; stage มี rows_flagged > 0 |
| T7 Category | ค่าหมวดสะกดต่าง | `standardize_categories` | distinct ก่อน > หลัง |
| T8 Derived | คอลัมน์ที่คำนวณ (ถ้ามี) | เทียบการคำนวณอิสระ | Derived Column Accuracy |
| T9 Negative control | `clean_dataset.csv` | transform | รายงาน False Quarantine Rate ตามจริง |
| T10 Idempotent / Golden | รันซ้ำ + golden | เทียบ before/after | ตัวเลขตรงกัน (golden มีอยู่แล้ว) |
| T11 Conservation | ทุกชุดข้างต้น | คำนวณสมการ | ส่วนต่าง = 0 หรืออธิบายได้ |

---

### เกณฑ์ 5 · ความถูกต้องของการนำเข้าสู่ปลายทาง (Data Loading) (5)

**1. สิ่งที่ต้องพิสูจน์**: ข้อมูลที่ประมวลผลแล้ว (clean → active, reject → quarantine) ไปถึงปลายทางครบ ค่าตรง schema ตรง และกรณีล้มเหลวไม่ทำให้ข้อมูลเสีย/ซ้ำ

**ปลายทาง (Destination) ของระบบ**: Delta active `/data/active/<table>` · Delta quarantine `/data/quarantine/<table>` · ES `sdoqap_quality_runs`/`sdoqap_lineage_runs`/`sdoqap_pipeline_runs` (รายงาน) · `/data/archive/<table>/<ingest_id>` (raw ที่เก็บ)

**2. ข้อมูลที่ต้องหา — ตารางกระทบยอด 4 จุด** (ใช้ร่วมกับเกณฑ์ 3, 4)

| จุดนับ | วิธีนับ | ค่า |
|---|---|---|
| P1 Source | นับอิสระที่ต้นทาง | `<…>` |
| P2 Raw | นับไฟล์ใน `/data/raw` ก่อนประมวลผล | `<…>` |
| P3 Processed | N_clean, N_quarantine, N_dropped_dup (จากเอนจิน) | `<…>` |
| P4 Destination | `GET /export/records/active/{t}` → `total_rows`, `…/quarantine/{t}` → `total_rows` (กรอง `run_id`/`ingest_id`) | `<…>` |

- นอกจากนี้: schema ของ Delta ปลายทาง (ชื่อ+ชนิดคอลัมน์) vs schema ที่ลงทะเบียน, Delta history ของ MERGE, state/exit code ใน `sdoqap_runs`, เวลาเขียน

**3. Metrics**

| Metric | วิธีคำนวณ | หน่วย |
|---|---|---|
| Load Completeness (active) | |keys(clean) ∩ keys(active ปลายทาง)| / |keys(clean)| × 100 — ใช้คีย์ ไม่ใช้ส่วนต่างจำนวน เพราะ MERGE อัปเดตแถวเดิมแทนการเพิ่ม | % |
| Load Completeness (quarantine) | rows ใน quarantine ของ `ingest_id` นี้ / N_quarantine × 100 | % |
| Failed Records | N_intended − N_loaded (แยก active/quarantine) | แถว |
| Load Success Rate (run-level) | runs state SUCCEEDED / runs ทั้งหมด (ไม่นับ SKIPPED ถ้าอธิบาย) × 100 จาก `sdoqap_runs` | % |
| Data Integrity | แถวที่ hash(คีย์+คอลัมน์) ตรงกันระหว่าง processed df กับค่าอ่านกลับ / แถวที่เทียบ × 100 | % |
| Schema Consistency | คอลัมน์ที่ชื่อ+ชนิดตรงกับ registry / คอลัมน์ทั้งหมด × 100 | % |
| Inserted / Updated | `numTargetRowsInserted` / `numTargetRowsUpdated` จาก Delta MERGE operationMetrics (➕ เก็บ) | แถว |
| Load Time | เวลาเขียน Delta ต่อ run (วินาที) และ throughput แถว/วินาที | วินาที |
| End-to-End Time | `finished_at − created_at` ใน `sdoqap_runs` | วินาที |
| Idempotency | retry ingest เดิม → จำนวนใน quarantine/active ไม่เพิ่มเป็นสองเท่า | pass/fail |

**ระบบมีอยู่แล้ว ✅**: Delta MERGE ตาม PK (โหลดแรก overwrite), quarantine ลบตาม `ingest_id` แล้วเขียนใหม่ **ก่อน** MERGE (idempotent), MERGE ล้มเหลว → fail closed + exit 1, archive แทนลบ, lock มี heartbeat, state QUEUED→RUNNING→SUCCEEDED/FAILED/SKIPPED/TRIGGER_FAILED, `export/records` นับ `total_rows` จาก `_delta_log`, `sdoqap_quality_runs.duration_seconds` + `stage_seconds`, ตัวอย่างรอบประเมิน 10,000 = 9,370 + 630

**ควรเพิ่ม ➕**
- ➕ บันทึก load metrics (`active_rows_before/after`, `inserted`, `updated`, `quarantine_written`, `load_seconds`) ลง quality run หรือ `sdoqap_runs`
- ➕ `scripts/evaluation/load_reconcile.py` ทำตาราง 4 จุดอัตโนมัติ (อ่านปลายทางผ่าน API/WebHDFS)
- ➕ ตรวจ schema ปลายทางเทียบ registry หลังโหลด (ตอนนี้ `autoMerge` เปิด จึงไม่มีการบังคับ)
- ➕ ทดสอบความล้มเหลวจงใจ (เช่น schema ที่ชนิดขัด) พิสูจน์ fail-closed ไม่เขียนครึ่งเดียว
- ➕ แก้ `d-scale.json` ให้เป็นผลที่ SUCCEEDED และรวม load time ต่อขนาด (ผลเก่าใน commit `3013226`: ดูไฟล์ ไม่คัดลอกตัวเลขมาโดยไม่รันซ้ำ)
- ➕ ทำให้ `sdoqap_pipeline_runs` มี `ingest_id` และ `duration_seconds` (หรือให้ UI อ่านจาก quality runs) เพื่อให้หน้า Pipeline แสดงเวลา load ได้

**4. หลักฐาน**: ตารางกระทบยอด 4 จุด (JSON + ภาพ), `export/records` response ของ active และ quarantine, Delta history (MERGE metrics), `sdoqap_runs` document, screenshot หน้าปลายทาง (Workspace Exports/records), ผลกรณีล้มเหลว+retry, ตารางเวลาตามขนาดข้อมูล

**5. วิธีทดสอบ**

| # | Input | Process | Expected | เก็บ |
|---|---|---|---|---|
| L1 | ตารางใหม่ (ไม่เคยโหลด) | ingest → โหลดครั้งแรก (overwrite) | Load Completeness = 100%, schema ตรง | ตาราง 4 จุด |
| L2 | ไฟล์ชุดที่ 2 คีย์ซ้อนทับบางส่วน | MERGE | inserted + updated = N_clean; ไม่มีคีย์ซ้ำใน active | operationMetrics |
| L3 | retry ingest เดิม | `POST /pipeline/retry/{ingest_id}` | quarantine ไม่ซ้ำ, active ไม่เพี้ยน | จำนวนก่อน/หลัง |
| L4 | ไฟล์ schema ผิดชนิดโดยตั้งใจ | ingest | state FAILED/ถูกกักตาม design, active เดิมไม่เปลี่ยน | `sdoqap_runs`, active count เท่าเดิม |
| L5 | ไฟล์ว่าง | ingest | SKIPPED (exit 75) ไม่มี quality run | state |
| L6 | 10K / 100K / 500K / 1M | โหลดตามขนาด | Load Completeness 100%, เวลาตามขนาด (รายงานตามจริงแม้ช้า; หากเครื่องรับไม่ไหวระบุขนาดสูงสุดที่ทำได้ ตาม Evalution_Guildline) | `d-scale.json` ใหม่ |
| L7 | ข้อมูลอ่านกลับ | เทียบ hash กับ processed | Integrity = ค่าที่วัดได้ | ผลเทียบ |

---

### เกณฑ์ 6 · ประสิทธิผลของการใช้ประโยชน์จากข้อมูล (5)

**1. สิ่งที่ต้องพิสูจน์**: ข้อมูลที่ผ่าน pipeline แล้ว (a) ถูกนำไปสร้างผลที่ตอบโจทย์ผู้ใช้ได้จริง (b) ตัวเลขที่แสดงถูกต้อง (c) ผู้ใช้แก้/บันทึก/เปิดซ้ำได้

**Create Dashboard ใช้เป็นหลักฐานได้อย่างไร** — พิสูจน์ได้ 4 ข้อ:
1. **ใช้ข้อมูลหลัง Quality Gate เท่านั้น**: ตัวเลือก dataset มาจาก active layer (`/data/active/<table>`) กับ `_quality_runs`; ไม่เสนอ raw/quarantine (`dashboard_data.py`)
2. **ตัวเลขคำนวณแบบกำหนดผลได้**: LLM เลือกแค่ spec (`dashboard_spec.py`), ค่าทุกตัวคำนวณด้วย pandas (`dashboard_compute.py`) → ตรวจซ้ำอิสระได้ ไม่ต้องเชื่อ LLM
3. **ปลอดภัยต่อข้อมูล**: LLM ได้ schema/profile เท่านั้น ไม่ได้แถวหรือค่าหมวด (มี test `test_the_prompt_carries_the_profile_but_no_cell_values`, `test_identifier_values_never_reach_the_prompt`)
4. **ใช้งานได้ครบวงจร**: Select → Requirement → Generate (KPI/Charts/Filters) → Refine ด้วย AI → Save → เปิดซ้ำ (`/dashboard-builder`)

**2. ข้อมูลที่ต้องหา**
- Input: dataset ที่เลือก (ชื่อ, rows ใน active, `quality_score`), ข้อความ requirement + audience, ชุดคำถามธุรกิจที่กำหนด *ก่อน* ทดลอง
- Output: spec (JSON), `engine` (ai/rules), `model`, `warnings` (ที่ validate ตัดทิ้ง), widget ทั้งหมด (KPI/chart/table/filter) พร้อมค่า
- เทียบ: ค่าจากการคำนวณอิสระ (pandas/SQL บนไฟล์ export active) สำหรับทุก KPI และกราฟ
- เวลา: คลิก Generate → แสดงผล, Refine → แสดงผล
- ก่อน/หลัง pipeline: dashboard เดียวกันบน (i) ข้อมูลอ้างอิงที่ถูกต้อง (`clean_dataset.csv`) กับ (ii) active หลัง ETL — แสดงว่า ETL ไม่ทำให้ข้อสรุปเพี้ยน

**3. Metrics**

| Metric | วิธีคำนวณ | หน่วย |
|---|---|---|
| KPI/Chart Accuracy | widgets ที่ค่าตรงการคำนวณอิสระ / widgets ที่ตรวจ × 100 (ระบุเกณฑ์ความคลาดเคลื่อน เช่น ปัดเศษ) | % |
| Requirement Coverage | คำถามธุรกิจที่มี widget ตอบ / คำถามที่กำหนด × 100 (ประเมินด้วย checklist ที่ล็อกไว้ก่อนทดลอง) | % |
| Spec Validity Rate | widgets ที่ผ่าน validate / widgets ที่ LLM เสนอ × 100 (จาก `warnings`) | % |
| AI vs Rules Rate | จำนวนครั้ง `engine=ai` / จำนวน generate ทั้งหมด × 100 (fallback = `rules`) | % |
| Generation / Refine Latency | เวลา request → response (วินาที), รายงาน median และ max ตามจำนวนครั้งที่ทดสอบจริง | วินาที |
| Refinement Success Rate | refine ที่ได้ spec ใช้ได้ (ไม่ 422/503) / refine ทั้งหมด × 100 | % |
| Filter Consistency | filter ที่ตัวเลขเปลี่ยนและตรงการคำนวณอิสระ / filter ที่ทดสอบ × 100 | % |
| Save/Reopen Fidelity | dashboard เปิดใหม่ให้ spec และค่าเหมือนตอนบันทึก (pass/fail ต่อใบ) | % |
| Utilization Gap | |KPI(ETL active) − KPI(ข้อมูลอ้างอิง)| ต่อ KPI (แสดงทั้งค่าสัมบูรณ์และสัมพัทธ์) | หน่วยเดิมของ KPI |
| Business Insight Count | จำนวน insight ที่ทีมบอกได้จาก dashboard พร้อมตัวเลขสนับสนุน (ประเมินด้วย checklist) | รายการ |

**ข้อควรระวังเชิงข้อเท็จจริง (จาก scorecard)**: ชุดอ้างอิงมีนักศึกษาที่ต่ำกว่าเกณฑ์ 28 คน แต่หลัง ETL เหลือ 5 คน (Z-score/กฎอื่น quarantine นักศึกษาจริงที่คะแนนต่ำ) ทำให้ dashboard "อัตราผ่านหลัง ETL" สูงกว่าความจริง — ควรรายงาน Utilization Gap ตรง ๆ พร้อมอธิบาย trade-off (และตัดสินใจว่าจะปรับ rule ก่อนเก็บหลักฐานหรือไม่) แทนซ่อน; กรรมการที่เทียบกับ `course_analytics_summary.xlsx` จะเห็นส่วนต่าง

**ระบบมีอยู่แล้ว ✅**: หน้า `/dashboard-builder` ครบ flow, endpoints `/dashboards/{datasets,generate,refine,render,saved}`, validate spec (whitelist, ไม่รันโค้ด/SQL), rule-based fallback เมื่อ LLM ใช้ไม่ได้ (`engine: "rules"` + banner), time budget 20 วินาที/ครั้ง, เก็บ dashboard ที่บันทึกใน ES `sdoqap_dashboards`, test API 105 ข้อ + UI 58 ข้อ (นับจาก `def test_`/`it(` — ยังไม่ได้รัน), `d-utilization.md` (คะแนนเฉลี่ยรายวิชา, อัตราผ่าน, การกระจาย, รายชื่อติดตาม), quality dataset `_quality_runs` สำหรับ monitor คุณภาพ, `docs/superpowers/plans/2026-10-02-ai-dashboard-builder.md` Task 13 (checklist ตรวจด้วยมือ 8 ขั้น)

**ควรเพิ่ม ➕**
- ➕ log ทุกครั้งที่ generate/refine: latency, `engine`, `model`, จำนวน warnings, retry, สำเร็จ/ล้มเหลว (ปัจจุบันไม่มี — ส่งกลับ client แต่ไม่เก็บ) เช่นลง index `sdoqap_dashboard_events`
- ➕ `scripts/evaluation/dashboard_accuracy.py`: เรียก `/render` แล้วเทียบกับ pandas บน `GET /export/active/{table}` ผลเป็นตาราง matched/mismatched
- ➕ ชุด requirement ที่ล็อกไว้ก่อนทดลอง (≥ ตามที่ทีมกำหนด) หลาย audience (business/analyst/management) และคำถามธุรกิจประกอบ เช่น "คะแนนเฉลี่ย/อัตราผ่านรายวิชา", "การกระจายคะแนน", "ติดตามคุณภาพข้อมูลตามรอบ"
- ➕ dashboard จาก dataset ที่ไม่ใช่คะแนนนักศึกษา อย่างน้อย 1 ชุด (เช่น grocery sales) เพื่อพิสูจน์ว่าไม่ได้ผูกกับ dataset เดียว
- ➕ ผลเทียบ Utilization Gap (ข้อมูลอ้างอิง vs หลัง ETL) เป็นตาราง
- ➕ ก่อนใช้หน้า Executive Dashboard/Grafana เป็นหลักฐาน ต้องแก้บั๊ก F-21/22/23 (หน้า Create Dashboard ไม่กระทบ); ถ้าไม่แก้ ให้ไม่ใช้

**4. หลักฐาน**: screenshot ต่อขั้น (เลือก dataset → preview → requirement → dashboard → refine → save → เปิดซ้ำ), JSON spec ก่อน/หลัง refine, ตารางเทียบตัวเลข widget ต่อ widget, ผล pytest `test_dashboard*.py` + vitest, ผลเทียบก่อน/หลัง ETL, `d-utilization.md/json`, บันทึกเวลา

**5. วิธีทดสอบ**
- Input: dataset จาก active (ผ่าน pipeline แล้ว) + requirement (ภาษาไทย) ที่เตรียมไว้ + audience
- Process: Generate → ตรวจทุก widget กับการคำนวณอิสระ → ปรับ filter → Refine ด้วยคำสั่งเช่น "เพิ่มตัวกรองวิชา" → Save → ปิดแล้วเปิดใหม่ → ทดสอบ LLM ล่ม (ปิด key) เพื่อดู fallback
- Expected: ค่าทุก widget ตรง (ตามเกณฑ์คลาดเคลื่อนที่ระบุ); refine ไม่ regenerate ทั้งใบ; เปิดใหม่ได้ spec เดิม; ไม่มีค่าแถว/หมวดใน prompt (test); fallback ทำงานพร้อมแจ้งผู้ใช้
- เก็บ: ทุกข้อใน "หลักฐาน"

---

## 3. Evidence Checklist (เฉพาะ 6 หัวข้อ)

**เกณฑ์ 1 · แหล่งข้อมูล/ปริมาณ**
- [ ] จำนวน Data Sources — รายการ connector ที่ ingest จริง 4 ชนิด + `ingest_id` ต่อชนิด
- [ ] จำนวน Datasets (distinct checksum) แยกจากสำเนา benchmark
- [ ] จำนวน Records / Columns / Size ต่อแหล่ง (ตารางปริมาณ)
- [ ] `d-source-inventory.json` รันใหม่ ณ วันเก็บหลักฐาน
- [ ] หลักฐานสตรีม (producer count vs ES `reddit`) ➕
- [ ] ตัวเลขรวมตัวเดียวไม่ขัดกันทุกเอกสาร (183/187 รอบ)

**เกณฑ์ 2 · กระบวนการ**
- [ ] Process Register (A/B/C) + กติกานับ 4 ข้อ
- [ ] เอาต์พุต `python -m sdoqap.pipeline` (21 stage ปัจจุบัน)
- [ ] `stage_seconds` ของรอบประเมิน และ stage ที่ activated จริง
- [ ] stage ที่เพิ่ม (`load_active`, `load_quarantine`, `archive_raw`) ➕
- [ ] ผล unit test Spark ล่าสุด (รันซ้ำ)
- [ ] Feature ที่ไม่นับ แยกตารางชัดเจน

**เกณฑ์ 3 · Extraction**
- [ ] ตารางกระทบยอด Source↔Raw ต่อแหล่ง (Count Delta, Missing, Extra, Duplicated)
- [ ] Extraction Evidence: response, `sdoqap_runs`, `hdfs ls` raw/archive
- [ ] Column Completeness และ checksum fidelity
- [ ] Extraction Success/Error Rate (รวม attempt ล้มเหลว) ➕
- [ ] Extraction Time/Throughput ต่อขนาด
- [ ] ผลกรณีผิดปกติ E4, E5, E7 (ซ้ำ/ว่าง/ไม่อนุญาต)

**เกณฑ์ 4 · Transformation**
- [ ] Transformation Before/After (profile ก่อน-หลัง + ตัวอย่างแถว ID เดียวกัน)
- [ ] สมการ Conservation พร้อม `dropped_dup`
- [ ] Detection ต่อชนิด vs ground truth (precision/recall/F1, confusion matrix)
- [ ] Negative control (`clean_dataset.csv`) + False Quarantine Rate ➕
- [ ] Residual Error in Active ➕
- [ ] ผลทดสอบ type/date/category/derived (T5–T8) ➕
- [ ] Golden test before/after และ idempotency

**เกณฑ์ 5 · Loading**
- [ ] Loading Evidence: ตาราง 4 จุด (Source/Raw/Processed/Destination)
- [ ] Destination Evidence: `export/records` active+quarantine, Delta history, screenshot
- [ ] Load Completeness, Integrity, Schema Consistency
- [ ] Load Success Rate (`sdoqap_runs`) และ Failed Records
- [ ] Load Time ต่อขนาด (`d-scale.json` ที่ SUCCEEDED)
- [ ] ผลทดสอบ retry/idempotent และกรณีล้มเหลว (L3–L5)

**เกณฑ์ 6 · Utilization**
- [ ] Data Utilization Evidence: `d-utilization.md/json` (รันใหม่)
- [ ] Dashboard Evidence: screenshot ครบ flow Create Dashboard + JSON spec
- [ ] ตารางเทียบตัวเลข widget vs การคำนวณอิสระ (KPI Accuracy)
- [ ] Requirement Coverage checklist ที่ล็อกก่อนทดลอง
- [ ] Generation/Refine latency, AI-vs-Rules, Spec Validity (log ➕)
- [ ] Utilization Gap เทียบข้อมูลอ้างอิง

**หลักฐานรวม**
- [ ] Metrics — สรุปตัวเลขทั้ง 6 เกณฑ์ในไฟล์เดียว (สร้างจากสคริปต์ ไม่พิมพ์มือ)
- [ ] Screenshot — อัปโหลด, Ingestion result, Pipeline, ปลายทาง, Dashboard
- [ ] Log — Spark engine log, `sdoqap_runs`, API log
- [ ] Test Result — pytest API/Spark/eval/scripts + vitest UI (รันซ้ำและแนบ)
- [ ] Dataset — `clean_dataset.csv`, `dirty_dataset.csv`, `ground_truth.csv`, ชุด scale, ชุดที่ใช้กับ stage ที่ว่าง
- [ ] Snapshot protocol: commit hash + วัน/เวลา + `run_id`/`ingest_id` ทุกชุดตัวเลข

---

## 4. ลำดับงาน (เรียงตามคะแนนที่เสี่ยงต่อ effort)

1. **แก้ `d-scale.json` / รัน benchmark ซ้ำ** (เกณฑ์ 1, 5) — กรรมการเปิดแล้วเห็น FAILED
2. **เพิ่ม raw count + `dropped_duplicates` + `source_rows` และตาราง 4 จุด** (เกณฑ์ 3, 4, 5 รวม 25 คะแนน) — เป็นช่องว่างใหญ่สุด เพราะไม่มีการกระทบยอด
3. **Process Register + stage load + ชุดข้อมูลที่ activate stage ว่าง** (เกณฑ์ 2, 15 คะแนน)
4. **Negative control + Residual Error + test matrix type/date/category** (เกณฑ์ 4)
5. **Dashboard accuracy script + event log + requirement set** (เกณฑ์ 6)
6. รันทุกสคริปต์ครั้งเดียวต่อเนื่อง freeze เป็น Evidence Pack ตาม snapshot protocol แล้วค่อยทำสไลด์

ข้อจำกัดของแผนนี้: อ่านจากโค้ดและไฟล์ที่ commit ไม่ได้รันระบบ จึงไม่ยืนยันว่าตัวเลขเดิมยังเกิดซ้ำได้ ชื่อฟิลด์/path ที่อ้างควรตรวจซ้ำก่อนเขียนสคริปต์ และกติกานับกระบวนการ (หัวข้อ 2) เป็นข้อเสนอที่ทีมควรยืนยันก่อนใช้
