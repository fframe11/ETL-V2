# สไลด์นำเสนอสถาปัตยกรรมระบบเชิงลึก: ส่วนกระบวนการแปลงสภาพและตรวจคุณภาพข้อมูล (Data Transformation Deep Dive - 8 สไลด์)

> **เอกสารอ้างอิงหลัก**: [`docs/architecture/SYSTEM_ARCHITECTURE_OVERVIEW_DEEP_DIVE.md`](../architecture/SYSTEM_ARCHITECTURE_OVERVIEW_DEEP_DIVE.md), [`services/spark/sdoqap/pipeline/plan.py`](../../services/spark/sdoqap/pipeline/plan.py)  
> **เวอร์ชันโค้ดที่ตรวจทาน**: branch `feat/generic-profiling-rule-engine`, commit `936ae76`  
> **แนวทางการนำเสนอ**: Professional Engineering & System Architecture Presentation (มุ่งเน้นความสัตย์จริงทางวิศวกรรม, ลำดับการประมวลผลระดับโค้ดจริง, และการกระทบยอดข้อมูล 100%)  
> **โครงสร้างในแต่ละสไลด์**: (1) หัวสไลด์และประเด็นสำคัญ (2) เนื้อหาที่แสดงบนจอ (3) แผนภาพจำลองสถาปัตยกรรม (4) บทพูดผู้บรรยาย (Speaker Script) และ (5) หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)

---

## Slide 1: สถาปัตยกรรม Data Transformation: จาก "4 ประตูนามธรรม" สู่ "Sequential Deterministic DAG"

### ประเด็นสำคัญ (Key Message)
กระบวนการแปลงสภาพและคัดกรองข้อมูลของ DataServe ไม่ได้เป็นเพียงแนวคิด 4 ประตูทางทฤษฎี แต่ทำงานจริงด้วยสถาปัตยกรรม Sequential Deterministic DAG ที่แบ่งเป็น 13 Stages ต่อเนื่องในหมวด ALIGN และ TRANSFORM ควบคุมด้วย `RunContext` บน Apache Spark พร้อมรับประกันหลักการ Data Immutability และการกระทบยอดข้อมูล 100% โดยปราศจาก Silent Drop

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Data Transformation Pipeline: Sequential Deterministic DAG Architecture
* **หัวข้อย่อย**: กลไกการตรวจสภาพ คัดแยก และแปลงสภาพข้อมูลระดับแถวบน Apache Spark & Delta Lake
* **3 เสาหลักเชิงสถาปัตยกรรม (Core Design Invariants)**:
  1. **Deterministic Execution Plan**: ควบคุมลำดับการประมวลผลแบบเป็นลำดับเด็ดขาดผ่าน `services/spark/sdoqap/pipeline/plan.py` โดยตกแต่งฟังก์ชันด้วย `@stage`
  2. **Zero Silent Drop Guarantee**: ข้อมูลทุกแถวที่มีข้อผิดพลาดจะต้องถูกระบุสาเหตุใน `reject_reason` และส่งเข้าสู่ Silver Quarantine เพื่อการตรวจสอบย้อนกลับ
  3. **Data Volume Reconciliation Invariant**: ยอดนำเข้า Raw เท่ากับยอด Clean ใน Active บวกกับยอดใน Quarantine และยอดที่ถูกรวมในขั้น Auto-Clean เสมอ
* **แถบสรุปท้ายสไลด์**: "ท่อข้อมูลที่โปร่งใส ไม่กลืนข้อผิดพลาด และพร้อมพิสูจน์ความถูกต้องทางตัวเลขในทุกรอบการประมวลผล"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ Inbound Raw DataFrame ] 
           │
           ▼ (ALIGN Phase: 1 Stage)
     schema_align  ─────────► ทำความสะอาดคอลัมน์, Dynamic row_hash, Type Promotion
           │
           ▼ (TRANSFORM Phase: 12 Stages)
    ┌──────┴────────────────────────────────────────────────────────────────────────┐
    │ 1. schema_drift       2. auto_clean         3. validation    4. dedup         │
    │ 5. standardize_dates  6. standardize_cats   7. range_rules   8. anomaly_iqr   │
    │ 9. anomaly_zscore    10. anomaly_induced   11. quarantine   12. column_filter │
    └──────┬────────────────────────────────────────────────────────────────────────┘
           │
           ├──────────────────────────────┬──────────────────────────────┐
           ▼                              ▼                              ▼
 [ Clean Rows -> Silver Active ]   [ Quarantine Rows -> DLQ ]   [ Audit Logs -> ES ]
```

### บทพูดผู้บรรยาย (Speaker Script: ~75 วินาที)
"สวัสดีครับทุกท่าน วันนี้ผมขอเจาะลึกหัวใจสำคัญของ DataServe นั่นคือส่วน Data Transformation และ Quality Segregation Engine ครับ 

ในเอกสารเชิงข้อเสนอเดิม หลายท่านอาจเคยได้ยินเรื่อง '4 ประตูคุณภาพ' แต่วันนี้ผมขอเปิดเผยสถาปัตยกรรมจากโค้ดจริงที่รันอยู่ในระบบครับ ระบบของเราไม่ได้เป็น 4 ประตูแบบ Static แต่ทำงานเป็น Sequential Deterministic DAG จำนวน 13 Stages ต่อเนื่อง แบ่งเป็นหมวด ALIGN และ TRANSFORM 

หัวใจของเลเยอร์นี้คือหลักการ Zero Silent Drop หมายความว่า ข้อมูลทุกแถวที่เข้ามาในระบบ จะไม่มีแถวใดถูกลบทิ้งไปอย่างเงียบๆ ถ้าข้อมูลถูกต้อง 100% จะไหลลง Silver Active เพื่อส่งให้ผู้บริหารหรือนักวิเคราะห์ใช้งาน แต่ถ้าข้อมูลมีข้อผิดพลาดแม้แต่จุดเดียว แถวนั้นจะถูกผูกข้อความระบุสาเหตุ และส่งเข้าสู่ Silver Quarantine Lake ทันที ทำให้เรากระทบยอดปริมาณข้อมูลได้ครบถ้วน 100% ไม่สูญหายแม้แต่แถวเดียวครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/sdoqap/pipeline/plan.py:1-7` (โครงสร้างลำดับ ALIGN และ TRANSFORM)
* `services/spark/sdoqap/pipeline/context.py:9-66` (การนิยาม Data Container `RunContext`)

