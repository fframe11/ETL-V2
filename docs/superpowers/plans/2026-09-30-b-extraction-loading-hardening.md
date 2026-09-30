# Plan B — Extraction + Loading ที่ครบถ้วนและปลอดภัย Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้การดึงข้อมูล (extraction) และการโหลด (loading) ไม่ทำข้อมูลหาย ไม่รันซ้ำโดยไม่ตั้งใจ ติดตามสถานะได้ตั้งแต่ถูกสั่งจนจบ และปิดช่องโหว่ของจุดนำเข้า — ตรงกับเกณฑ์ "ความครบถ้วนของการสกัดข้อมูล (10)" และ "ความครบถ้วนของการถ่ายโอนข้อมูล (5)"

**Architecture:** ทุกการนำเข้าได้ `ingest_id` ของตัวเองและลงโฟลเดอร์ที่ไม่ซ้ำ `/data/raw/<table>/<ingest_id>/` สถานะของแต่ละการนำเข้าเก็บในดัชนี ES ใหม่ `sdoqap_runs` (QUEUED → RUNNING → SUCCEEDED / FAILED / SKIPPED / TRIGGER_FAILED) API เป็นคนสร้างเอกสาร ส่วน daemon เป็นคนเปลี่ยนสถานะตาม exit code ของ Spark daemon ใช้คิวต่อตารางแทนการตอบ 409 ฝั่ง Spark อ่านเฉพาะโฟลเดอร์ของ `ingest_id` นั้น เขียน quarantine แบบ idempotent **ก่อน** MERGE และย้าย raw ไป `/data/archive/` แทนการลบ

**Tech Stack:** FastAPI + pytest/httpx (ใน container `api`), Python stdlib `http.server` (daemon), PySpark 3.4 + Delta 2.4, Elasticsearch 8, React + vitest

**Spec:** `docs/etl-review/2026-09-30-etl-system-review.md` — ข้อ F-S1, F-S2, F-S3, F-S4, F-D1, F-D2, F-D3, F-D4, F-D5, F-D6, F-D7, F-D9, F-D10, F-P1, F-P2, F-P3, F-P4, F-P5 และ activity diagram ข้อ 4.3

**ลำดับแผน:** A (เสร็จแล้ว — path ทั้งหมดในแผนนี้เป็น path หลังย้าย) → **B (แผนนี้)** → C → D

## Global Constraints

- ห้ามแก้เนื้อหา: `services/ui/src/pages/Dashboard.jsx`, `services/ui/src/pages/Analytics.jsx`, `services/api/app/api/analytics.py`, `services/api/app/api/gold.py`, `services/spark/spark_gold_layer.py`, `infra/grafana/**`, service `kibana`/`grafana` ใน compose
- endpoint `/gold/rebuild` ของ daemon **ต้องไม่ถูกบังคับ auth** เพราะ `gold.py` (ห้ามแก้) เรียกโดยไม่มี header — ป้องกันด้วยการเอา port 8099 ออกจาก host แทน
- ข้อความที่ผู้ใช้เห็นใน UI เป็นภาษาไทยเท่านั้น (เทสต์ `textBudget.test.jsx` ตั้ง `enforce_single_language: true`)
- `ingest_id` ต้องผ่าน regex `^[A-Za-z0-9_-]{1,128}$` เดียวกับ `validate_table_name`
- exit code ของ engine: `0` = สำเร็จ, `75` = ข้าม (lock ไม่ว่าง/ไฟล์ว่าง), อื่น ๆ = ล้มเหลว — ค่า `75` ต้องตรงกันใน `services/spark/run_support.py` และ `services/spark/trigger_core.py`
- ห้ามรัน `docker compose down -v`
- commit ลงท้าย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## คำสั่งมาตรฐาน

API tests:

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest httpx && python -m pytest -q -p no:cacheprovider tests"
```

Spark unit tests (ต้องให้ `spark-master` รันอยู่; โค้ด mount ที่ `/opt/spark-apps`):

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T -w /opt/spark-apps spark-master sh -c "python -m pip install -q pytest && python -m pytest -q -p no:cacheprovider tests/unit"
```

ถ้า `import pyspark` ไม่เจอในคำสั่งข้างบน ให้เติมหน้า `python -m pytest`: `PYTHONPATH=/opt/bitnami/spark/python:$(ls /opt/bitnami/spark/python/lib/py4j-*.zip)`

UI tests: `cd services/ui && npm test && cd ../..`

## File Structure

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `services/api/app/api/ingest_guards.py` | ใหม่ | allowlist URL แบบ fail-closed, GET ที่ตรวจทุก redirect, SELECT แบบ read-only, จำกัดขนาดอัปโหลด |
| `services/api/app/api/run_registry.py` | ใหม่ | อ่าน/เขียนดัชนี `sdoqap_runs`, `ingest_id`, checksum, path ของ raw |
| `services/api/app/api/pipeline.py` | แก้ | endpoint ingest เป็น sync, `land_and_queue`, ลบ fallback Popen, `GET /runs/{ingest_id}`, retry ตาม ingest |
| `services/api/tests/fakes.py` | ใหม่ | `FakeES` ในหน่วยความจำ |
| `services/spark/trigger_core.py` | ใหม่ | auth, validate, `TableJobQueue`, สร้างคำสั่ง spark-submit, อัปเดต `sdoqap_runs` |
| `services/spark/spark_trigger_daemon.py` | แก้ | ใช้ `trigger_core`, job chain ต่อตาราง, remediation ตาม ingest |
| `services/spark/run_support.py` | ใหม่ | exit code, path raw/archive, `Heartbeat`, `should_optimize` |
| `services/spark/spark_quality_engine.py` | แก้ | `--ingest-id`, quarantine ก่อน MERGE แบบ idempotent, archive, heartbeat, จังหวะ OPTIMIZE, เวลาประมวลผล |
| `services/spark/tests/unit/` | ใหม่ | conftest + เทสต์ของ `trigger_core`, `run_support` |
| `services/ui/src/hooks/useRunStatus.js`, `services/ui/src/components/RunStatusLine.jsx` | ใหม่ | แสดงสถานะรอบหลังนำเข้า |
| `docker-compose.yml`, `.env.example` | แก้ | เอา 8099 ออกจาก host, `TRIGGER_SHARED_SECRET`, รหัสผ่านต้องมาจาก `.env` |

---

### Task 1: `ingest_guards` — กันการดึงข้อมูลที่ไม่ปลอดภัย (F-S2, F-S3, F-P2)

**Files:**
- Create: `services/api/app/api/ingest_guards.py`
- Test: `services/api/tests/test_ingest_guards.py`

**Interfaces:**
- Produces:
  - `allowlisted_hosts(env_var: str) -> list[str]`
  - `validate_api_ingest_url(url: str) -> None` (raise `HTTPException(400)`)
  - `safe_get(url, headers=None, timeout=15, session_get=requests.get) -> Response`
  - `MAX_REDIRECTS = 3`
  - `validate_select_only(query: str) -> None`, `validate_rdbms_host(host: str) -> None`
  - `run_readonly_query(connect, query: str, max_rows: int, statement_timeout_ms: int = 30000) -> tuple[list[str], list[tuple]]`
  - `read_upload_limited(upload, max_bytes: int, chunk_size: int = 1048576) -> bytes`, `max_upload_bytes() -> int`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `services/api/tests/test_ingest_guards.py`:

```python
import io
import os
import sys

import pytest
from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import ingest_guards as g


class FakeResponse:
    def __init__(self, status_code, location=None):
        self.status_code = status_code
        self.headers = {"Location": location} if location else {}


def test_api_url_rejected_when_allowlist_unset(monkeypatch):
    monkeypatch.delenv("API_INGEST_ALLOWED_HOSTS", raising=False)
    with pytest.raises(HTTPException) as err:
        g.validate_api_ingest_url("https://example.com/data.json")
    assert err.value.status_code == 400
    assert "API_INGEST_ALLOWED_HOSTS" in err.value.detail


def test_data_go_th_is_always_allowed(monkeypatch):
    monkeypatch.delenv("API_INGEST_ALLOWED_HOSTS", raising=False)
    g.validate_api_ingest_url("https://data.go.th/api/3/action/datastore_search?resource_id=x")
    g.validate_api_ingest_url("https://catalog.data.go.th/dataset/abc")


def test_allowlisted_host_passes(monkeypatch):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com, other.org")
    g.validate_api_ingest_url("https://example.com/x")
    g.validate_api_ingest_url("http://other.org/y")


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.com/x", "https:///nohost"])
def test_non_http_or_hostless_urls_rejected(monkeypatch, url):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com")
    with pytest.raises(HTTPException) as err:
        g.validate_api_ingest_url(url)
    assert err.value.status_code == 400


def test_safe_get_blocks_redirect_to_internal_service(monkeypatch):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com")
    calls = []

    def fake_get(url, headers=None, timeout=None, allow_redirects=True):
        calls.append((url, allow_redirects))
        return FakeResponse(302, "http://elasticsearch:9200/_cat/indices")

    with pytest.raises(HTTPException) as err:
        g.safe_get("https://example.com/data", session_get=fake_get)
    assert err.value.status_code == 400
    assert calls == [("https://example.com/data", False)]


def test_safe_get_follows_redirect_within_allowlist(monkeypatch):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com")
    responses = [FakeResponse(301, "/v2/data"), FakeResponse(200)]
    urls = []

    def fake_get(url, headers=None, timeout=None, allow_redirects=True):
        urls.append(url)
        return responses.pop(0)

    res = g.safe_get("https://example.com/data", session_get=fake_get)
    assert res.status_code == 200
    assert urls == ["https://example.com/data", "https://example.com/v2/data"]


def test_safe_get_gives_up_after_max_redirects(monkeypatch):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com")
    calls = []

    def fake_get(url, headers=None, timeout=None, allow_redirects=True):
        calls.append(url)
        return FakeResponse(302, "/again")

    with pytest.raises(HTTPException) as err:
        g.safe_get("https://example.com/start", session_get=fake_get)
    assert "Too many redirects" in err.value.detail
    assert len(calls) == g.MAX_REDIRECTS + 1


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self.description = [("a",)]

    def execute(self, sql):
        self.conn.executed.append(sql)

    def fetchmany(self, n):
        return self.conn.rows[:n]


class FakeConn:
    def __init__(self, rows):
        self.rows = rows
        self.executed = []
        self.session = None
        self.closed = False

    def set_session(self, **kwargs):
        self.session = kwargs

    def cursor(self):
        return FakeCursor(self)

    def close(self):
        self.closed = True


def test_query_runs_in_readonly_transaction_with_timeout():
    conn = FakeConn(rows=[(1,), (2,)])
    columns, rows = g.run_readonly_query(lambda: conn, "SELECT a FROM t", max_rows=10)
    assert conn.session == {"readonly": True}
    assert conn.executed[0] == "SET statement_timeout = 30000"
    assert conn.executed[1] == "SELECT a FROM t"
    assert columns == ["a"] and rows == [(1,), (2,)]
    assert conn.closed


def test_query_over_row_cap_is_rejected_and_connection_closed():
    conn = FakeConn(rows=[(1,), (2,), (3,)])
    with pytest.raises(HTTPException) as err:
        g.run_readonly_query(lambda: conn, "SELECT a FROM t", max_rows=2)
    assert err.value.status_code == 413
    assert conn.closed


@pytest.mark.parametrize("sql", ["SELECT 1; DROP TABLE x", "DELETE FROM x", "WITH d AS (DELETE FROM x) SELECT 1"])
def test_non_select_sql_rejected(sql):
    with pytest.raises(HTTPException) as err:
        g.validate_select_only(sql)
    assert err.value.status_code == 400


class FakeUpload:
    def __init__(self, data):
        self.file = io.BytesIO(data)


def test_upload_over_limit_rejected():
    with pytest.raises(HTTPException) as err:
        g.read_upload_limited(FakeUpload(b"x" * 11), max_bytes=10, chunk_size=4)
    assert err.value.status_code == 413


def test_upload_under_limit_returned_whole():
    assert g.read_upload_limited(FakeUpload(b"abc"), max_bytes=10) == b"abc"


def test_max_upload_bytes_reads_env(monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "3")
    assert g.max_upload_bytes() == 3 * 1024 * 1024
```

- [ ] **Step 2: รันให้ fail**

รันคำสั่ง API tests (หัวข้อคำสั่งมาตรฐาน) ด้วย `tests/test_ingest_guards.py` แทน `tests`
Expected: FAIL — `ImportError: cannot import name 'ingest_guards'`

- [ ] **Step 3: เขียน `services/api/app/api/ingest_guards.py`**

