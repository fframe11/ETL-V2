# รายงาน Integration Test: Mock PostgreSQL -> SDOQAP Database Ingestion (2026-10-06)

ชุดทดสอบ: `scripts/tests/integration_rdbms/` · หลักฐานดิบ: `scripts/tests/integration_rdbms/evidence/report-{default,control}.json`

## ผลสรุป

| โหมด | ผล | หมายเหตุ |
|---|---|---|
| default (semester = `2025-1`) | 19/20 PASS | FAIL เฉพาะ TC7d: engine ทำ `semester` เป็น NULL ทั้งคอลัมน์ (ดู Finding 1) |
| control (semester = `1/2025` ตามรูปแบบข้อมูลของโปรเจกต์) | 20/20 PASS | ใช้แยกว่าสาเหตุไม่ใช่ขั้นตอนดึงข้อมูลจาก DB |

การดึงข้อมูลจาก Database เข้าระบบ (TC1 ถึง TC6, TC8) ผ่านครบทั้งสองโหมด

## เส้นทางที่ทดสอบ (จาก code จริง)

| ขั้น | ไฟล์ / function |
|---|---|
| API | `POST /api/v1/pipeline/ingest/rdbms` = `ingest_rdbms()` ใน `services/api/app/api/pipeline.py:577` |
| Request body | `RdbmsIngestPayload`: `table_name, db_type="postgresql", host, port, username, password, database, query` (`pipeline.py:567`) |
| Auth | `require_session_or_service_key` (`auth.py:88`): cookie หรือ header `X-Service-Key` = `INGEST_SERVICE_KEY` |
| Guard | `validate_table_name` (`validation.py`), `validate_rdbms_host` (allowlist `RDBMS_ALLOWED_HOSTS`), `validate_select_only` + `run_readonly_query` (read-only transaction, timeout 30 วินาที, `RDBMS_MAX_ROWS`) ใน `ingest_guards.py` |
| ดึงข้อมูล | `psycopg2.connect(... connect_timeout=3)` แล้ว `cur.execute(query)` ภายใน `run_readonly_query` |
| ส่งเข้า pipeline | แปลงเป็น CSV -> `land_and_queue()` (`pipeline.py:271`): checksum กันซ้ำ -> `upload_to_webhdfs()` (`/data/raw/<table>/<ingest_id>/<table>.csv`) -> `run_registry.create_run()` (ES `sdoqap_runs`) -> `trigger_spark_job()` (Spark trigger daemon `:8099/retry`) |
| ตรวจสถานะ | `GET /api/v1/pipeline/runs/{ingest_id}` (`pipeline.py:306`), ผล quality ใน ES `sdoqap_quality_runs` |

## สภาพแวดล้อม

- `sdoqap-mockdb`: `postgres:15-alpine`, DB `mock_students`, user `mock_user`, host ในเครือข่าย Docker `sdoqap-mockdb:5432`, host port 5433 (PostgreSQL จริงของโปรเจกต์ที่ 5432 ไม่ถูกแตะ; ตรวจแล้วยังมีตาราง `student_scores_src` ตารางเดียวเหมือนเดิม)
- `sdoqap-api-it` (port 8012): image `etl-api` ตัวเดียวกับ `sdoqap-api`, `.env` เดียวกัน, ES / HDFS / Spark ตัวจริงชุดเดียวกัน ต่างกันที่ `RDBMS_ALLOWED_HOSTS=sdoqap-mockdb`
- เหตุผลที่ต้องมี API อีกตัว: `sdoqap-api` ตั้ง `RDBMS_ALLOWED_HOSTS=postgres` และ guard เป็น fail-closed จึงเชื่อม Mock DB ไม่ได้ การทำแบบนี้หลีกเลี่ยงการแก้ `.env` หรือ restart API ที่ใช้งานอยู่ ไม่มีการแก้ code ของระบบ
- ข้อมูล: `student_scores` 20 แถว (ปกติ 14, NULL 2, ซ้ำ 1, out-of-range 3), PK ของตารางต้นทางคือ `row_id`; ไม่มีเมนูหรือข้อมูลกุ้งและปู

## Test Case

