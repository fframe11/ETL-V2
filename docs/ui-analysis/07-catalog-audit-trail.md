# 07 · อธิบายหน้า UI: Catalog (/schema) และ Audit Trail (/whitebox)

เอกสารนี้เขียนจากการอ่านโค้ดจริง (branch `new-optimizer`, commit `e068c13`) ไม่ได้รันระบบ ทุกข้อมีเลขไฟล์:บรรทัดกำกับ ส่วนที่ไม่พบหลักฐานในโค้ดจะเขียนว่า "ตรวจไม่พบในโค้ด"

**ป้ายบอกที่มาของข้อมูล (ทุกรายการมีป้ายเดียว)**

- 🟢 ข้อมูลจริงจาก Backend (ดึงจาก API / DB / Elasticsearch / ไฟล์)
- 🟡 ข้อมูลที่คำนวณจากระบบ (คำนวณจากข้อมูลจริง ระบุสูตรไว้)
- 🔴 Mock / Static / ค่าคงที่ฮาร์ดโค้ด (ข้อความตายตัว ตัวเลขตายตัว ค่า fallback)
- ⚪ UI ที่มีแต่ยังไม่ได้เชื่อมระบบจริง (ปุ่ม/ตัวควบคุมที่ไม่มีผล หรือค่าที่ส่งไปแล้วถูกทิ้ง)

**คำศัพท์ที่ใช้ซ้ำ** (อธิบายครั้งเดียว)

- Schema (โครงสร้างตาราง = รายชื่อคอลัมน์และชนิดข้อมูลของแต่ละคอลัมน์)
- Schema drift (โครงสร้างข้อมูลที่เข้ามาเปลี่ยนไปจากที่ลงทะเบียนไว้ เช่น มีคอลัมน์ใหม่ คอลัมน์หาย ชนิดข้อมูลเปลี่ยน)
- Proposal (ข้อเสนอให้แก้ทะเบียน schema รอคนอนุมัติ)
- ES = Elasticsearch (ฐานข้อมูลค้นหาที่ระบบใช้เก็บข้อมูลประกอบ)
- IQR / Tukey fence (วิธีสถิติหาค่าผิดปกติ: Q1 = ค่าที่ตำแหน่ง 25%, Q3 = ตำแหน่ง 75%, IQR = Q3 − Q1, รั้วบน = Q3 + k×IQR)

---

# ส่วนที่ A — หน้า Catalog (`/schema`)

| Frontend file | API endpoints | Backend handler | Storage |
|---|---|---|---|
| `services/ui/src/pages/Schema.jsx` (597 บรรทัด) | `GET /api/v1/schema/proposals?status=` · `POST …/proposals/{id}/approve` · `POST …/{id}/reject` · `POST …/approve-all` · `POST …/reject-all` · `POST …/proposals/create` | `services/api/app/api/schema.py` (list_proposals :38, approve_proposal :63, reject_proposal :186, approve_all :226, reject_all :346, create_schema_proposal :386) | ES index `sdoqap_schema_proposals` (คิวข้อเสนอ), ES index `sdoqap_schema_registry` (ทะเบียน schema ที่ pipeline อ่าน), ไฟล์ `services/spark/schema_registry.json` (ทะเบียนสำรองบนดิสก์) |

## A.0 ข้อเท็จจริงสำคัญที่ต้องบอกก่อน (ตรวจจากโค้ด)

1. **หน้านี้เป็นหน้า "คิวอนุมัติการเปลี่ยน schema" เท่านั้น** ในไฟล์ `Schema.jsx` ทั้ง 597 บรรทัด **ตรวจไม่พบ** รายการตารางทั้งหมดของระบบ, การดูตัวอย่างข้อมูล (data preview) หรือปุ่มลบตาราง และใน `schema.py` ก็ไม่มี endpoint ลักษณะนั้น (มีเพียง 6 endpoint ข้างบน) แม้ชื่อเมนูจะเป็น "Catalog" (`config/pages.js:17`)
2. **Schema drift ถูกตรวจและสร้าง proposal โดย Spark ไม่ใช่โดยหน้านี้** หน้านี้ทำหน้าที่อ่านและตัดสิน (อนุมัติ/ปฏิเสธ) เท่านั้น ยกเว้นกล่อง "จำลองการเปลี่ยน Schema" ที่สร้าง proposal ปลอมเพื่อทดสอบ (ดู A.3)
3. **Spark ไม่หยุดรอการอนุมัติ** ในรอบที่พบ drift Spark แก้ข้อมูลในรอบนั้นให้เองทันที (เติม null / แปลงเป็น String / รับคอลัมน์ใหม่) แล้วเขียน proposal ลง ES ทิ้งไว้ (`sdoqap/stages/schema.py:101-243`) การอนุมัติมีผลกับ "รอบถัดไป" เท่านั้น (ดู A.2)

## A.1 Spark ตรวจ schema drift และเสนอ proposal อย่างไร (เบื้องหลัง)

- **ขั้น `schema_drift`** (`sdoqap/stages/schema.py:101`) เทียบคอลัมน์ที่ข้อมูลจริงมี (`actual_columns` :107) กับ schema ที่ลงทะเบียนไว้ (`schema_spec`) แล้วแบ่ง 3 แบบ
  - คอลัมน์หาย `missing_column` → เติม null ให้ (:112-130)
  - ชนิดข้อมูลไม่ตรง `type_mismatch` → แปลงเป็น String (:131-141)
  - คอลัมน์ใหม่ `new_column` → รับเข้า schema ชั่วคราว (:143-148)
- **คะแนนความรุนแรง** `drift_severity` = ผลรวม: คอลัมน์ใหม่ +1, คอลัมน์หาย +5, ชนิดไม่ตรง +5 (:153-161) 🟡
- **เขียน 2 อย่างลง ES** — `sdoqap_schema_drifts` (ประวัติการตรวจพบ :163) และ `sdoqap_schema_proposals` (ข้อเสนอ :195/:221)
- **สถานะของ proposal** (:174-234)
  - อนุมัติอัตโนมัติ `APPROVED` ได้ก็ต่อเมื่อ: drift เป็น "คอลัมน์ใหม่ล้วน" และนโยบายอนุญาต และ `require_approval=false` และจำนวนคอลัมน์ ≤ `max_columns` (:185-190)
  - `REJECTED` ถ้านโยบายห้ามคอลัมน์ใหม่ หรือคอลัมน์เกินเพดาน (:212-217)
  - นอกนั้น `PENDING` (รอคน) — ค่าเริ่มต้นของ `require_approval` คือ `True` (:180)
- **ข้อควรระวัง (ตรวจจาก grep ทั้ง repo)** — ไม่มีไฟล์ใน `services/` ที่ตั้งค่า `schema_evolution` / `require_approval` เลย (พบเฉพาะในโค้ด :177-180) จึงใช้ค่าเริ่มต้น → **ในระบบปัจจุบัน proposal จะเป็น PENDING เสมอ (เส้นทางอนุมัติอัตโนมัติแทบไม่เคยถูกใช้)** ยกเว้นถูกบล็อกเป็น REJECTED ตามนโยบาย
- เมื่อสถานะ PENDING/REJECTED Spark ส่งแจ้งเตือนผ่าน n8n ด้วย (:237-241)
- `data_profile_store.py` **ไม่เกี่ยวกับ schema drift** — เป็นระบบจำสถิติรายคอลัมน์ (ค่า PSI = ตัวชี้วัดการเปลี่ยนของการกระจายค่า) เก็บใน ES `sdoqap_data_profiles` (`data_profile_store.py:1-20, :52`) ถูกเรียกจากขั้น `ai_advisory` (`stages/advisory.py:26-30`) ไม่ปรากฏบนหน้า Catalog

## A.2 "อนุมัติ/ปฏิเสธ" เขียนอะไรที่ไหน และ pipeline อ่านต่อไหม

| การกระทำ | ที่เขียนจริง | ที่มา (file:line) |
|---|---|---|
| อนุมัติ 1 รายการ | (1) เขียน `schema_spec = proposed_schema` ลง ES `sdoqap_schema_registry` ของตารางนั้น (2) เขียนทับ entry ตารางนั้นใน `schema_registry.json` บนดิสก์ (ถ้าไฟล์มี) (3) แก้ proposal เป็น `APPROVED` + `resolved_at` + `resolved_by` (ชื่อผู้ใช้จาก session) | `schema.py:129-172` |
| อนุมัติทั้งหมด | ทำเหมือนข้างบนวนทุกรายการที่ PENDING (สูงสุด 1000) แต่ **ไม่รับค่า Primary Key/Partition Date** | `schema.py:226-343` |
| ปฏิเสธ 1 / ทั้งหมด | **แก้เฉพาะสถานะ proposal เป็น `REJECTED`** ไม่แตะทะเบียน schema | `schema.py:207-223, 346-383` |

- **pipeline อ่านทะเบียนนี้ต่อไหม — ใช่** ตอนเริ่มรอบถัดไป Spark เรียก `load_expected_schema(table)` (`spark_quality_engine.py:1824`) ซึ่งอ่านจาก ES `sdoqap_schema_registry` ก่อน (:1230-1236) ถ้าไม่ได้ ค่อยอ่าน `/opt/spark-apps/schema_registry.json` (:1242) และสุดท้ายใช้ค่าฝังในโค้ด (:1255) โฟลเดอร์ `services/spark` ถูก mount ร่วมกันระหว่าง API กับ Spark (`docker-compose.yml:150,185,251`) จึงเป็นไฟล์เดียวกัน (ร่องรอย: git แสดงว่า `schema_registry.json` ถูกแก้โดยยังไม่ commit และถูก reformat เป็นรูปแบบเยื้อง 2 ช่องว่างตรงกับ `schema.py:157` — สอดคล้องกับการอนุมัติจากหน้าเว็บ แต่ยืนยันที่มาไม่ได้ 100%)
- **"ปฏิเสธ" ไม่ได้หยุดอะไร** ตรวจไม่พบโค้ดที่ไม่ให้ Spark สร้าง proposal ซ้ำ ดังนั้นถ้าต้นทางยังส่งโครงสร้างเดิม รอบถัดไปจะเกิด proposal ใหม่อีก (อนุมานจากโค้ด `schema.py` ของ Spark ที่เขียน proposal ใหม่ทุกครั้งที่พบ drift)
- **การอนุมัติ proposal แบบ "ชนิดข้อมูลเปลี่ยน"** จะลงทะเบียนชนิดเป็น String เพราะ Spark แปลงเป็น String แล้วก่อนบันทึก `actual_columns` (`stages/schema.py:131-136, :199`)

