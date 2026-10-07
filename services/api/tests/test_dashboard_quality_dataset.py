import os
import sys

import pandas as pd
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_llm, dashboards  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

Q = dashboard_data.QUALITY_DATASET
RUNS = [
    {"run_id": "r1", "table_name": "sales", "timestamp": "2026-10-01T01:00:00+00:00", "total_records": 100,
     "clean_records": 95, "quarantined_records": 5, "quality_score": 95.0, "effective_quality_threshold": 90.0,
     "duration_seconds": 12.5, "freshness_lag_hours": 0.0, "quarantined_financial_value": 10.0,
     "operational_impact_score": 0.2, "is_anomaly": False, "rules_mode": "static", "remediation_logs": ["x"],
     "stage_seconds": {"load": 1.0}},
    {"run_id": "r2", "table_name": "students", "timestamp": "2026-10-02T01:00:00+00:00", "total_records": 50,
     "clean_records": 40, "quarantined_records": 10, "quality_score": 80.0, "effective_quality_threshold": 90.0,
     "is_anomaly": True, "rules_mode": "adaptive"},
    {"run_id": "r3", "table_name": "sales", "timestamp": "2026-10-03T01:00:00+00:00", "total_records": 120,
     "clean_records": 119, "quarantined_records": 1, "quality_score": 99.2},
]


@pytest.fixture(autouse=True)
def empty_caches():
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()
    yield
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    for run in RUNS:
        fake.index(dashboard_data.QUALITY_INDEX, run["run_id"], run)
    monkeypatch.setattr(dashboard_data, "get_es_client", lambda: fake)
    return fake


def test_one_row_per_quality_run_with_flat_fields_and_the_gate_result(es):
    df = dashboard_data._read_quality_runs()
    assert list(df.columns) == list(dashboard_data.QUALITY_COLUMNS) + ["gate_result"]
    assert len(df) == 3
    by_table = df.set_index("timestamp")["gate_result"].to_dict()
    assert by_table["2026-10-01T01:00:00+00:00"] == "ผ่าน"
    assert by_table["2026-10-02T01:00:00+00:00"] == "ไม่ผ่าน"
    assert pd.isna(by_table["2026-10-03T01:00:00+00:00"])  # no threshold recorded: empty, not "ไม่ผ่าน"


def test_the_quality_dataset_loads_like_any_table(es):
    df, profile = dashboard_data.load_active_dataset(Q)
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    assert kinds["timestamp"] == "date" and kinds["table_name"] == "categorical"
    assert kinds["quality_score"] == "numeric" and kinds["quarantined_records"] == "numeric"
    assert kinds["gate_result"] == "categorical"
    for nested in ("remediation_logs", "stage_seconds", "run_id"):
        assert nested not in kinds
    assert profile["rows"] == 3


def test_no_quality_runs_yet_is_a_clear_404(monkeypatch):
    monkeypatch.setattr(dashboard_data, "get_es_client", FakeES)
    with pytest.raises(HTTPException) as exc:
        dashboard_data._read_quality_runs()
    assert exc.value.status_code == 404


def test_catalog_entry_only_exists_once_there_are_runs(es):
    assert dashboard_data.quality_dataset_entry(None) is None
    assert dashboard_data.quality_dataset_entry(FakeES()) is None
    entry = dashboard_data.quality_dataset_entry(es)
    assert entry["name"] == Q and entry["source"] == "Quality Gate (Elasticsearch)"
    assert entry["records"] == 3 and entry["columns"] == len(dashboard_data.QUALITY_COLUMNS) + 1
    assert entry["last_updated"] == "2026-10-03T01:00:00Z" and entry["error"] is None


def client():
    app = FastAPI()
    app.include_router(dashboards.router)
    return TestClient(app, cookies={SESSION_COOKIE_NAME: create_session_token("tester")})


def test_the_dataset_list_puts_quality_runs_first(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: es)
    monkeypatch.setattr(dashboard_data, "list_datasets", lambda e: [{"name": "sales"}])
    names = [d["name"] for d in client().get("/api/v1/dashboards/datasets").json()["datasets"]]
    assert names == [Q, "sales"]


def test_a_data_quality_dashboard_can_be_generated_and_computed(es, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: es)  # no semantic layer stored: the name rules apply
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": Q, "context": "สร้าง Dashboard สำหรับติดตาม Data Quality", "audience": "management"}).json()
    assert body["engine"] == "rules"
    columns_used = {w.get("x") for w in body["spec"]["widgets"]} | {w.get("metric", {}).get("column") for w in body["spec"]["widgets"]}
    assert "timestamp" in columns_used
    assert all("error" not in data for data in body["data"]["widgets"].values())
