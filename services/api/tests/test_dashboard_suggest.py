import os
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_spec import validate_spec  # noqa: E402
from app.api.dashboard_suggest import is_identifier, suggest_from_profile, suggest_refinements  # noqa: E402


def col(name, kind, distinct, missing=0.0, low=None, high=None):
    return {"name": name, "kind": kind, "dtype": "x", "missing": 0, "missing_pct": missing, "distinct": distinct,
            "min": low, "max": high}


def profile(rows, *columns):
    return {"rows": rows, "column_count": len(columns), "missing_cells": 0, "kind_counts": {}, "columns": list(columns)}


# Profiles taken from datasets that are active in the running system (2026-10-06).
ECOMMERCE = profile(
    2000,
    col("Order_ID", "text", 2000), col("Order_Date", "date", 907, low="2023-01-02T00:00:00", high="2025-12-31T00:00:00"),
    col("Customer_Name", "text", 1534), col("Customer_Segment", "categorical", 3), col("Country", "categorical", 20),
    col("Region", "categorical", 5), col("Product_Category", "categorical", 4), col("Product_Name", "categorical", 40),
    col("Quantity", "numeric", 15, low=1.0, high=15.0), col("Unit_Price", "numeric", 1839, low=3.03, high=472.56),
    col("Discount_Percent", "numeric", 7, low=0.0, high=30.0), col("Total_Sales", "numeric", 1927, low=2.42, high=3813.98),
    col("Shipping_Cost", "numeric", 1118, low=5.52, high=40.44), col("Profit", "numeric", 1855, low=-11.28, high=1373.63),
    col("Payment_Method", "categorical", 4))

OLIST = profile(
    21767,
    col("product_id", "text", 21767), col("product_category_name", "categorical", 72),
    col("product_name_lenght", "numeric", 49, low=20.0, high=76.0),
    col("product_description_lenght", "numeric", 1774, low=4.0, high=1841.0),
    col("product_photos_qty", "numeric", 5, low=1.0, high=5.0), col("product_weight_g", "numeric", 1116, low=0.0, high=3150.0))

STUDENTS = profile(
    9370,
    col("dirty_row_id", "numeric", 9370, low=1.0, high=10099.0), col("record_id", "numeric", 9370, low=1.0, high=10000.0),
    col("student_id", "numeric", 9370, low=65001.0, high=75000.0), col("course", "categorical", 5),
    col("score", "numeric", 52, low=49.0, high=100.0),
    col("semester", "date", 2, low="2026-01-01T00:00:00", high="2026-02-01T00:00:00"),
    col("study_hours", "numeric", 10, low=1.0, high=10.0),
    col("updated_at", "date", 1, low="2026-09-15T10:00:00", high="2026-09-15T10:00:00"))

GROCERY = profile(
    557,
    col("วันที่", "date", 60, low="2026-06-01T00:00:00", high="2026-07-30T00:00:00"), col("รายการสินค้า", "categorical", 23),
    col("จำนวน", "numeric", 4, 2.33, 1.0, 4.0), col("ราคาต่อหน่วย", "numeric", 13, low=15.0, high=60.0),
    col("ยอดขายรวม", "numeric", 39, 2.33, 15.0, 240.0), col("row_hash", "text", 557))


def texts(p, audience="business", limit=6):
    return [s["text"] for s in suggest_from_profile(p, audience, limit)]


def test_ecommerce_gets_trend_comparison_ranking_share_and_a_two_way_split():
    assert texts(ECOMMERCE) == [
        "10 Product_Name ที่ ผลรวม Total_Sales สูงสุด",
        "แนวโน้ม ผลรวม Total_Sales รายเดือน ตาม Order_Date",
        "สัดส่วน ผลรวม Total_Sales ตาม Region",
        "ผลรวม Total_Sales ปีล่าสุด เทียบช่วงก่อนหน้า",
        "ผลรวม Total_Sales ตาม Country แยกตาม Customer_Segment",
        "10 Country ที่ ผลรวม Total_Sales สูงสุด",
    ]


def test_a_dataset_without_dates_or_sales_is_not_offered_trends_or_sales_wording():
    result = texts(OLIST)
    assert result == ["10 product_category_name ที่ ค่าเฉลี่ย product_name_lenght สูงสุด",
                      "10 product_category_name ที่มีจำนวนแถวมากที่สุด"]  # an average is not how common a category is
    assert not any("แนวโน้ม" in t or "เทียบ" in t or "ยอดขาย" in t for t in result)


def test_identifier_and_constant_columns_are_never_suggested():
    result = " ".join(texts(STUDENTS, limit=20))
    for hidden in ("dirty_row_id", "record_id", "student_id", "updated_at"):
        assert hidden not in result
    assert "ค่าเฉลี่ย score ตาม course" in result
    assert "แนวโน้ม" not in result  # semester holds only 2 dates


