# Plan A — ปรับโครงสร้างโฟลเดอร์เป็น Monorepo มาตรฐาน Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้ายโปรเจกต์จาก layout แบบแบนที่ root ให้เป็น monorepo มาตรฐาน (`services/`, `infra/`, `data/`, `scripts/`, `docs/`) โดยที่ระบบยัง build, รัน และผ่านเทสต์ได้เหมือนเดิมทุกอย่าง

**Architecture:** ย้าย **เฉพาะ path ฝั่ง host** เท่านั้น path ภายใน container (`/app`, `/opt/spark-apps`, `/app/scripts`, `/stress_test`, `/etc/nginx/...`) คงเดิมทุกตัว โค้ดที่ resolve path จากตำแหน่งไฟล์ (เช่น `dynamic_rules.py` ที่ขึ้นไป `../../../spark`) จึงยังทำงานได้ เพราะ `services/api` กับ `services/spark` ยังเป็นโฟลเดอร์พี่น้องกันเหมือนเดิม การย้ายทำด้วย `mv` ของ filesystem แล้วจึง `git add -A` เพื่อให้ไฟล์ที่ถูก ignore (CSV runtime, `node_modules`) ย้ายตามไปด้วย และให้ git ตรวจจับเป็น rename

**Tech Stack:** Docker Compose, Git Bash (Windows), FastAPI/pytest (รันใน container), Vite/vitest

**Spec:** `docs/etl-review/2026-09-30-etl-system-review.md` (ข้อ 6.2 "ควรลด") + คำขอผู้ใช้: "ปรับโครงสร้างโฟลเดอร์ให้เป็นมาตรฐานกลาง" (เลือกแบบ Full monorepo `services/`)

**ลำดับแผน:** **A (แผนนี้)** → B (Extraction + Loading) → C (Transformation stages) → D (หลักฐานตามเกณฑ์) — แผน B, C, D อ้าง path ใหม่ของแผนนี้ทั้งหมด

## Global Constraints

- **ห้ามแก้เนื้อหาของระบบ Dashboard:** `ui/src/pages/Dashboard.jsx`, `ui/src/pages/Analytics.jsx`, `api/app/api/analytics.py`, `api/app/api/gold.py`, `spark/spark_gold_layer.py`, `grafana/**` และ service `kibana`/`grafana` ใน compose — ในแผนนี้**ย้ายโฟลเดอร์ได้** (ผู้ใช้เลือก monorepo แล้ว) แต่ห้ามแก้เนื้อหาไฟล์ ยกเว้นบรรทัด `volumes:` ของ grafana ที่ต้องชี้ path host ใหม่
- path ภายใน container ต้องคงเดิม: `/app`, `/app/scripts`, `/app/student_course_score_evaluation_dataset`, `/app/seed/student_course_score_evaluation_dataset.zip`, `/opt/spark-apps`, `/stress_test`, `/etc/nginx/nginx.conf`, `/etc/grafana/provisioning`
- host ไม่มี `fastapi`/`pyspark` ติดตั้ง — เทสต์ backend ต้องรันใน container ตามคำสั่งในหัวข้อ "คำสั่งมาตรฐาน"
- ใช้ Git Bash; คำสั่ง `docker compose exec/run` ต้องมี `MSYS_NO_PATHCONV=1` นำหน้า
- ข้อความ commit ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- ห้ามรัน `docker compose down -v` (จะลบข้อมูล HDFS/ES)

## Preconditions (ทำก่อน Task 1 — เป็นงานของผู้ใช้)

- [ ] working tree ต้องสะอาด: ตอนนี้ branch `bell` มีไฟล์แก้ค้างและไฟล์ใหม่ (`sample_data/`, `ui/public/`, `RunRecordsPanel.jsx` ฯลฯ) ผู้ใช้ต้อง commit งานนี้เองก่อน (`git status` ต้องว่าง)
- [ ] สร้าง tag ของ snapshot รายงาน เพื่อให้ citation `path:line` ใน `docs/whitebox-report` และ `docs/transform-report` อ้างถึงได้ตลอดไป:

```bash
git tag report-snapshot-2026-09-30
```

- [ ] จดจำนวนปัญหาของ citation ก่อนย้าย (ใช้เทียบใน Task 5 Step 7):

```bash
python -X utf8 docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md | grep -c "^BAD" || true
```

- [ ] จดสถานะ service ก่อนย้าย (ใช้เทียบใน Task 6 Step 3):

```bash
docker compose ps --format "table {{.Service}}\t{{.Status}}" > /tmp/services-before.txt; cat /tmp/services-before.txt
```

- [ ] แตก branch ใหม่:

```bash
git switch -c restructure/monorepo
```

## คำสั่งมาตรฐาน (ใช้ทุก Task หลัง Task 1)

