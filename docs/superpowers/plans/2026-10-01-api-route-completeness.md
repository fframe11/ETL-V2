# API Route Completeness & Caller Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ API ครบทุกเส้นที่ผู้เรียกใช้จริง (UI, n8n, Grafana) เรียกแล้วได้ผล, ให้ผู้เรียกแบบเครื่องต่อเครื่องทุกตัวมีคีย์ที่ปลายทางต้องการ, ให้ฟีเจอร์ LLM ได้คีย์ และมีเครื่องมือพิสูจน์ว่าการทดสอบเรียกครบทุกเส้น

**Architecture:** เริ่มจาก contract test ที่ไล่ทุกคำเรียกของ UI/n8n/Grafana เทียบกับ route ที่ลงทะเบียนจริงใน FastAPI แล้วแก้ช่องว่างที่พบทีละจุดแบบ TDD (alias ของ gold, path ของ raw layer, auth ของ cleanup/alert) จากนั้นเติม header คีย์ฝั่งผู้เรียก (n8n, Grafana) โดยอ่านค่าจาก `.env` ไม่ฝังลงไฟล์ที่ track ไว้ สุดท้ายเพิ่ม `scripts/qa/route_coverage.py` ที่เทียบ `openapi.json` กับ log การเรียกจริง เพื่อใช้เป็นประตูตรวจในแผนทดสอบ

**Tech Stack:** FastAPI 0.100 + pytest/httpx (รันใน container `api`, Python 3.10), Python stdlib สำหรับสคริปต์ใน `scripts/` (รันบนเครื่อง, Python 3.14 มี pytest แต่ไม่มี fastapi), n8n workflow JSON, Grafana 10.1.5 provisioning YAML, docker compose, Git Bash

**Spec:** ไม่มี spec แยก แผนนี้ตอบผลตรวจ (audit) วันที่ 2026-10-01 ในหัวข้อถัดไป แผนที่ใช้คู่กัน: [`2026-10-01-real-use-feature-test.md`](2026-10-01-real-use-feature-test.md) (ทำแผนนี้ให้จบก่อนแล้วค่อยรันแผนทดสอบ)

## ผลตรวจที่แผนนี้ตอบ

ตรวจโดยอ่านโค้ด (ตอนตรวจ Docker ไม่ได้รัน จึงยังไม่มีผลรันจริง ผลรันจริงอยู่ใน Task 8)

API มี 93 เส้น (method + path): 89 เส้นใน `services/api/app/api/*.py` และ 4 เส้นใน `services/api/main.py` (`GET /`, `GET /health`, `POST /health`, `GET /healthz`) หลัง Task 1 เพิ่ม alias จะเป็น 94 เส้น ซึ่งเป็นจำนวนที่ประตูตรวจของแผนทดสอบคาดไว้

| ID | สิ่งที่พบ | หลักฐานในโค้ด | แก้ใน |
|---|---|---|---|
| G1 | UI เรียก `GET /api/v1/gold/schema-drift` แต่ backend มีแค่ `/api/v1/gold/schema-drift-history` หน้า Export แท็บ Gold เลือก "Schema Drift History" แล้ว preview ได้ 404 | `services/ui/src/pages/DataExport.jsx:178,620` เทียบ `services/api/app/api/gold.py:120` | Task 1 |
| G2 | `GET /api/v1/export/preview/raw/{table}` และ `GET /api/v1/export/raw/{table}` อ่านที่ `/data/raw/<table>/<table>.csv` แต่ `/pipeline/ingest/*` เขียนที่ `/data/raw/<table>/<ingest_id>/<table>.csv` ตารางที่ ingest ผ่าน API จึงได้ 404 ทุกครั้ง | `data_export.py:424,532` เทียบ `pipeline.py:197`, `run_registry.py:26` | Task 2 |
| G3 | n8n node "Trigger API Retention Cleanup" เรียก `POST /api/v1/system/cleanup` โดยไม่มีคีย์ และ route รับเฉพาะ session cookie ของเบราว์เซอร์ จึงได้ 401 ทุกวัน | `infra/n8n/ingestion_workflow.json:351` เทียบ `system.py:291` | Task 3, 4 |
| G4 | n8n 3 node (Send Failure Alert, Route Remediation Alert, Route Quality Alert) และ Grafana contact point เรียก `POST /api/v1/system/alert` โดยไม่ส่ง secret จึงได้ 401 | workflow บรรทัด 374, 434, 494; `infra/grafana/provisioning/alerting/alert_rules.yaml:93` เทียบ `auth.py:71` | Task 3, 4 |
| G5 | n8n 3 node "Trigger Spark …" เรียก `spark-master:8099/retry` โดยไม่มี `X-Trigger-Secret` และ 2 node "Fetch Recent …" เรียก Elasticsearch ที่เปิด security โดยไม่มี credential (ทำให้ alert ของ G4 ไม่เคยถูกเรียกเลย) | workflow บรรทัด 168, 238, 315, 406, 466 เทียบ `services/spark/trigger_core.py:20`, `docker-compose.yml:10` | Task 4 |
| G6 | คีย์ Groq ที่บันทึกจากหน้า Rules (`POST /api/v1/system/settings`, เก็บใน ES) ไม่ถูกใช้โดย `/api/v1/whitebox/ai-context-explanations` ซึ่งอ่านแต่ env | `whitebox.py:1593` เทียบ `system.py:350` และ `services/spark/ai_rule_advisor.py:160` | Task 5 |
| K1 | `.env` ไม่มี `GROQ_API_KEY` และ `.env.example` ไม่ได้บอกว่ามีตัวแปรนี้ ฟีเจอร์ LLM จึงทำงานแบบ fallback (ไม่ใช้ LLM) ทั้งหมด | `.env`, `.env.example` | Task 6, 8 |
| K2 | container `ollama` ถูกบันทึกว่า `unhealthy` (healthcheck ใช้ `curl` ซึ่งต้องตรวจว่า image มีหรือไม่) | `docker-compose.yml:363` | Task 8 |

ที่ตรวจแล้วไม่พบปัญหา: คำเรียกอื่นทั้งหมดของ UI และ n8n (รายการเต็มอยู่ใน `CALLS` ของ Task 1) ตรงกับ route ที่มี และ secret ภายในทั้งสี่ตัว (`SESSION_SECRET_KEY`, `ALERT_WEBHOOK_SECRET`, `INGEST_SERVICE_KEY`, `TRIGGER_SHARED_SECRET`) มีค่าใน `.env` แล้ว

เรื่องที่เห็นแต่ไม่แก้ในแผนนี้ (ลงเป็น Finding ในรายงานทดสอบ): `POST /api/v1/standardize/rollback` คืน 500 แทน 400 เมื่อไม่มี backup เพราะ `HTTPException(400)` ถูก `except Exception` ครอบ (`standardize.py:201`); `GET /api/v1/services/status` คืน URL ของ Elasticsearch พร้อมรหัสผ่าน (F-1 ของแผนทดสอบ)

## Global Constraints

