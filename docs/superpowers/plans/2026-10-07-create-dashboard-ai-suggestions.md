# Create Dashboard AI Suggestion Layer Implementation Plan (ระยะ 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้กดปุ่ม "เรียบเรียงด้วย AI" ในขั้น "ระบุความต้องการ" เพื่อให้ Groq จัดอันดับและเรียบเรียงคำแนะนำที่กฎสร้างไว้แล้ว ให้เหมาะกับกลุ่มผู้ใช้ที่เลือก และให้ AI ที่ปรับแดชบอร์ดเห็นรายการสิ่งที่แดชบอร์ดยังขาดเพื่อตีความคำสั่งกำกวม โดยถ้า AI ล้ม ผู้ใช้ยังเห็นคำแนะนำจากกฎต่อไป

**Architecture:** (1) ฟังก์ชัน `rank_suggestions(table_name, profile, audience, candidates)` ใน `dashboard_llm.py` ส่งโปรไฟล์คอลัมน์กับข้อความของรายการผู้สมัคร (ชื่อคอลัมน์เท่านั้น ไม่มีค่าข้อมูล) ให้ Groq แล้วตรวจคำตอบ: เลือกได้เฉพาะ id ที่เป็นผู้สมัคร ไม่ซ้ำ ไม่เกิน 6 รายการ ข้อความที่เรียบเรียงใหม่ต้องยังมีชื่อคอลัมน์ทุกตัวที่ข้อความเดิมมี ไม่เช่นนั้นใช้ข้อความเดิม สิ่งที่ AI เพิ่มเองไม่ผ่านการตรวจ (2) endpoint `POST /api/v1/dashboards/rank-suggestions` ดึงผู้สมัครจาก `suggest_from_profile` (ไม่เกิน 12) แล้วเรียกฟังก์ชันนั้น ตอบ 503 เมื่อไม่มี key หรือ Groq ล้ม และ 422 เมื่อคำตอบใช้ไม่ได้ (3) prompt ของการปรับแดชบอร์ดได้คีย์ `suggested_changes` จาก `suggest_refinements` (4) UI: ปุ่มใน `ContextForm` เรียก endpoint แล้วแทนรายการการ์ดเมื่อสำเร็จ แสดงป้าย "จัดลำดับและเรียบเรียงโดย AI" และกลับไปใช้รายการจากกฎเมื่อเปลี่ยนกลุ่มผู้ใช้

**Tech Stack:** FastAPI + requests (Groq), pytest, React 18 + Vitest 2 + Testing Library, Git Bash

**Spec:** [`docs/create-dashboard-improvement-proposal.md`](../../create-dashboard-improvement-proposal.md) หัวข้อ 3.1 (ชั้น 2 AI), 5.3 (การใช้ AI ชั้นเสริม) และ 7 (ระยะ 4)

**คำตัดสินเชิงออกแบบที่ทำไว้ก่อนเขียนแผน (spec ไม่ได้ระบุ):**
- **เรียก AI เมื่อกดปุ่มเท่านั้น** ไม่เรียกอัตโนมัติตอนเปิดขั้นหรือเปลี่ยนกลุ่มผู้ใช้ เพราะเป็นการส่งข้อมูลออกไปบริการภายนอกและอาจช้า (spec เรียกชั้นนี้ว่า "ทางเลือก")
- **AI เลือกและเรียบเรียงได้เฉพาะจากรายการที่กฎสร้างไว้** เพิ่มรายการใหม่เองไม่ได้ จึงไม่เสี่ยงคำแนะนำที่สร้างแดชบอร์ดไม่ได้ (ผู้สมัครทุกตัวมี widget ที่ผ่าน `validate_spec` โดยการสร้างอยู่แล้ว การตรวจจึงเป็นการตรวจว่า id อยู่ในรายการ ไม่ต้องตรวจ widget ซ้ำ)
- **ข้อความที่เรียบเรียงต้องคงชื่อคอลัมน์เดิม** ที่ข้อความเดิมระบุ เพื่อกันการ "เรียบเรียง" ที่เปลี่ยนความหมายหรือลืมคอลัมน์ ถ้าไม่ผ่านใช้ข้อความเดิมของกฎ
- **ไม่ลองซ้ำเมื่อ AI ตอบผิดรูป** (ต่างจากการสร้างแดชบอร์ด) เพราะคำแนะนำมีรายการสำรองจากกฎอยู่แล้ว และ proxy หน้าบ้านตัดที่ 30 วินาที ส่วน timeout ต่อครั้งของ Groq คือ 20 วินาทีตามเดิม
- **รายการช่องว่างที่ส่งไปพร้อม prompt ปรับ** เป็นข้อความอย่างเดียว (ไม่ใช่ spec) และ prompt สั่งให้ใช้เพื่อตีความคำสั่งกำกวมเท่านั้น ห้ามทำตามข้อที่ผู้ใช้ไม่ได้ขอ

**ขอบเขตที่ตั้งใจเลื่อนไป (ไม่ทำในแผนนี้):**
- ให้ AI เรียบเรียงคำแนะนำปรับแดชบอร์ด (G1 ถึง G6) ในแผงปรับด้วย AI (ระยะนี้ทำเฉพาะคำแนะนำในขั้น "ระบุความต้องการ")
- แคชผลของ AI ต่อ (ตาราง กลุ่มผู้ใช้) และเพดานจำนวนครั้งที่เรียก
- กฎ G7, "บันทึกเป็นฉบับใหม่", ระบบสิทธิ์จริง, Semantic Layer

