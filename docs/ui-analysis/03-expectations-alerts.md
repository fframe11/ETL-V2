# หน้า Expectations & Alerts (`/rules`) — อธิบาย UI ทีละส่วน

> วิเคราะห์จากโค้ดจริงทั้งหมด (อ่านไฟล์แล้วอ้าง `ไฟล์:บรรทัด`) — ไม่เดา ถ้าตรวจไม่ได้เขียนว่า "ตรวจไม่พบในโค้ด"
> ป้ายแหล่งข้อมูล: 🟢 ข้อมูลจริงจาก Backend · 🟡 ค่าที่คำนวณจากระบบ · 🔴 Mock/Static/ค่าคงที่ฮาร์ดโค้ด · ⚪ UI ที่ยังไม่เชื่อมระบบจริง (ปุ่ม/ค่าที่บันทึกแล้วแต่ไม่มีโค้ดฝั่ง Spark อ่านไปใช้)
> ชื่อหน้าในเมนู: "Expectations & Alerts" — ขั้นที่ 2/4 ของ workflow, คำอธิบายใต้หัวข้อ "กำหนดกฎคุณภาพข้อมูลก่อนรัน Pipeline" (`services/ui/src/config/pages.js:11`) — ข้อความนี้ 🔴 ค่าคงที่

---

## 0. ตารางสรุปเส้นทางข้อมูล

| Frontend file | API endpoints (ทั้งหมดขึ้นต้น `/api/v1`) | Backend handler | ที่เก็บข้อมูล |
|---|---|---|---|
| `services/ui/src/pages/RulesConfig.jsx` (1763 บรรทัด) | `GET/POST /whitebox/state`, `GET /whitebox/profile` | `whitebox.py:1437,1442,324` | ไฟล์ `workflow_state.json` + CSV 3 ไฟล์ใน `output_runs/` (ไม่ใช่ ES/Spark) |
| ″ | `GET /export/tables`, `DELETE /export/tables/{t}` | `data_export.py:318,362` | อ่านรายชื่อจาก HDFS (WebHDFS); ลบ HDFS + ES + `rules_config.json` |
| ″ | `GET /rules/{t}`, `PUT /rules/{t}` | `dynamic_rules.py:758,804` | ES index `sdoqap_rules_registry` (หลัก) + ไฟล์ `services/spark/rules_config.json` + audit `sdoqap_rules_audit_log` |
| ″ | `GET /rules/profiles/{t}` | `dynamic_rules.py:318` | อ่าน ES `sdoqap_quality_runs` (สำรอง `sdoqap_dynamic_rules_log`) |
| ″ | `GET /rules/ai-proposals`, `POST …/generate`, `POST …/{id}/approve`, `POST …/{id}/reject` | `dynamic_rules.py:422,649,472,686` | ES `sdoqap_ai_rule_proposals` (+ merge เข้า rules registry เมื่ออนุมัติ) |
| ″ | `GET/POST /system/settings` | `system.py:313,353` | ES `sdoqap_settings` (id `global`) |
| ″ | `GET /system/remediations`, `POST …/{id}/resolve` | `system.py:449,469` | ES `sdoqap_upstream_remediations` |
| ″ | `GET /standardize/review-queue`, `POST …/{id}/approve|reject|override` | `standardize.py:16,70,121,173` | ES `sdoqap_unmapped_terms`, `sdoqap_mapping_reviews` + rules registry |

ผู้ใช้ของกฎ (downstream): Spark อ่านกฎจาก ES `sdoqap_rules_registry` ก่อน ถ้าไม่ได้ค่อยอ่านไฟล์ `rules_config.json` (`spark_quality_engine.py:1370-1415`) — ทั้งสองฝั่ง (API และ Spark) ใช้โฟลเดอร์ `./services/spark` ที่ mount เป็น `/opt/spark-apps` ร่วมกัน (`docker-compose.yml:150,185,251`)

---

## 1. ภาพรวมโครงหน้า (สิ่งที่เห็นเมื่อเปิดหน้า)

หน้านี้มี 2 ส่วนใหญ่:
1. **ส่วนบน (เห็นทันที)** — ปุ่ม "บันทึกกฎ" + การ์ดกฎ 3 ใบ + ตารางสรุป — เป็นโหมดสาธิต (demo) ที่ใช้ชุดข้อมูลนักศึกษา `student_course_scores` (คอลัมน์ score / study_hours / student_id+course+semester ถูกฮาร์ดโค้ดในฝั่ง API)
2. **ส่วน "ตั้งค่าขั้นสูง: ตารางอื่น, AI, Governance"** — เป็นกล่องพับ `<details>` **ปิดอยู่ตั้งแต่แรก** (`RulesConfig.jsx:875`) ข้างในมี 5 แท็บ: กฎรายตาราง / ข้อเสนอจาก AI / ตั้งค่า AI / แจ้งแก้ต้นทาง / มาตรฐานข้อมูล — **ส่วนนี้คือส่วนที่เชื่อมกับ Spark Pipeline จริง**

> ข้อควรบอกอาจารย์ให้ตรง: การ์ด 3 ใบด้านบนทำงานกับ API+pandas บนไฟล์ CSV ตัวอย่าง ไม่ได้ส่งกฎไปให้ Spark อ่าน (ค้นทั้ง `services/spark` ไม่พบการอ้างถึง `whitebox` / `workflow_state` เลย) ส่วนกฎที่ Spark ใช้จริงอยู่ในแท็บ "กฎรายตาราง" ในกล่องพับ

---

## 2. ส่วนบน: การ์ดกฎ 3 ใบ (Interactive Rule Workspace)

- **[หัวหน้า PageHeader "Expectations & Alerts" · ขั้นที่ 2/4]** → (1) ไม่มีการกด (2) หัวข้อ/คำอธิบาย (3) `PageHeader` อ่านจาก `config/pages.js:11` (4) แสดงอย่างเดียว 🔴
- **[ปุ่ม "บันทึกกฎ"]** (`RulesConfig.jsx:654`, handler `:207-222`) → (1) ส่งค่าปัจจุบัน 11 ค่าไป API แล้วโชว์ข้อความ "ยืนยันและประมวลผลกฎบน N แถวสำเร็จ: Clean … | Review … | Quarantine …" และปุ่มเปลี่ยนเป็น "บันทึกแล้ว HH:MM" (2) ปุ่มยืนยัน (3) เรียก `syncWbState()` = `POST /api/v1/whitebox/state` (`:161`) → `whitebox.py:1442 update_workflow_state` → `_recompute_interactive_state()` (`:1271-1434`) คำนวณด้วย pandas บนทุกแถวของ `dirty_dataset.csv` แล้วเขียนไฟล์ clean/review/quarantine CSV (4) เวลาที่โชว์มาจากนาฬิกาเบราว์เซอร์ (`:211`) ไม่ใช่เวลาเซิร์ฟเวอร์ 🟢
  - ข้อควรระวัง: ถ้า API ล่ม `syncWbState` จะกลืน error (`:172-174` catch เงียบ) แล้วคืน null — ปุ่มก็ยังตั้งเวลา "บันทึกแล้ว" และขึ้นข้อความสำเร็จด้วยตัวเลขเก่า (`:210-216`) และ toast นี้ถูกวาง **ข้างในกล่องพับที่ปิดอยู่** (`:880-884`) ผู้ใช้จึงมักไม่เห็นข้อความ
  - ปุ่มไม่ได้ส่ง `confirm_rules` ดังนั้นฟิลด์ `confirmed_at` ฝั่ง server (`whitebox.py:1471-1472`) ไม่ถูกตั้งจากปุ่มนี้ — ค่าถูกบันทึกอัตโนมัติอยู่แล้วทุกครั้งที่แก้การ์ด
