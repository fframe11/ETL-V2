# SDOQAP Executive Dashboard --- สิ่งที่ควรสร้างและแก้ไข

## 1. เป้าหมายของ Dashboard

Dashboard ของ SDOQAP ไม่ควรเป็นเพียงหน้า Monitoring ที่บอกว่า Data Pipeline หรือ
Service ตัวใดทำงานผิดพลาด แต่ควรทำหน้าที่เป็น **Executive Dashboard**
ที่แปลงข้อมูลทางเทคนิคให้ผู้บริหารเข้าใจผลกระทบต่อข้อมูล KPI และธุรกิจได้ทันที

แนวคิดหลัก:

> **Technical Issue → Data Impact → KPI Impact → Business Impact →
> Action**

ผู้บริหารควรสามารถตอบคำถามต่อไปนี้ได้จากหน้า Dashboard โดยไม่ต้องเข้าไปดู Log หรือ
Pipeline Detail ก่อน

1.  ตอนนี้คุณภาพข้อมูลโดยรวมเป็นอย่างไร?
2.  ข้อมูลที่ใช้งานอยู่มีความพร้อมและเป็นปัจจุบันหรือไม่?
3.  มีปัญหาอะไรที่สำคัญ?
4.  ปัญหานั้นกระทบ KPI หรือส่วนงานใด?
5.  ปัญหาใดควรได้รับความสนใจ?
6.  ปัญหากำลังดีขึ้นหรือแย่ลง?
7.  มีผลกระทบด้านเวลา/ต้นทุน/การดำเนินงานหรือไม่?
8.  ถ้าต้องการดูสาเหตุเชิงเทคนิค สามารถ Drill-down ไปยัง Technical Dashboard
    ได้หรือไม่?

------------------------------------------------------------------------

# 2. สิ่งที่ควรเปลี่ยนจาก Dashboard เดิม

## 2.1 ลดการนำ Technical Metrics มาไว้เป็นจุดเด่นบนหน้าแรก

ข้อมูลประเภทต่อไปนี้ไม่ควรเป็นพระเอกของ Executive Dashboard:

-   Web Server Request
-   App Server Request
-   Database Active Sessions
-   BPM Queue
-   Job Server Queue
-   Top Exceptions
-   Top Threshold Queries
-   Error Count ระดับ Service
-   Query Time ระดับ Technical

ข้อมูลเหล่านี้ยังมีประโยชน์ แต่ควรอยู่ใน **Technical Monitoring Dashboard** หรือหน้า
Drill-down สำหรับ Data Engineer/IT

### หลักการ

หน้าแรกควรตอบ:

> "ธุรกิจได้รับผลกระทบอย่างไร?"

ไม่ใช่:

> "Server ตัวไหน Error?"

------------------------------------------------------------------------

# 3. โครงสร้าง Dashboard ที่แนะนำ

ควรแบ่งเป็น 4 หน้าหลัก

``` text
SDOQAP
│
├── 1. Executive Overview
│
├── 2. Business Impact
│
├── 3. Data Quality
│
└── 4. Technical Monitoring
```

------------------------------------------------------------------------

# 4. หน้า 1 --- Executive Overview

## เป้าหมาย

เป็นหน้าแรกสำหรับผู้บริหาร

คำถามหลัก:

> "ตอนนี้สถานการณ์ข้อมูลขององค์กรเป็นอย่างไร?"

## Layout ที่แนะนำ

``` text
┌─────────────────────────────────────────────────────────────┐
│                    SDOQAP EXECUTIVE OVERVIEW                │
│          Data Quality & Business Impact Monitoring           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ DATA HEALTH     DATA AVAILABILITY     DATA FRESHNESS        │
│     94%                98%                 91%               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ BUSINESS IMPACT                                             │
│ 3 Areas Affected     2 Critical Issues     96% Reports OK  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ DATA QUALITY TREND                                          │
│                 [Line Chart]                                │
│                                                             │
├────────────────────────────┬────────────────────────────────┤
│ BUSINESS KPI IMPACT        │ DATA QUALITY STATUS            │
│                            │                                │
│ Sales KPI       Warning    │ Missing Values      2.1%       │
│ Customer KPI    Warning    │ Duplicate           0.4%       │
│ Reporting       Normal     │ Invalid Type        0.2%       │
│                            │ Schema Drift        1          │
├────────────────────────────┴────────────────────────────────┤
│                                                             │
│ CRITICAL BUSINESS ISSUES                                    │
│ Issue | Business Impact | Severity | Duration | Status      │
└─────────────────────────────────────────────────────────────┘
```