## A.3 ส่วนต่าง ๆ บนหน้า (ไล่จากบนลงล่าง)

- **[หัวหน้า: ขั้น/ชื่อ Catalog/คำบรรยาย]** → (1) ไม่มีการกด (2) ชื่อหน้าและคำบรรยาย "อนุมัติหรือปฏิเสธการเปลี่ยนโครงสร้างตาราง" (3) `PageHeader` อ่านจาก `config/pages.js:17` (`Schema.jsx:195`) (4) ข้อความตายตัวในไฟล์ config 🔴

- **[กล่อง "จำลองการเปลี่ยน Schema (สำหรับทดสอบ)" (พับอยู่ตอนแรก) + ช่อง ตาราง / คอลัมน์ / ชนิดข้อมูล / ประเภท + ปุ่ม "บันทึก"]** → (1) กดบันทึกแล้วสร้าง proposal สถานะ PENDING ใหม่ 1 รายการ แล้วสลับไปแท็บ "รออนุมัติ" และเลือกรายการนั้น (2) เป็นเครื่องมือทดสอบ **ไม่ได้เดินตรรกะตรวจ drift ของ Spark** (3) เรียก `POST /schema/proposals/create` (`Schema.jsx:83-104`) → `schema.py:386-433` (4) เขียนเอกสารลง ES `sdoqap_schema_proposals` 🔴 — เนื้อหาถูกฮาร์ดโค้ด: `proposed_schema` เป็นชุดคอลัมน์นักศึกษาตายตัว (`student_id, course, score, study_hours` + คอลัมน์ที่กรอก) **ไม่ว่าชื่อตารางที่กรอกจะเป็นอะไร** (`schema.py:410-416`), `severity_score` = 2 ถ้าเลือก "ชนิดข้อมูลเปลี่ยน" ไม่งั้น 1 (:401), `run_id` = `run_evo_<เวลา>` (:396)
  - **ความเสี่ยงที่พบ:** ถ้ากดอนุมัติ proposal จำลองของตารางจริง (เช่น `users`) จะเขียนทับ `schema_spec` ของตารางนั้นด้วยชุดคอลัมน์นักศึกษา (`schema.py:144`)
  - **Fail เงียบ:** ถ้าเขียน ES ไม่สำเร็จ API ตอบ `status: "created_local"` พร้อมข้อความ "เรียบร้อยแล้ว" ทั้งที่ไม่ได้บันทึกอะไร (`schema.py:427-433`) ⚪

- **[แถบข้อความผลลัพธ์ (เขียว/แดง)]** → (1) ไม่มีการกด (2) แสดงผลของการกดอนุมัติ/ปฏิเสธ/บันทึกล่าสุด (3) `actionResult` ตั้งค่าใน `Schema.jsx:96,100,112,116,137,143` (4) ข้อความสำเร็จ 🟢 มาจาก `message` ของ API; ข้อความผิดพลาด 🔴 เป็นแม่แบบตายตัว + `HTTP <code>` เพราะ `postApi` โยนเฉพาะรหัส HTTP ทิ้งรายละเอียด `detail` ของ API (`hooks/useApi.js:53`) ข้อความ error ภาษาอังกฤษปนไทย

- **[แท็บ รออนุมัติ / อนุมัติแล้ว / ปฏิเสธ]** → (1) กดแล้วเปลี่ยนตัวกรองสถานะ ล้างรายการที่เลือก (2) แสดง proposal ตามสถานะนั้น (3) `useApi('/schema/proposals?status=…', refresh 10 วินาที)` (`Schema.jsx:13, 293-306`) → `list_proposals` ค้น ES `status.keyword = <status>` เรียงตาม `proposed_at` ใหม่→เก่า **สูงสุด 50 รายการ** (`schema.py:48-55`) (4) 🟢 ข้อมูลจริงจาก ES; ป้ายภาษาไทยของแท็บเป็นค่าคงที่ 🔴 (`Schema.jsx:8`) หมายเหตุ: ถ้า ES ล่ม/ไม่มี index API ตอบรายการว่าง ไม่ใช่ error (`schema.py:41-46`) หน้าจึงแสดง "ไม่มีรายการ" ซึ่งแยกไม่ออกจาก "ไม่มี drift จริง" ⚪

- **[ช่อง "ค้นหาตาราง"]** → (1) พิมพ์แล้วกรองรายการ (2) กรองฝั่งเบราว์เซอร์ตามชื่อตารางหรือ run_id (3) `filteredProposals` (`Schema.jsx:43-48, 309-315`) ไม่เรียก API (4) 🟡 กรองจากข้อมูลที่โหลดมาแล้ว (50 รายการล่าสุด)

- **[หัวการ์ด "N รายการ"]** → (1) ไม่มีการกด (2) จำนวนรายการหลังกรอง (3) `filteredProposals.length` (`Schema.jsx:324`) (4) 🟡 นับจากรายการที่โหลด (เพดาน 50 ต่อสถานะ)

- **[ปุ่ม "อนุมัติทั้งหมด" / "ปฏิเสธทั้งหมด" (เฉพาะแท็บรออนุมัติ)]** → (1) กดแล้วเด้งกล่องยืนยัน ถ้ายืนยันจะอนุมัติ/ปฏิเสธ **ทุกรายการ PENDING ใน ES** (ไม่ใช่เฉพาะที่ค้นหา/แสดงอยู่) (2) ปุ่มจัดการเป็นชุด (3) `POST /schema/proposals/approve-all|reject-all` (`Schema.jsx:106-120, 333-375`) → `schema.py:226/346` (4) ผลเขียนตามตาราง A.2 🟢 ข้อความในกล่องยืนยัน "อัปเดต Schema ทันที ย้อนกลับไม่ได้" ตรงกับพฤติกรรมจริง (ไม่มีปุ่มย้อนกลับในโค้ด) แต่ตัวเลขใน `message` เป็นเลขจากรายการที่แสดงอยู่ ซึ่งอาจน้อยกว่าที่ถูกดำเนินการจริง 🟡

- **[กล่องยืนยัน (ConfirmationModal)]** → (1) ยืนยัน/ยกเลิก (2) ป้องกันกดพลาด (3) `components/ConfirmationModal.jsx`, `triggerConfirm` (`Schema.jsx:25-35, 588-594`) (4) ข้อความหัวเรื่อง/เนื้อหาเป็นแม่แบบตายตัว 🔴 ที่ต้องระวังคือ ข้อความของปุ่มปฏิเสธระบุว่า "**ข้อมูลที่เกี่ยวข้องจะถูกกักกัน**" (`Schema.jsx:447`) แต่โค้ด reject แก้เพียงสถานะ ไม่มีการกักกันข้อมูลใด ๆ (`schema.py:207-219`) ข้อความนี้จึงไม่ตรงกับสิ่งที่เกิดขึ้นจริง

- **[รายการ proposal ฝั่งซ้าย (แต่ละการ์ด)]** → (1) คลิกเพื่อเลือกดูรายละเอียด (หน้าเลือกอันแรกให้อัตโนมัติ `Schema.jsx:51-55`) (2) แสดง: ชื่อตาราง, ป้าย SEV, รายชื่อคอลัมน์ที่เปลี่ยน, run_id 10 ตัวแรก, เวลาที่ตรวจพบ (3) ข้อมูลจาก `proposals.data.proposals` (`Schema.jsx:385-414`) (4) ชื่อตาราง/คอลัมน์/run_id/เวลา 🟢 จาก ES
  - **ป้าย "SEV n"** → `p.severity_score || 1` (`Schema.jsx:400`) แต่ proposal ที่ Spark สร้างเก็บคะแนนในฟิลด์ `drift_severity` ไม่ใช่ `severity_score` (`stages/schema.py:169,227`) มีเพียง proposal จำลองเท่านั้นที่ตั้ง `severity_score` (`schema.py:401`) → **proposal จริงจาก Spark จะแสดง SEV 1 เสมอ** ไม่ว่าคะแนนจริงจะเป็น 5 หรือมากกว่า 🔴
  - **บรรทัด "+ col1, col2"** → ใส่เครื่องหมาย + นำหน้าทุกกรณี แม้เป็นคอลัมน์หายหรือชนิดเปลี่ยน (`Schema.jsx:405`) 🟡 (ชื่อคอลัมน์ 🟢 แต่เครื่องหมายเป็นค่าคงที่)
  - **"Detected dd/MM at HH:mm"** → จัดรูปแบบจาก `proposed_at` ฝั่งเบราว์เซอร์ (เวลาเครื่องผู้ใช้) คำว่า "Detected" ฮาร์ดโค้ดภาษาอังกฤษ (`Schema.jsx:149-161`) 🟡

- **[ปุ่ม "อนุมัติ" / "ปฏิเสธ" ในหัวการ์ดรายละเอียด (เฉพาะแท็บรออนุมัติ)]** → (1) กดแล้วเด้งกล่องยืนยัน แล้วเรียก API ทีละรายการ ผ่านแล้วล้างการเลือกและโหลดรายการใหม่ (2) ตัดสินใจ proposal ที่เลือก (3) `handleAction` → `POST /schema/proposals/{id}/approve?primary_key=…&date_column=…` หรือ `/reject` (`Schema.jsx:122-147, 431-453`) → `schema.py:63 / :186` (4) เขียนตาราง A.2 🟢 มีการล็อกแบบ optimistic (ถ้ามีคนอื่นแก้ proposal พร้อมกัน ได้ 409) (`schema.py:170-177, 208-219`) ต้องมี session เท่านั้น (`Depends(require_session)`); ส่วน `GET /proposals` **ไม่ต้องล็อกอิน** (`schema.py:38-39`)

- **[หัวการ์ดรายละเอียด: ชื่อตาราง + "Run <run_id>"]** → (1) ไม่มีการกด (2) ระบุว่า proposal นี้มาจากรอบรันไหน (3) `selectedProposal.table_name/run_id` (`Schema.jsx:426-427`) (4) 🟢

- **[ส่วน "สิ่งที่เปลี่ยน" (ป้าย NEW COLUMN / TYPE MISMATCH / MISSING COLUMN)]** → (1) ไม่มีการกด (2) แสดงรายคอลัมน์ว่าเปลี่ยนแบบใด (3) `getModificationLines` อ่าน `drift_details` (`Schema.jsx:163-190, 457-470`) ซึ่ง Spark เขียนไว้ (`stages/schema.py:115,133,147`) (4) ประเภทและชื่อคอลัมน์ 🟢; ป้ายภาษาอังกฤษและสี (เขียว/เหลือง/แดง) เป็นการแปลงแบบตายตัว 🟡 **ข้อจำกัด:** กรณีชนิดข้อมูลเปลี่ยน จะโชว์แค่ "col → ชนิดจริง" ไม่แสดงชนิดเดิมที่คาดไว้ ทั้งที่ข้อมูลมี `expected` ใน proposal (`stages/schema.py:133`)

