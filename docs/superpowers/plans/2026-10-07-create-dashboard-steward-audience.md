# Create Dashboard Data Steward Audience Implementation Plan (ระยะ 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มกลุ่มผู้ใช้ "ดูแลคุณภาพข้อมูล" (`steward`) ให้ Create Dashboard ได้แดชบอร์ดและคำแนะนำที่มองสุขภาพของข้อมูล (แถวซ้ำ ค่าว่าง ช่วงค่า และประวัติผลตรวจคุณภาพ) และทำให้โหมดกฎอัตโนมัติ (`fallback_spec`) ใช้กลุ่มผู้ใช้ที่เลือก ซึ่งเดิมไม่ใช้เลย

**Architecture:** (1) การคำนวณ `count_missing` ใหม่ใน whitelist ของ spec และ engine เพื่อให้ widget แสดงจำนวนค่าว่างได้ (2) ค่า audience `steward` ผ่านตัวตรวจ spec, prompt ของ LLM และ `fallback_spec` ซึ่งแยกเป็นสามแบบ: management ไม่มีตารางและมีการเทียบช่วง, analyst มีตารางกว้างขึ้น, steward ได้ spec สุขภาพข้อมูล (หรือ spec ของประวัติผลตรวจคุณภาพเมื่อชุดข้อมูลเป็น `_quality_runs`) (3) กฎคำแนะนำ R8 ใน `dashboard_suggest.py` ที่แสดงเฉพาะ steward (4) ตัวเลือกในหน้า `ContextForm` ทุกอย่างอ่านเฉพาะโปรไฟล์ ไม่อ่านแถวข้อมูล ไม่เรียก LLM ในเส้นทางคำแนะนำและโหมดกฎ

**Tech Stack:** FastAPI + pandas (container `api`, Python 3.10), pytest, React 18 + Vitest 2 + Testing Library, Git Bash

**Spec:** [`docs/create-dashboard-improvement-proposal.md`](../../create-dashboard-improvement-proposal.md) หัวข้อ 4.2, 4.3 (กลุ่มผู้ใช้ "ดูแลคุณภาพข้อมูล", กฎ R8) และ 7 (ระยะ 3: "เพิ่มกลุ่มผู้ใช้ + ให้ fallback_spec ใช้กลุ่มผู้ใช้")

**คำตัดสินเชิงออกแบบที่ทำไว้ก่อนเขียนแผน (spec ไม่ได้ระบุ):**
- **ชื่อที่แสดง:** "ดูแลคุณภาพข้อมูล" ตามที่ spec กำหนด ส่วนค่าที่ส่งไป API คือ `steward`
- **เพิ่ม `count_missing`:** spec บอกว่าผู้ดูแลข้อมูลต้องการเห็น "ค่าว่างต่อคอลัมน์" แต่ engine เดิมมีแค่ count, count_distinct, sum, avg, min, max ซึ่งแสดงจำนวนค่าว่างไม่ได้ จึงเพิ่มการคำนวณเดียวนี้ (นับเซลล์ที่ว่างของคอลัมน์ใดก็ได้)
- **แถวซ้ำ:** ไม่มีการคำนวณ "แถวซ้ำ" โดยตรง ใช้การเทียบ KPI จำนวนแถว กับ KPI count_distinct ของคอลัมน์ที่น่าจะเป็นคีย์ (ค่าไม่ซ้ำ ≥ 90% ของแถว ไม่นับวันที่) ถ้าสองตัวเลขต่างกันแสดงว่ามีแถวซ้ำ
- **ประวัติผลตรวจคุณภาพ:** ชุดข้อมูล `_quality_runs` ที่ระบบมีอยู่แล้วเป็นแหล่งของ "คะแนนคุณภาพ" และ "แถวที่ถูกกักกัน" ตรวจจากชื่อคอลัมน์ `timestamp`, `table_name`, `quality_score`, `quarantined_records` ครบทั้งสี่
- **ผู้ใช้อื่นใน `fallback_spec`:** business เหมือนเดิม, management ไม่มีตารางรายละเอียดและ KPI แรกเทียบรายเดือน (ถ้ามีวันที่), analyst ตารางกว้าง 12 คอลัมน์แทน 8 (ตรงกับคำอธิบายใน system prompt ของ LLM)
- **R8 เฉพาะ steward:** กฎสุขภาพข้อมูลไม่ปนในลำดับของกลุ่มอื่น

**ขอบเขตที่ตั้งใจเลื่อนไป (ไม่ทำในแผนนี้):**
- กฎ G7 (เพิ่มกล่องสรุปคุณภาพเมื่อรอบล่าสุดต่ำกว่าเกณฑ์) ต้องใช้ผลตรวจรอบล่าสุดต่อตาราง
- ระบบสิทธิ์จริงของ role (ยังมีบัญชี admin เดียว กลุ่มผู้ใช้เป็นแค่คำใบ้ของแดชบอร์ด)
- ให้ AI จัดอันดับ/เรียบเรียงคำแนะนำ (ระยะ 4) และ Semantic Layer (ระยะ 5)
- "บันทึกเป็นฉบับใหม่"
- ตัวเลือก steward ไม่ได้ปิดการกรองคอลัมน์รหัสออกจากแดชบอร์ด (ยังเป็นพฤติกรรมของ AI และตัวตรวจ spec เดิม)

## Global Constraints

