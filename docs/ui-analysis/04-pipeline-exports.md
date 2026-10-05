# 04 — คำอธิบาย UI ทีละหน้า: Jobs & Pipelines และ Workspace Exports

เอกสารนี้ตรวจจากโค้ดจริงใน `C:\ETL` (อ่านโค้ดทุกไฟล์ที่อ้าง) ตัวเลขหลัง `:` คือเลขบรรทัด ถ้าตรวจไม่พบในโค้ดจะเขียนว่า "ตรวจไม่พบในโค้ด"

**ป้ายแสดงที่มาของข้อมูล (ทุกรายการมี 1 ป้าย)**

- 🟢 ข้อมูลจริงจาก Backend (ดึงจาก API / ไฟล์ / Elasticsearch / HDFS)
- 🟡 ข้อมูลที่คำนวณจากระบบ (คำนวณจากข้อมูลจริง ระบุสูตรให้)
- 🔴 Mock / Static / ค่าคงที่ฮาร์ดโค้ด (ข้อความหรือตัวเลขที่เขียนตายตัว หรือค่าสำรองตอนโหลดไม่ได้)
- ⚪ UI ที่มีแต่ยังไม่ได้เชื่อมระบบจริง (ปุ่ม/ตัวแปรที่ไม่ได้ทำงานจริง)

**คำศัพท์ที่ใช้ซ้ำ** (อธิบายครั้งเดียว)

- ES = Elasticsearch (ฐานข้อมูลค้นหา เก็บประวัติการรัน/ผลคุณภาพ)
- HDFS = ระบบไฟล์แบบกระจาย เก็บไฟล์ข้อมูลจริง
- Delta Lake = รูปแบบตารางบน HDFS ที่รองรับ MERGE (อัปเดต/เพิ่มแถวตามคีย์) และย้อนประวัติได้
- Spark = โปรแกรมประมวลผลข้อมูลขนาดใหญ่ที่ทำการตรวจคุณภาพจริง
- Quarantine = กักกัน (แยกข้อมูลที่ไม่ผ่านไว้ ไม่ลบทิ้ง)
- IQR (Interquartile Range) = ช่วงระหว่างควอร์ไทล์ที่ 1 (Q1) กับที่ 3 (Q3) ใช้หาค่าผิดปกติ (outlier)
- Tukey fence = รั้วค่าผิดปกติ: เหนือ Q3 + k×IQR หรือใต้ Q1 − k×IQR ถือว่าผิดปกติ

---

# ส่วนที่ 1 — หน้า Jobs & Pipelines (`/pipeline`)

| Frontend file | API endpoints | Backend handler | Storage |
|---|---|---|---|
| `services/ui/src/pages/Pipeline.jsx` (700 บรรทัด) | `GET /api/v1/whitebox/state`, `POST /api/v1/whitebox/state`, `GET /api/v1/whitebox/preview-zone/{zone}`, `GET /api/v1/whitebox/benchmark` (เรียกแต่ไม่ได้ใช้) | `services/api/app/api/whitebox.py:1437-1474` (state), `:1496-1526` (preview-zone), `:1271-1434` (คำนวณ Clean/Review/Quarantine) | ไฟล์ CSV + `workflow_state.json` ในโฟลเดอร์ `output_runs` ของ API (ผูกกับ `./data/evaluation/...` ในเครื่อง ตาม `docker-compose.yml:252`) |
| ตาราง "ประวัติการรัน" (ใน Pipeline.jsx:536-689) | `GET /api/v1/pipeline?limit=100`, `GET /api/v1/quality?limit=100` (รีเฟรชทุก 30 วินาที, Pipeline.jsx:39-40) | `api/app/api/pipeline.py:39-75`, `api/app/api/quality.py:12-58` | ES index `sdoqap_pipeline_runs`, `sdoqap_quality_runs` (เขียนโดย Spark: `spark/sdoqap/stages/report.py:52-80`) |
| ปุ่ม Retry | `POST /api/v1/pipeline/retry/{run_id}` | `pipeline.py:155-181` → `trigger_spark_job` `:230-242` → Spark Trigger Daemon `spark_trigger_daemon.py:276-295` | ES `sdoqap_runs` (ถ้าพบ ingest), แล้ว Spark อ่านไฟล์ดิบจาก HDFS |
| ปุ่ม "สร้าง Gold ใหม่" | `POST /api/v1/gold/rebuild` | `api/app/api/gold.py:150-166` → Daemon `/gold/rebuild` `spark_trigger_daemon.py:296-341` → `spark/spark_gold_layer.py` | ES `sdoqap_gold_daily_quality`, `_error_patterns`, `_financial_impact`, `_schema_drift` |
| `components/RunRecordsPanel.jsx` (146 บรรทัด) | `GET /api/v1/export/records/{active\|quarantine}/{table}` | `api/app/api/data_export.py:514-549` | อ่าน Delta บน HDFS `/data/active/<table>`, `/data/quarantine/<table>` |

## 1.0 ข้อสังเกตสำคัญที่ต้องรู้ก่อนนำเสนอ (ตรวจจากโค้ด)

หน้านี้มี **สองระบบที่คนละชุดข้อมูลอยู่ในหน้าเดียวกัน**:

1. **ส่วนบน (Funnel + 3 การ์ด + ตารางรายแถว)** ใช้ "เอนจินตรวจคุณภาพแบบโต้ตอบ" ใน `whitebox.py` ทำด้วย pandas (ไลบรารีตารางข้อมูลของ Python) อ่านไฟล์ CSV ชุดตัวอย่างนักศึกษา (`dirty_dataset.csv` 10,100 แถว ตรวจนับได้จริงใน `data/evaluation/student_course_score_evaluation_dataset/`) ไม่ได้ใช้ Spark และไม่ได้อ่านจาก HDFS
2. **ส่วนล่าง "ประวัติการรัน"** มาจากผลของ Spark จริงที่เก็บใน Elasticsearch/HDFS

ข้อความในหน้า (InfoHint, Pipeline.jsx:271) ยอมรับว่าเป็นคนละชุดกัน แต่เขียนว่า "ไม่ถาวร อยู่ในหน่วยความจำ" ซึ่งไม่ตรงกับโค้ด: สถานะถูกบันทึกลงดิสก์ที่ `workflow_state.json` (`whitebox.py:1217-1224`) และผลลัพธ์ 3 โซนถูกเขียนเป็น CSV ทุกครั้งที่คำนวณ (`whitebox.py:1391-1396`)

**ป้าย 🟢 ในส่วนบนของหน้านี้ หมายถึง "มาจาก Backend จริง" แต่เป็นผลของเอนจินโต้ตอบ ไม่ใช่ผลของ Spark**

## 1.1 ส่วนหัวหน้าจอ (PageHeader) และปุ่มบนขวา

- **[หัวข้อ "Jobs & Pipelines" + "ขั้นที่ 3/4" + คำอธิบายรอง]** → (1) ไม่มีการกด (2) ชื่อหน้า ขั้นตอนที่ และคำอธิบาย (3) อ่านจาก `config/pages.js:12` ผ่าน `components/ui/PageHeader.jsx` (4) แสดงข้อความเฉย ๆ — 🔴 ข้อความคงที่
- **[ปุ่ม "สร้าง Gold ใหม่"]** → (1) กดแล้วเด้งหน้าต่างยืนยัน (ConfirmationModal) "สร้าง Gold Layer ใหม่?" เมื่อยืนยันจึงเรียก API (Pipeline.jsx:248-259, 216-227) (2) สั่งให้ Spark สร้างตารางสรุปสำหรับ Dashboard (Gold = ตารางสรุปที่รวมแล้ว อ่านเร็ว) (3) `POST /api/v1/gold/rebuild` → `gold.py:150-166` เปิดเธรดเบื้องหลังเรียก Daemon `http://spark-master:8099/gold/rebuild` → รัน `python spark_gold_layer.py` (4) ผลเขียนลง ES 4 index ชื่อ `sdoqap_gold_*` (สร้างด้วยการรวมประวัติใน `sdoqap_quality_runs` / `sdoqap_schema_drifts` ตามวัน) — ปุ่มคือ ⚪/🟢: ทำงานจริง แต่หน้าจอแจ้ง "สำเร็จ" ทันทีที่ API ตอบ ถ้า Daemon ล่ม โค้ดแค่ `print` error (gold.py:161-163) ผู้ใช้จะไม่เห็นความล้มเหลว และข้อความยืนยันบอกว่า "รวมข้อมูล Clean ล่าสุด" ซึ่งไม่ตรง เพราะสคริปต์รวม **ประวัติผลการรัน** ไม่ได้รวมแถวข้อมูล Clean (spark_gold_layer.py:184-250) — ป้าย 🟢 (ทำงานจริง) แต่คำอธิบายใน modal เป็น 🔴 ที่ไม่ตรงกับพฤติกรรมจริง
  - หมายเหตุ: ผลลัพธ์ `goldResult` ถูกเก็บใน state แต่ **ไม่มี JSX ที่แสดงข้อความนี้** (ค้นหา `goldResult` พบเฉพาะที่ตั้งค่า, Pipeline.jsx:67,218-223) จึงไม่เห็นข้อความสำเร็จ/ล้มเหลวบนหน้าจอ
- **[ปุ่ม "รัน Pipeline"]** → (1) กดแล้วขึ้น "กำลังรัน..." แล้วเรียก `POST /api/v1/whitebox/state` ด้วยตัวเปล่า `{}` จากนั้นรีเฟรชตาราง (Pipeline.jsx:134-139, 260-262) (2) ชื่อชวนเข้าใจว่าสั่ง Spark รัน แต่จริง ๆ ไม่ได้สั่ง Spark (3) `update_workflow_state` (`whitebox.py:1442-1474`) ไม่ได้รับค่าอะไรมาเปลี่ยน แค่เรียก `_recompute_interactive_state()` คำนวณ 3 โซนใหม่ด้วย pandas จากกฎที่ตั้งไว้ในหน้า Rules (4) ผล: ตัวเลข/ตารางด้านล่างรีเฟรช — ป้าย 🟡 (คำนวณใหม่จากข้อมูลจริง) และถ้าจะพูดตรงไปตรงมาคือ "ปุ่มคำนวณใหม่ ไม่ใช่ปุ่มสั่ง Spark" (การสั่ง Spark จริงมีเฉพาะปุ่ม Retry และหน้า Ingestion)

## 1.2 แถบชุดข้อมูล และ Funnel (กรวยการคัดกรอง)