> ตัวเลขในตัวอย่างเป็นเพียงตัวอย่าง Layout ไม่ใช่ค่าจริงที่ควรนำไปใช้

------------------------------------------------------------------------

# 5. Executive KPI Cards

ด้านบนของ Dashboard ควรมี KPI Cards ประมาณ 4--6 ใบ

## Card 1 --- Data Health

### ชื่อ

**Data Health Score**

### แสดง

-   คะแนนคุณภาพข้อมูลโดยรวม
-   สถานะ เช่น Good / Warning / Critical
-   Trend เทียบกับช่วงก่อนหน้า

### ใช้สะท้อน

-   Missing Values
-   Duplicate Records
-   Invalid Data Type
-   Schema Drift
-   Validation Issues

ข้อมูลในเอกสาร SDOQAP ระบุปัญหาเหล่านี้เป็น Technical Issues
ที่กระทบคุณภาพและการใช้งานข้อมูล

------------------------------------------------------------------------

## Card 2 --- Data Availability

### ชื่อ

**Data Availability**

### แสดง

-   เปอร์เซ็นต์ของข้อมูล/ระบบที่พร้อมใช้งาน
-   จำนวน Data Source หรือ Pipeline ที่ไม่พร้อมใช้งาน
-   Trend

### เหตุผล

Pipeline Failure สามารถทำให้ข้อมูลไม่ถูกอัปเดต และส่งผลต่อ Data Availability

------------------------------------------------------------------------

## Card 3 --- Data Freshness

### ชื่อ

**Data Freshness**

### แสดง

-   ความสดใหม่ของข้อมูล
-   Last Update
-   จำนวน Data Source ที่ล่าช้า
-   Trend

### เหตุผล

Data Freshness Delay ทำให้ข้อมูลไม่เป็นปัจจุบัน และอาจทำให้การตัดสินใจล่าช้า

------------------------------------------------------------------------

## Card 4 --- Business Impact

### ชื่อ

**Business Impact**

### แสดง

-   จำนวน Business Areas ที่ได้รับผลกระทบ
-   จำนวน Critical Issues
-   จำนวน KPI ที่ได้รับผลกระทบ

ตัวอย่าง:

``` text
3 Business Areas
2 Critical Issues
5 KPIs Affected
```

------------------------------------------------------------------------

## Card 5 --- Report Availability

### ชื่อ

**Report Availability**

### แสดง

-   จำนวนรายงานที่พร้อมใช้งาน
-   จำนวนรายงานที่ล่าช้า
-   จำนวนรายงานที่สร้างไม่สำเร็จ

เหตุผล:

Pipeline Failure อาจทำให้รายงานประจำวันไม่สามารถสร้างได้

------------------------------------------------------------------------

## Card 6 --- Active Critical Issues

### ชื่อ

**Critical Issues**

### แสดง

-   จำนวนปัญหาสำคัญที่ยังไม่ถูกแก้ไข
-   Trend
-   ระยะเวลาที่ปัญหาค้างอยู่

------------------------------------------------------------------------

# 6. ส่วน Data Quality Trend

สร้างกราฟแสดงแนวโน้มคุณภาพข้อมูลตามเวลา

## Chart

**Line Chart**

แกน X: - Date / Time

แกน Y: - Data Quality Score (%)

ตัวอย่าง:

``` text
100 ┤
 95 ┤       ╭──╮
 90 ┤   ╭───╯  ╰──╮
 85 ┤───╯          ╰──
    └──────────────────
      Mon Tue Wed Thu Fri
```