- **[บรรทัด "ชุดข้อมูล <ชื่อ> · N แถว"]** (`:663-665`) → (1) แสดงอย่างเดียว (2) ชื่อชุดข้อมูล + จำนวนแถว (3) `GET /whitebox/state` (`:185`) และ `GET /whitebox/profile` (`:179`) → `whitebox.py:324 get_dataset_profile` (อ่าน CSV, คำนวณ null/min/max/quantile) (4) ชื่อเริ่มต้น `student_course_scores`, ก่อนโหลดเสร็จ UI ใช้ค่า fallback ฮาร์ดโค้ด `"student_course_scores"` (`:141`) 🟢
- **[การ์ดกฎที่ 1 "ช่วงคะแนนและค่าว่าง"]** (`:670-729`) → (1) เป็นการ์ดกฎ score อยู่ในช่วง min–max และห้าม NULL (2) subtitle แสดง `score BETWEEN min AND max AND NOT NULL` จากค่า state (3) เมื่อแก้ค่าจะยิง POST state ทุกครั้งที่พิมพ์ (`:707,720`) — ไม่มี debounce (ทุกการกดตัวเลขทำให้ API ประมวลผลทั้งไฟล์ใหม่) (4) ผลคือแถวถูกแยกเป็น Quarantine (`whitebox.py:1321-1322,1353-1355`) ตามช่วงที่ตั้ง
  - ชื่อ/ข้อความการ์ด 🔴 (ฮาร์ดโค้ด); **วงแหวนเปอร์เซ็นต์ในการ์ด = 95 / 99 / 99 ค่าคงที่** (`:674,737,785`) ไม่ได้มาจากข้อมูล 🔴
  - **[ช่อง Active (ติ๊ก) + "(N failing rows)"]** → ติ๊กเปิด/ปิดกฎด้วย `rule1_confirmed` (`:685-689`) ตัวเลข N = `gate1_quarantined` = (ค่าว่างที่ถูกกัก) + (นอกช่วง) (`whitebox.py:1401`) 🟢
  - **[ปรับค่า → คะแนนต่ำสุด/สูงสุด]** → ค่าบันทึกใน state `min_score`/`max_score` 🟢
- **[การ์ดกฎที่ 2 "ห้ามคีย์ซ้ำ"]** (`:732-777`) → (1) กฎคีย์ซ้ำ (2) ตัวเลือก "คีย์หลัก" มีแค่ 2 ตัวเลือกฮาร์ดโค้ด `student_id + course + semester` / `record_id` (`:770-771`) 🔴 (3) ถ้าชื่อคอลัมน์ไม่อยู่ในไฟล์ ระบบเงียบ ๆ ถอยกลับไปใช้คีย์ 3 คอลัมน์เดิม (`whitebox.py:1303-1305`) (4) แถวซ้ำ (เก็บแถวแรก) ถูกกัก — จำนวนใน "(N duplicate rows)" = `gate2_quarantined` 🟢
- **[การ์ดกฎที่ 3 "ค่าผิดปกติ" (Tukey IQR)]** (`:780-828`) → (1) เลือก k = 3.0 หรือ 1.5 (2) แสดงเกณฑ์ `study_hours <= Q3 + k × IQR` (3) POST state พร้อม `tukey_multiplier` (`:817`); server คำนวณเส้นแบ่งเอง `upper = Q3 + k×IQR` (`whitebox.py:1332`) (4) ค่าที่เกินส่งเข้า Review (ไม่กัก) "(N review rows)" = `initial_outlier_count` 🟢
  - ข้อความในตัวเลือก "(> 12.0h)" / "(> 9.0h)" และการตั้ง `custom_upper_fence` = 12.0 / 9.0 ที่ฝั่ง UI (`:815,821-822`) เป็นตัวเลขคงที่ 🔴 — server **เขียนทับด้วยค่าที่คำนวณจริง** (`whitebox.py:1333`) จึงอาจไม่ตรงกับข้อความที่เห็น
- **[ค่าที่ไม่มีช่องกรอกในหน้า แต่ถูกส่งไปทุกครั้ง]** `null_policy`, `max_null_pct`, `dedup_strategy` (`:129-132,151-154`) → ไม่มีปุ่ม/ช่องให้ผู้ใช้เปลี่ยน ส่งค่าเริ่มต้น `strict_0`, 5.0, `keep_first_quarantine` ไปเสมอ ⚪
- **[ตารางสรุป 3 แถว: กฎ / คอลัมน์ / เมื่อไม่ผ่าน / แถวที่ติด / ผ่าน]** (`:833-866`)
  - ชื่อกฎ, คอลัมน์ (ยกเว้นแถวที่ 2), "กักกัน/ส่ง Review" เป็นข้อความตายตัว 🔴
  - คอลัมน์ "แถวที่ติด" = `gate1_quarantined`, `gate2_quarantined`, `initial_outlier_count` จาก `GET/POST /whitebox/state` 🟢
  - คอลัมน์ "ผ่าน" = `(total_rows − แถวที่ติด) / total_rows × 100` คำนวณในเบราว์เซอร์ (`:645-646`) 🟡 (หมายเหตุ: คำนวณแยกต่อกฎ ไม่ได้หักซ้ำระหว่างกฎ)
- **[ลิงก์ "ถัดไป: Jobs & Pipelines →"]** (`:870`, `NextStepLink`) → พาไป `/pipeline` ตามลำดับขั้นใน `pages.js` 🔴
- **การใช้ผลต่อ:** ผลของ state นี้ถูกอ่านต่อโดยหน้า Pipeline (`Pipeline.jsx:115,171`), Dashboard (`Dashboard.jsx:100`) และ Export (`DataExport.jsx:32` ผ่าน `/whitebox/preview-zone`) — เป็นสาย demo/audit ที่คำนวณด้วย pandas ใน API ไม่ใช่ Spark
- ข้อสังเกตเพิ่ม: `GET /whitebox/state` ไม่ต้องล็อกอินและทุกครั้งที่เรียกจะ **คำนวณใหม่และเขียนไฟล์ CSV ทับ** (`whitebox.py:1437-1439,1390-1396`)

---

## 3. กล่องพับ "ตั้งค่าขั้นสูง" — โครงแท็บ