```python
"""Input guards for /api/v1/pipeline/ingest/*: which URLs, SQL and upload sizes the
extraction layer accepts."""
import os
from urllib.parse import urljoin, urlparse

import requests
from fastapi import HTTPException

MAX_REDIRECTS = 3
_REDIRECT_CODES = (301, 302, 303, 307, 308)


def allowlisted_hosts(env_var: str) -> list:
    raw = os.getenv(env_var, "")
    return [h.strip().lower() for h in raw.split(",") if h.strip()]


def _is_data_go_th(host: str) -> bool:
    return host == "data.go.th" or host.endswith(".data.go.th")


def validate_api_ingest_url(url: str) -> None:
    """Fail closed: only data.go.th (built-in integration) and hosts listed in
    API_INGEST_ALLOWED_HOSTS may be fetched."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail=f"Only http/https URLs can be ingested (got '{parsed.scheme or 'none'}').")
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=400, detail="URL has no host.")
    if _is_data_go_th(host):
        return
    if host not in allowlisted_hosts("API_INGEST_ALLOWED_HOSTS"):
        raise HTTPException(
            status_code=400,
            detail=f"Host '{host}' is not in API_INGEST_ALLOWED_HOSTS. Add it to .env to allow ingestion from it.",
        )


def safe_get(url, headers=None, timeout=15, session_get=requests.get):
    """GET that re-validates every redirect hop, so an allowed host cannot bounce the
    request to an internal service such as elasticsearch:9200."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        validate_api_ingest_url(current)
        res = session_get(current, headers=headers, timeout=timeout, allow_redirects=False)
        location = res.headers.get("Location") if res.status_code in _REDIRECT_CODES else None
        if not location:
            return res
        current = urljoin(current, location)
    raise HTTPException(status_code=400, detail=f"Too many redirects (more than {MAX_REDIRECTS}).")


def validate_select_only(query: str) -> None:
    stripped = query.strip()
    if ";" in stripped.rstrip(";"):
        raise HTTPException(status_code=400, detail="Multiple statements are not allowed in the query.")
    first_token = stripped.split(None, 1)[0].upper() if stripped else ""
    if first_token != "SELECT":
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed for RDBMS ingestion.")


def validate_rdbms_host(host: str) -> None:
    allowed = allowlisted_hosts("RDBMS_ALLOWED_HOSTS")
    if not allowed:
        raise HTTPException(
            status_code=400,
            detail="RDBMS ingestion is disabled: set RDBMS_ALLOWED_HOSTS in .env to a comma-separated allowlist of database hosts.",
        )
    if host.strip().lower() not in allowed:
        raise HTTPException(status_code=400, detail=f"Host '{host}' is not in the RDBMS_ALLOWED_HOSTS allowlist.")


def run_readonly_query(connect, query: str, max_rows: int, statement_timeout_ms: int = 30000):
    """Run a SELECT inside a read-only transaction with a server-side timeout. The
    first-word check alone still lets `SELECT ... INTO new_table` create a table."""
    validate_select_only(query)
    conn = connect()
    try:
        conn.set_session(readonly=True)
        cur = conn.cursor()
        cur.execute(f"SET statement_timeout = {int(statement_timeout_ms)}")
        cur.execute(query)
        columns = [d[0] for d in cur.description]
        rows = cur.fetchmany(max_rows + 1)
        if len(rows) > max_rows:
            raise HTTPException(
                status_code=413,
                detail=f"Query returned more than {max_rows} rows. Narrow it with WHERE/LIMIT or raise RDBMS_MAX_ROWS.",
            )
        return columns, rows
    finally:
        conn.close()


def max_upload_bytes() -> int:
    return int(os.getenv("MAX_UPLOAD_MB", "200")) * 1024 * 1024


def read_upload_limited(upload, max_bytes: int, chunk_size: int = 1024 * 1024) -> bytes:
    buf = bytearray()
    while True:
        chunk = upload.file.read(chunk_size)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > max_bytes:
            raise HTTPException(status_code=413, detail=f"File is larger than the upload limit of {max_bytes} bytes (MAX_UPLOAD_MB).")
    return bytes(buf)
```

- [ ] **Step 4: รันให้ผ่าน**

Expected: `tests/test_ingest_guards.py` PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/ingest_guards.py services/api/tests/test_ingest_guards.py
git commit -m "feat(ingest): fail-closed URL allowlist with per-hop redirect checks, read-only SQL, upload size cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `run_registry` — สถานะของทุกการนำเข้าใน ES (F-D3, F-D9)

**Files:**
- Create: `services/api/app/api/run_registry.py`
- Create: `services/api/tests/fakes.py`
- Test: `services/api/tests/test_run_registry.py`

**Interfaces:**
- Produces:
  - `RUNS_INDEX = "sdoqap_runs"`, `IN_FLIGHT_OR_DONE = ["QUEUED", "RUNNING", "SUCCEEDED"]`
  - `new_ingest_id() -> str` (รูปแบบ `YYYYMMDDTHHMMSS-<8 hex>`)
  - `checksum(content: bytes) -> str` (sha256 hex)
  - `raw_ingest_dir(table: str, ingest_id: str) -> str` → `/data/raw/<table>/<ingest_id>`
  - `create_run(es, table, ingest_id, sha, source, size_bytes) -> dict` (state `QUEUED`)
  - `update_run(es, ingest_id, state, **fields) -> None`
  - `get_run(es, ingest_id) -> dict | None`
  - `find_duplicate(es, table, sha) -> dict | None`
  - เอกสารใน `sdoqap_runs` มีฟิลด์: `ingest_id, table_name, checksum, source, size_bytes, raw_path, state, created_at, updated_at` + ที่ daemon เติม `started_at, finished_at, exit_code, error`
  - `fakes.FakeES` (ใช้ใน Task 3)

- [ ] **Step 1: สร้าง `services/api/tests/fakes.py`**

```python
"""In-memory stand-in for the parts of the elasticsearch client the API uses."""


class NotFound(Exception):
    pass


class _Indices:
    def __init__(self, es):
        self._es = es

    def exists(self, index):
        return index in self._es.docs


def _matches(doc, query):
    for clause in query.get("bool", {}).get("filter", []):
        (kind, body), = clause.items()
        (field, value), = body.items()
        field = field[: -len(".keyword")] if field.endswith(".keyword") else field
        if kind == "term" and doc.get(field) != value:
            return False
        if kind == "terms" and doc.get(field) not in value:
            return False
    return True


class FakeES:
    def __init__(self):
        self.docs = {}
        self.indices = _Indices(self)

    def index(self, index, id, document, refresh=None):
        self.docs.setdefault(index, {})[id] = dict(document)

    def update(self, index, id, doc, refresh=None):
        self.docs[index][id].update(doc)

    def get(self, index, id):
        try:
            return {"_id": id, "_source": dict(self.docs[index][id])}
        except KeyError as exc:
            raise NotFound(id) from exc

    def search(self, index, query, size=10, sort=None):
        hits = [{"_id": k, "_source": dict(v)} for k, v in self.docs.get(index, {}).items() if _matches(v, query)]
        hits.sort(key=lambda h: h["_source"].get("created_at", ""), reverse=True)
        return {"hits": {"hits": hits[:size]}}
```

- [ ] **Step 2: เขียนเทสต์ที่ fail** — `services/api/tests/test_run_registry.py`

```python
import os
import re
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import run_registry as rr
from fakes import FakeES


def test_ingest_ids_are_unique_and_path_safe():
    ids = {rr.new_ingest_id() for _ in range(50)}
    assert len(ids) == 50
    assert all(re.fullmatch(r"[A-Za-z0-9_-]{1,128}", i) for i in ids)


def test_checksum_is_stable_sha256():
    assert rr.checksum(b"abc") == rr.checksum(b"abc")
    assert len(rr.checksum(b"abc")) == 64


def test_raw_dir_is_per_ingestion():
    assert rr.raw_ingest_dir("scores", "20260930T101500-ab12cd34") == "/data/raw/scores/20260930T101500-ab12cd34"


def test_created_run_is_queued_and_readable():
    es = FakeES()
    rr.create_run(es, "scores", "i1", "sha", "file", 42)
    run = rr.get_run(es, "i1")
    assert run["state"] == "QUEUED"
    assert run["raw_path"] == "/data/raw/scores/i1"
    assert run["size_bytes"] == 42


def test_get_run_without_index_returns_none():
    assert rr.get_run(FakeES(), "missing") is None


def test_duplicate_found_only_for_same_table_and_live_state():
    es = FakeES()
    rr.create_run(es, "scores", "i1", "sha", "file", 1)
    assert rr.find_duplicate(es, "scores", "sha")["ingest_id"] == "i1"
    assert rr.find_duplicate(es, "other", "sha") is None
    rr.update_run(es, "i1", "FAILED", error="boom")
    assert rr.find_duplicate(es, "scores", "sha") is None
    assert rr.get_run(es, "i1")["error"] == "boom"
```

- [ ] **Step 3: รันให้ fail** — Expected: `ImportError: cannot import name 'run_registry'`

- [ ] **Step 4: เขียน `services/api/app/api/run_registry.py`**

```python
"""Run registry: one document per ingestion (id = ingest_id) in ES index sdoqap_runs,
tracking QUEUED -> RUNNING -> SUCCEEDED / FAILED / SKIPPED, or TRIGGER_FAILED when the
Spark trigger daemon could not be reached. The API creates the document; the daemon
moves it through the states from the engine's exit code."""
import hashlib
import uuid
from datetime import datetime, timezone

RUNS_INDEX = "sdoqap_runs"
IN_FLIGHT_OR_DONE = ["QUEUED", "RUNNING", "SUCCEEDED"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_ingest_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]


def checksum(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def raw_ingest_dir(table: str, ingest_id: str) -> str:
    return f"/data/raw/{table}/{ingest_id}"


def _search_one(es, filters):
    if not es.indices.exists(index=RUNS_INDEX):
        return None
    res = es.search(index=RUNS_INDEX, query={"bool": {"filter": filters}}, size=1,
                    sort=[{"created_at": {"order": "desc"}}])
    hits = res["hits"]["hits"]
    return hits[0]["_source"] if hits else None


def get_run(es, ingest_id: str):
    return _search_one(es, [{"term": {"ingest_id.keyword": ingest_id}}])


def find_duplicate(es, table: str, sha: str):
    return _search_one(es, [
        {"term": {"table_name.keyword": table}},
        {"term": {"checksum.keyword": sha}},
        {"terms": {"state.keyword": IN_FLIGHT_OR_DONE}},
    ])


def create_run(es, table: str, ingest_id: str, sha: str, source: str, size_bytes: int) -> dict:
    now = _now()
    doc = {
        "ingest_id": ingest_id,
        "table_name": table,
        "checksum": sha,
        "source": source,
        "size_bytes": size_bytes,
        "raw_path": raw_ingest_dir(table, ingest_id),
        "state": "QUEUED",
        "created_at": now,
        "updated_at": now,
    }
    es.index(index=RUNS_INDEX, id=ingest_id, document=doc, refresh="wait_for")
    return doc


def update_run(es, ingest_id: str, state: str, **fields) -> None:
    es.update(index=RUNS_INDEX, id=ingest_id, doc={"state": state, "updated_at": _now(), **fields}, refresh="wait_for")
```

- [ ] **Step 5: รันให้ผ่าน** — Expected: `tests/test_run_registry.py` PASS

- [ ] **Step 6: Commit**

```bash
git add services/api/app/api/run_registry.py services/api/tests/fakes.py services/api/tests/test_run_registry.py
git commit -m "feat(ingest): run registry in sdoqap_runs with ingest ids and content checksums

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ให้ endpoint นำเข้าใช้ landing zone + registry, ลบ fallback ปลอม (F-D1, F-D3, F-D9, F-D10, F-P1, F-P2, F-S2, F-S3)

**Files:**
- Modify: `services/api/app/api/pipeline.py` (ทั้งไฟล์ส่วน import, `validate_*`, `upload_to_webhdfs`, `trigger_spark_job`, `retry_pipeline_run`, `ingest_csv`, `ingest_api`, `ingest_rdbms`, 3 endpoint ของ reddit; เพิ่ม `land_and_queue`, `missing_primary_key_columns`, `get_ingest_run`)
- Test: `services/api/tests/test_pipeline_ingest.py`

**Interfaces:**
- Consumes: Task 1 (`ingest_guards.*`), Task 2 (`run_registry.*`, `fakes.FakeES`)
- Produces:
  - `upload_to_webhdfs(table_name: str, content: bytes, ingest_id: str) -> str` (คืน path ไฟล์บน HDFS)
  - `trigger_spark_job(table_name: str, ingest_id: str | None) -> dict` — ส่ง `POST http://<SPARK_MASTER_HOST>:8099/retry` body `{"table", "ingest_id"}` header `X-Trigger-Secret: $TRIGGER_SHARED_SECRET`; ยอมรับ 200/202; อย่างอื่น → `HTTPException(503)`
  - `land_and_queue(table_name, content, source, es=None) -> dict` คืน `{"status": "queued"|"duplicate", "ingest_id", "run_state", "spark_triggered", "message"}`
  - `GET /api/v1/pipeline/runs/{ingest_id}` → เอกสารใน `sdoqap_runs` หรือ 404
  - `POST /api/v1/pipeline/ingest/{csv,api,rdbms}` → 202 (queued) หรือ 200 (duplicate)

- [ ] **Step 1: เขียนเทสต์ที่ fail** — `services/api/tests/test_pipeline_ingest.py`