## Global Constraints

- ทำใน worktree ที่มีอยู่แล้ว `C:\ETL\.claude\worktrees\ai-suggestions` บน branch `feat/ai-suggestions` ห้าม commit ลง `main` หรือ `feat/generic-profiling-rule-engine` โดยตรง
- Commit message แบบ conventional (`feat(dashboard): ...`) **ไม่ใส่ attribution line ใดๆ** (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- stage เฉพาะไฟล์ที่ Task ระบุ ห้ามใช้ `git add -A`, `git add .` หรือ `git commit -a`
- **Line ending:** ไฟล์ที่แผนนี้แตะเป็น LF ทั้งหมด (ตรวจด้วย `git ls-files --eol <ไฟล์>` ก่อนแก้) ห้ามแก้ไฟล์ด้วย Python แบบ text mode บน Windows เพราะจะเขียนเป็น CRLF ทั้งไฟล์ ใช้ Edit tool หรือเปิดไฟล์ด้วย `newline=''` และเทียบ `git diff --stat` ว่าไม่บวมผิดปกติหลังแก้
- **ความเป็นส่วนตัว (สำคัญที่สุดของแผนนี้):** prompt ที่ส่ง Groq ในแผนนี้มีได้เฉพาะ (ก) โปรไฟล์คอลัมน์จาก `profile_for_prompt` (ชื่อ ชนิด จำนวนค่าไม่ซ้ำ % ค่าว่าง ช่วงตัวเลขและวันที่ที่ไม่ใช่รหัส) (ข) ข้อความของรายการผู้สมัคร (ชื่อคอลัมน์กับคำอธิบาย ไม่มีค่าในเซลล์) (ค) ชื่อตารางและกลุ่มผู้ใช้ ห้ามส่งแถวข้อมูล ห้ามส่งค่าหมวดหมู่ ห้ามส่ง `widget` ของผู้สมัคร เทสต์ต้องตรวจเรื่องนี้ด้วยค่าที่รู้ว่าไม่ควรหลุด
- **ไม่เรียก AI อัตโนมัติ:** เส้นทางคำแนะนำจากกฎ (`GET .../suggestions`, `POST /suggest-changes`) ยังไม่เรียก LLM ต้องไม่เปลี่ยน การเรียก AI เกิดจากการกดปุ่มเท่านั้น
- **ข้อความหน้าจอ (กติกาของโปรเจกต์):** ห้ามมี em dash หรือ en dash ห้ามใช้ emoji ปุ่มใช้คำสั้น 1 ถึง 3 คำ
- **ชื่อ endpoint ใหม่:** ต้องเป็น `/dashboards/rank-suggestions` ห้ามมีสตริง `/dashboards/refine`, `/dashboards/datasets` หรือ `/suggestions` (ขึ้นต้นด้วยสแลช) อยู่ข้างใน เพราะ mock ของเทสต์ UI (`mockFetchByUrl`, `controlledFetch`) จับ URL แบบ "มีสตริงนี้อยู่"
- **การทดสอบ UI:** route ที่ยาวกว่าต้องมาก่อน `/dashboards/datasets` เสมอ
- **คำสั่งทดสอบ:**
  - API: `cd services/api && python -m pytest tests -q -k dashboard`
  - UI: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
  - เทสต์ API ทั้งชุดใน worktree ล้ม 9 ตัวใน `tests/test_whitebox_engine.py` เพราะไฟล์ข้อมูลที่ git ไม่ติดตาม (`dirty_dataset.csv`) ไม่อยู่ใน worktree ถือเป็นเรื่องของสภาพแวดล้อม ไม่ใช่ความผิดของงานนี้
- **การดูผลบนระบบจริง:** `sdoqap-api` และ `sdoqap-ui` เป็น Docker image ที่ build ไว้ (ผู้ควบคุมทำหลัง merge ห้ามรัน docker ใน Task ใดของแผนนี้)
- รูปแบบรายการผู้สมัครที่ `suggest_from_profile` คืน: `{"id": str, "rule": str, "text": str, "widget": {...}}`; `widget` มีคีย์ `x`, `group_by`, `metric` (`{"agg", "column"}`), `compare` (`{"date_column", "time_grain"}`) บางตัวตามชนิด

---

### Task 1: ชั้น AI ที่เลือกและเรียบเรียงคำแนะนำ (ฟังก์ชันใน `dashboard_llm.py`)

**Files:**
- Modify: `services/api/app/api/dashboard_llm.py` (ต่อท้ายไฟล์)
- Test: `services/api/tests/test_dashboard_llm.py`

**Interfaces:**
- Consumes: `groq_settings()`, `call_groq(messages, key, model)`, `profile_for_prompt(profile)`, `parse_json_object(text)`, `LLMUnavailable`, `SpecError` ที่มีอยู่ในไฟล์; ในไฟล์ทดสอบ `groq` fixture (ตัวปลอมของ Groq ที่มี `.calls`), `PROFILE`, `LLM_SPEC`, `validate_spec`
- Produces: `RANK_CANDIDATES = 12`, `RANK_LIMIT = 6`, `RANK_TEXT_MAX = 200`, `RANK_PROMPT`; `rank_suggestions(table_name, profile, audience, candidates) -> {"suggestions": [{"id", "rule", "text"}], "engine": "groq", "model": str}` (ผู้สมัครเป็นรายการจาก `suggest_from_profile`); raise `LLMUnavailable` เมื่อไม่มี key หรือ Groq ล้ม และ `SpecError` เมื่อคำตอบไม่มี JSON, ไม่มีรายการ หรือไม่มีรายการที่ใช้ได้เลย

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ใน `services/api/tests/test_dashboard_llm.py`

(ก) ต่อจากบรรทัด `from app.api.dashboard_spec import SpecError, validate_spec  # noqa: E402` เพิ่ม

```python
from app.api.dashboard_suggest import suggest_from_profile  # noqa: E402
```

(ข) ต่อท้ายไฟล์

```python
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
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboard_llm.py -q -k "ranking or reorder or reworded or capped"`
Expected: FAIL (`AttributeError: module 'app.api.dashboard_llm' has no attribute 'rank_suggestions'` หรือ `RANK_CANDIDATES`; โมดูลทดสอบโหลดไม่ผ่านเพราะ `RANK_CANDIDATES` ใช้ตอนนิยาม `CANDIDATES`)

- [ ] **Step 3: เขียนโค้ด**

ต่อท้าย `services/api/app/api/dashboard_llm.py` (เว้นสองบรรทัดว่างจากฟังก์ชัน `refine_spec`)

```python
RANK_CANDIDATES = 12  # how many rule-made suggestions the model may choose from
RANK_LIMIT = 6        # how many it may return
RANK_TEXT_MAX = 200

RANK_PROMPT = """You choose and reword requests for a dashboard builder.
Reply with ONE JSON object and nothing else: {"suggestions": [{"id": string, "text": string}]}
- "candidates" are requests the builder can already fulfil. Choose at most 6 of them, by "id", and put the most useful first for the reader named in "audience".
- Reword each "text" as one short, plain sentence in the language of the candidate text, the way that reader would ask for it. Keep every column name exactly as it is written in the candidate text.
- Never add a request that is not a candidate. Never invent columns or numbers.
- audience "business": what sells or what is largest. "analyst": breakdowns and comparisons. "management": headline numbers, trends and period comparisons. "steward": data health, duplicates, empty cells and value ranges."""


def _columns_of(widget):
    """The column names a suggestion's widget draws on."""
    names = [widget.get("x"), widget.get("group_by"), (widget.get("metric") or {}).get("column"),
             (widget.get("compare") or {}).get("date_column")]
    return [n for n in names if isinstance(n, str)]


def _validate_ranking(raw, candidates):
    """The model's choice, checked: only candidate ids, each once, at most RANK_LIMIT. A reworded text is
    kept only when it still names every column the candidate's own text names; otherwise the candidate's
    text stands. Nothing the model adds on its own survives."""
    by_id = {c["id"]: c for c in candidates}
    items = raw.get("suggestions") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        raise SpecError("คำตอบของ AI ไม่มีรายการคำแนะนำ")
    ranked, seen = [], set()
    for item in items:
        if not isinstance(item, dict) or item.get("id") not in by_id or item["id"] in seen:
            continue
        candidate = by_id[item["id"]]
        seen.add(candidate["id"])
        text = item.get("text").strip() if isinstance(item.get("text"), str) else ""
        anchors = [n for n in _columns_of(candidate["widget"]) if n in candidate["text"]]
        keeps = 5 <= len(text) <= RANK_TEXT_MAX and all(n in text for n in anchors)
        ranked.append({"id": candidate["id"], "rule": candidate["rule"], "text": text if keeps else candidate["text"]})
        if len(ranked) == RANK_LIMIT:
            break
    if not ranked:
        raise SpecError("AI ไม่ได้เลือกคำแนะนำที่ใช้ได้")
    return ranked


def rank_suggestions(table_name, profile, audience, candidates):
    """The suggestions in the order and wording the model prefers for this reader. Raises LLMUnavailable or SpecError;
    the caller keeps the rule-made list in that case. The prompt carries the column profile and the candidate texts
    (which name columns), never a cell value."""
    key, model = groq_settings()
    if not key:
        raise LLMUnavailable("ยังไม่ได้ตั้งค่า Groq API key")
    user = {"dataset": table_name, "audience": audience, "profile": profile_for_prompt(profile),
            "candidates": [{"id": c["id"], "rule": c["rule"], "text": c["text"]} for c in candidates]}
    messages = [{"role": "system", "content": RANK_PROMPT},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]
    ranked = _validate_ranking(parse_json_object(call_groq(messages, key, model)), candidates)
    return {"suggestions": ranked, "engine": "groq", "model": model}
```

- [ ] **Step 4: รันให้ผ่านทั้งชุด**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_llm.py services/api/tests/test_dashboard_llm.py
git commit -m "feat(dashboard): let the model choose and reword the rule-made suggestions"
```

---

### Task 2: endpoint จัดอันดับคำแนะนำด้วย AI

**Files:**
- Modify: `services/api/app/api/dashboards.py`
- Test: `services/api/tests/test_dashboards_api.py`

**Interfaces:**
- Consumes: `dashboard_llm.rank_suggestions`, `dashboard_llm.RANK_CANDIDATES`, `dashboard_llm.LLMUnavailable`, `SpecError`, `dashboard_suggest.suggest_from_profile`, `_audience(value)`, `dashboard_data.load_active_dataset`; ในไฟล์ทดสอบ `weekly` fixture, `suggestions(audience)`, `client()`, `llm_answers(monkeypatch, *answers)` และ `json`
- Produces: `POST /api/v1/dashboards/rank-suggestions` body `{"table_name": str, "audience": str = "business"}` → `{"suggestions": [{"id","rule","text"}], "engine": "groq"|"rules", "model": str|None}`; ไม่มีผู้สมัครเลยได้ `{"suggestions": [], "engine": "rules", "model": null}` โดยไม่เรียก AI; ไม่มี key หรือ Groq ล้ม 503; คำตอบใช้ไม่ได้ 422; audience ไม่รู้จัก 400; ต้อง login

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ใน `services/api/tests/test_dashboards_api.py`

(ก) ในฟังก์ชัน `test_every_route_needs_a_login` เปลี่ยนบรรทัด

```python
    for path in ("generate", "refine", "render", "suggest-changes"):
```

เป็น

```python
    for path in ("generate", "refine", "render", "suggest-changes", "rank-suggestions"):
```

(ข) ต่อท้ายไฟล์

```python
def rank(audience="business", table="weekly"):
    return client().post("/api/v1/dashboards/rank-suggestions", json={"table_name": table, "audience": audience})


def test_the_ai_reorders_and_rewords_the_rule_made_suggestions(weekly, monkeypatch):
    rule_made = suggestions().json()["suggestions"]
    first, last = rule_made[0], rule_made[-1]
    llm_answers(monkeypatch, json.dumps({"suggestions": [
        {"id": last["id"], "text": last["text"]}, {"id": first["id"], "text": f"ช่วยทำ {first['text']}"}]}, ensure_ascii=False))
    res = rank()
    assert res.status_code == 200
    body = res.json()
    assert body["engine"] == "groq" and body["model"] == "openai/gpt-oss-120b"
    assert [(s["id"], s["rule"]) for s in body["suggestions"]] == [(last["id"], last["rule"]), (first["id"], first["rule"])]
    assert body["suggestions"][1]["text"] == f"ช่วยทำ {first['text']}"
    assert all(set(s) == {"id", "rule", "text"} for s in body["suggestions"])


def test_ranking_without_a_groq_key_is_a_clear_503_and_the_rule_list_is_untouched(weekly):
    res = rank()
    assert res.status_code == 503 and "ยังไม่ได้ตั้งค่า Groq API key" in res.json()["detail"]
    assert suggestions().status_code == 200


def test_an_unusable_ai_answer_is_a_422(weekly, monkeypatch):
    llm_answers(monkeypatch, json.dumps({"suggestions": [{"id": "R9:invented", "text": "x"}]}))
    res = rank()
    assert res.status_code == 422 and "AI ตอบคำแนะนำที่ใช้ไม่ได้" in res.json()["detail"]


def test_ranking_follows_the_audience_and_rejects_an_unknown_one(weekly, monkeypatch):
    seen = []
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))

    def answer(messages, key, model):
        payload = json.loads(messages[1]["content"])
        seen.append(payload["audience"])
        return json.dumps({"suggestions": [{"id": payload["candidates"][0]["id"], "text": payload["candidates"][0]["text"]}]})
    monkeypatch.setattr(dashboard_llm, "call_groq", answer)
    assert rank("steward").status_code == 200 and seen == ["steward"]
    assert rank("ceo").status_code == 400
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboards_api.py -q -k "rank or login or ai_ or unusable"`
Expected: FAIL (route ยังไม่มี: 404 แทน 401/200/503/422/400)

- [ ] **Step 3: เพิ่ม endpoint**

ใน `services/api/app/api/dashboards.py`

(ก) ก่อนคลาส `class RenderPayload(BaseModel):` เพิ่ม

```python
class RankPayload(BaseModel):
    table_name: str
    audience: str = "business"