def test_the_period_follows_the_length_of_the_data():
    result = texts(GROCERY, limit=20)
    assert "แนวโน้ม ผลรวม ยอดขายรวม รายสัปดาห์ ตาม วันที่" in result  # two months: weeks, not months
    assert "ผลรวม ยอดขายรวม เดือนล่าสุด เทียบช่วงก่อนหน้า" in result
    assert not any("row_hash" in t for t in result)


def test_a_range_inside_one_week_compares_days_not_weeks():
    short = profile(40, col("day", "date", 3, low="2026-10-05T00:00:00", high="2026-10-07T00:00:00"),
                    col("amount", "numeric", 30, low=1.5, high=9.5))
    result = texts(short, limit=20)
    assert any("วันล่าสุด" in t for t in result)
    assert not any("สัปดาห์ล่าสุด" in t for t in result)  # one Monday to Sunday week has nothing to compare with


def test_a_dataset_without_a_measure_does_not_repeat_the_row_count_ranking():
    only_categories = profile(500, col("product", "categorical", 40), col("color", "categorical", 5))
    keys = [(s["widget"]["x"], s["widget"]["metric"]["agg"]) for s in suggest_from_profile(only_categories, limit=50)
            if s["rule"] == "R2"]  # the share donut (R3) may reuse a bar's axis: it is a different chart
    assert keys and len(keys) == len(set(keys))


def test_the_share_donut_may_show_every_category_it_was_offered_for():
    donuts = [s for s in suggest_from_profile(ECOMMERCE, limit=50) if s["rule"] == "R3"]
    assert donuts and all(s["widget"]["limit"] == 8 for s in donuts)


def test_the_audience_decides_what_comes_first():
    assert texts(ECOMMERCE, "management", 1) == ["ผลรวม Total_Sales ปีล่าสุด เทียบช่วงก่อนหน้า"]
    assert texts(ECOMMERCE, "analyst", 1) == ["ผลรวม Total_Sales ตาม Country แยกตาม Customer_Segment"]
    assert texts(ECOMMERCE, "unknown-audience", 1) == texts(ECOMMERCE, "business", 1)


def test_the_list_is_capped_and_ids_are_unique():
    many = suggest_from_profile(ECOMMERCE, limit=3)
    assert len(many) == 3
    everything = suggest_from_profile(ECOMMERCE, limit=50)
    assert len({s["id"] for s in everything}) == len(everything)


def test_a_table_of_numbers_only_gets_summary_cards():
    numbers = profile(100, col("a", "numeric", 40, low=1.5, high=9.5), col("b", "numeric", 30, low=0.5, high=2.5))
    assert texts(numbers) == ["ดูค่าเฉลี่ย a", "ดูค่าเฉลี่ย b"]


def test_nothing_is_suggested_when_no_column_is_usable():
    empty = profile(10, col("note", "text", 10), col("id", "numeric", 10, low=1.0, high=10.0))
    assert suggest_from_profile(empty) == []


@pytest.mark.parametrize("p", [ECOMMERCE, OLIST, STUDENTS, GROCERY], ids=["ecommerce", "olist", "students", "grocery"])
def test_every_suggested_widget_is_accepted_by_the_spec_validator(p):
    suggestions = suggest_from_profile(p, limit=50)
    assert suggestions
    spec, warnings = validate_spec({"widgets": [s["widget"] for s in suggestions]}, p)
    assert warnings == [] and len(spec["widgets"]) == len(suggestions)


def test_identifier_detection_matches_what_the_llm_prompt_hides():
    assert is_identifier(col("id", "numeric", 9370, low=1.0, high=10000.0), 9370)
    assert is_identifier(col("account", "numeric", 3, low=100000000.0, high=999999999.0), 1000)  # 9 digits
    assert not is_identifier(col("score", "numeric", 52, low=49.0, high=100.0), 9370)
    assert not is_identifier(col("price", "numeric", 40, low=1.5, high=9.5), 100)  # not whole numbers


# --- suggestions for a dashboard that already exists (gaps between its spec and the profile) ----------

SALES = {"agg": "sum", "column": "Total_Sales"}
ECOMMERCE_CATEGORIES = ["Customer_Segment", "Country", "Region", "Product_Category", "Product_Name", "Payment_Method"]


def spec_for(p, widgets, filters=(), audience="business"):
    spec, warnings = validate_spec({"widgets": widgets, "filters": list(filters), "audience": audience}, p)
    assert warnings == []
    return spec


def gaps(p, spec, limit=20):
    return [(s["rule"], s["text"]) for s in suggest_refinements(p, spec, limit)]


