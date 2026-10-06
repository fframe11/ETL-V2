import os
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_spec import SpecError, diff_specs, validate_spec  # noqa: E402

PROFILE = {"rows": 100, "columns": [
    {"name": "order_date", "kind": "date"},
    {"name": "region", "kind": "categorical"},
    {"name": "segment", "kind": "categorical"},
    {"name": "amount", "kind": "numeric"},
    {"name": "customer", "kind": "text"},
]}
SUM = {"agg": "sum", "column": "amount"}


def check(*widgets, filters=(), **top):
    return validate_spec({"widgets": list(widgets), "filters": list(filters), **top}, PROFILE)


def test_a_good_spec_keeps_its_choices_and_gets_defaults():
    spec, warnings = check(
        {"id": "total", "type": "kpi", "title": "ยอดขายรวม", "metric": SUM, "format": "currency"},
        {"id": "by_region", "type": "bar", "title": "ตามภูมิภาค", "x": "region", "metric": SUM, "group_by": "segment"},
        {"id": "trend", "type": "line", "title": "รายเดือน", "x": "order_date", "metric": SUM},
        {"id": "share", "type": "donut", "title": "สัดส่วน", "x": "segment", "metric": {"agg": "count", "column": None}},
        {"id": "rows", "type": "table", "title": "รายการ", "columns": ["region", "amount"],
         "order_by": {"column": "amount", "desc": True}},
        title="ยอดขาย", audience="management",
    )
    assert warnings == []
    assert spec["version"] == 1 and spec["title"] == "ยอดขาย" and spec["audience"] == "management"
    kpi, bar, line, donut, table = spec["widgets"]
    assert [w["id"] for w in spec["widgets"]] == ["total", "by_region", "trend", "share", "rows"]
    assert kpi["format"] == "currency"
    assert bar["limit"] == 10 and bar["sort"] == "desc" and bar["group_by"] == "segment" and bar["stacked"] is False
    assert line["time_grain"] == "month" and line["group_by"] is None
    assert donut["limit"] == 6 and donut["metric"] == {"agg": "count", "column": None}
    assert table["limit"] == 50 and table["order_by"] == {"column": "amount", "desc": True}


def test_unknown_columns_types_and_aggregations_are_dropped_with_a_reason():
    spec, warnings = check(
        {"type": "kpi", "title": "ok", "metric": SUM},
        {"type": "bar", "title": "จังหวัด", "x": "province", "metric": SUM},
        {"type": "radar", "title": "เรดาร์"},
        {"type": "kpi", "title": "ผลรวมชื่อ", "metric": {"agg": "sum", "column": "customer"}},
        {"type": "kpi", "title": "มัธยฐาน", "metric": {"agg": "median", "column": "amount"}},
        {"type": "line", "title": "เส้นตามภูมิภาค", "x": "region", "metric": SUM},
    )
    assert [w["title"] for w in spec["widgets"]] == ["ok"]
    text = " ".join(warnings)
    for reason in ("province", "radar", "customer", "median", "region"):
        assert reason in text


def test_sizes_and_limits_are_clamped():
    spec, _ = check(
        {"type": "bar", "x": "region", "metric": SUM, "limit": 999, "layout": {"w": 40, "h": 99}},
        {"type": "pie", "x": "segment", "metric": SUM, "limit": 50},
        {"type": "table", "limit": 10_000},
    )
    bar, pie, table = spec["widgets"]
    assert bar["limit"] == 20 and bar["layout"]["w"] == 12 and bar["layout"]["h"] == 8
    assert pie["limit"] == 8
    assert table["limit"] == 200 and table["columns"] == ["order_date", "region", "segment", "amount", "customer"]


