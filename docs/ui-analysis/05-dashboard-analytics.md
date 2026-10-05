# 05 — อธิบายหน้า Dashboards และ Query & Metrics (ภาษาไทย สำหรับนำเสนออาจารย์)

เอกสารนี้อ่านจากโค้ดจริงทุกบรรทัดที่อ้างอิง (รูปแบบ `ไฟล์:บรรทัด`) ไม่มีการเดา หากตรวจไม่ได้จะเขียนว่า "ตรวจไม่พบในโค้ด"

**สัญลักษณ์แหล่งที่มาของข้อมูล (ติดทุกรายการ)**
- 🟢 ข้อมูลจริงจาก Backend (ดึงจาก API / Elasticsearch / บริการจริง)
- 🟡 ข้อมูลที่คำนวณจากระบบ (คำนวณจากข้อมูลจริงที่ฝั่งหน้าเว็บหรือฝั่งเซิร์ฟเวอร์ — ระบุสูตร)
- 🔴 Mock / Static / ค่าคงที่ฮาร์ดโค้ด (ตัวเลขหรือข้อความที่เขียนตายตัวในโค้ด, ข้อมูลตัวอย่าง)
- ⚪ UI ที่มีแต่ยังไม่ได้เชื่อมระบบจริง (ปุ่ม/ตัวควบคุมที่กดแล้วแทบไม่ทำอะไร)

**คำศัพท์ที่ใช้บ่อย (อธิบายครั้งเดียว)**
- **Elasticsearch (ES)** = ฐานข้อมูลค้นหาที่ระบบใช้เก็บ "ประวัติการรันตรวจคุณภาพ" ดัชนี (index = เหมือนตาราง) หลักคือ `sdoqap_quality_runs` (ผลตรวจคุณภาพ 1 แถวต่อ 1 รัน), `sdoqap_pipeline_runs` (สถานะรัน success/failed/warnings), `sdoqap_schema_drifts` (การเปลี่ยนโครงสร้างตาราง), `sdoqap_upstream_remediations` (ใบแจ้งแก้ต้นทาง)
- **Quarantine (กักกัน)** = ข้อมูลที่ไม่ผ่านกฎ ถูกแยกเก็บไว้ ไม่ปนกับข้อมูลสะอาด
- **SLA** = เป้าหมายคุณภาพ (หน้านี้ใช้ 95% เป็นค่าตายตัว)
- **COPDQ (Cost of Poor Data Quality)** = "ต้นทุนความเสียหายจากข้อมูลคุณภาพต่ำ" เป็นแนวคิดของ Gartner/IBM
- **Schema drift** = โครงสร้างตารางต้นทางเปลี่ยน (คอลัมน์เพิ่ม/หาย/ชนิดเปลี่ยน)
- **Polling (รีเฟรชอัตโนมัติ)** = หน้าเว็บถามเซิร์ฟเวอร์ซ้ำทุก N วินาทีผ่าน `useApi` (`services/ui/src/hooks/useApi.js:30-36`)

**กลไกกลางที่ใช้ทั้งสองหน้า (ตรวจแล้ว)**
- ทุกการเรียก API ไปที่ `/api/v1/...` → nginx ส่งต่อไป FastAPI (`services/ui/nginx.conf:14-15`, `useApi.js:3,14`)
- ถ้า API ล้มเหลว `useApi` เก็บ error ไว้แต่ **ไม่ล้างข้อมูลเดิม** (`useApi.js:23-25`) หน้า Dashboard **ไม่แสดงข้อความ error ของ API ใดเลย** (ค้น `.error` ในไฟล์พบเฉพาะ `services.error` ที่ `Dashboard.jsx:71`) ดังนั้นเมื่อ API ล่ม การ์ดจะแสดง `---`/0 หรือค้างค่าเก่าโดยเงียบ ๆ
- Endpoint วิเคราะห์ (`analytics.py`) ทุกตัวเป็น GET ที่ **ไม่มี `require_session`** (`analytics.py:9` ประกาศ router ไม่มี dependencies) ส่วนปุ่มที่เขียนข้อมูล (Resolve, Retry) ต้องล็อกอิน (`system.py:470`, `pipeline.py:156`)
- ข้อมูลสาธิต: สคริปต์ `services/api/seed_es.py` สร้างรันสมมติ (users/products/mbti) ลง ES แต่ **ไม่ได้ถูกเรียกอัตโนมัติ** (ตรวจ `docker-compose.yml`, `main.py` ไม่พบการเรียก; CI เพียง compile ไฟล์ `ci.yml:32`) ต้องรันมือเท่านั้น

---

# ส่วนที่ A — หน้า Dashboards (`/dashboard`)

| Frontend file | API endpoints ที่เรียก | Backend handler | Storage |
|---|---|---|---|
| `services/ui/src/pages/Dashboard.jsx` (1,670 บรรทัด), `components/EchartsDataLineage.jsx`, `store/useDashboardStore.js`, `utils/currency.js` | `GET /executive/overview` (15s), `/kpi/stats` (15s, **ไม่แสดงผล**), `/anomaly/sources` (15s), `/services/status` (10s), `/system/activity?limit=15` (15s), `/quality?limit=50` (15s), `/analytics/impact` (30s), `/system/remediations` (20s), `/analytics/sell-in-out` (30s), `/whitebox/state` (10s), `/whitebox/ai-context-explanations` (30s); `/analytics/clustering` และ `/analytics/projection` (30s, **เรียกแต่ไม่ได้ใช้**); กดปุ่ม: `POST /system/remediations/{id}/resolve`, `POST /pipeline/retry/{run_id}`, `GET /whitebox/ai-context-explanations?force=true` | `analytics.py` (`get_executive_overview` :90, `get_anomaly_sources` :380, `get_business_impact` :673, `get_sell_in_out_analytics` :776), `quality.py:12`, `system.py` (:42, :212, :449, :469), `pipeline.py:155`, `whitebox.py` (:1437 state, :1774 ai-context) | Elasticsearch (`sdoqap_quality_runs`, `sdoqap_pipeline_runs`, `sdoqap_schema_drifts`, `sdoqap_upstream_remediations`); ไฟล์ CSV ตัวอย่าง `dirty_dataset.csv` (นักศึกษา) สำหรับ `/whitebox/state`; หน่วยความจำของ API (ตัวแปร `_WORKFLOW_STATE`); ค่ากรองฝั่งเว็บเก็บใน Zustand (หน่วยความจำเบราว์เซอร์ — หายเมื่อรีเฟรชหน้า) |

ไม่พบการเรียก `lineage.py` หรือ `gold.py` ในหน้านี้ (ตรวจไม่พบในโค้ด) แผนภาพ lineage วาดจากตัวเลขของรันล่าสุดเอง ไม่ได้ดึงจาก `/lineage`

## A0. ภาพรวมการทำงานและแหล่งข้อมูล

- ผู้ใช้สลับ 4 มุมมองด้วยแท็บบนสุด: **Executive Overview / Business Impact / Data Quality / Technical Cockpit** (ค่าเริ่มต้น executive — `useDashboardStore.js:13`)
- ทุก endpoint ด้านบนถูกดึงตลอดเวลาแม้จะอยู่คนละแท็บ (ดึงที่ระดับคอมโพเนนต์ `Dashboard.jsx:67-101`)
- การคำนวณหลักของ "คะแนนคุณภาพ" มาจาก Spark: `quality_score = clean_count ÷ total_records × 100` (`services/spark/sdoqap/stages/metrics.py:168-174`) แล้วบันทึกลง ES ผ่าน `report.py:21`

## A1. แถบหัวหน้าและตัวควบคุมรวม (ทุกมุมมอง)