- **[Toast ผลการทำงาน]** (`:880-884`) → แสดงข้อความสำเร็จ/ผิดพลาดจากการกดปุ่มต่าง ๆ 🟡 (ข้อความประกอบจากผลลัพธ์ของแต่ละ API)
- **[แถบแท็บ 5 แท็บ]** (`:887-911`) → สลับแท็บ; เปิดด้วย `?tab=` ใน URL ได้ (`:74-81`)
  - ป้ายตัวเลขแท็บ "ข้อเสนอจาก AI" = `proposals.length` 🟢 + ป้ายสีส้ม "ตัวอย่าง" เมื่อเป็นข้อมูลตัวอย่าง (`:894`) 🔴
  - ป้ายแท็บ "แจ้งแก้ต้นทาง" = จำนวนตั๋วสถานะ OPEN 🟡 และ "มาตรฐานข้อมูล" = จำนวนคิว 🟡 — แต่ข้อมูลทั้งสองจะถูกโหลด **ก็ต่อเมื่อเข้าแท็บนั้นแล้ว** (`:383-390`) ก่อนหน้านั้นป้ายจะไม่ขึ้น

---

## 4. แท็บ "กฎรายตาราง" (หัวใจที่เชื่อมกับ Spark จริง)

### 4.1 รายการตาราง (Table Catalogs, ซ้ายมือ)
- **[รายชื่อตาราง]** (`:918-955`) → (1) คลิกเลือกตาราง (2) รายชื่อตารางทั้งหมดในระบบ (3) `GET /export/tables` (`:430`) → `data_export.py:318` ถาม HDFS NameNode (`/webhdfs/v1/data/raw|active|quarantine`) รวมชื่อโฟลเดอร์ (4) เรียงตามตัวอักษร ตารางแรกถูกเลือกอัตโนมัติ (`:434-437`) 🟢 — error ฝั่ง API ถูกกลืนเงียบ (`data_export.py:336-337`) ถ้า HDFS ล่มจะเห็นรายการว่างโดยไม่มีข้อความ
- **[ปุ่มถังขยะข้างชื่อตาราง]** (`:933-950`, handler `:446-467`) → (1) ถาม `window.confirm` แล้ว **ลบชุดข้อมูลถาวร** (2) — (3) `DELETE /export/tables/{t}` → `data_export.py:362` ลบโฟลเดอร์ HDFS raw/active/quarantine/archive, ลบเอกสารของตารางนั้นใน ES 8 index + `sdoqap_rules_registry` + `sdoqap_schema_registry`, ลบ key ออกจาก `rules_config.json` และ `schema_registry.json` (4) ย้อนกลับไม่ได้; ถ้าลบส่วนใดพลาด API แค่ `print` แล้วยังตอบ success (`data_export.py:379-424`) 🟢

### 4.2 ส่วนหัวและแท็บย่อย
- **["Rules Control Workspace: <ตาราง>"] + ปุ่ม Rules Editor / YAML DSL Export / Column Profiler** (`:961-967`) → สลับมุมมอง 🟢 (ชื่อตารางที่เลือก) เมื่อเลือกตารางระบบดึงกฎ+โปรไฟล์ให้ทันที (`:512-517`)
- **[โหลดกฎ]** → `GET /rules/{table}` (`:478`) → `dynamic_rules.py:758`: `_load_rules_config()` อ่านจาก ES `sdoqap_rules_registry` ก่อน ถ้าไม่มี index ใช้ไฟล์ `rules_config.json` (`:81-96`) แล้ว merge ค่า `_default` + ค่าเฉพาะตาราง (`_merge_rules :194-209`) ส่งกลับเป็น `effective_rules` 🟢 (endpoint นี้ไม่ต้องล็อกอิน)

### 4.3 แท็บย่อย Rules Editor (ฟอร์มกฎ)

| ช่องในฟอร์ม | บันทึกเป็น key | Spark ใช้จริงหรือไม่ | ป้าย |
|---|---|---|---|
| Quality Validation Mode (strict/adaptive) | `quality_score_threshold.mode` | ใช้จริง — adaptive = `max(ค่าเฉลี่ย − SD ของ 15 รันล่าสุด, min_value)` (`dynamic_rules_engine.py:249-335, 400-419`) ถ้ามีประวัติ <2 รัน ใช้ base_value; strict = ใช้ base_value ตรง ๆ (`spark_quality_engine.py:1604`) | 🟢 |
| Base Target Score (%) 0–100 | `quality_score_threshold.base_value` | ใช้จริง — เป็นเกณฑ์ที่ถ้า quality_score ต่ำกว่าจะส่ง alert วิกฤต (`sdoqap/stages/metrics.py:177-182`) และบันทึกเป็น `effective_quality_threshold` ให้ n8n ใช้ต่อ (`stages/report.py:39`) | 🟢 |
| Data Freshness Mode + Max Allowed Delay (ชม.) | `freshness_threshold_hours.mode/base_value` | **ไม่มีการนำไปใช้ตัดสิน** — Spark อ่านเลข `base_value` (`spark_quality_engine.py:1605`) แล้วเพียงบันทึกลงรายงานรัน (`stages/report.py:40`); ค้นทั้ง Spark/API/UI ไม่พบจุดที่เทียบ lag กับเกณฑ์นี้เพื่อเตือน/กัก และโหมด adaptive ของ freshness ไม่มีโค้ดคำนวณ (`apply_adaptive_rules` ทำเฉพาะ quality/null/value_range) | ⚪ |
| Null Checks Constraint Mode (strict/adaptive) | `null_checks.mode` | แทบไม่มีผล — strict ทำให้คอลัมน์ "Tolerance Limit" ในโปรไฟล์เป็น 0% (`sdoqap/common/profile.py:10-11`) เท่านั้น; โหมด adaptive ต้องมี DataFrame แต่ engine ส่ง `df=None` (`spark_quality_engine.py:1597`) จึงไม่เคยทำงาน — คอมเมนต์ในโค้ดยอมรับว่ายังไม่ได้ทำ (`:1591-1594`) ไม่มีแถวใดถูกกักเพราะ tolerance | ⚪ |
| Outliers (IQR) Range Mode (off/auto/adaptive) | `value_range.mode` | ใช้จริง — auto/adaptive ⇒ คำนวณรั้ว IQR ของคอลัมน์ตัวเลข (Integer/Double) แล้วกักแถวนอกรั้ว (`stages/anomaly.py:14-37`); off ⇒ ปิด; auto กับ adaptive ทำงานเหมือนกัน; ตัวคูณมาจาก `iqr_multiplier` (ค่าเริ่มต้น 1.5) ซึ่งฟอร์มนี้ไม่มีช่องให้แก้ | 🟢 |
| Enable AI Rule Advisor (ติ๊ก) | `ai_advisor.enabled` | ใช้จริง — `stages/advisory.py:19-20` เป็นตัวเปิด/ปิดการวิเคราะห์ AI หลังรัน | 🟢 |
| Model Selector (ข้อความ) | `ai_advisor.model` | **ไม่มีโค้ดอ่านค่านี้** — `advisory.py` อ่านเฉพาะ enabled/trigger/max_rows_to_analyze/confidence_threshold; โมเดลจริงมาจากแท็บ "ตั้งค่า AI" (`sdoqap_settings`) หรือ env (`ai_rule_advisor.py:171-190`) | ⚪ |

