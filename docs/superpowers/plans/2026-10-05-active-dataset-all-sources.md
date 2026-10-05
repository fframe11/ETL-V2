# Active Dataset From All Ingest Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every successful ingest (file, database, REST API) makes the data it just landed the dataset that Expectations & Alerts, Jobs & Pipelines, Workspace Exports and Dashboard work on, and the simulated connector stops renaming a dataset it never loaded.

**Architecture:** `POST /whitebox/upload-csv` already turns an uploaded file into the "working dataset" of the interactive (pandas) engine. Extract that logic into one function, `whitebox.activate_dataset(df, table_name, source_type, connection_uri)`, and call it from the two real non-file ingest routes in `pipeline.py` (`/ingest/rdbms`, `/ingest/api`) through a helper that can never fail the ingest. The UI refreshes its profile after a database ingest and tells the user when the interactive pages could not switch.

**Tech Stack:** FastAPI + pandas (services/api), pytest, React + vitest (services/ui).

**Spec:** No separate spec file. Requirements come from the 2026-10-05 debugging session: pages showed the old student dataset (header said `test_v2`, rows were student rows) after `test_v2` was ingested. Branch: `feat/generic-profiling-rule-engine` (commit `d408d31` made the engine generic for file uploads; this plan closes the remaining gaps).

## Global Constraints

- Work on branch `feat/generic-profiling-rule-engine`. Do not switch branches.
- The working tree has uncommitted edits by another contributor (`services/api/app/api/whitebox.py`, `services/ui/src/pages/Ingestion.test.jsx`, `services/ui/src/pages/RulesConfig.jsx`, several API tests, `services/spark/*`). Never revert, reformat or stage hunks you did not write. Before every commit run `git diff <file>` for each file you stage; if a file contains hunks that are not yours, do **not** commit it — leave it uncommitted and tell the user.
- Line numbers below are from 2026-10-05 and the files are still changing. Locate code by the quoted text, not the line number.
- Ingest must never fail because the interactive engine could not switch datasets (the Spark run is already queued by then).
- Env var `ACTIVE_DATASET_MAX_ROWS`, default `500000`: above this the interactive engine keeps the previous dataset.
- User-facing text is Thai; code, identifiers and log messages are English.
- No `Co-Authored-By` or "Generated with" lines in commit messages.
- Run API tests from `C:\ETL\services\api` with `python -m pytest`; UI tests from `C:\ETL\services\ui` with `npx vitest run`.

## File Structure

| File | Responsibility |
|---|---|
| `services/api/app/api/whitebox.py` | Owns the interactive engine. Gains `activate_dataset()`; `/upload-csv` and `/ingest-source` use it / stop renaming. |
| `services/api/app/api/pipeline.py` | Real ingest routes. Gains `activate_interactive_dataset()` helper, called by `/ingest/rdbms` and `/ingest/api`. |
| `services/api/tests/test_activate_dataset.py` | New. Tests `activate_dataset`. |
| `services/api/tests/test_pipeline_activate_dataset.py` | New. Tests the pipeline helper and routes. |
| `services/api/tests/test_whitebox_connector.py` | Add the "does not rename" test. |
| `services/ui/src/pages/Ingestion.jsx` | After DB ingest: rescan profile, show notice when not activated; connector uses returned `table_name`. |
| `services/ui/src/pages/Ingestion.test.jsx` | UI tests for the above. |
| `docs/presentation/04-user-guide-and-journey.md` | Section 2.3 and section 5 describe the new behaviour. |

---

### Task 1: Extract `activate_dataset` from `/upload-csv`

**Files:**
- Modify: `services/api/app/api/whitebox.py` (function `upload_csv_dataset`, add `activate_dataset` just above `@router.post("/upload-csv"...)`)
- Test: `services/api/tests/test_activate_dataset.py` (create)