- **[หัวข้อ "Dashboards" + คำบรรยาย]** → (1) แสดงอย่างเดียว (2) ชื่อหน้า (3) อ่านจาก `getPage("dashboard")` (`Dashboard.jsx:313-314`, `config/pages.js:14`) (4) ข้อความคงที่ในโค้ด 🔴
- **[แท็บ Executive Overview / Business Impact / Data Quality / Technical Cockpit]** → (1) กดแล้วสลับมุมมอง (2) ตัวสลับมุมมอง (3) `setViewMode` ใน Zustand (`Dashboard.jsx:320-346`, `useDashboardStore.js:20`) (4) แสดงบล็อกของแท็บนั้น; ไม่มี API 🟡 (UI state)
- **[ตัวเลขป้ายบนแท็บ Business Impact]** → (1) แสดงจำนวน (2) "จำนวนส่วนงานที่ได้รับผลกระทบ" (3) `bizImpact.areas_affected_count` จาก `/executive/overview` (`Dashboard.jsx:331-333`) (4) นับจากกฎใน `analytics.py:219` (จำนวนส่วนงานที่ status ≠ Normal) 🟡
- **[จุดสถานะ "CLUSTER HEALTHY / DEGRADED"]** → (1) แสดงอย่างเดียว (2) สถานะระบบ (3) `/services/status` (`Dashboard.jsx:71,349-352`; ฝั่งเซิร์ฟเวอร์ `system.py:42-84` ลองเปิดพอร์ต TCP ของ HDFS/ES/Kibana/Grafana/n8n/Spark/Kafka/Postgres/API ใน 0.2 วินาที) (4) **ข้อควรระวัง:** เงื่อนไขคือ `services.data && !services.error` เท่านั้น ถ้า API ตอบได้ก็ขึ้น HEALTHY แม้บริการข้างในจะ "offline" (ไม่ได้ตรวจค่า status ของแต่ละบริการ) 🟡 (ค่าจริงจาก backend แต่ตรรกะสรุปหยาบ)
- **[ช่องเลือก "Time: Last 24 Hours / 7 Days / 30 Days"]** → (1) เปลี่ยนค่าได้ (2) ตัวกรองช่วงเวลา (3) เก็บค่าใน Zustand `timeRange` (`Dashboard.jsx:367-375`) (4) **ไม่มีการนำค่านี้ไปกรองข้อมูลหรือส่งให้ API เลย** (ค้นแล้วพบ `timeRange` ใช้แค่เป็นค่า `value` ของ select ที่บรรทัด 369) ⚪
- **[ช่องเลือก "Business Area" (Sales, Customer, Reporting, Operations, Finance)]** → (1) กรองตาราง Critical Business Issues (2) ตัวกรองส่วนงาน (3) `filteredCriticalIssues` เทียบ `item.dataset.includes(ค่าที่เลือก)` (`Dashboard.jsx:185`) (4) กรองได้เฉพาะตาราง "Critical Business Issues" เท่านั้น และ dataset ที่ backend ส่งมามีแค่ `users`, `grocery_sales` (`analytics.py:278,300`) ดังนั้นค่า customer/reporting/operations/finance จะทำให้ตารางว่างเสมอ มีแต่ "sales" ที่ตรง `grocery_sales` ⚪ (ทำงานบางส่วน)
- **[ช่องเลือก "Severity" (Critical/Warning/Normal)]** → (1) กรองตาราง Critical Business Issues (2) ตัวกรองระดับความรุนแรง (3) `Dashboard.jsx:184` (4) ไม่มีผลกับตาราง KPI Impact Matrix 🟡 (UI ฝั่งเว็บกรองข้อมูลจริง)
- **[ปุ่ม Refresh]** → (1) ดึง exec, kpi, anomaly, whitebox state ใหม่ทันที (2) ปุ่มรีเฟรช (3) `refetch()` ของ hook (`Dashboard.jsx:403-409`) (4) อัปเดตการ์ดทันทีโดยไม่รอรอบ polling; **ไม่ได้รีเฟรช** quality/activity/impact/remediations/sell-in-out 🟢
- **[ปุ่ม Export Executive Report]** → (1) ดาวน์โหลดไฟล์ CSV ชื่อ `SDOQAP_Executive_Overview_<วันที่>.csv` (2) รายงานผู้บริหาร (3) ฟังก์ชัน `handleExportExecutiveCSV` สร้างไฟล์ในเบราว์เซอร์ด้วย Blob ไม่เรียก API (`Dashboard.jsx:278-304,410-416`) (4) ไฟล์ลงเครื่องผู้ใช้ มี 2 ส่วน: KPI 5 ตัว และรายการ Critical Issues (ไม่กรองตามฟิลเตอร์). หมายเหตุ: คอลัมน์ Status ของ "Business Impact" ถูกเขียนตายตัวว่า `Warning` และของ "Report Availability" ตายตัว `Normal` (บรรทัด 288-289); ถ้า API ยังไม่โหลดจะพิมพ์ค่าว่า `null%` 🟡 (ค่าตัวเลขจากระบบ แต่มีสถานะที่ฮาร์ดโค้ด)
- **ไม่พบปุ่ม Print / Export PDF / Export รูป** ในหน้านี้ (ตรวจไม่พบในโค้ด)

## A2. มุมมอง 1 — Executive Overview

### โซน 1: การ์ด KPI 4 ใบ

ข้อมูลของการ์ด 1, 2, 4 มาจาก `GET /executive/overview` (`analytics.py:90-377`) ซึ่งอ่านจาก ES 3 ดัชนี

- **[การ์ด "Data Health Score"]** → (1) แสดงอย่างเดียว (2) คะแนนคุณภาพข้อมูลภาพรวม + จำนวนแถวสะอาด/กักกัน (3) `execKpis.data_health` (`Dashboard.jsx:429-440`) (4) ค่า = **ค่าเฉลี่ยของ `quality_score` ของทุกรันในดัชนี `sdoqap_quality_runs`** (ES aggregation `avg` — `analytics.py:109-119`) ไม่ถ่วงน้ำหนักด้วยจำนวนแถว; clean = total − quarantined (`analytics.py:327`); ป้าย Good ≥95 / Warning ≥88 / Critical ต่ำกว่า (`analytics.py:159-164`) 🟡 **ข้อควรระวัง:** ถ้าไม่มีข้อมูลเลย ระบบกำหนดค่าเริ่มต้นเป็น **100%** (`analytics.py:96,119`) ทำให้ระบบว่างเปล่าขึ้นว่า "Good 100%"
- **[การ์ด "Pipeline SLA Availability"]** → (1) แสดงอย่างเดียว (2) สัดส่วนรันที่ไม่ล้มเหลว (3) `data_availability` (`Dashboard.jsx:446-457`) (4) สูตร `(จำนวนรัน − รันที่ state=failed) ÷ จำนวนรัน × 100` จาก 50 รันล่าสุดใน `sdoqap_pipeline_runs` (`analytics.py:143-153`); HEALTHY ถ้า ≥95 (ตัดสินที่ฝั่งเว็บ `Dashboard.jsx:446-450`); ข้อความย่อย "Avg lag" ใช้ `data_freshness.avg_lag_hours` 🟡 (ถ้าไม่มีรันเลย = 0% → ขึ้น DEGRADED)
- **[การ์ด "Sell-In / Out Volume Gap"]** → (1) แสดงอย่างเดียว (2) ส่วนต่างยอด Sell-In กับ Sell-Out (หน่วย "ชิ้น") (3) `sellInOut.summary` จาก `/analytics/sell-in-out` หรือ fallback ในหน้าเว็บ (`Dashboard.jsx:79-99,463-476`) (4) **เป็นข้อมูลตัวอย่างทั้งหมด** — ตาราง 7 วันถูกเขียนตายตัวใน backend (`analytics.py:799-807`, มี `"is_example": True` ที่ :825 และคอมเมนต์ TODO ยอมรับที่ :768-775) และเขียนซ้ำเป็น fallback ในหน้าเว็บ (`Dashboard.jsx:79-99`) ตัวเลข 12,350 / 8,330 / 89.5% คำนวณจากตารางตายตัวนี้ (ผลรวม 117,500 − 105,150) **การ์ดนี้บนแท็บ Executive ไม่มีป้ายบอกว่าเป็นตัวอย่าง** (ป้ายเตือนมีเฉพาะแท็บ Business Impact `Dashboard.jsx:943-954`) 🔴
- **[การ์ด "Financial COPDQ Risk"]** → (1) แสดงอย่างเดียว (2) มูลค่าความเสียหายโดยประมาณ ดอลลาร์ + เทียบบาท (3) `bizImpact.monetary_loss_usd` = `total_financial_impact_usd` ของ `get_business_impact()` (`analytics.py:166-167,347`) (4) สูตรอยู่ในหัวข้อ "ตัวเลขเงิน" ด้านล่าง; มี InfoHint บอกเองว่าใช้ค่าสมมติ (`Dashboard.jsx:483`); ป้าย ACTION ถ้า > 0 🟡 (อิงข้อมูลจริง + ค่าคงที่สมมติ)

### โซน 2: กราฟ SLA และกรอบ 5 คำถาม

- **[กราฟ "Data Quality & SLA Compliance Status" แบบ SLA Bars]** → (1) เอาเมาส์ชี้ดูคำอธิบายแต่ละแท่ง (2) คะแนนคุณภาพ % เทียบเป้า 95% ของ 12 จุดล่าสุด (3) `/anomaly/sources` (`analytics.py:380-458`) → `qualityTrendData` (`Dashboard.jsx:191-216`) (4) สีแท่ง: เขียว ≥95, เหลือง 90-94.99, แดง <90 (`Dashboard.jsx:581-590`) เส้นเป้า 95 เป็นค่าคงที่ในโค้ด (:579) แกน Y ตัดที่ 70-100% (ค่าต่ำกว่า 70 จะถูกตัดขอบ) 🟡 สูตร: ต่อ 1 จุด `Overall = ค่าเฉลี่ยคะแนนล่าสุดของแต่ละตาราง (สูงสุด 5 ตารางที่มีรันมากสุด)` (`Dashboard.jsx:199-210`, `analytics.py:441-456`)
  - **ข้อควรระวัง (แกนเวลาปลอม):** ป้ายเวลาแกน X (เช่น 14:10, 14:20…) ถูกสร้างจาก "เวลาปัจจุบัน ลบทีละ 10 นาที" (`analytics.py:384-387`) แต่ค่าคะแนนคือ 12 รันล่าสุดของแต่ละตารางโดยไม่เกี่ยวกับเวลานั้น (:393-406) ดังนั้น **ป้ายเวลาไม่ใช่เวลาที่รันจริง** ลำดับของแท่งเท่านั้นที่เป็นของจริง
- **[ปุ่มสลับ "SLA Bars" / "Area Trend"]** → (1) สลับรูปแบบกราฟ (2) ตัวเลือกการแสดงผล (3) `setQualityChartType` (`Dashboard.jsx:516-551`) (4) แสดงข้อมูลชุดเดียวกันเป็นกราฟพื้นที่ (แกน 75-100%) 🟡 (UI state)
- **[แถบอธิบายสี ≥95 / 90-94 / <90]** → (1) แสดงอย่างเดียว (2) คำอธิบายสีกราฟ (3) ข้อความคงที่ (`Dashboard.jsx:614-624`) (4) 🔴 ค่าคงที่ (ไม่ใช่เกณฑ์ราย-ตารางที่ Spark ใช้จริง `effective_quality_threshold` ซึ่งต่างกันได้ตามตาราง — `report.py:39`)
- **[ป้าย "Target 95.0%"]** → (1) แสดงอย่างเดียว (2) เป้า SLA (3) ข้อความคงที่ (`Dashboard.jsx:508`) (4) 🔴
- **[กรอบ "Executive 5-Question Framework" (WHAT / WHY / IMPACT / HOW MUCH / ACTION)]** → (1) แสดงอย่างเดียว (2) สรุปสถานการณ์ 5 ข้อสำหรับผู้บริหาร (3) `executive_summary_5w` (`analytics.py:303-307,367-373`; `Dashboard.jsx:173-179,635-655`) (4) เป็น **ข้อความแม่แบบ (template)** ที่แทรกตัวเลขจริง เช่น คะแนนเฉลี่ย, จำนวนแถวกักกัน, จำนวน drift, มูลค่า COPDQ; แต่ข้อความอธิบายสาเหตุ/การดำเนินการ เช่น "เกิดจากข้อมูลนำเข้ามี Missing Values..." และ "ทีม Data Governance เปิด Remediation Ticket..." เป็นประโยคตายตัวที่ขึ้นตามเงื่อนไข ไม่ได้วิเคราะห์สาเหตุจริง; ถ้า API ล้ม จะแสดงข้อความ fallback "ไม่พบความผิดปกติในระบบ" ซึ่งอาจทำให้เข้าใจผิดว่าระบบปกติ 🟡
- **[ปุ่ม "ดูกราฟ Sell-In vs Sell-Out Volume →"]** → (1) กดแล้วไปแท็บ Business Impact (2) ทางลัด (3) `setViewMode('business')` (`Dashboard.jsx:660-667`) (4) ไม่เรียก API 🟡 (UI state)

