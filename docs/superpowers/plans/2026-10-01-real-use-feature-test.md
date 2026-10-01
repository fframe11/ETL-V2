# Real-Use Feature Test Plan (SDOQAP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทดสอบการใช้งานจริงของทุก feature ใน SDOQAP บน stack ที่รันอยู่ (ไม่ใช้ mock) แล้วได้รายงานผลพร้อมหลักฐานที่ตรวจซ้ำได้

**Architecture:** เทสแบบ black-box ผ่านทางเข้าจริง 3 ทาง (HTTP ผ่าน nginx, UI ในเบราว์เซอร์, และ container CLI) แล้วยืนยันผลที่ "ปลายทางจริง" คือ HDFS, Elasticsearch และ Postgres ไม่ใช่แค่ response ของ API ใช้ helper เล็กๆ ใน `scripts/qa/lib.sh` ให้ทุก step สั้นและรันซ้ำได้ ผลทุกข้อบันทึกลงรายงานเดียว

**Tech Stack:** bash (Git Bash), curl, docker CLI, python 3, pytest, vitest, เบราว์เซอร์ (built-in browser pane หรือ Chrome)

**Spec:** ไม่มี spec แยก ใช้ feature inventory จากโค้ด ([`services/api/app/api/*.py`](../../../services/api/app/api), [`services/ui/src/config/pages.js`](../../../services/ui/src/config/pages.js), [`infra/n8n/ingestion_workflow.json`](../../../infra/n8n/ingestion_workflow.json), [`docker-compose.yml`](../../../docker-compose.yml)) และ [`README.md`](../../../README.md) เป็นเกณฑ์ตัดสิน

## Global Constraints

- **ทำแผน [`2026-10-01-api-route-completeness.md`](2026-10-01-api-route-completeness.md) ให้จบก่อนเริ่มแผนนี้** (แก้ route ที่ขาด, เติมคีย์ของผู้เรียก n8n/Grafana, จัดการคีย์ LLM และสร้าง `scripts/qa/route_coverage.py` ที่ Task 14B ใช้)
- Stack ต้องรันอยู่แล้ว (`docker compose ps`) UI+API ที่ `http://localhost` (nginx :80) API ตรงที่ `http://localhost:8002` Grafana `:3002` Kibana `:5601` n8n `:5678` pgAdmin `:5050`
- **ต้องเรียกครบทุกเส้น API (94 เส้น: method + path; 93 เส้นเดิม + alias `GET /api/v1/gold/schema-drift` ที่แผน api-route-completeness เพิ่ม)** helper `api`/`apij`/`code`/`anon`/`direct` บันทึกทุกคำเรียกลง `docs/testing/evidence/route-calls.log` คำเรียกด้วย `curl` ตรงไม่ถูกนับ ดังนั้นทุกเส้นต้องถูกเรียกผ่าน helper อย่างน้อยหนึ่งครั้ง Task 14B ตรวจด้วย `route_coverage.py`
- **ห้าม** `docker compose down -v`, ห้ามลบข้อมูลที่ไม่ได้สร้างเอง ตารางทดสอบทั้งหมดต้องขึ้นต้นด้วย `qa_` และลบได้เฉพาะตาราง `qa_*`
- ทุก step ที่รันคำสั่ง bash เริ่มด้วย `source scripts/qa/lib.sh` (แต่ละคำสั่งเป็น shell ใหม่)
- Credential อ่านจาก `.env` ผ่าน `envval NAME` เท่านั้น ห้ามพิมพ์ลงรายงานหรือ evidence ไฟล์ evidence ที่อาจมี URL พร้อมรหัสต้องผ่าน `redact`
- ผลแต่ละข้อเป็น `PASS` / `FAIL` / `SKIP` เท่านั้น ถ้าไม่ตรง Expected ให้ลง `FAIL` พร้อมหลักฐาน **ห้ามแก้ Expected ให้ตรงกับผลจริง** และ **ห้ามแก้บั๊กในแผนนี้** ให้ลงในหัวข้อ Findings ของรายงานแล้วแยกไปแก้ทีหลัง
- `SKIP` ได้เฉพาะเมื่อข้อกำหนดภายนอกไม่มี (ไม่มีอินเทอร์เน็ต, ไม่ได้เปิด profile) และต้องเขียนเหตุผล **ไม่มีคีย์ไม่ใช่เหตุผลให้ SKIP:** ถ้าขาด secret ภายในให้รัน `python scripts/dev/ensure_env_keys.py` ถ้าขาด Groq key ให้กลับไปทำ Task 8 Step 1 ของแผน api-route-completeness (เจ้าของระบบสร้างคีย์เอง agent ห้ามสร้างบัญชีหรือจับค่าคีย์) จะ SKIP ส่วน LLM ได้ก็ต่อเมื่อเจ้าของยืนยันว่าไม่ใช้ Groq
- Commit message ไม่ต้องใส่ attribution line ใดๆ
- IDs ของ run: `QUEUED → RUNNING → SUCCEEDED | FAILED | TRIGGER_FAILED` (จาก `services/api/app/api/run_registry.py`)

## Feature Coverage Matrix

| Feature | ทางเข้า | Task |
|---|---|---|
| Baseline: suites อัตโนมัติ, สถานะ container | pytest, vitest, compose | 0 |
| Login/Logout/session, route ป้องกัน, webhook secret, service key | `/api/v1/auth/*` | 1 |
| Ingest ไฟล์ CSV/Excel, checksum ซ้ำ, guard, concurrency | `POST /pipeline/ingest/csv` | 2 |
| Ingest REST API + allowlist/SSRF guard | `POST /pipeline/ingest/api` | 3 |
| Ingest RDBMS (read-only SQL) | `POST /pipeline/ingest/rdbms` | 4 |
| Stream Reddit→Kafka→Spark Streaming | `/pipeline/ingest/reddit*` | 5 |
| Rules config, column profiler, AI advisor, standardization queue | `/api/v1/rules/*`, `/standardize/*` | 6 |
| Pipeline runs, detail, acknowledge, retry, quality logs, 3 โซน | `/pipeline`, `/quality` | 7 |
| Schema drift + catalog approve/reject | `/api/v1/schema/*` | 8 |
| Workspace Exports + gold export | `/api/v1/export/*` | 9 |
| Dashboards, Analytics, Gold, Lineage, Trust-check | `/kpi`, `/executive`, `/analytics/*`, `/gold/*`, `/lineage/*` | 10 |
| Audit Trail (White-box engine) + multi-table | `/api/v1/whitebox/*` | 11 |
| Ops: settings, alert webhook, remediation, Grafana, Kibana, n8n, retention | `/system/*`, Grafana, n8n | 12 |
| UI walkthrough ทุกหน้า | เบราว์เซอร์ | 13 |
| Resilience (container หยุด), scale smoke | docker, benchmark | 14 |
| เส้น API ที่ task อื่นไม่ได้เรียก + ประตูตรวจว่าเรียกครบ 94 เส้น | `/`, `/health*`, `/pipeline/{run_id}`, `/schema/proposals/create`, `/standardize/*`, `/whitebox/*`, `route_coverage.py` | 14B |
| Cleanup + รายงานสรุป | — | 15 |

## File Structure

- Create: `scripts/qa/lib.sh` — helper (login, api, es, wait_run, record) ใช้ร่วมทุก task และบันทึกทุกคำเรียกลง `route-calls.log`
- Create: `docs/testing/2026-10-01-real-use-test-report.md` — ตารางผล + Findings (เติมทีละ task)
- Create: `docs/testing/evidence/*` — output ดิบของแต่ละข้อ (ไม่มี credential) รวม `route-calls.log` และ `route-coverage.md`
- ใช้ (ไม่สร้าง): `scripts/qa/route_coverage.py`, `scripts/dev/ensure_env_keys.py` จากแผน api-route-completeness
- ไม่แก้โค้ดของระบบเลย

---

### Task 0: Helper, baseline และ suites อัตโนมัติ

**Files:**
- Create: `scripts/qa/lib.sh`
- Create: `docs/testing/2026-10-01-real-use-test-report.md`

**Interfaces:**
- Produces: ฟังก์ชัน `envval NAME`, `redact`, `qa_set K V`, `qa_get K`, `jget KEY` (อ่าน JSON จาก stdin), `qa_login`, `api METHOD PATH [curl args]` (พิมพ์ body + `HTTP <code>`), `apij` (body อย่างเดียว), `code METHOD PATH [curl args]` (พิมพ์เฉพาะ status code, ใช้ session), `anon METHOD PATH [curl args]` (status code, ไม่ใช้ session), `direct METHOD PATH [curl args]` (status code, ยิงตรงที่พอร์ตของ API ไม่ผ่าน nginx), `es PATH [json body]`, `wait_run INGEST_ID [max_sec]`, `last_quality TABLE`, `qa_record ID FEATURE RESULT NOTE`
- ทุกคำเรียกผ่าน `api`/`apij`/`code`/`anon`/`direct`/`qa_login` ถูกต่อท้ายลง `$CALLS` หนึ่งบรรทัด รูปแบบ `METHOD PATH STATUS` (ตัด query string) ซึ่งเป็น input ของ `scripts/qa/route_coverage.py`
- `docker` ถูกห่อด้วยฟังก์ชันที่ตั้ง `MSYS_NO_PATHCONV=1` เพื่อไม่ให้ Git Bash แปลง path ของ container (เช่น `/data/raw`) เป็น path ของ Windows
- Produces ตัวแปร: `ROOT`, `BASE`, `API_DIRECT`, `QA_TMP`, `EVID`, `REPORT`, `CALLS`

- [ ] **Step 1: เขียน helper**

```bash
mkdir -p scripts/qa docs/testing/evidence
cat > scripts/qa/lib.sh <<'EOF'
#!/usr/bin/env bash
# Helpers for docs/superpowers/plans/2026-10-01-real-use-feature-test.md
# Usage: source scripts/qa/lib.sh   (from anywhere inside the repo)
ROOT="$(git rev-parse --show-toplevel)"
BASE="${BASE:-http://localhost}"
QA_TMP="${TMPDIR:-/tmp}/qa"; mkdir -p "$QA_TMP"
# Git Bash: native curl/python cannot open /tmp/... inside "-F file=@..."; use C:/... instead.
command -v cygpath >/dev/null 2>&1 && QA_TMP="$(cygpath -m "$QA_TMP")"
JAR="$QA_TMP/session.jar"
EVID="$ROOT/docs/testing/evidence"; mkdir -p "$EVID"
REPORT="$ROOT/docs/testing/2026-10-01-real-use-test-report.md"
CALLS="$EVID/route-calls.log"   # one line per API call: METHOD PATH STATUS (input of route_coverage.py)

# Git Bash would rewrite container paths such as /data/raw into C:/Program Files/Git/data/raw.
docker() { MSYS_NO_PATHCONV=1 command docker "$@"; }

envval() { grep -E "^$1=" "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '\r'; }
redact() { sed -E 's#(://[^:/@ ]+:)[^@/ ]+@#\1***@#g'; }
qa_set() { printf '%s' "$2" > "$QA_TMP/$1"; }
qa_get() { cat "$QA_TMP/$1"; }
jget()   { python -c "import sys,json; d=json.load(sys.stdin); print(d.get(sys.argv[1],''))" "$1"; }
API_DIRECT="${API_DIRECT:-http://localhost:$(envval API_PORT)}"   # the API port itself, not nginx

_log() { printf '%s %s %s\n' "$1" "${2%%\?*}" "$3" >> "$CALLS"; }
_req() { # _req BASE JAR-or-"" METHOD PATH [curl args] -> sets _BODY and _CODE, logs the call
  local base="$1" jar="$2" m="$3" p="$4" out; shift 4
  out=$(curl -s ${jar:+-b "$jar"} -X "$m" -w '\n%{http_code}' "$@" "$base$p")
  _CODE="${out##*$'\n'}"; _BODY="${out%$'\n'*}"
  _log "$m" "$p" "$_CODE"
}

qa_login() {
  local body c
  body=$(printf '{"username":"%s","password":"%s"}' "$(envval ADMIN_USERNAME)" "$(envval ADMIN_PASSWORD)")
  c=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -H 'Content-Type: application/json' -d "$body" "$BASE/api/v1/auth/login")
  _log POST /api/v1/auth/login "$c"; echo "login HTTP $c"
}
api()    { _req "$BASE" "$JAR" "$@"; printf '%s\nHTTP %s\n' "$_BODY" "$_CODE"; }
apij()   { _req "$BASE" "$JAR" "$@"; printf '%s' "$_BODY"; }
code()   { _req "$BASE" "$JAR" "$@" -o /dev/null; printf '%s' "$_CODE"; }
anon()   { _req "$BASE" "" "$@" -o /dev/null; printf '%s' "$_CODE"; }
direct() { _req "$API_DIRECT" "" "$@" -o /dev/null; printf '%s' "$_CODE"; }

es() { # es PATH [json-body]
  if [ $# -gt 1 ]; then
    docker exec -i sdoqap-elasticsearch sh -c "curl -s -u elastic:\$ELASTIC_PASSWORD -H 'Content-Type: application/json' 'localhost:9200$1' -d @-" <<<"$2"
  else
    docker exec sdoqap-elasticsearch sh -c "curl -s -u elastic:\$ELASTIC_PASSWORD 'localhost:9200$1'"
  fi
}

wait_run() { # wait_run INGEST_ID [max_seconds]
  local id="$1" max="${2:-300}" t=0 state=""
  while [ "$t" -lt "$max" ]; do
    state=$(apij GET "/api/v1/pipeline/runs/$id" | jget state)
    case "$state" in SUCCEEDED|FAILED|TRIGGER_FAILED) echo "$id -> $state after ${t}s"; return 0;; esac
    sleep 5; t=$((t+5))
  done
  echo "$id still '$state' after ${max}s"; return 1
}

last_quality() { # last_quality TABLE
  es "/sdoqap_quality_runs/_search" "{\"size\":1,\"sort\":[{\"timestamp\":\"desc\"}],\"query\":{\"term\":{\"table_name.keyword\":\"$1\"}}}" \
  | python -c "import sys,json; h=json.load(sys.stdin)['hits']['hits']; s=h[0]['_source'] if h else {}; print({k:s.get(k) for k in ('run_id','table_name','total_records','clean_records','quarantined_records','quality_score')})"
}

qa_record() { # qa_record ID "feature" PASS|FAIL|SKIP "note"
  printf '| %s | %s | %s | %s |\n' "$1" "$2" "$3" "$4" >> "$REPORT"
}
EOF
```

- [ ] **Step 2: สร้างรายงานเปล่า**