## จุดประสงค์

ไม่ใช่แค่บอกว่า "วันนี้มี Error"

แต่บอกว่า:

> คุณภาพข้อมูลกำลังดีขึ้นหรือแย่ลง?

------------------------------------------------------------------------

# 7. ส่วน Business KPI Impact

สร้างตารางหรือกราฟที่เชื่อม Technical Issue กับ KPI

ตัวอย่าง:

  Technical Issue     KPI ที่ได้รับผลกระทบ           Business Impact
  ------------------- -------------------------- ---------------------
  Schema Drift        Data Accuracy              รายงานผิดพลาด
  Missing Values      Report Accuracy            การตัดสินใจผิดพลาด
  Duplicate Records   Sales KPI / Customer KPI   ตัวเลขเกินจริง
  Invalid Data Type   Data Availability          Dashboard อัปเดตไม่ได้
  Pipeline Failure    Data Availability          ผู้บริหารไม่มีข้อมูลล่าสุด
  API Failure         Data Freshness             ข้อมูลไม่ทันเวลา
  Data Delay          Decision Response Time     การตัดสินใจล่าช้า
  Poor Data Quality   Business Trust             ความเชื่อมั่นต่อข้อมูลลดลง

ตารางนี้ควรเป็นแกนสำคัญของ SDOQAP เพราะเอกสารกำหนด Impact-to-KPI Mapping
ไว้แล้ว

------------------------------------------------------------------------

# 8. Critical Business Issues

แทนที่จะนำ "Top 5 Exceptions" แบบ Technical มาไว้หน้าแรก ให้เปลี่ยนเป็น

## Critical Business Issues

แสดงเฉพาะปัญหาที่มี Business Impact

คอลัมน์ที่แนะนำ:

  ---------------------------------------------------------------------------
  Issue       Business    KPI         Severity    Duration    Status
              Impact                                          
  ----------- ----------- ----------- ----------- ----------- ---------------
  Pipeline    Report      Report      Critical    42 min      Investigating
  Failure     Delay       Accuracy                            

  Data Delay  Decision    Decision    Warning     25 min      Monitoring
              Delay       Response                            
                          Time                                

  Duplicate   KPI         Sales KPI   Warning     1 hr        Resolving
  Data        Accuracy                                        
  ---------------------------------------------------------------------------

ตัวอย่างข้อมูลเป็นเพียงโครงสร้าง ไม่ใช่ข้อมูลจริง

------------------------------------------------------------------------

# 9. หน้า 2 --- Business Impact Dashboard

## เป้าหมาย

ตอบ:

> "ปัญหาทางเทคนิคส่งผลต่อธุรกิจอย่างไร?"

## Flow

``` text
Technical Issue
      ↓
Technical Impact
      ↓
KPI Impact
      ↓
Business Impact
```

------------------------------------------------------------------------

# 10. Business Impact Mapping

ควรสร้าง Visualization ให้เห็นความสัมพันธ์

``` text
Pipeline Failure
       ↓
Data Not Updated
       ↓
Data Availability ↓
       ↓
Management Report Delayed
       ↓
Decision Response Time ↓
```

อีกตัวอย่าง:

``` text
Duplicate Records
       ↓
Incorrect Record Count
       ↓
Sales KPI / Customer KPI
       ↓
Business Data Accuracy ↓
```

------------------------------------------------------------------------

# 11. Business Area Impact

สร้าง Chart หรือ Matrix แสดงว่า Business Area ไหนได้รับผลกระทบ

ตัวอย่าง:

``` text
Business Area
────────────────────
Sales          ⚠
Customer       ⚠
Reporting      🔴
Operations     ✓
Finance        ✓
```

ถ้าระบบมีข้อมูลจริง ควรให้ผู้ใช้กด Business Area เพื่อ Drill-down ต่อได้

------------------------------------------------------------------------

# 12. KPI Impact Overview

สร้าง Chart แสดงจำนวนหรือระดับ KPI ที่ได้รับผลกระทบ

