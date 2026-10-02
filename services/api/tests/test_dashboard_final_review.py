"""Regression tests for the final-review fix wave of Create Dashboard (AI)."""
import itertools
import json
import logging
import os
import sys
import threading
import types

import pandas as pd
import pytest
from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import dashboard_compute, dashboard_data, dashboard_llm  # noqa: E402
from app.api.dashboard_compute import apply_filters, compute_dashboard  # noqa: E402
from app.api.dashboard_data import prepare_frame, profile_dataframe  # noqa: E402
from app.api.dashboard_spec import SpecError, validate_spec  # noqa: E402
from fakes import FakeES  # noqa: E402

SUM = {"agg": "sum", "column": "amount"}


@pytest.fixture(autouse=True)
def empty_caches():
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()
    yield
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()


# ---------------------------------------------------------------- A1

CITIZEN_IDS = [f"1101700{i:06d}" for i in range(203451, 203451 + 30)]
PHONES = [f"08{12345000 + i}" for i in range(30)]
ZIPS = ["01234", "10110", "00500"] * 10
NATIVE_IDS = [100000000000 + i * 7919 for i in range(30)]
AMOUNTS = [100.5, 200.0, 50.0] * 10


def identifier_frame():
    return pd.DataFrame({"citizen_id": CITIZEN_IDS, "phone": PHONES, "zip": ZIPS,
                         "account_no": NATIVE_IDS, "amount": AMOUNTS})


def test_leading_zero_strings_are_never_numeric():
    kind = dashboard_data.classify_column
    assert kind(pd.Series(PHONES)) != "numeric"
    assert kind(pd.Series(ZIPS)) != "numeric"
    assert kind(pd.Series(["0.5", "0", "12", "3"])) == "numeric"  # "0.5" and "0" alone are fine
    assert kind(pd.Series(["3", "5", "2"])) == "numeric"


def test_phone_and_zip_strings_keep_their_leading_zeros_in_the_frame():
    df, profile = prepare_frame(identifier_frame())
    assert df["phone"].tolist() == PHONES
    assert df["zip"].tolist() == ZIPS
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    assert kinds["phone"] in ("categorical", "text") and kinds["zip"] in ("categorical", "text")
    assert kinds["citizen_id"] == "numeric" and kinds["account_no"] == "numeric"


@pytest.mark.parametrize("build", [
    lambda p: dashboard_llm.build_generate_messages("people", p, "ภาพรวม", "business"),
    lambda p: dashboard_llm.build_refine_messages("people", p, {"widgets": [], "filters": []}, "เพิ่มกราฟ"),
])
def test_identifier_values_never_reach_the_prompt(build):
    df, profile = prepare_frame(identifier_frame())
    sent = json.dumps(build(profile), ensure_ascii=False)
    for value in CITIZEN_IDS + PHONES + ZIPS + [str(v) for v in NATIVE_IDS]:
        assert value not in sent
    for column, values in (("citizen_id", CITIZEN_IDS), ("account_no", NATIVE_IDS)):
        low, high = min(int(v) for v in values), max(int(v) for v in values)
        assert str(low) not in sent and str(high) not in sent, column
    prompt_columns = {c["name"]: c for c in dashboard_llm.profile_for_prompt(profile)["columns"]}
    for name in ("citizen_id", "account_no"):
        assert "min" not in prompt_columns[name] and "max" not in prompt_columns[name]
        assert {"name", "kind", "distinct", "missing_pct"} <= set(prompt_columns[name])


def test_an_ordinary_numeric_column_keeps_its_range_in_the_prompt():
    df, profile = prepare_frame(identifier_frame())
    prompt_columns = {c["name"]: c for c in dashboard_llm.profile_for_prompt(profile)["columns"]}
    assert prompt_columns["amount"]["min"] == 50.0 and prompt_columns["amount"]["max"] == 200.0
    sent = json.dumps(dashboard_llm.build_generate_messages("people", profile, "x", "business"))
    assert "200.0" in sent
    whole = pd.DataFrame({"qty": [1, 2, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2], "units": [5, 5, 6, 6, 5, 6, 5, 6, 5, 6, 5, 6]})
    _, whole_profile = prepare_frame(whole)
    for c in dashboard_llm.profile_for_prompt(whole_profile)["columns"]:
        assert "min" in c and "max" in c