- **[บรรทัด "ชุดข้อมูล <ชื่อ> · N แถว" + ไอคอน ⓘ]** → (1) กดไอคอนดูคำอธิบาย (2) ชื่อชุดข้อมูลและจำนวนแถวทั้งหมดของเอนจินโต้ตอบ (3) ชื่อ = `wbState.dataset_name`, แถว = `metrics.total_rows` จาก `GET /whitebox/state` (Pipeline.jsx:166-182, 269-272) (4) 🟢 — ข้อควรระวัง: `dataset_name` เปลี่ยนได้จากฟังก์ชัน `ingest-source` ที่ในโค้ดระบุเองว่า "simulated" ไม่ได้เชื่อมต่อจริง (`whitebox.py:1607-1615`) ในไฟล์สถานะจริงของเครื่องนี้ชื่อเป็น `ijzp_q8t2_500k` แต่ข้อมูลที่ถูกตรวจยังเป็น `dirty_dataset.csv` (`dataset_source: "evaluation"`) จึงชื่ออาจไม่ตรงกับข้อมูลที่ตรวจจริง
- **[ข้อความ "ยังไม่มีผลการรันสำหรับชุดข้อมูลนี้"]** → (1) – (2) แสดงเมื่อ API ไม่ส่ง `metrics` กลับมา (ไม่มีไฟล์ชุดข้อมูล `whitebox.py:1277-1279`) (3) Pipeline.jsx:273 (4) 🟢 (เงื่อนไขจากข้อมูลจริง)
- **[Funnel 5 ปุ่ม: นำเข้า / Gate 1 กักกัน / Gate 2 กักกัน / Review / Clean]** → (1) กดแล้วตารางรายแถวด้านล่างกรองตามโซน (ALL / QUARANTINE / REVIEW / CLEAN) (2) แสดงจำนวนแถวที่ผ่านแต่ละด่านของเอนจินโต้ตอบ (Gate = ด่านตรวจ) (3) ค่า: นำเข้า=`total_rows`, Gate 1=`gate1_quarantined`, Gate 2=`gate2_quarantined`, Review=`review_rows`, Clean=`clean_rows` (Pipeline.jsx:276-294; คำนวณที่ `whitebox.py:1398-1410`) (4) 🟡 สูตร: Gate1 = (จำนวน score ว่างที่ถูกกักกัน) + (จำนวน score นอกช่วง); Gate2 = จำนวนแถวซ้ำ (เป็น 0 ถ้าตั้งกลยุทธ์ซ้ำเป็น review_all) — ข้อจำกัด: "Gate 1" และ "Gate 2" กดแล้วไปโซน QUARANTINE เหมือนกัน แยกดูทีละด่านไม่ได้ ถ้าไม่มีข้อมูลจะแสดง "—" (Pipeline.jsx:163)

## 1.3 การ์ด 3 ใบ (Clean / Review / Quarantine)

การ์ดเป็นคอมโพเนนต์ `components/ui/TileCard.jsx` วงกลมเปอร์เซ็นต์มุมขวาล่างคำนวณจาก `percent`

- **[การ์ด Clean "N แถว"]** → (1) กดการ์ด = สลับกรองตารางเป็นโซน CLEAN / ทั้งหมด (2) จำนวนแถวที่ผ่านทุกกฎ (3) `metrics.clean_rows` (Pipeline.jsx:299-317) (4) 🟢 ตัวเลข; วงกลม % = 🟡 `round(clean / total_rows × 100)` (Pipeline.jsx:164)
  - ข้อความรอง "score a–b · ไม่มีค่าว่าง" → ช่วง score ดึงจาก `min_score`/`max_score` (🟢) แต่คำว่า "ไม่มีค่าว่าง" เป็นข้อความตายตัว (🔴) และจะไม่จริงเมื่อเลือกนโยบาย null แบบ adaptive (ค่าว่างจะไปอยู่ Review ไม่ใช่ Clean)
  - ปุ่ม "ดูในตาราง / แสดงทั้งหมด" → สลับตัวกรองโซน (🟡 ทำงานบนหน้าจอเท่านั้น ไม่เรียก API เพิ่ม ยกเว้นตารางโหลดข้อมูลใหม่ตามโซน)
- **[การ์ด Review "N แถว"]** → (1) กดสลับโซน REVIEW (2) แถวที่ระบบ "ไม่แน่ใจ" ให้คนตัดสิน (3) `metrics.review_rows` (Pipeline.jsx:320-367) (4) 🟢; วงกลม % = 🟡 `max(1, round(review/total×100))` (มีค่าต่ำสุด 1% ตายตัว, Pipeline.jsx:324)
  - ข้อความรอง "study_hours สูงผิดปกติ" → 🔴 ตายตัว (Review จริงอาจมีแถวซ้ำหรือ score ว่างด้วย ถ้าตั้งนโยบายเป็น review_all / adaptive)
  - **ปุ่ม "อนุมัติ"** → (1) เด้งยืนยัน แล้วส่ง `review_action = "APPROVE"` (Pipeline.jsx:331-342, 141-145) (2) ย้ายแถว Review **ทั้งหมด** ไปเป็น Clean (3) `POST /whitebox/state {review_action}` → `whitebox.py:1361-1368` เปลี่ยนสถานะ Review→Valid (4) ผลถูกเก็บใน `workflow_state.json` และตัวเลขทุกการ์ดเปลี่ยน — 🟢 (ปุ่มถูกปิดเมื่อ `initial_outlier_count` เป็น 0 ซึ่งนับเฉพาะ outlier ไม่รวมแถว Review ชนิดอื่น)
  - **ปุ่ม "กักกัน"** → เหมือนกันแต่ส่ง `"REJECT"` ย้าย Review ทั้งหมดไป Quarantine (Pipeline.jsx:343-354; `whitebox.py:1366-1368`) — 🟢
  - **ปุ่ม "คืนค่า"** → ปรากฏเมื่อ action ไม่ใช่ KEEP ส่ง `"KEEP"` คืนสถานะ Review (Pipeline.jsx:355-363) — 🟢 หมายเหตุ: คืนค่าเฉพาะ "การตัดสินทั้งก้อน" ไม่ล้างการตัดสินรายแถวที่เคยกด (ตรวจไม่พบโค้ดล้าง `row_decisions` ในหน้านี้)
  - **ไอคอน ⓘ** → อธิบายสูตร Q3 + k×IQR; ค่า k ดึงจาก `wbState.tukey_multiplier` หรือ "3.0" เป็นค่าสำรอง (Pipeline.jsx:364) — 🟡/🔴 ข้อความอธิบายพูดถึงเฉพาะรั้วบน แต่โค้ดตรวจทั้งรั้วบนและรั้วล่าง (`whitebox.py:1337`)
- **[การ์ด Quarantine "N แถว"]** → (1) กดสลับโซน QUARANTINE (2) แถวที่ไม่ผ่านกฎ ถูกแยกไว้ (3) `metrics.quarantine_rows` (Pipeline.jsx:370-397) (4) 🟢; วงกลม % = 🟡 `round(quarantine/total×100)`
  - ข้อความรอง "ค่าว่าง a · นอกช่วง b · ซ้ำ c" → 🟢 จาก `missing_score_count`, `invalid_range_count`, `gate2_quarantined`
  - **ปุ่ม "แจ้งแก้ต้นทาง"** → (1) กดแล้วสลับเป็น "แจ้งแล้ว #UP-89" ส่ง `upstream_ticket_sent` (Pipeline.jsx:388-394, 147-151) (2) ดูเหมือนส่งใบงานไปแก้ที่ต้นทาง (3) `POST /whitebox/state {upstream_ticket_sent}` แค่เก็บค่า true/false ใน `workflow_state.json` (`whitebox.py:1210-1211`) (4) **ไม่มีการสร้างใบงานจริง** (ค้นหาโค้ดพบเพียงตัวแปรสถานะ; endpoint ใบงานจริงอยู่ใน `system.py:450-481` แต่ไม่ได้ถูกเรียกจากหน้านี้) และข้อความ "#UP-89" ถูกเขียนตายตัวในหน้า (ในสถานะเป็น `#UP-2026-089`) — ป้าย ⚪

## 1.4 ตาราง "ตรวจสอบรายแถว"

- **[ช่องค้นหา "ค้นหา Row ID, รหัสนักศึกษา, วิชา"]** → (1) พิมพ์แล้วรอ 300 ms (debounce = หน่วงเวลาก่อนยิง API) จึงโหลดใหม่ (Pipeline.jsx:185-198) (2) ค้นข้อความในทุกคอลัมน์ของโซนที่เลือก (3) `GET /whitebox/preview-zone/{zone}?limit=15&search=…` → `whitebox.py:1496-1526` (กรองแบบ `contains` ไม่สนตัวพิมพ์ ทุกคอลัมน์) (4) 🟢 — แสดงสูงสุด 15 แถว (ตายตัว `limit: "15"`, Pipeline.jsx:189)
- **[แท็บ ทั้งหมด / Quarantine / Review / Clean (ตัวเลขในวงเล็บ)]** → (1) เปลี่ยนโซน (2) ตัวเลขคือจำนวนแถวต่อโซน (3) ใช้ state `selectedZone` เดียวกับการ์ดและ Funnel (Pipeline.jsx:422-447) (4) ตัวเลข 🟢 จาก `metrics`; ตัวเลือก "ทั้งหมด" อ่านไฟล์ดิบ `dirty_dataset.csv` จึงไม่มีคอลัมน์สถานะ/ปุ่มจัดการ (`whitebox.py:1500-1501`)
- **[ตารางข้อมูล]** → (1) – (2) คอลัมน์: Row ID, รหัสนักศึกษา, วิชา, คะแนน, ชม.เรียน, โซนปัจจุบัน, ประเภทปัญหา, เหตุผล (Pipeline.jsx:27-36) (3) แถวมาจากไฟล์ `clean_dataset_run.csv` / `review_queue_run.csv` / `quarantine_lake_run.csv` ที่ API เขียนไว้ (`whitebox.py:1391-1396, 1502-1507`) (4) 🟢 — ค่าว่างแสดง "—"; ถ้าไฟล์ไม่มีคอลัมน์ในรายการ จะ fallback แสดง 6 คอลัมน์แรก (Pipeline.jsx:451-452) ข้อความ "กำลังโหลด…" / "ไม่พบเรคคอร์ด…" เป็น 🔴 ข้อความตายตัว
- **[ปุ่มรายแถว "อนุมัติ" / "กักกัน"]** → (1) กดแล้วส่งการตัดสินของแถวนั้น (Pipeline.jsx:494-509, 101-111) (2) ตัดสินให้แถวนั้นเป็น Clean หรือ Quarantine ไม่ว่าเดิมอยู่โซนไหน (3) `POST /whitebox/state {row_decisions:{id: "APPROVE"|"REJECT"}}` → `whitebox.py:1370-1384` ทับสถานะรายแถว (หลังจากใช้ review_action แล้ว) (4) เก็บถาวรใน `workflow_state.json` แล้วโหลดตารางใหม่ — 🟢
- **[บรรทัดท้ายตาราง "แสดง X จาก Y แถว"]** → X = จำนวนแถวที่ได้ (≤15), Y = `matched_rows` หรือ `total_zone_rows` (Pipeline.jsx:523-527) — 🟢
- **[ลิงก์ "ถัดไป: Workspace Exports →"]** → พาไป `/export` (`components/ui/NextStepLink.jsx`, `config/pages.js:13`) — 🔴 ลิงก์นำทางตายตัว

