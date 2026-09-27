# 09. การเลื่อนของ Schema และขั้นตอนอนุมัติใน Catalog (Schema Drift Detection & Catalog Approval Flow)

> ผู้ใช้เห็นส่วนนี้ที่: หน้า **Catalog** (`/schema`, label "Catalog" ใน `ui/src/config/pages.js:16`) · โค้ดหลัก: `spark/spark_quality_engine.py:1891-2026`, `api/app/api/schema.py:38-435`

## 1. คำตอบ 30 วินาที

ทุกรอบที่ Spark รันคุณภาพข้อมูล ระบบจะเทียบคอลัมน์ที่โหลดมาจริงกับ **schema ที่ลงทะเบียนไว้** (`spark/spark_quality_engine.py:1892-1933`) แล้วจัดผลต่างเป็น 3 แบบ: คอลัมน์หาย (เติม null ให้อัตโนมัติ), ชนิดข้อมูลไม่ตรง (แปลงเป็นข้อความ), และคอลัมน์ใหม่ (รับเข้า schema ชั่วคราว) — สองแบบแรกมีน้ำหนักความรุนแรง 5 แต่ละคอลัมน์ ส่วนแบบที่สามมีน้ำหนัก 1 (`:1938-1946`) ถ้าการเปลี่ยนแปลง **ทั้งหมด**เป็นคอลัมน์ใหม่เท่านั้น **และ**นโยบายของตารางอนุญาต **และ**ไม่บังคับให้คนอนุมัติ **และ**จำนวนคอลัมน์รวมไม่เกิน 50 ระบบจะแก้ schema ให้เองทันที (`:1969-1979`) มิฉะนั้นจะบันทึกข้อเสนอ (proposal) สถานะ `PENDING` หรือ `REJECTED` พร้อมเหตุผลลง Elasticsearch ไว้ให้คนตัดสินใจภายหลัง (`:1993-2017`) — **ไม่ว่าจะเป็นสถานะไหน การรันรอบนั้นก็เดินหน้าประมวลผลต่อทันทีด้วยข้อมูลที่เพิ่งแก้ไข (เติม null / บังคับเป็นข้อความ) ไปแล้ว** ไม่มีการหยุดรอคำตอบ (`:2028` เริ่มขั้นถัดไปทันทีหลังบล็อกนี้จบ) ส่วนหน้าเว็บ Catalog มีปุ่ม "จำลองการเปลี่ยน Schema (สำหรับทดสอบ)" ที่**ไม่ได้เดินตรรกะข้างต้นเลยแม้แต่น้อย** — มันยิง endpoint คนละเส้นทาง (`api/app/api/schema.py:386-394`) ที่สร้างเอกสาร PENDING ปลอมด้วยชื่อคอลัมน์และคะแนนความรุนแรงที่เขียนตายตัวในโค้ด ข้อจำกัดใหญ่ที่สุดคือในไฟล์กฎจริงของระบบ (`spark/rules_config.json`) ไม่มีตารางใดตั้งค่า `schema_evolution` เลย จึงใช้ค่าเริ่มต้น `require_approval=True` เสมอ — แปลว่า**เส้นทางอนุมัติอัตโนมัติแทบไม่เคยถูกใช้งานจริงในระบบปัจจุบัน** ทุกการเปลี่ยนแปลง schema ต้องผ่านคนกดอนุมัติทั้งหมด (ดูข้อ 5 และ 7)

## 2. มุมมองแบบ Black Box

ผู้ใช้ไม่เห็นหน้าจอใดๆ ระหว่างที่ Spark กำลังรันอยู่ — สิ่งที่เห็นคือผลลัพธ์ที่มาโผล่ในสองที่:

1. **หน้า Catalog (`/schema`)** แสดงตาราง "รายการข้อเสนอ" ที่กรองตามสถานะ `PENDING` / `APPROVED` / `REJECTED` (ปุ่มกรองที่มุมบน, `ui/src/pages/Schema.jsx:8,13`) แต่ละแถวมีชื่อตาราง คอลัมน์ที่เปลี่ยน เวลาที่เสนอ และปุ่ม "อนุมัติ" / "ปฏิเสธ" ต่อรายการ รวมถึงปุ่มอนุมัติ/ปฏิเสธทั้งหมดพร้อมกัน
2. แถบพับเก็บด้านบนชื่อ **"จำลองการเปลี่ยน Schema (สำหรับทดสอบ)"** (`ui/src/pages/Schema.jsx:197-201`) ให้กรอกชื่อตาราง คอลัมน์ ชนิดข้อมูล และประเภทการเปลี่ยน แล้วกดส่งเพื่อสร้างข้อเสนอ `PENDING` ใหม่ทันที

ผู้ใช้ไม่เห็นว่า: (ก) ข้อเสนอที่เกิดจากปุ่ม "จำลอง" นี้ไม่ได้มาจากการรันคุณภาพข้อมูลจริงเลย เป็นเพียงเอกสารที่สร้างขึ้นตรงๆ ด้วยค่าคอลัมน์ที่ตายตัวในโค้ดฝั่ง API (ตาราง `student_course_scores` ที่มีคอลัมน์ `student_id, course, score, study_hours` เสมอ ไม่ว่าจะพิมพ์ชื่อตารางอะไรลงในฟอร์ม) (ข) กด "อนุมัติ" แล้ว ระบบไม่ได้ตรวจสอบเลยว่าการเปลี่ยนแปลงนั้น "อันตราย" แค่ไหน — แม้จะเป็นคอลัมน์ที่ชนิดข้อมูลเปลี่ยน (severity สูงสุด) ก็อนุมัติได้ด้วยการกดครั้งเดียวเหมือนคอลัมน์ใหม่ธรรมดา (ดูหลักฐานจริงในข้อ 5)

## 3. การทำงานภายใน (White Box)

```mermaid
flowchart TD
    A["load_expected_schema(table_name)<br/>(spark/spark_quality_engine.py:1349-1427)"] --> B{"มีเอกสารใน ES<br/>sdoqap_schema_registry ไหม? (:1358-1364)"}
    B -->|มี| C[ใช้ schema_spec จาก ES]
    B -->|ไม่มี/ES ล่ม| D{"มีไฟล์ /opt/spark-apps/<br/>schema_registry.json ไหม? (:1369-1379)"}
    D -->|มี และเจอชื่อตาราง| E[ใช้ schema_spec จากไฟล์]
    D -->|ไม่มี/ไม่เจอ| F[ใช้ default_registry ในโค้ด<br/>เฉพาะ mbti/users/benchmark_test (:1382-1427)]

    C --> G["เทียบ actual_columns ของ df จริง<br/>กับ schema_spec ทีละคอลัมน์ (:1892-1933)"]
    E --> G
    F --> G

    G --> H{"คอลัมน์ใน schema<br/>หายไปจาก df ไหม? (:1898)"}
    H -->|หาย| I["เติมคอลัมน์ค่า null,<br/>severity += 5, ส่ง alert วิกฤต (:1899-1915)"]
    H -->|มี แต่ชนิดไม่ตรง| J["cast เป็น string,<br/>severity += 5, ส่ง alert วิกฤต (:1916-1926)"]
    H -->|ไม่มีการหาย/ชนิดตรง| K[ไม่มี drift จากคอลัมน์นี้]
    I --> L["คอลัมน์ใน df ที่ไม่มีใน schema?<br/>severity += 1 ต่อคอลัมน์ (:1928-1933)"]
    J --> L
    K --> L

    L --> M{"drift_detected == True?<br/>(:1935)"}
    M -->|ไม่| N["ไม่มีอะไรเกิดขึ้น<br/>เดินหน้าขั้นถัดไปตามปกติ"]
    M -->|ใช่| O["บันทึกลง sdoqap_schema_drifts<br/>พร้อม drift_severity รวม (:1948-1956)"]
    O --> P{"is_safe_drift:<br/>ทุกรายการเป็น new_column เท่านั้นไหม? (:1959)"}
    P --> Q["อ่านนโยบาย schema_evolution ของตาราง<br/>allow_new_columns/max_columns/require_approval (:1962-1965)"]
    Q --> R{"can_auto_approve:<br/>safe AND allow_new AND !require_approval<br/>AND คอลัมน์รวม ≤ max_columns (:1970-1975)"}
    R -->|ใช่| S["auto_evolve_schema_registry เขียนทับ<br/>ES + schema_registry.json ทันที (:1979)<br/>บันทึกข้อเสนอสถานะ APPROVED (:1980-1991)"]
    R -->|ไม่| T["กำหนดสถานะ PENDING หรือ REJECTED<br/>พร้อมเหตุผล (:1993-2004)"]
    T --> U["บันทึกข้อเสนอลง sdoqap_schema_proposals<br/>ส่ง alert (:2006-2026)<br/>registry ไม่ถูกแตะต้อง"]
    S --> V["ขั้นถัดไปของรอบนี้เริ่มทันที<br/>ด้วย df ที่แก้ไขแล้ว (:2028 เป็นต้นไป)"]
    U --> V
    N --> V
```

