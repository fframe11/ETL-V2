import os
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import semantic_layer as sl  # noqa: E402


def col(name, kind, **extra):
    return {"name": name, "kind": kind, "distinct": 10, "missing_pct": 0.0, **extra}


PROFILE = {"rows": 100, "columns": [
    col("Order_ID", "text"), col("Order_Date", "date"), col("Customer_Name", "text"),
    col("Product_Name", "categorical"), col("Country", "categorical"),
    col("Total_Sales", "numeric", min=5.0, max=900.0), col("Profit", "numeric", min=-20.0, max=300.0),
    col("Discount_Percent", "numeric", min=0.0, max=30.0), col("Quantity", "numeric", min=1, max=9),
    col("Customer_Age", "numeric", min=18, max=80), col("duration_seconds", "numeric", min=0.1, max=40.0),
    col("Rating", "numeric", min=1, max=5),
]}
BY_NAME = {c["name"]: c for c in PROFILE["columns"]}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio",
         "numerator": {"agg": "sum", "column": "Profit"}, "denominator": {"agg": "sum", "column": "Total_Sales"},
         "format": "percent"}


def test_tokens_split_snake_and_camel_case():
    assert sl.tokens("CustomerName") == ["customer", "name"]
    assert sl.tokens("Order_ID") == ["order", "id"]
    assert sl.tokens("OrderID") == ["order", "id"]
    assert sl.tokens("ราคา ต่อหน่วย") == ["ราคา", "ต่อหน่วย"]


@pytest.mark.parametrize("name", ["Customer_Name", "CustomerName", "email", "e_mail", "Phone_Number",
                                  "date_of_birth", "name", "username", "ชื่อลูกค้า", "ที่อยู่จัดส่ง", "id_card"])
def test_personal_column_names(name):
    assert sl.is_pii_name(name) is True


@pytest.mark.parametrize("name", ["Product_Name", "Hotel_Rating", "Total_Sales", "ชื่อสินค้า", "Country", "Paid"])
def test_ordinary_column_names(name):
    assert sl.is_pii_name(name) is False


def test_rules_guess_role_unit_and_aggregation_from_names_and_kinds():
    columns = sl.rule_draft(PROFILE)["columns"]
    summary = {n: (m["role"], m["unit"], m["default_agg"]) for n, m in columns.items()}
    assert summary == {
        "Order_ID": ("identifier", None, None), "Order_Date": ("time", None, None),
        "Customer_Name": ("text", None, None), "Product_Name": ("dimension", None, None),
        "Country": ("dimension", None, None), "Total_Sales": ("measure", "currency", "sum"),
        "Profit": ("measure", "currency", "sum"), "Discount_Percent": ("measure", "percent", "avg"),
        "Quantity": ("measure", "count", "sum"), "Customer_Age": ("measure", "number", "avg"),
        "duration_seconds": ("measure", "duration", "avg"), "Rating": ("measure", "number", "sum"),
    }
    assert columns["Customer_Name"]["pii"] is True and columns["Product_Name"]["pii"] is False
    assert columns["Total_Sales"]["currency"] is None
    assert columns["duration_seconds"]["duration_unit"] == "seconds"


def test_rules_read_thai_names_and_need_a_0_to_100_range_for_percent():
    assert sl.rule_column(col("ยอดขาย", "numeric", min=0, max=10))["unit"] == "currency"
    assert sl.rule_column(col("อายุ", "numeric", min=1, max=90))["default_agg"] == "avg"
    assert sl.rule_column(col("จำนวนชิ้น", "numeric", min=1, max=9))["unit"] == "count"
    assert sl.rule_column(col("Conversion_Rate", "numeric", min=0, max=250))["unit"] == "number"
    assert sl.rule_column(col("Profit_Margin", "numeric", min=0, max=60))["unit"] == "percent"


def test_rule_metrics_are_row_count_and_money_totals():
    metrics = sl.rule_draft(PROFILE)["metrics"]
    assert [m["id"] for m in metrics] == ["row_count", "total_total_sales", "total_profit"]
    assert metrics[1]["measure"] == {"agg": "sum", "column": "Total_Sales", "where": None}
    assert metrics[1]["format"] == "currency"