## 1.5 ส่วน "ประวัติการรัน" (กางออกได้ ใช้ผลของ Spark จริง)

- **[หัวข้อพับ "ประวัติการรัน"]** → กดเพื่อกาง/พับ (`<details>`, Pipeline.jsx:536-539) — 🔴 ส่วนควบคุม UI
- **[ช่องค้นหา "ค้นหาชื่อตารางหรือรหัสรอบ"]** → (1) พิมพ์แล้วกรองทั้งสองตาราง ณ ฝั่งหน้าเว็บ (2) ค้นใน `table_name + run_id` (3) ฟังก์ชัน `matchesHistoryFilter` (Pipeline.jsx:12-14, 542-549) — ไม่เรียก API เพิ่ม (4) 🟡 กรองจากข้อมูลที่ดึงมาแล้ว (สูงสุด 100 รายการ)
- **[ตัวเลือก "ทุกตาราง"]** → รายชื่อตารางสร้างจากชื่อตารางที่เจอในข้อมูลทั้งสองชุด (Pipeline.jsx:50, 550-558) — 🟡
- **[ข้อความ "กด 'ดูข้อมูล' เพื่อเปิดแถวข้อมูลของรอบนั้น"]** → 🔴 ข้อความตายตัว
- **[ตาราง Recent Pipeline Ingestion Runs]** → (1) – (2) ประวัติการรัน: Run ID, ตาราง, สถานะ, ระยะเวลา (วินาที), เวลา, ปุ่ม (3) `GET /pipeline?limit=100` → `pipeline.py:39-75` ค้น ES `sdoqap_pipeline_runs` เรียงเวลาล่าสุดก่อน (4) 🟢 แสดงหน้าละ 10 แถว (`HISTORY_PAGE_SIZE`, Pipeline.jsx:10)
  - ข้อควรระวัง: Spark เขียนเอกสารใน index นี้ด้วยฟิลด์ `run_id, ingest_id, table_name, state, timestamp` เท่านั้น (`report.py:70-77`) **ไม่มีฟิลด์ `duration_seconds`** (ตัวเลขเวลารันอยู่ใน `sdoqap_quality_runs`) คอลัมน์ "Duration (s)" ของตารางนี้จึงน่าจะแสดง "-" (ตรวจจากโค้ดฝั่งเขียน)
  - ป้ายสถานะ (`getStatusBadge`, Pipeline.jsx:229-233): `success`→SUCCESS สีเขียว, `failed`→FAILED สีแดง, **ค่าอื่นทั้งหมด→"QUARANTINED" สีส้ม** Spark เขียนสถานะ `success` เมื่อคะแนน ≥ เกณฑ์ และ `warnings` เมื่อคะแนน < เกณฑ์ (`report.py:75`) และ `failed` เมื่อล้มเหลว ดังนั้นสถานะ `warnings` จะถูกแสดงเป็น "QUARANTINED" ทั้งที่ไม่มีโค้ดส่วนใดเขียนสถานะ `quarantined` ลง index นี้ (ค้นแล้วพบเฉพาะตัวอ่านใน `system.py:229`) — ป้ายนี้ 🟡 (แปลงสถานะจริงเป็นป้ายอีกชื่อ)
  - **ปุ่ม "ดูข้อมูล"** → (1) เปิดแผงข้อมูลของตารางนั้น เลื่อนหน้าไปที่แผง (Pipeline.jsx:57-60, 593-597) (2) ชั้นเริ่มต้น = "แถวที่ถูกกักกัน" ถ้า `state === 'quarantined'` มิฉะนั้น "แถวที่ผ่าน" (3) ดูหัวข้อ RunRecordsPanel ด้านล่าง (4) เนื่องจากไม่มีสถานะ `quarantined` จริง ปุ่มนี้ในตารางนี้จะเริ่มที่ "แถวที่ผ่าน" เสมอ — 🟢
  - **ปุ่ม "Retry"** (โผล่เฉพาะ `failed`/`quarantined`) → (1) กดแล้วเรียก API ทันที (ไม่มีหน้าต่างยืนยัน) ปุ่มเปลี่ยนเป็น "Retrying..." (Pipeline.jsx:200-214, 598-606) (2) สั่งตรวจตารางนั้นใหม่ด้วย Spark (3) `POST /pipeline/retry/{run_id}` → `pipeline.py:155-181`: ถ้า `run_id` ตรงกับ ingest ใน `sdoqap_runs` ก็คิวงานใหม่ด้วยโฟลเดอร์ดิบเดิม; แต่ `run_id` ในตารางนี้คือรหัส `run_YYYY…` ของ Spark ไม่ใช่ ingest id จึงเข้าทางสำรอง: หาชื่อตารางจาก ES แล้วเรียก `trigger_spark_job(table, None)` (`:180`) ซึ่งส่ง `POST http://spark-master:8099/retry` พร้อมความลับ `X-Trigger-Secret` (`:36, 237`) Daemon เข้าคิวต่อตาราง (`trigger_core.py:53-82`) แล้วรัน `spark-submit spark_quality_engine.py <table>` (4) หน้าจอตอบ "Retry triggered successfully (New Run ID: N/A)" เพราะ API ไม่ส่ง `new_run_id` กลับ (`pipeline.py:181`) ดังนั้นคำว่า N/A จะขึ้นเสมอ — และเมื่อไม่มี ingest id Spark จะอ่าน `/data/raw/<table>` ทั้งโฟลเดอร์ ซึ่งหลังรันสำเร็จจะถูกย้ายไป `/data/archive/` แล้ว (`spark_quality_engine.py:1790-1805`) จึงอาจไม่มีไฟล์ให้อ่าน (อนุมานจากโค้ด ไม่ได้ทดลองรัน) — ป้าย 🟢 (ส่งคำสั่งจริง) ข้อความผลลัพธ์บางส่วน 🔴
  - ข้อความ "Fetching…", "Failed to load…", "ไม่พบรอบที่ตรงกับการค้นหา" → 🔴 ข้อความตายตัว (หากโหลดล้มเหลวจะขึ้นข้อความ error ไม่ได้แสดงเลขปลอม)
- **[ตาราง Quality Audit Logs]** → (1) – (2) ผลคุณภาพต่อรอบ: ตาราง, จำนวนทั้งหมด, Clean, Quarantined, Quality Score (แถบสี), เวลา (3) `GET /quality?limit=100` → `quality.py:12-58` ค้น ES `sdoqap_quality_runs`; ฟิลด์ที่ไม่มีจะเป็น `null` ไม่ใช่ 0 (`quality.py:44-48`) แล้วหน้าแสดง "-" / "N/A" (Pipeline.jsx:644-662) (4) 🟢; สีคะแนนเป็น 🔴 เกณฑ์ตายตัวในหน้า: ≥95 เขียว, ≥85 เหลือง, ต่ำกว่านั้นแดง (`getScoreColor`, Pipeline.jsx:235-239) ซึ่งไม่ใช่เกณฑ์ของระบบ (เกณฑ์จริงต่อตารางอยู่ใน rules_config คือ base 90, adaptive)
  - **ปุ่ม "ดูข้อมูล"** → เปิด RunRecordsPanel เริ่มที่ชั้น "กักกัน" ถ้า `quarantined_records > 0` มิฉะนั้น "แถวที่ผ่าน" (Pipeline.jsx:665-669) — 🟢
- **[ตัวแบ่งหน้า "N รอบ · หน้า a/b" + ปุ่ม ก่อนหน้า/ถัดไป]** → แบ่งหน้าฝั่งหน้าเว็บ หน้าละ 10 (Pipeline.jsx:16-25, 54-55) — 🟡 `ceil(จำนวนที่กรองแล้ว / 10)`
- **[แผง RunRecordsPanel "ข้อมูลของตาราง …"]** (`components/RunRecordsPanel.jsx`)
  - **ปุ่ม "ปิด"** → ปิดแผง (บรรทัด 66) — 🔴 ควบคุม UI
  - **ปุ่มสลับ "แถวที่ผ่าน" / "แถวที่ถูกกักกัน"** → เลือกชั้นข้อมูล (บรรทัด 6-9, 70-82) แล้วเรียก `GET /api/v1/export/records/{layer}/{table}?limit=50&offset=…` (บรรทัด 40) ฝั่ง API `search_dataset_records` (`data_export.py:514-549`) อ่าน Delta จาก `/data/active/<table>` หรือ `/data/quarantine/<table>` ด้วยการอ่านไฟล์ Parquet ผ่าน WebHDFS เข้าหน่วยความจำ pandas ทั้งตาราง แคชไว้ 60 วินาที สูงสุด 4 ตาราง (`:492-511`) — 🟢 (ต้องล็อกอิน `require_session`)
    - "แถวที่ผ่าน" = ข้อมูลล่าสุดของตารางหลัง MERGE (รวมทุกรอบตามคีย์หลัก) ไม่ใช่เฉพาะรอบเดียว (ข้อความ hint บรรทัด 7)
  - **ช่องติ๊ก "เฉพาะแถวจากรอบนี้"** → กรองด้วย `run_id` (บรรทัด 85-93) ใช้ได้เมื่อตารางเก็บคอลัมน์ `run_id` (`run_ids` ไม่ว่าง) ไม่เช่นนั้นปิดการใช้งานและแสดงเตือนสีเหลือง "ตารางนี้ไม่ได้เก็บรหัสรอบไว้…" (บรรทัด 105-109) — 🟡 (กรอง `run_id == ...` ที่ `data_export.py:530-532`)
  - **ช่อง "ค้นหาค่าในทุกคอลัมน์"** → ค้นข้อความ (ไม่แยกตัวพิมพ์) ในทุกคอลัมน์ ผ่านสตริงรวมต่อแถว (`data_export.py:503-509, 533-536`) — 🟢
  - **ข้อความ "พบ X แถว จากทั้งหมด Y แถว"** → X=`matched_rows`, Y=`total_rows` (บรรทัด 111-114) — 🟢
  - **ตารางข้อมูล + คอลัมน์ `reject_reason` สีแดง** → แสดง 50 แถวต่อหน้า (`PAGE_SIZE`, บรรทัด 4) ค่า object แปลงเป็น JSON (บรรทัด 11-15) — 🟢
  - **ปุ่ม ก่อนหน้า/ถัดไป และ "แถว a–b"** → เลื่อน `offset` ทีละ 50 (บรรทัด 137-143) — 🟡
  - ถ้าตารางยังไม่มีข้อมูลบน HDFS API คืนคอลัมน์ว่างจาก `schema_registry.json` (`data_export.py:523-526`) และหน้าแสดง "ไม่พบข้อมูล"

## 1.6 ชิ้นส่วนที่อยู่ในโจทย์แต่ **ไม่ได้ใช้ในหน้านี้**