```

(ข) ก่อน `@router.post("/generate")` เพิ่ม

```python
@router.post("/rank-suggestions")
def rank_dashboard_suggestions(payload: RankPayload):
    audience = _audience(payload.audience)
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    candidates = dashboard_suggest.suggest_from_profile(profile, audience, dashboard_llm.RANK_CANDIDATES)
    if not candidates:
        return {"suggestions": [], "engine": "rules", "model": None}
    try:
        return dashboard_llm.rank_suggestions(payload.table_name, profile, audience, candidates)
    except dashboard_llm.LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"เรียบเรียงด้วย AI ไม่ได้ตอนนี้: {exc}")
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"AI ตอบคำแนะนำที่ใช้ไม่ได้: {exc}")


```

(`dashboard_llm`, `dashboard_suggest`, `SpecError` ถูก import ที่หัวไฟล์แล้ว)

- [ ] **Step 4: รันให้ผ่านทั้งชุด**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboards.py services/api/tests/test_dashboards_api.py
git commit -m "feat(dashboard): serve AI-ranked suggestions with a rule-made fallback"
```

---

### Task 3: ส่งรายการช่องว่างไปพร้อม prompt ปรับแดชบอร์ด

**Files:**
- Modify: `services/api/app/api/dashboard_llm.py`
- Test: `services/api/tests/test_dashboard_llm.py`

