# Create Dashboard Suggestions Implementation Plan (ระยะ 0 และ 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้า Create Dashboard แนะนำสิ่งที่อยากเห็นจากโปรไฟล์คอลัมน์ของชุดข้อมูลที่เลือกจริง แทนปุ่มตัวอย่างตายตัว และสื่อว่าแดชบอร์ดที่ได้เป็น "ฉบับร่าง" ที่ตัวเลขคำนวณจากข้อมูลจริง

**Architecture:** ฟังก์ชันล้วน `suggest_from_profile(profile, audience, limit)` อ่านโปรไฟล์ที่ `dashboard_data.profile_dataframe()` สร้างอยู่แล้ว (ไม่อ่านแถวข้อมูล ไม่เรียก AI) แล้วคืนคำแนะนำพร้อม widget ที่ผ่าน `validate_spec()` ทุกตัว endpoint ใหม่ `GET /api/v1/dashboards/datasets/{table}/suggestions?audience=` คืนเฉพาะ `id`, `rule`, `text` ฝั่ง UI ให้ `ContextForm` ดึงคำแนะนำเองตามตารางและกลุ่มผู้ใช้ การกดการ์ดเพิ่มประโยคเป็นบรรทัดในช่องความต้องการ (กดซ้ำเอาออก) ซึ่งส่งไป `/generate` ตามเดิม จึงไม่แตะ pipeline สร้างแดชบอร์ด

**Tech Stack:** FastAPI + pandas (container `api`, Python 3.10), pytest, React 18 + Vitest 2 + Testing Library, Git Bash

**Spec:** [`docs/create-dashboard-improvement-proposal.md`](../../create-dashboard-improvement-proposal.md) หัวข้อ 2.2 (ระยะ 0), 3 (ระยะ 1) และ 7 (แผนพัฒนา)

**ขอบเขตที่ตั้งใจเลื่อนไป (ไม่ทำในแผนนี้):**
- กฎ R6 (เพิ่มตัวกรอง) กับ G1 ถึง G7 (คำแนะนำปรับแดชบอร์ด) เป็นของระยะ 2
- กฎ R8 (สุขภาพข้อมูล) ต้องใช้ผลตรวจคุณภาพรอบล่าสุด ซึ่งไม่อยู่ในโปรไฟล์ ป้ายและกล่องเตือนคุณภาพที่ commit แล้วทำหน้าที่นี้อยู่
- กฎตัดคอลัมน์ E5 (คอลัมน์เทคนิคอย่าง `row_hash`) ไม่ต้องเพิ่ม: `row_hash` เป็นชนิด text (ถูก E2 ตัด) และ `dirty_row_id` ถูก E1 ตัดในข้อมูลจริงแล้ว
- ไม่ทำกลุ่มผู้ใช้ "ดูแลคุณภาพข้อมูล" (ระยะ 3) และไม่เรียก AI ในการแนะนำ (ระยะ 4)

## Global Constraints

