import json
import os
import sys
import types

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_llm, semantic_llm  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402

_, PROFILE = prepare_frame(pd.DataFrame({
    "Order_ID": [f"O{i}" for i in range(60)],
    "Customer_Name": [f"SECRET-PERSON-{i}" for i in range(60)],
    "Contact_Email": [f"p{i}@example.com" for i in range(60)],
    "Region": ["North", "South", "East"] * 20,
    "Total_Sales": [100.0, 200.0, 50.0] * 20,
    "Profit": [10.0, 20.0, 5.0] * 20,
}))
ANSWER = {"columns": {
    "Total_Sales": {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False},
    "Contact_Email": {"role": "text", "label": "อีเมล", "pii": False},
    "Region": {"role": "dimension", "label": "ภูมิภาค", "pii": False},
}, "metrics": [
    {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
     "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent"},
    {"id": "emails", "label": "อีเมลไม่ซ้ำ", "type": "simple", "measure": {"agg": "count_distinct", "column": "Contact_Email"}},
]}


class FakeGroq:
    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, messages, api_key, model):
        self.calls.append(messages)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def groq(monkeypatch):
    def install(*answers, key="gsk_test"):
        fake = FakeGroq(*answers)
        monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: (key, "openai/gpt-oss-120b"))
        monkeypatch.setattr(dashboard_llm, "call_groq", fake)
        return fake
    return install


def test_the_prompt_has_no_cell_values_and_no_hidden_column_names():
    visible = {**PROFILE, "columns": [c for c in PROFILE["columns"] if c["name"] != "Customer_Name"]}
    sent = json.dumps(semantic_llm.build_messages("sales", visible), ensure_ascii=False)
    for value in ("SECRET-PERSON", "example.com", "North", "Customer_Name"):
        assert value not in sent
    assert "Total_Sales" in sent and "hint_role" in sent and "hint_pii" in sent and "JSON" in sent


def test_the_llm_draft_covers_every_column_and_keeps_hidden_ones_private(groq):
    fake = groq(json.dumps(ANSWER, ensure_ascii=False))
    result = semantic_llm.draft_semantic("sales", PROFILE, hidden=["Customer_Name"])
    assert result["engine"] == "groq" and result["model"] == "openai/gpt-oss-120b"
    columns = result["semantic"]["columns"]
    assert set(columns) == {c["name"] for c in PROFILE["columns"]}
    assert columns["Total_Sales"]["currency"] == "USD"
    assert columns["Customer_Name"]["pii"] is True
    assert "Customer_Name" not in json.dumps(fake.calls[0], ensure_ascii=False)


def test_the_name_rule_overrides_an_llm_that_says_a_contact_column_is_not_personal(groq):
    groq(json.dumps(ANSWER, ensure_ascii=False))
    result = semantic_llm.draft_semantic("sales", PROFILE, hidden=["Customer_Name"])
    assert result["semantic"]["columns"]["Contact_Email"]["pii"] is True
    assert any("Contact_Email" in w for w in result["warnings"])
    assert [m["id"] for m in result["semantic"]["metrics"]] == ["gross_margin"]  # the e-mail metric is dropped
    assert any("อีเมลไม่ซ้ำ" in w for w in result["warnings"])


def test_a_rejected_answer_is_retried_once_then_the_rules_are_used(groq):
    fake = groq("ไม่มี JSON", "{}")
    result = semantic_llm.draft_semantic("sales", PROFILE)
    assert len(fake.calls) == 2 and "rejected" in fake.calls[1][-1]["content"]
    assert result["engine"] == "rules" and result["model"] is None
    assert result["warnings"][0].startswith("ใช้ร่างแบบกฎแทน AI")
    assert result["semantic"]["columns"]["Customer_Name"]["pii"] is True


def test_no_key_or_groq_down_uses_the_rules(groq):
    fake = groq(key="")
    assert semantic_llm.draft_semantic("sales", PROFILE)["engine"] == "rules" and fake.calls == []
    groq(dashboard_llm.LLMUnavailable("Groq ตอบกลับ HTTP 503"))
    result = semantic_llm.draft_semantic("sales", PROFILE)
    assert result["engine"] == "rules" and "HTTP 503" in result["warnings"][0]


def test_a_slow_rejected_answer_is_not_retried(groq, monkeypatch):
    fake = groq("ไม่มี JSON", json.dumps(ANSWER, ensure_ascii=False))
    ticks = iter([0.0, 26.0])
    monkeypatch.setattr(semantic_llm, "time", types.SimpleNamespace(monotonic=lambda: next(ticks)))
    result = semantic_llm.draft_semantic("sales", PROFILE)
    assert len(fake.calls) == 1 and result["engine"] == "rules"
