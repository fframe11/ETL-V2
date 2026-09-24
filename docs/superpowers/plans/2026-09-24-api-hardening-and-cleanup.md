# API Hardening & Repo Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the root-cause issues found in the code review of the SDOQAP platform (`C:\ETL`): an unenforced rate limiter, an insecure CORS+credentials combo, a duplicated/hacky Elasticsearch client pattern in `api/main.py`, a 1546-line monolithic `main.py`, tracked `.bak` files, and stale architecture docs.

**Architecture:** No new services or dependencies. All fixes work within the existing FastAPI app (`api/main.py` + `api/app/api/*.py` routers) and existing Docker Compose stack, which is currently running live (`docker ps` shows `sdoqap-api`, `sdoqap-ui`, etc. healthy). Every task that touches `api/` is verified by rebuilding and restarting only the `api` container and curling the affected endpoints against the running stack — never `docker compose down`.

**Tech Stack:** FastAPI, slowapi, elasticsearch-py, Docker Compose.

**Spec:** This plan's spec is the review findings from this conversation (no separate spec doc — the findings below are quoted from the review).

## Global Constraints

- Never touch the live ES/Grafana/Postgres passwords — no credential rotation in this plan (flagged as a separate operational decision, not executed here).
- Every task must leave `docker compose ps` showing `sdoqap-api` healthy before moving to the next task.
- Do not change any HTTP route path or response shape — this is a refactor/hardening pass, not a behavior change, except where a task explicitly says a behavior is the fix (CORS, rate limit).
- Follow the existing router convention already used in `api/app/api/quality.py`: `from .config import get_elasticsearch_url, get_es_client`, `es = get_es_client()`, `APIRouter(prefix=..., tags=[...])`.

## Not In Scope (deferred, with reasons)

- **Deduplicating `scripts/alert_router.py` / `spark/alert_router.py` and `scripts/reddit_stream.py` / `spark/reddit_stream.py`.** Confirmed both copies are load-bearing: the `spark-master`/`spark-worker` containers only mount `./spark:/opt/spark-apps` (see `docker-compose.yml:145,180`), not `./scripts`, so `spark/spark_quality_engine.py:1600` and `spark/spark_trigger_daemon.py:48` need their own local copies. Fixing this needs a docker-compose volume change plus import-path changes in the Spark containers, which run the core quality pipeline — too risky to change without a full pipeline regression run.
- **Bumping `fastapi>=0.100.0,<0.101.0` in `api/requirements.txt`.** A framework version bump needs broader regression testing than a single smoke test against the live container; recommend as a separate, dedicated task.
- **Rotating the default `sdoqap_secure` / `admin`/`admin` passwords.** ES 8 persists the `elastic` user's password in its data volume on first boot, so changing the env var alone won't change the live password — needs `elasticsearch-reset-password` or a volume reset, which would disrupt the running stack. This plan adds a startup warning instead (Task 1) so the operator can't miss it, and leaves the actual rotation as an operator decision.

---

### Task 1: Fix CORS credentials misconfiguration + warn on default ES password

**Files:**
- Modify: `api/main.py:36-42` (CORS middleware), and the block around `api/main.py:88-100` (`get_elasticsearch_url`)

**Why this is safe:** `ui/src/pages/Login.jsx:22` stores its token in `sessionStorage` (`sdoqap_admin_token`), not a cookie — no code anywhere sends credentialed (cookie-bearing) cross-origin requests, so `allow_credentials=True` was dead configuration that only weakened the wildcard CORS policy.

- [ ] **Step 1: Flip `allow_credentials` to `False`**

In `api/main.py`, change:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

to:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- [ ] **Step 2: Add a startup warning when the ES password falls back to the shipped default**

Find `ELASTICSEARCH_URL = get_elasticsearch_url()` in `api/main.py` (currently line 100, right after the local `get_elasticsearch_url` definition — this line stays in Task 1, the function itself is removed in Task 3). Directly below it, add:

```python
ELASTICSEARCH_URL = get_elasticsearch_url()

if not os.getenv("ELASTICSEARCH_PASSWORD"):
    logging.getLogger("sdoqap.startup").warning(
        "ELASTICSEARCH_PASSWORD is not set — falling back to the default "
        "credential documented in README.md. This default is public; set "
        "ELASTICSEARCH_PASSWORD in .env before exposing this stack beyond localhost."
    )
```

(`logging` and `os` are already imported at the top of `main.py`.)

- [ ] **Step 3: Rebuild and verify**

```bash
docker compose build api && docker compose up -d api
```

```bash
docker logs sdoqap-api --tail 50
```

Expected: container becomes healthy (`docker compose ps` shows `sdoqap-api` as `healthy`), and if `.env` doesn't set `ELASTICSEARCH_PASSWORD` the warning line appears in the logs.

```bash
curl -i http://localhost:8002/healthz
```

Expected: `200 OK`, `{"app":"ok",...}`.

- [ ] **Step 4: Commit**

```bash
git add api/main.py
git commit -m "fix(api): disable CORS credentials (unused) and warn on default ES password"
```

---

### Task 2: Wire up the rate limiter (currently declared but never enforced)

**Files:**
- Modify: `api/main.py:51-56` (Limiter setup)

**Why this is the root cause:** `Limiter(..., default_limits=["100/minute"])` and `app.state.limiter = limiter` were set, but slowapi only enforces `default_limits` automatically if `SlowAPIMiddleware` is registered, or if individual routes carry `@limiter.limit(...)`. Neither was done, so every endpoint was unlimited.

- [ ] **Step 1: Add the middleware**

In `api/main.py`, change:

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)
```

to:

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
```

- [ ] **Step 2: Rebuild and verify it's enforced**

```bash
docker compose build api && docker compose up -d api
```

```bash
for i in $(seq 1 105); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8002/healthz; done | sort | uniq -c
```

Expected: mostly `200`, with some `429` appearing once the loop crosses 100 requests/minute (the loop is fast enough to trip the limit; `/healthz` is excluded from schema but still passes through the middleware like any other route).

- [ ] **Step 3: Confirm the UI still works normally (single page load stays under the limit)**

```bash
curl -i http://localhost:8002/api/v1/services/status
```

Expected: `200 OK` with the normal services-status JSON (a handful of requests from one browser session is nowhere near 100/minute).

- [ ] **Step 4: Commit**

```bash
git add api/main.py
git commit -m "fix(api): enforce the declared rate limit via SlowAPIMiddleware"
```

---

### Task 3: Consolidate the Elasticsearch client to the existing `config.get_es_client()` helper

**Files:**
- Modify: `api/main.py:1-19` (monkeypatch), `api/main.py:44-46` (import), `api/main.py:88-100` (duplicate `get_elasticsearch_url`), and all 17 call sites matching `Elasticsearch(ELASTICSEARCH_URL...)`

**Why this is the root cause:** `api/app/api/config.py` already has a correct, singleton `get_es_client()` (used by `api/app/api/quality.py:17` and the other routers). `main.py` didn't use it — instead it shadowed the imported `Elasticsearch` class with a hand-rolled singleton function (`main.py:12-19`) and re-implemented `get_elasticsearch_url()` (`main.py:88-98`) rather than importing the existing one. This is the confusing "function shadowing a class name" pattern flagged in review, and it left `get_required_env` imported and never called (`main.py:46`).

- [ ] **Step 1: Remove the monkeypatch and the dead import**

Delete these lines from the top of `api/main.py`:

```python
_original_Elasticsearch = Elasticsearch
_global_es_client = None

def Elasticsearch(*args, **kwargs):
    global _global_es_client
    if _global_es_client is None:
        _global_es_client = _original_Elasticsearch(*args, **kwargs)
    return _global_es_client
```

Change:

```python
from app.api.config import get_required_env
```

to:

```python
from app.api.config import get_elasticsearch_url, get_es_client
```