### 3.1 แหล่งข้อมูล schema ที่ใช้ตัดสิน — ES ก่อน แล้วค่อย fallback

`load_expected_schema` (`spark/spark_quality_engine.py:1349-1427`) พยายามอ่านเอกสารชื่อตารางจากดัชนี Elasticsearch `sdoqap_schema_registry` ก่อนเสมอ (`:1357-1364`) ถ้า ES ตอบ 200 ใช้ค่านั้นทันที ถ้า ES เรียกไม่สำเร็จ (timeout, connection error) หรือหาไม่เจอ (404 ทำให้ไม่เข้า `if res.status_code == 200`) จะตกไปอ่านไฟล์ `/opt/spark-apps/schema_registry.json` **ในคอนเทนเนอร์ spark** (ไม่ใช่ไฟล์ `spark/schema_registry.json` ที่อยู่ในซอร์สโค้ดโดยตรง — สองไฟล์นี้เป็นคนละที่ในเชิงระบบไฟล์ แต่มี mount ให้เนื้อหาซิงก์กัน) เทียบชื่อตารางแบบ normalize (`normalize_name`, `:1373-1376`) ถ้ายังไม่เจออีก ใช้ `default_registry` ที่เขียนตายตัวในโค้ด ครอบคลุมแค่ 3 ตาราง (`mbti`, `users`, `benchmark_test`, `:1382-1420`) ถ้าไม่เจอเลยทั้งสามชั้น ฟังก์ชันคืน `None` (พฤติกรรมของโค้ดเรียกต่อเมื่อไม่มี schema เลยไม่ได้อยู่ในขอบเขตบทนี้)

**ตรวจสอบตรงในสภาพแวดล้อมนี้ (2026-09-27):** `curl -u elastic:*** http://localhost:9200/sdoqap_schema_registry/_doc/users` คืน `{"_index":"sdoqap_schema_registry","_id":"users","found":false}` — แปลว่าตาราง `users` **ไม่มี**เอกสารใน ES เลยในตอนนี้ ทุกครั้งที่รันตาราง `users` ระบบจึงตกไปใช้ไฟล์ `schema_registry.json` ในคอนเทนเนอร์เสมอ (ชั้นที่ 2) ไม่ใช่ ES (ชั้นที่ 1) ตามที่ docstring ของฟังก์ชันอาจให้ความรู้สึกว่า ES เป็นแหล่งหลักที่ใช้งานจริงเป็นประจำ

### 3.2 จัดประเภทความต่างของ schema — 3 แบบ (`:1892-1933`)

โค้ดสร้าง `actual_columns` จากชนิดข้อมูลจริงของ DataFrame ที่โหลดมา (`:1892`) แล้ววนสองรอบ:

- **รอบที่ 1 (`:1897-1926`):** วนทุกคอลัมน์ใน `schema_spec` (schema ที่ลงทะเบียนไว้) ถ้าคอลัมน์นั้น**ไม่มีอยู่ใน `actual_columns`** เลย → ประเภท `missing_column` เติมคอลัมน์นั้นด้วย `F.lit(None)` cast เป็นชนิดที่คาดไว้ (`:1901-1909`) ถ้า**มีอยู่แต่ชนิดไม่ตรง** → ประเภท `type_mismatch` บังคับ cast เป็น `string` ทั้งคอลัมน์ (`:1919`) แล้วปรับ `schema_spec[col_name]` เป็น `"StringType"` ในหน่วยความจำสำหรับรอบนี้ด้วย (`:1920` — ไม่ได้เขียนกลับ registry ถาวร เป็นแค่ค่าที่ใช้ต่อในรอบนี้)
- **รอบที่ 2 (`:1929-1933`):** วนทุกคอลัมน์ใน `actual_columns` (ซึ่งตอนนี้รวมคอลัมน์ที่เพิ่งเติม null เข้าไปจากรอบที่ 1 แล้ว) ถ้าคอลัมน์ใด**ไม่มีอยู่ใน `schema_spec` เดิม** → ประเภท `new_column` เพิ่มเข้า `schema_spec` ในหน่วยความจำของรอบนี้ทันที (`:1933`)

ทั้งหมดนี้ทำให้ `df` ถูกแก้ไขจริง (เติมค่า/บังคับชนิด) ก่อนจะเดินหน้าไปขั้นตรวจรายแถวและทำความสะอาดต่อไป ไม่ว่าจะมีคนอนุมัติ schema หรือยัง

### 3.3 น้ำหนักความรุนแรง 5/5/1 และการตัดสินว่า "ปลอดภัย" ไหม

`total_drift_severity` สะสมทีละคอลัมน์ที่พบความต่าง (`:1938-1946`): `new_column` = 1, `missing_column` = 5, `type_mismatch` = 5 — ผลรวมนี้ (ไม่ใช่จำนวนคอลัมน์ที่ต่าง) ถูกบันทึกเป็น `drift_severity` ทั้งในดัชนี `sdoqap_schema_drifts` (`:1954`) และ `sdoqap_schema_proposals` (`:1986`, `:2012`) [บทที่ 02](02-spark-batch-quality-engine.md) ใช้ตัวเลขนี้ต่อในสูตรผลกระทบทางการเงิน ([บทที่ 07](07-copdq-financial-impact.md))

`is_safe_drift` (`:1959`) เป็น `True` ก็ต่อเมื่อ**ทุก**รายการใน `drift_details` มี `error == "new_column"` เท่านั้น — ถ้ามีแม้แต่ 1 คอลัมน์ที่เป็น `missing_column` หรือ `type_mismatch` ปนอยู่ ทั้งชุดจะถือว่า **ไม่ปลอดภัย** ทันที ไม่ว่าจำนวนคอลัมน์ใหม่ที่ปลอดภัยจะมีมากแค่ไหนก็ตาม

### 3.4 ประตูอนุมัติอัตโนมัติ — 4 เงื่อนไขต้องผ่านพร้อมกัน (`:1958-1975`)

นโยบายต่อตารางอ่านจากคีย์ `schema_evolution` ของไฟล์กฎ (`rules.get("schema_evolution", {})`, `:1962`) มีค่าเริ่มต้นถ้าไม่ตั้งไว้: `allow_new_columns=True`, `max_columns=50`, `require_approval=True` (`:1963-1965`) `can_auto_approve` เป็นจริงก็ต่อเมื่อครบทั้ง 4 ข้อพร้อมกัน (`:1970-1975`):

1. `is_safe_drift` — เป็นแค่คอลัมน์ใหม่เท่านั้น
2. `policy_allow_new` — นโยบายอนุญาตคอลัมน์ใหม่ (ค่าเริ่มต้น `True`)
3. `not policy_req_approval` — นโยบาย**ไม่บังคับ**ให้คนอนุมัติ (ค่าเริ่มต้นของ `policy_req_approval` คือ `True` ดังนั้นเงื่อนไขนี้เป็น `False` โดยปริยายถ้าไม่มีใครตั้งค่าไว้)
4. `num_proposed_cols <= policy_max_cols` — **`num_proposed_cols` คือ `len(actual_columns)` ซึ่งเป็นจำนวนคอลัมน์ทั้งหมดของตารางหลังรวมคอลัมน์ที่เติม null แล้ว ไม่ใช่จำนวนคอลัมน์ที่เพิ่งเปลี่ยนแค่ตัวมันเอง** — เทียบกับ `max_columns` (ค่าเริ่มต้น 50) คือความกว้างทั้งตาราง

ถ้าครบทั้ง 4 ข้อ: `auto_evolve_schema_registry(table_name, actual_columns)` เขียนทับ `sdoqap_schema_registry` ใน ES และไฟล์ `schema_registry.json` ในคอนเทนเนอร์ทันที พร้อมสำรองไฟล์เดิมเป็น `.bak` (`spark/spark_quality_engine.py:1475-1493`) แล้วบันทึกข้อเสนอสถานะ `APPROVED` ไว้เป็นประวัติ (`:1980-1991`) — เส้นทางนี้**ไม่มีคนกดอะไรเลย**

### 3.5 เมื่ออนุมัติอัตโนมัติไม่ได้ — PENDING หรือ REJECTED พร้อมเหตุผล (`:1993-2004`)

