import os
import sys

import pytest
from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dynamic_rules  # noqa: E402

ROWS = [{"student_id": "s1", "score": None, "reject_reason": "missing score"}]


class FakeAdvisor:
    def __init__(self, analysis, stored=True):
        self.analysis = analysis
        self.stored = stored
        self.analyzed = None
        self.logged = None

    def ai_analyze_quarantined_sample(self, table, rows, stats, ctx):
        self.analyzed = (table, rows, stats, ctx)
        return self.analysis

    def log_proposal_to_es(self, table, run_id, analysis):
        self.logged = (table, run_id, analysis)
        return self.stored


def _wire(monkeypatch, advisor, rows=ROWS, total=1):
    monkeypatch.setattr(dynamic_rules, "_get_advisor", lambda: advisor)
    monkeypatch.setattr(dynamic_rules, "_read_quarantine_sample", lambda table, limit=20: (rows, total))
    monkeypatch.setattr(dynamic_rules, "_latest_run_context", lambda table: {"total_records": 100})


GROQ_ANALYSIS = {
    "status": "SUCCESS", "confidence": 0.9, "root_cause": "score empty", "suggested_rules": [],
    "analysis_metadata": {"method": "groq_llm", "model": "openai/gpt-oss-120b"},
}


def test_generate_runs_the_advisor_on_real_quarantine_rows_and_stores_the_result(monkeypatch):
    advisor = FakeAdvisor(dict(GROQ_ANALYSIS))
    _wire(monkeypatch, advisor)
    out = dynamic_rules.generate_ai_proposal(table="t1", _user="u")
    assert advisor.analyzed[0] == "t1" and advisor.analyzed[1] == ROWS
    assert advisor.analyzed[3]["total_records"] == 100
    assert advisor.analyzed[3]["quarantined_records"] == 1
    assert advisor.logged[0] == "t1" and advisor.logged[1] == out["run_id"]
    assert out["is_example"] is False and out["stored"] is True
    assert out["method"] == "groq_llm" and out["model"] == "openai/gpt-oss-120b"
    assert out["confidence"] == 0.9


def test_generate_reports_the_rule_based_path_honestly(monkeypatch):
    analysis = dict(GROQ_ANALYSIS, analysis_metadata={"method": "local_heuristic_v2"})
    _wire(monkeypatch, FakeAdvisor(analysis))
    out = dynamic_rules.generate_ai_proposal(table="t1", _user="u")
    assert out["method"] == "local_heuristic_v2" and out["model"] is None


def test_generate_without_quarantine_rows_is_a_404_not_an_invented_proposal(monkeypatch):
    advisor = FakeAdvisor(dict(GROQ_ANALYSIS))
    _wire(monkeypatch, advisor, rows=[], total=0)
    with pytest.raises(HTTPException) as exc:
        dynamic_rules.generate_ai_proposal(table="t1", _user="u")
    assert exc.value.status_code == 404
    assert advisor.analyzed is None


def test_generate_rejects_an_unsafe_table_name(monkeypatch):
    _wire(monkeypatch, FakeAdvisor(dict(GROQ_ANALYSIS)))
    with pytest.raises(HTTPException) as exc:
        dynamic_rules.generate_ai_proposal(table="../etc", _user="u")
    assert exc.value.status_code == 400


def test_generate_fails_loudly_when_the_analysis_failed(monkeypatch):
    advisor = FakeAdvisor({"status": "FAILED", "confidence": 0.0})
    _wire(monkeypatch, advisor)
    with pytest.raises(HTTPException) as exc:
        dynamic_rules.generate_ai_proposal(table="t1", _user="u")
    assert exc.value.status_code == 502
    assert advisor.logged is None


def test_generate_fails_loudly_when_the_proposal_could_not_be_stored(monkeypatch):
    _wire(monkeypatch, FakeAdvisor(dict(GROQ_ANALYSIS), stored=False))
    with pytest.raises(HTTPException) as exc:
        dynamic_rules.generate_ai_proposal(table="t1", _user="u")
    assert exc.value.status_code == 502


def test_approving_an_example_proposal_does_not_claim_a_merge(monkeypatch):
    # The built-in examples were removed with the student presets, so register one here.
    example = {"_id": "prop_example", "table_name": "any_table", "status": "PROPOSED", "suggested_rules": {}}
    monkeypatch.setattr(dynamic_rules, "_FALLBACK_AI_PROPOSALS", [example])
    out = dynamic_rules.approve_proposal("prop_example", _user="u")
    assert out["is_example"] is True
    assert "merged" not in out["message"].lower()
    assert example["status"] == "APPROVED"