(keep this import where it currently sits, right after `from app.api.config import get_required_env` was — i.e. still before `logging.basicConfig(...)`)

- [ ] **Step 2: Remove the duplicate `get_elasticsearch_url` and `get_elasticsearch_url()`-building code**

Delete the local function:

```python
def get_elasticsearch_url():
    # Prefer full URL if provided via environment
    es_url = os.getenv("ELASTICSEARCH_URL")
    if es_url:
        return es_url
    # Otherwise construct from components, using defaults where appropriate
    es_user = os.getenv("ELASTICSEARCH_USER", "elastic")
    es_pass = os.getenv("ELASTICSEARCH_PASSWORD", "sdoqap_secure")
    es_host = os.getenv("ELASTICSEARCH_HOST", "localhost")
    es_port = os.getenv("ELASTICSEARCH_PORT", "9200")
    return f"http://{es_user}:{es_pass}@{es_host}:{es_port}"
```

`ELASTICSEARCH_URL = get_elasticsearch_url()` stays — it now calls the imported `config.get_elasticsearch_url`, which is byte-for-byte the same logic, so `ELASTICSEARCH_URL` (still used by the `/healthz` and `/health` `requests.head/get` probes) is unaffected.

- [ ] **Step 3: Replace all 17 client construction call sites**

Every occurrence of:

```python
es = Elasticsearch(ELASTICSEARCH_URL)
```

or

```python
es = Elasticsearch(ELASTICSEARCH_URL, request_timeout=1)
```

becomes:

```python
es = get_es_client()
```

(These are the exact lines currently at `main.py:166, 230, 516, 596, 736, 810, 896, 963, 986, 1020, 1068, 1113, 1239, 1349, 1386, 1488, 1508` — line numbers will shift as earlier steps remove lines, so do this as a global find/replace of the two patterns above rather than by line number.)

- [ ] **Step 4: Verify no `Elasticsearch(` call sites remain except the import line**

```bash
grep -n "Elasticsearch(" api/main.py
```

Expected: only `from elasticsearch import Elasticsearch` (the import statement) — zero remaining `Elasticsearch(...)` construction calls.

- [ ] **Step 5: Rebuild and smoke-test a representative sample of the affected endpoints**

```bash
docker compose build api && docker compose up -d api
```

```bash
curl -s http://localhost:8002/api/v1/kpi/stats | head -c 300; echo
curl -s http://localhost:8002/api/v1/executive/overview | head -c 300; echo
curl -s http://localhost:8002/api/v1/analytics/impact | head -c 300; echo
curl -s http://localhost:8002/api/v1/system/activity | head -c 300; echo
```

Expected: all four return valid JSON (not a 500), matching the shape they returned before this change (same field names as read earlier in this session).

```bash
docker logs sdoqap-api --tail 30
```

Expected: no new tracebacks.

- [ ] **Step 6: Commit**

```bash
git add api/main.py
git commit -m "refactor(api): use the shared config.get_es_client() instead of a local ES singleton hack"
```

---

### Task 4: Split `api/main.py` into focused routers

**Files:**
- Create: `api/app/api/analytics.py`
- Create: `api/app/api/gold.py`
- Create: `api/app/api/system.py`
- Modify: `api/main.py` (remove the moved functions, register the 3 new routers)

**Why this is the root cause:** `main.py` is 1546 lines with heavy business logic (KPI aggregation, linear-regression forecasting, clustering, COPDQ cost modeling) written directly in the app entrypoint, while every other domain (`lineage`, `pipeline`, `quality`, `schema`, `data_export`, `dynamic_rules`, `standardize`, `whitebox`) already lives in its own `app/api/*.py` router. This is pure reorganization — no endpoint path or response body changes.

**Grouping (function → destination file, all currently in `api/main.py` after Task 3):**

