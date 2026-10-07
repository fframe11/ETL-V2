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