ถ้า `can_auto_approve` เป็นเท็จ โค้ดไล่ตรวจ 3 เงื่อนไขตามลำดับเพื่อตั้งค่า `status`/`reason`:

| เงื่อนไข | สถานะ | เหตุผลที่บันทึก |
|---|---|---|
| `not policy_allow_new` และเป็นคอลัมน์ใหม่ล้วน | `REJECTED` | "Blocked by governance policy: allow_new_columns is set to false" |
| จำนวนคอลัมน์รวมเกิน `max_columns` | `REJECTED` | "Blocked by governance policy: proposed column count (...) exceeds limit (...)" |
| มีคอลัมน์หาย/ชนิดเปลี่ยนปน (ไม่ปลอดภัย) | `PENDING` (ค่าเริ่มต้น) | "Contains dangerous changes (missing columns or type mismatches)" |
| ไม่เข้ากรณีใดข้างบน (ปลอดภัยแต่แค่ต้องรอคนอนุมัติเพราะ `require_approval=True`) | `PENDING` (ค่าเริ่มต้น) | "Awaiting manual approval" |

ทุกกรณีบันทึกลง `sdoqap_schema_proposals` (`:2006-2017`) และพิมพ์ log ย้ำชัดเจนว่า `schema_registry.json NOT modified` (`:2019`) พร้อมส่งแจ้งเตือนผ่าน `send_n8n_alert` — รายละเอียดว่าแจ้งเตือนไปช่องทางไหนจริง (n8n/Slack/LINE) จะอยู่ในบทที่ 13 (ยังไม่ได้เขียน ณ วันที่บันทึกนี้)

### 3.6 การรันรอบนั้นไม่หยุดรอ — เดินหน้าต่อด้วยข้อมูลที่แก้ไขแล้วทันที

ไม่ว่าผลจะเป็น `APPROVED` อัตโนมัติ, `PENDING`, หรือ `REJECTED` โค้ดไม่มี `return`/`raise` คั่นกลางเลย — บรรทัดถัดจากบล็อกทั้งหมดนี้ (`:2028`) คือขั้น "AUTO-CLEANSING & HEALING" ที่ทำงานต่อทันทีด้วย `df` ตัวเดียวกัน ซึ่งคอลัมน์ที่หายไปได้ถูกเติม `null` แล้วและคอลัมน์ที่ชนิดไม่ตรงได้ถูกบังคับเป็น `string` แล้วตั้งแต่ข้อ 3.2 — พฤติกรรมนี้เชื่อมกับ [บทที่ 02](02-spark-batch-quality-engine.md) โดยตรง: ขั้น 6 ของบทที่ 02 กักกัน**ทุกแถว**ที่มีค่าว่างในคอลัมน์ตาม schema (`spark/spark_quality_engine.py:2075-2088`, ดูสรุปที่ `docs/whitebox-report/02-spark-batch-quality-engine.md:74`) เมื่อรวมกับข้อเท็จจริงว่าคอลัมน์ที่หายไปทุกแถวจะมีค่า `null` เหมือนกันหมด (เพราะเติมด้วย `F.lit(None)` แบบเดียวกันทุกแถว, `:1909`) ผลคือ**ทุกแถวของรอบนั้นถูกกักกัน**ด้วยเหตุผล `null_value_in_<คอลัมน์ที่หาย>` โดยอัตโนมัติ ไม่ต้องรอให้ proposal ถูกอนุมัติหรือปฏิเสธก่อนแต่อย่างใด — proposal เป็นแค่บันทึกไว้ให้คนตัดสินใจว่าจะแก้ schema ระยะยาวอย่างไร ไม่ใช่ตัวหยุดข้อมูลรอบนั้น

### 3.7 สิ่งที่ endpoint อนุมัติ/ปฏิเสธจริงเขียนกลับ (`api/app/api/schema.py`)

`approve_proposal` (`:63-183`) อ่านเอกสาร proposal จาก `sdoqap_schema_proposals` ด้วย `proposal_id`, ตรวจว่าสถานะยังเป็น `PENDING` อยู่ (`:80-84`, ถ้าไม่ใช่คืน 400) แล้ว:

1. อ่าน (หรือสร้างค่าเริ่มต้นจาก `default_registry`/พารามิเตอร์ override) เอกสาร `sdoqap_schema_registry` ปัจจุบันของตารางนั้น (`:129-137`)
2. แทนที่ `schema_spec` ทั้งหมดด้วย `proposed_schema` ของ proposal นั้น (`:144`) แล้วเขียนทับเข้า ES (`:145`)
3. ถ้าไฟล์ `schema_registry.json` (path ที่ resolve ได้จาก `_resolve_schema_registry_path`, `:18-32`) มีอยู่จริง อ่าน-แก้-เขียนทับกลับด้วย `json.dump` (`:149-159`) — **ขั้นตอนนี้ไม่ได้สร้างไฟล์ `.bak` สำรอง** ต่างจากเส้นทางอนุมัติอัตโนมัติในข้อ 3.4 ที่สำรองไฟล์เดิมไว้เสมอ
4. อัปเดตสถานะ proposal เป็น `APPROVED` ด้วย optimistic concurrency control (`if_seq_no`/`if_primary_term` จาก `_seq_no`/`_primary_term` ที่อ่านมาตอนต้น, `:165-172`) ถ้ามีคนอื่นแก้ proposal เดียวกันไปพร้อมกัน (เช่นกดปฏิเสธพร้อมกัน) จะได้ `ConflictError` แล้วคืน HTTP 409 ให้ผู้ใช้โหลดใหม่ (`:173-177`)

**`approve_proposal` ไม่ตรวจ `drift_severity` หรือประเภทของการเปลี่ยนแปลงเลยแม้แต่น้อย** — ฟังก์ชันรับได้ทุก proposal ที่ยังเป็น `PENDING` ไม่ว่าจะเป็นคอลัมน์ใหม่ปลอดภัยหรือ type_mismatch อันตราย (severity 5) เพียงแค่มีคนกดปุ่มก็ผ่าน (ดูหลักฐานจริงในข้อ 5)

`reject_proposal` (`:186-223`) สั้นกว่ามาก — ตรวจสถานะ `PENDING` เหมือนกัน แล้วอัปเดตสถานะเป็น `REJECTED` ด้วย optimistic concurrency control เดียวกัน (`:207-214`) **ไม่แตะ `sdoqap_schema_registry` เลยแม้แต่ฟิลด์เดียว** registry เดิมยังคงอยู่เหมือนก่อนมี proposal

นอกจากนี้ยังมี `approve_all_proposals`/`reject_all_proposals` (`:226-383`) ที่ UI เรียกผ่านปุ่ม "อนุมัติทั้งหมด"/"ปฏิเสธทั้งหมด" (`ui/src/pages/Schema.jsx:106-120`) ทำตรรกะเดียวกันวนทุก proposal ที่ `PENDING` โดยไม่มีการตรวจ severity เช่นกัน — ต่างกับ `approve_proposal` เดี่ยวตรงที่ไม่ใช้ optimistic concurrency control ต่อรายการ (`:322-327`)

### 3.8 ปุ่ม "จำลอง" ไม่ได้เดินตรรกะข้างต้นเลย — สร้างเอกสารปลอมตรงๆ

`create_schema_proposal` (`api/app/api/schema.py:388-434`) ผูกกับ**สอง** route พร้อมกัน: `POST /schema/proposals/create` และ `POST /schema/proposals/simulate` (`:386-387`) — เป็นฟังก์ชันเดียวกันทุกประการ แต่หน้าเว็บ Catalog เรียกเฉพาะ `/schema/proposals/create` เท่านั้น (`ui/src/pages/Schema.jsx:89`) เส้นทาง `/simulate` มีอยู่ใน API แต่ไม่มีปุ่มไหนในหน้าเว็บเรียกมันเลย ฟังก์ชันนี้**ไม่อ่าน DataFrame จริง ไม่เรียก `load_expected_schema` ไม่คำนวณ `drift_severity` และไม่ผ่าน `can_auto_approve` เลยแม้แต่น้อย** — มันแค่รับชื่อตาราง/คอลัมน์/ชนิดข้อมูลจากฟอร์ม (หรือใช้ค่าเริ่มต้นตายตัวถ้าไม่กรอก: ตาราง `student_course_scores`, คอลัมน์ `gpa_weighted`, ชนิด `DoubleType`) แล้วประกอบเอกสาร `PENDING` ที่มี `proposed_schema` เป็น**ชุดคอลัมน์ตายตัว 4 คอลัมน์เสมอ** (`student_id, course, score, study_hours` บวกคอลัมน์ที่กรอก, `:411-417`) ไม่เกี่ยวกับ schema จริงของตารางที่พิมพ์ชื่อไปเลย และให้คะแนน `severity_score` ด้วยสูตรคนละอันจากของจริง: `2` ถ้า `drift_type == "type_mismatch"` มิฉะนั้น `1` (`:402`) — เทียบกับสูตรจริงที่ให้ `type_mismatch` = 5 เท่ากับ `missing_column` (ข้อ 3.3) ตัวเลขจากปุ่มนี้จึงใช้เปรียบเทียบกับตัวเลขจาก proposal จริงไม่ได้เลย เพราะคนละมาตราส่วน (ยืนยันด้วยหลักฐานจริงในข้อ 5)