def test_a_small_dashboard_is_offered_a_trend_a_comparison_a_filter_and_a_kpi_first():
    spec = spec_for(ECOMMERCE, [{"id": "k1", "type": "kpi", "title": "ยอดขายรวม", "metric": SALES},
                                {"id": "b1", "type": "bar", "title": "ตามประเทศ", "x": "Country", "metric": SALES}],
                    [{"column": "Region"}])
    assert gaps(ECOMMERCE, spec, 5) == [
        ("G3", "เพิ่มแนวโน้ม ผลรวม Total_Sales รายเดือน ตาม Order_Date"),
        ("G4", "แสดง ยอดขายรวม เทียบช่วงก่อนหน้า"),
        ("G1", "เพิ่มตัวกรอง Customer_Segment"),
        ("G2", "เพิ่ม KPI ผลรวม Profit"),
        ("G1", "เพิ่มตัวกรอง Product_Category")]


def test_nothing_is_suggested_for_what_the_dashboard_already_has():
    spec = spec_for(ECOMMERCE, [
        {"id": "k1", "type": "kpi", "title": "ยอดขายรวม", "metric": SALES, "compare": {"date_column": "Order_Date", "time_grain": "year"}},
        {"id": "l1", "type": "line", "title": "แนวโน้ม", "x": "Order_Date", "time_grain": "month", "metric": SALES}],
        [{"column": "Region"}])
    rules = [r for r, _ in gaps(ECOMMERCE, spec)]
    assert "G3" not in rules and "G4" not in rules
    assert "เพิ่มตัวกรอง Region" not in [t for _, t in gaps(ECOMMERCE, spec)]
    assert "เพิ่ม KPI ผลรวม Total_Sales" not in [t for _, t in gaps(ECOMMERCE, spec)]


def test_no_filter_is_suggested_once_the_filter_limit_is_reached():
    spec = spec_for(ECOMMERCE, [{"id": "k1", "type": "kpi", "title": "ยอดขาย", "metric": SALES}],
                    [{"column": c} for c in ECOMMERCE_CATEGORIES])
    assert len(spec["filters"]) == 6
    assert "G1" not in [r for r, _ in gaps(ECOMMERCE, spec)]


def test_a_bar_over_a_few_values_may_become_a_share_but_an_average_may_not():
    totals = spec_for(ECOMMERCE, [{"id": "b2", "type": "bar", "title": "ตามภูมิภาค", "x": "Region", "metric": SALES}])
    assert ("G5", "เปลี่ยน 'ตามภูมิภาค' เป็นกราฟสัดส่วน") in gaps(ECOMMERCE, totals)
    average = spec_for(ECOMMERCE, [{"id": "b2", "type": "bar", "title": "ตามภูมิภาค", "x": "Region",
                                    "metric": {"agg": "avg", "column": "Unit_Price"}}])
    split = spec_for(ECOMMERCE, [{"id": "b2", "type": "bar", "title": "ตามภูมิภาค", "x": "Region", "group_by": "Payment_Method", "metric": SALES}])
    many = spec_for(ECOMMERCE, [{"id": "b2", "type": "bar", "title": "ตามประเทศ", "x": "Country", "metric": SALES}])
    for spec in (average, split, many):
        assert "G5" not in [r for r, _ in gaps(ECOMMERCE, spec)]


def test_a_detail_table_is_questioned_only_on_a_dashboard_for_management():
    widgets = [{"id": "k1", "type": "kpi", "title": "ยอดขาย", "metric": SALES},
               {"id": "t1", "type": "table", "title": "ตาราง", "columns": ["Order_ID"]}]
    assert ("G6", "ลบตารางรายละเอียดให้เหมาะกับผู้บริหาร") in gaps(ECOMMERCE, spec_for(ECOMMERCE, widgets, audience="management"))
    assert "G6" not in [r for r, _ in gaps(ECOMMERCE, spec_for(ECOMMERCE, widgets, audience="analyst"))]


def test_a_dataset_without_dates_gets_no_trend_or_comparison_gap():
    spec = spec_for(OLIST, [{"id": "t", "type": "table", "title": "ตาราง", "columns": ["product_id"]}])
    found = gaps(OLIST, spec)
    assert found and {r for r, _ in found} == {"G2"}
    assert found[0] == ("G2", "เพิ่ม KPI ค่าเฉลี่ย product_name_lenght")


def test_gap_suggestions_have_unique_ids_and_respect_the_limit():
    spec = spec_for(ECOMMERCE, [{"id": "k1", "type": "kpi", "title": "ยอดขาย", "metric": SALES}])
    everything = suggest_refinements(ECOMMERCE, spec, 50)
    assert len({s["id"] for s in everything}) == len(everything)
    assert set(everything[0]) == {"id", "rule", "text"}
    assert len(suggest_refinements(ECOMMERCE, spec, 2)) == 2
