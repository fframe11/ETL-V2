
ให้ทำตามลำดับนี้ครับ

# สิ่งที่ต้องทำก่อนทำสไลด์

## Step 1 — กำหนด Dataset ที่จะใช้ทดลอง

ใช้ **Student Course Score Dataset** เป็นตัวหลักก่อน

ต้องเตรียมอย่างน้อย 2 ชุด:

### 1. Clean Dataset

ข้อมูลที่เราถือว่า **ถูกต้อง 100%**

เช่น 10,000 rows

```text
student_id
course
score
semester
updated_at
```

### 2. Dirty Dataset

Copy จาก Clean Dataset แล้ว **จงใจใส่ปัญหา**

เช่น

| Error         | จำนวน |
| ------------- | ----: |
| NULL          |   300 |
| Invalid Score |   200 |
| Duplicate     |   100 |
| Outlier       |   100 |
| Valid         | 9,300 |

> ตัวเลขด้านบนเป็นตัวอย่าง ต้องใช้จำนวนที่เราสร้างจริง

---

# Step 2 — กำหนด Ground Truth

ก่อน Run ระบบ เราต้องรู้ก่อนว่า

> **ข้อมูลแถวไหนผิด และผิดเพราะอะไร**

เช่นสร้างไฟล์ `ground_truth.csv`

| row_id | error_type    | expected  |
| -----: | ------------- | --------- |
|      3 | NULL          | Missing   |
|      7 | Invalid Score | Invalid   |
|     15 | Duplicate     | Duplicate |
|     28 | Outlier       | Outlier   |
|     29 | None          | Valid     |

สิ่งนี้จะเป็น **คำตอบอ้างอิง** สำหรับการประเมิน

เพราะถ้าไม่มี Ground Truth เราจะตอบไม่ได้ว่าระบบตรวจถูกหรือผิด

---

# Step 3 — กำหนด Business Rules

ต้องกำหนดก่อนว่า Dataset นี้มี Rule อะไร

สำหรับตัวอย่างนี้:

```text
Student ID → Required
Score → Required
Score → 0–100
Student ID + Course → ไม่ควรซ้ำ
Updated At → Daily Batch
```

ตรงนี้สำคัญ เพราะจะทำให้ Configuration ที่เราใช้ในการทดลองมีเหตุผล

---

# Step 4 — กำหนด Configuration ที่จะทดลอง

เอา Rules ที่เราทำไว้ก่อนหน้านี้มาใช้จริง

ตัวอย่าง:

| Parameter            | Configuration |
| -------------------- | ------------- |
| Target Quality Score | 95%           |
| Null Check           | Strict / 0%   |
| Score Range          | 0–100         |
| Outlier              | Auto IQR      |
| Max Freshness Delay  | 24h           |

**แต่ต้องแยกให้ชัดว่า 95%, 0%, 24h เป็น Configuration ของ Test Case นี้ ไม่ใช่ค่าที่ถูกต้องสำหรับข้อมูลทุกประเภท**

---

# Step 5 — Run Dataset ผ่าน ETL

ตอนนี้ค่อยเอา

**Dirty Dataset**

เข้า Platform

แล้วบันทึกผลทุกขั้นตอน

```text
Upload
 ↓
Profiling
 ↓
Rule Configuration
 ↓
Transform
 ↓
Validation
 ↓
Cleaned Data
```

ต้องเก็บค่าที่ระบบแสดงออกมา เช่น

* จำนวน Rows ก่อน Transform
* Null Rate
* Min / Max
* Outlier
* Quality Score
* จำนวน Error ที่ตรวจพบ
* Processing Time
* จำนวน Rows หลัง Transform

---

# Step 6 — เก็บผล Before

ก่อน Transform ให้เก็บค่าไว้ เช่น

```text
Rows              = 10,000
Null              = XXX
Invalid           = XXX
Duplicate         = XXX
Outlier           = XXX
Quality Score     = XX%
Processing Time   = -
```

**ห้ามคิดตัวเลขย้อนหลังเพื่อให้สวย**

---

# Step 7 — เก็บผล After

หลัง Transform:

```text
Rows              = XXXX
Null              = XX
Invalid           = XX
Duplicate         = XX
Outlier           = XX
Quality Score     = XX%
Processing Time   = XX sec
```

แล้วเอาไปเทียบกับ Ground Truth

---

# Step 8 — วัด Detection จริง

ตัวอย่างสมมติ:

เราใส่ Invalid Score เข้าไปจริง

> Actual Invalid = 200 rows

ระบบตรวจเจอ

> Detected = 190 rows

ก็ได้

> Detection Rate = 190 / 200 = **95%**

และต้องดูด้วยว่าระบบแจ้งข้อมูลที่จริง ๆ ถูกต้องเป็น Error หรือไม่

ตรงนี้จะทำให้ Evaluation น่าเชื่อถือกว่าแค่บอกว่า