- `components/RunStatusLine.jsx` + `hooks/useRunStatus.js` → ไม่ได้ถูก import ในหน้า Pipeline (ถูกใช้ใน `pages/Ingestion.jsx:7,906`) ทำหน้าที่ถามสถานะรอบ (`GET /api/v1/pipeline/runs/{ingestId}` ทุก 5 วินาที จนถึงสถานะสุดท้าย) แล้วแสดงข้อความไทย เช่น "รอคิวตรวจ", "กำลังตรวจคุณภาพ" (ป้าย 🟢 ในหน้าที่ใช้ — `pipeline.py:306-312`, `run_registry.py`) — ไม่ใช่ส่วนหนึ่งของ `/pipeline`
- `components/EchartsDataLineage.jsx` → ใช้ใน `pages/Dashboard.jsx:21,1431` เท่านั้น ไม่ใช่หน้า Pipeline
- `api/app/api/lineage.py` → หน้า Pipeline ไม่เรียก; `trust-check` (`lineage.py:340-447`) ถูกเรียกจากหน้า Export (ดูส่วนที่ 2)
- ใน `Pipeline.jsx` มีตัวแปร/การเรียกที่ **ไม่ได้ใช้แสดงผล**: `benchmarkData` (เรียก `GET /whitebox/benchmark` แล้วเก็บไว้แต่ไม่มี JSX ใช้, บรรทัด 70, 167-170) และ `showTraceability` (บรรทัด 72) — ป้าย ⚪

## 1.7 Clean / Review / Quarantine ได้ป้ายมาอย่างไร (ตามโค้ดจริง)

### ก) ในเอนจินโต้ตอบ (ที่หน้า Pipeline ส่วนบนแสดง) — `whitebox.py:1271-1434`

ค่าเริ่มต้นตามตัวแปร `_WORKFLOW_STATE` (`whitebox.py:1191-1212`) ผู้ใช้เปลี่ยนค่าได้ที่หน้า Rules แต่ละแถวเริ่มเป็น "Valid" (= Clean) แล้วถูกเปลี่ยนตามกฎ:

| ลำดับ | กฎ | เงื่อนไข (สูตรจากโค้ด) | ผลลัพธ์ |
|---|---|---|---|
| 1 | แถวซ้ำ (Duplicate) | `df.duplicated(subset=composite_key, keep="first")` คีย์เริ่มต้น `student_id + course + semester` (`:1316`) | แถวแรกยังอยู่ แถวที่ซ้ำ → **Quarantine** (ค่าเริ่มต้น `keep_first_quarantine`) หรือ **Review** ถ้าตั้ง `review_all` (`:1343-1346`) |
| 2 | score ว่าง | เฉพาะแถวที่ไม่ซ้ำ: นโยบาย `strict_0` หรือ (% ว่างที่สังเกตได้ > `max_null_pct` เริ่มต้น 5.0) → กักกัน มิฉะนั้นเป็น Review (`:1320-1321, 1348-1351`) | **Quarantine** หรือ **Review** |
| 3 | score นอกช่วง | `score < min_score (0)` หรือ `score > max_score (100)` (`:1322, 1353`) | **Quarantine** |
| 4 | ชั่วโมงเรียนผิดปกติ | เฉพาะแถวที่ผ่านข้อ 1-3: `study_hours > Q3 + k×IQR` หรือ `< Q1 − k×IQR` k เริ่มต้น 3.0 (เลือกได้ 1.5 หรือกำหนดรั้วเอง `custom_upper_fence`) (`:1325-1337`) | **Review** |
| 5 | แถวที่เหลือ | ไม่ติดข้อใดเลย | **Clean** |
| 6 | การตัดสินของคน | `review_action` = APPROVE → Review กลายเป็น Clean; REJECT → Review กลายเป็น Quarantine (`:1361-1368`); การตัดสินรายแถวทับอีกชั้น (`:1370-1384`) | เปลี่ยนโซน |

- แต่ละกฎปิดได้ผ่านตัวเลือก `selected_findings` / `rule1_confirmed` ... `rule3_confirmed` (`:1310-1313`)
- คะแนนคุณภาพของเอนจินนี้ 🟡 = `clean_rows / total_rows × 100` ปัดทศนิยม 1 ตำแหน่ง (`:1410`) หมายความว่าแถว Review **ไม่นับ** เป็นผ่าน
- ที่เก็บ: ไฟล์ CSV `clean_dataset_run.csv`, `review_queue_run.csv`, `quarantine_lake_run.csv` ในโฟลเดอร์ `output_runs` ของ API (`whitebox.py:1391-1396`) ไม่ใช่ HDFS และไม่ใช่ ES; ค่าตั้งค่า/การตัดสินเก็บใน `workflow_state.json` (`:1214-1224`)
- ตัวอย่างจริงในเครื่องนี้ (ไฟล์ที่มีอยู่): Clean 9,400 / Review 100 / Quarantine 600 จากทั้งหมด 10,100 แถว (นับบรรทัดไฟล์ CSV ใน `output_runs`)

### ข) ใน Spark จริง (ผลที่ลงตาราง HDFS และประวัติการรัน) — **มีเพียง 2 ผลลัพธ์: Clean กับ Quarantine ไม่มีโซน Review**

(ค้นคำว่า review ใน `services/spark` ไม่พบการจัดโซนข้อมูลแบบ Review; พบเฉพาะสถานะ "PENDING_REVIEW" ของข้อเสนอกฎ)

- แถวที่ผ่านทุกด่านใน `ctx.clean_df` → **Clean** เขียนลง Delta `HDFS /data/active/<ตาราง>` ด้วย MERGE ตามคีย์หลัก (แถวคีย์เดียวกันอัปเดต แถวใหม่เพิ่ม) พร้อมคอลัมน์ `run_id` (`spark_quality_engine.py:1713-1736`; ถ้า MERGE พัง รอบจะล้มเหลวและไม่แตะตาราง active `:1737-1753`)
- แถวที่ไม่ผ่านข้อใดข้อหนึ่ง → **Quarantine** เขียนลง Delta `HDFS /data/quarantine/<ตาราง>` (แบ่งพาร์ทิชันตาม `run_id`) พร้อมคอลัมน์ `reject_reason`, `rejected_at`, `ingest_id` (`:1702-1711`, `assembly.py:35-37`)
- สรุปจำนวนและคะแนนเก็บเป็นเอกสารใน ES `sdoqap_quality_runs` (`report.py:9-49`)

เหตุผลที่แถวถูกกักกันใน Spark (ตัวหนังสือในคอลัมน์ `reject_reason`):

| เหตุผล | เงื่อนไข | ที่มาในโค้ด |
|---|---|---|
| `missing_primary_key` | คีย์หลักเป็นค่าว่าง | `cleansing.py:51-60` |
| `null_value_in_<คอลัมน์>` | คอลัมน์ใดใน schema (ไม่ใช่คีย์) เป็นค่าว่าง | `cleansing.py:62-76` |
| `invalid_type_<คอลัมน์>` | คอลัมน์ตัวเลข มีค่าแต่แปลงเป็นตัวเลขไม่ได้ | `cleansing.py:78-98` |
| `missing_date` | คอลัมน์วันที่ว่าง | `cleansing.py:100-109` |
| `duplicate_records` | คีย์ซ้ำในแถวที่ผ่าน เก็บแถวล่าสุดตามวันที่ ที่เหลือกักกัน | `cleansing.py:118-138` |
| `out_of_range_<คอลัมน์>` | ค่าต่ำกว่า min หรือสูงกว่า max ที่ตั้งใน `range_checks` (รวมขอบ; ค่า null ไม่ตรวจ) เช่นตาราง `student_course_scores`: score 0–100 | `rules.py:15-33`, `rules_config.json` |
| ค่า outlier ตาม IQR | เมื่อ `value_range.mode` เป็น `auto`/`adaptive` (ค่าเริ่มต้นของระบบคือ `auto`, k=1.5 หรือ k ที่ตั้ง): เกินรั้ว Q1−k·IQR ถึง Q3+k·IQR ของทุกคอลัมน์ตัวเลข; ข้อความเหตุผล "คอลัมน์=ค่า (expected [ต่ำ, สูง])" | `anomaly.py:6-44`, `dynamic_rules_engine.py:185-242, 479-570`, `rules_config.json` (`_default.value_range`) |
| Z-score | ค่าห่างจากค่าเฉลี่ยเกิน 3 เท่าของส่วนเบี่ยงเบนมาตรฐาน (σ) ทุกคอลัมน์ตัวเลข **ทำเสมอ ค่า 3.0 ตายตัวในโค้ด ปิดไม่ได้จากคอนฟิก** | `anomaly.py:47-75`, `dynamic_rules_engine.py:574-657` |
| `induced_tree_rule_match` | ตรงกับกฎที่ AI เรียนรู้ด้วย Decision Tree (ต้องมีกฎ `induced` อนุมัติไว้ในคอนฟิก) | `anomaly.py:78-118` |

ข้อสังเกตจากโค้ด (สำคัญเมื่อถูกถามเรื่องจำนวน):
- ขั้น `auto_clean` (เปิดเป็นค่าเริ่มต้น `rules_config.json` `_default.auto_clean: true`) **ลบแถวที่คีย์หลักซ้ำออกไปเงียบ ๆ ก่อนตรวจ** (`cleansing.py:29-38`) แถวเหล่านั้นไม่ถูกนับเป็น Clean หรือ Quarantine (บันทึกเพียงข้อความ `resolved_N_duplicates` ใน `remediation_logs`) เพราะ `total_records = clean + quarantine` (`assembly.py:45`) ตัวเลข "ทั้งหมด" ของ Spark จึงอาจน้อยกว่าจำนวนแถวไฟล์ดิบ
- ค่าว่างใน **คอลัมน์ใดก็ตามของ schema** ทำให้ถูกกักกันทั้งแถว (strict) ส่วนความทนค่าว่างแบบ adaptive (`null_checks`) ในคอนฟิก ตามความเห็นในโค้ดยังไม่มีส่วนที่นำไปใช้ตัดสินแถว (`spark_quality_engine.py:1588-1594`)

### ค) คะแนนคุณภาพและสถานะรอบของ Spark

- 🟡 `quality_score = clean_count / (clean_count + quarantine_count) × 100` (`metrics.py:167-174`) ถ้าไม่มีแถวเลข = 0.0
- เกณฑ์ผ่าน (`quality_threshold`): ค่าตั้งต้น 90.0 จากคอนฟิก แต่ถ้าโหมด `adaptive` และมีประวัติ ≥ 2 รอบ จะใช้ `max(ค่าเฉลี่ย − ส่วนเบี่ยงเบนมาตรฐาน ของ 15 รอบล่าสุด, 70)` (`dynamic_rules_engine.py:249-335`, ใช้จริงที่ `spark_quality_engine.py:1595-1604`)
- สถานะรอบใน `sdoqap_pipeline_runs`: `success` ถ้า score ≥ เกณฑ์ มิฉะนั้น `warnings` (`report.py:75`); `failed` เมื่ออ่านไฟล์พัง/MERGE พัง (`spark_quality_engine.py:1679-1690, 1737-1753`)
- ถ้า score ≥ เกณฑ์ ระบบสั่งสร้าง Gold ใหม่อัตโนมัติ (`spark_quality_engine.py:1777-1788`); ถ้าต่ำกว่าเกณฑ์ส่งแจ้งเตือนผ่าน n8n (`metrics.py:177-182`)