- ทำบน branch ปัจจุบัน (`new-optimizer`) ห้าม commit ลง `main` โดยตรง
- Commit message ไม่ใส่ attribution line ใดๆ (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- ห้ามพิมพ์ค่า secret ลง terminal, commit, รายงาน หรือไฟล์ที่ track ไว้ ตรวจได้แค่ว่า "มี/ไม่มี" ไฟล์ที่ track ไว้ต้องอ้างคีย์ผ่านชื่อตัวแปร env เท่านั้น (`$env.NAME` ใน n8n, `$NAME` ใน Grafana, `${NAME}` ใน compose)
- **คีย์ Groq ต้องให้เจ้าของระบบสร้างเอง** (ต้อง login บัญชี Groq ของเจ้าของ) agent ห้ามสมัครบัญชี, ห้ามกรอกรหัสผ่าน, ห้ามคัดลอกหรือพิมพ์ค่าคีย์ คีย์อื่นที่เป็น secret ภายในระบบ agent สร้างได้ด้วย `scripts/dev/ensure_env_keys.py` (Task 6)
- API test รันใน container เสมอ (เครื่อง host ไม่มี fastapi): `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/<ไฟล์>"` ต้องเปิด Docker Desktop ก่อน แต่ไม่ต้องให้ทั้ง stack รัน
- Test ของสคริปต์ใน `scripts/` รันบนเครื่อง: `python -m pytest -q <path>` และสคริปต์ต้องใช้ stdlib เท่านั้น
- ทุกคำสั่งรันจาก root ของ repo (`C:\ETL`) ใน Git Bash คำสั่ง `docker exec` ที่มี path ของ container ต้องขึ้นต้นด้วย `MSYS_NO_PATHCONV=1`
- ห้ามเปลี่ยนรูปแบบ response ของ route ที่มีอยู่ และห้ามลบ route เดิม (เพิ่ม alias ได้)
- ห้าม `docker compose down -v` และห้ามเรียก `POST /api/v1/system/cleanup` ด้วยคีย์จริงบน stack ที่มีข้อมูล (จะลบข้อมูลเก่ากว่า retention จริง)
- ถ้า test ที่ควรผ่านกลับล้ม ให้หยุดและรายงาน ห้ามแก้ test ให้ผ่าน

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| Create `services/api/tests/test_route_contract.py` | รายการคำเรียกของผู้เรียกทุกตัว เทียบกับ route จริง | 1 |
| Modify `services/api/app/api/gold.py` | เพิ่ม alias `/api/v1/gold/schema-drift` | 1 |
| Create `services/api/tests/test_export_raw_path.py` | test การหา raw landing ล่าสุด | 2 |
| Modify `services/api/app/api/data_export.py` | `resolve_raw_csv_path` + ใช้ใน preview/export ของ raw | 2 |
| Create `services/api/tests/test_machine_auth.py` | test คีย์ของ cleanup และ alert | 3 |
| Modify `services/api/app/api/auth.py`, `system.py` | alert รับ Bearer, cleanup รับ service key | 3 |
| Create `scripts/qa/tests/test_caller_keys.py` | ตรวจว่า config ของ n8n/Grafana/compose ส่งคีย์ครบ | 4 |
| Modify `infra/n8n/ingestion_workflow.json`, `infra/grafana/provisioning/alerting/alert_rules.yaml`, `docker-compose.yml`, `.env.example` | header คีย์ฝั่งผู้เรียก | 4 |
| Create `services/api/tests/test_groq_key_source.py` | test ที่มาของคีย์ Groq | 5 |
| Modify `services/api/app/api/whitebox.py` | อ่านคีย์ที่บันทึกใน ES ก่อน env | 5 |
| Create `scripts/dev/ensure_env_keys.py`, `scripts/dev/tests/test_ensure_env_keys.py` | ตรวจ/สร้างคีย์ใน `.env` | 6 |
| Create `scripts/qa/route_coverage.py`, `scripts/qa/tests/test_route_coverage.py` | ประตูตรวจว่าเรียกครบทุกเส้น | 7 |
| Modify `docker-compose.yml` (healthcheck ของ ollama, มีเงื่อนไข) | LLM แบบไม่ใช้คีย์ | 8 |
| Create `docs/testing/evidence/route-completeness-live.txt` | ผลรันจริง | 8 |

---

### Task 1: Contract test ของผู้เรียกทุกตัว และ alias `/api/v1/gold/schema-drift`

**Files:**
- Create: `services/api/tests/test_route_contract.py`
- Modify: `services/api/app/api/gold.py:120`

**Interfaces:**
- Consumes: `main.app` (FastAPI app ใน `services/api/main.py`)
- Produces: `CALLS` (list ของ `(method, path, route_template)`) และ `resolve(method, path) -> str | None` ใน `test_route_contract.py`; route ใหม่ `GET /api/v1/gold/schema-drift` (response เดียวกับ `/schema-drift-history`: `{"data": [...], "total_drift_events": int, "source": str}`)

- [ ] **Step 1: เขียน test ที่ล้ม**

สร้าง `services/api/tests/test_route_contract.py`:

```python
"""Caller -> route contract.

Every call a client of this API makes (the React UI, the n8n workflow, Grafana, the
compose healthcheck) must resolve to a registered route with that method. The list is
the caller inventory of services/ui/src and infra/n8n/ingestion_workflow.json; add a
line when a caller gains a new call."""
import os
import sys

import pytest
from starlette.routing import Route

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")

import main  # noqa: E402

ROUTES = [r for r in main.app.routes if isinstance(r, Route)]


def resolve(method, path):
    """Template of the first route FastAPI would dispatch this call to."""
    for route in ROUTES:
        if method in route.methods and route.path_regex.match(path):
            return route.path
    return None


def same(method, path):
    return (method, path, path)


CALLS = [
    # hooks/useAuth.js
    same("POST", "/api/v1/auth/login"),
    same("POST", "/api/v1/auth/logout"),
    same("GET", "/api/v1/auth/me"),
    # NavBar.jsx, Home.jsx, Dashboard.jsx
    same("GET", "/api/v1/services/status"),
    same("GET", "/api/v1/kpi/stats"),
    same("GET", "/api/v1/executive/overview"),
    same("GET", "/api/v1/anomaly/sources"),
    same("GET", "/api/v1/system/activity"),
    same("GET", "/api/v1/quality"),
    same("GET", "/api/v1/system/remediations"),
    ("POST", "/api/v1/system/remediations/T1/resolve", "/api/v1/system/remediations/{ticket_id}/resolve"),
    # Analytics.jsx, Dashboard.jsx
    same("GET", "/api/v1/analytics/projection"),
    same("GET", "/api/v1/analytics/clustering"),
    same("GET", "/api/v1/analytics/impact"),
    same("GET", "/api/v1/analytics/recommendations"),
    same("GET", "/api/v1/analytics/sell-in-out"),
    # Pipeline.jsx, Dashboard.jsx, hooks/useRunStatus.js
    same("GET", "/api/v1/pipeline"),
    ("POST", "/api/v1/pipeline/retry/R1", "/api/v1/pipeline/retry/{run_id}"),
    ("GET", "/api/v1/pipeline/runs/I1", "/api/v1/pipeline/runs/{ingest_id}"),
    same("POST", "/api/v1/gold/rebuild"),
    # Ingestion.jsx
    same("POST", "/api/v1/pipeline/ingest/csv"),
    same("POST", "/api/v1/pipeline/ingest/api"),
    same("POST", "/api/v1/pipeline/ingest/rdbms"),
    same("POST", "/api/v1/pipeline/ingest/reddit"),
    same("POST", "/api/v1/pipeline/ingest/reddit/stop"),
    same("GET", "/api/v1/pipeline/ingest/reddit/status"),
    same("POST", "/api/v1/whitebox/upload-csv"),
    same("POST", "/api/v1/whitebox/ingest-source"),
    # Schema.jsx, NavBar.jsx, App.jsx
    same("GET", "/api/v1/schema/proposals"),
    same("POST", "/api/v1/schema/proposals/create"),
    same("POST", "/api/v1/schema/proposals/approve-all"),
    same("POST", "/api/v1/schema/proposals/reject-all"),
    ("POST", "/api/v1/schema/proposals/P1/approve", "/api/v1/schema/proposals/{proposal_id}/approve"),
    ("POST", "/api/v1/schema/proposals/P1/reject", "/api/v1/schema/proposals/{proposal_id}/reject"),
    # RulesConfig.jsx
    same("GET", "/api/v1/rules/ai-proposals"),
    ("POST", "/api/v1/rules/ai-proposals/P1/approve", "/api/v1/rules/ai-proposals/{proposal_id}/approve"),
    ("POST", "/api/v1/rules/ai-proposals/P1/reject", "/api/v1/rules/ai-proposals/{proposal_id}/reject"),
    ("GET", "/api/v1/rules/profiles/t1", "/api/v1/rules/profiles/{table_name}"),
    ("GET", "/api/v1/rules/t1", "/api/v1/rules/{table_name}"),
    ("PUT", "/api/v1/rules/t1", "/api/v1/rules/{table_name}"),
    same("GET", "/api/v1/standardize/review-queue"),
    ("POST", "/api/v1/standardize/review-queue/I1/approve", "/api/v1/standardize/review-queue/{item_id}/approve"),
    ("POST", "/api/v1/standardize/review-queue/I1/reject", "/api/v1/standardize/review-queue/{item_id}/reject"),
    ("POST", "/api/v1/standardize/review-queue/I1/override", "/api/v1/standardize/review-queue/{item_id}/override"),
    same("GET", "/api/v1/system/settings"),
    same("POST", "/api/v1/system/settings"),
    # DataExport.jsx, RunRecordsPanel.jsx
    same("GET", "/api/v1/export/tables"),
    ("DELETE", "/api/v1/export/tables/t1", "/api/v1/export/tables/{table_name}"),
    ("GET", "/api/v1/export/preview/raw/t1", "/api/v1/export/preview/{layer}/{table_name}"),
    ("GET", "/api/v1/export/preview/active/t1", "/api/v1/export/preview/{layer}/{table_name}"),
    ("GET", "/api/v1/export/preview/quarantine/t1", "/api/v1/export/preview/{layer}/{table_name}"),
    ("GET", "/api/v1/export/preview/reddit/python", "/api/v1/export/preview/{layer}/{table_name}"),
    ("GET", "/api/v1/export/records/active/t1", "/api/v1/export/records/{layer}/{table_name}"),
    ("GET", "/api/v1/export/raw/t1", "/api/v1/export/raw/{table_name}"),
    ("GET", "/api/v1/export/active/t1", "/api/v1/export/active/{table_name}"),
    ("GET", "/api/v1/export/quarantine/t1", "/api/v1/export/quarantine/{table_name}"),
    same("GET", "/api/v1/export/reddit"),
    ("GET", "/api/v1/export/gold/daily-quality", "/api/v1/export/gold/{metric}"),
    ("GET", "/api/v1/export/gold/schema-drift", "/api/v1/export/gold/{metric}"),
    same("GET", "/api/v1/gold/daily-quality"),
    same("GET", "/api/v1/gold/error-patterns"),
    same("GET", "/api/v1/gold/financial-impact"),
    same("GET", "/api/v1/gold/schema-drift"),
    ("GET", "/api/v1/lineage/t1/trust-check", "/api/v1/lineage/{table_name}/trust-check"),
    # WhiteBoxPipeline.jsx and the pages that read the interactive engine
    same("GET", "/api/v1/whitebox/state"),
    same("POST", "/api/v1/whitebox/state"),
    same("GET", "/api/v1/whitebox/profile"),
    same("GET", "/api/v1/whitebox/benchmark"),
    same("GET", "/api/v1/whitebox/downstream-analytics"),
    same("GET", "/api/v1/whitebox/ai-context-explanations"),
    same("POST", "/api/v1/whitebox/run-all"),
    same("POST", "/api/v1/whitebox/recommend-rules"),
    same("POST", "/api/v1/whitebox/execute"),
    same("GET", "/api/v1/whitebox/multi-table/preview"),
    same("POST", "/api/v1/whitebox/multi-table/analyze"),
    same("POST", "/api/v1/whitebox/multi-table/join"),
    ("GET", "/api/v1/whitebox/preview-zone/raw", "/api/v1/whitebox/preview-zone/{zone}"),
    ("GET", "/api/v1/whitebox/export-csv/clean", "/api/v1/whitebox/export-csv/{zone}"),
    # infra/n8n/ingestion_workflow.json and infra/grafana alert_rules.yaml
    same("POST", "/api/v1/system/cleanup"),
    same("POST", "/api/v1/system/alert"),
    # docker-compose.yml healthcheck of the api service
    same("GET", "/healthz"),
]


@pytest.mark.parametrize("method,path,expected", CALLS)
def test_caller_path_resolves_to_its_route(method, path, expected):
    assert resolve(method, path) == expected
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มถูกจุด**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_route_contract.py"
```
Expected: `1 failed, 80 passed` ข้อที่ล้มคือ `test_caller_path_resolves_to_its_route[GET-/api/v1/gold/schema-drift-/api/v1/gold/schema-drift]` ด้วย `assert None == '/api/v1/gold/schema-drift'` ถ้ามีข้ออื่นล้มด้วย แปลว่าพบช่องว่างเพิ่ม ให้หยุดและรายงานชื่อข้อที่ล้ม (ห้ามลบออกจาก `CALLS`)

- [ ] **Step 3: เพิ่ม alias**

ใน `services/api/app/api/gold.py` แก้ decorator ของ `get_gold_schema_drift_history` จาก

```python
@router.get("/api/v1/gold/schema-drift-history")
def get_gold_schema_drift_history(days: int = 30):
```

เป็น

```python
# The UI and /api/v1/export/gold/{metric} name this metric "schema-drift" (index
# sdoqap_gold_schema_drift); "-history" is kept for existing callers.
@router.get("/api/v1/gold/schema-drift")
@router.get("/api/v1/gold/schema-drift-history")
def get_gold_schema_drift_history(days: int = 30):
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_route_contract.py"
```
Expected: `81 passed`

- [ ] **Step 5: Commit**

```bash
git add services/api/tests/test_route_contract.py services/api/app/api/gold.py
git commit -m "fix(api): add /gold/schema-drift route the export page calls; caller-route contract test"
```

---

### Task 2: Raw layer อ่าน landing ล่าสุด (preview และ download)

**Files:**
- Create: `services/api/tests/test_export_raw_path.py`
- Modify: `services/api/app/api/data_export.py` (เพิ่มฟังก์ชันหลัง `stream_hdfs_file_raw`, แก้ branch `raw` ใน `get_dataset_preview` บรรทัด ~422–436, แก้ `export_raw_data` บรรทัด ~528–549)

**Interfaces:**
- Consumes: `read_hdfs_file(path: str) -> bytes`, `stream_hdfs_file_raw(path: str)` (generator), `validate_table_name` ที่มีอยู่แล้วใน `data_export.py`
- Produces: `resolve_raw_csv_path(table_name: str) -> str` คืน path ใน HDFS ของไฟล์ raw ล่าสุด, raise `HTTPException(404)` ถ้าไม่มี, `HTTPException(503)` ถ้าติดต่อ namenode ไม่ได้

- [ ] **Step 1: เขียน test ที่ล้ม**

สร้าง `services/api/tests/test_export_raw_path.py`:

```python
import os
import sys

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")

from app.api import data_export  # noqa: E402


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


def listing(*entries):
    return FakeResponse(200, {"FileStatuses": {"FileStatus": [
        {"pathSuffix": name, "type": kind, "modificationTime": mtime} for name, kind, mtime in entries
    ]}})


def hdfs_lists(monkeypatch, response):
    monkeypatch.setattr(data_export.requests, "get", lambda url, **kwargs: response)


def test_newest_ingest_folder_wins(monkeypatch):
    hdfs_lists(monkeypatch, listing(
        ("20261001T010000-aaaaaaaa", "DIRECTORY", 100),
        ("20261001T020000-bbbbbbbb", "DIRECTORY", 200),
    ))
    assert data_export.resolve_raw_csv_path("scores") == "/data/raw/scores/20261001T020000-bbbbbbbb/scores.csv"


def test_legacy_file_is_used_when_it_was_written_last(monkeypatch):
    hdfs_lists(monkeypatch, listing(
        ("20261001T010000-aaaaaaaa", "DIRECTORY", 100),
        ("scores.csv", "FILE", 300),
    ))
    assert data_export.resolve_raw_csv_path("scores") == "/data/raw/scores/scores.csv"


def test_table_written_only_by_the_scheduled_flows_still_resolves(monkeypatch):
    hdfs_lists(monkeypatch, listing(("gov_data.csv", "FILE", 5), ("_SUCCESS", "FILE", 9)))
    assert data_export.resolve_raw_csv_path("gov_data") == "/data/raw/gov_data/gov_data.csv"


def test_unknown_table_is_404(monkeypatch):
    hdfs_lists(monkeypatch, FakeResponse(404))
    with pytest.raises(HTTPException) as err:
        data_export.resolve_raw_csv_path("nope")
    assert err.value.status_code == 404


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(data_export, "resolve_raw_csv_path", lambda table: f"/data/raw/{table}/I1/{table}.csv")
    app = FastAPI()
    app.include_router(data_export.router)
    return TestClient(app)


def test_raw_preview_reads_the_resolved_file_and_keeps_blank_cells_as_null(client, monkeypatch):
    opened = []
    monkeypatch.setattr(data_export, "read_hdfs_file",
                        lambda path: opened.append(path) or b"student_id,score\nS1,80\nS2,\n")
    r = client.get("/api/v1/export/preview/raw/scores")
    assert r.status_code == 200
    assert opened == ["/data/raw/scores/I1/scores.csv"]
    assert r.json() == {"columns": ["student_id", "score"],
                        "rows": [{"student_id": "S1", "score": 80.0}, {"student_id": "S2", "score": None}]}


def test_raw_download_streams_the_resolved_file(client, monkeypatch):
    monkeypatch.setattr(data_export, "stream_hdfs_file_raw", lambda path: iter([path.encode()]))
    r = client.get("/api/v1/export/raw/scores")
    assert r.status_code == 200
    assert r.content == b"/data/raw/scores/I1/scores.csv"
    assert "scores_raw.csv" in r.headers["content-disposition"]
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้ม**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_export_raw_path.py"
```
Expected: ล้มทั้ง 6 ข้อด้วย `AttributeError: ... has no attribute 'resolve_raw_csv_path'`

- [ ] **Step 3: เพิ่ม `resolve_raw_csv_path`**

ใน `services/api/app/api/data_export.py` วางฟังก์ชันนี้ต่อจาก `stream_hdfs_file_raw` (ก่อน `_with_partition_columns`):

```python
def resolve_raw_csv_path(table_name: str) -> str:
    """Newest raw landing of a table. /pipeline/ingest/* writes each ingestion to
    /data/raw/<table>/<ingest_id>/<table>.csv; the scheduled n8n flows still write the
    older /data/raw/<table>/<table>.csv. Whichever was written last is the raw layer."""
    base = f"/data/raw/{table_name}"
    url = f"http://namenode:9870/webhdfs/v1{base}?op=LISTSTATUS&user.name=spark"
    try:
        r = requests.get(url, timeout=5)
    except requests.RequestException as e:
        raise HTTPException(status_code=503, detail=f"HDFS namenode is unreachable: {e}")
    entries = r.json().get("FileStatuses", {}).get("FileStatus", []) if r.status_code == 200 else []
    landings = [
        e for e in entries
        if (e["type"] == "DIRECTORY" and not e["pathSuffix"].startswith(("_", ".")))
        or e["pathSuffix"] == f"{table_name}.csv"
    ]
    if not landings:
        raise HTTPException(status_code=404, detail=f"Raw dataset file not found for table '{table_name}'")
    newest = max(landings, key=lambda e: e.get("modificationTime", 0))
    if newest["type"] == "DIRECTORY":
        return f"{base}/{newest['pathSuffix']}/{table_name}.csv"
    return f"{base}/{table_name}.csv"
```

- [ ] **Step 4: ใช้ใน preview ของ raw**

ใน `get_dataset_preview` แทนที่ branch `if layer == "raw":` ทั้งก้อน (ตั้งแต่บรรทัด `if layer == "raw":` ถึงบรรทัด `raise HTTPException(status_code=404, detail="Raw CSV file not found")`) ด้วย:

```python
        if layer == "raw":
            content = read_hdfs_file(resolve_raw_csv_path(table_name))
            df = pd.read_csv(io.BytesIO(content), nrows=10)
            # to_json turns blank cells (NaN) into null; a plain dict would fail to serialise.
            return {"columns": list(df.columns), "rows": json.loads(df.to_json(orient="records"))}
```

(`io`, `json`, `pd` import อยู่แล้วที่ต้นไฟล์ branch `elif layer in ("active", "quarantine"):` ที่ตามมาไม่ต้องแก้)

- [ ] **Step 5: ใช้ใน download ของ raw**

แทนที่ฟังก์ชัน `export_raw_data` ทั้งฟังก์ชันด้วย:

```python
@router.get("/raw/{table_name}")
def export_raw_data(table_name: str):
    """Download the newest raw CSV landing of a table from HDFS raw storage."""
    validate_table_name(table_name)
    file_path = resolve_raw_csv_path(table_name)
    return StreamingResponse(
        stream_hdfs_file_raw(file_path),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={table_name}_raw.csv"}
    )
```

- [ ] **Step 6: รัน test ให้ผ่าน แล้วรันทั้ง suite**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests"
```
Expected: ไม่มี `failed` (รวม 6 ข้อใหม่ของ `test_export_raw_path.py` และ 81 ข้อของ Task 1)

- [ ] **Step 7: Commit**

```bash
git add services/api/tests/test_export_raw_path.py services/api/app/api/data_export.py
git commit -m "fix(export): raw preview and download read the newest raw landing, not the pre-ingest-id path"
```

---

### Task 3: API รับคีย์ของผู้เรียกแบบเครื่อง (cleanup รับ service key, alert รับ Bearer)

**Files:**
- Create: `services/api/tests/test_machine_auth.py`
- Modify: `services/api/app/api/auth.py` (`require_webhook_secret`, บรรทัด ~71–78)
- Modify: `services/api/app/api/system.py` (import บรรทัด 15, route cleanup บรรทัด ~291–306)

**Interfaces:**
- Consumes: `require_session_or_service_key(request) -> str` ที่มีอยู่แล้วใน `auth.py` (รับ session cookie หรือ header `X-Service-Key` = `INGEST_SERVICE_KEY`)
- Produces: `POST /api/v1/system/cleanup` รับ session cookie **หรือ** `X-Service-Key`; `POST /api/v1/system/alert` รับ `X-Webhook-Secret: <secret>` **หรือ** `Authorization: Bearer <secret>` (secret = `ALERT_WEBHOOK_SECRET`); ฟังก์ชันระดับ module `system._run_retention_cleanup()` (ไม่มี argument)

- [ ] **Step 1: เขียน test ที่ล้ม**

สร้าง `services/api/tests/test_machine_auth.py`:

```python
import os
import sys
import threading

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import system  # noqa: E402

GRAFANA_PAYLOAD = {"alerts": [{"annotations": {"summary": "s", "description": "d"}, "labels": {"severity": "warning"}}]}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET_KEY", "test-session-secret")
    monkeypatch.setenv("ALERT_WEBHOOK_SECRET", "hook-secret")
    monkeypatch.setenv("INGEST_SERVICE_KEY", "svc-key")
    routed, cleanup_ran = [], threading.Event()
    # Never run the real retention script from a test: it deletes data.
    monkeypatch.setattr(system, "_run_retention_cleanup", cleanup_ran.set)
    monkeypatch.setattr(system, "_load_route_alert",
                        lambda: lambda title, message, severity: routed.append((title, severity)))
    app = FastAPI()
    app.include_router(system.router)
    c = TestClient(app)
    c.routed, c.cleanup_ran = routed, cleanup_ran
    return c


def test_cleanup_rejects_a_call_without_credentials(client):
    assert client.post("/api/v1/system/cleanup").status_code == 401
    assert not client.cleanup_ran.is_set()


def test_cleanup_rejects_a_wrong_service_key(client):
    assert client.post("/api/v1/system/cleanup", headers={"X-Service-Key": "nope"}).status_code == 401
    assert not client.cleanup_ran.is_set()


def test_cleanup_accepts_the_n8n_service_key(client):
    r = client.post("/api/v1/system/cleanup", headers={"X-Service-Key": "svc-key"})
    assert r.status_code == 200
    assert r.json()["status"] == "triggered"
    assert client.cleanup_ran.wait(2)


def test_alert_accepts_x_webhook_secret(client):
    r = client.post("/api/v1/system/alert", headers={"X-Webhook-Secret": "hook-secret"},
                    json={"title": "t", "message": "m", "severity": "info"})
    assert r.status_code == 200
    assert client.routed == [("t", "info")]


def test_alert_accepts_bearer_authorization_from_grafana(client):
    r = client.post("/api/v1/system/alert", headers={"Authorization": "Bearer hook-secret"}, json=GRAFANA_PAYLOAD)
    assert r.status_code == 200
    assert client.routed == [("s", "warning")]


@pytest.mark.parametrize("headers", [
    {},
    {"X-Webhook-Secret": "nope"},
    {"Authorization": "Bearer nope"},
    {"Authorization": "Basic hook-secret"},
    {"Authorization": "Bearer"},
])
def test_alert_rejects_a_missing_or_wrong_secret(client, headers):
    r = client.post("/api/v1/system/alert", headers=headers, json=GRAFANA_PAYLOAD)
    assert r.status_code == 401
    assert client.routed == []
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้ม**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_machine_auth.py"
```
Expected: ทุกข้อ error ที่ fixture ด้วย `AttributeError: ... has no attribute '_run_retention_cleanup'`

- [ ] **Step 3: cleanup รับ service key**

ใน `services/api/app/api/system.py` แก้บรรทัด import

```python
from .auth import require_session, require_webhook_secret
```

เป็น

```python
from .auth import require_session, require_session_or_service_key, require_webhook_secret
```

แล้วแทนที่ route `trigger_system_cleanup` ทั้งก้อน (ตั้งแต่ `@router.post("/api/v1/system/cleanup")` ถึงบรรทัด `return {"status": "triggered", ...}`) ด้วย:

```python
def _run_retention_cleanup():
    try:
        script_path = "/app/scripts/ops/data_retention_cleanup.py"
        if not os.path.exists(script_path):
            script_path = "scripts/ops/data_retention_cleanup.py"
        subprocess.run(["python", script_path], timeout=180, check=True)
        print("[CLEANUP JOB] Finished successfully.")
    except Exception as e:
        print(f"[CLEANUP JOB ERROR] {e}")


@router.post("/api/v1/system/cleanup")
def trigger_system_cleanup(_user: str = Depends(require_session_or_service_key)):
    """Trigger the storage retention cleanup script asynchronously. Called by a logged-in
    user (session cookie) and by n8n's daily schedule (X-Service-Key)."""
    threading.Thread(target=_run_retention_cleanup, daemon=True).start()
    return {"status": "triggered", "message": "Retention cleanup job started in background."}
```

- [ ] **Step 4: alert รับ Bearer**

ใน `services/api/app/api/auth.py` แทนที่ฟังก์ชัน `require_webhook_secret` ทั้งฟังก์ชันด้วย:

```python
def require_webhook_secret(request: Request) -> None:
    """FastAPI dependency for machine-to-machine webhooks that cannot perform a browser
    login. The caller proves it knows ALERT_WEBHOOK_SECRET either in the X-Webhook-Secret
    header (n8n) or as "Authorization: Bearer <secret>" (Grafana 10's webhook contact
    point can set an Authorization header but not a custom one)."""
    expected = _required_env("ALERT_WEBHOOK_SECRET")
    provided = request.headers.get("X-Webhook-Secret")
    if not provided:
        scheme, _, token = (request.headers.get("Authorization") or "").partition(" ")
        provided = token.strip() if scheme.lower() == "bearer" else ""
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid webhook secret (X-Webhook-Secret or Authorization: Bearer).",
        )