- ทำใน worktree ที่มีอยู่แล้ว `C:\ETL\.claude\worktrees\steward-audience` บน branch `feat/steward-audience` ห้าม commit ลง `main` หรือ `feat/generic-profiling-rule-engine` โดยตรง
- Commit message แบบ conventional (`feat(dashboard): ...`) **ไม่ใส่ attribution line ใดๆ** (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- stage เฉพาะไฟล์ที่ Task ระบุ ห้ามใช้ `git add -A`, `git add .` หรือ `git commit -a`
- **Line ending:** ไฟล์ที่แผนนี้แตะเป็น LF ทั้งหมด **ยกเว้น `services/api/app/api/dashboard_compute.py` ที่เป็น CRLF** (ตรวจด้วย `git ls-files --eol <ไฟล์>` ก่อนแก้เสมอ) ห้ามแก้ไฟล์ด้วย Python แบบ text mode บน Windows เพราะจะเขียนไฟล์ LF เป็น CRLF ทั้งไฟล์ ใช้ Edit tool (รักษา line ending เดิมของไฟล์ไว้) หรือเปิดไฟล์ด้วย `newline=''` และเทียบ `git diff --stat` ว่าไม่บวมผิดปกติหลังแก้
- **ความเป็นส่วนตัว:** คำแนะนำและโหมดกฎอัตโนมัติสร้างจากโปรไฟล์คอลัมน์เท่านั้น (ชื่อ ชนิด จำนวนค่าไม่ซ้ำ จำนวนและ % ค่าว่าง ช่วงตัวเลขและวันที่) ห้ามอ่านหรือส่งค่าในเซลล์ ห้ามเรียก LLM ในสองเส้นทางนี้ ตัวเลขของแดชบอร์ดคำนวณด้วย pandas เหมือนเดิม
- **ข้อความหน้าจอ (กติกาของโปรเจกต์):** ห้ามมี em dash หรือ en dash ห้ามใช้ emoji ปุ่มและป้ายเลือกใช้คำสั้น
- **ชื่อ endpoint ที่มีอยู่แล้ว:** แผนนี้ไม่เพิ่ม endpoint ใหม่ ห้ามเปลี่ยนชื่อ `/dashboards/suggest-changes` ซึ่งต้องไม่มีสตริง `/dashboards/refine` อยู่ข้างใน (mock ของเทสต์ UI จับ URL แบบ "มีสตริงนี้อยู่")
- **การทดสอบ UI:** `mockFetchByUrl` ใช้ route แรกที่ URL มีสตริงนั้นเป็นส่วนหนึ่ง route ที่ยาวกว่าต้องมาก่อน `/dashboards/datasets`
- **คำสั่งทดสอบ:**
  - API: `cd services/api && python -m pytest tests -q -k dashboard`
  - UI: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
  - เทสต์ API ทั้งชุดใน worktree ล้ม 9 ตัวใน `tests/test_whitebox_engine.py` เพราะไฟล์ข้อมูลที่ git ไม่ติดตาม (`dirty_dataset.csv`) ไม่อยู่ใน worktree ถือเป็นเรื่องของสภาพแวดล้อม ไม่ใช่ความผิดของงานนี้
- **การดูผลบนระบบจริง:** `sdoqap-api` และ `sdoqap-ui` เป็น Docker image ที่ build ไว้ แก้โค้ดแล้วหน้าเว็บไม่เปลี่ยนจนกว่าจะ build ใหม่ (ผู้ควบคุมทำหลัง merge ห้ามรัน docker ใน Task ใดของแผนนี้)
- รูปแบบโปรไฟล์ที่ทุกฟังก์ชันอ่าน (จาก `dashboard_data.profile_dataframe()`): `{"rows": int, "columns": [{"name", "kind", "dtype", "missing": int, "missing_pct": float, "distinct": int, "min"?, "max"?}]}` โดย `missing` คือจำนวนเซลล์ว่างจริง

---

### Task 1: การคำนวณ `count_missing`

**Files:**
- Modify: `services/api/app/api/dashboard_spec.py`
- Modify: `services/api/app/api/dashboard_compute.py` (**CRLF**)
- Modify: `services/api/app/api/dashboard_llm.py` (หนึ่งบรรทัดใน system prompt)
- Test: `services/api/tests/test_dashboard_spec.py`
- Test: `services/api/tests/test_dashboard_compute.py`

**Interfaces:**
- Consumes: `validate_spec(raw, profile)` และ `compute_dashboard(df, spec, profile, selections)`; ในไฟล์ทดสอบ `check(...)` (spec) และ `one(...)` / `PROFILE` / `DF` (compute) ที่มีอยู่แล้ว
- Produces: ค่า `"count_missing"` ใน `AGGREGATIONS` (รับคอลัมน์ชนิดใดก็ได้ที่มีในโปรไฟล์ ไม่รับคอลัมน์ที่ไม่มี) และ metric `{"agg": "count_missing", "column": <ชื่อคอลัมน์>}` ที่คำนวณเป็นจำนวนเซลล์ว่างของคอลัมน์นั้นในแถวที่ผ่านตัวกรอง ทั้งใน KPI และต่อกลุ่ม (bar/pie/line)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

(ก) ใน `services/api/tests/test_dashboard_spec.py` แทรกก่อนฟังก์ชัน `def test_a_spec_with_nothing_usable_is_an_error():`

```python
def test_count_missing_takes_a_column_of_any_kind_and_rejects_an_unknown_one():
    spec, warnings = check(*({"type": "kpi", "title": c, "metric": {"agg": "count_missing", "column": c}}
                             for c in ("region", "amount", "customer", "order_date")))
    assert warnings == [] and [w["metric"]["column"] for w in spec["widgets"]] == ["region", "amount", "customer", "order_date"]
    _, warnings = check({"type": "kpi", "title": "ok", "metric": SUM},
                        {"type": "kpi", "title": "x", "metric": {"agg": "count_missing", "column": "nope"}})
    assert "nope" in " ".join(warnings)
```

(ข) ต่อท้าย `services/api/tests/test_dashboard_compute.py`

```python
def test_count_missing_counts_the_empty_cells_of_a_column():
    assert one({"type": "kpi", "metric": {"agg": "count_missing", "column": "region"}})["value"] == 1
    assert one({"type": "kpi", "metric": {"agg": "count_missing", "column": "amount"}})["value"] == 0


def test_count_missing_per_group_and_after_a_filter():
    metric = {"agg": "count_missing", "column": "region"}
    rows = one({"type": "bar", "x": "segment", "metric": metric, "sort": "x"})["rows"]
    assert {r["x"]: r["value"] for r in rows} == {"A": 1, "B": 0, "C": 0}
    assert one({"type": "kpi", "metric": metric}, {"segment": {"values": ["B", "C"]}})["value"] == 0
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboard_spec.py tests/test_dashboard_compute.py -q -k "missing"`
Expected: FAIL (spec: widget ถูกตัดพร้อมคำเตือน `ไม่รองรับการคำนวณ count_missing`; compute: `KeyError`/ตัด widget)

- [ ] **Step 3: เพิ่มการคำนวณ**

(ก) ใน `services/api/app/api/dashboard_spec.py` แทนบรรทัด

```python
AGGREGATIONS = ("count", "count_distinct", "sum", "avg", "min", "max")
```

ด้วย

```python
AGGREGATIONS = ("count", "count_distinct", "count_missing", "sum", "avg", "min", "max")
```

(`NUMERIC_AGGREGATIONS` ไม่เปลี่ยน ตัวตรวจจึงรับ `count_missing` กับคอลัมน์ทุกชนิดเหมือน `count_distinct`)

(ข) ใน `services/api/app/api/dashboard_compute.py` (ไฟล์ **CRLF** ใช้ Edit tool เท่านั้น ห้ามเขียนทับทั้งไฟล์) สองจุด

ในฟังก์ชัน `_aggregate` ต่อจากบล็อก `if agg == "count_distinct": return int(frame[column].nunique())` เพิ่ม

```python
    if agg == "count_missing":
        return int(frame[column].isna().sum())
```

ในฟังก์ชัน `_grouped` ต่อจากบล็อก `if agg == "count_distinct": return groups[column].nunique()` เพิ่ม

```python
    if agg == "count_missing":
        return frame.assign(_missing=frame[column].isna()).groupby(keys, sort=False)["_missing"].sum()
```

(ค) ใน `services/api/app/api/dashboard_llm.py` แทนบรรทัดใน `SYSTEM_PROMPT`

```
- sum, avg, min and max need a numeric column; count takes "column": null.
```

ด้วย

```
- sum, avg, min and max need a numeric column; count takes "column": null; count_distinct and count_missing take any column.
```

- [ ] **Step 4: รันให้ผ่านทั้งชุด**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด

- [ ] **Step 5: ตรวจว่าไม่ได้เปลี่ยน line ending**

Run: `git diff --stat` (จากรากของ worktree)
Expected: `dashboard_compute.py` เปลี่ยนเพียงประมาณ 4 บรรทัด (ถ้าขึ้นหลายร้อยบรรทัดแสดงว่า line ending ถูกเปลี่ยน ให้ย้อนแล้วแก้ใหม่ด้วย Edit tool)

- [ ] **Step 6: Commit**

```bash
git add services/api/app/api/dashboard_spec.py services/api/app/api/dashboard_compute.py services/api/app/api/dashboard_llm.py services/api/tests/test_dashboard_spec.py services/api/tests/test_dashboard_compute.py
git commit -m "feat(dashboard): count the empty cells of a column"
```

---

### Task 2: กลุ่มผู้ใช้ steward และโหมดกฎที่ใช้กลุ่มผู้ใช้

**Files:**
- Modify: `services/api/app/api/dashboard_spec.py` (บรรทัด `AUDIENCES`)
- Modify: `services/api/app/api/dashboard_suggest.py` (ค่าคงที่ `KEY_LIKE_RATIO`)
- Modify: `services/api/app/api/dashboard_llm.py`
- Test: `services/api/tests/test_dashboard_spec.py`
- Test: `services/api/tests/test_dashboard_llm.py`

**Interfaces:**
- Consumes: `count_missing` (Task 1), `is_identifier(column, rows)` จาก `dashboard_suggest`, `validate_spec`, `compute_dashboard`, `prepare_frame`; ในไฟล์ทดสอบ `PROFILE`, `groq` fixture ที่มีอยู่แล้ว
- Produces: `AUDIENCES = ("business", "analyst", "management", "steward")`; `KEY_LIKE_RATIO = 0.9` ใน `dashboard_suggest.py`; `fallback_spec(profile, context="", audience="business") -> dict` (ค่าเริ่มต้นของ `audience` ทำให้ผู้เรียกเดิมไม่พัง) และ `generate_spec` ส่ง `audience` ให้มัน; ทุก endpoint ที่ตรวจ audience ด้วย `_audience()` รับ `steward` อัตโนมัติ

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

(ก) ใน `services/api/tests/test_dashboard_spec.py` แทรกก่อนฟังก์ชัน `def test_a_spec_with_nothing_usable_is_an_error():`

```python
def test_the_steward_audience_is_kept():
    spec, _ = check({"type": "kpi", "metric": SUM}, audience="steward")
    assert spec["audience"] == "steward"
```

(ข) ใน `services/api/tests/test_dashboard_llm.py`

เพิ่มบรรทัด import ต่อจากบรรทัด `from app.api import dashboard_llm  # noqa: E402`

```python
from app.api.dashboard_compute import compute_dashboard  # noqa: E402
```

แล้วแทรกบล็อกนี้ทั้งหมดก่อนฟังก์ชัน `def test_refine_sends_the_current_spec_and_reports_changes(groq):`

```python
def widget_titles(spec):
    return [w["title"] for w in spec["widgets"]]


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
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboard_spec.py tests/test_dashboard_llm.py -q`
Expected: FAIL (audience `steward` ถูกเปลี่ยนเป็น business, `fallback_spec` ยังไม่รับพารามิเตอร์ที่สาม)

- [ ] **Step 3: เพิ่มกลุ่มผู้ใช้และค่าคงที่**

(ก) ใน `services/api/app/api/dashboard_spec.py` แทนบรรทัด

```python
AUDIENCES = ("business", "analyst", "management")
```

ด้วย

```python
AUDIENCES = ("business", "analyst", "management", "steward")
```

(ข) ใน `services/api/app/api/dashboard_suggest.py` ต่อจากบรรทัด `DEFAULT_LIMIT = 6` เพิ่ม

```python
KEY_LIKE_RATIO = 0.9  # a column with at least this share of distinct values per row probably identifies a row
```

- [ ] **Step 4: แก้ `dashboard_llm.py`**

ใน `services/api/app/api/dashboard_llm.py` ทำ 4 การแก้

(ก) เปลี่ยนบรรทัด import

```python
from .dashboard_suggest import is_identifier
```

เป็น

```python
from .dashboard_suggest import KEY_LIKE_RATIO, is_identifier
```

(ข) ใน `SYSTEM_PROMPT` ต่อจากบรรทัดที่ขึ้นต้นด้วย `- audience "management": headline kpis` เพิ่มบรรทัดนี้ (เป็นบรรทัดเดียวในสตริง ห้ามตัดบรรทัด)

```
- audience "steward" reads data health, not business results: kpis of count, of count_distinct over key-like columns (read against the row count they expose duplicates), of count_missing over columns with missing values, of min and max over numeric columns, and a detail table. For the quality-run history (columns quality_score and quarantined_records) trend the score and rank tables by it.
```

(ค) แทนฟังก์ชัน `fallback_spec` ทั้งฟังก์ชัน (ตั้งแต่ `def fallback_spec(profile, context=""):` ถึงบรรทัด `    return {"title": "แดชบอร์ดภาพรวม", "description": context[:300], "widgets": widgets, "filters": filters}`) ด้วยบล็อกนี้

```python
_QUALITY_RUN_COLUMNS = {"timestamp", "table_name", "quality_score", "quarantined_records"}
_SCORE = {"agg": "avg", "column": "quality_score"}
_COUNT = {"agg": "count", "column": None}


def _quality_run_spec(profile):
    """The quality-run history (one row per Quality Gate run): score trend, worst tables, quarantined rows."""
    names = {c["name"] for c in profile["columns"]}
    widgets = [
        {"type": "kpi", "title": "คะแนนคุณภาพเฉลี่ย", "metric": _SCORE, "format": "percent"},
        {"type": "kpi", "title": "แถวที่ถูกกักกัน", "metric": {"agg": "sum", "column": "quarantined_records"}},
        {"type": "kpi", "title": "จำนวนรอบที่ตรวจ", "metric": _COUNT},
        {"type": "line", "title": "แนวโน้มคะแนนคุณภาพ", "x": "timestamp", "time_grain": "day", "metric": _SCORE},
        {"type": "bar", "title": "ตารางที่คะแนนต่ำสุด", "x": "table_name", "sort": "asc", "limit": 10, "metric": _SCORE}]
    if "gate_result" in names:
        widgets.append({"type": "donut", "title": "ผลผ่านเกณฑ์", "x": "gate_result", "metric": _COUNT})
    shown = [c for c in ("timestamp", "table_name", "total_records", "quarantined_records", "quality_score", "gate_result") if c in names]
    widgets.append({"type": "table", "title": "รอบที่ตรวจล่าสุด", "columns": shown,
                    "order_by": {"column": "timestamp", "desc": True}, "limit": 20})
    return {"widgets": widgets, "filters": [{"column": "table_name"}, {"column": "timestamp"}]}


def _health_spec(profile):
    """Data health from the profile: duplicates in key-like columns, empty cells, value ranges."""
    columns, rows = profile["columns"], profile["rows"]
    if _QUALITY_RUN_COLUMNS <= {c["name"] for c in columns}:
        return _quality_run_spec(profile)
    widgets = [{"type": "kpi", "title": "จำนวนแถว", "metric": _COUNT}]
    keys = [c for c in columns if c["kind"] != "date" and rows and c["distinct"] >= KEY_LIKE_RATIO * rows][:2]
    widgets += [{"type": "kpi", "title": f"ค่าไม่ซ้ำของ {c['name']}", "metric": {"agg": "count_distinct", "column": c["name"]}} for c in keys]
    gaps = sorted((c for c in columns if c["missing"] > 0), key=lambda c: -c["missing_pct"])[:3]
    widgets += [{"type": "kpi", "title": f"ค่าว่างของ {c['name']}", "metric": {"agg": "count_missing", "column": c["name"]}} for c in gaps]
    for c in [c for c in columns if c["kind"] == "numeric" and not is_identifier(c, rows)][:2]:
        widgets.append({"type": "kpi", "title": f"ต่ำสุด {c['name']}", "metric": {"agg": "min", "column": c["name"]}})
        widgets.append({"type": "kpi", "title": f"สูงสุด {c['name']}", "metric": {"agg": "max", "column": c["name"]}})
    widgets.append({"type": "table", "title": "ตัวอย่างข้อมูล", "columns": [c["name"] for c in columns[:8]]})
    categories = sorted((c for c in columns if c["kind"] == "categorical"), key=lambda c: c["distinct"])
    return {"widgets": widgets, "filters": [{"column": c["name"]} for c in categories[:2]]}


def fallback_spec(profile, context="", audience="business"):
    """A sensible dashboard from the column kinds alone, used when the LLM is unavailable.
    The reader type shapes it: management gets no detail table and a period comparison, an analyst a
    wider table, a data steward a data-health view."""
    if audience == "steward":
        return {"title": "แดชบอร์ดสุขภาพข้อมูล", "description": context[:300], **_health_spec(profile)}
    columns = profile["columns"]
    numeric = [c["name"] for c in columns if c["kind"] == "numeric"]
    dates = [c["name"] for c in columns if c["kind"] == "date"]
    categories = sorted((c for c in columns if c["kind"] == "categorical"), key=lambda c: c["distinct"])
    main = {"agg": "sum", "column": numeric[0]} if numeric else {"agg": "count", "column": None}
    widgets = [{"type": "kpi", "title": "จำนวนแถว", "metric": {"agg": "count", "column": None}}]
    widgets += [{"type": "kpi", "title": f"ผลรวม {n}", "metric": {"agg": "sum", "column": n}} for n in numeric[:3]]
    if audience == "management" and dates:
        widgets[0]["compare"] = {"date_column": dates[0], "time_grain": "month"}
    if dates:
        widgets.append({"type": "line", "title": f"แนวโน้มรายเดือนตาม {dates[0]}", "x": dates[0],
                        "time_grain": "month", "metric": main})
    if categories:
        widest = categories[-1]["name"]
        widgets.append({"type": "bar", "title": f"แยกตาม {widest}", "x": widest, "metric": main})
        if len(categories) > 1 and categories[0]["distinct"] <= 8:
            narrow = categories[0]["name"]
            widgets.append({"type": "donut", "title": f"สัดส่วนตาม {narrow}", "x": narrow, "metric": main})
    if audience != "management":
        widgets.append({"type": "table", "title": "ตัวอย่างข้อมูล", "columns": [c["name"] for c in columns[:12 if audience == "analyst" else 8]]})
    filters = [{"column": c["name"]} for c in categories[:2]] + [{"column": d} for d in dates[:1]]
    title = "แดชบอร์ดผู้บริหาร" if audience == "management" else "แดชบอร์ดภาพรวม"
    return {"title": title, "description": context[:300], "widgets": widgets, "filters": filters}
```

(ง) ใน `generate_spec` แทน

```python
        spec, warnings = validate_spec(fallback_spec(profile, context), profile)
```

ด้วย

```python
        spec, warnings = validate_spec(fallback_spec(profile, context, audience), profile)
```

- [ ] **Step 5: รันให้ผ่านทั้งชุด**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด (เทสต์เดิมของ `fallback_spec` ที่ไม่ส่ง audience ต้องผ่านโดยไม่แก้: ค่าเริ่มต้น business ให้ผลเดิม)

- [ ] **Step 6: Commit**

```bash
git add services/api/app/api/dashboard_spec.py services/api/app/api/dashboard_suggest.py services/api/app/api/dashboard_llm.py services/api/tests/test_dashboard_spec.py services/api/tests/test_dashboard_llm.py
git commit -m "feat(dashboard): a data steward audience and rule-based dashboards that follow the reader"
```

---

### Task 3: กฎคำแนะนำ R8 สำหรับผู้ดูแลข้อมูล

**Files:**
- Modify: `services/api/app/api/dashboard_suggest.py`
- Test: `services/api/tests/test_dashboard_suggest.py`
- Test: `services/api/tests/test_dashboards_api.py`

**Interfaces:**
- Consumes: `KEY_LIKE_RATIO`, `is_identifier`, `_suggestion`, `_interleave`, `_RULE_ORDER` ในไฟล์เดียวกัน; `count_missing` (Task 1); audience `steward` (Task 2); ในไฟล์ทดสอบ `profile`, `col`, `texts`, `validate_spec` และ profile ตัวอย่างที่มีอยู่ (`ECOMMERCE`, `OLIST`, `STUDENTS`, `GROCERY`); ใน API test `weekly` fixture, `suggestions(audience)`, `client()`
- Produces: กฎ `R8` (สุขภาพข้อมูล) ที่ `suggest_from_profile(profile, "steward", limit)` ใส่เป็นลำดับแรกสุด และกลุ่มผู้ใช้อื่นไม่เคยได้รับ: ตรวจแถวซ้ำของคอลัมน์ที่น่าจะเป็นคีย์ (สูงสุด 2), ตรวจค่าว่าง (สูงสุด 3 คอลัมน์ เรียงตาม % ว่างมากไปน้อย ข้อความมี % ในวงเล็บ รวมคอลัมน์ที่ว่างเกินครึ่งซึ่งแผนภูมิตัดออก), ตรวจช่วงค่าต่ำสุดและสูงสุดของคอลัมน์ตัวเลขที่ไม่ใช่รหัส (สูงสุด 2) แต่ละรายการมี `widget` ที่ผ่าน `validate_spec` เสมอ

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

(ก) ใน `services/api/tests/test_dashboard_suggest.py` แทรกบล็อกนี้ทันทีก่อนฟังก์ชัน `def texts(p, audience="business", limit=6):`

```python
PG_STUDENTS = profile(
    9441,
    col("dirty_row_id", "numeric", 9441, low=1.0, high=10100.0), col("record_id", "numeric", 9349, low=1.0, high=10000.0),
    col("student_id", "numeric", 9349, low=65001.0, high=75000.0), col("course", "categorical", 5),
    col("score", "numeric", 52, low=50.0, high=101.0),
    col("semester", "date", 2, low="2026-01-01T00:00:00", high="2026-02-01T00:00:00"),
    col("study_hours", "numeric", 9, low=1.0, high=9.0),
    col("updated_at", "date", 1, low="2026-09-15T10:00:00", high="2026-09-15T10:00:00"))


def counted(p):
    """The profile with each column's empty-cell count derived from its percentage, as a real profile has both."""
    for c in p["columns"]:
        c["missing"] = round(c["missing_pct"] / 100 * p["rows"])
    return p
```

(ข) ต่อท้ายไฟล์เดียวกัน

```python
# --- data health, for the reader who looks after the data (rule R8) -------------------------------------


def test_a_steward_is_offered_data_health_checks_first():
    assert texts(PG_STUDENTS, "steward") == [
        "ตรวจแถวซ้ำของ dirty_row_id",
        "ค่าเฉลี่ย score เดือนล่าสุด เทียบช่วงก่อนหน้า",
        "ค่าเฉลี่ย score ตาม course",
        "สัดส่วน จำนวนแถว ตาม course",
        "ตรวจแถวซ้ำของ record_id",
        "ตรวจช่วงค่าต่ำสุดและสูงสุดของ score"]


def test_only_a_steward_is_offered_data_health_checks():
    for audience in ("business", "analyst", "management", "unknown"):
        assert not any(s["rule"] == "R8" for s in suggest_from_profile(counted(PG_STUDENTS), audience, 50))


def test_empty_cells_are_checked_worst_first_and_sparse_columns_are_not_left_out():
    sparse = profile(1000, col("name", "text", 1000), col("phone", "text", 150, 80.0), col("amount", "numeric", 40, 2.5, 1.5, 9.5),
                     col("city", "categorical", 12, 10.0))
    found = [s["text"] for s in suggest_from_profile(counted(sparse), "steward", 50) if s["rule"] == "R8"]
    assert [t for t in found if t.startswith("ตรวจค่าว่าง")] == [
        "ตรวจค่าว่างของ phone (80%)", "ตรวจค่าว่างของ city (10%)", "ตรวจค่าว่างของ amount (2.5%)"]
    assert "ตรวจแถวซ้ำของ name" in found  # a text column with one value per row is a key


@pytest.mark.parametrize("p", [ECOMMERCE, OLIST, STUDENTS, GROCERY, PG_STUDENTS], ids=["ecommerce", "olist", "students", "grocery", "pg"])
def test_every_data_health_widget_is_accepted_by_the_spec_validator(p):
    checks = [s for s in suggest_from_profile(counted(p), "steward", 50) if s["rule"] == "R8"]
    assert checks
    spec, warnings = validate_spec({"widgets": [s["widget"] for s in checks]}, p)
    assert warnings == [] and len(spec["widgets"]) == len(checks)
```

(ค) ต่อท้าย `services/api/tests/test_dashboards_api.py`

```python
def test_the_steward_audience_is_accepted_and_starts_with_a_data_health_check(weekly):
    first = suggestions("steward").json()["suggestions"][0]
    assert first["rule"] == "R8" and first["text"] == "ตรวจแถวซ้ำของ amount"


def test_a_steward_dashboard_is_generated_from_the_data_health_rules_without_an_llm(weekly):
    res = client().post("/api/v1/dashboards/generate", json={"table_name": "weekly", "context": "ตรวจข้อมูล", "audience": "steward"})
    assert res.status_code == 200
    body = res.json()
    assert body["engine"] == "rules" and body["spec"]["audience"] == "steward"
    titles = [w["title"] for w in body["spec"]["widgets"]]
    assert titles[:2] == ["จำนวนแถว", "ค่าไม่ซ้ำของ amount"]
    data = body["data"]["widgets"]
    assert [data[w["id"]]["value"] for w in body["spec"]["widgets"][:2]] == [12, 12]
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboard_suggest.py tests/test_dashboards_api.py -q -k "steward or health or empty_cells"`
Expected: FAIL (ไม่มี R8; `steward` ได้ลำดับของ business)

- [ ] **Step 3: เพิ่มกฎ R8**

ใน `services/api/app/api/dashboard_suggest.py` ทำ 5 การแก้

(ก) ต่อจากบรรทัด `KEY_LIKE_RATIO = 0.9 ...` เพิ่ม

```python
HEALTH_KEYS, HEALTH_GAPS, HEALTH_RANGES = 2, 3, 2  # how many columns each data-health check names
```

(ข) ใน `_RULE_ORDER` แทนบรรทัด `               "management": ("R4", "R1", "R3", "R2", "R5", "R7")}` ด้วย

```python
               "management": ("R4", "R1", "R3", "R2", "R5", "R7"),
               "steward": ("R8", "R1", "R4", "R2", "R3", "R5", "R7")}
```

(ค) ใน `suggest_from_profile` แทนบรรทัด

```python
    by_rule = {rule: [] for rule in ("R1", "R2", "R3", "R4", "R5", "R7")}
```

ด้วย

```python
    by_rule = {rule: [] for rule in ("R1", "R2", "R3", "R4", "R5", "R7", "R8")}
```

(ง) แทนบรรทัดท้ายของ `suggest_from_profile`

```python
    return _interleave(by_rule, _RULE_ORDER.get(audience, _RULE_ORDER["business"]), limit)
```

ด้วยโค้ดนี้ (ฟังก์ชัน `_health_checks` วางต่อทันที ก่อนฟังก์ชัน `_interleave`)

```python
    by_rule["R8"] = _health_checks(profile)
    return _interleave(by_rule, _RULE_ORDER.get(audience, _RULE_ORDER["business"]), limit)


def _health_checks(profile):
    """What a data steward looks at first: duplicates in key-like columns, empty cells, value ranges.
    Every column counts here, including the identifiers and sparse columns that the charts leave out."""
    columns, rows = profile["columns"], profile["rows"]
    checks = []
    keys = [c for c in columns if c["kind"] != "date" and rows and c["distinct"] >= KEY_LIKE_RATIO * rows][:HEALTH_KEYS]
    for c in keys:
        checks.append(_suggestion("R8", f"duplicates:{c['name']}", f"ตรวจแถวซ้ำของ {c['name']}",
                                  {"type": "kpi", "metric": {"agg": "count_distinct", "column": c["name"]}}))
    for c in sorted((c for c in columns if c["missing"] > 0), key=lambda c: -c["missing_pct"])[:HEALTH_GAPS]:
        checks.append(_suggestion("R8", f"missing:{c['name']}", f"ตรวจค่าว่างของ {c['name']} ({c['missing_pct']:g}%)",
                                  {"type": "kpi", "metric": {"agg": "count_missing", "column": c["name"]}}))
    for c in [c for c in columns if c["kind"] == "numeric" and not is_identifier(c, rows)][:HEALTH_RANGES]:
        checks.append(_suggestion("R8", f"range:{c['name']}", f"ตรวจช่วงค่าต่ำสุดและสูงสุดของ {c['name']}",
                                  {"type": "kpi", "metric": {"agg": "max", "column": c["name"]}}))
    return checks
```

- [ ] **Step 4: รันให้ผ่านทั้งชุด**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด (เทสต์เดิมของ `suggest_from_profile` ต้องผ่านโดยไม่แก้ เพราะ R8 ไม่อยู่ในลำดับของกลุ่มอื่น) ถ้าเทสต์ลำดับของ steward ไม่ตรง ห้ามแก้ข้อความที่คาดหวังให้ตรงผลลัพธ์ ให้ตรวจก่อนว่ากฎใดเปลี่ยน

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_suggest.py services/api/tests/test_dashboard_suggest.py services/api/tests/test_dashboards_api.py
git commit -m "feat(dashboard): suggest data-health checks to a data steward"
```

---

### Task 4: UI, ตัวเลือก "ดูแลคุณภาพข้อมูล"

**Files:**
- Modify: `services/ui/src/components/builder/ContextForm.jsx`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx`

**Interfaces:**
- Consumes: `/dashboards/datasets/{table}/suggestions?audience=` และ `/dashboards/generate` ที่รับ `steward` แล้ว (Task 2 และ 3); ในเทสต์ `openRequestStep()`, `settle`, `callTo`, `EXAMPLE`
- Produces: ตัวเลือกวิทยุที่สี่ในกลุ่ม "ผู้ใช้แดชบอร์ด" ชื่อ "ดูแลคุณภาพข้อมูล" (ค่า `steward`) ที่ทำให้หน้าขอคำแนะนำด้วย `audience=steward` และส่ง `audience: "steward"` ไป `/generate`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ใน `services/ui/src/pages/DashboardBuilder.test.jsx` แทรกทันทีก่อนเทสต์ `it("says so when the dataset has no suggestions or they cannot be loaded, and still lets the user type", async () => {`

```jsx
it("offers the data steward as a reader type, asks for its suggestions and sends it with the request", async () => {
  await openRequestStep();
  fireEvent.click(screen.getByRole("radio", { name: "ดูแลคุณภาพข้อมูล" }));
  await settle();
  const urls = fetch.mock.calls.map(([url]) => String(url)).filter((u) => u.includes("/suggestions"));
  expect(urls.at(-1)).toContain("audience=steward");
  fireEvent.click(await screen.findByRole("button", { name: EXAMPLE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/generate")[1].body).audience).toBe("steward");
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx -t "data steward"`
Expected: FAIL (`Unable to find an accessible element with the role "radio" and name "ดูแลคุณภาพข้อมูล"`)

- [ ] **Step 3: เพิ่มตัวเลือก**

ใน `services/ui/src/components/builder/ContextForm.jsx` แทนบรรทัด

```jsx
  { value: "management", label: "Management" }
```

ด้วย

```jsx
  { value: "management", label: "Management" },
  { value: "steward", label: "ดูแลคุณภาพข้อมูล" }
```

- [ ] **Step 4: รันให้ผ่านทั้งชุด**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
Expected: PASS ทั้งหมด (101 เทสต์ ณ เวลาที่เขียนแผน: 100 เดิม + 1 ใหม่)

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/components/builder/ContextForm.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(dashboard): let the reader be a data steward"
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

(ก) แทนทั้งบรรทัดที่ขึ้นต้นด้วย `- **[ตัวเลือก "ผู้ใช้แดชบอร์ด": Business User / Data Analyst / Management]**` ด้วยบรรทัดนี้

```markdown
- **[ตัวเลือก "ผู้ใช้แดชบอร์ด": Business User / Data Analyst / Management / ดูแลคุณภาพข้อมูล]** -> (1) เลือกกลุ่มผู้ใช้เป้าหมาย (ค่าเริ่มต้น business) กลุ่มนี้เป็นคำใบ้ของแดชบอร์ด ไม่ใช่สิทธิ์การเข้าถึง (ระบบ login ยังมีบัญชี admin เดียว) (2) -- (3) `ContextForm.jsx` ส่งไป `/generate` และ `/suggestions` เป็น `audience` เซิร์ฟเวอร์ตรวจว่าเป็น 1 ใน 4 ค่า (`AUDIENCES` ใน `dashboard_spec.py`) และใส่ในพรอมต์ให้ AI: management = KPI หัวข้อ+เปรียบเทียบ+แนวโน้ม ไม่มีตารางกว้าง / analyst = แตกมิติมากขึ้น+ตารางรายละเอียด / business = สมดุล / steward = สุขภาพข้อมูล (KPI จำนวนแถวเทียบจำนวนค่าไม่ซ้ำของคอลัมน์คีย์ จำนวนค่าว่าง ค่าต่ำสุดสูงสุด และแนวโน้มคะแนนคุณภาพเมื่อเป็นชุดผลตรวจคุณภาพ) (4) 🔴 รายการตัวเลือกฮาร์ดโค้ด ผลต่อรูปแบบแดชบอร์ดเป็น 🤖 (ถ้าใช้ AI) และ 🟡 ในโหมดกฎอัตโนมัติ (`fallback_spec` ใช้ audience แล้ว: management ไม่มีตารางและ KPI แรกเทียบรายเดือน, analyst ตารางกว้าง 12 คอลัมน์, steward ได้แดชบอร์ดสุขภาพข้อมูล) ลำดับการ์ดคำแนะนำเปลี่ยนตามกลุ่มที่เลือก และ steward ได้การ์ดสุขภาพข้อมูล (กฎ R8) ก่อน
```

(ข) บรรทัดที่ขึ้นต้นด้วย `- ยอมรับเฉพาะชนิดวิดเจ็ต 7 แบบ:` แทนวลี `การคำนวณ 6 แบบ: count, count_distinct, sum, avg, min, max (` ด้วย `การคำนวณ 7 แบบ: count, count_distinct, count_missing (นับเซลล์ว่างของคอลัมน์ใดก็ได้), sum, avg, min, max (`

(ค) แทนทั้งบรรทัดที่ขึ้นต้นด้วย `แดชบอร์ดแบบกฎ (` ด้วยย่อหน้านี้

```markdown
แดชบอร์ดแบบกฎ (`fallback_spec` `dashboard_llm.py`) สร้างจากชนิดคอลัมน์ล้วน ๆ และตามกลุ่มผู้ใช้ ค่าเริ่มต้น (business): KPI "จำนวนแถว" + KPI ผลรวมของคอลัมน์ตัวเลข 3 คอลัมน์แรก + กราฟเส้นรายเดือนตามคอลัมน์วันที่แรก + กราฟแท่งตามหมวดหมู่ที่มีค่าไม่ซ้ำมากที่สุด + โดนัทตามหมวดที่น้อยที่สุด (ถ้า <=8 ค่า) + ตาราง 8 คอลัมน์แรก + ตัวกรองหมวดหมู่ 2 ตัว/วันที่ 1 ตัว; management: เหมือนกันแต่ไม่มีตาราง และ KPI แรกเทียบรายเดือนเมื่อมีวันที่; analyst: ตาราง 12 คอลัมน์; steward: KPI จำนวนแถว, KPI ค่าไม่ซ้ำของคอลัมน์ที่น่าจะเป็นคีย์ (ค่าไม่ซ้ำ ≥ 90% ของแถว สูงสุด 2), KPI ค่าว่างของคอลัมน์ที่ว่างมากที่สุด 3 คอลัมน์, KPI ต่ำสุดและสูงสุดของคอลัมน์ตัวเลขที่ไม่ใช่รหัส 2 คอลัมน์ และตาราง 8 คอลัมน์ (ถ้าจำนวนแถวต่างจากค่าไม่ซ้ำของคีย์ แสดงว่ามีแถวซ้ำ) และเมื่อชุดข้อมูลเป็นประวัติผลตรวจคุณภาพ (`_quality_runs`) steward ได้ KPI คะแนนเฉลี่ย แถวที่ถูกกักกัน จำนวนรอบ กราฟแนวโน้มคะแนนรายวัน กราฟแท่งตารางที่คะแนนต่ำสุด โดนัทผลผ่านเกณฑ์ และตารางรอบล่าสุด ชื่อวิดเจ็ตเหล่านี้เป็น 🔴 ข้อความคงที่ แต่ตัวเลขยังคำนวณจากข้อมูลจริง 🟡 ไม่มีข้อมูลสมมติ (mock) ในหน้านี้
```

(ง) แทนทั้งบรรทัดที่ขึ้นต้นด้วย `- **[การ์ดคำแนะนำจากข้อมูล (chip)]**` โดยคงข้อความเดิมทั้งหมดไว้และต่อท้ายบรรทัดด้วยประโยคนี้: กลุ่ม steward ได้การ์ดสุขภาพข้อมูล (กฎ R8) ก่อน: ตรวจแถวซ้ำของคอลัมน์ที่น่าจะเป็นคีย์, ตรวจค่าว่าง (เรียงตาม % ว่างมากไปน้อย รวมคอลัมน์ที่ว่างเกินครึ่ง), ตรวจช่วงค่าต่ำสุดและสูงสุดของคอลัมน์ตัวเลข กลุ่มอื่นไม่เห็นการ์ดเหล่านี้

- [ ] **Step 2: อัปเดตภาคผนวกของเอกสารข้อเสนอ**

ใน `docs/create-dashboard-improvement-proposal.md` ท้ายไฟล์ (ไฟล์ LF)

(ก) ในย่อหน้า `**มีแล้วและตรวจจากโค้ด:**` ต่อท้ายบรรทัด (หลัง ` | ปุ่มย้อนกลับหลังปรับด้วย AI (ระยะ 2)`) ด้วย ` | กลุ่มผู้ใช้ "ดูแลคุณภาพข้อมูล" กฎ R8 และโหมดกฎอัตโนมัติที่ใช้กลุ่มผู้ใช้ | การคำนวณ count_missing (ระยะ 3)`

(ข) ในย่อหน้า `**ยังไม่มี (ข้อเสนอทั้งหมดในเอกสารนี้):**` แทนวลี `คำแนะนำกฎ R6 และ R8 | ` ด้วย `คำแนะนำกฎ R6 | ` และลบวลี `กลุ่มผู้ใช้ "ดูแลคุณภาพข้อมูล" | ` ออก

- [ ] **Step 3: รันเทสต์ทั้งสองฝั่ง**

Run (แยกคำสั่ง ไม่มี git ปนอยู่): `cd services/api && python -m pytest tests -q` และ `cd services/ui && npx vitest run`
Expected: UI ผ่านทั้งหมด; API ผ่านทั้งหมดยกเว้น 9 ตัวใน `tests/test_whitebox_engine.py` ที่เป็นเรื่องสภาพแวดล้อมของ worktree (รายงานจำนวนที่ผ่านและล้มตามจริง)

- [ ] **Step 4: Commit**

```bash
git add docs/ui-analysis/06-create-dashboard.md docs/create-dashboard-improvement-proposal.md
git commit -m "docs(dashboard): describe the data steward audience and the empty-cell count"
```

---

## Self-Review

**Spec coverage** (เทียบกับ `docs/create-dashboard-improvement-proposal.md` หัวข้อ 4.2, 4.3, 7):

| ข้อกำหนดของ spec | Task |
|---|---|
| เพิ่มกลุ่มผู้ใช้ "ดูแลคุณภาพข้อมูล" | Task 2 (ฝั่ง API), Task 4 (UI) |
| เนื้อหาของกลุ่มนี้: คะแนนคุณภาพ แถวที่กักกัน ค่าว่างต่อคอลัมน์ | Task 1 (`count_missing`), Task 2 (`_quality_run_spec`, `_health_spec`) |
| คำแนะนำสุขภาพข้อมูลเรียงขึ้นก่อน (R8) | Task 3 |
| ให้ `fallback_spec` ใช้กลุ่มผู้ใช้ (ปัญหาข้อ 3 ในหัวข้อ 2.1) | Task 2 |
| รวม Executive เข้ากับ Management (ไม่เพิ่มกลุ่มซ้ำ) | ไม่ต้องทำอะไร (ไม่เพิ่ม role ใหม่นอกจาก steward) |
| เอกสารตรงกับโค้ด | Task 5 |
| สิทธิ์จริงตาม role | เลื่อนไป (ระบุที่หัวแผน) |
| G7 กล่องสรุปคุณภาพ | เลื่อนไป |

**Placeholder scan:** ไม่มี TBD หรือ "ทำในลักษณะเดียวกัน" ทุกขั้นที่แก้โค้ดมีโค้ดเต็มหรือคำสั่งแก้ที่ระบุตำแหน่งชัด

**Type consistency:** `fallback_spec(profile, context, audience)` (Task 2) ถูกเรียกจาก `generate_spec` ด้วยลำดับอาร์กิวเมนต์เดียวกัน; `KEY_LIKE_RATIO` นิยามที่ `dashboard_suggest.py` (Task 2) และถูก import ใน `dashboard_llm.py` (Task 2) กับใช้ใน R8 (Task 3); metric `{"agg": "count_missing", "column": ...}` (Task 1) ตรงกับที่ Task 2 และ 3 สร้าง; ค่า audience `steward` ตรงกันทั้ง `AUDIENCES`, `_RULE_ORDER`, ตัวเลือก UI และเทสต์
