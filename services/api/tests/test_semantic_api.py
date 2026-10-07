import json
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

from app.api import dashboard_data, dashboard_llm, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

RAW = pd.DataFrame({"Order_ID": ["A", "B", "C"], "Customer_Name": ["x", "y", "z"], "Region": ["N", "S", "N"],
                    "Total_Sales": [10.0, 20.0, 30.0], "Profit": [1.0, 2.0, 3.0]})
DF, PROFILE = dashboard_data.prepare_frame(RAW.copy())
BASE = "/api/v1/semantic/sales"
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "usd", "default_agg": "sum", "pii": False}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent"}
BODY = {"columns": {"Total_Sales": USD}, "metrics": [GROSS]}


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    monkeypatch.setattr(semantic, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client(logged_in=True):
    app = FastAPI()
    app.include_router(semantic.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


def test_every_route_needs_a_login(es):
    c = client(logged_in=False)
    assert c.get(BASE).status_code == 401
    assert c.post(f"{BASE}/draft").status_code == 401
    assert c.put(f"{BASE}/draft", json=BODY).status_code == 401
    assert c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}).status_code == 401


def test_first_look_is_the_rule_guess_with_current_values(es):
    view = client().get(BASE).json()
    assert view["status"] == "none" and view["version"] == 0
    assert view["hidden_columns"] == ["Customer_Name"]
    assert view["effective"]["columns"]["Order_ID"]["role"] == "identifier"
    assert view["metric_values"] == {"row_count": 3, "total_total_sales": 60.0, "total_profit": 6.0}


def test_ai_draft_without_a_key_saves_the_rule_draft(es):
    view = client().post(f"{BASE}/draft").json()
    assert view["engine"] == "rules" and view["status"] == "draft"
    assert view["warnings"][0].startswith("ใช้ร่างแบบกฎแทน AI")
    stored = es.docs[semantic.SEMANTIC_INDEX]["sales"]["draft"]
    assert isinstance(stored["content_json"], str) and "columns" not in stored
    assert client().get(BASE).json()["status"] == "draft"


def test_ai_draft_with_groq(es, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", lambda messages, key, model: json.dumps(BODY, ensure_ascii=False))
    view = client().post(f"{BASE}/draft").json()
    assert view["engine"] == "groq" and view["model"] == "openai/gpt-oss-120b"
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert view["metric_values"]["gross_margin"] == 10.0
    assert view["hidden_columns"] == ["Customer_Name"]


def test_saving_edits_as_a_draft(es):
    body = {"columns": {"Profit": {"role": "measure", "unit": "dollars"}}, "metrics": []}
    view = client().put(f"{BASE}/draft", json=body).json()
    assert view["draft"]["generated_by"] == "user" and view["draft"]["updated_by"] == "tester"
    assert any("dollars" in w for w in view["warnings"])
    assert set(view["draft"]["columns"]) == {c["name"] for c in PROFILE["columns"]}


def test_approval_versions_clears_the_draft_and_refuses_a_stale_base(es):
    c = client()
    c.put(f"{BASE}/draft", json=BODY)
    first = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}).json()
    assert first["status"] == "approved" and first["version"] == 1 and first["draft"] is None
    assert first["approved"]["approved_by"] == "tester" and len(first["history"]) == 1
    assert set(first["approved"]["columns"]) == {c["name"] for c in PROFILE["columns"]}
    assert first["metric_values"]["gross_margin"] == 10.0
    stale = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    assert stale.status_code == 409 and "โหลดใหม่" in stale.json()["detail"]
    second = c.post(f"{BASE}/approve", json={**BODY, "base_version": 1}).json()
    assert second["version"] == 2 and len(second["history"]) == 2


def test_a_new_column_makes_the_approval_outdated(es, monkeypatch):
    client().post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    df, profile = dashboard_data.prepare_frame(RAW.assign(Coupon=["a", "b", "c"]))
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (df, profile))
    view = client().get(BASE).json()
    assert view["status"] == "approved_outdated" and view["drift"]["new_columns"] == ["Coupon"]


def test_without_elasticsearch_reading_still_hides_personal_columns_and_writing_is_refused(es, monkeypatch):
    def offline():
        raise HTTPException(status_code=503, detail="Elasticsearch service is offline")

    monkeypatch.setattr(semantic, "get_es_client", offline)
    view = client().get(BASE).json()
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]
    assert client().put(f"{BASE}/draft", json=BODY).status_code == 503


def test_unknown_dataset_is_404(es, monkeypatch):
    def missing(name):
        raise HTTPException(status_code=404, detail="Delta log not found")

    monkeypatch.setattr(dashboard_data, "load_active_dataset", missing)
    assert client().get(BASE).status_code == 404


def test_a_failing_read_counts_as_unavailable_and_still_hides():
    class Broken(FakeES):
        def search(self, *args, **kwargs):
            raise ConnectionError("es down")

    broken = Broken()
    broken.index(semantic.SEMANTIC_INDEX, "sales", {"table_name": "sales"})
    view = semantic.load_view("sales", PROFILE, broken)
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]