```bash
cat > docs/testing/2026-10-01-real-use-test-report.md <<'EOF'
# รายงานทดสอบการใช้งานจริง SDOQAP (2026-10-01)

แผน: `docs/superpowers/plans/2026-10-01-real-use-feature-test.md` · หลักฐาน: `docs/testing/evidence/`

## ผลรายข้อ

| ID | Feature | ผล | หมายเหตุ / หลักฐาน |
|---|---|---|---|
EOF
```

- [ ] **Step 3: ทดสอบ helper (ต้องผ่านก่อนไปต่อ)**

```bash
source scripts/qa/lib.sh
qa_login
api GET /api/v1/auth/me
```
Expected: `login HTTP 200` แล้ว `{"username":"admin"}` ตามด้วย `HTTP 200`

- [ ] **Step 4: สถานะ container และ service**

```bash
source scripts/qa/lib.sh
docker compose ps --format '{{.Name}} {{.Status}}' | sort
curl -s "$BASE/api/v1/services/status" | redact | python -c "import sys,json; [print(k, v['status']) for k,v in json.load(sys.stdin).items()]"
```
Expected: ทุก container `Up`/`healthy` (ollama ต้อง `healthy` หลัง Task 8 Step 8 ของแผน api-route-completeness ถ้ายัง `unhealthy` ให้ลง FAIL พร้อม health log) และทุก service ในรายการเป็น `online` ยกเว้นตัวที่ profile ปิดอยู่

- [ ] **Step 5: รัน suites อัตโนมัติ (ตามที่ CI รัน)**

เครื่อง host ไม่มี fastapi จึงรัน API test ใน container (แบบเดียวกับแผนก่อนหน้า) ส่วน test ของสคริปต์รันบนเครื่อง

```bash
source scripts/qa/lib.sh
docker compose config -q && echo COMPOSE_OK
docker compose run --rm --no-deps -v "$ROOT/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests" 2>&1 | tail -5 | tee "$EVID/t0-api-pytest.txt"
( cd services/ui && npm test ) 2>&1 | tail -8 | tee "$EVID/t0-ui-vitest.txt"
( cd scripts/evaluation && python -m pytest -q tests ) 2>&1 | tail -5 | tee "$EVID/t0-eval-pytest.txt"
python -m pytest -q scripts/qa/tests scripts/dev/tests 2>&1 | tail -3 | tee "$EVID/t0-scripts-pytest.txt"
docker compose exec -T -w /opt/spark-apps spark-master sh -c "python -m pip install -q pytest && python -m pytest -q -p no:cacheprovider tests/unit" 2>&1 | tail -8 | tee "$EVID/t0-spark-unit.txt"
python scripts/dev/ensure_env_keys.py --check
```
Expected: `COMPOSE_OK`; API, UI, eval และ scripts pytest ผ่านหมด (ไม่มี `failed`; scripts ได้ `18 passed`); Spark unit ผ่าน (ถ้า `import pyspark` ไม่เจอ ให้เติม `PYTHONPATH=/opt/bitnami/spark/python:$(ls /opt/bitnami/spark/python/lib/py4j-*.zip)` หน้า `python -m pytest` ตามแผน 2026-09-30-b ถ้ายังรันไม่ได้ให้ลง `SKIP` พร้อมเหตุผล ไม่ใช่ `PASS`); `ensure_env_keys --check` ขึ้น `ok` ทุกบรรทัด (ถ้า `GROQ_API_KEY` ขึ้น `MISSING` ดูข้อ SKIP ใน Global Constraints)

- [ ] **Step 6: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T0.1 "helper login ใช้งานได้" PASS "login HTTP 200"
qa_record T0.2 "container + service status" PASS "evidence: Step 4 output"
qa_record T0.3 "suites อัตโนมัติ (API/UI/eval/spark)" PASS "t0-*.txt"
git add scripts/qa docs/testing && git commit -m "test(qa): helper library, report skeleton and baseline results"
```
(ถ้าข้อใดไม่ผ่านจริงให้แก้ค่าในคำสั่ง `qa_record` เป็น `FAIL`/`SKIP` ก่อนรัน)

---

### Task 1: Auth, session และการป้องกัน route

**Files:** ไม่สร้างไฟล์โค้ด (ผลลง report)

**Interfaces:**
- Consumes: Task 0 helpers
- Produces: cookie session ใน `$JAR` ที่ task อื่นใช้

- [ ] **Step 1: login ผิด**

```bash
source scripts/qa/lib.sh
curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong-password"}' "$BASE/api/v1/auth/login"
```
Expected: `401`

- [ ] **Step 2: route ที่ต้อง login ปฏิเสธเมื่อไม่มี cookie**

```bash
source scripts/qa/lib.sh
for r in "GET /api/v1/auth/me" "POST /api/v1/gold/rebuild" "POST /api/v1/pipeline/ingest/reddit" "PUT /api/v1/rules/qa_x" "POST /api/v1/schema/proposals/approve-all" "POST /api/v1/system/cleanup" "GET /api/v1/whitebox/run-all"; do
  set -- $r; printf '%-55s %s\n' "$r" "$(anon "$1" "$2")"
done
```
Expected: ทุกบรรทัด `401` (ยกเว้น `GET /whitebox/run-all` ที่อาจเป็น 200 เพราะ GET ไม่มี `require_session` ให้จดผลจริงไว้ใน note)

- [ ] **Step 3: cookie ปลอม/แก้ลายเซ็น ถูกปฏิเสธ**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
TOKEN=$(grep sdoqap_session "$JAR" | awk '{print $NF}')
curl -s -o /dev/null -w 'valid   %{http_code}\n' -H "Cookie: sdoqap_session=$TOKEN" "$BASE/api/v1/auth/me"
curl -s -o /dev/null -w 'tampered %{http_code}\n' -H "Cookie: sdoqap_session=${TOKEN%?}X" "$BASE/api/v1/auth/me"
```
Expected: `valid 200`, `tampered 401`

- [ ] **Step 4: logout ล้าง session**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
api POST /api/v1/auth/logout
curl -s -o /dev/null -w 'after logout (cookie jar replayed) %{http_code}\n' -b "$JAR" "$BASE/api/v1/auth/me"
```
Expected: logout `HTTP 200`; ข้อความสุดท้าย `401` (เบราว์เซอร์จริงจะลบ cookie ให้; jar ของ curl รับ `Set-Cookie` ลบค่าด้วย `-b` อย่างเดียวไม่อัปเดต ถ้าได้ 200 ให้ทดสอบซ้ำด้วย `-c "$JAR"` ตอน logout แล้วถึงค่อยตัดสิน)

- [ ] **Step 5: Webhook secret และ service key**

```bash
source scripts/qa/lib.sh
P='{"title":"qa-alert","message":"qa check","severity":"info"}'
echo "no secret   : $(anon POST /api/v1/system/alert -H 'Content-Type: application/json' -d "$P")"
echo "wrong secret: $(anon POST /api/v1/system/alert -H 'Content-Type: application/json' -H 'X-Webhook-Secret: nope' -d "$P")"
echo "good secret : $(anon POST /api/v1/system/alert -H 'Content-Type: application/json' -H "X-Webhook-Secret: $(envval ALERT_WEBHOOK_SECRET)" -d "$P")"
echo "ingest no auth: $(anon POST /api/v1/pipeline/ingest/api -H 'Content-Type: application/json' -d '{"table_name":"qa_x","url":"https://data.go.th/x"}')"
echo "ingest bad key: $(anon POST /api/v1/pipeline/ingest/api -H 'Content-Type: application/json' -H 'X-Service-Key: nope' -d '{"table_name":"qa_x","url":"https://data.go.th/x"}')"
```
Expected: `no secret` และ `wrong secret` เป็น 401 หรือ 403, `good secret` เป็น `200`, `ingest no auth` และ `ingest bad key` เป็น `401`

- [ ] **Step 6: endpoint สาธารณะต้องไม่รั่ว credential**

```bash
source scripts/qa/lib.sh
curl -s "$BASE/api/v1/services/status" | grep -c -E '://[^/" ]+:[^@/" ]+@' | tee "$EVID/t1-status-credential-count.txt"
```
Expected: `0` (ไม่มี URL ที่ฝัง `user:password@`) **ที่เห็นตอนเขียนแผน:** endpoint นี้คืน `http://elastic:<password>@localhost:9200` โดยไม่ต้อง login ดังนั้นคาดว่าจะได้ `FAIL` ให้ลงเป็น Finding F-1 (อย่าแก้ในแผนนี้)

- [ ] **Step 7: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T1.1 "login ผิด -> 401" PASS "-"
qa_record T1.2 "route ป้องกันปฏิเสธเมื่อไม่มี cookie" PASS "-"
qa_record T1.3 "cookie ปลอม -> 401" PASS "-"
qa_record T1.4 "logout ล้าง session" PASS "-"
qa_record T1.5 "webhook secret / service key" PASS "-"
qa_record T1.6 "services/status ไม่รั่ว credential" FAIL "F-1: URL ของ Elasticsearch มีรหัสผ่านฝังอยู่"
git add docs/testing && git commit -m "test(qa): task 1 auth results"
```
(แก้ค่า PASS/FAIL ให้ตรงผลจริงทุกข้อก่อนรัน)

---

### Task 2: Ingestion จากไฟล์ (CSV/Excel), ซ้ำ, guard, concurrency

**Files:** ใช้ `data/samples/student_scores/student_scores_sample.csv` (1,030 แถว, มี answer key)

**Interfaces:**
- Consumes: `qa_login`, `api`, `apij`, `wait_run`, `last_quality`, `qa_set/qa_get`
- Produces: ingest id ของ `qa_scores` (`qa_get scores_id`) ใช้ใน Task 7 และ 8

- [ ] **Step 1: อัปโหลด CSV ผ่านเส้นทางจริง**

```bash
source scripts/qa/lib.sh
qa_login
RES=$(apij POST /api/v1/pipeline/ingest/csv -F table_name=qa_scores -F "file=@$ROOT/data/samples/student_scores/student_scores_sample.csv")
echo "$RES"
qa_set scores_id "$(echo "$RES" | jget ingest_id)"
```
Expected: JSON มี `"status":"queued"`, `"run_state":"QUEUED"`, `ingest_id` ไม่ว่าง (HTTP 202)

- [ ] **Step 2: รอจน run จบ**

```bash
source scripts/qa/lib.sh
wait_run "$(qa_get scores_id)" 600
```
Expected: `... -> SUCCEEDED` (ถ้า `FAILED` ให้เก็บ `docker compose logs --tail 100 spark-master` ลง `$EVID/t2-failed-run.txt` แล้วลง FAIL)

- [ ] **Step 3: ยืนยันที่ HDFS (ปลายทางจริง)**

```bash
source scripts/qa/lib.sh
ID=$(qa_get scores_id)
docker exec sdoqap-namenode hdfs dfs -ls /data/raw/qa_scores/$ID
docker exec sdoqap-namenode hdfs dfs -ls /data/active/qa_scores | head -5
docker exec sdoqap-namenode hdfs dfs -ls /data/quarantine/qa_scores | head -5
```
Expected: raw มี `qa_scores.csv` ในโฟลเดอร์ของ ingest id นั้น, active และ quarantine มีไฟล์ข้อมูล

- [ ] **Step 4: ยืนยันที่ Elasticsearch**

```bash
source scripts/qa/lib.sh
last_quality qa_scores | tee "$EVID/t2-quality-qa_scores.txt"
```
Expected: `total_records` = `1030`, `clean_records + quarantined_records` ≤ `total_records` (ส่วนต่างคือแถวที่ review), `quality_score` เป็นตัวเลข เทียบคำตอบในไฟล์ `student_scores_answer_key.csv` (Clean 915 · Review 20 · Quarantine 95 สำหรับ interactive engine) ถ้า Spark ให้ตัวเลขต่างจากนี้ ให้จดค่าจริงลง note เพื่อนำไปอธิบายในรายงาน (ความต่างระหว่าง 2 engine ไม่ใช่ FAIL ถ้ายอดรวมตรง)

- [ ] **Step 5: ไฟล์ซ้ำต้องถูกจับ**

```bash
source scripts/qa/lib.sh
api POST /api/v1/pipeline/ingest/csv -F table_name=qa_scores -F "file=@$ROOT/data/samples/student_scores/student_scores_sample.csv"
```
Expected: `HTTP 200`, `"status":"duplicate"`, `ingest_id` เท่ากับ `qa_get scores_id`, `spark_triggered:false`

- [ ] **Step 6: ไฟล์ Excel**

```bash
source scripts/qa/lib.sh
python -c "import pandas as pd,sys; pd.read_csv(sys.argv[1]).head(200).to_excel(sys.argv[2], index=False)" "$ROOT/data/samples/student_scores/student_scores_sample.csv" "$QA_TMP/qa_scores_x.xlsx"
RES=$(apij POST /api/v1/pipeline/ingest/csv -F table_name=qa_scores_xlsx -F "file=@$QA_TMP/qa_scores_x.xlsx"); echo "$RES"
wait_run "$(echo "$RES" | jget ingest_id)" 600 && last_quality qa_scores_xlsx
```
Expected: `queued` → `SUCCEEDED`, `total_records` = `200`

- [ ] **Step 7: input ไม่ดีต้องถูกปฏิเสธก่อนลง HDFS**

```bash
source scripts/qa/lib.sh
: > "$QA_TMP/empty.csv"
echo "empty file   : $(code POST /api/v1/pipeline/ingest/csv -F table_name=qa_empty -F "file=@$QA_TMP/empty.csv")"
echo "path traversal: $(code POST /api/v1/pipeline/ingest/csv -F 'table_name=../etc' -F "file=@$ROOT/data/samples/student_scores/student_scores_sample.csv")"
echo "space in name : $(code POST /api/v1/pipeline/ingest/csv -F 'table_name=bad name' -F "file=@$ROOT/data/samples/student_scores/student_scores_sample.csv")"
docker exec sdoqap-namenode hdfs dfs -ls /data/raw | grep -c -E 'qa_empty|etc|bad' || true
```
Expected: ทั้งสามเป็น `400` และบรรทัดสุดท้ายเป็น `0` (ไม่มีโฟลเดอร์ขยะใน HDFS)

- [ ] **Step 8: ตารางที่ลงทะเบียน primary key ไว้ ต้องปฏิเสธไฟล์ที่ไม่มีคอลัมน์ key**

```bash
source scripts/qa/lib.sh
es /sdoqap_schema_registry/_doc/golden_student_scores | python -c "import sys,json; print('primary_key =', json.load(sys.stdin).get('_source',{}).get('primary_key'))"
printf 'a,b\n1,2\n' > "$QA_TMP/nokey.csv"
api POST /api/v1/pipeline/ingest/csv -F table_name=golden_student_scores -F "file=@$QA_TMP/nokey.csv"
```
Expected: ถ้า `primary_key` ไม่ว่าง ได้ `HTTP 400` และ detail มี `missing primary key` ถ้า `primary_key = None` ห้ามรันบรรทัดที่สาม (จะสร้าง run จริง) ให้ลง `SKIP` พร้อมเหตุผล

- [ ] **Step 9: concurrent upload + ซ้ำ + ลำดับคิว (สคริปต์ของโปรเจกต์)**

```bash
source scripts/qa/lib.sh
bash scripts/ops/e2e_ingest_check.sh 2>&1 | tee "$EVID/t2-e2e-ingest-check.txt" | tail -15
```
Expected: ทุกบรรทัดผลเป็น `PASS ...` ไม่มี `FAIL` (เทียบกับ `docs/evaluation/evidence/b-e2e-ingest-check.txt`)

- [ ] **Step 10: เส้นทาง service key (n8n ใช้จริง)**

```bash
source scripts/qa/lib.sh
KEY=$(envval INGEST_SERVICE_KEY)
curl -s -w '\nHTTP %{http_code}\n' -H "X-Service-Key: $KEY" -F table_name=qa_scores_svc -F "file=@$QA_TMP/qa_scores_x.xlsx" "$BASE/api/v1/pipeline/ingest/csv"
```
Expected: `HTTP 202` (ไม่ต้องมี cookie)

- [ ] **Step 11: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T2.1 "อัปโหลด CSV -> queued -> SUCCEEDED" PASS "ingest $(qa_get scores_id)"
qa_record T2.2 "ข้อมูลลง HDFS raw/active/quarantine" PASS "-"
qa_record T2.3 "ผลใน ES ตรงจำนวนแถว (1030)" PASS "t2-quality-qa_scores.txt"
qa_record T2.4 "ไฟล์ซ้ำ -> duplicate" PASS "-"
qa_record T2.5 "Excel -> CSV -> SUCCEEDED (200 แถว)" PASS "-"
qa_record T2.6 "input ไม่ดี -> 400 ไม่มีขยะใน HDFS" PASS "-"
qa_record T2.7 "ขาดคอลัมน์ primary key -> 400" PASS "-"
qa_record T2.8 "e2e_ingest_check (concurrent/dup/queue)" PASS "t2-e2e-ingest-check.txt"
qa_record T2.9 "service key ingest" PASS "-"
git add docs/testing && git commit -m "test(qa): task 2 file ingestion results"
```
(แก้ผลให้ตรงจริงก่อนรัน)

