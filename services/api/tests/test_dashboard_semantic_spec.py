import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_compute import compute_dashboard  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import validate_spec  # noqa: E402
from app.api.semantic_layer import apply_to_profile, resolve  # noqa: E402

DF, RAW_PROFILE = prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Invoice_No": [11, 12, 13, 14], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.0, 50.0, 150.0], "Profit": [10.0, 50.0, 5.0, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]}))
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent", "higher_is_better": True}
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
VIEW = resolve("sales", {"approved": {"columns": {"Total_Sales": USD}, "metrics": [GROSS], "version": 1}}, RAW_PROFILE)
PROFILE = apply_to_profile(RAW_PROFILE, VIEW)
METRICS = VIEW["effective"]["metrics"]


def check(*widgets, filters=()):
    return validate_spec({"widgets": list(widgets), "filters": list(filters)}, PROFILE, METRICS)


def test_a_kpi_can_use_an_approved_metric_and_takes_its_presentation():
    spec, warnings = check({"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"}})
    (kpi,) = spec["widgets"]
    assert warnings == [] and kpi["metric"] == {"metric_id": "gross_margin"}
    assert (kpi["title"], kpi["format"], kpi["currency"], kpi["higher_is_better"]) == ("Gross Margin", "percent", None, True)
    assert compute_dashboard(DF, spec, PROFILE, metrics=METRICS)["widgets"]["k"]["value"] == pytest.approx(22.0)


def test_unknown_metric_ids_are_dropped():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "kpi", "title": "ไม่มี", "metric": {"metric_id": "nope"}},
                           {"type": "kpi", "title": "ผิดชนิด", "metric": {"metric_id": ["gross_margin"]}})
    assert len(spec["widgets"]) == 1
    assert "nope" in " ".join(warnings) and "ผิดชนิด" in " ".join(warnings)


def test_column_units_decide_the_number_format_not_the_llm():
    spec, _ = check({"type": "kpi", "metric": {"agg": "sum", "column": "Total_Sales"}, "format": "number"},
                    {"type": "kpi", "metric": {"agg": "count_distinct", "column": "Order_ID"}, "format": "currency"},
                    {"type": "kpi", "metric": {"agg": "count", "column": None}, "format": "percent"})
    money, orders, rows = spec["widgets"]
    assert (money["format"], money["currency"]) == ("currency", "USD")
    assert money["title"] == "sum(ยอดขาย)"
    assert (orders["format"], orders["currency"]) == ("number", None)
    assert rows["format"] == "number"


def test_identifiers_are_never_summed_or_used_as_chart_axes():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "kpi", "title": "รวมเลขใบแจ้งหนี้", "metric": {"agg": "sum", "column": "Invoice_No"}},
                           {"type": "bar", "title": "ตามออเดอร์", "x": "Order_ID", "metric": {"agg": "count", "column": None}},
                           {"type": "bar", "title": "ตามภูมิภาค", "x": "Region", "group_by": "Order_ID",
                            "metric": {"agg": "count", "column": None}})
    assert [w["title"] for w in spec["widgets"]] == ["จำนวนแถว", "ตามภูมิภาค"]
    assert spec["widgets"][1]["group_by"] is None
    text = " ".join(warnings)
    assert "Invoice_No" in text and "Order_ID" in text


def test_hidden_personal_columns_cannot_be_used():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "bar", "title": "ตามชื่อ", "x": "Customer_Name", "metric": {"agg": "count", "column": None}},
                           {"type": "table", "title": "รายการ", "columns": ["Region", "Customer_Name"]},
                           {"type": "table", "title": "ทั้งหมด"}, filters=[{"column": "Customer_Name"}])
    assert [w["type"] for w in spec["widgets"]] == ["kpi", "table", "table"]
    assert spec["widgets"][1]["columns"] == ["Region"]
    assert "Customer_Name" not in spec["widgets"][2]["columns"] and spec["filters"] == []
    text = " ".join(warnings)
    assert "ตามชื่อ" in text and "'รายการ': ตัดคอลัมน์ Customer_Name" in text and "ตัดตัวกรอง: ไม่มีคอลัมน์ Customer_Name" in text


def test_filters_are_labelled_with_the_column_label():
    spec, _ = check({"type": "kpi", "metric": {"agg": "count", "column": None}}, filters=[{"column": "Total_Sales"}])
    assert spec["filters"][0]["label"] == "ยอดขาย"