> “ระบบตรวจ Error ได้”

---

# Step 9 — วัด Processing Time

Run แบบเดียวกันแล้วจับเวลา

เช่น:

```text
Dataset Size

10,000 rows
100,000 rows
500,000 rows
1,000,000 rows
```

บันทึก

| Dataset | Processing Time |
| ------: | --------------: |
|     10K |          XX sec |
|    100K |          XX sec |
|    500K |          XX sec |
|      1M |          XX sec |

ถ้าระบบยังประมวลผล 1M rows ไม่ไหว **ก็ไม่ต้องฝืนทำ 1M** ครับ ใช้ขนาดที่เครื่องและระบบรองรับจริง แล้วรายงานตามจริง

---

# Step 10 — ทำ Data Utilization จริง

หลังจากได้ **Cleaned Data**

อย่าหยุดที่ Transform

เอาข้อมูลไปทำ Analysis ต่อ เช่น

```text
Cleaned Data
      ↓
Average Score
      ↓
Pass / Fail Rate
      ↓
Score Distribution
      ↓
Dashboard / Report
```

ตรงนี้คือสิ่งที่จะตอบว่า

> **“ข้อมูลที่ผ่าน ETL สามารถนำไปใช้ประโยชน์ได้จริง”**

---

# Step 11 — เก็บหลักฐาน

ก่อนทำ Slide ให้มี Evidence เหล่านี้:

### 📁 Dataset

* `clean_dataset.csv`
* `dirty_dataset.csv`
* `ground_truth.csv`

### 📊 Experiment Result

* Before Transform
* After Transform
* Detection Result
* Processing Time

### 🖥️ Screenshot

* Data Profiling
* Configuration
* Transform Result
* Final Clean Data
* Dashboard / Analysis

---

# แล้วค่อยเอามาทำ 6 Slides

เมื่อทำทั้งหมดด้านบนแล้ว 6 หน้าจะง่ายมาก:

| Slide                           | เอาข้อมูลจากไหน            |
| ------------------------------- | -------------------------- |
| **01 Evaluation Objective**     | สิ่งที่เราต้องการวัด       |
| **02 Evaluation Scenario**      | Dataset + Test Case        |
| **03 Evaluation Metrics**       | Metrics ที่กำหนดไว้        |
| **04 Before vs After**          | ผลก่อน/หลัง Transform      |
| **05 Evaluation Results**       | ตัวเลขที่ได้จาก Experiment |
| **06 Data Utilization Outcome** | Analysis + Dashboard       |

---

## 🔥 ดังนั้นตอนนี้ "ยังไม่ต้องทำ Slide"

ให้ทำตามนี้ก่อน:

**① สร้าง Clean Dataset**
↓
**② สร้าง Dirty Dataset**
↓
**③ ทำ Ground Truth**
↓
**④ กำหนด Business Rules**
↓
**⑤ กำหนด Configuration**
↓
**⑥ Run ผ่าน ETL จริง**
↓
**⑦ เก็บ Before / After**
↓
**⑧ วัด Detection + Time**
↓
**⑨ เอา Clean Data ไป Analysis**
↓
**⑩ เก็บ Screenshot + ตัวเลข**

ชุด Dataset
Student Course Score Evaluation Dataset (.zip)

ภายในมี 4 ไฟล์:

ไฟล์	ใช้ทำอะไร
clean_dataset.csv	ข้อมูลอ้างอิงที่ถูกต้อง 10,000 rows
dirty_dataset.csv	ข้อมูลสำหรับเอาเข้า ETL มี Error ที่สร้างไว้ 10,100 rows
ground_truth.csv	คำตอบอ้างอิงว่าแต่ละแถวควรเป็นอะไร
README.md	ขั้นตอนการทดลองทั้งหมด
Error ที่ผมใส่ไว้ใน Dirty Dataset
Missing Score: 300 rows
Invalid Score (นอก 0–100): 200 rows
Study Hours Outlier: 100 rows
Duplicate: 100 rows

ดังนั้นเราสามารถเอา dirty_dataset.csv เข้า ETL-V2 แล้ววัดจริงได้ว่า

Profiling → Rule Configuration → Transform → Validation

จากนั้นเอาผลที่ได้ไปเทียบกับ ground_truth.csv

และเก็บตัวเลขสำหรับทำสไลด์:

Data Quality / Error Detection / Processing Time / Before vs After / Data Utilization

แนะนำ: อย่าเพิ่งแก้ Dataset เองครับ ให้เอา dirty_dataset.csv เข้า ETL ก่อน แล้วเราค่อยไล่ทีละขั้นว่าต้องตั้งค่าใน Rules Hub แต่ละช่องเป็นอะไร และต้องเก็บค่าไหนออกมาเพื่อทำ Evaluation จริง ๆ ครับ