- **[ปุ่ม "Save Rule Overrides"]** (`:1125`, handler `:541-573`) → (1) เปิดกล่องยืนยัน (แสดง diff ก่อน→หลังเฉพาะ 2 ค่า: Base Target Score และ Max Allowed Delay `:524-538`) แล้วยิง `PUT /rules/{table}` (`:554`) (2) ส่งกฎ **ทั้งชุด effective rules (รวมค่า default ที่ผสมแล้ว)** เป็นตัว body (`:481,557`) ดังนั้นบันทึกครั้งแรกจะคัดลอกค่า default ทั้งหมดลงเป็น override ของตารางนั้น (3) `dynamic_rules.py:804`: ต้องล็อกอิน → ตรวจช่วง 0–100 / ไม่ติดลบ (`:782-801`) → `existing.update(body)` → `_save_rules_config` (`:99-191`): ล็อกไฟล์ + สำรองไฟล์เป็น `backups/rules_config_<เวลา>.json` เก็บ 10 ชุดล่าสุด + เขียน `rules_config.json` + `es.index("sdoqap_rules_registry", id=<table>)` → เขียน audit log (ใคร/เมื่อไร/ก่อน-หลัง) ที่ `sdoqap_rules_audit_log` (`:841-849`) (4) Spark จะใช้กฎใหม่ **ในรอบรันถัดไป** (ไม่ใช่ทันที แม้กล่องยืนยันเขียนว่า "immediately") 🟢
  - ความเสี่ยง: ถ้าเขียนไฟล์สำเร็จแต่ sync ES ล้มเหลว API แค่ log เตือนแล้วตอบ "updated" (`dynamic_rules.py:184-191`) ขณะที่ Spark อ่าน ES ก่อน จึงอาจได้กฎเก่า
  - ไม่มีช่องแก้ `range_checks` / `remediation_rules` / `induced` ในฟอร์มนี้ (ดูหัวข้อ 8)

### 4.4 แท็บย่อย YAML DSL Export
- **[กล่องข้อความ YAML]** (`:1135-1151`) → (1) แสดงอย่างเดียว (2) ไฟล์ YAML ที่แปลงจากกฎ (3) ฟังก์ชัน `generateYamlDsl` (`:10-54`) ทำในเบราว์เซอร์ จากเฉพาะ `remediation_rules` ชนิด semantic_standardize / auto_strategy(clean) / cast — กฎ fillna/calculate/threshold ไม่ถูกส่งออก (4) 🟡
  - ค่า `version: 1.0`, `execution_id: auto`, `dry_run: false` (`:12-16`) เป็นข้อความตายตัว 🔴
  - ข้อความอธิบายบอกให้นำไปใช้ผ่าน `SemanticCleaner(config='rules.yaml')` (`:1133`) — ค้นแล้ว **ไม่พบคลาส `SemanticCleaner` และไม่มีโค้ดที่อ่านไฟล์ rules YAML** (YAML ถูกใช้แค่ `config/hdfs_config.yaml`, `spark_quality_engine.py:27-35`) ⚪
- **[ปุ่ม Copy YAML]** (`:1153-1163`) → คัดลอกลงคลิปบอร์ดด้วย `navigator.clipboard` (ไม่มี catch ถ้าถูกบล็อกจะไม่แจ้ง) 🟡
- **[ปุ่ม Download DSL Config]** (`:1165-1181`) → สร้างไฟล์ `<table>_rules.yaml` ในเบราว์เซอร์ ไม่ผ่านเซิร์ฟเวอร์ ไม่มีที่ไหนเก็บ 🟡
- **Import กฎ:** ตรวจไม่พบในโค้ด (ไม่มีปุ่มนำเข้า YAML/JSON ในหน้านี้) — มีเพียง `POST /standardize/rollback` ที่ API (`standardize.py:201`) ซึ่ง UI ไม่เรียก

### 4.5 แท็บย่อย Column Profiler
- **[ตาราง Null Rates Profile]** (`:1195-1223`) → (1) แสดงอย่างเดียว (2) อัตรา null ปัจจุบัน / ค่า tolerance / คอลัมน์นั้นเป็นคีย์หลักไหม (3) `GET /rules/profiles/{t}` (`:500`) → `dynamic_rules.py:318`: ดึงเอกสาร quality run ล่าสุดของตารางจาก ES `sdoqap_quality_runs` ฟิลด์ `null_profile` ที่ Spark เขียนตอนสร้างรายงาน (`sdoqap/common/profile.py:17-41`) (4) null_rate = จำนวนค่าว่าง (รวม NaN) ÷ จำนวนแถวทั้งหมด (`profile.py:36`) แสดง ×100 🟢; tolerance = `default_tolerance`/override (`profile.py:8-14`) 🟢
- **[ตาราง Numeric IQR Bounds]** (`:1225-1251`) → Q1, Q3, รั้วล่าง–บน จาก `value_range_profile` ใน quality run (คำนวณด้วย `approxQuantile` ความคลาด 1% — `dynamic_rules_engine.py:185-247`) 🟢
- **[แถบ Run ID | Timestamp]** (`:1191-1193`) 🟢
- **[ข้อความ "No profiled logs active…"]** → แสดงเมื่อไม่มีข้อมูล 🔴 — หมายเหตุ: ถ้า API ถอยไปใช้แหล่งสำรอง `sdoqap_dynamic_rules_log` โครงสร้าง key ต่างกัน (`null_profiles`/`value_range_profiles`, `dynamic_rules.py:372-373`) UI อ่านเฉพาะ `null_profile`/`value_ranges` (`:1189`) จึงจะขึ้นว่าไม่มีข้อมูล

---

## 5. แท็บ "ข้อเสนอจาก AI" (AI Rule Proposals)

ข้อเสนอมาจากไหน (verified):
- **Spark อัตโนมัติหลังรัน:** `stages/advisory.py` ทำงานเมื่อ `ai_advisor.enabled` และ (trigger=`always` หรือพบ anomaly หรือคะแนน < เกณฑ์−15 หรือโปรไฟล์ drift) (`advisory.py:19-53`) เก็บเฉพาะผลที่ความมั่นใจ ≥ `confidence_threshold` (ค่าเริ่มต้น 0.7) (`:109-122`); ถ้า anomaly และกัก ≥10 แถวจะเรียกสร้างกฎจาก Decision Tree ด้วย (`:125`)
- **ปุ่มบนหน้านี้:** "วิเคราะห์ด้วย AI" (หัวข้อล่าง)
- **ลำดับเครื่องมือวิเคราะห์ (`ai_rule_advisor.py:153-258`):** (1) **Groq LLM** ถ้ามี API key + เปิดใช้ (จาก ES `sdoqap_settings` หรือ env `GROQ_API_KEY`) → (2) **Ollama** (โมเดลในเครื่อง, `OLLAMA_URL` ค่าเริ่มต้น `http://ollama:11434`, `qwen2.5:3b` — ใช้ได้เมื่อรัน compose profile "ai", `:96-105`) → (3) **ตัวช่วยแบบกฎคงที่ (heuristic)** `local_heuristic_v2` (`:392-680`) ไม่ใช่ LLM; ป้ายบนการ์ดข้อเสนอบอกแหล่งที่มาให้เห็น (`RulesConfig.jsx:61-70`)
- ก่อนส่งแถวไปให้ LLM จะแทนค่าคอลัมน์ที่เป็นตัวระบุ (id/name/email/phone/address/ssn) และ PK ด้วย `<redacted>` (`ai_rule_advisor.py:258-274`)