```python
import os
import sys

import pytest
import requests
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import pipeline, run_registry
from app.api.auth import require_session, require_session_or_service_key
from fakes import FakeES

CSV = b"student_id,course,score\nS1,DW,80\n"


@pytest.fixture
def client(monkeypatch):
    es = FakeES()
    uploads, triggers = [], []
    monkeypatch.setattr(pipeline, "get_es_client", lambda: es)
    monkeypatch.setattr(pipeline, "upload_to_webhdfs",
                        lambda t, c, i: uploads.append((t, c, i)) or f"/data/raw/{t}/{i}/{t}.csv")
    monkeypatch.setattr(pipeline, "trigger_spark_job",
                        lambda t, i: triggers.append((t, i)) or {"status": "running"})
    app = FastAPI()
    app.include_router(pipeline.router)
    app.dependency_overrides[require_session_or_service_key] = lambda: "test"
    app.dependency_overrides[require_session] = lambda: "test"
    c = TestClient(app)
    c.es, c.uploads, c.triggers = es, uploads, triggers
    return c


def post_csv(client, content=CSV, table="scores"):
    return client.post("/api/v1/pipeline/ingest/csv", data={"table_name": table},
                       files={"file": ("scores.csv", content, "text/csv")})


def test_upload_lands_in_its_own_folder_and_is_queued(client):
    r = post_csv(client)
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "queued" and body["spark_triggered"] is True
    ingest_id = body["ingest_id"]
    assert client.uploads == [("scores", CSV, ingest_id)]
    assert client.triggers == [("scores", ingest_id)]
    assert run_registry.get_run(client.es, ingest_id)["state"] == "QUEUED"


def test_two_different_uploads_never_share_a_raw_folder(client):
    a = post_csv(client).json()["ingest_id"]
    b = post_csv(client, CSV + b"S2,DW,70\n").json()["ingest_id"]
    assert a != b
    assert {u[2] for u in client.uploads} == {a, b}


def test_same_file_twice_is_a_duplicate_and_not_reprocessed(client):
    first = post_csv(client).json()
    second = post_csv(client)
    assert second.status_code == 200
    assert second.json()["status"] == "duplicate"
    assert second.json()["ingest_id"] == first["ingest_id"]
    assert len(client.triggers) == 1


def test_daemon_down_marks_trigger_failed_and_returns_503(client, monkeypatch):
    def boom(table, ingest_id):
        raise HTTPException(status_code=503, detail="daemon down")

    monkeypatch.setattr(pipeline, "trigger_spark_job", boom)
    r = post_csv(client)
    assert r.status_code == 503
    (run,) = client.es.docs["sdoqap_runs"].values()
    assert run["state"] == "TRIGGER_FAILED" and run["error"] == "daemon down"


def test_file_missing_registered_primary_key_is_rejected_before_landing(client):
    client.es.index(index="sdoqap_schema_registry", id="scores", document={"primary_key": "student_id"})
    r = post_csv(client, b"course,score\nDW,80\n")
    assert r.status_code == 400
    assert "student_id" in r.json()["detail"]
    assert client.uploads == []


def test_primary_key_match_ignores_case_spaces_and_underscores(client):
    client.es.index(index="sdoqap_schema_registry", id="scores",
                    document={"primary_key": ["student_id", "course"]})
    assert post_csv(client, b"Student ID,COURSE,score\nS1,DW,80\n").status_code == 202


def test_oversized_upload_is_rejected(client, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "0")
    assert post_csv(client).status_code == 413
    assert client.uploads == []


def test_run_status_endpoint(client):
    ingest_id = post_csv(client).json()["ingest_id"]
    r = client.get(f"/api/v1/pipeline/runs/{ingest_id}")
    assert r.status_code == 200 and r.json()["state"] == "QUEUED"
    assert client.get("/api/v1/pipeline/runs/nope").status_code == 404


def test_retry_by_ingest_id_requeues_same_folder(client):
    ingest_id = post_csv(client).json()["ingest_id"]
    run_registry.update_run(client.es, ingest_id, "FAILED", error="x")
    r = client.post(f"/api/v1/pipeline/retry/{ingest_id}")
    assert r.status_code == 200
    assert client.triggers[-1] == ("scores", ingest_id)
    assert run_registry.get_run(client.es, ingest_id)["state"] == "QUEUED"


def test_trigger_has_no_local_fallback(monkeypatch):
    class Refusing:
        def post(self, *args, **kwargs):
            raise requests.ConnectionError("refused")

    popen_calls = []
    import subprocess
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: popen_calls.append(a))
    monkeypatch.setattr(pipeline, "get_http_session", lambda: Refusing())
    with pytest.raises(HTTPException) as err:
        pipeline.trigger_spark_job("scores", "i1")
    assert err.value.status_code == 503
    assert popen_calls == []


def test_trigger_sends_secret_and_ingest_id(monkeypatch):
    sent = {}

    class Ok:
        status_code = 202

        def json(self):
            return {"status": "queued"}

    class Session:
        def post(self, url, json=None, headers=None, timeout=None):
            sent.update(url=url, json=json, headers=headers)
            return Ok()

    monkeypatch.setenv("TRIGGER_SHARED_SECRET", "s3cret")
    monkeypatch.setattr(pipeline, "get_http_session", lambda: Session())
    assert pipeline.trigger_spark_job("scores", "i1") == {"status": "queued"}
    assert sent["url"].endswith(":8099/retry")
    assert sent["json"] == {"table": "scores", "ingest_id": "i1"}
    assert sent["headers"] == {"X-Trigger-Secret": "s3cret"}
```

- [ ] **Step 2: รันให้ fail** — Expected: FAIL หลายตัว (เช่น `upload_to_webhdfs` ถูกเรียกด้วย 2 argument, status 200 แทน 202, ไม่มี `/runs/`)

- [ ] **Step 3: แก้ส่วนหัวของ `pipeline.py`**

แทนที่บรรทัด import เดิม (`import os` … `from .validation import validate_table_name`) และลบฟังก์ชัน `_allowlisted_hosts`, `validate_select_only`, `validate_rdbms_host`, `validate_api_ingest_url` ทั้ง 4 ตัวออก (ย้ายไป `ingest_guards` แล้ว) ให้ส่วนหัวเป็น:

```python
import csv
import io
import os
import re
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/v1/pipeline",
    tags=["pipeline"]
)

from . import run_registry
from .auth import require_session, require_session_or_service_key
from .config import get_es_client, get_http_session
from .ingest_guards import (
    max_upload_bytes,
    read_upload_limited,
    run_readonly_query,
    safe_get,
    validate_rdbms_host,
)
from .validation import validate_table_name


def _daemon_url(path: str) -> str:
    return f"http://{os.getenv('SPARK_MASTER_HOST', 'spark-master')}:8099{path}"


def _daemon_headers() -> dict:
    return {"X-Trigger-Secret": os.getenv("TRIGGER_SHARED_SECRET", "")}
```

ตรวจว่าไฟล์ไม่ได้ใช้ `Elasticsearch`, `get_elasticsearch_url` หรือ `datetime` ที่อื่นแบบที่ต้องการ import เดิม:

```bash
grep -n "Elasticsearch(\|get_elasticsearch_url\|datetime\." services/api/app/api/pipeline.py
```

ถ้าพบ `datetime.now()` แบบไม่มี timezone ที่อื่น ให้คงไว้ได้ (import `datetime` ยังอยู่)

- [ ] **Step 4: แทนที่ `upload_to_webhdfs` และ `trigger_spark_job` ทั้งสองฟังก์ชัน**

```python
def upload_to_webhdfs(table_name: str, content: bytes, ingest_id: str) -> str:
    """Write one ingestion to its own folder /data/raw/<table>/<ingest_id>/ so a second
    upload can never overwrite, or be deleted together with, the first."""
    hdfs_path = f"{run_registry.raw_ingest_dir(table_name, ingest_id)}/{table_name}.csv"
    max_retries = 5
    retry_delay = 3
    for attempt in range(max_retries):
        try:
            webhdfs_url = f"http://namenode:9870/webhdfs/v1{hdfs_path}?op=CREATE&overwrite=true&user.name=spark"
            r1 = get_http_session().put(webhdfs_url, allow_redirects=False, timeout=5)
            if r1.status_code != 307:
                if "SafeModeException" in r1.text or r1.status_code == 403:
                    print(f"[WebHDFS] NameNode is in Safe Mode. Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
                    time.sleep(retry_delay)
                    continue
                raise HTTPException(status_code=500, detail=f"WebHDFS create handshake failed: HTTP {r1.status_code}")
            redirect_url = r1.headers["Location"].replace("localhost:", "datanode:").replace("127.0.0.1:", "datanode:")
            r2 = get_http_session().put(redirect_url, data=content, timeout=180)
            if r2.status_code not in (200, 201):
                if "SafeModeException" in r2.text:
                    time.sleep(retry_delay)
                    continue
                raise HTTPException(status_code=500, detail=f"WebHDFS write failed: HTTP {r2.status_code} - {r2.text}")
            return hdfs_path
        except HTTPException:
            if attempt == max_retries - 1:
                raise
            time.sleep(retry_delay)
        except Exception as e:
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail=f"WebHDFS upload exception: {str(e)}")
            print(f"[WebHDFS] Transient error: {e}. Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
            time.sleep(retry_delay)
    raise HTTPException(status_code=500, detail="WebHDFS upload failed after retries.")


def trigger_spark_job(table_name: str, ingest_id: Optional[str]) -> dict:
    """Ask the Spark trigger daemon to run the quality engine. There is deliberately no
    local fallback: the api image has no pyspark, so a fallback only pretended to run."""
    payload = {"table": table_name}
    if ingest_id:
        payload["ingest_id"] = ingest_id
    try:
        res = get_http_session().post(_daemon_url("/retry"), json=payload, headers=_daemon_headers(), timeout=5)
    except requests.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Spark trigger daemon is unreachable: {e}")
    if res.status_code not in (200, 202):
        raise HTTPException(status_code=503, detail=f"Spark trigger daemon refused the job (HTTP {res.status_code}).")
    return res.json()


def _normalize_col(name: str) -> str:
    # Mirrors normalize_name() in services/spark/spark_quality_engine.py.
    return re.sub(r"[\s\-_]", "", name or "").lower()


def missing_primary_key_columns(content: bytes, primary_key) -> list:
    """Fail fast in the API instead of after a 1-2 minute spark-submit: the engine
    cannot MERGE rows whose primary key column is absent."""
    if not primary_key or primary_key == "row_hash":
        return []
    first_line = content.split(b"\n", 1)[0].decode("utf-8-sig", errors="replace").strip("\r")
    header = next(csv.reader([first_line]), [])
    present = {_normalize_col(c) for c in header}
    keys = [primary_key] if isinstance(primary_key, str) else list(primary_key)
    return [k for k in keys if _normalize_col(k) not in present]


def _registered_primary_key(es, table_name: str):
    try:
        if not es.indices.exists(index="sdoqap_schema_registry"):
            return None
        return es.get(index="sdoqap_schema_registry", id=table_name)["_source"].get("primary_key")
    except Exception:
        return None


def land_and_queue(table_name: str, content: bytes, source: str, es=None) -> dict:
    """Extraction -> raw landing -> run registry -> trigger (activity diagram 4.3)."""
    es = es if es is not None else get_es_client()
    sha = run_registry.checksum(content)
    existing = run_registry.find_duplicate(es, table_name, sha)
    if existing:
        return {
            "status": "duplicate",
            "ingest_id": existing["ingest_id"],
            "run_state": existing["state"],
            "spark_triggered": False,
            "message": f"This exact file was already ingested for '{table_name}' (ingest {existing['ingest_id']}, "
                       f"{existing['state']}). POST /api/v1/pipeline/retry/{existing['ingest_id']} reprocesses it.",
        }
    missing = missing_primary_key_columns(content, _registered_primary_key(es, table_name))
    if missing:
        raise HTTPException(status_code=400, detail=f"File is missing primary key column(s) {missing} registered for '{table_name}'.")
    ingest_id = run_registry.new_ingest_id()
    upload_to_webhdfs(table_name, content, ingest_id)
    run_registry.create_run(es, table_name, ingest_id, sha, source, len(content))
    try:
        daemon = trigger_spark_job(table_name, ingest_id)
    except HTTPException as exc:
        run_registry.update_run(es, ingest_id, "TRIGGER_FAILED", error=str(exc.detail))
        raise
    return {
        "status": "queued",
        "ingest_id": ingest_id,
        "run_state": "QUEUED",
        "spark_triggered": True,
        "daemon_status": daemon.get("status"),
        "message": f"Data landed in HDFS for '{table_name}' and queued for the quality check (ingest {ingest_id}).",
    }


@router.get("/runs/{ingest_id}")
def get_ingest_run(ingest_id: str):
    validate_table_name(ingest_id, "ingest_id")
    run = run_registry.get_run(get_es_client(), ingest_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Ingest '{ingest_id}' not found.")
    return run
```

หมายเหตุ: วาง `get_ingest_run` **ก่อน** `@router.get("/{run_id}")` ในไฟล์ก็ได้หรือหลังก็ได้ เพราะ `/runs/x` มีสอง segment จึงไม่ชนกับ `/{run_id}`

- [ ] **Step 5: แทนที่ `retry_pipeline_run` ทั้งฟังก์ชัน**

