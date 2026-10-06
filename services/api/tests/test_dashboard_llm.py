import json
import os
import sys

import pandas as pd
import pytest
import requests

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_llm  # noqa: E402
from app.api.dashboard_compute import compute_dashboard  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import SpecError, validate_spec  # noqa: E402
from app.api.dashboard_suggest import suggest_from_profile  # noqa: E402

RAW = pd.DataFrame({
    "order_date": ["2025-01-05", "2025-02-03", "2025-03-10"] * 20,
    "region": ["North", "South", "East"] * 20,
    "customer": [f"SECRET-CUSTOMER-{i:03d}" for i in range(60)],
    "amount": [100.0, 200.0, 50.0] * 20,
})
_, PROFILE = prepare_frame(RAW.copy())
LLM_SPEC = {"title": "ยอดขาย", "widgets": [
    {"id": "total", "type": "kpi", "title": "ยอดขายรวม", "metric": {"agg": "sum", "column": "amount"}},
    {"id": "by_region", "type": "bar", "title": "ตามภูมิภาค", "x": "region", "metric": {"agg": "sum", "column": "amount"}},
], "filters": [{"column": "region"}]}


class FakeGroq:
    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []

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


def test_the_prompt_carries_the_profile_but_no_cell_values():
    messages = dashboard_llm.build_generate_messages("sales", PROFILE, "ยอดขายรายเดือน", "business")
    sent = json.dumps(messages, ensure_ascii=False)
    for value in ("SECRET-CUSTOMER", "North", "South", "East"):
        assert value not in sent
    for column in ("order_date", "region", "customer", "amount"):
        assert column in sent
    assert "ยอดขายรายเดือน" in sent and "JSON" in messages[0]["content"]


def test_generate_uses_the_llm_answer(groq):
    fake = groq(json.dumps(LLM_SPEC, ensure_ascii=False))
    result = dashboard_llm.generate_spec("sales", PROFILE, "ยอดขาย", "management")
    assert result["engine"] == "groq" and result["model"] == "openai/gpt-oss-120b"
    assert [w["id"] for w in result["spec"]["widgets"]] == ["total", "by_region"]
    assert result["spec"]["audience"] == "management"
    assert len(fake.calls) == 1


def test_a_rejected_answer_is_retried_once_with_the_reason(groq):
    fake = groq("ขอโทษ ไม่มี JSON", "```json\n" + json.dumps(LLM_SPEC) + "\n```")
    result = dashboard_llm.generate_spec("sales", PROFILE, "ยอดขาย", "business")
    assert result["engine"] == "groq" and len(fake.calls) == 2
    assert "rejected" in fake.calls[1][-1]["content"]


def test_generate_falls_back_to_rules_when_the_llm_keeps_failing(groq):
    groq("{}", "{\"widgets\": []}")
    result = dashboard_llm.generate_spec("sales", PROFILE, "ยอดขาย", "business")
    assert result["engine"] == "rules" and result["model"] is None
    assert result["warnings"][0].startswith("ใช้แดชบอร์ดอัตโนมัติแบบกฎแทน AI")


def test_generate_without_a_key_never_calls_groq(groq):
    fake = groq(key="")
    result = dashboard_llm.generate_spec("sales", PROFILE, "ยอดขาย", "analyst")
    assert result["engine"] == "rules" and fake.calls == []
    assert "Groq API key" in result["warnings"][0]
    assert result["spec"]["audience"] == "analyst"


def test_generate_falls_back_when_groq_is_down(groq):
    groq(dashboard_llm.LLMUnavailable("Groq ตอบกลับ HTTP 503"))
    result = dashboard_llm.generate_spec("sales", PROFILE, "ยอดขาย", "business")
    assert result["engine"] == "rules" and "HTTP 503" in result["warnings"][0]


def test_the_rule_based_spec_uses_the_column_kinds():
    spec, _ = validate_spec(dashboard_llm.fallback_spec(PROFILE, "ยอดขาย"), PROFILE)
    types = [w["type"] for w in spec["widgets"]]
    assert types == ["kpi", "kpi", "line", "bar", "table"]
    line = spec["widgets"][2]
    assert line["x"] == "order_date" and line["metric"] == {"agg": "sum", "column": "amount"}
    assert spec["widgets"][3]["x"] == "region"
    assert [f["column"] for f in spec["filters"]] == ["region", "order_date"]


def test_the_rule_based_spec_works_with_text_only_data():
    _, profile = prepare_frame(pd.DataFrame({"note": [f"n{i}" for i in range(60)]}))
    spec, _ = validate_spec(dashboard_llm.fallback_spec(profile), profile)
    assert [w["type"] for w in spec["widgets"]] == ["kpi", "table"]


def widget_titles(spec):
    return [w["title"] for w in spec["widgets"]]