# ---------------------------------------------------------------- A2

DATES = pd.DataFrame({
    "order_date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28", "2025-03-10 14:30:00", "2025-03-11"],
    "region": ["North", "South", "North", "East", "South", "North"],
    "amount": [100.0, 200.0, 50.0, 80.0, 40.0, 30.0],
})
DDF, DPROFILE = prepare_frame(DATES.copy())
DKINDS = {c["name"]: c["kind"] for c in DPROFILE["columns"]}


def dash(widget, selections=None, df=DDF):
    spec, _ = validate_spec({"widgets": [widget], "filters": []}, DPROFILE)
    result = compute_dashboard(df, spec, DPROFILE, selections)
    return spec, result


def test_spec_gives_a_date_x_bar_a_time_grain():
    spec, _ = validate_spec({"widgets": [
        {"id": "a", "type": "bar", "x": "order_date", "metric": SUM},
        {"id": "b", "type": "bar", "x": "order_date", "metric": SUM, "time_grain": "week"},
        {"id": "c", "type": "pie", "x": "order_date", "metric": SUM, "time_grain": "nonsense"},
        {"id": "d", "type": "donut", "x": "order_date", "metric": SUM, "time_grain": "year"},
        {"id": "e", "type": "bar", "x": "region", "metric": SUM, "time_grain": "month"},
        {"id": "f", "type": "pie", "x": "region", "metric": SUM},
    ]}, DPROFILE)
    by_id = {w["id"]: w for w in spec["widgets"]}
    assert by_id["a"]["time_grain"] == "month"
    assert by_id["b"]["time_grain"] == "week"
    assert by_id["c"]["time_grain"] == "month"
    assert by_id["d"]["time_grain"] == "year"
    assert "time_grain" not in by_id["e"] and "time_grain" not in by_id["f"]
    again, _ = validate_spec(spec, DPROFILE)  # idempotent
    assert again["widgets"] == spec["widgets"]


def test_a_bar_over_a_date_groups_by_month_buckets():
    _, result = dash({"type": "bar", "x": "order_date", "metric": SUM, "sort": "x"})
    (data,) = result["widgets"].values()
    assert data["rows"] == [{"x": "2025-01-01", "value": 300.0}, {"x": "2025-02-01", "value": 130.0},
                            {"x": "2025-03-01", "value": 70.0}]
    _, result = dash({"type": "donut", "x": "order_date", "metric": SUM})
    (data,) = result["widgets"].values()
    assert {r["x"] for r in data["rows"]} == {"2025-01-01", "2025-02-01", "2025-03-01"}


def test_a_date_label_does_not_depend_on_the_rest_of_the_frame():
    stamp = pd.Timestamp("2025-01-01")
    mixed = pd.Series([stamp, pd.Timestamp("2025-01-01 13:45:10"), pd.NaT])
    midnight = pd.Series([stamp, stamp])
    assert dashboard_compute._labels(mixed)[0] == dashboard_compute._labels(midnight)[0] == "2025-01-01 00:00:00"
    assert dashboard_compute._labels(mixed)[2] == dashboard_compute.EMPTY
    assert dashboard_compute._labels(pd.Series(["a", None]))[1] == dashboard_compute.EMPTY


@pytest.mark.parametrize("order", [("region", "order_date"), ("order_date", "region")])
def test_drilling_a_month_bucket_with_another_filter_active_finds_the_rows(order):
    parts = {"region": {"values": ["North"]}, "order_date": {"values": ["2025-03-01"], "grain": "month"}}
    selections = {key: parts[key] for key in order}
    kept = apply_filters(DDF, selections, DKINDS)
    assert kept["amount"].tolist() == [30.0]
    spec, result = dash({"type": "bar", "x": "order_date", "metric": SUM}, selections)
    assert result["rows_after_filter"] == 1
    month = apply_filters(DDF, {"order_date": parts["order_date"]}, DKINDS)
    assert month["amount"].tolist() == [40.0, 30.0]