**Interfaces:**
- Consumes: existing module globals `WORKING_DATASET_PATH`, `_UPLOADED_DATASETS`, `_WORKFLOW_STATE`, `_LATEST_PROFILING`, `_LATEST_USER_CONTEXT`, `_LATEST_RECOMMENDATIONS`, and functions `_compute_profile`, `get_default_user_context`, `_generate_recommendations`, `_save_workflow_state`, `_recompute_interactive_state`.
- Produces: `activate_dataset(df: pd.DataFrame, table_name: str, source_type: str, connection_uri: str = "") -> Dict[str, Any]` returning `{"table_name": str, "profile": dict, "recommendations": list, "state": dict}`. `table_name` must already be sanitised by the caller. Task 2 calls it.

- [ ] **Step 1: Write the failing test**

Create `services/api/tests/test_activate_dataset.py`:

```python
import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("SESSION_SECRET_KEY", "test-activate-dataset")
os.environ.setdefault("ELASTICSEARCH_PASSWORD", "mock")

from app.api import whitebox


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    out = tmp_path / "out"
    out.mkdir()
    monkeypatch.setattr(whitebox, "OUTPUT_DIR", str(out))
    monkeypatch.setattr(whitebox, "WORKING_DATASET_PATH", str(out / "working_dataset.csv"))
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE_PATH", str(tmp_path / "workflow_state.json"))
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE", {"dataset_name": "", "dataset_source": ""})
    monkeypatch.setattr(whitebox, "_UPLOADED_DATASETS", {})
    for cache in (whitebox._LATEST_PROFILING, whitebox._LATEST_USER_CONTEXT,
                  whitebox._LATEST_RECOMMENDATIONS, whitebox._LATEST_EXECUTION_RESULTS):
        cache.clear()
    return whitebox


def _sample_df():
    return pd.DataFrame({
        "id": [1, 2, 3, 4],
        "age": [20, 30, 40, 200],
        "income": [1.0, 2.0, 3.0, None],
    })


def test_activate_dataset_makes_the_table_the_working_dataset(isolated):
    out = isolated.activate_dataset(_sample_df(), "test_v2", "RDBMS", "postgres:5432/sdoqap_oltp")

    assert out["table_name"] == "test_v2"
    assert out["profile"]["total_rows"] == 4
    assert out["recommendations"]
    state = isolated._WORKFLOW_STATE
    assert state["dataset_name"] == "test_v2"
    assert state["dataset_source"] == "upload"
    assert state["source_type"] == "RDBMS"
    assert state["connection_uri"] == "postgres:5432/sdoqap_oltp"
    assert "test_v2" in isolated._UPLOADED_DATASETS
    assert os.path.isfile(isolated.WORKING_DATASET_PATH)
    assert out["state"]["metrics"]["total_rows"] == 4


def test_activate_dataset_does_not_mutate_the_callers_frame(isolated):
    df = _sample_df()
    isolated.activate_dataset(df, "test_v2", "RDBMS")
    assert "dirty_row_id" not in df.columns


def test_second_activation_replaces_the_first(isolated):
    isolated.activate_dataset(_sample_df(), "first", "RDBMS")
    isolated.activate_dataset(_sample_df().head(2), "second", "REST_API")
    assert isolated._WORKFLOW_STATE["dataset_name"] == "second"
    assert pd.read_csv(isolated.WORKING_DATASET_PATH).shape[0] == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_activate_dataset.py -v`
Expected: FAIL with `AttributeError: module 'app.api.whitebox' has no attribute 'activate_dataset'`

- [ ] **Step 3: Write minimal implementation**

In `whitebox.py`, immediately above the line `@router.post("/upload-csv", dependencies=[Depends(require_session)])`, add:

