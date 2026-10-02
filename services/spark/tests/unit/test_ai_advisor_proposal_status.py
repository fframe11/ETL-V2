import json

import ai_rule_advisor as adv


class _Resp:
    def raise_for_status(self):
        pass


def _logged_docs(monkeypatch, analysis):
    sent = []

    def fake_post(url, headers=None, auth=None, data=None, timeout=None):
        sent.append(json.loads(data))
        return _Resp()

    monkeypatch.setattr(adv.requests, "post", fake_post)
    advisor = adv.AIRuleAdvisor(es_url="http://es.invalid:9200")
    advisor.log_proposal_to_es("t1", "run1", analysis)
    return sent


def test_llm_success_result_is_stored_as_proposed(monkeypatch):
    # Groq/Ollama/heuristic results carry status "SUCCESS"; the approval queue only
    # lists "PROPOSED", so a stored "SUCCESS" doc would never reach a human.
    sent = _logged_docs(monkeypatch, {"status": "SUCCESS", "confidence": 0.9, "suggested_rules": []})
    assert len(sent) == 1
    assert sent[0]["status"] == "PROPOSED"
    assert sent[0]["analysis_result"]["status"] == "SUCCESS"


def test_result_without_status_is_stored_as_proposed(monkeypatch):
    sent = _logged_docs(monkeypatch, {"confidence": 0.9})
    assert sent[0]["status"] == "PROPOSED"


def test_already_proposed_result_stays_proposed(monkeypatch):
    sent = _logged_docs(monkeypatch, {"status": "PROPOSED", "confidence": 0.9})
    assert sent[0]["status"] == "PROPOSED"


def test_failed_analysis_is_not_stored_as_a_proposal(monkeypatch):
    sent = _logged_docs(monkeypatch, {"status": "FAILED", "confidence": 0.0})
    assert sent == []


def test_log_reports_whether_the_proposal_was_stored(monkeypatch):
    monkeypatch.setattr(adv.requests, "post", lambda *a, **k: _Resp())
    advisor = adv.AIRuleAdvisor(es_url="http://es.invalid:9200")
    assert advisor.log_proposal_to_es("t1", "run1", {"status": "SUCCESS"}) is True
    assert advisor.log_proposal_to_es("t1", "run1", {"status": "FAILED"}) is False

    def boom(*a, **k):
        raise ConnectionError("es down")

    monkeypatch.setattr(adv.requests, "post", boom)
    assert advisor.log_proposal_to_es("t1", "run1", {"status": "SUCCESS"}) is False