---

### Task 3: Ingestion จาก REST API และ guard ป้องกัน SSRF

**Interfaces:**
- Consumes: Task 0 helpers, session จาก Task 1
- Produces: ตาราง `qa_gov` (ถ้าออนไลน์)

- [ ] **Step 1: host ที่ไม่อยู่ใน allowlist ถูกปฏิเสธ**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
for u in "https://example.com/data.json" "http://localhost:9200" "http://169.254.169.254/latest/meta-data" "file:///etc/passwd" "ftp://data.go.th/x"; do
  printf '%-48s ' "$u"; code POST /api/v1/pipeline/ingest/api -H 'Content-Type: application/json' -d "{\"table_name\":\"qa_guard\",\"url\":\"$u\"}"; echo
done
```
Expected: ทุกบรรทัด `400` (README บอกว่า host ไม่อยู่ใน allowlist ผ่านได้ แต่โค้ด `ingest_guards.py` ตั้งเป็น fail-closed ให้ลง Finding D-1: README ล้าสมัย)

- [ ] **Step 2: ดึงข้อมูลจริงจาก data.go.th**

```bash
source scripts/qa/lib.sh
RES=$(apij POST /api/v1/pipeline/ingest/api -H 'Content-Type: application/json' -d '{"table_name":"qa_gov","url":"https://data.go.th/api/3/action/datastore_search?resource_id=b5c54455-9447-407a-8002-7660703484d7&limit=50"}'); echo "$RES"
wait_run "$(echo "$RES" | jget ingest_id)" 600 && last_quality qa_gov
```
Expected: `queued` → `SUCCEEDED`, `total_records` = `50` ถ้าไม่มีอินเทอร์เน็ต/ data.go.th ล่ม (ได้ 4xx/5xx จากต้นทาง) ลง `SKIP`

- [ ] **Step 3: ส่งซ้ำให้เนื้อหาเดิม ต้องเป็น duplicate**

```bash
source scripts/qa/lib.sh
api POST /api/v1/pipeline/ingest/api -H 'Content-Type: application/json' -d '{"table_name":"qa_gov","url":"https://data.go.th/api/3/action/datastore_search?resource_id=b5c54455-9447-407a-8002-7660703484d7&limit=50"}'
```
Expected: `"status":"duplicate"` (ข้อมูลต้นทางต้องไม่เปลี่ยนระหว่างสองครั้ง ถ้าเปลี่ยนจะได้ queued ให้จดไว้)

- [ ] **Step 4: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T3.1 "allowlist/SSRF/scheme guard -> 400" PASS "D-1: README ล้าสมัย"
qa_record T3.2 "ingest data.go.th -> SUCCEEDED (50 แถว)" PASS "-"
qa_record T3.3 "API ซ้ำ -> duplicate" PASS "-"
git add docs/testing && git commit -m "test(qa): task 3 API ingestion results"
```

---

### Task 4: Ingestion จาก RDBMS (Postgres, read-only)

**Interfaces:**
- Produces: ตาราง Postgres `qa_sales` (500 แถว) ใช้ต่อใน Task 12 (n8n)

- [ ] **Step 1: seed ตารางทดสอบ**

```bash
source scripts/qa/lib.sh
docker exec sdoqap-postgres psql -U sdoqap -d sdoqap_oltp -c "create table if not exists qa_sales as select g as order_id, 'r'||(g%5) as region, (g*7)%500 as units_sold, round((g*1.37)::numeric,2) as unit_price from generate_series(1,500) g;"
docker exec sdoqap-postgres psql -U sdoqap -d sdoqap_oltp -tAc "select count(*) from qa_sales"
```
Expected: `500` (ตอนเริ่ม Postgres ไม่มีตารางของผู้ใช้เลย)

- [ ] **Step 2: ingest ด้วย SELECT**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
PW=$(envval POSTGRES_PASSWORD); PW=${PW:-sdoqap}
BODY=$(printf '{"table_name":"qa_sales_db","db_type":"postgresql","host":"postgres","port":5432,"username":"sdoqap","password":"%s","database":"sdoqap_oltp","query":"SELECT * FROM qa_sales"}' "$PW")
RES=$(apij POST /api/v1/pipeline/ingest/rdbms -H 'Content-Type: application/json' -d "$BODY"); echo "$RES"
wait_run "$(echo "$RES" | jget ingest_id)" 600 && last_quality qa_sales_db
```
Expected: `queued` → `SUCCEEDED`, `total_records` = `500` (ถ้า HTTP 400 พร้อม `RDBMS_ALLOWED_HOSTS` แปลว่า `.env` ไม่ได้ตั้ง `RDBMS_ALLOWED_HOSTS=postgres` ให้ตั้งแล้ว `docker compose up -d api` ก่อน แล้วจดใน note)

- [ ] **Step 3: host นอก allowlist และ db_type ที่ไม่รองรับ**

```bash
source scripts/qa/lib.sh
B='"table_name":"qa_bad","port":5432,"username":"u","password":"p","database":"d","query":"SELECT 1"'
echo "evil host : $(code POST /api/v1/pipeline/ingest/rdbms -H 'Content-Type: application/json' -d "{$B,\"host\":\"evil.example\"}")"
echo "mysql     : $(code POST /api/v1/pipeline/ingest/rdbms -H 'Content-Type: application/json' -d "{$B,\"host\":\"postgres\",\"db_type\":\"mysql\"}")"
```
Expected: ทั้งสอง `400` (UI มีตัวเลือก MySQL/SQL Server แต่ backend รองรับเฉพาะ `postgresql` ให้ตรวจใน Task 13 ว่า UI แจ้ง error อ่านเข้าใจ)

- [ ] **Step 4: SQL ที่ไม่ใช่ SELECT ต้องแก้ข้อมูลไม่ได้**

```bash
source scripts/qa/lib.sh
PW=$(envval POSTGRES_PASSWORD); PW=${PW:-sdoqap}
try() { printf '%-42s ' "$1"; code POST /api/v1/pipeline/ingest/rdbms -H 'Content-Type: application/json' \
  -d "$(printf '{"table_name":"qa_bad","host":"postgres","port":5432,"username":"sdoqap","password":"%s","database":"sdoqap_oltp","query":"%s"}' "$PW" "$1")"; echo; }
try "DROP TABLE qa_sales"
try "DELETE FROM qa_sales"
try "SELECT 1; DROP TABLE qa_sales"
try "SELECT * INTO qa_copy FROM qa_sales"
docker exec sdoqap-postgres psql -U sdoqap -d sdoqap_oltp -tAc "select count(*) from qa_sales; select to_regclass('qa_copy');"
```
Expected: ทุกคำสั่งได้ status ที่ไม่ใช่ 2xx, `qa_sales` ยังมี `500` แถว และ `to_regclass('qa_copy')` ว่าง (ไม่มีตารางใหม่ถูกสร้าง)

- [ ] **Step 5: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T4.1 "RDBMS ingest -> SUCCEEDED (500 แถว)" PASS "-"
qa_record T4.2 "host นอก allowlist / db_type ไม่รองรับ -> 400" PASS "-"
qa_record T4.3 "SQL ไม่ใช่ SELECT แก้ข้อมูลไม่ได้" PASS "-"
git add docs/testing && git commit -m "test(qa): task 4 RDBMS ingestion results"
```

---

### Task 5: Stream (Reddit → Kafka → Spark Structured Streaming)

ต้องเปิด profile `streaming` และมีอินเทอร์เน็ต (ใช้ RSS ของ Reddit ถ้าไม่มี PRAW key) ถ้าไม่ครบ ลง `SKIP` ทั้ง task

- [ ] **Step 1: Kafka พร้อมและมี topic**

```bash
source scripts/qa/lib.sh
docker exec sdoqap-kafka kafka-topics --bootstrap-server localhost:29092 --list | tee "$EVID/t5-topics.txt"
```
Expected: รายการ topic ไม่ error (จดชื่อ topic ของ Reddit ไว้ใช้ Step 4)

- [ ] **Step 2: เริ่ม stream และดูสถานะ**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
api POST /api/v1/pipeline/ingest/reddit -H 'Content-Type: application/json' -d '{"subreddits":"python","duration":40}'
sleep 10
apij GET /api/v1/pipeline/ingest/reddit/status | head -c 1200
```
Expected: start ได้ `HTTP 200`; status แสดงว่ากำลังรัน และมี log

- [ ] **Step 3: รอจบ แล้วดู parquet ใน HDFS**

```bash
source scripts/qa/lib.sh
sleep 60
docker exec sdoqap-namenode hdfs dfs -ls /data/reddit/parquet | tail -5
apij GET /api/v1/pipeline/ingest/reddit/status | head -c 600
```
Expected: มีไฟล์ parquet ใหม่ และ status ว่าไม่ได้รันอยู่ (หรือจบแล้ว)

- [ ] **Step 4: ข้อความใน Kafka และข้อมูลที่หน้า Export**

```bash
source scripts/qa/lib.sh
docker exec sdoqap-kafka kafka-console-consumer --bootstrap-server localhost:29092 --topic reddit_raw --from-beginning --max-messages 3 --timeout-ms 15000 | head -c 800
api GET /api/v1/export/reddit | head -c 600
```
Expected: เห็นข้อความ JSON ≥ 1 รายการ (ถ้าชื่อ topic ต่างจาก `reddit_raw` ให้ใช้ชื่อจาก Step 1) และ `/export/reddit` คืนข้อมูลโพสต์

- [ ] **Step 5: หยุด stream ที่ค้างอยู่**

```bash
source scripts/qa/lib.sh
api POST /api/v1/pipeline/ingest/reddit/stop
apij GET /api/v1/pipeline/ingest/reddit/status | head -c 300
```
Expected: `HTTP 200` และสถานะไม่ใช่กำลังรัน

- [ ] **Step 6: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T5.1 "start/status stream" PASS "-"
qa_record T5.2 "parquet ใน HDFS + ข้อความใน Kafka" PASS "-"
qa_record T5.3 "export/reddit + stop" PASS "-"
git add docs/testing && git commit -m "test(qa): task 5 streaming results"
```

---

### Task 6: Rules config, Column profiler, AI advisor, Standardization queue

Endpoints: `/api/v1/rules/*` และ `/api/v1/standardize/*` การแก้ rules เขียนลง `services/spark/rules_config.json` **ต้อง backup ก่อนและคืนค่าหลังเทส**

- [ ] **Step 1: backup rules_config และอ่านกฎของตาราง**

```bash
source scripts/qa/lib.sh
cp services/spark/rules_config.json "$QA_TMP/rules_config.backup.json"
qa_login >/dev/null
apij GET /api/v1/rules/qa_scores | python -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys())[:12])"
apij GET /api/v1/rules/profiles/qa_scores | head -c 700
```
Expected: กฎที่ใช้จริง (effective rules) ของ `qa_scores` ถูกคืน และ profile ของคอลัมน์ (ชนิด, null rate, min/max) ของตารางที่ ingest แล้ว

- [ ] **Step 2: แก้กฎแล้วยืนยันว่าถูกบันทึกและมีผล**

```bash
source scripts/qa/lib.sh
api PUT /api/v1/rules/qa_scores -H 'Content-Type: application/json' -d '{"quality_score_threshold":{"mode":"static","base_value":97.0}}'
grep -c '"qa_scores"' services/spark/rules_config.json
apij GET /api/v1/lineage/qa_scores/trust-check | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('quality_threshold'), d.get('recommendation'))"
api PUT /api/v1/rules/_default -H 'Content-Type: application/json' -d '{"x":1}'
```
Expected: PUT ได้ `HTTP 200`, `rules_config.json` มี key `qa_scores`, trust-check แสดง `quality_threshold` = `97.0`, และการแก้ `_default` ได้ `HTTP 400`

- [ ] **Step 3: กฎใหม่ถูกใช้รอบถัดไป (ทดสอบ end-to-end)**