## 4. เดินผ่านโค้ดจริง

**บล็อกที่ 1 — ตรวจคอลัมน์หายและชนิดไม่ตรง**

```python
# spark/spark_quality_engine.py:1896-1925
    # 1.1 Check missing columns in DF (API didn't send them)
    for col_name, expected_type in schema_spec.items():
        if col_name not in actual_columns:
            drift_detected = True
            drift_details[col_name] = {"error": "missing_column", "action": "auto_filled_null"}
            # Auto fill with null casted to expected type
            spark_type_map = {
                "IntegerType": "integer",
                "DoubleType": "double",
                "TimestampType": "timestamp",
                "StringType": "string"
            }
            sql_type = spark_type_map.get(expected_type, "string")
            df = df.withColumn(col_name, F.lit(None).cast(sql_type))
            actual_columns[col_name] = expected_type
            send_n8n_alert(
                title=f"🚨 CRITICAL Schema Drift: Missing Column in {table_name}",
                message=f"Column '{col_name}' is missing from source data. Auto-healed with NULLs.",
                severity="critical"
            )
        elif actual_columns[col_name] != expected_type:
            drift_detected = True
            drift_details[col_name] = {"error": "type_mismatch", "expected": expected_type, "actual": actual_columns[col_name], "action": "coerced_to_string"}
            df = df.withColumn(col_name, F.col(col_name).cast("string"))
            schema_spec[col_name] = "StringType"
            actual_columns[col_name] = "StringType"
            send_n8n_alert(
                title=f"🚨 CRITICAL Schema Drift: Type Mismatch in {table_name}",
                message=f"Column '{col_name}' changed from {expected_type} to {actual_columns[col_name]}.",
                severity="critical"
```

| บรรทัด | ทำอะไร |
|---|---|
| 1897-1900 | ถ้าคอลัมน์ที่ลงทะเบียนไว้ไม่มีอยู่ใน DataFrame จริงเลย → ประเภท `missing_column` |
| 1902-1909 | สร้างคอลัมน์นั้นขึ้นมาเองด้วยค่า `null` ที่ cast เป็นชนิดที่คาดไว้ (แผนที่ชนิด Spark→SQL 4 แบบ ถ้าไม่ตรงกับ 4 แบบนี้ ใช้ `string` เป็นค่าตั้งต้น) |
| 1910 | ปรับ `actual_columns` ให้ตรงกับ `expected_type` ในหน่วยความจำ เพื่อให้ตรรกะขั้นถัดไป (คอลัมน์ใหม่) ไม่เข้าใจผิดว่าคอลัมน์นี้เป็น "คอลัมน์ใหม่" |
| 1911-1915 | ส่งแจ้งเตือนระดับ `critical` ทันทีที่พบคอลัมน์หาย |
| 1916-1921 | ถ้าคอลัมน์มีอยู่แต่ชนิดต่างจากที่ลงทะเบียน → ประเภท `type_mismatch` บังคับ cast เป็น `string` ทั้งคอลัมน์ แล้วปรับทั้ง `schema_spec` และ `actual_columns` ในหน่วยความจำเป็น `StringType` สำหรับรอบนี้ |
| 1922-1926 | ส่งแจ้งเตือนระดับ `critical` เช่นเดียวกับคอลัมน์หาย — สองกรณีนี้ถือว่าอันตรายเท่ากันในเชิงการแจ้งเตือน |

**บล็อกที่ 2 — ตรวจคอลัมน์ใหม่**

```python
# spark/spark_quality_engine.py:1926-1933
            )

    # 1.2 Check new columns in DF (API sent extra fields)
    for col_name, actual_type in list(actual_columns.items()):
        if col_name not in schema_spec:
            drift_detected = True
            drift_details[col_name] = {"error": "new_column", "actual": actual_type, "action": "auto_added"}
            schema_spec[col_name] = actual_type
```

| บรรทัด | ทำอะไร |
|---|---|
| 1929 | วนทุกคอลัมน์ใน `actual_columns` **หลังจาก**รอบตรวจคอลัมน์หาย/ชนิดไม่ตรงจบแล้ว (จึงรวมคอลัมน์ที่เพิ่งถูกเติม `null` เข้าไปด้วย แต่คอลัมน์เหล่านั้นถูกกันไว้แล้วในข้อ 1910 ว่าไม่ใช่คอลัมน์ใหม่) |
| 1930-1933 | ถ้าคอลัมน์นั้นไม่มีอยู่ใน `schema_spec` เดิมเลย → ประเภท `new_column` แล้วเพิ่มเข้า `schema_spec` ในหน่วยความจำของรอบนี้ทันที (ไม่รอการอนุมัติ — แค่ทำให้ขั้นตอนตรวจสอบต่อจากนี้ในรอบเดียวกันไม่ฟ้องว่าคอลัมน์นี้ขาดหาย) |

**บล็อกที่ 3 — ประตูอนุมัติอัตโนมัติ**

```python
# spark/spark_quality_engine.py:1958-1975
        # FIX 2B: Self-Healing Schema Evolution Gate with Governance Policy
        is_safe_drift = all(details["error"] == "new_column" for details in drift_details.values())
        
        # Load schema evolution governance configurations
        se_config = rules.get("schema_evolution", {})
        policy_allow_new = se_config.get("allow_new_columns", True)
        policy_max_cols = se_config.get("max_columns", 50)
        policy_req_approval = se_config.get("require_approval", True)
        
        num_proposed_cols = len(actual_columns)
        
        # Auto approve only if safe drift, new columns allowed, no manual approval required, and columns under limit
        can_auto_approve = (
            is_safe_drift and 
            policy_allow_new and 
            (not policy_req_approval) and 
            (num_proposed_cols <= policy_max_cols)
        )
```

| บรรทัด | ทำอะไร |
|---|---|
| 1959 | `is_safe_drift` เป็นจริงก็ต่อเมื่อ**ทุก**รายการใน `drift_details` เป็น `new_column` — ใช้ `all(...)` จึงพอมี 1 รายการที่ไม่ใช่ก็ทำให้เป็นเท็จทั้งชุด |
| 1962 | อ่านนโยบายจากไฟล์กฎของตารางนั้น คีย์ `schema_evolution` ถ้าไม่มีคีย์นี้เลยได้ dict ว่าง `{}` |
| 1963-1965 | ค่าเริ่มต้นเมื่อไม่ได้ตั้งนโยบายไว้: อนุญาตคอลัมน์ใหม่ (`True`), เพดาน 50 คอลัมน์, **ต้องมีคนอนุมัติ (`True`)** — ค่าเริ่มต้นข้อสุดท้ายนี้ทำให้ auto-approve เป็นไปไม่ได้โดยปริยายถ้าไม่มีใครตั้งค่าตารางนั้นไว้ชัดเจน |
| 1967 | จำนวนคอลัมน์ที่ใช้เทียบเพดานคือ**ความกว้างทั้งตาราง** (`actual_columns` หลังรวมทุกอย่างแล้ว) ไม่ใช่จำนวนคอลัมน์ที่เพิ่งเปลี่ยน |
| 1970-1975 | ต้องผ่านทั้ง 4 เงื่อนไขพร้อมกันด้วย `and` — ขาดข้อใดข้อหนึ่งก็เป็นเท็จทั้งหมด |

**บล็อกที่ 4 — ตัดสิน PENDING หรือ REJECTED พร้อมเหตุผล**

```python
# spark/spark_quality_engine.py:1993-2004
        else:
            # Requires Data Engineer manual approval or rejected due to policies
            status = "PENDING"
            reason = "Awaiting manual approval"
            if not policy_allow_new and is_safe_drift:
                status = "REJECTED"
                reason = "Blocked by governance policy: allow_new_columns is set to false"
            elif num_proposed_cols > policy_max_cols:
                status = "REJECTED"
                reason = f"Blocked by governance policy: proposed column count ({num_proposed_cols}) exceeds limit ({policy_max_cols})"
            elif not is_safe_drift:
                reason = "Contains dangerous changes (missing columns or type mismatches)"
```

