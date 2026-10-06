# Create Dashboard Refine Suggestions Implementation Plan (ระยะ 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ในขั้น "แดชบอร์ด" ผู้ใช้เห็นคำแนะนำปรับแดชบอร์ดที่ได้จากสิ่งที่แดชบอร์ดปัจจุบันยังขาด (แนวโน้ม, เทียบช่วง, ตัวกรอง, KPI, กราฟสัดส่วน, ตารางสำหรับผู้บริหาร) แทนปุ่มตัวอย่างตายตัว 5 ปุ่ม และย้อนกลับหลังปรับด้วย AI ได้

**Architecture:** ฟังก์ชันล้วน `suggest_refinements(profile, spec, limit)` ใน `dashboard_suggest.py` (โมดูลเดียวกับระยะ 1) เทียบ spec ที่ผ่าน `validate_spec` แล้วกับโปรไฟล์คอลัมน์ ไม่อ่านแถวข้อมูล ไม่เรียก LLM endpoint ใหม่ `POST /api/v1/dashboards/suggest-changes` ฝั่ง UI `RefinePanel` ดึงคำแนะนำเองและดึงใหม่ทุกครั้งที่ spec เปลี่ยน การกดการ์ดเติมประโยคลงช่องปรับ (ส่งไป `/refine` ตามเดิม) การย้อนกลับเก็บ spec และประวัติคำสั่งก่อนการปรับแต่ละครั้ง แล้ววาด spec เก่าใหม่ด้วย `/render` (ไม่มีตัวกรอง) เพื่อให้ตัวเลขบนจอตรงกับแถบตัวกรองเสมอ

**Tech Stack:** FastAPI + pandas (container `api`, Python 3.10), pytest, React 18 + Vitest 2 + Testing Library, Git Bash

**Spec:** [`docs/create-dashboard-improvement-proposal.md`](../../create-dashboard-improvement-proposal.md) หัวข้อ 5.2 (กฎ G1 ถึง G7), 2.1 ข้อ 4 (undo) และ 7 (ระยะ 2)

**ขอบเขตที่ตั้งใจเลื่อนไป (ไม่ทำในแผนนี้):**
- กฎ G7 (เพิ่มกล่องสรุปคุณภาพข้อมูล) ต้องใช้ผลตรวจคุณภาพรอบล่าสุดและกฎ R8 ที่ยังไม่มี
- "บันทึกเป็นฉบับใหม่" (ข้อ 4 ของตารางปัญหาในหัวข้อ 2.1 มีสองอย่างคือ undo กับ save as ระยะนี้ทำเฉพาะ undo)
- การให้ AI จัดอันดับหรือเรียบเรียงคำแนะนำ (ระยะ 4) และกลุ่มผู้ใช้ใหม่ (ระยะ 3)
- เมื่อไม่มี Groq key การปรับด้วย AI ใช้ไม่ได้ (503) คำแนะนำยังแสดง แต่กดปรับไม่ได้ผลจนกว่าจะตั้งค่า key

## Global Constraints