API tests (รันใน image ของ api, mount โค้ดล่าสุด):

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest && python -m pytest -q -p no:cacheprovider tests"
```

UI tests:

```bash
cd services/ui && npm test && cd ../..
```

Compose validation:

```bash
docker compose config -q && echo COMPOSE_OK
```

## โครงสร้างเป้าหมาย

```
ETL/
├── README.md
├── docker-compose.yml
├── .env.example                 ← ใหม่ (Task 5)
├── start_system.bat             ← คงไว้ที่ root (entrypoint ตาม README)
├── test_data_source.bat         ← คงไว้ที่ root
├── services/
│   ├── api/                     ← api/
│   │   └── tests/               ← tests/
│   ├── spark/                   ← spark/
│   │   ├── tests/integration/   ← spark/tests/*
│   │   └── scripts/manual/      ← spark/test_*.py และสคริปต์ทดลองอื่น
│   └── ui/                      ← ui/
├── infra/
│   ├── nginx/  prometheus/  n8n/  grafana/
│   └── swarm/docker-swarm-ha.yml
├── data/
│   ├── evaluation/              ← student_course_score_evaluation_dataset* (ทั้งสองที่)
│   ├── samples/                 ← sample_data/, dummy_data/, *.xlsx, CSV ขนาดใหญ่ที่ root
│   ├── stress/                  ← "stress test/"
│   └── inputs/                  ← user_inputs/
├── scripts/
│   ├── ops/  windows/  evaluation/  dev/  maintenance/  tests/
└── docs/
    ├── requirements/  architecture/  specs/  reports/
    ├── etl-review/  whitebox-report/  transform-report/  superpowers/   (คงที่เดิม)
```

---

### Task 1: ย้าย `api/`, `spark/`, `ui/`, `tests/` เข้า `services/`

**Files:**
- Move: `api/` → `services/api/`, `spark/` → `services/spark/`, `ui/` → `services/ui/`, `tests/` → `services/api/tests/`
- Modify: `docker-compose.yml` (build context ของ spark-master, spark-worker, api, ui; volumes ที่ขึ้นต้น `./spark`, `./api`)
- Modify: `services/api/tests/test_upload_table.py:8-9`, `services/api/tests/test_whitebox_engine.py:7-8`, `services/api/tests/test_ai_context.py:4-5`
- Modify: `scripts/run_whitebox_evaluation.py:20-21`
- Modify: `.github/workflows/ci.yml:29,32`
- Delete: `pytest.ini` (root) → Create: `services/api/pytest.ini`
- Modify: `.gitignore` (path ที่ขึ้นต้น `api/`, `spark/`, `ui/`)

**Interfaces:**
- Produces: path `services/api`, `services/spark`, `services/ui`, `services/api/tests` ที่ทุก task ถัดไปใช้

- [ ] **Step 1: หยุด stack (ไม่ลบ volume) เพื่อปลด file lock บน Windows**

```bash
docker compose down
```

Expected: container ทั้งหมดหยุด, volume ยังอยู่ (`docker volume ls | grep elasticsearch_data` ยังเห็น)

- [ ] **Step 2: ย้ายโฟลเดอร์ด้วย filesystem mv (ย้ายไฟล์ ignored ไปด้วย)**

```bash
mkdir -p services
mv api services/api
mv spark services/spark
mv ui services/ui
mv tests services/api/tests
git add -A api spark ui tests services
git status --short | grep -v "^R" | head
```

Expected: บรรทัดที่เหลือ (ที่ไม่ใช่ `R` rename) ควรเป็นศูนย์หรือมีแค่ไฟล์ที่ git มองว่าแก้ไข+ย้าย

- [ ] **Step 3: แก้ `sys.path` ของเทสต์ API ทั้ง 3 ไฟล์**

ใน `services/api/tests/test_upload_table.py`, `test_whitebox_engine.py`, `test_ai_context.py` แทนที่สองบรรทัด:

```python
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "api"))
```

ด้วย:

```python
API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
```

คำสั่งเดียวทำทั้ง 3 ไฟล์:

```bash
for f in services/api/tests/test_upload_table.py services/api/tests/test_whitebox_engine.py services/api/tests/test_ai_context.py; do
  sed -i 's/^PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))$/API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))/; s/^sys.path.insert(0, os.path.join(PROJECT_ROOT, "api"))$/sys.path.insert(0, API_ROOT)/' "$f"
done
grep -n "API_ROOT\|PROJECT_ROOT" services/api/tests/*.py
```

Expected: ทุกไฟล์มี `API_ROOT` สองบรรทัด ไม่มี `PROJECT_ROOT` เหลือ

- [ ] **Step 4: ย้าย pytest.ini ไปอยู่กับ API**

```bash
git rm -q pytest.ini
cat > services/api/pytest.ini <<'EOF'
[pytest]
testpaths = tests
EOF
git add services/api/pytest.ini
```

- [ ] **Step 5: แก้ `scripts/run_whitebox_evaluation.py:20-21`**

แทนที่:

```python
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "api"))
```

ด้วย:

```python
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "services", "api"))
```

(ไฟล์นี้จะถูกย้ายไป `scripts/evaluation/` ใน Task 4 ซึ่งจะแก้ `PROJECT_ROOT` อีกครั้ง)

- [ ] **Step 6: แก้ `docker-compose.yml`**

ทำ 4 จุด (ใช้ Edit ทีละจุด):

1. service `spark-master` และ `spark-worker`: `context: ./spark` → `context: ./services/spark` และ `- ./spark:/opt/spark-apps` → `- ./services/spark:/opt/spark-apps`
2. service `api`: `context: ./api` → `context: ./services/api`, `- ./spark:/opt/spark-apps` → `- ./services/spark:/opt/spark-apps`, `- ./api/student_course_score_evaluation_dataset:/app/student_course_score_evaluation_dataset` → `- ./services/api/student_course_score_evaluation_dataset:/app/student_course_score_evaluation_dataset` (ชั่วคราว — Task 3 ย้ายอีกครั้ง)
3. service `ui`: `context: ./ui` → `context: ./services/ui`

ตรวจว่าไม่เหลือ path เก่า:

```bash
grep -nE "\./(api|spark|ui)(/|$|:)" docker-compose.yml
docker compose config -q && echo COMPOSE_OK
```

Expected: grep ไม่พบอะไร, พิมพ์ `COMPOSE_OK`

- [ ] **Step 7: แก้ CI `.github/workflows/ci.yml`**

บรรทัด py_compile เปลี่ยนเป็น:

```yaml
          python -m py_compile services/api/main.py services/api/seed_es.py services/spark/spark_quality_engine.py services/spark/streaming_job.py services/spark/reddit_stream.py
```

บรรทัด UI manifest เปลี่ยนเป็น:

```yaml
        run: test -f services/ui/package.json && test -f services/ui/package-lock.json
```

(`scripts/reddit_stream.py` ถูกลบใน Task 4 จึงชี้ไปที่ตัวใน spark ตั้งแต่ตอนนี้)

- [ ] **Step 8: แก้ `.gitignore`**

แทนที่ทุก entry ที่ขึ้นต้นด้วย `ui/`, `spark/`, `api/` ด้วย `services/ui/`, `services/spark/`, `services/api/`:

```bash
sed -i -E 's#^(!?)(ui|spark|api)/#\1services/\2/#' .gitignore
grep -nE "^(!?)(services/)?(ui|spark|api)/" .gitignore
```

Expected: ทุกบรรทัดที่พบขึ้นต้นด้วย `services/`

- [ ] **Step 9: Build และรันเทสต์**

```bash
docker compose build api spark-master ui
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest && python -m pytest -q -p no:cacheprovider tests"
cd services/ui && npm test && cd ../..
```

Expected: build สำเร็จทั้ง 3 image; pytest ผ่านทั้งหมด (จำนวนเทสต์เท่ากับก่อนย้าย); vitest ผ่าน

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(layout): move api, spark, ui and tests under services/

Container-internal paths are unchanged; only host paths in compose,
CI and test bootstrap moved.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ย้าย infra (`nginx`, `prometheus`, `n8n`, `grafana`, swarm) เข้า `infra/` และลบ `airflow/`

**Files:**
- Move: `nginx/` → `infra/nginx/`, `prometheus/` → `infra/prometheus/`, `n8n/` → `infra/n8n/`, `grafana/` → `infra/grafana/`, `docker-swarm-ha.yml` → `infra/swarm/docker-swarm-ha.yml`
- Delete: `airflow/` (ไม่มี service Airflow ใน compose ทั้งสองไฟล์ — review ข้อ 6.2)
- Modify: `docker-compose.yml` (volumes ของ nginx, grafana)
- Modify: `start_system.bat:65-100` (path `n8n\...`)
- Modify: `.gitignore` (`n8n/credentials.json`, `n8n/database.sqlite`)

- [ ] **Step 1: ตรวจว่า prometheus ถูกใช้จาก compose หรือไม่**

```bash
grep -n "prometheus" docker-compose.yml infra 2>/dev/null; grep -n "prometheus" docker-compose.yml
```

Expected: compose ไม่มี service prometheus (มีแค่ config ไฟล์) — ย้ายไปเก็บที่ infra/ ตามเดิม ไม่ต้องแก้ compose

- [ ] **Step 2: ย้ายและลบ**

```bash
mkdir -p infra/swarm
mv nginx infra/nginx
mv prometheus infra/prometheus
mv n8n infra/n8n
mv grafana infra/grafana
mv docker-swarm-ha.yml infra/swarm/docker-swarm-ha.yml
git rm -rq airflow
git add -A nginx prometheus n8n grafana docker-swarm-ha.yml infra
```

- [ ] **Step 3: แก้ volumes ใน `docker-compose.yml`**

- `- ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro` → `- ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro`
- `- ./grafana/provisioning:/etc/grafana/provisioning` → `- ./infra/grafana/provisioning:/etc/grafana/provisioning` (แก้เฉพาะบรรทัดนี้ของ service grafana)

```bash
grep -nE "\./(nginx|grafana|n8n|prometheus)/" docker-compose.yml
docker compose config -q && echo COMPOSE_OK
```

Expected: grep ไม่พบ, `COMPOSE_OK`

- [ ] **Step 4: แก้ `start_system.bat`**

แทนที่ทุก `n8n\credentials.json` ด้วย `infra\n8n\credentials.json`, `n8n/credentials.json` ด้วย `infra/n8n/credentials.json`, `n8n\ingestion_workflow.json` ด้วย `infra\n8n\ingestion_workflow.json`, `n8n/ingestion_workflow.json` ด้วย `infra/n8n/ingestion_workflow.json`:

```bash
sed -i 's#n8n\\credentials.json#infra\\n8n\\credentials.json#g; s#n8n/credentials.json#infra/n8n/credentials.json#g; s#n8n\\ingestion_workflow.json#infra\\n8n\\ingestion_workflow.json#g; s#n8n/ingestion_workflow.json#infra/n8n/ingestion_workflow.json#g' start_system.bat
grep -n "n8n" start_system.bat
```

Expected: ทุกบรรทัดที่อ้างไฟล์ขึ้นต้นด้วย `infra\n8n` หรือ `infra/n8n` (บรรทัดที่เป็นชื่อ container `sdoqap-n8n:` ไม่ต้องเปลี่ยน)

- [ ] **Step 5: แก้ `.gitignore`**

```bash
sed -i 's#^n8n/credentials.json#infra/n8n/credentials.json#; s#^n8n/database.sqlite#infra/n8n/database.sqlite#; /^airflow_logs\/$/d; /^airflow_plugins\/$/d' .gitignore
grep -n "n8n\|airflow" .gitignore
```

Expected: เหลือแค่ entry ที่ขึ้นต้น `infra/n8n/`

- [ ] **Step 6: ยืนยันว่า nginx และ grafana ขึ้นได้**

```bash
docker compose up -d elasticsearch api ui nginx grafana
sleep 60
docker compose ps nginx grafana
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:${NGINX_HOST_PORT:-80}/
```

Expected: `nginx` และ `grafana` สถานะ `Up (healthy)` หรือ `Up`; curl ได้ `200`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(layout): group nginx, prometheus, n8n, grafana and swarm under infra/; drop unused airflow DAGs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: รวมข้อมูลทั้งหมดไว้ใต้ `data/`

**Files:**
- Move: `services/api/student_course_score_evaluation_dataset/` → `data/evaluation/student_course_score_evaluation_dataset/` (โฟลเดอร์ runtime ที่ bind-mount เข้า api)
- Move: `student_course_score_evaluation_dataset.zip` → `data/evaluation/student_course_score_evaluation_dataset.zip`
- Move: `student_course_score_evaluation_dataset/README.md` (root) → `data/evaluation/README.md`; ลบโฟลเดอร์ root นั้นหลังย้าย (อีกไฟล์ในนั้นคือ `course_analytics_summary.xlsx` ที่ถูก ignore — ย้ายไปด้วย)
- Move: `sample_data/` → `data/samples/student_scores/`, `dummy_data/` → `data/samples/formats/`
- Move: `grocery_raw_sales_data.xlsx`, `grocery_raw_sales_data (1).xlsx`, `grocery-วิชยุตม์ แก้วเงิน-B6703844.xlsx` → `data/samples/grocery/`
- Move (untracked, ignored): `Churn_Modelling.csv`, `customer_churn_dataset-training-master.csv`, `global_ecommerce_sales.csv`, `dirty_course_scores_demo.csv` → `data/samples/`
- Move: `stress test/` → `data/stress/`
- Move: `user_inputs/` → `data/inputs/`
- Delete: `temp_input.txt`
- Modify: `docker-compose.yml` (api, n8n, postgres volumes), `test_data_source.bat`, `.gitignore`, `data/samples/student_scores/README.md`, `services/api/app/api/whitebox.py:72-78` (candidate paths สำหรับรันบน host)

- [ ] **Step 1: ย้ายไฟล์**

```bash
docker compose down
mkdir -p data/evaluation data/samples/grocery
mv services/api/student_course_score_evaluation_dataset data/evaluation/student_course_score_evaluation_dataset
mv student_course_score_evaluation_dataset.zip data/evaluation/
mv student_course_score_evaluation_dataset/README.md data/evaluation/README.md
mv student_course_score_evaluation_dataset/* data/evaluation/ 2>/dev/null; rmdir student_course_score_evaluation_dataset
mv sample_data data/samples/student_scores
mv dummy_data data/samples/formats
mv grocery_raw_sales_data.xlsx "grocery_raw_sales_data (1).xlsx" "grocery-วิชยุตม์ แก้วเงิน-B6703844.xlsx" data/samples/grocery/
mv Churn_Modelling.csv customer_churn_dataset-training-master.csv global_ecommerce_sales.csv dirty_course_scores_demo.csv data/samples/ 2>/dev/null
mv "stress test" data/stress
mv user_inputs data/inputs
git rm -q temp_input.txt
git add -A
ls data data/evaluation data/samples
```

Expected: `data/` มี `evaluation inputs samples stress`; `data/evaluation/student_course_score_evaluation_dataset/` มี `dirty_dataset.csv`, `ground_truth.csv`, `clean_dataset.csv`

- [ ] **Step 2: แก้ volumes ใน `docker-compose.yml`**

- service `api`:
  - `- ./services/api/student_course_score_evaluation_dataset:/app/student_course_score_evaluation_dataset` → `- ./data/evaluation/student_course_score_evaluation_dataset:/app/student_course_score_evaluation_dataset`
  - `- ./student_course_score_evaluation_dataset.zip:/app/seed/student_course_score_evaluation_dataset.zip:ro` → `- ./data/evaluation/student_course_score_evaluation_dataset.zip:/app/seed/student_course_score_evaluation_dataset.zip:ro`
- service `n8n`: `- ./stress test:/stress_test` → `- ./data/stress:/stress_test`
- service `postgres`:
  - `- "./stress test/import_sales.sql:/docker-entrypoint-initdb.d/import_sales.sql:ro"` → `- "./data/stress/import_sales.sql:/docker-entrypoint-initdb.d/import_sales.sql:ro"`
  - `- "./stress test/100000 Sales Records.csv:/tmp/sales_records.csv:ro"` → `- "./data/stress/100000 Sales Records.csv:/tmp/sales_records.csv:ro"`

```bash
grep -nE "stress test|\./student_course|services/api/student" docker-compose.yml
docker compose config -q && echo COMPOSE_OK
```

Expected: grep ไม่พบ, `COMPOSE_OK`

- [ ] **Step 3: เพิ่ม candidate path ของ dataset สำหรับรันบน host ใน `services/api/app/api/whitebox.py`**

ใน `_resolve_dataset_dir()` list `candidates` เพิ่มบรรทัดนี้เป็นตัวที่ 4 (ก่อน `"/app/student_course_score_evaluation_dataset"`):

```python
        os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "data", "evaluation", "student_course_score_evaluation_dataset")),
```

(`services/api/app/api/` ขึ้นไป 4 ระดับคือ root ของ repo) — ใน container ยังได้ `/app/student_course_score_evaluation_dataset` จาก bind mount เหมือนเดิม

- [ ] **Step 4: แก้ `test_data_source.bat`**

```bash
sed -i 's#user_inputs\\#data\\inputs\\#g; s#"user_inputs\\datasets"#"data\\inputs\\datasets"#g; s#"user_inputs\\apis"#"data\\inputs\\apis"#g' test_data_source.bat
grep -n "user_inputs\|data\\\\inputs" test_data_source.bat
```

Expected: ไม่เหลือ `user_inputs`; ทุกจุดเป็น `data\inputs\...`

- [ ] **Step 5: แก้ `.gitignore`**

```bash
sed -i 's#^user_inputs/datasets/\*#data/inputs/datasets/*#; s#^!user_inputs/datasets/README.md#!data/inputs/datasets/README.md#; s#^user_inputs/apis/\*#data/inputs/apis/*#; s#^!user_inputs/apis/README.md#!data/inputs/apis/README.md#; s#^dummy_data/$#data/samples/formats/*.csv#; s#^dummy_data/sample.csv#data/samples/formats/sample.csv#; s#^stress test/\*.csv#data/stress/*.csv#; s#^stress test/\*\*/\*.csv#data/stress/**/*.csv#; s#^!stress test/Olist#!data/stress/Olist#; s#^stress test/Olist#data/stress/Olist#; s#^api/student_course_score_evaluation_dataset/#data/evaluation/student_course_score_evaluation_dataset/#; s#^services/api/student_course_score_evaluation_dataset/#data/evaluation/student_course_score_evaluation_dataset/#; s#^student_course_score_evaluation_dataset.zip#data/evaluation/student_course_score_evaluation_dataset.zip#; s#^student_course_score_evaluation_dataset/course_analytics_summary.xlsx#data/evaluation/course_analytics_summary.xlsx#; s#^grocery_raw_sales_data (1).xlsx#data/samples/grocery/grocery_raw_sales_data (1).xlsx#; s#^grocery_raw_sales_data.xlsx#data/samples/grocery/grocery_raw_sales_data.xlsx#' .gitignore
grep -nE "user_inputs|dummy_data|stress test|^student_course|^grocery" .gitignore
```

Expected: grep ไม่พบอะไร

หมายเหตุ: บรรทัด `data/samples/formats/*.csv` แทน `dummy_data/` เดิมซึ่ง ignore ทั้งโฟลเดอร์ ทั้งที่ git ยัง track ไฟล์ในนั้นอยู่ (ไฟล์ที่ track แล้วไม่ถูกกระทบจาก ignore)

- [ ] **Step 6: แก้ path ใน `data/samples/student_scores/README.md`**

```bash
sed -i 's#python sample_data/generate_student_scores.py#python data/samples/student_scores/generate_student_scores.py#; s#`api/student_course_score_evaluation_dataset/dirty_dataset.csv`#`data/evaluation/student_course_score_evaluation_dataset/dirty_dataset.csv`#; s#`student_course_score_evaluation_dataset.zip`#`data/evaluation/student_course_score_evaluation_dataset.zip`#' data/samples/student_scores/README.md
grep -n "data/" data/samples/student_scores/README.md
```

และตรวจว่า generator เขียนผลลัพธ์ข้างตัวเอง (ไม่ได้ hardcode `sample_data/`):

```bash
grep -n "sample_data\|__file__" data/samples/student_scores/generate_student_scores.py
```

Expected: ใช้ `__file__` หรือไม่อ้าง `sample_data/`; ถ้าพบ `sample_data/` ให้แทนด้วย `os.path.dirname(os.path.abspath(__file__))`

- [ ] **Step 7: ยืนยันว่า api หาชุดข้อมูลเจอ และเทสต์ผ่าน**

```bash
docker compose up -d elasticsearch api
sleep 45
MSYS_NO_PATHCONV=1 docker compose exec -T api sh -c "ls /app/student_course_score_evaluation_dataset && ls -la /app/seed"
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest && python -m pytest -q -p no:cacheprovider tests"
```

Expected: เห็น `dirty_dataset.csv ground_truth.csv ...` และไฟล์ zip; pytest ผ่านทั้งหมด

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(layout): gather datasets, samples, stress data and user inputs under data/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: จัด `scripts/` และลบสคริปต์ที่ซ้ำกัน

**Files:**
- Move: `scripts/cleanup_failed_runs.sh`, `integration_test.sh`, `run_spark_checks.sh`, `system_health_check.sh`, `data_retention_cleanup.py` → `scripts/ops/`; `run_all_quality.sh` (root) → `scripts/ops/run_all_quality.sh`
- Move: `scripts/run_full_test.bat`, `scripts/start_platform.bat`, `full_test.ps1` (root), `run_quality_metrics.ps1` (root) → `scripts/windows/`
- Move: `scripts/run_whitebox_evaluation.py` → `scripts/evaluation/run_whitebox_evaluation.py`
- Move: `services/spark/test_grocery_sales.py`, `test_mbti_1M.py`, `test_semantic_cleaner_dsl.py`, `test_semantic_cleaner_v2.py`, `test_standardize_rule.py`, `stress_test_semantic_cleaner.py`, `setup_mbti_1m_test.py`, `update_rules_for_test.py`, `read_grocery.py`, `run_semantic_cleaner.py`, `run_all_quality.sh` → `services/spark/scripts/manual/`
- Move: `services/spark/tests/*` → `services/spark/tests/integration/`
- Delete: `scripts/alert_router.py`, `scripts/reddit_stream.py` (เหมือนกับตัวใน `services/spark/` ทุกบรรทัด)
- Modify: `services/api/app/api/system.py` (path สคริปต์ cleanup และ import alert_router)
- Modify: `.github/workflows/cron_cleanup.yml:16-17`, `test_data_source.bat:205`, `scripts/windows/full_test.ps1:31`, `scripts/maintenance/run_phase.bat:154`

- [ ] **Step 1: ยืนยันว่าไฟล์ซ้ำเหมือนกันจริงก่อนลบ**

```bash
cmp scripts/alert_router.py services/spark/alert_router.py && cmp scripts/reddit_stream.py services/spark/reddit_stream.py && echo IDENTICAL
```

Expected: `IDENTICAL` — ถ้าไม่เหมือน ให้หยุดและแจ้งผู้ใช้ ห้ามลบ

- [ ] **Step 2: ย้ายและลบ**

```bash
mkdir -p scripts/ops scripts/windows scripts/evaluation services/spark/scripts/manual services/spark/tests/integration
git mv scripts/cleanup_failed_runs.sh scripts/integration_test.sh scripts/run_spark_checks.sh scripts/system_health_check.sh scripts/data_retention_cleanup.py scripts/ops/
git mv run_all_quality.sh scripts/ops/run_all_quality.sh
git mv scripts/run_full_test.bat scripts/start_platform.bat scripts/windows/
git mv full_test.ps1 run_quality_metrics.ps1 scripts/windows/
git mv scripts/run_whitebox_evaluation.py scripts/evaluation/
cd services/spark
git mv test_grocery_sales.py test_mbti_1M.py test_semantic_cleaner_dsl.py test_semantic_cleaner_v2.py test_standardize_rule.py stress_test_semantic_cleaner.py setup_mbti_1m_test.py update_rules_for_test.py read_grocery.py run_semantic_cleaner.py run_all_quality.sh scripts/manual/
git mv tests/run_integration_test.py tests/test_pipeline.py tests/test_profile_and_ml.py tests/integration/
mv tests/benchmark_dataset.csv tests/integration/ 2>/dev/null
cd ../..
git rm -q scripts/alert_router.py scripts/reddit_stream.py
rm -rf scripts/__pycache__
```

- [ ] **Step 3: แก้ `sys.path` ของสคริปต์ manual ใน spark (ตอนนี้อยู่ลึกลงไป 2 ระดับ)**

```bash
cd services/spark/scripts/manual
sed -i 's#^spark_dir = os.path.dirname(os.path.abspath(__file__))$#spark_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))#' test_semantic_cleaner_dsl.py test_semantic_cleaner_v2.py stress_test_semantic_cleaner.py run_semantic_cleaner.py
sed -i 's#^sys.path.append(os.path.dirname(os.path.abspath(__file__)))$#sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))#' test_standardize_rule.py
grep -n "spark_dir =\|sys.path.append" *.py
cd ../../../..
```

Expected: ทุกบรรทัดมี `os.path.dirname(` ซ้อน 3 ชั้น

- [ ] **Step 4: แก้ `sys.path` ของ `services/spark/tests/integration/test_profile_and_ml.py:7` และ `run_integration_test.py:15`**

`test_profile_and_ml.py` แทนที่:

```python
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

ด้วย:

```python
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
```

`run_integration_test.py` แทนที่:

```python
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
```

ด้วย:

```python
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")))
```

และ `test_pipeline.py` ที่อ้าง `/opt/spark-apps/tests/benchmark_dataset.csv` ให้แก้เป็น `/opt/spark-apps/tests/integration/benchmark_dataset.csv`:

```bash
sed -i 's#/opt/spark-apps/tests/benchmark_dataset.csv#/opt/spark-apps/tests/integration/benchmark_dataset.csv#' services/spark/tests/integration/test_pipeline.py
```

- [ ] **Step 5: แก้ `scripts/evaluation/run_whitebox_evaluation.py` (ตอนนี้ลึกขึ้น 1 ระดับ)**

แทนที่:

```python
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "services", "api"))
```

ด้วย:

```python
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "services", "api"))
```

- [ ] **Step 6: แก้ `services/api/app/api/system.py` — path สคริปต์ cleanup**

แทนที่:

```python
            script_path = "/app/scripts/data_retention_cleanup.py"
            if not os.path.exists(script_path):
                script_path = "scripts/data_retention_cleanup.py"
```

ด้วย:

```python
            script_path = "/app/scripts/ops/data_retention_cleanup.py"
            if not os.path.exists(script_path):
                script_path = "scripts/ops/data_retention_cleanup.py"
```

- [ ] **Step 7: แก้ `system.py` — โหลด `alert_router` จากโค้ด spark (ไฟล์เดียวที่เหลือ)**

container `api` mount `./services/spark` ที่ `/opt/spark-apps` อยู่แล้ว เพิ่มฟังก์ชันนี้ไว้ใต้ import ด้านบนของ `system.py`:

```python
def _load_route_alert():
    """alert_router lives with the Spark code (single copy); the api container
    mounts it at /opt/spark-apps, local dev finds it at ../../../spark."""
    import sys
    candidates = [
        "/opt/spark-apps",
        os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "spark")),
    ]
    for c in candidates:
        if os.path.isfile(os.path.join(c, "alert_router.py")) and c not in sys.path:
            sys.path.insert(0, c)
            break
    from alert_router import route_alert
    return route_alert
```

แล้วแทนที่ทั้งสองจุดที่มี:

```python
                import sys
                sys.path.append(str(APP_ROOT / "scripts"))
                from scripts.alert_router import route_alert
                route_alert(title, message, severity)
```

(และตัวที่ย่อหน้าน้อยกว่าในบล็อก flat payload) ด้วย:

```python
                route_alert = _load_route_alert()
                route_alert(title, message, severity)
```

(รักษาระดับย่อหน้าตามบล็อกเดิม) ตรวจ:

```bash
grep -n "scripts.alert_router\|_load_route_alert" services/api/app/api/system.py
```

Expected: ไม่มี `scripts.alert_router`; `_load_route_alert` ปรากฏ 3 ครั้ง (นิยาม 1 + เรียก 2)

- [ ] **Step 8: แก้ผู้เรียก `reddit_stream.py` และสคริปต์ cleanup**

```bash
sed -i "s#-u scripts/reddit_stream.py#-u services/spark/reddit_stream.py#" test_data_source.bat
sed -i 's#python "$PSScriptRoot/scripts/reddit_stream.py"#python "$PSScriptRoot/../../services/spark/reddit_stream.py"#' scripts/windows/full_test.ps1
sed -i 's#chmod +x ./scripts/cleanup_failed_runs.sh#chmod +x ./scripts/ops/cleanup_failed_runs.sh#; s#^\(\s*\)./scripts/cleanup_failed_runs.sh#\1./scripts/ops/cleanup_failed_runs.sh#' .github/workflows/cron_cleanup.yml
sed -i 's#docker cp spark/users.csv#docker cp services/spark/users.csv#' scripts/maintenance/run_phase.bat
grep -rn "scripts/reddit_stream\|scripts/cleanup_failed\|spark/users.csv" test_data_source.bat scripts .github | grep -v "services/spark\|scripts/ops"
```

Expected: grep สุดท้ายไม่พบอะไร

- [ ] **Step 9: เขียนเทสต์ให้ `_load_route_alert`**

สร้าง `services/api/tests/test_system_alert_loader.py`:

```python
import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.system import _load_route_alert


def test_route_alert_is_loaded_from_spark_code():
    route_alert = _load_route_alert()
    assert callable(route_alert)
    assert route_alert.__module__ == "alert_router"
```

- [ ] **Step 10: รันเทสต์**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest && python -m pytest -q -p no:cacheprovider tests"
```

Expected: PASS ทั้งหมด รวม `test_route_alert_is_loaded_from_spark_code`

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(layout): organise scripts into ops/windows/evaluation, move Spark manual scripts and integration tests, drop duplicate alert_router and reddit_stream

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: จัด `docs/`, อัปเดต README, เพิ่ม `.env.example` และทำให้ตัวตรวจ citation อ่านจาก tag

**Files:**
- Move: `Pro-j SDOQAP.md`, `Evalution_Guildline.md` → `docs/requirements/`
- Move: `SDOQAP_Executive_Dashboard_Spec.md` → `docs/specs/` (ย้ายเอกสารเท่านั้น ไม่แก้เนื้อหา)
- Move: `quality_metrics.md`, `deployment_report.md`, `docs/BlackBox_to_WhiteBox_Report.md`, `docs/transform-report.zip` → `docs/reports/`
- Move: `data_segregation_flow.txt`, `schema_drift_governance.txt`, `sdoqap_architecture_square.txt`, `technology_stack_map.txt` → `docs/architecture/legacy-txt/` และ `docs/architecture.md`, `docs/data_flow.md`, `docs/data_management_process_design.md`, `docs/data_readiness_assessment.md`, `docs/data_segregation_flow.md`, `docs/schema_drift_governance.md`, `docs/service_map.md`, `docs/system_architecture_design.md`, `docs/system_breakdown.md`, `docs/technology_stack_map.md`, `docs/unified_architecture_design.md`, `docs/Context.md`, `docs/Vision.md`, `docs/main_tor.md` → `docs/architecture/`
- Rewrite: `docs/folder_structure.md` → `docs/architecture/folder_structure.md`
- Modify: `README.md`, `docs/whitebox-report/tools/check_citations.py`, `docs/whitebox-report/TEMPLATE.md` หรือ README ของรายงาน (หมายเหตุ tag)
- Create: `.env.example`
- ไม่ย้าย: `docs/whitebox-report/`, `docs/transform-report/`, `docs/etl-review/`, `docs/superpowers/`, `docs/requirements/` (มีอยู่แล้ว)

- [ ] **Step 1: ตรวจว่ามีเอกสารไหนอ้าง path ของไฟล์ที่จะย้ายบ้าง**

```bash
for f in architecture.md data_flow.md data_management_process_design.md data_readiness_assessment.md data_segregation_flow.md schema_drift_governance.md service_map.md system_architecture_design.md system_breakdown.md technology_stack_map.md unified_architecture_design.md Context.md Vision.md main_tor.md folder_structure.md BlackBox_to_WhiteBox_Report.md; do
  grep -rln "docs/$f" --include=*.md . | grep -v "docs/superpowers/plans/2026-09-2" | sed "s#^#$f <- #"
done
```

Expected: รายการไฟล์ที่ต้องแก้ลิงก์ (ถ้ามี) — จดไว้ใช้ใน Step 3

- [ ] **Step 2: ย้าย**

```bash
mkdir -p docs/requirements docs/specs docs/reports docs/architecture/legacy-txt
git mv "Pro-j SDOQAP.md" Evalution_Guildline.md docs/requirements/
git mv SDOQAP_Executive_Dashboard_Spec.md docs/specs/
git mv quality_metrics.md deployment_report.md docs/reports/
git mv docs/BlackBox_to_WhiteBox_Report.md docs/reports/
[ -f docs/transform-report.zip ] && mv docs/transform-report.zip docs/reports/
git mv data_segregation_flow.txt schema_drift_governance.txt sdoqap_architecture_square.txt technology_stack_map.txt docs/architecture/legacy-txt/
cd docs
git mv architecture.md data_flow.md data_management_process_design.md data_readiness_assessment.md data_segregation_flow.md schema_drift_governance.md service_map.md system_architecture_design.md system_breakdown.md technology_stack_map.md unified_architecture_design.md Context.md Vision.md main_tor.md folder_structure.md architecture/
cd ..
ls
```

Expected: root เหลือ `README.md docker-compose.yml start_system.bat test_data_source.bat data docs infra scripts services` และ dotfiles

- [ ] **Step 3: แก้ลิงก์เอกสารที่พบใน Step 1**

สำหรับแต่ละคู่ `<file> <- <referrer>` ที่พบ ให้แทน `docs/<file>` ด้วย `docs/architecture/<file>` (หรือ `docs/reports/BlackBox_to_WhiteBox_Report.md`) ในไฟล์ referrer นั้น ยกเว้นไฟล์ใน `docs/superpowers/plans/` ที่เป็นประวัติ (ไม่แก้):

```bash
sed -i 's#docs/BlackBox_to_WhiteBox_Report.md#docs/reports/BlackBox_to_WhiteBox_Report.md#g' README.md
```

ทำซ้ำคำสั่ง `sed -i 's#docs/<file>#docs/architecture/<file>#g' <referrer>` ตามรายการจาก Step 1

- [ ] **Step 4: แก้เทสต์ของตัวตรวจ citation ให้อ่านต้นฉบับจาก tag และเพิ่มเทสต์ใหม่**

`docs/whitebox-report/tools/test_check_citations.py` เป็นสคริปต์ธรรมดา (รันด้วย `python` จาก root ไม่ใช่ pytest) และตอนนี้อ่าน `api/app/api/whitebox.py` จาก working tree ซึ่งหลัง Task 1 ไม่มีแล้ว

(1) แทนที่บรรทัด import และ `src_lines`:

```python
from check_citations import check, check_excerpts  # noqa: E402

ROOT = Path.cwd()
SRC = "api/app/api/whitebox.py"
src_lines = (ROOT / SRC).read_text(encoding="utf-8").splitlines()
```

ด้วย:

```python
from check_citations import check, check_excerpts, read_source_lines  # noqa: E402

ROOT = Path.cwd()
REF = "report-snapshot-2026-09-30"
SRC = "api/app/api/whitebox.py"
src_lines = read_source_lines(SRC, ROOT, REF)
```

(2) ส่ง `REF` ให้ทุกการเรียก — แทนทุก `check_excerpts(md, ROOT)` ด้วย `check_excerpts(md, ROOT, REF)` และ `check(md, ROOT)` ด้วย `check(md, ROOT, REF)`:

```bash
f=docs/whitebox-report/tools/test_check_citations.py
sed -i 's/check_excerpts(md, ROOT)/check_excerpts(md, ROOT, REF)/g; s/check(md, ROOT)/check(md, ROOT, REF)/g' $f
```

(3) ใน `test_js_comment_header_is_recognised` แทนที่:

```python
    js_lines = (ROOT / js).read_text(encoding="utf-8").splitlines()
```

ด้วย:

```python
    js_lines = read_source_lines(js, ROOT, REF)
```

(4) เพิ่มสองเทสต์นี้ก่อนบล็อก `if __name__ == "__main__":`

```python
def test_missing_file_at_ref_is_reported():
    md = write_md("see `api/does_not_exist.py:1`")
    problems, count = check(md, ROOT, REF)
    assert count == 1 and len(problems) == 1 and "file not found" in problems[0], problems


def test_working_tree_mode_without_ref():
    md = write_md("see `docs/whitebox-report/tools/check_citations.py:1`")
    problems, count = check(md, ROOT)
    assert count == 1 and problems == [], problems
```

- [ ] **Step 5: รันเทสต์ให้ fail**

```bash
python docs/whitebox-report/tools/test_check_citations.py
```

Expected: FAIL — `ImportError: cannot import name 'read_source_lines' from 'check_citations'`

- [ ] **Step 6: เพิ่ม `read_source_lines` และ `--ref` ใน `docs/whitebox-report/tools/check_citations.py`**

(1) แทนที่ docstring บรรทัด Usage:

```
Usage: python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md
```

ด้วย:

```
Usage: python docs/whitebox-report/tools/check_citations.py [--ref report-snapshot-2026-09-30] docs/whitebox-report/*.md
```

(2) แทนที่บรรทัด import:

```python
import re
import sys
from pathlib import Path
```

ด้วย:

```python
import re
import subprocess
import sys
from pathlib import Path


def read_source_lines(rel_path, root, ref=None):
    """Lines of a cited file, from the working tree or from a git ref (None if absent).
    Report citations were written against tag report-snapshot-2026-09-30; after the
    monorepo move those paths only exist at that tag."""
    if ref:
        res = subprocess.run(["git", "show", f"{ref}:{rel_path}"], capture_output=True,
                             text=True, encoding="utf-8", errors="replace", check=False)
        return res.stdout.splitlines() if res.returncode == 0 else None
    target = root / rel_path
    if not target.is_file():
        return None
    return target.read_text(encoding="utf-8", errors="replace").splitlines()
```

(3) เปลี่ยน signature `def check_excerpts(md_path: Path, root: Path):` เป็น `def check_excerpts(md_path: Path, root: Path, ref=None):` แล้วแทนที่บล็อก:

```python
            target = root / rel
            if not target.is_file():
                problems.append(f"BAD {md_path}: excerpt {rel}:{start}-{end} — file not found")
            else:
                src = target.read_text(encoding="utf-8", errors="replace").splitlines()[start - 1:end]
```

ด้วย:

```python
            source = read_source_lines(rel, root, ref)
            if source is None:
                problems.append(f"BAD {md_path}: excerpt {rel}:{start}-{end} — file not found")
            else:
                src = source[start - 1:end]
```

(4) เปลี่ยน `def check(md_path: Path, root: Path):` เป็น `def check(md_path: Path, root: Path, ref=None):` แล้วแทนที่:

```python
        target = root / rel
        if not target.is_file():
            problems.append(f"BAD {md_path}: {match.group(0)} — file not found")
            continue
        total = len(target.read_text(encoding="utf-8", errors="replace").splitlines())
```

ด้วย:

```python
        source = read_source_lines(rel, root, ref)
        if source is None:
            problems.append(f"BAD {md_path}: {match.group(0)} — file not found")
            continue
        total = len(source)
```

(5) ใน `main` แทนที่:

```python
    root = Path.cwd()
    files = [Path(a) for a in argv[1:]]
```

ด้วย:

```python
    root = Path.cwd()
    args = list(argv[1:])
    ref = None
    if "--ref" in args:
        i = args.index("--ref")
        ref = args[i + 1]
        del args[i:i + 2]
    files = [Path(a) for a in args]
```

และแทนที่:

```python
        problems, count = check(f, root)
        e_problems, e_count = check_excerpts(f, root)
```

ด้วย:

```python
        problems, count = check(f, root, ref)
        e_problems, e_count = check_excerpts(f, root, ref)
```

- [ ] **Step 7: รันเทสต์และตัวตรวจจริงกับ tag**

```bash
python docs/whitebox-report/tools/test_check_citations.py
python -X utf8 docs/whitebox-report/tools/check_citations.py --ref report-snapshot-2026-09-30 docs/whitebox-report/*.md | tail -5
```

Expected: เทสต์พิมพ์ `PASS` ทุกตัวและ `N passed`; ตัวตรวจจริงอาจยังมี `BAD` อยู่บ้าง ถ้า tag ถูกสร้างหลังผู้ใช้ commit ไฟล์ที่แก้ค้างไว้ (เช่นบท 08 ที่ excerpt ของ `whitebox.py` ไม่ตรงอยู่แล้วก่อนเริ่มแผนนี้) — จำนวน `BAD` ต้องไม่มากกว่าตอนรันคำสั่งเดียวกันก่อน Task 1 ให้จดตัวเลขทั้งสองลงใน commit message

- [ ] **Step 8: เพิ่มหมายเหตุ tag ใน README ของรายงาน**

เพิ่มบรรทัดนี้ใต้หัวเรื่องแรกของ `docs/transform-report/README.md` และบนสุดของ `docs/whitebox-report/00-system-overview.md` (ใต้ H1):

```markdown
> citation แบบ `path:line` ในรายงานนี้อ้างถึงโค้ดที่ git tag `report-snapshot-2026-09-30` (ก่อนย้ายเป็น monorepo) ตรวจด้วย `python docs/whitebox-report/tools/check_citations.py --ref report-snapshot-2026-09-30 <ไฟล์>`
```

- [ ] **Step 9: สร้าง `.env.example`**

```bash
sed -E '/^[A-Z_]+=/ s/=.*/=/' .env > .env.example
cat >> .env.example <<'EOF'