```python
def activate_dataset(df: pd.DataFrame, table_name: str, source_type: str, connection_uri: str = "") -> Dict[str, Any]:
    """Make `df` the dataset every interactive page works on (Expectations, Pipeline,
    Export, Dashboard). `table_name` must already be sanitised by the caller."""
    df = df.copy()
    if "dirty_row_id" not in df.columns:
        df.insert(0, "dirty_row_id", range(1, len(df) + 1))
    df.to_csv(WORKING_DATASET_PATH, index=False)
    _UPLOADED_DATASETS[table_name] = df.copy()
    _WORKFLOW_STATE["dataset_name"] = table_name
    _WORKFLOW_STATE["dataset_source"] = "upload"
    _WORKFLOW_STATE["source_type"] = source_type
    _WORKFLOW_STATE["connection_uri"] = connection_uri
    _save_workflow_state()
    _LATEST_PROFILING.clear()
    prof = _compute_profile(df, table_name)
    _LATEST_PROFILING[table_name] = prof
    default_ctx = get_default_user_context(table_name, prof)
    _LATEST_USER_CONTEXT[table_name] = default_ctx
    recs = _generate_recommendations(prof, default_ctx)
    _LATEST_RECOMMENDATIONS[table_name] = {
        "dataset_name": table_name,
        "recommendations_count": len(recs),
        "recommendations": recs,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    _WORKFLOW_STATE["active_rules"] = recs
    _save_workflow_state()
    state = _recompute_interactive_state()
    return {"table_name": table_name, "profile": prof, "recommendations": recs, "state": state}


```

Then in `upload_csv_dataset`, replace everything from the line `_WORKFLOW_STATE["dataset_name"] = clean_tbl` (the first one, right after `clean_tbl = re.sub(...)`) down to and including the final `})` of the function with:

```python
    if "dirty_row_id" not in df_up.columns:
        df_up.insert(0, "dirty_row_id", range(1, len(df_up) + 1))
    result = activate_dataset(df_up, clean_tbl, "FILE_UPLOAD")
    _UPLOADED_DATASETS[raw_tbl] = df_up.copy()
    return _clean_for_json({
        "status": "ingested",
        "source_type": "FILE_UPLOAD",
        "table_name": clean_tbl,
        "rows_ingested": int(len(df_up)),
        "columns": list(df_up.columns),
        "profile": result["profile"],
        "recommendations": result["recommendations"],
        "state": result["state"]
    })
```