```python
@router.post("/retry/{run_id}")
def retry_pipeline_run(run_id: str, _user: str = Depends(require_session)):
    """Reprocess an ingestion by its ingest_id (same raw folder, or its archived copy),
    or fall back to re-running a whole table from an older pipeline run id."""
    es = get_es_client()
    ingest = run_registry.get_run(es, run_id)
    if ingest:
        run_registry.update_run(es, run_id, "QUEUED", retried_at=datetime.now(timezone.utc).isoformat())
        try:
            trigger_spark_job(ingest["table_name"], run_id)
        except HTTPException as exc:
            run_registry.update_run(es, run_id, "TRIGGER_FAILED", error=str(exc.detail))
            raise
        return {"status": "queued", "ingest_id": run_id,
                "message": f"Ingest '{run_id}' re-queued for table '{ingest['table_name']}'."}

    if not es.indices.exists(index="sdoqap_pipeline_runs"):
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    res = es.search(index="sdoqap_pipeline_runs", query={"term": {"run_id.keyword": run_id}})
    hits = res["hits"]["hits"]
    if not hits:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    table_name = hits[0]["_source"].get("table_name")
    if not table_name:
        raise HTTPException(status_code=400, detail="Cannot retry: run document has no 'table_name'.")
    trigger_spark_job(table_name, None)
    return {"status": "queued", "message": f"Pipeline rerun queued for table '{table_name}'."}
```

- [ ] **Step 6: แทนที่ `ingest_csv`**

```python
@router.post("/ingest/csv", status_code=202)
def ingest_csv(response: Response, table_name: str = Form(...), file: UploadFile = File(...),
               _user: str = Depends(require_session_or_service_key)):
    """Ingest an uploaded CSV or Excel file into its own raw folder and queue the quality check."""
    validate_table_name(table_name)
    filename = (file.filename or "").lower()
    content = read_upload_limited(file, max_upload_bytes())
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if filename.endswith((".xlsx", ".xls")):
        try:
            import pandas as pd
            content = pd.read_excel(io.BytesIO(content)).to_csv(index=False).encode("utf-8")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to convert Excel to CSV: {str(e)}")
    result = land_and_queue(table_name, content, source="file")
    if result["status"] == "duplicate":
        response.status_code = 200
    return result
```

- [ ] **Step 7: แก้ `ingest_api`**

1. เปลี่ยนหัวฟังก์ชันเป็น:

```python
@router.post("/ingest/api", status_code=202)
def ingest_api(payload: ApiIngestPayload, response: Response, _user: str = Depends(require_session_or_service_key)):
```

2. แทนที่สองบรรทัด:

```python
    validate_api_ingest_url(resolved_url)
    try:
        api_res = requests.get(resolved_url, headers=req_headers, timeout=15)
```

ด้วย:

```python
    try:
        api_res = safe_get(resolved_url, headers=req_headers, timeout=15)
```

3. ลบบรรทัด `import io, csv` ทั้งสองจุดในฟังก์ชัน (import อยู่ที่หัวไฟล์แล้ว) และ `import re` ในฟังก์ชัน
4. แทนที่ท้ายฟังก์ชัน:

```python
    csv_bytes = output.getvalue().encode('utf-8')
    await upload_to_webhdfs(table_name, csv_bytes)
    triggered = trigger_spark_job(table_name)
    
    return {
        "status": "success",
        "message": f"API data ingested successfully and quality check triggered for '{table_name}'.",
        "spark_triggered": triggered
    }
```

ด้วย:

```python
    result = land_and_queue(table_name, output.getvalue().encode("utf-8"), source="api")
    if result["status"] == "duplicate":
        response.status_code = 200
    return result
```

- [ ] **Step 8: แก้ `ingest_rdbms`**

1. หัวฟังก์ชัน:

```python
@router.post("/ingest/rdbms", status_code=202)
def ingest_rdbms(payload: RdbmsIngestPayload, response: Response, _user: str = Depends(require_session_or_service_key)):
```

2. แทนที่ตั้งแต่ `validate_select_only(payload.query)` จนถึงท้ายฟังก์ชันด้วย:

```python
    validate_rdbms_host(payload.host)
    import psycopg2

    def connect():
        return psycopg2.connect(host=payload.host, port=payload.port, user=payload.username,
                                password=payload.password, database=payload.database, connect_timeout=3)

    try:
        colnames, rows = run_readonly_query(connect, payload.query, max_rows=int(os.getenv("RDBMS_MAX_ROWS", "1000000")))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PostgreSQL fetch failed: {str(e)}")
    if not rows:
        raise HTTPException(status_code=400, detail="Query executed successfully but returned no rows to ingest.")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(colnames)
    writer.writerows(rows)
    result = land_and_queue(table_name, output.getvalue().encode("utf-8"), source="rdbms")
    result["rows_ingested"] = len(rows)
    if result["status"] == "duplicate":
        response.status_code = 200
    return result
```

(`run_readonly_query` เรียก `validate_select_only` ให้เองแล้ว)

- [ ] **Step 9: ส่ง secret ให้ endpoint stream ของ daemon ทั้ง 3 จุด**

```bash
f=services/api/app/api/pipeline.py
sed -i 's#requests.post(f"http://{spark_host}:8099/stream/stop", timeout=5)#requests.post(f"http://{spark_host}:8099/stream/stop", headers=_daemon_headers(), timeout=5)#; s#requests.get(f"http://{spark_host}:8099/stream/status", timeout=5)#requests.get(f"http://{spark_host}:8099/stream/status", headers=_daemon_headers(), timeout=5)#' $f
grep -n "8099" $f
```

แล้วใน `ingest_reddit` แก้การเรียก `/stream/start` ให้มี `headers=_daemon_headers(),` ต่อจากบรรทัด `json=...`
Expected: ทุกบรรทัดที่ชี้ `:8099/stream` มี `_daemon_headers()`

- [ ] **Step 10: ตรวจว่าไม่เหลือ `async def`, `await`, Popen ใน pipeline**

```bash
grep -n "async def\|await \|Popen\|validate_api_ingest_url" services/api/app/api/pipeline.py
```

Expected: ไม่พบ

- [ ] **Step 11: รันเทสต์ API ทั้งหมด** — Expected: PASS ทั้งหมด (รวมของเดิม)

- [ ] **Step 12: เพิ่ม `httpx` ให้ CI** — ใน `.github/workflows/ci.yml` job `api-tests` แก้บรรทัด pip เป็น:

```yaml
          pip install -r requirements.txt pandas pyarrow openpyxl xlrd psycopg2-binary pytest httpx
```

- [ ] **Step 13: Commit**

```bash
git add services/api/app/api/pipeline.py services/api/tests/test_pipeline_ingest.py .github/workflows/ci.yml
git commit -m "feat(ingest): per-ingestion raw folders, run registry, duplicate and primary-key checks; drop fake local Spark fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Trigger daemon — auth, คิวต่อตาราง, สถานะตาม exit code (F-S1, F-D6, F-P5, F-P6 บางส่วน)

**Files:**
- Create: `services/spark/trigger_core.py`
- Create: `services/spark/tests/unit/conftest.py`, `services/spark/tests/unit/test_trigger_core.py`
- Modify: `services/spark/spark_trigger_daemon.py`
- Modify: `services/spark/Dockerfile` (บรรทัด `COPY spark_quality_engine.py ...`)
- Modify: `docker-compose.yml` (ลบ `- "8099:8099" # Spark Trigger Daemon`), `.env.example`, `.env` (ของผู้ใช้ — เพิ่ม key)

**Interfaces:**
- Produces (`trigger_core`):
  - `EXIT_OK = 0`, `EXIT_SKIPPED = 75`, `RUNS_INDEX = "sdoqap_runs"`
  - `is_authorized(headers, secret: str) -> bool` (header `X-Trigger-Secret`)
  - `valid_name(name) -> bool`
  - `build_submit_cmd(table: str, ingest_id: str | None = None) -> list[str]` (ไม่มี `--packages`; ต่อท้าย `--ingest-id <id>` เมื่อมี)
  - `state_for_exit(code: int) -> str`
  - `class TableJobQueue` — `submit(table, ingest_id) -> bool`, `next_or_release(table) -> (bool, ingest_id|None)`, `pending(table) -> int`
  - `update_run_state(ingest_id, state, post=requests.post, **fields) -> bool`
  - `find_quality_run(ingest_id, post=requests.post) -> dict | None`
- Consumes: รูปแบบเอกสาร `sdoqap_runs` จาก Plan B Task 2; `sdoqap_quality_runs.ingest_id` ที่ engine จะเขียนใน Task 5

- [ ] **Step 1: สร้าง conftest**

`services/spark/tests/unit/conftest.py`:

```python
import os
import sys

SPARK_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if SPARK_ROOT not in sys.path:
    sys.path.insert(0, SPARK_ROOT)
```

- [ ] **Step 2: เขียนเทสต์ที่ fail** — `services/spark/tests/unit/test_trigger_core.py`

```python
import trigger_core as tc


def test_auth_requires_configured_secret():
    assert tc.is_authorized({}, "") is False
    assert tc.is_authorized({"X-Trigger-Secret": ""}, "") is False
    assert tc.is_authorized({"X-Trigger-Secret": "abc"}, "abc") is True
    assert tc.is_authorized({"X-Trigger-Secret": "abd"}, "abc") is False


def test_names_are_validated():
    assert tc.valid_name("student_scores")
    assert tc.valid_name("20260930T101500-ab12cd34")
    assert not tc.valid_name("../etc")
    assert not tc.valid_name("")
    assert not tc.valid_name(None)


def test_submit_cmd_uses_baked_jars_and_passes_ingest_id():
    cmd = tc.build_submit_cmd("scores", "i1")
    assert "--packages" not in cmd
    assert cmd[-4:] == [tc.ENGINE_SCRIPT, "scores", "--ingest-id", "i1"]
    assert tc.build_submit_cmd("scores")[-2:] == [tc.ENGINE_SCRIPT, "scores"]


def test_exit_codes_map_to_states():
    assert tc.state_for_exit(0) == "SUCCEEDED"
    assert tc.state_for_exit(75) == "SKIPPED"
    assert tc.state_for_exit(1) == "FAILED"


def test_queue_runs_one_job_per_table_in_fifo_order():
    q = tc.TableJobQueue()
    assert q.submit("a", "i1") is True
    assert q.submit("a", "i2") is False
    assert q.submit("a", "i3") is False
    assert q.submit("b", "j1") is True
    assert q.pending("a") == 2
    assert q.next_or_release("a") == (True, "i2")
    assert q.next_or_release("a") == (True, "i3")
    assert q.next_or_release("a") == (False, None)
    assert q.submit("a", "i4") is True


class Resp:
    def __init__(self, status_code, body=None):
        self.status_code = status_code
        self._body = body or {}

    def json(self):
        return self._body


def test_update_run_state_posts_partial_doc(monkeypatch):
    monkeypatch.setenv("ELASTICSEARCH_HOST", "es")
    monkeypatch.setenv("ELASTICSEARCH_PORT", "9200")
    monkeypatch.setenv("ELASTICSEARCH_USER", "elastic")
    monkeypatch.setenv("ELASTICSEARCH_PASSWORD", "pw")
    sent = {}

    def post(url, json=None, auth=None, timeout=None):
        sent.update(url=url, json=json, auth=auth)
        return Resp(200)

    assert tc.update_run_state("i1", "RUNNING", post=post, started_at="t") is True
    assert sent["url"] == "http://es:9200/sdoqap_runs/_update/i1"
    assert sent["json"]["doc"]["state"] == "RUNNING"
    assert sent["json"]["doc"]["started_at"] == "t"
    assert sent["auth"] == ("elastic", "pw")
    assert tc.update_run_state(None, "RUNNING", post=post) is False


def test_find_quality_run_filters_by_ingest_id():
    seen = {}

    def post(url, json=None, auth=None, timeout=None):
        seen["query"] = json["query"]
        return Resp(200, {"hits": {"hits": [{"_source": {"run_id": "r1", "quarantined_records": 3}}]}})

    assert tc.find_quality_run("i1", post=post)["run_id"] == "r1"
    assert seen["query"] == {"term": {"ingest_id.keyword": "i1"}}
```

- [ ] **Step 3: รันให้ fail** — คำสั่ง Spark unit tests; Expected: `ModuleNotFoundError: No module named 'trigger_core'`

- [ ] **Step 4: เขียน `services/spark/trigger_core.py`**

