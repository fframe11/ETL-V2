import json

import pytest

import ai_rule_advisor as adv

ROWS = [{"student_id": "s1", "score": None, "reject_reason": "missing score"}]
LLM_JSON = {
    "root_cause": "score is empty upstream",
    "suggested_rules": [{"column": "score", "rule_type": "null_check", "params": {}, "reason": "r"}],
    "false_positive_indices": [],
    "recommended_threshold": None,
    "confidence": 0.9,
    "explanation": "e",
}


class _Resp:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self._body = body or {}
        self.text = json.dumps(self._body)

    def json(self):
        return self._body


@pytest.fixture
def advisor(monkeypatch):
    monkeypatch.delenv("ELASTICSEARCH_URL", raising=False)
    monkeypatch.setenv("OLLAMA_URL", "http://ollama.invalid:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen-test")
    return adv.AIRuleAdvisor()


def _route(monkeypatch, groq=None, ollama=None):
    """groq/ollama: a response, an Exception to raise, or None for 'not reachable'."""
    calls = []

    def fake_post(url, **kw):
        which = "groq" if "groq.com" in url else "ollama"
        calls.append(which)
        outcome = groq if which == "groq" else ollama
        if outcome is None or isinstance(outcome, Exception):
            raise outcome or ConnectionError(f"{which} unreachable")
        return outcome

    monkeypatch.setattr(adv.requests, "post", fake_post)
    return calls


def _analyze(advisor):
    return advisor.ai_analyze_quarantined_sample("t1", ROWS, {}, {})


def test_groq_answer_is_labelled_with_engine_and_model(advisor, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-120b")
    groq_ok = _Resp(200, {"choices": [{"message": {"content": json.dumps(LLM_JSON)}}]})
    calls = _route(monkeypatch, groq=groq_ok)
    result = _analyze(advisor)
    assert calls == ["groq"]
    assert result["analysis_metadata"]["method"] == "groq_llm"
    assert result["analysis_metadata"]["model"] == "openai/gpt-oss-120b"


def test_ollama_answers_when_groq_has_no_key(advisor, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "")
    ollama_ok = _Resp(200, {"response": json.dumps(LLM_JSON)})
    calls = _route(monkeypatch, ollama=ollama_ok)
    result = _analyze(advisor)
    assert calls == ["ollama"]
    assert result["status"] == "SUCCESS"
    assert result["analysis_metadata"]["method"] == "ollama_llm"
    assert result["analysis_metadata"]["model"] == "qwen-test"
    assert result["root_cause"] == "score is empty upstream"


def test_ollama_answers_when_groq_returns_an_error(advisor, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    ollama_ok = _Resp(200, {"response": json.dumps(LLM_JSON)})
    calls = _route(monkeypatch, groq=_Resp(500, {"error": "boom"}), ollama=ollama_ok)
    result = _analyze(advisor)
    assert calls == ["groq", "ollama"]
    assert result["analysis_metadata"]["method"] == "ollama_llm"


def test_heuristic_answers_when_no_llm_is_reachable(advisor, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "")
    calls = _route(monkeypatch)
    result = _analyze(advisor)
    assert calls == ["ollama"]
    assert result["analysis_metadata"]["method"] == "local_heuristic_v2"


def test_ollama_returning_garbage_falls_back_to_heuristic(advisor, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "")
    _route(monkeypatch, ollama=_Resp(200, {"response": "not json"}))
    result = _analyze(advisor)
    assert result["analysis_metadata"]["method"] == "local_heuristic_v2"