# Elasticsearch superuser password (required; used by elasticsearch, api, spark)
ELASTIC_PASSWORD=
ELASTICSEARCH_PASSWORD=
EOF
grep -c "=" .env.example
git add .env.example
```

Expected: ทุก key มีแต่ชื่อ ไม่มีค่า — ตรวจด้วยตาว่าไม่มี secret หลุด (`grep -E "=[^ ]" .env.example` ต้องว่าง)

- [ ] **Step 10: เขียน `docs/architecture/folder_structure.md` ใหม่ทั้งไฟล์**

```markdown
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
| `scripts/ops/` | สคริปต์ปฏิบัติการ (cleanup, health check) | `/app/scripts/ops` (api) |
| `scripts/windows/` | สคริปต์ .bat/.ps1 เสริม | — |
| `scripts/evaluation/` | สคริปต์วัดผลตามเกณฑ์ประเมิน | — |
| `scripts/dev/`, `scripts/maintenance/`, `scripts/tests/` | เครื่องมือนักพัฒนา | — |
| `docs/architecture/` | เอกสารสถาปัตยกรรม | — |
| `docs/requirements/`, `docs/specs/`, `docs/reports/` | TOR/ข้อกำหนด, spec, รายงาน | — |
| `docs/whitebox-report/`, `docs/transform-report/`, `docs/etl-review/` | รายงานเชิงลึก (citation อ้าง tag `report-snapshot-2026-09-30`) | — |

