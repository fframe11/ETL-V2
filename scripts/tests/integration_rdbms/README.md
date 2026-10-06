# Integration test: Mock PostgreSQL -> /api/v1/pipeline/ingest/rdbms

รายงานผลอยู่ที่ [docs/testing/2026-10-06-rdbms-ingest-integration-report.md](../../../docs/testing/2026-10-06-rdbms-ingest-integration-report.md)

## รันซ้ำ

ต้องมี stack หลักรันอยู่แล้ว (`sdoqap-namenode`, `sdoqap-spark-master`, `sdoqap-elasticsearch` ฯลฯ) และมี image `etl-api`

```bash
# 1. เปิด Mock DB (sdoqap-mockdb, port 5433) + API test instance (sdoqap-api-it, port 8012)
cd scripts/tests/integration_rdbms
docker compose -p sdoqap-it --env-file ../../../.env -f docker-compose.mockdb.yml up -d

# 2. รันเทสต์ (โหมดปกติ: semester = '2025-1')
python run_rdbms_integration.py --cleanup

# 3. control run (semester ถูกแปลงใน SELECT เป็นรูปแบบ '1/2025' ตามข้อมูลของโปรเจกต์)
python run_rdbms_integration.py --control --cleanup

# 4. ปิดและลบ Mock DB
docker compose -p sdoqap-it --env-file ../../../.env -f docker-compose.mockdb.yml down -v
```

เทสต์ใช้ `INGEST_SERVICE_KEY` จาก `.env` (header `X-Service-Key`) และใช้ `ADMIN_USERNAME/ADMIN_PASSWORD` เฉพาะตอน `--cleanup` เพื่อลบตารางทดสอบผ่าน `DELETE /api/v1/export/tables/{table}`

ยิง API ด้วยมือ:

```bash
curl -X POST localhost:8012/api/v1/pipeline/ingest/rdbms \
  -H "X-Service-Key: $INGEST_SERVICE_KEY" -H "Content-Type: application/json" \
  -d '{"table_name":"itest_manual","db_type":"postgresql","host":"sdoqap-mockdb","port":5432,
       "username":"mock_user","password":"mock_pass_123","database":"mock_students",
       "query":"SELECT student_id, name, course, semester, score, study_hours FROM student_scores ORDER BY row_id"}'
```

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `docker-compose.mockdb.yml` | `sdoqap-mockdb` (postgres:15-alpine) และ `sdoqap-api-it` (image `etl-api` เดิม, `RDBMS_ALLOWED_HOSTS=sdoqap-mockdb`) |
| `init/01_schema_seed.sql` | ตาราง `student_scores` 20 แถว: ปกติ 14, NULL 2, ซ้ำ 1, out-of-range 3 |
| `run_rdbms_integration.py` | ตัวรันเทสต์ ยิงผ่าน API จริง ตรวจ HDFS, run registry, Elasticsearch |
| `evidence/report-*.{md,json}` | ผลรันล่าสุดของแต่ละโหมด |