**Interfaces:**
- Consumes: `suggest_refinements(profile, spec)` จาก `dashboard_suggest` (รับ spec ที่ผ่าน `validate_spec` แล้ว) ซึ่ง `refine_spec` ได้รับอยู่แล้ว; ในไฟล์ทดสอบ `groq` fixture, `PROFILE`, `LLM_SPEC`
- Produces: ข้อความผู้ใช้ของการปรับแดชบอร์ด (`build_refine_messages`) มีคีย์ `"suggested_changes": [str, ...]` และ `REFINE_RULES` มีประโยคอธิบายการใช้ รูปแบบอื่นของ prompt ไม่เปลี่ยน

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ต่อท้าย `services/api/tests/test_dashboard_llm.py`

```python
def test_the_refine_prompt_lists_what_the_dashboard_still_lacks(groq):
    current, _ = validate_spec(LLM_SPEC, PROFILE)
    fake = groq(json.dumps(LLM_SPEC, ensure_ascii=False))
    dashboard_llm.refine_spec("sales", PROFILE, current, "ทำให้ดูง่ายขึ้น")
    system, user = fake.calls[0]
    sent = json.loads(user["content"])
    assert sent["suggested_changes"] and any("แนวโน้ม" in t for t in sent["suggested_changes"])
    assert all(isinstance(t, str) for t in sent["suggested_changes"])
    assert "never apply a suggested change the instruction did not ask for" in system["content"]
    for value in ("SECRET-CUSTOMER", "North", "South", "East"):
        assert value not in json.dumps([system, user], ensure_ascii=False)
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboard_llm.py -q -k "still_lacks"`
Expected: FAIL (`KeyError: 'suggested_changes'`)