```python
"""Pure helpers for spark_trigger_daemon.py (no pyspark): auth, name validation, the
per-table job queue, the spark-submit command and run-registry updates."""
import hmac
import os
import re
import threading
from collections import deque
from datetime import datetime, timezone

import requests

SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
EXIT_OK = 0
EXIT_SKIPPED = 75  # must match run_support.EXIT_SKIPPED
RUNS_INDEX = "sdoqap_runs"
SPARK_SUBMIT = "/opt/bitnami/spark/bin/spark-submit"
ENGINE_SCRIPT = "/opt/spark-apps/spark_quality_engine.py"


def is_authorized(headers, secret: str) -> bool:
    provided = headers.get("X-Trigger-Secret") or ""
    return bool(secret) and hmac.compare_digest(provided, secret)


def valid_name(name) -> bool:
    return isinstance(name, str) and bool(SAFE_NAME_RE.match(name))


def build_submit_cmd(table: str, ingest_id: str = None) -> list:
    # Delta jars are baked into the image (services/spark/Dockerfile), so no --packages.
    cmd = [
        SPARK_SUBMIT,
        "--master", "spark://spark-master:7077",
        "--conf", "spark.executorEnv.HADOOP_USER_NAME=spark",
        "--conf", "spark.executor.extraJavaOptions=-DHADOOP_USER_NAME=spark",
        "--conf", "spark.driver.extraJavaOptions=-DHADOOP_USER_NAME=spark",
        ENGINE_SCRIPT,
        table,
    ]
    if ingest_id:
        cmd += ["--ingest-id", ingest_id]
    return cmd


def state_for_exit(code: int) -> str:
    if code == EXIT_OK:
        return "SUCCEEDED"
    if code == EXIT_SKIPPED:
        return "SKIPPED"
    return "FAILED"


class TableJobQueue:
    """At most one engine run per table; later requests for the same table wait in
    FIFO order instead of being rejected with 409."""

    def __init__(self):
        self._lock = threading.Lock()
        self._running = set()
        self._pending = {}

    def submit(self, table: str, ingest_id) -> bool:
        """True: caller must start the job now. False: it was queued behind a running one."""
        with self._lock:
            if table in self._running:
                self._pending.setdefault(table, deque()).append(ingest_id)
                return False
            self._running.add(table)
            return True

    def next_or_release(self, table: str):
        with self._lock:
            q = self._pending.get(table)
            if q:
                return True, q.popleft()
            self._pending.pop(table, None)
            self._running.discard(table)
            return False, None

    def pending(self, table: str) -> int:
        with self._lock:
            return len(self._pending.get(table, ()))


def _es_base_and_auth():
    host = os.getenv("ELASTICSEARCH_HOST", "elasticsearch")
    port = os.getenv("ELASTICSEARCH_PORT", "9200")
    user = os.getenv("ELASTICSEARCH_USER", "elastic")
    password = os.getenv("ELASTICSEARCH_PASSWORD", "")
    return f"http://{host}:{port}", ((user, password) if password else None)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def update_run_state(ingest_id, state: str, post=requests.post, **fields) -> bool:
    if not ingest_id:
        return False
    base, auth = _es_base_and_auth()
    doc = {"state": state, "updated_at": _now(), **fields}
    try:
        res = post(f"{base}/{RUNS_INDEX}/_update/{ingest_id}", json={"doc": doc}, auth=auth, timeout=5)
        return res.status_code in (200, 201)
    except requests.RequestException:
        return False


def find_quality_run(ingest_id, post=requests.post):
    base, auth = _es_base_and_auth()
    query = {"size": 1, "sort": [{"timestamp": {"order": "desc"}}],
             "query": {"term": {"ingest_id.keyword": ingest_id}}}
    try:
        res = post(f"{base}/sdoqap_quality_runs/_search", json=query, auth=auth, timeout=5)
    except requests.RequestException:
        return None
    if res.status_code != 200:
        return None
    hits = res.json().get("hits", {}).get("hits", [])
    return hits[0]["_source"] if hits else None
```

- [ ] **Step 5: รันให้ผ่าน** — Expected: `tests/unit/test_trigger_core.py` PASS

- [ ] **Step 6: ต่อ daemon เข้ากับ `trigger_core`**

ใน `services/spark/spark_trigger_daemon.py`:

(a) แทนที่บล็อก globals:

```python
# Concurrency Lock: tracks tables currently running a Spark Quality Engine rerun job
# to prevent concurrent write transaction conflicts on Delta Lake
running_rerun_jobs = set()
running_jobs_lock = threading.Lock()
```

ด้วย:

```python
from trigger_core import (EXIT_OK, TableJobQueue, build_submit_cmd, find_quality_run,
                          is_authorized, state_for_exit, update_run_state, valid_name)

# One engine run per table at a time; later requests queue instead of failing with 409.
JOB_QUEUE = TableJobQueue()


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
```

(b) ลบ method `_try_auto_remediate` ทั้ง method ออกจาก `class SparkTriggerHandler` แล้วเพิ่มฟังก์ชันระดับโมดูลเหล่านี้ไว้ **เหนือ** `class SparkTriggerHandler`:

```python
def try_auto_remediate(table_name, ingest_id):
    """Ask the remediation engine for rules when this run quarantined rows.
    Returns True when new rules were saved and the same ingestion should be re-validated."""
    import requests as _req
    from trigger_core import _es_base_and_auth

    if ingest_id:
        latest = find_quality_run(ingest_id)
    else:
        base, auth = _es_base_and_auth()
        query = {"size": 1, "sort": [{"timestamp": {"order": "desc"}}],
                 "query": {"term": {"table_name.keyword": table_name}}}
        try:
            r = _req.post(f"{base}/sdoqap_quality_runs/_search", json=query, auth=auth, timeout=5)
            hits = r.json().get("hits", {}).get("hits", []) if r.status_code == 200 else []
            latest = hits[0]["_source"] if hits else None
        except Exception as e:
            append_log(f"[REMEDIATION] Skipping: ES check failed: {e}")
            return False
    if not latest:
        append_log(f"[REMEDIATION] Skipping: no quality run found for '{table_name}' ({ingest_id or 'legacy'})")
        return False
    quarantine_count = latest.get("quarantined_records", 0)
    if quarantine_count == 0:
        append_log(f"[REMEDIATION] No quarantined records for '{table_name}'. Skipping.")
        return False

    append_log(f"[SYSTEM] Auto-Remediation: {quarantine_count} quarantined records detected. Starting AI remediation...")
    cmd = ["python", "-u", "/opt/spark-apps/auto_remediation_engine.py", table_name, latest.get("run_id", "")]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in iter(proc.stdout.readline, ""):
            if line:
                append_log(f"[remediation] {line.strip()}")
        proc.wait()
    except Exception as e:
        append_log(f"[ERROR] Auto-Remediation engine failed: {e}")
        return False
    if proc.returncode == 0:
        append_log(f"[SYSTEM] Remediation rules saved. Re-validating '{table_name}'...")
        return True
    append_log(f"[SYSTEM] Auto-Remediation: no records could be fixed for '{table_name}'. Quarantine data retained.")
    return False


def run_quality_job(table, ingest_id):
    """Run one engine job, stream its log, and record the outcome in sdoqap_runs."""
    global stream_status, stream_start_time, stream_duration
    update_run_state(ingest_id, "RUNNING", started_at=_now())
    with stream_lock:
        stream_logs.clear()
        append_log(f"[SYSTEM] Starting Spark Quality Engine for '{table}' (ingest {ingest_id or 'legacy'})")
        stream_status = "running"
        stream_start_time = time.time()
        stream_duration = 300
    proc = subprocess.Popen(build_submit_cmd(table, ingest_id), stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    for line in iter(proc.stdout.readline, ""):
        if line:
            append_log(f"[spark] {line.strip()}")
    proc.wait()
    state = state_for_exit(proc.returncode)
    update_run_state(ingest_id, state, finished_at=_now(), exit_code=proc.returncode)
    append_log(f"[SYSTEM] Spark Quality Engine finished for '{table}' (exit {proc.returncode}, {state})")
    return proc.returncode


def run_job_chain(table, ingest_id):
    """Run this job, then any jobs queued for the same table, one after another."""
    global stream_status
    try:
        while True:
            try:
                code = run_quality_job(table, ingest_id)
                if code == EXIT_OK and table not in remediation_in_progress and try_auto_remediate(table, ingest_id):
                    remediation_in_progress.add(table)
                    try:
                        run_quality_job(table, ingest_id)
                    finally:
                        remediation_in_progress.discard(table)
            except Exception as e:
                append_log(f"[ERROR] Spark Quality Engine run failed for '{table}': {e}")
                update_run_state(ingest_id, "FAILED", finished_at=_now(), error=str(e))
            has_next, ingest_id = JOB_QUEUE.next_or_release(table)
            if not has_next:
                break
    finally:
        with stream_lock:
            stream_status = "idle"
```

(c) ใน `class SparkTriggerHandler` เพิ่ม helper ไว้บนสุดของคลาส:

```python
    def _json(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def _authorized(self):
        if is_authorized(self.headers, os.getenv("TRIGGER_SHARED_SECRET", "")):
            return True
        self._json(401, {"status": "error", "message": "Missing or invalid X-Trigger-Secret header"})
        return False
```

(d) ใน `do_GET` บรรทัดแรกของบล็อก `if self.path == "/stream/status":` ใส่:

```python
            if not self._authorized():
                return
```

(e) ใน `do_POST` แทนที่ทั้งบล็อก `if self.path == "/retry":` (ตั้งแต่บรรทัดนั้นจนถึงก่อน `elif self.path == "/gold/rebuild":`) ด้วย:

```python
        if self.path == "/retry":
            if not self._authorized():
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except ValueError:
                return self._json(400, {"status": "error", "message": "Body must be JSON"})
            table_name = data.get("table")
            ingest_id = data.get("ingest_id")
            if not valid_name(table_name) or (ingest_id is not None and not valid_name(ingest_id)):
                return self._json(400, {"status": "error", "message": "Invalid 'table' or 'ingest_id'"})
            if JOB_QUEUE.submit(table_name, ingest_id):
                threading.Thread(target=run_job_chain, args=(table_name, ingest_id), daemon=True).start()
                return self._json(202, {"status": "running", "table": table_name, "ingest_id": ingest_id})
            return self._json(202, {"status": "queued", "table": table_name, "ingest_id": ingest_id,
                                    "position": JOB_QUEUE.pending(table_name)})
```

(f) บรรทัดแรกของบล็อก `elif self.path == "/stream/start":` และ `elif self.path == "/stream/stop":` ใส่:

```python
            if not self._authorized():
                return
```

**ไม่**ใส่ auth ให้ `/gold/rebuild` (ดู Global Constraints)

(g) ใน `run_stream_job` ลบบรรทัด `"--packages", "io.delta:delta-core_2.12:2.4.0",` ถ้าคำสั่งนั้นไม่ได้ต้องใช้ Kafka package อื่น — ตรวจก่อน:

```bash
grep -n "\-\-packages" services/spark/spark_trigger_daemon.py
```

ถ้าบรรทัดนั้นมีแค่ delta ให้ลบ ถ้ามี kafka ร่วมด้วยให้คงไว้

(h) ตรวจว่าไม่เหลือของเก่า:

```bash
grep -n "running_rerun_jobs\|running_jobs_lock\|_try_auto_remediate\|409" services/spark/spark_trigger_daemon.py
python -m py_compile services/spark/spark_trigger_daemon.py services/spark/trigger_core.py && echo COMPILE_OK
```

Expected: grep ไม่พบ, `COMPILE_OK`

- [ ] **Step 7: ให้ image มีไฟล์ใหม่** — ใน `services/spark/Dockerfile` บรรทัด `COPY spark_quality_engine.py ... /opt/spark-apps/` เพิ่ม `trigger_core.py run_support.py` ก่อน `/opt/spark-apps/` (`run_support.py` จะถูกสร้างใน Task 5 — ถ้ายังไม่มีตอน build ให้ทำ Step นี้หลัง Task 5 Step 4)

- [ ] **Step 8: ปิดพอร์ต daemon จาก host และตั้ง secret**

ใน `docker-compose.yml` ลบบรรทัด:

```yaml
      - "8099:8099" # Spark Trigger Daemon
```

เพิ่มท้าย `.env.example`:

```bash
cat >> .env.example <<'EOF'

# Shared secret the api sends to the Spark trigger daemon (X-Trigger-Secret). Required.
TRIGGER_SHARED_SECRET=
# Upload / RDBMS extraction limits
MAX_UPLOAD_MB=200
RDBMS_MAX_ROWS=1000000
# Run Delta OPTIMIZE/VACUUM once every N table versions (0 = never)
DELTA_OPTIMIZE_EVERY=10
EOF
```

เพิ่ม secret ลง `.env` ของเครื่อง (ไฟล์ถูก ignore):

```bash
grep -q "^TRIGGER_SHARED_SECRET=" .env || echo "TRIGGER_SHARED_SECRET=$(python -c 'import secrets;print(secrets.token_hex(24))')" >> .env
grep -c "^TRIGGER_SHARED_SECRET=" .env
```

Expected: `1` (ไม่พิมพ์ค่า secret ออกมา)

หมายเหตุ: ทั้ง `api` และ `spark-master` อ่าน `.env` ผ่าน `env_file` อยู่แล้ว ไม่ต้องแก้ environment ของ service

- [ ] **Step 9: รีสตาร์ทและตรวจ auth**

```bash
docker compose up -d --force-recreate spark-master api
sleep 120
MSYS_NO_PATHCONV=1 docker compose exec -T api python -c "import requests;print(requests.post('http://spark-master:8099/retry',json={'table':'x'},timeout=5).status_code)"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 http://localhost:8099/retry || echo "port closed"
```

Expected: บรรทัดแรก `401`; บรรทัดที่สอง `000` หรือ `port closed` (host เข้าไม่ถึงแล้ว)

- [ ] **Step 10: รัน Spark unit tests + API tests** — Expected: PASS ทั้งคู่

- [ ] **Step 11: Commit**