- **[แผง "ดู Schema ที่เสนอ (JSON)" (พับได้)]** → (1) กดขยายเพื่อดู (2) แสดง schema ใหม่ทั้งตารางเป็น JSON มีเลขบรรทัดและไฮไลต์สี (3) `JSON.stringify(proposed_schema)` (`Schema.jsx:473-519`) (4) 🟢 ข้อมูลจาก ES (สีเป็นแค่การตกแต่ง: บรรทัดที่มีคำว่า "type" เป็นสีส้ม) นี่คือสิ่งที่จะถูกเขียนลงทะเบียนเมื่ออนุมัติจริง (`schema.py:144`) ฟิลด์ `current_schema` ที่ Spark เก็บไว้ **หน้านี้ไม่แสดง** (ตรวจไม่พบการใช้งานใน `Schema.jsx`)

- **[ส่วน "ตั้งค่าก่อนอนุมัติ": ช่อง Primary Key และ Partition Date (เฉพาะแท็บรออนุมัติ)]** → (1) แก้ค่าได้ ค่าจะถูกส่งเป็น query string ตอนกด "อนุมัติ" (2) กำหนดคีย์หลัก (ตัวระบุแถวไม่ซ้ำ) และคอลัมน์วันที่ของตาราง (3) ส่ง `primary_key`, `date_column` (`Schema.jsx:127-134`) → `schema.py:139-142` เขียนทับในทะเบียน (4) **ค่าตั้งต้นของสองช่องนี้ฮาร์ดโค้ดตามชื่อตาราง** (`Schema.jsx:59-81`) 🔴: products→`product_id`; orders→`order_id`/`order_date`; users→`id`/`created_utc`; student_course_scores→`student_id`/`semester`; ตารางอื่น→`id`
  - **ความเสี่ยงที่พบ:** ค่าเหล่านี้ไม่ตรงกับทะเบียนจริง เช่น `student_course_scores` ในทะเบียนใช้คีย์ผสม `[student_id, course, semester]` และคอลัมน์วันที่ `updated_at`; `users` ใช้ `updated_at`; `orders` ไม่มีคอลัมน์วันที่ (ตรวจจาก `services/spark/schema_registry.json`) ถ้ากด "อนุมัติ" โดยไม่แก้ช่องที่เติมไว้ล่วงหน้า คีย์/คอลัมน์วันที่ในทะเบียนจะถูกเขียนทับด้วยค่าฮาร์ดโค้ดนี้ (ช่อง Primary Key รับได้เฉพาะข้อความเดียว จึงเขียนคีย์ผสมเป็น list ไม่ได้) ส่วน "อนุมัติทั้งหมด" ไม่ส่งค่านี้จึงไม่เกิดปัญหานี้

- **[กล่องสถานะท้ายการ์ด "PROPOSAL APPROVED/REJECTED AT …" (แท็บอนุมัติแล้ว/ปฏิเสธ)]** → (1) ไม่มีการกด (2) บอกว่าตัดสินเมื่อไรและโดยใคร (3) `resolved_at`, `resolved_by` (`Schema.jsx:549-574`) (4) 🟢 จาก ES; รูปแบบข้อความตายตัวภาษาอังกฤษ; proposal ที่ระบบอนุมัติเอง (APPROVED โดย Spark) มี `resolved_at` แต่ **ไม่มี `resolved_by`** (`stages/schema.py:205`) จึงไม่โชว์บรรทัด "by …"

- **[กล่อง placeholder "เลือกรายการทางซ้ายเพื่อดูรายละเอียด"]** → ข้อความ/ไอคอนตายตัว เมื่อยังไม่มีรายการให้เลือก (`Schema.jsx:576-584`) 🔴

- **[ตัวแปร `workspaceMode`]** → ประกาศไว้ (`Schema.jsx:11`) แต่ไม่เคยถูกใช้ ⚪ (ไม่มีผลต่อหน้า)

## A.4 ป้ายตัวเลขสีแดง (badge) ที่เมนูข้าง

- **[ตัวเลข badge ข้างเมนู Catalog]** → (1) กดเมนูไปหน้า /schema (2) จำนวน proposal สถานะ PENDING (3) `NavBar.jsx:90-119` เรียก `GET /api/v1/schema/proposals` (ค่าเริ่มต้น status=PENDING) ทุก 10 วินาทีและเมื่อเปลี่ยนหน้า แล้วนับ `status === "PENDING"` (`NavBar.jsx:95-99`), แสดงเมื่อ > 0 (:137-139) (4) 🟡 = จำนวนเอกสาร PENDING ใน ES ที่ API คืนมา **สูงสุด 50** (`schema.py:53`) ถ้า ES ล่ม ตัวเลขจะเป็น 0 เงียบ ๆ (`schema.py:41-46`) หน้า Home (`Home.jsx:19`) และ `App.jsx:50` ใช้วิธีนับแบบเดียวกัน

## A.5 สรุปหน้า Catalog

- **หน้านี้มีไว้ทำอะไร?** เป็นด่านให้คนตรวจและอนุมัติ/ปฏิเสธการเปลี่ยนโครงสร้างตาราง (schema drift) ที่ Spark ตรวจพบ ก่อนจะถูกบันทึกเป็นโครงสร้างอ้างอิงของตารางนั้น
- **ผู้ใช้ทำอะไรได้?** ดู proposal แยกตามสถานะ ค้นหาตาราง ดู JSON schema ที่เสนอ ตั้งค่า Primary Key/คอลัมน์วันที่ แล้วอนุมัติ/ปฏิเสธทีละรายการหรือทั้งหมด และสร้าง proposal จำลองเพื่อทดสอบ
- **ระบบทำอะไรเบื้องหลัง?** Spark เทียบข้อมูลกับ schema ที่ลงทะเบียน แก้ข้อมูลรอบนั้นให้เอง และเขียน proposal ลง ES; เมื่ออนุมัติ API เขียน schema ใหม่ลง ES `sdoqap_schema_registry` และไฟล์ `schema_registry.json` ซึ่ง Spark อ่านในรอบถัดไป ส่วนการปฏิเสธเพียงเปลี่ยนสถานะ

---

# ส่วนที่ B — หน้า Audit Trail (`/whitebox`)

| Frontend file | API endpoints | Backend handler | Storage |
|---|---|---|---|
| `services/ui/src/pages/WhiteBoxPipeline.jsx` (1,416 บรรทัด) | `POST /whitebox/run-all` · `GET /whitebox/multi-table/preview` · `POST …/multi-table/analyze` · `POST …/multi-table/join` · `GET /whitebox/profile` · `POST /whitebox/recommend-rules` · `POST /whitebox/execute` · `GET /whitebox/benchmark` · `GET /whitebox/downstream-analytics` | `services/api/app/api/whitebox.py` (run_all_stages :1144, preview :952, analyze :980, join :1082, get_dataset_profile :325, recommend_rules :575, execute_pipeline :605, evaluate_ground_truth :741, get_downstream_analytics :872) | **ไม่ใช้ ES/HDFS/Spark** — อ่านไฟล์ CSV ใน `data/evaluation/student_course_score_evaluation_dataset/` (`dirty_dataset.csv` 10,100 แถว, `ground_truth.csv`, `student_demographics.csv`) เขียนผลเป็น CSV ใน `output_runs/` (`whitebox.py:92-118`) และเก็บผลล่าสุดไว้ในหน่วยความจำของ API (`whitebox.py:163-167` หายเมื่อรีสตาร์ต) |

## B.0 ข้อเท็จจริงสำคัญที่ต้องบอกก่อน (ตรวจจากโค้ด)

1. **หน้านี้ไม่ได้แสดงหลักฐานจาก Spark pipeline จริง** เป็น "เครื่องสาธิตแบบ white-box" ที่รันด้วย **pandas ภายในโปรเซส API** บนชุดข้อมูลตัวอย่างนักศึกษา (`whitebox.py:1-12`) ตรวจไม่พบ ในไฟล์ `WhiteBoxPipeline.jsx` ว่ามีการอ่านดัชนี ES ที่ Spark เขียน (`sdoqap_quality_runs` ฯลฯ) หรือเรียก endpoint ของ Spark ใด ๆ (เอกสาร `docs/sdoqap-whitebox-analysis.md` ส่วน 0 ก็ระบุตรงกันว่าเป็น "Engine 2" แยกจาก Spark; ยืนยันกับโค้ดแล้ว)
2. **ไม่มีปุ่มอัปโหลดไฟล์หรือเลือก connector บนหน้านี้** ตรวจไม่พบในไฟล์ (ปุ่มเหล่านั้นอยู่หน้า Data Ingestion เรียก `/whitebox/upload-csv` และ `/whitebox/ingest-source`) แต่หน้านี้ **อ่านผลของการอัปโหลดนั้น** เพราะ `_dataset_path()` ชี้ไปไฟล์ที่อัปโหลดเมื่อมีการสลับ (`whitebox.py:1243-1247`)
3. **ไม่มี LLM บนหน้านี้** หน้านี้ไม่เรียก `/whitebox/ai-context-explanations` (endpoint ที่เรียก Groq อยู่ที่ `whitebox.py:1774` ใช้โดยหน้า Dashboard `Dashboard.jsx:101`) ข้อความอธิบายทุกอย่างบนหน้านี้จึงเป็น **แม่แบบข้อความ (f-string) ที่โค้ดเติมตัวเลขจากข้อมูล** หรือข้อความตายตัว
4. **หน้านี้รันเองทันทีที่เปิด** `useEffect` เรียก `runFullPipeline()` ตอน mount (`WhiteBoxPipeline.jsx:71-73`) → ยิง `POST /whitebox/run-all` ซึ่งรันครบทุกขั้นด้วยบริบทตั้งต้นของ backend (ไม่ใช่ค่าที่ผู้ใช้กรอกในขั้น 2) (`whitebox.py:1158`)
5. **ผลข้างเคียงที่ผู้ใช้ไม่เห็น:** การรันขั้น 4 เขียนทับไฟล์ `clean_dataset_run.csv / review_queue_run.csv / quarantine_lake_run.csv` ที่หน้า Export/Pipeline ใช้ร่วมกัน (`whitebox.py:699-706`, `1391-1396`) และขั้นเชื่อมตารางเขียนทับแคชโปรไฟล์ `student_course_score` ที่หน้า Ingestion/Rules ใช้ (`whitebox.py:1119-1121`) (หน้าอื่นเรียก `/state` ซึ่งคำนวณและเขียนไฟล์ใหม่ทุกครั้ง จึงถูกเขียนทับกลับ)
6. **สิทธิ์:** `GET` ของ profile / benchmark / downstream-analytics / multi-table preview เปิดสาธารณะ ส่วน run-all, recommend-rules, execute, analyze, join ต้องมี session (`whitebox.py` ตัวตกแต่ง `dependencies=[Depends(require_session)]`)