รายการบนหน้า:
- **[ตัวเลือกตาราง + ปุ่ม "วิเคราะห์ด้วย AI"]** (`:1272-1278`, handler `:605-625`) → (1) สั่งวิเคราะห์ตารางที่เลือก (2) — (3) `POST /rules/ai-proposals/generate?table=` → `dynamic_rules.py:649`: ต้องล็อกอิน; อ่านแถว quarantine ตัวอย่าง ≤20 แถวจาก `/data/quarantine/<table>` (`:242-251`) — **ถ้าไม่มีแถวถูกกักจะตอบ 404 "ไม่มีอะไรให้วิเคราะห์"** (`:656-659`); สร้าง context (PK, คะแนนล่าสุดจาก `sdoqap_quality_runs`) → เรียก `AIRuleAdvisor.ai_analyze_quarantined_sample` (โค้ด Spark ตัวเดียวกัน) → บันทึกเป็นเอกสาร `status=PROPOSED` ใน ES `sdoqap_ai_rule_proposals` (`ai_rule_advisor.py:1079-1127`) พร้อมสร้างตั๋วแจ้งต้นทางถ้ามี (4) ข้อความสำเร็จแสดงตัววิเคราะห์ + ความมั่นใจ (`:615`) — ยังไม่แก้กฎใด ๆ 🟢
  - ค่าความมั่นใจของ LLM เป็นตัวเลขที่ LLM รายงานเอง และถ้าเป็น 0/ไม่ส่งมาโค้ดใช้ 0.8 แทน (`ai_rule_advisor.py:225` `float(... or 0.8)`) — ไม่ได้ผ่านการตรวจสอบจากภายนอก
- **[รายการ "Advisor Proposals" ซ้าย]** (`:1291-1328`) → (1) คลิกดูรายละเอียด (2) รายการข้อเสนอสถานะ PROPOSED สูงสุด 100 รายการ เรียงใหม่→เก่า (3) `useApi("/rules/ai-proposals", refresh 10 วินาที)` (`:235`) → `dynamic_rules.py:422` อ่าน ES `sdoqap_ai_rule_proposals` (4) แต่ละการ์ดโชว์ชื่อตาราง, ความมั่นใจ %, ตัววิเคราะห์, เวลา (เฉพาะเวลา ไม่มีวันที่) 🟢
  - **Fallback ตัวอย่างฮาร์ดโค้ด:** ถ้า ES ไม่มีข้อเสนอ **หรือ ES error** (ถูกกลืนที่ `dynamic_rules.py:451-452`) API จะส่งข้อเสนอตัวอย่าง 3 รายการที่เขียนไว้ในโค้ด (`:383-419`, วันที่ 2026-09-23, ตาราง `student_course_scores`/`users`) พร้อม `is_example=true` — UI แสดงป้ายส้ม "แสดงตัวอย่าง" (`:1286-1290`) 🔴 ผู้ใช้แยกไม่ออกว่า "ยังไม่มีข้อเสนอ" กับ "ES พัง"
- **[แผงรายละเอียดข้อเสนอ ขวา]** (`:1334-1402`) → แสดง Root Cause, คำอธิบาย, รายการกฎที่แนะนำ (คอลัมน์/ชนิด/พารามิเตอร์/เหตุผล), เกณฑ์คะแนนที่แนะนำ — ข้อมูลจาก `analysis_result` ของเอกสารใน ES 🟢 (ตัวอย่าง fallback มีโครงสร้างต่าง จะเห็นแค่ข้อความ `reasoning`)
- **[ปุ่ม "Approve & Merge"]** (`:1385-1391`, handler `:576-602`) → (1) เปิดกล่องยืนยัน แล้ว `POST /rules/ai-proposals/{id}/approve` (`:585`) (2) — (3) `dynamic_rules.py:472`: ต้องล็อกอิน; ล็อกแบบ optimistic (เปลี่ยน PROPOSED→APPROVED + `approved_at` `:511-534`) แล้ว merge `suggested_rules` เข้ากฎตารางนั้น (`:536-636`) ผ่านด่านป้องกัน: เกณฑ์คะแนนห้ามต่ำกว่า 70% และห้ามลดเกิน 10% จากค่าปัจจุบัน (`:566-584`), ห้ามปิดเช็ก `null_primary_key`/`duplicate_check` (`:592-594`), ค่า tolerance ของ null จำกัดไม่เกิน 0.30 (`:602-603`), action `escalate` ถูกข้าม; กฎจาก Decision Tree บันทึกลง `induced` (`:609-619`) → `_save_rules_config` (ไฟล์ + ES) (4) 🟢
  - ข้อบกพร่องที่ต้องรู้: (ก) กฎที่ไม่มี `rule_path`+`value` (เช่นรูปแบบ `column/rule_type/params` ที่ prompt ของ LLM สั่งให้ตอบ — `ai_rule_advisor.py:~320-327`) **ถูกข้ามเงียบ ๆ** สถานะเป็น APPROVED แต่ไม่มีกฎเปลี่ยน ทั้งที่ UI ขึ้นว่า "Config updated" (`:588`) (ข) ถ้าผิด guardrail ระบบแค่ `print` ไม่แจ้งผู้ใช้ (`:568,583,593`) (ค) ถ้า merge พลาดก็ log เตือนแล้วตอบ approved (`:629-634`)
  - เส้นทางกฎที่ heuristic เสนอ vs Spark อ่านจริง: `quality_score_threshold.base_value` ✔ ใช้จริง; `induced.*` ✔ ใช้จริง (`anomaly.py:78-117`); `null_checks.column_overrides.*.tolerance` ใช้แค่ตอนแสดงโปรไฟล์; `value_range.column_overrides.*.iqr_multiplier` ⚪ ไม่มีโค้ด Spark อ่าน (`anomaly.py` อ่านเฉพาะ `iqr_multiplier` ระดับบน); `duplicate_check.enabled` ⚪ ไม่มีโค้ดอ่าน
  - เมื่อใช้กับตัวอย่าง fallback: ไม่เปลี่ยนกฎใด เปลี่ยนแค่ธงในหน่วยความจำของ process API (`:477-481`) และหายเมื่อรีสตาร์ท
