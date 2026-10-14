# รายงานผลการทดสอบชุดข้อมูล Online Retail ขนาด 541,909 แถว (500K Scale Benchmark & Quality Report)

**โครงการ**: SDOQAP / DataServe Platform  
**ชุดข้อมูล**: UCI Online Retail Transaction Dataset (`online_retail.csv`)  
**วัตถุประสงค์**: ทดสอบการประมวลผลชุดข้อมูลขนาดใหญ่ระดับ 500,000 แถว (500K Scale) ตามข้อกำหนด Step 9 และ Step 10 ใน `Evalution_Guildline.md` ของอาจารย์ที่ปรึกษา  
**วันที่ทดสอบ**: 14 ตุลาคม 2569  
**สภาวะแวดล้อมที่ทดสอบ**: Production Data Pipeline Engine  

---

## 1. คุณลักษณะพื้นฐานของชุดข้อมูล (Dataset Metadata)

| รายการ | รายละเอียด |
|---|---|
| **ชื่อไฟล์** | `online_retail.csv` |
| **ขนาดไฟล์** | 47,767,978 ไบต์ (47.77 MB) |
| **จำนวนแถวทั้งหมด (Total Rows)** | **541,909 แถว** (ตรงตามสเกล 500K Records) |
| **จำนวนคอลัมน์ (Columns)** | 8 คอลัมน์ (`InvoiceNo`, `StockCode`, `Description`, `Quantity`, `InvoiceDate`, `UnitPrice`, `CustomerID`, `Country`) |
| **ประเภทโจทย์ธุรกิจ** | การซื้อขายสินค้าออนไลน์ข้ามประเทศ (E-Commerce Multi-National Transactions) |

---

## 2. ผลการทดสอบประสิทธิภาพและเวลาในการประมวลผล (Processing Time Benchmark)

สอดคล้องกับข้อกำหนด **Step 9 — วัด Processing Time** ในคู่มือการประเมินผล:

| ขั้นตอนการประมวลผล (Pipeline Stage) | เวลาที่ใช้จริง (Execution Time) | Throughput อัตราเร็ว |
|---|---|---|
| **1. Data Ingestion & Reading** | 0.57 วินาที | ~950,717 แถว/วินาที |
| **2. Data Profiling & Null/Type Analysis** | 0.47 วินาที | ~1,153,000 แถว/วินาที |
| **3. Rule Validation & Zone Segregation** | 0.19 วินาที | ~2,852,150 แถว/วินาที |
| **รวมเวลาประมวลผล End-to-End ทั้งหมด** | **1.23 วินาที** | **~440,576 แถว/วินาที** |

### ตารางเปรียบเทียบสเกลการประมวลผล 4 ระดับ (Step 9 Complete Matrix)

| ระดับสเกล (Target Scale) | ชุดข้อมูลที่ใช้จริง (Actual Dataset) | จำนวนแถว (Rows) | เวลาประมวลผลจริง (Time) | ผลการประเมิน |
| :---: | :--- | :---: | :---: | :---: |
| **10K** | Student Course Score (`dirty_dataset.csv`) | 10,100 | 0.15 วินาที | ผ่านเกณฑ์ดีเยี่ยม |
| **100K** | Sales Records (`100000 Sales Records.csv`) | 100,000 | 0.42 วินาที | ผ่านเกณฑ์ดีเยี่ยม |
| **500K** | Online Retail Transactions (`online_retail.csv`) | **541,909** | **1.23 วินาที** | **ผ่านเกณฑ์ดีเยี่ยม** |
| **1M** | Geolocation Multi-Point (`olist_geolocation.csv`) | 1,000,163 | 3.85 วินาที | ผ่านเกณฑ์ดีเยี่ยม |

---

## 3. ผลการวิเคราะห์คุณภาพข้อมูลก่อนการแปลง (Data Quality Profiling - Before)

จากการสแกนและตรวจสอบกฎธุรกิจเชิงประจักษ์ (Pre-Transform Quality Check):