```bash
source scripts/qa/lib.sh
ID=$(qa_get scores_id)
RES=$(apij POST /api/v1/pipeline/retry/$ID); echo "$RES"
wait_run "$(echo "$RES" | jget ingest_id || echo $ID)" 600; last_quality qa_scores
```
Expected: run ใหม่ `SUCCEEDED` และ trust-check ของ `qa_scores` หลังรอบนี้ตัดสินด้วยเกณฑ์ 97.0 (ถ้าคะแนนต่ำกว่า 97 ต้องเห็น `is_safe_to_consume:false`) ถ้า retry คืน id เดิม ให้ตรวจ `GET /pipeline/runs/<id>` ว่า state เปลี่ยนกลับเป็น QUEUED แล้ว SUCCEEDED

- [ ] **Step 4: AI rule proposals (ต้องมี Groq key หรือ Ollama)**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/system/settings
api POST /api/v1/rules/ai-proposals/reset
apij GET /api/v1/rules/ai-proposals | python -c "import sys,json; d=json.load(sys.stdin); print('count', d.get('count')); ps=d.get('proposals',[]); print(ps[0] if ps else None)"
```
Expected: settings แสดง `groq_api_key_masked` ไม่ว่างและ `groq_enabled: true` (คีย์ถูกตั้งไว้แล้วในแผน api-route-completeness Task 8); `reset` ได้ `HTTP 200`; `count` ≥ 1 และข้อเสนอแต่ละข้อมี id/คอลัมน์/เหตุผล จด `is_example` และ `source` ของ response ลง note: `example_proposals` แปลว่ายังไม่มีข้อเสนอจริงจาก Spark advisor (ต้องมี run ที่เข้าเงื่อนไข trigger ก่อน) ซึ่งไม่ใช่ FAIL จะ SKIP ส่วน LLM ได้เฉพาะเมื่อเจ้าของยืนยันว่าไม่ใช้ Groq

- [ ] **Step 5: approve และ reject proposal**

```bash
source scripts/qa/lib.sh
PIDS=$(apij GET /api/v1/rules/ai-proposals | python -c "import sys,json; print(' '.join(p.get('id','') for p in json.load(sys.stdin).get('proposals',[])[:2]))")
set -- $PIDS
[ -n "${1:-}" ] && api POST /api/v1/rules/ai-proposals/$1/approve
[ -n "${2:-}" ] && api POST /api/v1/rules/ai-proposals/$2/reject
api POST /api/v1/rules/ai-proposals/not-a-real-id/approve
```
Expected: approve/reject ของ id จริง `HTTP 200` และเรื่องนั้นหายจากรายการ pending, id ปลอมได้ `404` (ถ้าไม่มี proposal เลย ลง `SKIP` สองข้อแรก)

- [ ] **Step 6: Standardization review queue + rollback**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/standardize/review-queue | python -c "import sys,json; d=json.load(sys.stdin); print(d if isinstance(d,dict) and 'items' not in d else {'n': len(d.get('items', d))})"
api POST /api/v1/standardize/review-queue/not-a-real-id/approve
api POST /api/v1/standardize/rollback
```
Expected: คิวอ่านได้; id ปลอมได้ `404`; rollback ได้ `HTTP 200` (หรือ `404` ที่อธิบายว่าไม่มี backup ให้ย้อน) ถ้ามี item จริงในคิว ให้ทดลอง `approve`, `override` (body `{"approved_category":"..."}`), `reject` อย่างละ 1 รายการแล้วตรวจว่ารายการหายจากคิว

- [ ] **Step 7: คืน rules_config ให้เหมือนเดิม**

```bash
source scripts/qa/lib.sh
cp "$QA_TMP/rules_config.backup.json" services/spark/rules_config.json
git diff --stat services/spark/rules_config.json
```
Expected: ไม่มี diff (ไฟล์กลับเป็นเหมือนเดิม)

- [ ] **Step 8: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T6.1 "อ่าน effective rules + column profile" PASS "-"
qa_record T6.2 "แก้กฎ -> บันทึก -> มีผลกับ trust-check; _default ห้ามแก้" PASS "-"
qa_record T6.3 "กฎใหม่ถูกใช้ในรอบ retry" PASS "-"
qa_record T6.4 "AI proposals generate/approve/reject" PASS "-"
qa_record T6.5 "standardization queue + rollback" PASS "-"
git add docs/testing && git commit -m "test(qa): task 6 rules and AI advisor results"
```

---

### Task 7: Pipeline runs, detail, acknowledge, retry, quality logs

- [ ] **Step 1: รายการ run และ pagination**

```bash
source scripts/qa/lib.sh
apij GET "/api/v1/pipeline?paginated=true&page=1&size=5" | python -c "import sys,json; d=json.load(sys.stdin); print(d['total'], len(d['data']), d['page'], d['size'])"
echo "deep page: $(anon GET '/api/v1/pipeline?paginated=true&page=3000&size=50')"
```
Expected: `total` ≥ จำนวน run ที่ทำใน Task 2–4, `len(data)` = `5`, และ deep page (offset > 10,000) ได้ `400`

- [ ] **Step 2: run detail และ ingest registry**

```bash
source scripts/qa/lib.sh
ID=$(qa_get scores_id)
apij GET /api/v1/pipeline/runs/$ID | python -c "import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ('ingest_id','table','state','source','size_bytes','sha256')})"
echo "unknown ingest: $(anon GET /api/v1/pipeline/runs/does-not-exist)"
```
Expected: แสดง state `SUCCEEDED`, source `file`, ขนาดไฟล์ตรง และ ingest id ที่ไม่มีได้ `404`

- [ ] **Step 3: retry run ที่จบแล้ว**

```bash
source scripts/qa/lib.sh
ID=$(qa_get scores_id)
api POST /api/v1/pipeline/retry/$ID
sleep 3; apij GET /api/v1/pipeline/runs/$ID | jget state
wait_run "$ID" 600
```
Expected: retry ได้ `HTTP 200/202` state ย้อนเป็น `QUEUED` หรือ `RUNNING` แล้วจบที่ `SUCCEEDED` และไม่ anonymous (เรียกโดยไม่ login ได้ `401`)

- [ ] **Step 4: ผลคุณภาพต่อตาราง**

```bash
source scripts/qa/lib.sh
apij GET "/api/v1/quality?limit=3" | python -c "import sys,json; [print({k:r.get(k) for k in ('table_name','quality_score','total_records','quarantined_records')}) for r in json.load(sys.stdin)]"
apij GET /api/v1/quality/qa_scores | head -c 500
```
Expected: รายการเรียงล่าสุดก่อน และ `qa_scores` มีผลของรอบล่าสุด

- [ ] **Step 5: acknowledge drift**

```bash
source scripts/qa/lib.sh
api POST /api/v1/pipeline/acknowledge/does-not-exist
```
Expected: `404` (run ที่ไม่มีอยู่) ส่วนกรณี run ที่มี drift จริงให้ทดสอบต่อหลัง Task 8 แล้วกลับมาลงผล T7.5

- [ ] **Step 6: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T7.1 "list runs + pagination + deep page 400" PASS "-"
qa_record T7.2 "run detail / 404" PASS "-"
qa_record T7.3 "retry -> SUCCEEDED (ต้อง login)" PASS "-"
qa_record T7.4 "quality list/by table" PASS "-"
qa_record T7.5 "acknowledge drift" PASS "ทดสอบซ้ำหลัง Task 8"
git add docs/testing && git commit -m "test(qa): task 7 pipeline results"
```

---

### Task 8: Schema drift และ Catalog (approve/reject)

- [ ] **Step 1: ทำให้เกิด drift จริง (เพิ่มคอลัมน์ใหม่ในตารางเดิม)**

```bash
source scripts/qa/lib.sh
python - "$ROOT/data/samples/student_scores/student_scores_sample.csv" "$QA_TMP/qa_scores_drift.csv" <<'EOF'
import sys, pandas as pd
df = pd.read_csv(sys.argv[1]); df["qa_extra_col"] = "x"
df.to_csv(sys.argv[2], index=False)
EOF
qa_login >/dev/null
RES=$(apij POST /api/v1/pipeline/ingest/csv -F table_name=qa_scores -F "file=@$QA_TMP/qa_scores_drift.csv"); echo "$RES"
wait_run "$(echo "$RES" | jget ingest_id)" 600
```
Expected: `queued` → จบ (`SUCCEEDED` หรือ `FAILED` ที่มีเหตุผลเรื่อง drift)

- [ ] **Step 2: พบ proposal สถานะ PENDING**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/schema/proposals | python -c "import sys,json; ps=[p for p in json.load(sys.stdin)['proposals'] if p.get('table_name')=='qa_scores']; print(len(ps)); print(ps[0] if ps else None)" | tee "$EVID/t8-proposal.txt"
```
Expected: มี proposal ≥ 1 ของ `qa_scores` สถานะ `PENDING` ที่ระบุคอลัมน์ `qa_extra_col` (ตามที่ README ว่าระบบบล็อกและส่งเข้าคิวอนุมัติ) ถ้าไม่มี ให้ลง FAIL พร้อม log ของ spark-master

- [ ] **Step 3: สร้าง proposal จำลอง แล้ว approve / reject**

```bash
source scripts/qa/lib.sh
api POST /api/v1/schema/proposals/simulate -H 'Content-Type: application/json' -d '{"table_name":"qa_scores","column_name":"qa_sim_a"}'
api POST /api/v1/schema/proposals/simulate -H 'Content-Type: application/json' -d '{"table_name":"qa_scores","column_name":"qa_sim_b"}'
IDS=$(apij GET /api/v1/schema/proposals | python -c "import sys,json; print(' '.join(p['id'] for p in json.load(sys.stdin)['proposals'] if p.get('table_name')=='qa_scores' and p.get('status')=='PENDING' and 'qa_sim' in str(p)))")
set -- $IDS; echo "ids: $IDS"
api POST "/api/v1/schema/proposals/$1/approve"
api POST "/api/v1/schema/proposals/$2/reject"
api POST "/api/v1/schema/proposals/not-a-real-id/approve"
```
Expected: simulate สองครั้งได้ `HTTP 200`; approve และ reject ได้ `HTTP 200` และสถานะเปลี่ยนเป็น `APPROVED`/`REJECTED`; id ปลอมได้ `404` (ถ้า field `id` ไม่ใช่ชื่อที่ API ใช้จริง ให้ดู key จากไฟล์ `t8-proposal.txt` แล้วใช้ key นั้น)

- [ ] **Step 4: approve แล้ว registry ใน ES เปลี่ยนจริง**

```bash
source scripts/qa/lib.sh
es /sdoqap_schema_registry/_doc/qa_scores | python -c "import sys,json; s=json.load(sys.stdin).get('_source',{}); print(sorted((s.get('schema_spec') or {}).keys()))"
```
Expected: หลัง approve proposal ที่เป็น drift จริง (`qa_extra_col`) registry ของ `qa_scores` มีคอลัมน์นั้นเพิ่มขึ้น (approve ตัวจริงด้วย `POST /proposals/<id>/approve` ก่อนรัน Step นี้)

- [ ] **Step 5: approve-all / reject-all**

```bash
source scripts/qa/lib.sh
api POST /api/v1/schema/proposals/simulate -H 'Content-Type: application/json' -d '{"table_name":"qa_scores","column_name":"qa_sim_c"}'
api POST /api/v1/schema/proposals/reject-all
apij GET /api/v1/schema/proposals | python -c "import sys,json; print('pending left:', sum(1 for p in json.load(sys.stdin)['proposals'] if p.get('status')=='PENDING'))"
```
Expected: `reject-all` ได้ `HTTP 200` และ `pending left: 0` **คำเตือน:** คำสั่งนี้ปฏิเสธ proposal ของ *ทุกตาราง* ไม่ใช่แค่ `qa_*` ถ้ามี PENDING ของคนอื่นอยู่ (ดูจาก Step 2 ก่อน) ให้ข้ามข้อนี้แล้วลง `SKIP` พร้อมเหตุผล

- [ ] **Step 6: acknowledge drift ของ Task 7**

```bash
source scripts/qa/lib.sh
RID=$(apij GET /api/v1/pipeline | python -c "import sys,json; r=[x for x in json.load(sys.stdin) if x.get('table_name')=='qa_scores']; print(r[0].get('run_id','') if r else '')")
api POST /api/v1/pipeline/acknowledge/$RID
```
Expected: `HTTP 200` (อัปเดตผล T7.5)

- [ ] **Step 7: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T8.1 "คอลัมน์ใหม่ -> drift proposal PENDING" PASS "t8-proposal.txt"
qa_record T8.2 "simulate + approve/reject + 404" PASS "-"
qa_record T8.3 "approve แล้ว registry ใน ES เปลี่ยน" PASS "-"
qa_record T8.4 "reject-all" PASS "-"
git add docs/testing && git commit -m "test(qa): task 8 schema governance results"
```

---

### Task 9: Workspace Exports

- [ ] **Step 1: catalog ตารางและ preview 3 layer**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/export/tables | python -c "import sys,json; d=json.load(sys.stdin); t=d if isinstance(d,list) else d.get('tables',d); print(len(t)); print('qa_scores' in str(t))"
for L in raw active quarantine; do printf '%-11s ' $L; code GET /api/v1/export/preview/$L/qa_scores; echo; done
```
Expected: catalog มี `qa_scores` (`True`); `raw`, `active` และ `quarantine` ได้ `200` ทั้งสาม (D-3: preview ของ `raw` เคยอ่าน path เก่า `/data/raw/<table>/<table>.csv` แก้แล้วในแผน api-route-completeness Task 2 ถ้า `raw` ยังได้ 404/500 ให้ลง FAIL)

- [ ] **Step 2: ดาวน์โหลดข้อมูลแต่ละโซนและเทียบจำนวนแถว**

```bash
source scripts/qa/lib.sh
for Z in active quarantine; do
  apij GET "/api/v1/export/$Z/qa_scores" -o "$QA_TMP/$Z.csv" >/dev/null
  echo "$Z: csv rows=$(($(wc -l < "$QA_TMP/$Z.csv")-1)) records total_rows=$(apij GET "/api/v1/export/records/$Z/qa_scores?limit=1" | jget total_rows)"