| บรรทัด | ทำอะไร |
|---|---|
| 1995-1996 | ค่าเริ่มต้นก่อนตรวจเงื่อนไขคือ `PENDING` / "Awaiting manual approval" — ครอบคลุมกรณีที่ทุกอย่างปลอดภัยแต่แค่ติดที่ `require_approval=True` |
| 1997-1999 | ถ้าปลอดภัย (คอลัมน์ใหม่ล้วน) แต่นโยบายห้ามคอลัมน์ใหม่ → ปฏิเสธ เหตุผลอ้างนโยบายตรงๆ |
| 2000-2002 | ถ้าจำนวนคอลัมน์รวมเกินเพดาน → ปฏิเสธ ไม่ว่าจะปลอดภัยหรือไม่ก็ตาม (เงื่อนไขนี้เช็คก่อนเงื่อนไข "ไม่ปลอดภัย" ด้านล่าง) |
| 2003-2004 | ถ้ามีคอลัมน์หายหรือชนิดเปลี่ยนปนอยู่ (ไม่ปลอดภัย) แต่ยังไม่เกินเพดานและนโยบายไม่ได้ห้ามคอลัมน์ใหม่ → คงสถานะ `PENDING` แต่เปลี่ยนเหตุผลเป็น "มีการเปลี่ยนแปลงที่อันตราย" |

**บล็อกที่ 5 — แหล่งข้อมูล schema: ES ก่อน ตกไป fallback ไฟล์**

```python
# spark/spark_quality_engine.py:1357-1379
    url = f"{base_url}/sdoqap_schema_registry/_doc/{table_name}"
    try:
        res = requests.get(url, auth=auth, timeout=5)
        if res.status_code == 200:
            doc = res.json().get("_source", {})
            print(f"[REGISTRY] Loaded schema spec for '{table_name}' from Elasticsearch sdoqap_schema_registry.")
            return doc
    except Exception as e:
        print(f"[REGISTRY] Failed to read from Elasticsearch: {e}. Falling back to default registry.")
        
    # Fallback to local schema_registry.json file first
    try:
        registry_file = "/opt/spark-apps/schema_registry.json"
        if os.path.exists(registry_file):
            with open(registry_file, "r", encoding="utf-8") as f:
                disk_registry = json.load(f)
                normalized_target = normalize_name(table_name)
                for tbl_name, spec in disk_registry.items():
                    if normalize_name(tbl_name) == normalized_target:
                        print(f"[REGISTRY] Loaded schema spec for '{tbl_name}' from local schema_registry.json fallback.")
                        return spec
    except Exception as io_err:
        print(f"[REGISTRY] Failed to read schema_registry.json: {io_err}")
```

| บรรทัด | ทำอะไร |
|---|---|
| 1357-1364 | ยิง GET ไปที่เอกสารของตารางนั้นใน ES ถ้าได้ HTTP 200 คืนค่าทันที ไม่ตกไปอ่านไฟล์เลย |
| 1360 | สังเกตว่าเช็คเฉพาะ `== 200` — ถ้า ES ตอบ 404 (ไม่มีเอกสาร) เงื่อนไขนี้เป็นเท็จ โค้ดจะตกลงไปทำงานต่อด้านล่างเงียบๆ โดยไม่มีข้อความ error ใดๆ (ต่างจาก exception ที่มี `print` ใน `except`) |
| 1365-1366 | ถ้า ES เรียกไม่สำเร็จเลย (เช่น timeout) ค่อยพิมพ์ข้อความแจ้ง fallback |
| 1369-1371 | อ่านไฟล์ path ตายตัวในคอนเทนเนอร์ `/opt/spark-apps/schema_registry.json` (mount มาจาก `spark/schema_registry.json` ในซอร์ส) เทียบชื่อตารางแบบ normalize เพื่อให้ทนต่อการสะกดต่างเคส/ขีดล่าง |

**บล็อกที่ 6 — ปุ่ม "จำลอง": สอง route ชี้ฟังก์ชันเดียว สร้างเอกสารปลอมตรงๆ**

```python
# api/app/api/schema.py:386-394
@router.post("/proposals/create")
@router.post("/proposals/simulate")
def create_schema_proposal(payload: dict = None, _user: str = Depends(require_session)):
    """Register a new PENDING schema evolution proposal in Elasticsearch for governance review."""
    payload = payload or {}
    table_name = str(payload.get("table_name") or "student_course_scores").strip()
    column_name = str(payload.get("column_name") or "gpa_weighted").strip()
    column_type = str(payload.get("column_type") or "DoubleType").strip()
    drift_type = str(payload.get("drift_type") or "new_column").strip()
```

| บรรทัด | ทำอะไร |
|---|---|
| 386-387 | ผูกทั้ง `/proposals/create` และ `/proposals/simulate` เข้ากับฟังก์ชันเดียวกันด้านล่าง — ไม่มีความต่างในพฤติกรรมระหว่างสอง path นี้เลย |
| 391-394 | อ่านค่าจาก payload ถ้าไม่ส่งมาใช้ค่าเริ่มต้นตายตัว (`student_course_scores`/`gpa_weighted`/`DoubleType`/`new_column`) — ค่าเหล่านี้**ไม่ได้ตรวจสอบกับ schema จริงของตารางที่ระบุเลย** |

**บล็อกที่ 7 — endpoint อนุมัติ: เขียนทับ registry ทั้งชุดโดยไม่เช็คความรุนแรง**

```python
# api/app/api/schema.py:129-158
    try:
        if es.indices.exists(index="sdoqap_schema_registry") and es.exists(index="sdoqap_schema_registry", id=table_name):
            reg_doc = es.get(index="sdoqap_schema_registry", id=table_name)["_source"]
        else:
            reg_doc = default_registry.get(table_name, {
                "primary_key": primary_key or "id",
                "date_column": date_column,
                "schema_spec": {}
            })
            
        if primary_key:
            reg_doc["primary_key"] = primary_key
        if date_column is not None:
            reg_doc["date_column"] = date_column if date_column != "" else None
            
        reg_doc["schema_spec"] = proposed_schema
        es.index(index="sdoqap_schema_registry", id=table_name, document=reg_doc)
        print(f"[SCHEMA APPROVED] sdoqap_schema_registry updated in ES for '{table_name}'.")
        
        # 2. Update local schema_registry.json on disk if it exists
        try:
            if os.path.exists(SCHEMA_REGISTRY_PATH):
                with open(SCHEMA_REGISTRY_PATH, "r", encoding="utf-8") as f:
                    disk_registry = json.load(f)
                
                disk_registry[table_name] = reg_doc
                
                with open(SCHEMA_REGISTRY_PATH, "w", encoding="utf-8") as f:
                    json.dump(disk_registry, f, indent=2, ensure_ascii=False)
                    f.write("\n")
```

| บรรทัด | ทำอะไร |
|---|---|
| 129 | เริ่ม `try` ครอบทั้งการเขียน ES และไฟล์ดิสก์ — ข้อผิดพลาดใดๆ ในนี้ (นอกเหนือจาก try ซ้อนด้านในสำหรับไฟล์ดิสก์) จะโยนไปเข้า `except` ที่คืน HTTP 500 |
| 130-137 | อ่านเอกสาร registry เดิมจาก ES ถ้ามี ถ้าไม่มีใช้ค่าเริ่มต้นจาก `default_registry` (ครอบคลุมแค่ 3 ตาราง) หรือ dict ว่าง |
| 139-142 | ถ้าผู้อนุมัติระบุ `primary_key`/`date_column` มาใน query string ใช้ค่านั้นแทนที่ค่าเดิม (คุณสมบัตินี้ไม่ปรากฏในหน้า Catalog ปัจจุบัน แต่ endpoint รองรับ) |
| 144-145 | **แทนที่ `schema_spec` ทั้งชุด**ด้วย `proposed_schema` ของ proposal (ไม่ใช่ merge ทีละคอลัมน์) แล้วเขียนทับเอกสารทั้งใบกลับเข้า ES |
| 149-158 | ถ้าไฟล์ registry บนดิสก์มีอยู่จริง อ่านทั้งไฟล์ ปรับเฉพาะ key ของตารางนี้ แล้วเขียนทับทั้งไฟล์กลับ — **ไม่มีการสร้างไฟล์สำรอง `.bak`** ต่างจากเส้นทางอนุมัติอัตโนมัติในข้อ 3.4 |