def test_validate_keeps_good_values_and_repairs_bad_ones_with_reasons():
    raw = {"columns": {
        "Total_Sales": {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "usd", "default_agg": "sum"},
        "Customer_Name": {"role": "measure", "pii": False},
        "Country": {"role": "dimension", "unit": "currency", "currency": "THB"},
        "Profit": {"role": "measure", "unit": "dollars", "currency": "dollar"},
        "Ghost": {"role": "dimension"},
    }, "metrics": []}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    columns = semantic["columns"]
    assert "Ghost" not in columns
    assert columns["Total_Sales"]["currency"] == "USD" and columns["Total_Sales"]["label"] == "ยอดขาย"
    assert columns["Customer_Name"]["role"] == "text" and columns["Customer_Name"]["pii"] is False
    assert columns["Country"]["unit"] is None and columns["Country"]["currency"] is None
    assert columns["Profit"]["unit"] == "currency" and columns["Profit"]["currency"] is None
    text = " ".join(warnings)
    for reason in ("Ghost", "Customer_Name", "dollars", "dollar"):
        assert reason in text


def test_validating_a_validated_semantic_changes_nothing():
    first, _ = sl.validate_semantic(sl.rule_draft(PROFILE), PROFILE)
    second, warnings = sl.validate_semantic(first, PROFILE)
    assert second == first and warnings == []