| Function | Route(s) | Destination |
|---|---|---|
| `get_kpi_stats` | `GET /api/v1/kpi/stats` | `analytics.py` |
| `get_executive_overview` | `GET /api/v1/executive/overview` | `analytics.py` |
| `get_anomaly_sources` | `GET /api/v1/anomaly/sources` | `analytics.py` |
| `get_quality_projection` | `GET /api/v1/analytics/projection` | `analytics.py` |
| `get_diagnostic_clustering` | `GET /api/v1/analytics/clustering` | `analytics.py` |
| `get_business_impact` | `GET /api/v1/analytics/impact` | `analytics.py` |
| `get_actionable_recommendations` | `GET /api/v1/analytics/recommendations` | `analytics.py` |
| `get_gold_daily_quality` | `GET /api/v1/gold/daily-quality` | `gold.py` |
| `get_gold_error_patterns` | `GET /api/v1/gold/error-patterns` | `gold.py` |
| `get_gold_financial_impact` | `GET /api/v1/gold/financial-impact` | `gold.py` |
| `get_gold_schema_drift_history` | `GET /api/v1/gold/schema-drift-history` | `gold.py` |
| `trigger_gold_rebuild` | `POST /api/v1/gold/rebuild` | `gold.py` |
| `get_services_status` (+ its `executor`) | `GET /api/v1/services/status` | `system.py` |
| `get_performance_metrics` | `GET /api/v1/performance/metrics` | `system.py` |
| `get_system_activity` | `GET /api/v1/system/activity` | `system.py` |
| `trigger_system_cleanup` | `POST /api/v1/system/cleanup` | `system.py` |
| `get_system_settings` / `update_system_settings` (+ `SettingsPayload`) | `GET`/`POST /api/v1/system/settings` | `system.py` |
| `trigger_alert_routing` | `POST /api/v1/system/alert` | `system.py` |
| `get_upstream_remediations` / `resolve_upstream_remediation` | `GET /api/v1/system/remediations`, `POST /api/v1/system/remediations/{ticket_id}/resolve` | `system.py` |

**Stays in `main.py`:** app setup (imports, CORS, logging, rate limiter, `ELASTICSEARCH_URL`), `/healthz`, `/health`, `/` (`read_portal`), and the `app.include_router(...)` calls.

**Important fix during the move (not a behavior change, a latent bug being closed):** `trigger_alert_routing` currently computes `script_dir = os.path.dirname(os.path.abspath(__file__))` to find `scripts/alert_router.py` relative to `main.py`'s own location (`/app` in the container). Moving this function into `api/app/api/system.py` changes `__file__` to `/app/app/api/system.py`, so the same computation would resolve to the wrong directory. Use this instead, which walks up to the container's `/app` root regardless of which file it's in:

```python
from pathlib import Path
APP_ROOT = Path(__file__).resolve().parents[2]  # api/app/api/system.py -> api/app -> api -> /app in the container
```

