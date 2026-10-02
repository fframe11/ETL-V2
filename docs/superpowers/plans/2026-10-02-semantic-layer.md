# Semantic Layer (Metadata ของคอลัมน์ + นิยาม Metric) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้แต่ละชุดข้อมูลมีความหมายของคอลัมน์และนิยาม metric ที่ AI ร่างและคนอนุมัติ แล้วให้ Create Dashboard ใช้สิ่งนี้แสดงหน่วยให้ถูก ใช้ KPI แบบอัตราส่วน และไม่แสดงคอลัมน์ข้อมูลส่วนบุคคล

**Architecture:**
- `semantic_layer.py` เป็นฟังก์ชันล้วน (ไม่มี I/O): กฎเดาความหมายจากชื่อคอลัมน์, ตัวตรวจแบบ whitelist, และการประกอบ "view" ที่ใช้จริง (รวมสถานะ, drift, คอลัมน์ที่ต้องซ่อน)
- `semantic_llm.py` ให้ Groq ร่าง โดยใช้ helper จาก `dashboard_llm.py`
- `semantic.py` เป็น router ที่อ่าน/เขียน ES index `sdoqap_semantic_layer`
- `dashboard_compute.py` ได้ตัวคำนวณ metric (where, ratio)
- `dashboard_spec.py`, `dashboard_llm.py`, `dashboards.py` เปลี่ยนให้รับ profile ที่ติดความหมายแล้ว (ตัดคอลัมน์ที่ซ่อนออก) พร้อมรายการ metric
- ฝั่ง UI มีตารางแก้ความหมายคอลัมน์และแผง metric อยู่ในขั้น "ดูข้อมูล"

**Tech Stack:** FastAPI 0.100 + pandas (container `api`, Python 3.10), Groq ผ่าน `requests`, Elasticsearch 8, React 18 + Vitest 2 + Testing Library, Git Bash

**Spec:** [`docs/superpowers/specs/2026-10-02-semantic-layer-design.md`](../specs/2026-10-02-semantic-layer-design.md)

**ต้องทำหลัง:** [`docs/superpowers/plans/2026-10-02-ai-dashboard-builder.md`](2026-10-02-ai-dashboard-builder.md) ทั้ง 13 Task แผนนี้แก้ไฟล์ที่แผนนั้นสร้าง และอ้างโค้ดตามที่แผนนั้นเขียนไว้ ถ้าโค้ดจริงต่างจากแผนนั้น (เช่น แก้ระหว่างรีวิว) ให้ปรับ anchor ของการแก้ไขให้ตรงกับไฟล์จริง โดยคงพฤติกรรมตามที่ Task นี้ระบุ

## Global Constraints

- ทำบน branch ปัจจุบัน (`new-optimizer`) ห้าม commit ลง `main`
- Commit message ไม่ใส่ attribution line ใดๆ (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- working tree มีงานที่ผู้ใช้ยังไม่ commit ห้ามใช้ `git add -A`, `git add .` หรือ `git commit -a` ให้ stage เฉพาะไฟล์ที่ Task ระบุ และห้ามแก้ไฟล์ที่มีงานค้างของผู้ใช้ (`whitebox.py`, `dynamic_rules.py`, `Ingestion.jsx`, `RulesConfig.jsx`, `docs/whitebox-report/*`, `docs/presentation/*` เป็นต้น)
- **ความเป็นส่วนตัว:** prompt ที่ส่ง Groq ทั้งของ semantic และของแดชบอร์ด ห้ามมีค่าในเซลล์ และห้ามมีชื่อคอลัมน์ที่อยู่ใน `hidden_columns`
- **การซ่อน pii (spec หัวข้อ 8 ข้อ 5):**
  - คอลัมน์ที่อยู่ในฉบับอนุมัติ: ใช้ค่า `pii` ของฉบับอนุมัติ
  - คอลัมน์ที่ไม่อยู่ในฉบับอนุมัติ: ซ่อนถ้าร่างติด pii หรือกฎชื่อคอลัมน์ติด pii
  - ES ล่มก็ยังซ่อนตามกฎชื่อคอลัมน์
- ห้ามรันสูตรหรือ expression ที่มาจาก LLM หรือ browser ทุกอย่างผ่าน `validate_semantic()` / `validate_spec()`
- คีย์ Groq ให้เจ้าของระบบใส่เอง agent ห้ามพิมพ์ คัดลอก หรือแสดงค่าคีย์
- ทุก route ใหม่ต้อง login (`require_session`)
- API test รันใน container: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/<ไฟล์>"`
- UI test: `cd services/ui && npx vitest run <ไฟล์>` (ทั้งชุด: `npm test`)
- ทุกคำสั่งรันจาก root ของ repo (`C:\ETL`) ใน Git Bash ยกเว้นที่ขึ้นต้นด้วย `cd services/ui`
- ข้อความบนหน้าจอเป็นภาษาไทย ยกเว้นชื่อเฉพาะและชื่อคอลัมน์
- ถ้า test ที่ควรผ่านกลับล้ม ให้หยุดและรายงาน ห้ามแก้ test ให้ผ่าน **ยกเว้น** test ของแผน Create Dashboard ที่ Task ในแผนนี้ระบุให้แก้ เพราะพฤติกรรมเปลี่ยนตาม spec (Task 7 และ 8)

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| Create `services/api/app/api/semantic_layer.py` | whitelist, กฎจากชื่อคอลัมน์, `validate_semantic`, `resolve`, `apply_to_profile` | 1, 2 |
| Create `services/api/tests/test_semantic_layer.py` | test กฎและตัวตรวจ | 1 |
| Create `services/api/tests/test_semantic_resolve.py` | test view, drift, การซ่อน pii | 2 |
| Modify `services/api/app/api/dashboard_compute.py` | `where_mask`, `evaluate_metric`, `grouped_metric`, `metric_values` แล้วให้วิดเจ็ตใช้ metric | 3, 6 |
| Create `services/api/tests/test_dashboard_metrics.py` | test การคำนวณ metric | 3 |
| Create `services/api/app/api/semantic_llm.py` | ร่างด้วย Groq | 4 |
| Create `services/api/tests/test_semantic_llm.py` | test ร่าง AI และความเป็นส่วนตัว | 4 |
| Create `services/api/app/api/semantic.py` | router `/api/v1/semantic` และ ES | 5 |
| Modify `services/api/main.py`, `services/api/tests/test_route_contract.py` | ลงทะเบียน route | 5 |
| Create `services/api/tests/test_semantic_api.py` | test route | 5 |
| Modify `services/api/app/api/dashboard_spec.py` | `metric_id`, identifier, รูปแบบจากหน่วย, label | 6 |
| Create `services/api/tests/test_dashboard_semantic_spec.py` | test สเปก + การคำนวณกับ semantic | 6 |
| Modify `services/api/app/api/dashboard_llm.py`, `dashboards.py`, `services/api/tests/test_dashboards_api.py` | ใช้ semantic ทุกเส้นของแดชบอร์ด | 7 |
| Create `services/api/tests/test_dashboards_semantic.py` | test end-to-end ของ route แดชบอร์ด | 7 |
| Modify `services/ui/src/utils/numberFormat.js` (+test), `components/builder/KpiCard.jsx`, `ChartWidget.jsx`, `TableWidget.jsx`, `DashboardCanvas.jsx` (+test), `test/dashboardFixtures.js`, `pages/DashboardBuilder.css` | รูปแบบตามสกุลเงิน, สี KPI, label | 8 |
| Create `services/ui/src/utils/requestJson.js` (+test), `utils/semanticApi.js`; Modify `utils/dashboardsApi.js` | client กลาง | 9 |
| Create `services/ui/src/components/builder/semanticModel.js` (+test), `SemanticStatus.jsx`, `ColumnMetaTable.jsx`, `SemanticEditor.jsx` (+test) | แก้ความหมายคอลัมน์ | 9 |
| Create `services/ui/src/components/builder/MetricPanel.jsx` (+test); Modify `semanticModel.js` (+test), `SemanticEditor.jsx` | แผง metric | 10 |
| Modify `services/ui/src/components/builder/DataPreview.jsx`, `pages/DashboardBuilder.jsx`, `DashboardBuilder.test.jsx` | ใส่ใน flow | 11 |
| Modify `README.md` | เอกสาร | 12 |

---

### Task 1: กฎจากชื่อคอลัมน์และตัวตรวจ (`semantic_layer.py` ส่วนที่ 1)

**Files:**
- Create: `services/api/app/api/semantic_layer.py`
- Test: `services/api/tests/test_semantic_layer.py`

**Interfaces:**
- Consumes: profile ของ `dashboard_data.prepare_frame()` (ใช้ `columns[].name`, `kind`, `min`, `max`)
- Produces:
  - ค่าคงที่ `ROLES`, `UNITS`, `DURATION_UNITS`, `DEFAULT_AGGS`, `METRIC_TYPES`, `METRIC_AGGS`, `NUMERIC_AGGS`, `WHERE_OPS`, `METRIC_FORMATS`, `MAX_METRICS = 20`
  - `class SemanticError(ValueError)`
  - `tokens(name) -> list[str]`
  - `is_pii_name(name) -> bool`
  - `rule_column(col) -> meta` โดย meta = `{"role", "label", "description", "unit", "currency", "duration_unit", "default_agg", "pii"}`
  - `rule_draft(profile) -> {"columns": {name: meta}, "metrics": [metric]}`
  - `slug(text)`, `unique_id(text, used)`
  - `metric_columns(metric) -> list[str]`
  - `clean_column(item, col, warnings) -> meta`
  - `clean_metric(item, by_name, used) -> (metric | None, problem | None)` โดย `by_name` = `{name: profile column}`
  - `validate_semantic(raw, profile) -> ({"columns", "metrics"}, warnings)`
- รูปแบบ metric: `{"id", "label", "description", "type": "simple"|"ratio", "measure"|("numerator","denominator"), "format", "currency", "higher_is_better"}` โดยแต่ละส่วนคือ `{"agg", "column", "where": None | {"column", "op", "value"}}`

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_semantic_layer.py`:

```python
import os
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import semantic_layer as sl  # noqa: E402


def col(name, kind, **extra):
    return {"name": name, "kind": kind, "distinct": 10, "missing_pct": 0.0, **extra}


PROFILE = {"rows": 100, "columns": [
    col("Order_ID", "text"), col("Order_Date", "date"), col("Customer_Name", "text"),
    col("Product_Name", "categorical"), col("Country", "categorical"),
    col("Total_Sales", "numeric", min=5.0, max=900.0), col("Profit", "numeric", min=-20.0, max=300.0),
    col("Discount_Percent", "numeric", min=0.0, max=30.0), col("Quantity", "numeric", min=1, max=9),
    col("Customer_Age", "numeric", min=18, max=80), col("duration_seconds", "numeric", min=0.1, max=40.0),
    col("Rating", "numeric", min=1, max=5),
]}
BY_NAME = {c["name"]: c for c in PROFILE["columns"]}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio",
         "numerator": {"agg": "sum", "column": "Profit"}, "denominator": {"agg": "sum", "column": "Total_Sales"},
         "format": "percent"}


def test_tokens_split_snake_and_camel_case():
    assert sl.tokens("CustomerName") == ["customer", "name"]
    assert sl.tokens("Order_ID") == ["order", "id"]
    assert sl.tokens("OrderID") == ["order", "id"]
    assert sl.tokens("ราคา ต่อหน่วย") == ["ราคา", "ต่อหน่วย"]


@pytest.mark.parametrize("name", ["Customer_Name", "CustomerName", "email", "e_mail", "Phone_Number",
                                  "date_of_birth", "name", "username", "ชื่อลูกค้า", "ที่อยู่จัดส่ง", "id_card"])
def test_personal_column_names(name):
    assert sl.is_pii_name(name) is True


@pytest.mark.parametrize("name", ["Product_Name", "Hotel_Rating", "Total_Sales", "ชื่อสินค้า", "Country", "Paid"])
def test_ordinary_column_names(name):
    assert sl.is_pii_name(name) is False


def test_rules_guess_role_unit_and_aggregation_from_names_and_kinds():
    columns = sl.rule_draft(PROFILE)["columns"]
    summary = {n: (m["role"], m["unit"], m["default_agg"]) for n, m in columns.items()}
    assert summary == {
        "Order_ID": ("identifier", None, None), "Order_Date": ("time", None, None),
        "Customer_Name": ("text", None, None), "Product_Name": ("dimension", None, None),
        "Country": ("dimension", None, None), "Total_Sales": ("measure", "currency", "sum"),
        "Profit": ("measure", "currency", "sum"), "Discount_Percent": ("measure", "percent", "avg"),
        "Quantity": ("measure", "count", "sum"), "Customer_Age": ("measure", "number", "avg"),
        "duration_seconds": ("measure", "duration", "avg"), "Rating": ("measure", "number", "sum"),
    }
    assert columns["Customer_Name"]["pii"] is True and columns["Product_Name"]["pii"] is False
    assert columns["Total_Sales"]["currency"] is None
    assert columns["duration_seconds"]["duration_unit"] == "seconds"


def test_rules_read_thai_names_and_need_a_0_to_100_range_for_percent():
    assert sl.rule_column(col("ยอดขาย", "numeric", min=0, max=10))["unit"] == "currency"
    assert sl.rule_column(col("อายุ", "numeric", min=1, max=90))["default_agg"] == "avg"
    assert sl.rule_column(col("จำนวนชิ้น", "numeric", min=1, max=9))["unit"] == "count"
    assert sl.rule_column(col("Conversion_Rate", "numeric", min=0, max=250))["unit"] == "number"
    assert sl.rule_column(col("Profit_Margin", "numeric", min=0, max=60))["unit"] == "percent"


def test_rule_metrics_are_row_count_and_money_totals():
    metrics = sl.rule_draft(PROFILE)["metrics"]
    assert [m["id"] for m in metrics] == ["row_count", "total_total_sales", "total_profit"]
    assert metrics[1]["measure"] == {"agg": "sum", "column": "Total_Sales", "where": None}
    assert metrics[1]["format"] == "currency"


def test_validate_keeps_good_values_and_repairs_bad_ones_with_reasons():
    raw = {"columns": {
        "Total_Sales": {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "usd", "default_agg": "sum"},
        "Customer_Name": {"role": "measure", "pii": False},
        "Country": {"role": "dimension", "unit": "currency", "currency": "THB"},
        "Profit": {"role": "measure", "unit": "dollars", "currency": "dollar"},
        "Ghost": {"role": "dimension"},
    }, "metrics": []}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    columns = semantic["columns"]
    assert "Ghost" not in columns
    assert columns["Total_Sales"]["currency"] == "USD" and columns["Total_Sales"]["label"] == "ยอดขาย"
    assert columns["Customer_Name"]["role"] == "text" and columns["Customer_Name"]["pii"] is False
    assert columns["Country"]["unit"] is None and columns["Country"]["currency"] is None
    assert columns["Profit"]["unit"] == "currency" and columns["Profit"]["currency"] is None
    text = " ".join(warnings)
    for reason in ("Ghost", "Customer_Name", "dollars", "dollar"):
        assert reason in text


def test_validating_a_validated_semantic_changes_nothing():
    first, _ = sl.validate_semantic(sl.rule_draft(PROFILE), PROFILE)
    second, warnings = sl.validate_semantic(first, PROFILE)
    assert second == first and warnings == []


