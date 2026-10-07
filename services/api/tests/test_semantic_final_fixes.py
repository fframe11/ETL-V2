"""Final review fixes of the semantic layer: editing view (C1), non-finite where values (I1),
unreadable stored documents and stored-only personal flags (I2, I6), code-like columns (I4),
the LLM percent format (I5), history cap (I6) and the metric id pattern."""
import json
import math
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
from app.api import semantic_layer as sl  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from app.api.dashboard_spec import validate_spec  # noqa: E402
from fakes import FakeES  # noqa: E402

NICK_VALUES = ["Nickval_A", "Nickval_B", "Nickval_C", "Nickval_D"]
DF, PROFILE = dashboard_data.prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Region": ["N", "S", "N", "E"], "Nick": NICK_VALUES,
    "Total_Sales": [100.0, 200.5, 49.5, 150.0], "Profit": [10.0, 50.5, 4.5, 45.0],
    "Conversion": [10.0, 20.0, 30.0, 40.0]}))
SALES_BASE = "/api/v1/semantic/sales"
DASH_BASE = "/api/v1/dashboards"
COUNT = {"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}
NICK_TABLE = {"id": "t", "type": "table", "title": "รายการ", "columns": ["Nick", "Region"]}


def meta(**fields):
    base = {"role": "dimension", "label": "", "description": "", "unit": None, "currency": None,
            "duration_unit": None, "default_agg": None, "pii": False}
    return {**base, **fields}


def money(currency):
    return meta(role="measure", label="ยอดขาย", unit="currency", currency=currency, default_agg="sum")


def stored(es, approved=None, draft=None):
    """A semantic document as the API stores it: parts carry their columns and metrics in content_json."""
    doc = {"table_name": "sales", "history": [],
           "approved": None if approved is None else {"metrics": [], "version": 1, **approved},
           "draft": None if draft is None else {"metrics": [], **draft}}
    es.index(semantic.SEMANTIC_INDEX, "sales", semantic.encode_doc(doc))


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    monkeypatch.setattr(semantic, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: fake)
    monkeypatch.setattr(dashboards, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client():
    app = FastAPI()
    app.include_router(semantic.router)
    app.include_router(dashboards.router)
    return TestClient(app, cookies={SESSION_COOKIE_NAME: create_session_token("tester")})


def render(spec):
    return client().post(f"{DASH_BASE}/render", json={"table_name": "sales", "spec": spec})


def capture_groq(monkeypatch, *answers):
    """Every prompt sent to Groq; call n gets answers[n] (the last answer repeats)."""
    sent = []

    def fake_groq(messages, key, model):
        sent.append(messages)
        return answers[min(len(sent), len(answers)) - 1]

    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", fake_groq)
    return sent


# ---- C1: the editor shows the saved draft over an approved version ----

def test_a_saved_draft_over_an_approved_version_is_what_the_editor_gets(es):
    c = client()
    first = c.post(f"{SALES_BASE}/approve", json={"columns": {"Total_Sales": money("THB")}, "metrics": [], "base_version": 0})
    assert first.json()["effective"]["columns"]["Total_Sales"]["currency"] == "THB"
    view = c.put(f"{SALES_BASE}/draft", json={"columns": {"Total_Sales": money("usd")}, "metrics": []}).json()
    assert view["status"] == "approved" and view["pending_draft"] is True
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "THB"
    assert view["editing"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert set(view["editing"]["columns"]) == {c["name"] for c in PROFILE["columns"]}
    assert client().get(SALES_BASE).json()["editing"]["columns"]["Total_Sales"]["currency"] == "USD"


def test_editing_metrics_are_the_drafts_and_carry_their_values(es):
    c = client()
    total = {"id": "sales_total", "label": "ยอดรวม", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"}}
    c.post(f"{SALES_BASE}/approve", json={"columns": {}, "metrics": [total], "base_version": 0})
    draft_total = {**total, "label": "ยอดรวมใหม่", "measure": {"agg": "avg", "column": "Total_Sales"}}
    view = c.put(f"{SALES_BASE}/draft", json={"columns": {}, "metrics": [draft_total]}).json()
    assert [m["label"] for m in view["effective"]["metrics"]] == ["ยอดรวม"]
    assert [m["label"] for m in view["editing"]["metrics"]] == ["ยอดรวมใหม่"]
    assert view["metric_values"]["sales_total"] == pytest.approx(500.0)
    assert view["editing"]["metric_values"]["sales_total"] == pytest.approx(125.0)


def test_without_a_draft_editing_is_the_effective_meaning(es):
    view = client().get(SALES_BASE).json()
    assert view["editing"]["columns"] == view["effective"]["columns"]
    assert view["editing"]["metrics"] == view["effective"]["metrics"]
    assert view["editing"]["metric_values"] == view["metric_values"]


def test_a_draft_that_leaves_a_column_out_keeps_the_effective_meaning_for_it():
    draft = {"columns": {"Total_Sales": money("USD")}}
    view = sl.resolve("sales", {"approved": {"columns": {"Region": meta()}, "metrics": [], "version": 1}, "draft": draft}, PROFILE)
    assert view["editing"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert view["editing"]["columns"]["Profit"] == view["effective"]["columns"]["Profit"]


# ---- I1: a where value must be a finite number or a short string ----

def where_metric(op, value, column="Total_Sales"):
    return {"label": "นับ", "type": "simple", "measure": {"agg": "count", "column": None,
                                                             "where": {"column": column, "op": op, "value": value}}}


@pytest.mark.parametrize("op,value", [("gt", math.inf), ("lte", -math.inf), ("gt", math.nan)])
def test_a_non_finite_comparison_value_drops_the_metric(op, value):
    cleaned, warnings = sl.validate_semantic({"columns": {}, "metrics": [where_metric(op, value)]}, PROFILE)
    assert cleaned["metrics"] == [] and any("ตัด metric" in w for w in warnings)


@pytest.mark.parametrize("value", [math.inf, math.nan, 10 ** 400, "x" * 201])
def test_equality_values_must_be_finite_and_short(value):
    for op in ("eq", "ne"):
        cleaned, warnings = sl.validate_semantic({"columns": {}, "metrics": [where_metric(op, value, "Region")]}, PROFILE)
        assert cleaned["metrics"] == [] and warnings
    cleaned, _ = sl.validate_semantic({"columns": {}, "metrics": [where_metric("in", ["N", value], "Region")]}, PROFILE)
    assert cleaned["metrics"] == []


def test_ordinary_where_values_are_kept():
    for op, value, column in (("eq", "N", "Region"), ("gt", 5, "Total_Sales"), ("gte", 5.5, "Total_Sales"),
                              ("eq", "x" * 200, "Region"), ("in", ["N", 2, True], "Region")):
        cleaned, _ = sl.validate_semantic({"columns": {}, "metrics": [where_metric(op, value, column)]}, PROFILE)
        assert len(cleaned["metrics"]) == 1, (op, value)


@pytest.mark.parametrize("literal", ["1e999", "NaN", "Infinity"])
def test_a_stored_draft_never_makes_the_semantic_read_a_500(es, literal):
    body = ('{"columns": {}, "metrics": [{"label": "นับ", "type": "simple", "measure": {"agg": "count", "column": null, '
            '"where": {"column": "Total_Sales", "op": "gt", "value": %s}}}]}' % literal)
    put = client().put(f"{SALES_BASE}/draft", content=body, headers={"Content-Type": "application/json"})
    assert put.status_code in (200, 422)
    if put.status_code == 200:
        assert put.json()["editing"]["metrics"] == []
        assert any("ตัด metric" in w for w in put.json()["warnings"])
    assert client().get(SALES_BASE).status_code == 200


def test_a_stored_non_finite_where_value_is_dropped_on_read(es):
    bad = where_metric("gt", math.inf)
    es.index(semantic.SEMANTIC_INDEX, "sales", {"table_name": "sales", "history": [], "draft": None,
             "approved": {"version": 1, "content_json": json.dumps({"columns": {}, "metrics": [{**bad, "id": "bad"}]})}})
    res = client().get(SALES_BASE)
    assert res.status_code == 200 and res.json()["effective"]["metrics"] == []


# ---- metric id pattern ----

@pytest.mark.parametrize("given", ["abc\n", "abc\n\n"])
def test_a_metric_id_with_a_trailing_newline_is_replaced(given):
    metric, problem = sl.clean_metric({**where_metric("eq", "N", "Region"), "id": given}, {c["name"]: c for c in PROFILE["columns"]}, set())
    assert problem is None and metric["id"] == "metric"


# ---- I4: code, no, key and sku are identifiers only when the column is not categorical ----

def col(name, kind, **extra):
    return {"name": name, "kind": kind, "distinct": 10, "missing_pct": 0.0, **extra}


def test_a_categorical_code_column_stays_a_dimension():
    assert sl.rule_column(col("Country_Code", "categorical"))["role"] == "dimension"
    assert sl.rule_column(col("Sales_Key", "categorical"))["role"] == "dimension"


@pytest.mark.parametrize("column", [col("Invoice_No", "numeric", min=1, max=999), col("Order_Code", "text"),
                                    col("Part_SKU", "text"), col("Account_Key", "numeric", min=1, max=9),
                                    col("Order_ID", "text"), col("id", "numeric", min=1, max=9), col("Region_ID", "categorical"),
                                    col("Row_UUID", "text")])
def test_real_identifiers_stay_identifiers(column):
    assert sl.rule_column(column)["role"] == "identifier"


def test_an_existing_chart_on_a_categorical_code_column_is_kept():
    df, raw = dashboard_data.prepare_frame(pd.DataFrame({"Country_Code": ["TH", "US", "TH", "JP"], "Total_Sales": [1.0, 2.0, 3.0, 4.0]}))
    assert next(c for c in raw["columns"] if c["name"] == "Country_Code")["kind"] == "categorical"
    profile = sl.apply_to_profile(raw, sl.resolve("sales", None, raw))
    bar = {"id": "b", "type": "bar", "title": "ตามประเทศ", "x": "Country_Code", "metric": {"agg": "sum", "column": "Total_Sales"}}
    spec, warnings = validate_spec({"widgets": [bar]}, profile, [])
    assert [w["x"] for w in spec["widgets"]] == ["Country_Code"] and warnings == []


# ---- I5: the LLM percent format survives for columns the rules only guessed as numbers ----

def test_the_llm_percent_format_is_kept_for_a_number_unit_column():
    view = sl.resolve("sales", {"approved": {"columns": {"Total_Sales": money("USD")}, "metrics": [], "version": 1}}, PROFILE)
    profile = sl.apply_to_profile(PROFILE, view)
    unit = next(c for c in profile["columns"] if c["name"] == "Conversion")["unit"]
    assert unit == "number"

    def formats(agg, column, fmt):
        spec, _ = validate_spec({"widgets": [{"type": "kpi", "metric": {"agg": agg, "column": column}, "format": fmt}]}, profile, [])
        return spec["widgets"][0]["format"], spec["widgets"][0]["currency"]

    assert formats("avg", "Conversion", "percent") == ("percent", None)
    assert formats("sum", "Conversion", "percent") == ("number", None)
    assert formats("avg", "Conversion", "currency") == ("number", None)
    assert formats("avg", "Total_Sales", "percent") == ("currency", "USD")


# ---- I2: an unreadable stored document ----

BROKEN = {
    "version removed": lambda s: s["approved"].pop("version"),
    "columns not a mapping": lambda s: s["approved"].update(content_json=json.dumps({"columns": ["x"], "metrics": []})),
    "content_json not json": lambda s: s["approved"].update(content_json="{not json"),
}


@pytest.mark.parametrize("how", list(BROKEN))
def test_an_unreadable_document_is_unavailable_not_a_500_and_keeps_the_personal_flags(es, how):
    stored(es, approved={"columns": {"Nick": meta(pii=True), "Region": meta()}}, draft={"columns": {"Nick": meta(pii=True)}})
    BROKEN[how](es.docs[semantic.SEMANTIC_INDEX]["sales"])
    res = client().get(SALES_BASE)
    assert res.status_code == 200
    view = res.json()
    assert view["status"] == "unavailable" and "Nick" in view["hidden_columns"]
    assert view["effective"]["columns"]["Nick"]["pii"] is True
    body = render({"widgets": [COUNT, NICK_TABLE], "filters": [{"column": "Nick"}]})
    assert body.status_code == 200
    served = body.json()
    assert "Nick" not in json.dumps([served["spec"], served["data"]]) and "Nickval_" not in body.text
    assert client().get(f"{DASH_BASE}/datasets/sales/suggestions").status_code == 200


def test_an_unreadable_document_whose_flag_is_stored_nowhere_falls_back_to_the_name_rules(es):
    es.index(semantic.SEMANTIC_INDEX, "sales", {"table_name": "sales", "approved": {"version": 1}})
    res = client().get(SALES_BASE)
    assert res.status_code == 200 and res.json()["status"] == "unavailable"
    assert "Nickval_A" in render({"widgets": [COUNT, NICK_TABLE]}).text  # nothing says Nick is personal


def test_only_a_true_pii_flag_is_salvaged(es):
    stored(es, approved={"columns": {"Nick": meta(pii="yes"), "Region": meta(pii=1), "Profit": meta(pii=False)}})
    es.docs[semantic.SEMANTIC_INDEX]["sales"]["approved"].pop("version")
    assert client().get(SALES_BASE).json()["hidden_columns"] == []


def test_the_dashboard_fallback_is_the_same_guarded_path(es, monkeypatch):
    stored(es, approved={"columns": {"Nick": meta(pii=True)}})
    es.docs[semantic.SEMANTIC_INDEX]["sales"]["approved"].pop("version")
    view = semantic.load_view("sales", PROFILE, es)
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Nick"]


# ---- I6: a flag stored only in the document hides the column everywhere ----

CASES = {
    "approved": dict(approved={"columns": {"Nick": meta(pii=True), "Region": meta()}}),
    "draft only": dict(draft={"columns": {"Nick": meta(pii=True)}}),
    "draft for a column the approval lacks": dict(approved={"columns": {"Region": meta()}}, draft={"columns": {"Nick": meta(pii=True)}}),
}


@pytest.fixture(params=list(CASES))
def nick_hidden(es, request):
    stored(es, **CASES[request.param])
    return es


def test_a_stored_only_flag_hides_the_column_in_render(nick_hidden):
    body = render({"widgets": [COUNT, NICK_TABLE, {"id": "n", "type": "bar", "title": "ตามชื่อเล่น", "x": "Nick",
                                                 "metric": {"agg": "count", "column": None}}], "filters": [{"column": "Nick"}]})
    assert body.status_code == 200
    data = body.json()
    assert "Nick" not in data["data"]["column_labels"] and data["spec"]["filters"] == []
    assert data["data"]["filter_options"] == {} or "Nick" not in json.dumps(data["data"]["filter_options"])
    assert "Nickval_" not in body.text
    table = next(w for w in data["spec"]["widgets"] if w["type"] == "table")
    assert table["columns"] == ["Region"]


def test_a_stored_only_flag_keeps_the_column_from_the_ai_prompts(nick_hidden, monkeypatch):
    c = client()
    suggestions = c.get(f"{DASH_BASE}/datasets/sales/suggestions").json()["suggestions"]
    spec = json.dumps({"title": "ยอดขาย", "widgets": [COUNT]})
    ranking = json.dumps({"suggestions": [{"id": suggestions[0]["id"], "text": suggestions[0]["text"]}]})
    sent = capture_groq(monkeypatch, spec, spec, ranking)
    assert c.post(f"{DASH_BASE}/generate", json={"table_name": "sales", "context": "ภาพรวมยอดขาย", "audience": "business"}).status_code == 200
    assert c.post(f"{DASH_BASE}/refine", json={"table_name": "sales", "spec": {"widgets": [COUNT]}, "instruction": "เพิ่มกราฟ"}).status_code == 200
    assert c.post(f"{DASH_BASE}/rank-suggestions", json={"table_name": "sales", "audience": "business"}).status_code == 200
    assert len(sent) == 3
    prompts = json.dumps(sent, ensure_ascii=False)
    assert "Nick" not in prompts and "Nickval_" not in prompts
    assert "Nick" not in json.dumps(suggestions, ensure_ascii=False)
    changes = c.post(f"{DASH_BASE}/suggest-changes", json={"table_name": "sales", "spec": {"widgets": [COUNT]}})
    assert changes.status_code == 200 and "Nick" not in changes.text


# ---- I6: history is capped ----

def test_history_keeps_the_ten_newest_approvals(es):
    c = client()
    for version in range(12):
        res = c.post(f"{SALES_BASE}/approve", json={"columns": {}, "metrics": [], "base_version": version})
        assert res.status_code == 200
    history = res.json()["history"]
    assert [h["version"] for h in history] == list(range(12, 2, -1))
