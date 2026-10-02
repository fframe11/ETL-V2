import json
import os
import sys

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_llm, dashboards  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402

RAW = pd.DataFrame({
    "order_date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28", "2025-03-10", "2025-03-11"],
    "region": ["North", "South", "North", "East", "South", None],
    "amount": [100.0, 200.0, 50.0, 80.0, 40.0, 30.0],
})
DF, PROFILE = dashboard_data.prepare_frame(RAW.copy())
SUM = {"agg": "sum", "column": "amount"}
SPEC = {"title": "ยอดขาย", "filters": [{"column": "region"}], "widgets": [
    {"id": "total", "type": "kpi", "title": "ยอดขายรวม", "metric": SUM},
    {"id": "by_region", "type": "bar", "title": "ตามภูมิภาค", "x": "region", "metric": SUM}]}


def client(logged_in=True):
    app = FastAPI()
    app.include_router(dashboards.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


@pytest.fixture(autouse=True)
def dataset(monkeypatch):
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))


def llm_answers(monkeypatch, *answers):
    queue = list(answers)
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", lambda messages, key, model: queue.pop(0))


def test_every_route_needs_a_login():
    c = client(logged_in=False)
    assert c.get("/api/v1/dashboards/datasets").status_code == 401
    assert c.get("/api/v1/dashboards/datasets/sales/preview").status_code == 401
    for path in ("generate", "refine", "render"):
        assert c.post(f"/api/v1/dashboards/{path}", json={}).status_code == 401


def test_datasets_lists_the_catalog(monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)
    monkeypatch.setattr(dashboard_data, "list_datasets", lambda es: [{"name": "sales"}])
    res = client().get("/api/v1/dashboards/datasets")
    assert res.status_code == 200 and res.json() == {"datasets": [{"name": "sales"}]}


def test_preview_returns_profile_and_sample():
    body = client().get("/api/v1/dashboards/datasets/sales/preview").json()
    assert body["profile"]["rows"] == 6 and len(body["sample"]) == 6


def test_generate_without_a_key_still_returns_a_computed_dashboard():
    res = client().post("/api/v1/dashboards/generate",
                        json={"table_name": "sales", "context": "ยอดขายรายเดือน", "audience": "management"})
    body = res.json()
    assert res.status_code == 200 and body["engine"] == "rules"
    assert body["spec"]["audience"] == "management"
    assert set(body["data"]["widgets"]) == {w["id"] for w in body["spec"]["widgets"]}
    assert "Groq API key" in body["warnings"][0]


def test_generate_with_the_llm_computes_its_spec(monkeypatch):
    llm_answers(monkeypatch, json.dumps(SPEC, ensure_ascii=False))
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": "sales", "context": "ยอดขาย", "audience": "business"}).json()
    assert body["engine"] == "groq" and body["model"] == "openai/gpt-oss-120b"
    assert body["data"]["widgets"]["total"]["value"] == 500.0


def test_generate_checks_its_input():
    c = client()
    assert c.post("/api/v1/dashboards/generate", json={"table_name": "sales", "context": "ยอดขาย", "audience": "ceo"}).status_code == 400
    assert c.post("/api/v1/dashboards/generate", json={"table_name": "sales", "context": "a"}).status_code == 422


def test_render_applies_the_viewer_selections():
    body = client().post("/api/v1/dashboards/render", json={
        "table_name": "sales", "spec": SPEC, "selections": {"region": {"values": ["North"]}}}).json()
    assert body["data"]["widgets"]["total"]["value"] == 150.0
    assert body["data"]["rows_after_filter"] == 2
    assert body["spec"]["widgets"][0]["layout"] == {"x": 0, "y": 0, "w": 3, "h": 2}


def test_render_rejects_a_spec_with_nothing_to_draw():
    res = client().post("/api/v1/dashboards/render", json={"table_name": "sales", "spec": {"widgets": []}})
    assert res.status_code == 422 and "ไม่มีวิดเจ็ต" in res.json()["detail"]


def test_refine_without_a_key_is_unavailable():
    res = client().post("/api/v1/dashboards/refine", json={"table_name": "sales", "spec": SPEC, "instruction": "เพิ่มกราฟ"})
    assert res.status_code == 503 and "Groq API key" in res.json()["detail"]


def test_refine_returns_the_new_spec_its_changes_and_numbers(monkeypatch):
    refined = dict(SPEC, widgets=SPEC["widgets"] + [
        {"id": "trend", "type": "line", "title": "ยอดขายรายเดือน", "x": "order_date", "metric": SUM}])
    llm_answers(monkeypatch, json.dumps(refined, ensure_ascii=False))
    body = client().post("/api/v1/dashboards/refine",
                         json={"table_name": "sales", "spec": SPEC, "instruction": "เพิ่มกราฟยอดขายรายเดือน"}).json()
    assert body["changes"]["added"] == ["ยอดขายรายเดือน"]
    assert body["data"]["widgets"]["trend"]["rows"][0] == {"x": "2025-01-01", "value": 300.0}


def test_refine_reports_an_unusable_llm_answer(monkeypatch):
    llm_answers(monkeypatch, "{}", "{}")
    res = client().post("/api/v1/dashboards/refine", json={"table_name": "sales", "spec": SPEC, "instruction": "เพิ่มกราฟ"})
    assert res.status_code == 422 and res.json()["detail"].startswith("AI ตอบสเปกที่ใช้ไม่ได้")