def test_grouped_metrics_are_computed_per_group_and_labels_come_back():
    spec, _ = check({"id": "b", "type": "bar", "x": "Region", "metric": {"metric_id": "gross_margin"}})
    assert spec["widgets"][0]["title"] == "Gross Margin ตาม Region"
    result = compute_dashboard(DF, spec, PROFILE, metrics=METRICS)
    rows = result["widgets"]["b"]["rows"]
    assert [r["x"] for r in rows] == ["E", "S", "N"]
    assert [r["value"] for r in rows] == pytest.approx([30.0, 25.0, 10.0])
    assert result["column_labels"]["Total_Sales"] == "ยอดขาย" and result["column_labels"]["Region"] == "Region"
    assert "Customer_Name" not in result["column_labels"]


def test_a_kpi_compare_uses_the_metric_definition_per_period():
    df, raw = prepare_frame(pd.DataFrame({
        "Order_Date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28"],
        "Total_Sales": [100.0, 100.0, 200.0, 200.0], "Profit": [10.0, 30.0, 20.0, 20.0]}))
    view = resolve("sales", {"approved": {"columns": {}, "metrics": [GROSS], "version": 1}}, raw)
    profile, metrics = apply_to_profile(raw, view), view["effective"]["metrics"]
    spec, _ = validate_spec({"widgets": [{"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"},
                                          "compare": {"date_column": "Order_Date", "time_grain": "month"}}]}, profile, metrics)
    kpi = compute_dashboard(df, spec, profile, metrics=metrics)["widgets"]["k"]
    assert (kpi["value"], kpi["current"], kpi["previous"], kpi["change_pct"]) == (13.3333, 10.0, 20.0, -50.0)


def test_validating_twice_with_semantics_changes_nothing():
    spec, _ = check({"type": "kpi", "metric": {"metric_id": "gross_margin"}},
                    {"type": "bar", "x": "Region", "metric": {"agg": "sum", "column": "Total_Sales"}},
                    filters=[{"column": "Region"}])
    again, warnings = validate_spec(spec, PROFILE, METRICS)
    assert again == spec and warnings == []


def test_without_semantics_the_llm_format_still_applies():
    _, raw = prepare_frame(pd.DataFrame({"amount": [1.0, 2.0], "region": ["a", "b"]}))
    spec, _ = validate_spec({"widgets": [{"type": "kpi", "metric": {"agg": "sum", "column": "amount"}, "format": "currency"}]}, raw)
    (kpi,) = spec["widgets"]
    assert (kpi["format"], kpi["currency"], kpi["higher_is_better"]) == ("currency", None, True)


def test_a_metric_that_cannot_be_computed_fails_only_its_own_widgets():
    # a definition whose condition names a column the data does not have (a stale or hand-made view)
    broken = {"id": "broken", "label": "Broken", "type": "simple", "format": "number", "higher_is_better": True,
              "measure": {"agg": "sum", "column": "Profit",
                          "where": {"column": "Gone", "op": "eq", "value": "x"}}}
    metrics = METRICS + [broken]
    spec, warnings = validate_spec({"widgets": [
        {"id": "ok", "type": "kpi", "metric": {"agg": "count", "column": None}},
        {"id": "bad_kpi", "type": "kpi", "metric": {"metric_id": "broken"}},
        {"id": "bad_bar", "type": "bar", "x": "Region", "metric": {"metric_id": "broken"}},
        {"id": "good", "type": "kpi", "metric": {"metric_id": "gross_margin"}}]}, PROFILE, metrics)
    assert warnings == []
    result = compute_dashboard(DF, spec, PROFILE, metrics=metrics)
    assert result["widgets"]["ok"]["value"] == 4
    assert result["widgets"]["good"]["value"] == pytest.approx(22.0)
    assert "error" in result["widgets"]["bad_kpi"] and "error" in result["widgets"]["bad_bar"]
    assert result["rows_total"] == 4


def test_a_widget_naming_a_metric_that_was_not_passed_in_gets_a_widget_error_not_a_crash():
    spec, _ = check({"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"}},
                    {"id": "n", "type": "kpi", "metric": {"agg": "count", "column": None}})
    result = compute_dashboard(DF, spec, PROFILE)  # metrics omitted
    assert "error" in result["widgets"]["k"] and result["widgets"]["n"]["value"] == 4