| บรรทัด | ทำอะไร |
|---|---|
| (ต่อจากบล็อกก่อนหน้า) | ปิด try/except ของการเขียน ES/ไฟล์ — ข้อผิดพลาดใดๆ ระหว่างเขียน ES ทำให้ทั้ง endpoint คืน HTTP 500 (`api/app/api/schema.py:162-163`) ส่วนข้อผิดพลาดตอนเขียนไฟล์ดิสก์แค่ log ไว้ ไม่ทำให้ทั้ง request ล้มเหลว (`:160-161`) |

```python
# api/app/api/schema.py:165-177
    try:
        es.update(
            index="sdoqap_schema_proposals",
            id=proposal_id,
            body={"doc": {"status": "APPROVED", "resolved_at": datetime.now(timezone.utc).isoformat(), "resolved_by": user}},
            if_seq_no=seq_no,
            if_primary_term=primary_term
        )
    except ConflictError:
        raise HTTPException(
            status_code=409,
            detail=f"Proposal '{proposal_id}' was modified by another request (e.g. concurrently rejected). Reload and retry."
        )
```

| บรรทัด | ทำอะไร |
|---|---|
| 166-172 | อัปเดตสถานะ proposal เป็น `APPROVED` พร้อมเวลาและชื่อผู้อนุมัติ (`resolved_by=user` จาก session) ส่ง `if_seq_no`/`if_primary_term` ที่อ่านมาตอนต้นฟังก์ชัน เพื่อให้ ES ปฏิเสธการเขียนถ้าเอกสารถูกแก้ไปแล้วระหว่างทาง (optimistic concurrency control) |
| 173-177 | ถ้าเกิด `ConflictError` (มีคนแก้ proposal เดียวกันไปพร้อมกัน เช่นกดปฏิเสธซ้อน) คืน HTTP 409 ให้ผู้ใช้โหลดหน้าใหม่แล้วลองใหม่ — ป้องกัน "อนุมัติซ้ำ" หรือ "อนุมัติทับการปฏิเสธ" |

## 5. ตัวอย่างการคำนวณจริง

**หลักฐานจากการรันจริง (`docs/whitebox-report/evidence/09-proposals.json`, ล็อกอินแล้วเรียก `GET /api/v1/schema/proposals?status=PENDING`, รันเมื่อ 2026-09-27):**

```json
{"proposals":[{"id":"P2As3qAB2YcjeobRvVKf","table_name":"student_course_scores","run_id":"run_evo_1790433869","status":"PENDING","severity_score":1,"proposed_at":"2026-09-26T14:44:29.214045+00:00","drift_details":{"gpa_weighted":{"error":"new_column","actual":"DoubleType","expected":"None (New Column)"}},"proposed_schema":{"student_id":"StringType","course":"StringType","score":"DoubleType","study_hours":"DoubleType","gpa_weighted":"DoubleType"}}],"total":1,"status_filter":"PENDING"}
```

นี่คือผลของปุ่ม "จำลอง" (ข้อ 3.8) — สังเกต 3 จุดที่ยืนยันว่าไม่ได้มาจากตรรกะจริง: (1) `proposed_schema` มี 5 คอลัมน์ตายตัว (`student_id, course, score, study_hours` + คอลัมน์ที่กรอก) ไม่เกี่ยวกับ schema จริงของ `student_course_scores` เลย (2) มีฟิลด์ `severity_score` (ไม่ใช่ `drift_severity`) ค่า `1` มาจากสูตร `2 if drift_type=="type_mismatch" else 1` (`api/app/api/schema.py:402`) (3) ไม่มีฟิลด์ `run_id` ในรูปแบบของ Spark จริง (`run_evo_<timestamp>` มาจาก `api/app/api/schema.py:397` ไม่ใช่ `run_id` ที่ Spark สร้างตอนรันคุณภาพข้อมูล)

**หลักฐานจากการรันจริงของ Spark เอง (ตรวจสอบตรงด้วย Elasticsearch ในคอนเทนเนอร์, 2026-09-27):** `GET http://localhost:9200/sdoqap_schema_drifts/_search?sort=timestamp:desc` คืนเอกสารจริงจากรอบคุณภาพข้อมูลของตาราง `global_ecommerce_sales`:

```
"drift_details": {"Order_Date": {"error": "type_mismatch", "expected": "DateType", "actual": "StringType", "action": "coerced_to_string"}}, "drift_severity": 5
```

**ตรวจทานด้วยสูตรที่ `spark/spark_quality_engine.py:1938-1946`:** มีความต่าง 1 คอลัมน์ ประเภท `type_mismatch` → น้ำหนัก `5` → `total_drift_severity = 5` ตรงกับค่าจริงในเอกสารเป๊ะ

`GET http://localhost:9200/sdoqap_schema_proposals/_search?size=10` (เรียงตาม `proposed_at` ล่าสุดก่อน) พบ proposal ของตารางเดียวกัน 3 ฉบับ **ทั้งหมดมีสถานะ `APPROVED` และ `resolved_by: "admin"`** พร้อม `drift_severity: 5` — คือ proposal ประเภท `type_mismatch` (อันตรายตามคำจำกัดความในข้อ 3.3 เพราะ `is_safe_drift=False` แน่นอน จึงเป็นไปไม่ได้ที่จะ auto-approve ตามข้อ 3.4) แต่ก็ถูก**อนุมัติด้วยมือ**ผ่าน `POST /schema/proposals/{id}/approve` (ข้อ 3.7) — ยืนยันตรงตามที่ข้อ 3.7 อธิบายไว้ว่า endpoint นี้ไม่ตรวจ severity เลย: อ่าน `spark/schema_registry.json` ที่มีอยู่จริงในระบบ (ไฟล์เดียวกับที่แจ้งเตือนในคำสั่งงานนี้ว่าห้ามแก้ไข — อ่านอย่างเดียว) พบว่าคีย์ `global_ecommerce_sales.schema_spec.Order_Date` มีค่า `"StringType"` แล้วจริง (ตรงกับ `proposed_schema` ที่อนุมัติไป) และไม่มีไฟล์ `global_ecommerce_sales.json.bak` หรือ `schema_registry.json.bak` อยู่เลยในโฟลเดอร์ `spark/` — ยืนยันตรงตามข้อ 3.7 ว่าเส้นทางอนุมัติด้วยมือไม่สร้างไฟล์สำรอง ต่างจากเส้นทางอนุมัติอัตโนมัติที่จะสร้าง `.bak` เสมอ (`spark/spark_quality_engine.py:1488`) — แปลว่าฟังก์ชันสำรองไฟล์นั้นไม่เคยถูกเรียกใช้งานจริงกับตารางนี้เลยตลอดประวัติที่ตรวจสอบได้

**เหตุผลที่เส้นทางอนุมัติอัตโนมัติแทบไม่เคยทำงาน — ตรวจสอบตรงจากไฟล์กฎจริง:** `spark/rules_config.json` มี 16 ตาราง (`_comment`, `_default`, `global_ecommerce_sales`, `mbti`, `users`, `bank_data_csv`, `sales_records`, `worst_case`, `schema_drift`, `unknown`, `grocery_raw_sales_data`, `mbti_1M`, `orders_demo`, `grocery_sales`, `restaurant_sales`, `student_course_score`) `grep -n "require_approval\|allow_new_columns\|max_columns" spark/rules_config.json` **ไม่พบผลลัพธ์เลยแม้แต่บรรทัดเดียว** — ไม่มีตารางใดตั้งค่า `schema_evolution` เอง จึงใช้ค่าเริ่มต้นทั้งหมด (`policy_req_approval=True` เสมอ) **คำนวณด้วยมือจากสูตรที่ `spark/spark_quality_engine.py:1970-1975`:** ต่อให้ `is_safe_drift=True` (คอลัมน์ใหม่ล้วน), `policy_allow_new=True` (ค่าเริ่มต้น), และคอลัมน์รวมไม่เกิน 50 — เงื่อนไขที่ 3 `(not policy_req_approval)` จะเป็น `(not True) = False` เสมอ ทำให้ `can_auto_approve = True and True and False and True = False` เสมอในทุกตารางของระบบปัจจุบัน จนกว่าจะมีใครเพิ่มคีย์ `"schema_evolution": {"require_approval": false, ...}` เข้าไปในไฟล์นี้ด้วยมือ

## 6. ทำไมออกแบบแบบนี้ และทางเลือกอื่น