def test_metrics_are_kept_when_valid_and_dropped_with_a_reason_otherwise():
    raw = {"columns": {}, "metrics": [
        GROSS,
        {"label": "อัตราลดราคา", "type": "ratio",
         "numerator": {"agg": "count", "column": "Profit", "where": {"column": "Discount_Percent", "op": "gt", "value": 0}},
         "denominator": {"agg": "count"}, "format": "percent"},
        {"label": "ออเดอร์ ไทยแลนด์", "type": "simple",
         "measure": {"agg": "count_distinct", "column": "Order_ID", "where": {"column": "Country", "op": "in", "value": ["TH", "LA"]}}},
        {"label": "หลังปีใหม่", "type": "simple",
         "measure": {"agg": "count", "where": {"column": "Order_Date", "op": "gte", "value": "2025-01-01"}}},
        {"label": "ผลรวมชื่อ", "type": "simple", "measure": {"agg": "sum", "column": "Customer_Name"}},
        {"label": "มัธยฐาน", "type": "simple", "measure": {"agg": "median", "column": "Profit"}},
        {"label": "ประเทศมากกว่า", "type": "simple", "measure": {"agg": "count", "where": {"column": "Country", "op": "gt", "value": 1}}},
        {"label": "ยอดมากกว่า", "type": "simple", "measure": {"agg": "count", "where": {"column": "Total_Sales", "op": "gt", "value": "100"}}},
        {"label": "", "type": "simple", "measure": {"agg": "count"}},
        {"label": "เรดาร์", "type": "formula"},
    ]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    metrics = semantic["metrics"]
    assert [m["label"] for m in metrics] == ["Gross Margin", "อัตราลดราคา", "ออเดอร์ ไทยแลนด์", "หลังปีใหม่"]
    assert metrics[0]["numerator"] == {"agg": "sum", "column": "Profit", "where": None}
    assert metrics[0]["higher_is_better"] is True and metrics[0]["currency"] is None
    assert metrics[1]["numerator"]["column"] is None  # count takes no column
    assert [m["id"] for m in metrics[1:]] == ["metric", "metric_2", "metric_3"]  # Thai labels give no slug
    text = " ".join(warnings)
    for reason in ("Customer_Name", "median", "Country", "ตัวเลข", "ไม่มีชื่อ", "formula"):
        assert reason in text


def test_metric_ids_are_kept_when_valid_and_made_unique_otherwise():
    raw = {"metrics": [GROSS, dict(GROSS, label="Margin again"), dict(GROSS, id="Bad Id!", label="Net Margin")]}
    semantic, _ = sl.validate_semantic(raw, PROFILE)
    assert [m["id"] for m in semantic["metrics"]] == ["gross_margin", "margin_again", "net_margin"]


def test_at_most_twenty_metrics_are_kept():
    raw = {"metrics": [dict(GROSS, id=f"m{i}", label=f"M{i}") for i in range(25)]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    assert len(semantic["metrics"]) == 20 and any("20" in w for w in warnings)


def test_currency_metric_keeps_its_code_and_others_drop_it():
    raw = {"metrics": [
        {"label": "รวม", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "currency", "currency": "thb"},
        {"label": "รวม2", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "number", "currency": "THB"}]}
    first, second = sl.validate_semantic(raw, PROFILE)[0]["metrics"]
    assert first["currency"] == "THB" and second["currency"] is None


def test_metric_columns_lists_every_referenced_column():
    metric = {"type": "ratio", "numerator": {"agg": "sum", "column": "Profit", "where": {"column": "Country", "op": "eq", "value": "TH"}},
              "denominator": {"agg": "count", "column": None, "where": None}}
    assert sl.metric_columns(metric) == ["Country", "Profit"]


def test_non_objects_are_rejected():
    with pytest.raises(sl.SemanticError):
        sl.validate_semantic([], PROFILE)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_semantic_layer.py"`
Expected: FAIL ด้วย `ImportError: cannot import name 'semantic_layer'`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/api/app/api/semantic_layer.py`:

```python
"""Semantic layer: what each column of a dataset means (role, label, unit, currency, PII)
and the dataset's metric definitions.

Pure functions only (no Elasticsearch, no LLM) so every rule can be tested on its own:
semantic.py stores the documents and semantic_llm.py drafts them with Groq. Whatever a
person or the LLM sends goes through validate_semantic() before it is stored or used."""
import re
from datetime import datetime

ROLES = ("measure", "dimension", "time", "identifier", "text")
UNITS = ("currency", "percent", "count", "duration", "number")
DURATION_UNITS = ("seconds", "minutes", "hours", "days")
DEFAULT_AGGS = ("sum", "avg", "min", "max", "count_distinct")
METRIC_TYPES = ("simple", "ratio")
METRIC_AGGS = ("count", "count_distinct", "sum", "avg", "min", "max")
NUMERIC_AGGS = ("sum", "avg", "min", "max")
WHERE_OPS = ("eq", "ne", "in", "gt", "gte", "lt", "lte")
METRIC_FORMATS = ("number", "currency", "percent")
MAX_METRICS = 20
MAX_IN_VALUES = 50
MAX_RULE_MONEY_METRICS = 5

_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_METRIC_ID_RE = re.compile(r"^[a-z0-9_]{1,40}$")

# Name rules compare whole words: "CustomerName" and "customer_name" both give
# ["customer", "name"], so "Hotel" never matches "tel" and "Paid" never matches "id".
PII_WORDS = {"email", "phone", "mobile", "tel", "telephone", "address", "passport", "ssn", "birth",
             "birthday", "birthdate", "dob"}
PII_JOINED = ("email", "idcard", "citizen", "nationalid", "dateofbirth")
PERSON_WORDS = {"customer", "first", "last", "full", "user", "contact", "person", "employee", "owner", "member",
                "client", "patient", "student", "given", "family", "middle", "sender", "receiver", "recipient"}
PERSON_NAMES = {"name", "username", "fullname", "firstname", "lastname", "customername", "surname"}
THAI_PII = ("ชื่อลูกค้า", "ชื่อผู้", "ชื่อจริง", "นามสกุล", "ชื่อ-สกุล", "อีเมล", "เบอร์โทร", "ที่อยู่",
            "บัตรประชาชน", "เลขบัตร")
IDENTIFIER_WORDS = {"id", "code", "no", "uuid", "sku", "key"}
PERCENT_WORDS = {"pct", "percent", "percentage", "rate", "ratio", "score", "margin"}
MONEY_WORDS = {"sales", "revenue", "amount", "price", "cost", "profit", "income", "value", "spend"}
AGE_WORDS = {"age"}
COUNT_WORDS = {"qty", "quantity", "count", "records", "rows", "units", "items"}
DURATION_WORDS = {"seconds": "seconds", "secs": "seconds", "sec": "seconds", "duration": "seconds",
                  "minutes": "minutes", "mins": "minutes", "hours": "hours", "hrs": "hours", "lag": "hours",
                  "days": "days"}
THAI_MONEY = ("ยอด", "ราคา", "ต้นทุน", "กำไร")
THAI_AGE = ("อายุ",)
THAI_COUNT = ("จำนวน",)


class SemanticError(ValueError):
    """The input is not a semantic-layer object at all."""


def tokens(name):
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(name))
    return [t for t in re.split(r"[^a-z0-9\u0e00-\u0e7f]+", spaced.lower()) if t]


def is_pii_name(name):
    words = tokens(name)
    joined = "".join(words)
    if PII_WORDS & set(words) or any(part in joined for part in PII_JOINED) or joined in PERSON_NAMES:
        return True
    if "name" in words:
        i = words.index("name")
        if i > 0 and words[i - 1] in PERSON_WORDS:
            return True
    return any(part in str(name) for part in THAI_PII)


def _has(words, name, english, thai=()):
    return bool(english & set(words)) or any(part in str(name) for part in thai)


def rule_column(col):
    """What a column most likely means, from its name and profiled kind alone."""
    name, kind = col["name"], col["kind"]
    words = tokens(name)
    meta = {"role": "text", "label": "", "description": "", "unit": None, "currency": None,
            "duration_unit": None, "default_agg": None, "pii": is_pii_name(name)}

    def measure(unit, agg, duration_unit=None):
        meta.update(role="measure", unit=unit, default_agg=agg, duration_unit=duration_unit)

    low, high = col.get("min"), col.get("max")
    if words and (words[-1] in IDENTIFIER_WORDS or words[0] == "id"):
        meta["role"] = "identifier"
    elif kind == "date":
        meta["role"] = "time"
    elif kind == "numeric":
        in_0_100 = low is not None and high is not None and 0 <= low and high <= 100
        if _has(words, name, PERCENT_WORDS) and in_0_100:
            measure("percent", "avg")
        elif _has(words, name, MONEY_WORDS, THAI_MONEY):
            measure("currency", "sum")
        elif _has(words, name, AGE_WORDS, THAI_AGE):
            measure("number", "avg")
        elif _has(words, name, COUNT_WORDS, THAI_COUNT):
            measure("count", "sum")
        elif set(words) & set(DURATION_WORDS):
            measure("duration", "avg", next(DURATION_WORDS[w] for w in words if w in DURATION_WORDS))
        else:
            measure("number", "sum")
    elif kind == "categorical":
        meta["role"] = "dimension"
    return meta


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")[:40] or "metric"


def unique_id(text, used):
    base = slug(text)
    candidate, n = base, 2
    while candidate in used:
        suffix = f"_{n}"
        candidate = base[: 40 - len(suffix)] + suffix
        n += 1
    return candidate


def rule_draft(profile):
    """The semantic layer guessed from names and kinds, used before anything is drafted
    or approved, when Groq is unavailable, and for columns the stored versions lack."""
    columns = {c["name"]: rule_column(c) for c in profile["columns"]}
    metrics = [{"id": "row_count", "label": "จำนวนแถว", "description": "", "type": "simple",
                "measure": {"agg": "count", "column": None, "where": None},
                "format": "number", "currency": None, "higher_is_better": True}]
    used = {"row_count"}
    money = [n for n, m in columns.items() if m["role"] == "measure" and m["unit"] == "currency" and not m["pii"]]
    for name in money[:MAX_RULE_MONEY_METRICS]:
        metric_id = unique_id(f"total_{name}", used)
        used.add(metric_id)
        metrics.append({"id": metric_id, "label": f"ผลรวม {name}", "description": "", "type": "simple",
                        "measure": {"agg": "sum", "column": name, "where": None},
                        "format": "currency", "currency": None, "higher_is_better": True})
    return {"columns": columns, "metrics": metrics}


def metric_columns(metric):
    parts = [metric.get("measure")] if metric.get("type") == "simple" else [metric.get("numerator"), metric.get("denominator")]
    names = []
    for part in parts:
        if isinstance(part, dict):
            names += [part.get("column"), (part.get("where") or {}).get("column")]
    return sorted({n for n in names if n})


def _text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def _role_fits(role, kind):
    return (role != "measure" or kind == "numeric") and (role != "time" or kind == "date")


def _currency(value, owner, warnings):
    if value in (None, ""):
        return None
    code = str(value).strip().upper()
    if _CURRENCY_RE.match(code):
        return code
    warnings.append(f"{owner}: รหัสสกุลเงิน {value} ไม่ถูกต้อง")
    return None


def clean_column(item, col, warnings):
    """One column's metadata with every field valid for the column's profiled kind; an
    unusable value falls back to the rule guess for that column."""
    base = rule_column(col)
    item = item if isinstance(item, dict) else {}
    name, kind = col["name"], col["kind"]
    role = item.get("role", base["role"])
    if role not in ROLES or not _role_fits(role, kind):
        warnings.append(f"{name}: ใช้บทบาท {role} กับคอลัมน์ชนิด {kind} ไม่ได้ ใช้ {base['role']} แทน")
        role = base["role"]
    meta = {"role": role, "label": _text(item.get("label"), 60), "description": _text(item.get("description"), 300),
            "unit": None, "currency": None, "duration_unit": None, "default_agg": None,
            "pii": bool(item.get("pii", base["pii"]))}
    if role != "measure":
        return meta
    fallback = base if base["role"] == "measure" else {"unit": "number", "default_agg": "sum", "duration_unit": None}
    unit = item.get("unit", fallback["unit"])
    if unit not in UNITS:
        warnings.append(f"{name}: ไม่รู้จักหน่วย {unit} ใช้ {fallback['unit']} แทน")
        unit = fallback["unit"]
    agg = item.get("default_agg", fallback["default_agg"])
    if agg not in DEFAULT_AGGS:
        warnings.append(f"{name}: ไม่รู้จักการรวม {agg} ใช้ {fallback['default_agg']} แทน")
        agg = fallback["default_agg"]
    meta.update(unit=unit, default_agg=agg)
    if unit == "currency":
        meta["currency"] = _currency(item.get("currency"), name, warnings)
    if unit == "duration":
        duration_unit = item.get("duration_unit") or fallback["duration_unit"] or "seconds"
        if duration_unit not in DURATION_UNITS:
            warnings.append(f"{name}: ไม่รู้จักหน่วยเวลา {duration_unit} ใช้ seconds แทน")
            duration_unit = "seconds"
        meta["duration_unit"] = duration_unit
    return meta


def _is_iso(value):
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _scalar(value):
    return isinstance(value, (str, int, float, bool))


def _clean_where(raw, by_name):
    if raw is None:
        return None, None
    if not isinstance(raw, dict):
        return None, "เงื่อนไขไม่ถูกต้อง"
    column, op, value = raw.get("column"), raw.get("op"), raw.get("value")
    if column not in by_name:
        return None, f"เงื่อนไขอ้างคอลัมน์ {column} ที่ไม่มี"
    if op not in WHERE_OPS:
        return None, f"ไม่รองรับเงื่อนไข {op}"
    kind = by_name[column]["kind"]
    if op == "in":
        if not isinstance(value, list) or not 1 <= len(value) <= MAX_IN_VALUES or not all(_scalar(v) for v in value):
            return None, f"เงื่อนไข in ต้องเป็นรายการ 1–{MAX_IN_VALUES} ค่า"
    elif op in ("gt", "gte", "lt", "lte"):
        if kind == "numeric":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return None, f"{op} บน {column} ต้องเทียบกับตัวเลข"
        elif kind == "date":
            if not _is_iso(value):
                return None, f"{op} บน {column} ต้องเทียบกับวันที่ ISO"
        else:
            return None, f"{op} ใช้ได้กับคอลัมน์ตัวเลขหรือวันที่เท่านั้น ({column})"
    elif not _scalar(value):
        return None, "ค่าของเงื่อนไขไม่ถูกต้อง"
    return {"column": column, "op": op, "value": value}, None


def _clean_part(raw, by_name):
    if not isinstance(raw, dict):
        return None, "ไม่มีส่วนการคำนวณ"
    agg, column = raw.get("agg"), raw.get("column")
    if agg not in METRIC_AGGS:
        return None, f"ไม่รองรับการคำนวณ {agg}"
    if agg == "count":
        column = None
    elif column not in by_name:
        return None, f"ไม่มีคอลัมน์ {column}"
    elif agg in NUMERIC_AGGS and by_name[column]["kind"] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    where, problem = _clean_where(raw.get("where"), by_name)
    if problem:
        return None, problem
    return {"agg": agg, "column": column, "where": where}, None


def clean_metric(item, by_name, used):
    """(metric, None) or (None, reason). used holds ids already taken in this dataset."""
    if not isinstance(item, dict):
        return None, "ไม่ใช่ object"
    label = _text(item.get("label"), 60)
    if not label:
        return None, "ไม่มีชื่อ"
    metric_type = item.get("type")
    if metric_type not in METRIC_TYPES:
        return None, f"ไม่รองรับชนิด {metric_type}"
    metric = {"id": None, "label": label, "description": _text(item.get("description"), 300), "type": metric_type}
    if metric_type == "simple":
        part, problem = _clean_part(item.get("measure"), by_name)
        if problem:
            return None, problem
        metric["measure"] = part
    else:
        for key, title in (("numerator", "ตัวตั้ง"), ("denominator", "ตัวหาร")):
            part, problem = _clean_part(item.get(key), by_name)
            if problem:
                return None, f"{title}: {problem}"
            metric[key] = part
    metric["format"] = item.get("format") if item.get("format") in METRIC_FORMATS else "number"
    metric["currency"] = _currency(item.get("currency"), label, []) if metric["format"] == "currency" else None
    metric["higher_is_better"] = bool(item.get("higher_is_better", True))
    given = item.get("id")
    ok = isinstance(given, str) and _METRIC_ID_RE.match(given) and given not in used
    metric["id"] = given if ok else unique_id(label, used)
    return metric, None


def validate_semantic(raw, profile):
    """({"columns", "metrics"}, warnings). Unknown columns are dropped, unusable values
    fall back to the rule guess, unusable metrics are dropped — each with a warning."""
    if not isinstance(raw, dict):
        raise SemanticError("ข้อมูลความหมายคอลัมน์ต้องเป็น JSON object")
    by_name = {c["name"]: c for c in profile["columns"]}
    warnings = []
    raw_columns = raw.get("columns") if isinstance(raw.get("columns"), dict) else {}
    columns = {}
    for name, item in raw_columns.items():
        if name not in by_name:
            warnings.append(f"ตัดคอลัมน์ {name}: ไม่มีในชุดข้อมูล")
            continue
        columns[name] = clean_column(item, by_name[name], warnings)
    metrics, used = [], set()
    for item in raw.get("metrics") if isinstance(raw.get("metrics"), list) else []:
        label = item.get("label") if isinstance(item, dict) else None
        metric, problem = clean_metric(item, by_name, used)
        if problem:
            warnings.append(f"ตัด metric '{label or '?'}': {problem}")
            continue
        if len(metrics) >= MAX_METRICS:
            warnings.append(f"ใช้ {MAX_METRICS} metric แรก")
            break
        metrics.append(metric)
        used.add(metric["id"])
    return {"columns": columns, "metrics": metrics}, warnings
```

หมายเหตุ test `test_metrics_are_kept_...`:
- "อัตราลดราคา" เป็น ratio ที่ตัวตั้งมี `"column": "Profit"` แต่ `agg` เป็น count จึงถูกล้างเป็น `None`
- ส่วน "ยอดมากกว่า" ส่ง `"100"` เป็นสตริงให้ `gt` บนคอลัมน์ตัวเลข จึงถูกตัดด้วยเหตุผลที่มีคำว่า "ตัวเลข"

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/semantic_layer.py services/api/tests/test_semantic_layer.py
git commit -m "feat(api): semantic layer name rules and whitelist validator"
```

---

### Task 2: View ที่ใช้งานจริง, drift และการซ่อนข้อมูลส่วนบุคคล (`semantic_layer.py` ส่วนที่ 2)

**Files:**
- Modify: `services/api/app/api/semantic_layer.py` (ต่อท้ายไฟล์)
- Test: `services/api/tests/test_semantic_resolve.py`

**Interfaces:**
- Consumes: `rule_draft`, `clean_column`, `clean_metric`, `metric_columns` (Task 1)
- Produces:
  - `resolve(table_name, doc, profile, available=True) -> view` โดย `doc` เป็นเอกสารตามความหมาย `{"table_name", "draft": {"columns", "metrics", ...} | None, "approved": {"columns", "metrics", "version", ...} | None, "history": [...]}` หรือ `None`
  - view = `{"table_name", "status", "pending_draft", "version", "effective": {"columns", "metrics"}, "draft", "approved", "drift": {"new_columns", "missing_columns"}, "invalid_metrics": [{"id", "label", "reason"}], "hidden_columns": [...], "history": [...], "warnings": [...]}`
  - `apply_to_profile(profile, view) -> profile` คืน profile ชุดใหม่ที่ตัดคอลัมน์ใน `hidden_columns` ออก และเติม `role`, `label` (ว่างใช้ชื่อคอลัมน์), `unit`, `currency`, `default_agg` ให้แต่ละคอลัมน์ พร้อมคำนวณ `column_count` และ `kind_counts` ใหม่ (ไม่แก้ profile เดิม)

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_semantic_resolve.py`:

```python
import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import semantic_layer as sl  # noqa: E402

KINDS = ("numeric", "categorical", "date", "text")


def profile_of(*columns):
    cols = [{"name": n, "kind": k, "distinct": 5, "missing_pct": 0.0, "min": 0.0, "max": 500.0} for n, k in columns]
    return {"rows": 10, "column_count": len(cols), "columns": cols,
            "kind_counts": {k: sum(c["kind"] == k for c in cols) for k in KINDS}}


PROFILE = profile_of(("Order_ID", "text"), ("Customer_Name", "text"), ("Country", "categorical"),
                     ("Total_Sales", "numeric"), ("Profit", "numeric"))
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio",
         "numerator": {"agg": "sum", "column": "Profit"}, "denominator": {"agg": "sum", "column": "Total_Sales"},
         "format": "percent"}


def approved(columns, metrics=(), version=3):
    return {"columns": columns, "metrics": list(metrics), "version": version, "approved_by": "admin",
            "approved_at": "2026-10-02T00:00:00Z"}


def all_columns(**overrides):
    base = sl.rule_draft(PROFILE)["columns"]
    return {**base, **overrides}


def test_nothing_stored_uses_the_rules():
    view = sl.resolve("sales", None, PROFILE)
    assert view["status"] == "none" and view["version"] == 0 and view["pending_draft"] is False
    assert view["effective"]["columns"]["Total_Sales"]["unit"] == "currency"
    assert [m["id"] for m in view["effective"]["metrics"]] == ["row_count", "total_total_sales", "total_profit"]
    assert view["hidden_columns"] == ["Customer_Name"]
    assert view["drift"] == {"new_columns": [], "missing_columns": []}