Entry point ที่ root: `start_system.bat` (เปิดระบบ), `test_data_source.bat` (ทดสอบแหล่งข้อมูล), `docker-compose.yml`, `.env.example`
```

- [ ] **Step 11: แก้ README ให้ตรง path ใหม่**

```bash
sed -i 's#user_inputs/datasets/#data/inputs/datasets/#g; s#user_inputs/apis/#data/inputs/apis/#g; s#`n8n/credentials.json`#`infra/n8n/credentials.json`#; s#`n8n/database.sqlite`#`infra/n8n/database.sqlite`#; s#spark/schema_registry.json#services/spark/schema_registry.json#g; s#spark/rules_config.json#services/spark/rules_config.json#g; s#python spark/tests/run_integration_test.py#python services/spark/tests/integration/run_integration_test.py#' README.md
grep -nE "(^|[^/])(user_inputs|spark/|api/|ui/)" README.md | grep -v "services/\|/api/v1\|localhost"
```

แล้วเพิ่มหัวข้อนี้ท้าย README:

```markdown
## โครงสร้างโฟลเดอร์

ดู [docs/architecture/folder_structure.md](docs/architecture/folder_structure.md) — สรุป: `services/` (api, spark, ui), `infra/` (nginx, grafana, prometheus, n8n), `data/`, `scripts/`, `docs/`
```

Expected: grep ไม่พบ path เก่าที่ยังไม่ขึ้นต้น `services/`

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "docs(layout): organise docs into requirements/architecture/specs/reports, add .env.example, pin report citations to report-snapshot-2026-09-30

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ตรวจทั้งระบบหลังย้าย + ให้ CI รันเทสต์จริง

**Files:**
- Modify: `.github/workflows/ci.yml` (เพิ่ม job รัน pytest ของ API และ vitest ของ UI)

- [ ] **Step 1: เพิ่ม job ใน `.github/workflows/ci.yml`** (ต่อท้ายไฟล์ ระดับเดียวกับ `smoke-check`)

```yaml
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.10"
      - name: Install API dependencies
        working-directory: services/api
        run: |
          pip install -r requirements.txt pandas pyarrow openpyxl xlrd psycopg2-binary pytest
      - name: Run API tests
        working-directory: services/api
        env:
          SESSION_SECRET_KEY: ci-only-secret
          ADMIN_USERNAME: ci
          ADMIN_PASSWORD: ci
          ELASTICSEARCH_HOST: localhost
          ELASTICSEARCH_PORT: "9200"
          ELASTICSEARCH_USER: elastic
          ELASTICSEARCH_PASSWORD: ci
        run: python -m pytest -q

  ui-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install and test UI
        working-directory: services/ui
        env:
          PUPPETEER_SKIP_DOWNLOAD: "true"
        run: |
          npm ci
          npm test