### โซน 3: ตาราง KPI Impact และ Data Quality Breakdown

- **[ตาราง "Business KPI Impact Matrix"]** → (1) ดูอย่างเดียว (2) ปัญหาเทคนิค → KPI ธุรกิจที่ถูกกระทบ 5 แถว (3) `business_kpi_impact` (`analytics.py:221-266`; `Dashboard.jsx:702-718`) (4) **ข้อความทั้งหมดเขียนตายตัวในโค้ด** (เช่น "รายงานผู้บริหารรอบเช้าล่าช้า 25 นาที", "ระบบตัดยอดซ้ำออกอัตโนมัติแล้ว 100%") มีเฉพาะ **ความรุนแรง/สถานะ** ที่ผันตามข้อมูลจริง (เช่น มีรัน failed → Critical, มี drift → Warning/Critical, ค่า lag เฉลี่ย >0.5 ชม. → Warning) และบางจุดแทรกตัวเลขจริง (จำนวนแถวกักกัน, มูลค่า COPDQ). แถวสุดท้าย "Duplicate Transactions" เป็น Normal/Resolved ตายตัวเสมอ 🔴 (ข้อความ) / 🟡 (ความรุนแรง)
- **[ปุ่ม "View Details →"]** → (1) ไปแท็บ Business Impact (2) ทางลัด (3) `setViewMode('business')` (`Dashboard.jsx:682-688`) (4) ไม่เรียก API 🟡 (UI state)
- **[การ์ด "Data Quality Status Breakdown"]** → (1) ดูอย่างเดียว (2) สัดส่วนสาเหตุของข้อมูลที่ถูกกักกัน: Missing, Duplicate, Invalid Type, Schema Drift, และ Clean (3) `data_quality_breakdown` (`analytics.py:357-363`; `Dashboard.jsx:733-783`) (4) สูตร Missing% = `ผลรวม (null_primary_key + missing_values)` ÷ total_records ×100; Duplicate% = `(duplicate_records + duplicates)`; Invalid% = `(invalid_type + type_mismatch)` (`analytics.py:124-129,358-360`) โดยรวมค่าจาก `quarantine_breakdown` ของ 50 รันล่าสุด แต่หารด้วย total_records ของ **ทุกรัน** (ฐานไม่ตรงกัน) 🟡
  - **ข้อควรระวัง (ชื่อคีย์ไม่ตรงกับ Spark):** Spark จริงเขียนเหตุผลเป็น `missing_primary_key`, `null_value_in_<คอลัมน์>`, `invalid_type_<คอลัมน์>`, `duplicate_records` (`services/spark/sdoqap/stages/cleansing.py:57,70,92,135`) แต่ API มองหา `null_primary_key`, `missing_values`, `invalid_type`, `type_mismatch` (`analytics.py:126,129`) — มีเพียง `duplicate_records` ที่ตรงกัน ดังนั้นกับข้อมูลจริงจาก Spark เปอร์เซ็นต์ Missing/Invalid อาจแสดง 0% (ตรงกับข้อมูลสาธิตของ `seed_es.py` เท่านั้น) — สรุปจากการเทียบโค้ด ยังไม่ได้ทดลองรัน
  - ความยาวแถบสีคูณสเกลตามอำเภอใจ (×15, ×30, ×40, และ Schema Drift = 80% ถ้ามีอย่างน้อย 1) (`Dashboard.jsx:740,750,760,770`) 🔴 (ความยาวแถบเป็นสเกลภาพ ไม่ใช่สัดส่วนจริง ตัวเลข % ที่เขียนข้างแถบเป็นของจริง)
  - "Schema Drift Events … Active" = จำนวนเอกสารใน `sdoqap_schema_drifts` 10 อันล่าสุด (`analytics.py:133-136`) โดย **ไม่ตรวจว่าอนุมัติแล้วหรือยัง** จึงอาจนับรายการที่จัดการแล้ว 🟡
  - "Clean & Certified Records" = Data Health Score ตัวเดียวกับการ์ดใบแรก 🟡

### โซน 4: ตาราง Critical Business Issues

- **[ตาราง "Critical Business Issues"]** → (1) ดูรายการ ถูกกรองด้วยตัวกรอง Area/Severity (2) เหตุการณ์สำคัญ (Issue ID, ชื่อ, ผลกระทบ, KPI, ความรุนแรง, ระยะเวลา, สถานะ) (3) `critical_business_issues` (`analytics.py:268-301`) (4) สร้างได้สูงสุด 3 รายการตามเงื่อนไข: ISS-PIPE-01 (มีรัน failed), ISS-DRIFT-02 (มี drift), ISS-DATA-03 (มีแถวกักกัน > 0) — **ฟิลด์ "Duration" เขียนตายตัว** ("24 mins", "45 mins", "1 hr 12 mins") และข้อความผลกระทบ/สถานะตายตัว ไม่ได้วัดจริง; ชื่อตาราง `users` ถูกฝังตายตัวเป็น dataset (:278) ⚪/🔴 → ติดป้าย **🔴**
- **[ป้าย "N Incidents"]** → (1) แสดงอย่างเดียว (2) จำนวนแถวหลังกรอง (3) `filteredCriticalIssues.length` (`Dashboard.jsx:796`) (4) 🟡
- **[ปุ่ม "Drill-down"]** → (1) กดแล้วสลับไปแท็บ Technical Cockpit และกรองประวัติรันเฉพาะตารางนั้น (2) ปุ่มเจาะลึก (3) `setSelectedSourceFilter(dataset คำแรก)` + `setViewMode('technical')` (`Dashboard.jsx:830-839`) (4) ตารางประวัติรันแสดงเฉพาะตารางที่ชื่อตรงกัน; **ในแท็บ Technical ไม่มีตัวควบคุมให้ล้างตัวกรองนี้ย้อนกลับ** (ค้นแล้วไม่พบ UI ที่เรียก `setSelectedSourceFilter('All')` นอกจากค่าเริ่มต้น) 🟡 (UI state)
- **[ปุ่มลิงก์ "Review Drift"]** → (1) กดแล้วไปหน้า `/schema` (Catalog) เฉพาะแถวที่ชื่อมี "Schema Drift" (2) ลิงก์ไปอนุมัติ/ปฏิเสธการเปลี่ยนโครงสร้าง (3) `<Link to="/schema">` (`Dashboard.jsx:840-848`) (4) ไปหน้า Catalog 🟡 (ลิงก์ UI)

## A3. มุมมอง 2 — Business Impact

- **[การ์ด Business Areas 5 ใบ (Sales & Revenue, Customer Insights, Executive Reporting, Supply Chain & Ops, Finance & Audit)]** → (1) คลิกเพื่อไฮไลต์การ์ด (คลิกซ้ำเพื่อยกเลิก) (2) สุขภาพ % และสรุปผลกระทบรายส่วนงาน (3) `business_areas` (`analytics.py:176-217`; `Dashboard.jsx:871-899`) (4) สูตร: `base_health = 100 − (แถวกักกันทั้งหมด ÷ แถวทั้งหมด ×100)` แล้ว **หักคะแนนค่าคงที่** (Sales −2.0, Customer −5.0, Operations −1.5, Reporting −3.0) เมื่อเข้าเงื่อนไข; เงื่อนไขอ้างชื่อตาราง **`users` และ `products` ที่ฝังตายตัว** (`analytics.py:169-170`) หากข้อมูลจริงเป็นตารางชื่ออื่น ส่วนงานเหล่านี้จะเป็น Normal เสมอ; "Finance & Audit" เป็น Normal ตายตัว และข้อความ "Audit trail verified against Delta Lake" / "Inventory synchronization running smooth" เป็นข้อความตายตัว (:206,214); การคลิกเปลี่ยนแค่สีกรอบ ไม่มีผลอื่น 🔴 (การแมปส่วนงาน/ตัวเลขหัก) บางส่วน 🟡 (base_health)
- **[แผนภาพ "Business Impact Mapping Flow" 4 กล่อง]** → (1) แสดงอย่างเดียว (2) อธิบายแนวคิด Technical Issue → Technical Impact → KPI Impact → Business Action (3) ข้อความคงที่ (`Dashboard.jsx:911-931`) (4) 🔴
- **[การ์ด "Sell-In vs. Sell-Out Volume Reconciliation"]** → (1) เมาส์ชี้ดูรายละเอียดรายวัน (2) กราฟแท่ง+เส้น: Sell-In, Sell-Out, Quarantined Gap (หน่วยชิ้น) และคะแนนคุณภาพ % (3) `/analytics/sell-in-out` (`Dashboard.jsx:1002-1035`) (4) **ตัวอย่างทั้งหมด** ตาราง 7 วัน ("18 Sep"–"24 Sep") เป็นค่าคงที่ใน backend (`analytics.py:799-807`) และ fallback หน้าเว็บ (`Dashboard.jsx:89-97`); ไม่ใช่ข้อมูลจากรอบตรวจจริง; ข้อความ "Note: …incident" เช่น "Schema drift & Missing POS values" ก็เป็นข้อความตายตัว; หน้าเว็บแสดงป้ายเหลือง "แสดงข้อมูลตัวอย่าง — ยังไม่ใช่ข้อมูลจริงจากระบบ" ตามค่า `is_example` (`Dashboard.jsx:943-954`) 🔴
  - การ์ดสรุป 4 ใบ (Sell-In, Sell-Out, Quarantined Gap, Reconciliation Rate): ผลรวมจากตารางตายตัว; Reconciliation Rate = `sell_out ÷ sell_in ×100` (`analytics.py:820`) 🔴
  - ป้าย "COPDQ Sales Risk $…": = ผลรวม `quarantined_financial_value` ของ 100 เอกสารใน ES ถ้า > 0 มิฉะนั้นใช้ **ค่าตายตัว $18,544** (`analytics.py:783,793-795`) 🟡/🔴 (ขึ้นกับว่ามีข้อมูล)
  - กล่องบทวิเคราะห์ภาษาไทย: ข้อความแม่แบบที่แทรกตัวเลขตายตัวและตัวเลข COPDQ (`analytics.py:826-830`) 🔴