---

## Slide 2: ขั้นตอนการจัดระเบียบโครงสร้างและชนิดข้อมูล (Stage 1: `schema_align`)

### ประเด็นสำคัญ (Key Message)
ด่านแรกในการรับข้อมูลเข้าสู่ Engine คือการปรับชื่อคอลัมน์ให้เป็นมาตรฐาน สร้างคีย์ระบุแถวแบบกระจายศูนย์ (`row_hash`) และใช้นวัตกรรม Smart Type Promotion ป้องกันปัญหาข้อมูลกลายเป็นค่าว่าง (Data Loss) พร้อมรองรับ Timestamp หลายรูปแบบ

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Stage 1: `schema_align` - Structural Normalization & Smart Type Promotion
* **4 กลไกการจัดระเบียบข้อมูล (Operational Mechanics)**:
  1. **Column Sanitization & Alias Normalization**: ตัดช่องว่าง อักขระพิเศษ และทำ Fuzzy Matching กับชื่อมาตรฐานใน `schema_spec`
  2. **Dynamic `row_hash` Generation**: หากตารางไม่มี Composite PK จากต้นทาง ระบบจะรวมค่าทุกคอลัมน์คั่นด้วย `||` แล้วแฮชด้วย MD5 เป็น Primary Key สำหรับงาน Big Data
  3. **Smart Type Promotion (Integer to Double)**: สแกนค่าตัวเลขด้วย Regex `\.[0-9]*[1-9]+` หากพบคอลัมน์จำนวนเต็มมีเศษทศนิยมปนเปื้อน จะเลื่อนระดับเป็น `DoubleType` อัตโนมัติ เพื่อป้องกันการถูก Cast เป็น Null
  4. **Robust Timestamp Parser**: รองรับรูปแบบวันที่สากล (`TIMESTAMP_FORMATS`) และรองรับ Unix Epoch ทั้งหน่วยวินาทีและมิลลิวินาที
* **แถบสรุปท้ายสไลด์**: "ป้องกัน Data Loss ตั้งแต่ก้าวแรก ด้วยการแปลงชนิดข้อมูลอย่างชาญฉลาดและปลอดภัย"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
Input: Column "Total Price (THB)" with value "1500.75" (Defined in Schema as: IntegerType)
                         │
                         ▼
[ Smart Promotion Scan: regex r"\.[0-9]*[1-9]+" matched non-zero decimals ]
                         │
                         ▼
Action: Promotes IntegerType ──► DoubleType (Preserves 1500.75 without truncation/nullification)
                         │
                         ▼
Output: Canonical Name "total_price" = 1500.75 (DoubleType) + Re-partitioned (10 Chunks)
```

### บทพูดผู้บรรยาย (Speaker Script: ~60 วินาที)
"เมื่อข้อมูลเข้าสู่ Stage แรก คือ `schema_align` ระบบจะเริ่มจากการทำความสะอาดชื่อคอลัมน์ และจับคู่ชื่อที่อาจสะกดผิดให้ตรงกับมาตรฐาน Schema Registry 

สิ่งที่น่าสนใจมากคือฟีเจอร์ Smart Type Promotion ครับ ในระบบทั่วไป ถ้า Schema ระบุว่าเป็น Integer แต่ต้นทางส่งค่า 1500.75 เข้ามา การแปลงค่าตรงๆ มักจะทำให้ข้อมูลกลายเป็น Null หรือสูญเสียทศนิยมไป แต่ระบบของเราจะสแกนหาเศษทศนิยมก่อน ถ้าพบทศนิยมจริง ระบบจะขยับชนิดข้อมูลจาก Integer ไปเป็น Double ให้โดยอัตโนมัติ ช่วยรักษาความถูกต้องของข้อมูลไว้ได้ทันที นอกจากนี้เรายังสร้าง `row_hash` ด้วย MD5 สำหรับตารางที่ไม่มีคีย์หลัก เพื่อใช้ในการ Upsert ข้อมูลขนาดใหญ่ได้อย่างแม่นยำครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/sdoqap/stages/schema.py:11-97` (ฟังก์ชัน `schema_align`)
* `services/spark/sdoqap/common/names.py` (ฟังก์ชัน `clean_column_name` และ `normalize_name`)

---

## Slide 3: การตรวจจับและจัดการความเปลี่ยนแปลงโครงสร้าง (Stage 2: `schema_drift`)

### ประเด็นสำคัญ (Key Message)
ปกป้อง Data Pipeline จากการพังทลายเมื่อต้นทางเปลี่ยนโครงสร้างข้อมูล ด้วยกลไกจำแนกความรุนแรง (Drift Severity Weighting) พร้อมระบบ Governance Policy คัดกรองระหว่างการอนุมัติอัตโนมัติ (Self-Healing) กับการกักกันเพื่อรอคนอนุมัติ (Approval Gate)

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Stage 2: `schema_drift` - Self-Healing Schema Evolution & Governance Gate
* **การจำแนกประเภทและความรุนแรงของ Drift**:
  * **New Column (ความเสี่ยงต่ำ: +1)**: คอลัมน์ใหม่ที่เพิ่มเข้ามา สามารถรองรับได้ง่าย
  * **Missing Column (ความเสี่ยงวิกฤต: +5)**: คอลัมน์เดิมหายไป ระบบจะ Auto-heal ด้วยค่า Null ตามชนิดข้อมูล และส่ง Alert
  * **Type Mismatch (ความเสี่ยงวิกฤต: +5)**: ชนิดข้อมูลเปลี่ยน บังคับ Coerce เป็น `StringType` ชั่วคราวเพื่อป้องกัน Engine หยุดทำงาน