- ทำใน worktree แยก branch `feat/dashboard-suggestions` (สร้างด้วย superpowers:using-git-worktrees) ห้าม commit ลง `main`
- Commit message แบบ conventional (`feat(dashboard): ...`) **ไม่ใส่ attribution line ใดๆ** (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- stage เฉพาะไฟล์ที่ Task ระบุ ห้ามใช้ `git add -A`, `git add .` หรือ `git commit -a`
- **Line ending:** ไฟล์ที่แผนนี้แตะเป็น LF ทั้งหมด (ตรวจด้วย `git ls-files --eol <ไฟล์>` ก่อนแก้) ห้ามแก้ไฟล์ด้วย Python แบบ text mode บน Windows เพราะจะเขียนเป็น CRLF ทั้งไฟล์ ให้ใช้ Edit tool หรือเปิดไฟล์ด้วย `newline=''` แล้วเทียบ `git diff --stat` ว่าไม่บวมผิดปกติหลังแก้ (`dashboard_data.py` เป็น CRLF แต่แผนนี้ไม่แตะ)
- **ความเป็นส่วนตัว:** คำแนะนำสร้างจากโปรไฟล์คอลัมน์เท่านั้น (ชื่อ ชนิด จำนวนค่าไม่ซ้ำ % ค่าว่าง ช่วงตัวเลขและวันที่) ห้ามอ่านหรือส่งค่าในเซลล์ ห้ามเรียก LLM
- **ข้อความหน้าจอ (กติกาของโปรเจกต์):** ห้ามมี em dash หรือ en dash ห้ามใช้ emoji ปุ่มใช้คำสั้น 1 ถึง 3 คำ ห้ามคำฟุ่มเฟือยอย่าง "ปฏิวัติ" "ราบรื่น"
- **การทดสอบ UI:** `mockFetchByUrl` ใช้ route แรกที่ URL มีสตริงนั้นเป็นส่วนหนึ่ง ดังนั้น route ที่ยาวกว่า (`/dashboards/datasets/sales/suggestions`, `/preview`) ต้องมาก่อน `/dashboards/datasets` เสมอ
- **คำสั่งทดสอบ:**
  - API: `cd services/api && python -m pytest tests -q -k dashboard`
  - UI: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
- **การดูผลบนระบบจริง:** `sdoqap-api` และ `sdoqap-ui` เป็น Docker image ที่ build ไว้ แก้โค้ดแล้วหน้าเว็บไม่เปลี่ยนจนกว่าจะ build ใหม่ (Task 5)

---

### Task 1: ระยะ 0, คำบรรยายหน้าและป้าย "ฉบับร่าง"

**Files:**
- Modify: `services/ui/src/config/pages.js` (บรรทัดของ `key: "builder"`)
- Modify: `services/ui/src/pages/DashboardBuilder.jsx` (ขั้นที่ 4 ก่อน `<QualityNotice ... />`)
- Modify: `services/ui/src/pages/DashboardBuilder.css` (ก่อน `.dbb-kind {`)
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx`

**Interfaces:**
- Consumes: ฟังก์ชันช่วยเดิมในไฟล์ทดสอบ `renderPage`, `builderRoutes()`, `generateDashboard()`
- Produces: คลาส CSS `dbb-draft-note` (ใช้ใน Task นี้เท่านั้น)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

แทรก 2 เทสต์นี้ในไฟล์ `services/ui/src/pages/DashboardBuilder.test.jsx` ทันทีก่อนบรรทัด `it("walks from dataset to an AI-generated dashboard", async () => {`

```jsx
it("labels the dashboard as a draft computed from the real data", async () => {
  await generateDashboard();
  expect(screen.getByText("ฉบับร่าง ตรวจก่อนใช้งาน ตัวเลขทุกตัวคำนวณจากข้อมูลจริง ไม่ใช่ AI")).toBeInTheDocument();
});

it("describes the page as a draft builder for data that passed the quality check", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  expect(screen.getByText("สร้างแดชบอร์ดฉบับร่างจากข้อมูลที่ผ่านการตรวจคุณภาพ")).toBeInTheDocument();
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx -t "draft"`
Expected: FAIL 2 เทสต์ (`Unable to find an element with the text`)

- [ ] **Step 3: แก้คำบรรยายหน้า**

ใน `services/ui/src/config/pages.js` เปลี่ยน `subtitle` ของ `key: "builder"` จาก `"สร้างแดชบอร์ดจากชุดข้อมูลด้วย AI"` เป็น

```js
subtitle: "สร้างแดชบอร์ดฉบับร่างจากข้อมูลที่ผ่านการตรวจคุณภาพ"
```

- [ ] **Step 4: เพิ่มป้ายฉบับร่างในขั้นที่ 4**

ใน `services/ui/src/pages/DashboardBuilder.jsx` ก่อนบรรทัด `<QualityNotice quality={quality} tableRows={catalogEntry?.records} />` ที่อยู่ใน `{step === 3 && draft && (` เพิ่ม

```jsx
          <p className="dbb-draft-note">ฉบับร่าง ตรวจก่อนใช้งาน ตัวเลขทุกตัวคำนวณจากข้อมูลจริง ไม่ใช่ AI</p>
```

ใน `services/ui/src/pages/DashboardBuilder.css` ก่อนบรรทัด `.dbb-kind {` เพิ่ม

```css
.dbb-draft-note { margin: 0; color: var(--dbb-muted); font-size: 12px; }
```

- [ ] **Step 5: รันให้ผ่านทั้งไฟล์**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
Expected: PASS ทั้งหมด (ป้ายสถานะ `role="status"` เดิมไม่ถูกแตะ เทสต์เดิมที่หา `getByRole("status")` ยังเจอตัวเดียว)

- [ ] **Step 6: Commit**

```bash
git add services/ui/src/config/pages.js services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.css services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(dashboard): present the result as a draft built from real data"
```

---

### Task 2: โมดูลสร้างคำแนะนำจากโปรไฟล์ (ฟังก์ชันล้วน)

**Files:**
- Create: `services/api/app/api/dashboard_suggest.py`
- Create: `services/api/tests/test_dashboard_suggest.py`
- Modify: `services/api/app/api/dashboard_llm.py` (ย้าย `_looks_like_identifier` ไปเป็น `is_identifier` ในโมดูลใหม่ เพื่อให้ตรรกะ "คอลัมน์ที่เป็นรหัส" มีที่เดียว)

**Interfaces:**
- Consumes: รูปแบบโปรไฟล์จาก `dashboard_data.profile_dataframe()`: `{"rows": int, "columns": [{"name", "kind", "dtype", "missing", "missing_pct", "distinct", "min"?, "max"?}]}` (วันที่เป็นสตริง ISO)
- Produces:
  - `is_identifier(column: dict, rows: int) -> bool`
  - `suggest_from_profile(profile: dict, audience: str = "business", limit: int = 6) -> list[dict]` แต่ละรายการ `{"id": str, "rule": "R1"|"R2"|"R3"|"R4"|"R5"|"R7", "text": str, "widget": dict}` โดย `widget` ผ่าน `validate_spec` โดยไม่มี warning เสมอ ส่วน `audience` ที่ไม่รู้จักใช้ลำดับของ `business`

- [ ] **Step 1: เขียนไฟล์ทดสอบ**

สร้าง `services/api/tests/test_dashboard_suggest.py` (โปรไฟล์ในไฟล์นี้ดึงจากชุดข้อมูลที่ active ในระบบจริงเมื่อ 2026-10-06)

```python
import os
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_spec import validate_spec  # noqa: E402
from app.api.dashboard_suggest import is_identifier, suggest_from_profile  # noqa: E402


def col(name, kind, distinct, missing=0.0, low=None, high=None):
    return {"name": name, "kind": kind, "dtype": "x", "missing": 0, "missing_pct": missing, "distinct": distinct,
            "min": low, "max": high}


def profile(rows, *columns):
    return {"rows": rows, "column_count": len(columns), "missing_cells": 0, "kind_counts": {}, "columns": list(columns)}


# Profiles taken from datasets that are active in the running system (2026-10-06).
ECOMMERCE = profile(
    2000,
    col("Order_ID", "text", 2000), col("Order_Date", "date", 907, low="2023-01-02T00:00:00", high="2025-12-31T00:00:00"),
    col("Customer_Name", "text", 1534), col("Customer_Segment", "categorical", 3), col("Country", "categorical", 20),
    col("Region", "categorical", 5), col("Product_Category", "categorical", 4), col("Product_Name", "categorical", 40),
    col("Quantity", "numeric", 15, low=1.0, high=15.0), col("Unit_Price", "numeric", 1839, low=3.03, high=472.56),
    col("Discount_Percent", "numeric", 7, low=0.0, high=30.0), col("Total_Sales", "numeric", 1927, low=2.42, high=3813.98),
    col("Shipping_Cost", "numeric", 1118, low=5.52, high=40.44), col("Profit", "numeric", 1855, low=-11.28, high=1373.63),
    col("Payment_Method", "categorical", 4))

OLIST = profile(
    21767,
    col("product_id", "text", 21767), col("product_category_name", "categorical", 72),
    col("product_name_lenght", "numeric", 49, low=20.0, high=76.0),
    col("product_description_lenght", "numeric", 1774, low=4.0, high=1841.0),
    col("product_photos_qty", "numeric", 5, low=1.0, high=5.0), col("product_weight_g", "numeric", 1116, low=0.0, high=3150.0))

STUDENTS = profile(
    9370,
    col("dirty_row_id", "numeric", 9370, low=1.0, high=10099.0), col("record_id", "numeric", 9370, low=1.0, high=10000.0),
    col("student_id", "numeric", 9370, low=65001.0, high=75000.0), col("course", "categorical", 5),
    col("score", "numeric", 52, low=49.0, high=100.0),
    col("semester", "date", 2, low="2026-01-01T00:00:00", high="2026-02-01T00:00:00"),
    col("study_hours", "numeric", 10, low=1.0, high=10.0),
    col("updated_at", "date", 1, low="2026-09-15T10:00:00", high="2026-09-15T10:00:00"))

GROCERY = profile(
    557,
    col("วันที่", "date", 60, low="2026-06-01T00:00:00", high="2026-07-30T00:00:00"), col("รายการสินค้า", "categorical", 23),
    col("จำนวน", "numeric", 4, 2.33, 1.0, 4.0), col("ราคาต่อหน่วย", "numeric", 13, low=15.0, high=60.0),
    col("ยอดขายรวม", "numeric", 39, 2.33, 15.0, 240.0), col("row_hash", "text", 557))


def texts(p, audience="business", limit=6):
    return [s["text"] for s in suggest_from_profile(p, audience, limit)]


def test_ecommerce_gets_trend_comparison_ranking_share_and_a_two_way_split():
    assert texts(ECOMMERCE) == [
        "10 Product_Name ที่ ผลรวม Total_Sales สูงสุด",
        "แนวโน้ม ผลรวม Total_Sales รายเดือน ตาม Order_Date",
        "สัดส่วน ผลรวม Total_Sales ตาม Region",
        "ผลรวม Total_Sales ปีล่าสุด เทียบช่วงก่อนหน้า",
        "ผลรวม Total_Sales ตาม Country แยกตาม Customer_Segment",
        "10 Country ที่ ผลรวม Total_Sales สูงสุด",
    ]


def test_a_dataset_without_dates_or_sales_is_not_offered_trends_or_sales_wording():
    result = texts(OLIST)
    assert result == ["10 product_category_name ที่ ค่าเฉลี่ย product_name_lenght สูงสุด",
                      "10 product_category_name ที่มีจำนวนแถวมากที่สุด"]  # an average is not how common a category is
    assert not any("แนวโน้ม" in t or "เทียบ" in t or "ยอดขาย" in t for t in result)


def test_identifier_and_constant_columns_are_never_suggested():
    result = " ".join(texts(STUDENTS, limit=20))
    for hidden in ("dirty_row_id", "record_id", "student_id", "updated_at"):
        assert hidden not in result
    assert "ค่าเฉลี่ย score ตาม course" in result
    assert "แนวโน้ม" not in result  # semester holds only 2 dates


def test_the_period_follows_the_length_of_the_data():
    result = texts(GROCERY, limit=20)
    assert "แนวโน้ม ผลรวม ยอดขายรวม รายสัปดาห์ ตาม วันที่" in result  # two months: weeks, not months
    assert "ผลรวม ยอดขายรวม เดือนล่าสุด เทียบช่วงก่อนหน้า" in result
    assert not any("row_hash" in t for t in result)


def test_the_audience_decides_what_comes_first():
    assert texts(ECOMMERCE, "management", 1) == ["ผลรวม Total_Sales ปีล่าสุด เทียบช่วงก่อนหน้า"]
    assert texts(ECOMMERCE, "analyst", 1) == ["ผลรวม Total_Sales ตาม Country แยกตาม Customer_Segment"]
    assert texts(ECOMMERCE, "unknown-audience", 1) == texts(ECOMMERCE, "business", 1)


def test_the_list_is_capped_and_ids_are_unique():
    many = suggest_from_profile(ECOMMERCE, limit=3)
    assert len(many) == 3
    everything = suggest_from_profile(ECOMMERCE, limit=50)
    assert len({s["id"] for s in everything}) == len(everything)


def test_a_table_of_numbers_only_gets_summary_cards():
    numbers = profile(100, col("a", "numeric", 40, low=1.5, high=9.5), col("b", "numeric", 30, low=0.5, high=2.5))
    assert texts(numbers) == ["ดูค่าเฉลี่ย a", "ดูค่าเฉลี่ย b"]


def test_nothing_is_suggested_when_no_column_is_usable():
    empty = profile(10, col("note", "text", 10), col("id", "numeric", 10, low=1.0, high=10.0))
    assert suggest_from_profile(empty) == []


@pytest.mark.parametrize("p", [ECOMMERCE, OLIST, STUDENTS, GROCERY], ids=["ecommerce", "olist", "students", "grocery"])
def test_every_suggested_widget_is_accepted_by_the_spec_validator(p):
    suggestions = suggest_from_profile(p, limit=50)
    assert suggestions
    spec, warnings = validate_spec({"widgets": [s["widget"] for s in suggestions]}, p)
    assert warnings == [] and len(spec["widgets"]) == len(suggestions)


def test_identifier_detection_matches_what_the_llm_prompt_hides():
    assert is_identifier(col("id", "numeric", 9370, low=1.0, high=10000.0), 9370)
    assert is_identifier(col("account", "numeric", 3, low=100000000.0, high=999999999.0), 1000)  # 9 digits
    assert not is_identifier(col("score", "numeric", 52, low=49.0, high=100.0), 9370)
    assert not is_identifier(col("price", "numeric", 40, low=1.5, high=9.5), 100)  # not whole numbers
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboard_suggest.py -q`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.api.dashboard_suggest'`)

- [ ] **Step 3: เขียนโมดูล**

สร้าง `services/api/app/api/dashboard_suggest.py`

```python
"""Suggestions for the Create Dashboard tab, derived from a dataset's column profile alone.

suggest_from_profile() reads the profile that dashboard_data.profile_dataframe() builds (names,
kinds, distinct counts, missing %, numeric and date ranges) and returns what the dataset can
answer. Every suggestion carries a widget that validate_spec() accepts for that profile, so a
suggestion never asks for something the builder cannot draw. It is a pure function: no rows, no
LLM, no I/O."""
from datetime import datetime

CATEGORY_MIN_DISTINCT = 2
CATEGORY_MAX_DISTINCT = 200  # a top-10 stays readable far beyond the 50 values a donut or filter can take
DONUT_MAX_DISTINCT = 8
TOP_N = 10
MAX_MISSING_PCT = 50
DEFAULT_LIMIT = 6

# Column-name hints, English and Thai, in priority order: the first group names the main measure.
_MEASURE_HINTS = (("sales", "revenue", "ยอดขาย", "รายได้"), ("total", "amount", "รวม"),
                  ("profit", "กำไร"), ("score", "คะแนน"), ("price", "ราคา"))
# Quantities whose total is meaningful. Anything else (scores, prices, sizes) is averaged.
_ADDITIVE_HINTS = ("sales", "revenue", "amount", "total", "profit", "quantity", "qty", "ยอดขาย", "รายได้", "รวม", "กำไร", "จำนวน")

_COMPARE_GRAINS = ("year", "month", "week", "day")  # quarters are skipped: rarely what a reader means
_GRAIN_LABEL = {"year": "รายปี", "quarter": "รายไตรมาส", "month": "รายเดือน", "week": "รายสัปดาห์", "day": "รายวัน"}
_LATEST_LABEL = {"year": "ปีล่าสุด", "quarter": "ไตรมาสล่าสุด", "month": "เดือนล่าสุด", "week": "สัปดาห์ล่าสุด", "day": "วันล่าสุด"}

# Which rules come first for each kind of reader (the picker's audience values).
_RULE_ORDER = {"business": ("R2", "R1", "R3", "R4", "R5", "R7"),
               "analyst": ("R5", "R2", "R1", "R4", "R3", "R7"),
               "management": ("R4", "R1", "R3", "R2", "R5", "R7")}


def is_identifier(column, rows):
    """A whole-number column that is (nearly) unique or has 9+ digit values: an id, account or
    phone number, whose min and max are real records."""
    low, high = column.get("min"), column.get("max")
    if low is None or high is None or float(low) != int(low) or float(high) != int(high):
        return False
    digits = len(str(int(max(abs(low), abs(high)))))
    return digits >= 9 or bool(rows and column["distinct"] / rows >= 0.9)


def _hint_rank(name):
    lowered = name.lower()
    for rank, words in enumerate(_MEASURE_HINTS):
        if any(w in lowered for w in words):
            return rank
    return len(_MEASURE_HINTS)


def _is_additive(name):
    lowered = name.lower()
    return any(w in lowered for w in _ADDITIVE_HINTS)


def _metric(name):
    """(metric, label): a total for quantities that add up, an average for the rest."""
    if _is_additive(name):
        return {"agg": "sum", "column": name}, f"ผลรวม {name}"
    return {"agg": "avg", "column": name}, f"ค่าเฉลี่ย {name}"


def _periods(low, high, grain):
    """How many periods of this grain the date range touches."""
    if grain == "year":
        return high.year - low.year + 1
    if grain == "quarter":
        return (high.year * 4 + (high.month - 1) // 3) - (low.year * 4 + (low.month - 1) // 3) + 1
    if grain == "month":
        return (high.year * 12 + high.month) - (low.year * 12 + low.month) + 1
    days = (high.date() - low.date()).days
    return days // 7 + 2 if grain == "week" else days + 1


def _grain(column, wanted, order):
    """The first grain in `order` that splits the date range into at least `wanted` periods."""
    try:
        low, high = datetime.fromisoformat(column["min"]), datetime.fromisoformat(column["max"])
    except (TypeError, ValueError):
        return None
    return next((g for g in order if _periods(low, high, g) >= wanted), None)


def _usable(profile):
    """(measures, categories, dates): the columns worth putting on a chart."""
    rows = profile["rows"]
    measures, categories, dates = [], [], []
    for c in profile["columns"]:
        if c["missing_pct"] > MAX_MISSING_PCT:
            continue
        if c["kind"] == "numeric" and not is_identifier(c, rows):
            measures.append(c)
        elif c["kind"] == "categorical" and CATEGORY_MIN_DISTINCT <= c["distinct"] <= CATEGORY_MAX_DISTINCT:
            categories.append(c)
        elif c["kind"] == "date" and c["distinct"] > 1:
            dates.append(c)
    measures.sort(key=lambda c: _hint_rank(c["name"]))  # stable: ties keep the column order
    return measures, categories, dates


def _suggestion(rule, key, text, widget):
    return {"id": f"{rule}:{key}", "rule": rule, "text": text, "widget": {"title": text, **widget}}


def suggest_from_profile(profile, audience="business", limit=DEFAULT_LIMIT):
    measures, categories, dates = _usable(profile)
    main = _metric(measures[0]["name"]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
    by_rule = {rule: [] for rule in ("R1", "R2", "R3", "R4", "R5", "R7")}

    if dates:
        date = dates[0]["name"]
        grain = _grain(dates[0], 6, ("month", "week", "day")) if dates[0]["distinct"] >= 3 else None
        if grain:
            by_rule["R1"].append(_suggestion(
                "R1", f"{main[0]['column']}:{date}", f"แนวโน้ม {main[1]} {_GRAIN_LABEL[grain]} ตาม {date}",
                {"type": "line", "x": date, "time_grain": grain, "metric": main[0]}))
        grain = _grain(dates[0], 2, _COMPARE_GRAINS)
        if grain:
            by_rule["R4"].append(_suggestion(
                "R4", f"{main[0]['column']}:{date}", f"{main[1]} {_LATEST_LABEL[grain]} เทียบช่วงก่อนหน้า",
                {"type": "kpi", "metric": main[0], "compare": {"date_column": date, "time_grain": grain}}))

    # A ranking over a long list says more than a split of 3 values, so longer lists come first.
    ranked = sorted(categories, key=lambda c: -c["distinct"])
    for c in ranked:
        name, many = c["name"], c["distinct"] > TOP_N
        text = f"{TOP_N} {name} ที่ {main[1]} สูงสุด" if many else f"{main[1]} ตาม {name}"
        by_rule["R2"].append(_suggestion("R2", name, text, {"type": "bar", "x": name, "metric": main[0], "sort": "desc", "limit": TOP_N}))
    long_lists = [c["name"] for c in ranked if c["distinct"] > TOP_N]
    if main[0]["agg"] != "sum" and long_lists:  # an average ranks differently from how common each value is
        name = long_lists[0]
        by_rule["R2"].append(_suggestion("R2", f"{name}:count", f"{TOP_N} {name} ที่มีจำนวนแถวมากที่สุด",
                                         {"type": "bar", "x": name, "metric": {"agg": "count", "column": None}, "sort": "desc", "limit": TOP_N}))

    share = main if main[0]["agg"] == "sum" else ({"agg": "count", "column": None}, "จำนวนแถว")
    for c in ranked:
        if c["distinct"] <= DONUT_MAX_DISTINCT:
            by_rule["R3"].append(_suggestion("R3", c["name"], f"สัดส่วน {share[1]} ตาม {c['name']}",
                                             {"type": "donut", "x": c["name"], "metric": share[0]}))

    small = sorted((c for c in categories if c["distinct"] <= DONUT_MAX_DISTINCT), key=lambda c: c["distinct"])
    wide = sorted((c for c in categories if c["distinct"] <= 20), key=lambda c: -c["distinct"])
    pair = next(((x, g) for x in wide for g in small if g["name"] != x["name"]), None)
    if pair:
        x, group = pair[0]["name"], pair[1]["name"]
        by_rule["R5"].append(_suggestion("R5", f"{x}:{group}", f"{main[1]} ตาม {x} แยกตาม {group}",
                                         {"type": "bar", "x": x, "group_by": group, "stacked": True, "metric": main[0]}))

    if measures and not dates and not categories:
        for c in measures[:3]:
            metric, label = _metric(c["name"])
            by_rule["R7"].append(_suggestion("R7", c["name"], f"ดู{label}", {"type": "kpi", "metric": metric}))

    order = _RULE_ORDER.get(audience, _RULE_ORDER["business"])
    picked, depth = [], 0
    while len(picked) < limit and any(len(by_rule[r]) > depth for r in order):
        for rule in order:  # one from every rule first, then second picks, so the list stays varied
            if len(by_rule[rule]) > depth and len(picked) < limit:
                picked.append(by_rule[rule][depth])
        depth += 1
    return picked
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd services/api && python -m pytest tests/test_dashboard_suggest.py -q`
Expected: PASS 13 เทสต์ ถ้า `test_ecommerce_...` ล้มเพราะลำดับข้อความ อย่าแก้ข้อความที่คาดหวังให้ตรงกับผลลัพธ์ ให้ตรวจก่อนว่ากฎใดเปลี่ยน เพราะลำดับนี้คือพฤติกรรมที่ตั้งใจ (หมวดที่ยาวกว่าขึ้นก่อน ทุกกฎได้ตำแหน่งแรกก่อนกฎใดได้ตำแหน่งที่สอง)

- [ ] **Step 5: ให้ `dashboard_llm.py` ใช้ `is_identifier` ตัวเดียวกัน**

ใน `services/api/app/api/dashboard_llm.py`

(ก) หลังบรรทัด `from .dashboard_spec import (...)` (วงเล็บที่ปิดด้วย `WIDGET_TYPES, SpecError, diff_specs, validate_spec)`) เพิ่ม

```python
from .dashboard_suggest import is_identifier
```

(ข) ลบฟังก์ชัน `_looks_like_identifier` ทั้งฟังก์ชัน (ตั้งแต่ `def _looks_like_identifier(column, rows):` ถึง `return digits >= 9 or bool(rows and column["distinct"] / rows >= 0.9)` และบรรทัดว่างสองบรรทัดที่ตามมา)

(ค) ใน `profile_for_prompt` เปลี่ยน `_looks_like_identifier(c, profile["rows"])` เป็น `is_identifier(c, profile["rows"])`

- [ ] **Step 6: ยืนยันว่าพฤติกรรม prompt ไม่เปลี่ยน**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด (เทสต์เดิมของ `dashboard_llm` ที่ตรวจว่า prompt ไม่มีช่วงของคอลัมน์รหัสต้องผ่านโดยไม่แก้)

- [ ] **Step 7: Commit**

```bash
git add services/api/app/api/dashboard_suggest.py services/api/tests/test_dashboard_suggest.py services/api/app/api/dashboard_llm.py
git commit -m "feat(dashboard): derive request suggestions from a dataset's column profile"
```

---

### Task 3: endpoint คำแนะนำ

**Files:**
- Modify: `services/api/app/api/dashboards.py` (import และเพิ่มฟังก์ชันก่อน `@router.post("/generate")`)
- Test: `services/api/tests/test_dashboards_api.py`

**Interfaces:**
- Consumes: `dashboard_data.load_active_dataset(table_name) -> (df, profile)`, `_audience(value)` (คืนค่าเดิมหรือ raise 400), `dashboard_suggest.suggest_from_profile`
- Produces: `GET /api/v1/dashboards/datasets/{table_name}/suggestions?audience=business|analyst|management` → `{"table_name": str, "suggestions": [{"id": str, "rule": str, "text": str}]}` (ไม่ส่ง `widget` ออกไป) ต้อง login เหมือน route อื่นของ router นี้

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ใน `services/api/tests/test_dashboards_api.py`

(ก) ในฟังก์ชัน `test_every_route_needs_a_login` ต่อจากบรรทัด `assert c.get("/api/v1/dashboards/datasets/sales/preview").status_code == 401` เพิ่ม

```python
    assert c.get("/api/v1/dashboards/datasets/sales/suggestions").status_code == 401
```

(ข) ต่อท้ายไฟล์เพิ่ม

```python
# whole-number columns that are nearly unique count as identifiers, so this fixture uses decimals
WEEKLY = pd.DataFrame({
    "order_date": [d.strftime("%Y-%m-%d") for d in pd.date_range("2025-01-01", periods=12, freq="7D")],
    "region": ["North", "South", "East"] * 4,
    "amount": [i * 1.5 + 10 for i in range(12)],
})


@pytest.fixture
def weekly(monkeypatch):
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: dashboard_data.prepare_frame(WEEKLY.copy()))


def suggestions(audience=None):
    query = f"?audience={audience}" if audience else ""
    return client().get(f"/api/v1/dashboards/datasets/weekly/suggestions{query}")


def test_suggestions_come_from_the_dataset_profile_and_leave_out_the_widget(weekly):
    res = suggestions()
    assert res.status_code == 200
    body = res.json()
    assert body["table_name"] == "weekly"
    assert [s["text"] for s in body["suggestions"]] == [
        "ผลรวม amount ตาม region", "แนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date",
        "สัดส่วน ผลรวม amount ตาม region", "ผลรวม amount เดือนล่าสุด เทียบช่วงก่อนหน้า"]
    assert set(body["suggestions"][0]) == {"id", "rule", "text"}


def test_suggestions_follow_the_audience_and_reject_an_unknown_one(weekly):
    assert suggestions("business").json()["suggestions"][0]["rule"] == "R2"
    assert suggestions("management").json()["suggestions"][0]["rule"] == "R4"
    assert suggestions("ceo").status_code == 400
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd services/api && python -m pytest tests/test_dashboards_api.py -q -k "suggestions or login"`
Expected: FAIL (route ยังไม่มี: 404 แทน 401/200)

- [ ] **Step 3: เพิ่ม endpoint**

ใน `services/api/app/api/dashboards.py` เปลี่ยนบรรทัด import เป็น

```python
from . import dashboard_data, dashboard_llm, dashboard_suggest
```

และเพิ่มฟังก์ชันนี้ก่อน `@router.post("/generate")`

```python
@router.get("/datasets/{table_name}/suggestions")
def dashboard_suggestions(table_name: str, audience: str = "business"):
    _, profile = dashboard_data.load_active_dataset(table_name)
    found = dashboard_suggest.suggest_from_profile(profile, _audience(audience))
    return {"table_name": table_name, "suggestions": [{"id": s["id"], "rule": s["rule"], "text": s["text"]} for s in found]}
```

- [ ] **Step 4: รันให้ผ่านทั้งชุด**

Run: `cd services/api && python -m pytest tests -q -k dashboard`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboards.py services/api/tests/test_dashboards_api.py
git commit -m "feat(dashboard): serve request suggestions for a dataset"
```

---

### Task 4: UI, การ์ดคำแนะนำแทนปุ่มตัวอย่างตายตัว

**Files:**
- Modify: `services/ui/src/utils/dashboardsApi.js`
- Modify (เขียนทับทั้งไฟล์): `services/ui/src/components/builder/ContextForm.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.jsx` (บรรทัด `<ContextForm ... />`)
- Create: `services/ui/src/components/builder/ContextForm.test.jsx`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx`

**Interfaces:**
- Consumes: endpoint ของ Task 3 (`{ suggestions: [{ id, rule, text }] }`); `QualityNotice` และคลาส `.dbb-chip`, `.dbb-chip.is-active`, `.dbb-muted` ที่มีอยู่แล้ว
- Produces: `dashboardsApi.suggestions(table: string, audience: string) -> Promise<{ table_name, suggestions }>`; `toggleLine(context: string, line: string) -> string` (export จาก `ContextForm.jsx`); `ContextForm` รับ prop ใหม่ `tableName` (ชื่อตารางจริง ส่วน `table` ยังเป็นชื่อที่แสดง)

- [ ] **Step 1: เขียนเทสต์หน่วยของ `toggleLine`**

สร้าง `services/ui/src/components/builder/ContextForm.test.jsx`

```jsx
import { it, expect } from "vitest";
import { toggleLine } from "./ContextForm";

it("adds a suggestion as a new line and removes it when picked again", () => {
  expect(toggleLine("", "A")).toBe("A");
  expect(toggleLine("A", "B")).toBe("A\nB");
  expect(toggleLine("A\nB", "A")).toBe("B");
  expect(toggleLine("A", "A")).toBe("");
});

it("keeps what the user typed and ignores blank lines", () => {
  expect(toggleLine("ดูยอดขาย\n\n", "A")).toBe("ดูยอดขาย\nA");
});
```

- [ ] **Step 2: ปรับ fixture และ helper ใน `DashboardBuilder.test.jsx`**

ทำ 5 การแก้ในไฟล์ `services/ui/src/pages/DashboardBuilder.test.jsx`

(ก) แทนบรรทัด `const EXAMPLE = "สร้าง Dashboard สำหรับวิเคราะห์ยอดขายรายเดือน";` ด้วย

```jsx
const EXAMPLE = "ผลรวม amount ตาม region";
const SUGGESTIONS = { table_name: "sales", suggestions: [
  { id: "R2:region", rule: "R2", text: EXAMPLE },
  { id: "R1:amount:order_date", rule: "R1", text: "แนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date" }
] };
```

(ข) ใน `builderRoutes` ต่อจากบรรทัด `...extra,` เพิ่มบรรทัดนี้ (ต้องอยู่ก่อน route `/preview`)

```jsx
    ["/dashboards/datasets/sales/suggestions", { body: SUGGESTIONS }],
```

(ค) แทนนิยาม `lowQualityRoutes` ด้วย

```jsx
const lowQualityRoutes = [["/dashboards/datasets/sales/suggestions", { body: SUGGESTIONS }], ["/dashboards/datasets/sales/preview", { body: PREVIEW }], ["/dashboards/datasets", { body: LOW_QUALITY }]];
```

(ง) ใน `controlledFetch` แทนบรรทัด `return Promise.resolve(reply(200, u.includes("/preview") ? PREVIEW : TWO_DATASETS));` ด้วย

```jsx
    const body = u.includes("/suggestions") ? SUGGESTIONS : u.includes("/preview") ? PREVIEW : TWO_DATASETS;
    return Promise.resolve(reply(200, body));
```

(จ) มีสามจุดที่กดปุ่มตัวอย่างเดิม คือ ฟังก์ชัน `generateDashboard`, เทสต์ `walks from dataset to an AI-generated dashboard` และฟังก์ชัน `startGenerate` แทนบรรทัด `fireEvent.click(screen.getByRole("button", { name: EXAMPLE }));` ทั้งสามจุดด้วย (คำแนะนำโหลดหลังเปิดขั้นที่ 3 จึงต้องรอ)

```jsx
  fireEvent.click(await screen.findByRole("button", { name: EXAMPLE })); // the suggestions load after the step opens
```

- [ ] **Step 3: เพิ่มเทสต์พฤติกรรมของการ์ดคำแนะนำ**

แทรกในไฟล์เดียวกัน ทันทีก่อนบรรทัด `it("walks from dataset to an AI-generated dashboard", async () => {`

```jsx
async function openRequestStep(extra = []) {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes(extra));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
}

const requestBox = () => screen.getByLabelText("อยากวิเคราะห์อะไรจาก sales");

it("suggests requests built from the dataset instead of fixed examples", async () => {
  await openRequestStep();
  const trend = screen.getByRole("button", { name: "แนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date" });
  expect(screen.queryByRole("button", { name: /ยอดขายรายเดือน/ })).toBeNull();
  expect(callTo("/dashboards/datasets/sales/suggestions")[0]).toContain("/dashboards/datasets/sales/suggestions?audience=business");
  fireEvent.click(screen.getByRole("button", { name: EXAMPLE }));
  fireEvent.click(trend);
  expect(requestBox().value).toBe(`${EXAMPLE}\nแนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date`);
  expect(trend).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(trend);
  expect(requestBox().value).toBe(EXAMPLE);
  expect(trend).toHaveAttribute("aria-pressed", "false");
});

it("asks for new suggestions when the reader type changes", async () => {
  await openRequestStep();
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await settle();
  const urls = fetch.mock.calls.map(([url]) => String(url)).filter((u) => u.includes("/suggestions"));
  expect(urls.at(-1)).toContain("audience=management");
});

it("says so when the dataset has no suggestions or they cannot be loaded, and still lets the user type", async () => {
  await openRequestStep([["/dashboards/datasets/sales/suggestions", { status: 500, body: { detail: "boom" } }]]);
  expect(screen.getByText("ยังไม่มีคำแนะนำสำหรับชุดข้อมูลนี้ พิมพ์สิ่งที่อยากเห็นได้เลย")).toBeInTheDocument();
  fireEvent.change(requestBox(), { target: { value: "ดูยอดขายตามภูมิภาค" } });
  expect(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })).toBeEnabled();
});
```

หมายเหตุ: ในเทสต์แรก `` `${EXAMPLE}\nแนวโน้ม ...` `` ต้องเป็นอักขระ `\n` สองตัว (แบ็กสแลชกับ n) ใน template literal ไม่ใช่ขึ้นบรรทัดจริง

- [ ] **Step 4: รันให้เห็นว่าล้ม**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
Expected: FAIL หลายเทสต์ (`Unable to find an accessible element with the role "button" and name "ผลรวม amount ตาม region"` และ `toggleLine` ไม่ถูก export)

- [ ] **Step 5: เพิ่มฟังก์ชัน API ฝั่ง UI**

ใน `services/ui/src/utils/dashboardsApi.js` ต่อจากบรรทัด `previewDataset: ...` เพิ่ม

```js
  suggestions: (table, audience) =>
    request(`/datasets/${encodeURIComponent(table)}/suggestions?audience=${encodeURIComponent(audience)}`),
```

- [ ] **Step 6: เขียน `ContextForm.jsx` ใหม่**

เขียนทับ `services/ui/src/components/builder/ContextForm.jsx` ทั้งไฟล์ (ตัด `EXAMPLES` ตายตัวออก เหลือ `AUDIENCES` ที่เดิม)

```jsx
import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";

export const AUDIENCES = [
  { value: "business", label: "Business User" },
  { value: "analyst", label: "Data Analyst" },
  { value: "management", label: "Management" }
];

// Each suggestion is one line of the request: picking it adds the line, picking it again removes it.
export function toggleLine(context, line) {
  const lines = context.split("\n").filter((l) => l.trim());
  return (lines.includes(line) ? lines.filter((l) => l !== line) : [...lines, line]).join("\n");
}

export default function ContextForm({ table, tableName, value, onChange, onGenerate, busy }) {
  const [suggestions, setSuggestions] = useState(null); // null while loading
  const ready = value.context.trim().length >= 3 && !busy;
  const lines = value.context.split("\n");

  // The suggestions depend on the dataset's columns and on who reads the dashboard.
  useEffect(() => {
    let alive = true;
    setSuggestions(null);
    dashboardsApi.suggestions(tableName, value.audience)
      .then((res) => { if (alive) setSuggestions(res.suggestions || []); })
      .catch(() => { if (alive) setSuggestions([]); });
    return () => { alive = false; };
  }, [tableName, value.audience]);

  const submit = (e) => {
    e.preventDefault();
    if (ready) onGenerate();
  };

  return (
    <form className="dbb-context" onSubmit={submit}>
      <label htmlFor="dbb-context-input">อยากวิเคราะห์อะไรจาก {table}</label>
      <div className="dbb-chips" aria-label="คำแนะนำจากข้อมูล">
        {suggestions === null && <p className="dbb-muted">กำลังอ่านข้อมูลเพื่อแนะนำ…</p>}
        {suggestions?.length === 0 && <p className="dbb-muted">ยังไม่มีคำแนะนำสำหรับชุดข้อมูลนี้ พิมพ์สิ่งที่อยากเห็นได้เลย</p>}
        {suggestions?.map((s) => (
          <button type="button" key={s.id} className={`dbb-chip${lines.includes(s.text) ? " is-active" : ""}`}
            aria-pressed={lines.includes(s.text)} onClick={() => onChange({ ...value, context: toggleLine(value.context, s.text) })}>
            {s.text}
          </button>
        ))}
      </div>
      <textarea id="dbb-context-input" rows={4} maxLength={2000} value={value.context}
        placeholder="เลือกคำแนะนำด้านบน หรือพิมพ์สิ่งที่อยากเห็น"
        onChange={(e) => onChange({ ...value, context: e.target.value })} />
      <fieldset className="dbb-audience">
        <legend>ผู้ใช้แดชบอร์ด</legend>
        {AUDIENCES.map((a) => (
          <label key={a.value}>
            <input type="radio" name="dbb-audience" value={a.value} checked={value.audience === a.value}
              onChange={() => onChange({ ...value, audience: a.value })} />
            {a.label}
          </label>
        ))}
      </fieldset>
      <div className="dbb-actions">
        <button type="submit" className="dbb-btn-primary" disabled={!ready}>
          {busy ? "AI กำลังออกแบบแดชบอร์ด…" : "สร้างแดชบอร์ดด้วย AI"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 7: ส่งชื่อตารางจริงให้ `ContextForm`**

ใน `services/ui/src/pages/DashboardBuilder.jsx` เปลี่ยนบรรทัด `<ContextForm table={datasetLabel(dataset.name)} value={request} ...` ให้เป็น

```jsx
          <ContextForm table={datasetLabel(dataset.name)} tableName={dataset.name} value={request} onChange={setRequest} onGenerate={generate} busy={busy === "generate"} />
```

- [ ] **Step 8: รันให้ผ่านทั้งชุด**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx src/components`
Expected: PASS ทั้งหมด (88 เทสต์ ณ เวลาที่เขียนแผน)

- [ ] **Step 9: Commit**

```bash
git add services/ui/src/utils/dashboardsApi.js services/ui/src/components/builder/ContextForm.jsx services/ui/src/components/builder/ContextForm.test.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(dashboard): offer suggestions from the dataset instead of fixed examples"
```

---

### Task 5: เอกสาร, build ใหม่ และตรวจบนระบบจริง

**Files:**
- Modify: `docs/ui-analysis/06-create-dashboard.md`
- Modify: `docs/create-dashboard-improvement-proposal.md` (ส่วนภาคผนวก)

**Interfaces:**
- Consumes: ผลของ Task 1 ถึง 4
- Produces: เอกสารที่ตรงกับพฤติกรรมจริง

- [ ] **Step 1: อัปเดตคู่มือหน้า**

ใน `docs/ui-analysis/06-create-dashboard.md` (ไฟล์ LF)

(ก) บรรทัดที่ขึ้นต้นด้วย `- **[หัวหน้า "Create Dashboard" + คำบรรยาย]**` แทนวลี `แสดงข้อความ "สร้างแดชบอร์ดจากชุดข้อมูลด้วย AI" 🔴` ด้วย `แสดงข้อความ "สร้างแดชบอร์ดฉบับร่างจากข้อมูลที่ผ่านการตรวจคุณภาพ" 🔴`

(ข) แทนทั้งบรรทัดที่ขึ้นต้นด้วย `- **[ปุ่มตัวอย่าง 3 ปุ่ม (chip)]**` ด้วยบรรทัดนี้

```markdown
- **[การ์ดคำแนะนำจากข้อมูล (chip)]** -> (1) กดเพื่อเพิ่มประโยคนั้นเป็นบรรทัดในช่องพิมพ์ กดซ้ำเพื่อเอาออก เลือกได้หลายอัน (2) คำแนะนำที่สร้างจากโปรไฟล์คอลัมน์ของตารางที่เลือก เช่น "10 Product_Name ที่ ผลรวม Total_Sales สูงสุด" (3) `ContextForm.jsx` เรียก `GET /api/v1/dashboards/datasets/{ตาราง}/suggestions?audience=` -> `dashboard_suggest.suggest_from_profile` (กฎ R1 ถึง R5 และ R7 ไม่เรียก AI ไม่อ่านแถวข้อมูล ตัดคอลัมน์รหัส คอลัมน์ข้อความ และวันที่ที่มีค่าเดียวออก) (4) 🟡 คำนวณจากโปรไฟล์ ถ้าโหลดไม่ได้หรือไม่มีคำแนะนำ จะแสดงข้อความแจ้งและยังพิมพ์เองได้ ลำดับคำแนะนำเปลี่ยนตามกลุ่มผู้ใช้ที่เลือก
```

(ค) ก่อนบรรทัดที่ขึ้นต้นด้วย `- **["หมายเหตุ N รายการ" (warnings)]**` เพิ่มบรรทัดนี้

```markdown
- **[ข้อความ "ฉบับร่าง ตรวจก่อนใช้งาน ..."]** -> (1) ไม่มีปุ่ม (2) บอกว่านี่คือฉบับร่างและตัวเลขทุกตัวคำนวณจากข้อมูลจริงด้วยโค้ด ไม่ใช่ AI (3) `DashboardBuilder.jsx` ขั้นที่ 4 คลาส `dbb-draft-note` (4) 🔴 ข้อความคงที่
```

- [ ] **Step 2: อัปเดตภาคผนวกของเอกสารข้อเสนอ**

ใน `docs/create-dashboard-improvement-proposal.md` ท้ายไฟล์ (ไฟล์ LF)

(ก) ในย่อหน้า `**มีแล้วและตรวจจากโค้ด:**` แทนวลี ` (เพิ่มในรอบนี้ ยังไม่ commit)` ท้ายย่อหน้าด้วย ` | คำแนะนำจากโปรไฟล์กฎ R1 ถึง R5 และ R7 | คำบรรยายหน้าและป้ายฉบับร่าง`

(ข) ในย่อหน้า `**ยังไม่มี (ข้อเสนอทั้งหมดในเอกสารนี้):**` แทนวลี `คำแนะนำจากโปรไฟล์ | ` ด้วย `คำแนะนำกฎ R6 และ R8 | `

- [ ] **Step 3: รันเทสต์ทั้งสองฝั่งก่อน build**

Run: `cd services/api && python -m pytest tests -q` และ `cd services/ui && npx vitest run`
Expected: PASS ทั้งหมด

- [ ] **Step 4: Commit เอกสาร**

```bash
git add docs/ui-analysis/06-create-dashboard.md docs/create-dashboard-improvement-proposal.md
git commit -m "docs(dashboard): describe suggestions and the draft label"
```

- [ ] **Step 5: build และรีสตาร์ตเฉพาะ api กับ ui**

Run (จากรากของ repo):

```bash
docker compose build api ui
docker compose up -d --no-deps api ui
```

Expected: `sdoqap-api` และ `sdoqap-ui` ขึ้น `healthy` ภายในประมาณ 1 นาที (`docker ps --format '{{.Names}} {{.Status}}' | grep -E "^sdoqap-(api|ui) "`) ไม่แตะ Elasticsearch HDFS หรือ Spark

หมายเหตุ: ถ้าทำใน worktree ให้รันคำสั่งนี้จากโฟลเดอร์ของ worktree เพื่อ build จากโค้ดใหม่ แต่ container ชื่อเดียวกันจะถูกแทนที่

- [ ] **Step 6: ตรวจในเบราว์เซอร์ (ให้ผู้ใช้ login เอง)**

เปิด http://localhost/dashboard-builder กด Ctrl+Shift+R แล้วตรวจ 4 อย่าง
1. คำบรรยายใต้หัวหน้าเป็น "สร้างแดชบอร์ดฉบับร่างจากข้อมูลที่ผ่านการตรวจคุณภาพ"
2. เลือก `olist_products_dataset` ไปขั้นที่ 3 ต้องไม่มี "ยอดขายรายเดือน" ต้องเห็น "10 product_category_name ที่มีจำนวนแถวมากที่สุด"
3. เลือก `global_ecommerce_sales` ต้องเห็น "แนวโน้ม ผลรวม Total_Sales รายเดือน ตาม Order_Date" และ "ผลรวม Total_Sales ปีล่าสุด เทียบช่วงก่อนหน้า"
4. สลับกลุ่มผู้ใช้เป็น Management ลำดับการ์ดเปลี่ยน (การ์ดเทียบช่วงขึ้นก่อน) และขั้นที่ 4 มีข้อความ "ฉบับร่าง ตรวจก่อนใช้งาน ..."

---

## Self-Review

**Spec coverage** (เทียบกับ `docs/create-dashboard-improvement-proposal.md`):

| ข้อกำหนดของ spec | Task |
|---|---|
| 2.2 / ระยะ 0: เปลี่ยนคำบรรยายหน้า ป้าย "ฉบับร่าง" แถบ "ตัวเลขคำนวณจากข้อมูลจริง" | Task 1 |
| 3.2: กฎตัดคอลัมน์ E1 E2 E3 E4 | Task 2 (`is_identifier`, ชนิด text, วันที่ค่าเดียว, `missing_pct > 50`) |
| 3.2: กฎ R1 R2 R3 R4 R5 R7 | Task 2 |
| 3.2: เลือก measure จากชื่อคอลัมน์ (EN และ TH) และเลือกหน่วยเวลาตามช่วงข้อมูล | Task 2 |
| 3.3: ตัวอย่างจากข้อมูลจริง 4 ชุด | Task 2 (ใช้เป็น fixture ของเทสต์) |
| 3.4: ทุกคำแนะนำผ่าน whitelist, ไม่ส่งค่าข้อมูล | Task 2 (`test_every_suggested_widget_is_accepted_by_the_spec_validator`) |
| 4.3: ลำดับคำแนะนำตามกลุ่มผู้ใช้ | Task 2 (`_RULE_ORDER`), Task 3, Task 4 |
| 2.2 ขั้นที่ 3 "เลือกสิ่งที่อยากเห็น": การ์ดเลือกได้หลายอัน + พิมพ์เองได้ | Task 4 |
| R6, R8, G1 ถึง G7, กลุ่มผู้ใช้ใหม่, AI ชั้นเสริม | เลื่อนไประยะ 2 ถึง 4 (ระบุไว้ที่หัวแผน) |

**Placeholder scan:** ไม่มี TBD หรือ "ทำในลักษณะเดียวกัน" ทุกขั้นที่แก้โค้ดมีโค้ดเต็มหรือคำสั่งแก้ที่ระบุตำแหน่งชัด

**Type consistency:** `suggest_from_profile(profile, audience, limit)` (Task 2) ใช้ตรงกันใน Task 3 (`dashboard_suggest.suggest_from_profile(profile, _audience(audience))`); รูปตอบกลับ `{table_name, suggestions:[{id, rule, text}]}` ตรงกับที่ `ContextForm` อ่าน (`res.suggestions`, `s.id`, `s.text`); `dashboardsApi.suggestions(table, audience)` ตรงกับที่ `ContextForm` เรียก (`tableName`, `value.audience`); ข้อความ "ยังไม่มีคำแนะนำสำหรับชุดข้อมูลนี้ พิมพ์สิ่งที่อยากเห็นได้เลย" ตรงกันระหว่าง `ContextForm.jsx` และเทสต์ใน Task 4
