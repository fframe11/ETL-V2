import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_compute as dc  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402

DF, _ = prepare_frame(pd.DataFrame({
    "order_id": ["o1", "o1", "o2", "o3", "o4", "o5"],
    "order_date": ["2025-01-05", "2025-01-05", "2025-02-03", "2025-02-28", "2025-03-10", "2025-03-11"],
    "region": ["North", "North", "South", "South", "East", None],
    "sales": [100.0, 50.0, 200.0, 0.0, 80.0, 70.0],
    "profit": [40.0, 10.0, 60.0, 0.0, -8.0, 7.0],
    "returned": [False, False, True, False, True, False],
}))


def part(agg, column=None, where=None):
    return {"agg": agg, "column": column, "where": where}


def simple(p, fmt="number"):
    return {"id": "m", "type": "simple", "measure": p, "format": fmt}


def ratio(num, den, fmt="percent"):
    return {"id": "r", "type": "ratio", "numerator": num, "denominator": den, "format": fmt}


MARGIN = ratio(part("sum", "profit"), part("sum", "sales"))


def test_simple_and_ratio_metrics():
    assert dc.evaluate_metric(DF, simple(part("sum", "sales"))) == 500.0
    assert dc.evaluate_metric(DF, MARGIN) == pytest.approx(21.8)
    assert dc.evaluate_metric(DF, ratio(part("sum", "sales"), part("count_distinct", "order_id"), "currency")) == 100.0


@pytest.mark.parametrize("where,expected", [
    ({"column": "returned", "op": "eq", "value": True}, 2),
    ({"column": "region", "op": "ne", "value": "North"}, 4),
    ({"column": "region", "op": "in", "value": ["North", "South"]}, 4),
    ({"column": "sales", "op": "gt", "value": 75}, 3),
    ({"column": "sales", "op": "eq", "value": 0}, 1),
    ({"column": "order_date", "op": "gte", "value": "2025-02-28"}, 3),
    ({"column": "order_date", "op": "lt", "value": "2025-02-01T00:00:00+00:00"}, 2),
])
def test_where_conditions(where, expected):
    assert dc.evaluate_metric(DF, simple(part("count", where=where))) == expected


def test_conditional_ratio_and_zero_denominator():
    returned = ratio(part("count", where={"column": "returned", "op": "eq", "value": True}), part("count"))
    assert dc.evaluate_metric(DF, returned) == pytest.approx(33.3333)
    nowhere = ratio(part("sum", "profit"), part("sum", "sales", {"column": "region", "op": "eq", "value": "Nowhere"}))
    assert dc.evaluate_metric(DF, nowhere) is None


def test_grouped_ratio_is_computed_per_group():
    frame = DF.assign(_x=dc._labels(DF["region"]))
    values = dc.grouped_metric(frame, ["_x"], MARGIN).to_dict()
    assert values["North"] == pytest.approx(100 / 3) and values["South"] == pytest.approx(30.0)
    assert values["East"] == pytest.approx(-10.0) and values["(ว่าง)"] == pytest.approx(10.0)


def test_grouped_counts_with_a_condition_are_zero_not_missing():
    frame = DF.assign(_x=dc._labels(DF["region"]))
    returned = simple(part("count", where={"column": "returned", "op": "eq", "value": True}))
    assert dc.grouped_metric(frame, ["_x"], returned).to_dict() == {"North": 0, "South": 1, "East": 1, "(ว่าง)": 0}


def test_metric_values_reports_every_metric_and_survives_a_broken_one():
    broken = simple(part("sum", "gone"))
    values = dc.metric_values(DF, [dict(MARGIN, id="margin"), dict(broken, id="broken")])
    assert values["margin"] == pytest.approx(21.8) and values["broken"] is None


def count_where(where):
    return dc.evaluate_metric(DF, simple(part("count", where=where)))


@pytest.mark.parametrize("where,expected", [
    ({"column": "order_date", "op": "eq", "value": "2025-01-05"}, 2),
    ({"column": "order_date", "op": "ne", "value": "2025-01-05"}, 4),
    ({"column": "order_date", "op": "in", "value": ["2025-01-05", "2025-03-11"]}, 3),
    ({"column": "order_date", "op": "eq", "value": "2025-01-05T00:00:00+00:00"}, 2),
    ({"column": "order_date", "op": "eq", "value": "2025-01-05T10:30:00"}, 0),
])
def test_date_equality_conditions_compare_by_calendar_day(where, expected):
    assert count_where(where) == expected


@pytest.mark.parametrize("where,expected", [
    ({"column": "sales", "op": "lte", "value": 50}, 2),
    ({"column": "sales", "op": "gte", "value": 100}, 2),
    ({"column": "sales", "op": "lt", "value": 80}, 3),
])
def test_where_comparisons_on_a_numeric_column(where, expected):
    assert count_where(where) == expected


def test_count_distinct_with_a_condition():
    north = part("count_distinct", "order_id", {"column": "region", "op": "eq", "value": "North"})
    south_east = part("count_distinct", "order_id", {"column": "region", "op": "in", "value": ["South", "East"]})
    assert dc.evaluate_metric(DF, simple(north)) == 1
    assert dc.evaluate_metric(DF, simple(south_east)) == 3


def test_grouped_ratio_is_missing_for_zero_and_absent_denominators():
    frame = pd.DataFrame({
        "g": ["x", "x", "y", "z"], "num": [1.0, 1.0, 1.0, 1.0],
        "den": [0.0, 0.0, 5.0, 9.0], "flag": ["yes", "yes", "yes", "no"],
    })
    metric = ratio(part("sum", "num"), part("sum", "den", {"column": "flag", "op": "eq", "value": "yes"}), "number")
    values = dc.grouped_metric(frame, ["g"], metric)
    assert pd.isna(values["x"]) and pd.isna(values["z"]) and values["y"] == pytest.approx(0.2)


def test_ratio_with_an_empty_numerator_is_none_and_nan_values_are_skipped():
    frame = pd.DataFrame({"a": [float("nan"), float("nan")], "b": [1.0, 2.0]})
    assert dc.evaluate_metric(frame, ratio(part("avg", "a"), part("avg", "b"), "number")) is None
    assert dc.evaluate_metric(pd.DataFrame({"v": [1.0, float("nan"), 2.0]}), simple(part("sum", "v"))) == 3.0


def test_ratio_does_not_round_its_parts_and_matches_the_grouped_value():
    frame = pd.DataFrame({"g": ["k"] * 3, "a": [1.0, 0.0, 0.0], "b": [1.0, 1.0, 1.0]})
    third = ratio(part("avg", "a"), part("avg", "b"))
    assert dc.evaluate_metric(frame, third) == pytest.approx(33.3333, abs=1e-4)
    assert dc.evaluate_metric(frame, third) == pytest.approx(dc.grouped_metric(frame, ["g"], third)["k"], abs=1e-4)


def test_a_tiny_non_zero_denominator_is_not_rounded_to_zero():
    frame = pd.DataFrame({"a": [1.0, 1.0, 1.0], "b": [0.00001, 0.00001, 0.00001]})
    assert dc.evaluate_metric(frame, ratio(part("sum", "a"), part("sum", "b"), "number")) == pytest.approx(100000.0)