- **[การ์ด "COPDQ Financial Loss Breakdown" (ต้นทุน 3 ส่วน)]** → (1) ดูอย่างเดียว (2) แยกความเสียหายเป็น Cost of Correction / Lost Opportunities / Risk & Compliance (3) `cost_breakdown` จาก `/analytics/impact` (`Dashboard.jsx:1067-1096`) (4) สูตรดูหัวข้อ "ตัวเลขเงิน" ด้านล่าง; ถ้า API ล้มเหลวจะแสดง `$0` (`?? 0`) ซึ่งแยกไม่ออกจาก "ไม่มีความเสียหาย" 🟡
- **[การ์ด "Upstream Governance Tickets" + ปุ่ม "Resolve"]** → (1) กด Resolve เพื่อปิดตั๋ว (มี `alert` แจ้งผล) (2) รายการใบแจ้งแก้ที่ระบบต้นทาง (3) อ่านจาก `GET /system/remediations` (`system.py:449-467`); กด Resolve เรียก `POST /system/remediations/{ticket_id}/resolve` (`Dashboard.jsx:244-256`) ซึ่งเปลี่ยน `status` เป็น `RESOLVED` และบันทึก `resolved_at` ใน ES (`system.py:469-486`) (4) ตั๋วจริงถูกสร้างโดย Spark/AI advisor (`services/spark/ai_rule_advisor.py:1131-1146`) 🟢
  - **จุดบกพร่องที่ตรวจพบ:** (ก) API ส่ง **ทุกตั๋วรวมที่ RESOLVED แล้ว** (ไม่กรองสถานะ `system.py:455-465`) และหน้าเว็บนับ `tickets.length` เป็น "Open Tickets" (`Dashboard.jsx:1108`) จึงนับตั๋วที่ปิดแล้วด้วย และตั๋วไม่หายจากรายการหลังกด Resolve (ข) ข้อความ "Assigned to: …" อ่านจากฟิลด์ `target_owner` ซึ่งไม่มีที่ไหนในระบบเขียนไว้ (ค้นทั้ง repo พบเฉพาะที่บรรทัดนี้) จึงแสดง "Data Engineer Team" (ค่าตายตัว) เสมอ (`Dashboard.jsx:1131`) 🟡 (รายการจริง) / 🔴 (ชื่อผู้รับผิดชอบ)

## A4. มุมมอง 3 — Data Quality

- **[การ์ด Completeness]** → (1) ดูอย่างเดียว (2) ความครบถ้วน (3) `100 − missing_values_pct` (`Dashboard.jsx:1160`) (4) ใช้ Missing% จากโซน 3 (มีข้อควรระวังเรื่องชื่อคีย์เหมือนข้างบน) การ์ดทุกใบถูกกำหนด CSS สีเขียว "kpi-good" ตายตัวไม่ว่าค่าจะเป็นเท่าใด 🟡
- **[การ์ด Uniqueness]** → ความไม่ซ้ำ = `100 − duplicate_records_pct` (`Dashboard.jsx:1165`) 🟡
- **[การ์ด Validity]** → ความถูกต้องของชนิดข้อมูล = `100 − invalid_type_pct` (`Dashboard.jsx:1170`) ข้อความ "Type & bounds checked" ตายตัว 🟡
- **[การ์ด Timeliness]** → (1) ดูอย่างเดียว (2) ความทันเวลา (3) `data_freshness.score` = `สัดส่วนรันที่ freshness_lag_hours ≤ 1.0 ชม.` จาก 50 รันล่าสุด (`analytics.py:155-157`; `Dashboard.jsx:1173-1177`) (4) เกณฑ์ 1.0 ชม. ตายตัว; ตารางประวัติ (`_historical`) ที่ Spark ข้ามการวัดจะมี lag = 0 จึงนับเป็น "ทันเวลา" (`metrics.py:126,155`) 🟡
- **[การ์ด Consistency]** → (1) ดูอย่างเดียว (2) ชื่อบอก "ความสอดคล้อง" (3) แสดงค่า `dataHealth.score` (เป็นค่าเดียวกับ Data Health) (`Dashboard.jsx:1180`) (4) ข้อความย่อย "Cross-table checks OK" เป็นข้อความตายตัว **ไม่มีการตรวจข้ามตารางจริงในโค้ดนี้** 🔴
- **[การ์ด Drift Integrity]** → (1) ดูอย่างเดียว (2) ความสมบูรณ์ด้านโครงสร้าง (3) สูตรในหน้าเว็บ `100 − (จำนวน drift × 10)` ไม่ต่ำกว่า 0 (`Dashboard.jsx:1185`) (4) ตัวคูณ 10 เป็นค่ากำหนดเอง 🟡
- **[ตาราง "Dataset Quality Leaderboard"]** → (1) ดูอย่างเดียว (2) คะแนนล่าสุดของแต่ละตาราง (จำนวนแถว, กักกัน, เกรด, เวลาที่ตรวจ) (3) `/quality?limit=50` (`quality.py:12-58` อ่าน ES เรียงเวลาล่าสุดก่อน; `Dashboard.jsx:1213-1240`) (4) เลือกรันแรกของแต่ละตารางจาก 50 รันล่าสุด (ตารางที่ไม่มีรันใน 50 รันล่าสุดจะไม่ขึ้น); เกรด: ≥95 "A Healthy", ≥90 "B+ Warning", ≥85 "B Caution", ต่ำกว่านั้น "F Critical Anomaly" (`Dashboard.jsx:28-34`) ซึ่งเป็นเกณฑ์ฝั่งเว็บ ต่างจากเกณฑ์ backend (Good ≥95 / Warning ≥88) 🟢 (ข้อมูล) / 🟡 (เกรด)
- **[ปุ่มลิงก์ "Governance Rules →"]** → ไปหน้า `/rules` (`Dashboard.jsx:1197-1199`) 🟡 (ลิงก์ UI)

## A5. มุมมอง 4 — Technical Cockpit