```

- [ ] **Step 2: ตรวจว่าเทสต์ API ไม่ต้องพึ่ง ES จริง (CI ไม่มี ES)**

```bash
grep -n "get_es_client\|Elasticsearch(" services/api/tests/*.py
```

Expected: ไม่พบ — ถ้าพบ เทสต์ตัวนั้นต้องมี mock อยู่แล้ว ถ้าไม่มีให้ทำเครื่องหมาย `@pytest.mark.skipif(os.getenv("CI") == "true", reason="needs Elasticsearch")` และแจ้งในรายงาน task

- [ ] **Step 3: Build ทุก image และเปิดทั้ง stack**

```bash
docker compose build
docker compose up -d
sleep 150
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```

Expected: ทุก service ที่เคยขึ้นได้ก่อนย้ายต้องขึ้นได้ (เทียบกับ `docker compose ps` ก่อนเริ่ม Task 1); ไม่มี `Restarting`

- [ ] **Step 4: Smoke test เส้นทาง ETL จริงหลังย้าย**

```bash
KEY=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv INGEST_SERVICE_KEY | tr -d '\r')
curl -s -X POST http://localhost:${NGINX_HOST_PORT:-80}/api/v1/pipeline/ingest/csv \
  -H "X-Service-Key: $KEY" \
  -F "table_name=restructure_smoke" \
  -F "file=@data/samples/student_scores/student_scores_sample.csv"
echo
sleep 120
curl -s "http://localhost:${NGINX_HOST_PORT:-80}/api/v1/quality/restructure_smoke" | head -c 400; echo
```

Expected: ครั้งแรกได้ `"status":"success"`; หลังรอได้เอกสาร quality run ของ `restructure_smoke` อย่างน้อย 1 รายการ (พิสูจน์ว่า api → HDFS → daemon → Spark → ES ยังต่อกันครบ)

- [ ] **Step 5: เปิดหน้าเว็บ**

เปิด `http://localhost` → login → ตรวจว่าหน้า Data Ingestion, Jobs & Pipelines, Workspace Exports, Audit Trail โหลดได้ ไม่มี error ใน console (ไม่ต้องทดสอบหน้า Dashboards แค่ยืนยันว่าโหลดขึ้น)

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run API pytest and UI vitest on every push

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- ครอบคลุมข้อ 6.2 ของรีวิว: ไฟล์ซ้ำ (Task 4), airflow (Task 2), ไฟล์รกที่ root (Task 3, 5), สคริปต์ทดลองใน spark (Task 4) — ส่วน compose profiles (Kafka/Ollama/pgadmin) อยู่ใน Plan D Task 5 เพราะเปลี่ยนพฤติกรรมการเปิดระบบ ไม่ใช่แค่ย้ายไฟล์
- `semantic_cleaner` v1 ยังไม่ลบในแผนนี้ (ลบใน Plan C Task 5 พร้อม `SemanticMatcher`)