## B.1 ที่มาของ "ข้อความอธิบาย" บนหน้านี้ (สรุปครั้งเดียว)

| ประเภท | ตัวอย่าง | ที่มา |
|---|---|---|
| 🟡 แม่แบบข้อความ + ตัวเลขที่คำนวณจากข้อมูล | เหตุผลของกฎ "Why did the system recommend this?" ("Data Profiling detected N missing records") | `whitebox.py:384-388, 406-410, 466-472, 488-492` |
| 🔴 ข้อความ/ตัวเลขตายตัวในโค้ด backend | "154 rows … 100 true outliers + 54 borderline", "exactly 100 extreme outliers (30–60h)", "54 diligent students studying 10–12h", `inner_fence_flagged_count: 154`, `outer_fence_flagged_count: 100`, `confidence_pct: 96.0` | `whitebox.py:453-456, 462-463, 469-470, 1006` |
| 🔴 ข้อความตายตัวใน frontend | คำบรรยายการ์ด, ป้าย pill, กล่อง "ใครทำอะไร", ข้อความวัตถุประสงค์ของแต่ละขั้น | `WhiteBoxPipeline.jsx` ตามที่ระบุรายข้อด้านล่าง |
| 🟢 LLM | **ตรวจไม่พบ** ในหน้านี้ (ไม่มีการเรียก LLM ใน endpoint ใด ๆ ที่หน้านี้ใช้) | — |

## B.2 ส่วนควบคุมระดับหน้า

- **[ปุ่ม "รันทุกขั้นอัตโนมัติ" (มุมขวาบน)]** → (1) กดแล้วรัน pipeline ทั้ง 6 ขั้นรวดเดียวและเติมทุกแผง (ปุ่มเปลี่ยนเป็น "กำลังรัน...") (2) เรียกซ้ำสิ่งที่เกิดตอนเปิดหน้า (3) `runFullPipeline` (`WhiteBoxPipeline.jsx:75-97, 293-296`) → `POST /whitebox/run-all` → `run_all_stages` (`whitebox.py:1144-1183`): preview → analyze → join → profile → recommend-rules (ใช้บริบทตั้งต้น) → execute → benchmark → downstream (4) ผลเก็บใน state ของหน้า 🟡 (คำนวณจากไฟล์ข้อมูลจริง) **ข้อควรรู้:** ถ้า run-all ล้มเหลว หน้าแค่ `console.warn` แล้วโหลดเฉพาะ ขั้น 0 และ 1 (`WhiteBoxPipeline.jsx:90-93`) ไม่มีข้อความแจ้งผู้ใช้ว่า "รันอัตโนมัติไม่สำเร็จ" ⚪; ถ้าชุดข้อมูลปัจจุบันเป็นไฟล์อัปโหลด ผล benchmark จะเป็น `NOT_APPLICABLE` (ดู B.8)

- **[กล่อง "หน้านี้ทำอะไร" (พับได้)]** → ข้อความ 3 ข้อตายตัว (`WhiteBoxPipeline.jsx:299-305`) 🔴

- **[ปุ่ม "ใครทำอะไร: ผู้ใช้ กับ ระบบ" / "ซ่อน"]** → (1) สลับแสดงกล่องอธิบายบทบาท (2) ตาราง 2 คอลัมน์ "สิ่งที่ผู้ใช้ทำ / สิ่งที่ระบบทำ" และกล่องนิยามสรุป (3) `showArchitectureMatrix` (`WhiteBoxPipeline.jsx:309-360`) ไม่เรียก API (4) 🔴 ข้อความตายตัวทั้งหมด (เนื้อหาตรงกับโค้ดในภาพรวม เช่น Decision Tree เลือก Range Check กับ Auto IQR ตามที่ผู้ใช้ติ๊ก "Known Domain")

- **[แถบ error สีแดง]** → แสดงข้อความ error จากการเรียก API ล่าสุด (`WhiteBoxPipeline.jsx:362-366`) 🟡 ข้อความมาจากแม่แบบ "Failed to …" ตายตัว (ภาษาอังกฤษ) ไม่ใช่ `detail` จากเซิร์ฟเวอร์

- **[แถบขั้นตอน Stepper 0–5 (6 ปุ่ม)]** → (1) กดสลับไปแผงของขั้นนั้น (ปุ่ม 5 จะโหลด benchmark/downstream ให้ถ้ายังไม่มี `:420-426`) (2) สีเขียว "completed" บอกว่าขั้นนั้นมีข้อมูลแล้ว (3) `activeStep` (`:369-433`) (4) 🟡 ขั้น 0 = มี `joinResult`, 1 = มี `profileData`, 3 = มีรายการกฎ, 4 = มี `executionResult`, 5 = มี `benchmarkResult` แต่ **ขั้น 2 เขียวเสมอ** เพราะเงื่อนไข `userContext` เป็นจริงตลอด (`:391`) ⚪ (ไม่สะท้อนว่าผู้ใช้ทำขั้นนั้นแล้วจริง)

## B.3 แผงขั้น 0 · เชื่อมโยงตาราง (`WhiteBoxPipeline.jsx:436-657`)

เป้าหมายตามหน้า: เทียบตารางข้อมูลนักศึกษา (A) กับตารางคะแนน (B) แล้วรวมกัน

- **[ปุ่ม "Re-Analyze Tables"]** → (1) กดแล้วโหลดตัวอย่างตาราง A/B และวิเคราะห์ความสัมพันธ์ใหม่ (2) รีเฟรชแผงขั้น 0 (3) `fetchMultiTableData` (`:100-127, 442-444`) → `GET /whitebox/multi-table/preview` (`whitebox.py:952-976`) + `POST /whitebox/multi-table/analyze` (`:980-1078`) (4) 🟢 อ่านจาก CSV จริง

- **[การ์ด SOURCE TABLE A "Student Demographics"]** → (1) ไม่มีการกด (2) รายชื่อคอลัมน์และจำนวนแถวของตารางข้อมูลนักศึกษา (3) `multiTablePreview.table_a` (`:449-463`) → `whitebox.py:964-969` (4) คอลัมน์/จำนวนแถว 🟢 (อ่านจาก `student_demographics.csv` ปัจจุบัน 9,980 แถว) แต่ **ชื่อการ์ดและคำบรรยาย "Master student dimension containing personal identity…" เป็นข้อความตายตัว** 🔴 **และตัวไฟล์ตารางนี้เป็นข้อมูลสังเคราะห์ที่ระบบสร้างเอง** — ถ้าไฟล์ไม่มี โค้ดสุ่มสร้างชื่อ/คณะ/วันลงทะเบียนด้วย seed 42 และจงใจตัดนักศึกษา "ทุกคนที่ id หาร 500 ลงตัว" ออกเพื่อให้เห็นกุญแจที่จับคู่ไม่ได้ (`whitebox.py:134-153`) ไฟล์ที่มีอยู่ตอนนี้มีชื่อตรงกับรายการชื่อในโค้ดนั้น (เช่น Wichai Thongdee) จึงไม่ใช่ข้อมูลจากระบบทะเบียนจริง

- **[การ์ด SOURCE TABLE B "Student Course Scores"]** → เหมือนข้างบน แต่อ่านจากชุดข้อมูลที่กำลังใช้อยู่ (`dirty_dataset.csv` 10,100 แถว หรือไฟล์ที่อัปโหลด) (`:465-479` / `whitebox.py:970-975`) คอลัมน์/จำนวนแถว 🟢 ชื่อ/คำบรรยายการ์ด 🔴

- **[ตาราง "1. Schema & Naming Differences Detected"]** → (1) ไม่มีการกด (2) คู่คอลัมน์ที่ชื่อต่างกันแต่เป็นสิ่งเดียวกัน เช่น `studentId` ↔ `student_id` (3) โค้ดทำให้ชื่อเป็นตัวพิมพ์เล็กตัดเครื่องหมายแล้วเทียบเท่ากัน (`_normalize_token` :947-949, `:997-1013`) (4) คู่คอลัมน์ 🟡 (คำนวณจากชื่อคอลัมน์จริง); ช่อง **Confidence = 96.0 ตายตัวทุกแถว** 🔴 (หน้าเองก็มี InfoHint บอก `:512` และ `whitebox.py:1006`); ช่อง "Difference Type" เป็นข้อความตายตัว "Naming Convention (camelCase vs snake_case)" 🔴; ช่อง Evidence: บรรทัดแรก-สองคำนวณจากข้อมูล (token และชนิดข้อมูล) 🟡 บรรทัดที่สามตายตัว 🔴 (:1007-1011); ช่อง Suggested Standard = ชื่อคอลัมน์ฝั่ง B 🟡

- **[ตาราง "2. Format Reconciliation (Date Discrepancies)"]** → (1) ไม่มีการกด (2) เทียบรูปแบบวันที่ของตาราง A กับ B (3) `date_format_differences` (`:543-552`) สร้างที่ `whitebox.py:1016-1030` (4) ค่าตัวอย่างวันที่ 🟢 (แถวแรกของ `enrollmentDate` และ `updated_at`) แต่ **ชื่อฟิลด์และ "รูปแบบที่ตรวจพบ" เป็นข้อความตายตัว** ("DD/MM/YYYY (UK/TH Standard)", "YYYY-MM-DD HH:MM:SS (ISO-8601)") ไม่ได้ตรวจจับรูปแบบจริง 🔴; ตารางมีแถวเดียวเสมอ และ "(ISO-8601)" ต่อท้ายถูกใส่ด้วยโค้ดหน้าเว็บ (`:550`)