### ง) ตารางสรุปที่เก็บข้อมูล

| ข้อมูล | เอนจินโต้ตอบ (ส่วนบนของหน้า) | Spark (ประวัติการรัน/Export) |
|---|---|---|
| ไฟล์ดิบ (Raw) | – | HDFS `/data/raw/<ตาราง>/<ingest_id>/<ตาราง>.csv` แล้วย้ายไป `/data/archive/<ตาราง>/<ingest_id>/` เมื่อรันสำเร็จ (`pipeline.py:194-197`, `run_support.py:21-23`, `spark_quality_engine.py:1790-1797`) |
| Clean | `output_runs/clean_dataset_run.csv` | HDFS Delta `/data/active/<ตาราง>` |
| Review | `output_runs/review_queue_run.csv` | ไม่มี |
| Quarantine | `output_runs/quarantine_lake_run.csv` | HDFS Delta `/data/quarantine/<ตาราง>` |
| ผลสรุป/ประวัติ | `workflow_state.json` | ES `sdoqap_quality_runs`, `sdoqap_pipeline_runs`, `sdoqap_lineage_runs`, `sdoqap_runs`, `sdoqap_run_locks`, `sdoqap_schema_drifts`, `sdoqap_schema_proposals` |
| Gold (ตารางสรุป) | – | ES `sdoqap_gold_daily_quality`, `_error_patterns`, `_financial_impact`, `_schema_drift` |

## 1.8 ลำดับขั้นตอนที่ Spark ทำ (stage-by-stage)

เริ่มจากการนำเข้าไฟล์ (หน้า Ingestion หรือปุ่ม Retry) แล้ว Spark ทำตามลำดับ (`sdoqap/pipeline/plan.py`, `spark_quality_engine.py:1551-1811`)

0. **ก่อนรัน (ฝั่ง API/Daemon):** API คำนวณ SHA-256 ของไฟล์เพื่อกันไฟล์ซ้ำ ตรวจว่ามีคอลัมน์คีย์หลักครบ เขียนไฟล์ลง HDFS (WebHDFS) บันทึกรอบใน ES `sdoqap_runs` เป็น `QUEUED` แล้วสั่ง Daemon (`pipeline.py:271-303`) Daemon เข้าคิวต่อตาราง (หนึ่งตารางรันได้ทีละงาน `trigger_core.py:53-82`) เปลี่ยนสถานะเป็น `RUNNING` แล้วรัน `spark-submit` (`spark_trigger_daemon.py:182-207`) เมื่อจบ ตั้ง `SUCCEEDED`/`FAILED`/`SKIPPED` ตามรหัสออก (`trigger_core.py:45-50`)
1. **ล็อกตาราง** ใน ES `sdoqap_run_locks` (หมดอายุ 15 นาที ต่ออายุทุก 60 วินาที) ถ้าตารางถูกล็อกจะ "SKIPPED" (`spark_quality_engine.py:126-195, 1568-1571`)
2. **โหลดกฎ** จาก ES `sdoqap_rules_registry` (ถ้าไม่ได้ใช้ไฟล์ `rules_config.json`) แล้วคำนวณเกณฑ์ adaptive (`:1370-1415, 1595-1604`)
3. **อ่านไฟล์ดิบ CSV ทั้งหมดเป็นข้อความ** ตรวจไฟล์ว่าง (ข้ามด้วยรหัส 75) และตรวจคอลัมน์ข้อความยาวผิดปกติ (`:1641-1674`)
4. **`schema_align` จัดชื่อคอลัมน์และแปลงชนิด** ตัดอักขระพิเศษ ชื่อคอลัมน์ให้ตรง schema แปลงเป็นตัวเลข/วันที่ (รองรับหลายรูปแบบวันที่และ epoch) เพิ่ม `row_hash` ถ้าจำเป็น (`schema.py:10-98`)
5. **`schema_drift` ตรวจโครงสร้างเปลี่ยน** คอลัมน์หาย/ชนิดไม่ตรง/คอลัมน์ใหม่ บันทึก ES `sdoqap_schema_drifts` และ `sdoqap_schema_proposals` (อนุมัติอัตโนมัติเฉพาะกรณีคอลัมน์ใหม่และนโยบายอนุญาต ที่เหลือรอคนอนุมัติ) (`schema.py:101-243`)
6. **`auto_clean` แก้ข้อมูลอัตโนมัติ** ใช้กฎ DSL (fillna, calculate, cast, standardize, semantic_standardize, auto_strategy, filter — `spark_quality_engine.py:819-1222`) แล้วลบแถวคีย์ซ้ำ (`cleansing.py:6-44`)
7. **`validation` ตรวจค่าว่าง ชนิด วันที่** ใส่ `is_invalid` และ `reject_reason` (`cleansing.py:47-115`)
8. **`dedup` คัดแถวซ้ำ** เก็บแถวล่าสุดของแต่ละคีย์ ที่เหลือเป็น `duplicate_records` (`cleansing.py:118-138`)
9. **`standardize_dates`** ปรับรูปแบบวันที่เป็น `YYYY-MM-DD` รวมแปลงปี พ.ศ. (ปี > 2500 ลบ 543) เฉพาะคอลัมน์ชื่อ `วันที่`/`date`/`Date` (`standardize.py:6-57`)
10. **`standardize_categories`** จัดหมวดค่าตามคำสำคัญจาก `schema_registry` ใน ES (`standardize.py:60-103`)
11. **`range_rules`** ตรวจช่วงค่าตามกฎธุรกิจ `range_checks` (`rules.py`)
12. **`anomaly_iqr`** หา outlier ด้วย IQR (`anomaly.py:6-44`)
13. **`anomaly_zscore`** หา anomaly ด้วย Z-score เกิน 3σ (`anomaly.py:47-75`)
14. **`anomaly_induced`** ใช้กฎที่ Decision Tree เรียนรู้ (ถ้ามี) (`anomaly.py:78-118`)
15. **`quarantine_assembly`** รวมทุกแถวที่ไม่ผ่านเป็นชุดเดียว ใส่ `run_id` และ `rejected_at` นับ Clean/Quarantine/รวม (`assembly.py:6-49`)
16. **`column_filter`** ตัดคอลัมน์ที่ไม่อยู่ใน schema ออกจากชุด Clean (`assembly.py:52-75`)
17. **เขียน Quarantine ก่อน** (ลบของ ingest เดิมแล้วเขียนใหม่ เพื่อรันซ้ำไม่ซ้ำซ้อน) แล้ว **MERGE ชุด Clean ลง `/data/active`** (`spark_quality_engine.py:1702-1736`) จากนั้นบำรุงรักษา Delta ทุก 10 เวอร์ชัน (OPTIMIZE ZORDER BY `row_hash` + VACUUM 168 ชม. `:1754-1765`)
18. **ขั้นหลังเขียน (`POST_LOAD`)**: `distribution` (สัดส่วนหมวดข้อมูล) → `quarantine_breakdown` (นับเหตุผลกักกัน) → `copdq` (มูลค่าความเสียหาย = ผลรวมคอลัมน์การเงิน เช่น `total_sales`, `price`, `amount` ของแถวที่ถูกกักกัน ถ้ามี) → `freshness` (ความสดใหม่ = ชั่วโมงตั้งแต่วันที่ล่าสุด) → `quality_score` (คะแนน + Z-score ของอัตรากักกันเทียบประวัติ 15 รอบ ถ้า Z>3 เป็น anomaly) → `ai_advisory` (AI เสนอกฎ เก็บเป็นข้อเสนอรออนุมัติ ไม่แก้กฎเอง) → `operational_impact` (คะแนนผลกระทบถ่วงน้ำหนัก) → `report` (เขียน `sdoqap_quality_runs`, `sdoqap_lineage_runs`, `sdoqap_pipeline_runs`) (`metrics.py`, `advisory.py`, `report.py`)
19. **สร้าง Gold ใหม่อัตโนมัติ** ถ้าคะแนน ≥ เกณฑ์ (`spark_quality_engine.py:1777-1788`)
20. **ย้ายไฟล์ดิบไป archive** (`/data/raw/...` → `/data/archive/...`) ปล่อยล็อก ปิด Spark (`:1790-1811`)

## 1.9 รายการที่เป็น Mock / Static / ยังไม่เชื่อมจริง ในหน้านี้ (สรุปตรง ๆ)

- 🔴 ข้อความรอง "ไม่มีค่าว่าง" (การ์ด Clean) และ "study_hours สูงผิดปกติ" (การ์ด Review) เป็นข้อความตายตัว
- 🔴 ป้าย "#UP-89" ตายตัว; ⚪ ปุ่ม "แจ้งแก้ต้นทาง" แค่สลับค่า true/false ไม่สร้างใบงาน
- 🔴 เปอร์เซ็นต์การ์ด Review มีขั้นต่ำ 1% ตายตัว; สีคะแนน 95/85 ตายตัว
- ⚪ `GET /whitebox/benchmark` เรียกแล้วไม่ใช้; `showTraceability` ไม่ใช้
- ⚪ ผลลัพธ์ปุ่ม "สร้าง Gold ใหม่" (`goldResult`) ไม่มีที่แสดงบนหน้าจอ
- 🟡 ปุ่ม "รัน Pipeline" คำนวณใหม่แบบ pandas ไม่ได้สั่ง Spark
- 🟡 ป้าย QUARANTINED ของตารางรอบการรัน แท้จริงคือสถานะ `warnings` (หรือสถานะอื่นที่ไม่ใช่ success/failed)
- 🟢/ข้อจำกัด: "Retry New Run ID: N/A" เสมอ; คอลัมน์ Duration ในตาราง Pipeline Runs น่าจะว่างเพราะ index นี้ไม่มีฟิลด์ `duration_seconds`
- ไม่พบการบล็อกด้วยการล็อกอินที่ endpoint อ่าน (`GET /pipeline`, `/quality`, `/whitebox/state`, `/preview-zone`) มีเฉพาะ POST ที่ใช้ `require_session` (ตรวจจาก `pipeline.py`, `quality.py`, `whitebox.py:1442`); การป้องกันหน้าเว็บทำที่ฝั่ง React (`RequireAuth` ใน `App.jsx:104`)
- Daemon เส้นทาง `/gold/rebuild` ไม่ตรวจ `X-Trigger-Secret` ต่างจาก `/retry` (`spark_trigger_daemon.py:296-341` เทียบ `:278-280`) และ `gold.py:157` ก็ไม่ส่งความลับนี้

### สามคำตอบสั้น ๆ (หน้า Jobs & Pipelines)