| # | Test Case | Expected | Actual | ผล | หลักฐาน |
|---|---|---|---|---|---|
| TC1 | Connect to Mock PostgreSQL (จาก container ของ backend) | psycopg2 ต่อ `sdoqap-mockdb:5432` ด้วย `mock_user` ได้ | ต่อได้: `('mock_students','mock_user','172.19.0.18','PostgreSQL 15.15 ...')` | PASS | `docker exec sdoqap-api-it python` |
| TC2 | Query table | 20 แถว, PK=`row_id`, NULL score/name/hours = 1/1/1, `student_id` ซ้ำ 1, score นอกช่วง 2, study_hours นอกช่วง 1 | ตรงทุกค่า; คอลัมน์: `row_id int, student_id/name/course/semester varchar, score/study_hours numeric` | PASS | SQL `COUNT`, `information_schema`, `pg_index` |
| TC3 | Ingest ผ่าน API | HTTP 202, `status=queued`, มี `ingest_id`, `spark_triggered=true` | HTTP 202, `ingest_id=20261006T125353-8e56b77f`, `run_state=QUEUED`, `spark_triggered=true`, `rows_ingested=20` | PASS | `report-control.json` > `ingest_response` |
| TC4 | Row count | `rows_ingested` = `COUNT(*)` ของต้นทาง = แถวใน CSV ที่ลง HDFS | 20 = 20 = 20 (อ่านจาก `/data/raw/<table>/<ingest_id>/<table>.csv`) | PASS | `hdfs dfs -cat` |
| TC5 | Schema | header CSV = `student_id,name,course,semester,score,study_hours` | ตรง | PASS | header ของไฟล์ที่ลง HDFS |
| TC6 | Data | ทุกแถวที่ลง HDFS เท่ากับแถวต้นทาง รวม NULL, แถวซ้ำ, ค่า out-of-range | เหมือนกัน 20/20 แถว (NULL ถูกเขียนเป็นช่องว่างใน CSV) | PASS | เทียบกับผล `psycopg2` ใน container เดียวกับ API |
| TC7 | Pipeline / run status | run `QUEUED` -> `SUCCEEDED`, `source=rdbms`, มีเอกสารใน `sdoqap_quality_runs` | `SUCCEEDED` ใน 67 ถึง 90 วินาที, `source=rdbms`, `size_bytes=1021`, มี quality doc | PASS | `GET /pipeline/runs/{id}` + ES |
| TC7b | Quality engine นับแถว | `total_records = 20 - 1 ซ้ำ = 19`, log `resolved_1_duplicates`, clean + quarantined = total | control: total 19, clean 14, quarantined 5, score 73.68; log `resolved_1_duplicates`, `iqr_outliers_flagged_3` | PASS | `quality_runs` |
| TC7c | ตรวจเจอ NULL ที่ seed ไว้ | `null_value_in_name = 1` | control: `{outlier_score:2, outlier_study_hours:1, null_value_in_score:1, null_value_in_name:1}` | PASS | `quarantine_breakdown` |
| TC7d | แถวปกติ 14 แถวต้อง clean | `clean_records >= 14` | control: 14. default: **0** (ดู Finding 1) | control PASS / default FAIL | `quarantine_breakdown` |
| TC8a | Error: password ผิด | HTTP 502, ไม่มี stack trace, ไม่สะท้อน password | 502 `PostgreSQL fetch failed: ... password authentication failed for user "mock_user"` | PASS | response |
| TC8b | Error: table ไม่มีอยู่ | HTTP 502 พร้อมข้อความ | 502 `relation "no_such_table" does not exist` | PASS | response |
| TC8c | Error: host นอก allowlist | HTTP 400 | 400 `Host 'evil.example' is not in the RDBMS_ALLOWED_HOSTS allowlist.` | PASS | response |
| TC8d | Error: ไม่ใช่ SELECT (`DELETE`) | HTTP 400 | 400 `Only SELECT queries are allowed` และข้อมูลต้นทางยังครบ 20 แถว | PASS | response |
| TC8e | Error: `db_type=mysql` | NOT SUPPORTED เป็น 400 | 400 `Only 'postgresql' is currently supported.` | PASS (NOT SUPPORTED ตามดีไซน์) | response |
| TC8f | Error: query ไม่คืนแถว | HTTP 400 | 400 `returned no rows to ingest.` | PASS | response |
| TC8g | Error: port ผิด (DB เชื่อมไม่ได้) | HTTP 502 | 502 `... port 5999 failed: Connection refused` | PASS | response |
| TC8h | Error: ไม่มี credential ของ API | HTTP 401 | 401 | PASS | response |
| TC8i | ingest ข้อมูลเดิมซ้ำ | HTTP 200, `duplicate`, `ingest_id` เดิม, ไม่ trigger Spark | 200, `status=duplicate`, `spark_triggered=false` | PASS | response |
| TC8j | Error ไม่ทำให้ pipeline พัง | ไม่มี run เพิ่ม, `/healthz`=200, run เดิมยัง `SUCCEEDED` | run 1 -> 1, `/healthz` 200, state `SUCCEEDED` | PASS | ES `sdoqap_runs` |