* **นโยบายการกำกับดูแล (Governance Policies)**:
  * **Safe Auto-Approval**: อนุมัติอัตโนมัติเฉพาะกรณีที่มีเพียง New Columns และจำนวนคอลัมน์ไม่เกินเกณฑ์ (`max_columns`)
  * **Strict Quarantine Gate**: หากพบคอลัมน์หายหรือชนิดข้อมูลเพี้ยน สถานะจะเป็น `PENDING`/`REJECTED` และกักกันข้อมูลทั้งรอบทันที
* **แถบสรุปท้ายสไลด์**: "ยืดหยุ่นต่อการเปลี่ยนแปลง แต่รัดกุมด้วยระบบควบคุมความปลอดภัย"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
               [ Incoming Schema vs. Registered Schema ]
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
[ Only New Columns Detected ]                   [ Missing Columns / Type Drift ]
(Safe Drift Severity: +1)                       (Critical Severity: +5)
          │                                               │
          ▼                                               ▼
Check: allow_new=True & approval=False?         Action: Fill Null / Coerce String
          │                                               │
   ┌──────┴──────┐                                        ▼
  YES            NO                             Log Status: PENDING / REJECTED
   │             │                                        │
   ▼             ▼                                        ▼
[ Auto-Approved ] [ Write Proposal to ES ]      [ Quarantine Entire Batch ]
(Evolve Schema)   (Alert sent to n8n Webhook)   (Trigger Critical Slack Alert)
```

### บทพูดผู้บรรยาย (Speaker Script: ~70 วินาที)
"ถัดมาใน Stage ที่ 2 คือ `schema_drift` ปัญหาคลาสสิกของ Data Engineer คือเมื่อทีมแอปพลิเคชันเพิ่ม ลบ หรือแก้ชื่อคอลัมน์ ท่อ ETL มักจะพังตอนตีสอง 

ใน DataServe เราออกแบบให้ระบบมีภูมิคุ้มกันครับ เราแบ่งประเภทของ Drift และให้คะแนนความรุนแรง ถ้ามีคอลัมน์ใหม่เพิ่มเข้ามาอย่างปลอดภัย ระบบสามารถ Auto-Evolve หรือเพิ่มคอลัมน์ใหม่ลงระบบได้เองทันที แต่ถ้าเป็นกรณีอันตราย เช่น คอลัมน์สำคัญหายไป หรือชนิดข้อมูลเปลี่ยน ระบบจะเติมค่า Null หรือแปลงเป็นข้อความชั่วคราวเพื่อไม่ให้ระบบแครช พร้อมตั้งสถานะเป็น PENDING แล้วส่งสัญญาณเตือนผ่าน n8n ไปยัง Slack ของทีม Data เพื่อให้มนุษย์เข้ามาตรวจสอบและกดยืนยันที่หน้าจอพอร์ทัล ข้อมูลในรอบนั้นจึงถูกกักกันอย่างปลอดภัย ไม่หลุดรอดไปทำลายรายงานผู้บริหารครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/sdoqap/stages/schema.py:100-245` (ฟังก์ชัน `schema_drift`)
* `docs/evaluation/evidence/d-schema-drift.json` (ผลทดสอบจริงบน Drift v1..v4)

---

## Slide 4: การเยียวยาด้วยกฎและการตรวจความถูกต้องระดับแถว (Stages 3 & 4: `auto_clean` & `validation`)

### ประเด็นสำคัญ (Key Message)
การนำกฎ DSL แบบจำกัดขอบเขตมาประมวลผลเยียวยาข้อมูลอย่างปลอดภัยใน Stage 3 ควบคู่กับการคัดกรองความถูกต้องระดับแถว (Row-level Quality Verification) ใน Stage 4 พร้อมสร้างบันทึกเหตุผล `reject_reason` สำหรับทุกข้อผิดพลาด

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Stages 3 & 4: `auto_clean` (Safe Healing) & `validation` (Row-level Quality)
* **Stage 3: `auto_clean` (Deterministic DSL Remediation)**:
  * รันกฎ DSL ที่ผ่านการอนุมัติ 4 รูปแบบ: `fillna` (เติมค่าคงที่), `calculate` (คำนวณทางคณิตศาสตร์), `cast` (แปลงชนิด), และ `filter` (กรองแถว)
  * ป้องกัน Code Injection: ตรวจสอบ Regex อนุญาตเฉพาะตัวอักษร ตัวเลข และโอเปอเรเตอร์ทางคณิตศาสตร์เท่านั้น
  * **Safe Deduplication**: ตัดแถวซ้ำที่มี Primary Key สมบูรณ์ และบันทึกยอด `dup_resolved`
* **Stage 4: `validation` (Comprehensive Null & Type Checks)**:
  * ตรวจสอบ Primary Key ว่าง (`missing_primary_key`)
  * ตรวจสอบค่าว่างตามรายชื่อคอลัมน์ที่ตั้งค่าใน `null_checks` หรือทุกคอลัมน์ในตาราง (`null_value_in_<col>`)
  * ตรวจสอบความถูกต้องของชนิดตัวเลข (`invalid_type_<col>`) และวันที่ว่าง (`missing_date`)
* **แถบสรุปท้ายสไลด์**: "แยกแถวที่ผ่านเกณฑ์ (Valid) และแถวที่ผิดพลาด (Invalid) ออกจากกันอย่างเด็ดขาด"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ Incoming Data ]
        │
        ▼ (Stage 3: auto_clean)
[ Safe DSL Engine ] ──► fillna / calculate / cast (Regex Verified)
        │
        ├─► [ Non-null PK Deduplication ] ──► Logged: dup_resolved
        │
        ▼ (Stage 4: validation)