- [ ] **Step 3: เพิ่มรายการช่องว่างใน prompt**

ใน `services/api/app/api/dashboard_llm.py` ทำ 3 การแก้

(ก) เปลี่ยนบรรทัด import

```python
from .dashboard_suggest import emptiest_columns, is_identifier, key_like_columns
```

เป็น

```python
from .dashboard_suggest import emptiest_columns, is_identifier, key_like_columns, suggest_refinements
```

(ข) ใน `REFINE_RULES` แทนบรรทัดสุดท้าย

```
Return the complete updated spec."""
```

ด้วย

```
Return the complete updated spec.
"suggested_changes" lists what this dashboard still lacks. Use it only to read a vague instruction against what the data supports; never apply a suggested change the instruction did not ask for."""
```

(ค) ใน `build_refine_messages` แทน

```python
    user = {"dataset": table_name, "profile": profile_for_prompt(profile), "current_spec": spec,
            "instruction": instruction}
```

ด้วย

```python
    user = {"dataset": table_name, "profile": profile_for_prompt(profile), "current_spec": spec,
            "suggested_changes": [s["text"] for s in suggest_refinements(profile, spec)], "instruction": instruction}
```

- [ ] **Step 4: รันให้ผ่านทั้งชุด**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด (เทสต์เดิมของการปรับแดชบอร์ดที่ตรวจ `sent["current_spec"] == current` ต้องผ่านโดยไม่แก้)

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_llm.py services/api/tests/test_dashboard_llm.py
git commit -m "feat(dashboard): tell the refining model what the dashboard still lacks"
```

---

### Task 4: UI, ปุ่ม "เรียบเรียงด้วย AI"

**Files:**
- Modify: `services/ui/src/utils/dashboardsApi.js`
- Modify: `services/ui/src/components/builder/ContextForm.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.css`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx`

**Interfaces:**
- Consumes: endpoint ของ Task 2 (`{ suggestions: [{id, rule, text}], engine, model }` หรือ 503/422 พร้อม `detail`); ในเทสต์ `openRequestStep(extra)`, `settle`, `EXAMPLE`, `fetch` ที่ถูก mock; `vi`, `act`, `fireEvent`, `screen` ที่ import ไว้แล้ว
- Produces: `dashboardsApi.rankSuggestions(table_name, audience)`; ปุ่มชื่อ "เรียบเรียงด้วย AI" (ขณะทำงาน "AI กำลังเรียบเรียง…") ใน `ContextForm` ที่เมื่อสำเร็จแทนรายการการ์ดและแสดง "จัดลำดับและเรียบเรียงโดย AI ({model})" เมื่อล้มแสดงข้อความของ API และคงรายการเดิม เมื่อเปลี่ยนกลุ่มผู้ใช้กลับไปรายการจากกฎและทิ้งคำตอบของ AI ที่มาช้า

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ใน `services/ui/src/pages/DashboardBuilder.test.jsx` แทรกทันทีก่อนเทสต์ `it("says so when the dataset has no suggestions or they cannot be loaded, and still lets the user type", async () => {`