- **หน้านี้มีไว้ทำอะไร?** ดูผลการคัดแยกข้อมูลเป็น Clean / Review / Quarantine ตรวจแถวรายตัว และดูประวัติการรันของ Spark พร้อมสั่งรันซ้ำ/สร้าง Gold ใหม่
- **ผู้ใช้ทำอะไรได้?** กรองและค้นหาแถว อนุมัติ/กักกันแถว Review (ทั้งก้อนหรือรายแถว) กดแจ้งแก้ต้นทาง (แค่ติดธง) ดูประวัติ/คะแนนคุณภาพ เปิดดูแถวข้อมูลจริงของแต่ละรอบ กด Retry และสร้าง Gold ใหม่
- **ระบบทำอะไรเบื้องหลัง?** ส่วนบนใช้ pandas คำนวณ 3 โซนจากไฟล์ตัวอย่างแล้วเขียน CSV/สถานะลงดิสก์; ส่วนล่างอ่านผลที่ Spark เขียนไว้ใน Elasticsearch และ HDFS (Spark ตรวจ → แยก Clean ลง `/data/active`, Quarantine ลง `/data/quarantine`, เก็บคะแนนใน ES)

---

# ส่วนที่ 2 — หน้า Workspace Exports (`/export`)

| Frontend file | API endpoints | Backend handler | Storage |
|---|---|---|---|
| `services/ui/src/pages/DataExport.jsx` (706 บรรทัด) — ส่วนบน "3 โซน" | `GET /api/v1/whitebox/state` (:47), `GET /api/v1/whitebox/preview-zone/{zone}` (:31), `GET /api/v1/whitebox/export-csv/{zone}` (:90), `GET /api/v1/lineage/{dataset}/trust-check` (:57) | `whitebox.py:1437, 1496-1526, 1477-1493`; `lineage.py:340-447` | ไฟล์ CSV 3 โซนใน `output_runs` ของ API; ES `sdoqap_quality_runs`, `sdoqap_schema_proposals` (trust-check) |
| ส่วนล่าง "ส่งออกตารางอื่น" แท็บ ตาราง Pipeline | `GET /api/v1/export/tables` (:130), `GET /api/v1/export/preview/{layer}/{table}` (:181-184), `GET /api/v1/export/{raw\|active\|quarantine}/{table}` (:237-242), `GET /api/v1/export/reddit?subreddit=` (:237), `DELETE /api/v1/export/tables/{table}` (:150) | `services/api/app/api/data_export.py` (318-359, 453-489, 552-638, 362-444) | HDFS `/data/raw`, `/data/active`, `/data/quarantine`, `/data/archive`, `/data/reddit/parquet` ผ่าน WebHDFS; ES หลาย index (ตอนลบ) |
| แท็บ รายงาน Gold | `GET /api/v1/gold/{metric}?days=` (:178), `GET /api/v1/export/gold/{metric}?days=` (:245) | `api/app/api/gold.py:15-148`, `data_export.py:641-685` | ES `sdoqap_gold_daily_quality`, `_error_patterns`, `_financial_impact`, `_schema_drift` |

ไฟล์ `spark/scripts/export_run_rows.py` **ไม่ได้เชื่อมกับหน้านี้** (ตรวจไม่พบการเรียกใช้จาก UI/API) เป็นสคริปต์สำหรับรันด้วยมือใน spark-master เพื่อส่งออกแถว Clean/Quarantine ของรอบเดียวเป็น CSV (`export_run_rows.py:1-39`) ใช้ในการประเมินผล

## 2.0 ข้อสังเกตสำคัญ

- **รูปแบบไฟล์ที่ดาวน์โหลดได้: CSV อย่างเดียวทุกปุ่ม** ไม่มี Excel (.xlsx), Parquet หรือ JSON ให้ดาวน์โหลด (ตรวจไม่พบในโค้ดฝั่ง UI/API) CSV จากฝั่ง `export/*` เข้ารหัส UTF-8 พร้อม BOM เพื่อให้ Excel บน Windows แสดงภาษาไทยถูก (`data_export.py:315`) ส่วน Gold export ไม่ใส่ BOM (`:676-680`)
- **หน้านี้เหมือนหน้า Pipeline: ส่วนบนใช้เอนจินโต้ตอบ (pandas + ไฟล์ CSV)** ส่วนล่างใช้ข้อมูลจริงจาก HDFS/ES (ตามข้อความในหน้า `DataExport.jsx:288`)
- **ชั้นข้อมูลที่ดาวน์โหลดได้:** (1) 3 โซนของเอนจินโต้ตอบ Clean/Review/Quarantine, (2) HDFS: Raw (Bronze), Active (Silver/Clean), Quarantine, Reddit streaming, (3) Gold (ตารางสรุป 4 ชุดใน ES) — ตรวจไม่พบเพดานขนาดของไฟล์ดาวน์โหลดในโค้ด (ดูหัวข้อ 2.6)

## 2.1 ส่วนหัวและแถบสถานะด้านบน

- **[หัวข้อ "Workspace Exports" "ขั้นที่ 4/4"]** → ข้อความจาก `config/pages.js:13` — 🔴 ตายตัว
- **[ปุ่ม "ดู Dashboard"]** → ลิงก์ไป `/dashboard` (DataExport.jsx:280) — 🔴 ปุ่มนำทาง
- **[ป้ายเขียว "ผ่านการคัดกรองแล้ว N แถว" + ไอคอน ⓘ]** → (1) ⓘ แสดงคำอธิบาย (2) N = `metrics.total_rows` จาก `GET /whitebox/state` (DataExport.jsx:286) (3) `whitebox.py:1412` (4) 🟢 ตัวเลข แต่ **ความหมายคลาดเคลื่อน**: `total_rows` คือจำนวนแถวทั้งหมด (รวม Review และ Quarantine) ไม่ใช่เฉพาะแถวที่ผ่าน; ถ้าโหลดไม่ได้แสดง "—"
- **[แถบ Trust-check (เขียว/แดง)]** → (1) – (2) บอกว่าชุดข้อมูลนี้ผ่านเกณฑ์คุณภาพของ pipeline จริงหรือยัง ก่อนที่ทีม BI/ML จะนำไปใช้ (DataExport.jsx:52-61, 304-317) (3) `GET /lineage/{dataset_name}/trust-check` → `lineage.py:340-447`: อ่านรอบล่าสุดจาก ES `sdoqap_quality_runs` ของตารางนั้น, `is_safe = (quality_score ≥ เกณฑ์) AND (ไม่มีข้อเสนอเปลี่ยน schema สถานะ PENDING) AND (ตรวจ ES สำเร็จ)` (`:416`) (4) 🟡 คำนวณจากข้อมูลจริง ข้อควรระวัง: ชื่อชุดข้อมูลมาจากสถานะของเอนจินโต้ตอบ (`wbState.dataset_name`) ไม่ใช่ตารางของ Spark เสมอไป ถ้าชื่อนั้นไม่มีรอบใน Spark จะขึ้นแถบแดง "ยังไม่ผ่านการตรวจคุณภาพ: No quality runs found for this table." (ข้อความเหตุผลเป็นภาษาอังกฤษจาก API) ถ้าเรียกไม่สำเร็จ แถบจะไม่แสดงเลย (`.catch(() => {})`, บรรทัด 60)

## 2.2 ส่วน "3 โซน" (Clean / Review / Quarantine)

- **[ปุ่ม "ดาวน์โหลด Clean CSV" (แถบบน)]** → ทำงานเหมือนปุ่ม "ดาวน์โหลด" ของแถว Clean (DataExport.jsx:293-299) ดูด้านล่าง
- **[ตาราง 3 แถว: ไฟล์ / ประเภท / แถว / จัดการ]** (DataExport.jsx:320-414)
  - ชื่อไฟล์ `certified_gold_clean.csv`, `human_review_outliers.csv`, `quarantine_root_cause_audit.csv` → 🔴 **ชื่อตายตัวสำหรับแสดง** (ไฟล์จริงที่ดาวน์โหลดตั้งชื่อใหม่ตามข้อ "ดาวน์โหลด") และคำว่า "certified gold" ในชื่อ **ไม่ใช่ Gold Layer** ของระบบ (Gold จริงคือ ES ตารางสรุป) แต่คือโซน Clean ของเอนจินโต้ตอบ
  - คอลัมน์ "แถว" → `clean_rows`, `review_rows`, `quarantine_rows` จาก `GET /whitebox/state` (DataExport.jsx:76-80) 🟢 **แต่มีค่าสำรองฮาร์ดโค้ด**: `?? 9400`, `?? 100`, `?? 600` และ `quality_score_pct ?? 93.1` ถ้าโหลดสถานะไม่ได้ (เช่น API ล่ม; `.catch` เงียบ, บรรทัด 64) หน้าจอจะแสดง 9,400 / 100 / 600 เหมือนเป็นข้อมูลจริง — เป็น 🔴 เมื่อโหลดไม่ได้ (ตัวเลขนี้บังเอิญเท่ากับผลของชุดตัวอย่าง 10,100 แถว) และ `qualityPct` ถูกกำหนดแต่ **ไม่ถูกนำไปแสดงที่ใด** (⚪)
  - ชื่อไฟล์ (คลิก) / **ปุ่ม "ดูตัวอย่าง"** → (1) โหลดตัวอย่างแถวของโซนนั้นเข้าตารางด้านล่าง (DataExport.jsx:23-44) (2) ดึงสูงสุด `limit` แถว (1–500, ค่าตั้ง 20) (3) `GET /whitebox/preview-zone/{zone}?limit=…&search=…` → `whitebox.py:1496-1526` (4) 🟢 (ถ้าเรียกพลาดจะ "ไม่ทำอะไร" ตารางค้างค่าเดิม — `catch` เงียบ บรรทัด 39-41)
  - **ปุ่ม "คัดลอก API URL"** → (1) คัดลอกลิงก์ `https://<โดเมนปัจจุบัน>/api/v1/whitebox/export-csv/<zone>` ลงคลิปบอร์ด ปุ่มเปลี่ยนเป็น "คัดลอกแล้ว" 2 วินาที (DataExport.jsx:68-74) (2) ไว้ให้ BI/ML ดึงไฟล์ผ่านโปรแกรมแทนการกดดาวน์โหลด (3) ใช้ `navigator.clipboard` ฝั่งเบราว์เซอร์ ไม่เรียก API — 🟡 (สร้างลิงก์จากที่อยู่เว็บ + ชื่อโซน) หมายเหตุ: endpoint ปลายทางเรียกได้โดยไม่ต้องล็อกอิน (ไม่มี `Depends(require_session)` ที่ `whitebox.py:1477`)
  - **ปุ่ม "ดาวน์โหลด" / "ดาวน์โหลดแล้ว"** → (1) กดแล้วโหลดตัวอย่างโซน แล้วดาวน์โหลดไฟล์ CSV ทั้งโซน (DataExport.jsx:82-106) (2) ไฟล์ CSV ของโซน (3) `GET /whitebox/export-csv/{zone}` → `whitebox.py:1477-1493` สั่ง `_recompute_interactive_state()` ใหม่ทุกครั้ง แล้วส่งไฟล์ด้วย `FileResponse` (`text/csv`) เบราว์เซอร์รับเป็น blob แล้วสร้างลิงก์ดาวน์โหลดเอง (4) ชื่อไฟล์ตั้งโดยหน้า: `<ชื่อไฟล์ที่กรอก>_<zone>_<จำนวนแถว>rows.csv` (บรรทัด 86-87) — ชื่อไฟล์ที่ฝั่ง API ส่งมา (`student_course_scores_clean.csv`) ถูกเมินในหน้านี้ — 🟢 ไฟล์จริง; ตัวเลข `<N>rows` ในชื่อไฟล์ **ใช้ค่าสำรองฮาร์ดโค้ดเมื่อโหลดสถานะไม่ได้** (🔴 ในกรณีนั้น) ข้อความ "ดาวน์โหลดแล้ว" 🟡 (เก็บเวลาในหน้า `zoneDownloaded`, ไม่ได้ยืนยันกับ Server)
    - ข้อสังเกต: ข้อความสถานะการดาวน์โหลดโซน (`exportStatus`) ถูกวาดอยู่ภายในส่วนพับ "ส่งออกตารางอื่น" (DataExport.jsx:637-641) ถ้าส่วนนั้นพับอยู่ ผู้ใช้จะไม่เห็นข้อความ "กำลังสร้าง…/สำเร็จ/ล้มเหลว" และข้อความของปุ่มโซนไม่ถูกล้างเอง
    - ข้อสังเกต: โซนที่ไม่รู้จักจะถูกตีเป็น Quarantine (`whitebox.py:1484-1489`)
