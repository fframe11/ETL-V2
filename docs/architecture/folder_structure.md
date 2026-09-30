# Project Folder Structure

SDOQAP ใช้ layout แบบ monorepo: โค้ดของแต่ละ container อยู่ใต้ `services/`, config ของโครงสร้างพื้นฐานอยู่ใต้ `infra/`, ข้อมูลทุกชนิดอยู่ใต้ `data/`

| Path | เนื้อหา | Mount เข้า container ที่ |
|---|---|---|
| `services/api/` | FastAPI serving layer (`main.py`, `app/api/*.py`), tests ใน `services/api/tests/` | build context ของ `api` |
| `services/spark/` | Spark quality engine, trigger daemon, rules/schema config; `tests/integration/` ต้องมี stack รันอยู่; `scripts/manual/` สคริปต์ทดลอง | `/opt/spark-apps` (spark-master, spark-worker, api) |
| `services/ui/` | React (Vite) portal | build context ของ `ui` |
| `infra/nginx/` | reverse proxy config | `/etc/nginx/nginx.conf` |
| `infra/grafana/`, `infra/prometheus/` | observability provisioning | `/etc/grafana/provisioning` |
| `infra/n8n/` | ingestion workflow + credentials (credentials ถูก ignore) | คัดลอกโดย `start_system.bat` |
| `infra/swarm/` | HA deployment variant | — |
| `data/evaluation/` | ชุดข้อมูลประเมิน (dirty/clean/ground truth) + zip seed | `/app/student_course_score_evaluation_dataset`, `/app/seed/...zip` |
| `data/samples/` | ชุดข้อมูลตัวอย่าง (student scores, formats, grocery, CSV ขนาดใหญ่ที่ ignore) | — |
| `data/stress/` | ข้อมูล stress test (100K sales) | `/stress_test` (n8n), init SQL ของ postgres |
| `data/inputs/` | ที่วางไฟล์ของ `test_data_source.bat` (ignore ยกเว้น README) | — |
| `scripts/ops/` | สคริปต์ปฏิบัติการ (cleanup, health check) | `/app/scripts` (api, mount `./scripts`) |
| `scripts/windows/` | สคริปต์ .bat/.ps1 เสริม | — |
| `scripts/evaluation/` | สคริปต์วัดผลตามเกณฑ์ประเมิน | — |
| `scripts/dev/`, `scripts/maintenance/`, `scripts/tests/`, `scripts/verify/` | เครื่องมือนักพัฒนา | — |
| `docs/architecture/` | เอกสารสถาปัตยกรรม | — |
| `docs/requirements/`, `docs/specs/`, `docs/reports/` | TOR/ข้อกำหนด, spec, รายงาน | — |
| `docs/whitebox-report/`, `docs/transform-report/`, `docs/etl-review/` | รายงานเชิงลึก (citation อ้าง tag `report-snapshot-2026-09-30`) | — |

Entry point ที่ root: `start_system.bat` (เปิดระบบ), `test_data_source.bat` (ทดสอบแหล่งข้อมูล), `docker-compose.yml`, `.env.example`