```

- [ ] **Step 5: รัน test ให้ผ่าน แล้วรันทั้ง suite**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests"
```
Expected: ไม่มี `failed` (10 ข้อใหม่ของ `test_machine_auth.py` ผ่าน)

- [ ] **Step 6: Commit**

```bash
git add services/api/tests/test_machine_auth.py services/api/app/api/auth.py services/api/app/api/system.py
git commit -m "fix(auth): cleanup accepts the n8n service key; alert webhook accepts Bearer for Grafana"
```

---

### Task 4: ผู้เรียกแบบเครื่องส่งคีย์ครบ (n8n, Grafana, compose)

**Files:**
- Create: `scripts/qa/tests/test_caller_keys.py`
- Modify: `infra/n8n/ingestion_workflow.json` (9 node: บรรทัด url ที่ 168, 238, 315, 351, 374, 406, 434, 466, 494)
- Modify: `infra/grafana/provisioning/alerting/alert_rules.yaml:92-95`
- Modify: `docker-compose.yml` (service `grafana`, block `environment`)
- Modify: `.env.example` (คอมเมนต์ของ `ALERT_WEBHOOK_SECRET` และ `INGEST_SERVICE_KEY`)

**Interfaces:**
- Consumes: Task 3 (API รับ `X-Service-Key` ที่ cleanup และ `Authorization: Bearer` ที่ alert)
- Produces: header ต่อปลายทาง (ค่าเป็น expression ที่อ่าน env เท่านั้น):

