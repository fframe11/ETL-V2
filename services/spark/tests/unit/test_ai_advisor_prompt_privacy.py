import ai_rule_advisor as adv


def _prompt(rows, ctx=None):
    advisor = adv.AIRuleAdvisor(es_url="")
    return advisor._build_analysis_prompt("t1", rows, {}, ctx or {})


def test_identifier_columns_are_not_sent_to_the_model():
    rows = [{"student_id": "S123456", "email": "kim@example.org", "full_name": "Kim Lee",
             "score": 150, "reject_reason": "outside range"}]
    prompt = _prompt(rows)
    for secret in ("S123456", "kim@example.org", "Kim Lee"):
        assert secret not in prompt
    assert "<redacted>" in prompt


def test_data_values_and_reasons_still_reach_the_model():
    prompt = _prompt([{"student_id": "S1", "score": 150, "reject_reason": "outside range"}])
    assert "150" in prompt and "outside range" in prompt


def test_the_declared_primary_key_is_redacted_even_with_an_odd_name():
    prompt = _prompt([{"rec_key": "K-99887", "score": 5}], {"primary_key": "rec_key"})
    assert "K-99887" not in prompt


def test_composite_primary_key_columns_are_all_redacted():
    prompt = _prompt([{"a": "AAA111", "b": "BBB222", "score": 5}], {"primary_key": "a,b"})
    assert "AAA111" not in prompt and "BBB222" not in prompt
