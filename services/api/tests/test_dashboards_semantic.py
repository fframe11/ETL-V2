"""Every /api/v1/dashboards route reads the semantic view: hidden personal columns never reach a
widget, a filter, a table, a suggestion or an AI prompt, and approved metrics and units are used."""
import json
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

from app.api import dashboard_data, dashboard_llm, dashboards, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

DF, PROFILE = dashboard_data.prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.5, 49.5, 150.0], "Profit": [10.0, 50.5, 4.5, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]}))
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent", "higher_is_better": True}
SALES_TOTAL = {"id": "sales_total", "label": "ยอดขายรวม", "type": "simple",
               "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "currency", "currency": "USD"}
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
KPI = {"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"}}
NAMES = {"id": "names", "type": "bar", "title": "ตามชื่อลูกค้า", "x": "Customer_Name", "metric": {"agg": "count", "column": None}}


def store(es, metrics):
    doc = {"table_name": "sales", "draft": None, "history": [],
           "approved": {"columns": {"Total_Sales": USD}, "metrics": metrics, "version": 1}}
    es.index(semantic.SEMANTIC_INDEX, "sales", semantic.encode_doc(doc))


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    store(fake, [GROSS, SALES_TOTAL])
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: fake)
    monkeypatch.setattr(dashboards, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client():
    app = FastAPI()
    app.include_router(dashboards.router)
    return TestClient(app, cookies={SESSION_COOKIE_NAME: create_session_token("tester")})


def render(spec):
    return client().post("/api/v1/dashboards/render", json={"table_name": "sales", "spec": spec}).json()


def capture_groq(monkeypatch, answer):
    sent = []

    def fake_groq(messages, key, model):
        sent.append(messages)
        return answer

    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", fake_groq)
    return sent


def test_rule_dashboards_lead_with_approved_metrics_and_skip_personal_columns(es):
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": "sales", "context": "ภาพรวมยอดขาย", "audience": "management"}).json()
    first = body["spec"]["widgets"][0]
    assert first["metric"] == {"metric_id": "gross_margin"} and first["format"] == "percent"
    assert body["data"]["widgets"][first["id"]]["value"] == pytest.approx(22.0)
    assert "Customer_Name" not in json.dumps(body["spec"], ensure_ascii=False)


def test_the_llm_sees_metrics_and_labels_but_not_personal_columns(es, monkeypatch):
    sent = capture_groq(monkeypatch, json.dumps({"title": "ยอดขาย", "widgets": [KPI]}))
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": "sales", "context": "ภาพรวมยอดขาย", "audience": "business"}).json()
    user = sent[0][1]["content"]
    assert "Customer_Name" not in user and "Ann" not in user
    assert "gross_margin" in user and "ยอดขาย" in user and "identifier" in user
    assert "metric_id" in sent[0][0]["content"]
    assert body["engine"] == "groq" and body["data"]["widgets"]["k"]["value"] == pytest.approx(22.0)


def test_the_refine_prompt_has_no_personal_column(es, monkeypatch):
    sent = capture_groq(monkeypatch, json.dumps({"title": "ยอดขาย", "widgets": [KPI]}))
    res = client().post("/api/v1/dashboards/refine",
                        json={"table_name": "sales", "spec": {"widgets": [KPI, NAMES]}, "instruction": "เพิ่มกราฟ"})
    assert res.status_code == 200
    assert "Customer_Name" not in json.dumps(sent[0], ensure_ascii=False)


def test_a_saved_widget_on_a_personal_column_is_dropped_with_a_note(es):
    body = render({"widgets": [KPI, NAMES]})
    assert [w["id"] for w in body["spec"]["widgets"]] == ["k"]
    assert any("Customer_Name" in w for w in body["warnings"])


def test_saved_dashboards_follow_the_current_metric_definition(es):
    assert render({"widgets": [KPI]})["data"]["widgets"]["k"]["value"] == pytest.approx(22.0)
    store(es, [dict(GROSS, denominator={"agg": "count", "column": None})])
    assert render({"widgets": [KPI]})["data"]["widgets"]["k"]["value"] == pytest.approx(2750.0)


def test_a_dashboard_is_saved_without_its_personal_widgets(es):
    body = {"name": "ยอดขาย", "table_name": "sales", "spec": {"widgets": [KPI, NAMES]}}
    saved = client().post("/api/v1/dashboards/saved", json=body).json()
    assert [w["id"] for w in saved["spec"]["widgets"]] == ["k"]
    assert "Customer_Name" not in json.dumps(es.docs[dashboards.DASHBOARDS_INDEX], ensure_ascii=False)


def test_without_elasticsearch_personal_columns_stay_hidden(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)
    body = render({"widgets": [{"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}, NAMES]})
    assert [w["id"] for w in body["spec"]["widgets"]] == ["c"]


def test_money_columns_render_in_their_currency(es):
    body = render({"widgets": [{"id": "s", "type": "kpi", "metric": {"agg": "sum", "column": "Total_Sales"}}]})
    (kpi,) = body["spec"]["widgets"]
    assert (kpi["format"], kpi["currency"]) == ("currency", "USD")
    assert body["data"]["column_labels"]["Total_Sales"] == "ยอดขาย"


def test_suggestions_leave_out_personal_and_identifier_columns(es):
    body = client().get("/api/v1/dashboards/datasets/sales/suggestions").json()
    assert [s["text"] for s in body["suggestions"]] == [
        "ผลรวม Total_Sales ตาม Region", "สัดส่วน ผลรวม Total_Sales ตาม Region"]


def test_gap_suggestions_know_the_metric_cards(es):
    spec = {"widgets": [{"id": "k", "type": "kpi", "metric": {"metric_id": "sales_total"}}]}
    body = client().post("/api/v1/dashboards/suggest-changes", json={"table_name": "sales", "spec": spec}).json()
    texts = [s["text"] for s in body["suggestions"]]
    assert texts == ["เพิ่มตัวกรอง Region", "เพิ่ม KPI ผลรวม Profit"]


def test_the_ranking_prompt_has_no_personal_column(es, monkeypatch):
    rule_made = client().get("/api/v1/dashboards/datasets/sales/suggestions").json()["suggestions"]
    sent = capture_groq(monkeypatch, json.dumps({"suggestions": [{"id": rule_made[0]["id"], "text": rule_made[0]["text"]}]}))
    res = client().post("/api/v1/dashboards/rank-suggestions", json={"table_name": "sales", "audience": "business"})
    assert res.status_code == 200
    prompt = json.dumps(sent[0], ensure_ascii=False)
    assert "Customer_Name" not in prompt and "Ann" not in prompt


def test_the_preview_still_shows_every_column_so_the_user_can_review_it(es):
    body = client().get("/api/v1/dashboards/datasets/sales/preview").json()
    assert "Customer_Name" in [c["name"] for c in body["profile"]["columns"]]


@pytest.mark.parametrize("stored", [
    {"table_name": "sales", "approved": {"version": 1, "content_json": "{not json"}},
    {"table_name": "sales", "approved": {"version": 1, "content_json": json.dumps({"columns": [1], "metrics": "x"})}},
    {"table_name": "sales", "approved": {"version": 1}},
    {"table_name": "sales", "history": "oops", "draft": {"content_json": json.dumps(["not", "a", "dict"])}},
])
def test_a_corrupt_semantic_document_never_turns_a_route_into_a_500(es, stored):
    es.index(semantic.SEMANTIC_INDEX, "sales", stored)
    count = {"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}
    body = client().post("/api/v1/dashboards/render", json={"table_name": "sales", "spec": {"widgets": [count, NAMES]}})
    assert body.status_code == 200
    assert [w["id"] for w in body.json()["spec"]["widgets"]] == ["c"]
    assert client().get("/api/v1/dashboards/datasets/sales/suggestions").status_code == 200