- **[แถบสูตร "สูตรคำนวณดัชนีคุณภาพข้อมูล"]** → (1) แสดงอย่างเดียว (2) สูตร `(ข้อมูลสะอาด ÷ ข้อมูลขาเข้าทั้งหมด) × 100 = %` (3) `GET /whitebox/state` (`Dashboard.jsx:100-114,1261-1265`; ฝั่งเซิร์ฟเวอร์ `whitebox.py:1271-1434,1437-1439`) (4) **ข้อมูลนี้ไม่ได้มาจาก ES หรือ Spark pipeline** แต่คำนวณด้วย pandas จากไฟล์ตัวอย่าง `dirty_dataset.csv` (ชุดข้อมูลนักศึกษา `student_course_scores` ~10,100 แถว — `whitebox.py:1191-1193,1273-1281`) ตามกฎที่ผู้ใช้ตั้งไว้ในหน้า Rules; `quality_score_pct = clean ÷ total_rows × 100` (:1410) และทุกครั้งที่เรียก `GET /whitebox/state` เซิร์ฟเวอร์ **คำนวณใหม่และเขียนไฟล์ CSV 3 ไฟล์ซ้ำ** (:1390-1396) (หน้า Dashboard เรียกทุก 10 วินาที) ถ้ายังไม่มีข้อมูลจะแสดง "—" (ไม่เติมเลขปลอม — `Dashboard.jsx:103-114`) 🟢 (คำนวณจริงจากชุดข้อมูลตัวอย่างในระบบ)
- **[ปุ่ม "อัปเดตบทวิเคราะห์ AI"]** → (1) กดแล้วเรียก API ให้สร้างบทสรุปใหม่แล้วรีเฟรชข้อความในกรอบด้านล่าง (ปุ่มเปลี่ยนเป็น "AI กำลังสรุปภาพรวม...") (2) ปุ่มสั่ง LLM สรุปสถานะ (3) `fetch('/api/v1/whitebox/ai-context-explanations?force=true')` (`Dashboard.jsx:116-126`) → `whitebox.py:1774-1856` ต้องล็อกอิน (:1778-1779); ถ้ามี Groq API key ที่ตั้งค่าไว้จะเรียก Groq (`openai/gpt-oss-120b`, timeout 12 วินาที) เพื่อเรียบเรียงใหม่โดยสั่งให้ "ใช้เฉพาะตัวเลขที่ให้" (:1807-1814); ถ้าไม่มี key หรือเรียกไม่สำเร็จ จะใช้ข้อความแม่แบบที่คำนวณจากตัวเลขจริง (`_build_dynamic_context_fallback` :1661-1771) (4) ผล cache ไว้ในหน่วยความจำ API; error ถูกกลืนเงียบ (`catch { // ignore }` `Dashboard.jsx:121-123`) และไม่ตรวจ HTTP status 🟢 (ข้อความแม่แบบจากตัวเลขจริง; ป้าย "โดย AI" จะโผล่เมื่อ `ai_live_generated` เป็นจริง `Dashboard.jsx:1302`)
- **[ปุ่มลิงก์ "เปิดคอนโซล Bronze Ingestion"]** → ไป `/ingestion` (`Dashboard.jsx:1289-1294`) 🟡 (ลิงก์ UI)
- **[กรอบ "สรุปสถานะคุณภาพข้อมูล"]** → (1) แสดงอย่างเดียว (2) ย่อหน้าสรุปของตาราง (3) ใช้ `aiContextApi.data.step5_lineage.executive_narrative` ถ้ามี ไม่เช่นนั้นสร้างข้อความจาก `/whitebox/state` (`Dashboard.jsx:1308-1313`) (4) ถ้ายังไม่มีข้อมูลบอกให้ไปรัน pipeline ก่อน 🟢
- **[การ์ดลิงก์ 4 ใบ: BRONZE INGESTION / DELTA EXPECTATIONS / SILVER QUALITY GATES / GOLD EXPORT]** → (1) คลิกไปหน้า `/ingestion`, `/rules`, `/pipeline`, `/export` (2) แผนที่ขั้นตอนทำงานพร้อมตัวเลขสรุป (3) ตัวเลขจาก `/whitebox/state` และ `step*_card_desc` ของ ai-context (`Dashboard.jsx:1316-1348`) (4) หมายเหตุ: ข้อความ "สแกนพบความผิดปกติ N หมวดหมู่" จริง ๆ คือ **จำนวนกฎที่เปิดใช้** (นับค่า true ของ `selected_findings`) ไม่ใช่จำนวนความผิดปกติที่พบ และถ้ายังไม่โหลดจะแสดง **3 ตายตัว** (`Dashboard.jsx:1319`); คำอธิบายสำรอง `Tukey 3.0×` ก็เป็นค่าตายตัว (:1329) 🟢 (ตัวเลขแถว) / 🔴 (ค่า 3 และข้อความสำรอง)
- **[ปุ่มลิงก์ "เปิดตารางตรวจสอบข้อมูลเชิงลึก (/whitebox)" และ "กลับไปปรับเกณฑ์ที่ Delta Expectations"]** → ไป `/whitebox` และ `/rules` (`Dashboard.jsx:1356-1385`) 🟡 (ลิงก์ UI)
- **[ปุ่มสลับ "Apache ECharts" / "Linear Track"]** → (1) สลับรูปแบบแผนภาพ lineage (2) ตัวเลือกการแสดงผล (3) `setLineageVisualMode` (`Dashboard.jsx:1395-1426`) (4) ไม่เรียก API 🟡 (UI state)
- **[แผนภาพ Medallion Data Lineage แบบ ECharts]** → (1) ลาก/ซูมได้ (ตั้ง `roam: true`) (2) เครือข่าย Bronze → Spark QA → Active Delta / Quarantine → BI / Remediation Queue (3) คอมโพเนนต์ `EchartsDataLineage` รับตัวเลขจากรันที่เลือก (`Dashboard.jsx:1430-1442`; `EchartsDataLineage.jsx:25-125`) (4) ตัวเลขต้นทาง = `activeRun?.total_records || wbTotal || undefined` (ฯลฯ); **ปัญหา:** (ก) ใช้ตัวดำเนินการ `||` ดังนั้นถ้ารันล่าสุดกักกัน **0 แถว** จะ "ตกไป" ใช้ค่ากักกันจากชุดข้อมูลนักศึกษา (`wbQuarantine`) แทน ทำให้ปนข้อมูลสองแหล่ง (ข) ถ้าไม่มีข้อมูลทั้งสองแหล่ง คอมโพเนนต์ใช้ค่าเริ่มต้นตายตัว **10,100 แถว / กักกัน 600 / คะแนน 93.1%** (`EchartsDataLineage.jsx:9-12`) ซึ่งดูเหมือนข้อมูลจริง (ค) โครงสร้างโหนด/เส้นและข้อความ "Certified BI", "Ticket Action", "Governance Ticket" เป็นค่าคงที่ ไม่ได้อ่านตั๋วจริง 🟡 (ตัวเลขจากรันจริง) / 🔴 (ค่าเริ่มต้น 10,100/600/93.1 และโครงสร้าง)
- **[แผนภาพ "Linear Track" (Bronze → Spark QA → Active/Quarantine → Serving API)]** → (1) แสดงอย่างเดียว (2) เส้นทางข้อมูลแบบกล่องเรียงแถว (3) ใช้ `activeRun` เท่านั้น (`Dashboard.jsx:1449-1504`) (4) จำนวนแถว = `total_records` / `total − quarantined` / `quarantined` ของรันที่เลือก (ถ้าไม่มีรันแสดง 0); ชื่อกล่อง "Spark QA Engine" และ "Serving API" ตายตัว 🟡
- **[ตาราง "Pipeline Run Audit History" + ช่องค้นหา]** → (1) พิมพ์ค้นหาตาม run id หรือชื่อตาราง; คลิกแถวเพื่อเลือกรัน (แถวที่เลือกถูกไฮไลต์และไปแสดงใน Run Inspector) (2) ประวัติรันตรวจคุณภาพ 5 แถวต่อหน้า (3) `/quality?limit=50` → ES `sdoqap_quality_runs` เรียงเวลาล่าสุด (`quality.py:32-38`; `Dashboard.jsx:219-235,1537-1556`) (4) ป้ายคะแนน ≥95 สีเขียว มิฉะนั้นเหลือง (เกณฑ์ตายตัวฝั่งเว็บ); เมื่อเปลี่ยนคำค้น หมายเลขหน้าไม่ถูกรีเซ็ต (อาจเห็นหน้าว่างถ้าอยู่หน้าหลัง) 🟢
- **[ปุ่ม "Prev" / "Next"]** → (1) เปลี่ยนหน้า (2) แบ่งหน้าตารางประวัติ (3) `setHistoryPage` ฝั่งเว็บ (`Dashboard.jsx:1567-1580`) (4) ตัดหน้าจาก 50 รันที่ดึงมาเท่านั้น 🟡 (UI state)
- **[การ์ด "Run Inspector"]** → (1) ดูรายละเอียดของรันที่เลือก (ค่าเริ่มต้นคือรันล่าสุด `Dashboard.jsx:129-138`) (2) ตาราง, คะแนน, แถวทั้งหมด, แถวกักกัน, "Quarantine Breakdown" (เหตุผลที่กักกันพร้อมจำนวน) (3) ฟิลด์ของเอกสารใน ES (`Dashboard.jsx:1605-1640`) (4) ตัวอย่างเหตุผลจริงจาก Spark: `missing_primary_key`, `null_value_in_…`, `duplicate_records` 🟢
- **[ปุ่ม "Retry Run"]** → (1) สั่งรันซ้ำ แล้วแสดง `alert` ผลลัพธ์ (ปุ่มเปลี่ยนเป็น "Retrying...") (2) ปุ่มรัน pipeline ของรันที่เลือกใหม่ (3) `POST /pipeline/retry/{run_id}` (`Dashboard.jsx:260-275,1595-1601`) → `pipeline.py:155-181` ต้องล็อกอิน; ถ้า run_id เป็น ingest เดิมจะเข้าคิวใหม่ ไม่เช่นนั้นหาตารางจาก `sdoqap_pipeline_runs` แล้วเรียก Spark trigger daemon (`pipeline.py:230-242` ถ้า daemon ล่มคืน 503 ไม่มีการทำเทียม) (4) หลังสำเร็จหน้าเว็บ refetch ข้อมูลหลายชุด; ผลการประมวลผลไปปรากฏเป็นรันใหม่ใน ES ภายหลัง 🟢
- **[กล่อง "LIVE INGESTION & SPARK LOG STREAM"]** → (1) ดูอย่างเดียว (2) บันทึกเหตุการณ์ล่าสุด 15 รายการ (3) `/system/activity?limit=15` (`system.py:212-288`) รวมเหตุการณ์จาก 3 ดัชนี (pipeline runs, quality runs, schema drifts) เรียงเวลาล่าสุด (4) **ไม่ใช่สตรีมจริง** เป็นการ poll ทุก 15 วินาที; ระดับ log จาก backend เป็นตัวพิมพ์เล็ก (`error`/`warning`/`info`/`success`) แต่หน้าเว็บเทียบกับ `'ERROR'`/`'WARN'` ตัวพิมพ์ใหญ่ (`Dashboard.jsx:1655`) ทำให้ **สีแดง/เหลืองของแถวไม่ทำงาน**; ถ้าดึง ES ไม่ได้ backend จะคืนข้อความ error เป็นแถว log (`system.py:282-288`); `terminalEndRef` ไม่ได้ทำให้เลื่อนลงอัตโนมัติ 🟢

## A6. ตัวเลขเงิน (Business-impact) — จริงหรือสมมติ?

**สรุป: ตัวเลขเงินทุกจุดในหน้านี้เป็น "ประมาณการจากค่าคงที่สมมติ" ไม่ใช่ต้นทุนทางการเงินจริงของธุรกิจ** (โค้ดเองก็ยอมรับใน `currency.js:1-13` และ InfoHint `Dashboard.jsx:483`) แหล่งคำนวณที่ `analytics.py:673-766`:

| รายการ | สูตรจริงในโค้ด | จริง/สมมติ |
|---|---|---|
| ข้อมูลตั้งต้น | รวม `quarantined_records` และ `total_records` จาก 100 เอกสารแรกใน `sdoqap_quality_runs` (ไม่ได้เรียงตามเวลา — `analytics.py:683-687`) | 🟢 จาก ES |
| Cost of Correction | `แถวกักกัน × $2` ("Industry avg ~$2/record" ตามคอมเมนต์ :707-708) | 🔴 ค่าคงที่สมมติ |
| Cost of Lost Opportunities | ถ้ามีคอลัมน์การเงิน (ลำดับค้นหา `total_sales, sales, revenue, profit, price, amount, total` — `metrics.py:101-112`) = ผลรวมคอลัมน์นั้นของแถวที่ถูกกักกัน; ถ้าไม่มี = `แถวกักกัน × 0.05 × $50` = $2.50/แถว (`analytics.py:712-716`) | 🟡 จริงเมื่อมีคอลัมน์การเงิน / 🔴 สมมติ (5% × $50) เมื่อไม่มี |
| Cost of Risk | `แถวกักกัน × drift_severity` โดย drift_severity มาจาก Spark (+1 ต่อคอลัมน์ใหม่, +5 ต่อคอลัมน์หาย/ชนิดไม่ตรง — `schema.py:154-161`); ถ้าไม่มี drift ใช้ 1; ถ้าเอกสาร drift ไม่มีค่าใช้ 5 (`analytics.py:696`) และอ่านเอกสาร drift เพียง 1 อันที่ไม่ได้เรียงลำดับ (:691) | 🟡 ค่าถ่วงน้ำหนักกำหนดเอง |
| ยอดรวม `total_financial_impact_usd` | `Correction + Lost Opp + Risk` (`analytics.py:724-726`) | 🟡 |
| อัตราแปลง บาท | `36.5 บาท/ดอลลาร์` ค่าคงที่ ไม่ใช่เรตจริง (`currency.js:14,26-28`) | 🔴 |
| "COPDQ Sales Risk" ในการ์ด Sell-In/Out | ผลรวม `quarantined_financial_value` ถ้า > 0 มิฉะนั้น **$18,544 ตายตัว** (`analytics.py:783,793-795`) | 🟡/🔴 |
| ข้อมูลอ้างอิง "Gartner $12.9M / IBM $3.1T" | เป็นแค่คอมเมนต์ในโค้ด ไม่ได้ใช้คำนวณ (`analytics.py:699-702`) | 🔴 |

