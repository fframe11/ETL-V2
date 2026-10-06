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
    assert c.get("/api/v1/dashboards/datasets/sales/suggestions").status_code == 401
    for path in ("generate", "refine", "render", "suggest-changes", "rank-suggestions"):
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


# whole-number columns that are nearly unique count as identifiers, so this fixture uses decimals
WEEKLY = pd.DataFrame({
    "order_date": [d.strftime("%Y-%m-%d") for d in pd.date_range("2025-01-01", periods=12, freq="7D")],
    "region": ["North", "South", "East"] * 4,
    "amount": [i * 1.5 + 10 for i in range(12)],
})


@pytest.fixture
def weekly(monkeypatch):
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: dashboard_data.prepare_frame(WEEKLY.copy()))


def suggestions(audience=None):
    query = f"?audience={audience}" if audience else ""
    return client().get(f"/api/v1/dashboards/datasets/weekly/suggestions{query}")


def test_suggestions_come_from_the_dataset_profile_and_leave_out_the_widget(weekly):
    res = suggestions()
    assert res.status_code == 200
    body = res.json()
    assert body["table_name"] == "weekly"
    assert [s["text"] for s in body["suggestions"]] == [
        "ผลรวม amount ตาม region", "แนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date",
        "สัดส่วน ผลรวม amount ตาม region", "ผลรวม amount เดือนล่าสุด เทียบช่วงก่อนหน้า"]
    assert set(body["suggestions"][0]) == {"id", "rule", "text"}


def test_suggestions_follow_the_audience_and_reject_an_unknown_one(weekly):
    assert suggestions("business").json()["suggestions"][0]["rule"] == "R2"
    assert suggestions("management").json()["suggestions"][0]["rule"] == "R4"
    assert suggestions("ceo").status_code == 400


def suggest_changes(spec, table="weekly"):
    return client().post("/api/v1/dashboards/suggest-changes", json={"table_name": table, "spec": spec})


def test_changes_are_suggested_from_what_the_dashboard_lacks(weekly):
    spec = {"title": "ยอดขาย", "widgets": [{"id": "k1", "type": "kpi", "title": "ยอดรวม", "metric": {"agg": "sum", "column": "amount"}}]}
    res = suggest_changes(spec)
    assert res.status_code == 200
    assert [(s["rule"], s["text"]) for s in res.json()["suggestions"]] == [
        ("G3", "เพิ่มแนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date"),
        ("G4", "แสดง ยอดรวม เทียบช่วงก่อนหน้า"),
        ("G1", "เพิ่มตัวกรอง region")]


def test_a_spec_that_cannot_be_drawn_is_rejected_before_any_suggestion(weekly):
    res = suggest_changes({"title": "ว่าง", "widgets": []})
    assert res.status_code == 422


def test_the_steward_audience_is_accepted_and_starts_with_a_data_health_check(weekly):
    first = suggestions("steward").json()["suggestions"][0]
    assert first["rule"] == "R8" and first["text"] == "ตรวจช่วงค่าต่ำสุดและสูงสุดของ amount"


def test_a_steward_dashboard_is_generated_from_the_data_health_rules_without_an_llm(weekly):
    res = client().post("/api/v1/dashboards/generate", json={"table_name": "weekly", "context": "ตรวจข้อมูล", "audience": "steward"})
    assert res.status_code == 200
    body = res.json()
    assert body["engine"] == "rules" and body["spec"]["audience"] == "steward"
    titles = [w["title"] for w in body["spec"]["widgets"]]
    assert titles[:2] == ["จำนวนแถว", "ต่ำสุด amount"]
    data = body["data"]["widgets"]
    assert [data[w["id"]]["value"] for w in body["spec"]["widgets"][:2]] == [12, 10.0]


def rank(audience="business", table="weekly"):
    return client().post("/api/v1/dashboards/rank-suggestions", json={"table_name": table, "audience": audience})


def test_the_ai_reorders_and_rewords_the_rule_made_suggestions(weekly, monkeypatch):
    rule_made = suggestions().json()["suggestions"]
    first, last = rule_made[0], rule_made[-1]
    llm_answers(monkeypatch, json.dumps({"suggestions": [
        {"id": last["id"], "text": last["text"]}, {"id": first["id"], "text": f"ช่วยทำ {first['text']}"}]}, ensure_ascii=False))
    res = rank()
    assert res.status_code == 200
    body = res.json()
    assert body["engine"] == "groq" and body["model"] == "openai/gpt-oss-120b"
    assert [(s["id"], s["rule"]) for s in body["suggestions"]] == [(last["id"], last["rule"]), (first["id"], first["rule"])]
    assert body["suggestions"][1]["text"] == f"ช่วยทำ {first['text']}"
    assert all(set(s) == {"id", "rule", "text"} for s in body["suggestions"])


def test_ranking_without_a_groq_key_is_a_clear_503_and_the_rule_list_is_untouched(weekly):
    res = rank()
    assert res.status_code == 503 and "ยังไม่ได้ตั้งค่า Groq API key" in res.json()["detail"]
    assert suggestions().status_code == 200


def test_an_unusable_ai_answer_is_a_422(weekly, monkeypatch):
    llm_answers(monkeypatch, json.dumps({"suggestions": [{"id": "R9:invented", "text": "x"}]}))
    res = rank()
    assert res.status_code == 422 and "AI ตอบคำแนะนำที่ใช้ไม่ได้" in res.json()["detail"]


def test_ranking_follows_the_audience_and_rejects_an_unknown_one(weekly, monkeypatch):
    seen = []
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))

    def answer(messages, key, model):
        payload = json.loads(messages[1]["content"])
        seen.append(payload["audience"])
        return json.dumps({"suggestions": [{"id": payload["candidates"][0]["id"], "text": payload["candidates"][0]["text"]}]})
    monkeypatch.setattr(dashboard_llm, "call_groq", answer)
    assert rank("steward").status_code == 200 and seen == ["steward"]
    assert rank("ceo").status_code == 400