```bash
git add services/spark/trigger_core.py services/spark/spark_trigger_daemon.py services/spark/tests/unit docker-compose.yml .env.example services/spark/Dockerfile
git commit -m "feat(daemon): shared-secret auth, per-table FIFO job queue, run states from engine exit codes; close port 8099 to the host

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Spark engine — อ่านตาม ingest, quarantine ก่อน MERGE, archive, heartbeat (F-D1, F-D2, F-D4, F-D5, F-D6, F-P3)

**Files:**
- Create: `services/spark/run_support.py`
- Test: `services/spark/tests/unit/test_run_support.py`
- Modify: `services/spark/spark_quality_engine.py` (ส่วน import, หลัง `release_lock`, `run_quality_check`, บล็อก `if __name__ == "__main__":`)

**Interfaces:**
- Produces (`run_support`):
  - `EXIT_OK = 0`, `EXIT_SKIPPED = 75`
  - `raw_read_path(hdfs_url, table, ingest_id=None, exists=None) -> (str, bool)` — `(path, recursive)`
  - `archive_paths(table, ingest_id) -> (src, dst)`
  - `should_optimize(delta_version: int, every: int) -> bool`
  - `class Heartbeat(interval_seconds: float, beat: Callable)` — `.start() -> Heartbeat`, `.stop()`
- Produces (engine):
  - CLI: `spark_quality_engine.py <table> [--force] [--ingest-id ID]`
  - `run_quality_check(..., input_table_name=None, ingest_id=None)` คืน `"SKIPPED"` เมื่อได้ lock ไม่สำเร็จ
  - เอกสาร `sdoqap_quality_runs` มีฟิลด์ใหม่ `ingest_id, started_at, finished_at, duration_seconds`; `sdoqap_lineage_runs`, `sdoqap_pipeline_runs` มี `ingest_id`
  - ตาราง `/data/quarantine/<t>` มีคอลัมน์ใหม่ `ingest_id`
  - HDFS: `/data/archive/<table>/<ingest_id>/` หลังรันสำเร็จ

- [ ] **Step 1: เขียนเทสต์ที่ fail** — `services/spark/tests/unit/test_run_support.py`

```python
import threading
import time

import run_support as rs
import trigger_core


def test_exit_code_constants_agree_with_daemon():
    assert rs.EXIT_SKIPPED == trigger_core.EXIT_SKIPPED == 75
    assert rs.EXIT_OK == trigger_core.EXIT_OK == 0


def test_ingest_run_reads_only_its_own_folder():
    path, recursive = rs.raw_read_path("hdfs://nn:9000", "scores", "i1", exists=lambda p: True)
    assert path == "hdfs://nn:9000/data/raw/scores/i1"
    assert recursive is False


def test_reprocessing_reads_the_archived_copy():
    existing = {"/data/archive/scores/i1"}
    path, _ = rs.raw_read_path("hdfs://nn:9000", "scores", "i1", exists=lambda p: p in existing)
    assert path == "hdfs://nn:9000/data/archive/scores/i1"


def test_legacy_run_reads_whole_table_recursively():
    assert rs.raw_read_path("hdfs://nn:9000", "scores") == ("hdfs://nn:9000/data/raw/scores", True)


def test_archive_paths():
    assert rs.archive_paths("scores", "i1") == ("/data/raw/scores/i1", "/data/archive/scores/i1")


def test_optimize_cadence():
    assert rs.should_optimize(10, 10) is True
    assert rs.should_optimize(11, 10) is False
    assert rs.should_optimize(0, 10) is False
    assert rs.should_optimize(10, 0) is False


def test_heartbeat_beats_until_stopped():
    beats = []
    hb = rs.Heartbeat(0.01, lambda: beats.append(1)).start()
    time.sleep(0.1)
    hb.stop()
    count = len(beats)
    time.sleep(0.05)
    assert count >= 3
    assert len(beats) == count


def test_heartbeat_survives_a_failing_beat():
    calls = []

    def beat():
        calls.append(1)
        raise RuntimeError("es down")

    hb = rs.Heartbeat(0.01, beat).start()
    time.sleep(0.05)
    hb.stop()
    assert len(calls) >= 2
```

- [ ] **Step 2: รันให้ fail** — Expected: `ModuleNotFoundError: No module named 'run_support'`

- [ ] **Step 3: เขียน `services/spark/run_support.py`**

```python
"""Run-level helpers for spark_quality_engine.py that need no SparkSession: exit codes,
raw/archive path resolution, the lock heartbeat and the Delta maintenance cadence."""
import threading

EXIT_OK = 0
EXIT_SKIPPED = 75  # must match trigger_core.EXIT_SKIPPED


def raw_read_path(hdfs_url, table, ingest_id=None, exists=None):
    """Where this run reads its input, as (path, recursive).
    With an ingest_id: only that ingestion's folder, or its archived copy when it was
    already processed (retry / re-validation after remediation). Without one (manual
    CLI run): every file under the table folder."""
    if ingest_id:
        raw, archived = archive_paths(table, ingest_id)
        if exists is not None and not exists(raw) and exists(archived):
            return f"{hdfs_url}{archived}", False
        return f"{hdfs_url}{raw}", False
    return f"{hdfs_url}/data/raw/{table}", True


def archive_paths(table, ingest_id):
    return f"/data/raw/{table}/{ingest_id}", f"/data/archive/{table}/{ingest_id}"


def should_optimize(delta_version: int, every: int) -> bool:
    return every > 0 and delta_version > 0 and delta_version % every == 0


class Heartbeat:
    """Calls beat() every interval_seconds on a daemon thread until stop()."""

    def __init__(self, interval_seconds, beat):
        self.interval = interval_seconds
        self.beat = beat
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.wait(self.interval):
            try:
                self.beat()
            except Exception as e:
                print(f"[LOCK] Heartbeat failed: {e}")

    def start(self):
        self._thread.start()
        return self

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=5)
```

- [ ] **Step 4: รันให้ผ่าน** — Expected: `tests/unit/test_run_support.py` PASS (แล้วทำ Task 4 Step 7 ถ้ายังไม่ได้ทำ)

- [ ] **Step 5: engine — import และ `renew_lock`**

ใน `services/spark/spark_quality_engine.py` ต่อจากบรรทัด `from pyspark.sql import functions as F` เพิ่ม:

```python
from run_support import EXIT_SKIPPED, Heartbeat, archive_paths, raw_read_path, should_optimize
```

ต่อท้ายฟังก์ชัน `release_lock` (ก่อนคอมเมนต์ `# ─── DATA-DRIVEN STANDARDIZATION RULES`) เพิ่ม:

```python
def renew_lock(table_name: str, run_id: str, minutes: int = 15) -> None:
    """Push expires_at forward, but only while the lock still belongs to this run."""
    from urllib.parse import urlparse
    from datetime import timezone
    parsed = urlparse(ELASTICSEARCH_URL)
    auth = (parsed.username, parsed.password) if parsed.username else None
    base_url = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
    body = {
        "script": {
            "source": "if (ctx._source.run_id == params.run_id) { ctx._source.expires_at = params.exp } else { ctx.op = 'noop' }",
            "params": {"run_id": run_id,
                       "exp": (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()},
        }
    }
    requests.post(f"{base_url}/sdoqap_run_locks/_update/{table_name}", json=body, auth=auth, timeout=5)
```

- [ ] **Step 6: engine — เริ่มรอบ, lock, heartbeat**

1. เปลี่ยน signature:

```python
def run_quality_check(table_name, primary_key, date_column, schema_spec, input_table_name=None, ingest_id=None):
```

2. แทนที่:

```python
    run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')}"

    # ─── FIX 2A: Acquire distributed lock BEFORE starting Spark ───────────────
    if not acquire_lock(table_name, run_id, force=FORCE_LOCK):
        print(f"[ABORT] Duplicate run blocked for '{table_name}'. Exiting cleanly.")
        return None
```

ด้วย:

```python
    started_at = datetime.now(timezone.utc)
    run_id = f"run_{started_at.strftime('%Y%m%d_%H%M%S_%f')}"

    # Acquire the distributed lock before starting Spark. Returning (not sys.exit) here
    # matters: lock_protector would otherwise release the lock held by the other run.
    if not acquire_lock(table_name, run_id, force=FORCE_LOCK):
        print(f"[ABORT] Table '{table_name}' is locked by another run. Skipping.")
        return "SKIPPED"
    heartbeat = Heartbeat(60, lambda: renew_lock(table_name, run_id)).start()
```

- [ ] **Step 7: engine — resolve path ตาม ingest**

แทนที่ทั้งบล็อกตั้งแต่ `    # Determine raw HDFS path using FileSystem API check` จนถึงบรรทัด `        print(f"[PATH] HDFS check failed: {e}. Falling back to default: {raw_path}")` ด้วย:

```python
    # Resolve which files this run reads: one ingestion's folder (normal path) or the
    # whole table folder (manual CLI run without --ingest-id).
    sc = spark.sparkContext
    jvm = sc._gateway.jvm
    fs = jvm.org.apache.hadoop.fs.FileSystem.get(jvm.java.net.URI(HDFS_URL), sc._jsc.hadoopConfiguration())
    HPath = jvm.org.apache.hadoop.fs.Path

    def hdfs_exists(p):
        return fs.exists(HPath(p))

    if ingest_id:
        raw_path, recursive_read = raw_read_path(HDFS_URL, input_table_name, ingest_id, exists=hdfs_exists)
    else:
        source_table = input_table_name if hdfs_exists(f"/data/raw/{input_table_name}") else table_name
        raw_path, recursive_read = raw_read_path(HDFS_URL, source_table)
    print(f"[PATH] Reading raw input from {raw_path} (recursive={recursive_read})")
```

- [ ] **Step 8: engine — อ่าน CSV และกรณีไฟล์ว่าง**

แทนที่:

```python
        df = spark.read.option("header", "true").option("multiLine", "true").option("escape", "\"").option("quote", "\"").csv(raw_path)
```

(ตัวแรกใน `run_quality_check`) ด้วย:

```python
        df = spark.read.option("header", "true").option("multiLine", "true").option("escape", "\"").option("quote", "\"") \
            .option("recursiveFileLookup", "true" if recursive_read else "false").csv(raw_path)
```

และในบล็อก `# ─── GUARD: Empty file protection` แทน `sys.exit(0)` ด้วย `sys.exit(EXIT_SKIPPED)` (ตัวนี้อยู่หลังได้ lock แล้ว — `lock_protector` จะปล่อย lock ของรอบนี้เอง ถูกต้อง)

- [ ] **Step 9: engine — เขียน quarantine แบบ idempotent ก่อน MERGE**

1. ลบบรรทัด (อยู่หลังบล็อก Delta Maintenance):

```python
    all_quarantined_write.write.format("delta").mode("append").partitionBy("run_id").save(quarantine_path)
```

2. แทรกบล็อกนี้ **ก่อน** คอมเมนต์ `    # Delta Lake MERGE (True Upsert)`:

```python
    # Quarantine first, keyed by ingest_id: if the MERGE below fails, a retry of the same
    # ingestion replaces these rows instead of appending a second copy.
    from delta.tables import DeltaTable
    quarantine_write_df = all_quarantined_write.withColumn("ingest_id", F.lit(ingest_id or run_id))
    if ingest_id and DeltaTable.isDeltaTable(spark, quarantine_path):
        quarantine_table = DeltaTable.forPath(spark, quarantine_path)
        if "ingest_id" in quarantine_table.toDF().columns:
            quarantine_table.delete(F.col("ingest_id") == F.lit(ingest_id))
    quarantine_write_df.write.format("delta").mode("append").option("mergeSchema", "true") \
        .partitionBy("run_id").save(quarantine_path)
```

- [ ] **Step 10: engine — จังหวะ OPTIMIZE/VACUUM**

แทนที่บล็อก:

```python
    try:
        print("[DELTA MAINTENANCE] Running OPTIMIZE and ZORDER BY (row_hash)...")
        spark.sql(f"OPTIMIZE delta.`{active_path}` ZORDER BY (row_hash)")
        
        print("[DELTA MAINTENANCE] Running VACUUM (RETAIN 168 HOURS)...")
        spark.sql(f"VACUUM delta.`{active_path}` RETAIN 168 HOURS")
        print("[DELTA MAINTENANCE] Delta Table optimized and vacuumed successfully.")
    except Exception as maint_err:
        print(f"[DELTA MAINTENANCE] Non-fatal maintenance error: {maint_err}")
```

ด้วย:

```python
    try:
        optimize_every = int(os.getenv("DELTA_OPTIMIZE_EVERY", "10"))
        version = DeltaTable.forPath(spark, active_path).history(1).select("version").first()[0]
        if should_optimize(version, optimize_every):
            print(f"[DELTA MAINTENANCE] Version {version}: running OPTIMIZE ZORDER BY (row_hash) and VACUUM 168h...")
            spark.sql(f"OPTIMIZE delta.`{active_path}` ZORDER BY (row_hash)")
            spark.sql(f"VACUUM delta.`{active_path}` RETAIN 168 HOURS")
        else:
            print(f"[DELTA MAINTENANCE] Version {version}: skipped (runs every {optimize_every} versions).")
    except Exception as maint_err:
        print(f"[DELTA MAINTENANCE] Non-fatal maintenance error: {maint_err}")
```

- [ ] **Step 11: engine — เวลาประมวลผลและ ingest_id ในเอกสารผลลัพธ์**

1. แทนที่บรรทัด `    quality_run_doc = {` ด้วยสองบรรทัด:

```python
    finished_at = datetime.now(timezone.utc)
    quality_run_doc = {
```