## A7. ตัวควบคุม/ข้อมูลที่เรียกแต่ไม่ได้ใช้ (⚪ สรุป)

- `useApi('/kpi/stats')` (`Dashboard.jsx:68`) — ดึงทุก 15 วินาทีและถูก refetch เมื่อกด Refresh/Retry แต่ **ไม่มีการแสดงค่าที่ไหนเลย** ⚪ (backend `analytics.py:12-88` เองมีจริง คืนยอดรวมแถว/คะแนนเฉลี่ย/MTTD)
- `useApi('/analytics/clustering')` และ `'/analytics/projection'` (`Dashboard.jsx:76-77`) — เรียกแต่ไม่ได้ใช้ในหน้า Dashboard (ใช้จริงในหน้า Analytics) ⚪
- ตัวแปร `leftTab`, `centerTab`, `activeCriticalCount`, `anomaly.data.anomaly` (จุดผิดปกติ) ถูกประกาศ/ดึงแต่ไม่ถูกแสดง ⚪ (`Dashboard.jsx:61-62,150`)
- ตัวกรอง Time Range ⚪ (ดู A1)

## A8. เมื่อ API ล้มเหลว หน้าจอทำอะไร

| กรณี | พฤติกรรมที่ตรวจพบ |
|---|---|
| `/executive/overview` ล้ม (เช่น ES ปิด → 503 `config.py` ตรวจพอร์ต 0.1 วินาที) | ใช้ค่าเริ่มต้น `score: null` → การ์ดแสดง `---`, 5 คำถามแสดงข้อความ "ไม่พบความผิดปกติในระบบ"/"0 USD" (`Dashboard.jsx:143-179`) โดยไม่มีข้อความ error; ถ้าเคยโหลดสำเร็จแล้วจะค้างค่าเก่า |
| `/analytics/sell-in-out` ล้ม | ใช้ชุดตัวอย่างตายตัวในไฟล์หน้าเว็บ (`Dashboard.jsx:79-99`) และขึ้นป้าย "ข้อมูลตัวอย่าง" เฉพาะแท็บ Business |
| `/analytics/impact` ล้ม (หรือ backend จับ exception) | ต้นทุน 3 ส่วนเป็น `$0` — backend คืนศูนย์เองเมื่อเกิด exception (`analytics.py:757-766`) แยกไม่ออกจากกรณีไม่มีความเสียหาย |
| `/quality` ล้ม | ตารางว่าง, การ์ด Run Inspector แสดง "No run selected" |
| `/whitebox/state` ล้ม | แสดง `—` และข้อความ "ยังไม่มีข้อมูลจาก /whitebox/state" (ไม่เติมตัวเลขปลอม) |
| `/system/activity` ล้ม | ได้แถว log ข้อความ error จาก backend หรือ "Awaiting pipeline event stream..." |
| ไม่มีข้อมูลเลยใน ES (index ไม่มี) | Data Health ขึ้น 100% "Good", Availability 0% "DEGRADED" (`analytics.py:94-96,153`) |

---

## คำตอบ 3 ข้อของหน้า Dashboards

- **หน้านี้มีไว้ทำอะไร?** แสดงภาพรวมคุณภาพข้อมูลของระบบ ETL ใน 4 มุมมอง (ผู้บริหาร / ผลกระทบธุรกิจ / คุณภาพข้อมูล / เทคนิค) พร้อมประมาณการความเสียหายเป็นเงิน
- **ผู้ใช้ทำอะไรได้?** สลับมุมมอง, กรองบางตาราง, รีเฟรช, ส่งออก CSV ผู้บริหาร, เจาะลึกไปดูรันและสั่ง Retry, ปิดตั๋ว Remediation, ขอให้ AI สรุปใหม่ และกดลิงก์ไปหน้าอื่น
- **ระบบทำอะไรเบื้องหลัง?** หน้าเว็บ poll API 11 ตัวทุก 10-30 วินาที ฝั่งเซิร์ฟเวอร์อ่านผลรันจาก Elasticsearch (ที่ Spark เขียนไว้) มาคำนวณเฉลี่ย/สัดส่วน/ต้นทุนสมมติ และคำนวณชุดข้อมูลนักศึกษาตัวอย่างด้วย pandas สำหรับแท็บ Technical (ส่วน Sell-In/Out เป็นข้อมูลตัวอย่างตายตัว)

---

# ส่วนที่ B — หน้า Query & Metrics (`/analytics`)

| Frontend file | API endpoints ที่เรียก | Backend handler | Storage |
|---|---|---|---|
| `services/ui/src/pages/Analytics.jsx` (379 บรรทัด) + `utils/currency.js` | `GET /analytics/projection` (60s), `/analytics/clustering` (60s), `/analytics/impact` (60s), `/analytics/recommendations` (60s) (`Analytics.jsx:18-21`); ปุ่ม "นำไปใช้": `POST /whitebox/state` (`Analytics.jsx:36-40`) | `analytics.py` (`get_quality_projection` :460, `get_diagnostic_clustering` :599, `get_business_impact` :673, `get_actionable_recommendations` :833); `whitebox.py:1442-1474` | Elasticsearch (`sdoqap_quality_runs`, `sdoqap_schema_drifts`); สถานะตัวเลือกของหน้า (SLA, ช่วงพยากรณ์, คำค้น, รายการที่กดนำไปใช้) อยู่ในหน่วยความจำเบราว์เซอร์ (`useState` `Analytics.jsx:11-16`) หายเมื่อรีเฟรช |

**ประเด็นสำคัญเรื่อง "Query":** ตรวจทั้งไฟล์ `Analytics.jsx` แล้ว **ไม่มีกล่องพิมพ์คำสั่ง SQL/Query/DSL ที่ส่งไปประมวลผลบนเซิร์ฟเวอร์** ช่องเดียวที่พิมพ์ได้คือ "ค้นหาความผิดปกติ" ซึ่งกรองรายการที่โหลดมาแล้วในเบราว์เซอร์ด้วย `includes()` (`Analytics.jsx:91-102`) จึงไม่มีความเสี่ยงเรื่อง query injection จากหน้านี้ — ชื่อหน้า "Query & Metrics" เป็นแค่ป้ายชื่อ (`config/pages.js:16`)

## B1. แถบควบคุมด้านบน

- **[หัวข้อ "Query & Metrics" และคำบรรยาย]** → แสดงอย่างเดียว อ่านจาก `PageHeader pageKey="analytics"` (`Analytics.jsx:109-116`, `config/pages.js:16`) 🔴 (ข้อความคงที่)
- **[ปุ่ม "คำนวณใหม่"]** → (1) กดแล้วดึง 4 API ใหม่ทันที และขึ้นแถบเขียว "อัปเดตโมเดลพยากรณ์และข้อมูลคลัสเตอร์ล่าสุดเรียบร้อยแล้ว" 4 วินาที (2) ปุ่มรีเฟรชข้อมูล (3) `handleRefreshAll` เรียก `refetch()` 4 ตัว (`Analytics.jsx:23-30`) (4) **แถบข้อความขึ้นทันทีโดยไม่รอผล และไม่ได้ "คำนวณโมเดลใหม่"** — ฝั่งเซิร์ฟเวอร์คำนวณใหม่ทุกครั้งที่ถูกเรียกอยู่แล้ว (ไม่มีโมเดลที่เทรนเก็บไว้) 🟢 (ดึงข้อมูลจริง) แต่ข้อความยืนยันเป็น 🔴
- **[ช่อง "เป้า SLA (%)"]** → (1) พิมพ์ตัวเลข 50-100 (2) เส้นอ้างอิง SLA ในกราฟพยากรณ์ (3) `setSlaTarget` ฝั่งเว็บ (`Analytics.jsx:125-133`) (4) กระทบเฉพาะกราฟ เส้นอ้างอิง ป้ายสถานะ และ KPI "วันที่ต่ำกว่าเป้า" ในหน้านี้ — InfoHint บอกเองว่า "เกณฑ์ที่เซิร์ฟเวอร์ใช้จริงยังเป็น 95% เสมอ" (`Analytics.jsx:123`; ฝั่ง backend ค่า 95.0 ตายตัว `analytics.py:539`) ⚪ (ปรับได้ในหน้าจอเท่านั้น ไม่เชื่อมระบบ)
- **[ช่องเลือก "พยากรณ์ล่วงหน้า" 7 / 14 / 30 วัน]** → (1) เลือกช่วง (2) จำนวนวันในกราฟพยากรณ์ (3) `horizonDays` ใน `projectionData` (`Analytics.jsx:44-73`) (4) เซิร์ฟเวอร์คำนวณจริงเพียง **7 วัน** (`analytics.py:520` `range(1, 8)`) ถ้าเลือก 14/30 วัน **วันที่ 8 เป็นต้นไปหน้าเว็บสร้างตัวเลขเอง** โดยเอาวันที่ 7 บวก drift ทีละ 0.18 ต่อวัน (สูงสุด +4.5) (`Analytics.jsx:64-70`) — **คือแนวโน้มขึ้นเสมอไม่ว่าแนวโน้มจริงจะลงหรือขึ้น** มีป้ายส้มเตือนบนกราฟ (`Analytics.jsx:181-185`) 🔴 (วัน 8+) / 🟡 (วัน 1-7)
- **[ช่อง "ค้นหาความผิดปกติ"]** → (1) พิมพ์ชื่อตาราง/รูปแบบ เช่น `null` (2) ตัวกรองรายการ (3) กรองด้วย `includes` ฝั่งเว็บ (`Analytics.jsx:91-102`) (4) กรองเฉพาะการ์ด "รูปแบบข้อผิดพลาด"; ถ้าไม่เจอขึ้น "ไม่พบคลัสเตอร์ที่ตรงกับคำค้นหา" (`Analytics.jsx:284`) 🟡 (กรองข้อมูลจริงฝั่งเว็บ)
- **[ป้ายสถานะเทียบเกณฑ์ SLA]** → (1) แสดงอย่างเดียว (2) จำนวนวันในกราฟที่คะแนนต่ำกว่าเป้า (3) `breachDaysCount = จำนวนวันที่ Score < SLA` (`Analytics.jsx:75-77,165-167`) (4) **ข้อควรระวัง:** ถ้าไม่มีข้อมูลพยากรณ์ (มีรันน้อยกว่า 2 รัน) รายการว่าง → breachDaysCount = 0 → ขึ้นสีเขียว "ผ่านเกณฑ์ SLA ทุกวัน (100%)" ทั้งที่ไม่มีข้อมูลเลย 🟡