ตัวอย่าง:

``` text
Sales KPI          ████████
Customer KPI       █████
Report Accuracy    ███████
Data Availability  ████
Decision Response  ███
```

ต้องกำหนดวิธีคำนวณจากข้อมูลจริงก่อนนำไปใช้งาน

------------------------------------------------------------------------

# 13. หน้า 3 --- Data Quality Dashboard

## เป้าหมาย

ตอบ:

> "ข้อมูลมีคุณภาพแค่ไหน และปัญหาคุณภาพข้อมูลประเภทใดเกิดขึ้นมากที่สุด?"

## KPI ที่ควรมี

-   Missing Values
-   Duplicate Records
-   Invalid Data Type
-   Schema Drift
-   Validation Failure
-   Poor Data Quality
-   Data Quality Score

------------------------------------------------------------------------

# 14. Data Quality Breakdown

ทำเป็น Chart เช่น Bar Chart

``` text
Missing Values       █████████
Duplicate Records    ███
Invalid Data Type    ██
Schema Drift         █
Validation Failure   ████
```

จุดประสงค์คือให้ผู้บริหารเห็น "ประเภทของปัญหา" โดยไม่ต้องเปิด Log

------------------------------------------------------------------------

# 15. Data Quality Trend

ควรมี Trend เช่น

``` text
Data Quality Score
        ↓
100% ─────────────────
 95% ────────────╮
 90% ───────╮    ╰──
 85% ───────╰───────
      Week 1 Week 2 Week 3
```

สามารถเลือกช่วงเวลาได้ เช่น:

-   Today
-   7 Days
-   30 Days
-   90 Days

------------------------------------------------------------------------

# 16. หน้า 4 --- Technical Monitoring Dashboard

หน้านี้ค่อยนำแนวคิดจาก Dashboard Monitoring ที่มีอยู่มาใช้

## แสดง

-   Pipeline Status
-   Pipeline Failure
-   API Availability
-   Elasticsearch Status
-   Service Dependency
-   Job Status
-   Error / Exception
-   Data Processing
-   Data Freshness
-   Logs

## จุดประสงค์

ตอบ:

> "ปัญหาเกิดที่ไหน และทีม Technical ต้องแก้อย่างไร?"

------------------------------------------------------------------------

# 17. เปลี่ยน "Top 5 Exceptions"

จากเดิม:

``` text
Top 5 Exceptions
- Database Error
- Timeout
- Remote Server Error
...
```

ให้ Technical Dashboard มีรายละเอียดแบบนี้ได้

``` text
Exception
    ↓
Affected Service
    ↓
Affected Pipeline
    ↓
Affected Dataset
    ↓
Business KPI
    ↓
Business Impact
```

นี่จะช่วยให้ Technical Issue เชื่อมกลับไปยัง Business Impact ได้

------------------------------------------------------------------------

# 18. เพิ่ม Drill-down

Dashboard ไม่ควรบอกเพียงว่า

> "Sales KPI ได้รับผลกระทบ"

ควรกดเข้าไปดูรายละเอียดได้

``` text
Executive Overview
       ↓
Business Impact
       ↓
Sales KPI
       ↓
Affected Dataset
       ↓
Pipeline
       ↓
Technical Error
       ↓
Root Cause / Exception
```

ดังนั้นผู้บริหารเห็นภาพรวม ส่วน Data Engineer สามารถลงรายละเอียดต่อได้

------------------------------------------------------------------------

# 19. เพิ่ม Filter ที่จำเป็น

ด้านบนของ Dashboard ควรมี Filter:

-   Time Period
-   Business Area
-   Data Source
-   Dataset
-   Pipeline
-   Severity
-   Issue Type
-   Status

ไม่ควรใส่ Filter จำนวนมากเกินไปในหน้า Executive Overview

Filter ที่สำคัญที่สุดควรเป็น:

``` text
Time Period
Business Area
Severity
Status
```

------------------------------------------------------------------------

# 20. Severity

ควรกำหนดระดับความรุนแรงให้ชัดเจน