- ทำใน worktree ที่มีอยู่แล้ว `C:\ETL\.claude\worktrees\refine-suggestions` บน branch `feat/refine-suggestions` ห้าม commit ลง `main` หรือ `feat/generic-profiling-rule-engine` โดยตรง
- Commit message แบบ conventional (`feat(dashboard): ...`) **ไม่ใส่ attribution line ใดๆ** (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- stage เฉพาะไฟล์ที่ Task ระบุ ห้ามใช้ `git add -A`, `git add .` หรือ `git commit -a`
- **Line ending:** ไฟล์ที่แผนนี้แตะเป็น LF ทั้งหมด (ตรวจด้วย `git ls-files --eol <ไฟล์>`) ห้ามแก้ไฟล์ด้วย Python แบบ text mode บน Windows เพราะจะเขียนเป็น CRLF ทั้งไฟล์ ใช้ Edit tool หรือเปิดไฟล์ด้วย `newline=''` และเทียบ `git diff --stat` ว่าไม่บวมผิดปกติหลังแก้
- **ความเป็นส่วนตัว:** คำแนะนำสร้างจากโปรไฟล์คอลัมน์และ spec เท่านั้น ห้ามอ่านหรือส่งค่าในเซลล์ ห้ามเรียก LLM ในเส้นทางคำแนะนำ
- **ข้อความหน้าจอ (กติกาของโปรเจกต์):** ห้ามมี em dash หรือ en dash ห้ามใช้ emoji ปุ่มใช้คำสั้น 1 ถึง 3 คำ
- **ชื่อ endpoint:** ต้องเป็น `/dashboards/suggest-changes` ห้ามใช้ชื่อที่มีสตริง `/dashboards/refine` อยู่ข้างใน (เช่น `refine-suggestions`, `refinement-ideas`) เพราะ mock ของเทสต์ UI (`mockFetchByUrl`) ใช้ route แรกที่ URL มีสตริงนั้นเป็นส่วนหนึ่ง และ `callTo("/dashboards/refine")` ในเทสต์เดิมจะจับ endpoint ใหม่ผิดตัว
- **ความเสถียรของหน้าจอ:** พื้นที่การ์ดคำแนะนำต้องไม่ยุบตอนโหลดใหม่ (ไม่ล้างรายการเดิมก่อนรายการใหม่มา) ใช้คลาส `.dbb-chips` ที่มี `min-height` อยู่แล้ว
- **การทดสอบ UI:** `mockFetchByUrl` ใช้ route แรกที่ URL มีสตริงนั้นเป็นส่วนหนึ่ง ดังนั้น route ที่ยาวกว่าต้องมาก่อน `/dashboards/datasets`
- **คำสั่งทดสอบ:**
  - API: `cd services/api && python -m pytest tests -q -k dashboard`
  - UI: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
  - เทสต์ API ทั้งชุดใน worktree ล้ม 9 ตัวใน `tests/test_whitebox_engine.py` เพราะไฟล์ข้อมูลที่ git ไม่ติดตาม (`dirty_dataset.csv`) ไม่อยู่ใน worktree ถือเป็นเรื่องของสภาพแวดล้อม ไม่ใช่ความผิดของงานนี้
- **การดูผลบนระบบจริง:** `sdoqap-api` และ `sdoqap-ui` เป็น Docker image ที่ build ไว้ แก้โค้ดแล้วหน้าเว็บไม่เปลี่ยนจนกว่าจะ build ใหม่ (Task 5 ส่วนที่ผู้ควบคุมทำเอง)
- รูปแบบ spec ที่ `suggest_refinements` รับ คือผลของ `validate_spec(...)[0]`: `{"widgets": [{"id","type","title","metric"?,"x"?,"group_by"?,"compare"?,...}], "filters": [{"column",...}], "audience": "business"|"analyst"|"management", ...}` widget ชนิด `bar` มีคีย์ `group_by` เสมอ widget ชนิด `kpi` มี `metric` เสมอ

---

### Task 1: ฟังก์ชันหาช่องว่างของแดชบอร์ด (ฟังก์ชันล้วน)

**Files:**
- Modify: `services/api/app/api/dashboard_suggest.py`
- Test: `services/api/tests/test_dashboard_suggest.py`

**Interfaces:**
- Consumes: ตัวช่วยเดิมในไฟล์เดียวกัน `_usable(profile)`, `_metric(name)`, `_grain(column, wanted, order)`, `_COMPARE_GRAINS`, `_GRAIN_LABEL`, `DONUT_MAX_DISTINCT`; และ `MAX_FILTERS` จาก `dashboard_spec`; ในไฟล์ทดสอบ `ECOMMERCE`, `OLIST`, `col`, `profile` และ `validate_spec` ที่นำเข้าไว้แล้ว
- Produces: `suggest_refinements(profile: dict, spec: dict, limit: int = 5) -> list[{"id": str, "rule": "G1"|"G2"|"G3"|"G4"|"G5"|"G6", "text": str}]` และตัวช่วย `_interleave(by_rule: dict, order: tuple, limit: int) -> list` ที่ `suggest_from_profile` ใช้ต่อด้วย (พฤติกรรมของ `suggest_from_profile` ต้องไม่เปลี่ยน)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ใน `services/api/tests/test_dashboard_suggest.py`

(ก) เปลี่ยนบรรทัด import

```python
from app.api.dashboard_suggest import is_identifier, suggest_from_profile  # noqa: E402
```

เป็น

```python
from app.api.dashboard_suggest import is_identifier, suggest_from_profile, suggest_refinements  # noqa: E402
```

(ข) ต่อท้ายไฟล์เพิ่มบล็อกนี้ทั้งหมด

```python
# --- suggestions for a dashboard that already exists (gaps between its spec and the profile) ----------

SALES = {"agg": "sum", "column": "Total_Sales"}
ECOMMERCE_CATEGORIES = ["Customer_Segment", "Country", "Region", "Product_Category", "Product_Name", "Payment_Method"]


def spec_for(p, widgets, filters=(), audience="business"):
    spec, warnings = validate_spec({"widgets": widgets, "filters": list(filters), "audience": audience}, p)
    assert warnings == []
    return spec


def gaps(p, spec, limit=20):
    return [(s["rule"], s["text"]) for s in suggest_refinements(p, spec, limit)]


def test_a_small_dashboard_is_offered_a_trend_a_comparison_a_filter_and_a_kpi_first():
    spec = spec_for(ECOMMERCE, [{"id": "k1", "type": "kpi", "title": "ยอดขายรวม", "metric": SALES},
                                {"id": "b1", "type": "bar", "title": "ตามประเทศ", "x": "Country", "metric": SALES}],
                    [{"column": "Region"}])
    assert gaps(ECOMMERCE, spec, 5) == [
        ("G3", "เพิ่มแนวโน้ม ผลรวม Total_Sales รายเดือน ตาม Order_Date"),
        ("G4", "แสดง ยอดขายรวม เทียบช่วงก่อนหน้า"),
        ("G1", "เพิ่มตัวกรอง Customer_Segment"),
        ("G2", "เพิ่ม KPI ผลรวม Profit"),
        ("G1", "เพิ่มตัวกรอง Product_Category")]


def test_nothing_is_suggested_for_what_the_dashboard_already_has():
    spec = spec_for(ECOMMERCE, [
        {"id": "k1", "type": "kpi", "title": "ยอดขายรวม", "metric": SALES, "compare": {"date_column": "Order_Date", "time_grain": "year"}},
        {"id": "l1", "type": "line", "title": "แนวโน้ม", "x": "Order_Date", "time_grain": "month", "metric": SALES}],
        [{"column": "Region"}])
    rules = [r for r, _ in gaps(ECOMMERCE, spec)]
    assert "G3" not in rules and "G4" not in rules
    assert "เพิ่มตัวกรอง Region" not in [t for _, t in gaps(ECOMMERCE, spec)]
    assert "เพิ่ม KPI ผลรวม Total_Sales" not in [t for _, t in gaps(ECOMMERCE, spec)]


def test_no_filter_is_suggested_once_the_filter_limit_is_reached():
    spec = spec_for(ECOMMERCE, [{"id": "k1", "type": "kpi", "title": "ยอดขาย", "metric": SALES}],
                    [{"column": c} for c in ECOMMERCE_CATEGORIES])
    assert len(spec["filters"]) == 6
    assert "G1" not in [r for r, _ in gaps(ECOMMERCE, spec)]


def test_a_bar_over_a_few_values_may_become_a_share_but_an_average_may_not():
    totals = spec_for(ECOMMERCE, [{"id": "b2", "type": "bar", "title": "ตามภูมิภาค", "x": "Region", "metric": SALES}])
    assert ("G5", "เปลี่ยน 'ตามภูมิภาค' เป็นกราฟสัดส่วน") in gaps(ECOMMERCE, totals)
    average = spec_for(ECOMMERCE, [{"id": "b2", "type": "bar", "title": "ตามภูมิภาค", "x": "Region",
                                    "metric": {"agg": "avg", "column": "Unit_Price"}}])
    split = spec_for(ECOMMERCE, [{"id": "b2", "type": "bar", "title": "ตามภูมิภาค", "x": "Region", "group_by": "Payment_Method", "metric": SALES}])
    many = spec_for(ECOMMERCE, [{"id": "b2", "type": "bar", "title": "ตามประเทศ", "x": "Country", "metric": SALES}])
    for spec in (average, split, many):
        assert "G5" not in [r for r, _ in gaps(ECOMMERCE, spec)]


def test_a_detail_table_is_questioned_only_on_a_dashboard_for_management():
    widgets = [{"id": "k1", "type": "kpi", "title": "ยอดขาย", "metric": SALES},
               {"id": "t1", "type": "table", "title": "ตาราง", "columns": ["Order_ID"]}]
    assert ("G6", "ลบตารางรายละเอียดให้เหมาะกับผู้บริหาร") in gaps(ECOMMERCE, spec_for(ECOMMERCE, widgets, audience="management"))
    assert "G6" not in [r for r, _ in gaps(ECOMMERCE, spec_for(ECOMMERCE, widgets, audience="analyst"))]


def test_a_dataset_without_dates_gets_no_trend_or_comparison_gap():
    spec = spec_for(OLIST, [{"id": "t", "type": "table", "title": "ตาราง", "columns": ["product_id"]}])
    found = gaps(OLIST, spec)
    assert found and {r for r, _ in found} == {"G2"}
    assert found[0] == ("G2", "เพิ่ม KPI ค่าเฉลี่ย product_name_lenght")


def test_gap_suggestions_have_unique_ids_and_respect_the_limit():
    spec = spec_for(ECOMMERCE, [{"id": "k1", "type": "kpi", "title": "ยอดขาย", "metric": SALES}])
    everything = suggest_refinements(ECOMMERCE, spec, 50)
    assert len({s["id"] for s in everything}) == len(everything)
    assert set(everything[0]) == {"id", "rule", "text"}
    assert len(suggest_refinements(ECOMMERCE, spec, 2)) == 2
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboard_suggest.py -q`
Expected: FAIL ทั้งไฟล์ (`ImportError: cannot import name 'suggest_refinements'`)

- [ ] **Step 3: เขียนโค้ด**

ใน `services/api/app/api/dashboard_suggest.py` ทำ 4 การแก้

(ก) ต่อจากบรรทัด `from datetime import datetime, timedelta` เพิ่มบรรทัดว่างหนึ่งบรรทัดแล้ว

```python
from .dashboard_spec import MAX_FILTERS
```

(ข) ต่อจากบรรทัด `DEFAULT_LIMIT = 6` เพิ่ม

```python
GAP_LIMIT = 5
MAX_FILTER_DISTINCT = 50  # a select box stays usable up to about this many values
```

(ค) ต่อจากนิยาม `_RULE_ORDER = {...}` (วงเล็บปีกกาที่ปิดด้วย `"management": ("R4", "R1", "R3", "R2", "R5", "R7")}`) เพิ่ม

```python
# Gaps in a finished dashboard, most visible first: a missing trend and a missing comparison before a missing filter.
_GAP_ORDER = ("G3", "G4", "G1", "G2", "G5", "G6")
```

(ง) ท้ายฟังก์ชัน `suggest_from_profile` แทนบล็อกที่ขึ้นต้นด้วย `    order = _RULE_ORDER.get(audience, _RULE_ORDER["business"])` ไปจนจบไฟล์ (บรรทัด `    return picked`) ด้วยโค้ดนี้

```python
    return _interleave(by_rule, _RULE_ORDER.get(audience, _RULE_ORDER["business"]), limit)


def _interleave(by_rule, order, limit):
    """One pick from every rule first, then second picks, so the list stays varied."""
    picked, depth = [], 0
    while len(picked) < limit and any(len(by_rule[r]) > depth for r in order):
        for rule in order:
            if len(by_rule[rule]) > depth and len(picked) < limit:
                picked.append(by_rule[rule][depth])
        depth += 1
    return picked


def _change(gap, key, text):
    return {"id": f"{gap}:{key}", "rule": gap, "text": text}


def suggest_refinements(profile, spec, limit=GAP_LIMIT):
    """What the current dashboard does not use yet, as instructions the refine box understands.

    `spec` is a spec that validate_spec() produced for this profile; the suggestions are the gaps
    between it and the columns the profile says are worth charting. Same rules as above: profile and
    spec only, no rows, no LLM."""
    measures, categories, dates = _usable(profile)
    widgets, filters = spec["widgets"], spec["filters"]
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    distinct = {c["name"]: c["distinct"] for c in profile["columns"]}
    main = _metric(measures[0]["name"]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
    by_gap = {gap: [] for gap in _GAP_ORDER}

    if dates and not any(w["type"] in ("line", "area") for w in widgets):
        grain = _grain(dates[0], 6, ("month", "week", "day")) if dates[0]["distinct"] >= 3 else None
        if grain:
            by_gap["G3"].append(_change("G3", dates[0]["name"], f"เพิ่มแนวโน้ม {main[1]} {_GRAIN_LABEL[grain]} ตาม {dates[0]['name']}"))

    plain_kpi = next((w for w in widgets if w["type"] == "kpi" and not w.get("compare")), None)
    if dates and plain_kpi and _grain(dates[0], 2, _COMPARE_GRAINS):
        by_gap["G4"].append(_change("G4", plain_kpi["id"], f"แสดง {plain_kpi['title']} เทียบช่วงก่อนหน้า"))

    if len(filters) < MAX_FILTERS:
        filtered = {f["column"] for f in filters}
        open_columns = [c for c in categories if c["distinct"] <= MAX_FILTER_DISTINCT and c["name"] not in filtered]
        for c in sorted(open_columns, key=lambda c: c["distinct"]):
            by_gap["G1"].append(_change("G1", c["name"], f"เพิ่มตัวกรอง {c['name']}"))

    in_kpi = {w["metric"]["column"] for w in widgets if w["type"] == "kpi"}
    for c in measures:
        if c["name"] not in in_kpi:
            by_gap["G2"].append(_change("G2", c["name"], f"เพิ่ม KPI {_metric(c['name'])[1]}"))

    for w in widgets:  # a share only reads well over a few values, and only for totals and counts
        few_values = kinds.get(w.get("x")) == "categorical" and distinct[w["x"]] <= DONUT_MAX_DISTINCT
        if w["type"] == "bar" and few_values and not w["group_by"] and w["metric"]["agg"] in ("sum", "count"):
            by_gap["G5"].append(_change("G5", w["id"], f"เปลี่ยน '{w['title']}' เป็นกราฟสัดส่วน"))

    if spec.get("audience") == "management" and any(w["type"] == "table" for w in widgets):
        by_gap["G6"].append(_change("G6", "table", "ลบตารางรายละเอียดให้เหมาะกับผู้บริหาร"))

    return _interleave(by_gap, _GAP_ORDER, limit)
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd services/api && python -m pytest tests/test_dashboard_suggest.py -q`
Expected: PASS ทั้งไฟล์ (เทสต์เดิมของ `suggest_from_profile` ต้องผ่านโดยไม่แก้ เพราะ `_interleave` ย้ายตรรกะเดิมมาไว้ที่เดียว) ถ้าลำดับข้อความในเทสต์ใหม่ไม่ตรง ห้ามแก้ข้อความที่คาดหวังให้ตรงผลลัพธ์ ให้ตรวจก่อนว่ากฎใดเปลี่ยน

- [ ] **Step 5: ตรวจว่าไม่กระทบส่วนอื่น**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add services/api/app/api/dashboard_suggest.py services/api/tests/test_dashboard_suggest.py
git commit -m "feat(dashboard): find what a finished dashboard still lacks"
```

---

### Task 2: endpoint คำแนะนำปรับแดชบอร์ด

**Files:**
- Modify: `services/api/app/api/dashboards.py`
- Test: `services/api/tests/test_dashboards_api.py`

**Interfaces:**
- Consumes: `dashboard_suggest.suggest_refinements(profile, spec)` (Task 1), `dashboard_data.load_active_dataset(table_name) -> (df, profile)`, `_checked_spec(raw, profile)` (คืน spec ที่ผ่านการตรวจหรือ raise 422), และในเทสต์ fixture `weekly`, ฟังก์ชัน `client()` ที่มีอยู่แล้ว
- Produces: `POST /api/v1/dashboards/suggest-changes` body `{"table_name": str, "spec": object}` → `{"suggestions": [{"id": str, "rule": str, "text": str}]}`; spec ที่ใช้ไม่ได้ได้ 422; ต้อง login เหมือน route อื่น

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ใน `services/api/tests/test_dashboards_api.py`

(ก) ในฟังก์ชัน `test_every_route_needs_a_login` เปลี่ยนบรรทัด

```python
    for path in ("generate", "refine", "render"):
```

เป็น

```python
    for path in ("generate", "refine", "render", "suggest-changes"):
```

(ข) ต่อท้ายไฟล์เพิ่ม

```python
def suggest_changes(spec, table="weekly"):
    return client().post("/api/v1/dashboards/suggest-changes", json={"table_name": table, "spec": spec})


def test_changes_are_suggested_from_what_the_dashboard_lacks(weekly):
    spec = {"title": "ยอดขาย", "widgets": [{"id": "k1", "type": "kpi", "title": "ยอดรวม", "metric": {"agg": "sum", "column": "amount"}}]}
    res = suggest_changes(spec)
    assert res.status_code == 200
    assert [(s["rule"], s["text"]) for s in res.json()["suggestions"]] == [
        ("G3", "เพิ่มแนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date"),
        ("G4", "แสดง ยอดรวม เทียบช่วงก่อนหน้า"),
        ("G1", "เพิ่มตัวกรอง region")]


def test_a_spec_that_cannot_be_drawn_is_rejected_before_any_suggestion(weekly):
    res = suggest_changes({"title": "ว่าง", "widgets": []})
    assert res.status_code == 422
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboards_api.py -q -k "changes or login"`
Expected: FAIL 3 เทสต์ (route ยังไม่มี: 404 แทน 401/200/422)

- [ ] **Step 3: เพิ่ม endpoint**

ใน `services/api/app/api/dashboards.py`

(ก) ก่อนคลาส `class RenderPayload(BaseModel):` เพิ่ม

```python
class SuggestChangesPayload(BaseModel):
    table_name: str
    spec: Dict[str, Any]


```

(ข) ก่อน `@router.post("/generate")` เพิ่ม

```python
@router.post("/suggest-changes")
def suggest_dashboard_changes(payload: SuggestChangesPayload):
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    return {"suggestions": dashboard_suggest.suggest_refinements(profile, spec)}


```

(`dashboard_suggest` ถูก import ที่หัวไฟล์แล้วตั้งแต่ระยะ 1)

- [ ] **Step 4: รันให้ผ่านทั้งชุด**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboards.py services/api/tests/test_dashboards_api.py
git commit -m "feat(dashboard): serve suggested changes for a finished dashboard"
```

---

### Task 3: UI, คำแนะนำปรับแทนปุ่มตัวอย่างตายตัว

**Files:**
- Modify: `services/ui/src/utils/dashboardsApi.js`
- Modify (เขียนทับทั้งไฟล์): `services/ui/src/components/builder/RefinePanel.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.jsx` (บรรทัด `<RefinePanel ... />`)
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx`

**Interfaces:**
- Consumes: endpoint ของ Task 2 (`{ suggestions: [{ id, rule, text }] }`); คลาส `.dbb-chips`, `.dbb-chip`, `.dbb-muted`, `.dbb-actions` ที่มีอยู่แล้ว; ในเทสต์ `generateDashboard()`, `refineBox()`, `REFINED`, `REFINED_SPEC`, `SPEC`, `settle`, `callTo`, `builderRoutes`, `controlledFetch`
- Produces: `dashboardsApi.suggestChanges(table_name: string, spec: object) -> Promise<{ suggestions }>`; `RefinePanel` รับ props ใหม่ `tableName` และ `spec` (ไม่มี `REFINE_EXAMPLES` อีกต่อไป); `describeChanges` ยัง export เหมือนเดิม

- [ ] **Step 1: ปรับ fixture และเทสต์เดิมใน `DashboardBuilder.test.jsx`**

ทำ 4 การแก้ในไฟล์ `services/ui/src/pages/DashboardBuilder.test.jsx`

(ก) ก่อนบรรทัด `const SUGGESTIONS = { table_name: "sales", suggestions: [` เพิ่ม

```jsx
const CHANGE = "เพิ่มแนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date";
const CHANGES = { suggestions: [
  { id: "G3:order_date", rule: "G3", text: CHANGE },
  { id: "G1:region", rule: "G1", text: "เพิ่มตัวกรอง region" }
] };
```

(ข) ใน `builderRoutes` ต่อจากบรรทัด `...extra,` เพิ่มบรรทัดนี้ (ต้องอยู่ก่อน route `/suggestions`)

```jsx
    ["/dashboards/suggest-changes", { body: CHANGES }],
```

(ค) ใน `controlledFetch` แทนบรรทัด

```jsx
    const body = u.includes("/suggestions") ? SUGGESTIONS : u.includes("/preview") ? PREVIEW : TWO_DATASETS;
```

ด้วย

```jsx
    const body = u.includes("/suggest-changes") ? CHANGES : u.includes("/suggestions") ? SUGGESTIONS : u.includes("/preview") ? PREVIEW : TWO_DATASETS;
```

(ง) ในเทสต์ `refines the dashboard with an instruction and lists what changed` แทนบรรทัด

```jsx
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มกราฟยอดขายรายเดือน" }));
```

ด้วย

```jsx
  fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
```

และแทนบรรทัด `expect(body).toEqual({ table_name: "sales", spec: SPEC, instruction: "เพิ่มกราฟยอดขายรายเดือน" });` ด้วย

```jsx
  expect(body).toEqual({ table_name: "sales", spec: SPEC, instruction: CHANGE });
```

- [ ] **Step 2: เพิ่มเทสต์ใหม่**

แทรกทันทีก่อนบรรทัด `// --- refine responses that arrive late ---` ในไฟล์เดียวกัน

```jsx
const changeCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes("/dashboards/suggest-changes"));

it("suggests changes from what the dashboard lacks instead of fixed examples", async () => {
  await generateDashboard();
  expect(screen.queryByRole("button", { name: "เพิ่มกราฟยอดขายรายเดือน" })).toBeNull();
  expect(screen.getByRole("button", { name: "เพิ่มตัวกรอง region" })).toBeInTheDocument();
  expect(JSON.parse(changeCalls()[0][1].body)).toEqual({ table_name: "sales", spec: SPEC });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มตัวกรอง region" }));
  expect(refineBox()).toHaveValue("เพิ่มตัวกรอง region");
});

it("asks again for changes after a refinement, because the spec is no longer the same", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }]]);
  const before = changeCalls().length;
  fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  expect(changeCalls().length).toBe(before + 1);
  expect(JSON.parse(changeCalls().at(-1)[1].body).spec).toEqual(REFINED_SPEC);
});

it("says so when no changes can be suggested, and the user can still type", async () => {
  await generateDashboard([["/dashboards/suggest-changes", { status: 500, body: { detail: "boom" } }]]);
  expect(screen.getByText("ยังไม่มีคำแนะนำปรับ พิมพ์สิ่งที่อยากปรับได้เลย")).toBeInTheDocument();
  fireEvent.change(refineBox(), { target: { value: "เน้น KPI" } });
  expect(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })).toBeEnabled();
});
```

`refineBox` ถูกประกาศ (`const refineBox = () => ...`) ในไฟล์ทดสอบเดิมต่ำกว่าจุดแทรก แต่ใช้ภายในฟังก์ชัน `it` จึงเรียกได้ตอนรัน

- [ ] **Step 3: รันให้เห็นว่าล้ม**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
Expected: FAIL (`Unable to find an accessible element with the role "button" and name "เพิ่มแนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date"` และอีกสองเทสต์ใหม่)

- [ ] **Step 4: เพิ่มฟังก์ชัน API ฝั่ง UI**

ใน `services/ui/src/utils/dashboardsApi.js` ก่อนบรรทัด `refine: (table_name, spec, instruction) => ...` เพิ่ม

```js
  suggestChanges: (table_name, spec) => request("/suggest-changes", { method: "POST", body: { table_name, spec } }),
```

- [ ] **Step 5: เขียน `RefinePanel.jsx` ใหม่**

เขียนทับ `services/ui/src/components/builder/RefinePanel.jsx` ทั้งไฟล์

```jsx
import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";

export function describeChanges(changes) {
  if (!changes) return [];
  const lines = [];
  if (changes.added?.length) lines.push(`เพิ่ม: ${changes.added.join(", ")}`);
  if (changes.changed?.length) lines.push(`แก้ไข: ${changes.changed.join(", ")}`);
  if (changes.removed?.length) lines.push(`ลบ: ${changes.removed.join(", ")}`);
  if (changes.filters_added?.length) lines.push(`เพิ่มตัวกรอง: ${changes.filters_added.join(", ")}`);
  if (changes.filters_removed?.length) lines.push(`ลบตัวกรอง: ${changes.filters_removed.join(", ")}`);
  if (changes.layout_changed) lines.push("จัดตำแหน่งใหม่");
  return lines.length ? lines : ["AI ไม่ได้เปลี่ยนอะไร"];
}

export default function RefinePanel({ tableName, spec, onRefine, busy, changes, history = [] }) {
  const [text, setText] = useState("");
  const [ideas, setIdeas] = useState(null); // null while the first list loads
  const ready = text.trim().length >= 2 && !busy;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    if (await onRefine(text.trim())) setText("");
  };

  // What the dashboard still lacks depends on its spec, so a refinement or an undo asks again.
  // The previous list stays on screen while the new one loads, so the panel does not jump.
  const specKey = JSON.stringify(spec);
  useEffect(() => {
    let alive = true;
    dashboardsApi.suggestChanges(tableName, spec)
      .then((res) => { if (alive) setIdeas(res.suggestions || []); })
      .catch(() => { if (alive) setIdeas([]); });
    return () => { alive = false; };
  }, [tableName, specKey]);

  return (
    <form className="dbb-refine" onSubmit={submit} aria-label="ปรับด้วย AI">
      <label htmlFor="dbb-refine-input">ปรับแดชบอร์ดด้วย AI</label>
      <div className="dbb-chips" role="group" aria-label="คำแนะนำปรับแดชบอร์ด" aria-busy={ideas === null}>
        {ideas === null && <p className="dbb-muted">กำลังอ่านแดชบอร์ดเพื่อแนะนำ…</p>}
        {ideas?.length === 0 && <p className="dbb-muted">ยังไม่มีคำแนะนำปรับ พิมพ์สิ่งที่อยากปรับได้เลย</p>}
        {ideas?.map((idea) => (
          <button type="button" key={idea.id} className="dbb-chip" onClick={() => setText(idea.text)}>{idea.text}</button>
        ))}
      </div>
      <textarea id="dbb-refine-input" rows={3} maxLength={1000} value={text} placeholder="เลือกคำแนะนำ หรือพิมพ์สิ่งที่อยากปรับ"
        onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="dbb-btn-primary" disabled={!ready}>{busy ? "AI กำลังปรับ…" : "ปรับแดชบอร์ด"}</button>
      {changes && (
        <ul className="dbb-changes" aria-label="สิ่งที่เปลี่ยน">
          {describeChanges(changes).map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {history.length > 0 && (
        <details>
          <summary>คำสั่งที่ใช้แล้ว {history.length} ครั้ง</summary>
          <ol>{history.map((h, i) => <li key={i}>{h}</li>)}</ol>
        </details>
      )}
    </form>
  );
}
```

- [ ] **Step 6: ส่ง `tableName` และ `spec` ให้ `RefinePanel`**

ใน `services/ui/src/pages/DashboardBuilder.jsx` แทนบรรทัด

```jsx
            <RefinePanel onRefine={refine} busy={busy === "refine"} changes={changes} history={refinements} />
```

ด้วย

```jsx
            <RefinePanel tableName={dataset.name} spec={draft.spec} onRefine={refine} busy={busy === "refine"} changes={changes} history={refinements} />
```

- [ ] **Step 7: รันให้ผ่านทั้งชุด**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
Expected: PASS ทั้งหมด (91 เทสต์ ณ เวลาที่เขียนแผน: 88 เดิม + 3 ใหม่)

- [ ] **Step 8: Commit**

```bash
git add services/ui/src/utils/dashboardsApi.js services/ui/src/components/builder/RefinePanel.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(dashboard): suggest changes from what the dashboard lacks"
```

---

### Task 4: UI, ปุ่มย้อนกลับหลังปรับด้วย AI

**Files:**
- Modify: `services/ui/src/components/builder/RefinePanel.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.jsx`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx`

**Interfaces:**
- Consumes: ผลของ Task 3 (`RefinePanel` รับ `tableName`, `spec`); `run(kind, work)`, `bump(kind)`, `committed`, `dashboardsApi.render(table, spec, selections)` ที่มีอยู่ใน `DashboardBuilder.jsx`
- Produces: `RefinePanel` รับ props ใหม่ `canUndo: boolean` (ค่าเริ่มต้น false), `onUndo: () => void`, `undoing: boolean` (ค่าเริ่มต้น false); ปุ่มชื่อ "ย้อนกลับ" (ขณะทำงานเป็น "กำลังย้อนกลับ…") ใน `DashboardBuilder` มี state `undoStack` (รายการ `{ spec, refinements }` ก่อนการปรับแต่ละครั้ง) และฟังก์ชัน `undo`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

แทรกใน `services/ui/src/pages/DashboardBuilder.test.jsx` ทันทีก่อนบรรทัด `// --- refine responses that arrive late ---` (ต่อจากเทสต์ของ Task 3)

```jsx
it("goes back to the dashboard before the last refinement and forgets that instruction", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }]]);
  const undo = screen.getByRole("button", { name: "ย้อนกลับ" });
  expect(undo).toBeDisabled();
  fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  expect(screen.getByRole("article", { name: "ยอดขายรายเดือน" })).toBeInTheDocument();
  expect(undo).toBeEnabled();
  await act(async () => { fireEvent.click(undo); });
  await settle();
  const render = fetch.mock.calls.filter(([url]) => String(url).includes("/dashboards/render")).at(-1);
  expect(JSON.parse(render[1].body)).toEqual({ table_name: "sales", spec: SPEC, selections: {} });
  expect(screen.queryByRole("article", { name: "ยอดขายรายเดือน" })).toBeNull();
  expect(screen.queryByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeNull();
  expect(screen.getByRole("button", { name: "ย้อนกลับ" })).toBeDisabled();
});

it("goes back one refinement at a time", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }]]);
  const refineTwice = async () => {
    fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
    await settle();
  };
  await refineTwice();
  await refineTwice();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 2 ครั้ง")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" })); });
  await settle();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ย้อนกลับ" })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" })); });
  await settle();
  expect(screen.queryByText(/คำสั่งที่ใช้แล้ว/)).toBeNull();
  expect(screen.getByRole("button", { name: "ย้อนกลับ" })).toBeDisabled();
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx -t "goes back"`
Expected: FAIL 2 เทสต์ (`Unable to find an accessible element with the role "button" and name "ย้อนกลับ"`)

- [ ] **Step 3: เพิ่มปุ่มใน `RefinePanel.jsx`**

ใน `services/ui/src/components/builder/RefinePanel.jsx`

(ก) แทนบรรทัด

```jsx
export default function RefinePanel({ tableName, spec, onRefine, busy, changes, history = [] }) {
```

ด้วย

```jsx
export default function RefinePanel({ tableName, spec, onRefine, busy, changes, history = [], canUndo = false, onUndo, undoing = false }) {
```

(ข) แทนบรรทัด

```jsx
      <button type="submit" className="dbb-btn-primary" disabled={!ready}>{busy ? "AI กำลังปรับ…" : "ปรับแดชบอร์ด"}</button>
```

ด้วย

```jsx
      <div className="dbb-actions">
        <button type="submit" className="dbb-btn-primary" disabled={!ready}>{busy ? "AI กำลังปรับ…" : "ปรับแดชบอร์ด"}</button>
        <button type="button" onClick={onUndo} disabled={!canUndo || busy || undoing}>{undoing ? "กำลังย้อนกลับ…" : "ย้อนกลับ"}</button>
      </div>
```

- [ ] **Step 4: เพิ่ม state และฟังก์ชัน `undo` ใน `DashboardBuilder.jsx`**

ใน `services/ui/src/pages/DashboardBuilder.jsx` ทำ 6 การแก้

(ก) ต่อจากบรรทัด `  const [saved, setSaved] = useState(null);` เพิ่ม

```jsx
  const [undoStack, setUndoStack] = useState([]); // the spec and request history before each AI refinement
```

(ข) ใน `chooseDataset` ภายในบล็อก `if (dataset?.name !== next.name) {` แทน

```jsx
      setChanges(null);
      setSaved(null);
```

ด้วย

```jsx
      setChanges(null);
      setUndoStack([]);
      setSaved(null);
```

(ค) ใน `generate` แทน

```jsx
    setRefinements([]);
    setChanges(null);
    setStep(3);
```

ด้วย

```jsx
    setRefinements([]);
    setChanges(null);
    setUndoStack([]);
    setStep(3);
```

(ง) ใน `refine` แทนบล็อก

```jsx
    setDraft(result);
    setSelections({});
    setChanges(result.changes);
    setRefinements((list) => [...list, instruction]);
    return true;
  });
```

ด้วย

```jsx
    setUndoStack((stack) => [...stack, { spec: draft.spec, refinements }]);
    setDraft(result);
    setSelections({});
    setChanges(result.changes);
    setRefinements((list) => [...list, instruction]);
    return true;
  });

  // Goes back one refinement. The earlier spec is drawn again from the data, without filters, so what
  // is on screen always matches the filter bar.
  const undo = () => run("undo", async (live) => {
    const previous = undoStack[undoStack.length - 1];
    bump("refine"); // a refine or filter render still in flight belongs to the dashboard being left
    bump("render");
    const rendered = await dashboardsApi.render(dataset.name, previous.spec, {});
    if (!live()) return;
    committed.current = {};
    setDraft((d) => d && { ...d, spec: rendered.spec, data: rendered.data });
    setSelections({});
    setRefinements(previous.refinements);
    setChanges(null);
    setUndoStack((stack) => stack.slice(0, -1));
  });
```

(จ) ใน `openSaved` แทน

```jsx
    setRefinements(doc.refinements || []);
    setChanges(null);
```

ด้วย

```jsx
    setRefinements(doc.refinements || []);
    setChanges(null);
    setUndoStack([]);
```

(ฉ) แทนบรรทัด `<RefinePanel ... />` ด้วย

```jsx
            <RefinePanel tableName={dataset.name} spec={draft.spec} onRefine={refine} busy={busy === "refine"} changes={changes}
              history={refinements} canUndo={undoStack.length > 0} onUndo={undo} undoing={busy === "undo"} />
```

- [ ] **Step 5: รันให้ผ่านทั้งชุด**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
Expected: PASS ทั้งหมด (94 เทสต์ ณ เวลาที่เขียนแผน)

- [ ] **Step 6: Commit**

```bash
git add services/ui/src/components/builder/RefinePanel.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(dashboard): go back one AI refinement at a time"
```

---

### Task 5: เอกสาร

**Files:**
- Modify: `docs/ui-analysis/06-create-dashboard.md`
- Modify: `docs/create-dashboard-improvement-proposal.md` (ภาคผนวก)

**Interfaces:**
- Consumes: ผลของ Task 1 ถึง 4
- Produces: เอกสารที่ตรงกับพฤติกรรมจริง

ขอบเขตของ Task นี้คือแก้เอกสารและรันเทสต์ทั้งสองฝั่งเท่านั้น **ห้ามรันคำสั่ง docker** (การ build และสลับ container เป็นงานของผู้ควบคุมหลัง merge)

- [ ] **Step 1: อัปเดตคู่มือหน้า**

ใน `docs/ui-analysis/06-create-dashboard.md` (ไฟล์ LF ใช้ Edit tool หาบรรทัดด้วยคำขึ้นต้นจาก Grep ก่อน)

(ก) บรรทัดตารางที่ขึ้นต้นด้วย ``| `RefinePanel.jsx` | `POST /refine` | `` แทนค่าในคอลัมน์ที่สอง `` `POST /refine` `` ด้วย `` `POST /refine`, `POST /suggest-changes` `` และต่อท้ายคอลัมน์ที่สาม (ก่อน ` | ยังไม่เก็บจนกว่าจะกดบันทึก |`) ด้วย `` และ `suggest_dashboard_changes` -> `dashboard_suggest.suggest_refinements` ``

(ข) แทนทั้งบรรทัดที่ขึ้นต้นด้วย `- **[ปุ่มตัวอย่าง 5 ปุ่ม]**` ด้วยบรรทัดนี้

```markdown
- **[การ์ดคำแนะนำปรับแดชบอร์ด]** -> (1) กดเพื่อเติมประโยคนั้นลงช่องพิมพ์ (ยังไม่ส่งจนกว่าจะกด "ปรับแดชบอร์ด") (2) สิ่งที่แดชบอร์ดปัจจุบันยังขาดเทียบกับคอลัมน์ของตาราง: G3 แนวโน้ม (ยังไม่มีกราฟเส้น/พื้นที่), G4 เทียบช่วงก่อนหน้า (KPI ที่ยังไม่เทียบ), G1 ตัวกรองหมวดหมู่ (ไม่เกิน 6 ตัวกรอง), G2 KPI ของคอลัมน์ตัวเลขที่ยังไม่มี KPI, G5 เปลี่ยนกราฟแท่งที่มีไม่เกิน 8 ค่าเป็นกราฟสัดส่วน (เฉพาะผลรวมหรือจำนวน), G6 ลบตารางรายละเอียดเมื่อกลุ่มผู้ใช้เป็น Management (3) `RefinePanel.jsx` เรียก `POST /api/v1/dashboards/suggest-changes` -> `dashboard_suggest.suggest_refinements` (ไม่เรียก AI ไม่อ่านแถวข้อมูล) ดึงใหม่ทุกครั้งที่ spec เปลี่ยน (หลังปรับหรือย้อนกลับ) ไม่ดึงใหม่เมื่อกรองหรือคลิกกราฟ (4) 🟡 คำนวณจาก spec กับโปรไฟล์ ถ้าโหลดไม่ได้หรือไม่มีอะไรจะแนะนำ แสดงข้อความแจ้งและยังพิมพ์เองได้ ยังไม่มีกฎ G7 (กล่องสรุปคุณภาพ)
```

(ค) แทนทั้งบรรทัด `- ไม่มีขั้นตอนยกเลิก/ย้อนกลับ (undo) หลัง refine ตรวจไม่พบในโค้ด` ด้วย

```markdown
- **[ปุ่ม "ย้อนกลับ"]** -> (1) ย้อนแดชบอร์ดกลับไปก่อนการปรับด้วย AI ครั้งล่าสุด ทีละครั้ง ปิดใช้งานเมื่อยังไม่เคยปรับหรือกำลังทำงาน (2) -- (3) `DashboardBuilder.jsx` เก็บ `undoStack` (spec กับประวัติคำสั่งก่อนปรับแต่ละครั้ง) แล้ววาด spec เก่าใหม่ด้วย `POST /render` แบบไม่มีตัวกรอง (4) 🟡 ตัวเลขคำนวณใหม่จากข้อมูลปัจจุบัน ตัวกรองถูกล้างเพื่อให้ตรงกับแถบตัวกรอง ประวัติคำสั่งย้อนไปด้วย ล้างเมื่อสร้างแดชบอร์ดใหม่ เปลี่ยนชุดข้อมูล หรือเปิดแดชบอร์ดที่บันทึกไว้ ยังไม่มี "บันทึกเป็นฉบับใหม่"
```

- [ ] **Step 2: อัปเดตภาคผนวกของเอกสารข้อเสนอ**

ใน `docs/create-dashboard-improvement-proposal.md` ท้ายไฟล์ (ไฟล์ LF)

(ก) ในย่อหน้า `**มีแล้วและตรวจจากโค้ด:**` ต่อท้ายบรรทัด (หลัง ` | คำบรรยายหน้าและป้ายฉบับร่าง`) ด้วย ` | คำแนะนำปรับตามช่องว่างกฎ G1 ถึง G6 | ปุ่มย้อนกลับหลังปรับด้วย AI (ระยะ 2)`

(ข) ในย่อหน้า `**ยังไม่มี (ข้อเสนอทั้งหมดในเอกสารนี้):**` แทนวลี `คำแนะนำปรับตามช่องว่าง | ` ด้วย `คำแนะนำปรับกฎ G7 | ` และแทนวลี `undo และบันทึกเป็นฉบับใหม่` ด้วย `บันทึกเป็นฉบับใหม่`

- [ ] **Step 3: รันเทสต์ทั้งสองฝั่ง**

Run (แยกคำสั่ง ไม่มี git ปนอยู่): `cd services/api && python -m pytest tests -q` และ `cd services/ui && npx vitest run`
Expected: UI ผ่านทั้งหมด; API ผ่านทั้งหมดยกเว้น 9 ตัวใน `tests/test_whitebox_engine.py` ที่เป็นเรื่องสภาพแวดล้อมของ worktree (รายงานจำนวนที่ผ่านและล้มตามจริง)

- [ ] **Step 4: Commit**

```bash
git add docs/ui-analysis/06-create-dashboard.md docs/create-dashboard-improvement-proposal.md
git commit -m "docs(dashboard): describe change suggestions and undo"
```

---

## Self-Review

**Spec coverage** (เทียบกับ `docs/create-dashboard-improvement-proposal.md` หัวข้อ 5.2 และ 2.1):

| ข้อกำหนดของ spec | Task |
|---|---|
| G1 ตัวกรองหมวดหมู่ที่ยังไม่มี (ไม่เกิน 6 ตัวกรอง) | Task 1 |
| G2 KPI ของคอลัมน์ measure ที่ยังไม่มี KPI | Task 1 |
| G3 แนวโน้มเมื่อมีวันที่แต่ยังไม่มีกราฟเส้น/พื้นที่ | Task 1 |
| G4 เทียบช่วงก่อนหน้าเมื่อ KPI ไม่มี compare | Task 1 |
| G5 กราฟแท่งที่ x มี ≤ 8 ค่าเปลี่ยนเป็นกราฟสัดส่วน | Task 1 (จำกัดเฉพาะ sum/count เพราะสัดส่วนของค่าเฉลี่ยไม่มีความหมาย) |
| G6 ผู้บริหารมีตารางกว้าง | Task 1 |
| G7 กล่องสรุปคุณภาพ | เลื่อนไป (ต้องมีข้อมูลคุณภาพ ระบุไว้ที่หัวแผน) |
| คำแนะนำไม่ใช่ข้อความสำเร็จรูป อ่านบริบทจาก dataset และ dashboard | Task 1, 2, 3 |
| ไม่แนะนำสิ่งที่ข้อมูลไม่มี (เช่น "เพิ่ม Filter จังหวัด" โดยไม่มีคอลัมน์จังหวัด) | Task 1 (กฎอ่านจากโปรไฟล์) |
| undo หลังปรับด้วย AI (หัวข้อ 2.1 ข้อ 4) | Task 4 |
| "บันทึกเป็นฉบับใหม่" | เลื่อนไป (ระบุไว้ที่หัวแผน) |

**Placeholder scan:** ไม่มี TBD หรือ "ทำในลักษณะเดียวกัน" ทุกขั้นที่แก้โค้ดมีโค้ดเต็มหรือคำสั่งแก้ที่ระบุตำแหน่งชัด

**Type consistency:** `suggest_refinements(profile, spec, limit)` (Task 1) ใช้ตรงกันใน Task 2 (`dashboard_suggest.suggest_refinements(profile, spec)`); รูปตอบกลับ `{"suggestions":[{id, rule, text}]}` ตรงกับที่ `RefinePanel` อ่าน (`res.suggestions`, `idea.id`, `idea.text`); `dashboardsApi.suggestChanges(table_name, spec)` ตรงกับที่ `RefinePanel` เรียก (`tableName`, `spec`); props ของ `RefinePanel` ใน Task 4 (`canUndo`, `onUndo`, `undoing`) ตรงกับที่ `DashboardBuilder` ส่ง; ข้อความ "ยังไม่มีคำแนะนำปรับ พิมพ์สิ่งที่อยากปรับได้เลย" ตรงกันระหว่าง `RefinePanel.jsx` และเทสต์ใน Task 3