## B2. การ์ด "พยากรณ์ N วัน · เป้า X%"

- **[กราฟพยากรณ์คะแนนคุณภาพ (เส้นม่วง Score, พื้นเขียว High, พื้นแดง Low, เส้นเหลือง SLA)]** → (1) เอาเมาส์ชี้ดูค่า (2) คะแนนคุณภาพที่ทำนายรายวัน พร้อมช่วงความเชื่อมั่น (3) `GET /analytics/projection` (`analytics.py:460-597`; `Analytics.jsx:18,193-216`) (4) วิธีคำนวณจริง: เลือก "ตารางที่มีรันล่าสุด" อัตโนมัติ (ไม่แสดงชื่อตารางบนหน้า) → ดึง 10 รันล่าสุดของตารางนั้น → ทำ **Linear Regression (ถดถอยเชิงเส้น: ลากเส้นตรงที่พอดีที่สุดผ่านจุดคะแนน)** โดยแกน X เป็น "วัน" จากเวลาจริงของรัน (:486-513) → ทำนายวันที่ 1-7 ถัดจากรันล่าสุด จำกัดค่า 0-100 (:520-524) → ช่วงความเชื่อมั่น = ± (ค่าคลาดเคลื่อนมาตรฐาน × (1 + 0.2 × วันที่)) ขั้นต่ำ 0.5 (:509-529) ต้องมี **อย่างน้อย 2 รัน** มิฉะนั้นคืนค่าว่าง (:486,583-597) 🟡
  - **ข้อควรระวังจากโค้ด:** แกน X เป็นหน่วยวัน ถ้า 10 รันเกิดในช่วงไม่กี่นาที ความชันต่อ "วัน" จะสูงมากและค่าทำนายอาจถูกตัดที่ 0 หรือ 100 (:523); ข้อความ "slope: … per run" (:553) จริง ๆ เป็นความชันต่อวัน (เมื่อรันมีเวลาต่างกัน) — เป็นข้อสังเกตจากการอ่านโค้ด ยังไม่ได้ทดลองรัน
- **[KPI "Stability Index"]** → (1) แสดงอย่างเดียว (2) ดัชนีความนิ่งของคะแนน (3) `projection.data.stability_index` (`Analytics.jsx:219-222`) (4) สูตรเซิร์ฟเวอร์: `100 − (ส่วนเบี่ยงเบนมาตรฐานของคะแนน × 4)` จำกัดช่วง 5-100 (`analytics.py:531-535`); **สีตัวเลขเป็นเขียวตายตัว** ไม่ว่าค่าจะต่ำเพียงใด 🟡
- **[KPI "วันในกราฟที่ต่ำกว่าเป้า (X%)"]** → (1) แสดงอย่างเดียว (2) สัดส่วนวันที่ต่ำกว่าเป้า (3) `breachDaysCount ÷ จำนวนวันในกราฟ × 100` คำนวณในหน้าเว็บ (`Analytics.jsx:228-230`) (4) InfoHint บอกเองว่าไม่ใช่ `sla_breach_probability` ของเซิร์ฟเวอร์ (ที่ backend คำนวณด้วยการแจกแจงปกติ `analytics.py:537-550` แต่ **ไม่ถูกแสดงในหน้านี้**) และรวมวัน 8+ ที่หน้าเว็บสร้างเองเมื่อเลือก 14/30 วัน 🟡
- **[ข้อความ "Historical Trend Summary"]** → แสดง `historical_trend` จากเซิร์ฟเวอร์ ("Decline detected" ถ้าความชัน <0 มิฉะนั้น "Stable or improving…") (`Analytics.jsx:234-236`, `analytics.py:552-553`) 🟡
- **ไม่แสดงในหน้านี้ (แต่ backend ส่งมา):** `crisis_forecast` (วันถึงวิกฤต, ส่วนประกอบที่กระทบ, ความรุนแรง — `analytics.py:555-565,574-579`) และ `sla_breach_probability` — ตรวจไม่พบการใช้ในหน้า Analytics ⚪
- **สถานะโหลด/ล้มเหลว:** ระหว่างโหลดขึ้น "Running quality forecasting models..." (ข้อความตกแต่ง — ไม่มีโมเดลถูกเทรน) ถ้า error ขึ้น "Failed to load forecasting metrics" (`Analytics.jsx:187-190`) — **หน้า Analytics แสดง error ชัดเจน ต่างจาก Dashboard**

## B3. การ์ด "รูปแบบข้อผิดพลาด" (Error Pattern Clustering)

- **[แผนภูมิแท่งแนวนอน + รายการ "● ชื่อ N events (P%)"]** → (1) เอาเมาส์ชี้ดูค่า; กรองได้ด้วยช่องค้นหา (2) จัดกลุ่มสาเหตุที่ข้อมูลถูกกักกัน (3) `GET /analytics/clustering` (`analytics.py:599-671`; `Analytics.jsx:91-102,256-282`) (4) วิธีทำจริง: อ่านเอกสารรันที่มีแถวกักกัน >0 จำนวนสูงสุด 100 เอกสาร (ไม่เรียงตามเวลา) → รวมจำนวนตาม `quarantine_breakdown` → **จัดกลุ่มด้วยการจับคำสำคัญในชื่อเหตุผล** (เช่น มีคำว่า "drift" → "CSV File Ingestion / Schema Drift Mismatch"; "missing/null" → "Database Sync / Null Primary Key Constraint"; "duplicate" → "API Gateway / Duplicate Payload Ingestion") (:623-642) เปอร์เซ็นต์ = `จำนวนกลุ่ม ÷ ผลรวมทั้งหมด × 100` (:650) 🟡
  - InfoHint บนหน้าบอกเองว่า "ไม่ใช่อัลกอริทึม clustering เช่น k-means" (`Analytics.jsx:248`)
  - ป้ายชื่อ "แหล่ง" (เช่น "Text Ingestion Service", "Classification Service", "API Gateway") **เป็นชื่อที่โค้ดกำหนดจากคำสำคัญ ไม่ใช่แหล่งข้อมูลที่ตรวจพบจริง** และเหตุผลที่ไม่ตรงคำสำคัญใดจะขึ้น "Unknown" 🔴 (ป้ายชื่อแหล่ง/รูปแบบ) 🟡 (จำนวน)
  - กราฟแสดงชื่อ `source` บนแกน Y ดังนั้นหลายกลุ่มที่แหล่งเดียวกันแต่รูปแบบต่างกันจะมีป้ายซ้ำกัน (`Analytics.jsx:96-101,263`)
- **[ข้อความ `correlation_analysis`]** → backend สร้างประโยคสรุป (:661) แต่หน้า Analytics **ไม่ได้แสดง** ⚪ (ตรวจไม่พบการใช้ในโค้ด)
- **สถานะล้มเหลว:** "โหลดไม่สำเร็จ"; ถ้าไม่มีข้อมูล backend ส่งรายการว่าง (:668-671) หน้าเว็บจะแสดง "ไม่พบคลัสเตอร์ที่ตรงกับคำค้นหา \"\"" (ข้อความไม่ตรงกรณีไม่มีข้อมูลเลย — `Analytics.jsx:283-285`)

## B4. การ์ด "ผลกระทบทางธุรกิจ"

- **[แถบ KPI 3 แถว (Sales Report Accuracy, Inventory Forecast Reliability, User Recommendations CTR) พร้อม "-X%"]** → (1) แสดงอย่างเดียว (2) ระดับผลกระทบของข้อมูลเสียต่อ KPI ธุรกิจ (3) `kpi_connections` จาก `/analytics/impact` (`Analytics.jsx:300-310`; `analytics.py:728-739`) (4) สูตร: `error_rate = แถวกักกัน ÷ แถวทั้งหมด × 100`; Sales impact = `error_rate × 0.8`; Inventory impact = `drift_severity × error_rate × 0.3` (มี drift) หรือ `error_rate × 0.4` (ไม่มี drift) — **ตัวคูณ 0.8 / 0.3 / 0.4 เป็นค่าที่ผู้เขียนกำหนดเอง** (:728-729); สถานะ Sales = WARN ถ้า <10 มิฉะนั้น CRITICAL (ไม่มีทางเป็น OK), Inventory = CRITICAL ถ้า >5 มิฉะนั้น OK (:737-738); **แถว "User Recommendations CTR" ตายตัว OK / 0.0 เสมอ** (:739) 🟡 (แถว 1-2) / 🔴 (แถว 3)
- **[กล่อง "ความเสียหายโดยประมาณ $… USD (≈ ฿…)"]** → (1) แสดงอย่างเดียว (2) ยอดรวม COPDQ (3) `total_financial_impact_usd` + `formatThbApprox` (`Analytics.jsx:312-320`) (4) สูตรและความเป็นค่าสมมติ ดู "A6" (InfoHint ที่ `Analytics.jsx:291` บอกว่าเป็นค่าสมมติ); ฟังก์ชัน `formatUsd` แสดง "$N USD" และบาทคำนวณที่อัตรา 36.5 ตายตัว 🟡
- **สถานะล้มเหลว:** "โหลดไม่สำเร็จ"; ถ้า backend เจอ exception จะคืนค่าศูนย์ทั้งหมดและ OK (`analytics.py:757-766`) หน้าเว็บจะแสดง $0 ราวกับไม่มีความเสียหาย