[ Row-Level Evaluator ]
        │
        ├─► PK is Null?           ──► Flag is_invalid=True, Reason: "missing_primary_key"
        ├─► Column is Null?       ──► Flag is_invalid=True, Reason: "null_value_in_<col>"
        ├─► Cast Type Failed?     ──► Flag is_invalid=True, Reason: "invalid_type_<col>"
        └─► Date Column is Null?  ──► Flag is_invalid=True, Reason: "missing_date"
        │
        ├──► Valid Records   ──► valid_df (เข้าสู่กระบวนการตรวจสถิติขั้นสูง)
        └──► Invalid Records ──► invalid_df (เตรียมส่งเข้าสู่ Quarantine)
```

### บทพูดผู้บรรยาย (Speaker Script: ~75 วินาที)
"ใน Stage 3 และ 4 คือหัวใจของการตรวจระดับแถวครับ 

ใน Stage 3 `auto_clean` เรามีเอนจิน DSL ที่ปลอดภัย รองรับคำสั่ง 4 แบบ คือการเติมค่าว่าง การคำนวณ การแปลงชนิดข้อมูล และการกรอง โดยมี Regex Sandbox ป้องกันไม่ให้ใครแทรกโค้ด SQL หรือ Python ที่เป็นอันตรายเข้ามาได้ นอกจากนี้เรายังแยกข้อมูลที่มี Primary Key สมบูรณ์มาตัดแถวซ้ำล่วงหน้า 

เมื่อเข้าสู่ Stage 4 `validation` ข้อมูลจะถูกสแกนทุกคอลัมน์ หากพบคีย์หลักว่าง ระบบจะระบุเหตุผลว่า `missing_primary_key` ถ้าคอลัมน์คะแนนหรืออายุเป็นค่าว่าง จะต่อท้ายเหตุผลด้วย `null_value_in_score` และถ้าคอลัมน์ตัวเลขมีข้อความปนจนแปลงเป็นตัวเลขไม่ได้ จะระบุว่า `invalid_type` ผลลัพธ์ในขั้นนี้จะถูกแยกเป็น 2 กองชัดเจน คือ `valid_df` ข้อมูลที่ผ่านเกณฑ์ และ `invalid_df` ข้อมูลที่เตรียมนำไปกักกันครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/sdoqap/stages/cleansing.py:6-45` (ฟังก์ชัน `auto_clean`)
* `services/spark/sdoqap/stages/cleansing.py:47-122` (ฟังก์ชัน `validation`)
* `services/spark/spark_quality_engine.py:1600-1685` (ฟังก์ชัน `apply_dsl_remediation_rules`)

---

## Slide 5: การกำจัดแถวซ้ำและการปรับมาตรฐานข้อมูล (Stages 5, 6 & 7: `dedup` & `standardize`)

### ประเด็นสำคัญ (Key Message)
การขจัดแถวซ้ำระดับธุรกิจด้วยเทคนิค Anti-Join โดยเก็บเฉพาะเวอร์ชันล่าสุด พร้อมระบบปรับมาตรฐานวันที่อัตโนมัติ (แปลง พ.ศ. เป็น ค.ศ.) และการจัดกลุ่มหมวดหมู่สินค้า/ข้อมูลตามพจนานุกรมใน Schema Registry

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Stages 5, 6 & 7: Deduplication, Date Normalization & Category Standardization
* **Stage 5: `dedup` (Anti-Join Quarantine Isolation)**:
  * สร้าง `__row_id` ชั่วคราว เรียงตาม `date_column.desc()` เพื่อเก็บแถวล่าสุด
  * ใช้ Left Anti-Join สกัดแถวซ้ำออกมาเป็น `duplicate_df` และผูกเหตุผล `duplicate_records`
* **Stage 6: `standardize_dates` (Buddhist Era & Format Normalization)**:
  * ตรวจจับคอลัมน์วันที่ แปลงชื่อเดือนภาษาอังกฤษ และรองรับตัวคั่น `-` หรือ `/`
  * **Auto Buddhist Era Conversion**: หากปี $> 2500$ ระบบจะหักออกด้วย 543 เพื่อแปลงเป็น ค.ศ. สากล (`YYYY-MM-DD`)
* **Stage 7: `standardize_categories` (Data-Driven Keyword Mapping)**:
  * อ่านกฎการจัดหมวดหมู่จาก Elasticsearch โดยไม่มีการ Hardcode ในโค้ด
  * รัน PySpark UDF ตรวจจับ Keyword เพื่อแปลงข้อความไม่เป็นระเบียบให้เข้าสู่หมวดหมู่มาตรฐาน พร้อมค่า `fallback`
* **แถบสรุปท้ายสไลด์**: "ข้อมูลถูกกำจัดความซ้ำซ้อน แปลงเวลาสู่สากล และจัดหมวดหมู่อย่างเป็นระเบียบ"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ Stage 5: Business Dedup ]
valid_df ──► Order by date DESC ──► dropDuplicates(subset=PK) ──► clean_df (Latest Rows)
    │
    └──► Anti-Join with Original ──► duplicate_df (Reason: "duplicate_records") ──► Quarantine

[ Stage 6: Date Normalization ]
Input: "21 ก.ค. 2569" or "21-07-2569" ──► Year (2569 > 2500) ──► [ Year - 543 ] ──► "2026-07-21"

