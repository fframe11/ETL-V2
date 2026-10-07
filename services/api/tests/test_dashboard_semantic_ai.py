"""The AI prompts, the rule-based dashboard and the suggestion rules read the semantic layer."""
import json
import os
import sys

import pandas as pd

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_llm  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import validate_spec  # noqa: E402
from app.api.dashboard_suggest import suggest_from_profile, suggest_refinements  # noqa: E402
from app.api.semantic_layer import apply_to_profile, resolve  # noqa: E402

DF, RAW = prepare_frame(pd.DataFrame({
    "Order_ID": [f"o{i}" for i in range(12)],
    "Order_Date": [f"2025-{m:02d}-10" for m in range(1, 13)],
    "Customer_Name": [f"SECRET-PERSON-{i}" for i in range(12)],
    "Region": ["North", "South", "East"] * 4,
    "Store_Code": [1, 2] * 6,
    "Total_Sales": [100.5 + i for i in range(12)],
    "Profit": [10.25 + i for i in range(12)],
    "Rating": [3.5, 4.0, 4.5] * 4,
}))
GROSS = {"id": "gross_margin", "label": "Gross Margin", "description": "กำไรต่อยอดขาย", "type": "ratio",
         "numerator": {"agg": "sum", "column": "Profit"}, "denominator": {"agg": "sum", "column": "Total_Sales"},
         "format": "percent"}