| ปลายทาง (prefix ของ url) | Header | ค่า |
|---|---|---|
| `http://api:8000/api/v1/pipeline/ingest/` (มีอยู่แล้ว) | `X-Service-Key` | `={{ $env.INGEST_SERVICE_KEY }}` |
| `http://api:8000/api/v1/system/cleanup` | `X-Service-Key` | `={{ $env.INGEST_SERVICE_KEY }}` |
| `http://api:8000/api/v1/system/alert` | `X-Webhook-Secret` | `={{ $env.ALERT_WEBHOOK_SECRET }}` |
| `http://spark-master:8099/` | `X-Trigger-Secret` | `={{ $env.TRIGGER_SHARED_SECRET }}` |
| `http://elasticsearch:9200/` | `Authorization` | `={{ 'Basic ' + ('elastic:' + $env.ELASTICSEARCH_PASSWORD).base64Encode() }}` |

- [ ] **Step 1: เขียน test ที่ล้ม**

```bash
mkdir -p scripts/qa/tests
```

สร้าง `scripts/qa/tests/test_caller_keys.py`:

```python
"""Machine callers must send the key their target requires. Guards the tracked config
of n8n, Grafana and compose; the secrets themselves stay in .env."""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

REQUIRED_HEADERS = [
    ("http://api:8000/api/v1/pipeline/ingest/", "X-Service-Key", "={{ $env.INGEST_SERVICE_KEY }}"),
    ("http://api:8000/api/v1/system/cleanup", "X-Service-Key", "={{ $env.INGEST_SERVICE_KEY }}"),
    ("http://api:8000/api/v1/system/alert", "X-Webhook-Secret", "={{ $env.ALERT_WEBHOOK_SECRET }}"),
    ("http://spark-master:8099/", "X-Trigger-Secret", "={{ $env.TRIGGER_SHARED_SECRET }}"),
    ("http://elasticsearch:9200/", "Authorization",
     "={{ 'Basic ' + ('elastic:' + $env.ELASTICSEARCH_PASSWORD).base64Encode() }}"),
]


def _read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as fh:
        return fh.read()


def _http_nodes():
    workflow = json.loads(_read("infra", "n8n", "ingestion_workflow.json"))
    return [n for n in workflow["nodes"] if n["type"] == "n8n-nodes-base.httpRequest"]


def _headers(node):
    params = node["parameters"]
    if not params.get("sendHeaders"):
        return {}
    return {h["name"]: h["value"] for h in params.get("headerParameters", {}).get("parameters", [])}


def test_every_n8n_call_to_a_protected_service_sends_its_key():
    missing = []
    for node in _http_nodes():
        url = node["parameters"]["url"]
        for prefix, name, value in REQUIRED_HEADERS:
            if url.startswith(prefix) and _headers(node).get(name) != value:
                missing.append(f"{node['name']} -> {url} needs {name}")
    assert missing == []


def test_every_protected_target_is_still_called():
    # Keeps the test above honest: if a URL changes, the prefixes must change with it.
    urls = [n["parameters"]["url"] for n in _http_nodes()]
    for prefix, _, _ in REQUIRED_HEADERS:
        assert any(u.startswith(prefix) for u in urls), prefix


def test_n8n_workflow_holds_no_literal_secret():
    auth_headers = {name for _, name, _ in REQUIRED_HEADERS}
    for node in _http_nodes():
        for name, value in _headers(node).items():
            if name in auth_headers:
                assert value.startswith("={{") and "$env." in value, f"{node['name']}: {name}"


def test_grafana_webhook_sends_the_alert_secret():
    text = _read("infra", "grafana", "provisioning", "alerting", "alert_rules.yaml")
    assert re.search(r"^\s*authorization_scheme: Bearer\s*$", text, re.M)
    assert re.search(r"^\s*authorization_credentials: \$ALERT_WEBHOOK_SECRET\s*$", text, re.M)


def test_grafana_container_receives_the_alert_secret():
    compose = _read("docker-compose.yml")
    grafana = compose.split("\n  grafana:\n", 1)[1].split("\n  postgres:\n", 1)[0]
    assert "- ALERT_WEBHOOK_SECRET=${ALERT_WEBHOOK_SECRET}" in grafana
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้ม**

```bash
python -m pytest -q scripts/qa/tests/test_caller_keys.py
```
Expected: `3 failed, 2 passed` ข้อ `test_every_n8n_call_to_a_protected_service_sends_its_key` ล้มพร้อมรายชื่อ 9 node (Trigger Spark Products/Gov/Sales, Trigger API Retention Cleanup, Send Failure Alert, Fetch Recent Remediations, Route Remediation Alert, Fetch Recent Quality Runs, Route Quality Alert) และสองข้อของ Grafana ล้ม

- [ ] **Step 3: เติม header ใน n8n workflow**

ไฟล์นี้จัดรูปแบบด้วยมือ (dump JSON ใหม่จะเปลี่ยนทั้งไฟล์) จึงแทรกเป็นข้อความหลังบรรทัด `"url"` ของ node เป้าหมาย รันครั้งเดียว:

```bash
python - <<'EOF'
import re

PATH = "infra/n8n/ingestion_workflow.json"
HEADERS = [
    ("http://api:8000/api/v1/system/cleanup", "X-Service-Key", "={{ $env.INGEST_SERVICE_KEY }}"),
    ("http://api:8000/api/v1/system/alert", "X-Webhook-Secret", "={{ $env.ALERT_WEBHOOK_SECRET }}"),
    ("http://spark-master:8099/", "X-Trigger-Secret", "={{ $env.TRIGGER_SHARED_SECRET }}"),
    ("http://elasticsearch:9200/", "Authorization",
     "={{ 'Basic ' + ('elastic:' + $env.ELASTICSEARCH_PASSWORD).base64Encode() }}"),
]

with open(PATH, encoding="utf-8", newline="") as fh:
    text = fh.read()
eol = "\r\n" if "\r\n" in text else "\n"
lines = text.split(eol)
out, added = [], 0
for i, line in enumerate(lines):
    out.append(line)
    m = re.match(r'^(\s*)"url": "([^"]+)",$', line)
    if not m or '"sendHeaders"' in lines[i + 1]:
        continue
    for prefix, name, value in HEADERS:
        if m.group(2).startswith(prefix):
            ind = m.group(1)
            out += [
                f'{ind}"sendHeaders": true,',
                f'{ind}"headerParameters": {{',
                f'{ind}  "parameters": [',
                f'{ind}    {{',
                f'{ind}      "name": "{name}",',
                f'{ind}      "value": "{value}"',
                f'{ind}    }}',
                f'{ind}  ]',
                f'{ind}}},',
            ]
            added += 1