def test_a_draft_is_used_until_something_is_approved():
    doc = {"draft": {"columns": all_columns(Total_Sales=USD), "metrics": [GROSS]}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "draft"
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert [m["id"] for m in view["effective"]["metrics"]] == ["gross_margin"]


def test_the_approved_version_wins_and_a_newer_draft_is_pending():
    doc = {"approved": approved(all_columns(Total_Sales=USD), [GROSS]),
           "draft": {"columns": all_columns(Total_Sales=dict(USD, currency="THB")), "metrics": []}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "approved" and view["version"] == 3 and view["pending_draft"] is True
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"


def test_structure_changes_make_the_approved_version_outdated():
    stored = {n: m for n, m in all_columns().items() if n != "Profit"}
    stored["Old_Column"] = {"role": "text", "pii": False}
    doc = {"approved": approved(stored, [GROSS]),
           "draft": {"columns": {"Profit": dict(USD, label="กำไร")}, "metrics": []}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "approved_outdated"
    assert view["drift"] == {"new_columns": ["Profit"], "missing_columns": ["Old_Column"]}
    assert view["effective"]["columns"]["Profit"]["label"] == "กำไร"  # new column taken from the draft
    assert "Old_Column" not in view["effective"]["columns"]


def test_a_person_unhides_a_column_only_by_approving_it():
    unhidden = sl.resolve("sales", {"approved": approved(all_columns(Customer_Name={"role": "text", "pii": False}))}, PROFILE)
    assert "Customer_Name" not in unhidden["hidden_columns"]
    drafted = sl.resolve("sales", {"draft": {"columns": all_columns(Customer_Name={"role": "text", "pii": False}), "metrics": []}}, PROFILE)
    assert drafted["hidden_columns"] == ["Customer_Name"]  # the name rule still hides it
    flagged = sl.resolve("sales", {"draft": {"columns": all_columns(Country={"role": "dimension", "pii": True}), "metrics": []}}, PROFILE)
    assert flagged["hidden_columns"] == ["Customer_Name", "Country"]
    assert flagged["effective"]["columns"]["Country"]["pii"] is True


def test_metrics_that_cannot_be_computed_are_reported_not_used():
    lost = dict(GROSS, id="aov", label="AOV", denominator={"agg": "count_distinct", "column": "Invoice_No"})
    personal = {"id": "buyers", "label": "ผู้ซื้อ", "type": "simple", "measure": {"agg": "count_distinct", "column": "Customer_Name"}}
    view = sl.resolve("sales", {"approved": approved(all_columns(), [GROSS, lost, personal])}, PROFILE)
    assert [m["id"] for m in view["effective"]["metrics"]] == ["gross_margin"]
    reasons = {m["id"]: m["reason"] for m in view["invalid_metrics"]}
    assert "Invoice_No" in reasons["aov"]
    assert "ข้อมูลส่วนบุคคล" in reasons["buyers"]


def test_stored_meaning_that_no_longer_fits_the_column_is_repaired_with_a_warning():
    doc = {"approved": approved(all_columns(Country={"role": "measure", "unit": "currency", "pii": False}))}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["effective"]["columns"]["Country"]["role"] == "dimension"
    assert any("Country" in w for w in view["warnings"])


def test_without_elasticsearch_the_rules_still_hide_personal_columns():
    view = sl.resolve("sales", None, PROFILE, available=False)
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]


def test_apply_to_profile_removes_hidden_columns_and_adds_meaning():
    view = sl.resolve("sales", {"approved": approved(all_columns(Total_Sales=USD))}, PROFILE)
    applied = sl.apply_to_profile(PROFILE, view)
    names = [c["name"] for c in applied["columns"]]
    assert "Customer_Name" not in names and applied["column_count"] == 4
    sales = next(c for c in applied["columns"] if c["name"] == "Total_Sales")
    assert (sales["role"], sales["label"], sales["unit"], sales["currency"]) == ("measure", "ยอดขาย", "currency", "USD")
    country = next(c for c in applied["columns"] if c["name"] == "Country")
    assert country["label"] == "Country" and country["role"] == "dimension"
    assert applied["kind_counts"]["text"] == 1
    assert len(PROFILE["columns"]) == 5  # the original profile is untouched
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_semantic_resolve.py"`
Expected: FAIL ด้วย `AttributeError: module 'app.api.semantic_layer' has no attribute 'resolve'`

- [ ] **Step 3: Write minimal implementation**

ต่อท้าย `services/api/app/api/semantic_layer.py`:

```python
def _stored_columns(part, by_name, warnings):
    """A stored draft/approved column map re-checked against the current profile."""
    stored = (part or {}).get("columns") or {}
    return {name: clean_column(meta, by_name[name], warnings) for name, meta in stored.items() if name in by_name}


def resolve(table_name, doc, profile, available=True):
    """The semantic view Create Dashboard uses (spec section 8)."""
    doc = doc or {}
    by_name = {c["name"]: c for c in profile["columns"]}
    rules = rule_draft(profile)
    draft, approved = doc.get("draft"), doc.get("approved")
    base = approved or draft
    warnings = []
    approved_columns = _stored_columns(approved, by_name, warnings if approved else [])
    draft_columns = _stored_columns(draft, by_name, [] if approved else warnings)
    base_columns = approved_columns if approved else draft_columns
    stored_names = (base or {}).get("columns") or {}
    new_columns = [n for n in by_name if base and n not in stored_names]
    missing_columns = sorted(n for n in stored_names if n not in by_name)

    columns, hidden = {}, []
    for name in by_name:
        meta = base_columns.get(name) or draft_columns.get(name) or rules["columns"][name]
        if approved and name in approved_columns:
            pii = approved_columns[name]["pii"]
        else:
            pii = draft_columns.get(name, {}).get("pii", False) or rules["columns"][name]["pii"]
        columns[name] = {**meta, "pii": bool(pii)}
        if pii:
            hidden.append(name)

    metrics, invalid, used = [], [], set()
    for item in (base or rules).get("metrics") or []:
        metric, problem = clean_metric(item, by_name, used)
        if not problem:
            private = [c for c in metric_columns(metric) if c in hidden]
            if private:
                problem = f"อ้างคอลัมน์ข้อมูลส่วนบุคคล {', '.join(private)}"
        if problem:
            invalid.append({"id": item.get("id") if isinstance(item, dict) else None,
                            "label": item.get("label") if isinstance(item, dict) else None, "reason": problem})
            continue
        metrics.append(metric)
        used.add(metric["id"])

    if not available:
        status = "unavailable"
    elif approved:
        status = "approved_outdated" if new_columns or missing_columns else "approved"
    elif draft:
        status = "draft"
    else:
        status = "none"
    return {"table_name": table_name, "status": status, "pending_draft": bool(approved and draft),
            "version": approved["version"] if approved else 0,
            "effective": {"columns": columns, "metrics": metrics},
            "draft": draft, "approved": approved,
            "drift": {"new_columns": new_columns, "missing_columns": missing_columns},
            "invalid_metrics": invalid, "hidden_columns": hidden,
            "history": doc.get("history") or [], "warnings": warnings}


def apply_to_profile(profile, view):
    """The profile Create Dashboard may use: hidden (personal) columns removed, each
    remaining column carrying its role, label, unit, currency and default aggregation."""
    hidden = set(view["hidden_columns"])
    meaning = view["effective"]["columns"]
    columns = []
    for c in profile["columns"]:
        if c["name"] in hidden:
            continue
        meta = meaning.get(c["name"], {})
        columns.append({**c, "role": meta.get("role"), "label": meta.get("label") or c["name"],
                        "unit": meta.get("unit"), "currency": meta.get("currency"),
                        "default_agg": meta.get("default_agg")})
    kind_counts = {k: sum(col["kind"] == k for col in columns) for k in profile["kind_counts"]}
    return {**profile, "columns": columns, "column_count": len(columns), "kind_counts": kind_counts}
```

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2 และรัน `tests/test_semantic_layer.py` ซ้ำ
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/semantic_layer.py services/api/tests/test_semantic_resolve.py
git commit -m "feat(api): resolve the semantic view with drift and personal-column hiding"
```

---

### Task 3: ตัวคำนวณ metric (where, ratio, grouped)

**Files:**
- Modify: `services/api/app/api/dashboard_compute.py` (เพิ่ม import และฟังก์ชันใหม่ต่อจาก `_grouped`)
- Test: `services/api/tests/test_dashboard_metrics.py`

**Interfaces:**
- Consumes: `_labels`, `_aggregate`, `_grouped`, `_value` ใน `dashboard_compute.py` (แผน Create Dashboard Task 3); รูปแบบ metric จาก Task 1
- Produces:
  - `where_mask(frame, where) -> bool Series`
  - `evaluate_metric(frame, metric) -> float | None` (ratio ที่ `format == "percent"` คูณ 100, ตัวหาร 0 หรือว่างได้ `None`)
  - `grouped_metric(frame, keys, metric) -> Series` (index = กลุ่มที่มีอยู่ใน `frame`; count/count_distinct/sum ของกลุ่มที่ไม่มีแถวตรงเงื่อนไขได้ 0)
  - `metric_values(df, metrics) -> {id: float | None}`

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_dashboard_metrics.py`:

```python
import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_compute as dc  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402

DF, _ = prepare_frame(pd.DataFrame({
    "order_id": ["o1", "o1", "o2", "o3", "o4", "o5"],
    "order_date": ["2025-01-05", "2025-01-05", "2025-02-03", "2025-02-28", "2025-03-10", "2025-03-11"],
    "region": ["North", "North", "South", "South", "East", None],
    "sales": [100.0, 50.0, 200.0, 0.0, 80.0, 70.0],
    "profit": [40.0, 10.0, 60.0, 0.0, -8.0, 7.0],
    "returned": [False, False, True, False, True, False],
}))


def part(agg, column=None, where=None):
    return {"agg": agg, "column": column, "where": where}


def simple(p, fmt="number"):
    return {"id": "m", "type": "simple", "measure": p, "format": fmt}


def ratio(num, den, fmt="percent"):
    return {"id": "r", "type": "ratio", "numerator": num, "denominator": den, "format": fmt}


MARGIN = ratio(part("sum", "profit"), part("sum", "sales"))


def test_simple_and_ratio_metrics():
    assert dc.evaluate_metric(DF, simple(part("sum", "sales"))) == 500.0
    assert dc.evaluate_metric(DF, MARGIN) == pytest.approx(21.8)
    assert dc.evaluate_metric(DF, ratio(part("sum", "sales"), part("count_distinct", "order_id"), "currency")) == 100.0


@pytest.mark.parametrize("where,expected", [
    ({"column": "returned", "op": "eq", "value": True}, 2),
    ({"column": "region", "op": "ne", "value": "North"}, 4),
    ({"column": "region", "op": "in", "value": ["North", "South"]}, 4),
    ({"column": "sales", "op": "gt", "value": 75}, 3),
    ({"column": "sales", "op": "eq", "value": 0}, 1),
    ({"column": "order_date", "op": "gte", "value": "2025-02-28"}, 3),
    ({"column": "order_date", "op": "lt", "value": "2025-02-01T00:00:00+00:00"}, 2),
])
def test_where_conditions(where, expected):
    assert dc.evaluate_metric(DF, simple(part("count", where=where))) == expected


def test_conditional_ratio_and_zero_denominator():
    returned = ratio(part("count", where={"column": "returned", "op": "eq", "value": True}), part("count"))
    assert dc.evaluate_metric(DF, returned) == pytest.approx(33.3333)
    nowhere = ratio(part("sum", "profit"), part("sum", "sales", {"column": "region", "op": "eq", "value": "Nowhere"}))
    assert dc.evaluate_metric(DF, nowhere) is None


def test_grouped_ratio_is_computed_per_group():
    frame = DF.assign(_x=dc._labels(DF["region"]))
    values = dc.grouped_metric(frame, ["_x"], MARGIN).to_dict()
    assert values["North"] == pytest.approx(33.3333) and values["South"] == pytest.approx(30.0)
    assert values["East"] == pytest.approx(-10.0) and values["(ว่าง)"] == pytest.approx(10.0)


def test_grouped_counts_with_a_condition_are_zero_not_missing():
    frame = DF.assign(_x=dc._labels(DF["region"]))
    returned = simple(part("count", where={"column": "returned", "op": "eq", "value": True}))
    assert dc.grouped_metric(frame, ["_x"], returned).to_dict() == {"North": 0, "South": 1, "East": 1, "(ว่าง)": 0}


def test_metric_values_reports_every_metric_and_survives_a_broken_one():
    broken = simple(part("sum", "gone"))
    values = dc.metric_values(DF, [dict(MARGIN, id="margin"), dict(broken, id="broken")])
    assert values["margin"] == pytest.approx(21.8) and values["broken"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboard_metrics.py"`
Expected: FAIL ด้วย `AttributeError: module 'app.api.dashboard_compute' has no attribute 'evaluate_metric'`

- [ ] **Step 3: Write minimal implementation**

แก้ `services/api/app/api/dashboard_compute.py`:

1. แทนบรรทัด `import pandas as pd` ด้วย:

```python
import operator

import pandas as pd
```

2. ต่อจากฟังก์ชัน `_grouped` เพิ่ม:

```python
_COMPARE = {"gt": operator.gt, "gte": operator.ge, "lt": operator.lt, "lte": operator.le}


def _matches(series, values):
    if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
        numbers = pd.to_numeric(pd.Series(list(values), dtype="object"), errors="coerce").dropna().tolist()
        return series.isin(numbers).fillna(False).astype(bool)
    return _labels(series).isin([str(v) for v in values]).astype(bool)


def where_mask(frame, where):
    """Rows matching one metric condition (semantic_layer.WHERE_OPS). Text comparisons use
    the labels the charts show, so "(ว่าง)" matches empty values."""
    series, op, value = frame[where["column"]], where["op"], where["value"]
    if op in ("eq", "ne", "in"):
        mask = _matches(series, value if op == "in" else [value])
        return ~mask if op == "ne" else mask
    if pd.api.types.is_datetime64_any_dtype(series):
        bound = pd.Timestamp(value)
        bound = bound.tz_convert(None) if bound.tzinfo else bound
    else:
        series, bound = pd.to_numeric(series, errors="coerce"), value
    return _COMPARE[op](series, bound).fillna(False).astype(bool)


def _part_value(frame, part):
    if part.get("where"):
        frame = frame[where_mask(frame, part["where"])]
    return _aggregate(frame, part)


def evaluate_metric(frame, metric):
    """One number for a semantic-layer metric over frame; ratios in percent are x100."""
    if metric["type"] == "simple":
        value = _part_value(frame, metric["measure"])
    else:
        numerator = _part_value(frame, metric["numerator"])
        denominator = _part_value(frame, metric["denominator"])
        value = None if numerator is None or not denominator else numerator / denominator
        if value is not None and metric.get("format") == "percent":
            value *= 100
    return _value(value)


def _grouped_part(frame, keys, part, index):
    subset = frame[where_mask(frame, part["where"])] if part.get("where") else frame
    values = _grouped(subset, keys, part).reindex(index)
    return values.fillna(0) if part["agg"] in ("count", "count_distinct", "sum") else values


def grouped_metric(frame, keys, metric):
    """A metric per group of keys; every group present in frame gets a value (or NaN)."""
    index = frame.groupby(keys, sort=False).size().index
    if metric["type"] == "simple":
        return _grouped_part(frame, keys, metric["measure"], index)
    numerator = _grouped_part(frame, keys, metric["numerator"], index)
    denominator = _grouped_part(frame, keys, metric["denominator"], index)
    values = numerator / denominator.where(denominator != 0)
    return values * 100 if metric.get("format") == "percent" else values


def metric_values(df, metrics):
    """{id: value} for the semantic panel; a metric that cannot be computed gives None."""
    values = {}
    for metric in metrics:
        try:
            values[metric["id"]] = evaluate_metric(df, metric)
        except Exception:
            values[metric["id"]] = None
    return values
```

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2 แล้วรัน `tests/test_dashboard_compute.py` ของแผน Create Dashboard ซ้ำ
Expected: PASS ทั้งหมด (ยังไม่มีการเปลี่ยนพฤติกรรมของวิดเจ็ต)

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_compute.py services/api/tests/test_dashboard_metrics.py
git commit -m "feat(api): evaluate semantic metrics with conditions, ratios and groups"
```

---

### Task 4: ร่าง semantic layer ด้วย Groq

**Files:**
- Create: `services/api/app/api/semantic_llm.py`
- Test: `services/api/tests/test_semantic_llm.py`

**Interfaces:**
- Consumes: `dashboard_llm.groq_settings()`, `dashboard_llm.call_groq(messages, key, model)`, `dashboard_llm.parse_json_object(text)`, `dashboard_llm.profile_for_prompt(profile)`, `dashboard_llm.LLMUnavailable` (แผน Create Dashboard Task 4); `SpecError` จาก `dashboard_spec.py`; `rule_draft`, `validate_semantic`, `metric_columns`, `SemanticError` และค่าคงที่ (Task 1)
- Produces:
  - `build_messages(table_name, profile) -> list[dict]`
  - `draft_semantic(table_name, profile, hidden=()) -> {"semantic": {"columns", "metrics"}, "warnings", "engine": "groq" | "rules", "model"}` ที่ `columns` ครบทุกคอลัมน์ของ profile

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_semantic_llm.py`:

```python
import json
import os
import sys

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
    assert "Total_Sales" in sent and "hint_role" in sent and "JSON" in sent


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_semantic_llm.py"`
Expected: FAIL ด้วย `ImportError: cannot import name 'semantic_llm'`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/api/app/api/semantic_llm.py`:

```python
"""Groq draft of a dataset's semantic layer (column meaning + metrics).

Same privacy rule as the dashboard prompt: column names, kinds and ranges only, never a
cell value, and never the name of a column that is currently hidden as personal data —
hidden columns keep their rule guess and stay flagged as personal."""
import json
import logging

from . import dashboard_llm
from .dashboard_spec import SpecError
from .semantic_layer import (DEFAULT_AGGS, DURATION_UNITS, METRIC_AGGS, METRIC_FORMATS, ROLES, UNITS, WHERE_OPS,
                             SemanticError, metric_columns, rule_draft, validate_semantic)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = f"""You are a data steward. Describe what each column of a dataset means for business dashboards.
Reply with ONE JSON object and nothing else, following this schema:
{{
  "columns": {{"<column name>": {{
    "role": one of {json.dumps(list(ROLES))},
    "label": short display name in Thai,
    "description": one sentence in Thai,
    "unit": one of {json.dumps(list(UNITS))} or null,
    "currency": ISO 4217 code or null,
    "duration_unit": one of {json.dumps(list(DURATION_UNITS))} or null,
    "default_agg": one of {json.dumps(list(DEFAULT_AGGS))} or null,
    "pii": boolean
  }}}},
  "metrics": [{{
    "id": snake_case string, "label": string, "description": string,
    "type": "simple" | "ratio",
    "measure": {{"agg": one of {json.dumps(list(METRIC_AGGS))}, "column": string or null,
                "where": null or {{"column": string, "op": one of {json.dumps(list(WHERE_OPS))}, "value": any}}}},
    "numerator": same shape as measure, "denominator": same shape as measure,
    "format": one of {json.dumps(list(METRIC_FORMATS))}, "currency": ISO 4217 code or null,
    "higher_is_better": boolean
  }}]
}}
Rules:
- Describe every column in the profile using its exact name; "hint_role" is a guess from the name you may correct.
- measure needs kind numeric; time needs kind date; identifier means codes and keys (never summed).
- unit applies to measures only; percent means values from 0 to 100.
- pii is true for data about a person: names, contacts, addresses, national ids, birth dates.
- Set currency only when the column name makes it clear; otherwise null.
- Propose 3 to 8 business metrics, including ratios where they make sense (margin, average order value, rates).
  Use count_distinct of an identifier for "number of orders" or "number of customers". Never use a pii column."""


def build_messages(table_name, profile):
    hints = rule_draft(profile)["columns"]
    columns = [{**c, "hint_role": hints[c["name"]]["role"]} for c in dashboard_llm.profile_for_prompt(profile)["columns"]]
    user = {"dataset": table_name, "rows": profile["rows"], "columns": columns}
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def _accept(content, profile):
    try:
        raw = dashboard_llm.parse_json_object(content)
    except SpecError as exc:
        raise SemanticError(str(exc)) from exc
    semantic, warnings = validate_semantic(raw, profile)
    if not semantic["columns"]:
        raise SemanticError("ไม่มีคอลัมน์ที่ใช้ได้")
    return semantic, warnings


def _ask(messages, profile):
    """(semantic, warnings, model). One retry that tells the LLM why it was rejected."""
    key, model = dashboard_llm.groq_settings()
    if not key:
        raise dashboard_llm.LLMUnavailable("ยังไม่ได้ตั้งค่า Groq API key")
    content = dashboard_llm.call_groq(messages, key, model)
    try:
        semantic, warnings = _accept(content, profile)
    except SemanticError as exc:
        retry = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": f"That answer was rejected: {exc}. Reply again with the corrected JSON object only."},
        ]
        semantic, warnings = _accept(dashboard_llm.call_groq(retry, key, model), profile)
    return semantic, warnings, model


def draft_semantic(table_name, profile, hidden=()):
    hidden = set(hidden)
    rules = rule_draft(profile)
    visible = {**profile, "columns": [c for c in profile["columns"] if c["name"] not in hidden]}
    try:
        drafted, warnings, model = _ask(build_messages(table_name, visible), visible)
        engine = "groq"
    except (dashboard_llm.LLMUnavailable, SemanticError) as exc:
        logger.warning("Semantic draft fell back to rules: %s", exc)
        drafted, warnings, model, engine = rules, [f"ใช้ร่างแบบกฎแทน AI: {exc}"], None, "rules"

    columns = {}
    for c in profile["columns"]:
        name = c["name"]
        meta = drafted["columns"].get(name) or rules["columns"][name]
        if name in hidden:
            meta = {**meta, "pii": True}
        elif rules["columns"][name]["pii"] and not meta["pii"]:
            meta = {**meta, "pii": True}
            warnings.append(f"{name}: ชื่อคอลัมน์บ่งว่าเป็นข้อมูลส่วนบุคคล จึงติดไว้ก่อน ให้คนตรวจอีกครั้ง")
        columns[name] = meta

    private = {n for n, m in columns.items() if m["pii"]}
    metrics = []
    for metric in drafted["metrics"]:
        if set(metric_columns(metric)) & private:
            warnings.append(f"ตัด metric '{metric['label']}': อ้างคอลัมน์ข้อมูลส่วนบุคคล")
        else:
            metrics.append(metric)
    return {"semantic": {"columns": columns, "metrics": metrics}, "warnings": warnings, "engine": engine, "model": model}
```

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2
Expected: PASS ทั้ง 5 test

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/semantic_llm.py services/api/tests/test_semantic_llm.py
git commit -m "feat(api): Groq draft of column meaning and metrics without personal data"
```

---

### Task 5: Router `/api/v1/semantic` และการเก็บใน Elasticsearch

**Files:**
- Create: `services/api/app/api/semantic.py`
- Modify: `services/api/main.py`, `services/api/tests/test_route_contract.py`
- Test: `services/api/tests/test_semantic_api.py`

**Interfaces:**
- Consumes: `resolve`, `validate_semantic` (Task 1–2); `semantic_llm.draft_semantic` (Task 4); `metric_values` (Task 3); `dashboard_data.load_active_dataset`; `require_session`; `get_es_client`
- Produces:
  - `SEMANTIC_INDEX = "sdoqap_semantic_layer"`
  - `encode_doc(doc) -> es_source` และ `decode_doc(es_source) -> doc` (ใน ES ส่วน `draft`/`approved` เก็บ `columns`/`metrics` เป็นสตริง `content_json`)
  - `read_doc(es, table_name) -> doc | None`
  - `load_view(table_name, profile, es_or_None) -> view` (Task 7 ใช้)
  - route ตาม spec หัวข้อ 9 ทุก view ที่ตอบมี `metric_values` เพิ่ม ส่วน `POST /draft` มี `engine`, `model` เพิ่ม

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_semantic_api.py`:

```python
import json
import os
import sys

import pandas as pd
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_llm, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

RAW = pd.DataFrame({"Order_ID": ["A", "B", "C"], "Customer_Name": ["x", "y", "z"], "Region": ["N", "S", "N"],
                    "Total_Sales": [10.0, 20.0, 30.0], "Profit": [1.0, 2.0, 3.0]})
DF, PROFILE = dashboard_data.prepare_frame(RAW.copy())
BASE = "/api/v1/semantic/sales"
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "usd", "default_agg": "sum", "pii": False}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent"}
BODY = {"columns": {"Total_Sales": USD}, "metrics": [GROSS]}


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    monkeypatch.setattr(semantic, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client(logged_in=True):
    app = FastAPI()
    app.include_router(semantic.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


def test_every_route_needs_a_login(es):
    c = client(logged_in=False)
    assert c.get(BASE).status_code == 401
    assert c.post(f"{BASE}/draft").status_code == 401
    assert c.put(f"{BASE}/draft", json=BODY).status_code == 401
    assert c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}).status_code == 401


def test_first_look_is_the_rule_guess_with_current_values(es):
    view = client().get(BASE).json()
    assert view["status"] == "none" and view["version"] == 0
    assert view["hidden_columns"] == ["Customer_Name"]
    assert view["effective"]["columns"]["Order_ID"]["role"] == "identifier"
    assert view["metric_values"] == {"row_count": 3, "total_total_sales": 60.0, "total_profit": 6.0}


def test_ai_draft_without_a_key_saves_the_rule_draft(es):
    view = client().post(f"{BASE}/draft").json()
    assert view["engine"] == "rules" and view["status"] == "draft"
    assert view["warnings"][0].startswith("ใช้ร่างแบบกฎแทน AI")
    stored = es.docs[semantic.SEMANTIC_INDEX]["sales"]["draft"]
    assert isinstance(stored["content_json"], str) and "columns" not in stored
    assert client().get(BASE).json()["status"] == "draft"


def test_ai_draft_with_groq(es, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", lambda messages, key, model: json.dumps(BODY, ensure_ascii=False))
    view = client().post(f"{BASE}/draft").json()
    assert view["engine"] == "groq" and view["model"] == "openai/gpt-oss-120b"
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert view["metric_values"]["gross_margin"] == 10.0
    assert view["hidden_columns"] == ["Customer_Name"]


def test_saving_edits_as_a_draft(es):
    body = {"columns": {"Profit": {"role": "measure", "unit": "dollars"}}, "metrics": []}
    view = client().put(f"{BASE}/draft", json=body).json()
    assert view["draft"]["generated_by"] == "user" and view["draft"]["updated_by"] == "tester"
    assert any("dollars" in w for w in view["warnings"])
    assert set(view["draft"]["columns"]) == {c["name"] for c in PROFILE["columns"]}


def test_approval_versions_clears_the_draft_and_refuses_a_stale_base(es):
    c = client()
    c.put(f"{BASE}/draft", json=BODY)
    first = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}).json()
    assert first["status"] == "approved" and first["version"] == 1 and first["draft"] is None
    assert first["approved"]["approved_by"] == "tester" and len(first["history"]) == 1
    assert set(first["approved"]["columns"]) == {c["name"] for c in PROFILE["columns"]}
    assert first["metric_values"]["gross_margin"] == 10.0
    stale = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    assert stale.status_code == 409 and "โหลดใหม่" in stale.json()["detail"]
    second = c.post(f"{BASE}/approve", json={**BODY, "base_version": 1}).json()
    assert second["version"] == 2 and len(second["history"]) == 2


def test_a_new_column_makes_the_approval_outdated(es, monkeypatch):
    client().post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    df, profile = dashboard_data.prepare_frame(RAW.assign(Coupon=["a", "b", "c"]))
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (df, profile))
    view = client().get(BASE).json()
    assert view["status"] == "approved_outdated" and view["drift"]["new_columns"] == ["Coupon"]


def test_without_elasticsearch_reading_still_hides_personal_columns_and_writing_is_refused(es, monkeypatch):
    def offline():
        raise HTTPException(status_code=503, detail="Elasticsearch service is offline")

    monkeypatch.setattr(semantic, "get_es_client", offline)
    view = client().get(BASE).json()
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]
    assert client().put(f"{BASE}/draft", json=BODY).status_code == 503


def test_unknown_dataset_is_404(es, monkeypatch):
    def missing(name):
        raise HTTPException(status_code=404, detail="Delta log not found")

    monkeypatch.setattr(dashboard_data, "load_active_dataset", missing)
    assert client().get(BASE).status_code == 404