```jsx
const RANKED_TEXT = "ดูแนวโน้มยอดขายรายสัปดาห์ ตาม order_date";
const RANKED = { engine: "groq", model: "openai/gpt-oss-120b", suggestions: [{ id: "R1:amount:order_date", rule: "R1", text: RANKED_TEXT }] };
const rankButton = () => screen.getByRole("button", { name: "เรียบเรียงด้วย AI" });
const rankCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes("/dashboards/rank-suggestions"));

it("lets the user ask the AI to reorder and reword the suggestions", async () => {
  await openRequestStep([["/dashboards/rank-suggestions", { body: RANKED }]]);
  fireEvent.click(rankButton());
  await settle();
  expect(JSON.parse(rankCalls()[0][1].body)).toEqual({ table_name: "sales", audience: "business" });
  expect(screen.getByRole("button", { name: RANKED_TEXT })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: EXAMPLE })).toBeNull();
  expect(screen.getByText("จัดลำดับและเรียบเรียงโดย AI (openai/gpt-oss-120b)")).toBeInTheDocument();
});

it("keeps the rule-made suggestions and says why when the AI cannot help", async () => {
  await openRequestStep([["/dashboards/rank-suggestions", { status: 503, body: { detail: "เรียบเรียงด้วย AI ไม่ได้ตอนนี้: ยังไม่ได้ตั้งค่า Groq API key" } }]]);
  fireEvent.click(rankButton());
  await settle();
  expect(screen.getByText(/ยังไม่ได้ตั้งค่า Groq API key/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: EXAMPLE })).toBeInTheDocument();
  expect(rankButton()).toBeEnabled();
});

it("goes back to the rule-made list when the reader type changes", async () => {
  await openRequestStep([["/dashboards/rank-suggestions", { body: RANKED }]]);
  fireEvent.click(rankButton());
  await settle();
  expect(screen.queryByRole("button", { name: EXAMPLE })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await settle();
  expect(screen.queryByText(/จัดลำดับและเรียบเรียงโดย AI/)).toBeNull();
  expect(screen.getByRole("button", { name: EXAMPLE })).toBeInTheDocument();
});

it("drops an AI answer that arrives after the reader type was changed", async () => {
  await openRequestStep([["/dashboards/rank-suggestions", { body: RANKED }]]);
  const inner = fetch;
  const held = [];
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    if (!String(url).includes("/dashboards/rank-suggestions")) return inner(url, options);
    return new Promise((resolve) => held.push(() => resolve({
      ok: true, status: 200, json: async () => RANKED, text: async () => JSON.stringify(RANKED), blob: async () => new Blob()
    })));
  }));
  fireEvent.click(rankButton());
  expect(screen.getByRole("button", { name: "AI กำลังเรียบเรียง…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await settle();
  await act(async () => { held[0](); });
  await settle();
  expect(screen.queryByText(/จัดลำดับและเรียบเรียงโดย AI/)).toBeNull();
  expect(screen.queryByRole("button", { name: RANKED_TEXT })).toBeNull();
  expect(screen.getByRole("button", { name: EXAMPLE })).toBeInTheDocument();
  expect(rankButton()).toBeEnabled();
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx -t "AI"`
Expected: FAIL (`Unable to find an accessible element with the role "button" and name "เรียบเรียงด้วย AI"`)

- [ ] **Step 3: เพิ่มฟังก์ชัน API ฝั่ง UI**

ใน `services/ui/src/utils/dashboardsApi.js` ก่อนบรรทัด `suggestChanges: ...` เพิ่ม

```js
  rankSuggestions: (table_name, audience) => request("/rank-suggestions", { method: "POST", body: { table_name, audience } }),
```

- [ ] **Step 4: แก้ `ContextForm.jsx`**

ใน `services/ui/src/components/builder/ContextForm.jsx` ทำ 5 การแก้

(ก) เปลี่ยนบรรทัด import

```jsx
import React, { useEffect, useState } from "react";
```

เป็น

```jsx
import React, { useEffect, useRef, useState } from "react";
```

(ข) ต่อจากบรรทัด `const [suggestions, setSuggestions] = useState(null); // null while loading` เพิ่ม

```jsx
  const [ai, setAi] = useState({ status: "idle" }); // idle | loading | done | error: the optional AI layer over the list
  const aiRun = useRef(0); // each AI request gets a number; an answer for an earlier list or reader type is dropped
```

(ค) ใน `useEffect` ที่ดึงคำแนะนำ แทน

```jsx
    let alive = true;
    dashboardsApi.suggestions(tableName, value.audience)
```

ด้วย

```jsx
    let alive = true;
    aiRun.current += 1; // a new list starts from the rules again
    setAi({ status: "idle" });
    dashboardsApi.suggestions(tableName, value.audience)
```

(ง) ก่อนบรรทัด `const submit = (e) => {` เพิ่ม

```jsx
  useEffect(() => () => { aiRun.current += 1; }, []);

  // The AI only reorders and rewords what the rules already offer; if it cannot, the list stays as it is.
  const rank = async () => {
    const mine = aiRun.current + 1;
    aiRun.current = mine;
    setAi({ status: "loading" });
    try {
      const res = await dashboardsApi.rankSuggestions(tableName, value.audience);
      if (mine !== aiRun.current) return;
      if (!res.suggestions?.length) {
        setAi({ status: "error", message: "AI ไม่ได้เลือกคำแนะนำ ใช้คำแนะนำจากกฎต่อไป" });
        return;
      }
      setSuggestions(res.suggestions);
      setAi({ status: "done", model: res.model });
    } catch (e) {
      if (mine === aiRun.current) setAi({ status: "error", message: e.message });
    }
  };

```