2. ใน dict `quality_run_doc` เพิ่มหลังบรรทัด `"run_id": run_id,`:

```python
        "ingest_id": ingest_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round((finished_at - started_at).total_seconds(), 3),
```

3. ใน `log_to_elasticsearch("sdoqap_lineage_runs", {` และ `log_to_elasticsearch("sdoqap_pipeline_runs", {` ที่อยู่ถัดไป เพิ่ม `"ingest_id": ingest_id,` หลัง `"run_id": run_id,`

- [ ] **Step 12: engine — archive แทนการลบ**

แทนที่บล็อกตั้งแต่ `    # ─── HDFS Raw File Cleanup after Successful Run` จนถึง `        print(f"[CLEANUP] Warning: Failed to delete raw HDFS source folder: {cleanup_err}")` ด้วย:

```python
    # ─── Raw landing → archive (keep the source so any ingestion can be reprocessed) ───
    try:
        if ingest_id:
            src, dst = archive_paths(input_table_name, ingest_id)
            if hdfs_exists(src):
                fs.mkdirs(HPath(dst).getParent())
                fs.rename(HPath(src), HPath(dst))
                print(f"[ARCHIVE] Moved {src} -> {dst}")
        else:
            cleanup_target = input_table_name or table_name
            raw_dir_path = HPath(f"/data/raw/{cleanup_target}")
            if fs.exists(raw_dir_path) and quarantine_count == 0:
                print(f"[CLEANUP] Legacy run: deleting raw folder with 0 quarantined records: {raw_dir_path}")
                fs.delete(raw_dir_path, True)
    except Exception as cleanup_err:
        print(f"[ARCHIVE] Warning: could not archive raw input: {cleanup_err}")

    heartbeat.stop()
```

(บรรทัด `release_lock(table_name)` และ `spark.stop()` ที่ตามมาคงไว้)

- [ ] **Step 13: engine — CLI**

ในบล็อก `if __name__ == "__main__":`

1. หลัง `parser.add_argument("--force", ...)` เพิ่ม:

```python
    parser.add_argument("--ingest-id", default=None, help="Process only /data/raw/<table>/<ingest_id> (set by the trigger daemon)")
```

2. หลัง `FORCE_LOCK = args.force` เพิ่ม `INGEST_ID = args.ingest_id`
3. แทนที่การเรียกแรก:

```python
        run_quality_check(matched_table_name, spec["primary_key"], spec["date_column"], spec["schema_spec"], input_table_name=target_table)
```

ด้วย:

```python
        if run_quality_check(matched_table_name, spec["primary_key"], spec["date_column"], spec["schema_spec"],
                             input_table_name=target_table, ingest_id=INGEST_ID) == "SKIPPED":
            sys.exit(EXIT_SKIPPED)
```

4. ในสาขาอนุมาน schema แทน:

```python
        raw_path = f"hdfs://namenode:9000/data/raw/{target_table}"
```

ด้วย:

```python
        raw_path, recursive_read = raw_read_path(HDFS_URL, target_table, INGEST_ID)
```

แล้วเติม `.option("recursiveFileLookup", "true" if recursive_read else "false")` ก่อน `.csv(raw_path)` ของ**ทั้งสอง** `temp_spark.read...csv(raw_path)` ในสาขานี้ และแทน `sys.exit(0)` ใน `# ─── GUARD: Empty file protection in schema inference` ด้วย `sys.exit(EXIT_SKIPPED)`

หมายเหตุ: ในสาขานี้ถ้ามี `INGEST_ID` และโฟลเดอร์ถูก archive ไปแล้ว `raw_read_path` จะไม่รู้ (ไม่ได้ส่ง `exists`) — ยอมรับได้ เพราะตารางที่ยังไม่มีใน registry จะถูกบันทึกลง registry ในรอบแรก รอบ retry จึงไปสาขาแรกเสมอ

5. แทนที่การเรียกท้ายสาขาอนุมาน:

```python
            run_quality_check(target_table, primary_key, date_column, schema_spec)
```

ด้วย:

```python
            if run_quality_check(target_table, primary_key, date_column, schema_spec, ingest_id=INGEST_ID) == "SKIPPED":
                sys.exit(EXIT_SKIPPED)
```

- [ ] **Step 14: คอมไพล์และรันเทสต์**

```bash
python -m py_compile services/spark/spark_quality_engine.py services/spark/run_support.py && echo COMPILE_OK
```

แล้วรัน Spark unit tests — Expected: `COMPILE_OK`, PASS

- [ ] **Step 15: Commit**

```bash
git add services/spark/run_support.py services/spark/tests/unit/test_run_support.py services/spark/spark_quality_engine.py
git commit -m "feat(engine): process one ingestion per run, idempotent quarantine before MERGE, archive raw input, lock heartbeat, OPTIMIZE cadence, run timing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ปิดช่องที่เหลือ — ES timeout, รหัสผ่านต้องมาจาก `.env`, connector จำลอง (F-P4, F-S4, F-D7)

**Files:**
- Modify: `services/api/app/api/config.py` (`get_elasticsearch_url`, `get_es_client`)
- Modify: `docker-compose.yml` (elasticsearch, spark-master, spark-worker, api, pgadmin — **ไม่แตะ kibana/grafana**)
- Modify: `scripts/ops/data_retention_cleanup.py:15`
- Modify: `services/api/app/api/whitebox.py` (`ingest_from_connector`)
- Modify: `services/ui/src/pages/Ingestion.jsx` (`handleConnectSourceAndProfile`)
- Test: `services/api/tests/test_whitebox_connector.py`, `services/ui/src/pages/Ingestion.test.jsx`

- [ ] **Step 1: เทสต์ API ที่ fail** — `services/api/tests/test_whitebox_connector.py`

```python
import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import whitebox


def test_connector_is_labelled_simulated_and_invents_no_row_count(monkeypatch):
    monkeypatch.setattr(whitebox, "get_dataset_profile", lambda name: {"total_columns": 3})
    monkeypatch.setattr(whitebox, "_recompute_interactive_state", lambda: {})
    monkeypatch.setattr(whitebox, "_save_workflow_state", lambda: None)
    res = whitebox.ingest_from_connector({"source_type": "RDBMS", "table_name": "t", "host": "db"})
    assert res["simulated"] is True
    assert res["rows_ingested"] is None


def test_connector_reports_real_profile_row_count(monkeypatch):
    monkeypatch.setattr(whitebox, "get_dataset_profile", lambda name: {"total_rows": 1030})
    monkeypatch.setattr(whitebox, "_recompute_interactive_state", lambda: {})
    monkeypatch.setattr(whitebox, "_save_workflow_state", lambda: None)
    res = whitebox.ingest_from_connector({"source_type": "REST_API", "table_name": "t"})
    assert res["rows_ingested"] == 1030
```

- [ ] **Step 2: รันให้ fail** — Expected: `KeyError: 'simulated'`

- [ ] **Step 3: แก้ `ingest_from_connector` ใน `whitebox.py`**

แทนที่ dict ที่ return:

```python
    return _clean_for_json({
        "status": "connected_and_profiled",
        "source_type": source_type,
        "table_name": table_name,
        "connection_uri": endpoint_or_host,
        "rows_ingested": prof.get("total_rows", 10100),
        "profile": prof,
        "state": state
    })
```

ด้วย:

```python
    # This interactive connector does not open a real connection; it re-profiles the
    # dataset already loaded in the interactive engine. Say so, and never invent a count.
    return _clean_for_json({
        "status": "connected_and_profiled",
        "simulated": True,
        "source_type": source_type,
        "table_name": table_name,
        "connection_uri": endpoint_or_host,
        "rows_ingested": prof.get("total_rows"),
        "profile": prof,
        "state": state
    })