**ทำไมคอลัมน์ใหม่ถือว่า "ปลอดภัย" แต่คอลัมน์หายไม่ปลอดภัย:** คอลัมน์ใหม่เป็นการ**เพิ่ม**ข้อมูล ไม่กระทบแถวเดิมหรือกฎตรวจสอบที่มีอยู่แล้ว (แถวเก่าที่ไม่มีคอลัมน์นี้ก็ยังผ่านเหมือนเดิม) ส่วนคอลัมน์หายเป็นการ**เสีย**ข้อมูลที่กฎตรวจสอบพึ่งพาอยู่ — ถ้าคอลัมน์นั้นบังเอิญเป็นคีย์หลักหรือคอลัมน์ที่มีกฎ `null_checks` ผูกอยู่ ผลคือข้อมูลทั้งรอบถูกกักกันหมดโดยไม่มีใครรู้ทันที (ข้อ 3.6) ส่วนชนิดข้อมูลเปลี่ยนอาจทำให้สูตรคำนวณ (ตัวเลข, วันที่) พังเงียบๆ โดยไม่มี error ให้เห็น จึงต้องระวังเท่ากับคอลัมน์หาย — ทางเลือกอื่นที่เป็นไปได้คือให้คะแนนความรุนแรงแบบไล่ระดับกว่านี้ (เช่น แยกน้ำหนักตามว่าคอลัมน์นั้นเป็นคีย์หลักหรือมีกฎผูกอยู่หรือไม่) แต่ระบบปัจจุบันใช้น้ำหนักคงที่ต่อประเภทเท่านั้น ไม่สนใจว่าคอลัมน์นั้น "สำคัญ" แค่ไหนในทางธุรกิจ

**ทำไมต้องมีคนอนุมัติ (human gate) แทนที่จะให้ระบบตัดสินใจเองทั้งหมด:** การเปลี่ยน schema ถาวรมีผลย้อนหลังกับรายงาน/แดชบอร์ดที่มีอยู่แล้ว และบางครั้ง "คอลัมน์หาย" อาจไม่ใช่บั๊ก แต่เป็นการเปลี่ยนสัญญาข้อมูล (data contract) ที่ทีมต้นทางตั้งใจทำจริง — การให้คนตัดสินใจเปิดโอกาสให้ตรวจสอบบริบทที่โค้ดไม่รู้ (เช่น "อ๋อ ทีมต้นทางแจ้งมาแล้วว่าจะเลิกส่งคอลัมน์นี้") ทางเลือกที่ระบบทำจริงคือ**ผสมทั้งสองแบบ**: อนุญาตอนุมัติอัตโนมัติได้เฉพาะกรณีปลอดภัยที่สุด (คอลัมน์ใหม่, ยังไม่เกินเพดาน) และเปิดสวิตช์ `require_approval` ต่อตารางให้เลือกเองได้ — แต่ตามข้อ 5 พบว่าในทางปฏิบัติไม่มีตารางไหนเปิดสวิตช์นี้เลย ทุกอย่างจึงกลายเป็น "ต้องมีคนอนุมัติ" ทั้งหมดโดยพฤตินัย ซึ่งเป็นทางเลือกที่ปลอดภัยกว่าแต่ช้ากว่า

**ทำไมบันทึกเป็น proposal แยกต่างหาก แทนที่จะแก้ registry ตรงๆ ทันที:** การเขียนข้อเสนอไปคนละดัชนี (`sdoqap_schema_proposals`) ทำให้ "การเสนอ" กับ "การยืนยันแล้ว" แยกจากกันชัดเจนในเชิงข้อมูล — proposal ที่ถูกปฏิเสธไม่ทิ้งร่องรอยใน registry จริงเลย และมีประวัติการตัดสินใจ (`resolved_by`, `resolved_at`) ให้ตรวจสอบย้อนหลังได้ว่าใครอนุมัติอะไรเมื่อไหร่ ต่างจากการเขียนทับ registry ตรงๆ ที่จะไม่มีร่องรอยว่าใครเป็นคนสั่งเปลี่ยน — ข้อเสียคือต้องดูแลสองที่ (proposal + registry) ให้ตรงกันเอง และอย่างที่เห็นในข้อ 3.7 endpoint อนุมัติก็ไม่ได้ตรวจสอบเนื้อหาของ proposal เทียบกับ registry ปัจจุบันอีกที ก่อนเขียนทับ

## 7. ข้อจำกัด ค่าตายตัว และข้อสังเกต

- **เส้นทางอนุมัติอัตโนมัติแทบไม่เคยทำงานจริงในระบบปัจจุบัน:** เพราะไม่มีตารางใดใน `spark/rules_config.json` ตั้งค่า `schema_evolution.require_approval=false` ค่าเริ่มต้น `True` (`spark/spark_quality_engine.py:1965`) ทำให้ `can_auto_approve` เป็นเท็จเสมอ (ข้อ 5) การเขียนโค้ดส่วนนี้ (`:1977-1991`, `auto_evolve_schema_registry`) จึงเป็นโค้ดที่มีอยู่แต่ไม่เคยถูกใช้งานภายใต้การตั้งค่าจริงของระบบ ณ วันที่ตรวจสอบ — ถ้าต้องการให้ทำงานจริง ต้องเพิ่มคีย์นี้ในไฟล์กฎด้วยมือ
- **การอนุมัติด้วยมือไม่มีการ์ดป้องกันความรุนแรง:** `approve_proposal` (`api/app/api/schema.py:63-183`) ไม่ตรวจ `drift_severity`/`error` type เลย หลักฐานจริงในข้อ 5 แสดงว่า proposal ประเภท `type_mismatch` (severity 5, นิยามว่า "อันตราย" ในโค้ดเอง, `:2003-2004`) ถูกอนุมัติไปแล้วจริง 3 ครั้งด้วยบัญชี `admin` — ระบบเชื่อการตัดสินใจของมนุษย์เต็มร้อย ไม่มีการเตือนซ้ำหรือให้ยืนยันสองชั้นสำหรับ proposal ที่มีความเสี่ยงสูงเป็นพิเศษ
- **ปุ่ม "จำลอง" ไม่ทดสอบตรรกะการตัดสินใจจริงเลย:** ไม่เดินผ่าน `load_expected_schema`, ไม่คำนวณ `drift_severity` ด้วยสูตรจริง, ไม่ผ่าน `can_auto_approve` — เป็นเพียงเครื่องมือสร้างเอกสาร ES ตรงๆ เพื่อให้มี proposal โชว์ในหน้า Catalog สำหรับสาธิต/ทดสอบ UI (คอมเมนต์ในโค้ด UI เองก็ระบุตรงนี้ว่า "this is a simulation/test tool, not the primary workflow", `ui/src/pages/Schema.jsx:197`)
- **ฟิลด์ `severity_score` กับ `drift_severity` เป็นคนละสูตร คนละสเกล ปนอยู่ในดัชนีเดียวกัน:** proposal จริงจาก Spark มี `drift_severity` (ผลรวม 5/5/1 ต่อคอลัมน์) proposal จากปุ่มจำลองมี `severity_score` (1 หรือ 2 คงที่ไม่ขึ้นกับจำนวนคอลัมน์) หน้า Catalog ไม่ได้แยกแสดงสองฟิลด์นี้ต่างกัน ถ้ามีคนพยายามเปรียบเทียบ "ความรุนแรง" ของ proposal สองฉบับที่มาจากคนละแหล่งจะได้ตัวเลขที่เทียบกันไม่ได้จริง
- **การอนุมัติด้วยมือไม่สำรองไฟล์ (`.bak`) เหมือนเส้นทางอัตโนมัติ:** ตรวจสอบตรงในข้อ 5 ยืนยันว่าไม่มีไฟล์ `.bak` เกิดขึ้นจากการอนุมัติผ่าน UI เลย ถ้าเขียนไฟล์ผิดพลาดกลางคัน (เช่น process ถูก kill ระหว่าง `json.dump`) จะไม่มีสำเนาก่อนหน้าให้กู้คืนสำหรับเส้นทางนี้โดยเฉพาะ
- **`sdoqap_schema_registry` ของ ES ว่างเปล่าสำหรับหลายตารางในสภาพแวดล้อมนี้:** ตรวจสอบตรง (ข้อ 3.1) พบว่าตาราง `users` ไม่มีเอกสารใน ES เลย ระบบจึงพึ่งพาไฟล์ `schema_registry.json` ในคอนเทนเนอร์เป็นแหล่งจริงสำหรับตารางเหล่านั้น แม้ชื่อดัชนีจะสื่อว่า ES เป็นแหล่งหลัก
- **`approve_all_proposals`/`reject_all_proposals` ไม่มี optimistic concurrency control ต่อรายการ** (`api/app/api/schema.py:322-327`, `:373-377`) ต่างจาก endpoint เดี่ยว — ถ้ามีคนสองคนกด "อนุมัติทั้งหมด" พร้อมกันไม่มีกลไกกันชนแบบเดียวกับที่ endpoint เดี่ยวมี