- **[ปุ่ม "Reject Proposal"]** (`:1392-1399`) → `POST …/{id}/reject` → ตั้งสถานะ REJECTED ไม่แตะกฎ (`dynamic_rules.py:686-751`) 🟢; heuristic รอบถัดไปอ่านข้อเสนอที่เคยถูกปฏิเสธเพื่อไม่เสนอซ้ำ (`ai_rule_advisor.py:412-425`)
- **ปุ่ม `/ai-proposals/reset`** (คืนตัวอย่าง) มีใน API (`dynamic_rules.py:639`) แต่ UI ไม่มีปุ่มเรียก

---

## 6. แท็บ "ตั้งค่า AI" (Global AI Advisor Settings)

- **[ช่อง Groq API Auth Key]** (`:1421-1429`) → (1) พิมพ์คีย์ (2) โหลดแล้วเห็นคีย์แบบ mask (`gsk_xx...yyyy`) (3) `GET /system/settings` (`:251`) → `system.py:313` อ่าน ES `sdoqap_settings/global` (ถ้าไม่มีใช้ env `GROQ_API_KEY`) (4) 🟢 — ถ้าไม่แก้ช่องที่เป็นค่า mask API จะเก็บคีย์เดิมไว้ (`system.py:365-366`)
- **[Model Version]** (`:1431-1437`) → ตัวเลือก 2 ค่า (gpt-oss-120b / 20b) ฮาร์ดโค้ดในโค้ด ไม่ดึงรายการโมเดลจาก Groq 🔴
- **[Enable LLM advisor checks]** (`:1439-1451`) → เปิด/ปิด LLM; ถ้าปิด ระบบถอยไป Ollama/heuristic 🟢
- **[ปุ่ม Save Settings]** (`:1453`, handler `:392-424`) → (1) ยืนยัน แล้ว `POST /system/settings` (2) — (3) `system.py:353`: ต้องล็อกอิน; **ถ้าเปิดใช้ ระบบทดสอบเรียก Groq จริง 1 ครั้ง (max_tokens=5) เพื่อตรวจคีย์** (`:374-403`) ถ้าไม่ผ่านตอบ 400 พร้อมสาเหตุ; จากนั้นบันทึกเอกสาร `{groq_api_key, groq_model, groq_enabled}` ลง ES `sdoqap_settings` id `global` (`:405-409`) (4) Spark advisor อ่านค่านี้ทุกครั้งที่วิเคราะห์ (`ai_rule_advisor.py:171-185`) 🟢 — ข้อควรรู้: **คีย์ถูกเก็บเป็นข้อความธรรมดาใน ES** (ฝั่งอ่านส่งคืนแบบ mask)
- ไม่มีช่องตั้งค่า Ollama ในหน้านี้ (ตั้งผ่าน env เท่านั้น: `OLLAMA_URL`, `OLLAMA_MODEL`) ⚪ (ไม่มี UI)
- ข้อความอธิบายหัวแท็บเป็นข้อความตายตัว 🔴

---

## 7. แท็บ "แจ้งแก้ต้นทาง" (Upstream Remediation Tickets)

ตั๋วเกิดจาก: AI advisor (LLM หรือ heuristic) ตอบฟิลด์ `remediation_ticket` → `log_remediation_ticket_to_es` สร้างเอกสาร id `tkt_<run_id>_<table>` สถานะ OPEN ใน ES `sdoqap_upstream_remediations` (`ai_rule_advisor.py:1122-1160`)

- **[ปุ่ม Refresh Logs]** (`:1491`) → โหลดตั๋วใหม่ `GET /system/remediations` → `system.py:449` ดึง ≤100 รายการเรียงใหม่→เก่า (ไม่มี index ⇒ คืนรายการว่าง) 🟢 (ไม่ต้องล็อกอิน)
- **[การ์ดสถิติ 4 ใบ]** (`:1496-1520`) — คำนวณในเบราว์เซอร์ทั้งหมด 🟡
  - Active Open Tickets = จำนวนตั๋ว status=OPEN (แยก critical/warning ตาม severity)
  - Resolution Rate = `RESOLVED ÷ ตั๋วทั้งหมด × 100` (`:1464`)
  - Highest Drift Inflow = `target_system` ที่มีตั๋ว OPEN มากสุด (`:1468-1481`)
  - Upstream Compliance = "ACTION REQ" ถ้ามี OPEN มากกว่า 0 ไม่งั้น "COMPLIANT"
  - การ์ดทั้งชุดซ่อนเมื่อไม่มีตั๋วเลย
- **[ตารางตั๋ว]** (`:1533-1584`) → คอลัมน์ Ticket ID/เวลา, Table, Severity, Upstream Source, Governance Action Required, Status จากเอกสารใน ES 🟢; แบ่งหน้า 8 รายการ/หน้าที่ฝั่ง UI (`:89`) 🟡
- **[ปุ่ม "Close Ticket"]** (`:1569-1576`, handler `:280-300`) → (1) ยืนยันแล้ว `POST /system/remediations/{id}/resolve` → `system.py:469` ต้องล็อกอิน เปลี่ยน status=RESOLVED + `resolved_at` ใน ES (2) — (3) — (4) **เป็นแค่การปิดบันทึกภายใน ไม่ได้ส่งข้อความหรือเรียกระบบต้นทางใด ๆ** 🟢; ถ้า API ตอบผิดพลาด UI ไม่แสดงอะไรเลย (`:290-292` ไม่มี else, catch แค่ console)
- ข้อความ "No active remediation tickets found in HDFS log registry" (`:1528`) 🔴 ระบุผิด: ตั๋วเก็บใน Elasticsearch ไม่ใช่ HDFS
- การแจ้งเตือนตั๋ว: n8n ทุก 1 ชั่วโมงดึงตั๋วที่สร้างใน 1 ชม. ล่าสุดแล้วยิง `POST /api/v1/system/alert` (`infra/n8n/ingestion_workflow.json`: โหนด "Every Hour" → "Fetch Recent Remediations" → "Route Remediation Alert") — ไปต่อที่ `alert_router` (ดูหัวข้อ 9)

---

## 8. แท็บ "มาตรฐานข้อมูล" (Standardization & Auto-Learning)

คิวนี้เกิดจาก: ตอนรัน Spark ในกฎ `semantic_standardize` แต่ละค่าดิบจะถูกให้คะแนนความคล้ายกับหมวดที่รู้จัก (`spark_quality_engine.py:687-815`): คะแนน = 1.0 → ผ่าน; **>0.90 → เรียนรู้และเขียนลงกฎเองอัตโนมัติ ไม่ผ่านคน** (`:760-762`); 0.60–0.90 → เข้าคิวพร้อมหมวดที่แนะนำ (`:763-783`); ≤0.60 → เข้าคิวพร้อมหมวด "อื่นๆ" (`:784-801`); priority = ความถี่ × (1 − คะแนน) เก็บใน ES `sdoqap_unmapped_terms` สถานะ PENDING_REVIEW คะแนนคือ "ความคล้ายข้อความ" (containment 0.4 + token overlap + bigram cosine 0.3 — `sdoqap/semantic/similarity.py:1-3`) **ไม่ใช่โมเดล AI** (สอดคล้องกับ InfoHint ในหัวตาราง `:1636`)