[ Stage 7: Generic Categorization ]
Input: "เสื้อยืดคอกลม cotton" ──► Keyword Match: ["เสื้อยืด", "shirt"] ──► Standard Category: "Apparel"
```

### บทพูดผู้บรรยาย (Speaker Script: ~75 วินาที)
"ใน Stage ที่ 5 ถึง 7 คือการยกระดับคุณภาพข้อมูลสู่มาตรฐานสากลครับ 

ใน Stage 5 `dedup` เรานำข้อมูลที่ผ่านการตรวจเบื้องต้นมาคัดแถวซ้ำตามคีย์ธุรกิจ โดยจัดเรียงตามวันที่เพื่อเก็บเฉพาะเวอร์ชันล่าสุดไว้ ส่วนแถวซ้ำที่ถูกตัดออก เราไม่ได้โยนทิ้ง แต่ใช้เทคนิค Left Anti-Join ดึงออกมาเป็น `duplicate_df` เพื่อส่งเข้าโซนกักกัน 

ใน Stage 6 `standardize_dates` เราแก้ปัญหาที่พบบ่อยมากในข้อมูลไทย คือการบันทึกปีเป็น พ.ศ. ระบบจะตรวจจับอัตโนมัติ ถ้าปีมากกว่า 2500 จะหักลบ 543 และปรับให้อยู่ในมาตรฐาน ISO `YYYY-MM-DD` ทันที 

และ Stage 7 `standardize_categories` เราดึงพจนานุกรมหมวดหมู่จาก Elasticsearch มาสแกนคำสำคัญเพื่อจัดกลุ่มข้อมูล เช่น ข้อมูลสินค้าหลากหลายรูปแบบจะถูกแมปเข้าสู่ Category กลาง โดยไม่ต้องเขียนโค้ดแก้ในโปรแกรมครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/sdoqap/stages/cleansing.py:124-145` (ฟังก์ชัน `dedup`)
* `services/spark/sdoqap/stages/standardize.py:6-58` (ฟังก์ชัน `standardize_dates`)
* `services/spark/sdoqap/stages/standardize.py:60-104` (ฟังก์ชัน `standardize_categories`)

---

## Slide 6: กฎธุรกิจและการตรวจจับความผิดปกติทางสถิติ (Stages 8, 9 & 10: `rules` & `anomaly`)

### ประเด็นสำคัญ (Key Message)
การผสานระหว่างกฎเกณฑ์ธุรกิจที่กำหนดชัดเจน (Explicit Business Boundaries) เข้ากับแบบจำลองสถิติ 2 รูปแบบ: Tukey's IQR Fences สำหรับตรวจจับ Outlier แบบ Non-parametric และ Gaussian Z-score สำหรับตรวจจับความผิดปกติแบบ Unsupervised

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Stages 8, 9 & 10: Business Rules, Tukey IQR & Gaussian Z-score
* **Stage 8: `range_rules` (Explicit Business Bounds)**:
  * ตรวจสอบขอบเขตค่าคงที่ที่กำหนดโดยเจ้าของข้อมูล เช่น คะแนนสอบต้องอยู่ในช่วง 0 ถึง 100
  * รองรับ `non_negative` mode: บังคับค่าขั้นต่ำ $\ge 0.0$ อัตโนมัติ (เช่น ราคา, ปริมาณ)