done
apij GET /api/v1/export/raw/qa_scores -o "$QA_TMP/raw.csv" >/dev/null; echo "raw: $(($(wc -l < "$QA_TMP/raw.csv")-1)) rows"
echo "limit=5: $(( $(apij GET '/api/v1/export/active/qa_scores?limit=5' | wc -l) - 1 )) rows"
last_quality qa_scores
```
Expected: ในแต่ละโซน `csv rows` เท่ากับ `total_rows` (ไฟล์ CSV ที่ดาวน์โหลดกับ endpoint ค้นหาอ่าน layer เดียวกัน) และสอดคล้องกับ `clean_records` / `quarantined_records` จาก `last_quality qa_scores` (ต่างกันได้เฉพาะแถว review ที่อยู่ active); `raw` = `1030` แถว (landing ล่าสุดของ `qa_scores` ไม่นับ header); `limit=5` ได้ `5` แถว

- [ ] **Step 3: Gold metrics export เป็น CSV**

```bash
source scripts/qa/lib.sh
for M in daily-quality error-patterns financial-impact schema-drift; do printf '%-18s ' $M; code GET "/api/v1/export/gold/$M?days=14"; echo; done
echo "unknown metric: $(code GET /api/v1/export/gold/not-a-metric)"
```
Expected: สี่ metric ได้ `200` และ metric ที่ไม่มีได้ `404`

- [ ] **Step 4: ลบตารางทดสอบ (เฉพาะ `qa_*`) และยืนยันว่าหายจริง**

```bash
source scripts/qa/lib.sh
echo "anon delete: $(anon DELETE /api/v1/export/tables/qa_scores_xlsx)"
api DELETE /api/v1/export/tables/qa_scores_xlsx
docker exec sdoqap-namenode hdfs dfs -ls /data/raw /data/active /data/quarantine 2>&1 | grep -c qa_scores_xlsx || true
echo "traversal: $(code DELETE '/api/v1/export/tables/..%2Fetc')"
```
Expected: `anon delete` = `401`, ลบแล้ว `HTTP 200`, ใน HDFS ไม่เหลือ `qa_scores_xlsx` (นับได้ `0`), traversal ได้ `400` หรือ `404` **ห้ามลบตารางที่ไม่ขึ้นต้นด้วย `qa_`**

- [ ] **Step 5: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T9.1 "catalog + preview active/quarantine" PASS "-"
qa_record T9.2 "preview raw อ่าน landing ล่าสุด (D-3)" PASS "-"
qa_record T9.3 "export active/quarantine/raw + records จำนวนแถวสอดคล้อง" PASS "-"
qa_record T9.4 "gold export + 404" PASS "-"
qa_record T9.5 "ลบตาราง qa_* (ต้อง login, ล้าง HDFS)" PASS "-"
git add docs/testing && git commit -m "test(qa): task 9 export results"
```

---

### Task 10: Dashboards, Analytics, Gold layer, Lineage, Trust-check

- [ ] **Step 1: ตัวเลข KPI ต้องตรงกับ ES**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/kpi/stats | tee "$EVID/t10-kpi.json" | head -c 600; echo
es "/sdoqap_quality_runs/_count" | python -c "import sys,json; print('ES quality_runs:', json.load(sys.stdin)['count'])"
```
Expected: ตัวเลขใน KPI (จำนวน run, records ที่ตรวจ ฯลฯ) อธิบายได้จาก `sdoqap_quality_runs` (เช่น จำนวนตารางไม่เกินจำนวน doc, คะแนนเฉลี่ยอยู่ระหว่าง 0–100) ถ้าตัวเลขไม่สอดคล้อง ให้ลง FAIL พร้อมตัวเลขทั้งสองฝั่ง

- [ ] **Step 2: ทุก endpoint วิเคราะห์ตอบ 200 และมีข้อมูล**

```bash
source scripts/qa/lib.sh
for p in /api/v1/executive/overview /api/v1/anomaly/sources /api/v1/analytics/projection /api/v1/analytics/clustering /api/v1/analytics/impact /api/v1/analytics/sell-in-out /api/v1/analytics/recommendations /api/v1/gold/daily-quality /api/v1/gold/error-patterns /api/v1/gold/financial-impact /api/v1/gold/schema-drift-history /api/v1/gold/schema-drift /api/v1/performance/metrics /api/v1/system/activity; do
  printf '%-42s %s bytes  HTTP %s\n' "$p" "$(apij GET $p | wc -c)" "$(code GET $p)"
done
```
Expected: ทุกบรรทัด `HTTP 200` และ body ไม่ว่าง (> 2 bytes)

- [ ] **Step 3: Gold rebuild สร้างผลเดิมซ้ำได้ (idempotent)**

```bash
source scripts/qa/lib.sh
B=$(es /sdoqap_gold_daily_quality/_count | python -c "import sys,json; print(json.load(sys.stdin)['count'])")
echo "anon: $(anon POST /api/v1/gold/rebuild)"
api POST /api/v1/gold/rebuild
sleep 45
A=$(es /sdoqap_gold_daily_quality/_count | python -c "import sys,json; print(json.load(sys.stdin)['count'])")
echo "gold_daily_quality before=$B after=$A"
```
Expected: `anon` = `401`, rebuild ได้ `HTTP 200`, และ `after` ≥ `before` โดยไม่มี doc ซ้ำซ้อนผิดปกติ (จำนวนต่อ (วัน, ตาราง) ไม่เพิ่มขึ้นเป็นสองเท่า)

- [ ] **Step 4: Lineage และ inspect node**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/lineage/qa_scores | python -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys())[:10])"
for N in source raw active quarantine; do printf '%-11s ' $N; code GET /api/v1/lineage/inspect/qa_scores/$N; echo; done
echo "no lineage: $(anon GET /api/v1/lineage/no_such_table)"
```
Expected: lineage ของ `qa_scores` มีเส้นทาง raw → active/quarantine; inspect node ได้ `200` พร้อมรายการไฟล์/ตัวอย่างแถวจาก HDFS; ตารางที่ไม่มีได้ `404`

- [ ] **Step 5: Trust-check สำหรับ BI/ML**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/lineage/qa_scores/trust-check | tee "$EVID/t10-trust-qa_scores.json"
echo; apij GET /api/v1/lineage/golden_student_scores/trust-check | python -c "import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ('table','is_safe_to_consume','quality_score','quality_threshold','pending_schema_proposals','recommendation')})"
```
Expected: มีฟิลด์ตามตัวอย่างใน README (`is_safe_to_consume`, `quality_score`, `quality_threshold`, `pending_schema_proposals`, `recommendation`) และ `is_safe_to_consume` สอดคล้องกับ `quality_score >= quality_threshold` และไม่มี proposal PENDING

- [ ] **Step 6: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T10.1 "KPI สอดคล้องกับ ES" PASS "t10-kpi.json"
qa_record T10.2 "endpoint analytics/gold/system ตอบ 200 มีข้อมูล" PASS "-"
qa_record T10.3 "gold rebuild (ต้อง login, idempotent)" PASS "-"
qa_record T10.4 "lineage + inspect node + 404" PASS "-"
qa_record T10.5 "trust-check สอดคล้องกับเกณฑ์" PASS "t10-trust-qa_scores.json"
git add docs/testing && git commit -m "test(qa): task 10 analytics and lineage results"
```

---

### Task 11: Audit Trail (White-box engine) และ multi-table

เอนจินนี้ทำงานกับ dataset เดียวในหน่วยความจำของ API ("อัปโหลดแล้วแทนที่ชุดที่โหลดอยู่") ดังนั้น **เทสตอนไม่มีคนใช้หน้านี้อยู่** และคืนชุดเดิมหลังเทส (ดูท้าย task)

- [ ] **Step 1: ประเมินกับ ground truth (สคริปต์ของโปรเจกต์)**

```bash
source scripts/qa/lib.sh
python scripts/evaluation/run_whitebox_evaluation.py 2>&1 | tee "$EVID/t11-whitebox-eval.txt" | tail -40
```
Expected: dirty_dataset 10,100 แถวถูกแยกเป็น Clean 9,400 / Review 100 / Quarantine 600 และ Recall/Precision เท่ากับ 100% (ตามหัวไฟล์สคริปต์) ถ้าตัวเลขต่างให้ลง FAIL พร้อมตัวเลขจริง

- [ ] **Step 2: profile และ state ของชุดที่โหลดอยู่**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/whitebox/profile | python -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys())[:10])"
apij GET /api/v1/whitebox/state | head -c 400; echo
apij GET /api/v1/whitebox/context/default | head -c 400
```
Expected: `200` ทั้งสาม; profile มีสถิติต่อคอลัมน์ (ชนิด, null, min/max)

- [ ] **Step 3: อัปโหลดชุดตัวอย่างที่มี answer key แล้วรันทั้ง pipeline**

```bash
source scripts/qa/lib.sh
api POST /api/v1/whitebox/upload-csv -F "file=@$ROOT/data/samples/student_scores/student_scores_sample.csv"
api POST /api/v1/whitebox/run-all -H 'Content-Type: application/json' -d '{}' | tee "$EVID/t11-runall.txt" | tail -c 1500
```
Expected: อัปโหลดได้ `HTTP 200`; run-all ได้ `200` และสรุป Clean **915** · Review **20** · Quarantine **95** (Gate 1: 65, Gate 2: 30) ตาม `data/samples/student_scores/README.md` (ถ้ารูปแบบ body ที่ run-all ต้องการต่างจาก `{}` ให้ดู `GET /api/v1/whitebox/run-all` หรือ Swagger ที่ `http://localhost:8002/docs` แล้วบันทึก body ที่ใช้จริงลง evidence)

- [ ] **Step 4: ตรวจรายแถวเทียบ answer key**

```bash
source scripts/qa/lib.sh
for Z in clean review quarantine; do apij GET "/api/v1/whitebox/export-csv/$Z" -o "$QA_TMP/wb_$Z.csv" >/dev/null; echo "$Z: $(($(wc -l < "$QA_TMP/wb_$Z.csv")-1)) rows"; done
head -3 "$ROOT/data/samples/student_scores/student_scores_answer_key.csv"
```
Expected: แถวต่อโซนตรง 915 / 20 / 95 และเมื่อเทียบ `student_id + course + semester` กับ answer key แล้วทุกแถวอยู่โซนที่คาด (ใช้ pandas merge ตรวจ: จำนวนแถวที่ไม่ตรง = 0 ถ้าไม่ตรงให้บันทึกจำนวนลง note)

- [ ] **Step 5: recommend rules, benchmark, downstream analytics**

```bash
source scripts/qa/lib.sh
api POST /api/v1/whitebox/recommend-rules -H 'Content-Type: application/json' -d '{}' | tail -c 500
apij GET /api/v1/whitebox/benchmark | head -c 400; echo
apij GET /api/v1/whitebox/downstream-analytics | head -c 400; echo
apij GET /api/v1/whitebox/ai-context-explanations | head -c 400
```
Expected: `200` ทุกตัว (ถ้า `recommend-rules` ต้องการ body เฉพาะ ดู Swagger แล้วบันทึกไว้) และ AI explanations ตอบได้หรือแจ้งชัดว่า advisor ปิดอยู่

- [ ] **Step 6: Multi-table (เชื่อมตาราง)**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/whitebox/multi-table/preview | head -c 500; echo
api POST /api/v1/whitebox/multi-table/analyze -H 'Content-Type: application/json' -d '{}' | tail -c 600
api POST /api/v1/whitebox/multi-table/join -H 'Content-Type: application/json' -d '{}' | tail -c 600
```
Expected: preview แสดงตาราง (เช่น demographics + scores จาก `data/evaluation/student_course_score_evaluation_dataset/`), analyze รายงาน key ที่ซ้อนกัน/ Key Match Rate, join ให้ผล `JOIN COMPLETED` (รูปแบบ body จริงให้ดู `multi-table/preview` และ Swagger; จด body ที่ใช้)

- [ ] **Step 7: คืนชุดข้อมูลเดิมของเอนจิน**

```bash
source scripts/qa/lib.sh
api POST /api/v1/whitebox/upload-csv -F "file=@$ROOT/data/evaluation/student_course_score_evaluation_dataset/dirty_dataset.csv"
apij GET /api/v1/whitebox/profile | head -c 200
```
Expected: `HTTP 200` และ profile กลับเป็นชุดประเมินเดิม (10,100 แถว)

- [ ] **Step 8: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T11.1 "ประเมินกับ ground truth (9400/100/600, P/R 100%)" PASS "t11-whitebox-eval.txt"
qa_record T11.2 "profile/state/context" PASS "-"
qa_record T11.3 "run-all บนตัวอย่าง -> 915/20/95" PASS "t11-runall.txt"
qa_record T11.4 "รายแถวตรง answer key" PASS "-"
qa_record T11.5 "recommend-rules/benchmark/downstream/AI context" PASS "-"
qa_record T11.6 "multi-table preview/analyze/join" PASS "-"
git add docs/testing && git commit -m "test(qa): task 11 white-box engine results"
```

---

### Task 12: Ops — settings, alert, remediation, Grafana, Kibana, n8n, retention

- [ ] **Step 1: Settings (Groq) — ตรวจ masking และไม่ทำลายค่าจริง**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
show() { python -c "import sys,json; d=json.load(sys.stdin); m=d['groq_api_key_masked']; print('masked ok:', m=='' or '...' in m or set(m)=={'*'}, '| key present:', bool(m), '| enabled:', d['groq_enabled'], '| model:', d['groq_model'])"; }
apij GET /api/v1/system/settings > "$QA_TMP/settings.before.json"; show < "$QA_TMP/settings.before.json"
echo "anon POST          : $(anon POST /api/v1/system/settings -H 'Content-Type: application/json' -d '{"groq_api_key":"x"}')"
echo "fake key (enabled) : $(code POST /api/v1/system/settings -H 'Content-Type: application/json' -d '{"groq_api_key":"gsk_qa_not_a_real_key","groq_model":"llama-3.3-70b-versatile","groq_enabled":true}')"
python -c "import sys,json; d=json.load(open(sys.argv[1], encoding='utf-8')); print(json.dumps({'groq_api_key': d['groq_api_key_masked'], 'groq_model': d['groq_model'], 'groq_enabled': d['groq_enabled']}))" "$QA_TMP/settings.before.json" > "$QA_TMP/settings.same.json"
echo "re-save unchanged  : $(code POST /api/v1/system/settings -H 'Content-Type: application/json' -d @"$QA_TMP/settings.same.json")"
apij GET /api/v1/system/settings | show
```
Expected: บรรทัดแรก `masked ok: True` (เป็นรูป `xxxxxx...yyyy` หรือ `********` ไม่ใช่คีย์เต็ม) และ `key present: True | enabled: True` (เป็น `False | False` ได้เฉพาะเมื่อเจ้าของยืนยันว่าไม่ใช้ Groq); `anon POST` = `401`; `fake key (enabled)` = `400` (API ตรวจคีย์กับ Groq ก่อนบันทึก จึงไม่มีอะไรถูกบันทึก); `re-save unchanged` = `200` (ค่า masked ที่ส่งกลับไปหมายถึง "ใช้คีย์เดิม"); บรรทัดสุดท้ายเหมือนบรรทัดแรกทุกค่า ถ้าต่างให้ลง FAIL พร้อมสองบรรทัดนั้น ห้ามพิมพ์เนื้อไฟล์ `settings.before.json` ลงรายงาน

- [ ] **Step 2: Alert routing ด้วย secret จริง**

```bash
source scripts/qa/lib.sh
curl -s -w '\nHTTP %{http_code}\n' -H 'Content-Type: application/json' -H "X-Webhook-Secret: $(envval ALERT_WEBHOOK_SECRET)" \
  -d '{"alerts":[{"annotations":{"summary":"qa grafana-shape alert","description":"qa"},"labels":{"severity":"info"}}]}' "$BASE/api/v1/system/alert"