- **[ปุ่ม Refresh Queue]** (`:1613`) → `GET /standardize/review-queue` → `standardize.py:16` ดึง ≤100 รายการ PENDING_REVIEW เรียงตาม priority 🟢 (ไม่ต้องล็อกอิน, ไม่กรองตามตาราง)
- **[ตารางคิว]** (`:1631-1734`): Source Detail (ตาราง/คอลัมน์), Raw Value, คำแนะนำ (`suggested_category` หรือ "อื่นๆ" ถ้าว่าง), Confidence (`×100`), Frequency, Priority (สีแดงเมื่อ >50) 🟢; แบ่งหน้า 8/หน้า 🟡
- **[ปุ่ม Approve]** (`:1703-1709`, handler `:317-337`) → (1) ยืนยันแล้ว `POST …/{id}/approve` → `standardize.py:70` (2) — (3) `_update_memory_registry` (`:37-68`): หา/สร้างกฎ `semantic_standardize` ของคอลัมน์นั้นในกฎของตาราง แล้วเพิ่ม `categories[ค่าดิบตัวพิมพ์เล็ก] = หมวดที่อนุมัติ` → `_save_rules_config` (ไฟล์+ES); บันทึกรีวิวใน `sdoqap_mapping_reviews`; ตั้งสถานะ APPROVED แบบมี lock (4) Spark รอบถัดไปจะอ่านกฎนี้ใน DSL (`spark_quality_engine.py:905`) และค่านี้จะตรงแบบ 1.0 ทันที (`:338-339`) 🟢
- **[ปุ่ม Override → ช่องกรอก → Save/Cancel]** (`:1656-1699`, handler `:361-377`) → (1) แทนหมวดที่แนะนำด้วยหมวดที่พิมพ์เอง แล้ว `POST …/{id}/override` body `{approved_category}` (2) — (3) `standardize.py:121` เขียนกฎแบบเดียวกับ Approve แต่ใช้หมวดที่พิมพ์ และบันทึก `is_override` (ใช้คำนวณ "mapping_override_rate" ใน `spark_quality_engine.py:725-745`) (4) 🟢 — ไม่มีการตรวจว่าช่องว่าง/หมวดซ้ำ
- **[ปุ่ม Reject]** (`:1720-1726`) → `POST …/{id}/reject` → ตั้งสถานะ REJECTED ไม่แก้กฎ (`standardize.py:173-199`) 🟢
- ข้อความ "All unmapped categories resolved!…" (`:1626`) 🔴 แสดงเมื่อคิวว่าง
- โค้ดที่ประกาศไว้แต่ไม่ได้ใช้: `overrideModalOpen`, `overrideItemId`, `customCategory` (`:116-118`) และ `showDecisionLoop` (`:123`) — ไม่มี UI ที่ใช้งาน ⚪

---

## 9. ช่องทางแจ้งเตือน (Alert Channels) — ความจริงที่ต้องบอก

- **หน้านี้ไม่มีส่วนตั้งค่า Slack / Email / Webhook เลย** (ค้นทั้ง `RulesConfig.jsx` ไม่พบ) — ชื่อหน้า "Alerts" สื่อถึงเกณฑ์ (threshold) ที่ตั้งในแท็บ "กฎรายตาราง" เท่านั้น
- **อีเมล:** ตรวจไม่พบในโค้ด (ไม่มีโค้ดส่งอีเมล/SMTP ใน services, infra)
- **สายส่งแจ้งเตือนจริงในระบบ:**
  1. **Spark** ส่ง alert เมื่อ (ก) quality_score < เกณฑ์ของตาราง (`stages/metrics.py:177-182`) — ใช้เกณฑ์ที่ตั้งในหน้านี้, (ข) อัตรากักเกิน Z-score 3.0 (`metrics.py:~205`), (ค) schema drift (`stages/schema.py:126,137,237`) → ฟังก์ชัน `send_n8n_alert` (`spark_quality_engine.py:1466-1494`) → `alert_router.route_alert` และยิง POST ไปที่ `N8N_WEBHOOK_URL`
  2. **n8n** ทุก 15 นาที ดึง quality run ล่าสุดที่ `quarantined_records>0` หรือคะแนน < `effective_quality_threshold` แล้วยิง `POST /api/v1/system/alert` (`infra/n8n/ingestion_workflow.json`: โหนด "Filter Low Quality Runs", "Route Quality Alert") — เกณฑ์ที่ตั้งในหน้านี้ไหลมาทางฟิลด์ `effective_quality_threshold` (`stages/report.py:39`)
  3. **Grafana** มีกฎเตือนของตัวเอง `quality_score < 80` และ `quarantined_records > 0` ฮาร์ดโค้ดใน `infra/grafana/provisioning/alerting/alert_rules.yaml:18,57` — **ไม่ขึ้นกับค่าที่ตั้งในหน้านี้** 🔴
- **ปลายทางสุดท้าย `alert_router.py:71-88`** รองรับ **Slack webhook** (`SLACK_WEBHOOK_URL`) และ **LINE Notify** (`LINE_NOTIFY_TOKEN`) เท่านั้น — โค้ดส่งจริงมี (POST ไปยัง Slack/LINE) แต่ **ไม่พบตัวแปรทั้งสองใน `docker-compose.yml`, `.env`, `.env.example`** จึงตามค่าเริ่มต้นจะ **ไม่ส่งออกภายนอก แค่พิมพ์ log** "No external channels configured… Alert logged locally" (`alert_router.py:84-86`) (ยังไม่ได้ตั้งค่าจริงในรีโปนี้) (หมายเหตุจากความรู้ภายนอก ไม่ได้มาจากโค้ด: บริการ LINE Notify ของ LINE ถูกยุติการให้บริการเมื่อ มี.ค. 2025)
- **POST ไป `N8N_WEBHOOK_URL`** ตั้งเป็น `http://n8n:5678` (ไม่มี path, `docker-compose.yml:133,178`) ขณะที่ workflow ที่มีในรีโปมี webhook trigger เดียวคือ path `ingest` — **ตรวจไม่พบในโค้ดว่ามีโหนดรับ alert จาก Spark** จึงยืนยันไม่ได้ว่า n8n รับ
- **Endpoint `POST /api/v1/system/alert`** (`system.py:413-447`) เป็นของจริง ป้องกันด้วย secret `X-Webhook-Secret`/Bearer (`ALERT_WEBHOOK_SECRET`) เรียกโดย n8n/Grafana ไม่ใช่ UI หน้านี้
- สรุป: **ช่องทางแจ้งเตือน = โค้ดจริงที่พร้อมส่ง แต่ยังไม่ได้ตั้งค่าปลายทาง (Slack/LINE) ในรีโป** และหน้า UI ไม่มีที่ให้ตั้งค่า