def test_management_on_text_only_data_still_gets_a_table_beside_the_single_count():
    _, profile = prepare_frame(pd.DataFrame({"note": [f"n{i}" for i in range(60)]}))
    spec, _ = validate_spec(dashboard_llm.fallback_spec(profile, "", "management"), profile)
    assert [w["type"] for w in spec["widgets"]] == ["kpi", "table"]


def test_management_gets_no_detail_table_and_a_period_comparison():
    spec, _ = validate_spec(dashboard_llm.fallback_spec(PROFILE, "ยอดขาย", "management"), PROFILE)
    assert [w["type"] for w in spec["widgets"]] == ["kpi", "kpi", "line", "bar"]
    assert spec["widgets"][0]["compare"] == {"date_column": "order_date", "time_grain": "month"}
    assert spec["title"] == "แดชบอร์ดผู้บริหาร"


def test_an_analyst_gets_a_wider_detail_table_than_the_default():
    wide = pd.DataFrame({f"c{i}": [f"v{n}" for n in range(60)] for i in range(10)})
    _, profile = prepare_frame(wide)
    table = lambda audience: next(w for w in validate_spec(dashboard_llm.fallback_spec(profile, "", audience), profile)[0]["widgets"] if w["type"] == "table")
    assert len(table("business")["columns"]) == 8 and len(table("analyst")["columns"]) == 10


STUDENTS = pd.DataFrame({
    "record_id": list(range(1, 96)) + [1, 2, 3, 4, 5],
    "course": ["A", "B"] * 50,
    "score": [50.0 + i % 40 for i in range(97)] + [None] * 3,
})


def test_a_steward_sees_duplicates_empty_cells_and_value_ranges_of_the_data():
    df, profile = prepare_frame(STUDENTS.copy())
    spec, warnings = validate_spec(dashboard_llm.fallback_spec(profile, "", "steward"), profile)
    assert warnings == [] and spec["title"] == "แดชบอร์ดสุขภาพข้อมูล"
    assert widget_titles(spec) == ["จำนวนแถว", "ค่าไม่ซ้ำของ record_id", "ค่าว่างของ score", "ต่ำสุด score", "สูงสุด score", "ตัวอย่างข้อมูล"]
    values = {w["title"]: compute_dashboard(df, spec, profile)["widgets"][w["id"]].get("value") for w in spec["widgets"] if w["type"] == "kpi"}
    assert values["จำนวนแถว"] == 100 and values["ค่าไม่ซ้ำของ record_id"] == 95 and values["ค่าว่างของ score"] == 3


def test_a_steward_can_filter_the_health_view_by_category_and_by_date():
    df, profile = prepare_frame(RAW.copy())
    spec, warnings = validate_spec(dashboard_llm.fallback_spec(profile, "", "steward"), profile)
    assert warnings == [] and [f["column"] for f in spec["filters"]] == ["region", "order_date"]


def test_a_steward_does_not_see_a_price_as_a_row_key():
    prices = pd.DataFrame({"sku": [f"S{i}" for i in range(100)], "price": [round(1.01 + i * 0.37, 2) for i in range(100)]})
    _, profile = prepare_frame(prices)
    spec, _ = validate_spec(dashboard_llm.fallback_spec(profile, "", "steward"), profile)
    assert widget_titles(spec)[:3] == ["จำนวนแถว", "ค่าไม่ซ้ำของ sku", "ต่ำสุด price"]


QUALITY_RUNS = pd.DataFrame({
    "timestamp": ["2026-10-01T01:00:00Z", "2026-10-02T01:00:00Z", "2026-10-03T01:00:00Z", "2026-10-03T02:00:00Z"],
    "table_name": ["sales", "sales", "users", "users"],
    "total_records": [100, 120, 50, 60],
    "quarantined_records": [5, 40, 1, 2],
    "quality_score": [95.0, 66.7, 98.0, 96.7],
    "gate_result": ["ผ่าน", "ไม่ผ่าน", "ผ่าน", "ผ่าน"],
})


def test_a_steward_gets_a_quality_view_of_the_quality_run_history():
    df, profile = prepare_frame(QUALITY_RUNS.copy())
    spec, warnings = validate_spec(dashboard_llm.fallback_spec(profile, "", "steward"), profile)
    assert warnings == []
    assert widget_titles(spec) == ["คะแนนคุณภาพเฉลี่ย", "แถวที่ถูกกักกัน", "จำนวนรอบที่ตรวจ", "แนวโน้มคะแนนคุณภาพ",
                                   "ตารางที่คะแนนต่ำสุด", "ผลผ่านเกณฑ์", "รอบที่ตรวจล่าสุด"]
    data = compute_dashboard(df, spec, profile)["widgets"]
    by_title = {w["title"]: data[w["id"]] for w in spec["widgets"]}
    assert by_title["แถวที่ถูกกักกัน"]["value"] == 48 and by_title["จำนวนรอบที่ตรวจ"]["value"] == 4
    assert by_title["ตารางที่คะแนนต่ำสุด"]["rows"][0]["x"] == "sales"  # the lowest average score comes first
    assert by_title["รอบที่ตรวจล่าสุด"]["rows"][0]["timestamp"].startswith("2026-10-03T02")


