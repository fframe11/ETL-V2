import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import lineage  # noqa: E402


class FakeES:
    """Answers the three searches trust-check makes."""

    def __init__(self, run):
        self.run = run
        self.indices = self

    def exists(self, index):
        return True

    def search(self, index, body):
        if index == "sdoqap_quality_runs":
            return {"hits": {"hits": [{"_source": self.run}]}}
        return {"hits": {"total": {"value": 0}, "hits": []}}


RUN = {"run_id": "r1", "timestamp": "2026-10-01T00:00:00Z", "quality_score": 90.8,
       "quarantined_records": 23, "clean_records": 227}


def check(monkeypatch, run, rules):
    monkeypatch.setattr(lineage, "get_es_client", lambda: FakeES(run))
    monkeypatch.setattr(lineage, "_load_rules_config", lambda: rules)
    return lineage.get_table_trust_check("t1")


def test_threshold_the_engine_applied_to_the_run_decides(monkeypatch):
    # The engine stores the threshold it used on each run (effective_quality_threshold).
    result = check(monkeypatch, {**RUN, "effective_quality_threshold": 97.0},
                   {"_default": {"quality_score_threshold": {"mode": "adaptive", "base_value": 90.0}}})
    assert result["quality_threshold"] == 97.0
    assert result["is_safe_to_consume"] is False
    assert result["recommendation"] == "HALT_INGEST"


def test_table_override_from_the_rules_registry_is_used_when_the_run_has_none(monkeypatch):
    rules = {"_default": {"quality_score_threshold": {"mode": "adaptive", "base_value": 90.0, "min_value": 70.0}},
             "t1": {"quality_score_threshold": {"mode": "static", "base_value": 97.0}}}
    result = check(monkeypatch, RUN, rules)
    assert result["quality_threshold"] == 97.0
    assert result["is_safe_to_consume"] is False


def test_default_threshold_applies_to_a_table_without_an_override(monkeypatch):
    result = check(monkeypatch, RUN, {"_default": {"quality_score_threshold": {"base_value": 85.0}}})
    assert result["quality_threshold"] == 85.0
    assert result["is_safe_to_consume"] is True


def test_flat_numeric_threshold_is_accepted(monkeypatch):
    assert check(monkeypatch, RUN, {"t1": {"quality_score_threshold": 95}})["quality_threshold"] == 95


def test_90_is_the_last_resort_when_nothing_is_configured(monkeypatch):
    assert check(monkeypatch, RUN, {})["quality_threshold"] == 90.0