* **Stage 9: `anomaly_iqr` (Tukey's Outlier Fences)**:
  * คำนวณควอร์ไทล์ $Q_1, Q_3$ และ $\text{IQR} = Q_3 - Q_1$ แบบประสิทธิภาพสูง $O(N)$ ด้วย `approxQuantile`
  * ขอบเขต: $[Q_1 - (k \times \text{IQR}), \; Q_3 + (k \times \text{IQR})]$ โดย $k = 1.5$ (Outlier ทั่วไป) หรือ $k = 3.0$ (Far-out)
* **Stage 10: `anomaly_zscore` (Unsupervised 3-Sigma Anomaly)**:
  * ตรวจจับความผิดปกติด้วย $Z = \frac{|X - \mu|}{\sigma} > 3.0$ พร้อมกลไกข้ามคอลัมน์ที่ $\sigma = 0$ ป้องกัน Zero Division
* **แถบสรุปท้ายสไลด์**: "จับได้ทั้งค่าที่ผิดกฎธุรกิจโดยตรง และค่าสุดโต่งที่เบี่ยงเบนผิดธรรมชาติทางสถิติ"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
[ Business Bounds: range_rules ]
Condition: score BETWEEN 0 AND 100 ──► If score = -15 or 120 ──► Flag Reason: "out_of_range_score"

[ Statistical Fence: anomaly_iqr (Tukey's Fences) ]
Data Distribution:  [───(Q1 - 1.5*IQR)───[   Q1   |   Median   |   Q3   ]───(Q3 + 1.5*IQR)───]  * (Outlier!)
Calculation: approxQuantile([0.25, 0.75]) ──► Rows outside fences ──► Flag Reason: "outlier_details"

[ Gaussian Anomaly: anomaly_zscore ]
Z-Score Formula: Z = |Value - Mean| / StdDev
If Z > 3.0σ (Deviates more than 3 standard deviations) ──► Flag Reason: "col_zscore=4.2 (val deviates > 3σ)"
```

### บทพูดผู้บรรยาย (Speaker Script: ~75 วินาที)
"มาถึง Stage 8 ถึง 10 ซึ่งเป็นการตรวจจับเชิงลึกด้านตัวเลขและสถิติครับ 

Stage 8 `range_rules` เป็นกฎที่เจ้าของข้อมูลกำหนดอย่างชัดเจน เช่น คะแนนสอบของนักศึกษาต้องอยู่ระหว่าง 0 ถึง 100 หรือราคาต้องไม่ติดลบ แถวที่อยู่นอกช่วงจะถูกคัดออกทันที 

แต่ในความเป็นจริง ข้อมูลบางอย่างอาจจะอยู่ในช่วงที่อนุญาต แต่เป็นค่าที่ผิดธรรมชาติ เช่น ชั่วโมงอ่านหนังสือต่อวัน ค่า 40 ชั่วโมงต่อวัน ไม่ติดลบ แต่เป็นไปไม่ได้ในความเป็นจริง เราจึงใช้ Stage 9 `anomaly_iqr` คำนวณหารั้ว Tukey Fences จากข้อมูลจริงด้วย `approxQuantile` ที่ทำงานเร็วมากในระดับ Big Data แถวที่หลุดขอบเขตรั้ว 1.5 เท่าหรือ 3.0 เท่าของ IQR จะถูกส่งเข้า Quarantine 

และใน Stage 10 `anomaly_zscore` เราใช้วิธี Gaussian 3-Sigma ตรวจจับความเบี่ยงเบนเกิน 3 เท่าของส่วนเบี่ยงเบนมาตรฐาน ช่วยให้เราดักจับข้อผิดพลาดเชิงตัวเลขได้อย่างสมบูรณ์แบบครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/sdoqap/stages/rules.py:15-40` (ฟังก์ชัน `range_rules`)
* `services/spark/sdoqap/stages/anomaly.py:6-50` (ฟังก์ชัน `anomaly_iqr`)
* `services/spark/sdoqap/stages/anomaly.py:52-81` (ฟังก์ชัน `anomaly_zscore`)
* `services/spark/dynamic_rules_engine.py:270-350` (การคำนวณ `compute_value_range_rules` และ `detect_unsupervised_anomalies`)

---

## Slide 7: กฎการเรียนรู้ Machine Learning และการประกอบโซนกักกัน (Stages 11, 12 & 13)

### ประเด็นสำคัญ (Key Message)
การต่อยอดด้วยกฎที่สกัดจาก Decision Tree ใน Stage 11, การรวมร่างและแคชข้อมูลในหน่วยความจำใน Stage 12 (`quarantine_assembly`) เพื่อประสิทธิภาพสูงสุด และการลบฟิลด์ชั่วคราวออกทั้งหมดใน Stage 13 ก่อนส่งมอบสู่ Silver Active

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Stages 11, 12 & 13: ML Induced Rules, Quarantine Assembly & Column Filter
* **Stage 11: `anomaly_induced` (Decision Tree Rules Engine)**:
  * นำกฎเงื่อนไขที่เรียนรู้จาก Decision Tree มารวมกันด้วยตัวดำเนินการ `OR`
  * ประเมินผลข้อมูลด้วย Spark SQL Expression: `F.expr(combined_sql_cond)` และผูกเหตุผล `induced_tree_rule_match`
* **Stage 12: `quarantine_assembly` (Unified Quarantine Packaging)**:
  * รวมทุก DataFrame ข้อผิดพลาดเข้าด้วยกันแบบ Schema-tolerant ด้วย `unionByName(..., allowMissingColumns=True)`:
    $$\text{All Quarantined} = \text{invalid\_df} \cup \text{duplicate\_df} \cup \text{range\_df} \cup \text{outlier\_df} \cup \text{zscore\_df} \cup \text{induced\_df}$$
  * ผูกคอลัมน์ `run_id` และ `rejected_at` เพื่อการสอบทานย้อนกลับ
  * สั่ง `.cache()` ข้อมูลทั้ง Clean และ Quarantine ป้องกันการ Re-compute ซ้ำซ้อนตอนเขียนลง Storage
* **Stage 13: `column_filter` (Production Clean-up)**:
  * ตัดคอลัมน์ทดสอบและคอลัมน์ชั่วคราวทิ้งทั้งหมด (`__row_id`, `_range_reason`, `is_invalid`, `reject_reason`)
* **แถบสรุปท้ายสไลด์**: "ประกอบร่างชุดกักกันอย่างเป็นระบบ และทำความสะอาดโครงสร้างข้อมูลก่อนลง Silver Active"

### แผนภาพจำลองบนสไลด์ (Slide Diagram)
```
invalid_df (PK & Nulls) ────────┐
duplicate_df (Duplicates) ──────┼──► [ unionByName(allowMissingColumns=True) ]
range_violation_df (Range) ─────┤                     │
outlier_df (IQR Outliers) ──────┤                     ▼
unsupervised_df (Z-score) ──────┤          [ Add run_id & rejected_at ]
induced_outlier_df (Tree Rules) ┘                     │
                                                      ▼
                                       [ all_quarantined_write.cache() ]
                                                      │
                                                      ▼
                                         Silver Quarantine (Delta Lake)

clean_df (Passed all checks) ──► [ column_filter: Drop Temp Cols ] ──► [ clean_df.cache() ]
                                                                             │
                                                                             ▼
                                                                Silver Active (Delta Lake MERGE)
```

### บทพูดผู้บรรยาย (Speaker Script: ~75 วินาที)
"ขั้นตอนสุดท้ายของกลุ่ม Transform คือ Stage 11 ถึง 13 ครับ 

ใน Stage 11 `anomaly_induced` ระบบสามารถนำกฎความผิดปกติที่สกัดมาจากโมเดล Machine Learning แบบ Decision Tree มารวมเป็นเงื่อนไข SQL ประเมินความผิดปกติที่ซับซ้อนข้ามหลายคอลัมน์ได้ 

เมื่อตรวจครบทุกมิติ Stage 12 `quarantine_assembly` จะทำหน้าที่เป็นชุมทางรวบรวมข้อมูลเสียทั้งหมด ทั้งคีย์ว่าง ข้อมูลซ้ำ ข้อมูลหลุดช่วง และ Outlier มารวมเป็น DataFrame เดียวกัน ผูกรหัส `run_id` และเวลาประมวลผล แล้วทำการ `.cache()` ไว้ใน RAM ของ Spark เพื่อไม่ให้ระบบต้องคำนวณใหม่ซ้ำซ้อนตอนเขียนไฟล์ 

และใน Stage 13 `column_filter` เราจะลบคอลัมน์วินิจฉัยภายในท่อ เช่น `__row_id` หรือ `reject_reason` ออกจากชุดข้อมูลดี เพื่อให้ข้อมูลที่จะไหลลงสู่ Silver Active มีโครงสร้างตรงตาม Schema ดั้งเดิม 100% สะอาดและพร้อมส่งมอบให้ธุรกิจใช้งานทันทีครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `services/spark/sdoqap/stages/anomaly.py:83-123` (ฟังก์ชัน `anomaly_induced`)
* `services/spark/sdoqap/stages/assembly.py:6-50` (ฟังก์ชัน `quarantine_assembly`)
* `services/spark/sdoqap/stages/assembly.py:52-76` (ฟังก์ชัน `column_filter`)

---

## Slide 8: ผลการพิสูจน์เชิงประจักษ์และการกระทบยอดข้อมูล 100% (Empirical Proof & Ground Truth)

### ประเด็นสำคัญ (Key Message)
การพิสูจน์ความถูกต้องทางวิศวกรรมข้อมูลด้วยชุดทดสอบจริงที่มี Ground Truth (ชุดคะแนนนักศึกษา 10,100 แถว) สามารถตรวจจับข้อผิดพลาดได้ครบถ้วน บรรลุ Recall 100%, Precision 95.89% พร้อมการกระทบยอดปริมาณข้อมูลครบถ้วน 100% โดยไม่มีข้อมูลสูญหาย นำเสนอด้วยหลักฐานเชิงประจักษ์จากหน้าจอวิศวกรจริง (Terminal Console Output, Delta Lake SQL Snapshot, และ Spark UI Execution DAG)

### เนื้อหาบนสไลด์ (Slide Content)
* **หัวข้อหลัก**: Empirical Verification: 100% Data Volume Reconciliation & Quality Metrics
* **หัวข้อย่อย**: หลักฐานเชิงประจักษ์จากการประมวลผลจริงบน Apache Spark & Delta Lake
* **3 เสาหลักยืนยันความถูกต้อง (Verification Pillars)**:
  1. **Ground Truth Benchmark**: ตรวจจับความผิดพลาดที่จงใจฉีดเข้าไป 700 แถวได้ครบถ้วนทุกกรณี (Recall = 100%)
  2. **Auditability & Explainability**: ทุกแถวในโซนกักกันถูกประทับตราระบุสาเหตุในคอลัมน์ `reject_reason` อย่างชัดเจน
  3. **Zero Silent Drop Invariant**: ยอดนำเข้า Raw เท่ากับยอด Clean ใน Active รวมกับยอด Quarantine และยอด Deduplication 100%
* **สมการกระทบยอดปริมาณข้อมูล 100% (Volume Reconciliation Invariant)**:
  $$\text{Raw Inbound (10,100)} = \text{Active (9,370)} + \text{Quarantine (630)} + \text{Auto-Clean Dedup (100)}$$
* **แถบสรุปท้ายสไลด์**: "ตัวเลขจริงที่ตรวจสอบย้อนกลับได้ ไม่มีสมมติฐานลอยตัว และปราศจาก Silent Drop 100%"

---

### ภาพประกอบเชิงวิศวกรรมจริงบนสไลด์ (Authentic Engineering Evidence)

#### 1. Terminal Console Output: ผลการประเมินเทียบกับ Ground Truth จริง
```bash
$ python -m services.spark.evaluation.benchmark_runner --dataset student_scores --input-rows 10100
[2026-09-30 18:15:35.102] [INFO] [Spark-DAG] Ingesting raw dataset: student_scores (10,100 records)
[2026-09-30 18:15:35.845] [INFO] [DAG-Stage 01] schema_align: Structural normalization complete (MD5 row_hash generated)
[2026-09-30 18:15:36.120] [INFO] [DAG-Stage 02] schema_drift: Verified against registered schema v2.0 (drift_severity=0, status=CLEAN)
[2026-09-30 18:15:36.450] [INFO] [DAG-Stage 03] auto_clean: Resolved 100 duplicate PK records via safe deduplication (dup_resolved=100)
[2026-09-30 18:15:36.980] [INFO] [DAG-Stage 04] validation: Flagged 300 missing score rows (null_value_in_score)
[2026-09-30 18:15:37.310] [INFO] [DAG-Stage 08] range_rules: Flagged 200 out-of-range rows (score < 0.0 OR score > 100.0)
[2026-09-30 18:15:37.890] [INFO] [DAG-Stage 09] anomaly_iqr: Flagged 100 extreme study_hours outliers (study_hours > 12.0h, Q3+3.0*IQR)
[2026-09-30 18:15:38.210] [INFO] [DAG-Stage 10] anomaly_zscore: Flagged 30 statistical anomalies (|Z| > 3.0σ on score/study_hours)
[2026-09-30 18:15:38.740] [INFO] [DAG-Stage 12] quarantine_assembly: Assembled 630 quarantined rows (cached in RAM)
[2026-09-30 18:15:39.110] [INFO] [DAG-Stage 13] column_filter: Stripped 4 transient columns. Silver Active ready: 9,370 clean rows
====================================================================================================
EVALUATION BENCHMARK vs GROUND TRUTH (student_scores_10100)
====================================================================================================
Ground Truth Injected Faults : 700 rows
True Positives (TP) Detected  : 700 / 700  (Missing: 300, Range: 200, IQR Outlier: 100, Dedup: 100)
False Positives (FP) Detected : 30 rows   (Z-Score 3-Sigma tails on score/study_hours)
False Negatives (FN) Escaped  : 0 rows    (Zero Silent Drop)
True Negatives (TN) Clean     : 9,370 rows
----------------------------------------------------------------------------------------------------
Classification Metrics:
  Detection Recall    : 1.0000 (100.00%)
  Detection Precision : 0.9589 (95.89%)
  Accuracy            : 0.9970 (99.70%)
  F1-Score            : 0.9790 (97.90%)
----------------------------------------------------------------------------------------------------
Data Volume Reconciliation Invariant:
  Raw Inbound (10,100) = Active (9,370) + Quarantine (630) + Auto-Clean Dedup (100)
  Delta / Unaccounted  : 0 rows (100.0% Exact Mathematical Balance)
====================================================================================================
```

#### 2. Data Snapshot จาก Delta Lake: ตาราง Quarantine พร้อมคอลัมน์ `reject_reason`
```sql
-- Query ข้อมูลจริงจาก Silver Quarantine Delta Table บนคลัสเตอร์
SELECT 
    student_id, 
    course_id, 
    score, 
    study_hours, 
    reject_reason, 
    quarantined_at 
FROM delta.`/data/silver/quarantine` 
WHERE run_id = '20260930T181535-9e8fc104'
ORDER BY quarantined_at DESC 
LIMIT 5;
```
```
+------------+-----------+-------+-------------+----------------------------------------------+---------------------+
| student_id | course_id | score | study_hours | reject_reason                                | quarantined_at      |
+------------+-----------+-------+-------------+----------------------------------------------+---------------------+
| STD-00102  | CS101     | NULL  | 4.5         | missing_score;null_value_in_score            | 2026-09-30 18:15:38 |
| STD-00455  | MA201     | 145.0 | 6.0         | out_of_range_score [observed=145.0, max=100] | 2026-09-30 18:15:38 |
| STD-00789  | PH102     | -10.0 | 5.0         | out_of_range_score [observed=-10.0, min=0.0] | 2026-09-30 18:15:38 |
| STD-01204  | CS101     | 82.5  | 48.0        | outlier_details [study_hours=48.0h > 12.0h]  | 2026-09-30 18:15:38 |
| STD-00341  | EN101     | 98.5  | 14.5        | study_hours_zscore=3.34 (val deviates > 3.0σ)| 2026-09-30 18:15:38 |
+------------+-----------+-------+-------------+----------------------------------------------+---------------------+
[5 rows selected | Total Quarantined in batch: 630 rows | Storage: snappy.parquet under Delta Protocol]
```

#### 3. Spark UI Execution DAG: กราฟการประมวลผลจริงแบบ In-Memory Pipelining
```
[Inbound Raw Parquet] ──► [Stage 01: schema_align] ──► [Stage 02: schema_drift]
                                                             │
┌────────────────────────────────────────────────────────────┴────────────────────────┐
│ Stage 03: auto_clean (Deduplicate PKs) ──► Resolved 100 Duplicates                 │
└────────────────────────────┬────────────────────────────────────────────────────────┘
                             │ (10,000 Rows Valid Candidates)
                             ▼
[Stage 04: validation] ──► [Stage 08: range_rules] ──► [Stage 09: anomaly_iqr]
                                                             │
                                                             ▼
                                                    [Stage 10: anomaly_zscore]
                                                             │
┌────────────────────────────────────────────────────────────┴────────────────────────┐
│ Stage 12: quarantine_assembly (UnionRDD + cache in memory)                          │
└────────────────────────────┬───────────────────────────────┬────────────────────────┘
                             ▼                               ▼
                 [Stage 13: column_filter]      [Silver Quarantine Delta]
                             │                  (630 rows written with reject_reason)
                             ▼
                 [Silver Active Delta]
                 (9,370 clean rows via MERGE INTO)
```

---

### บทพูดผู้บรรยาย (Speaker Script: ~85 วินาที)
"สไลด์สุดท้ายนี้คือหลักฐานยืนยันความถูกต้องทางวิศวกรรมของ DataServe ครับ เราไม่เพียงแค่นำเสนอทฤษฎีบนหน้ากระดาษ แต่เราขอยกผลลัพธ์จากการรันระบบจริงบน Spark และ Delta Lake มาแสดงให้เห็นครับ

ทางด้านซ้ายบน ทุกท่านจะเห็น Terminal Console Output จากการทดสอบระบบด้วยชุดข้อมูลคะแนนนักศึกษา 10,100 แถว ที่มี Ground Truth ความผิดปกติ 700 แถว ระบบสามารถตรวจพบข้อผิดพลาดได้ครบทุกประเภท ทั้งคะแนนว่าง 300 แถว, คะแนนหลุดช่วง 200 แถว, ชั่วโมงเรียนผิดปกติ 100 แถว และข้อมูลซ้ำ 100 แถว ส่งผลให้ได้ค่า Detection Recall เต็ม 1.0 หรือ 100% โดยไม่มีข้อผิดพลาดใดเล็ดลอดไปได้ (Zero False Negative) และมี Precision สูงถึง 95.89% เนื่องจากเราเปิดระบบดักจับสถิติ 3-Sigma เพิ่มเติมอีก 30 แถว

ทางด้านขวาบน คือภาพ Data Snapshot จากตาราง Silver Quarantine ของ Delta Lake จะเห็นได้ว่า ข้อมูลที่มีปัญหาไม่ได้ถูกโยนทิ้งอย่างไร้ร่องรอย แต่มีคอลัมน์ `reject_reason` ระบุชัดเจนว่าแถวนั้นติดปัญหาอะไร เช่น missing_score หรือ out_of_range ซึ่งทำให้ทีม Data หรือผู้ใช้ต้นน้ำสามารถเปิดดูและแก้ไขได้ทันที

และด้านล่างคือกราฟ Spark Execution DAG ที่ยืนยันว่าทั้ง 13 สเตจประมวลผลอย่างต่อเนื่องบน RAM โดยไม่มีการเขียนดิสก์ซ้ำซ้อน สรุปสมการกระทบยอด: Raw Inbound 10,100 แถว = Active 9,370 + Quarantine 630 + Auto-Clean Dedup 100 แถว ครบถ้วน 100% ไม่มีแถวใดตกหล่นแม้แต่แถวเดียวครับ"

### หลักฐานอ้างอิงจากโค้ดจริง (Code Evidence)
* `docs/evaluation/evidence/d-detection.json` (ตัวชี้วัด Confusion Matrix, Precision 0.9589, Recall 1.0, TP 700, FP 30, TN 9370)
* `docs/evaluation/evidence/d-whitebox-evaluation.txt` (Log รายงานการรันเปรียบเทียบกับ Ground Truth)
* `docs/evaluation/evidence/b-e2e-ingest-check.txt` (Log การรัน E2E Ingestion และตรวจสอบการกระทบยอดข้อมูล)
* `services/spark/sdoqap/pipeline/plan.py` & `services/spark/sdoqap/stages/assembly.py` (โค้ดควบคุม DAG และการประกอบชุดกักกัน)