| รายการข้อผิดพลาดที่ตรวจพบ | จำนวนแถวที่มีปัญหา | สัดส่วนเปอร์เซ็นต์ | ผลกระทบทางธุรกิจ |
|---|---|---|---|
| **แถวข้อมูลซ้ำซ้อน (Duplicate Records)** | 5,268 แถว | 0.97% | ส่งผลให้ออเดอร์เบิ้ลและยอดขายคำนวณเกินจริง |
| **รายการยกเลิก (Cancellations / Negative Qty)** | 10,624 แถว | 1.96% | Invoice ที่ขึ้นต้นด้วย 'C' และยอด Quantity ติดลบ |
| **ราคาผิดปกติ (Zero or Negative UnitPrice)** | 2,517 แถว | 0.46% | สินค้าแจกฟรี, ค่าธรรมเนียมติดลบ, หรือข้อผิดพลาดลงบัญชี |
| **ไม่มีรหัสลูกค้า (Missing CustomerID)** | 135,080 แถว | 24.93% | รายการสั่งซื้อของลูกค้าที่ไม่เป็นสมาชิก (Guest Checkout) |
| **ไม่มีคำอธิบายสินค้า (Missing Description)** | 1,454 แถว | 0.27% | สินค้าไม่มีชื่อ ไม่สามารถจัดหมวดหมู่ได้ |
| **ค่าเบี่ยงเบนปริมาณสั่งซื้อสูงผิดปกติ (Quantity Outlier)** | 20,511 แถว | - | สั่งซื้อเกิน 37 ชิ้น (เกิน $Q_3 + 3 \times IQR$) |
| **ค่าเบี่ยงเบนราคาสินค้าสูงผิดปกติ (UnitPrice Outlier)** | 12,204 แถว | - | ราคาสินค้าเกิน £12.77 ต่อชิ้น |
| **คะแนนคุณภาพเริ่มต้น (Initial Quality Score)** | **96.85%** | - | คำนวณจากกฎการหักลดข้อผิดพลาดในระบบ |

---

## 4. ผลการคัดแยกข้อมูลผ่าน Data Pipeline (Data Segregation - After)

ระบบใช้ Whitebox Quality Gate คัดแยกข้อมูล 541,909 แถว ออกเป็น 3 โซนอย่างเคร่งครัดตามสถาปัตยกรรม Zero-Trust:

```text
541,909 แถว (Raw Data)
  ├── 🟢 Gold / Clean Zone              : 392,692 แถว (72.46%) -> ข้อมูลสมบูรณ์ สะอาด พร้อมใช้งาน BI
  ├── 🟡 Silver / Human Review Queue    : 132,220 แถว (24.40%) -> ลูกค้า Guest ที่สินค้า/ราคาถูกต้อง
  └── 🔴 Quarantine Lake                :  11,805 แถว  (2.18%) -> ข้อมูลยกเลิก, ราคาติดลบ, ไม่มีชื่อสินค้า
```

- **คะแนนคุณภาพหลังเข้าสู่ Clean Zone**: **100.0%** (ข้อมูลใน Clean Zone ปราศจาก Null, ค่าติดลบ, และ Duplicate)

---

## 5. การนำข้อมูลไปใช้ประโยชน์จริง (Data Utilization & Analytics - Step 10)

เพื่อตอบโจทย์ **Step 10 — ทำ Data Utilization จริง** ในคู่มือของอาจารย์ที่ปรึกษา ข้อมูลใน **Gold / Clean Zone (392,692 แถว)** ถูกนำไปคำนวณ Business Metric สำคัญทันที:

### 5.1 เมทริกซ์สรุปผลทางธุรกิจ (Executive Summary Metrics)
- **ยอดขายสุทธิรวม (Total Clean Revenue)**: **£8,887,208.89** (~8.88 ล้านปอนด์)
- **มูลค่าคำสั่งซื้อเฉลี่ย (Average Order Value - AOV)**: **£479.56** ต่อใบเสร็จ
- **จำนวนลูกค้าที่ใช้งานจริง (Active Unique Customers)**: **4,338 ราย**

### 5.2 สัดส่วนยอดขาย 5 ประเทศแรก (Top 5 Countries by Revenue)
1. **United Kingdom**: £7,285,024.64 (81.97%)
2. **Netherlands**: £285,446.34 (3.21%)
3. **EIRE (Ireland)**: £265,262.46 (2.98%)
4. **Germany**: £228,678.40 (2.57%)
5. **France**: £208,934.31 (2.35%)

---

## 6. สรุปความพร้อมในการนำส่งอาจารย์ที่ปรึกษา (Submission Sign-Off)
- ชุดข้อมูล `online_retail.csv` ได้รับการทดสอบผ่านไปป์ไลน์จริงครบทั้ง 4 ขั้นตอน: Profiling $\rightarrow$ Validation $\rightarrow$ Quarantine/Clean Segregation $\rightarrow$ BI Utilization
- ผลการทดสอบเติมเต็มสเกล **500,000 แถว** ในตารางจับเวลา Benchmark ของระบบอย่างสมบูรณ์แบบ
- ไฟล์ข้อมูลและเอกสารรายงานนี้ถูกบรรจุลงในโฟลเดอร์ส่งมอบ `dataserve/` และ `dataserve.zip` เรียบร้อยแล้ว
