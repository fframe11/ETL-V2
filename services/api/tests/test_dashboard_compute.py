import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_compute  # noqa: E402
from app.api.dashboard_compute import compute_dashboard  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import validate_spec  # noqa: E402

RAW = pd.DataFrame({
    "order_date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28", "2025-03-10", "2025-03-11"],
    "region": ["North", "South", "North", "East", "South", None],
    "segment": ["A", "A", "B", "B", "C", "A"],
    "amount": [100.0, 200.0, 50.0, 80.0, 40.0, 30.0],
})
DF, PROFILE = prepare_frame(RAW.copy())
SUM = {"agg": "sum", "column": "amount"}


def run(widget, selections=None, filters=()):
    spec, _ = validate_spec({"widgets": [widget], "filters": list(filters)}, PROFILE)
    return compute_dashboard(DF, spec, PROFILE, selections)


def one(widget, selections=None):
    result = run(widget, selections)
    (data,) = result["widgets"].values()
    return data


def test_kpi_aggregations():
    assert one({"type": "kpi", "metric": SUM})["value"] == 500.0
    assert one({"type": "kpi", "metric": {"agg": "count", "column": None}})["value"] == 6
    assert one({"type": "kpi", "metric": {"agg": "count_distinct", "column": "region"}})["value"] == 3
    assert one({"type": "kpi", "metric": {"agg": "avg", "column": "amount"}})["value"] == pytest.approx(83.3333)


def test_kpi_compares_the_latest_period_with_the_one_before():
    data = one({"type": "kpi", "metric": SUM, "compare": {"date_column": "order_date", "time_grain": "month"}})
    assert data == {"value": 500.0, "current": 70.0, "previous": 130.0, "period": "2025-03-01", "change_pct": -46.2}


def test_bar_sorts_and_limits_and_names_empty_values():
    data = one({"type": "bar", "x": "region", "metric": SUM})
    assert data == {"series": ["value"], "rows": [
        {"x": "South", "value": 240.0}, {"x": "North", "value": 150.0},
        {"x": "East", "value": 80.0}, {"x": "(ว่าง)", "value": 30.0}]}
    assert [r["x"] for r in one({"type": "bar", "x": "region", "metric": SUM, "limit": 2})["rows"]] == ["South", "North"]
    assert [r["x"] for r in one({"type": "bar", "x": "region", "metric": SUM, "sort": "x"})["rows"]] == [
        "(ว่าง)", "East", "North", "South"]


def test_bar_with_group_by_gives_one_series_per_group():
    data = one({"type": "bar", "x": "region", "metric": SUM, "group_by": "segment"})
    assert data["series"] == ["A", "B", "C"]
    assert data["rows"][0] == {"x": "South", "A": 200.0, "B": None, "C": 40.0}


def test_groups_beyond_the_series_limit_are_folded_into_other(monkeypatch):
    monkeypatch.setattr(dashboard_compute, "MAX_SERIES", 2)
    data = one({"type": "bar", "x": "region", "metric": SUM, "group_by": "segment"})
    assert data["series"] == ["A", "B", "อื่นๆ"]
    assert data["rows"][0] == {"x": "South", "A": 200.0, "B": None, "อื่นๆ": 40.0}


def test_line_buckets_dates_by_month_in_time_order():
    data = one({"type": "line", "x": "order_date", "time_grain": "month", "metric": SUM})
    assert data["rows"] == [{"x": "2025-01-01", "value": 300.0}, {"x": "2025-02-01", "value": 130.0},
                            {"x": "2025-03-01", "value": 70.0}]


def test_pie_keeps_the_biggest_slices_and_sums_the_rest():
    data = one({"type": "pie", "x": "region", "metric": SUM, "limit": 2})
    assert data["rows"] == [{"x": "South", "value": 240.0}, {"x": "North", "value": 150.0},
                            {"x": "อื่นๆ", "value": 110.0}]


def test_table_orders_and_limits_rows_but_reports_the_total():
    data = one({"type": "table", "columns": ["region", "amount"], "order_by": {"column": "amount", "desc": True}, "limit": 2})
    assert data == {"columns": ["region", "amount"], "total_rows": 6,
                    "rows": [{"region": "South", "amount": 200.0}, {"region": "North", "amount": 100.0}]}


def test_selections_filter_every_widget():
    kpi = {"type": "kpi", "metric": SUM}
    assert one(kpi, {"region": {"values": ["North"]}})["value"] == 150.0
    assert one(kpi, {"region": {"values": ["(ว่าง)"]}})["value"] == 30.0
    assert one(kpi, {"order_date": {"from": "2025-02-01", "to": "2025-02-28"}})["value"] == 130.0
    assert one(kpi, {"order_date": {"from": "", "to": None}})["value"] == 500.0
    assert one(kpi, {"province": {"values": ["x"]}, "region": "North"})["value"] == 500.0
    result = run(kpi, {"segment": {"values": ["A"]}})
    assert result["rows_total"] == 6 and result["rows_after_filter"] == 3


def test_filter_options_come_from_the_unfiltered_data():
    result = run({"type": "kpi", "metric": SUM}, {"region": {"values": ["North"]}},
                 filters=[{"column": "region"}, {"column": "order_date"}])
    assert result["filter_options"] == {"region": {"values": ["East", "North", "South"]},
                                        "order_date": {"min": "2025-01-05", "max": "2025-03-11"}}