(จ) ระหว่างปิดกลุ่มการ์ด `</div>` กับ `<textarea id="dbb-context-input"` เพิ่มบล็อกนี้ (วางหลัง `</div>` ที่ปิด `className="dbb-chips"` และก่อน `<textarea`)

```jsx
      <div className="dbb-ai-row" aria-live="polite">
        <button type="button" onClick={rank} disabled={!suggestions?.length || ai.status === "loading"}>
          {ai.status === "loading" ? "AI กำลังเรียบเรียง…" : "เรียบเรียงด้วย AI"}
        </button>
        {ai.status === "done" && <span className="dbb-muted">จัดลำดับและเรียบเรียงโดย AI ({ai.model})</span>}
        {ai.status === "error" && <span className="dbb-error-inline">{ai.message}</span>}
      </div>
```

- [ ] **Step 5: เพิ่มสไตล์**

ใน `services/ui/src/pages/DashboardBuilder.css` ก่อนบรรทัด `.dbb-draft-note {` เพิ่ม

```css
.dbb-ai-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 32px; }
.dbb-ai-row button { padding: 5px 12px; border: 1px solid var(--dbb-border); border-radius: 6px; background: var(--dbb-surface); color: var(--dbb-ink); font-size: 13px; cursor: pointer; }
.dbb-ai-row button:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 6: รันให้ผ่านทั้งชุด**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
Expected: PASS ทั้งหมด (105 เทสต์ ณ เวลาที่เขียนแผน: 101 เดิม + 4 ใหม่)

- [ ] **Step 7: Commit**

```bash
git add services/ui/src/utils/dashboardsApi.js services/ui/src/components/builder/ContextForm.jsx services/ui/src/pages/DashboardBuilder.css services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(dashboard): a button that asks the AI to reorder and reword the suggestions"
```

---

### Task 5: เอกสาร

**Files:**
- Modify: `docs/ui-analysis/06-create-dashboard.md`
- Modify: `docs/create-dashboard-improvement-proposal.md` (ภาคผนวก)

**Interfaces:**
- Consumes: ผลของ Task 1 ถึง 4
- Produces: เอกสารที่ตรงกับพฤติกรรมจริง

ขอบเขตของ Task นี้คือแก้เอกสารและรันเทสต์ทั้งสองฝั่งเท่านั้น **ห้ามรันคำสั่ง docker**

- [ ] **Step 1: อัปเดตคู่มือหน้า**

ใน `docs/ui-analysis/06-create-dashboard.md` (ไฟล์ LF ใช้ Edit tool หาบรรทัดด้วยคำขึ้นต้นจาก Grep ก่อน)

(ก) บรรทัดตารางที่ขึ้นต้นด้วย ``| `ContextForm.jsx` | `` แทนค่าในคอลัมน์ที่สอง `` `GET /datasets/{table}/suggestions`, `POST /generate` `` ด้วย `` `GET /datasets/{table}/suggestions`, `POST /rank-suggestions`, `POST /generate` `` และต่อท้ายคอลัมน์ที่สามหลัง `` `dashboard_suggestions` -> `dashboard_suggest.suggest_from_profile` `` ด้วย `` ; `rank_dashboard_suggestions` -> `dashboard_llm.rank_suggestions` ``

(ข) บรรทัดที่ขึ้นต้นด้วย `- **[การ์ดคำแนะนำจากข้อมูล (chip)]**` ต่อท้ายบรรทัดด้วยประโยคนี้ (คงข้อความเดิมทั้งหมด): มีปุ่ม "เรียบเรียงด้วย AI" ใต้การ์ด (ไม่เรียกอัตโนมัติ) กดแล้ว `POST /api/v1/dashboards/rank-suggestions` ให้ Groq เลือกและเรียบเรียงจากผู้สมัครที่กฎสร้างไว้ (ไม่เกิน 12 ตัว เลือกคืนไม่เกิน 6) ตามกลุ่มผู้ใช้ AI เพิ่มรายการเองไม่ได้ และข้อความที่เรียบเรียงต้องคงชื่อคอลัมน์ของข้อความเดิม ไม่เช่นนั้นใช้ข้อความเดิม สำเร็จแล้วแทนรายการและแสดง "จัดลำดับและเรียบเรียงโดย AI (ชื่อโมเดล)" ถ้าไม่มี Groq key หรือ AI ล้ม (503) หรือตอบใช้ไม่ได้ (422) แสดงข้อความและคงรายการจากกฎ เปลี่ยนกลุ่มผู้ใช้แล้วกลับไปรายการจากกฎ 🤖 ผลจาก AI / 🟢 การเรียกอยู่ที่ฝั่งเซิร์ฟเวอร์

(ค) บรรทัดที่ขึ้นต้นด้วย `- **ส่งอะไรให้ Groq?**` ต่อท้ายบรรทัดด้วยประโยคนี้: ตอนกดปุ่ม "เรียบเรียงด้วย AI" ส่งโปรไฟล์คอลัมน์เดิม + ชื่อตาราง + กลุ่มผู้ใช้ + ข้อความของคำแนะนำที่กฎสร้าง (มีแต่ชื่อคอลัมน์) ไม่ส่งแถวข้อมูล ไม่ส่งค่าหมวดหมู่ และไม่ส่ง widget ของคำแนะนำ ตอนปรับแดชบอร์ดส่งเพิ่มรายการข้อความของสิ่งที่แดชบอร์ดยังขาด (`suggested_changes`) ซึ่งมีแต่ชื่อคอลัมน์เช่นกัน

(ง) ในตารางหัวข้อ `## ความเป็นส่วนตัวของข้อมูลที่ส่งออกไป Groq (สรุป)` แถวข้อมูล คอลัมน์ "ส่งออก" ต่อจากวลี `(ตอนปรับ) สเปกปัจจุบัน (ชื่อวิดเจ็ต/คอลัมน์ที่ใช้)` เพิ่ม `, (ตอนกดเรียบเรียงคำแนะนำ) ข้อความคำแนะนำที่กฎสร้าง, (ตอนปรับ) ข้อความรายการสิ่งที่แดชบอร์ดยังขาด`