docker compose logs --tail 20 api | grep -i "ALERT" | tail -5
```
Expected: `HTTP 200` และ log ของ api มี `[ALERT ROUTER] Routing alert: qa grafana-shape alert` (ถ้าไม่มี Slack/LINE ตั้งไว้ จะเห็นบรรทัด "No external channels configured")

- [ ] **Step 3: Remediation tickets**

```bash
source scripts/qa/lib.sh
apij GET /api/v1/system/remediations | python -c "import sys,json; d=json.load(sys.stdin); t=d if isinstance(d,list) else d.get('tickets',d); print(type(t).__name__, len(t))"
api POST /api/v1/system/remediations/not-a-real-ticket/resolve
```
Expected: รายการอ่านได้ และ ticket ปลอมได้ `404` (ถ้ามี ticket OPEN จริง 1 ใบ ให้ลอง resolve แล้วตรวจว่าสถานะใน `sdoqap_upstream_remediations` เปลี่ยน)

- [ ] **Step 4: Grafana — datasource และ alert rules ที่ provision ไว้**

```bash
source scripts/qa/lib.sh
G=http://localhost:3002
curl -s -u admin:admin "$G/api/datasources" | python -c "import sys,json; print([(d['name'],d['type']) for d in json.load(sys.stdin)])"
curl -s -u admin:admin "$G/api/v1/provisioning/alert-rules" | python -c "import sys,json; print([r['title'] for r in json.load(sys.stdin)])"
```
Expected: datasource ชนิด `elasticsearch` และ alert rules มีอย่างน้อย `Data Quality Score Critical Drop` กับ `Data Quarantine Rate High` (ถ้า login ด้วย admin/admin ไม่ได้ เพราะเปลี่ยนรหัสแล้ว ให้ทดสอบผ่านเบราว์เซอร์ใน Task 13 และลง SKIP ข้อนี้) **หมายเหตุ:** repo ไม่ได้ provision dashboard ไว้ (มีเฉพาะ datasource + alerting) ดังนั้น README ที่ว่า "ดูผลผ่าน Grafana" หมายถึง Explore หรือ dashboard ที่สร้างเอง

จากนั้นตรวจว่า Grafana ส่ง alert ถึง API ได้จริงพร้อมคีย์ (แก้ไว้ในแผน api-route-completeness Task 4): เปิด `http://localhost:3002` → Alerting → Contact points → `SDOQAP Alert Router Webhook` → Test → Send test notification แล้วรัน

```bash
source scripts/qa/lib.sh
docker compose logs --since 3m api 2>/dev/null | grep '"POST /api/v1/system/alert HTTP/1.1"' | tail -3
```
Expected: Grafana แจ้ง `Test alert sent` และ log บรรทัดล่าสุดลงท้าย `200 OK` ถ้าเป็น `401` แปลว่า Grafana ไม่ได้ส่ง `Authorization: Bearer` (ตรวจว่า container มีตัวแปร: `docker exec sdoqap-grafana sh -c '[ -n "$ALERT_WEBHOOK_SECRET" ] && echo set || echo missing'`) ให้ลง FAIL

- [ ] **Step 5: Kibana และ Elasticsearch health**

```bash
source scripts/qa/lib.sh
curl -s -o /dev/null -w 'kibana status HTTP %{http_code}\n' http://localhost:5601/api/status
es /_cluster/health | python -c "import sys,json; d=json.load(sys.stdin); print(d['status'], d['number_of_nodes'])"
```
Expected: Kibana `HTTP 200` (หรือ 401 ถ้าเปิด auth ซึ่งนับว่า service ตอบ) และ cluster `green` หรือ `yellow`

- [ ] **Step 6: n8n — workflow ที่ active และ webhook ingest**

```bash
source scripts/qa/lib.sh
echo "inactive/active probe: $(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:5678/webhook/1/webhooktrigger/ingest -H 'Content-Type: application/json' -d '{"source_type":"none"}')"
PW=$(envval POSTGRES_PASSWORD); PW=${PW:-sdoqap}
curl -s -w '\nHTTP %{http_code}\n' -X POST http://localhost:5678/webhook/1/webhooktrigger/ingest -H 'Content-Type: application/json' \
  -d "$(printf '{"source_type":"rdbms","table_name":"qa_sales_n8n","db_type":"postgresql","host":"postgres","port":5432,"username":"sdoqap","password":"%s","database":"sdoqap_oltp","query":"SELECT * FROM qa_sales"}' "$PW")"
sleep 30
apij GET /api/v1/pipeline | python -c "import sys,json; print([ (r.get('table_name'), r.get('status') or r.get('state')) for r in json.load(sys.stdin) if 'qa_sales_n8n' in str(r)][:3])"
```
Expected: webhook ตอบ `200` (URL นี้เพราะ node ใน `ingestion_workflow.json` ไม่มี `webhookId` n8n จึงลงทะเบียนเป็น `/webhook/<workflowId>/<ชื่อ node ตัวพิมพ์เล็ก>/<path>` ไม่ใช่ `/webhook/ingest`; ถ้าได้ `404` แปลว่า workflow ยังไม่ active ให้เปิดใน n8n UI แล้วทดสอบใหม่; ถ้าเปิดไม่ได้ให้ลง FAIL) และภายใน ~30 วินาทีมี run ของ `qa_sales_n8n` ปรากฏ แล้วตรวจ `last_quality qa_sales_n8n` ได้ `total_records` = `500`

- [ ] **Step 7: Retention cleanup (ทำลายข้อมูล ต้องถามเจ้าของก่อน)**

ตรวจแบบอ่านอย่างเดียวก่อน:

```bash
source scripts/qa/lib.sh
es "/sdoqap_quality_runs/_search" '{"size":0,"query":{"range":{"timestamp":{"lt":"now-30d"}}}}' | python -c "import sys,json; print('docs older than 30d:', json.load(sys.stdin)['hits']['total']['value'])"
```
Expected: แสดงจำนวนเอกสารที่ cleanup จะลบ ถ้าเป็น `0` (ระบบนี้เพิ่งถูกใช้ไม่ถึง 30 วัน) ค่อยรัน `api POST /api/v1/system/cleanup` ได้ `HTTP 200` `{"status":"triggered"}` แล้วดู `docker compose logs --tail 20 api` ว่ามี `[CLEANUP JOB] Finished successfully.` จากนั้นทดสอบทางที่ n8n ใช้ (service key ไม่มี cookie): `anon POST /api/v1/system/cleanup -H "X-Service-Key: $(envval INGEST_SERVICE_KEY)"` ต้องได้ `200` และ `anon POST /api/v1/system/cleanup -H 'X-Service-Key: nope'` ต้องได้ `401` ถ้าจำนวนเอกสารไม่เป็น `0` **ห้ามรันทั้งสองทาง** ให้ลง `SKIP` และถามเจ้าของก่อน (เส้นนี้จะขึ้น `AUTH_ONLY` ใน Task 14B ซึ่งเป็นข้อยกเว้นที่ยอมรับได้เมื่อมีเหตุผลนี้)

- [ ] **Step 8: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T12.1 "settings masking + POST (คีย์ปลอมถูกปฏิเสธ, บันทึกซ้ำไม่เปลี่ยนค่า)" PASS "-"
qa_record T12.2 "alert routing ด้วย webhook secret" PASS "-"
qa_record T12.3 "remediation tickets" PASS "-"
qa_record T12.4 "Grafana datasource + alert rules" PASS "ไม่มี dashboard ที่ provision"
qa_record T12.5 "Kibana + ES health" PASS "-"
qa_record T12.6 "n8n webhook -> ingest RDBMS" PASS "-"
qa_record T12.7 "retention cleanup" SKIP "รอเจ้าของยืนยัน (ข้อมูลเก่ากว่า 30 วัน = ?)"
git add docs/testing && git commit -m "test(qa): task 12 ops results"
```

---

### Task 13: UI walkthrough ทุกหน้า (ในเบราว์เซอร์จริง)

ใช้ built-in browser pane (หรือ Chrome) ที่ `http://localhost` ทุกข้อ: เปิด DevTools Console/ดู `read_console_messages` และต้อง **ไม่มี error สีแดงที่เกิดจากการใช้งานปกติ** เก็บ screenshot ที่ `docs/testing/evidence/ui-<หน้า>.png`

- [ ] **Step 1: เข้าหน้าที่ป้องกันโดยไม่ login → เด้งไป `/login`**
  เปิด `/dashboard` ขณะยังไม่ login Expected: redirect ไป `/login` ไม่เห็นข้อมูล

- [ ] **Step 2: Login ผิดแล้วถูก**
  ใส่รหัสผิด Expected: แสดงข้อความผิดพลาด ไม่เข้าระบบ; ใส่ถูก (ค่าจาก `.env`) Expected: เข้าหน้าแรก, NavBar มีปุ่ม Logout

- [ ] **Step 3: Home `/`**
  Expected: แสดง health ของ service (Live Infrastructure Connections), AVG Quality Score / Records Checked / Quarantine Rate เป็นตัวเลขจริง, ปุ่ม "เริ่มนำเข้าข้อมูล" พาไป `/ingestion`

- [ ] **Step 4: Data Ingestion `/ingestion` (4 แหล่ง)**
  - File: อัปโหลด `qa_scores_x.xlsx` ตั้งชื่อตาราง `qa_ui_file` → เห็นสถานะ queued → เสร็จ และผลตรวจขึ้น (จำนวนแถว, คอลัมน์)
  - Database: เลือก PostgreSQL กรอก host `postgres` port `5432` db `sdoqap_oltp` query `SELECT * FROM qa_sales` → สำเร็จ; เลือก MySQL หรือ SQL Server → **ต้องแจ้ง error ที่อ่านเข้าใจ** (backend รองรับเฉพาะ PostgreSQL) ไม่ใช่ปล่อยเงียบหรือขึ้น 500 ดิบ
  - API: ใส่ URL ของ data.go.th → สำเร็จ; ใส่ `https://example.com/x.json` → แสดงข้อความว่า host ไม่อยู่ใน allowlist
  - Stream: เห็นช่องกรอก Kafka brokers/topic/consumer group และสั่ง start/stop ได้ตาม Task 5

- [ ] **Step 5: Expectations & Alerts `/rules`**
  เลือกตาราง `qa_scores` → แก้ Base Target Score แล้วบันทึก → รีโหลดหน้าค่ายังอยู่; ดู Column Profiler, YAML DSL Export; AI Advisor Settings (ไม่มีคีย์ต้องแจ้งชัดเจน); Upstream Remediation Governance แสดง ticket ตาม Task 12
  Expected: ค่าที่บันทึกตรงกับ `GET /api/v1/rules/qa_scores` และ **คืนค่าเดิมหลังเทส** (`git diff services/spark/rules_config.json` ว่าง)

- [ ] **Step 6: Jobs & Pipelines `/pipeline`**
  Expected: Recent Pipeline Ingestion Runs มี run จาก Task 2–4 พร้อมสถานะ SUCCESS/FAILED/QUARANTINED, ตัวกรองตาราง/สถานะใช้ได้, ปุ่มก่อนหน้า/ถัดไป แบ่งหน้าถูก, Quality Audit Logs เปิดดูรายละเอียดได้, ปุ่ม Retry ทำงาน

- [ ] **Step 7: Workspace Exports `/export`**
  เลือก Target Data Layer ครบ Raw/Active/Quarantine, Dataset Preview 10 แถว, ตั้งชื่อไฟล์แล้วดาวน์โหลดและเปิดไฟล์ได้, Gold Metric (Daily Quality, Error Patterns, COPDQ, Schema Drift) ช่วง 7/14/30 วัน, Reddit Dataset
  Expected: ไฟล์ที่ดาวน์โหลดจำนวนแถวตรง Task 9; **ดู Raw preview เป็นพิเศษ** (D-3)

- [ ] **Step 8: Dashboards `/dashboard`**
  ลองตัวกรอง Time (24h/7d/30d), Severity, Business Area, Table; Health Score, Quality Leaderboard, COPDQ breakdown, Lineage flow, Run Inspector, Live log stream
  Expected: ตัวเลขบนการ์ดตรงกับ `qa_*` ใน ES (เช่น `qa_scores` total_records 1030), ตัวกรองเปลี่ยนข้อมูลจริง ไม่ใช่แค่ซ่อนการ์ด

- [ ] **Step 9: Query & Metrics `/analytics`**
  สลับช่วง 7/14/30 วัน Expected: กราฟแนวโน้ม/ projection/ Stability Index เปลี่ยนตามช่วงและสอดคล้องกับ `/api/v1/analytics/*`

- [ ] **Step 10: Catalog `/schema`**
  Expected: proposal จาก Task 8 แสดงในรายการ, แก้ Primary Key/Partition Date ก่อน approve ได้, approve/reject แล้ว badge ที่ NavBar ลดตาม (badge รออนุมัติอัปเดตทุก 10 วินาที)

- [ ] **Step 11: Audit Trail `/whitebox`**
  เดินตามขั้น สถิติข้อมูลดิบ → บริบทธุรกิจ → กฎที่ระบบเสนอ → คัดแยก 3 ทาง → ตรวจผลและใช้งาน → เชื่อมโยงตาราง Expected: ตัวเลขสามโซนตรง Task 11 และหน้า Human Review Queue ทำงาน (เปลี่ยนชุดข้อมูลแล้วคืนชุดเดิมตาม Task 11 Step 7)

- [ ] **Step 12: Learn & Architecture `/guide` และ `/guideline`**
  Expected: เปิดได้ทั้งสอง path เนื้อหาโหลดครบ ไม่มี link เสีย

- [ ] **Step 13: Logout**
  Expected: กลับสู่สถานะไม่ login และเปิด `/dashboard` แล้วเด้ง `/login` อีกครั้ง