def test_metrics_are_kept_when_valid_and_dropped_with_a_reason_otherwise():
    raw = {"columns": {}, "metrics": [
        GROSS,
        {"label": "อัตราลดราคา", "type": "ratio",
         "numerator": {"agg": "count", "column": "Profit", "where": {"column": "Discount_Percent", "op": "gt", "value": 0}},
         "denominator": {"agg": "count"}, "format": "percent"},
        {"label": "ออเดอร์ ไทยแลนด์", "type": "simple",
         "measure": {"agg": "count_distinct", "column": "Order_ID", "where": {"column": "Country", "op": "in", "value": ["TH", "LA"]}}},
        {"label": "หลังปีใหม่", "type": "simple",
         "measure": {"agg": "count", "where": {"column": "Order_Date", "op": "gte", "value": "2025-01-01"}}},
        {"label": "ผลรวมชื่อ", "type": "simple", "measure": {"agg": "sum", "column": "Customer_Name"}},
        {"label": "มัธยฐาน", "type": "simple", "measure": {"agg": "median", "column": "Profit"}},
        {"label": "ประเทศมากกว่า", "type": "simple", "measure": {"agg": "count", "where": {"column": "Country", "op": "gt", "value": 1}}},
        {"label": "ยอดมากกว่า", "type": "simple", "measure": {"agg": "count", "where": {"column": "Total_Sales", "op": "gt", "value": "100"}}},
        {"label": "", "type": "simple", "measure": {"agg": "count"}},
        {"label": "เรดาร์", "type": "formula"},
    ]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    metrics = semantic["metrics"]
    assert [m["label"] for m in metrics] == ["Gross Margin", "อัตราลดราคา", "ออเดอร์ ไทยแลนด์", "หลังปีใหม่"]
    assert metrics[0]["numerator"] == {"agg": "sum", "column": "Profit", "where": None}
    assert metrics[0]["higher_is_better"] is True and metrics[0]["currency"] is None
    assert metrics[1]["numerator"]["column"] is None  # count takes no column
    assert [m["id"] for m in metrics[1:]] == ["metric", "metric_2", "metric_3"]  # Thai labels give no slug
    text = " ".join(warnings)
    for reason in ("Customer_Name", "median", "Country", "ตัวเลข", "ไม่มีชื่อ", "formula"):
        assert reason in text


def test_metric_ids_are_kept_when_valid_and_made_unique_otherwise():
    raw = {"metrics": [GROSS, dict(GROSS, label="Margin again"), dict(GROSS, id="Bad Id!", label="Net Margin")]}
    semantic, _ = sl.validate_semantic(raw, PROFILE)
    assert [m["id"] for m in semantic["metrics"]] == ["gross_margin", "margin_again", "net_margin"]


def test_at_most_twenty_metrics_are_kept():
    raw = {"metrics": [dict(GROSS, id=f"m{i}", label=f"M{i}") for i in range(25)]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    assert len(semantic["metrics"]) == 20 and any("20" in w for w in warnings)


def test_currency_metric_keeps_its_code_and_others_drop_it():
    raw = {"metrics": [
        {"label": "รวม", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "currency", "currency": "thb"},
        {"label": "รวม2", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "number", "currency": "THB"}]}
    first, second = sl.validate_semantic(raw, PROFILE)[0]["metrics"]
    assert first["currency"] == "THB" and second["currency"] is None


def test_metric_columns_lists_every_referenced_column():
    metric = {"type": "ratio", "numerator": {"agg": "sum", "column": "Profit", "where": {"column": "Country", "op": "eq", "value": "TH"}},
              "denominator": {"agg": "count", "column": None, "where": None}}
    assert sl.metric_columns(metric) == ["Country", "Profit"]


def test_non_objects_are_rejected():
    with pytest.raises(sl.SemanticError):
        sl.validate_semantic([], PROFILE)


def test_metric_with_list_column_is_dropped_with_reason():
    raw = {"columns": {}, "metrics": [
        {"label": "test", "type": "simple", "measure": {"agg": "sum", "column": ["Profit"]}}
    ]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    assert len(semantic["metrics"]) == 0
    assert any("test" in w and "ไม่มีคอลัมน์" in w for w in warnings)


def test_metric_with_dict_where_column_is_dropped_with_reason():
    raw = {"columns": {}, "metrics": [
        {"label": "bad_where", "type": "simple",
         "measure": {"agg": "sum", "column": "Profit", "where": {"column": {"nested": "value"}, "op": "eq", "value": "test"}}}
    ]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    assert len(semantic["metrics"]) == 0
    assert any("bad_where" in w and "เงื่อนไข" in w for w in warnings)


def test_pii_none_uses_rule_and_warns():
    raw = {"columns": {
        "Customer_Name": {"role": "text", "pii": None}
    }, "metrics": []}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    assert semantic["columns"]["Customer_Name"]["pii"] is True
    assert any("Customer_Name" in w and "pii ต้องเป็น" in w for w in warnings)


def test_pii_zero_uses_rule_and_warns():
    raw = {"columns": {
        "Customer_Name": {"role": "text", "pii": 0}
    }, "metrics": []}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    assert semantic["columns"]["Customer_Name"]["pii"] is True
    assert any("Customer_Name" in w and "pii ต้องเป็น" in w for w in warnings)


def test_pii_empty_string_uses_rule_and_warns():
    raw = {"columns": {
        "Customer_Name": {"role": "text", "pii": ""}
    }, "metrics": []}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    assert semantic["columns"]["Customer_Name"]["pii"] is True
    assert any("Customer_Name" in w and "pii ต้องเป็น" in w for w in warnings)


def test_metric_with_invalid_currency_warns_and_drops_currency():
    raw = {"columns": {}, "metrics": [
        {"id": "bad_curr", "label": "has dollar", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"},
         "format": "currency", "currency": "dollar"}
    ]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    metric = semantic["metrics"][0]
    assert metric["currency"] is None
    assert any("dollar" in w and "has dollar" in w for w in warnings)


def test_metric_with_unknown_format_warns_and_uses_number():
    raw = {"columns": {}, "metrics": [
        {"id": "bad_fmt", "label": "unknown fmt", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"},
         "format": "bitcoin"}
    ]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    metric = semantic["metrics"][0]
    assert metric["format"] == "number"
    assert any("unknown fmt" in w and "รูปแบบ" in w and "bitcoin" in w for w in warnings)


def test_metric_with_non_bool_higher_is_better_warns_and_uses_true():
    raw = {"columns": {}, "metrics": [
        {"id": "bad_hib", "label": "yes string", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"},
         "higher_is_better": "yes"}
    ]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    metric = semantic["metrics"][0]
    assert metric["higher_is_better"] is True
    assert any("yes string" in w and "higher_is_better" in w for w in warnings)