ตัวอย่าง:

### Critical

มีผลกระทบต่อ KPI หรือกระบวนการธุรกิจสำคัญ

### Warning

มีความผิดปกติ แต่ยังไม่ส่งผลกระทบรุนแรงหรือระบบยังทำงานต่อได้

### Normal

ระบบและข้อมูลอยู่ในสถานะปกติ

> เกณฑ์จริงควรกำหนดจาก Business Rule ขององค์กร ไม่ควรใช้ตัวเลขสมมติ

------------------------------------------------------------------------

# 21. เพิ่ม "Status"

ทุกปัญหาที่แสดงใน Executive Dashboard ควรมีสถานะ เช่น

-   Detected
-   Investigating
-   Resolving
-   Monitoring
-   Resolved

เพื่อให้ผู้บริหารรู้ว่า:

> "ปัญหานี้ถูกค้นพบแล้ว แต่ตอนนี้จัดการถึงขั้นไหน?"

------------------------------------------------------------------------

# 22. เพิ่ม Time / Duration

สำหรับปัญหาสำคัญควรแสดง

-   Detected Time
-   Duration
-   Resolved Time
-   Last Updated

ตัวอย่าง:

``` text
Pipeline Failure

Detected:
10:25

Duration:
42 minutes

Status:
Investigating
```

เพราะข้อมูลในเอกสารระบุว่าปัญหา Data Delay และ Pipeline Failure
สามารถทำให้การตอบสนองและการตัดสินใจล่าช้าได้

------------------------------------------------------------------------

# 23. Cost / Damage Dashboard

ควรเพิ่มส่วนที่แสดงผลกระทบด้านต้นทุน/ความเสียหาย ถ้ามีข้อมูลรองรับ

หัวข้อที่สามารถติดตาม:

-   Manual Data Checking Time
-   Root Cause Analysis Time
-   Data Reprocessing Time
-   Report Rework Time
-   Pipeline Downtime
-   Data Cleansing Time

เอกสาร SDOQAP ระบุว่า หากไม่มีระบบ องค์กรอาจต้องใช้เวลาตรวจสอบข้อมูลด้วยคน
สร้างรายงานใหม่ ทำ Data Cleansing ย้อนหลัง และใช้เวลาหาสาเหตุของปัญหานานขึ้น

------------------------------------------------------------------------

# 24. ROI / Business Value

สามารถทำเป็นหน้าเพิ่มเติม หรือ Section ใน Executive Overview

## Cost Reduction

ติดตาม:

-   ลดเวลาตรวจสอบข้อมูล
-   ลดเวลาหา Root Cause
-   ลดการแก้ข้อมูลย้อนหลัง
-   ลดเวลาสร้างรายงานใหม่
-   ลด Pipeline Downtime

## Operational Efficiency

ติดตาม:

-   Automated Data Quality Checks
-   Issue Detection
-   Mean Time to Resolution
-   System Status Visibility
-   Data Engineer / Data Analyst Support

## Business Value

ติดตาม:

-   Data Trust
-   Decision Support
-   Risk Reduction
-   Data Lineage
-   Traceability
-   Data Governance

ข้อมูลเหล่านี้สอดคล้องกับ Business Value ที่ระบุในเอกสาร SDOQAP

------------------------------------------------------------------------

# 25. สิ่งที่ควรเพิ่มใน Dashboard เพื่อให้ "ผู้บริหารเข้าใจทันที"

ควรใช้หลัก 5 คำถาม:

``` text
WHAT?
เกิดอะไรขึ้น?

WHY?
เกิดจากอะไร?

IMPACT?
กระทบอะไร?

HOW MUCH?
กระทบมากแค่ไหน?

ACTION?
ตอนนี้จัดการถึงไหน?
```

ตัวอย่าง:

``` text
WHAT
Pipeline Failure

WHY
Source API unavailable

IMPACT
Daily Sales Report delayed

HOW MUCH
2 KPI affected

ACTION
Investigating
```

นี่มีประโยชน์ต่อผู้บริหารมากกว่าการแสดง Error Count เพียงอย่างเดียว