with open(PATH, "w", encoding="utf-8", newline="") as fh:
    fh.write(eol.join(out))
print("nodes patched:", added)
EOF
git diff --stat infra/n8n/ingestion_workflow.json
python -c "import json; json.load(open('infra/n8n/ingestion_workflow.json', encoding='utf-8')); print('JSON OK')"
```
Expected: `nodes patched: 9`, diff เป็น `81 insertions(+)` ไม่มี deletion, และ `JSON OK` (รันซ้ำจะได้ `nodes patched: 0`)

- [ ] **Step 4: Grafana ส่ง secret เป็น Bearer**

ใน `infra/grafana/provisioning/alerting/alert_rules.yaml` แก้ block `settings` ของ contact point จาก

```yaml
        settings:
          url: http://api:8000/api/v1/system/alert
          method: POST
          contentType: application/json
```

เป็น

```yaml
        settings:
          url: http://api:8000/api/v1/system/alert
          method: POST
          contentType: application/json
          # The API rejects alerts without ALERT_WEBHOOK_SECRET. Grafana 10 webhooks cannot
          # send a custom header, so the secret travels as "Authorization: Bearer <secret>".
          authorization_scheme: Bearer
          authorization_credentials: $ALERT_WEBHOOK_SECRET
```

ใน `docker-compose.yml` service `grafana` แก้ block `environment` จาก

```yaml
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

เป็น

```yaml
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      # Read by the provisioned webhook contact point (alert_rules.yaml) and sent as
      # "Authorization: Bearer ..." to POST /api/v1/system/alert.
      - ALERT_WEBHOOK_SECRET=${ALERT_WEBHOOK_SECRET}
```

- [ ] **Step 5: อัปเดตคำอธิบายใน `.env.example`**

แก้คอมเมนต์สองก้อนจาก

```
# Shared secret Grafana must send as the X-Webhook-Secret header when calling
# POST /api/v1/system/alert (machine-to-machine, not a logged-in user).
ALERT_WEBHOOK_SECRET=

# Shared secret n8n must send as the X-Service-Key header when calling the
# /api/v1/pipeline/ingest/* endpoints as the ingestion orchestrator.
INGEST_SERVICE_KEY=
```

เป็น

```
# Shared secret for POST /api/v1/system/alert (machine-to-machine, not a logged-in user).
# n8n sends it as the X-Webhook-Secret header; Grafana sends it as Authorization: Bearer.
ALERT_WEBHOOK_SECRET=

# Shared secret n8n must send as the X-Service-Key header when calling the
# /api/v1/pipeline/ingest/* endpoints and POST /api/v1/system/cleanup.
INGEST_SERVICE_KEY=
```

- [ ] **Step 6: รัน test ให้ผ่าน และตรวจ compose**

```bash
python -m pytest -q scripts/qa/tests/test_caller_keys.py
docker compose config -q && echo COMPOSE_OK
```
Expected: `5 passed` และ `COMPOSE_OK`

- [ ] **Step 7: Commit**

```bash
git add scripts/qa/tests/test_caller_keys.py infra/n8n/ingestion_workflow.json infra/grafana/provisioning/alerting/alert_rules.yaml docker-compose.yml .env.example
git commit -m "fix(infra): n8n and Grafana send the keys their targets require"
```

---

### Task 5: `/whitebox/ai-context-explanations` ใช้คีย์ Groq ที่บันทึกจากหน้า Rules

**Files:**
- Create: `services/api/tests/test_groq_key_source.py`
- Modify: `services/api/app/api/whitebox.py` (import บรรทัด ~30, `_get_groq_api_key` บรรทัด ~1593)

**Interfaces:**
- Consumes: `get_es_client()` จาก `app/api/config.py`; เอกสาร ES `sdoqap_settings/global` รูปแบบ `{"groq_api_key": str, "groq_model": str, "groq_enabled": bool}` (เขียนโดย `POST /api/v1/system/settings`); `FakeES` จาก `services/api/tests/fakes.py`
- Produces: `whitebox._get_groq_api_key() -> str` ลำดับ: คีย์ที่บันทึกใน ES (ถ้าปิดใช้งานคืน `""`) → env `GROQ_API_KEY` → ไฟล์ `.env` (ของเดิม) ลำดับเดียวกับ `services/spark/ai_rule_advisor.py`

- [ ] **Step 1: เขียน test ที่ล้ม**

สร้าง `services/api/tests/test_groq_key_source.py`:

```python
import os
import sys

from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import whitebox  # noqa: E402
from fakes import FakeES  # noqa: E402


def saved(doc):
    es = FakeES()
    es.index("sdoqap_settings", "global", doc)
    return lambda: es


def test_key_saved_from_the_rules_page_is_used(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setattr(whitebox, "get_es_client", saved({"groq_api_key": "gsk_saved", "groq_enabled": True}))
    assert whitebox._get_groq_api_key() == "gsk_saved"


def test_disabling_the_saved_key_turns_the_llm_off(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_env")
    monkeypatch.setattr(whitebox, "get_es_client", saved({"groq_api_key": "gsk_saved", "groq_enabled": False}))
    assert whitebox._get_groq_api_key() == ""


def test_env_key_is_used_when_nothing_is_saved(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_env")
    monkeypatch.setattr(whitebox, "get_es_client", FakeES)
    assert whitebox._get_groq_api_key() == "gsk_env"


def test_env_key_is_used_when_elasticsearch_is_down(monkeypatch):
    def offline():
        raise HTTPException(status_code=503, detail="Elasticsearch service is offline")

    monkeypatch.setenv("GROQ_API_KEY", "gsk_env")
    monkeypatch.setattr(whitebox, "get_es_client", offline)
    assert whitebox._get_groq_api_key() == "gsk_env"
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้ม**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_groq_key_source.py"
```
Expected: ล้มทั้ง 4 ข้อด้วย `AttributeError: ... has no attribute 'get_es_client'`

- [ ] **Step 3: อ่านคีย์ที่บันทึกไว้ก่อน env**

ใน `services/api/app/api/whitebox.py` แก้บรรทัด import

```python
from .auth import require_session
```

เป็น

```python
from .auth import require_session
from .config import get_es_client
```

แล้วแทนที่ส่วนต้นของ `_get_groq_api_key` จาก

```python
def _get_groq_api_key() -> str:
    k = os.getenv("GROQ_API_KEY", "").strip()
    if k:
        return k
```

เป็น

```python
def _saved_groq_setting():
    """(key, enabled) saved from the Rules page via POST /api/v1/system/settings, or None
    when nothing is saved or Elasticsearch is unreachable."""
    try:
        es = get_es_client()
        if not es.indices.exists(index="sdoqap_settings"):
            return None
        doc = es.get(index="sdoqap_settings", id="global").get("_source", {})
    except Exception:
        return None
    key = str(doc.get("groq_api_key") or "").strip()
    return (key, bool(doc.get("groq_enabled"))) if key else None


def _get_groq_api_key() -> str:
    # Same order as services/spark/ai_rule_advisor.py: the saved setting wins (and can
    # switch the LLM off), then the environment.
    saved = _saved_groq_setting()
    if saved:
        key, enabled = saved
        return key if enabled else ""
    k = os.getenv("GROQ_API_KEY", "").strip()
    if k:
        return k
```

(ส่วนที่เหลือของฟังก์ชัน คือ loop อ่านไฟล์ `.env` และ `return ""` ไม่ต้องแก้)

- [ ] **Step 4: รัน test ให้ผ่าน แล้วรันทั้ง suite**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests"
```
Expected: ไม่มี `failed` (4 ข้อใหม่ผ่าน และ `tests/test_ai_context.py` เดิมยังผ่าน)

- [ ] **Step 5: Commit**

```bash
git add services/api/tests/test_groq_key_source.py services/api/app/api/whitebox.py
git commit -m "fix(whitebox): AI context uses the Groq key saved from the Rules page"
```

---

### Task 6: ตรวจและสร้างคีย์ใน `.env`

**Files:**
- Create: `scripts/dev/ensure_env_keys.py`
- Create: `scripts/dev/tests/test_ensure_env_keys.py`
- Modify: `.env.example` (เพิ่ม block ของ Groq ต่อท้าย block `TRIGGER_SHARED_SECRET`)

**Interfaces:**
- Produces: `ensure(text: str, generate=...) -> tuple[str, list[str], list[str]]` คืน `(ข้อความใหม่, ชื่อ secret ภายในที่สร้าง, ชื่อคีย์ภายนอกที่ยังขาด)`; `main(argv=None) -> int` (exit 1 ถ้ายังมีคีย์ขาด); CLI: `python scripts/dev/ensure_env_keys.py [--check] [path]`
- ค่าคงที่: `LOCAL_SECRETS = ("SESSION_SECRET_KEY", "ALERT_WEBHOOK_SECRET", "INGEST_SERVICE_KEY", "TRIGGER_SHARED_SECRET")`, `EXTERNAL_KEYS = {"GROQ_API_KEY": "https://console.groq.com/keys"}`

- [ ] **Step 1: เขียน test ที่ล้ม**

```bash
mkdir -p scripts/dev/tests
```

สร้าง `scripts/dev/tests/test_ensure_env_keys.py`:

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ensure_env_keys import ensure, main

FULL = ("SESSION_SECRET_KEY=a\nALERT_WEBHOOK_SECRET=b\nINGEST_SERVICE_KEY=c\n"
        "TRIGGER_SHARED_SECRET=d\nGROQ_API_KEY=gsk_x\n")


def test_complete_file_is_left_untouched():
    assert ensure(FULL) == (FULL, [], [])


def test_empty_and_absent_local_secrets_are_generated():
    text = ("# comment\nADMIN_USERNAME=admin\nSESSION_SECRET_KEY=\nALERT_WEBHOOK_SECRET=b\n"
            "INGEST_SERVICE_KEY=c\nGROQ_API_KEY=gsk_x\n")
    new_text, created, missing = ensure(text, generate=lambda: "GENERATED")
    assert created == ["SESSION_SECRET_KEY", "TRIGGER_SHARED_SECRET"]
    assert missing == []
    assert new_text == ("# comment\nADMIN_USERNAME=admin\nSESSION_SECRET_KEY=GENERATED\nALERT_WEBHOOK_SECRET=b\n"
                        "INGEST_SERVICE_KEY=c\nGROQ_API_KEY=gsk_x\nTRIGGER_SHARED_SECRET=GENERATED\n")


def test_groq_key_is_reported_and_never_invented():
    text = FULL.replace("GROQ_API_KEY=gsk_x\n", "GROQ_API_KEY=\n")
    assert ensure(text) == (text, [], ["GROQ_API_KEY"])


def test_main_writes_once_and_prints_no_value(tmp_path, capsys):
    env = tmp_path / ".env"
    env.write_text("ALERT_WEBHOOK_SECRET=keepme\n", encoding="utf-8")
    assert main([str(env)]) == 1  # GROQ_API_KEY is still missing
    first = env.read_text(encoding="utf-8")
    generated = first.split("SESSION_SECRET_KEY=")[1].split("\n")[0]
    out = capsys.readouterr().out
    assert "ALERT_WEBHOOK_SECRET=keepme" in first and len(generated) >= 32
    assert "keepme" not in out and generated not in out
    main([str(env)])
    assert env.read_text(encoding="utf-8") == first


def test_check_mode_never_writes(tmp_path):
    env = tmp_path / ".env"
    env.write_text("X=1\n", encoding="utf-8")
    assert main(["--check", str(env)]) == 1
    assert env.read_text(encoding="utf-8") == "X=1\n"
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้ม**

```bash
python -m pytest -q scripts/dev/tests/test_ensure_env_keys.py
```
Expected: collection error `ModuleNotFoundError: No module named 'ensure_env_keys'`

- [ ] **Step 3: เขียนสคริปต์**

สร้าง `scripts/dev/ensure_env_keys.py`:

```python
"""Report, and where it can, create the keys this stack reads from .env.

The local shared secrets (session signing, webhook, service and trigger keys) are random
strings, so an empty or absent one is generated here. GROQ_API_KEY is issued by Groq and
can only be reported. Values are never printed.

Usage: python scripts/dev/ensure_env_keys.py [--check] [path/to/.env]"""
import argparse
import os
import secrets
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL_SECRETS = ("SESSION_SECRET_KEY", "ALERT_WEBHOOK_SECRET", "INGEST_SERVICE_KEY", "TRIGGER_SHARED_SECRET")
EXTERNAL_KEYS = {"GROQ_API_KEY": "https://console.groq.com/keys"}