- **[การ์ด "KEY OVERLAP & RELATIONSHIP DETECTED"]**
  - หัวข้อ `Student.studentId ⟷ Score.student_id` → ข้อความตายตัว 🔴 (`:564`)
  - **Key Match Rate** → จำนวน id ใน B ที่พบใน A ÷ จำนวน id ไม่ซ้ำใน B × 100 (`whitebox.py:1033-1036`) 🟡
  - **Inferred Cardinality** → ตรวจว่าคอลัมน์ id ของ A/B ไม่ซ้ำหรือไม่ แล้วเลือก 1:N / 1:1 / N:M (`:1038-1046`) 🟡
  - **Matching Key Count (x / y keys)** → จำนวนกุญแจที่ตรงกัน / จำนวนกุญแจไม่ซ้ำใน B (`:1053-1055`) 🟡
  - **Recommended Join: Left Join** → ตายตัวเสมอ ไม่ได้เลือกจากข้อมูล (หน้าเองมี InfoHint `:583`; `whitebox.py:1058`) 🔴
  - **กล่อง "Semi-Automated Architecture Philosophy"** → ข้อความตายตัว 🔴 (`:588-601`) รายการเหตุผลใต้กล่อง: บรรทัดแรก (match rate) 🟡 อีกสามบรรทัดตายตัว 🔴 (`whitebox.py:1060-1065`) ข้อความในกล่องยอมรับเองว่า join รันไปแล้วอัตโนมัติ ปุ่มด้านล่างเป็นการรันซ้ำ ไม่ใช่การรอยืนยัน (`:594`)
  - **แผง "ทำไมไม่รวมทุกคอลัมน์" (พับได้)** → ข้อความตายตัว มีตัวเลข match rate แทรก 🔴/🟡 (`:604-616`)

- **[ปุ่ม "Confirm Relationship & Execute Semi-Auto Join →" / "Re-run Join →"]** → (1) กดแล้วรวมตาราง A กับ B แล้วโหลดโปรไฟล์ใหม่และข้ามไปขั้น 1 (2) ขั้นยืนยันก่อนรวม (3) `handleConfirmJoin` (`:129-157, 620-626`) → `POST /whitebox/multi-table/join` → `execute_multi_table_join` (`whitebox.py:1082-1135`): แปลงวันที่ `DD/MM/YYYY`→`YYYY-MM-DD`, เปลี่ยนชื่อ `studentId`→`student_id`, `fullName`→`student_name`, left join, เขียนไฟล์ `unified_multitable_dataset.csv` (4) 🟡 **ค่าที่ส่งไปฮาร์ดโค้ดทั้งหมด** (ชื่อตาราง, คีย์, `left`, รูปแบบวันที่ `:136-145`) ไม่ขึ้นกับผลวิเคราะห์ที่แสดง หมายความว่าผู้ใช้ "ยืนยัน" ได้แต่เลือกอะไรไม่ได้ ⚪

- **[การ์ด "JOIN COMPLETED SUCCESSFULLY" + ปุ่ม "Proceed to Data Profiling →"]** → (1) ปุ่มไปขั้น 1 (2) สรุปผลรวม: จำนวนแถว/คอลัมน์/แถวที่จับคู่ข้อมูลนักศึกษาได้ (3) `joinResult` (`:632-647`) จาก `whitebox.py:1123-1135` (4) ตัวเลข 🟡 (`total_rows = len(merged)`, `matched_rows = จำนวนแถวที่ faculty ไม่ว่าง`); ชื่อ `unified_student_dataset` ตายตัว 🔴

- **[ปุ่มท้ายแผง "ขั้นตอนถัดไป: Stage 1 …"]** → เปลี่ยนไปขั้น 1 เท่านั้น (`:650-655`) ไม่เรียก API 🔴 (ข้อความปุ่มตายตัว)

## B.4 แผงขั้น 1 · สถิติข้อมูลดิบ (`WhiteBoxPipeline.jsx:660-782`)

- **[กล่องวัตถุประสงค์ "การสำรวจโครงสร้างและค่าสถิติ…"]** → ข้อความตายตัว (`:662-667`) 🔴

- **[ปุ่ม "Refresh Profiling"]** → (1) กดแล้วโหลดโปรไฟล์ใหม่ (2) รีเฟรชการ์ดและตาราง (3) `fetchProfile` (`:159-172`) → `GET /whitebox/profile` → `_compute_profile` (`whitebox.py:217-321`, :325-339) (4) 🟡 **หมายเหตุ:** endpoint คืนค่าที่แคชในหน่วยความจำก่อนถ้ามี (`:329-330`) ดังนั้นปุ่มนี้อาจไม่คำนวณใหม่ และหลังขั้นเชื่อมตาราง แคชนี้คือโปรไฟล์ของตารางที่ join แล้ว (`:1121`)

- **[การ์ดตัวเลข 4 ใบ]**
  - **Ingested Rows** → `total_rows` = จำนวนแถวไฟล์ 🟡 (บรรทัดย่อย "Evaluation Dataset" ตายตัว แม้ไฟล์จะเป็นไฟล์อัปโหลด 🔴 `:685`)
  - **Detected Columns** → `total_columns` 🟡 (บรรทัดย่อย "Inferred Types Ready" ตายตัว 🔴)
  - **Null Rate (score)** → `null_count ÷ total_rows × 100` ของคอลัมน์ `score` (`whitebox.py:226-227`) 🟡 — ถ้าไม่มีคอลัมน์ `score` ช่องนี้จะแสดงเพียง "%" (ค่าว่าง)
  - **Composite Duplicates** → จำนวนแถวที่ซ้ำกันบนคีย์ผสม `student_id + course + semester` (เก็บแถวแรกไว้) = `df.duplicated(...).sum()` (`:287-292`) 🟡 (ข้อความ "student_id + course + semester" ใต้ตัวเลขตายตัว 🔴)

- **[ตาราง "Profiled Schema & Value Range Analysis"]** → (1) ไม่มีการกด (2) หนึ่งแถวต่อหนึ่งคอลัมน์ (3) `Object.entries(profileData.columns_profile)` (`:727-762`) คำนวณที่ `whitebox.py:224-284`
  - ช่อง Null Count / Null Rate 🟡 (นับค่าว่าง)
  - **Inferred Type** → เดาจากชนิดข้อมูล pandas และชื่อคอลัมน์ (ถ้าชื่อมี "date"/"time" ถือเป็น Date) (`whitebox.py:235-240`) 🟡 (เป็นการเดาง่าย ๆ ไม่ได้ลองแปลงค่า)
  - **Observed Range / Distinct** → ถ้าเป็นตัวเลขโชว์ min → max ไม่งั้นโชว์จำนวนค่าไม่ซ้ำ 🟡
  - **IQR / Dispersion** → `IQR = Q3 − Q1` พร้อม Q1, Q3 (เฉพาะคอลัมน์ตัวเลข) 🟡
  - **Detected Anomalies** (`:746-759`) → ป้ายสร้างจากเงื่อนไขของหน้าเว็บ: `score` ที่ min < 0 → ป้าย "Invalid Range (-10 to 150)" โดยตัวเลข **-10 ถึง 150 เป็นข้อความตายตัว** ไม่ใช่ค่าที่พบจริง 🔴; `study_hours` → "N IQR Outliers" นับด้วยรั้ว **1.5×IQR** (`whitebox.py:264-267`) 🟡; `student_id` → "Duplicate Natural Key" ถ้ามีคีย์ผสมซ้ำ 🟡; คอลัมน์อื่นที่ไม่มีค่าว่าง → ป้าย "Clean" ซึ่งตรวจแค่ "ไม่มีค่าว่าง" ไม่ได้ตรวจเรื่องอื่น 🟡 หมายเหตุ: ตัวเลข outlier ที่นี่ (รั้ว 1.5×) ต่างจากกฎที่ใช้จริงตอนคัดแยก (ค่าตั้งต้น 3.0×) จึงอาจไม่เท่ากับจำนวนแถว Review ในขั้น 4

- **[ข้อความ "Loading profile..."]** → แสดงระหว่างไม่มีข้อมูล (`:779`) 🔴

- **[ปุ่ม "⬅ ย้อนกลับ" / "ขั้นตอนถัดไป: Stage 2"]** → สลับขั้น ไม่เรียก API (`:769-776`) 🔴

## B.5 แผงขั้น 2 · บริบทธุรกิจ (`WhiteBoxPipeline.jsx:785-972`)

- **[กล่องวัตถุประสงค์]** → ข้อความตายตัว (`:787-792`) 🔴

- **[ช่อง Data Purpose / Criticality / Update Frequency]** → (1) พิมพ์/เลือกค่าได้ (2) บริบทที่ผู้ใช้บอกระบบ (3) แก้ `userContext` (`:801-834`) **ค่าตั้งต้นฮาร์ดโค้ดในหน้า** (`:24-51`: "Official Grade Reporting", "Critical", "Daily Batch (<= 24h)") ซึ่งซ้ำกับ backend `get_default_user_context` (`whitebox.py:517-571`) แต่ข้อความไม่เหมือนกันทุกจุด (4) ส่งไปเมื่อกดปุ่มถัดไปเท่านั้น (ไม่มีปุ่มบันทึกในขั้นนี้)
  - **Data Purpose** → ถูกนำไปแทรกในข้อความเหตุผลของกฎ (`whitebox.py:385`) 🟡
  - **Criticality** → **ไม่มีผลต่อกฎ** ตรวจไม่พบการอ่านค่า `criticality` ในตรรกะสร้างกฎเลย (พบเพียงการประกาศ `whitebox.py:194` และค่าตั้งต้น `:525`) ข้อความช่วย "Critical requires hard quarantine for missing grades." (`:822`) จึงเป็นคำอ้างที่โค้ดไม่ได้ทำจริง ⚪
  - **Update Frequency** → ใช้เฉพาะแทรกในข้อความกฎ freshness (`whitebox.py:499-507`) 🟡
  - ข้อความช่วยใต้ช่อง (3 บรรทัด) 🔴

- **[ส่วน "Field Semantic Annotations" แถว score: ช่อง Required (No Nulls), Known Domain (Range Check), Min, Max]** → (1) ติ๊ก/กรอกได้ (Min/Max โผล่เมื่อติ๊ก Known Domain) (2) บอกระบบว่า score ต้องไม่ว่างและมีช่วงค่ารู้ล่วงหน้า (3) แก้ `userContext.field_contexts.score` (`:842-917`) (4) ผลต่อกฎ 🟡: Required → สร้างกฎ "Strict Required" (`whitebox.py:375-391`); Known Domain → สร้างกฎ Range Check ด้วยค่า Min/Max (:394-413) ค่าตั้งต้น 0–100 ฮาร์ดโค้ด 🔴 (`:32-34`) ชื่อฟิลด์/ความหมาย "Course Final Grade" ตายตัว 🔴
  - **ข้อควรระวัง:** ถ้าลบช่อง Min/Max จนว่าง ค่าจะเป็น `NaN` (`parseFloat`) และหลังแปลง JSON เป็น `null` ที่ backend อาจเกิด error ตอน `int(None)` (`whitebox.py:403`) — วิเคราะห์จากโค้ด ไม่ได้ทดลองรัน