------------------------------------------------------------------------

# 26. Dashboard Information Hierarchy

ควรจัดข้อมูลจากบนลงล่างดังนี้

``` text
LEVEL 1
Overall Business Situation
        ↓
LEVEL 2
Data Health / Availability / Freshness
        ↓
LEVEL 3
Business Impact / KPI Impact
        ↓
LEVEL 4
Critical Issues
        ↓
LEVEL 5
Technical Root Cause
```

ผู้บริหารจึงสามารถอ่านจากบนลงล่างแล้วเข้าใจสถานการณ์โดยไม่ต้องรู้รายละเอียด Technical

------------------------------------------------------------------------

# 27. สิ่งที่ "ไม่ควร" ทำ

## ไม่ควร 1

เอา Technical Metrics ทั้งหมดมาไว้หน้าเดียว

เพราะจะทำให้ผู้บริหารต้องแปลข้อมูลเอง

------------------------------------------------------------------------

## ไม่ควร 2

แสดง Error Count แล้วจบ

เช่น:

``` text
Errors: 46
```

ข้อมูลนี้ยังไม่ตอบว่า:

> แล้วกระทบอะไร?

------------------------------------------------------------------------

## ไม่ควร 3

ใช้กราฟเยอะเกินไป

ทุก Chart ต้องตอบคำถามที่ชัดเจน

------------------------------------------------------------------------

## ไม่ควร 4

ใช้สีแดงเต็ม Dashboard

สีแดงควรสงวนไว้สำหรับปัญหาที่ต้องให้ความสนใจจริง ๆ

------------------------------------------------------------------------

## ไม่ควร 5

ใส่ KPI ที่ไม่มีแหล่งข้อมูลจริง

ถ้ายังไม่มีข้อมูลสำหรับคำนวณ KPI เช่น ROI หรือ Business Cost
ไม่ควรสร้างตัวเลขขึ้นมาเอง

ควรแสดงเป็น:

``` text
Data Not Available
```

หรือเตรียม Data Model สำหรับรองรับในอนาคต

------------------------------------------------------------------------

# 28. Data Model ที่ Dashboard ควรได้รับ

เพื่อทำ Executive Dashboard ได้จริง SDOQAP ควรเชื่อมข้อมูลอย่างน้อยในลักษณะนี้

``` text
Issue
│
├── Issue Type
├── Severity
├── Status
├── Detected Time
├── Resolved Time
│
↓
Pipeline / Service
│
↓
Dataset
│
↓
Data Quality Result
│
↓
KPI
│
↓
Business Area
│
↓
Business Impact
```

สิ่งสำคัญคือ **ต้องมี Mapping ระหว่าง Technical Issue กับ Business KPI**

เพราะเอกสาร SDOQAP มี Impact-to-KPI Mapping อยู่แล้ว

------------------------------------------------------------------------

# 29. Recommended Final Dashboard Structure

## Dashboard 1 --- Executive Overview

``` text
[Data Health]
[Data Availability]
[Data Freshness]
[Business Impact]
[Report Availability]

        ↓

[Data Quality Trend]

        ↓

[Business KPI Impact] [Data Quality Breakdown]

        ↓

[Critical Business Issues]

        ↓

[View Business Impact] [View Technical Details]
```

------------------------------------------------------------------------

## Dashboard 2 --- Business Impact

``` text
[Business Areas Affected]

        ↓

[Technical Issue → KPI → Business Impact]

        ↓

[KPI Impact Chart]

        ↓

[Business Impact Timeline]

        ↓

[Issue Details]
```

------------------------------------------------------------------------

## Dashboard 3 --- Data Quality

``` text
[Data Quality Score]
[Missing]
[Duplicate]
[Invalid Type]
[Schema Drift]

        ↓

[Quality Trend]

        ↓

[Quality Breakdown]

        ↓

[Affected Dataset]

        ↓

[Issue Details]
```

------------------------------------------------------------------------

## Dashboard 4 --- Technical Monitoring