def test_the_rule_fallback_follows_the_audience_the_user_chose(groq):
    groq(dashboard_llm.LLMUnavailable("Groq ตอบกลับ HTTP 503"))
    result = dashboard_llm.generate_spec("sales", PROFILE, "ยอดขาย", "management")
    assert result["engine"] == "rules" and result["spec"]["audience"] == "management"
    assert "table" not in [w["type"] for w in result["spec"]["widgets"]]


def test_the_prompt_tells_the_llm_about_the_steward_and_the_new_aggregation():
    system = dashboard_llm.build_generate_messages("sales", PROFILE, "ตรวจข้อมูล", "steward")[0]["content"]
    assert 'audience "steward"' in system and "count_missing" in system and '"steward"' in system


def test_refine_sends_the_current_spec_and_reports_changes(groq):
    current, _ = validate_spec(LLM_SPEC, PROFILE)
    refined = dict(LLM_SPEC, widgets=LLM_SPEC["widgets"] + [
        {"id": "trend", "type": "line", "title": "ยอดขายรายเดือน", "x": "order_date", "metric": {"agg": "sum", "column": "amount"}}])
    fake = groq(json.dumps(refined, ensure_ascii=False))
    result = dashboard_llm.refine_spec("sales", PROFILE, current, "เพิ่มกราฟยอดขายรายเดือน")
    assert result["changes"]["added"] == ["ยอดขายรายเดือน"] and result["changes"]["removed"] == []
    system, user = fake.calls[0]
    assert "same id" in system["content"]
    sent = json.loads(user["content"])
    assert sent["instruction"] == "เพิ่มกราฟยอดขายรายเดือน" and sent["current_spec"] == current


def test_refine_without_a_key_says_the_ai_is_unavailable(groq):
    groq(key="")
    current, _ = validate_spec(LLM_SPEC, PROFILE)
    with pytest.raises(dashboard_llm.LLMUnavailable):
        dashboard_llm.refine_spec("sales", PROFILE, current, "เพิ่ม Filter")


def test_parse_json_object_finds_the_object_inside_prose():
    assert dashboard_llm.parse_json_object('ok: {"a": 1} done') == {"a": 1}
    with pytest.raises(SpecError):
        dashboard_llm.parse_json_object("no json here")
    with pytest.raises(SpecError):
        dashboard_llm.parse_json_object("{not json}")


class FakeResponse:
    def __init__(self, status, body):
        self.status_code, self._body = status, body
        self.text = json.dumps(body)

    def json(self):
        return self._body


def test_call_groq_asks_for_a_json_object_and_returns_the_content(monkeypatch):
    sent = {}

    def post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        return FakeResponse(200, {"choices": [{"message": {"content": "{\"widgets\": []}"}}]})

    monkeypatch.setattr(dashboard_llm.requests, "post", post)
    assert dashboard_llm.call_groq([{"role": "user", "content": "hi"}], "gsk_test", "openai/gpt-oss-120b") == "{\"widgets\": []}"
    assert sent["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert sent["headers"]["Authorization"] == "Bearer gsk_test"
    assert sent["json"]["model"] == "openai/gpt-oss-120b"
    assert sent["json"]["response_format"] == {"type": "json_object"}


def test_call_groq_errors_do_not_leak_the_response_body(monkeypatch):
    monkeypatch.setattr(dashboard_llm.requests, "post", lambda *a, **k: FakeResponse(401, {"error": {"message": "Invalid API Key"}}))
    with pytest.raises(dashboard_llm.LLMUnavailable) as exc:
        dashboard_llm.call_groq([], "gsk_test", "m")
    assert str(exc.value) == "Groq ตอบกลับ HTTP 401"

    def offline(*a, **k):
        raise requests.ConnectionError("no route")

    monkeypatch.setattr(dashboard_llm.requests, "post", offline)
    with pytest.raises(dashboard_llm.LLMUnavailable):
        dashboard_llm.call_groq([], "gsk_test", "m")


# --- the AI layer over the rule-made suggestions ---------------------------------------------------------

CANDIDATES = suggest_from_profile(PROFILE, "business", dashboard_llm.RANK_CANDIDATES)


def ranked_answer(*items):
    return json.dumps({"suggestions": list(items)}, ensure_ascii=False)


def test_the_ranking_prompt_carries_the_profile_and_candidate_texts_but_no_cell_values(groq):
    fake = groq(ranked_answer({"id": CANDIDATES[0]["id"], "text": CANDIDATES[0]["text"]}))
    dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)
    system, user = fake.calls[0]
    sent = json.dumps([system, user], ensure_ascii=False)
    for value in ("SECRET-CUSTOMER", "North", "South", "East"):
        assert value not in sent
    payload = json.loads(user["content"])
    assert payload["audience"] == "business" and payload["candidates"][0] == {
        "id": CANDIDATES[0]["id"], "rule": CANDIDATES[0]["rule"], "text": CANDIDATES[0]["text"]}
    assert all("widget" not in c for c in payload["candidates"])
    assert "Never add a request that is not a candidate" in system["content"]


