import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dynamic_rules  # noqa: E402

NULLS = {"score": {"null_rate": 0.0302, "tolerance": 0.05, "is_required": False}}
RANGES = {"score": {"q1": 63.3, "q3": 80.8, "iqr": 17.5, "lower_bound": 37.05, "upper_bound": 107.05}}
RUN = {"run_id": "run_1", "timestamp": "2026-10-01T10:00:00Z", "table_name": "t1",
       "null_profile": NULLS, "value_range_profile": RANGES}


class FakeES:
    def __init__(self, run=None, log_doc=None, indices=("sdoqap_quality_runs", "sdoqap_dynamic_rules_log")):
        self.run, self.log_doc, self.present = run, log_doc, set(indices)
        self.indices = self

    def exists(self, index):
        return index in self.present

    def search(self, index, body):
        doc = self.run if index == "sdoqap_quality_runs" else self.log_doc
        return {"hits": {"hits": [{"_source": doc}] if doc else []}}


def profiles(monkeypatch, es):
    monkeypatch.setattr(dynamic_rules, "_get_es", lambda: es)
    return dynamic_rules.get_column_profiles("t1")


def test_profile_comes_from_the_latest_quality_run_in_the_shape_the_rules_page_reads(monkeypatch):
    result = profiles(monkeypatch, FakeES(run=RUN))
    assert result["run_id"] == "run_1" and result["timestamp"] == "2026-10-01T10:00:00Z"
    assert result["null_profile"] == NULLS
    assert result["value_ranges"] == RANGES
    assert result["source"] == "sdoqap_quality_runs"


def test_an_older_run_without_null_rates_still_shows_its_value_ranges(monkeypatch):
    run = {k: v for k, v in RUN.items() if k != "null_profile"}
    result = profiles(monkeypatch, FakeES(run=run))
    assert "null_profile" not in result
    assert result["value_ranges"] == RANGES


def test_the_dynamic_rules_log_is_the_fallback_when_runs_carry_no_profile(monkeypatch):
    log = {"timestamp": "2026-09-01T00:00:00Z", "null_profiles": [{"column": "x"}], "value_range_profiles": [], "suggested_rules": {}}
    result = profiles(monkeypatch, FakeES(run={"run_id": "r0", "table_name": "t1"}, log_doc=log))
    assert result["null_profiles"] == [{"column": "x"}]
    assert result["source"] == "sdoqap_dynamic_rules_log"


def test_no_runs_and_no_log_is_an_empty_answer_not_an_error(monkeypatch):
    result = profiles(monkeypatch, FakeES())
    assert result["profiles"] == [] and result["source"] == "empty"


def test_no_indices_at_all_is_an_empty_answer(monkeypatch):
    result = profiles(monkeypatch, FakeES(indices=()))
    assert result["profiles"] == [] and result["source"] == "no_index"