def test_one_broken_widget_does_not_blank_the_others(monkeypatch):
    def boom(df, widget):
        raise ValueError("boom")

    monkeypatch.setitem(dashboard_compute._COMPUTE, "bar", boom)
    spec, _ = validate_spec({"widgets": [{"id": "k", "type": "kpi", "metric": SUM},
                                         {"id": "b", "type": "bar", "x": "region", "metric": SUM}]}, PROFILE)
    widgets = compute_dashboard(DF, spec, PROFILE)["widgets"]
    assert widgets["k"]["value"] == 500.0
    assert widgets["b"] == {"error": "คำนวณวิดเจ็ตนี้ไม่ได้: boom"}


def test_timezone_aware_date_bounds_are_converted_to_utc_wall_time():
    kpi = {"type": "kpi", "metric": SUM}
    # "Z" is already UTC: from 2025-02-03 00:00 keeps 02-03, 02-28, 03-10, 03-11 -> 50+80+40+30
    assert one(kpi, {"order_date": {"from": "2025-02-03T00:00:00Z"}})["value"] == 200.0
    # 2025-02-04T03:00+07:00 is 2025-02-03 20:00 UTC: midnight of 02-03 is excluded -> 80+40+30
    assert one(kpi, {"order_date": {"from": "2025-02-04T03:00:00+07:00"}})["value"] == 150.0
    # an aware "to" still includes its whole UTC day: 01-05, 01-20, 02-03 -> 100+200+50
    assert one(kpi, {"order_date": {"to": "2025-02-03T00:00:00Z"}})["value"] == 350.0
    assert one(kpi, {"order_date": {"to": "2025-02-03T07:00:00+07:00"}})["value"] == 350.0


def test_out_of_range_and_garbage_date_bounds_are_ignored():
    kpi = {"type": "kpi", "metric": SUM}
    assert one(kpi, {"order_date": {"to": "9999-12-31"}})["value"] == 500.0
    assert one(kpi, {"order_date": {"from": "9999-12-31T00:00:00Z", "to": "0001-01-01"}})["value"] == 500.0
    assert one(kpi, {"order_date": {"from": "not a date", "to": "also not"}})["value"] == 500.0
    result = run(kpi, {"order_date": {"to": "9999-12-31"}})
    assert result["rows_total"] == 6 and result["rows_after_filter"] == 6


def test_compute_dashboard_never_mutates_the_input_frame():
    before = DF.copy()
    widgets = [
        {"type": "kpi", "metric": SUM, "compare": {"date_column": "order_date", "time_grain": "month"}},
        {"type": "bar", "x": "region", "metric": SUM, "group_by": "segment"},
        {"type": "pie", "x": "region", "metric": SUM, "limit": 2},
        {"type": "line", "x": "order_date", "time_grain": "month", "metric": SUM, "group_by": "segment"},
        {"type": "table", "columns": ["region", "amount"], "order_by": {"column": "amount", "desc": True}, "limit": 2},
    ]
    spec, _ = validate_spec({"widgets": widgets, "filters": [{"column": "region"}, {"column": "order_date"}]}, PROFILE)
    selections = {"region": {"values": ["North", "(ว่าง)"]}, "order_date": {"from": "2025-01-01", "to": "2025-03-31"}}
    compute_dashboard(DF, spec, PROFILE, selections)
    pd.testing.assert_frame_equal(DF, before)


def test_count_missing_counts_the_empty_cells_of_a_column():
    assert one({"type": "kpi", "metric": {"agg": "count_missing", "column": "region"}})["value"] == 1
    assert one({"type": "kpi", "metric": {"agg": "count_missing", "column": "amount"}})["value"] == 0


def test_count_missing_per_group_and_after_a_filter():
    metric = {"agg": "count_missing", "column": "region"}
    rows = one({"type": "bar", "x": "segment", "metric": metric, "sort": "x"})["rows"]
    assert {r["x"]: r["value"] for r in rows} == {"A": 1, "B": 0, "C": 0}
    assert one({"type": "kpi", "metric": metric}, {"segment": {"values": ["B", "C"]}})["value"] == 0


def test_count_missing_by_two_keys_matches_a_hand_count_of_the_raw_rows():
    metric = {"agg": "count_missing", "column": "region"}
    data = one({"type": "bar", "x": "segment", "group_by": "region", "metric": metric, "sort": "x"})
    cells = {r["x"]: {s: r[s] for s in data["series"] if r.get(s) is not None} for r in data["rows"]}
    # RAW has (segment, region): A with North, South and an empty region; B with North, East; C with South.
    # Only the last row (segment A) has an empty region, so only that cell counts one.
    assert cells == {"A": {"North": 0, "South": 0, "(ว่าง)": 1}, "B": {"North": 0, "East": 0}, "C": {"South": 0}}


def test_count_missing_compares_the_latest_month_with_the_one_before():
    metric = {"agg": "count_missing", "column": "region"}
    data = one({"type": "kpi", "metric": metric, "compare": {"date_column": "order_date", "time_grain": "month"}})
    assert data["period"] == "2025-03-01" and data["current"] == 1 and data["previous"] == 0


def test_count_missing_keeps_the_gap_when_a_filter_keeps_its_row():
    metric = {"agg": "count_missing", "column": "region"}
    assert one({"type": "kpi", "metric": metric}, {"segment": {"values": ["A"]}})["value"] == 1