- **[แถว study_hours: ช่อง Required, Known Domain (Unchecked = Auto IQR)]** → (1) ติ๊กได้ (2) ถ้าไม่ติ๊ก Known Domain ระบบใช้วิธีสถิติ IQR หา outlier และส่งเข้า Review (3) แก้ `field_contexts.study_hours` (`:919-959`) (4) ผลต่อกฎ: Known Domain ไม่ติ๊ก + มี outlier → สร้างกฎ Auto IQR (`whitebox.py:419-475`) 🟡; **ช่อง Required ของ study_hours ไม่มีผลต่อกฎใดเลย** (ตรวจไม่พบการอ่านค่านี้) ⚪

- **[ฟิลด์ `student_id` ใน userContext]** → มีใน state และส่งไป backend (`:43-49`) แต่ไม่มีแถวให้แก้บนหน้า และ backend ไม่ใช้ ⚪

- **[ปุ่ม "ขั้นตอนถัดไป: Stage 3 กฎเกณฑ์ที่ระบบเสนอ ->"]** → (1) กดแล้วสร้างกฎใหม่จากบริบทที่กรอก แล้วไปขั้น 3 (2) ส่งบริบทให้ backend ออกกฎ (3) `handleGenerateRules` (`:174-198, 967-969`) → `POST /whitebox/recommend-rules` → `recommend_rules` (`whitebox.py:575-598`) (4) 🟡 **แทนที่รายการกฎเดิมทั้งหมด** และรีเซ็ตสถานะ "รับกฎ" กลับเป็นรับหมด `dataset_name` ถูกส่งตายตัว `"student_course_score"` (`:182`)

- **[ปุ่ม "⬅ ย้อนกลับ"]** → ไปขั้น 1 (`:963-966`) 🔴

## B.6 แผงขั้น 3 · กฎที่ระบบเสนอ (`WhiteBoxPipeline.jsx:975-1103`)

กฎที่ระบบอาจเสนอ (จาก `_generate_recommendations` `whitebox.py:364-514`) มี 5 แบบ: null_check (score), range_check (score), auto_iqr (study_hours), composite_unique, freshness (ถ้ามีคอลัมน์ `updated_at`) การ์ดกฎแต่ละใบมีส่วนดังนี้

- **[กล่องวัตถุประสงค์ "การกำหนดและอนุมัติเกณฑ์…"]** → ข้อความตายตัว (`:977-982`) 🔴

- **[ป้ายหัวการ์ด "Target: <field>"]** → ชื่อฟิลด์ที่กฎใช้ 🟡 (`:1001`)

- **[ป้าย "Origin: User Context + Profiling / Statistical Profiling"]** → (1) ไม่มีการกด (2) บอกว่ากฎมาจากบริบทผู้ใช้หรือสถิติล้วน (3) ตรวจว่า `sources` มีข้อความ "User Context" หรือไม่ (`:1003`) (4) 🟡

- **[ป้าย "User Confirmed / Rejected by User"]** → (1) ไม่มีการกด (2) สถานะรับกฎ (3) `r.accepted` (`:1005-1007`) (4) 🟡 **จุดที่ต้องระวัง:** backend ตั้ง `accepted: True` ให้ทุกกฎตั้งแต่สร้าง (`whitebox.py:390,412,474,494,511`) ดังนั้นป้ายจะขึ้น "User Confirmed" ทั้งที่ผู้ใช้ยังไม่ได้ทำอะไร

- **[หัวข้อกฎ `recommended_rule`]** → ข้อความที่ backend สร้างจากแม่แบบ เช่น "Known Domain Range Check [0–100]" (`whitebox.py:381,403,441,485`) 🟡 (ใส่ค่า Min/Max/ชื่อคีย์จริง)

- **[ป้าย "Action: QUARANTINE/REVIEW/WARNING"]** → ปลายทางของแถวที่ผิดกฎ (`r.action`) 🔴 กำหนดตายตัวต่อชนิดกฎ (null/range/dup → quarantine, auto_iqr → review, freshness → warning) (`whitebox.py:382,404,442,486,504`)

- **[กล่อง "Why did the system recommend this?" + "Evidence Sources"]** → (1) ไม่มีการกด (2) เหตุผลหลายข้อและแหล่งหลักฐาน (3) แสดง `r.rationale` และ `r.sources` (`:1019-1037`) (4) 🟡 แม่แบบข้อความที่แทรกตัวเลขจากโปรไฟล์ (จำนวนค่าว่าง, Q1/Q3/IQR, ค่าต่ำสุด–สูงสุดที่พบ) **แต่บางประโยคตายตัว** 🔴: กฎ Range Check เขียนว่า "Data Profiling identified values violating domain bounds" โดยไม่ตรวจว่ามีค่าละเมิดจริงหรือไม่ (`whitebox.py:408`); กฎ Auto IQR ฝังตัวเลข "154 แถว/100 แถว/54 คน/30–60 ชั่วโมง/10–12 ชั่วโมง" ที่ตรงกับชุดข้อมูลตัวอย่างโดยเฉพาะ (`whitebox.py:453-456, 462-463, 469-470`) — **ตัวเลขนี้จะไม่เปลี่ยนแม้ข้อมูลหรือตัวคูณเปลี่ยน** ส่วนรายการ "Evidence Sources" เป็นป้ายตายตัวต่อชนิดกฎ 🔴

- **[ช่อง "Statistical Fence Multiplier" (เฉพาะกฎ Auto IQR) + ข้อความ "Outlier Threshold > N hrs"]** → (1) ปรับตัวคูณ (เช่น 1.5 หรือ 3.0) ได้ (2) ความไวของรั้วสถิติ (3) `updateRuleParam(idx,"multiplier")` (`:1041-1055`) ค่านี้ **ถูกใช้จริง** ตอนกดรันขั้น 4: `fence = Q3 + multiplier × IQR` (`whitebox.py:634-641`) 🟡 แต่ **ตัวเลข "Outlier Threshold" ที่แสดงไม่อัปเดตตามตัวคูณ** เพราะอ่านจาก `parameters.upper_fence` ที่ backend คำนวณมาครั้งเดียว (ค่า fallback `12.0` ตายตัว `:1052`) 🔴/⚪ ฟังก์ชัน `applyIqrPreset` (ปุ่มพรีเซ็ต 1.5×/3.0×) มีในโค้ดแต่ **ไม่มีปุ่มใดเรียกใช้** (`:219-233`; ค้นแล้วมีเพียงการประกาศ) ⚪

- **[ช่อง "Range Bounds" (เฉพาะกฎ Range Check) ช่วง ต่ำ to สูง]** → (1) ปรับช่วงได้ (2) ขอบเขตค่าที่ยอมรับ (3) `updateRuleParam(idx,"min"/"max")` (`:1057-1074`) ใช้จริงตอนรัน: ค่า score นอกช่วงถูก Quarantine (`whitebox.py:649-651, 677-683`) 🟡 (ค่า fallback 0 และ 100 ตายตัว 🔴)

- **[ปุ่ม "Rule Accepted" / "+ Click to Accept" (สลับรับ/ไม่รับกฎ) + ข้อความ "Included in transformation pipeline / Excluded by user"]** → (1) กดสลับ (2) เปิด-ปิดกฎ (3) `toggleRuleAccept` (`:200-206, 1078-1088`) (4) 🟡 กฎที่ไม่รับจะถูกข้ามตอนรันขั้น 4 (`whitebox.py:628, 646, 649, 654`) **ยกเว้นกฎ freshness ซึ่งไม่มีโค้ดบังคับใช้ใน `execute_pipeline` เลย** การรับ/ไม่รับจึงไม่มีผล ⚪ (ตรวจ `whitebox.py:604-734` ไม่พบการจัดการ `freshness`)

- **[ปุ่ม "⬅ ย้อนกลับ" / "ขั้นตอนถัดไป: Stage 4 ดำเนินการคัดแยก 3 ทาง ->"]** → (1) ปุ่มหลังส่งกฎทั้งหมด (รวมสถานะรับและพารามิเตอร์ที่ปรับ) ไปรันคัดแยก แล้วไปขั้น 4 (2) ขั้นตัดสินใจ (3) `handleExecute` (`:235-256, 1098-1100`) → `POST /whitebox/execute` (`whitebox.py:605-734`) (4) ดูขั้น 4

## B.7 แผงขั้น 4 · คัดแยก 3 ทาง (`WhiteBoxPipeline.jsx:1106-1207`)

วิธีคัดแยกจริง (`whitebox.py:662-692`): ไล่ทีละแถว ตามลำดับ (1) คีย์ผสมซ้ำ → Quarantine (2) score ว่าง → Quarantine (3) score นอกช่วง → Quarantine (4) study_hours เกินรั้วสถิติ → Review ที่เหลือคือ Clean (แต่ละกฎทำงานเฉพาะเมื่อผู้ใช้ "รับ" กฎนั้น)

- **[ปุ่ม "Re-Run Transformation"]** → (1) กดรันคัดแยกใหม่ด้วยกฎปัจจุบัน (2) รีเฟรชแผง (3) `handleExecute` → `POST /whitebox/execute` (`:1112-1114`) (4) เขียนไฟล์ `clean_dataset_run.csv`, `review_queue_run.csv`, `quarantine_lake_run.csv` ใน `output_runs/` (`whitebox.py:699-706`) และเก็บผลในหน่วยความจำ

- **[การ์ด 3 ใบ: Clean Data Asset / Human Review Queue / Quarantine Lake]** → (1) ไม่มีการกด (2) จำนวนแถวในแต่ละโซน (3) `executionResult.clean_rows / review_rows / quarantine_rows` (`:1120-1150`) = `len()` ของแต่ละกลุ่มที่คัดได้ (`whitebox.py:695-697, 715-717`) (4) ตัวเลข 🟡; **คำบรรยายและป้ายในการ์ดตายตัวทั้งหมด** 🔴 เช่น "100% Validated", "Semi-Auto Human Gate", "Missing scores, out-of-range grades (-10, 150)…" (ค่า -10/150 เป็นตัวอย่างตายตัวไม่ใช่ค่าที่พบ) หมายเหตุ: "100% Validated" แสดงเสมอ แม้จะผ่านเพียงบางกฎที่รับไว้ และ tooltip ที่หัวการ์ดเป็นข้อความตายตัว