and reference `str(APP_ROOT)` where the old code used `script_dir`. (`trigger_system_cleanup`'s path, `"/app/scripts/data_retention_cleanup.py"`, is already an absolute container path and needs no change.)

- [ ] **Step 1: Create `api/app/api/analytics.py`**

Copy `get_kpi_stats`, `get_executive_overview`, `get_anomaly_sources`, `get_quality_projection`, `get_diagnostic_clustering`, `get_business_impact`, `get_actionable_recommendations` verbatim from `main.py` (post-Task-3 versions, i.e. already using `get_es_client()`) into this new file, with this header:

```python
import math
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException

from .config import get_es_client

router = APIRouter(tags=["analytics"])
```

Replace every `@app.get(...)` / `@app.post(...)` decorator on these 7 functions with `@router.get(...)` / `@router.post(...)` (same path string, same method — just swap `app` for `router`). Keep `get_executive_overview`'s internal call `impact_data = get_business_impact()` as a plain Python function call — both functions now live in the same module, so this keeps working unchanged.

- [ ] **Step 2: Create `api/app/api/gold.py`**

Copy `get_gold_daily_quality`, `get_gold_error_patterns`, `get_gold_financial_impact`, `get_gold_schema_drift_history`, `trigger_gold_rebuild` verbatim, with this header:

```python
import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter

from .config import get_es_client

router = APIRouter(tags=["gold"])
```

Same `@app.` → `@router.` decorator swap, same paths (they already include the full `/api/v1/gold/...` prefix, keep it — no router-level `prefix=` needed).

- [ ] **Step 3: Create `api/app/api/system.py`**

Copy `get_services_status` (with its `executor = ThreadPoolExecutor(max_workers=20)`), `get_performance_metrics`, `get_system_activity`, `trigger_system_cleanup`, `SettingsPayload` + `get_system_settings` + `update_system_settings`, `trigger_alert_routing` (with the `Path(__file__).resolve().parents[2]` fix above), `get_upstream_remediations`, `resolve_upstream_remediation`, with this header:

```python
import os
import json
import socket
import subprocess
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .config import get_es_client

router = APIRouter(tags=["system"])

APP_ROOT = Path(__file__).resolve().parents[2]
```

Same `@app.` → `@router.` decorator swap, same paths.

- [ ] **Step 4: Remove the moved functions from `main.py` and register the new routers**

Delete the 19 functions listed in the grouping table from `main.py` (their bodies, decorators, and the now-orphaned `SettingsPayload` class / `executor` / `math` import that only they used — keep `from datetime import ...` and `import json`/`import socket`/`import requests` in `main.py` only if `/healthz`, `/health`, or `read_portal` still use them; `/healthz` uses `socket` and `requests`, `/health` uses `requests` — keep those two imports, drop `math`, `json`, `subprocess`, `threading`, `ThreadPoolExecutor`, `BaseModel` from `main.py` if nothing left there uses them).

Add, next to the existing `app.include_router(...)` block:

```python
from app.api.analytics import router as analytics_router
from app.api.gold import router as gold_router
from app.api.system import router as system_router
...
app.include_router(analytics_router)
app.include_router(gold_router)
app.include_router(system_router)
```

- [ ] **Step 5: Syntax-check all four files before rebuilding**

```bash
python -m py_compile api/main.py api/app/api/analytics.py api/app/api/gold.py api/app/api/system.py
```

Expected: no output (success).

- [ ] **Step 6: Rebuild and do a full endpoint smoke test**

```bash
docker compose build api && docker compose up -d api
docker logs sdoqap-api --tail 50
```

Expected: healthy, no import errors.

```bash
for path in \
  "/api/v1/kpi/stats" \
  "/api/v1/executive/overview" \
  "/api/v1/anomaly/sources" \
  "/api/v1/analytics/projection" \
  "/api/v1/analytics/clustering" \
  "/api/v1/analytics/impact" \
  "/api/v1/analytics/recommendations" \
  "/api/v1/gold/daily-quality" \
  "/api/v1/gold/error-patterns" \
  "/api/v1/gold/financial-impact" \
  "/api/v1/gold/schema-drift-history" \
  "/api/v1/services/status" \
  "/api/v1/performance/metrics" \
  "/api/v1/system/activity" \
  "/api/v1/system/settings" \
  "/api/v1/system/remediations" \
  "/healthz" \
  "/health" \
  "/"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8002$path")
  echo "$path -> $code"
done
```

Expected: every path returns `200` (none should be `404` — a `404` here means a route was lost in the move, or `500` means an import/runtime bug from the move).

- [ ] **Step 7: Confirm the running dashboard UI still loads real data**

```bash
curl -s http://localhost:8002/api/v1/kpi/stats
```

Compare the JSON shape (`total_records_ingested`, `global_quality_score`, `quarantined_records`, `mttd_minutes`) against what was read earlier in this session's review — same keys, plausible values.

- [ ] **Step 8: Commit**

```bash
git add api/main.py api/app/api/analytics.py api/app/api/gold.py api/app/api/system.py
git commit -m "refactor(api): split analytics/gold/system endpoints out of main.py into dedicated routers"
```

---

### Task 5: Stop tracking generated `.bak` files

**Files:**
- Modify: `.gitignore`
- Untrack: `spark/rules_config.json.bak`, `spark/schema_registry.json.bak`

**Why:** `spark/ai_rule_advisor.py:1125-1128` generates `rules_config.json.bak` as a runtime rollback backup before applying AI-suggested rule changes — it's not stray editor cruft, it's an artifact the app regenerates on every run. Regenerated artifacts shouldn't be committed; `git rm --cached` removes them from version control only (the files stay on disk, the app is unaffected).

- [ ] **Step 1: Add the ignore rule**

In `.gitignore`, under the `# Build/dependency outputs` section, add:

```
*.bak
```

- [ ] **Step 2: Untrack the two currently-committed backup files**

```bash
git rm --cached spark/rules_config.json.bak spark/schema_registry.json.bak
```

- [ ] **Step 3: Verify**

```bash
git status
```

Expected: both files show as untracked (or don't show at all if `*.bak` is now ignoring them), and they still exist on disk:

```bash
ls spark/*.bak
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: stop tracking generated .bak files from ai_rule_advisor"
```

---

### Task 6: Rewrite the stale architecture docs to match the real SDOQAP stack

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/folder_structure.md`

**Why:** Both docs describe a different, older design called "ADRLP" built on Postgres + Airflow + dbt + Great Expectations. The real, running system (confirmed via `docker-compose.yml` and the actual `api/`, `spark/`, `ui/` folders) is SDOQAP: HDFS + Spark + Elasticsearch + n8n + FastAPI + React, as documented correctly in the root `README.md`. A new contributor reading `docs/` first would build the wrong mental model of the whole system.

- [ ] **Step 1: Rewrite `docs/architecture.md`**

Replace the entire file with:

```markdown
# SDOQAP - Architecture Design

This document details the technical architecture of the Scalable Data Observability and Quality Assurance Platform (SDOQAP).

---

## 1. System Overview

SDOQAP is a modular, containerized data platform (Docker Compose) that ingests data from files or APIs, lands it in HDFS, runs Spark-based quality checks, records results in Elasticsearch, and serves both a React dashboard and Grafana for observability.

```
+------------+      +------------------+      +-------------------+
|  Sources   | ---> |   n8n Ingestion  | ---> |   HDFS (raw)      |
| (CSV, API) |      |   Workflow       |      |  namenode/datanode |
+------------+      +------------------+      +-------------------+
                                                          |
                                                          v
+------------+      +------------------+      +-------------------+
|  UI / API  | <--- |   FastAPI        | <--- |  Spark Quality     |
| (React)    |      |   Serving Layer  |      |  Engine (active/  |
+------------+      +------------------+      |  quarantine split)|
      |                      ^                +-------------------+
      v                      |                          |
+------------+      +------------------+                v
| Grafana /  | <--- |  Elasticsearch   | <----------------
| Kibana     |      |  (quality_runs,  |
+------------+      |  schema_drifts,  |
                     |  pipeline_runs)  |
                     +------------------+
```

---

## 2. Component Design & Service Boundaries

### 2.1 Ingestion (n8n)
- **Role**: Orchestrates the ingestion workflow (`n8n/ingestion_workflow.json`) triggered by `test_data_source.bat` or the UI's Ingestion page.
- **Boundaries**: Reads local CSV files or an API URL, normalizes to CSV, and uploads to HDFS under `/data/raw/<table>/`.

### 2.2 Storage (HDFS)
- **Role**: Landing zone and versioned data lake, split into `raw`, `active`, and `quarantine` paths.
- **Boundaries**: `namenode`/`datanode` containers (`bde2020/hadoop-*`), single-replica for local dev.

### 2.3 Data Quality Layer (Apache Spark)
- **Role**: Runs schema validation, quality scoring, and quarantine routing (`spark/spark_quality_engine.py`), schema drift detection against `spark/schema_registry.json`, and config-driven rule evaluation against `spark/rules_config.json` (`spark/dynamic_rules_engine.py`).
- **Boundaries**: Reads from HDFS `raw`, writes clean records to `active`, flagged records to `quarantine`, and run results to Elasticsearch.

### 2.4 Metadata & Observability (Elasticsearch)
- **Role**: System of record for quality run history, schema drift events, pipeline run status, and gold-layer aggregates.
- **Indices**: `sdoqap_quality_runs`, `sdoqap_schema_drifts`, `sdoqap_pipeline_runs`, `sdoqap_gold_*`, `sdoqap_settings`, `sdoqap_upstream_remediations`.

### 2.5 Serving Layer (FastAPI)
- **Role**: Exposes REST endpoints for the UI and external consumers — quality runs, lineage, schema governance (approve/reject drift proposals), dynamic rules, executive/analytics dashboards, and a trust-check API for downstream BI/ML consumers.
- **Boundaries**: Routers live under `api/app/api/` (`lineage`, `pipeline`, `quality`, `schema`, `data_export`, `dynamic_rules`, `standardize`, `whitebox`, `analytics`, `gold`, `system`); `api/main.py` only assembles the app and exposes health checks.

### 2.6 Observability (Grafana, Kibana, Prometheus)
- **Role**: Grafana dashboards query Elasticsearch directly (`grafana/provisioning`); Kibana gives raw index exploration; Prometheus scrapes container metrics (`prometheus/prometheus.yml`).

### 2.7 Streaming (Kafka, Zookeeper)
- **Role**: Backing broker for streaming ingestion experiments (`spark/streaming_job.py`, `scripts/reddit_stream.py`).

---

## 3. Data Flow & Governance

### 3.1 Schema Drift Governance
- On ingestion, Spark compares incoming schema against `spark/schema_registry.json`.
- A drift creates a `PENDING` proposal in Elasticsearch and blocks the registry update.
- Operators approve/reject via `GET/POST /api/v1/schema/proposals[...]` (`api/app/api/schema.py`).

### 3.2 Quality Scoring
- `Quality Score = (Passed Rules / Total Rules) * 100`, evaluated per `spark/rules_config.json` (severity: critical/warning, per-table `quality_score_threshold`).
- Results are written to `sdoqap_quality_runs` and surfaced on the UI's Dashboard/Analytics pages and Grafana.

### 3.3 Trust-Check API
- `GET /api/v1/lineage/{table_name}/trust-check` lets downstream systems check `is_safe_to_consume` before reading a table, based on the latest quality score and any pending schema proposals.

---

## 4. Related Documents

- Root [`README.md`](../README.md) — setup and day-to-day usage (`start_system.bat`, `test_data_source.bat`).
- [`docs/folder_structure.md`](folder_structure.md) — repository layout.
- [`docs/schema_drift_governance.md`](schema_drift_governance.md) — schema drift workflow detail.
```

- [ ] **Step 2: Rewrite `docs/folder_structure.md`**

Replace the entire file with:

```markdown
# Project Folder Structure

This document outlines the monorepo folder structure for SDOQAP (Scalable Data Observability and Quality Assurance Platform).

---

## 1. Directory Tree

```
/ (Project Root)
├── docker-compose.yml              # Orchestrates HDFS, Spark, Elasticsearch, n8n, API, UI, Grafana, Kafka, etc.
├── docker-swarm-ha.yml             # HA deployment variant
├── start_system.bat                # Brings up the full stack
├── test_data_source.bat            # Menu-driven dataset/API ingestion test
├── .env                            # Elasticsearch/HDFS credentials (gitignored)
├── api/                            # Serving Layer (FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                     # App assembly, health checks, router registration
│   ├── seed_es.py                  # Elasticsearch index seeding
│   └── app/api/                    # Routers: lineage, pipeline, quality, schema,
│                                    #   data_export, dynamic_rules, standardize,
│                                    #   whitebox, analytics, gold, system, config
├── spark/                          # Quality engine and rule/schema config
│   ├── Dockerfile
│   ├── spark_quality_engine.py     # Core quality check + quarantine logic
│   ├── spark_gold_layer.py         # Pre-aggregated summary tables
│   ├── dynamic_rules_engine.py     # Evaluates spark/rules_config.json
│   ├── ai_rule_advisor.py          # Ollama-backed rule suggestions
│   ├── schema_registry.json        # Per-table primary key/date column/schema spec
│   ├── rules_config.json           # Per-table quality rules and thresholds
│   ├── semantic_cleaner/           # Semantic data-cleaning module
│   └── tests/                      # Integration tests (run_integration_test.py, etc.)
├── ui/                              # React (Vite) frontend — the Central Portal
│   └── src/
│       ├── pages/                  # Dashboard, Ingestion, Pipeline, Schema,
│       │                           #   RulesConfig, DataExport, Analytics, Metadata, ...
│       ├── components/
│       └── hooks/useApi.js
├── n8n/                             # Ingestion workflow definition (n8n)
├── grafana/provisioning/            # Grafana datasources + dashboards
├── prometheus/                      # Prometheus scrape config
├── nginx/                           # Reverse proxy in front of ui + api
├── scripts/                         # Host/API-container-side operational scripts
│   ├── dev/                        # activate_db, check_webhooks, inspect_db
│   ├── maintenance/                # cleanup, install, run_phase (.bat)
│   └── verify/                     # verify_pipeline.bat
├── user_inputs/                     # Where users drop dataset/API test files
│   ├── datasets/
│   └── apis/
├── dummy_data/                      # Sample data in multiple formats (csv/json/parquet/avro/xml)
└── docs/                            # This directory
```

---

## 2. Directory Descriptions

- **`/api`**: FastAPI serving layer. `main.py` only assembles the app (CORS, rate limiting, health checks, router registration); all domain logic lives in `app/api/*.py` routers, each with its own `APIRouter`.
- **`/spark`**: Runs inside the `spark-master`/`spark-worker` containers (mounted at `/opt/spark-apps`). Owns quality scoring, schema drift detection, and config-driven rules. Note: this directory is *not* the same mount as `/scripts` — some utility scripts (e.g. `alert_router.py`, `reddit_stream.py`) are intentionally duplicated between `/scripts` and `/spark` because the two containers don't share a volume.
- **`/ui`**: React dashboard, built and served behind `nginx`.
- **`/n8n`**: Ingestion workflow definitions used by `test_data_source.bat`.
- **`/grafana`, `/prometheus`**: Observability provisioning, auto-loaded on `docker compose up`.
- **`/scripts`**: Operational scripts mounted read-only into the `api` container at `/app/scripts`.
- **`/user_inputs`**: Drop zone for local CSV datasets and downloaded API responses (gitignored, except READMEs).
```

- [ ] **Step 3: Verify the docs render sensibly and cross-references resolve**

```bash
ls docs/schema_drift_governance.md README.md
```

Expected: both files exist (the links added in `architecture.md` point to real files).

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md docs/folder_structure.md
git commit -m "docs: rewrite architecture and folder-structure docs to match the real SDOQAP stack"
```

---

## Self-Review Notes

- **Spec coverage:** All 6 "fix now" findings from the review have a task (rate limiter → Task 2, CORS → Task 1, ES client hack → Task 3, monolithic main.py → Task 4, tracked `.bak` files → Task 5, stale docs → Task 6). The 3 findings requiring live-credential rotation or cross-container volume changes are explicitly deferred under "Not In Scope" with reasons, not silently dropped.
- **Sequencing:** Task 3 must run before Task 4 (Task 4 assumes the `get_es_client()` conversion is already done, so it's a pure move with no logic changes mixed in — lower risk, easier to diff-verify).
- **Type/name consistency:** `get_es_client()` and `get_elasticsearch_url()` names match `api/app/api/config.py`'s actual function names (verified by reading the file). Router variable names (`analytics_router`, `gold_router`, `system_router`) are consistent between creation and `include_router` calls.