## Finding

**1. (engine) `semester` รูปแบบ `2025-1` ถูกเดาเป็น `TimestampType` แล้วกลายเป็น NULL 100%**
- หลักฐาน (default run `itest_mockdb_20261006_195210`): `sdoqap_schema_registry.schema_spec.semester = "TimestampType"`, `null_profile.semester.null_rate = 1.0`, `quarantine_breakdown = {null_value_in_name: 1, null_value_in_semester: 18}`, `clean_records = 0`, `quality_score = 0.0`
- control run ที่ใช้ `1/2025` แทน ได้ clean 14 และ score 73.68 แปลว่าเส้นทาง DB -> API -> HDFS -> Spark ถูกต้อง ปัญหาอยู่ที่การเดา type ของ engine เมื่อเจอค่ารูปแบบ `YYYY-N` ที่ไม่ใช่วันที่
- ผลกระทบ: ตารางที่ไม่เคยลงทะเบียน schema ที่มีรหัสรูปแบบ `ปี-เลข` จะถูกกักกันทั้งตาราง (ข้อมูลดิบยังอยู่ใน `/data/archive`)
- ไม่ได้แก้ code (ขอบเขตงานนี้คือทดสอบ) ตำแหน่งที่ต้องดูต่อ: ขั้นเดา schema ใน `services/spark/spark_quality_engine.py` (ส่วน inferred_spec ราวบรรทัด 1927) และ `services/spark/sdoqap/stages/schema.py`

**2. (ข้อสังเกตเล็ก) ข้อความ error เปิดเผยรายละเอียดภายใน** `PostgreSQL fetch failed: {e}` ส่งต่อข้อความของ psycopg2 ซึ่งมี IP ภายใน, ชื่อ user และบรรทัด SQL; ไม่มี password

**3. (ข้อสังเกตเล็ก) table ไม่มีอยู่ตอบ 502 แทน 4xx** ตรงกับที่เคยบันทึกไว้ใน T4.3 ของรายงาน 2026-10-01

**4. (ข้อสังเกต) การลบตารางไม่ลบกฎรายตารางใน `rules_config.json`** หลัง `DELETE /api/v1/export/tables/{table}` ยังมี block `itest_mockdb_*` ค้างในไฟล์ ทำให้ไฟล์ใน git สกปรกและโตขึ้นทุกครั้งที่ ingest ตารางใหม่

## ผลข้างเคียงต่อระบบจริง

- ข้อมูลทดสอบถูกลงใน ES / HDFS ของระบบจริงภายใต้ชื่อ `itest_mockdb_<timestamp>` แล้วลบทั้งหมดด้วย `DELETE /api/v1/export/tables/{table}` (ตรวจแล้ว: `sdoqap_runs`, `sdoqap_quality_runs`, `sdoqap_schema_registry` และ HDFS ไม่เหลือชื่อ `itest_`)
- Engine เขียน block กฎของแต่ละตารางทดสอบลง `services/spark/rules_config.json` (ไฟล์ที่ track ใน git, +235 บรรทัด, 5 ตาราง `itest_mockdb_*`) และ `DELETE /export/tables/{table}` ไม่ได้ลบ block นี้ออก (Finding 4) ผมคืนไฟล์ด้วย `git checkout` แล้ว (diff มีแต่ส่วนที่เพิ่มจากเทสต์) ควรทำซ้ำหลังรันเทสต์ทุกครั้ง: `git checkout -- services/spark/rules_config.json`
- Container `sdoqap-mockdb` และ `sdoqap-api-it` ยังรันอยู่ ปิดด้วยคำสั่ง `down -v` ใน `scripts/tests/integration_rdbms/README.md`

## คำสั่งรันซ้ำ

```bash
cd scripts/tests/integration_rdbms
docker compose -p sdoqap-it --env-file ../../../.env -f docker-compose.mockdb.yml up -d
python run_rdbms_integration.py --cleanup            # โหมด default
python run_rdbms_integration.py --control --cleanup  # control run
docker compose -p sdoqap-it --env-file ../../../.env -f docker-compose.mockdb.yml down -v
```