def test_the_model_may_reorder_and_reword_but_only_within_the_candidates(groq):
    first, second = CANDIDATES[0], CANDIDATES[1]
    reworded = f"อยากเห็น {first['text']}"
    groq(ranked_answer({"id": second["id"], "text": second["text"]}, {"id": first["id"], "text": reworded},
                       {"id": "R9:invented", "text": "สร้างกราฟที่ไม่มีอยู่จริง"}, {"id": second["id"], "text": "ซ้ำ"}))
    result = dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)
    assert result["engine"] == "groq" and result["model"] == "openai/gpt-oss-120b"
    assert [(s["id"], s["text"]) for s in result["suggestions"]] == [(second["id"], second["text"]), (first["id"], reworded)]


def test_a_reworded_text_that_drops_a_column_name_falls_back_to_the_rule_text(groq):
    named = next(c for c in CANDIDATES if "amount" in c["text"])
    groq(ranked_answer({"id": named["id"], "text": "ดูภาพรวมของยอดทั้งหมด"}, {"id": CANDIDATES[0]["id"], "text": "ok"}))
    result = dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)
    assert result["suggestions"][0]["text"] == named["text"]  # the column name was lost: the original stands
    assert all(s["text"] for s in result["suggestions"])


def test_the_answer_is_capped_and_an_unusable_one_is_an_error(groq):
    many = [{"id": c["id"], "text": c["text"]} for c in CANDIDATES]
    groq(ranked_answer(*many), ranked_answer({"id": "R9:invented", "text": "x"}), "not json", json.dumps({"suggestions": "oops"}))
    assert len(dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)["suggestions"]) == min(len(many), dashboard_llm.RANK_LIMIT)
    # (the cap itself is exercised in test_the_cap_keeps_the_first_choices_in_the_models_order)
    for _ in range(3):
        with pytest.raises(SpecError):
            dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)


def test_ranking_needs_a_key_and_reports_when_groq_is_down(groq):
    groq(key="")
    with pytest.raises(dashboard_llm.LLMUnavailable):
        dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)
    groq(dashboard_llm.LLMUnavailable("Groq ตอบกลับ HTTP 503"))
    with pytest.raises(dashboard_llm.LLMUnavailable):
        dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)


def test_an_id_that_is_not_a_string_is_dropped_instead_of_crashing(groq):
    good = CANDIDATES[0]
    groq(ranked_answer({"id": ["R2:region"], "text": "x"}, {"id": {}, "text": "x"}, {"id": None, "text": "x"},
                       {"id": 7, "text": "x"}, "not an item", {"id": good["id"], "text": good["text"]}))
    result = dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)
    assert [s["id"] for s in result["suggestions"]] == [good["id"]]


def test_the_cap_keeps_the_first_choices_in_the_models_order(groq, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "RANK_LIMIT", 2)
    order = [CANDIDATES[2], CANDIDATES[0], CANDIDATES[3], CANDIDATES[1]]
    groq(ranked_answer(*[{"id": c["id"], "text": c["text"]} for c in order]))
    result = dashboard_llm.rank_suggestions("sales", PROFILE, "business", CANDIDATES)
    assert [s["id"] for s in result["suggestions"]] == [order[0]["id"], order[1]["id"]]


def test_a_column_the_candidate_text_does_not_name_is_not_demanded_of_the_reworded_text(groq):
    period = next(c for c in CANDIDATES if c["rule"] == "R4")
    date_column = period["widget"]["compare"]["date_column"]
    metric = period["widget"]["metric"]["column"]
    assert date_column not in period["text"] and metric in period["text"]
    reworded = f"ช่วงนี้ {metric} ต่างจากช่วงก่อนแค่ไหน"
    groq(ranked_answer({"id": period["id"], "text": reworded}))
    result = dashboard_llm.rank_suggestions("sales", PROFILE, "management", CANDIDATES)
    assert result["suggestions"][0]["text"] == reworded
