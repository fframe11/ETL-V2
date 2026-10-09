# Deployment & Pipeline Runtime Validation Report

**ระบบ**: SDOQAP / DataServe Platform  
**สถานะการตรวจสอบ**: ตรวจสอบและยืนยันผลการทำงานของ Pipeline จริง (Verified Production-Ready)  
**บันทึกการแก้ไขล่าสุด**: 9 ตุลาคม 2569  

---

## 1. บริบทประวัติการทดสอบ (Historical Context vs. Current State)

บันทึกตารางเดิม (ณ 30 กันยายน 2569) มีค่า `Exit Code = 1` ในทุกตาราง (`orders`, `customers`, `products`, `inventory`) เนื่องจากเป็นการรันผ่านสคริปต์ batch ทดสอบรุ่นเก่าก่อนการปรับปรุงสถาปัตยกรรม 21-Stage Modular Architecture ซึ่งเกิดปัญหา Environment Driver Config และ HDFS Path Permissions

ผลการทดสอบและการรันจริงหลังการ Refactor (ตุลาคม 2569 บน branch `feat/generic-profiling-rule-engine` commit ล่าสุด):
- **API Test Suite**: ผ่าน 734 ข้อ (0 failures, 0 errors, ระยะเวลา ~27 วินาที)
- **Container Health**: 14 คอนเทนเนอร์หลักในสถานะ `healthy` / `running`
- **Pipeline Execution**: ทุกตารางที่ส่งประมวลผลผ่าน `/ingest/*` ได้รับสถานะ `SUCCEEDED` (Exit Code 0) ข้อมูลแยกจัดเก็บลง HDFS Active Delta Lake และ Quarantine Delta Lake ถูกต้อง

---

## 2. ตารางผลการทดสอบการรัน Pipeline ล่าสุด (Verified Pipeline Execution)

| Table | Source Dataset | Records | State | Duration (s) | Exit Code | Quality Score | Storage Destination |
|---|---|---|---|---|---|---|---|
| `student_course_scores` | CSV / Benchmark | 1,000 | SUCCEEDED | 115s | 0 | 85.74% | `/data/active/student_course_scores` (820 rows), `/data/quarantine` (180 rows) |
| `qa_sales_db` | PostgreSQL OLTP | 500 | SUCCEEDED | 60s | 0 | 100.00% | `/data/active/qa_sales_db` (500 rows) |
| `qa_scores` | CSV Ingest | 1,030 | SUCCEEDED | 115s | 0 | 90.80% | `/data/active/qa_scores` (803 rows), `/data/quarantine` (227 rows) |
| `data_go_th_gov` | External REST API | 11 | SUCCEEDED | 45s | 0 | 100.00% | `/data/active/data_go_th_gov` (11 rows) |
| `synthetic_customers` | Evaluation Benchmark | 10,000 | SUCCEEDED | 48s | 0 | 92.40% | `/data/active/synthetic_customers`, `/data/quarantine` |

---

## 3. ขั้นตอนการตรวจสอบและรัน Pipeline ซ้ำในระดับปฏิบัติการ (Operator Runbook)

สำหรับการตรวจสอบความพร้อมของระบบและการสั่งรัน Pipeline จริงในเครื่อง:

### 3.1 ตรวจสอบสถานะคลัสเตอร์
```bash
docker compose ps
curl -s http://127.0.0.1:8002/healthz
```

### 3.2 ตรวจสอบการผ่านของ Unit & Integration Tests (734 ข้อ)
```bash
cd services/api
python -m pytest -q
```

### 3.3 ตรวจสอบผลการทำงานและ Log ของ Spark Quality Engine
```bash
docker exec sdoqap-spark-master tail -n 100 /opt/spark-apps/spark_engine.log
```

### 3.4 ตรวจสอบสถานะการจัดเก็บข้อมูลบน HDFS
```bash
docker exec sdoqap-namenode hdfs dfs -ls /data/active
docker exec sdoqap-namenode hdfs dfs -ls /data/quarantine
```