- **[กล่อง "Pipeline Execution Metrics" 4 ช่อง]**
  - **Total Ingested** → จำนวนแถวไฟล์ที่อ่าน 🟡 (`whitebox.py:620`)
  - **Processing Runtime** → เวลาที่วัดจริงเป็น ms (`whitebox.py:708`) 🟡
  - **Raw Quality Score** → `จำนวนแถว Clean ÷ จำนวนแถวทั้งหมด × 100` (`whitebox.py:709`) 🟡
  - **Post-Clean Quality** → **100.0 ตายตัวเสมอ** (`whitebox.py:721`) 🔴 (เป็นค่าที่ไม่ได้วัด เพราะหลังคัดแยก Clean ย่อมผ่านกฎที่ใช้อยู่แล้ว)

- **[แท็ก "Error Distribution Segregated"]** → (1) ไม่มีการกด (2) จำนวนแถวต่อประเภทข้อผิดพลาด (3) `value_counts()` ของคอลัมน์ `whitebox_error_type` (`whitebox.py:711`) (4) 🟡 **รวมแถวที่ไม่มีข้อผิดพลาดเป็นแท็ก "None: N rows"** ด้วย (แถว Clean ทั้งหมด) อาจทำให้เข้าใจผิดว่า "None" เป็นชนิดข้อผิดพลาด

- **ข้อมูลที่ backend ส่งมาแต่หน้าไม่แสดง** → `sample_quarantined`, `sample_review` (ตัวอย่างแถว 5 แถวต่อโซน), `saved_artifacts` (ที่อยู่ไฟล์) และ `executed_at` (`whitebox.py:723-730`) ⚪ ตรวจไม่พบการใช้ใน `WhiteBoxPipeline.jsx` ดังนั้นหน้านี้ **ไม่มีตารางดูแถวที่ถูกกักกัน/รอตรวจ** (ดูแถวจริงทำได้ที่หน้า Pipeline/Export) และ **ไม่มีปุ่มอนุมัติ/ปฏิเสธแถวใน Review** (ตรวจไม่พบ)

- **[ข้อความ "Executing pipeline..."]** → ตัวบอกสถานะตายตัวเมื่อยังไม่มีผล (`:1204`) 🔴

- **[ปุ่ม "⬅ ย้อนกลับ" / "ขั้นตอนถัดไป: Stage 5 วัดผล Benchmark"]** → ปุ่มหลังไปขั้น 5 และเรียก `GET /whitebox/benchmark` + `GET /whitebox/downstream-analytics` (`:1191-1200`)

## B.8 แผงขั้น 5 · ตรวจผลและใช้งาน (`WhiteBoxPipeline.jsx:1210-1413`)

หลักการของ benchmark: ชุดข้อมูล `dirty_dataset.csv` เป็นข้อมูลทดสอบที่มีไฟล์เฉลย `ground_truth.csv` บอกว่าแต่ละแถวควรเป็นแบบใด (คอลัมน์ `expected_status`, `expected_error_type`) ระบบเทียบผลคัดแยกกับเฉลยด้วย `dirty_row_id` (`whitebox.py:770-777`)

- **[กล่องวัตถุประสงค์ "การตรวจสอบความครบถ้วนตามมาตรฐาน SLA…"]** → ข้อความตายตัว (`:1212-1217`) 🔴 หมายเหตุ: ข้อความอ้างการยืนยัน "ไม่มีข้อมูลสูญหาย (Zero Unaccounted Records)" แต่ตรวจไม่พบโค้ดที่ตรวจว่า clean + review + quarantine = ทั้งหมด หน้านี้ไม่ได้ทำการตรวจดังกล่าวโดยตรง

- **[ปุ่ม "Re-verify SLA Metrics"]** → (1) กดคำนวณ benchmark ใหม่ (2) เทียบกับเฉลยอีกครั้ง (3) `fetchBenchmark` (`:258-272, 1223-1225`) → `GET /whitebox/benchmark` → `evaluate_ground_truth` (`whitebox.py:741-865`) อ่านไฟล์ผลที่ขั้น 4 เขียนไว้ (ถ้ายังไม่เคยรันจะรันด้วยบริบทตั้งต้นให้เอง `:756-761`) (4) 🟡

- **[แบนเนอร์ "SLA COMPLIANCE VERIFIED" + "Data Quality SLA Compliance Rate: N%"]** → (1) ไม่มีการกด (2) ตัวเลขความตรงของผลระบบกับเฉลย (3) `benchmarkResult.overall_accuracy_pct` = `จำนวนแถวที่ประเภทข้อผิดพลาดของระบบตรงกับเฉลย ÷ แถวทั้งหมด × 100` (`whitebox.py:816-818`) (4) ตัวเลข 🟡 แต่ **ชื่อ "SLA Compliance Rate" ไม่ตรงกับสิ่งที่คำนวณ** (เป็นความแม่นยำเทียบเฉลย ไม่ใช่ SLA) และป้าย "SLA COMPLIANCE VERIFIED" กับข้อความ "Verified across all ingested production records" **แสดงเสมอ** ไม่ว่าผลจะเป็นเท่าใด 🔴 (`:1233,1237`) ข้อมูลเป็นชุดทดสอบที่ฝังข้อผิดพลาดไว้ ไม่ใช่ข้อมูล production
  - **กรณีไฟล์อัปโหลด:** API คืน `{"status":"NOT_APPLICABLE", message}` (`whitebox.py:746-751`) หน้าจะยังแสดงแบนเนอร์ "VERIFIED" โดยตัวเลขเป็นค่าว่าง (แสดงแค่ "%") และตารางว่าง เพราะหน้าตรวจเพียงว่า `benchmarkResult` มีค่า ไม่ตรวจ `status` ⚪ (วิเคราะห์จากโค้ด ไม่ได้ทดลองรัน)

- **[ตาราง Anomaly Category]** → (1) ไม่มีการกด (2) ต่อ 1 ประเภท (Missing Score / Invalid Score Range / Study Hours Outlier / Duplicate / None) แสดงจำนวนตามเฉลย, จำนวนที่ระบบจัดเป็นประเภทนั้น, Recall, Precision, F1 (3) `metrics_by_error_type` (`:1254-1267`) คำนวณที่ `whitebox.py:788-814` (4) 🟡 สูตร: TP = ระบบจัดประเภทนั้นและเฉลยก็ประเภทนั้น, FP = ระบบจัดแต่เฉลยไม่ใช่, FN = เฉลยใช่แต่ระบบไม่จัด; Recall = TP/(TP+FN)×100, Precision = TP/(TP+FP)×100, F1 = 2PR/(P+R) **ถ้าตัวหารเป็น 0 โค้ดให้ 100% ทันที** (`:801-803`) ดังนั้น "100%" อาจเกิดจากไม่มีกรณีให้วัด มี "None" เป็นหนึ่งแถวในตาราง (ปกติ = ไม่มีข้อผิดพลาด) หัวคอลัมน์ภาษาอังกฤษเป็นข้อความตายตัว ("Ingested Anomalies" = จำนวนตามเฉลย, "Isolated by Gate" = จำนวนที่ระบบจัด)

- **[การ์ด "3-Zone Segregation Audit: Isolated Records Breakdown" (2 กล่อง)]** → (1) ไม่มีการกด (2) แจกแจงสาเหตุของแถวใน Quarantine และ Review (3) `benchmarkResult.error_reconciliation` (`:1277-1314`) คำนวณที่ `whitebox.py:850-864` (4) ตัวเลข 🟡: "Quarantine Lake: N Records" = จำนวนแถวไฟล์ quarantine; รายการย่อย (Missing Score / Invalid Score Range / Duplicate Composite) = **True Positive** ของแต่ละประเภท (ไม่ใช่จำนวนแถวทั้งหมดของประเภท) ผลรวมของรายการย่อยจึงอาจน้อยกว่ายอดรวมถ้ามี False Positive; "Human Review Queue" = จำนวนแถวไฟล์ review และ "Study Hours Outlier" = True Positive; คำอธิบายในวงเล็บ ("Strict Required violation", "< 0 or > 100 impossibility") และข้อความ "Zero Data Loss: Borderline records are routed to Human Review rather than deleted" ตายตัว 🔴 (หมายเหตุ: ข้อความ "< 0 or > 100" ตายตัว แม้ผู้ใช้จะเปลี่ยนช่วงในขั้น 3)
  - **มีเฉพาะเมื่อ `error_reconciliation` มีค่า** จึงไม่แสดงในกรณี NOT_APPLICABLE

- **[การ์ด "Step 10: Downstream Business Utilization (Cleaned Data Analytics)" (การ์ดตัวเลข 4 ใบ)]** → (1) ไม่มีการกด (2) ตัวอย่างการใช้ข้อมูลที่ผ่านคัดแยกแล้ววิเคราะห์ผลการเรียน (3) `analyticsResult` ← `GET /whitebox/downstream-analytics` (`:274-286, 1317-1343`) → `whitebox.py:872-925` อ่าน `clean_dataset_run.csv` (4) 🟡 Analyzed Clean Records = จำนวนแถว Clean; Average Course Score = ค่าเฉลี่ย score; Pass Rate = `จำนวนแถว score ≥ 50 ÷ ทั้งหมด × 100` (**เกณฑ์ผ่าน 50 ตายตัวในโค้ด** `:889-891` 🔴); Passed/Failed = จำนวนแถว score ≥ 50 / < 50 ชื่อหัวข้อ "Step 10" ตายตัว 🔴

- **[ตาราง "Performance by Course"]** → จำนวน, ค่าเฉลี่ย, ต่ำสุด, สูงสุด, ส่วนเบี่ยงเบนมาตรฐานของ score ต่อรายวิชา (`groupby("course")` `whitebox.py:884-886`; `:1346-1374`) 🟡

- **[แถบ "Grade Distribution (Clean Data)" (กราฟแท่งแนวนอน A–F)]** → (1) ไม่มีการกด (2) สัดส่วนเกรดของข้อมูลสะอาด (3) จำนวนต่อเกรดจาก backend (`whitebox.py:893-907`) ส่วนเปอร์เซ็นต์และความกว้างแท่ง = `จำนวน ÷ clean_records_analyzed × 100` คำนวณในหน้าเว็บ (`:1380-1397`) (4) 🟡 **เกณฑ์เกรดตายตัวในโค้ด** (A ≥ 80, B ≥ 70, C ≥ 60, D ≥ 50, F ต่ำกว่านั้น `whitebox.py:894-905`) 🔴 สีแท่งกำหนดใน CSS (`WhiteBoxPipeline.css:593-597`) หมายเหตุ: backend ส่ง `score_distribution_brackets` (ช่วงคะแนน 0–20 … 81–100) มาด้วย แต่หน้าไม่แสดง ⚪