```

เพิ่มใน `CALLS` ของ `services/api/tests/test_route_contract.py` ต่อจากบรรทัด `("DELETE", "/api/v1/dashboards/saved/D1", ...),`:

```python
    # DashboardBuilder.jsx via utils/semanticApi.js
    ("GET", "/api/v1/semantic/t1", "/api/v1/semantic/{table_name}"),
    ("POST", "/api/v1/semantic/t1/draft", "/api/v1/semantic/{table_name}/draft"),
    ("PUT", "/api/v1/semantic/t1/draft", "/api/v1/semantic/{table_name}/draft"),
    ("POST", "/api/v1/semantic/t1/approve", "/api/v1/semantic/{table_name}/approve"),
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_semantic_api.py tests/test_route_contract.py"`
Expected: FAIL (`cannot import name 'semantic'` และ 4 กรณีใหม่ใน route contract)

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/api/app/api/semantic.py`:

```python
"""Semantic layer API: column meaning and metric definitions per dataset, drafted by AI
(or by the name rules), edited and approved by a person. Stored in the ES index
sdoqap_semantic_layer, one document per dataset (id = dataset name)."""
import json
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import dashboard_data, semantic_llm
from .auth import require_session
from .config import get_es_client
from .dashboard_compute import metric_values
from .semantic_layer import resolve, validate_semantic

router = APIRouter(prefix="/api/v1/semantic", tags=["semantic"], dependencies=[Depends(require_session)])

SEMANTIC_INDEX = "sdoqap_semantic_layer"
MAX_HISTORY = 10


class SemanticPayload(BaseModel):
    columns: Dict[str, Any] = Field(default_factory=dict)
    metrics: List[Any] = Field(default_factory=list)


class ApprovePayload(SemanticPayload):
    base_version: int = Field(ge=0)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _encode_part(part):
    if not part:
        return None
    meta = {k: v for k, v in part.items() if k not in ("columns", "metrics")}
    # A string, not an object: column and metric fields would fight over one ES mapping.
    return {**meta, "content_json": json.dumps({"columns": part["columns"], "metrics": part["metrics"]}, ensure_ascii=False)}


def _decode_part(part):
    if not part:
        return None
    meta = {k: v for k, v in part.items() if k != "content_json"}
    return {**meta, **json.loads(part["content_json"])}


def encode_doc(doc):
    return {"table_name": doc["table_name"], "draft": _encode_part(doc.get("draft")),
            "approved": _encode_part(doc.get("approved")), "history": doc.get("history") or []}


def decode_doc(source):
    return {"table_name": source["table_name"], "draft": _decode_part(source.get("draft")),
            "approved": _decode_part(source.get("approved")), "history": source.get("history") or []}


def read_doc(es, table_name):
    if not es.indices.exists(index=SEMANTIC_INDEX):
        return None
    res = es.search(index=SEMANTIC_INDEX, query={"bool": {"filter": [{"term": {"table_name.keyword": table_name}}]}}, size=1)
    hits = res["hits"]["hits"]
    return decode_doc(hits[0]["_source"]) if hits else None


def _write(es, doc):
    es.index(index=SEMANTIC_INDEX, id=doc["table_name"], document=encode_doc(doc), refresh="wait_for")


def _es_or_none():
    try:
        return get_es_client()
    except HTTPException:
        return None


def load_view(table_name, profile, es):
    """The semantic view Create Dashboard uses. Without Elasticsearch it is the rule
    guess (status "unavailable"), which still hides columns whose names look personal."""
    if es is None:
        return resolve(table_name, None, profile, available=False)
    try:
        doc = read_doc(es, table_name)
    except Exception:
        return resolve(table_name, None, profile, available=False)
    return resolve(table_name, doc, profile)


def _empty(table_name):
    return {"table_name": table_name, "draft": None, "approved": None, "history": []}


def _complete(semantic, view, profile):
    """Columns the body left out keep their current meaning, so a stored version always
    covers every column of the dataset."""
    columns = {c["name"]: semantic["columns"].get(c["name"], view["effective"]["columns"][c["name"]])
               for c in profile["columns"]}
    return {"columns": columns, "metrics": semantic["metrics"]}


def _answer(table_name, doc, profile, df, warnings=()):
    view = resolve(table_name, doc, profile)
    view["metric_values"] = metric_values(df, view["effective"]["metrics"])
    view["warnings"] = list(warnings) + view["warnings"]
    return view


@router.get("/{table_name}")
def get_semantic(table_name: str):
    df, profile = dashboard_data.load_active_dataset(table_name)
    view = load_view(table_name, profile, _es_or_none())
    view["metric_values"] = metric_values(df, view["effective"]["metrics"])
    return view


@router.post("/{table_name}/draft")
def draft_semantic_with_ai(table_name: str, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    current = resolve(table_name, doc, profile)
    result = semantic_llm.draft_semantic(table_name, profile, current["hidden_columns"])
    doc["draft"] = {**result["semantic"], "generated_by": result["engine"], "model": result["model"],
                    "updated_by": user, "updated_at": _now()}
    _write(es, doc)
    view = _answer(table_name, doc, profile, df, result["warnings"])
    view.update(engine=result["engine"], model=result["model"])
    return view


@router.put("/{table_name}/draft")
def save_semantic_draft(table_name: str, payload: SemanticPayload, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    semantic_doc, warnings = validate_semantic(payload.model_dump(), profile)
    current = resolve(table_name, doc, profile)
    doc["draft"] = {**_complete(semantic_doc, current, profile), "generated_by": "user", "model": None,
                    "updated_by": user, "updated_at": _now()}
    _write(es, doc)
    return _answer(table_name, doc, profile, df, warnings)


@router.post("/{table_name}/approve")
def approve_semantic(table_name: str, payload: ApprovePayload, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    version = (doc.get("approved") or {}).get("version", 0)
    if payload.base_version != version:
        raise HTTPException(status_code=409, detail="มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่")
    semantic_doc, warnings = validate_semantic(payload.model_dump(exclude={"base_version"}), profile)
    current = resolve(table_name, doc, profile)
    now = _now()
    doc["approved"] = {**_complete(semantic_doc, current, profile), "version": version + 1,
                       "approved_by": user, "approved_at": now}
    doc["draft"] = None
    doc["history"] = ([{"version": version + 1, "approved_by": user, "approved_at": now}] + doc["history"])[:MAX_HISTORY]
    _write(es, doc)
    return _answer(table_name, doc, profile, df, warnings)
```

แก้ `services/api/main.py`: ต่อจาก `from app.api.dashboards import router as dashboards_router` เพิ่ม `from app.api.semantic import router as semantic_router` และต่อจาก `app.include_router(dashboards_router)` เพิ่ม `app.include_router(semantic_router)`

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/semantic.py services/api/main.py services/api/tests/test_semantic_api.py services/api/tests/test_route_contract.py
git commit -m "feat(api): /api/v1/semantic routes to draft, edit and approve column meaning"
```

---

### Task 6: สเปกแดชบอร์ดและการคำนวณใช้ semantic layer

**Files:**
- Modify: `services/api/app/api/dashboard_spec.py`
- Modify: `services/api/app/api/dashboard_compute.py`
- Test: `services/api/tests/test_dashboard_semantic_spec.py`

**Interfaces:**
- Consumes: `resolve`, `apply_to_profile` (Task 2); `evaluate_metric`, `grouped_metric` (Task 3)
- Produces:
  - `validate_spec(raw, profile, metrics=None)` ที่ profile อาจมี `role`/`label`/`unit`/`currency` ต่อคอลัมน์ โดยวิดเจ็ตที่มี metric ได้ฟิลด์ `format`, `currency`, `higher_is_better` และ `metric` อาจเป็น `{"metric_id": id}`
  - `compute_dashboard(df, spec, profile, selections=None, metrics=None)` ที่ผลลัพธ์มี `column_labels: {column: label}` เพิ่ม
- กติกา (spec หัวข้อ 11.1–11.2):
  - คอลัมน์ role `identifier` ใช้กับ sum/avg/min/max ไม่ได้ และใช้เป็น `x` หรือ `group_by` ไม่ได้
  - **format/currency:** ถ้าเป็น `metric_id` ใช้ของ metric ถ้าเป็น count/count_distinct ใช้ `number` ถ้าคอลัมน์มี role measure ใช้หน่วยของคอลัมน์ (currency → `currency` + รหัสสกุล, percent กับ agg ที่ไม่ใช่ sum → `percent`, อื่นๆ → `number`) ถ้าไม่มีข้อมูล semantic ใช้ค่าที่ LLM ส่งมา
  - **label:** ชื่อตัวกรองและชื่อวิดเจ็ตเริ่มต้นใช้ label ของคอลัมน์ ชื่อวิดเจ็ตของ `metric_id` ใช้ label ของ metric

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_dashboard_semantic_spec.py`:

```python
import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_compute import compute_dashboard  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import validate_spec  # noqa: E402
from app.api.semantic_layer import apply_to_profile, resolve  # noqa: E402

DF, RAW_PROFILE = prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Invoice_No": [11, 12, 13, 14], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.0, 50.0, 150.0], "Profit": [10.0, 50.0, 5.0, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]}))
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent", "higher_is_better": True}
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
VIEW = resolve("sales", {"approved": {"columns": {"Total_Sales": USD}, "metrics": [GROSS], "version": 1}}, RAW_PROFILE)
PROFILE = apply_to_profile(RAW_PROFILE, VIEW)
METRICS = VIEW["effective"]["metrics"]


def check(*widgets, filters=()):
    return validate_spec({"widgets": list(widgets), "filters": list(filters)}, PROFILE, METRICS)


def test_a_kpi_can_use_an_approved_metric_and_takes_its_presentation():
    spec, warnings = check({"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"}})
    (kpi,) = spec["widgets"]
    assert warnings == [] and kpi["metric"] == {"metric_id": "gross_margin"}
    assert (kpi["title"], kpi["format"], kpi["currency"], kpi["higher_is_better"]) == ("Gross Margin", "percent", None, True)
    assert compute_dashboard(DF, spec, PROFILE, metrics=METRICS)["widgets"]["k"]["value"] == pytest.approx(22.0)


def test_unknown_metric_ids_are_dropped():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "kpi", "title": "ไม่มี", "metric": {"metric_id": "nope"}})
    assert len(spec["widgets"]) == 1 and "nope" in " ".join(warnings)


def test_column_units_decide_the_number_format_not_the_llm():
    spec, _ = check({"type": "kpi", "metric": {"agg": "sum", "column": "Total_Sales"}, "format": "number"},
                    {"type": "kpi", "metric": {"agg": "count_distinct", "column": "Order_ID"}, "format": "currency"})
    money, orders = spec["widgets"]
    assert (money["format"], money["currency"]) == ("currency", "USD")
    assert money["title"] == "sum(ยอดขาย)"
    assert (orders["format"], orders["currency"]) == ("number", None)


def test_identifiers_are_never_summed_or_used_as_chart_axes():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "kpi", "title": "รวมเลขใบแจ้งหนี้", "metric": {"agg": "sum", "column": "Invoice_No"}},
                           {"type": "bar", "title": "ตามออเดอร์", "x": "Order_ID", "metric": {"agg": "count", "column": None}},
                           {"type": "bar", "title": "ตามภูมิภาค", "x": "Region", "group_by": "Order_ID",
                            "metric": {"agg": "count", "column": None}})
    assert [w["title"] for w in spec["widgets"]] == ["จำนวนแถว", "ตามภูมิภาค"]
    assert spec["widgets"][1]["group_by"] is None
    text = " ".join(warnings)
    assert "Invoice_No" in text and "Order_ID" in text


def test_hidden_personal_columns_cannot_be_used():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "bar", "title": "ตามชื่อ", "x": "Customer_Name", "metric": {"agg": "count", "column": None}},
                           {"type": "table"}, filters=[{"column": "Customer_Name"}])
    assert [w["type"] for w in spec["widgets"]] == ["kpi", "table"]
    assert "Customer_Name" not in spec["widgets"][1]["columns"] and spec["filters"] == []
    assert "Customer_Name" in " ".join(warnings)


def test_filters_are_labelled_with_the_column_label():
    spec, _ = check({"type": "kpi", "metric": {"agg": "count", "column": None}}, filters=[{"column": "Total_Sales"}])
    assert spec["filters"][0]["label"] == "ยอดขาย"


def test_grouped_metrics_are_computed_per_group_and_labels_come_back():
    spec, _ = check({"id": "b", "type": "bar", "x": "Region", "metric": {"metric_id": "gross_margin"}})
    result = compute_dashboard(DF, spec, PROFILE, metrics=METRICS)
    rows = result["widgets"]["b"]["rows"]
    assert [r["x"] for r in rows] == ["E", "S", "N"]
    assert [r["value"] for r in rows] == pytest.approx([30.0, 25.0, 10.0])
    assert result["column_labels"]["Total_Sales"] == "ยอดขาย" and "Customer_Name" not in result["column_labels"]


def test_validating_twice_with_semantics_changes_nothing():
    spec, _ = check({"type": "kpi", "metric": {"metric_id": "gross_margin"}},
                    {"type": "bar", "x": "Region", "metric": {"agg": "sum", "column": "Total_Sales"}},
                    filters=[{"column": "Region"}])
    again, warnings = validate_spec(spec, PROFILE, METRICS)
    assert again == spec and warnings == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboard_semantic_spec.py"`
Expected: FAIL ด้วย `TypeError: validate_spec() takes 2 positional arguments but 3 were given`

- [ ] **Step 3: Write minimal implementation**

แก้ `services/api/app/api/dashboard_spec.py` ตามลำดับ:

1. แทนฟังก์ชัน `_metric` ทั้งฟังก์ชันด้วย:

```python
def _metric(raw, kinds, columns, by_id):
    """(metric, problem). count takes no column; sum/avg/min/max need a numeric column that
    is not an identifier; {"metric_id"} must name a usable semantic-layer metric."""
    if not isinstance(raw, dict):
        return None, "ไม่มี metric"
    if "metric_id" in raw:
        if raw["metric_id"] not in by_id:
            return None, f"ไม่มี metric {raw['metric_id']}"
        return {"metric_id": raw["metric_id"]}, None
    agg, column = raw.get("agg"), raw.get("column")
    if agg not in AGGREGATIONS:
        return None, f"ไม่รองรับการคำนวณ {agg}"
    if agg == "count":
        return {"agg": "count", "column": None}, None
    if column not in kinds:
        return None, f"ไม่มีคอลัมน์ {column}"
    if agg in NUMERIC_AGGREGATIONS and kinds[column] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    if agg in NUMERIC_AGGREGATIONS and columns[column].get("role") == "identifier":
        return None, f"{agg} ใช้กับคอลัมน์รหัสไม่ได้ ({column})"
    return {"agg": agg, "column": column}, None


def _label(columns, name):
    return columns[name].get("label") or name


def _presentation(metric, raw, columns, by_id):
    """(format, currency, higher_is_better). The semantic layer decides; the LLM's format
    is used only when the semantic layer says nothing about the column."""
    if "metric_id" in metric:
        definition = by_id[metric["metric_id"]]
        return definition["format"], definition.get("currency"), definition.get("higher_is_better", True)
    if metric["agg"] in ("count", "count_distinct"):
        return "number", None, True
    meta = columns[metric["column"]]
    if meta.get("role") == "measure":
        if meta.get("unit") == "currency":
            return "currency", meta.get("currency"), True
        if meta.get("unit") == "percent" and metric["agg"] != "sum":
            return "percent", None, True
        return "number", None, True
    return (raw.get("format") if raw.get("format") in FORMATS else "number"), None, True
```

2. แทนฟังก์ชัน `_default_title` ทั้งฟังก์ชันด้วย:

```python
def _default_title(w, columns, by_id):
    if w["type"] == "table":
        return "ตารางข้อมูล"
    metric = w["metric"]
    if "metric_id" in metric:
        label = by_id[metric["metric_id"]]["label"]
    elif metric["agg"] == "count":
        label = "จำนวนแถว"
    else:
        label = f"{metric['agg']}({_label(columns, metric['column'])})"
    return f"{label} ตาม {_label(columns, w['x'])}" if w.get("x") else label
```

3. ใน `_widget`:
   - แทนบรรทัด `def _widget(raw, kinds, warnings):` ด้วย `def _widget(raw, kinds, warnings, columns, by_id):`
   - แทน

```python
        metric, problem = _metric(raw.get("metric"), kinds)
        if problem:
            return drop(problem)
        w["metric"] = metric
        w["format"] = raw.get("format") if raw.get("format") in FORMATS else "number"
```

   ด้วย

```python
        metric, problem = _metric(raw.get("metric"), kinds, columns, by_id)
        if problem:
            return drop(problem)
        w["metric"] = metric
        w["format"], w["currency"], w["higher_is_better"] = _presentation(metric, raw, columns, by_id)
```

   - แทน

```python
        if x not in kinds:
            return drop(f"ไม่มีคอลัมน์ {x}")
```

   ด้วย

```python
        if x not in kinds:
            return drop(f"ไม่มีคอลัมน์ {x}")
        if columns[x].get("role") == "identifier":
            return drop(f"ใช้คอลัมน์รหัส {x} เป็นแกนกราฟไม่ได้")
```

   - แทน `w["group_by"] = group if group in kinds and group != w["x"] else None` ด้วย

```python
        usable = group in kinds and group != w["x"] and columns[group].get("role") != "identifier"
        w["group_by"] = group if usable else None
```

   - แทน `w["title"] = _default_title(w)` ด้วย `w["title"] = _default_title(w, columns, by_id)`

4. ใน `_filters` แทน `def _filters(raw_filters, kinds, warnings):` ด้วย `def _filters(raw_filters, kinds, warnings, columns):` และแทน `"label": _text(raw.get("label"), 40) or column})` ด้วย `"label": _text(raw.get("label"), 40) or _label(columns, column)})`

5. ใน `validate_spec`:
   - แทน

```python
def validate_spec(raw, profile):
    """(spec, warnings). Raises SpecError when raw is not an object or no widget survives."""
    if not isinstance(raw, dict):
        raise SpecError("สเปกต้องเป็น JSON object")
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
```

   ด้วย

```python
def validate_spec(raw, profile, metrics=None):
    """(spec, warnings). Raises SpecError when raw is not an object or no widget survives.
    profile may carry semantic fields per column (semantic_layer.apply_to_profile) and
    metrics are the dataset's usable metric definitions."""
    if not isinstance(raw, dict):
        raise SpecError("สเปกต้องเป็น JSON object")
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    columns = {c["name"]: c for c in profile["columns"]}
    by_id = {m["id"]: m for m in metrics or []}
```

   - แทน `result = _widget(item, kinds, warnings)` ด้วย `result = _widget(item, kinds, warnings, columns, by_id)`
   - แทน `filters = _filters(raw.get("filters"), kinds, warnings)` ด้วย `filters = _filters(raw.get("filters"), kinds, warnings, columns)`

แก้ `services/api/app/api/dashboard_compute.py` ให้วิดเจ็ตใช้นิยาม metric (แทนทั้งฟังก์ชันตามชื่อ):

```python
def _pivot_rows(frame, keys, metric, group):
    """rows [{"x": key, <series>: value}] for the given x keys, and the series names."""
    if not group:
        totals = grouped_metric(frame, ["_x"], metric)
        return [{"x": k, "value": _value(totals.get(k))} for k in keys], ["value"]
    frame = frame.assign(_g=_labels(frame[group]))
    totals = grouped_metric(frame, ["_g"], metric)
    names = _top(totals, MAX_SERIES)
    if len(totals) > MAX_SERIES:
        frame = frame.assign(_g=frame["_g"].where(frame["_g"].isin(names), OTHER))
        names = names + [OTHER]
    cells = grouped_metric(frame, ["_x", "_g"], metric)
    return [{"x": k, **{s: _value(cells.get((k, s))) for s in names}} for k in keys], names


def _kpi(df, w):
    definition = w["_definition"]
    out = {"value": evaluate_metric(df, definition)}
    compare = w.get("compare")
    if compare:
        buckets = _bucket(df[compare["date_column"]], compare["time_grain"])
        periods = sorted(buckets.dropna().unique())
        if len(periods) >= 2:
            current = evaluate_metric(df[buckets == periods[-1]], definition)
            previous = evaluate_metric(df[buckets == periods[-2]], definition)
            change = round((current - previous) / abs(previous) * 100, 1) if previous and current is not None else None
            out.update(current=current, previous=previous, period=_day(periods[-1]), change_pct=change)
    return out


def _bar(df, w):
    frame = df.assign(_x=_labels(df[w["x"]]))
    totals = grouped_metric(frame, ["_x"], w["_definition"])
    if w["sort"] == "x":
        keys = sorted(totals.index)[: w["limit"]]
    else:
        keys = _top(totals, w["limit"], ascending=(w["sort"] == "asc"))
    rows, series = _pivot_rows(frame[frame["_x"].isin(keys)], keys, w["_definition"], w["group_by"])
    return {"rows": rows, "series": series}


def _pie(df, w):
    frame = df.assign(_x=_labels(df[w["x"]]))
    totals = grouped_metric(frame, ["_x"], w["_definition"])
    keys = _top(totals, w["limit"])
    if len(totals) > len(keys):
        frame = frame.assign(_x=frame["_x"].where(frame["_x"].isin(keys), OTHER))
        totals = grouped_metric(frame, ["_x"], w["_definition"])
        keys = keys + [OTHER]
    return {"rows": [{"x": k, "value": _value(totals.get(k))} for k in keys], "series": ["value"]}


def _time(df, w):
    x = w["x"]
    frame = df.assign(_t=_bucket(df[x], w["time_grain"]) if w["time_grain"] else df[x]).dropna(subset=["_t"])
    points = sorted(frame["_t"].unique())[-MAX_POINTS:]
    label = _day if w["time_grain"] else _value
    frame = frame[frame["_t"].isin(points)]
    frame = frame.assign(_x=frame["_t"].map(label))
    rows, series = _pivot_rows(frame, [label(t) for t in points], w["_definition"], w["group_by"])
    return {"rows": rows, "series": series}
```