## B5. การ์ด "คำแนะนำเชิงกฎ" (Recommendations)

- **[รายการคำแนะนำ (ป้ายประเภท + ชื่อ + คำอธิบาย)]** → (1) แสดงอย่างเดียว (2) ข้อเสนอแนะการดำเนินการ (3) `GET /analytics/recommendations` (`analytics.py:833-892`; `Analytics.jsx:342-374`) (4) สร้างจาก **กฎตายตัว 3 ข้อ**: (ก) พบ schema drift ในตารางใด → "NOTIFY_DEV: Notify API Devs" (ข) พบ drift → "HALT_INGEST: Halt Ingestion" (ค) มีรันที่คะแนน <70 (ค่า 70 ตายตัว) → "RESTORE_BACKUP" (:838-887) ข้อความเป็นแม่แบบที่แทรกชื่อตาราง/ฟิลด์/คะแนนจริง; อ่านจาก drift 20 อันล่าสุด และรันคะแนนต่ำ 10 อันล่าสุด; ไม่มี drift/รันคะแนนต่ำ → รายการว่างและหน้าไม่แสดงอะไรเลย (ไม่มีข้อความ "ไม่มีคำแนะนำ") — InfoHint บอกเองว่า "ไม่ใช่คำแนะนำจากโมเดล AI" (`Analytics.jsx:330`) 🟡 (หัวข้อการ์ดเขียนว่า "AI Recommendations" ในคอมเมนต์โค้ด แต่ข้อความบนหน้าถูกต้อง)
- **[ปุ่ม "นำไปใช้" / "นำไปใช้แล้ว ✓"]** → (1) กดแล้วปุ่มเปลี่ยนเป็น "นำไปใช้แล้ว ✓" และแถบเขียวขึ้นข้อความ "นำคำแนะนำ … ไปปรับใช้กับชุดกฎคัดกรองเรียบร้อยแล้ว" (2) ปุ่มสั่งปฏิบัติตามคำแนะนำ (3) `handleApplyRecommendation` ส่ง `POST /api/v1/whitebox/state` ด้วย body `{confirm_rules: true}` (`Analytics.jsx:32-42`) → `update_workflow_state` (`whitebox.py:1442-1474`) ต้องล็อกอิน (4) **ปุ่มนี้ไม่ได้ปฏิบัติตามคำแนะนำจริง:** `confirm_rules` ไม่ใช่คีย์ใน `_WORKFLOW_STATE` (`whitebox.py:1191-1212`) จึงถูกข้ามในลูปอัปเดต เหลือเพียงการบันทึกเวลา `confirmed_at` (:1471-1472) และสถานะเก็บเฉพาะชุดข้อมูลนักศึกษา (ไม่เกี่ยวกับ schema drift หรือการหยุด ingestion หรือกู้ข้อมูลของตารางที่แนะนำ); ไม่มีโค้ดหยุด pipeline / แจ้งนักพัฒนา / กู้ backup ในเส้นทางนี้ (ตรวจไม่พบในโค้ด); ข้อความสำเร็จขึ้นก่อนเรียก API และข้อผิดพลาดถูกกลืนเงียบ (`catch {}` :41); สถานะ "นำไปใช้แล้ว" เก็บแค่ในหน่วยความจำหน้าเว็บ หายเมื่อรีเฟรช ⚪
- **[ลิงก์ "ไปที่ Expectations & Alerts →"]** → ไป `/rules` (`Analytics.jsx:332-334`) 🟡 (ลิงก์ UI)

## B6. คำนิยามตัวชี้วัดของหน้านี้ (สรุป)

| ตัวชี้วัด | ความหมายง่าย ๆ | สูตร / แหล่งที่มา |
|---|---|---|
| Score (เส้นม่วง) | คะแนนคุณภาพที่ทำนาย | ถดถอยเชิงเส้นจาก 10 รันล่าสุดของ 1 ตาราง (`analytics.py:486-524`) |
| High / Low | ช่วงความเชื่อมั่นบน/ล่าง | ± ค่าคลาดเคลื่อนมาตรฐาน × (1+0.2×วัน) (`analytics.py:527-529`) |
| Stability Index | ความนิ่งของคะแนน | 100 − 4×ส่วนเบี่ยงเบนมาตรฐาน (5-100) (`analytics.py:535`) |
| วันที่ต่ำกว่าเป้า | สัดส่วนวันที่ทำนายต่ำกว่า SLA | คำนวณในหน้าเว็บ (`Analytics.jsx:75-77,229`) |
| Error cluster % | สัดส่วนสาเหตุกักกัน | `count ÷ ผลรวม × 100` (`analytics.py:650`) |
| Impact % / ความเสียหาย $ | ผลกระทบต่อ KPI และต้นทุนประมาณ | ดู B4 และ A6 |
| Recommendations | ข้อเสนอแนะตามกฎ | 3 กฎใน `analytics.py:838-887` |

## B7. รอบรีเฟรช และข้อสังเกตด้านความปลอดภัย

- รีเฟรชอัตโนมัติ 60 วินาที ทั้ง 4 API (`Analytics.jsx:18-21`)
- ความปลอดภัย: ไม่มีช่องรับ query จากผู้ใช้ส่งไปเซิร์ฟเวอร์; พารามิเตอร์เดียวของ API คือ `table_name` (ของ `/analytics/projection`) ซึ่งหน้า Analytics ไม่ได้ส่ง (ใช้ตารางล่าสุดอัตโนมัติ — `Analytics.jsx:18`, `analytics.py:466-470`) และเซิร์ฟเวอร์ส่งเป็นค่า `term` ของ ES ไม่ได้ต่อสตริง query (`analytics.py:475`) จึงเสี่ยง injection ต่ำ; แต่ GET ทั้งสี่ตัวไม่ต้องล็อกอินที่ระดับ API (ดูหัวเอกสาร)

---

## คำตอบ 3 ข้อของหน้า Query & Metrics

- **หน้านี้มีไว้ทำอะไร?** แสดงแนวโน้มและการพยากรณ์คะแนนคุณภาพข้อมูล, การจัดกลุ่มสาเหตุที่ข้อมูลถูกกักกัน, ผลกระทบต่อ KPI ธุรกิจ และข้อเสนอแนะตามกฎ (ไม่มีช่องรัน query จริง)
- **ผู้ใช้ทำอะไรได้?** ปรับเป้า SLA และช่วงพยากรณ์ (มีผลเฉพาะการแสดงผล), ค้นหาในรายการข้อผิดพลาด, กด "คำนวณใหม่" เพื่อดึงข้อมูลใหม่ และกด "นำไปใช้" ที่คำแนะนำ (ปัจจุบันบันทึกเพียงเวลายืนยันกฎ ไม่ได้ลงมือทำตามคำแนะนำจริง)
- **ระบบทำอะไรเบื้องหลัง?** ทุกครั้งที่ถูกเรียก API อ่านผลรันและ drift จาก Elasticsearch แล้วคำนวณถดถอยเชิงเส้น/จับคำสำคัญจัดกลุ่ม/คำนวณต้นทุนสมมติ/ใช้กฎสร้างคำแนะนำ ทุก 60 วินาที โดยไม่มีการเก็บโมเดลหรือผลล่วงหน้า

---

## ภาคผนวก — สรุปจุดที่ควรระวังก่อนนำเสนอ (จัดลำดับความสำคัญ)

1. **Sell-In / Sell-Out ทั้งหมดเป็นข้อมูลตัวอย่างตายตัว** (`analytics.py:799-807`, `is_example: True`) และการ์ด "Sell-In / Out Volume Gap" บนหน้า Executive ไม่มีป้ายเตือน
2. **ตัวเลขเงิน (COPDQ) ใช้ค่าคงที่สมมติ** ($2/แถว, 5%×$50, ตัวคูณ drift, 36.5 บาท/ดอลลาร์) ไม่ใช่ต้นทุนธุรกิจจริง
3. **ข้อความผลกระทบ/ระยะเวลาของ Critical Issues และ KPI Impact เป็นข้อความตายตัว** (เช่น "ล่าช้า 25 นาที", "24 mins") มีเพียงเงื่อนไขการปรากฏและตัวเลขบางตัวที่มาจากข้อมูลจริง และผูกชื่อตาราง `users`/`products` ที่ตายตัว
4. **ตัวกรอง Time Range ไม่ทำงาน**, ตัวกรอง Business Area ทำงานบางส่วน
5. **ปุ่ม "นำไปใช้" (Analytics) ไม่ได้ทำตามคำแนะนำจริง**; พยากรณ์วันที่ 8-30 ถูกสร้างต่อโดยหน้าเว็บ (แนวโน้มขึ้นเสมอ)
6. **แท็บ Technical Cockpit (สูตร/การ์ด 4 ขั้นตอน) ใช้ชุดข้อมูลนักศึกษาตัวอย่างจากไฟล์ CSV** ไม่ใช่ผลรัน Spark/ES; แผนภาพ lineage มีค่าเริ่มต้น 10,100/600/93.1 และตัวดำเนินการ `||` ปนข้อมูลสองแหล่งเมื่อกักกัน = 0
7. **ไม่มีการแสดง error ของ API บน Dashboard** และถ้าไม่มีข้อมูลเลย Data Health จะขึ้น 100% "Good"
8. **ความไม่สอดคล้องของคีย์เหตุผลการกักกัน** ระหว่าง Spark กับ API ทำให้ Missing/Invalid % อาจเป็น 0 กับข้อมูลจริง (สรุปจากการเทียบโค้ด)
9. **"Open Tickets" นับตั๋วที่ปิดแล้ว** และผู้รับผิดชอบเป็น "Data Engineer Team" ตายตัว
10. **ระดับ log สีไม่ทำงาน** (ตัวพิมพ์เล็ก/ใหญ่ไม่ตรง) และ "LIVE STREAM" เป็นการ poll ทุก 15 วินาที