def test_layout_is_packed_left_to_right_in_reading_order_without_overlap():
    spec, _ = check(
        {"id": "c", "type": "bar", "x": "region", "metric": SUM, "layout": {"x": 0, "y": 4, "w": 6, "h": 4}},
        {"id": "a", "type": "kpi", "metric": SUM, "layout": {"x": 0, "y": 0, "w": 6, "h": 2}},
        {"id": "b", "type": "kpi", "metric": SUM, "layout": {"x": 6, "y": 0, "w": 6, "h": 2}},
        {"id": "d", "type": "table"},
    )
    placed = {w["id"]: w["layout"] for w in spec["widgets"]}
    assert [w["id"] for w in spec["widgets"]] == ["a", "b", "c", "d"]
    assert placed["a"] == {"x": 0, "y": 0, "w": 6, "h": 2}
    assert placed["b"] == {"x": 6, "y": 0, "w": 6, "h": 2}
    assert placed["c"] == {"x": 0, "y": 2, "w": 6, "h": 4}
    assert placed["d"] == {"x": 0, "y": 6, "w": 12, "h": 5}


def test_validating_a_validated_spec_changes_nothing():
    spec, _ = check({"type": "kpi", "metric": SUM}, {"type": "bar", "x": "region", "metric": SUM},
                    filters=[{"column": "region"}])
    again, warnings = validate_spec(spec, PROFILE)
    assert again == spec and warnings == []


def test_missing_or_duplicate_ids_get_fresh_unique_ones():
    spec, _ = check({"id": "x", "type": "kpi", "metric": SUM}, {"id": "x", "type": "kpi", "metric": SUM},
                    {"id": "bad id!", "type": "kpi", "metric": SUM}, {"type": "kpi", "metric": SUM})
    ids = [w["id"] for w in spec["widgets"]]
    assert ids[0] == "x" and len(set(ids)) == 4


def test_filters_take_their_type_from_the_column_and_unknown_ones_are_dropped():
    spec, warnings = check({"type": "kpi", "metric": SUM}, filters=[
        {"column": "order_date", "type": "select"}, {"column": "region", "label": "ภูมิภาค"},
        {"column": "region"}, {"column": "province"}])
    assert [(f["column"], f["type"], f["label"]) for f in spec["filters"]] == [
        ("order_date", "date_range", "order_date"), ("region", "select", "ภูมิภาค")]
    assert "province" in " ".join(warnings)


def test_kpi_compare_needs_a_date_column():
    spec, warnings = check({"type": "kpi", "metric": SUM, "compare": {"date_column": "region"}},
                           {"type": "kpi", "metric": SUM, "compare": {"date_column": "order_date", "time_grain": "year"}})
    assert "compare" not in spec["widgets"][0]
    assert spec["widgets"][1]["compare"] == {"date_column": "order_date", "time_grain": "year"}
    assert "region" in " ".join(warnings)


def test_untitled_widgets_get_a_readable_title_and_bad_audience_falls_back():
    spec, _ = check({"type": "bar", "x": "region", "metric": {"agg": "count", "column": None}}, audience="ceo")
    assert spec["widgets"][0]["title"] == "จำนวนแถว ตาม region"
    assert spec["audience"] == "business" and spec["title"] == "แดชบอร์ด"


def test_count_missing_takes_a_column_of_any_kind_and_rejects_an_unknown_one():
    spec, warnings = check(*({"type": "kpi", "title": c, "metric": {"agg": "count_missing", "column": c}}
                             for c in ("region", "amount", "customer", "order_date")))
    assert warnings == [] and [w["metric"]["column"] for w in spec["widgets"]] == ["region", "amount", "customer", "order_date"]
    _, warnings = check({"type": "kpi", "title": "ok", "metric": SUM},
                        {"type": "kpi", "title": "x", "metric": {"agg": "count_missing", "column": "nope"}})
    assert "nope" in " ".join(warnings)


def test_the_steward_audience_is_kept():
    spec, _ = check({"type": "kpi", "metric": SUM}, audience="steward")
    assert spec["audience"] == "steward"


def test_a_spec_with_nothing_usable_is_an_error():
    with pytest.raises(SpecError):
        validate_spec([], PROFILE)
    with pytest.raises(SpecError):
        check({"type": "radar"})
    with pytest.raises(SpecError):
        validate_spec({"widgets": "kpi"}, PROFILE)