- **[ช่องค้นหา "ค้นหารายการในโซน …"]** → (1) พิมพ์แล้วโหลดตัวอย่างใหม่ทันที **ทุกตัวอักษร ไม่มีการหน่วงเวลา** (DataExport.jsx:420-430) (2) กรองข้อความทุกคอลัมน์ของโซนที่เลือก (3) ทุกครั้งที่เรียก `preview-zone` ฝั่ง API คำนวณ 3 โซนและเขียนไฟล์ CSV ใหม่ (`whitebox.py:1498`) → ภาระสูงถ้าพิมพ์เร็ว — 🟢
- **[ช่อง "แสดง:" (1–500)]** → จำนวนแถวตัวอย่างที่จะดึง (ตัวหน้าบังคับ 1–500 ที่ :30 และตัวหลังบ้านบังคับ 1–500 ที่ `whitebox.py:1520`) — 🟢
- **[ช่อง "ชื่อไฟล์:"]** → กำหนดคำนำหน้าชื่อไฟล์ดาวน์โหลด (ค่าตั้ง `student_course_scores`, ตัดท้าย `.csv` ถ้าใส่มา) ใช้เฉพาะ 3 ปุ่มโซน ไม่ส่งไป API — 🔴 ค่าเริ่มต้นตายตัว (ค่าที่ผู้ใช้กรอกคือข้อมูลของผู้ใช้)
- **[ป้ายฟ้า "พบตรงเงื่อนไข N แถว"]** → `matched_rows` (หรือ `total_zone_rows`) ของโซนที่เปิด (DataExport.jsx:37, 459-463) — 🟢
- **[ตาราง "ตัวอย่าง <โซน>"]** → (1) – (2) แสดงตัวอย่างแถวของโซน สูงสุดตามช่อง "แสดง" (3) ข้อมูลจาก `preview-zone` (DataExport.jsx:466-501) (4) 🟢 ข้อความ "กำลังโหลด…" / "ไม่พบข้อมูลที่ตรงกับคำค้นหา…" เป็น 🔴 ข้อความตายตัว

## 2.3 ส่วนพับ "ส่งออกตารางอื่น" (ข้อมูลจริงจาก HDFS/ES)

- **[หัวข้อพับ "ส่งออกตารางอื่น"]** → กาง/พับ (`<details>`, DataExport.jsx:505-508) — 🔴 UI
- **[แท็บ "ตาราง Pipeline" / "รายงาน Gold"]** → สลับโหมด ล้างตัวอย่าง (DataExport.jsx:510-523) แล้ว `useEffect` โหลดตัวอย่างใหม่ (:172-228) — 🔴 UI

### แท็บ "ตาราง Pipeline"

- **[เมนู "Target Data Layer"]** → (1) เลือกชั้นข้อมูล: Active (Silver/Clean), Raw (Bronze/Raw CSV), Quarantine (Bad Records) และ "Reddit Streaming Dataset" (โผล่เมื่อพบโฟลเดอร์ `/data/reddit/parquet`) (DataExport.jsx:535-549) (2) ตัวเลือก Reddit ขึ้นตาม `reddit_available` จาก `GET /export/tables` (`data_export.py:343-350`) (3) ป้ายชื่อชั้นเป็นข้อความตายตัว — 🟢 (การมีตัวเลือก Reddit) / 🔴 (ป้ายชื่อ)
- **[เมนู "Streaming Subreddit"]** → เลือก r/python, bigdata, datascience, machinelearning, technology (DataExport.jsx:554-560) — 🔴 **รายการตัวเลือกตายตัว 5 ตัว** (ไม่ได้ดึงจากระบบ) ข้อมูลของแต่ละตัวต้องมีจริงบน HDFS ที่ `/data/reddit/parquet/subreddit=<ชื่อ>` (`data_export.py:624`)
- **[เมนู "Table Source" + ปุ่ม "Delete"]**
  - รายชื่อตาราง → (1) – (2) แคตตาล็อกตารางที่มีโฟลเดอร์ใน HDFS `/data/raw`, `/data/active`, `/data/quarantine` พร้อมชั้นที่มี (3) `GET /export/tables` → `data_export.py:318-359` (ใช้ WebHDFS LISTSTATUS) (4) 🟢 (ไม่นับโฟลเดอร์ `/data/archive`); ตัวเลือกแรกถูกเลือกอัตโนมัติ (DataExport.jsx:135-137)
  - **ปุ่ม "Delete"** → (1) เด้ง `window.confirm` ภาษาอังกฤษ ยืนยันแล้วลบทั้งชุดข้อมูล แล้วแจ้งผลด้วย `alert` (DataExport.jsx:146-165) (2) **ลบถาวร** (3) `DELETE /export/tables/{table}` → `data_export.py:362-444` (ต้องล็อกอิน): ลบโฟลเดอร์ HDFS `/data/raw|active|quarantine|archive/<ตาราง>` แบบ recursive; ลบเอกสารของตารางนั้นใน ES 8 index (`sdoqap_quality_runs`, `sdoqap_runs`, `sdoqap_pipeline_runs`, `sdoqap_schema_drifts`, `sdoqap_schema_proposals`, `sdoqap_ai_rule_proposals`, `sdoqap_unmapped_terms`, `sdoqap_upstream_remediations`) + เอกสารใน `sdoqap_rules_registry` และ `sdoqap_schema_registry` + ลบรายการในไฟล์ `rules_config.json` และ `schema_registry.json` (4) 🟢 ทำงานจริง ข้อควรระวัง: คำเตือนในหน้าบอกว่าลบ "lineage runs" ด้วย แต่รายการ index ที่ลบ **ไม่มี `sdoqap_lineage_runs`** และไม่แตะตาราง Gold (`sdoqap_gold_*`) ตรวจจาก `data_export.py:383-392`
- **[แผง "Available Medallion Layers" (ป้าย RAW / ACTIVE / QUARANTINE เขียว/เทา)]** → (1) – (2) บอกว่าตารางที่เลือกมีชั้นใดบ้างใน HDFS (Medallion = สถาปัตยกรรมชั้น Bronze→Silver→Gold) (3) `layers` จาก `GET /export/tables` (DataExport.jsx:596-610) (4) 🟢
- **[กล่องสถานะ (toast)]** → แสดงข้อความขณะ/หลังส่งออก (DataExport.jsx:637-641): ข้อความ "Generating CSV export from HDFS raw storage..." เป็น 🔴 ข้อความตายตัวและไม่ตรงเมื่อชั้นเป็น Active/Quarantine/Gold (ที่อ่านจาก Delta/ES ไม่ใช่ raw); ข้อความสำเร็จจะหายเองใน 5 วินาที (:268)
- **[ปุ่ม "Export CSV File"]** → (1) กดแล้วดาวน์โหลด CSV ตามที่เลือก ปุ่มเปลี่ยนเป็น "Generating export..." และถูกปิดระหว่างทำงาน (DataExport.jsx:231-272, 643-650) (2) ชื่อไฟล์ `<ตาราง>_<ชั้น>.csv`, `reddit_<subreddit>.csv`, หรือ `gold_<metric>_<N>d.csv` (3) เส้นทางที่เรียก:
  - Raw: `GET /export/raw/{table}` → `data_export.py:552-561` หา "ไฟล์ดิบล่าสุด" จาก `/data/raw/<ตาราง>/<ingest_id>/<ตาราง>.csv` หรือ `/data/archive/…` (เลือกที่แก้ไขล่าสุด `:113-127`) แล้ว **สตรีมเป็นก้อน 16 KB** ผ่าน WebHDFS (`:83-100`) — ส่งไฟล์ต้นฉบับ ไม่ผ่านการแก้ไข
  - Active: `GET /export/active/{table}` → `:564-588` อ่าน Delta จาก `/data/active/<ตาราง>` (อ่านบันทึก `_delta_log` เพื่อรู้ว่าไฟล์ Parquet ใดเป็นปัจจุบัน แล้วโหลดผ่าน WebHDFS เข้า pandas `:154-214`) ผ่าน `prepare_df_for_export` (`:272-315`): ตัดคอลัมน์ `run_id`/`__index_level_0__`, เรียงตามวันที่ → สินค้า/หมวด → คีย์หลัก, คงชนิดจำนวนเต็ม, เข้ารหัส UTF-8 BOM แล้วส่งเป็นไฟล์เดียว
  - Quarantine: `GET /export/quarantine/{table}` → `:591-617` ขั้นตอนเหมือน Active (คอลัมน์ `reject_reason`, `rejected_at` ยังอยู่) ถ้ายังไม่มีข้อมูลบน HDFS ส่งไฟล์ที่มีแต่หัวคอลัมน์จาก `schema_registry.json` (`:605-616`)
  - Reddit: `GET /export/reddit?subreddit=` → `:620-638`
  - (4) 🟢 ข้อมูลจริงจาก HDFS; ปุ่มถูกปิดเมื่อยังไม่เลือกตาราง