def read_values(text):
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            name, _, value = line.partition("=")
            values[name.strip()] = value.strip()
    return values


def ensure(text, generate=lambda: secrets.token_urlsafe(32)):
    """Returns (new_text, created, missing_external). Only empty or absent local secrets
    change; every other line is kept as it is."""
    values = read_values(text)
    created = [name for name in LOCAL_SECRETS if not values.get(name)]
    cr = "\r" if "\r\n" in text else ""
    lines = text.split("\n")
    for name in created:
        new_line = f"{name}={generate()}{cr}"
        for i, line in enumerate(lines):
            if line.split("=", 1)[0].strip() == name:
                lines[i] = new_line
                break
        else:
            lines.insert(len(lines) - 1 if lines[-1] == "" else len(lines), new_line)
    missing_external = [name for name in EXTERNAL_KEYS if not values.get(name)]
    return "\n".join(lines), created, missing_external


def main(argv=None):
    parser = argparse.ArgumentParser(description="Report and create the keys this stack reads from .env")
    parser.add_argument("env_file", nargs="?", default=os.path.join(REPO_ROOT, ".env"))
    parser.add_argument("--check", action="store_true", help="report only, never write")
    args = parser.parse_args(argv)

    with open(args.env_file, encoding="utf-8", newline="") as fh:
        text = fh.read()
    new_text, created, missing_external = ensure(text)

    for name in LOCAL_SECRETS:
        state = "ok" if name not in created else ("MISSING" if args.check else "created")
        print(f"{state:8} {name}")
    for name, where in EXTERNAL_KEYS.items():
        if name in missing_external:
            print(f"{'MISSING':8} {name}  (the owner creates it at {where})")
        else:
            print(f"{'ok':8} {name}")

    if created and not args.check:
        with open(args.env_file, "w", encoding="utf-8", newline="") as fh:
            fh.write(new_text)
    return 1 if missing_external or (created and args.check) else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
python -m pytest -q scripts/dev/tests/test_ensure_env_keys.py
```
Expected: `5 passed`

- [ ] **Step 5: บอกใน `.env.example` ว่ามีคีย์ Groq**

ใน `.env.example` ต่อจากบรรทัด `TRIGGER_SHARED_SECRET=` เพิ่ม:

```
# Optional LLM key (Groq) for AI rule proposals and the AI context text. Create one at
# https://console.groq.com/keys. Without it both features use their rule-based fallback.
# A key saved from the Rules page (stored in Elasticsearch) takes precedence over this one.
GROQ_API_KEY=
```

- [ ] **Step 6: ตรวจ `.env` ของเครื่องนี้ (ไม่เขียนอะไร)**

```bash
python scripts/dev/ensure_env_keys.py --check
```
Expected บนเครื่องนี้ตอนเขียนแผน: `ok` สี่บรรทัดของ secret ภายใน และ `MISSING  GROQ_API_KEY  (the owner creates it at https://console.groq.com/keys)` exit code 1 ถ้ามี secret ภายในขึ้น `MISSING` ให้รัน `python scripts/dev/ensure_env_keys.py` (ไม่มี `--check`) เพื่อสร้าง แล้วจดชื่อ (ไม่ใช่ค่า) ไว้รายงาน คีย์ Groq จัดการใน Task 8 Step 1

- [ ] **Step 7: Commit**

```bash
git add scripts/dev/ensure_env_keys.py scripts/dev/tests/test_ensure_env_keys.py .env.example
git commit -m "feat(dev): ensure_env_keys reports and creates the keys .env needs; document GROQ_API_KEY"
```

---

### Task 7: `route_coverage.py` ประตูตรวจว่าเรียกครบทุกเส้น

**Files:**
- Create: `scripts/qa/route_coverage.py`
- Create: `scripts/qa/tests/test_route_coverage.py`

**Interfaces:**
- Consumes: เอกสาร OpenAPI ของ API (`http://localhost:8002/openapi.json`) และ log การเรียกที่ `scripts/qa/lib.sh` ของแผนทดสอบเขียน หนึ่งบรรทัดต่อหนึ่งคำเรียก รูปแบบ `METHOD PATH STATUS` เช่น `GET /api/v1/auth/me 200`
- Produces: `load_routes(doc) -> list[tuple[str, str]]`, `match_route(method, path, routes) -> tuple[str, str] | None`, `parse_calls(text) -> list[tuple[str, str, int]]`, `classify(statuses) -> str` (`OK` | `REACHED` | `AUTH_ONLY` | `UNTESTED`), `coverage(routes, calls) -> tuple[dict, list]`, `main(argv=None) -> int`; CLI: `python scripts/qa/route_coverage.py --calls <log> [--openapi <url|file>]` พิมพ์ตาราง markdown และบรรทัดสรุป `routes=N OK=a REACHED=b AUTH_ONLY=c UNTESTED=d`, exit 1 ถ้า `AUTH_ONLY` หรือ `UNTESTED` มากกว่า 0

- [ ] **Step 1: เขียน test ที่ล้ม**

สร้าง `scripts/qa/tests/test_route_coverage.py`:

```python
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from route_coverage import classify, coverage, load_routes, main, match_route, parse_calls

DOC = {"paths": {
    "/": {"get": {}},
    "/api/v1/rules/ai-proposals": {"get": {}},
    "/api/v1/rules/{table_name}": {"get": {}, "put": {}, "parameters": []},
    "/api/v1/gold/rebuild": {"post": {}},
    "/api/v1/export/tables/{table_name}": {"delete": {}},
}}
ROUTES = load_routes(DOC)


def test_routes_are_method_and_template_pairs_plus_the_hidden_healthz():
    assert ROUTES == [
        ("GET", "/"),
        ("GET", "/api/v1/rules/ai-proposals"),
        ("GET", "/api/v1/rules/{table_name}"),
        ("PUT", "/api/v1/rules/{table_name}"),
        ("POST", "/api/v1/gold/rebuild"),
        ("DELETE", "/api/v1/export/tables/{table_name}"),
        ("GET", "/healthz"),
    ]


def test_a_literal_route_wins_over_a_parameter_route():
    assert match_route("GET", "/api/v1/rules/ai-proposals", ROUTES) == ("GET", "/api/v1/rules/ai-proposals")
    assert match_route("GET", "/api/v1/rules/qa_scores", ROUTES) == ("GET", "/api/v1/rules/{table_name}")
    assert match_route("GET", "/", ROUTES) == ("GET", "/")


def test_method_and_segment_count_must_match():
    assert match_route("POST", "/api/v1/rules/qa_scores", ROUTES) is None
    assert match_route("GET", "/api/v1/rules/qa_scores/extra", ROUTES) is None


def test_calls_are_parsed_without_query_strings_and_junk_lines():
    text = "GET /api/v1/rules/qa_scores?x=1 200\n\nnot a call\nput /api/v1/rules/qa_scores 401\nGET /x 000\n"
    assert parse_calls(text) == [
        ("GET", "/api/v1/rules/qa_scores", 200),
        ("PUT", "/api/v1/rules/qa_scores", 401),
        ("GET", "/x", 0),
    ]


def test_classification():
    assert classify(set()) == "UNTESTED"
    assert classify({401}) == "AUTH_ONLY"
    assert classify({0, 403}) == "AUTH_ONLY"
    assert classify({401, 404}) == "REACHED"
    assert classify({500}) == "REACHED"
    assert classify({401, 200}) == "OK"


def test_coverage_groups_statuses_by_route_and_keeps_unmatched_calls():
    calls = parse_calls("GET /api/v1/rules/a 200\nGET /api/v1/rules/b 404\nGET /nowhere 404\n")
    seen, unmatched = coverage(ROUTES, calls)
    assert seen[("GET", "/api/v1/rules/{table_name}")] == {200, 404}
    assert seen[("POST", "/api/v1/gold/rebuild")] == set()
    assert unmatched == [("GET", "/nowhere", 404)]


def write(tmp_path, calls):
    openapi = tmp_path / "openapi.json"
    openapi.write_text(json.dumps(DOC), encoding="utf-8")
    log = tmp_path / "route-calls.log"
    log.write_text(calls, encoding="utf-8")
    return ["--openapi", str(openapi), "--calls", str(log)]


def test_main_fails_while_a_route_is_untested_or_only_refused(tmp_path, capsys):
    assert main(write(tmp_path, "GET / 200\nPOST /api/v1/gold/rebuild 401\n")) == 1
    out = capsys.readouterr().out
    assert "| AUTH_ONLY | POST | `/api/v1/gold/rebuild` | 401 |" in out
    assert "| UNTESTED | GET | `/healthz` | - |" in out
    assert "routes=7 OK=1 REACHED=0 AUTH_ONLY=1 UNTESTED=5" in out


def test_main_passes_when_every_route_was_reached(tmp_path, capsys):
    calls = ("GET / 200\nGET /api/v1/rules/ai-proposals 200\nGET /api/v1/rules/t 200\nPUT /api/v1/rules/t 400\n"
             "POST /api/v1/gold/rebuild 200\nDELETE /api/v1/export/tables/t 200\nGET /healthz 200\n")
    assert main(write(tmp_path, calls)) == 0
    assert "routes=7 OK=6 REACHED=1 AUTH_ONLY=0 UNTESTED=0" in capsys.readouterr().out
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้ม**

```bash
python -m pytest -q scripts/qa/tests/test_route_coverage.py
```
Expected: collection error `ModuleNotFoundError: No module named 'route_coverage'`

- [ ] **Step 3: เขียนสคริปต์**

สร้าง `scripts/qa/route_coverage.py`:

```python
"""Which API routes did a QA run actually exercise?

Compares the API's OpenAPI document with the call log written by scripts/qa/lib.sh (one
line per call: METHOD PATH STATUS) and classifies every route:
  OK         at least one call answered 2xx or 3xx
  REACHED    the handler answered, but never with success (4xx/5xx other than 401/403)
  AUTH_ONLY  only 401/403 or a failed connection was seen: the route was never exercised
  UNTESTED   no call at all
Exit code 1 while any route is AUTH_ONLY or UNTESTED.

Usage: python scripts/qa/route_coverage.py --calls docs/testing/evidence/route-calls.log"""
import argparse
import json
import sys
import urllib.request
from collections import Counter

HTTP_METHODS = ("get", "post", "put", "patch", "delete")
# Registered with include_in_schema=False in services/api/main.py, so absent from OpenAPI.
EXTRA_ROUTES = [("GET", "/healthz")]
STATES = ("OK", "REACHED", "AUTH_ONLY", "UNTESTED")


def load_routes(doc):
    routes = [(method.upper(), template)
              for template, item in doc.get("paths", {}).items()
              for method in HTTP_METHODS if method in item]
    return routes + [r for r in EXTRA_ROUTES if r not in routes]


def _segments(path):
    return [s for s in path.split("/") if s]


def _matches(template, path):
    t, p = _segments(template), _segments(path)
    return len(t) == len(p) and all(a.startswith("{") or a == b for a, b in zip(t, p))


def match_route(method, path, routes):
    """The route a call hits. A literal segment beats a {parameter}: this API registers
    its literal routes before the parameter routes they overlap with."""
    hits = [r for r in routes if r[0] == method and _matches(r[1], path)]
    if not hits:
        return None
    return max(hits, key=lambda r: sum(not s.startswith("{") for s in _segments(r[1])))


def parse_calls(text):
    calls = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[2].isdigit():
            calls.append((parts[0].upper(), parts[1].split("?")[0], int(parts[2])))
    return calls


def classify(statuses):
    if not statuses:
        return "UNTESTED"
    if any(200 <= s < 400 for s in statuses):
        return "OK"
    if all(s in (0, 401, 403) for s in statuses):
        return "AUTH_ONLY"
    return "REACHED"


def coverage(routes, calls):
    seen = {route: set() for route in routes}
    unmatched = []
    for method, path, status in calls:
        route = match_route(method, path, routes)
        if route is None:
            unmatched.append((method, path, status))
        else:
            seen[route].add(status)
    return seen, unmatched


def _read(source):
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source, timeout=15) as resp:
            return resp.read().decode("utf-8")
    with open(source, encoding="utf-8") as fh:
        return fh.read()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Route coverage of a QA run")
    parser.add_argument("--openapi", default="http://localhost:8002/openapi.json", help="URL or file")
    parser.add_argument("--calls", required=True, help="call log: METHOD PATH STATUS per line")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp874/cp1252

    seen, unmatched = coverage(load_routes(json.loads(_read(args.openapi))), parse_calls(_read(args.calls)))
    print("| Result | Method | Route | Statuses seen |")
    print("|---|---|---|---|")
    for (method, template), statuses in seen.items():
        shown = " ".join(str(s) for s in sorted(statuses)) or "-"
        print(f"| {classify(statuses)} | {method} | `{template}` | {shown} |")
    if unmatched:
        print("\nCalls that matched no route:")
        for method, path, status in sorted(set(unmatched)):
            print(f"- {method} {path} -> {status}")
    counts = Counter(classify(statuses) for statuses in seen.values())
    print(f"\nroutes={len(seen)} " + " ".join(f"{state}={counts.get(state, 0)}" for state in STATES))
    return 1 if counts.get("AUTH_ONLY") or counts.get("UNTESTED") else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