ฟังก์ชันเหล่านี้อยู่ก่อน `evaluate_metric`/`grouped_metric` ในไฟล์ได้ เพราะ Python หาชื่อตอนเรียกใช้ ไม่ใช่ตอนประกาศ

แทนฟังก์ชัน `compute_dashboard` ทั้งฟังก์ชันด้วย:

```python
def _definition(metric, by_id, fmt):
    """The semantic-layer definition behind a widget metric ({"metric_id"} or {"agg", "column"})."""
    if "metric_id" in metric:
        return by_id[metric["metric_id"]]
    return {"type": "simple", "format": fmt, "measure": {"agg": metric["agg"], "column": metric["column"], "where": None}}


def compute_dashboard(df, spec, profile, selections=None, metrics=None):
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    by_id = {m["id"]: m for m in metrics or []}
    filtered = apply_filters(df, selections, kinds)
    widgets = {}
    for w in spec["widgets"]:
        try:
            item = dict(w)
            if "metric" in w:
                item["_definition"] = _definition(w["metric"], by_id, w.get("format", "number"))
            widgets[w["id"]] = _COMPUTE[w["type"]](filtered, item)
        except Exception as exc:  # one broken widget must not blank the whole dashboard
            widgets[w["id"]] = {"error": f"คำนวณวิดเจ็ตนี้ไม่ได้: {exc}"}
    return {"widgets": widgets, "filter_options": filter_options(df, spec),
            "rows_total": len(df), "rows_after_filter": len(filtered),
            "column_labels": {c["name"]: c.get("label") or c["name"] for c in profile["columns"]}}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests"`
Expected: PASS ทั้งหมด รวม test เดิมของแผน Create Dashboard ใน `test_dashboard_spec.py`, `test_dashboard_compute.py`, `test_dashboard_llm.py`, `test_dashboards_api.py` ซึ่งไม่มีข้อมูล semantic จึงต้องได้ผลเหมือนเดิม

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_spec.py services/api/app/api/dashboard_compute.py services/api/tests/test_dashboard_semantic_spec.py
git commit -m "feat(api): dashboard specs use approved metrics, column units, labels and identifiers"
```

---

### Task 7: route แดชบอร์ดและ AI ใช้ semantic layer (และซ่อนข้อมูลส่วนบุคคล)

**Files:**
- Modify: `services/api/app/api/dashboard_llm.py`
- Modify: `services/api/app/api/dashboards.py`
- Modify: `services/api/tests/test_dashboards_api.py` (fixture)
- Test: `services/api/tests/test_dashboards_semantic.py`

**Interfaces:**
- Consumes: `semantic.load_view`, `semantic.encode_doc`, `semantic.SEMANTIC_INDEX` (Task 5); `semantic_layer.apply_to_profile` (Task 2); `validate_spec(..., metrics)`, `compute_dashboard(..., metrics=)` (Task 6)
- Produces:
  - `dashboard_llm.generate_spec(table_name, profile, context, audience, metrics=None)`
  - `dashboard_llm.refine_spec(table_name, profile, spec, instruction, metrics=None)`
  - `dashboard_llm.fallback_spec(profile, context="", metrics=None)`
  - `dashboard_llm.build_generate_messages(..., metrics=None)` และ `build_refine_messages(..., metrics=None)`
  - `dashboards._dataset(table_name) -> (df, profile_with_semantics, metrics)` และ `dashboards._checked_spec(raw, profile, metrics=None) -> (spec, warnings)`
  - `POST /api/v1/dashboards/render` ตอบ `warnings` เพิ่ม

- [ ] **Step 1: Write the failing test**

แก้ `services/api/tests/test_dashboards_api.py` ใน fixture `dataset` (autouse) เพิ่มบรรทัดท้าย:

```python
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)
```

(ทำให้ test เดิมไม่ไปเรียก Elasticsearch จริงเมื่อ stack เปิดอยู่ เมื่อไม่มี ES ระบบใช้กฎชื่อคอลัมน์ ซึ่งไม่กระทบคอลัมน์ `order_date`, `region`, `amount` ของ test นั้น)

สร้าง `services/api/tests/test_dashboards_semantic.py`:

```python
import json
import os
import sys

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_llm, dashboards, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

DF, PROFILE = dashboard_data.prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.0, 50.0, 150.0], "Profit": [10.0, 50.0, 5.0, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]}))
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent", "higher_is_better": True}
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
KPI = {"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"}}
NAMES = {"id": "names", "type": "bar", "title": "ตามชื่อลูกค้า", "x": "Customer_Name", "metric": {"agg": "count", "column": None}}


def store(es, metrics):
    doc = {"table_name": "sales", "draft": None, "history": [],
           "approved": {"columns": {"Total_Sales": USD}, "metrics": metrics, "version": 1}}
    es.index(semantic.SEMANTIC_INDEX, "sales", semantic.encode_doc(doc))


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    store(fake, [GROSS])
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client():
    app = FastAPI()
    app.include_router(dashboards.router)
    return TestClient(app, cookies={SESSION_COOKIE_NAME: create_session_token("tester")})


def render(spec):
    return client().post("/api/v1/dashboards/render", json={"table_name": "sales", "spec": spec}).json()


def test_rule_dashboards_lead_with_approved_metrics_and_skip_personal_columns(es):
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": "sales", "context": "ภาพรวมยอดขาย", "audience": "management"}).json()
    first = body["spec"]["widgets"][0]
    assert first["metric"] == {"metric_id": "gross_margin"} and first["format"] == "percent"
    assert body["data"]["widgets"][first["id"]]["value"] == pytest.approx(22.0)
    assert "Customer_Name" not in json.dumps(body["spec"], ensure_ascii=False)


def test_the_llm_sees_metrics_and_labels_but_not_personal_columns(es, monkeypatch):
    sent = []

    def fake_groq(messages, key, model):
        sent.append(messages)
        return json.dumps({"title": "ยอดขาย", "widgets": [KPI]})

    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", fake_groq)
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": "sales", "context": "ภาพรวมยอดขาย", "audience": "business"}).json()
    user = sent[0][1]["content"]
    assert "Customer_Name" not in user and "Ann" not in user
    assert "gross_margin" in user and "ยอดขาย" in user and "identifier" in user
    assert "metric_id" in sent[0][0]["content"]
    assert body["engine"] == "groq" and body["data"]["widgets"]["k"]["value"] == pytest.approx(22.0)


def test_a_saved_widget_on_a_personal_column_is_dropped_with_a_note(es):
    body = render({"widgets": [KPI, NAMES]})
    assert [w["id"] for w in body["spec"]["widgets"]] == ["k"]
    assert any("Customer_Name" in w for w in body["warnings"])


def test_saved_dashboards_follow_the_current_metric_definition(es):
    assert render({"widgets": [KPI]})["data"]["widgets"]["k"]["value"] == pytest.approx(22.0)
    store(es, [dict(GROSS, denominator={"agg": "count", "column": None})])
    assert render({"widgets": [KPI]})["data"]["widgets"]["k"]["value"] == pytest.approx(2750.0)