def test_diff_reports_what_a_refinement_changed():
    old, _ = check({"id": "a", "type": "kpi", "title": "A", "metric": SUM},
                   {"id": "b", "type": "bar", "title": "B", "x": "region", "metric": SUM},
                   {"id": "c", "type": "kpi", "title": "C", "metric": SUM}, filters=[{"column": "region"}])
    new, _ = check({"id": "a", "type": "kpi", "title": "A", "metric": SUM},
                   {"id": "b", "type": "pie", "title": "B", "x": "region", "metric": SUM},
                   {"id": "d", "type": "line", "title": "D", "x": "order_date", "metric": SUM},
                   filters=[{"column": "segment"}])
    assert diff_specs(old, new) == {"added": ["D"], "removed": ["C"], "changed": ["B"], "layout_changed": True,
                                    "filters_added": ["segment"], "filters_removed": ["region"]}
    assert diff_specs(old, old)["layout_changed"] is False


GOOD = {"id": "good", "type": "kpi", "title": "good", "metric": SUM}
INF = float("inf")


@pytest.mark.parametrize("bad", [
    {"type": "bar", "title": "bad", "x": ["region"], "metric": SUM},
    {"type": "bar", "title": "bad", "x": {"a": 1}, "metric": SUM},
    {"type": "kpi", "title": "bad", "metric": {"agg": "sum", "column": ["amount"]}},
    {"type": "kpi", "title": "bad", "metric": {"agg": "count_distinct", "column": {"a": 1}}},
])
def test_wrong_typed_columns_drop_the_widget_with_a_warning_and_keep_the_others(bad):
    spec, warnings = check(GOOD, bad)
    assert [w["id"] for w in spec["widgets"]] == ["good"]
    assert any("bad" in w for w in warnings)


@pytest.mark.parametrize("group_by", [{"a": 1}, ["segment"]])
def test_wrong_typed_group_by_falls_back_to_no_grouping(group_by):
    spec, _ = check(GOOD, {"type": "bar", "title": "b", "x": "region", "metric": SUM, "group_by": group_by})
    assert [w["id"] for w in spec["widgets"]][0] == "good"
    assert spec["widgets"][1]["group_by"] is None and spec["widgets"][1]["stacked"] is False


def test_wrong_typed_table_columns_are_ignored():
    spec, _ = check(GOOD, {"type": "table", "title": "t", "columns": [["region"], {"a": 1}, "amount", 3]})
    assert spec["widgets"][1]["columns"] == ["amount"]


def test_wrong_typed_compare_date_column_is_ignored_with_a_warning():
    spec, warnings = check({"type": "kpi", "title": "k", "metric": SUM, "compare": {"date_column": ["order_date"]}},
                           GOOD)
    assert [w["id"] for w in spec["widgets"]] != [] and all("compare" not in w for w in spec["widgets"])
    assert len(spec["widgets"]) == 2 and warnings


def test_wrong_typed_filter_column_is_dropped_with_a_warning():
    spec, warnings = check(GOOD, filters=[{"column": ["region"]}, {"column": {"a": 1}}, {"column": "region"}])
    assert [f["column"] for f in spec["filters"]] == ["region"]
    assert len(warnings) == 2


@pytest.mark.parametrize("bad", [
    {"type": "bar", "title": "b", "x": "region", "metric": SUM, "limit": INF},
    {"type": "bar", "title": "b", "x": "region", "metric": SUM, "limit": -INF},
    {"type": "bar", "title": "b", "x": "region", "metric": SUM, "limit": float("nan")},
    {"type": "bar", "title": "b", "x": "region", "metric": SUM, "layout": {"w": INF, "h": INF, "x": INF, "y": INF}},
    {"type": "table", "title": "b", "limit": INF},
])
def test_non_finite_numbers_fall_back_to_defaults(bad):
    spec, _ = check(GOOD, bad)
    widget = spec["widgets"][1]
    assert spec["widgets"][0]["id"] == "good" and widget["title"] == "b"
    assert widget["limit"] == {"bar": 10, "table": 50}[widget["type"]]
    assert widget["layout"]["w"] in (6, 12) and widget["layout"]["h"] in (4, 5)