- [ ] **Step 2: อัปเดตภาคผนวกของเอกสารข้อเสนอ**

ใน `docs/create-dashboard-improvement-proposal.md` ท้ายไฟล์ (ไฟล์ LF) ในย่อหน้า `**มีแล้วและตรวจจากโค้ด:**` ต่อท้ายบรรทัด (หลัง ` | การคำนวณ count_missing (ระยะ 3)`) ด้วย ` | ปุ่มให้ AI จัดลำดับและเรียบเรียงคำแนะนำ (ตรวจซ้ำว่าเลือกได้เฉพาะรายการของกฎ) และการส่งรายการสิ่งที่แดชบอร์ดยังขาดไปพร้อม prompt ปรับ (ระยะ 4)` ย่อหน้า `**ยังไม่มี ...:**` ไม่ต้องแก้

- [ ] **Step 3: รันเทสต์ทั้งสองฝั่ง**

Run (แยกคำสั่ง ไม่มี git ปนอยู่): `cd services/api && python -m pytest tests -q` และ `cd services/ui && npx vitest run`
Expected: UI ผ่านทั้งหมด; API ผ่านทั้งหมดยกเว้น 9 ตัวใน `tests/test_whitebox_engine.py` ที่เป็นเรื่องสภาพแวดล้อมของ worktree (รายงานจำนวนที่ผ่านและล้มตามจริง อย่ารายงานจากผลที่กรองด้วย `-k`)

- [ ] **Step 4: Commit**

```bash
git add docs/ui-analysis/06-create-dashboard.md docs/create-dashboard-improvement-proposal.md
git commit -m "docs(dashboard): describe the AI suggestion layer"
```

---

## Self-Review

**Spec coverage** (เทียบกับ `docs/create-dashboard-improvement-proposal.md` หัวข้อ 3.1, 5.3, 7):

| ข้อกำหนดของ spec | Task |
|---|---|
| ชั้น 2 AI: ส่งโปรไฟล์ (ไม่มีค่าข้อมูล) ให้ Groq จัดอันดับและเรียบเรียงคำแนะนำชั้น 1 ตามกลุ่มผู้ใช้ | Task 1, 2 |
| ตรวจซ้ำหลัง AI ตอบ ("ตรวจซ้ำด้วย `validate_spec`") | Task 1 (ตรวจ id ต้องอยู่ในผู้สมัคร ซึ่งทุกตัวผ่าน `validate_spec` โดยการสร้างอยู่แล้ว จึงไม่ต้องตรวจ widget ซ้ำ) |
| ถ้าชั้น 2 ล้ม ผู้ใช้ยังได้ชั้น 1 | Task 2 (503/422), Task 4 (คงรายการเดิม) |
| ส่งรายการช่องว่างไปพร้อม prompt ปรับ เพื่อตีความคำสั่งกำกวม (5.3) | Task 3 |
| ภาษาเป็นธรรมชาติ เลือกลำดับตามกลุ่มผู้ใช้ | Task 1 (RANK_PROMPT), Task 4 |
| กติกาความเป็นส่วนตัวเดิม (ไม่ส่งค่าข้อมูล) | Task 1, 3 (เทสต์ตรวจค่าที่ไม่ควรหลุด), Task 5 (เอกสาร) |
| เรียบเรียงคำแนะนำปรับแดชบอร์ด (G1 ถึง G6) ด้วย AI | เลื่อนไป (ระบุที่หัวแผน) |

**Placeholder scan:** ไม่มี TBD หรือ "ทำในลักษณะเดียวกัน" ทุกขั้นที่แก้โค้ดมีโค้ดเต็มหรือคำสั่งแก้ที่ระบุตำแหน่งชัด

**Type consistency:** `rank_suggestions(table_name, profile, audience, candidates)` (Task 1) ถูกเรียกใน Task 2 ด้วยลำดับอาร์กิวเมนต์เดียวกัน; รูปตอบกลับ `{"suggestions":[{id,rule,text}], "engine", "model"}` ตรงกับที่ UI อ่าน (`res.suggestions`, `res.model`); `dashboardsApi.rankSuggestions(table_name, audience)` ตรงกับที่ `ContextForm` เรียก (`tableName`, `value.audience`); ข้อความ "จัดลำดับและเรียบเรียงโดย AI ({model})" และชื่อปุ่ม "เรียบเรียงด้วย AI" ตรงกันระหว่าง `ContextForm.jsx` และเทสต์; `RANK_CANDIDATES` ใช้ทั้งใน endpoint และในเทสต์ของ Task 1