python -m pytest -q scripts/qa/tests
```
Expected: `13 passed` (8 ข้อของ `test_route_coverage.py` และ 5 ข้อของ `test_caller_keys.py`)

- [ ] **Step 5: Commit**

```bash
git add scripts/qa/route_coverage.py scripts/qa/tests/test_route_coverage.py
git commit -m "feat(qa): route_coverage reports which API routes a QA run exercised"
```

---

### Task 8: Deploy และยืนยันบน stack จริง

ต้องให้ทั้ง stack รัน (`start_system.bat` หรือ `docker compose up -d`) เก็บ output ของทุก step ต่อท้ายไฟล์ `docs/testing/evidence/route-completeness-live.txt` (ไม่มีค่า secret)

**Files:**
- Modify (มีเงื่อนไข, Step 8): `docker-compose.yml` (healthcheck ของ `ollama`)
- Create: `docs/testing/evidence/route-completeness-live.txt`

**Interfaces:**
- Consumes: Task 1–7 ทั้งหมด; `data/samples/student_scores/student_scores_sample.csv` (1,030 แถว); ตารางทดสอบชื่อ `qa_route_probe` (ลบตอนจบ)

- [ ] **Step 1: คีย์ Groq (ขั้นตอนของเจ้าของระบบ)**

```bash
python scripts/dev/ensure_env_keys.py --check
```

ถ้า `GROQ_API_KEY` ขึ้น `MISSING` ให้ **หยุดแล้วขอให้เจ้าของระบบทำ** (agent ห้ามทำแทน): เปิด https://console.groq.com/keys → login ด้วยบัญชีของตัวเอง → Create API Key (ตั้งชื่อ `sdoqap-local`) → copy → เปิด `C:\ETL\.env` เพิ่มบรรทัด `GROQ_API_KEY=<คีย์ที่ copy>` → save (`.env` อยู่ใน `.gitignore` จึงไม่ถูก commit) แล้วแจ้งกลับว่าเสร็จ

รันคำสั่งเดิมซ้ำ Expected: `ok  GROQ_API_KEY` exit code 0 ถ้าเจ้าของยืนยันว่าไม่ใช้ Groq ให้จดไว้ในไฟล์ evidence แล้วข้าม Step 7 (ฟีเจอร์ LLM จะทำงานแบบ rule-based fallback ต่อไป)

- [ ] **Step 2: build และโหลด config ใหม่**

```bash
mkdir -p docs/testing/evidence
docker compose up -d --build api
docker compose up -d grafana spark-master spark-worker
docker cp infra/n8n/ingestion_workflow.json sdoqap-n8n:/home/node/ingestion_workflow.json
MSYS_NO_PATHCONV=1 docker exec -u node sdoqap-n8n n8n import:workflow --input=/home/node/ingestion_workflow.json
MSYS_NO_PATHCONV=1 docker exec -u node sdoqap-n8n n8n update:workflow --id=1 --active=true
docker restart sdoqap-n8n
for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/v1/services/status); [ "$c" = 200 ] && echo "api up after ~$((i*5))s" && break; sleep 5; done
for i in $(seq 1 24); do c=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:5678/webhook/1/webhooktrigger/ingest -H 'Content-Type: application/json' -d '{"source_type":"none"}'); [ "$c" = 200 ] && echo "n8n workflow active after ~$((i*5))s" && break; sleep 5; done
```
Expected: import พิมพ์ `Successfully imported 1 workflow.`, แล้ว `api up after ...` และ `n8n workflow active after ...` (n8n 2.x: URL ของ webhook เป็น `/webhook/1/webhooktrigger/ingest` เพราะ node ไม่มี `webhookId`; `update:workflow --active=true` เป็นคำสั่งที่ทำให้ workflow active หลัง restart ได้จริง ส่วน `publish:workflow` ทำให้สถานะหายหลัง restart บนเครื่องนี้ อย่าใช้) ถ้า log ของ n8n ไม่มีบรรทัด `Activated workflow "SDOQAP_Ingestion_Pipeline"` ให้เปิด http://localhost:5678 เปิดสวิตช์ Active แล้วลองใหม่

- [ ] **Step 3: G1 และ G2 บนระบบจริง**

```bash
envval() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '\r'; }
JAR="$(pwd)/docs/testing/evidence/.verify.jar"
curl -s -o /dev/null -w 'login HTTP %{http_code}\n' -c "$JAR" -H 'Content-Type: application/json' \
  -d "$(printf '{"username":"%s","password":"%s"}' "$(envval ADMIN_USERNAME)" "$(envval ADMIN_PASSWORD)")" http://localhost/api/v1/auth/login