- **[ปุ่ม "⬅ ย้อนกลับ: Stage 4" / "กลับไปจุดเริ่มต้น: Stage 0"]** → เปลี่ยนขั้นเท่านั้น (`:1403-1411`) 🔴

## B.9 หลักฐานจาก Spark pipeline จริง (ไม่ปรากฏบนหน้านี้) — เพื่อให้ตอบอาจารย์ได้ว่าอะไรอยู่ที่ไหน

หน้า Audit Trail **ไม่อ่าน** ข้อมูลต่อไปนี้ แต่นี่คือสิ่งที่ Spark ผลิตจริงและไปปรากฏที่หน้าอื่น (Pipeline, Dashboard, Rules, Catalog)

| ขั้นใน Spark (`services/spark/sdoqap/stages/`) | ผลที่ออกมา (ตามโค้ด) | ที่เก็บ |
|---|---|---|
| `schema_drift` (schema.py:101) | ผล drift และ proposal | ES `sdoqap_schema_drifts`, `sdoqap_schema_proposals` → หน้า Catalog |
| `anomaly_iqr` (anomaly.py:6) | ถ้าเปิดโหมด `value_range` คำนวณช่วงปกติแบบ IQR แล้วแยกแถวผิดปกติเป็น Quarantine ด้วยเหตุผลระบุในแถว | ผลใน Delta + `value_range_profile` ในเอกสารรัน |
| `anomaly_zscore`, `anomaly_induced` (anomaly.py:47, :78) | ตรวจ anomaly ด้วย Z-score และใช้กฎที่เรียนจาก Decision Tree | อยู่ในผลรัน |
| `ai_advisory` (advisory.py:6) | ถ้าเปิด `ai_advisor` รัน data-profile cycle (PSI), เรียก AI (`ai_rule_advisor`) วิเคราะห์ตัวอย่างแถวที่ถูกกักกัน และ **บันทึกเป็น proposal รอคนอนุมัติ ไม่เขียนกฎเองโดยตรง** (advisory.py:97-110, :126-139) | `sdoqap_data_profiles`, proposal ผ่าน `advisor.log_proposal_to_es` → หน้า Rules |
| `report` (report.py:52) | สรุปรอบรัน: จำนวนแถว, แถว clean/quarantine, `quality_score`, ค่า freshness, `z_score`, `is_anomaly`, `null_profile`, เวลาของแต่ละขั้น ฯลฯ (`build_quality_run_doc` report.py:9-49) | ES `sdoqap_quality_runs`, `sdoqap_lineage_runs`, `sdoqap_pipeline_runs` (report.py:60-77) |
| `common/profile.py` `null_profile` | อัตราค่าว่างต่อคอลัมน์เทียบกับค่าที่ยอมรับ | อยู่ใน `quality_runs` อ่านโดยหน้า Rules (Column Profiler) ตามคำอธิบายหัวไฟล์ |
| `common/ship.py` `ship_package` | **ไม่ใช่หลักฐาน** เป็นเพียงการ zip โค้ดแพ็กเกจ `sdoqap` ส่งให้เครื่อง Spark worker ใช้งาน (ship.py:10-21) | ไฟล์ zip ชั่วคราว |

ข้อสังเกตเพื่อความตรงไปตรงมา: ตัวเลข "Raw Quality Score" และกฎ IQR ของหน้า Audit Trail เป็นคนละระบบกับ `quality_score` ที่ Spark คำนวณ (`stages/metrics.py:161`) หน้าทั้งสองจึงไม่จำเป็นต้องมีตัวเลขตรงกัน

## B.10 สรุปหน้า Audit Trail

- **หน้านี้มีไว้ทำอะไร?** เป็นเดโมแบบ "กล่องใส" ที่แสดงทีละขั้นว่าระบบสำรวจข้อมูล เสนอกฎพร้อมเหตุผล คัดแยกเป็น Clean/Review/Quarantine และตรวจผลเทียบเฉลย บนชุดข้อมูลตัวอย่างคะแนนนักศึกษา (ไม่ใช่ผลของ Spark pipeline จริง)
- **ผู้ใช้ทำอะไรได้?** กดรันอัตโนมัติทุกขั้น วิเคราะห์/รวมตาราง กรอกบริบทธุรกิจ เปิด-ปิดกฎและปรับตัวคูณ IQR/ช่วงค่า สั่งรันคัดแยกใหม่ และกดตรวจผลเทียบเฉลย (ไม่มีอัปโหลด/เลือก connector ในหน้านี้ ไม่มีการอนุมัติแถวใน Review)
- **ระบบทำอะไรเบื้องหลัง?** API (FastAPI + pandas) อ่านไฟล์ CSV ตัวอย่าง คำนวณโปรไฟล์ ออกกฎด้วยแม่แบบข้อความ คัดแยกทีละแถว เขียนไฟล์ CSV ผลลัพธ์ แล้วเทียบกับ `ground_truth.csv` โดยเก็บผลล่าสุดในหน่วยความจำ ไม่ใช้ Spark/ES/LLM

---

# ส่วนที่ C — ตารางสรุปสิ่งที่ต้องบอกอาจารย์ตรง ๆ (Mock / Static / ไม่ได้เชื่อมจริง)

| # | หน้า | สิ่งที่พบ | หลักฐาน | ป้าย |
|---|---|---|---|---|
| 1 | Catalog | ไม่มีรายการตาราง/ดูตัวอย่างข้อมูล/ลบตาราง ทั้งที่เมนูชื่อ Catalog | `Schema.jsx` ทั้งไฟล์, `schema.py` | ⚪ |
| 2 | Catalog | ป้าย SEV ของ proposal จริงจาก Spark แสดง 1 เสมอ (อ่านฟิลด์ผิดชื่อ) | `Schema.jsx:400` vs `stages/schema.py:169` | 🔴 |
| 3 | Catalog | ค่าตั้งต้น Primary Key / Partition Date ฮาร์ดโค้ดตามชื่อตาราง และไม่ตรงกับทะเบียนจริงของบางตาราง อนุมัติโดยไม่แก้จะเขียนทับ | `Schema.jsx:59-81`, `schema.py:139-142` | 🔴 |
| 4 | Catalog | กล่อง "จำลองการเปลี่ยน Schema" สร้าง proposal ที่ schema ฮาร์ดโค้ดเป็นคอลัมน์นักศึกษา; ถ้าอนุมัติจะเขียนทับ schema ตารางนั้น | `schema.py:410-416, 144` | 🔴 |
| 5 | Catalog | ถ้าเขียน ES ไม่สำเร็จ ปุ่ม "บันทึก" ยังตอบสำเร็จ (`created_local`); ถ้า ES ล่ม รายการ/badge ว่างเงียบ ๆ | `schema.py:41-46, 427-433` | ⚪ |
| 6 | Catalog | ข้อความยืนยันปฏิเสธว่า "ข้อมูลจะถูกกักกัน" แต่โค้ดเปลี่ยนแค่สถานะ | `Schema.jsx:447` vs `schema.py:207-219` | 🔴 |
| 7 | Catalog | เส้นทางอนุมัติอัตโนมัติแทบไม่ถูกใช้ (ไม่มีนโยบาย `schema_evolution` ที่ตั้งค่าไว้) proposal จึงเป็น PENDING เสมอ | `stages/schema.py:177-190` + grep | 🟡 |
| 8 | Audit Trail | หน้านี้ไม่ใช่ผลของ Spark จริง ใช้ pandas บน CSV ตัวอย่าง; ไม่มี LLM | `whitebox.py:1-12`; `WhiteBoxPipeline.jsx` | ภาพรวม |
| 9 | Audit Trail | ตารางข้อมูลนักศึกษา (A) เป็นข้อมูลสังเคราะห์ที่สุ่มสร้าง | `whitebox.py:134-153` | 🔴 |
| 10 | Audit Trail | Confidence 96% ตายตัว, Recommended Join = Left ตายตัว, ชนิดความต่างและรูปแบบวันที่เป็นข้อความตายตัว | `whitebox.py:1006, 1024-1029, 1058` | 🔴 |
| 11 | Audit Trail | ตัวเลข 154/100/54 และช่วง 30–60h, 10–12h ในเหตุผลกฎ IQR ตายตัว | `whitebox.py:453-456, 462-463, 469-470` | 🔴 |
| 12 | Audit Trail | "Post-Clean Quality" = 100.0 ตายตัว; "100% Validated" ตายตัว; แบนเนอร์ "SLA COMPLIANCE VERIFIED" แสดงเสมอ | `whitebox.py:721`; `WhiteBoxPipeline.jsx:1128,1233` | 🔴 |
| 13 | Audit Trail | ป้าย "User Confirmed" ขึ้นก่อนผู้ใช้ทำอะไร (accepted=True ตั้งแต่สร้าง); Stepper ขั้น 2 เขียวเสมอ | `whitebox.py:390`; `WhiteBoxPipeline.jsx:391, 1005` | ⚪ |
| 14 | Audit Trail | ช่อง Criticality และ Required ของ study_hours ไม่มีผลต่อกฎ; กฎ freshness รับ/ไม่รับแล้วไม่มีผลต่อการคัดแยก | `whitebox.py:364-514, 604-734` | ⚪ |
| 15 | Audit Trail | ปุ่มพรีเซ็ต IQR (`applyIqrPreset`) ไม่มีปุ่มเรียก; ค่า "Outlier Threshold" ไม่อัปเดตตามตัวคูณ | `WhiteBoxPipeline.jsx:219-233, 1052` | ⚪ |
| 16 | Audit Trail | ข้อมูลที่ API ส่งแต่หน้าไม่แสดง: แถวตัวอย่าง quarantine/review, ที่อยู่ไฟล์, ช่วงคะแนน | `whitebox.py:723-730, 913` | ⚪ |
| 17 | Audit Trail | ผลข้างเคียง: ขั้น 4 เขียนทับไฟล์ที่หน้า Export/Pipeline ใช้ร่วม และขั้นเชื่อมตารางเขียนทับแคชโปรไฟล์ที่หน้าอื่นใช้ | `whitebox.py:699-706, 1119-1121` | หมายเหตุ |