---

## 10. กฎที่เก็บไว้ที่ไหน และ Spark ใช้เมื่อไร

- **ที่เก็บ:** ES index `sdoqap_rules_registry` (เอกสารละหนึ่งตาราง + `_default`) เป็นแหล่งหลัก; ไฟล์ `services/spark/rules_config.json` เป็นสำเนาที่ API เขียนพร้อมกัน + สำรอง `backups/` 10 ชุด; ถ้า ES ล้ม Spark อ่านไฟล์แทน (`spark_quality_engine.py:1370-1415`)
- **เวลาที่ใช้:** ต้นทุกครั้งที่ `run_quality_check` เริ่มรันตาราง (`spark_quality_engine.py:1582-1605`) → ผสม `_default` + ของตาราง → `apply_adaptive_rules` → ส่งเข้า stage ต่าง ๆ (`sdoqap/pipeline/plan.py`)
- **ตารางว่ากฎ key ไหนมีผลจริงกับ Spark**

| key ในกฎ | แก้ได้ที่ใดในหน้านี้ | Spark ใช้ที่ | สถานะ |
|---|---|---|---|
| `quality_score_threshold` (mode/base_value) | Rules Editor | `spark_quality_engine.py:1604`, `dynamic_rules_engine.py:400` | ใช้จริง |
| `value_range.mode` (+`iqr_multiplier`) | Rules Editor (เฉพาะ mode) | `stages/anomaly.py:14-37` | ใช้จริง |
| `ai_advisor.enabled` | Rules Editor | `stages/advisory.py:19` | ใช้จริง |
| `induced.*` | อนุมัติข้อเสนอ AI | `stages/anomaly.py:78-117` | ใช้จริง |
| `remediation_rules` (semantic_standardize ฯลฯ) | แท็บมาตรฐานข้อมูล (เฉพาะ categories) | `spark_quality_engine.py:819+` | ใช้จริง |
| `range_checks` (เช่น score 0–100) | **ไม่มีช่องแก้ในหน้านี้** | `stages/rules.py:20` (กักแถวนอกช่วง) | ใช้จริงแต่ UI แก้ไม่ได้ (การ์ดกฎที่ 1 ด้านบนไม่เขียน key นี้) |
| `freshness_threshold_hours` | Rules Editor | บันทึกลงรายงานเท่านั้น `report.py:40` | ไม่มีผลตัดสิน ⚪ |
| `null_checks.mode/tolerance` | Rules Editor / อนุมัติ AI | แสดงในโปรไฟล์ `profile.py` เท่านั้น | ไม่มีผลกัก/เตือน ⚪ |
| `ai_advisor.model` | Rules Editor | ไม่มีโค้ดอ่าน | ⚪ |
| `value_range.column_overrides` | อนุมัติข้อเสนอ AI | ไม่มีโค้ดอ่าน | ⚪ |
| `null_primary_key/duplicate_check/null_date_column.enabled` | ไม่มีช่องแก้ (อนุมัติ AI พยายามปิดถูกบล็อก) | ไม่มีโค้ดอ่าน — การตรวจ PK ว่าง/ลบซ้ำทำเสมอ (`stages/cleansing.py:6-70`) | ⚪ |

---

## 11. สรุปจุดที่ต้องรู้ก่อนนำเสนอ (ซื่อตรง)

1. การ์ดกฎ 3 ใบด้านบน ≠ กฎที่ Spark ใช้: เป็นเอนจิน pandas ใน API บนไฟล์ CSV ตัวอย่าง (`whitebox.py`) — ผลไปโชว์ในหน้า Pipeline/Dashboard/Export; วงแหวน 95/99/99 และข้อความ "> 12.0h/9.0h" เป็นค่าคงที่
2. Toast ของปุ่ม "บันทึกกฎ" อยู่ในกล่องพับที่ปิดอยู่ และแสดง "สำเร็จ" แม้ API ล้ม (error ถูกกลืน)
3. ฟิลด์ที่บันทึกได้แต่ Spark ไม่ใช้ตัดสิน: freshness (ทั้งโหมดและชั่วโมง), null_checks mode/tolerance, `ai_advisor.model`, `value_range.column_overrides`, `*.enabled` ของเช็กหลัก, และ null_policy/max_null_pct/dedup_strategy ของสาย pandas (ไม่มีช่องกรอก)
4. ข้อเสนอ AI: ถ้า ES ว่างหรือพัง จะแสดงตัวอย่าง 3 รายการฮาร์ดโค้ด (มีป้าย "ตัวอย่าง"); การอนุมัติข้อเสนอจาก LLM อาจไม่เปลี่ยนกฎจริงเพราะรูปแบบ rules ไม่ตรง (`rule_path/value`) แต่ UI แจ้งว่าสำเร็จ
5. แจ้งเตือน: ไม่มี UI ตั้งค่าช่องทาง, ไม่มีอีเมล, Slack/LINE ยังไม่ถูกตั้งค่า (ได้แค่ log), Grafana ใช้เกณฑ์ 80% ของตัวเอง; ปุ่ม "Close Ticket" เป็นการปิดบันทึกภายในเท่านั้น
6. ไม่มีฟังก์ชัน Import กฎ; YAML ที่ Export ไม่มีโค้ดใดอ่านกลับ และคลาส `SemanticCleaner` ที่ข้อความอ้างถึงไม่มีอยู่จริง
7. การเรียกอ่าน `GET /rules/*`, `/system/remediations`, `/standardize/review-queue`, `/whitebox/state` ไม่ต้องล็อกอิน (ส่วนเขียนทั้งหมดต้องมี session) และคีย์ Groq เก็บใน ES แบบข้อความธรรมดา

---

## คำตอบสามบรรทัดสุดท้าย

**หน้านี้มีไว้ทำอะไร?** ใช้กำหนดและตรวจทานกฎคุณภาพข้อมูล (เกณฑ์คะแนน, ค่าผิดปกติ, มาตรฐานหมวดข้อมูล, ข้อเสนอจาก AI) ก่อนให้ Pipeline รัน พร้อมจัดการตั๋วแจ้งแก้ต้นทาง

**ผู้ใช้ทำอะไรได้?** ปรับเกณฑ์รายตาราง บันทึก/ดู/ส่งออกกฎ สั่ง AI วิเคราะห์แถวที่ถูกกัก อนุมัติ-ปฏิเสธข้อเสนอและหมวดมาตรฐาน ตั้งค่า Groq ปิดตั๋ว และลบชุดข้อมูล

**ระบบทำอะไรเบื้องหลัง?** API เขียนกฎลง Elasticsearch + `rules_config.json` พร้อมสำรองและ audit แล้ว Spark อ่านกฎนั้นทุกครั้งที่รัน เพื่อกักข้อมูล คำนวณคะแนน เรียก AI เสนอกฎ และส่งแจ้งเตือนผ่าน alert_router/n8n