curl -s -o /dev/null -w 'G1 gold/schema-drift HTTP %{http_code}\n' 'http://localhost/api/v1/gold/schema-drift?days=30'
RES=$(curl -s -b "$JAR" -F table_name=qa_route_probe -F "file=@data/samples/student_scores/student_scores_sample.csv" http://localhost/api/v1/pipeline/ingest/csv)
echo "$RES" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('status'), d.get('ingest_id'))"
curl -s -o /dev/null -w 'G2 raw preview HTTP %{http_code}\n' http://localhost/api/v1/export/preview/raw/qa_route_probe
echo "G2 raw download lines: $(curl -s http://localhost/api/v1/export/raw/qa_route_probe | wc -l)"
```
Expected: `login HTTP 200`, `G1 gold/schema-drift HTTP 200`, `queued <ingest_id>`, `G2 raw preview HTTP 200`, `G2 raw download lines: 1031` (1,030 แถว + header) จด `<ingest_id>` ไว้ใช้ Step 6

- [ ] **Step 4: ผู้เรียกแบบเครื่องมีคีย์และปลายทางรับ**

```bash
docker exec sdoqap-n8n sh -c 'for v in INGEST_SERVICE_KEY ALERT_WEBHOOK_SECRET TRIGGER_SHARED_SECRET ELASTICSEARCH_PASSWORD; do eval "x=\$$v"; [ -n "$x" ] && echo "n8n has $v" || echo "n8n MISSING $v"; done'
docker exec sdoqap-n8n sh -c 'wget -qO- --header="Authorization: Basic $(printf "elastic:%s" "$ELASTICSEARCH_PASSWORD" | base64)" http://elasticsearch:9200/_cluster/health | head -c 40; echo'
docker exec sdoqap-n8n sh -c 'wget -qO- --header="X-Trigger-Secret: $TRIGGER_SHARED_SECRET" http://spark-master:8099/stream/status | head -c 60; echo'
docker exec sdoqap-grafana sh -c 'curl -s -o /dev/null -w "grafana bearer -> alert HTTP %{http_code}\n" -H "Authorization: Bearer $ALERT_WEBHOOK_SECRET" -H "Content-Type: application/json" -d "{\"title\":\"QA key check (ignore)\",\"message\":\"route completeness plan\",\"severity\":\"info\"}" http://api:8000/api/v1/system/alert'
curl -s -u admin:admin http://localhost:3002/api/v1/provisioning/contact-points | python -c "import sys,json; [print(c['name'], c['settings'].get('authorization_scheme')) for c in json.load(sys.stdin)]"
echo "cleanup without key : $(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost/api/v1/system/cleanup)"
echo "cleanup wrong key   : $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'X-Service-Key: nope' http://localhost/api/v1/system/cleanup)"
echo "alert without secret: $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"title":"x","message":"y"}' http://localhost/api/v1/system/alert)"
```
Expected: `n8n has ...` ครบสี่บรรทัด; JSON ของ cluster health ขึ้นต้นด้วย `{"cluster_name"`; JSON สถานะ stream (มี `"status"`); `grafana bearer -> alert HTTP 200`; `SDOQAP Alert Router Webhook Bearer`; `cleanup without key : 401`; `cleanup wrong key   : 401`; `alert without secret: 401`

กรณีเรียก cleanup ด้วยคีย์ที่ถูก **ไม่ทดสอบบนระบบจริง** เพราะจะลบข้อมูลเก่ากว่า retention ทางบวกพิสูจน์ด้วย `tests/test_machine_auth.py::test_cleanup_accepts_the_n8n_service_key` และแผนทดสอบ T12.7 ที่มีเงื่อนไขป้องกัน

- [ ] **Step 5: n8n ส่ง alert ถึง API จริง (พิสูจน์ expression ของ header)**

รอให้ run ของ `qa_route_probe` จบก่อน (ใช้ `<ingest_id>` จาก Step 3) แล้วรอรอบ "Every 15 Minutes" ของ n8n:

```bash
ID=<ingest_id>
for i in $(seq 1 120); do s=$(curl -s http://localhost/api/v1/pipeline/runs/$ID | python -c "import sys,json; print(json.load(sys.stdin).get('state',''))"); case "$s" in SUCCEEDED|FAILED|TRIGGER_FAILED) echo "run $s after ~$((i*5))s"; break;; esac; sleep 5; done
for i in $(seq 1 34); do n=$(docker compose logs --since 20m api 2>/dev/null | grep -c '"POST /api/v1/system/alert HTTP/1.1" 200'); [ "$n" -ge 2 ] && echo "alerts delivered: $n" && break; sleep 30; done
docker compose logs --since 20m api 2>/dev/null | grep -c '"POST /api/v1/system/alert HTTP/1.1" 401'
```
Expected: `run SUCCEEDED after ...`; `alerts delivered: N` โดย N ≥ 2 ภายใน ~17 นาที (1 ครั้งจาก Step 4 และอย่างน้อย 1 ครั้งจาก n8n เพราะ run นี้มีแถว quarantine); บรรทัดสุดท้ายคือจำนวน 401 ซึ่งต้องเท่ากับ `1` (ครั้งเดียวจากการทดสอบ "alert without secret" ใน Step 4) ถ้า N ค้างที่ 1: ดู `docker compose logs --since 20m api | grep system/alert` ถ้าเห็น 401 จาก IP ของ n8n แปลว่า expression ของ `X-Webhook-Secret` ผิด; ถ้าไม่เห็นคำเรียกเลย แปลว่า node "Fetch Recent Quality Runs" ล้ม (ดู Executions ใน http://localhost:5678) ให้ลง FAIL พร้อมข้อความ error ของ node

- [ ] **Step 6: ลบตารางทดสอบ**

```bash
JAR="$(pwd)/docs/testing/evidence/.verify.jar"
curl -s -b "$JAR" -X DELETE -w '\nHTTP %{http_code}\n' http://localhost/api/v1/export/tables/qa_route_probe
rm -f "$JAR"
```
Expected: `HTTP 200` และข้อความ `Table 'qa_route_probe' and all associated metadata deleted successfully.`

- [ ] **Step 7: ฟีเจอร์ LLM ใช้คีย์ได้จริง (ข้ามถ้าเจ้าของไม่ใช้ Groq)**

```bash
curl -s http://localhost/api/v1/system/settings | python -c "import sys,json; d=json.load(sys.stdin); print('key present:', bool(d['groq_api_key_masked']), '| enabled:', d['groq_enabled'])"
docker exec sdoqap-api python -c "import os,requests; r=requests.post('https://api.groq.com/openai/v1/chat/completions', headers={'Authorization':'Bearer '+os.environ['GROQ_API_KEY']}, json={'model':'llama-3.3-70b-versatile','messages':[{'role':'user','content':'ping'}],'max_tokens':5}, timeout=20); print('groq HTTP', r.status_code)"
docker exec sdoqap-spark-master sh -c '[ -n "$GROQ_API_KEY" ] && echo "spark has GROQ_API_KEY" || echo "spark MISSING GROQ_API_KEY"'
curl -s 'http://localhost/api/v1/whitebox/ai-context-explanations?force=true' | python -c "import sys,json; d=json.load(sys.stdin); print('available:', d['available'], '| live:', d['ai_live_generated'], '| engine:', d['engine'])"
```
Expected: `key present: True | enabled: True`; `groq HTTP 200`; `spark has GROQ_API_KEY`; `available: True | live: True | engine: Groq openai/gpt-oss-120b` ถ้าเจ้าของบันทึกคีย์ผ่านหน้า Rules แทน `.env` บรรทัดที่สองและสามจะหาตัวแปร env ไม่เจอ (`KeyError` / `spark MISSING`) ซึ่งไม่ผิด ให้ตัดสินจากบรรทัดแรกและบรรทัดสุดท้าย ถ้า `live: False` ทั้งที่มีคีย์: ดู `docker compose logs --tail 30 api | grep "AI Context LLM fallback"` แล้วลง FAIL พร้อมข้อความนั้น

- [ ] **Step 8: Ollama (LLM แบบไม่ใช้คีย์) ถ้า profile `ai` เปิดอยู่**

```bash
docker inspect --format '{{.State.Health.Status}}' sdoqap-ollama
docker exec sdoqap-ollama sh -c 'command -v curl || echo NO_CURL'
```

ถ้าได้ `healthy` ไม่ต้องแก้อะไร ถ้าได้ `unhealthy` พร้อม `NO_CURL` (image ไม่มี `curl` healthcheck จึงล้มเสมอ) แก้ `docker-compose.yml` service `ollama` จาก

```yaml
      test: ["CMD-SHELL", "curl -f http://localhost:11434/api/tags || exit 1"]
```

เป็น

```yaml
      test: ["CMD", "ollama", "list"]
```

แล้ว

```bash
docker compose up -d ollama
docker exec sdoqap-ollama ollama pull qwen2.5:3b
for i in $(seq 1 12); do s=$(docker inspect --format '{{.State.Health.Status}}' sdoqap-ollama); [ "$s" = healthy ] && echo "ollama healthy" && break; sleep 10; done
docker exec sdoqap-ollama ollama list
```
Expected: `ollama healthy` และรายการ model มี `qwen2.5:3b` (model ที่ `services/spark/auto_remediation_engine.py` ใช้เป็นค่าเริ่มต้น ขนาดราว 2 GB) ถ้า `unhealthy` แต่มี `curl` อยู่ ให้เก็บ `docker inspect --format '{{json .State.Health.Log}}' sdoqap-ollama` ลง evidence แล้วรายงาน ไม่ต้องแก้ healthcheck

- [ ] **Step 9: รัน test ทั้งหมดอีกรอบ แล้ว commit**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests" | tail -3
python -m pytest -q scripts/qa/tests scripts/dev/tests | tail -2
git status --short
```
Expected: API suite ไม่มี `failed`; `18 passed` ของสคริปต์; `git status` มีเฉพาะ `docs/testing/evidence/route-completeness-live.txt` และ (ถ้าแก้) `docker-compose.yml`

```bash
git add docs/testing/evidence/route-completeness-live.txt docker-compose.yml
git commit -m "test(qa): live verification of route completeness and caller keys"
```

---

## Self-Review

**Coverage ของผลตรวจ:** G1 → Task 1 (test + alias) และ Task 8 Step 3; G2 → Task 2 และ Task 8 Step 3; G3 → Task 3 (API) + Task 4 (n8n) + Task 8 Step 4; G4 → Task 3 + Task 4 + Task 8 Step 4–5; G5 → Task 4 + Task 8 Step 4–5; G6 → Task 5 + Task 8 Step 7; K1 → Task 6 + Task 8 Step 1, 7; K2 → Task 8 Step 8 "เช็ค API ทุกเส้น" → `CALLS` ของ Task 1 (ฝั่งผู้เรียก 81 คำเรียก) และ `route_coverage.py` ของ Task 7 (ฝั่ง route 94 เส้นหลังเพิ่ม alias ใช้เป็นประตูใน Task 14B ของแผนทดสอบ)

**สิ่งที่ตั้งใจไม่ทำ:** ไม่เรียก cleanup ด้วยคีย์จริงบนระบบที่มีข้อมูล; ไม่แก้ `standardize/rollback` (500 แทน 400) และ `services/status` ที่คืนรหัสผ่าน (ลงเป็น Finding ในรายงานทดสอบ); ไม่เพิ่ม job ใน CI สำหรับ test ของ `scripts/` (ตามแบบของ `scripts/evaluation/tests` ที่รันบนเครื่อง)

**ความเสี่ยงที่ต้องพิสูจน์ตอนรันจริง (ไม่ใช่ placeholder แต่เป็นสิ่งที่ยืนยันไม่ได้ตอนเขียนเพราะ Docker ไม่ได้รัน):** expression `.base64Encode()` และ `$env` ใน n8n (พิสูจน์ที่ Task 8 Step 5), การแทนค่า `$ALERT_WEBHOOK_SECRET` ในไฟล์ provisioning ของ Grafana (Task 8 Step 4 ตรวจได้ว่า scheme ถูกโหลดและ container มีตัวแปร การส่งจริงจาก Grafana ตรวจด้วยปุ่ม Test ของ contact point ที่ Task 12 Step 4 ของแผนทดสอบ), คำสั่ง `n8n update:workflow` (Task 8 Step 2 มีทางสำรองผ่าน UI)

**Consistency:** ชื่อที่ใช้ข้าม task ตรงกัน: `resolve_raw_csv_path` (Task 2), `_run_retention_cleanup` และ `require_session_or_service_key` (Task 3), ตาราง header ของ Task 4 ตรงกับ `REQUIRED_HEADERS` ใน test และสคริปต์ patch, `_saved_groq_setting`/`_get_groq_api_key` (Task 5), `ensure`/`main`/`LOCAL_SECRETS`/`EXTERNAL_KEYS` (Task 6), `load_routes`/`match_route`/`parse_calls`/`classify`/`coverage`/`main` (Task 7) รูปแบบ log `METHOD PATH STATUS` ตรงกับ `_log` ใน `scripts/qa/lib.sh` ของแผนทดสอบ