## 8. คำถามกรรมการ

### พื้นฐาน

1. **ระบบตรวจจับ schema drift ได้จากอะไร ใช้ข้อมูลไหนเป็นตัวเทียบ?**
   เทียบคอลัมน์ของ DataFrame ที่โหลดมาจริงในรอบนั้นกับ schema ที่ลงทะเบียนไว้ล่วงหน้า ซึ่งอ่านจากดัชนี Elasticsearch `sdoqap_schema_registry` ก่อน แล้วตกไปอ่านไฟล์ `schema_registry.json` ในคอนเทนเนอร์ Spark เป็นลำดับถัดไปถ้า ES ไม่มีข้อมูล (`spark/spark_quality_engine.py:1349-1379`, `:1892-1933`) ดูข้อ 3.1 และ 3.2 ของบทนี้

2. **ถ้าไม่มีใครกดอนุมัติ ข้อมูลรอบนั้นไปไหน?**
   ข้อมูลรอบนั้น**ไม่รอ**การอนุมัติเลย — โค้ดเดินหน้าประมวลผลต่อทันทีด้วยข้อมูลที่แก้ไขแล้ว (คอลัมน์หายถูกเติม `null`, ชนิดไม่ตรงถูกบังคับเป็นข้อความ) แล้วเข้าสู่ขั้นทำความสะอาดและตรวจรายแถวตามปกติ (`spark/spark_quality_engine.py:2028` เป็นต้นไป) proposal ที่ค้างอยู่เป็นแค่บันทึกไว้ตัดสินใจว่าจะแก้ schema ระยะยาวอย่างไร ไม่ใช่ประตูที่หยุดข้อมูล ดูข้อ 3.6

3. **ถ้าระบบพบคอลัมน์ใหม่ในข้อมูล คอลัมน์นั้นจะถูกใช้งานทันทีเลยไหม?**
   ใช่ในเชิงการประมวลผลรอบนั้น — คอลัมน์ใหม่ถูกรับเข้า `schema_spec` ในหน่วยความจำทันที (`:1928-1933`) แต่การแก้ **registry ถาวร** (ที่จะมีผลกับรอบถัดๆ ไปด้วย) เกิดขึ้นเฉพาะเมื่ออนุมัติอัตโนมัติสำเร็จ (ข้อ 3.4) หรือมีคนกดอนุมัติ proposal ด้วยมือ (ข้อ 3.7) — ในระบบปัจจุบันแทบทุกกรณีต้องรอคนกด (ข้อ 7)

### เชิงลึก

4. **ทำไมคอลัมน์หายไปคอลัมน์เดียว ถึงทำให้ทั้งไฟล์ถูกกักกันหมด?**
   ขั้นตรวจ schema drift เติมค่า `null` ให้คอลัมน์ที่หายไปทุกแถวเหมือนกัน (`spark/spark_quality_engine.py:1901-1909`) แล้ว [บทที่ 02](02-spark-batch-quality-engine.md) ขั้นตรวจรายแถวจะกักกันทุกแถวที่มีค่าว่างในคอลัมน์ตาม schema (`spark/spark_quality_engine.py:2075-2088`) เมื่อทุกแถวมีค่า `null` เหมือนกันในคอลัมน์เดียวกัน ผลคือทุกแถวถูกกักกันด้วยเหตุผล `null_value_in_<คอลัมน์ที่หาย>` พร้อมกันหมด ไม่ใช่บางแถว — ดูสรุปเดียวกันที่ `docs/whitebox-report/02-spark-batch-quality-engine.md:74`

5. **น้ำหนักความรุนแรง 5/5/1 มาจากไหน คำนวณอย่างไรกับหลายคอลัมน์พร้อมกัน?**
   เป็นค่าคงที่ที่เขียนตายตัวในโค้ด (ไม่ได้มาจากสถิติหรือการเรียนรู้ใดๆ): คอลัมน์หาย = 5, ชนิดไม่ตรง = 5, คอลัมน์ใหม่ = 1 ต่อคอลัมน์ (`spark/spark_quality_engine.py:1938-1946`) ถ้าพบหลายประเภทพร้อมกันในรอบเดียว ผลรวมคือผลบวกธรรมดาของทุกคอลัมน์ (เช่น 2 คอลัมน์หาย + 1 คอลัมน์ใหม่ = 5+5+1 = 11 — ตัวอย่างนี้คำนวณด้วยมือ ไม่ใช่ค่าจริงที่พบในหลักฐาน) หลักฐานจริงในข้อ 5 ของบทนี้ยืนยันกรณี 1 คอลัมน์ type_mismatch → severity 5 ตรงตามสูตร

6. **ปุ่ม "จำลอง" ในหน้า Catalog ทดสอบอะไรได้จริง และทดสอบอะไรไม่ได้?**
   ทดสอบได้แค่ว่า UI แสดงผล/กรอง/อนุมัติ-ปฏิเสธ proposal ที่มีอยู่ในดัชนี `sdoqap_schema_proposals` ถูกต้องหรือไม่ — เพราะมันเขียนเอกสารตรงเข้า ES โดยไม่ผ่านตรรกะตรวจจับ drift ใดๆ เลย (`api/app/api/schema.py:386-434`) มันทดสอบ**ไม่ได้**เลยว่า `load_expected_schema`, การคำนวณ `drift_severity`, หรือประตู `can_auto_approve` ทำงานถูกต้องหรือไม่ — การทดสอบส่วนนั้นต้องรันข้อมูลจริงผ่าน Spark เท่านั้น (ดูข้อ 3.8)

### จุดอ่อน

7. **ใครมีสิทธิ์อนุมัติหรือปฏิเสธ schema proposal?**
   ในเชิงเทคนิค endpoint อนุมัติ/ปฏิเสธ (`api/app/api/schema.py:63-223`) ใช้แค่ `Depends(require_session)` (`api/app/api/auth.py:61-68`) คือแค่ตรวจว่า**ล็อกอินอยู่**เท่านั้น ไม่มีการตรวจ role หรือสิทธิ์เพิ่มเติมใดๆ เลย — แต่ในทางปฏิบัติระบบทั้งระบบมีบัญชีเข้าใช้งานได้บัญชีเดียว คือ `ADMIN_USERNAME`/`ADMIN_PASSWORD` ที่ตั้งจาก environment variable (`api/app/api/auth.py:104-123`) ไม่มีตารางผู้ใช้หรือระบบ role แยกเลยในโค้ดส่วนนี้ พูดให้ตรงคือ "ใครก็ตามที่ล็อกอินเข้าระบบได้" มีสิทธิ์อนุมัติเท่ากันหมด และในทางปฏิบัติมีแค่บัญชีแอดมินบัญชีเดียวเท่านั้นที่ล็อกอินได้ รายละเอียดโครงสร้างสิทธิ์/บทบาทที่ลึกกว่านี้จะอยู่ในบทที่ 14 ว่าด้วยการยืนยันตัวตนและความปลอดภัย (ยังไม่ได้เขียน ณ วันที่บันทึกนี้) — บทนี้ยืนยันได้แค่ว่าไม่มีการตรวจ role ในโค้ดที่อ่านจริง ไม่ควรอนุมานเกินกว่านี้

8. **การอนุมัติด้วยมือ "ป้องกัน" การเปลี่ยนแปลงอันตรายได้จริงหรือ?**
   ไม่ได้ป้องกันในเชิงเทคนิค — เป็นแค่ "ประตูที่ต้องมีคนกด" แต่ไม่มีการ์ดใดๆ ที่ห้ามกดผ่าน endpoint เองตรวจ `drift_severity` หรือประเภทของการเปลี่ยนแปลงเลย (ข้อ 3.7) หลักฐานจริงในข้อ 5 ของบทนี้แสดงว่า proposal ประเภท `type_mismatch` (นิยามว่า "อันตราย" ในคอมเมนต์ของโค้ดเอง) ถูกอนุมัติไปแล้วจริง 3 ครั้ง ด้วยบัญชี `admin` เดียวกัน — ระบบพึ่งพาดุลพินิจของมนุษย์ 100% โดยไม่มีการเตือนซ้ำหรือให้กรอกเหตุผลก่อนอนุมัติ proposal ที่มีความเสี่ยงสูงเป็นพิเศษ ถ้าต้องการแก้ ควรเพิ่มการยืนยันสองชั้น (เช่น พิมพ์ชื่อตารางซ้ำ) เฉพาะ proposal ที่มี `drift_severity` สูงหรือมี `missing_column`/`type_mismatch`
