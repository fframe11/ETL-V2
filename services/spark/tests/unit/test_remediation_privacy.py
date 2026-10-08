import auto_remediation_engine as are
from sdoqap.common.redaction import redact_identifiers


def _engine(monkeypatch, schema=None):
    monkeypatch.delenv("ELASTICSEARCH_URL", raising=False)
    monkeypatch.setattr(are.AutoRemediationEngine, "_load_schema", lambda self: schema)
    return are.AutoRemediationEngine("t1", "run_1")


def _sent_prompt(monkeypatch, records, schema=None):
    seen = {}

    def fake_ollama(prompt, model=None):
        seen["prompt"] = prompt
        return {"remediation_rules": []}

    monkeypatch.setattr(are, "call_ollama", fake_ollama)
    engine = _engine(monkeypatch, schema)
    engine.get_synthesized_dsl_rules("null_value_in_score", [{"record": r} for r in records])
    return seen["prompt"]


def test_identifier_values_are_not_sent_to_the_model(monkeypatch):
    prompt = _sent_prompt(monkeypatch, [{"student_id": "S123456", "email": "kim@example.org",
                                         "full_name": "Kim Lee", "score": None}])
    for secret in ("S123456", "kim@example.org", "Kim Lee"):
        assert secret not in prompt
    assert "<redacted>" in prompt


def test_data_values_still_reach_the_model(monkeypatch):
    prompt = _sent_prompt(monkeypatch, [{"student_id": "S1", "score": 150, "reject_reason": "outside range"}])
    assert "150" in prompt and "outside range" in prompt


def test_the_registered_primary_key_is_redacted_even_with_an_odd_name(monkeypatch):
    prompt = _sent_prompt(monkeypatch, [{"rec_key": "K-99887", "score": 5}],
                          schema={"primary_key": "rec_key", "schema_spec": {}})
    assert "K-99887" not in prompt


def test_a_composite_primary_key_given_as_a_list_is_redacted(monkeypatch):
    prompt = _sent_prompt(monkeypatch, [{"a": "AAA111", "b": "BBB222", "score": 5}],
                          schema={"primary_key": ["a", "b"], "schema_spec": {}})
    assert "AAA111" not in prompt and "BBB222" not in prompt


def test_redact_identifiers_accepts_a_list_and_a_comma_string():
    rows = [{"a": "AAA", "b": "BBB", "score": 5}]
    assert redact_identifiers(rows, ["a", "b"])[0] == {"a": "<redacted>", "b": "<redacted>", "score": 5}
    assert redact_identifiers(rows, "a,b")[0] == {"a": "<redacted>", "b": "<redacted>", "score": 5}


def test_a_missing_identifier_value_stays_missing():
    assert redact_identifiers([{"email": None, "score": 5}])[0] == {"email": None, "score": 5}
