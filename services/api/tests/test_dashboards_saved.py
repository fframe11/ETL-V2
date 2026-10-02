import os
import sys

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboards  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

DF, PROFILE = dashboard_data.prepare_frame(pd.DataFrame({
    "region": ["North", "South"], "amount": [100.0, 200.0]}))
SUM = {"agg": "sum", "column": "amount"}
SPEC = {"title": "ยอดขาย", "filters": [{"column": "region"}], "widgets": [
    {"id": "total", "type": "kpi", "title": "ยอดขายรวม", "metric": SUM},
    {"id": "by_region", "type": "bar", "title": "ตามภูมิภาค", "x": "region", "metric": SUM}]}
BODY = {"name": "ยอดขายผู้บริหาร", "description": "ภาพรวมรายเดือน", "table_name": "sales",
        "context": "ยอดขายรายเดือน", "audience": "management", "spec": SPEC, "refinements": ["เพิ่ม Filter จังหวัด"]}
BASE = "/api/v1/dashboards/saved"


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    monkeypatch.setattr(dashboards, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    return fake


def client(logged_in=True):
    app = FastAPI()
    app.include_router(dashboards.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


def test_saved_routes_need_a_login(es):
    c = client(logged_in=False)
    assert c.get(BASE).status_code == 401
    assert c.post(BASE, json=BODY).status_code == 401


def test_save_then_open_returns_the_validated_spec_and_the_request(es):
    c = client()
    saved = c.post(BASE, json=BODY).json()
    assert len(saved["id"]) == 32 and saved["created_by"] == "tester"
    assert [w["id"] for w in saved["spec"]["widgets"]] == ["total", "by_region"]
    assert saved["spec"]["widgets"][1]["layout"] == {"x": 3, "y": 0, "w": 6, "h": 4}
    opened = c.get(f"{BASE}/{saved['id']}").json()
    assert opened == saved
    assert opened["context"] == "ยอดขายรายเดือน" and opened["refinements"] == ["เพิ่ม Filter จังหวัด"]
    assert "spec_json" not in opened


def test_the_list_is_empty_before_anything_is_saved_and_shows_summaries_after(es):
    c = client()
    assert c.get(BASE).json() == {"dashboards": []}
    saved = c.post(BASE, json=BODY).json()
    (item,) = c.get(BASE).json()["dashboards"]
    assert item["id"] == saved["id"] and item["name"] == "ยอดขายผู้บริหาร"
    assert item["widget_count"] == 2 and item["table_name"] == "sales"
    assert "spec" not in item and "spec_json" not in item


def test_update_keeps_who_created_it_and_when(es):
    c = client()
    saved = c.post(BASE, json=BODY).json()
    updated = c.put(f"{BASE}/{saved['id']}", json=dict(BODY, name="ยอดขาย Q4")).json()
    assert updated["name"] == "ยอดขาย Q4" and updated["id"] == saved["id"]
    assert updated["created_at"] == saved["created_at"] and updated["created_by"] == "tester"
    assert updated["updated_at"] >= saved["updated_at"]


def test_delete_removes_it(es):
    c = client()
    saved = c.post(BASE, json=BODY).json()
    assert c.delete(f"{BASE}/{saved['id']}").json() == {"status": "deleted", "id": saved["id"]}
    assert c.get(f"{BASE}/{saved['id']}").status_code == 404


def test_unknown_and_malformed_ids_are_not_found(es):
    c = client()
    c.post(BASE, json=BODY)
    assert c.get(f"{BASE}/{'0' * 32}").status_code == 404
    assert c.get(f"{BASE}/not-an-id").status_code == 404
    assert c.delete(f"{BASE}/{'0' * 32}").status_code == 404


def test_an_invalid_spec_is_not_saved(es):
    res = client().post(BASE, json=dict(BODY, spec={"widgets": []}))
    assert res.status_code == 422
    assert es.docs.get(dashboards.DASHBOARDS_INDEX, {}) == {}


def test_open_before_anything_is_saved_is_not_found(es):
    assert client().get(f"{BASE}/{'a' * 32}").status_code == 404