``` text
[Pipeline Status]
[API Status]
[Elasticsearch]
[Service Dependency]
[Job Status]

        ↓

[Exceptions]

        ↓

[Pipeline / Service Details]

        ↓

[Logs / Root Cause]
```

------------------------------------------------------------------------

# 30. Concept ของ SDOQAP Dashboard ที่ควรใช้เป็นหลัก

## จากเดิม

``` text
MONITORING
     ↓
พบ Pipeline Error
     ↓
แจ้ง Data Engineer
```

## เปลี่ยนเป็น

``` text
MONITORING
     ↓
ISSUE DETECTION
     ↓
DATA QUALITY ANALYSIS
     ↓
KPI MAPPING
     ↓
BUSINESS IMPACT
     ↓
EXECUTIVE INSIGHT
     ↓
ACTION
```

------------------------------------------------------------------------

# 31. ประโยคสรุปสำหรับนำเสนอ Project

> **SDOQAP Executive Dashboard ไม่ได้มุ่งเน้นเพียงการตรวจสอบว่า Data Pipeline
> ทำงานผิดพลาดที่จุดใด แต่เปลี่ยนข้อมูลทางเทคนิคให้เป็นข้อมูลเชิงธุรกิจ โดยเชื่อมโยง
> Technical Issue กับ Data Quality, KPI และ Business Impact
> เพื่อให้ผู้บริหารสามารถเข้าใจสถานการณ์และตัดสินใจได้จาก Dashboard ในหน้าเดียว**

------------------------------------------------------------------------

# 32. Priority ในการพัฒนา

## ต้องทำทันที

1.  สร้าง Executive Overview
2.  สร้าง Data Health KPI
3.  สร้าง Data Availability KPI
4.  สร้าง Data Freshness KPI
5.  สร้าง Business Impact KPI
6.  สร้าง Technical Issue → KPI → Business Impact Mapping
7.  สร้าง Critical Business Issues
8.  สร้าง Data Quality Trend
9.  เพิ่ม Drill-down จาก Business Impact → Technical Issue

## ควรทำ

1.  Business Area Impact
2.  KPI Impact Chart
3.  Issue Duration
4.  Issue Status
5.  Data Quality Breakdown
6.  Filter ตาม Time / Business Area / Severity / Status
7.  Technical Monitoring Dashboard แยกจาก Executive Dashboard

## น่าทำถ้ามีเวลาและมีข้อมูลรองรับ

1.  Cost / Damage
2.  ROI
3.  Data Lineage Visualization
4.  MTTR Trend
5.  Automated PDF Executive Report
6.  Predictive / Early Warning
7.  Executive Notification

------------------------------------------------------------------------

# 33. Final Design Principle

SDOQAP ควรเปลี่ยนบทบาทของ Dashboard จาก

> **"ระบบบอกว่า Pipeline พังตรงไหน"**

เป็น

> **"ระบบบอกว่าเกิดอะไรขึ้น → กระทบข้อมูลอย่างไร → กระทบ KPI อะไร →
> กระทบธุรกิจอย่างไร → และควรติดตามอะไรต่อ"**

ดังนั้น **Technical Dashboard ยังต้องมีอยู่** แต่ไม่ควรเป็น Dashboard เดียวของระบบ

โครงสร้างสุดท้ายคือ:

``` text
                 SDOQAP
                    │
          ┌─────────┴─────────┐
          │                   │
    EXECUTIVE VIEW       TECHNICAL VIEW
          │                   │
          ↓                   ↓
    Business Impact      Root Cause
    KPI Impact           Pipeline
    Data Health          Service
    Data Freshness       API
    Decision Support     Exception
```

**เป้าหมายสูงสุดของหน้า Executive Dashboard คือทำให้ผู้บริหารมองหน้า Dashboard
แล้วเข้าใจ "สถานะ → ปัญหา → ผลกระทบ → ความรุนแรง → สถานะการแก้ไข"
ได้โดยไม่ต้องอ่าน Log หรือเข้าใจรายละเอียดของ Data Pipeline ก่อน**