def test_without_elasticsearch_personal_columns_stay_hidden(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)
    body = render({"widgets": [{"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}, NAMES]})
    assert [w["id"] for w in body["spec"]["widgets"]] == ["c"]


def test_money_columns_render_in_their_currency(es):
    body = render({"widgets": [{"id": "s", "type": "kpi", "metric": {"agg": "sum", "column": "Total_Sales"}}]})
    (kpi,) = body["spec"]["widgets"]
    assert (kpi["format"], kpi["currency"]) == ("currency", "USD")
    assert body["data"]["column_labels"]["Total_Sales"] == "ยอดขาย"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboards_semantic.py"`
Expected: FAIL (ยังเห็น `Customer_Name` และไม่มี `warnings` ใน render)

- [ ] **Step 3: Write minimal implementation**

แก้ `services/api/app/api/dashboard_llm.py`:

1. ใน `SYSTEM_PROMPT` แทนบรรทัด

```python
    "metric": {{"agg": one of {json.dumps(list(AGGREGATIONS))}, "column": string or null}},
```

ด้วย

```python
    "metric": {{"agg": one of {json.dumps(list(AGGREGATIONS))}, "column": string or null}} or {{"metric_id": string}},
```

และแทนบรรทัด

```python
- sum, avg, min and max need a numeric column; count takes "column": null.
```

ด้วย

```python
- sum, avg, min and max need a numeric column; count takes "column": null.
- When the user message lists "metrics", they are the dataset's approved definitions: use {{"metric_id": "<id>"}} for kpi cards and charts of that measure instead of rebuilding the formula.
- Columns with role "identifier" are codes: never sum, average or chart them on an axis; count_distinct them instead.
- Use the column "label", when given, in titles and filter labels.
```

2. แทนฟังก์ชัน `profile_for_prompt`, `build_generate_messages`, `build_refine_messages`, `_ask`, `fallback_spec`, `generate_spec`, `refine_spec` ทั้งหมดด้วย:

```python
AGG_WORDS = {"sum": "ผลรวม", "avg": "เฉลี่ย", "min": "ต่ำสุด", "max": "สูงสุด", "count_distinct": "จำนวนไม่ซ้ำ"}


def profile_for_prompt(profile):
    """The column profile without any cell value except numeric and date ranges, plus the
    column meaning when the profile carries it (semantic_layer.apply_to_profile)."""
    columns = []
    for c in profile["columns"]:
        item = {"name": c["name"], "kind": c["kind"], "distinct": c["distinct"], "missing_pct": c["missing_pct"]}
        if c["kind"] in ("numeric", "date"):
            item["min"], item["max"] = c.get("min"), c.get("max")
        for key in ("role", "label", "unit", "currency"):
            if c.get(key):
                item[key] = c[key]
        columns.append(item)
    return {"rows": profile["rows"], "columns": columns}


def _metrics_for_prompt(metrics):
    return [{k: m.get(k) for k in ("id", "label", "description", "format")} for m in metrics]


def build_generate_messages(table_name, profile, context, audience, metrics=None):
    user = {"dataset": table_name, "audience": audience, "request": context, "profile": profile_for_prompt(profile)}
    if metrics:
        user["metrics"] = _metrics_for_prompt(metrics)
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def build_refine_messages(table_name, profile, spec, instruction, metrics=None):
    user = {"dataset": table_name, "profile": profile_for_prompt(profile), "current_spec": spec,
            "instruction": instruction}
    if metrics:
        user["metrics"] = _metrics_for_prompt(metrics)
    return [{"role": "system", "content": SYSTEM_PROMPT + REFINE_RULES},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def _ask(messages, profile, metrics=None):
    """(spec, warnings, model). One retry that tells the LLM why its answer was rejected."""
    key, model = groq_settings()
    if not key:
        raise LLMUnavailable("ยังไม่ได้ตั้งค่า Groq API key")
    content = call_groq(messages, key, model)
    try:
        spec, warnings = validate_spec(parse_json_object(content), profile, metrics)
    except SpecError as exc:
        retry = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": f"That answer was rejected: {exc}. Reply again with the corrected JSON object only."},
        ]
        spec, warnings = validate_spec(parse_json_object(call_groq(retry, key, model)), profile, metrics)
    return spec, warnings, model


def fallback_spec(profile, context="", metrics=None):
    """A sensible dashboard from the column kinds and approved metrics alone, used when
    the LLM is unavailable. Identifier columns are never summed or used as an axis."""
    columns = profile["columns"]
    usable = [c for c in columns if c.get("role") != "identifier"]
    numeric = [c for c in usable if c["kind"] == "numeric"]
    dates = [c for c in usable if c["kind"] == "date"]
    categories = sorted((c for c in usable if c["kind"] == "categorical"), key=lambda c: c["distinct"])

    def label(c):
        return c.get("label") or c["name"]

    if numeric:
        main = {"agg": numeric[0].get("default_agg") or "sum", "column": numeric[0]["name"]}
    elif metrics:
        main = {"metric_id": metrics[0]["id"]}
    else:
        main = {"agg": "count", "column": None}
    widgets = [{"type": "kpi", "title": m["label"], "metric": {"metric_id": m["id"]}} for m in (metrics or [])[:4]]
    if not widgets:
        widgets.append({"type": "kpi", "title": "จำนวนแถว", "metric": {"agg": "count", "column": None}})
    for c in numeric[: max(0, 4 - len(widgets))]:
        agg = c.get("default_agg") or "sum"
        widgets.append({"type": "kpi", "title": f"{AGG_WORDS[agg]} {label(c)}", "metric": {"agg": agg, "column": c["name"]}})
    if dates:
        widgets.append({"type": "line", "title": f"แนวโน้มรายเดือนตาม {label(dates[0])}", "x": dates[0]["name"],
                        "time_grain": "month", "metric": main})
    if categories:
        widest = categories[-1]
        widgets.append({"type": "bar", "title": f"แยกตาม {label(widest)}", "x": widest["name"], "metric": main})
        if len(categories) > 1 and categories[0]["distinct"] <= 8:
            narrow = categories[0]
            widgets.append({"type": "donut", "title": f"สัดส่วนตาม {label(narrow)}", "x": narrow["name"], "metric": main})
    widgets.append({"type": "table", "title": "ตัวอย่างข้อมูล", "columns": [c["name"] for c in columns[:8]]})
    filters = [{"column": c["name"]} for c in categories[:2]] + [{"column": d["name"]} for d in dates[:1]]
    return {"title": "แดชบอร์ดภาพรวม", "description": context[:300], "widgets": widgets, "filters": filters}


def generate_spec(table_name, profile, context, audience, metrics=None):
    try:
        messages = build_generate_messages(table_name, profile, context, audience, metrics)
        spec, warnings, model = _ask(messages, profile, metrics)
        engine = "groq"
    except (LLMUnavailable, SpecError) as exc:
        logger.warning("Dashboard generation fell back to rules: %s", exc)
        spec, warnings = validate_spec(fallback_spec(profile, context, metrics), profile, metrics)
        warnings = [f"ใช้แดชบอร์ดอัตโนมัติแบบกฎแทน AI: {exc}"] + warnings
        engine, model = "rules", None
    spec["audience"] = audience
    return {"spec": spec, "warnings": warnings, "engine": engine, "model": model}


def refine_spec(table_name, profile, spec, instruction, metrics=None):
    """Raises LLMUnavailable or SpecError; there is no rule-based refinement."""
    messages = build_refine_messages(table_name, profile, spec, instruction, metrics)
    new_spec, warnings, model = _ask(messages, profile, metrics)
    return {"spec": new_spec, "warnings": warnings, "engine": "groq", "model": model,
            "changes": diff_specs(spec, new_spec)}
```

แก้ `services/api/app/api/dashboards.py`:

1. แทน `from . import dashboard_data, dashboard_llm` ด้วย `from . import dashboard_data, dashboard_llm, semantic, semantic_layer`

2. แทนฟังก์ชัน `_checked_spec` ด้วย:

```python
def _dataset(table_name):
    """(DataFrame, profile without hidden personal columns and with column meaning, usable metrics)."""
    df, profile = dashboard_data.load_active_dataset(table_name)
    view = semantic.load_view(table_name, profile, _es_or_none())
    return df, semantic_layer.apply_to_profile(profile, view), view["effective"]["metrics"]


def _checked_spec(raw, profile, metrics=None):
    """(spec, warnings), or 422 when nothing in the spec can be drawn."""
    try:
        return validate_spec(raw, profile, metrics)
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"สเปกแดชบอร์ดใช้ไม่ได้: {exc}")
```

3. แทน route `generate_dashboard`, `refine_dashboard`, `render_dashboard` ทั้งสามด้วย:

```python
@router.post("/generate")
def generate_dashboard(payload: GeneratePayload):
    audience = _audience(payload.audience)
    df, profile, metrics = _dataset(payload.table_name)
    result = dashboard_llm.generate_spec(payload.table_name, profile, payload.context.strip(), audience, metrics)
    result["data"] = compute_dashboard(df, result["spec"], profile, metrics=metrics)
    return result


@router.post("/refine")
def refine_dashboard(payload: RefinePayload):
    df, profile, metrics = _dataset(payload.table_name)
    current, _ = _checked_spec(payload.spec, profile, metrics)
    try:
        result = dashboard_llm.refine_spec(payload.table_name, profile, current, payload.instruction.strip(), metrics)
    except dashboard_llm.LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"ปรับด้วย AI ไม่ได้ตอนนี้: {exc}")
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"AI ตอบสเปกที่ใช้ไม่ได้: {exc}")
    result["data"] = compute_dashboard(df, result["spec"], profile, metrics=metrics)
    return result


@router.post("/render")
def render_dashboard(payload: RenderPayload):
    df, profile, metrics = _dataset(payload.table_name)
    spec, warnings = _checked_spec(payload.spec, profile, metrics)
    return {"spec": spec, "warnings": warnings,
            "data": compute_dashboard(df, spec, profile, payload.selections, metrics)}
```

4. ใน `_document` แทนสองบรรทัดแรก

```python
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
```

ด้วย

```python
    _, profile, metrics = _dataset(payload.table_name)
    spec, _ = _checked_spec(payload.spec, profile, metrics)
```

- [ ] **Step 4: Run test to verify it passes**

Run: API test ทั้งชุด `... python -m pytest -q -p no:cacheprovider tests`
Expected: PASS ทั้งหมด โดย test เดิมของแผน Create Dashboard ไม่มีข้อมูล semantic และใช้ ES จำลอง จึงได้ผลเหมือนเดิม ถ้า `test_dashboard_llm.py::test_the_rule_based_spec_uses_the_column_kinds` ล้ม ให้ตรวจว่า `fallback_spec` ยังให้ `[kpi, kpi, line, bar, table]` เมื่อไม่มี metric

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_llm.py services/api/app/api/dashboards.py services/api/tests/test_dashboards_api.py services/api/tests/test_dashboards_semantic.py
git commit -m "feat(api): dashboards use the semantic layer and never expose personal columns"
```

---

### Task 8: รูปแบบตัวเลขตามสกุลเงิน, สี KPI และ label บนแดชบอร์ด (UI)

**Files:**
- Modify: `services/ui/src/utils/numberFormat.js`, `services/ui/src/utils/numberFormat.test.js`
- Modify: `services/ui/src/components/builder/KpiCard.jsx`, `ChartWidget.jsx`, `TableWidget.jsx`, `DashboardCanvas.jsx`, `DashboardCanvas.test.jsx`
- Modify: `services/ui/src/test/dashboardFixtures.js`, `services/ui/src/pages/DashboardBuilder.css`

**Interfaces:**
- Consumes: วิดเจ็ตที่มี `format`, `currency`, `higher_is_better` และผลคำนวณที่มี `column_labels` (Task 6)
- Produces:
  - `formatValue(value, format = "number", currency = null)`
  - `TableWidget({ widget, data, labels = {} })`
  - class CSS `is-good` / `is-bad` บน `.dbb-kpi-change` (แทน `is-up` / `is-down`)
- **พฤติกรรมที่เปลี่ยนจากแผน Create Dashboard (spec หัวข้อ 11.5):** `currency` ที่ไม่มีรหัสสกุลไม่แสดง `฿` แล้ว test เดิมที่คาด `฿` จึงต้องแก้ใน Task นี้

- [ ] **Step 1: Write the failing test**

แก้ `services/ui/src/utils/numberFormat.test.js` แทน test `"formats currency and percent"` ด้วย:

```js
it("shows the symbol of the currency code", () => {
  expect(formatValue(625.33, "currency", "USD")).toBe("$625.33");
  expect(formatValue(1770000, "currency", "USD")).toBe("$1.77M");
  expect(formatValue(21900, "currency", "THB")).toBe("฿21.9K");
});

it("shows no currency symbol when the code is unknown", () => {
  expect(formatValue(21900, "currency")).toBe("21.9K");
  expect(formatValue(21900, "currency", "XX")).toBe("21.9K");
});

it("formats percent", () => {
  expect(formatValue(95.1, "percent")).toBe("95.1%");
});
```

แก้ `services/ui/src/test/dashboardFixtures.js`: ในวิดเจ็ต `w1` ของ `SPEC` แทน `format: "currency", layout:` ด้วย `format: "currency", currency: "USD", higher_is_better: true, layout:`

แก้ `services/ui/src/components/builder/DashboardCanvas.test.jsx`:
- แทน `"฿1.77M"` ทั้งสองที่ด้วย `"$1.77M"`
- แทน `expect(screen.getByText(/46\.2%/)).toHaveClass("is-down");` ด้วย `expect(screen.getByText(/46\.2%/)).toHaveClass("is-bad");`
- เพิ่มท้ายไฟล์:

```jsx
it("colours a drop as good when lower is better", () => {
  const spec = { ...SPEC, widgets: SPEC.widgets.map((w) => (w.id === "w1" ? { ...w, higher_is_better: false } : w)) };
  draw({ spec });
  expect(screen.getByText(/46\.2%/)).toHaveClass("is-good");
});

it("labels table columns with the names from the semantic layer", () => {
  draw({ data: { ...DATA, column_labels: { region: "ภูมิภาค", amount: "ยอดขาย" } } });
  const table = within(screen.getByRole("article", { name: "รายการล่าสุด" }));
  expect(table.getByRole("button", { name: "ยอดขาย" })).toBeInTheDocument();
  expect(table.queryByRole("button", { name: "amount" })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/utils/numberFormat.test.js src/components/builder/DashboardCanvas.test.jsx`
Expected: FAIL (`$625.33` ไม่ตรง, ไม่มี class `is-bad`, หัวตารางยังเป็น `amount`)

- [ ] **Step 3: Write minimal implementation**

เขียน `services/ui/src/utils/numberFormat.js` ใหม่ทั้งไฟล์:

```js
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function money(n, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: Math.abs(n) >= 10000 ? "compact" : "standard",
      maximumFractionDigits: 2
    }).format(n);
  } catch {
    return null; // not a currency code Intl knows: show the plain number
  }
}

// KPI and axis numbers: 1,234.57 below ten thousand, 12.2K / 1.77M above. Currency uses
// the symbol of its ISO code ($, ฿, €) and no symbol when the code is missing or unknown.
export function formatValue(value, format = "number", currency = null) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (format === "currency" && currency) {
    const text = money(n, currency);
    if (text) return text;
  }
  const text = Math.abs(n) >= 10000 ? compact.format(n) : plain.format(n);
  return format === "percent" ? `${text}%` : text;
}
```

เขียน `services/ui/src/components/builder/KpiCard.jsx` ใหม่ทั้งไฟล์:

```jsx
import React from "react";
import { formatValue } from "../../utils/numberFormat";

export default function KpiCard({ widget, data }) {
  const change = data?.change_pct;
  const good = widget.higher_is_better === false ? change <= 0 : change >= 0;
  return (
    <div className="dbb-kpi">
      <div className="dbb-kpi-value">{formatValue(data?.value, widget.format, widget.currency)}</div>
      {change != null && (
        <div className={`dbb-kpi-change ${good ? "is-good" : "is-bad"}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% ช่วงล่าสุดเทียบช่วงก่อน
        </div>
      )}
    </div>
  );
}
```

แก้ `services/ui/src/components/builder/ChartWidget.jsx`: แทน `const fmt = (v) => formatValue(v, widget.format);` ด้วย `const fmt = (v) => formatValue(v, widget.format, widget.currency);`

แก้ `services/ui/src/components/builder/TableWidget.jsx`:
- แทน `export default function TableWidget({ widget, data }) {` ด้วย `export default function TableWidget({ widget, data, labels = {} }) {`
- แทน `{c}{sort?.column === c ? (sort.desc ? " ↓" : " ↑") : ""}` ด้วย `{labels[c] || c}{sort?.column === c ? (sort.desc ? " ↓" : " ↑") : ""}`

แก้ `services/ui/src/components/builder/DashboardCanvas.jsx`:
- แทน

```jsx
function WidgetBody({ widget, data, onDrill }) {
  if (data?.error) return <p className="dbb-error-inline">{data.error}</p>;
  if (widget.type === "kpi") return <KpiCard widget={widget} data={data} />;
  if (widget.type === "table") return <TableWidget widget={widget} data={data} />;
```

ด้วย

```jsx
function WidgetBody({ widget, data, onDrill, labels }) {
  if (data?.error) return <p className="dbb-error-inline">{data.error}</p>;
  if (widget.type === "kpi") return <KpiCard widget={widget} data={data} />;
  if (widget.type === "table") return <TableWidget widget={widget} data={data} labels={labels} />;
```

- แทน `<WidgetBody widget={w} data={data?.widgets?.[w.id]} onDrill={drill} />` ด้วย `<WidgetBody widget={w} data={data?.widgets?.[w.id]} onDrill={drill} labels={data?.column_labels || {}} />`

แก้ `services/ui/src/pages/DashboardBuilder.css`: แทนสองบรรทัด

```css
.dbb-kpi-change.is-up { color: var(--dbb-up); }
.dbb-kpi-change.is-down { color: var(--dbb-down); }
```

ด้วย

```css
.dbb-kpi-change.is-good { color: var(--dbb-up); }
.dbb-kpi-change.is-bad { color: var(--dbb-down); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/utils/numberFormat.js services/ui/src/utils/numberFormat.test.js services/ui/src/components/builder/KpiCard.jsx services/ui/src/components/builder/ChartWidget.jsx services/ui/src/components/builder/TableWidget.jsx services/ui/src/components/builder/DashboardCanvas.jsx services/ui/src/components/builder/DashboardCanvas.test.jsx services/ui/src/test/dashboardFixtures.js services/ui/src/pages/DashboardBuilder.css
git commit -m "feat(ui): format dashboard numbers by currency code, colour KPIs by direction, label columns"
```

---

### Task 9: ตารางแก้ความหมายคอลัมน์และแถบสถานะ (UI)

**Files:**
- Create: `services/ui/src/utils/requestJson.js`, `services/ui/src/utils/requestJson.test.js`
- Modify: `services/ui/src/utils/dashboardsApi.js`
- Create: `services/ui/src/utils/semanticApi.js`
- Create: `services/ui/src/components/builder/semanticModel.js`, `semanticModel.test.js`
- Create: `services/ui/src/components/builder/SemanticStatus.jsx`, `ColumnMetaTable.jsx`, `SemanticEditor.jsx`, `SemanticEditor.test.jsx`
- Modify: `services/ui/src/test/dashboardFixtures.js`, `services/ui/src/pages/DashboardBuilder.css`

**Interfaces:**
- Consumes: route จาก Task 5; `friendlyApiError`; `KIND_LABELS` จาก `DatasetPicker.jsx`
- Produces:
  - `requestJson(url, { method, body }) -> Promise<json>` โดย error มี `.status`
  - `semanticApi.{get(table), draft(table), saveDraft(table, body), approve(table, body)}`
  - จาก `semanticModel.js`: `ROLE_LABELS`, `UNIT_LABELS`, `AGG_LABELS`, `DEFAULT_AGGS`, `DURATION_UNITS`, `CURRENCIES`, `roleOptions(kind)`, `updateColumn(meta, patch)`, `fromView(table, view)`, `differsFromApproved(name, meta, view)`, `statusText(view)`
  - `SemanticEditor({ table, profile, value, onChange })` โดย `value` = `{table, view, columns, metrics, dirty, conflict, warnings}` หรือ `null` (โหลดเองเมื่อ `value?.table !== table`)
  - `SEMANTIC_VIEW` และ `PROFILE` ใน `dashboardFixtures.js`

- [ ] **Step 1: Write the failing test**

เพิ่มท้าย `services/ui/src/test/dashboardFixtures.js`:

```js
// The profile of the "sales" preview used by the builder tests.
export const PROFILE = {
  rows: 6, column_count: 3, missing_cells: 1, kind_counts: { numeric: 1, categorical: 1, date: 1, text: 0 },
  columns: [
    { name: "order_date", kind: "date", dtype: "datetime64[ns]", missing: 0, missing_pct: 0, distinct: 6 },
    { name: "region", kind: "categorical", dtype: "string", missing: 1, missing_pct: 16.67, distinct: 3 },
    { name: "amount", kind: "numeric", dtype: "Float64", missing: 0, missing_pct: 0, distinct: 6 }
  ]
};

const meta = (role, extra = {}) => ({ role, label: "", description: "", unit: null, currency: null,
  duration_unit: null, default_agg: null, pii: false, ...extra });

// GET /api/v1/semantic/sales for PROFILE: a draft waiting for approval.
export const SEMANTIC_VIEW = {
  table_name: "sales", status: "draft", pending_draft: false, version: 0,
  effective: {
    columns: {
      order_date: meta("time"),
      region: meta("dimension", { label: "ภูมิภาค" }),
      amount: meta("measure", { label: "ยอดขาย", unit: "currency", default_agg: "sum" })
    },
    metrics: [
      // Labelled "จำนวนรายการ", not "จำนวนแถว", so it never collides with the preview's row-count tile.
      { id: "row_count", label: "จำนวนรายการ", description: "", type: "simple",
        measure: { agg: "count", column: null, where: null }, format: "number", currency: null, higher_is_better: true },
      { id: "avg_amount", label: "ยอดขายเฉลี่ย", description: "", type: "simple",
        measure: { agg: "avg", column: "amount", where: null }, format: "number", currency: null, higher_is_better: true }
    ]
  },
  draft: null, approved: null, drift: { new_columns: [], missing_columns: [] },
  invalid_metrics: [{ id: "aov", label: "Average Order Value", reason: "ไม่มีคอลัมน์ Order_ID" }],
  hidden_columns: [], history: [], warnings: [], metric_values: { row_count: 6, avg_amount: 83.3333 }
};
```

สร้าง `services/ui/src/utils/requestJson.test.js`:

```js
import { it, expect } from "vitest";
import { requestJson } from "./requestJson";
import { mockFetchByUrl } from "../test/renderPage";

it("keeps the HTTP status on the error", async () => {
  mockFetchByUrl([["/x", { status: 409, body: { detail: "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่" } }]]);
  const error = await requestJson("/api/v1/x").catch((e) => e);
  expect(error.status).toBe(409);
  expect(error.message).toBe("มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่");
});
```

สร้าง `services/ui/src/components/builder/semanticModel.test.js`:

```js
import { it, expect } from "vitest";
import { roleOptions, updateColumn, differsFromApproved, statusText } from "./semanticModel";
import { SEMANTIC_VIEW } from "../../test/dashboardFixtures";

it("offers only the roles a column kind allows", () => {
  expect(roleOptions("numeric")).toEqual(["measure", "dimension", "identifier", "text"]);
  expect(roleOptions("date")).toEqual(["dimension", "time", "identifier", "text"]);
  expect(roleOptions("text")).toEqual(["dimension", "identifier", "text"]);
});

it("keeps measure fields consistent when a column changes", () => {
  const amount = SEMANTIC_VIEW.effective.columns.amount;
  expect(updateColumn(amount, { role: "dimension" })).toMatchObject({ role: "dimension", unit: null, default_agg: null, currency: null });
  expect(updateColumn(amount, { currency: " usd " }).currency).toBe("USD");
  expect(updateColumn(amount, { unit: "duration" })).toMatchObject({ unit: "duration", duration_unit: "seconds", currency: null });
  expect(updateColumn(SEMANTIC_VIEW.effective.columns.region, { role: "measure" })).toMatchObject({ unit: "number", default_agg: "sum" });
});

it("spots columns that differ from the approved version", () => {
  const view = { ...SEMANTIC_VIEW, approved: { columns: { amount: { ...SEMANTIC_VIEW.effective.columns.amount, currency: "USD" } } } };
  expect(differsFromApproved("amount", SEMANTIC_VIEW.effective.columns.amount, view)).toBe(true);
  expect(differsFromApproved("region", SEMANTIC_VIEW.effective.columns.region, view)).toBe(false);
});

it("describes every status", () => {
  expect(statusText(SEMANTIC_VIEW)).toBe("ร่างแล้ว รออนุมัติ");
  expect(statusText({ ...SEMANTIC_VIEW, status: "approved", version: 3, pending_draft: true })).toBe("อนุมัติแล้ว v3 · มีร่างที่ยังไม่อนุมัติ");
  expect(statusText({ ...SEMANTIC_VIEW, status: "approved_outdated", version: 3,
    drift: { new_columns: ["a", "b"], missing_columns: ["c"] } })).toBe("อนุมัติแล้ว v3 แต่โครงสร้างเปลี่ยน: คอลัมน์ใหม่ 2 · คอลัมน์ที่หายไป 1");
  expect(statusText({ ...SEMANTIC_VIEW, status: "none" })).toBe("ยังไม่มีความหมายคอลัมน์ ระบบเดาให้จากชื่อคอลัมน์");
});
```

สร้าง `services/ui/src/components/builder/SemanticEditor.test.jsx`:

```jsx
import React, { useState } from "react";
import { it, expect } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import SemanticEditor from "./SemanticEditor";
import { mockFetchByUrl } from "../../test/renderPage";
import { PROFILE, SEMANTIC_VIEW } from "../../test/dashboardFixtures";

const APPROVED_VIEW = { ...SEMANTIC_VIEW, status: "approved", version: 1,
  approved: { columns: SEMANTIC_VIEW.effective.columns, metrics: SEMANTIC_VIEW.effective.metrics, version: 1 } };

function Harness() {
  const [value, setValue] = useState(null);
  return <SemanticEditor table="sales" profile={PROFILE} value={value} onChange={setValue} />;
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const callTo = (part, method) =>
  fetch.mock.calls.find(([url, options]) => String(url).includes(part) && (options?.method || "GET") === method);

async function show(routes) {
  mockFetchByUrl([...routes, ["/semantic/sales", { body: SEMANTIC_VIEW }]]);
  render(<Harness />);
  await settle();
}

it("loads the column meaning and shows its status", async () => {
  await show([]);
  expect(screen.getByRole("status")).toHaveTextContent("ร่างแล้ว รออนุมัติ");
  expect(screen.getByText("ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก")).toBeInTheDocument();
  expect(screen.getByLabelText("ชื่อที่แสดง amount")).toHaveValue("ยอดขาย");
  expect(screen.getByText("ระบุสกุลเงิน")).toBeInTheDocument();
  expect(screen.getByText("1 (16.67%)")).toBeInTheDocument();
});

it("offers roles by column kind", async () => {
  await show([]);
  const region = within(screen.getByLabelText("บทบาท region"));
  expect(region.queryByRole("option", { name: "ตัววัด" })).toBeNull();
  expect(within(screen.getByLabelText("บทบาท amount")).getByRole("option", { name: "ตัววัด" })).toBeInTheDocument();
});

it("saves edits as a draft", async () => {
  await show([["/semantic/sales/draft", { body: SEMANTIC_VIEW }]]);
  const save = screen.getByRole("button", { name: "บันทึกร่าง" });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("สกุลเงิน amount"), { target: { value: "usd" } });
  expect(screen.getByText("มีการแก้ไขที่ยังไม่บันทึก")).toBeInTheDocument();
  await act(async () => { fireEvent.click(save); });
  await settle();
  const body = JSON.parse(callTo("/semantic/sales/draft", "PUT")[1].body);
  expect(body.columns.amount.currency).toBe("USD");
  expect(body.metrics.map((m) => m.id)).toEqual(["row_count", "avg_amount"]);
  expect(screen.queryByText("มีการแก้ไขที่ยังไม่บันทึก")).toBeNull();
});

it("clears measure fields when a column stops being a measure", async () => {
  await show([]);
  fireEvent.change(screen.getByLabelText("บทบาท amount"), { target: { value: "dimension" } });
  expect(screen.queryByLabelText("หน่วย amount")).toBeNull();
  expect(screen.queryByLabelText("รวมแบบ amount")).toBeNull();
});

it("approves with the version the user started from", async () => {
  await show([["/semantic/sales/approve", { body: APPROVED_VIEW }]]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "อนุมัติ" })); });
  await settle();
  expect(JSON.parse(callTo("/semantic/sales/approve", "POST")[1].body).base_version).toBe(0);
  expect(screen.getByRole("status")).toHaveTextContent("อนุมัติแล้ว v1");
  expect(screen.queryByText(/ตัวเลขอาจแสดงหน่วยไม่ถูก/)).toBeNull();
});

it("asks to reload when someone approved a newer version", async () => {
  await show([["/semantic/sales/approve", { status: 409, body: { detail: "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่" } }]]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "อนุมัติ" })); });
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("กรุณาโหลดใหม่");
  const before = fetch.mock.calls.filter(([url, o]) => String(url).endsWith("/semantic/sales") && (o?.method || "GET") === "GET").length;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "โหลดใหม่" })); });
  await settle();
  const after = fetch.mock.calls.filter(([url, o]) => String(url).endsWith("/semantic/sales") && (o?.method || "GET") === "GET").length;
  expect(after).toBe(before + 1);
});

it("asks the AI for a draft", async () => {
  await show([["/semantic/sales/draft", { body: { ...SEMANTIC_VIEW, engine: "groq" } }]]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ให้ AI ร่าง" })); });
  await settle();
  expect(callTo("/semantic/sales/draft", "POST")).toBeTruthy();
});

it("disables changes when the semantic store is unavailable", async () => {
  mockFetchByUrl([["/semantic/sales", { body: { ...SEMANTIC_VIEW, status: "unavailable" } }]]);
  render(<Harness />);
  await settle();
  for (const name of ["ให้ AI ร่าง", "บันทึกร่าง", "อนุมัติ"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/utils/requestJson.test.js src/components/builder/semanticModel.test.js src/components/builder/SemanticEditor.test.jsx`
Expected: FAIL ด้วย `Failed to resolve import`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/ui/src/utils/requestJson.js`:

```js
import { friendlyApiError } from "./apiError";

// fetch + JSON for the app's API: sends the session cookie, goes to /login on 401 and
// throws an Error a user can read, keeping the HTTP status on error.status.
export async function requestJson(url, { method = "GET", body } = {}) {
  const options = { method, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (res.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "";
    const error = new Error(friendlyApiError(detail, `คำขอล้มเหลว (HTTP ${res.status})`));
    error.status = res.status;
    throw error;
  }
  return data;
}
```

เขียน `services/ui/src/utils/dashboardsApi.js` ใหม่ทั้งไฟล์ (พฤติกรรมเดิม ย้ายแค่ส่วน fetch ไปใช้ `requestJson`):

```js
import { requestJson } from "./requestJson";

const BASE = "/api/v1/dashboards";

const request = (path, options) => requestJson(`${BASE}${path}`, options);

export const dashboardsApi = {
  listDatasets: () => request("/datasets"),
  previewDataset: (table) => request(`/datasets/${encodeURIComponent(table)}/preview`),
  generate: (table_name, context, audience) => request("/generate", { method: "POST", body: { table_name, context, audience } }),
  refine: (table_name, spec, instruction) => request("/refine", { method: "POST", body: { table_name, spec, instruction } }),
  render: (table_name, spec, selections) => request("/render", { method: "POST", body: { table_name, spec, selections } }),
  listSaved: () => request("/saved"),
  getSaved: (id) => request(`/saved/${encodeURIComponent(id)}`),
  createSaved: (doc) => request("/saved", { method: "POST", body: doc }),
  updateSaved: (id, doc) => request(`/saved/${encodeURIComponent(id)}`, { method: "PUT", body: doc }),
  deleteSaved: (id) => request(`/saved/${encodeURIComponent(id)}`, { method: "DELETE" })
};
```

สร้าง `services/ui/src/utils/semanticApi.js`:

```js
import { requestJson } from "./requestJson";

const url = (table, suffix = "") => `/api/v1/semantic/${encodeURIComponent(table)}${suffix}`;

export const semanticApi = {
  get: (table) => requestJson(url(table)),
  draft: (table) => requestJson(url(table, "/draft"), { method: "POST" }),
  saveDraft: (table, body) => requestJson(url(table, "/draft"), { method: "PUT", body }),
  approve: (table, body) => requestJson(url(table, "/approve"), { method: "POST", body })
};
```

สร้าง `services/ui/src/components/builder/semanticModel.js`:

```js
// Choices and pure helpers for editing a dataset's semantic layer (column meaning + metrics).
export const ROLE_LABELS = { measure: "ตัววัด", dimension: "มิติ", time: "เวลา", identifier: "รหัส", text: "ข้อความ" };
export const UNIT_LABELS = { currency: "เงิน", percent: "เปอร์เซ็นต์", count: "จำนวนนับ", duration: "ระยะเวลา", number: "ตัวเลข" };
export const AGG_LABELS = { count: "นับแถว", count_distinct: "นับไม่ซ้ำ", sum: "ผลรวม", avg: "ค่าเฉลี่ย", min: "ต่ำสุด", max: "สูงสุด" };
export const DEFAULT_AGGS = ["sum", "avg", "min", "max", "count_distinct"];
export const DURATION_UNITS = ["seconds", "minutes", "hours", "days"];
export const CURRENCIES = ["THB", "USD", "EUR", "JPY", "CNY", "GBP", "SGD"];
const META_FIELDS = ["role", "label", "unit", "currency", "duration_unit", "default_agg", "pii"];

export function roleOptions(kind) {
  return Object.keys(ROLE_LABELS).filter((role) => (role !== "measure" || kind === "numeric") && (role !== "time" || kind === "date"));
}

// Applies an edit and keeps the measure-only fields consistent with the role and unit.
export function updateColumn(meta, patch) {
  const next = { ...meta, ...patch };
  if (next.role !== "measure") {
    return { ...next, unit: null, currency: null, duration_unit: null, default_agg: null };
  }
  next.unit = next.unit || "number";
  next.default_agg = next.default_agg || "sum";
  next.currency = next.unit === "currency" && typeof next.currency === "string" ? next.currency.trim().toUpperCase() || null : null;
  next.duration_unit = next.unit === "duration" ? next.duration_unit || "seconds" : null;
  return next;
}

export function fromView(table, view) {
  if (!view?.effective) throw new Error("โหลดความหมายคอลัมน์ไม่ได้");
  return { table, view, columns: view.effective.columns, metrics: view.effective.metrics,
    dirty: false, conflict: false, warnings: view.warnings || [] };
}

export function differsFromApproved(name, meta, view) {
  const approved = view.approved?.columns?.[name];
  if (!approved) return false;
  return META_FIELDS.some((field) => (approved[field] ?? null) !== (meta[field] ?? null));
}

export function statusText(view) {
  const text = {
    none: "ยังไม่มีความหมายคอลัมน์ ระบบเดาให้จากชื่อคอลัมน์",
    draft: "ร่างแล้ว รออนุมัติ",
    approved: `อนุมัติแล้ว v${view.version}`,
    approved_outdated: `อนุมัติแล้ว v${view.version} แต่โครงสร้างเปลี่ยน: คอลัมน์ใหม่ ${view.drift.new_columns.length} · คอลัมน์ที่หายไป ${view.drift.missing_columns.length}`,
    unavailable: "เชื่อมต่อที่เก็บความหมายคอลัมน์ไม่ได้ ใช้ค่าที่เดาจากชื่อคอลัมน์"
  }[view.status];
  return view.pending_draft ? `${text} · มีร่างที่ยังไม่อนุมัติ` : text;
}
```

สร้าง `services/ui/src/components/builder/SemanticStatus.jsx`:

```jsx
import React from "react";
import { statusText } from "./semanticModel";

export default function SemanticStatus({ view, dirty, busy, onDraft, onSaveDraft, onApprove }) {
  const offline = view.status === "unavailable";
  return (
    <div className={`dbb-semantic-status is-${view.status}`}>
      <div>
        <strong role="status">{statusText(view)}</strong>
        {view.status !== "approved" && <p className="dbb-muted">ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก</p>}
        {dirty && <p className="dbb-muted">มีการแก้ไขที่ยังไม่บันทึก</p>}
      </div>
      <div className="dbb-actions">
        <button type="button" onClick={onDraft} disabled={offline || Boolean(busy)}>
          {busy === "draft" ? "AI กำลังร่าง…" : "ให้ AI ร่าง"}
        </button>
        <button type="button" onClick={onSaveDraft} disabled={offline || !dirty || Boolean(busy)}>บันทึกร่าง</button>
        <button type="button" className="dbb-btn-primary" onClick={onApprove} disabled={offline || Boolean(busy)}>
          {busy === "approve" ? "กำลังอนุมัติ…" : "อนุมัติ"}
        </button>
      </div>
    </div>
  );
}
```

สร้าง `services/ui/src/components/builder/ColumnMetaTable.jsx`:

```jsx
import React from "react";
import { KIND_LABELS } from "./DatasetPicker";
import {
  AGG_LABELS, CURRENCIES, DEFAULT_AGGS, DURATION_UNITS, ROLE_LABELS, UNIT_LABELS,
  differsFromApproved, roleOptions, updateColumn
} from "./semanticModel";

function UnitDetail({ name, meta, set }) {
  if (meta.unit === "currency") {
    return (
      <>
        <input aria-label={`สกุลเงิน ${name}`} list="dbb-currencies" maxLength={3} value={meta.currency || ""}
          onChange={(e) => set({ currency: e.target.value })} />
        {!meta.currency && <div className="dbb-error-inline">ระบุสกุลเงิน</div>}
      </>
    );
  }
  if (meta.unit === "duration") {
    return (
      <select aria-label={`หน่วยเวลา ${name}`} value={meta.duration_unit} onChange={(e) => set({ duration_unit: e.target.value })}>
        {DURATION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    );
  }
  return "—";
}

export default function ColumnMetaTable({ profile, view, columns, onChange }) {
  const fresh = new Set(view.drift.new_columns);
  return (
    <div className="dbb-scroll">
      <table className="dbb-table dbb-meta-table">
        <thead>
          <tr>
            <th>คอลัมน์</th><th>ชนิด</th><th>บทบาท</th><th>ชื่อที่แสดง</th><th>หน่วย</th><th>สกุลเงิน / เวลา</th>
            <th>รวมแบบ</th><th>ข้อมูลส่วนบุคคล</th><th>ค่าว่าง</th><th>ค่าไม่ซ้ำ</th>
          </tr>
        </thead>
        <tbody>
          {profile.columns.map((c) => {
            const meta = columns[c.name];
            if (!meta) return null;
            const set = (patch) => onChange(c.name, updateColumn(meta, patch));
            const measure = meta.role === "measure";
            return (
              <tr key={c.name} className={differsFromApproved(c.name, meta, view) ? "is-changed" : ""}>
                <td><code>{c.name}</code>{fresh.has(c.name) && <span className="dbb-badge">ใหม่</span>}</td>
                <td>{KIND_LABELS[c.kind]}</td>
                <td>
                  <select aria-label={`บทบาท ${c.name}`} value={meta.role} onChange={(e) => set({ role: e.target.value })}>
                    {roleOptions(c.kind).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </td>
                <td>
                  <input aria-label={`ชื่อที่แสดง ${c.name}`} value={meta.label} placeholder={c.name} maxLength={60}
                    onChange={(e) => set({ label: e.target.value })} />
                </td>
                <td>
                  {measure ? (
                    <select aria-label={`หน่วย ${c.name}`} value={meta.unit} onChange={(e) => set({ unit: e.target.value })}>
                      {Object.entries(UNIT_LABELS).map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
                    </select>
                  ) : "—"}
                </td>
                <td>{measure ? <UnitDetail name={c.name} meta={meta} set={set} /> : "—"}</td>
                <td>
                  {measure ? (
                    <select aria-label={`รวมแบบ ${c.name}`} value={meta.default_agg} onChange={(e) => set({ default_agg: e.target.value })}>
                      {DEFAULT_AGGS.map((agg) => <option key={agg} value={agg}>{AGG_LABELS[agg]}</option>)}
                    </select>
                  ) : "—"}
                </td>
                <td>
                  <input type="checkbox" aria-label={`ข้อมูลส่วนบุคคล ${c.name}`} checked={meta.pii}
                    onChange={(e) => set({ pii: e.target.checked })} />
                </td>
                <td>{c.missing} ({c.missing_pct}%)</td>
                <td>{c.distinct}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="dbb-currencies">{CURRENCIES.map((code) => <option key={code} value={code} />)}</datalist>
    </div>
  );
}
```

สร้าง `services/ui/src/components/builder/SemanticEditor.jsx`:

```jsx
import React, { useCallback, useEffect, useState } from "react";
import { semanticApi } from "../../utils/semanticApi";
import { fromView } from "./semanticModel";
import SemanticStatus from "./SemanticStatus";
import ColumnMetaTable from "./ColumnMetaTable";

export default function SemanticEditor({ table, profile, value, onChange }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const ready = value?.table === table;

  const load = useCallback(async () => {
    setError("");
    try {
      onChange(fromView(table, await semanticApi.get(table)));
    } catch (e) {
      setError(e.message);
    }
  }, [table, onChange]);

  useEffect(() => {
    if (!ready) load();
  }, [ready, load]);

  if (!ready) {
    return error ? <p role="alert" className="dbb-error">{error}</p> : <p className="dbb-muted">กำลังโหลดความหมายคอลัมน์…</p>;
  }

  const perform = (kind, call) => async () => {
    setBusy(kind);
    setError("");
    try {
      onChange(fromView(table, await call()));
    } catch (e) {
      if (e.status === 409) onChange({ ...value, conflict: true });
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const body = { columns: value.columns, metrics: value.metrics };
  const setColumn = (name, meta) => onChange({ ...value, columns: { ...value.columns, [name]: meta }, dirty: true });

  return (
    <div className="dbb-semantic">
      <SemanticStatus
        view={value.view}
        dirty={value.dirty}
        busy={busy}
        onDraft={perform("draft", () => semanticApi.draft(table))}
        onSaveDraft={perform("save", () => semanticApi.saveDraft(table, body))}
        onApprove={perform("approve", () => semanticApi.approve(table, { ...body, base_version: value.view.version }))}
      />
      {error && (
        <p role="alert" className="dbb-error">
          {error}
          {value.conflict && <button type="button" onClick={load}>โหลดใหม่</button>}
        </p>
      )}
      {value.warnings.length > 0 && (
        <details>
          <summary>หมายเหตุ {value.warnings.length} รายการ</summary>
          <ul>{value.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
      <h3>ความหมายคอลัมน์</h3>
      <ColumnMetaTable profile={profile} view={value.view} columns={value.columns} onChange={setColumn} />
    </div>
  );
}
```

เพิ่มท้าย `services/ui/src/pages/DashboardBuilder.css`:

```css
.dbb-semantic { display: flex; flex-direction: column; gap: 10px; }
.dbb-semantic-status { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--dbb-border); border-radius: 6px; background: #f8fafc; }
.dbb-semantic-status.is-approved { border-color: #abefc6; background: #ecfdf3; }
.dbb-semantic-status.is-approved_outdated, .dbb-semantic-status.is-unavailable { border-color: #fedf89; background: #fffaeb; }
.dbb-badge { margin-left: 6px; padding: 1px 6px; border-radius: 999px; background: var(--dbb-primary-soft); color: var(--dbb-primary); font-size: 11px; font-weight: 600; }
.dbb-meta-table select, .dbb-meta-table input:not([type="checkbox"]) { max-width: 150px; padding: 4px 6px; border: 1px solid var(--dbb-border); border-radius: 4px; font: inherit; font-size: 12px; }
.dbb-meta-table tr.is-changed { background: #fffaeb; }
.dbb-metrics ul { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.dbb-metrics li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid var(--dbb-border); border-radius: 6px; font-size: 13px; }
.dbb-metrics li.is-invalid { border-color: #fecdca; background: #fef3f2; color: var(--dbb-down); }
.dbb-metric-value { font-variant-numeric: tabular-nums; font-weight: 600; }
.dbb-metric-form { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 8px 12px; padding: 12px; border: 1px solid var(--dbb-border); border-radius: 6px; font-size: 13px; }
.dbb-metric-form .dbb-metric-part, .dbb-metric-form .dbb-actions, .dbb-metric-form > .dbb-check { grid-column: 1 / -1; }
.dbb-metric-part { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 8px; border: 1px dashed var(--dbb-border); border-radius: 6px; }
.dbb-metric-form input, .dbb-metric-form select { padding: 4px 6px; border: 1px solid var(--dbb-border); border-radius: 4px; font: inherit; font-size: 13px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npx vitest run src/utils src/components/builder`
Expected: PASS ทั้งหมด รวม `dashboardsApi.test.js` เดิมที่ตอนนี้วิ่งผ่าน `requestJson`

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/utils/requestJson.js services/ui/src/utils/requestJson.test.js services/ui/src/utils/dashboardsApi.js services/ui/src/utils/semanticApi.js services/ui/src/components/builder/semanticModel.js services/ui/src/components/builder/semanticModel.test.js services/ui/src/components/builder/SemanticStatus.jsx services/ui/src/components/builder/ColumnMetaTable.jsx services/ui/src/components/builder/SemanticEditor.jsx services/ui/src/components/builder/SemanticEditor.test.jsx services/ui/src/test/dashboardFixtures.js services/ui/src/pages/DashboardBuilder.css
git commit -m "feat(ui): edit and approve column meaning with status and conflict handling"
```

---

### Task 10: แผง Metric (UI)

**Files:**
- Modify: `services/ui/src/components/builder/semanticModel.js`, `semanticModel.test.js`
- Create: `services/ui/src/components/builder/MetricPanel.jsx`, `MetricPanel.test.jsx`
- Modify: `services/ui/src/components/builder/SemanticEditor.jsx`

**Interfaces:**
- Consumes: `formatValue` (Task 8); `AGG_LABELS`, `CURRENCIES` (Task 9); view ที่มี `effective.metrics`, `metric_values`, `invalid_metrics`, `hidden_columns`
- Produces:
  - `describeMetric(metric, labelOf)`, `emptyMetric()`, `toMetricBody(form, profile)`, `columnsFor(agg, profile, columns, hidden)`, `metricValueText(metric, view)` ใน `semanticModel.js`
  - `MetricPanel({ profile, columns, metrics, view, onChange(metrics) })` และ `MetricForm` (export ชื่อเดียวกัน)

- [ ] **Step 1: Write the failing test**

แก้ `services/ui/src/components/builder/semanticModel.test.js`: ในบรรทัด import ด้านบน ให้ import `describeMetric, toMetricBody, columnsFor, metricValueText, emptyMetric` จาก `./semanticModel` และ import `PROFILE` จาก `../../test/dashboardFixtures` เพิ่ม (รวมกับ import เดิมที่มี `SEMANTIC_VIEW`) แล้วเพิ่มท้ายไฟล์:

```js
const labelOf = (name) => ({ amount: "ยอดขาย", region: "ภูมิภาค" }[name] || name);

it("reads a metric formula in plain words", () => {
  const margin = { type: "ratio", numerator: { agg: "sum", column: "amount", where: { column: "region", op: "in", value: ["N", "S"] } },
    denominator: { agg: "count", column: null, where: null } };
  expect(describeMetric(margin, labelOf)).toBe("sum(ยอดขาย) เมื่อ ภูมิภาค อยู่ใน N, S ÷ count(*)");
});

it("turns the form into the body the API validates", () => {
  const form = { ...emptyMetric(), label: " ยอดเหนือ ", type: "simple",
    measure: { agg: "count", column: "amount", where: { column: "amount", op: "gt", value: "50" } } };
  expect(toMetricBody(form, PROFILE)).toEqual({ label: "ยอดเหนือ", description: "", type: "simple", format: "number",
    currency: null, higher_is_better: true, measure: { agg: "count", column: null, where: { column: "amount", op: "gt", value: 50 } } });
  const listed = { ...form, measure: { agg: "count", column: null, where: { column: "region", op: "in", value: "N, S ," } } };
  expect(toMetricBody(listed, PROFILE).measure.where.value).toEqual(["N", "S"]);
});

it("offers numeric non-identifier visible columns for sums", () => {
  const columns = { amount: { role: "measure" }, region: { role: "dimension" }, order_date: { role: "time" } };
  expect(columnsFor("sum", PROFILE, columns, [])).toEqual(["amount"]);
  expect(columnsFor("count_distinct", PROFILE, columns, ["region"])).toEqual(["order_date", "amount"]);
});

it("shows a current value only for metrics unchanged since the server computed them", () => {
  const [, avg] = SEMANTIC_VIEW.effective.metrics;
  expect(metricValueText(avg, SEMANTIC_VIEW)).toBe("ค่าปัจจุบัน 83.33");
  expect(metricValueText({ ...avg, label: "ใหม่" }, SEMANTIC_VIEW)).toBe("บันทึกร่างเพื่อดูค่า");
});
```

สร้าง `services/ui/src/components/builder/MetricPanel.test.jsx`:

```jsx
import React from "react";
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import MetricPanel from "./MetricPanel";
import { PROFILE, SEMANTIC_VIEW } from "../../test/dashboardFixtures";

function draw(props = {}) {
  const onChange = vi.fn();
  render(<MetricPanel profile={PROFILE} columns={SEMANTIC_VIEW.effective.columns} metrics={SEMANTIC_VIEW.effective.metrics}
    view={SEMANTIC_VIEW} onChange={onChange} {...props} />);
  return onChange;
}

it("lists metrics with their formula and current value, and the ones that broke", () => {
  draw();
  expect(screen.getByText("จำนวนรายการ")).toBeInTheDocument();
  expect(screen.getByText("count(*)")).toBeInTheDocument();
  expect(screen.getByText("ค่าปัจจุบัน 6")).toBeInTheDocument();
  expect(screen.getByText("avg(ยอดขาย)")).toBeInTheDocument();
  expect(screen.getByText(/Average Order Value: ไม่มีคอลัมน์ Order_ID/)).toBeInTheDocument();
});

it("adds a ratio metric", () => {
  const onChange = draw();
  fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม metric" }));
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดต่อแถว" } });
  fireEvent.change(screen.getByLabelText("ชนิด"), { target: { value: "ratio" } });
  fireEvent.change(screen.getByLabelText("ตัวตั้ง: คอลัมน์"), { target: { value: "amount" } });
  fireEvent.change(screen.getByLabelText("ตัวหาร: การคำนวณ"), { target: { value: "count" } });
  fireEvent.change(screen.getByLabelText("รูปแบบ"), { target: { value: "currency" } });
  fireEvent.change(screen.getByLabelText("สกุลเงิน"), { target: { value: "usd" } });
  fireEvent.click(screen.getByRole("button", { name: "ใช้ metric นี้" }));
  const added = onChange.mock.calls[0][0].at(-1);
  expect(added).toEqual({ label: "ยอดต่อแถว", description: "", type: "ratio", format: "currency", currency: "USD",
    higher_is_better: true, numerator: { agg: "sum", column: "amount", where: null },
    denominator: { agg: "count", column: null, where: null } });
});

it("needs a name and a column before a metric can be used", () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม metric" }));
  const use = screen.getByRole("button", { name: "ใช้ metric นี้" });
  expect(use).toBeDisabled();
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "รวม" } });
  expect(use).toBeDisabled();
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "amount" } });
  expect(use).toBeEnabled();
  expect(within(screen.getByLabelText("ค่า: คอลัมน์")).getAllByRole("option").map((o) => o.value)).toEqual(["", "amount"]);
});

it("edits and deletes metrics", () => {
  const onChange = draw();
  fireEvent.click(screen.getByRole("button", { name: "แก้ ยอดขายเฉลี่ย" }));
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดเฉลี่ย" } });
  fireEvent.click(screen.getByRole("button", { name: "ใช้ metric นี้" }));
  expect(onChange.mock.calls[0][0][1]).toMatchObject({ id: "avg_amount", label: "ยอดเฉลี่ย" });
  fireEvent.click(screen.getByRole("button", { name: "ลบ จำนวนรายการ" }));
  expect(onChange.mock.calls[1][0].map((m) => m.id)).toEqual(["avg_amount"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/components/builder/semanticModel.test.js src/components/builder/MetricPanel.test.jsx`
Expected: FAIL (`describeMetric` ยังไม่มี และ `./MetricPanel` ยังไม่มี)

- [ ] **Step 3: Write minimal implementation**

เพิ่มท้าย `services/ui/src/components/builder/semanticModel.js`:

```js
import { formatValue } from "../../utils/numberFormat";

export const METRIC_AGGS = ["count", "count_distinct", "sum", "avg", "min", "max"];
export const NUMERIC_AGGS = ["sum", "avg", "min", "max"];
export const WHERE_OPS = { eq: "=", ne: "≠", in: "อยู่ใน", gt: ">", gte: "≥", lt: "<", lte: "≤" };
export const FORMAT_LABELS = { number: "ตัวเลข", currency: "เงิน", percent: "เปอร์เซ็นต์" };

function describePart(part, labelOf) {
  const base = part.agg === "count" ? "count(*)" : `${part.agg}(${labelOf(part.column)})`;
  if (!part.where) return base;
  const value = Array.isArray(part.where.value) ? part.where.value.join(", ") : String(part.where.value);
  return `${base} เมื่อ ${labelOf(part.where.column)} ${WHERE_OPS[part.where.op]} ${value}`;
}

export function describeMetric(metric, labelOf = (name) => name) {
  return metric.type === "ratio"
    ? `${describePart(metric.numerator, labelOf)} ÷ ${describePart(metric.denominator, labelOf)}`
    : describePart(metric.measure, labelOf);
}

export function emptyMetric() {
  const part = () => ({ agg: "sum", column: "", where: null });
  return { id: "", label: "", description: "", type: "simple", measure: part(), numerator: part(), denominator: part(),
    format: "number", currency: null, higher_is_better: true };
}

function parseValue(where, kind) {
  const number = (v) => (kind === "numeric" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v);
  if (where.op === "in") return String(where.value).split(",").map((v) => v.trim()).filter(Boolean).map(number);
  return typeof where.value === "string" ? number(where.value.trim()) : where.value;
}

// The metric as the API expects it (semantic_layer.clean_metric); ids are left to the server for new metrics.
export function toMetricBody(form, profile) {
  const kindOf = (name) => profile.columns.find((c) => c.name === name)?.kind;
  const part = (p) => ({
    agg: p.agg,
    column: p.agg === "count" ? null : p.column,
    where: p.where ? { column: p.where.column, op: p.where.op, value: parseValue(p.where, kindOf(p.where.column)) } : null
  });
  const body = { label: form.label.trim(), description: (form.description || "").trim(), type: form.type, format: form.format,
    currency: form.format === "currency" ? form.currency || null : null, higher_is_better: form.higher_is_better };
  if (form.id) body.id = form.id;
  if (form.type === "simple") body.measure = part(form.measure);
  else {
    body.numerator = part(form.numerator);
    body.denominator = part(form.denominator);
  }
  return body;
}

export function columnsFor(agg, profile, columns, hidden) {
  return profile.columns
    .filter((c) => !hidden.includes(c.name))
    .filter((c) => !NUMERIC_AGGS.includes(agg) || (c.kind === "numeric" && columns[c.name]?.role !== "identifier"))
    .map((c) => c.name);
}

export function metricValueText(metric, view) {
  const original = view.effective.metrics.find((m) => m.id === metric.id);
  if (!original || JSON.stringify(original) !== JSON.stringify(metric)) return "บันทึกร่างเพื่อดูค่า";
  return `ค่าปัจจุบัน ${formatValue(view.metric_values[metric.id], metric.format, metric.currency)}`;
}
```

(ย้าย `import { formatValue } ...` ไปไว้บนสุดของไฟล์ เพราะ import ต้องอยู่ส่วนหัวของโมดูล)

สร้าง `services/ui/src/components/builder/MetricPanel.jsx`:

```jsx
import React, { useState } from "react";
import {
  AGG_LABELS, FORMAT_LABELS, METRIC_AGGS, WHERE_OPS,
  columnsFor, describeMetric, emptyMetric, metricValueText, toMetricBody
} from "./semanticModel";

const partReady = (part) => part.agg === "count" || Boolean(part.column);

function PartFields({ title, part, onChange, profile, columns, hidden }) {
  const options = columnsFor(part.agg, profile, columns, hidden);
  const where = part.where;
  const whereColumns = columnsFor("count", profile, columns, hidden);
  return (
    <fieldset className="dbb-metric-part">
      <legend>{title}</legend>
      <select aria-label={`${title}: การคำนวณ`} value={part.agg}
        onChange={(e) => onChange({ ...part, agg: e.target.value, column: e.target.value === "count" ? null : part.column })}>
        {METRIC_AGGS.map((agg) => <option key={agg} value={agg}>{AGG_LABELS[agg]}</option>)}
      </select>
      {part.agg !== "count" && (
        <select aria-label={`${title}: คอลัมน์`} value={part.column || ""} onChange={(e) => onChange({ ...part, column: e.target.value })}>
          <option value="">เลือกคอลัมน์</option>
          {options.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      )}
      <label>
        <input type="checkbox" aria-label={`${title}: มีเงื่อนไข`} checked={Boolean(where)}
          onChange={(e) => onChange({ ...part, where: e.target.checked ? { column: whereColumns[0] || "", op: "eq", value: "" } : null })} />
        มีเงื่อนไข
      </label>
      {where && (
        <>
          <select aria-label={`${title}: คอลัมน์เงื่อนไข`} value={where.column} onChange={(e) => onChange({ ...part, where: { ...where, column: e.target.value } })}>
            {whereColumns.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select aria-label={`${title}: ตัวดำเนินการ`} value={where.op} onChange={(e) => onChange({ ...part, where: { ...where, op: e.target.value } })}>
            {Object.entries(WHERE_OPS).map(([op, text]) => <option key={op} value={op}>{text}</option>)}
          </select>
          <input aria-label={`${title}: ค่า`} value={Array.isArray(where.value) ? where.value.join(", ") : String(where.value ?? "")}
            onChange={(e) => onChange({ ...part, where: { ...where, value: e.target.value } })} />
        </>
      )}
    </fieldset>
  );
}

export function MetricForm({ initial, profile, columns, hidden, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({ ...emptyMetric(), ...initial }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const parts = { profile, columns, hidden };
  const ready = form.label.trim().length > 0 &&
    (form.type === "simple" ? partReady(form.measure) : partReady(form.numerator) && partReady(form.denominator));
  const submit = (e) => {
    e.preventDefault();
    if (ready) onSave(toMetricBody(form, profile));
  };

  return (
    <form className="dbb-metric-form" onSubmit={submit}>
      <label htmlFor="dbb-metric-label">ชื่อ metric</label>
      <input id="dbb-metric-label" maxLength={60} value={form.label} onChange={(e) => set({ label: e.target.value })} />
      <label htmlFor="dbb-metric-description">คำอธิบาย</label>
      <input id="dbb-metric-description" maxLength={300} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      <label htmlFor="dbb-metric-type">ชนิด</label>
      <select id="dbb-metric-type" value={form.type} onChange={(e) => set({ type: e.target.value })}>
        <option value="simple">ค่าเดี่ยว</option>
        <option value="ratio">อัตราส่วน</option>
      </select>
      {form.type === "simple" ? (
        <PartFields title="ค่า" part={form.measure} onChange={(measure) => set({ measure })} {...parts} />
      ) : (
        <>
          <PartFields title="ตัวตั้ง" part={form.numerator} onChange={(numerator) => set({ numerator })} {...parts} />
          <PartFields title="ตัวหาร" part={form.denominator} onChange={(denominator) => set({ denominator })} {...parts} />
        </>
      )}
      <label htmlFor="dbb-metric-format">รูปแบบ</label>
      <select id="dbb-metric-format" value={form.format} onChange={(e) => set({ format: e.target.value })}>
        {Object.entries(FORMAT_LABELS).map(([format, label]) => <option key={format} value={format}>{label}</option>)}
      </select>
      {form.format === "currency" && (
        <>
          <label htmlFor="dbb-metric-currency">สกุลเงิน</label>
          <input id="dbb-metric-currency" list="dbb-currencies" maxLength={3} value={form.currency || ""}
            onChange={(e) => set({ currency: e.target.value.trim().toUpperCase() || null })} />
        </>
      )}
      <label className="dbb-check">
        <input type="checkbox" checked={form.higher_is_better} onChange={(e) => set({ higher_is_better: e.target.checked })} />
        ยิ่งสูงยิ่งดี
      </label>
      <div className="dbb-actions">
        <button type="button" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="dbb-btn-primary" disabled={!ready}>ใช้ metric นี้</button>
      </div>
    </form>
  );
}

export default function MetricPanel({ profile, columns, metrics, view, onChange }) {
  const [editing, setEditing] = useState(null); // index of the metric being edited, or "new"
  const hidden = view.hidden_columns;
  const labelOf = (name) => columns[name]?.label || name;
  const save = (metric) => {
    onChange(editing === "new" ? [...metrics, metric] : metrics.map((m, i) => (i === editing ? metric : m)));
    setEditing(null);
  };

  return (
    <section className="dbb-metrics" aria-label="Metric">
      <div className="dbb-toolbar">
        <h3>Metric</h3>
        <button type="button" onClick={() => setEditing("new")} disabled={editing !== null}>+ เพิ่ม metric</button>
      </div>
      <ul>
        {metrics.map((m, i) => (
          <li key={m.id || `new-${i}`}>
            <div>
              <strong>{m.label}</strong>{" "}
              <span className="dbb-muted">{describeMetric(m, labelOf)}</span>
            </div>
            <span className="dbb-metric-value">{metricValueText(m, view)}</span>
            <div className="dbb-actions">
              <button type="button" aria-label={`แก้ ${m.label}`} onClick={() => setEditing(i)} disabled={editing !== null}>แก้</button>
              <button type="button" aria-label={`ลบ ${m.label}`} onClick={() => onChange(metrics.filter((_, j) => j !== i))}>ลบ</button>
            </div>
          </li>
        ))}
        {view.invalid_metrics.map((m) => (
          <li key={`invalid-${m.id}`} className="is-invalid">✖ {m.label || m.id}: {m.reason} (จะถูกนำออกเมื่อบันทึก)</li>
        ))}
      </ul>
      {editing !== null && (
        <MetricForm initial={editing === "new" ? {} : metrics[editing]} profile={profile} columns={columns} hidden={hidden}
          onSave={save} onCancel={() => setEditing(null)} />
      )}
    </section>
  );
}
```

หมายเหตุ test `"lists metrics..."`: ค่า "จำนวนรายการ" และ "count(*)" อยู่คนละ element (`<strong>` กับ `<span>`) จึงหาแยกได้

แก้ `services/ui/src/components/builder/SemanticEditor.jsx`:
1. ต่อจาก `import ColumnMetaTable from "./ColumnMetaTable";` เพิ่ม `import MetricPanel from "./MetricPanel";`
2. ต่อจาก `<ColumnMetaTable ... />` เพิ่ม

```jsx
      <MetricPanel profile={profile} columns={value.columns} metrics={value.metrics} view={value.view}
        onChange={(metrics) => onChange({ ...value, metrics, dirty: true })} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npx vitest run src/components/builder`
Expected: PASS ทั้งหมด (รวม `SemanticEditor.test.jsx` ที่ตอนนี้มีแผง metric ด้วย)

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/components/builder/semanticModel.js services/ui/src/components/builder/semanticModel.test.js services/ui/src/components/builder/MetricPanel.jsx services/ui/src/components/builder/MetricPanel.test.jsx services/ui/src/components/builder/SemanticEditor.jsx
git commit -m "feat(ui): metric panel to add, edit and remove metric definitions with current values"
```

---

### Task 11: ใส่ semantic layer ในขั้น "ดูข้อมูล" ของ Create Dashboard

**Files:**
- Modify: `services/ui/src/components/builder/DataPreview.jsx` (เขียนใหม่ทั้งไฟล์)
- Modify: `services/ui/src/pages/DashboardBuilder.jsx`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx`

**Interfaces:**
- Consumes: `SemanticEditor` (Task 9–10); `SEMANTIC_VIEW` (Task 9); `render` ที่ตอบ `warnings` (Task 7); `notice`, `setNotice`, `openSaved` ใน `DashboardBuilder.jsx` (แผน Create Dashboard Task 11)
- Produces: `DataPreview({ table, renderColumns, hiddenColumns = [] })` และ state `semantic` ใน `DashboardBuilder`

- [ ] **Step 1: Write the failing test**

แก้ `services/ui/src/pages/DashboardBuilder.test.jsx`:
1. แทน `import { SPEC, DATA } from "../test/dashboardFixtures";` ด้วย `import { SPEC, DATA, SEMANTIC_VIEW } from "../test/dashboardFixtures";`
2. ใน `builderRoutes` ต่อจากบรรทัด `["/dashboards/render", ...]` เพิ่ม `["/semantic/sales", { body: SEMANTIC_VIEW }]` (ขั้นดูข้อมูลตอนนี้โหลดความหมายคอลัมน์ด้วย และ "1 (16.67%)" แสดงในตารางความหมายคอลัมน์แทนตารางโครงสร้างเดิม)
3. เพิ่มท้ายไฟล์:

```jsx
it("lets the user check column meaning before asking for a dashboard", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(screen.getByRole("status")).toHaveTextContent("ร่างแล้ว รออนุมัติ");
  fireEvent.change(screen.getByLabelText("ชื่อที่แสดง region"), { target: { value: "ภาค" } });
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  expect(screen.getByText("มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก")).toBeInTheDocument();
  expect(screen.getByLabelText(/อยากวิเคราะห์อะไรจาก/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /ดูข้อมูล/ }));
  await settle();
  expect(screen.getByLabelText("ชื่อที่แสดง region")).toHaveValue("ภาค");
});

it("marks personal columns in the sample", async () => {
  const view = { ...SEMANTIC_VIEW, hidden_columns: ["region"] };
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes([["/semantic/sales", { body: view }]]));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(screen.getByText("ส่วนบุคคล")).toBeInTheDocument();
});

it("explains widgets dropped when a saved dashboard is opened", async () => {
  const note = "ตัดวิดเจ็ต 'ตามชื่อลูกค้า': ไม่มีคอลัมน์ Customer_Name";
  await renderPage(DashboardBuilder, "/dashboard-builder", [
    [`/dashboards/saved/${ID}`, { body: SAVED_DOC }],
    ["/dashboards/saved", { body: { dashboards: [SUMMARY] } }],
    ["/dashboards/datasets", { body: DATASETS }],
    ["/dashboards/render", { body: { spec: SPEC, data: DATA, warnings: [note] } }]
  ]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "เปิด ยอดขายผู้บริหาร" })); });
  await settle();
  expect(screen.getByText(note)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx`
Expected: FAIL ทั้ง 3 test ใหม่ ส่วน test เดิมยังผ่าน

- [ ] **Step 3: Write minimal implementation**

เขียน `services/ui/src/components/builder/DataPreview.jsx` ใหม่ทั้งไฟล์:

```jsx
import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { KIND_LABELS } from "./DatasetPicker";

function StructureTable({ profile }) {
  return (
    <>
      <h3>โครงสร้างคอลัมน์</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr><th>คอลัมน์</th><th>ประเภท</th><th>dtype</th><th>ค่าว่าง</th><th>ค่าไม่ซ้ำ</th></tr>
          </thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td><span className={`dbb-kind dbb-kind-${c.kind}`}>{KIND_LABELS[c.kind]}</span></td>
                <td><code>{c.dtype}</code></td>
                <td>{c.missing} ({c.missing_pct}%)</td>
                <td>{c.distinct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// renderColumns(profile) replaces the read-only structure table (the semantic editor uses it).
export default function DataPreview({ table, renderColumns, hiddenColumns = [] }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setError("");
    dashboardsApi.previewDataset(table)
      .then((p) => { if (alive) setPreview(p); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [table]);

  if (error) return <p role="alert" className="dbb-error">{error}</p>;
  if (!preview) return <p className="dbb-muted">กำลังโหลดตัวอย่างข้อมูล…</p>;
  const { profile, sample } = preview;
  const hidden = new Set(hiddenColumns);
  const stats = [
    ["จำนวนแถว", profile.rows.toLocaleString("en-US")],
    ["จำนวนคอลัมน์", profile.column_count],
    ["ค่าว่าง", profile.missing_cells.toLocaleString("en-US")],
    ...Object.entries(KIND_LABELS).map(([kind, label]) => [`คอลัมน์${label}`, profile.kind_counts[kind] ?? 0])
  ];

  return (
    <div className="dbb-preview">
      <dl className="dbb-stats">
        {stats.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {renderColumns ? renderColumns(profile) : <StructureTable profile={profile} />}
      <h3>ตัวอย่าง {sample.length} แถวแรก</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr>
              {profile.columns.map((c) => (
                <th key={c.name}>{c.name}{hidden.has(c.name) && <span className="dbb-badge">ส่วนบุคคล</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.map((row, i) => (
              <tr key={i}>
                {profile.columns.map((c) => (
                  <td key={c.name}>{row[c.name] == null ? <span className="dbb-null">null</span> : String(row[c.name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

แก้ `services/ui/src/pages/DashboardBuilder.jsx`:

1. ต่อจาก `import SavedDashboards from "../components/builder/SavedDashboards";` เพิ่ม

```jsx
import SemanticEditor from "../components/builder/SemanticEditor";
```

2. ต่อจาก `const [notice, setNotice] = useState("");` เพิ่ม

```jsx
  const [semantic, setSemantic] = useState(null);
```

3. ในฟังก์ชัน `chooseDataset` แทน

```jsx
      setDraft(null);
      setSelections({});
      setSaved(null);
    }
```

ด้วย

```jsx
      setDraft(null);
      setSelections({});
      setSaved(null);
      setSemantic(null);
    }
```

4. ในฟังก์ชัน `openSaved` แทน `warnings: [], savedName: doc.name });` ด้วย `warnings: rendered.warnings || [], savedName: doc.name });`

5. แทนส่วน `step === 1` ทั้งก้อน

```jsx
      {step === 1 && dataset && (
        <section className="dbb-panel" aria-label={STEPS[1]}>
          <DataPreview table={dataset.name} />
          <div className="dbb-actions">
            <button type="button" onClick={() => setStep(0)}>ย้อนกลับ</button>
            <button type="button" className="dbb-btn-primary" onClick={() => setStep(2)}>ถัดไป</button>
          </div>
        </section>
      )}
```

ด้วย

```jsx
      {step === 1 && dataset && (
        <section className="dbb-panel" aria-label={STEPS[1]}>
          <DataPreview
            table={dataset.name}
            hiddenColumns={semantic?.table === dataset.name ? semantic.view.hidden_columns : []}
            renderColumns={(profile) => (
              <SemanticEditor table={dataset.name} profile={profile} value={semantic} onChange={setSemantic} />
            )}
          />
          <div className="dbb-actions">
            <button type="button" onClick={() => setStep(0)}>ย้อนกลับ</button>
            <button
              type="button"
              className="dbb-btn-primary"
              onClick={() => {
                setNotice(semantic?.dirty ? "มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก" : "");
                setStep(2);
              }}
            >
              ถัดไป
            </button>
          </div>
        </section>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/components/builder/DataPreview.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(ui): review column meaning and metrics in the Create Dashboard preview step"
```

---

### Task 12: ทดสอบกับระบบจริงและเขียนเอกสาร

Task นี้ไม่มี test อัตโนมัติใหม่ ถ้าขั้นใดไม่ผ่าน ให้หยุดและรายงานพร้อม log

**Files:**
- Modify: `README.md`

- [ ] **Step 1: รัน test ทั้งหมด**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests"
```

```bash
cd services/ui && npm test
```

Expected: ผ่านทั้งหมด

- [ ] **Step 2: build และเปิด stack**

```bash
docker compose up -d --build api ui nginx
```

Expected: `curl -s -o /dev/null -w "%{http_code}" http://localhost/api/v1/semantic/global_ecommerce_sales` ได้ `401`

- [ ] **Step 3: เดิน flow ใน browser pane** (ให้ผู้ใช้ login เอง และใส่คีย์ Groq เองถ้ายังไม่มี ตามแผน Create Dashboard Task 13 Step 3)

เปิด `http://localhost/dashboard-builder` แล้วทำและตรวจตามลำดับ:

1. เลือก `global_ecommerce_sales` แล้วกด "ถัดไป"
   - แถบสถานะต้องเป็น "ยังไม่มีความหมายคอลัมน์ ระบบเดาให้จากชื่อคอลัมน์"
   - `Customer_Name` ต้องติด "ส่วนบุคคล" ส่วน `Product_Name` ต้องไม่ติด
   - `Order_ID` ต้องเป็น "รหัส"
   - `Total_Sales`, `Unit_Price`, `Profit`, `Shipping_Cost` ต้องเป็น "เงิน" และขึ้น "ระบุสกุลเงิน"
   - `Discount_Percent` ต้องเป็น "เปอร์เซ็นต์"
2. กด "ให้ AI ร่าง"
   - แถบสถานะต้องเป็น "ร่างแล้ว รออนุมัติ"
   - หมายเหตุต้องไม่ขึ้น "ใช้ร่างแบบกฎแทน AI" (ถ้าขึ้น ให้ตรวจคีย์ Groq และ `docker compose logs api --since 10m | grep -E "Groq returned|fell back"`)
3. ตั้งสกุลเงินของคอลัมน์เงินทั้งหมดเป็น `USD`
4. เพิ่ม metric "Gross Profit Margin" = ผลรวม Profit ÷ ผลรวม Total_Sales (เปอร์เซ็นต์)
5. เพิ่ม metric "Average Order Value" = ผลรวม Total_Sales ÷ นับไม่ซ้ำ Order_ID (เงิน USD)
6. กด "บันทึกร่าง" ค่าปัจจุบันของทั้งสอง metric ต้องขึ้นและดูสมเหตุสมผล (margin อยู่ระหว่าง 0–100%, AOV ใกล้ค่าเฉลี่ยของ Total_Sales ต่อออเดอร์)
7. กด "อนุมัติ" แถบสถานะต้องเป็น "อนุมัติแล้ว v1" และคำเตือนเรื่องหน่วยต้องหายไป
8. ไปขั้นระบุความต้องการ พิมพ์ "สร้าง Dashboard สำหรับผู้บริหาร ดูยอดขาย กำไร และมูลค่าเฉลี่ยต่อออเดอร์" เลือก Management แล้วสร้าง
9. แดชบอร์ดต้องมี:
   - การ์ดที่แสดง `$…` และการ์ด `…%`
   - หัวตาราง ชื่อตัวกรอง และชื่อแกนใช้ชื่อที่แสดงภาษาไทย
   - ไม่มี `Customer_Name` ในวิดเจ็ต ตัวกรอง หรือตาราง
10. กลับไปขั้นดูข้อมูล แก้ label ของ `Region` แล้วกด "ถัดไป" โดยไม่บันทึก ต้องขึ้น "มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก"
11. ถ่าย screenshot ขั้นดูข้อมูลและแดชบอร์ดให้ผู้ใช้ดูในแชต (ไม่ commit รูป)

- [ ] **Step 4: เพิ่มเอกสารใน README**

ใน `README.md` ต่อท้ายหัวข้อ `### Create Dashboard (AI)` (จากแผน Create Dashboard Task 13) เพิ่ม:

```markdown
#### ความหมายคอลัมน์และ Metric (Semantic Layer)

ในขั้น "ดูข้อมูล" ของ Create Dashboard ผู้ใช้กำหนดความหมายของแต่ละคอลัมน์ได้ (บทบาท ชื่อที่แสดง หน่วย สกุลเงิน การรวม และข้อมูลส่วนบุคคล) พร้อมนิยาม metric กลาง เช่น Gross Profit Margin = ผลรวม Profit ÷ ผลรวม Total_Sales

- ระบบเดาจากชื่อคอลัมน์ให้ก่อน, กด "ให้ AI ร่าง" ให้ Groq ร่าง แล้วคนแก้และกด "อนุมัติ" (เก็บเวอร์ชันใน Elasticsearch index `sdoqap_semantic_layer`)
- แดชบอร์ดใช้หน่วยตามที่อนุมัติ ($, ฿, %) และใช้ metric ที่อนุมัติเป็น KPI เมื่อแก้นิยาม metric แดชบอร์ดที่บันทึกไว้จะใช้สูตรใหม่ตอนเปิดครั้งถัดไป
- คอลัมน์ข้อมูลส่วนบุคคลไม่ถูกส่งชื่อให้ LLM และไม่แสดงบนแดชบอร์ด คอลัมน์ที่ชื่อบ่งว่าเป็นข้อมูลส่วนบุคคลถูกซ่อนไว้ก่อน จนกว่าคนจะอนุมัติว่าไม่ใช่
- API: `/api/v1/semantic/{table}` (GET, `POST /draft`, `PUT /draft`, `POST /approve`, ต้อง login)
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: semantic layer section in README"
```

---

## Self-Review (ผู้เขียนแผนตรวจแล้ว)

**ครอบคลุม spec:**

| หัวข้อ spec | Task |
|---|---|
| 4.1 metadata ของคอลัมน์ | 1 |
| 4.2 metric | 1, 3 |
| 4.3 เอกสาร ES และ `content_json` | 5 |
| 5 ร่างแบบกฎ | 1 |
| 6 ร่าง AI และกฎ pii ชนะ | 4 |
| 7 ตัวตรวจ | 1 |
| 8 resolve (status, drift, invalid, hidden, pending) | 2 |
| 9 API (409, 503, 404) | 5 |
| 10 โมดูล | 1–5 |
| 11.1 `metric_id`, identifier, รูปแบบ | 6 |
| 11.2 การคำนวณและ `column_labels` | 6 |
| 11.3 prompt และ fallback | 7 |
| 11.4 ซ่อน pii ทุกเส้นรวม saved และ ES ล่ม | 7 |
| 11.5 รูปแบบ UI และสี KPI | 8 |
| 12 หน้าจอ (สถานะ, ตาราง, metric, แก้ค้าง, 409, ป้ายส่วนบุคคล) | 9–11 |
| 13 error handling | 4, 5, 7, 9 |
| 14 การทดสอบ | ทุก Task + 12 |

**ชื่อที่ใช้ข้าม Task ตรงกัน:**
- ฝั่ง API: `rule_draft`, `clean_column`, `clean_metric`, `metric_columns`, `validate_semantic`, `resolve`, `apply_to_profile`, `evaluate_metric`, `grouped_metric`, `metric_values`, `draft_semantic`, `encode_doc`, `load_view`, `SEMANTIC_INDEX`, `_dataset`, `_checked_spec` (คืน tuple ตั้งแต่ Task 7)
- ฝั่ง UI: `requestJson`, `semanticApi`, `fromView`, `updateColumn`, `statusText`, `toMetricBody`, `metricValueText`, `SemanticEditor`, `MetricPanel`, `SEMANTIC_VIEW`, `PROFILE`

**จุดที่ตั้งใจเปลี่ยน test ของแผน Create Dashboard:**
- Task 7 เพิ่ม `_es_or_none` ใน fixture ของ `test_dashboards_api.py`
- Task 8 เปลี่ยนความคาดหวัง `฿` → `$` และ class `is-down` → `is-bad` ตาม spec หัวข้อ 11.5
- Task 11 เพิ่ม route `/semantic/sales` ใน `builderRoutes` เพราะขั้นดูข้อมูลเรียก API นี้แล้ว

**ข้อจำกัดที่รู้:** การอนุมัติใช้ `base_version` ตรวจก่อนเขียน แต่การอ่านกับการเขียน ES ไม่ใช่ธุรกรรมเดียวกัน ถ้ามีคนกดอนุมัติพร้อมกันในเสี้ยววินาที ยังทับกันได้ ซึ่งรับได้สำหรับระบบที่มีผู้ดูแลบัญชีเดียว