(The route keeps its own `dirty_row_id` insert so the response's `columns` list is unchanged; `activate_dataset` guards the same case for other callers.)

- [ ] **Step 4: Run tests to verify they pass and upload behaviour is unchanged**

Run: `python -m pytest tests/test_activate_dataset.py tests/test_generic_profiling_pipeline.py tests/test_upload_table.py tests/test_whitebox_upload_keeps_evaluation_data.py -q`
Expected: all PASS (the existing upload tests prove the refactor is behaviour-preserving).

- [ ] **Step 5: Commit** (see Global Constraints about foreign hunks in `whitebox.py`)

```bash
git diff services/api/app/api/whitebox.py   # confirm only your hunks, else stop and ask
git add services/api/tests/test_activate_dataset.py services/api/app/api/whitebox.py
git commit -m "refactor(whitebox): extract activate_dataset from upload-csv"
```

---

### Task 2: Activate the dataset after database and API ingests

**Files:**
- Modify: `services/api/app/api/pipeline.py` (imports, new helper above `land_and_queue`, `ingest_api` tail, `ingest_rdbms` tail)
- Test: `services/api/tests/test_pipeline_activate_dataset.py` (create)

**Interfaces:**
- Consumes: `whitebox.activate_dataset(df, table_name, source_type, connection_uri="")` from Task 1; existing `land_and_queue`.
- Produces: `pipeline.activate_interactive_dataset(table_name: str, content: bytes, source: str, connection_uri: str = "") -> dict` returning `{"activated": True, "rows": int}` or `{"activated": False, "reason": str}`. Routes add the key `interactive_engine` to their JSON. Task 4 reads `interactive_engine.activated` / `.reason`.

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_pipeline_activate_dataset.py`:

```python
import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-pipeline-activate")
os.environ.setdefault("ELASTICSEARCH_PASSWORD", "mock")

from app.api import pipeline, whitebox
from app.api.auth import require_session, require_session_or_service_key
from fakes import FakeES

RDBMS_BODY = {
    "table_name": "test_v2", "host": "postgres", "port": 5432, "username": "u",
    "password": "p", "database": "sdoqap_oltp", "query": "SELECT * FROM t",
}


@pytest.fixture
def client(monkeypatch):
    es = FakeES()
    activated = []
    monkeypatch.setattr(pipeline, "get_es_client", lambda: es)
    monkeypatch.setattr(pipeline, "upload_to_webhdfs", lambda t, c, i: f"/data/raw/{t}/{i}/{t}.csv")
    monkeypatch.setattr(pipeline, "trigger_spark_job", lambda t, i: {"status": "running"})
    monkeypatch.setattr(pipeline, "validate_rdbms_host", lambda host: None)
    monkeypatch.setattr(pipeline, "run_readonly_query",
                        lambda connect, query, max_rows: (["id", "age"], [(1, 20), (2, 30)]))
    monkeypatch.setattr(
        whitebox, "activate_dataset",
        lambda df, name, source_type, uri="": activated.append((name, len(df), source_type, uri)) or {})
    app = FastAPI()
    app.include_router(pipeline.router)
    app.dependency_overrides[require_session_or_service_key] = lambda: "test"
    app.dependency_overrides[require_session] = lambda: "test"
    c = TestClient(app)
    c.activated = activated
    return c


def test_rdbms_ingest_switches_the_interactive_engine_to_the_new_table(client):
    r = client.post("/api/v1/pipeline/ingest/rdbms", json=RDBMS_BODY)
    assert r.status_code == 202
    assert r.json()["interactive_engine"] == {"activated": True, "rows": 2}
    assert client.activated == [("test_v2", 2, "RDBMS", "postgres:5432/sdoqap_oltp")]


def test_activation_failure_never_fails_the_ingest(client, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("profile exploded")

    monkeypatch.setattr(whitebox, "activate_dataset", boom)
    r = client.post("/api/v1/pipeline/ingest/rdbms", json=RDBMS_BODY)
    assert r.status_code == 202
    assert r.json()["status"] == "queued"
    assert r.json()["interactive_engine"]["activated"] is False
    assert "profile exploded" in r.json()["interactive_engine"]["reason"]


def test_datasets_above_the_row_cap_keep_the_previous_dataset(client, monkeypatch):
    monkeypatch.setenv("ACTIVE_DATASET_MAX_ROWS", "1")
    r = client.post("/api/v1/pipeline/ingest/rdbms", json=RDBMS_BODY)
    assert r.status_code == 202
    assert r.json()["interactive_engine"]["activated"] is False
    assert "ACTIVE_DATASET_MAX_ROWS" in r.json()["interactive_engine"]["reason"]
    assert client.activated == []


def test_source_names_map_to_whitebox_source_types(client):
    assert pipeline.activate_interactive_dataset("t", b"a,b\n1,2\n", "api")["activated"] is True
    assert pipeline.activate_interactive_dataset("t", b"a,b\n1,2\n", "rdbms")["activated"] is True
    assert [a[2] for a in client.activated] == ["REST_API", "RDBMS"]


def test_file_route_is_not_activated_here_because_upload_csv_already_does_it(client):
    r = client.post("/api/v1/pipeline/ingest/csv", data={"table_name": "scores"},
                    files={"file": ("scores.csv", b"a,b\n1,2\n", "text/csv")})
    assert r.status_code == 202
    assert "interactive_engine" not in r.json()
    assert client.activated == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_pipeline_activate_dataset.py -v`
Expected: FAIL — `AttributeError: ... 'pipeline' has no attribute 'activate_interactive_dataset'` and `KeyError: 'interactive_engine'`.

- [ ] **Step 3: Write minimal implementation**

In `pipeline.py` add `import logging` to the stdlib imports and, right after the `from .validation import validate_table_name` line, add:

```python
logger = logging.getLogger(__name__)

_WHITEBOX_SOURCE_TYPES = {"file": "FILE_UPLOAD", "api": "REST_API", "rdbms": "RDBMS"}
```

Directly above `def land_and_queue(`, add:

```python
def activate_interactive_dataset(table_name: str, content: bytes, source: str, connection_uri: str = "") -> dict:
    """Point Expectations / Pipeline / Export / Dashboard at the data that was just ingested.
    Never raises: the Spark run is already queued, so a failure here only means the
    interactive pages keep showing the previous dataset."""
    limit = int(os.getenv("ACTIVE_DATASET_MAX_ROWS", "500000"))
    try:
        import pandas as pd
        from . import whitebox
        df = pd.read_csv(io.BytesIO(content))
        if len(df) > limit:
            return {"activated": False,
                    "reason": f"{len(df):,} rows exceeds ACTIVE_DATASET_MAX_ROWS={limit:,}; "
                              "the interactive pages keep the previous dataset."}
        whitebox.activate_dataset(df, table_name, _WHITEBOX_SOURCE_TYPES.get(source, source.upper()), connection_uri)
        return {"activated": True, "rows": int(len(df))}
    except Exception as exc:
        logger.warning("Could not activate '%s' in the interactive engine: %s", table_name, exc)
        return {"activated": False, "reason": str(exc)}


```

In `ingest_api`, replace

```python
    result = land_and_queue(table_name, output.getvalue().encode("utf-8"), source="api")
    if result["status"] == "duplicate":
        response.status_code = 200
    return result
```

with

```python
    content = output.getvalue().encode("utf-8")
    result = land_and_queue(table_name, content, source="api")
    result["interactive_engine"] = activate_interactive_dataset(table_name, content, "api", url)
    if result["status"] == "duplicate":
        response.status_code = 200
    return result
```

In `ingest_rdbms`, replace

```python
    result = land_and_queue(table_name, output.getvalue().encode("utf-8"), source="rdbms")
    result["rows_ingested"] = len(rows)
```

with

```python
    content = output.getvalue().encode("utf-8")
    result = land_and_queue(table_name, content, source="rdbms")
    result["rows_ingested"] = len(rows)
    result["interactive_engine"] = activate_interactive_dataset(
        table_name, content, "rdbms", f"{payload.host}:{payload.port}/{payload.database}")
```

(Leave the lines after it — the `duplicate` status handling and `return result` — untouched. `ingest_csv` is deliberately not changed: the UI file flow already calls `/whitebox/upload-csv`, and activating twice would profile a 233k-row file twice.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_pipeline_activate_dataset.py tests/test_pipeline_ingest.py tests/test_route_contract.py -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git diff services/api/app/api/pipeline.py   # confirm only your hunks
git add services/api/app/api/pipeline.py services/api/tests/test_pipeline_activate_dataset.py
git commit -m "feat(pipeline): switch the interactive engine to the dataset just ingested from db/api"
```

---

### Task 3: The simulated connector must not rename a dataset it never loaded

**Files:**
- Modify: `services/api/app/api/whitebox.py` (function `ingest_from_connector`)
- Test: `services/api/tests/test_whitebox_connector.py` (append)

**Interfaces:**
- Consumes: `_UPLOADED_DATASETS`, `_WORKFLOW_STATE`.
- Produces: `/whitebox/ingest-source` response keeps its keys; `table_name` is now the dataset actually shown, new key `requested_table_name` is what the caller asked for. Task 4 uses `table_name`.

Background: `ingest_from_connector` does not connect to anything; it re-profiles the loaded dataset, but currently it also writes `dataset_name = <typed name>`, which is why the pages said `test_v2` while showing student rows.

- [ ] **Step 1: Write the failing test**

Append to `services/api/tests/test_whitebox_connector.py`:

```python
def test_connector_does_not_rename_a_dataset_it_has_not_loaded(monkeypatch):
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE", {"dataset_name": "test_v2", "dataset_source": "upload"})
    monkeypatch.setattr(whitebox, "_UPLOADED_DATASETS", {"test_v2": object()})
    seen = []
    monkeypatch.setattr(whitebox, "get_dataset_profile", lambda name: seen.append(name) or {"total_rows": 5})
    monkeypatch.setattr(whitebox, "_recompute_interactive_state", lambda: {})
    monkeypatch.setattr(whitebox, "_save_workflow_state", lambda: None)

    res = whitebox.ingest_from_connector({"source_type": "REST_API", "table_name": "orders"})

    assert whitebox._WORKFLOW_STATE["dataset_name"] == "test_v2"
    assert res["table_name"] == "test_v2"
    assert res["requested_table_name"] == "orders"
    assert seen == ["test_v2"]
    assert res["simulated"] is True


def test_connector_switches_to_a_table_that_is_already_loaded(monkeypatch):
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE", {"dataset_name": "other", "dataset_source": "upload"})
    monkeypatch.setattr(whitebox, "_UPLOADED_DATASETS", {"other": object(), "test_v2": object()})
    monkeypatch.setattr(whitebox, "get_dataset_profile", lambda name: {"total_rows": 5})
    monkeypatch.setattr(whitebox, "_recompute_interactive_state", lambda: {})
    monkeypatch.setattr(whitebox, "_save_workflow_state", lambda: None)

    res = whitebox.ingest_from_connector({"source_type": "REST_API", "table_name": "test_v2"})

    assert whitebox._WORKFLOW_STATE["dataset_name"] == "test_v2"
    assert res["table_name"] == "test_v2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_whitebox_connector.py -v`
Expected: the first new test FAILS (`dataset_name` is `"orders"`); the two existing tests and the second new test PASS.

- [ ] **Step 3: Write minimal implementation**

In `ingest_from_connector`, replace

```python
    _WORKFLOW_STATE["dataset_name"] = table_name
    _WORKFLOW_STATE["source_type"] = source_type
    _WORKFLOW_STATE["connection_uri"] = endpoint_or_host
    _save_workflow_state()
    _LATEST_PROFILING.clear()

    prof = get_dataset_profile(table_name)
```

with

```python
    requested_table_name = table_name
    if table_name in _UPLOADED_DATASETS:
        _WORKFLOW_STATE["dataset_name"] = table_name
    else:
        # Nothing was loaded under this name, so keep showing the dataset that really is loaded.
        table_name = str(_WORKFLOW_STATE.get("dataset_name") or "")
    _WORKFLOW_STATE["source_type"] = source_type
    _WORKFLOW_STATE["connection_uri"] = endpoint_or_host
    _save_workflow_state()
    _LATEST_PROFILING.clear()

    prof = get_dataset_profile(table_name)
```

and in the returned dict add `"requested_table_name": requested_table_name,` right after the existing `"table_name": table_name,` line.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_whitebox_connector.py tests/test_whitebox_engine.py -q`
Expected: all PASS.

- [ ] **Step 5: Commit** (check `git diff` first, same rule as Task 1)

```bash
git add services/api/app/api/whitebox.py services/api/tests/test_whitebox_connector.py
git commit -m "fix(whitebox): simulated connector keeps the real dataset name"
```

---

### Task 4: UI — refresh after a database ingest and say when the pages could not switch

**Files:**
- Modify: `services/ui/src/pages/Ingestion.jsx` (functions `handleConnectSourceAndProfile` and `ingestFromRdbms`)
- Test: `services/ui/src/pages/Ingestion.test.jsx` (append; do not touch the foreign hunks already in the file)

**Interfaces:**
- Consumes: `interactive_engine.activated` / `.reason` (Task 2) and `table_name` (Task 3); existing `handleRescanProfile`, `setQuickUploadNotice`, `setPrimaryDatasetName`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing tests**

Append to `services/ui/src/pages/Ingestion.test.jsx` (it already imports `it, expect, screen, fireEvent, act, renderPage, mockFetchByUrl` and defines `fillDbForm`):

```jsx
it("refreshes the profile after a database ingest so the pages follow the new dataset", async () => {
  await renderPage(Ingestion, "/ingestion");
  const fn = mockFetchByUrl([
    ["/pipeline/ingest/rdbms", { status: 202, body: { status: "queued", ingest_id: "R2", rows_ingested: 5, interactive_engine: { activated: true, rows: 5 } } }],
    ["/pipeline/runs/R2", { body: { state: "RUNNING" } }]
  ]);
  await fillDbForm();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "ดึงข้อมูลจากฐานข้อมูล" }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  const urls = fn.mock.calls.map(([url]) => String(url));
  expect(urls.some((u) => u.includes("/whitebox/profile"))).toBe(true);
  expect(urls.some((u) => u.includes("/whitebox/state"))).toBe(true);
});

it("tells the user when the other pages could not switch to the database dataset", async () => {
  await renderPage(Ingestion, "/ingestion");
  mockFetchByUrl([
    ["/pipeline/ingest/rdbms", { status: 202, body: { status: "queued", ingest_id: "R3", rows_ingested: 900000, interactive_engine: { activated: false, reason: "900,000 rows exceeds ACTIVE_DATASET_MAX_ROWS=500,000" } } }],
    ["/pipeline/runs/R3", { body: { state: "RUNNING" } }]
  ]);
  await fillDbForm();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "ดึงข้อมูลจากฐานข้อมูล" }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  expect(screen.getByText(/หน้า Expectations, Pipeline และ Export ยังแสดงชุดเดิม/)).toBeTruthy();
});

it("shows the dataset the demo connector really profiled, not the name that was typed", async () => {
  await renderPage(Ingestion, "/ingestion");
  mockFetchByUrl([
    ["/ingest-source", { status: 200, body: { simulated: true, table_name: "test_v2", requested_table_name: "orders", rows_ingested: null, profile: null } }]
  ]);
  fireEvent.click(screen.getByRole("tab", { name: "API" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /ดึงข้อมูล API/ }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByText(/ชุดที่โหลดไว้ 'test_v2'/)).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `C:\ETL\services\ui`): `npx vitest run src/pages/Ingestion.test.jsx`
Expected: the 3 new tests FAIL; all previously passing tests still PASS.

- [ ] **Step 3: Write minimal implementation**

In `handleConnectSourceAndProfile`, replace the demo-notice template

```jsx
          ? `โหมดสาธิต: ยังไม่ได้เชื่อมต่อ ${sourceType} จริง ระบบตรวจข้อมูลชุดที่โหลดไว้ '${cleanTbl}'${rows} แทน`
```

with

```jsx
          ? `โหมดสาธิต: ยังไม่ได้เชื่อมต่อ ${sourceType} จริง ระบบตรวจข้อมูลชุดที่โหลดไว้ '${d.table_name || cleanTbl}'${rows} แทน`
```

and, directly above `const rows = ...` inside the same `if (res.ok)` block, add:

```jsx
        if (d.table_name) setPrimaryDatasetName(d.table_name);
```

In `ingestFromRdbms`, replace the success branch

```jsx
        const rows = body?.rows_ingested == null ? "" : ` (${body.rows_ingested.toLocaleString()} แถว)`;
        setQuickUploadNotice(`ดึงข้อมูลจากตาราง '${source}'${rows} เข้าตาราง '${target}' แล้ว`);
```

with

```jsx
        const rows = body?.rows_ingested == null ? "" : ` (${body.rows_ingested.toLocaleString()} แถว)`;
        const engine = body?.interactive_engine;
        const notSwitched = engine && engine.activated === false
          ? ` · หน้า Expectations, Pipeline และ Export ยังแสดงชุดเดิม (${engine.reason})`
          : "";
        setQuickUploadNotice(`ดึงข้อมูลจากตาราง '${source}'${rows} เข้าตาราง '${target}' แล้ว${notSwitched}`);
        handleRescanProfile();
```

(`handleRescanProfile` is defined later in the component body but is only called at click time, so the ordering is fine.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/Ingestion.test.jsx`
Expected: all PASS.

- [ ] **Step 5: Commit** (`Ingestion.test.jsx` already has someone else's uncommitted hunks: run `git diff`, and commit it only if the user agrees to include them)

```bash
git add services/ui/src/pages/Ingestion.jsx services/ui/src/pages/Ingestion.test.jsx
git commit -m "feat(ui): follow the ingested dataset after a database import"
```

---

### Task 5: Docs and end-to-end verification

**Files:**
- Modify: `docs/presentation/04-user-guide-and-journey.md` (section 2.3 table and the troubleshooting row about "ตัวเลขหน้าบนกับส่วนพับ / Dashboard ไม่ตรงกัน" / "อัปโหลดไฟล์ยอดขายแล้วหน้า Expectations ยังขึ้นตัวเลขคะแนนนักศึกษา")
- No new tests.

- [ ] **Step 1: Update the guide**

In section 2.3, replace the row `หน้า Expectations / Jobs / Exports ส่วนบน` so both columns say that the pages follow the most recently imported dataset (file, database or REST API), and add one sentence: "ถ้านำเข้าชุดที่ใหญ่เกิน 500,000 แถว (`ACTIVE_DATASET_MAX_ROWS`) หน้าเหล่านี้ยังแสดงชุดเดิม และหน้า Ingestion จะแจ้งไว้ในข้อความหลังนำเข้า". In section 5, change the row "อัปโหลดไฟล์ยอดขายแล้วหน้า Expectations ยังขึ้นตัวเลขคะแนนนักศึกษา" to: cause = "API ยังรันโค้ดเก่า หรือชุดข้อมูลเกิน 500,000 แถว", fix = "restart `api` แล้วนำเข้าใหม่; ดูข้อความหลังนำเข้า".

- [ ] **Step 2: Run the full automated suites**

Run: `python -m pytest -q` (from `C:\ETL\services\api`) and `npx vitest run` (from `C:\ETL\services\ui`)
Expected: all PASS. Report any failure verbatim; do not mark the task done on a partial run.

- [ ] **Step 3: Manual smoke test against the running stack**

```bash
docker compose restart api
```

1. In Postgres (`sdoqap_oltp`) create a small table that is not student data, e.g. `CREATE TABLE test_v2 AS SELECT g AS id, (random()*80)::int AS age FROM generate_series(1,200) g;` (run with `docker exec sdoqap-postgres psql -U sdoqap -d sdoqap_oltp -c "..."`).
2. Ingestion → tab ฐานข้อมูล → host `postgres`, port `5432`, DB `sdoqap_oltp`, user `sdoqap`, password from `.env`, source table `test_v2` → ดึงข้อมูลจากฐานข้อมูล.
3. Open Expectations, Jobs & Pipelines, Workspace Exports.

Expected: header says `test_v2 · 200 แถว` and the rows/columns are `id`, `age` (not `student_id`/`course`); the Export trust-check bar names `test_v2`.
Then repeat with `ACTIVE_DATASET_MAX_ROWS=100` set for the `api` container: Ingestion shows the "ยังแสดงชุดเดิม" notice and the three pages keep the previous dataset.

- [ ] **Step 4: Commit**

```bash
git add docs/presentation/04-user-guide-and-journey.md
git commit -m "docs: interactive pages follow the latest ingested dataset"
```

---

## Out of scope (call out, do not build)

- Switching back to an earlier dataset from a selector on the pages (needs per-dataset state; only the latest dataset survives an API restart, via `working_dataset.csv`).
- Activating from machine-to-machine `/ingest/csv` calls (service-key clients) — they would overwrite the logged-in user's working dataset.
- The Stream tab and API tab in the UI still use the simulated `/whitebox/ingest-source`; wiring them to the real `/pipeline/ingest/api` is a separate change.
- Sampling very large datasets instead of skipping them.