```

- [ ] **Step 4: เทสต์ UI ที่ fail** — เพิ่มท้าย `services/ui/src/pages/Ingestion.test.jsx`

```jsx
it("labels the interactive connector as a demo and shows no invented row count", async () => {
  await renderPage(Ingestion, "/ingestion");
  mockFetchByUrl([
    ["/ingest-source", { status: 200, body: { simulated: true, rows_ingested: null, profile: null } }]
  ]);
  fireEvent.click(screen.getByRole("tab", { name: /ฐานข้อมูล/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /ดึงข้อมูล RDBMS/ }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByText(/โหมดสาธิต/)).toBeTruthy();
  expect(screen.queryByText(/\(0 แถว\)/)).toBeNull();
});
```

- [ ] **Step 5: รันให้ fail** — `cd services/ui && npx vitest run src/pages/Ingestion.test.jsx; cd ../..` Expected: FAIL หา `โหมดสาธิต` ไม่เจอ

- [ ] **Step 6: แก้ `handleConnectSourceAndProfile` ใน `Ingestion.jsx`**

แทนที่บรรทัด:

```jsx
        setQuickUploadNotice(`เชื่อมต่อแหล่งข้อมูล [${sourceType}] ตาราง '${cleanTbl}' (${(d.rows_ingested ?? 0).toLocaleString()} แถว) และอัปเดตผลวิเคราะห์ System Auto-Profiling เรียบร้อยแล้ว`);
```

ด้วย:

```jsx
        const rows = d.rows_ingested == null ? "" : ` (${d.rows_ingested.toLocaleString()} แถว)`;
        setQuickUploadNotice(d.simulated
          ? `โหมดสาธิต: ยังไม่ได้เชื่อมต่อ ${sourceType} จริง ระบบตรวจข้อมูลชุดที่โหลดไว้ '${cleanTbl}'${rows} แทน`
          : `เชื่อมต่อแหล่งข้อมูล ${sourceType} ตาราง '${cleanTbl}'${rows} และตรวจข้อมูลแล้ว`);
```

- [ ] **Step 7: รัน UI tests ทั้งหมด** — Expected: PASS รวม `textBudget.test.jsx` (ถ้า text budget ของหน้า ingestion เกิน ให้ย่อข้อความในสาขา `simulated` ให้สั้นลง ห้ามแก้ `text-budget.json`)

- [ ] **Step 8: ES timeout และรหัสผ่านใน `config.py`**

1. ใน `get_elasticsearch_url()` แทน `es_pass = os.getenv("ELASTICSEARCH_PASSWORD", "sdoqap_secure")` ด้วย `es_pass = get_required_env("ELASTICSEARCH_PASSWORD")`
2. ใน `get_es_client()` แทน `client = Elasticsearch(es_url, request_timeout=1)` ด้วย:

```python
        client = Elasticsearch(es_url, request_timeout=int(os.getenv("ES_REQUEST_TIMEOUT", "10")))
```

(socket probe 0.1 วินาทีด้านบนยังทำให้กรณี ES ล่มตอบเร็วเหมือนเดิม)

- [ ] **Step 9: compose — รหัสผ่านต้องมาจาก `.env`**

ก่อนแก้ ให้แน่ใจว่า `.env` มีค่าที่ตรงกับรหัสผ่านเดิมของ volume ES (รหัสผ่านถูกเก็บใน volume ตั้งแต่ครั้งแรก เปลี่ยนค่าใน `.env` ไม่ได้เปลี่ยนรหัสผ่านจริง):

```bash
grep -q "^ELASTIC_PASSWORD=" .env || echo "ELASTIC_PASSWORD=sdoqap_secure" >> .env
grep -q "^ELASTICSEARCH_PASSWORD=" .env || echo "ELASTICSEARCH_PASSWORD=sdoqap_secure" >> .env
```

แล้วแก้ `docker-compose.yml`:
- `elasticsearch`: `- ELASTIC_PASSWORD=sdoqap_secure` → `- ELASTIC_PASSWORD=${ELASTIC_PASSWORD:?set ELASTIC_PASSWORD in .env}`; healthcheck `curl -s -u elastic:sdoqap_secure http://...` → `curl -s -u elastic:$${ELASTIC_PASSWORD} http://...`
- `spark-master`, `spark-worker`, `api`: ทุก `${ELASTICSEARCH_PASSWORD:-sdoqap_secure}` → `${ELASTICSEARCH_PASSWORD:?set ELASTICSEARCH_PASSWORD in .env}`
- `pgadmin`: `${PGADMIN_PASSWORD:-admin}` → `${PGADMIN_PASSWORD:?set PGADMIN_PASSWORD in .env}`
- **ไม่แก้** บรรทัดของ `kibana` และ `grafana`

```bash
grep -n "sdoqap_secure\|:-admin" docker-compose.yml
docker compose config -q && echo COMPOSE_OK
```

Expected: เหลือเฉพาะบรรทัดของ kibana/grafana; `COMPOSE_OK`

- [ ] **Step 10: `scripts/ops/data_retention_cleanup.py`**

แทนที่:

```python
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elastic:sdoqap_secure@elasticsearch:9200")
```

ด้วย:

```python
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL") or "http://{}:{}@{}:{}".format(
    os.getenv("ELASTICSEARCH_USER", "elastic"),
    os.environ["ELASTICSEARCH_PASSWORD"],
    os.getenv("ELASTICSEARCH_HOST", "elasticsearch"),
    os.getenv("ELASTICSEARCH_PORT", "9200"),
)
```

- [ ] **Step 11: รัน API tests + ขึ้น stack ใหม่**

```bash
docker compose up -d --force-recreate elasticsearch api spark-master spark-worker
sleep 150
docker compose ps elasticsearch api spark-master
```

Expected: เทสต์ PASS; ทั้ง 3 service `healthy`

- [ ] **Step 12: Commit**

```bash
git add services/api/app/api/config.py services/api/app/api/whitebox.py services/api/tests/test_whitebox_connector.py services/ui/src/pages/Ingestion.jsx services/ui/src/pages/Ingestion.test.jsx docker-compose.yml scripts/ops/data_retention_cleanup.py
git commit -m "fix: label the interactive connector as a demo, require ES/pgAdmin passwords from .env, raise ES client timeout to 10s

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: UI แสดงสถานะของรอบหลังนำเข้า

**Files:**
- Create: `services/ui/src/hooks/useRunStatus.js`, `services/ui/src/components/RunStatusLine.jsx`
- Test: `services/ui/src/components/RunStatusLine.test.jsx`
- Modify: `services/ui/src/pages/Ingestion.jsx` (`handleCsvSubmit`, `handleApiSubmit`, `handleRdbmsSubmit`, JSX ของแต่ละแท็บ)

**Interfaces:**
- Consumes: `GET /api/v1/pipeline/runs/{ingest_id}` (Task 3), response ingest `{status, ingest_id, message}`
- Produces: `useRunStatus(ingestId, intervalMs = 5000) -> {state, error}`; `<RunStatusLine ingestId={...} />`
- สถานะ → ข้อความ: `QUEUED` "รอคิวตรวจ", `RUNNING` "กำลังตรวจคุณภาพ", `SUCCEEDED` "ตรวจเสร็จแล้ว", `FAILED` "ตรวจไม่สำเร็จ", `SKIPPED` "ข้าม เพราะมีรอบอื่นกำลังใช้ตารางนี้", `TRIGGER_FAILED` "สั่งตรวจไม่สำเร็จ"

- [ ] **Step 1: เทสต์ที่ fail** — `services/ui/src/components/RunStatusLine.test.jsx`

```jsx
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { mockFetchByUrl } from "../test/renderPage";
import RunStatusLine from "./RunStatusLine";

afterEach(() => vi.useRealTimers());

it("renders nothing without an ingest id", () => {
  const { container } = render(<RunStatusLine ingestId={null} />);
  expect(container.textContent).toBe("");
});

it("shows the run state in Thai and stops polling at a final state", async () => {
  const fetchFn = mockFetchByUrl([["/pipeline/runs/i1", { body: { state: "SUCCEEDED" } }]]);
  await act(async () => { render(<RunStatusLine ingestId="i1" intervalMs={10} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  expect(screen.getByRole("status")).toHaveTextContent("ตรวจเสร็จแล้ว");
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

it("keeps polling while the run is queued", async () => {
  const fetchFn = mockFetchByUrl([["/pipeline/runs/i2", { body: { state: "QUEUED" } }]]);
  await act(async () => { render(<RunStatusLine ingestId="i2" intervalMs={10} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  expect(screen.getByRole("status")).toHaveTextContent("รอคิวตรวจ");
  expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
});
```

- [ ] **Step 2: รันให้ fail** — `cd services/ui && npx vitest run src/components/RunStatusLine.test.jsx; cd ../..` Expected: FAIL (import ไม่เจอ)

- [ ] **Step 3: เขียน hook และ component**

`services/ui/src/hooks/useRunStatus.js`:

```js
import { useEffect, useState } from "react";

const FINAL_STATES = new Set(["SUCCEEDED", "FAILED", "SKIPPED", "TRIGGER_FAILED"]);

// Polls GET /api/v1/pipeline/runs/{ingestId} until the run reaches a final state.
export function useRunStatus(ingestId, intervalMs = 5000) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ingestId) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/pipeline/runs/${encodeURIComponent(ingestId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (cancelled) return;
        setState(body.state);
        setError(false);
        if (!FINAL_STATES.has(body.state)) timer = setTimeout(poll, intervalMs);
      } catch {
        if (cancelled) return;
        setError(true);
        timer = setTimeout(poll, intervalMs);
      }
    };
    setState(null);
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ingestId, intervalMs]);

  return { state, error };
}
```

`services/ui/src/components/RunStatusLine.jsx`:

```jsx
import React from "react";
import { useRunStatus } from "../hooks/useRunStatus";

const LABELS = {
  QUEUED: "รอคิวตรวจ",
  RUNNING: "กำลังตรวจคุณภาพ",
  SUCCEEDED: "ตรวจเสร็จแล้ว",
  FAILED: "ตรวจไม่สำเร็จ",
  SKIPPED: "ข้าม เพราะมีรอบอื่นกำลังใช้ตารางนี้",
  TRIGGER_FAILED: "สั่งตรวจไม่สำเร็จ"
};

export default function RunStatusLine({ ingestId, intervalMs }) {
  const { state, error } = useRunStatus(ingestId, intervalMs);
  if (!ingestId) return null;
  const text = error ? "ยังอ่านสถานะรอบไม่ได้" : (LABELS[state] || "กำลังส่งงาน");
  return <p role="status" className="run-status-line">สถานะรอบ: {text}</p>;
}
```

- [ ] **Step 4: รันให้ผ่าน** — Expected: `RunStatusLine.test.jsx` PASS

- [ ] **Step 5: ต่อเข้ากับหน้า Ingestion**

1. เพิ่ม import: `import RunStatusLine from "../components/RunStatusLine";`
2. เพิ่ม state ใกล้ `const [csvStatus, setCsvStatus] = useState(null);`:

```jsx
  const [lastIngestId, setLastIngestId] = useState(null);
```

3. ใน `handleCsvSubmit` หลัง `if (response.ok) {` เพิ่มบรรทัดแรก:

```jsx
        setLastIngestId(res.ingest_id || null);
        if (res.status === "duplicate") {
          setCsvStatus({ success: true, message: "ไฟล์นี้เคยนำเข้าแล้ว ระบบไม่ตรวจซ้ำ" });
          return;
        }
```

4. ใน `handleApiSubmit` และ `handleRdbmsSubmit` หลังบรรทัด `const res = await postApi(...)` ของแต่ละตัว เพิ่ม `setLastIngestId(res?.ingest_id || null);`
5. ใน JSX วาง `<RunStatusLine ingestId={lastIngestId} />` ถัดจากตำแหน่งที่ render ข้อความ `csvStatus`, `apiStatus`, `rdbmsStatus` (หาได้ด้วย `grep -n "csvStatus\b\|apiStatus\b\|rdbmsStatus\b" services/ui/src/pages/Ingestion.jsx` เลือกบรรทัดที่อยู่ใน `return (`) — วางหนึ่งครั้งต่อแท็บ

- [ ] **Step 6: รัน UI tests ทั้งหมด** — Expected: PASS (textBudget ไม่เปลี่ยน เพราะไม่มี ingest id ตอนเปิดหน้า)

- [ ] **Step 7: Commit**

```bash
git add services/ui/src/hooks/useRunStatus.js services/ui/src/components/RunStatusLine.jsx services/ui/src/components/RunStatusLine.test.jsx services/ui/src/pages/Ingestion.jsx
git commit -m "feat(ui): show each ingestion's run state after import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ทดสอบ end-to-end ว่าปัญหาข้อมูลหายหายไปจริง (หลักฐานสำหรับเกณฑ์ extraction/loading)

**Files:**
- Create: `scripts/ops/e2e_ingest_check.sh`
- Create (ผลลัพธ์): `docs/evaluation/evidence/b-e2e-ingest-check.txt`

- [ ] **Step 1: เขียนสคริปต์** — `scripts/ops/e2e_ingest_check.sh`

```bash
#!/usr/bin/env bash
# End-to-end check of the ingestion/loading guarantees from Plan B.
# Usage: bash scripts/ops/e2e_ingest_check.sh  (stack running, run from repo root)
set -u
BASE="http://localhost:${NGINX_HOST_PORT:-80}/api/v1/pipeline"
KEY=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv INGEST_SERVICE_KEY | tr -d '\r')
TABLE="e2e_ingest_$(date +%s)"
SAMPLE="data/samples/student_scores/student_scores_sample.csv"
TMP=$(mktemp -d)
head -n 501 "$SAMPLE" > "$TMP/a.csv"
{ head -n 1 "$SAMPLE"; tail -n +502 "$SAMPLE"; } > "$TMP/b.csv"

post() { curl -s -H "X-Service-Key: $KEY" -F "table_name=$TABLE" -F "file=@$1" "$BASE/ingest/csv"; }
state() { curl -s "$BASE/runs/$1" | python -c "import sys,json;print(json.load(sys.stdin).get('state'))"; }
ingest_of() { python -c "import sys,json;print(json.loads(sys.argv[1]).get('ingest_id',''))" "$1"; }

echo "== 1. two different files back-to-back (used to overwrite each other)"
A=$(post "$TMP/a.csv"); B=$(post "$TMP/b.csv")
IA=$(ingest_of "$A"); IB=$(ingest_of "$B")
echo "A: $A"; echo "B: $B"
[ -n "$IA" ] && [ -n "$IB" ] && [ "$IA" != "$IB" ] && echo "PASS distinct ingest ids" || echo "FAIL ingest ids"

echo "== 2. same file again -> duplicate"
C=$(post "$TMP/a.csv"); echo "C: $C"
echo "$C" | grep -q '"status":"duplicate"' && echo "PASS duplicate detected" || echo "FAIL duplicate"

echo "== 3. wait for both runs to finish (queued one after the other)"
for i in $(seq 1 60); do
  SA=$(state "$IA"); SB=$(state "$IB")
  echo "  t=$((i*10))s A=$SA B=$SB"
  case "$SA$SB" in *QUEUED*|*RUNNING*) sleep 10;; *) break;; esac
done
[ "$SA" = "SUCCEEDED" ] && [ "$SB" = "SUCCEEDED" ] && echo "PASS both processed" || echo "FAIL states A=$SA B=$SB"

echo "== 4. both raw folders archived, none deleted"
MSYS_NO_PATHCONV=1 docker compose exec -T namenode hdfs dfs -ls "/data/archive/$TABLE" 2>&1 | tail -n +2
MSYS_NO_PATHCONV=1 docker compose exec -T namenode hdfs dfs -ls "/data/raw/$TABLE" 2>&1 | tail -n +2

echo "== 5. processing time recorded per ingestion"
curl -s "http://localhost:${NGINX_HOST_PORT:-80}/api/v1/quality/$TABLE" | python -c "
import sys, json
d = json.load(sys.stdin)
runs = d if isinstance(d, list) else d.get('runs', d.get('items', []))
for r in runs:
    print(' ', r.get('ingest_id'), r.get('total_records'), r.get('quarantined_records'), r.get('duration_seconds'))
"
rm -rf "$TMP"
```

- [ ] **Step 2: รันและเก็บหลักฐาน**

```bash
mkdir -p docs/evaluation/evidence
docker compose up -d
sleep 150
bash scripts/ops/e2e_ingest_check.sh 2>&1 | tee docs/evaluation/evidence/b-e2e-ingest-check.txt
```

Expected: ทุกบรรทัด `PASS`; ข้อ 4 แสดงโฟลเดอร์ ingest 2 โฟลเดอร์ใต้ `/data/archive/<table>` และ `/data/raw/<table>` ว่าง; ข้อ 5 แสดง 2 แถวพร้อม `duration_seconds` — ถ้ามี `FAIL` ให้หยุดและแก้ก่อน commit (ห้ามแก้สคริปต์ให้ผ่านโดยไม่แก้สาเหตุ) ถ้า `/api/v1/quality/<table>` คืนรูปแบบต่างจากที่สคริปต์คาด ให้แก้เฉพาะตัว parse ใน Step 5 ของสคริปต์

- [ ] **Step 3: Commit**

```bash
git add scripts/ops/e2e_ingest_check.sh docs/evaluation/evidence/b-e2e-ingest-check.txt
git commit -m "test(e2e): prove concurrent uploads, duplicates and archiving behave; keep the run log as evidence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- ครอบคลุมจาก spec: F-S1 (Task 4), F-S2/F-S3 (Task 1, 3), F-S4 (Task 6), F-D1/F-D2 (Task 3, 5), F-D3 (Task 3), F-D4/F-D5 (Task 5), F-D6 (Task 4, 5), F-D7 (Task 6), F-D9/F-D10 (Task 3), F-P1/F-P2 (Task 1, 3), F-P3 (Task 5), F-P4 (Task 6), F-P5 (Task 4)
- เลื่อนไปแผนอื่น: F-S5/F-S6 (rate limit หลัง proxy, CORS) — ความเสี่ยงต่ำ ไม่เกี่ยวกับเกณฑ์ ยังไม่ทำ; F-D8 (state ของ whitebox ใช้ร่วมกัน) — ระบุไว้ใน Plan D Task 5 ว่าเป็นข้อจำกัดของโหมดสาธิต
- ชื่อที่ใช้ข้าม task ตรงกัน: `upload_to_webhdfs(table, content, ingest_id)`, `trigger_spark_job(table, ingest_id)`, `EXIT_SKIPPED = 75` ทั้งสองโมดูล, header `X-Trigger-Secret`, ดัชนี `sdoqap_runs`, ฟิลด์ `ingest_id`/`duration_seconds` ใน `sdoqap_quality_runs`