- **[ตารางตัวอย่างด้านขวา "Dataset Preview (First 10 Rows)"]** → (1) – (2) ตัวอย่าง 10 แถวแรกของชั้น/ตารางที่เลือก (3) `GET /export/preview/{layer}/{table}` → `data_export.py:453-489` (Raw: อ่านไฟล์ CSV 10 แถว, Active/Quarantine/Reddit: อ่าน Delta/Parquet แล้ว `head(10)`; ค่า NaN/Infinity แปลงเป็น null `:447-450`) (4) 🟢 หัวข้อ "First 10 Rows" เป็น 🔴 ข้อความตายตัว (ตรงกับโค้ดที่ตัด 10 แถว)
  - บรรทัดบอกเส้นทาง `HDFS: /data/<ชั้น>/<ตาราง>` → 🟡 สร้างจากค่าที่เลือก ไม่ได้ถามระบบ (เช่น ชั้น Raw จริงอยู่ที่ `/data/raw/<ตาราง>/<ingest_id>/…` หรือ `/data/archive/...` ตาม `data_export.py:113-127`)
  - ข้อความ "Loading delta preview rows…", "Select catalog table to preview delta rows" → 🔴 ตายตัว; ข้อผิดพลาดแสดงข้อความจาก API (`detail`) หรือ "Failed to fetch preview data." (:217-221)
  - ข้อควรระวัง: ถ้าไม่มี `/data/active/<ตาราง>` ฝั่ง API ตอบ 200 พร้อมแค่ชื่อคอลัมน์จาก schema (`data_export.py:470-473`) ตารางตัวอย่างจะว่างและแสดงข้อความ "Select catalog table…" ซึ่งอาจสับสนได้

### แท็บ "รายงาน Gold"

- **[เมนู "Gold Metric Index Type"]** → เลือก Daily Quality Summaries / Common Error Patterns / Financial Loss Estimates (COPDQ) / Schema Drift History (DataExport.jsx:616-621) — ค่าที่ส่ง `daily-quality`, `error-patterns`, `financial-impact`, `schema-drift` ซึ่งมี endpoint ตรงกันครบ (`gold.py:15, 38, 72, 122`) — 🔴 รายการตัวเลือกตายตัว
- **[ช่อง "Range (Last N Days)" 1–365]** → จำนวนวันย้อนหลัง (ค่าตั้ง 14; ใส่ค่าที่แปลงไม่ได้จะกลับเป็น 7 — DataExport.jsx:629) — 🔴 ค่าตั้งต้น
- **[ตัวอย่าง Gold (10 แถวแรก)]** → `GET /gold/{metric}?days=` → `gold.py` ค้น ES (daily-quality ≤ 200 รายการ, error-patterns ≤ 200, financial-impact ≤ 100, schema-drift ≤ 200) เรียงตามวันที่เก่า→ใหม่ แล้วหน้านำ 10 แถวแรกมาแสดง (DataExport.jsx:195-212) — 🟢 หมายเหตุ: 10 แถวแรกคือ **วันเก่าสุดของช่วง** ไม่ใช่ล่าสุด และถ้า index ยังไม่มี API ตอบ `{"data": [], "source": "no_gold_layer"}` หน้าแสดง "No gold metrics found for the selected date range."
  - บรรทัด "Elasticsearch Index: sdoqap_gold_<metric>" → 🟡 สร้างจากค่าที่เลือก (DataExport.jsx:663)
- **[ปุ่ม "Export CSV File" (โหมด Gold)]** → `GET /export/gold/{metric}?days=` → `data_export.py:641-685`: ค้น ES ตามช่วง `now-{N}d/d` ถึง `now/d` สูงสุด **10,000 เอกสาร** เรียงวันที่ใหม่→เก่า (ตาราง `gold.py` ใช้เพดานต่ำกว่า) เรียงชื่อคอลัมน์ตามตัวอักษรแล้วส่ง CSV (ไม่มี BOM) — 🟢; ถ้า index ไม่มีตอบ 404 "Gold metric index … does not exist"

## 2.4 ข้อมูลที่ใช้เป็น "Gold / trusted data" ในหน้านี้

- **Gold Layer ที่เป็นของจริงในระบบ** = ตารางสรุป 4 ชุดใน Elasticsearch ที่ `spark_gold_layer.py` สร้างจากประวัติผลการรัน: รายวันต่อตาราง (คะแนนเฉลี่ย/ต่ำสุด/สูงสุด, จำนวนรวม, อัตรากักกัน = `quarantined ÷ total × 100`), รูปแบบข้อผิดพลาด (จำนวนและเปอร์เซ็นต์ของเหตุผลกักกัน), ผลกระทบทางการเงิน (ใช้มูลค่าจริงของแถวกักกันถ้ามี มิฉะนั้นประมาณการ `จำนวนแถวกักกัน × 11 ดอลลาร์` — ค่าคงที่ `COST_PER_QUARANTINED_RECORD_USD = 11.0` ในโค้ด `spark_gold_layer.py:48`), และประวัติ schema drift (`spark_gold_layer.py:184-430`) 🟡 (คำนวณจากข้อมูลจริง ใช้สูตรอ้างอิงเชิงเบญจมาร์กในโค้ด) ตัวเลขดอลลาร์เป็นการประมาณ ไม่ใช่ค่าจริงทางบัญชี
- **ข้อมูลที่ "เชื่อถือได้" (trusted)** ในหน้า = โซน Clean (ส่วนบน) พร้อมแถบ Trust-check (ผ่านเกณฑ์คะแนน + ไม่มี schema drift ที่รออนุมัติ) และชั้น Active (Silver) ของ HDFS ส่วน Raw คือข้อมูลดิบไม่ผ่านตรวจ Quarantine คือข้อมูลที่ถูกแยกออก

## 2.5 กระบวนการสร้างและส่งไฟล์ (อธิบายแบบเข้าใจง่าย)

1. ผู้ใช้กดปุ่ม → เบราว์เซอร์เรียก API ผ่าน nginx (`/api/` → `api:8000`, `services/ui/nginx.conf:14-23`)
2. โซน Clean/Review/Quarantine: API คำนวณสถานะใหม่ เขียนไฟล์ CSV บนดิสก์ แล้วส่งไฟล์กลับทั้งไฟล์ (`FileResponse`)
3. Raw: API ต่อไปยัง HDFS ผ่านบริการ WebHDFS ของ namenode แล้วส่งต่อเป็นสตรีมทีละ 16 KB (ไม่ต้องโหลดทั้งไฟล์เข้าหน่วยความจำ)
4. Active/Quarantine/Reddit: API อ่านไฟล์ Parquet ทุกชิ้นที่ยังใช้งานอยู่ของตาราง Delta ผ่าน WebHDFS รวมเป็นตารางเดียวใน pandas แล้วแปลงเป็น CSV ทั้งก้อนในหน่วยความจำก่อนส่ง (`data_export.py:154-254, 272-315`)
5. Gold: API ค้น Elasticsearch แล้วแปลงเป็น CSV
6. เบราว์เซอร์รับเป็น blob แล้วสร้างลิงก์ดาวน์โหลดชั่วคราวเพื่อบันทึกไฟล์ (DataExport.jsx:92-100, 257-265)

## 2.6 ขนาดและข้อจำกัด

- **ไม่มีเพดานขนาดไฟล์ดาวน์โหลด** ในโค้ด: ตรวจไม่พบ (มีพารามิเตอร์ `limit` ใน `export/active|quarantine|reddit` แต่ **UI ไม่เคยส่งค่านี้** — `data_export.py:565, 592, 621`)
- Active/Quarantine/Reddit โหลดทั้งตารางเข้าหน่วยความจำของ API ก่อนแปลงเป็น CSV จึงเสี่ยงหน่วยความจำไม่พอกับตารางใหญ่ (อนุมานจากโค้ด `read_parquet_folder_to_df` + `to_csv`) ส่วน Raw ถูกสตรีม
- nginx ตั้ง `proxy_read_timeout 30s` (`nginx.conf:20`) การสร้างไฟล์ที่ใช้เวลานานกว่า 30 วินาทีอาจถูกตัดการเชื่อมต่อ (อนุมานจากค่าตั้ง)
- ตัวอย่าง: โซน ≤ 500 แถว (`whitebox.py:1520`), ตารางตัวอย่างล่าง 10 แถว, แผง RunRecords ≤ 500 แถวต่อหน้า (ใช้ 50) (`data_export.py:538`), Gold CSV ≤ 10,000 เอกสาร (`:662`)
- การอ่าน Delta ของ API อ่านเฉพาะไฟล์ `.json` ใน `_delta_log` (`data_export.py:177-199`) — ตรวจไม่พบการอ่านไฟล์ checkpoint
- Endpoint ดาวน์โหลด/ตัวอย่าง (`/export/raw|active|quarantine|reddit|gold|tables|preview`, `/whitebox/export-csv`) ตรวจไม่พบการบังคับล็อกอิน (ไม่มี `Depends(require_session)`; มีเฉพาะ `DELETE /export/tables` และ `/export/records`) — ป้องกันที่ฝั่ง React เท่านั้น

## 2.7 รายการที่เป็น Mock / Static / ยังไม่เชื่อมจริง ในหน้านี้ (สรุปตรง ๆ)

- 🔴 ตัวเลข 9,400 / 100 / 600 / 93.1 เป็นค่าสำรองฮาร์ดโค้ดเมื่อโหลดสถานะไม่ได้ (`DataExport.jsx:77-80`) และถูกใช้ในชื่อไฟล์ที่ดาวน์โหลดด้วย
- 🔴 ชื่อไฟล์แสดง `certified_gold_clean.csv`, `human_review_outliers.csv`, `quarantine_root_cause_audit.csv` เป็นป้ายตายตัว
- ⚪ ตัวแปร `qualityPct` ไม่ถูกนำไปแสดง
- 🔴 รายการ subreddit 5 ตัว และข้อความ toast "Generating CSV export from HDFS raw storage..." ตายตัว
- 🟢/ข้อบกพร่อง: ป้าย "ผ่านการคัดกรองแล้ว N แถว" ใช้จำนวนแถวทั้งหมด ไม่ใช่เฉพาะแถวที่ผ่าน
- 🟢/ข้อบกพร่อง: ข้อความสถานะการดาวน์โหลดโซนอยู่ในส่วนพับ จึงมองไม่เห็นถ้าไม่ได้กางส่วนนั้น
- ข้อบกพร่อง: คำเตือนปุ่ม Delete บอกว่าลบ lineage runs แต่โค้ดไม่ได้ลบ `sdoqap_lineage_runs`
- ไม่มีปุ่มดาวน์โหลด Excel / Parquet / JSON ใดเลย

### สามคำตอบสั้น ๆ (หน้า Workspace Exports)

- **หน้านี้มีไว้ทำอะไร?** ดาวน์โหลดข้อมูลที่ผ่านการตรวจคุณภาพ (Clean/Review/Quarantine) และข้อมูลจากชั้นอื่น (Raw, Active, Quarantine, Reddit, รายงาน Gold) เป็นไฟล์ CSV พร้อมดูตัวอย่างและสถานะความน่าเชื่อถือ
- **ผู้ใช้ทำอะไรได้?** ดูตัวอย่าง ค้นหา คัดลอกลิงก์ API ตั้งชื่อไฟล์ ดาวน์โหลด CSV ของแต่ละโซน/ชั้น/ตาราง Gold และลบชุดข้อมูลทั้งชุด (ถาวร)
- **ระบบทำอะไรเบื้องหลัง?** คำนวณโซนด้วย pandas แล้วส่งไฟล์ CSV หรืออ่านไฟล์จาก HDFS (สตรีม Raw / รวม Parquet ของ Delta เป็น CSV) หรือค้น Elasticsearch (Gold) แล้วส่งกลับให้เบราว์เซอร์บันทึก