- [ ] **Step 14: Responsive smoke**
  ปรับ viewport เป็น mobile (375×812) และ tablet (768×1024) เปิด Home, Ingestion, Dashboard Expected: ไม่มี horizontal scroll ที่ทำให้ใช้งานไม่ได้, เมนูพับ/กางได้

- [ ] **Step 15: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T13.1 "auth redirect/login/logout ใน UI" PASS "-"
qa_record T13.2 "Home" PASS "-"
qa_record T13.3 "Ingestion 4 แหล่ง + error ที่อ่านเข้าใจ" PASS "-"
qa_record T13.4 "Rules" PASS "-"
qa_record T13.5 "Pipeline" PASS "-"
qa_record T13.6 "Exports" PASS "-"
qa_record T13.7 "Dashboards" PASS "-"
qa_record T13.8 "Analytics" PASS "-"
qa_record T13.9 "Catalog" PASS "-"
qa_record T13.10 "Audit Trail" PASS "-"
qa_record T13.11 "Guide + responsive" PASS "-"
git add docs/testing && git commit -m "test(qa): task 13 UI walkthrough results"
```

---

### Task 14: Resilience และ scale smoke

**ทำหลังสุดของการเทสเชิงฟังก์ชัน** เพราะมีการหยุด container ต้องคืนสถานะทุกครั้งและยืนยัน healthy

- [ ] **Step 1: Spark worker ล่ม ระหว่างมี run**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
docker stop sdoqap-spark-worker
RES=$(apij POST /api/v1/pipeline/ingest/csv -F table_name=qa_resil -F "file=@$ROOT/data/samples/student_scores/student_scores_sample.csv"); echo "$RES"
sleep 60; apij GET /api/v1/pipeline/runs/"$(echo "$RES" | jget ingest_id)" | jget state
curl -s "$BASE/api/v1/services/status" | redact | python -c "import sys,json; d=json.load(sys.stdin); print('worker:', d['Spark Worker']['status'])"
docker start sdoqap-spark-worker
```
Expected: ต้องไม่หายเงียบ: state เป็น `QUEUED`/`RUNNING` ค้าง (รอ worker) หรือ `FAILED` พร้อมเหตุผล และ services/status แสดง `Spark Worker` เป็น `offline` หลังกลับมาแล้ว run ต้องไปต่อหรือ retry ได้ (`wait_run` ได้ SUCCEEDED หลัง `POST /pipeline/retry/<id>`) ถ้า run ค้างตลอดไปโดยไม่มีสถานะ ให้ลง FAIL

- [ ] **Step 2: Postgres ล่ม ระหว่าง RDBMS ingest**

```bash
source scripts/qa/lib.sh
PW=$(envval POSTGRES_PASSWORD); PW=${PW:-sdoqap}
docker stop sdoqap-postgres
api POST /api/v1/pipeline/ingest/rdbms -H 'Content-Type: application/json' -d "$(printf '{"table_name":"qa_resil_db","host":"postgres","port":5432,"username":"sdoqap","password":"%s","database":"sdoqap_oltp","query":"SELECT 1"}' "$PW")" | tail -c 400
docker start sdoqap-postgres
```
Expected: ได้ error ที่อ่านเข้าใจ (4xx/5xx พร้อม detail) ไม่ใช่ traceback รั่ว และ **ไม่สร้างโฟลเดอร์ขยะ** `qa_resil_db` ใน `/data/raw` (เช็กด้วย `hdfs dfs -ls /data/raw`)

- [ ] **Step 3: API ตอบผ่าน nginx หลัง container ถูกสร้างใหม่**

```bash
source scripts/qa/lib.sh
docker restart sdoqap-api
for i in $(seq 1 24); do c=$(anon GET /api/v1/services/status); [ "$c" = 200 ] && echo "api back via nginx after ~$((i*5))s" && break; sleep 5; done
```
Expected: กลับมา `200` ภายใน ~2 นาที โดยไม่ต้องรีสตาร์ท nginx (เหตุผลของ resolver ใน `infra/nginx/nginx.conf`)

- [ ] **Step 4: ยืนยันว่าทุกอย่างกลับมา healthy**

```bash
source scripts/qa/lib.sh
sleep 20; docker compose ps --format '{{.Name}} {{.Status}}' | grep -v -E 'healthy|Up' || echo ALL_UP
```
Expected: `ALL_UP` (ยกเว้น ollama ที่ unhealthy มาตั้งแต่ก่อนเริ่ม)

- [ ] **Step 5: Scale smoke (10,000 แถวเท่านั้น)**

```bash
source scripts/qa/lib.sh
python scripts/evaluation/run_scale_benchmark.py 10000 2>&1 | tee "$EVID/t14-scale-10000.txt" | tail -10
```
Expected: จบโดยไม่ error และเวลาใกล้เคียง `data/evaluation/output/bench_10000.json` (ไม่เกิน 2 เท่าของค่าเดิม) ขนาด 100k–1M ใช้เวลานาน ให้รันแยกเมื่อเจ้าของต้องการเท่านั้น

- [ ] **Step 6: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T14.1 "Spark worker ล่ม -> สถานะชัดเจน, retry ได้" PASS "-"
qa_record T14.2 "Postgres ล่ม -> error อ่านเข้าใจ ไม่มีขยะ" PASS "-"
qa_record T14.3 "restart api แล้ว nginx กลับมาเอง" PASS "-"
qa_record T14.4 "scale 10k" PASS "t14-scale-10000.txt"
git add docs/testing && git commit -m "test(qa): task 14 resilience and scale results"
```

---

### Task 14B: เส้น API ที่ task อื่นยังไม่ได้เรียก และประตูตรวจว่าเรียกครบทุกเส้น

ทำหลัง Task 14 และก่อน Task 15 (ต้องยังมีตาราง `qa_scores`) เอนจิน White-box ต้องถือชุดประเมินเดิมอยู่ (Task 11 Step 7 คืนไว้แล้ว) และไม่มีคนใช้หน้า Audit Trail ระหว่างเทส

**Files:** ไม่สร้างไฟล์โค้ด; สร้าง `docs/testing/evidence/route-coverage.md`

**Interfaces:**
- Consumes: helper ของ Task 0 (รวม `direct`, `$CALLS`, `$API_DIRECT`); `scripts/qa/route_coverage.py` จากแผน api-route-completeness (CLI: `--openapi <url|file> --calls <log>` พิมพ์ตารางและบรรทัดสรุป `routes=N OK=a REACHED=b AUTH_ONLY=c UNTESTED=d`); ตาราง `qa_scores`
- Produces: `docs/testing/evidence/route-coverage.md`

- [ ] **Step 1: เส้นนอก `/api/` (ยิงตรงที่พอร์ตของ API เพราะ nginx ส่งต่อเฉพาะ `/api/`)**

```bash
source scripts/qa/lib.sh
for r in "GET /" "GET /health" "POST /health" "GET /healthz"; do set -- $r; printf '%-13s %s\n' "$r" "$(direct "$1" "$2")"; done
```
Expected: ทั้งสี่บรรทัด `200`

- [ ] **Step 2: รายละเอียดของ run เดียว**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
RID=$(apij GET "/api/v1/pipeline?limit=100" | python -c "import sys,json; r=[x for x in json.load(sys.stdin) if x.get('table_name')=='qa_scores']; print(r[0].get('run_id','') if r else '')")
echo "run_id: $RID"
apij GET "/api/v1/pipeline/$RID" | python -c "import sys,json; d=json.load(sys.stdin); print(sorted(d.keys())); print('audits:', len(d['quality_audits']), '| table:', d['run_details'].get('table_name'))"
echo "unknown run: $(code GET /api/v1/pipeline/no-such-run)"
```
Expected: `run_id` ไม่ว่าง; keys เป็น `['is_acknowledged', 'quality_audits', 'run_details', 'schema_drift_alerts']`; `table: qa_scores` (จดจำนวน `audits` ลง note: run ที่ผ่านการตรวจคุณภาพต้องมี ≥ 1, run ที่ถูกบล็อกเพราะ drift อาจเป็น 0); `unknown run: 404`

- [ ] **Step 3: สร้าง schema proposal ผ่านเส้นที่ UI ใช้ และ approve-all**

```bash
source scripts/qa/lib.sh
RES=$(apij POST /api/v1/schema/proposals/create -H 'Content-Type: application/json' -d '{"table_name":"qa_scores","column_name":"qa_created_col","column_type":"StringType","drift_type":"new_column"}')
echo "$RES" | python -c "import sys,json; d=json.load(sys.stdin); print(d['status'], d['id'])"
api POST "/api/v1/schema/proposals/$(echo "$RES" | jget id)/reject" | tail -1
P=$(apij GET /api/v1/schema/proposals | python -c "import sys,json; print(len(json.load(sys.stdin)['proposals']))")
echo "pending now: $P"
[ "$P" = 0 ] && api POST /api/v1/schema/proposals/approve-all
```
Expected: `created <id>`; reject ได้ `HTTP 200`; `pending now: 0`; approve-all ได้ `{"message":"No pending proposals found."}` และ `HTTP 200` **คำเตือน:** approve-all อนุมัติ proposal ของ *ทุกตาราง* ถ้า `pending now` ไม่เป็น `0` บรรทัดสุดท้ายจะไม่รัน: ถ้าที่ค้างเป็นของตาราง `qa_*` ทั้งหมด ให้ reject ทีละรายการด้วย `api POST /api/v1/schema/proposals/<id>/reject` แล้วรันสองบรรทัดสุดท้ายใหม่ ถ้ามีของตารางอื่นค้างอยู่ให้ลง `SKIP` พร้อมเหตุผล (เส้นนี้จะขึ้น `AUTH_ONLY` ใน Step 8)

- [ ] **Step 4: Standardization approve / reject / override กับรายการจริง**

ใส่รายการทดสอบ 3 รายการลงคิวเอง (ผูกกับตาราง `qa_scores` เท่านั้น) approve และ override เขียน mapping ลง `services/spark/rules_config.json` จึง backup ก่อนและคืนค่าหลังเทส

```bash
source scripts/qa/lib.sh
cp services/spark/rules_config.json "$QA_TMP/rules_config.before_std.json"
for I in qa_std_approve qa_std_reject qa_std_override; do
  printf '%-16s ' $I; es "/sdoqap_unmapped_terms/_doc/$I?refresh=true" '{"table_name":"qa_scores","column_name":"course","unmapped_value":"qa value","suggested_category":"qa suggested","status":"PENDING_REVIEW","priority":1}' | python -c "import sys,json; print(json.load(sys.stdin).get('result'))"
done
apij GET /api/v1/standardize/review-queue | python -c "import sys,json; print('queued qa items:', sum(1 for i in json.load(sys.stdin)['items'] if i['id'].startswith('qa_std_')))"
api POST /api/v1/standardize/review-queue/qa_std_approve/approve | tail -2
api POST /api/v1/standardize/review-queue/qa_std_reject/reject | tail -2
api POST /api/v1/standardize/review-queue/qa_std_override/override -H 'Content-Type: application/json' -d '{"approved_category":"qa approved"}' | tail -2
echo "mapping written: $(grep -c '"qa value": "qa approved"' services/spark/rules_config.json)"
echo "already processed: $(code POST /api/v1/standardize/review-queue/qa_std_reject/reject)"
cp "$QA_TMP/rules_config.before_std.json" services/spark/rules_config.json
git diff --stat services/spark/rules_config.json
es "/sdoqap_unmapped_terms/_delete_by_query?refresh=true" '{"query":{"ids":{"values":["qa_std_approve","qa_std_reject","qa_std_override"]}}}' | python -c "import sys,json; print('queue docs deleted', json.load(sys.stdin).get('deleted'))"
es "/sdoqap_mapping_reviews/_delete_by_query?refresh=true" '{"query":{"term":{"table_name.keyword":"qa_scores"}}}' | python -c "import sys,json; print('review logs deleted', json.load(sys.stdin).get('deleted'))"
```
Expected: สามรายการ `created`; `queued qa items: 3`; approve, reject, override ได้ `HTTP 200` ทั้งสาม (ข้อความ `Item approved and added to memory mapping.`, `Item rejected.`, `Item overridden and added to memory mapping.`); `mapping written: 1`; `already processed: 400`; หลังคืนค่า `git diff --stat` ว่าง; `queue docs deleted 3`

- [ ] **Step 5: White-box: profile ไฟล์ที่อัปโหลด, ดูแถวต่อโซน, แก้ค่ากฎ**

```bash
source scripts/qa/lib.sh
apij POST /api/v1/whitebox/profile/upload -F "file=@$ROOT/data/samples/student_scores/student_scores_sample.csv" -F dataset_name=qa_profile | python -c "import sys,json; d=json.load(sys.stdin); print('rows', d.get('total_rows'), 'cols', d.get('total_columns'))"
for Z in raw clean review quarantine; do printf '%-11s ' $Z; apij GET "/api/v1/whitebox/preview-zone/$Z?limit=5" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d['rows']), 'of', d['total_zone_rows'])"; done
apij GET "/api/v1/whitebox/preview-zone/raw?limit=5&search=zzzz-no-such-text" | python -c "import sys,json; d=json.load(sys.stdin); print('search hits:', d['matched_rows'])"
M=$(apij GET /api/v1/whitebox/state | jget tukey_multiplier); echo "tukey before: $M"
apij POST /api/v1/whitebox/state -H 'Content-Type: application/json' -d '{"tukey_multiplier":"1.5"}' | python -c "import sys,json; d=json.load(sys.stdin); print('tukey', d['tukey_multiplier'], '| review rows', d['metrics']['review_rows'])"
apij POST /api/v1/whitebox/state -H 'Content-Type: application/json' -d "{\"tukey_multiplier\":\"$M\"}" | python -c "import sys,json; d=json.load(sys.stdin); print('tukey', d['tukey_multiplier'], '| review rows', d['metrics']['review_rows'])"
```
Expected: `rows 1030 cols 6`; สี่โซนได้ `5 of 10100`, `5 of 9400`, `5 of 100`, `5 of 600` (ชุดประเมินเดิม ตรงกับ T11.1); `search hits: 0`; `tukey before: 3.0`; หลังแก้เป็น `1.5` จำนวน review rows ต้อง **ต่างจาก** `100` (ค่ากฎเปลี่ยนแล้วผลคัดแยกต้องเปลี่ยนตาม เช่นในหลักฐาน `docs/whitebox-report/evidence/01-state*.json` ชุดสาธิตเปลี่ยนจาก 12 เป็น 24 ถ้าเท่าเดิมให้ลง FAIL); หลังคืนค่า `tukey 3.0 | review rows 100`

- [ ] **Step 6: White-box: execute, ตัวเชื่อมแหล่งข้อมูล, คำอธิบายจาก AI**