SALES_TOTAL = {"id": "sales_total", "label": "ยอดขายรวม", "type": "simple",
               "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "currency", "currency": "USD"}
RATING = {"role": "measure", "label": "คะแนนรีวิว", "unit": "number", "default_agg": "sum", "pii": False}
SALES = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
VIEW = resolve("sales", {"approved": {"columns": {"Rating": RATING, "Total_Sales": SALES},
                                      "metrics": [GROSS, SALES_TOTAL], "version": 1}}, RAW)
PROFILE = apply_to_profile(RAW, VIEW)
METRICS = VIEW["effective"]["metrics"]


def test_the_prompt_carries_meaning_and_metrics_but_no_hidden_column_or_cell_value():
    messages = dashboard_llm.build_generate_messages("sales", PROFILE, "ภาพรวมยอดขาย", "business", METRICS)
    sent = json.dumps(messages, ensure_ascii=False)
    assert "Customer_Name" not in sent and "SECRET-PERSON" not in sent and "North" not in sent
    user = json.loads(messages[1]["content"])
    columns = {c["name"]: c for c in user["profile"]["columns"]}
    assert (columns["Total_Sales"]["role"], columns["Total_Sales"]["label"], columns["Total_Sales"]["unit"],
            columns["Total_Sales"]["currency"]) == ("measure", "ยอดขาย", "currency", "USD")
    assert columns["Order_ID"]["role"] == "identifier"
    assert user["metrics"] == [
        {"id": "gross_margin", "label": "Gross Margin", "description": "กำไรต่อยอดขาย", "format": "percent"},
        {"id": "sales_total", "label": "ยอดขายรวม", "description": "", "format": "currency"}]
    assert "metric_id" in messages[0]["content"] and 'role "identifier"' in messages[0]["content"]


def test_without_a_semantic_layer_the_prompt_is_unchanged():
    messages = dashboard_llm.build_generate_messages("sales", RAW, "ภาพรวม", "business")
    user = json.loads(messages[1]["content"])
    assert "metrics" not in user
    assert all("role" not in c and "label" not in c for c in user["profile"]["columns"])


def test_the_refine_prompt_lists_metrics_and_gaps_that_know_them():
    current, _ = validate_spec({"widgets": [{"id": "k", "type": "kpi", "metric": {"metric_id": "sales_total"}}]},
                               PROFILE, METRICS)
    messages = dashboard_llm.build_refine_messages("sales", PROFILE, current, "เพิ่มกราฟ", METRICS)
    user = json.loads(messages[1]["content"])
    assert [m["id"] for m in user["metrics"]] == ["gross_margin", "sales_total"]
    assert "เพิ่ม KPI ผลรวม Total_Sales" not in user["suggested_changes"]
    assert "Customer_Name" not in json.dumps(messages, ensure_ascii=False)


def test_the_rule_dashboard_leads_with_metrics_then_measures_by_their_default_aggregation():
    spec, warnings = validate_spec(dashboard_llm.fallback_spec(PROFILE, "", "business", METRICS), PROFILE, METRICS)
    assert warnings == []
    kpis = [w for w in spec["widgets"] if w["type"] == "kpi"]
    assert [w["metric"] for w in kpis] == [{"metric_id": "gross_margin"}, {"metric_id": "sales_total"},
                                           {"agg": "sum", "column": "Profit"}, {"agg": "sum", "column": "Rating"}]
    assert kpis[3]["title"] == "ผลรวม คะแนนรีวิว"
    assert all(w.get("x") not in ("Order_ID", "Store_Code") for w in spec["widgets"])
    assert all((w.get("metric") or {}).get("column") != "Store_Code" for w in spec["widgets"])
    bar = next(w for w in spec["widgets"] if w["type"] == "bar")
    assert bar["x"] == "Region" and bar["title"] == "แยกตาม Region"


def test_the_rule_dashboard_without_metrics_is_the_same_as_before():
    spec, _ = validate_spec(dashboard_llm.fallback_spec(RAW, "", "business"), RAW)
    assert spec["widgets"][0]["metric"] == {"agg": "count", "column": None}


def test_a_steward_health_view_skips_the_range_of_an_identifier():
    raw_titles = [w["title"] for w in dashboard_llm.fallback_spec(RAW, "", "steward")["widgets"]]
    assert "ต่ำสุด Store_Code" in raw_titles  # the name guess alone treats Store_Code as a number
    titles = [w["title"] for w in dashboard_llm.fallback_spec(PROFILE, "", "steward", METRICS)["widgets"]]
    assert "ต่ำสุด Store_Code" not in titles and "สูงสุด Store_Code" not in titles


def test_suggestions_follow_roles_and_default_aggregations_but_keep_column_names():
    texts = [s["text"] for s in suggest_from_profile(PROFILE, "business", 20)]
    joined = " ".join(texts)
    assert "Customer_Name" not in joined and "Order_ID" not in joined and "Store_Code" not in joined
    raw_texts = " ".join(s["text"] for s in suggest_from_profile(RAW, "business", 20))
    assert "Customer_Name" in raw_texts or "Order_ID" in raw_texts or "Store_Code" in raw_texts
    assert "ผลรวม Total_Sales ตาม Region" in texts


def test_gap_suggestions_count_a_metric_kpi_and_never_crash_on_one():
    spec, _ = validate_spec({"widgets": [
        {"id": "k", "type": "kpi", "metric": {"metric_id": "sales_total"}},
        {"id": "b", "type": "bar", "x": "Region", "metric": {"metric_id": "gross_margin"}}]}, PROFILE, METRICS)
    texts = [s["text"] for s in suggest_refinements(PROFILE, spec, 20, metrics=METRICS)]
    assert "เพิ่ม KPI ผลรวม Total_Sales" not in texts and "เพิ่ม KPI ผลรวม Profit" in texts
    assert "เพิ่ม KPI ผลรวม Rating" in texts  # the approved default_agg, not the name guess (an average)
    assert not any("Store_Code" in t or "Customer_Name" in t for t in texts)


def test_gap_suggestions_do_not_crash_on_a_metric_id_widget_even_without_the_definitions():
    spec, _ = validate_spec({"widgets": [{"id": "k", "type": "kpi", "metric": {"metric_id": "sales_total"}}]},
                            PROFILE, METRICS)
    assert spec["widgets"][0]["metric"] == {"metric_id": "sales_total"}
    texts = [s["text"] for s in suggest_refinements(PROFILE, spec, 20)]  # no metrics passed: must not KeyError
    assert "เพิ่ม KPI ผลรวม Profit" in texts