def test_a_grain_is_optional_and_an_invalid_one_is_ignored():
    day = apply_filters(DDF, {"order_date": {"values": ["2025-01-05 00:00:00"]}}, DKINDS)
    assert day["amount"].tolist() == [100.0]
    for bad in ("fortnight", None, ["month"], 5):
        kept = apply_filters(DDF, {"order_date": {"values": ["2025-01-05 00:00:00"], "grain": bad}}, DKINDS)
        assert kept["amount"].tolist() == [100.0]
    empty = apply_filters(DDF.assign(order_date=DDF["order_date"].where(DDF["region"] != "East")),
                          {"order_date": {"values": [dashboard_compute.EMPTY], "grain": "month"}}, DKINDS)
    assert empty["amount"].tolist() == [80.0]


# ---------------------------------------------------------------- A3

BAD = "ไม่ใช่ JSON"
GOOD = json.dumps({"widgets": [{"type": "kpi", "metric": {"agg": "count", "column": None}}]})


class CountingGroq:
    def __init__(self, *answers):
        self.answers, self.calls = list(answers), 0

    def __call__(self, messages, api_key, model):
        self.calls += 1
        return self.answers.pop(0)


def install(monkeypatch, groq, clock):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "m"))
    monkeypatch.setattr(dashboard_llm, "call_groq", groq)
    ticks = iter(clock)
    monkeypatch.setattr(dashboard_llm, "time", types.SimpleNamespace(monotonic=lambda: next(ticks)))


def test_the_time_budget_constants():
    assert dashboard_llm.TIMEOUT_S == 20
    assert dashboard_llm.RETRY_BUDGET_S == 25


def test_a_slow_bad_first_answer_skips_the_retry_and_falls_back(monkeypatch):
    groq = CountingGroq(BAD, GOOD)
    install(monkeypatch, groq, [0.0, 26.0])
    result = dashboard_llm.generate_spec("sales", DPROFILE, "x", "business")
    assert groq.calls == 1 and result["engine"] == "rules"


def test_a_slow_bad_first_answer_makes_refine_raise(monkeypatch):
    groq = CountingGroq(BAD, GOOD)
    install(monkeypatch, groq, [0.0, 26.0])
    with pytest.raises(SpecError):
        dashboard_llm.refine_spec("sales", DPROFILE, validate_spec(json.loads(GOOD), DPROFILE)[0], "x")
    assert groq.calls == 1


def test_a_fast_bad_first_answer_still_retries_once(monkeypatch):
    groq = CountingGroq(BAD, GOOD)
    install(monkeypatch, groq, [0.0, 3.0])
    result = dashboard_llm.generate_spec("sales", DPROFILE, "x", "business")
    assert groq.calls == 2 and result["engine"] == "groq"


def test_call_groq_sends_the_twenty_second_timeout(monkeypatch):
    seen = {}

    class Response:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": "{}"}}]}

    def post(url, **kwargs):
        seen.update(kwargs)
        return Response()

    monkeypatch.setattr(dashboard_llm.requests, "post", post)
    assert dashboard_llm.call_groq([{"role": "user", "content": "x"}], "gsk_test", "m") == "{}"
    assert seen["timeout"] == 20


# ---------------------------------------------------------------- A4

INF = pd.DataFrame({
    "when": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28"],
    "region": ["North", "South", "North", "East"],
    "amount": [float("inf"), float("-inf"), 5.0, 7.0],
    "fine": [1.0, 2.0, 3.0, 4.0],
})