```bash
source scripts/qa/lib.sh
apij POST /api/v1/whitebox/recommend-rules | python -c "import sys,json; print(json.dumps({'dataset_name':'student_course_score','rules':json.load(sys.stdin)['recommendations']}))" > "$QA_TMP/execute_body.json"
apij POST /api/v1/whitebox/execute -H 'Content-Type: application/json' -d @"$QA_TMP/execute_body.json" | python -c "import sys,json; d=json.load(sys.stdin); print(d['total_rows_ingested'], d['clean_rows'], d['review_rows'], d['quarantine_rows'])"
echo "execute without rules: $(code POST /api/v1/whitebox/execute -H 'Content-Type: application/json' -d '{}')"
apij POST /api/v1/whitebox/ingest-source -H 'Content-Type: application/json' -d '{"source_type":"RDBMS","table_name":"qa_conn","connection_uri":"postgres"}' | python -c "import sys,json; d=json.load(sys.stdin); print(d['status'], '| simulated:', d['simulated'], '| rows:', d['rows_ingested'])"
api POST /api/v1/whitebox/upload-csv -F "file=@$ROOT/data/evaluation/student_course_score_evaluation_dataset/dirty_dataset.csv" | tail -1
apij POST '/api/v1/whitebox/ai-context-explanations?force=true' | python -c "import sys,json; d=json.load(sys.stdin); print('available:', d['available'], '| live:', d['ai_live_generated'], '| engine:', d['engine'])"
```
Expected: execute ได้ `10100 9400 100 600` (ถ้าต่างให้ลง FAIL พร้อมตัวเลขจริง); `execute without rules: 422` (ขาด field `rules`); ingest-source ได้ `connected_and_profiled | simulated: True | rows: 10100` (ตัวเชื่อมนี้ไม่ได้ต่อแหล่งจริง ระบบต้องบอกเองว่า simulated); upload คืนชุดเดิมได้ `HTTP 200`; AI context ได้ `available: True | live: True | engine: Groq openai/gpt-oss-120b` (ถ้าเจ้าของยืนยันว่าไม่ใช้ Groq จะเป็น `live: False | engine: SDOQAP rule-based summary` ซึ่งถูกต้องสำหรับกรณีนั้น ถ้ามีคีย์แต่ `live: False` ให้ลง FAIL พร้อม `docker compose logs --tail 30 api | grep "AI Context LLM fallback"`)

- [ ] **Step 7: เส้น Reddit กรณี Task 5 ถูก SKIP**

รันเฉพาะเมื่อ Task 5 ถูก SKIP (ไม่ได้เปิด profile `streaming` หรือไม่มีอินเทอร์เน็ต) เพื่อให้เส้นอ่านอย่างเดียวถูกเรียกอย่างน้อยหนึ่งครั้ง:

```bash
source scripts/qa/lib.sh
echo "reddit status: $(code GET /api/v1/pipeline/ingest/reddit/status) | export reddit: $(code GET '/api/v1/export/reddit?subreddit=python')"
```
Expected: ได้ status code ทั้งสองค่า (ค่าใดก็ได้ที่ไม่ใช่ `000`) จดค่าจริงลง note เส้น `POST /pipeline/ingest/reddit` และ `POST /pipeline/ingest/reddit/stop` ไม่เรียกเมื่อไม่มี Kafka (จะขึ้น `AUTH_ONLY`/`UNTESTED` ใน Step 8 เป็นข้อยกเว้นที่มีเหตุผล)

- [ ] **Step 8: ประตูตรวจ: ทุกเส้นถูกเรียกจริง**

```bash
source scripts/qa/lib.sh
python scripts/qa/route_coverage.py --openapi "$API_DIRECT/openapi.json" --calls "$CALLS" > "$EVID/route-coverage.md"; echo "exit $?"
tail -1 "$EVID/route-coverage.md"
grep -E '^\| (UNTESTED|AUTH_ONLY|REACHED) ' "$EVID/route-coverage.md"
```
Expected: `exit 0` และบรรทัดสรุป `routes=94 OK=<n> REACHED=<m> AUTH_ONLY=0 UNTESTED=0` เกณฑ์ตัดสิน:
- `UNTESTED` หรือ `AUTH_ONLY` ที่ยอมรับได้มีเฉพาะเส้นที่ถูก SKIP อย่างมีเหตุผลใน task ก่อนหน้า: `POST /api/v1/system/cleanup` (T12.7 มีข้อมูลเก่ากว่า 30 วัน), `POST /api/v1/schema/proposals/approve-all` และ `reject-all` (มี proposal ของคนอื่นค้าง), `POST /api/v1/pipeline/ingest/reddit` และ `.../reddit/stop` (Task 5 SKIP) ถ้าเหลือเฉพาะเส้นเหล่านี้ให้ลง `PASS` พร้อมรายชื่อเส้นและเหตุผลใน note เส้นอื่นที่เหลือ = `FAIL`
- ทุกบรรทัด `REACHED` (handler ตอบแต่ไม่เคยสำเร็จ) ต้องอธิบายได้ใน note เช่น `POST /api/v1/standardize/rollback` ที่ตอบ 500 เมื่อไม่มี backup (Finding R-1) หรือ `POST /api/v1/system/remediations/{ticket_id}/resolve` ที่ได้ 404 เพราะไม่มี ticket จริง ถ้าอธิบายไม่ได้ให้ลง Finding
- ถ้า `routes` ไม่เท่ากับ `94` แปลว่ามี route เพิ่มหรือหายจากตอนเขียนแผน ให้จดจำนวนจริงและรายชื่อที่ต่างลง note (ไม่ใช่ FAIL ในตัวเอง)

- [ ] **Step 9: บันทึกผลและ commit**

```bash
source scripts/qa/lib.sh
qa_record T14B.1 "เส้นนอก /api/ (/, /health, /healthz)" PASS "-"
qa_record T14B.2 "pipeline run detail + 404" PASS "-"
qa_record T14B.3 "schema proposals create + approve-all" PASS "-"
qa_record T14B.4 "standardization approve/reject/override กับรายการจริง" PASS "-"
qa_record T14B.5 "whitebox profile/upload, preview-zone, state" PASS "-"
qa_record T14B.6 "whitebox execute, ingest-source, AI context" PASS "-"
qa_record T14B.7 "เรียกครบทุกเส้น API (route_coverage)" PASS "route-coverage.md: $(tail -1 "$EVID/route-coverage.md")"
git add docs/testing && git commit -m "test(qa): task 14B route completeness sweep and coverage gate"
```
(แก้ผลให้ตรงจริงก่อนรัน)

---

### Task 15: Cleanup และรายงานสรุป

- [ ] **Step 1: ลบข้อมูลทดสอบ `qa_*` ทั้งหมด (เฉพาะที่ขึ้นต้นด้วย `qa_`)**

```bash
source scripts/qa/lib.sh
qa_login >/dev/null
for T in $(apij GET /api/v1/export/tables | python -c "import sys,json; d=json.load(sys.stdin); t=d if isinstance(d,list) else d.get('tables',[]); print(' '.join(x if isinstance(x,str) else x.get('table_name','') for x in t))" | tr ' ' '\n' | grep '^qa_'); do
  printf '%-18s %s\n' "$T" "$(code DELETE /api/v1/export/tables/$T)"
done
docker exec sdoqap-postgres psql -U sdoqap -d sdoqap_oltp -c "drop table if exists qa_sales"
docker exec sdoqap-namenode hdfs dfs -ls /data/raw /data/active /data/quarantine 2>&1 | grep -c '/qa_' || true
```
Expected: ลบได้ `200` ทุกตาราง, Postgres `DROP TABLE`, และใน HDFS นับ `/qa_` ได้ `0` จากนั้น index ใน ES ที่ยังมี doc ของ `qa_*` (quality_runs, lineage_runs, pipeline_runs, schema_registry, schema_proposals) ให้ลบด้วย `_delete_by_query` ที่กรอง `table_name` ขึ้นต้น `qa_` เท่านั้น:

```bash
source scripts/qa/lib.sh
for IDX in sdoqap_quality_runs sdoqap_lineage_runs sdoqap_pipeline_runs sdoqap_runs sdoqap_schema_proposals sdoqap_schema_registry; do
  printf '%-28s ' $IDX
  es "/$IDX/_delete_by_query?refresh=true" '{"query":{"prefix":{"table_name.keyword":"qa_"}}}' | python -c "import sys,json; d=json.load(sys.stdin); print('deleted', d.get('deleted', d.get('error')))"
done
```
Expected: แต่ละ index รายงาน `deleted N` (N = จำนวน doc ของ `qa_*`) ตรวจซ้ำ: `es /sdoqap_quality_runs/_count` ต้องกลับเท่าจำนวนก่อนเริ่ม task 2 บวกรอบที่ไม่ใช่ `qa_`

- [ ] **Step 2: ตรวจว่าไม่ทิ้งของที่แก้ไว้**

```bash
source scripts/qa/lib.sh
git status --short
git diff --stat services/spark/rules_config.json services/spark/schema_registry.json
```
Expected: มีเฉพาะ `docs/testing/`, `scripts/qa/`; ไม่มี diff ใน `rules_config.json` และ `schema_registry.json`

- [ ] **Step 3: เขียนหัวข้อ Findings และสรุปลงรายงาน**

เพิ่มท้ายไฟล์ `docs/testing/2026-10-01-real-use-test-report.md` ตามนี้ (เติมจำนวนจากตารางผลจริง):

```markdown
## สรุป

รวม N ข้อ: PASS a · FAIL b · SKIP c  (นับจากตารางด้านบน)
สภาพแวดล้อม: วันที่/เวลา, commit (`git rev-parse --short HEAD`), profile ที่เปิด

## Findings (ไม่ได้แก้ในงานนี้)

| ID | ระดับ | พบที่ | รายละเอียด | หลักฐาน |
|---|---|---|---|---|
| F-1 | สูง (ความปลอดภัย) | T1.6 | `GET /api/v1/services/status` ไม่ต้อง login และคืน URL ของ Elasticsearch พร้อมรหัสผ่าน | evidence/t1-status-credential-count.txt |
| D-1 | กลาง (เอกสาร) | T3.1 | README บอกว่า API host ใดก็ได้ถ้าไม่ตั้ง `API_INGEST_ALLOWED_HOSTS` แต่โค้ดตั้ง fail-closed | `services/api/app/api/ingest_guards.py` |
| D-3 | แก้แล้ว | T9.2 | preview/download ของ layer `raw` เคยอ่าน path เก่า แก้ในแผน api-route-completeness Task 2 (ลงผลยืนยันจาก T9.1–T9.2) | ผล T9.2 |
| R-1 | ต่ำ | T6.6 / T14B.8 | `POST /api/v1/standardize/rollback` ตอบ 500 แทน 400 เมื่อไม่มี backup (`HTTPException(400)` ถูก `except Exception` ครอบ) | `services/api/app/api/standardize.py` |
| R-2 | กลาง (ความปลอดภัย) | T1.2 | `GET /api/v1/whitebox/run-all` ไม่ต้อง login แต่รัน pipeline ทั้งชุดและเขียนไฟล์ผลลัพธ์ (ฝั่ง `POST` ต้อง login) ลงเฉพาะเมื่อ T1.2 ได้ 200 | ผล T1.2 |
```
จากนั้นเพิ่มแถวสำหรับทุก FAIL ที่พบระหว่างเทส (หนึ่งแถวต่อหนึ่งปัญหา ระบุ Task/ขั้นตอนที่พบ, สิ่งที่เห็นจริง, สิ่งที่คาด)

- [ ] **Step 4: commit รายงานสุดท้าย**

```bash
source scripts/qa/lib.sh
git add docs/testing scripts/qa
git commit -m "docs(qa): real-use feature test report and cleanup"
```

---

## Self-Review

**Spec coverage:** ตรวจ feature inventory ทุกตัวเทียบ Coverage Matrix: auth (T1), ingest file/API/RDBMS/stream (T2–5), rules/AI/standardize (T6), pipeline runs/retry/ack (T7), schema (T8), export/gold export/delete (T9), KPI/analytics/gold/lineage/trust (T10), white-box + multi-table (T11), settings/alert/remediation/Grafana/Kibana/n8n/retention (T12), ทุกหน้า UI (T13), resilience/scale (T14), เส้น API ที่เหลือและประตูตรวจ coverage (T14B), cleanup/report (T15) **API ทุกเส้น:** ตรวจเทียบ 94 เส้น (method + path) จากโค้ดกับคำเรียกในแผน เส้นที่เดิมไม่มี task ใดเรียกได้ถูกเพิ่มแล้ว: `GET /export/active|quarantine/{table}` (T9.2), `POST /system/settings` (T12.1), `POST /system/cleanup` ทาง service key (T12.7), `GET /pipeline/{run_id}`, `POST /schema/proposals/create`, `POST /schema/proposals/approve-all`, `POST /standardize/review-queue/{id}/reject|override`, `POST /whitebox/profile/upload`, `GET /whitebox/preview-zone/{zone}`, `POST /whitebox/state`, `POST /whitebox/execute`, `POST /whitebox/ingest-source`, `POST /whitebox/ai-context-explanations`, `GET /`, `GET|POST /health`, `GET /healthz` (T14B) และ T14B Step 8 พิสูจน์ด้วย `route_coverage.py` จาก log การเรียกจริง ที่ยังไม่ครอบคลุมโดยตั้งใจ: ขนาด 100k–1M แถว (รันแยกตามที่เจ้าของต้องการ), Swarm HA (`infra/swarm`), Prometheus (ไม่มีใน compose), การเข้ารหัส TLS (`SESSION_COOKIE_SECURE`)

**Placeholder scan:** ค่า `PASS` ใน `qa_record` เป็นค่าตั้งต้นที่ต้องแก้ตามผลจริงก่อนรัน (ระบุไว้ในแต่ละ task); ไม่มี TBD/TODO ในขั้นตอน; จุดที่รูปแบบ body ของ API ต้องเปิดดูจาก Swagger (`/docs`) ระบุไว้ตรงจุดพร้อมวิธีหา

**Consistency:** ชื่อ helper และตัวแปร (`qa_get scores_id`, `last_quality`, `wait_run`, `direct`, `$EVID`, `$QA_TMP`, `$CALLS`, `$API_DIRECT`) ตรงกับที่นิยามใน Task 0 ตลอด; รูปแบบบรรทัดของ `$CALLS` (`METHOD PATH STATUS`) ตรงกับที่ `scripts/qa/route_coverage.py` อ่าน; ตารางทดสอบทั้งหมดใช้ prefix `qa_` ตรงกับ cleanup ใน Task 15