def test_non_finite_numbers_stay_out_of_the_profile_and_the_charts():
    df, profile = prepare_frame(INF.copy())
    json.dumps(profile, allow_nan=False)
    amount = next(c for c in profile["columns"] if c["name"] == "amount")
    assert amount["max"] is None and amount["min"] is None and amount["mean"] is None
    fine = next(c for c in profile["columns"] if c["name"] == "fine")
    assert fine["min"] == 1.0 and fine["max"] == 4.0 and fine["mean"] == 2.5
    spec, _ = validate_spec({"widgets": [
        {"id": "k1", "type": "kpi", "metric": {"agg": "sum", "column": "amount"}},
        {"id": "k2", "type": "kpi", "metric": {"agg": "avg", "column": "amount"}},
        {"id": "k3", "type": "kpi", "metric": {"agg": "max", "column": "amount"},
         "compare": {"date_column": "when", "time_grain": "month"}},
        {"id": "k4", "type": "kpi", "metric": {"agg": "sum", "column": "fine"}},
        {"id": "l", "type": "line", "x": "when", "metric": {"agg": "sum", "column": "amount"}},
        {"id": "b", "type": "bar", "x": "region", "metric": {"agg": "max", "column": "amount"}},
    ], "filters": []}, profile)
    result = compute_dashboard(df, spec, profile)
    json.dumps(result, allow_nan=False)
    assert result["widgets"]["k4"]["value"] == 10.0
    assert all("error" not in w for w in result["widgets"].values())
    assert result["widgets"]["k1"]["value"] is None


# ---------------------------------------------------------------- A5

def test_a_repeated_table_column_is_deduplicated():
    spec, _ = validate_spec({"widgets": [{"type": "table", "columns": ["region", "amount", "region", "amount"]}]}, DPROFILE)
    (widget,) = spec["widgets"]
    assert widget["columns"] == ["region", "amount"]
    result = compute_dashboard(DDF, spec, DPROFILE)
    (data,) = result["widgets"].values()
    assert "error" not in data and data["columns"] == ["region", "amount"]
    assert list(data["rows"][0]) == ["region", "amount"]


# ---------------------------------------------------------------- A6

def test_a_widget_failure_is_logged_and_the_others_still_return(monkeypatch, caplog):
    def boom(df, w):
        raise RuntimeError("kaboom")

    monkeypatch.setitem(dashboard_compute._COMPUTE, "bar", boom)
    spec, _ = validate_spec({"widgets": [
        {"id": "broken", "type": "bar", "x": "region", "metric": SUM},
        {"id": "total", "type": "kpi", "metric": SUM},
    ], "filters": []}, DPROFILE)
    with caplog.at_level(logging.ERROR):
        result = compute_dashboard(DDF, spec, DPROFILE)
    assert result["widgets"]["broken"] == {"error": "คำนวณวิดเจ็ตนี้ไม่ได้: kaboom"}
    assert result["widgets"]["total"]["value"] == 500.0
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors and "broken" in errors[0].getMessage()


# ---------------------------------------------------------------- A7

class SearchFails(FakeES):
    def search(self, *args, **kwargs):
        raise ConnectionError("es down")


def test_a_failing_quality_run_search_is_a_503(monkeypatch, caplog):
    es = SearchFails()
    es.index(dashboard_data.QUALITY_INDEX, "r1", {"timestamp": "2026-10-01T00:00:00+00:00"})
    monkeypatch.setattr(dashboard_data, "get_es_client", lambda: es)
    with caplog.at_level(logging.WARNING):
        with pytest.raises(HTTPException) as exc:
            dashboard_data._read_quality_runs()
    assert exc.value.status_code == 503
    assert exc.value.detail == "อ่านผลตรวจคุณภาพจาก Elasticsearch ไม่ได้ในตอนนี้"
    assert any(r.levelno == logging.WARNING for r in caplog.records)


def test_the_caches_survive_concurrent_loads_and_stay_bounded(monkeypatch):
    frame = pd.DataFrame({"region": ["a", "b"], "amount": [1.0, 2.0]})
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: frame.copy())
    tables = [f"table_{i}" for i in range(12)]
    errors = []

    def work(offset):
        try:
            for round_ in range(30):
                name = tables[(offset + round_) % len(tables)]
                dashboard_data.load_active_dataset(name)
                dashboard_data.dataset_profile(tables[(offset * 3 + round_) % len(tables)])
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=work, args=(i,)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    assert len(dashboard_data._FRAME_CACHE) <= dashboard_data._FRAME_CACHE_MAX
    assert hasattr(dashboard_data, "_CACHE_LOCK")
