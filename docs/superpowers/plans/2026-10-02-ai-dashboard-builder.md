# Create Dashboard (AI Dashboard Builder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มหน้า "Create Dashboard" ให้ผู้ใช้เลือกชุดข้อมูลที่ผ่าน Quality Gate แล้ว พิมพ์ความต้องการเป็นภาษาธรรมชาติ จากนั้นให้ LLM (Groq `openai/gpt-oss-120b`) ออกแบบแดชบอร์ดสไตล์ Power BI / Databricks ให้ ผู้ใช้กรองข้อมูลแบบ interactive, สั่งปรับด้วย AI และบันทึกไว้เปิดใช้ภายหลังได้

**Architecture:** LLM ไม่ได้เขียนโค้ดหรือ SQL แต่ตอบเป็น **dashboard spec** (JSON แบบ declarative) จากนั้น `validate_spec()` ตัดทุกอย่างที่ไม่รู้จักทิ้ง (ชนิดวิดเจ็ต, คอลัมน์, aggregation ต้องอยู่ใน whitelist) แล้ว backend คำนวณตัวเลขเองด้วย pandas จาก active layer (`/data/active/<table>`) ส่วน UI วาด spec ด้วย recharts บน grid 12 คอลัมน์ prompt ส่งไป Groq มีแค่ profile ของคอลัมน์ (ชื่อ, ชนิด, จำนวนค่าไม่ซ้ำ, % ค่าว่าง, ช่วงของตัวเลข/วันที่) ไม่ส่งแถวข้อมูลหรือค่าหมวดหมู่ ถ้าไม่มีคีย์หรือ Groq ล้มเหลว การสร้างจะใช้ spec แบบกฎ (rule-based) แทน ส่วนการปรับด้วย AI จะแจ้งว่า AI ไม่พร้อม แดชบอร์ดที่บันทึกเก็บใน Elasticsearch index `sdoqap_dashboards`

**Tech Stack:** FastAPI 0.100 + pandas (รันใน container `api`, Python 3.10), Groq OpenAI-compatible chat completions ผ่าน `requests`, Elasticsearch 8, React 18 + recharts 2.15 + react-router 6, Vitest 2 + Testing Library, Git Bash

**Spec:** ไม่มี spec แยก ความต้องการคือรายการ R1–R10 ที่ผู้ใช้ให้ไว้ บวก R11 ที่ผู้ใช้ยืนยันเพิ่มภายหลัง (สรุปไว้ในหัวข้อ "ความต้องการ" ด้านล่าง พร้อมตารางว่าแต่ละข้อทำใน Task ไหน)

## ความต้องการ (จากผู้ใช้) และ Task ที่ตอบ

| ID | ความต้องการ | Task |
|---|---|---|
| R1 | Dataset Selection: แสดงชุดข้อมูลที่นำเข้าแล้ว พร้อมชื่อ, แหล่งที่มา, จำนวน records, จำนวน columns, ชนิดข้อมูล, อัปเดตล่าสุด และให้เลือกได้ | 1, 5, 7 |
| R2 | Data Preview: ตัวอย่างข้อมูล, ชื่อคอลัมน์และชนิด, จำนวนแถว/คอลัมน์, missing values, จำนวนคอลัมน์ numeric / categorical / date | 1, 5, 9 |
| R3 | Dashboard Context: ช่องพิมพ์ความต้องการ, ตัวอย่างคำขอ, เลือกกลุ่มผู้ใช้ (Business User, Data Analyst, Management) | 9 |
| R4 | LLM Generation: ส่ง dataset + schema + context ให้ LLM เลือก KPI, ชนิดกราฟ, คอลัมน์, layout และ filter | 2, 4, 5 |
| R5 | Layout แบบ BI: KPI cards, bar, line, pie/donut, table, trend analysis, filters/slicers | 2, 3, 8 |
| R6 | Preview แบบ interactive: filter, sort, drill-down | 3, 8, 9 |
| R7 | AI Refinement: สั่งปรับเพิ่มโดยไม่สร้างใหม่ทั้งหมด | 2, 4, 5, 10 |
| R8 | Save & Manage: ตั้งชื่อ, คำอธิบาย, บันทึก dataset และ prompt/context, เปิดกลับมาแก้ไขได้ | 6, 11 |
| R9 | Flow: Select → Preview → Context → Generate → Preview → Refine → Save | 9, 10, 11, 13 |
| R10 | ใช้ข้อมูลที่ผ่าน Quality Gate ไปสร้าง insight ได้ทันที | 1 (ใช้เฉพาะ active layer) |
| R11 | สร้างแดชบอร์ด "ติดตาม Data Quality" ได้ โดยเลือกชุดข้อมูลผลตรวจคุณภาพจากรายการเดียวกัน (ผู้ใช้ยืนยัน 2026-10-02) | 12 |

การตีความที่เลือกไว้ (ถ้าไม่ตรงความต้องการให้แก้ที่แผนก่อนเริ่ม):
- **"Data Type" ในรายการชุดข้อมูล** คือสรุปชนิดของคอลัมน์ เช่น `ตัวเลข 3 · หมวดหมู่ 2 · วันที่ 1` ส่วน **"Source"** คือช่องทางนำเข้าล่าสุดจาก `sdoqap_runs.source` (`file` → File upload, `api` → REST API, `rdbms` → Database) ถ้าเป็นตารางที่ n8n เขียนเองจะไม่มี run document และแสดงเป็น "—"
- **Trend Analysis** คือกราฟ line/area ตามเวลา (`time_grain`) และ KPI ที่มี `compare` (เทียบช่วงล่าสุดกับช่วงก่อนหน้า)
- **Drill-down** คือคลิกแท่งกราฟ bar หรือชิ้น pie/donut แล้วทั้งแดชบอร์ดกรองตามค่านั้น (cross-filter) และมี chip ให้กดล้าง
- **Filter แบบ select** เลือกได้ทีละ 1 ค่า (มีตัวเลือก "ทั้งหมด") ส่วนคอลัมน์วันที่เป็นช่วงวันที่ (from/to)
- หน้าใหม่เป็นเมนูแยกชื่อ **Create Dashboard** ที่ `/dashboard-builder` ในกลุ่ม "ติดตามและตรวจสอบ" ต่อจาก Dashboards และไม่แตะหน้า `/dashboard` เดิม (ผู้ใช้เลือกแบบนี้แล้ว ไม่ใช่แท็บในหน้า Dashboards)
- **ชุดข้อมูลผลตรวจคุณภาพ** ใช้ชื่อภายใน `_quality_runs` (ขึ้นต้นด้วย `_` จึงไม่ชนกับตารางใน HDFS เพราะ `list_active_tables()` ข้ามชื่อแบบนี้) UI แสดงเป็น "ผลตรวจคุณภาพข้อมูล (ทุกตาราง)" และอยู่บนสุดของรายการ หนึ่งแถวคือหนึ่งรอบการตรวจใน `sdoqap_quality_runs` (ล่าสุด 5,000 รอบ) ใช้เฉพาะ field ที่เป็นค่าเดี่ยว ไม่รวม field ซ้อน เช่น `remediation_logs`, `null_profile`, `stage_seconds` และเพิ่มคอลัมน์ `gate_result` (ผ่าน/ไม่ผ่าน) ที่ได้จาก `quality_score >= effective_quality_threshold`
- รูปแบบ `currency` แสดงด้วยสัญลักษณ์ `฿`

## Global Constraints

- ทำบน branch ปัจจุบัน (`new-optimizer`) ห้าม commit ลง `main`
- Commit message ไม่ใส่ attribution line ใดๆ (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- **working tree มีงานที่ผู้ใช้ยังไม่ commit** (เช่น `services/api/app/api/whitebox.py`, `dynamic_rules.py`, `services/ui/src/pages/Ingestion.jsx`, `RulesConfig.jsx`, `docs/whitebox-report/05-ai-in-the-system.md` และไฟล์ untracked ใน `docs/presentation/`) ห้ามใช้ `git add -A`, `git add .` หรือ `git commit -a` ให้ stage เฉพาะไฟล์ที่ Task นั้นระบุ และห้ามแก้ไฟล์ที่มีงานค้างของผู้ใช้ (แผนนี้แค่ **import** `_get_groq_api_key` จาก `whitebox.py` ไม่แก้ไฟล์นั้น)
- LLM: ใช้ Groq endpoint `https://api.groq.com/openai/v1/chat/completions` โมเดลเริ่มต้น `openai/gpt-oss-120b` คีย์มาจาก `_get_groq_api_key()` ใน `services/api/app/api/whitebox.py` (ค่าที่บันทึกในหน้า Rules มาก่อน แล้วค่อยเป็น `GROQ_API_KEY`) และชื่อโมเดลมาจาก `get_system_settings()["groq_model"]`
- **ความเป็นส่วนตัว:** prompt ที่ส่งไป Groq ห้ามมีแถวข้อมูล ค่าหมวดหมู่ หรือข้อความในเซลล์ ส่งได้แค่ profile ของคอลัมน์ (name, kind, distinct, missing_pct, และ min/max ของคอลัมน์ตัวเลขหรือวันที่) กับข้อความความต้องการของผู้ใช้ มี test บังคับใน Task 4
- **ความปลอดภัย:** ห้ามรันโค้ด, SQL หรือ expression ที่มาจาก LLM ทุก spec ต้องผ่าน `validate_spec()` ก่อนเอาไปคำนวณหรือบันทึก
- **คีย์ Groq ให้เจ้าของระบบใส่เอง** (หน้า Expectations & Alerts หรือ `.env`) agent ห้ามสมัครบัญชี ห้ามพิมพ์ คัดลอก หรือแสดงค่าคีย์ ตรวจได้แค่ว่ามีหรือไม่มี
- ทุก route ใหม่ต้อง login (`require_session`) และชื่อ table ต้องผ่าน `validate_table_name()`
- API test รันใน container เสมอ (เครื่อง host ไม่มี fastapi/pandas): `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/<ไฟล์>"` ต้องเปิด Docker Desktop ก่อน แต่ไม่ต้องให้ทั้ง stack รัน
- UI test: `cd services/ui && npx vitest run <ไฟล์>` (ทั้งชุด: `npm test`)
- ทุกคำสั่งรันจาก root ของ repo (`C:\ETL`) ใน Git Bash ยกเว้นคำสั่งที่ขึ้นต้นด้วย `cd services/ui`
- ข้อความบนหน้าจอเป็นภาษาไทย ยกเว้นชื่อเฉพาะ (Dashboard, KPI, Business User, Data Analyst, Management, ชื่อคอลัมน์ของข้อมูล)
- ถ้า test ที่ควรผ่านกลับล้ม ให้หยุดและรายงาน ห้ามแก้ test ให้ผ่าน

## Dashboard spec v1 (สัญญาระหว่าง LLM, API และ UI)

```json
{
  "version": 1,
  "title": "ภาพรวมยอดขาย",
  "description": "ยอดขายรายเดือนและตามภูมิภาค",
  "audience": "business | analyst | management",
  "filters": [
    {"id": "f1", "column": "Region", "type": "select", "label": "ภูมิภาค"},
    {"id": "f2", "column": "Order_Date", "type": "date_range", "label": "วันที่สั่งซื้อ"}
  ],
  "widgets": [
    {"id": "w1", "type": "kpi", "title": "ยอดขายรวม", "metric": {"agg": "sum", "column": "Total_Sales"},
     "format": "currency", "compare": {"date_column": "Order_Date", "time_grain": "month"},
     "layout": {"x": 0, "y": 0, "w": 3, "h": 2}},
    {"id": "w2", "type": "bar", "title": "ยอดขายตามภูมิภาค", "x": "Region", "metric": {"agg": "sum", "column": "Total_Sales"},
     "format": "number", "group_by": "Customer_Segment", "stacked": false, "sort": "desc", "limit": 10,
     "layout": {"x": 3, "y": 0, "w": 6, "h": 4}},
    {"id": "w3", "type": "line", "title": "แนวโน้มรายเดือน", "x": "Order_Date", "time_grain": "month",
     "metric": {"agg": "sum", "column": "Total_Sales"}, "format": "number", "group_by": null, "stacked": false,
     "layout": {"x": 0, "y": 4, "w": 6, "h": 4}},
    {"id": "w4", "type": "table", "title": "รายการสั่งซื้อ", "columns": ["Order_ID", "Region", "Total_Sales"],
     "order_by": {"column": "Total_Sales", "desc": true}, "limit": 50, "layout": {"x": 0, "y": 8, "w": 12, "h": 5}}
  ]
}
```

| ฟิลด์ | ค่าที่รับ |
|---|---|
| `widgets[].type` | `kpi`, `bar`, `line`, `area`, `pie`, `donut`, `table` (สูงสุด 16 วิดเจ็ต) |
| `metric.agg` | `count` (column = null), `count_distinct` (คอลัมน์ใดก็ได้), `sum` / `avg` / `min` / `max` (ต้องเป็นคอลัมน์ numeric) |
| `x` | bar/pie/donut ใช้คอลัมน์ใดก็ได้ ส่วน line/area ต้องเป็น date หรือ numeric |
| `time_grain` | `day`, `week`, `month`, `quarter`, `year` (ค่าเริ่มต้น `month` เมื่อ x เป็น date) |
| `limit` | bar ค่าเริ่มต้น 10 สูงสุด 20, pie/donut 6 / 8, table 50 / 200 |
| `layout` | grid 12 คอลัมน์ แต่ละแถวสูง 72px, `w` 1–12, `h` 1–8 ค่า `x`/`y` จาก LLM ใช้แค่กำหนดลำดับการอ่าน ส่วนตำแหน่งจริง server จัดเรียงซ้ายไปขวาโดยไม่ซ้อนกัน |
| `filters[].type` | กำหนดจากชนิดคอลัมน์: date → `date_range`, อื่นๆ → `select` (สูงสุด 6 ตัว) |

การคำนวณ (`POST /render`) ตอบ `data.widgets[<id>]` ตามชนิด:
- kpi: `{"value", "current", "previous", "change_pct", "period"}` (สามค่าหลังมีเฉพาะเมื่อมี `compare`)
- bar/line/area/pie/donut: `{"rows": [{"x": "North", "value": 1.0}], "series": ["value"]}` ถ้ามี `group_by` ชื่อ series จะเป็นค่าของกลุ่ม (สูงสุด 8 series ที่เหลือรวมเป็น `อื่นๆ`) ค่าว่างแสดงเป็น `(ว่าง)`
- table: `{"columns", "rows", "total_rows"}`
- วิดเจ็ตที่คำนวณไม่ได้: `{"error": "คำนวณวิดเจ็ตนี้ไม่ได้: ..."}` (วิดเจ็ตอื่นยังแสดงตามปกติ)

`selections` ที่ UI ส่งมา: `{"Region": {"values": ["North"]}, "Order_Date": {"from": "2025-01-01", "to": "2025-03-31"}}`

## API ใหม่ (ทุกเส้นต้อง login)

| Method + path | หน้าที่ | Task |
|---|---|---|
| `GET /api/v1/dashboards/datasets` | รายการชุดข้อมูลใน active layer | 5 |
| `GET /api/v1/dashboards/datasets/{table_name}/preview` | profile + ตัวอย่าง 20 แถว | 5 |
| `POST /api/v1/dashboards/generate` | `{table_name, context, audience}` → `{spec, warnings, engine, model, data}` | 5 |
| `POST /api/v1/dashboards/refine` | `{table_name, spec, instruction}` → `{spec, warnings, engine, model, changes, data}` (503 ถ้า AI ไม่พร้อม) | 5 |
| `POST /api/v1/dashboards/render` | `{table_name, spec, selections}` → `{spec, data}` | 5 |
| `GET /api/v1/dashboards/saved` | รายการที่บันทึก (สรุป) | 6 |
| `POST /api/v1/dashboards/saved` | บันทึกใหม่ | 6 |
| `GET /api/v1/dashboards/saved/{id}` | เปิดแดชบอร์ดที่บันทึกไว้ | 6 |
| `PUT /api/v1/dashboards/saved/{id}` | บันทึกการแก้ไข | 6 |
| `DELETE /api/v1/dashboards/saved/{id}` | ลบ | 6 |

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| Create `services/api/app/api/dashboard_data.py` | โหลด active layer, จัดชนิดคอลัมน์, profile, รายการชุดข้อมูล, preview | 1 |
| Create `services/api/tests/test_dashboard_data.py` | test ของ dashboard_data | 1 |
| Create `services/api/app/api/dashboard_spec.py` | ค่าคงที่ของ spec, `validate_spec`, `diff_specs`, `SpecError` | 2 |
| Create `services/api/tests/test_dashboard_spec.py` | test ของ spec | 2 |
| Create `services/api/app/api/dashboard_compute.py` | `apply_filters`, `compute_dashboard`, `filter_options` | 3 |
| Create `services/api/tests/test_dashboard_compute.py` | test การคำนวณ | 3 |
| Create `services/api/app/api/dashboard_llm.py` | prompt, เรียก Groq, parse, retry, fallback แบบกฎ, generate/refine | 4 |
| Create `services/api/tests/test_dashboard_llm.py` | test LLM (Groq จำลอง) + test ความเป็นส่วนตัว | 4 |
| Create `services/api/app/api/dashboards.py` | router `/api/v1/dashboards` | 5, 6 |
| Modify `services/api/main.py` | include router | 5 |
| Modify `services/api/tests/test_route_contract.py` | เพิ่มคำเรียกของ UI | 5, 6 |
| Create `services/api/tests/test_dashboards_api.py` | test route datasets/preview/generate/refine/render | 5 |
| Modify `services/api/tests/fakes.py` | เพิ่ม `FakeES.delete` | 6 |
| Create `services/api/tests/test_dashboards_saved.py` | test การบันทึก/เปิด/แก้/ลบ | 6 |
| Create `services/ui/src/utils/dashboardsApi.js` (+ `.test.js`) | client ของ `/api/v1/dashboards` | 7 |
| Create `services/ui/src/utils/numberFormat.js` (+ `.test.js`) | `formatValue` (1.77M, 12.2K, ฿, %) | 7 |
| Modify `services/ui/src/config/pages.js`, `pages.test.js`, `services/ui/src/App.jsx`, `services/ui/src/components/NavBar.jsx` | ลงทะเบียนหน้าและเมนู | 7 |
| Create `services/ui/src/pages/DashboardBuilder.jsx`, `DashboardBuilder.css`, `DashboardBuilder.test.jsx` | หน้า Create Dashboard (stepper + state) | 7, 9, 10, 11 |
| Create `services/ui/src/components/builder/DatasetPicker.jsx` | ขั้นที่ 1 | 7 |
| Create `services/ui/src/components/builder/palette.js`, `KpiCard.jsx`, `ChartWidget.jsx`, `TableWidget.jsx`, `FilterBar.jsx`, `DashboardCanvas.jsx`, `DashboardCanvas.test.jsx` | ตัววาดแดชบอร์ด | 8 |
| Create `services/ui/src/test/dashboardFixtures.js` | spec/data ตัวอย่างที่ใช้ร่วมใน UI test | 8 |
| Create `services/ui/src/components/builder/DataPreview.jsx`, `ContextForm.jsx` | ขั้นที่ 2 และ 3 | 9 |
| Create `services/ui/src/components/builder/RefinePanel.jsx`, `RefinePanel.test.jsx` | ปรับด้วย AI | 10 |
| Create `services/ui/src/components/builder/SaveDialog.jsx`, `SavedDashboards.jsx` | บันทึกและจัดการ | 11 |
| Modify `services/api/app/api/dashboard_data.py`, `dashboards.py` | ชุดข้อมูลผลตรวจคุณภาพ `_quality_runs` | 12 |
| Create `services/api/tests/test_dashboard_quality_dataset.py` | test ชุดข้อมูลผลตรวจคุณภาพ | 12 |
| Modify `services/ui/src/components/builder/DatasetPicker.jsx`, `SavedDashboards.jsx`, `services/ui/src/pages/DashboardBuilder.jsx`, `DashboardBuilder.test.jsx` | ชื่อที่แสดงของชุดข้อมูลผลตรวจคุณภาพ | 12 |
| Modify `README.md` | อธิบายหน้า Create Dashboard | 13 |

---

### Task 1: โหลดชุดข้อมูลและ profile คอลัมน์

**Files:**
- Create: `services/api/app/api/dashboard_data.py`
- Test: `services/api/tests/test_dashboard_data.py`

**Interfaces:**
- Consumes: `read_parquet_folder_to_df(hdfs_folder) -> DataFrame`, `_list_hdfs_dir(path) -> list[dict]`, `_records_json_safe(df) -> list[dict]` จาก `services/api/app/api/data_export.py`; `validate_table_name(name)` จาก `validation.py`
- Produces:
  - `KINDS = ("numeric", "categorical", "date", "text")`
  - `classify_column(series) -> str`
  - `prepare_frame(df) -> (DataFrame, profile)` ตัดคอลัมน์เทคนิค (`run_id`, `ingest_id`, `__index_level_0__`) แปลงคอลัมน์ numeric/date ให้เป็นชนิดจริง (date เป็น datetime แบบไม่มี timezone)
  - `profile = {"rows": int, "column_count": int, "missing_cells": int, "kind_counts": {kind: int}, "columns": [{"name", "kind", "dtype", "missing", "missing_pct", "distinct", ("min", "max", "mean" สำหรับ numeric) | ("min", "max" ISO สำหรับ date)}]}`
  - `load_active_dataset(table_name) -> (DataFrame, profile)` (cache 120 วินาที)
  - `list_datasets(es_or_None) -> list[{"name", "source", "records", "columns", "kind_counts", "last_updated", "quality_score", "error"}]`
  - `preview_dataset(table_name) -> {"table_name", "profile", "sample"}`

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_dashboard_data.py`:

```python
import os
import sys

import pandas as pd
import pytest
from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import dashboard_data  # noqa: E402
from fakes import FakeES  # noqa: E402

SALES = pd.DataFrame({
    "order_date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28", None],
    "region": ["North", "South", "North", "East", "South"],
    "amount": [100.0, 250.5, None, 80.0, 40.0],
    "units": ["3", "5", "2", "1", "4"],
    "note": ["a1", "b2", "c3", "d4", "e5"],
    "run_id": ["r1"] * 5,
})


@pytest.fixture(autouse=True)
def empty_caches():
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()
    yield
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()


def test_columns_are_classified_by_what_they_hold():
    kind = dashboard_data.classify_column
    assert kind(pd.Series([1.5, 2.0, None])) == "numeric"
    assert kind(pd.Series(["3", "5", "2"])) == "numeric"
    assert kind(pd.Series(["2025-01-05", "2025-02-01"])) == "date"
    assert kind(pd.to_datetime(pd.Series(["2025-01-05"]))) == "date"
    assert kind(pd.Series(["North", "South", "North"])) == "categorical"
    assert kind(pd.Series([True, False])) == "categorical"
    assert kind(pd.Series([f"customer-{i}" for i in range(60)])) == "text"
    assert kind(pd.Series([None, None], dtype="object")) == "text"


def test_prepare_frame_drops_technical_columns_and_converts_types():
    df, profile = dashboard_data.prepare_frame(SALES.copy())
    assert "run_id" not in df.columns
    assert pd.api.types.is_numeric_dtype(df["units"])
    assert pd.api.types.is_datetime64_any_dtype(df["order_date"])
    assert profile["rows"] == 5 and profile["column_count"] == 5
    assert profile["missing_cells"] == 2
    assert profile["kind_counts"] == {"numeric": 2, "categorical": 2, "date": 1, "text": 0}
    amount = next(c for c in profile["columns"] if c["name"] == "amount")
    assert amount["missing"] == 1 and amount["missing_pct"] == 20.0
    assert amount["min"] == 40.0 and amount["max"] == 250.5
    order_date = next(c for c in profile["columns"] if c["name"] == "order_date")
    assert order_date["min"] == "2025-01-05T00:00:00" and order_date["max"] == "2025-02-28T00:00:00"


def test_timezone_aware_dates_become_naive_so_filters_can_compare_them():
    raw = pd.DataFrame({"at": pd.to_datetime(["2025-01-05T10:00:00+07:00"])})
    df, _ = dashboard_data.prepare_frame(raw)
    assert df["at"].dt.tz is None


def test_list_shows_catalog_facts_and_keeps_unreadable_tables_visible(monkeypatch):
    def read(name):
        if name == "broken":
            raise HTTPException(status_code=404, detail="Delta log not found")
        return SALES.copy()

    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: ["sales", "broken"])
    monkeypatch.setattr(dashboard_data, "_read_active", read)
    es = FakeES()
    es.index("sdoqap_runs", "i1", {"table_name": "sales", "source": "file", "created_at": "2026-10-01T00:00:00Z",
                                   "updated_at": "2026-10-01T00:05:00Z"})
    es.index("sdoqap_quality_runs", "q1", {"table_name": "sales", "timestamp": "2026-10-01T01:00:00Z", "quality_score": 97.5})

    broken, sales = dashboard_data.list_datasets(es)
    assert sales == {"name": "sales", "source": "File upload", "records": 5, "columns": 5,
                     "kind_counts": {"numeric": 2, "categorical": 2, "date": 1, "text": 0},
                     "last_updated": "2026-10-01T01:00:00Z", "quality_score": 97.5, "error": None}
    assert broken["name"] == "broken" and broken["records"] is None
    assert broken["error"] == "Delta log not found"


def test_list_works_without_elasticsearch(monkeypatch):
    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: ["sales"])
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())
    (sales,) = dashboard_data.list_datasets(None)
    assert sales["source"] is None and sales["last_updated"] is None and sales["records"] == 5


def test_preview_returns_profile_and_json_safe_sample(monkeypatch):
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())
    preview = dashboard_data.preview_dataset("sales")
    assert preview["table_name"] == "sales"
    assert preview["profile"]["rows"] == 5
    assert len(preview["sample"]) == 5
    assert preview["sample"][2]["amount"] is None
    assert preview["sample"][4]["order_date"] is None


def test_a_table_is_read_once_per_cache_period(monkeypatch):
    calls = []
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: calls.append(name) or SALES.copy())
    dashboard_data.load_active_dataset("sales")
    dashboard_data.load_active_dataset("sales")
    assert calls == ["sales"]


def test_unsafe_table_names_are_rejected():
    with pytest.raises(HTTPException) as exc:
        dashboard_data.load_active_dataset("../etc")
    assert exc.value.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboard_data.py"`
Expected: FAIL ด้วย `ImportError: cannot import name 'dashboard_data'`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/api/app/api/dashboard_data.py`:

```python
"""Datasets for the Create Dashboard tab.

Only the active layer (/data/active/<table>, the rows that passed the Quality Gate) is
offered. A table is loaded with pandas once per cache period, its technical columns are
dropped and every column is classified as numeric, date, categorical or text; both the
dashboard spec and the LLM prompt are built from that profile."""
import time

import pandas as pd
from fastapi import HTTPException

from .data_export import _list_hdfs_dir, _records_json_safe, read_parquet_folder_to_df
from .validation import validate_table_name

KINDS = ("numeric", "categorical", "date", "text")
TECHNICAL_COLUMNS = {"run_id", "ingest_id", "__index_level_0__"}
CATEGORY_MAX_DISTINCT = 50
PARSE_MIN_RATIO = 0.9
PREVIEW_ROWS = 20
SOURCE_LABELS = {"file": "File upload", "api": "REST API", "rdbms": "Database"}

_CACHE_TTL_S = 120
_FRAME_CACHE_MAX = 4
_FRAME_CACHE = {}    # table -> (loaded_at, df, profile)
_PROFILE_CACHE = {}  # table -> (loaded_at, profile); profiles are small, frames are not


def _parse_dates(series: pd.Series) -> pd.Series:
    """Datetimes without a timezone (UTC wall time), so filters compare like with like."""
    return pd.to_datetime(series, errors="coerce", format="mixed", utc=True).dt.tz_convert(None)


def classify_column(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "categorical"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    values = series.dropna()
    if values.empty:
        return "text"
    sample = values.astype(str).head(500)
    if pd.to_numeric(sample, errors="coerce").notna().mean() >= PARSE_MIN_RATIO:
        return "numeric"
    if _parse_dates(sample).notna().mean() >= PARSE_MIN_RATIO:
        return "date"
    distinct = values.nunique()
    if distinct <= CATEGORY_MAX_DISTINCT or distinct <= 0.5 * len(values):
        return "categorical"
    return "text"


def _number(value):
    return None if pd.isna(value) else round(float(value), 4)


def _iso(value):
    return None if pd.isna(value) else pd.Timestamp(value).isoformat()


def profile_dataframe(df: pd.DataFrame) -> dict:
    rows = len(df)
    columns = []
    for name in df.columns:
        series = df[name]
        kind = classify_column(series)
        missing = int(series.isna().sum())
        column = {"name": name, "kind": kind, "dtype": str(series.dtype), "missing": missing,
                  "missing_pct": round(missing / rows * 100, 2) if rows else 0.0,
                  "distinct": int(series.nunique(dropna=True))}
        if kind == "numeric":
            numbers = pd.to_numeric(series, errors="coerce")
            column.update(min=_number(numbers.min()), max=_number(numbers.max()), mean=_number(numbers.mean()))
        elif kind == "date":
            column.update(min=_iso(series.min()), max=_iso(series.max()))
        columns.append(column)
    return {"rows": rows, "column_count": len(columns), "missing_cells": int(df.isna().sum().sum()),
            "kind_counts": {k: sum(c["kind"] == k for c in columns) for k in KINDS}, "columns": columns}


def prepare_frame(df: pd.DataFrame):
    """(DataFrame ready for aggregation, its profile)."""
    df = df.drop(columns=[c for c in df.columns if c in TECHNICAL_COLUMNS]).reset_index(drop=True)
    df.columns = [str(c) for c in df.columns]
    for name in df.columns:
        kind = classify_column(df[name])
        if kind == "numeric" and not pd.api.types.is_numeric_dtype(df[name]):
            df[name] = pd.to_numeric(df[name], errors="coerce")
        elif kind == "date":
            df[name] = _parse_dates(df[name])
    return df, profile_dataframe(df)


def _read_active(table_name: str) -> pd.DataFrame:
    return read_parquet_folder_to_df(f"/data/active/{table_name}")


def load_active_dataset(table_name: str):
    """(DataFrame, profile) of a table's active layer, cached for _CACHE_TTL_S seconds."""
    validate_table_name(table_name)
    hit = _FRAME_CACHE.get(table_name)
    if hit and time.time() - hit[0] < _CACHE_TTL_S:
        return hit[1], hit[2]
    df, profile = prepare_frame(_read_active(table_name))
    if table_name not in _FRAME_CACHE and len(_FRAME_CACHE) >= _FRAME_CACHE_MAX:
        _FRAME_CACHE.pop(min(_FRAME_CACHE, key=lambda k: _FRAME_CACHE[k][0]))
    now = time.time()
    _FRAME_CACHE[table_name] = (now, df, profile)
    _PROFILE_CACHE[table_name] = (now, profile)
    return df, profile


def dataset_profile(table_name: str) -> dict:
    hit = _PROFILE_CACHE.get(table_name)
    if hit and time.time() - hit[0] < _CACHE_TTL_S:
        return hit[1]
    return load_active_dataset(table_name)[1]


def list_active_tables():
    return [e["pathSuffix"] for e in _list_hdfs_dir("/data/active")
            if e["type"] == "DIRECTORY" and not e["pathSuffix"].startswith(("_", "."))]


def _latest(es, index, table_name, sort_field):
    if es is None:
        return None
    try:
        if not es.indices.exists(index=index):
            return None
        res = es.search(index=index, query={"bool": {"filter": [{"term": {"table_name.keyword": table_name}}]}},
                        size=1, sort=[{sort_field: {"order": "desc"}}])
        hits = res["hits"]["hits"]
        return hits[0]["_source"] if hits else None
    except Exception:
        return None


def list_datasets(es):
    """Catalog rows for the dataset picker. A table that cannot be read stays in the list
    with its error, so the user sees why it cannot be chosen."""
    datasets = []
    for name in sorted(list_active_tables()):
        run = _latest(es, "sdoqap_runs", name, "created_at") or {}
        quality = _latest(es, "sdoqap_quality_runs", name, "timestamp") or {}
        entry = {"name": name, "source": SOURCE_LABELS.get(run.get("source"), run.get("source")),
                 "records": None, "columns": None, "kind_counts": None,
                 "last_updated": quality.get("timestamp") or run.get("updated_at"),
                 "quality_score": quality.get("quality_score"), "error": None}
        try:
            profile = dataset_profile(name)
            entry.update(records=profile["rows"], columns=profile["column_count"], kind_counts=profile["kind_counts"])
        except HTTPException as exc:
            entry["error"] = str(exc.detail)
        except Exception as exc:
            entry["error"] = f"อ่านข้อมูลไม่ได้: {exc}"
        datasets.append(entry)
    return datasets


def preview_dataset(table_name: str) -> dict:
    df, profile = load_active_dataset(table_name)
    return {"table_name": table_name, "profile": profile, "sample": _records_json_safe(df.head(PREVIEW_ROWS))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2
Expected: PASS ทั้ง 8 test ถ้า `test_columns_are_classified_by_what_they_hold` ล้มเพราะ pandas ใน container ตีความ `"a1"` หรือ `"North"` เป็นวันที่ ให้หยุดและรายงานเวอร์ชัน pandas (`python -c "import pandas; print(pandas.__version__)"`) ห้ามแก้ test

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_data.py services/api/tests/test_dashboard_data.py
git commit -m "feat(api): dataset loader and column profile for the dashboard builder"
```

---

### Task 2: Dashboard spec และตัวตรวจ

**Files:**
- Create: `services/api/app/api/dashboard_spec.py`
- Test: `services/api/tests/test_dashboard_spec.py`

**Interfaces:**
- Consumes: profile ตามรูปแบบใน Task 1 (ใช้แค่ `columns[].name` และ `columns[].kind`)
- Produces:
  - ค่าคงที่ `SPEC_VERSION`, `GRID_COLUMNS = 12`, `MAX_ROW_SPAN = 8`, `MAX_WIDGETS = 16`, `MAX_FILTERS = 6`, `WIDGET_TYPES`, `AGGREGATIONS`, `NUMERIC_AGGREGATIONS`, `TIME_GRAINS`, `FORMATS`, `AUDIENCES`, `BAR_SORTS`
  - `class SpecError(ValueError)`
  - `validate_spec(raw, profile) -> (spec, warnings: list[str])` (idempotent: ตรวจ spec ที่ผ่านแล้วซ้ำจะได้ค่าเดิม)
  - `diff_specs(old, new) -> {"added": [title], "removed": [title], "changed": [title], "layout_changed": bool, "filters_added": [column], "filters_removed": [column]}`

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_dashboard_spec.py`:

```python
import os
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_spec import SpecError, diff_specs, validate_spec  # noqa: E402

PROFILE = {"rows": 100, "columns": [
    {"name": "order_date", "kind": "date"},
    {"name": "region", "kind": "categorical"},
    {"name": "segment", "kind": "categorical"},
    {"name": "amount", "kind": "numeric"},
    {"name": "customer", "kind": "text"},
]}
SUM = {"agg": "sum", "column": "amount"}


def check(*widgets, filters=(), **top):
    return validate_spec({"widgets": list(widgets), "filters": list(filters), **top}, PROFILE)


def test_a_good_spec_keeps_its_choices_and_gets_defaults():
    spec, warnings = check(
        {"id": "total", "type": "kpi", "title": "ยอดขายรวม", "metric": SUM, "format": "currency"},
        {"id": "by_region", "type": "bar", "title": "ตามภูมิภาค", "x": "region", "metric": SUM, "group_by": "segment"},
        {"id": "trend", "type": "line", "title": "รายเดือน", "x": "order_date", "metric": SUM},
        {"id": "share", "type": "donut", "title": "สัดส่วน", "x": "segment", "metric": {"agg": "count", "column": None}},
        {"id": "rows", "type": "table", "title": "รายการ", "columns": ["region", "amount"],
         "order_by": {"column": "amount", "desc": True}},
        title="ยอดขาย", audience="management",
    )
    assert warnings == []
    assert spec["version"] == 1 and spec["title"] == "ยอดขาย" and spec["audience"] == "management"
    kpi, bar, line, donut, table = spec["widgets"]
    assert [w["id"] for w in spec["widgets"]] == ["total", "by_region", "trend", "share", "rows"]
    assert kpi["format"] == "currency"
    assert bar["limit"] == 10 and bar["sort"] == "desc" and bar["group_by"] == "segment" and bar["stacked"] is False
    assert line["time_grain"] == "month" and line["group_by"] is None
    assert donut["limit"] == 6 and donut["metric"] == {"agg": "count", "column": None}
    assert table["limit"] == 50 and table["order_by"] == {"column": "amount", "desc": True}


def test_unknown_columns_types_and_aggregations_are_dropped_with_a_reason():
    spec, warnings = check(
        {"type": "kpi", "title": "ok", "metric": SUM},
        {"type": "bar", "title": "จังหวัด", "x": "province", "metric": SUM},
        {"type": "radar", "title": "เรดาร์"},
        {"type": "kpi", "title": "ผลรวมชื่อ", "metric": {"agg": "sum", "column": "customer"}},
        {"type": "kpi", "title": "มัธยฐาน", "metric": {"agg": "median", "column": "amount"}},
        {"type": "line", "title": "เส้นตามภูมิภาค", "x": "region", "metric": SUM},
    )
    assert [w["title"] for w in spec["widgets"]] == ["ok"]
    text = " ".join(warnings)
    for reason in ("province", "radar", "customer", "median", "region"):
        assert reason in text


def test_sizes_and_limits_are_clamped():
    spec, _ = check(
        {"type": "bar", "x": "region", "metric": SUM, "limit": 999, "layout": {"w": 40, "h": 99}},
        {"type": "pie", "x": "segment", "metric": SUM, "limit": 50},
        {"type": "table", "limit": 10_000},
    )
    bar, pie, table = spec["widgets"]
    assert bar["limit"] == 20 and bar["layout"]["w"] == 12 and bar["layout"]["h"] == 8
    assert pie["limit"] == 8
    assert table["limit"] == 200 and table["columns"] == ["order_date", "region", "segment", "amount", "customer"]


def test_layout_is_packed_left_to_right_in_reading_order_without_overlap():
    spec, _ = check(
        {"id": "c", "type": "bar", "x": "region", "metric": SUM, "layout": {"x": 0, "y": 4, "w": 6, "h": 4}},
        {"id": "a", "type": "kpi", "metric": SUM, "layout": {"x": 0, "y": 0, "w": 6, "h": 2}},
        {"id": "b", "type": "kpi", "metric": SUM, "layout": {"x": 6, "y": 0, "w": 6, "h": 2}},
        {"id": "d", "type": "table"},
    )
    placed = {w["id"]: w["layout"] for w in spec["widgets"]}
    assert [w["id"] for w in spec["widgets"]] == ["a", "b", "c", "d"]
    assert placed["a"] == {"x": 0, "y": 0, "w": 6, "h": 2}
    assert placed["b"] == {"x": 6, "y": 0, "w": 6, "h": 2}
    assert placed["c"] == {"x": 0, "y": 2, "w": 6, "h": 4}
    assert placed["d"] == {"x": 0, "y": 6, "w": 12, "h": 5}


def test_validating_a_validated_spec_changes_nothing():
    spec, _ = check({"type": "kpi", "metric": SUM}, {"type": "bar", "x": "region", "metric": SUM},
                    filters=[{"column": "region"}])
    again, warnings = validate_spec(spec, PROFILE)
    assert again == spec and warnings == []


def test_missing_or_duplicate_ids_get_fresh_unique_ones():
    spec, _ = check({"id": "x", "type": "kpi", "metric": SUM}, {"id": "x", "type": "kpi", "metric": SUM},
                    {"id": "bad id!", "type": "kpi", "metric": SUM}, {"type": "kpi", "metric": SUM})
    ids = [w["id"] for w in spec["widgets"]]
    assert ids[0] == "x" and len(set(ids)) == 4


def test_filters_take_their_type_from_the_column_and_unknown_ones_are_dropped():
    spec, warnings = check({"type": "kpi", "metric": SUM}, filters=[
        {"column": "order_date", "type": "select"}, {"column": "region", "label": "ภูมิภาค"},
        {"column": "region"}, {"column": "province"}])
    assert [(f["column"], f["type"], f["label"]) for f in spec["filters"]] == [
        ("order_date", "date_range", "order_date"), ("region", "select", "ภูมิภาค")]
    assert "province" in " ".join(warnings)


def test_kpi_compare_needs_a_date_column():
    spec, warnings = check({"type": "kpi", "metric": SUM, "compare": {"date_column": "region"}},
                           {"type": "kpi", "metric": SUM, "compare": {"date_column": "order_date", "time_grain": "year"}})
    assert "compare" not in spec["widgets"][0]
    assert spec["widgets"][1]["compare"] == {"date_column": "order_date", "time_grain": "year"}
    assert "region" in " ".join(warnings)


def test_untitled_widgets_get_a_readable_title_and_bad_audience_falls_back():
    spec, _ = check({"type": "bar", "x": "region", "metric": {"agg": "count", "column": None}}, audience="ceo")
    assert spec["widgets"][0]["title"] == "จำนวนแถว ตาม region"
    assert spec["audience"] == "business" and spec["title"] == "แดชบอร์ด"


def test_a_spec_with_nothing_usable_is_an_error():
    with pytest.raises(SpecError):
        validate_spec([], PROFILE)
    with pytest.raises(SpecError):
        check({"type": "radar"})
    with pytest.raises(SpecError):
        validate_spec({"widgets": "kpi"}, PROFILE)


def test_diff_reports_what_a_refinement_changed():
    old, _ = check({"id": "a", "type": "kpi", "title": "A", "metric": SUM},
                   {"id": "b", "type": "bar", "title": "B", "x": "region", "metric": SUM},
                   {"id": "c", "type": "kpi", "title": "C", "metric": SUM}, filters=[{"column": "region"}])
    new, _ = check({"id": "a", "type": "kpi", "title": "A", "metric": SUM},
                   {"id": "b", "type": "pie", "title": "B", "x": "region", "metric": SUM},
                   {"id": "d", "type": "line", "title": "D", "x": "order_date", "metric": SUM},
                   filters=[{"column": "segment"}])
    assert diff_specs(old, new) == {"added": ["D"], "removed": ["C"], "changed": ["B"], "layout_changed": True,
                                    "filters_added": ["segment"], "filters_removed": ["region"]}
    assert diff_specs(old, old)["layout_changed"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboard_spec.py"`
Expected: FAIL ด้วย `ModuleNotFoundError: No module named 'app.api.dashboard_spec'`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/api/app/api/dashboard_spec.py`:

```python
"""Dashboard spec v1: the JSON the LLM writes and the UI draws.

validate_spec() is the only way from LLM (or browser) JSON to the query engine. It keeps
known widget types, columns that exist in the dataset profile and whitelisted
aggregations, clamps sizes and limits, assigns ids and packs the layout. Anything else
is dropped with a warning; nothing in a spec is ever executed as code or SQL."""
import re

SPEC_VERSION = 1
GRID_COLUMNS = 12
MAX_ROW_SPAN = 8
MAX_WIDGETS = 16
MAX_FILTERS = 6
MAX_TABLE_COLUMNS = 12
WIDGET_TYPES = ("kpi", "bar", "line", "area", "pie", "donut", "table")
AGGREGATIONS = ("count", "count_distinct", "sum", "avg", "min", "max")
NUMERIC_AGGREGATIONS = ("sum", "avg", "min", "max")
TIME_GRAINS = ("day", "week", "month", "quarter", "year")
FORMATS = ("number", "currency", "percent")
AUDIENCES = ("business", "analyst", "management")
BAR_SORTS = ("desc", "asc", "x")
DEFAULT_SIZE = {"kpi": (3, 2), "bar": (6, 4), "line": (6, 4), "area": (6, 4),
                "pie": (4, 4), "donut": (4, 4), "table": (12, 5)}
LIMITS = {"bar": (10, 20), "pie": (6, 8), "donut": (6, 8), "table": (50, 200)}  # (default, max)
_LAST = 10_000
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


class SpecError(ValueError):
    """Nothing usable is left in the spec."""


def _text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def _int(value, default, low, high):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def _metric(raw, kinds):
    """(metric, problem). count takes no column; sum/avg/min/max need a numeric one."""
    if not isinstance(raw, dict):
        return None, "ไม่มี metric"
    agg, column = raw.get("agg"), raw.get("column")
    if agg not in AGGREGATIONS:
        return None, f"ไม่รองรับการคำนวณ {agg}"
    if agg == "count":
        return {"agg": "count", "column": None}, None
    if column not in kinds:
        return None, f"ไม่มีคอลัมน์ {column}"
    if agg in NUMERIC_AGGREGATIONS and kinds[column] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    return {"agg": agg, "column": column}, None


def _default_title(w):
    if w["type"] == "table":
        return "ตารางข้อมูล"
    metric = w["metric"]
    label = "จำนวนแถว" if metric["agg"] == "count" else f"{metric['agg']}({metric['column']})"
    return f"{label} ตาม {w['x']}" if w.get("x") else label


def _layout(raw, wtype):
    """(size, reading order). The LLM's x/y only decide the order; _pack() places widgets."""
    width, height = DEFAULT_SIZE[wtype]
    raw = raw if isinstance(raw, dict) else {}
    size = {"w": _int(raw.get("w"), width, 1, GRID_COLUMNS), "h": _int(raw.get("h"), height, 1, MAX_ROW_SPAN)}
    return size, (_int(raw.get("y"), _LAST, 0, _LAST), _int(raw.get("x"), 0, 0, GRID_COLUMNS))


def _widget(raw, kinds, warnings):
    """(widget, reading order) or None when the widget cannot be drawn."""
    if not isinstance(raw, dict):
        return None
    wtype = raw.get("type")
    title = _text(raw.get("title"), 80)
    name = title or str(wtype)

    def drop(problem):
        warnings.append(f"ตัดวิดเจ็ต '{name}': {problem}")
        return None

    if wtype not in WIDGET_TYPES:
        return drop(f"ไม่รองรับชนิด {wtype}")
    w = {"id": raw.get("id"), "type": wtype, "title": title}
    if wtype == "table":
        listed = raw.get("columns") if isinstance(raw.get("columns"), list) else []
        w["columns"] = [c for c in listed if c in kinds][:MAX_TABLE_COLUMNS] or list(kinds)[:8]
        order = raw.get("order_by")
        if isinstance(order, dict) and order.get("column") in w["columns"]:
            w["order_by"] = {"column": order["column"], "desc": bool(order.get("desc", True))}
    else:
        metric, problem = _metric(raw.get("metric"), kinds)
        if problem:
            return drop(problem)
        w["metric"] = metric
        w["format"] = raw.get("format") if raw.get("format") in FORMATS else "number"
    if wtype == "kpi" and isinstance(raw.get("compare"), dict):
        compare = raw["compare"]
        if kinds.get(compare.get("date_column")) == "date":
            grain = compare.get("time_grain") if compare.get("time_grain") in TIME_GRAINS else "month"
            w["compare"] = {"date_column": compare["date_column"], "time_grain": grain}
        else:
            warnings.append(f"'{name}': ไม่เปรียบเทียบช่วงเวลา เพราะ {compare.get('date_column')} ไม่ใช่คอลัมน์วันที่")
    if wtype in ("bar", "line", "area", "pie", "donut"):
        x = raw.get("x")
        if x not in kinds:
            return drop(f"ไม่มีคอลัมน์ {x}")
        if wtype in ("line", "area") and kinds[x] not in ("date", "numeric"):
            return drop(f"กราฟเส้นต้องใช้แกน X เป็นวันที่หรือตัวเลข ({x})")
        w["x"] = x
    if wtype in ("bar", "line", "area"):
        group = raw.get("group_by")
        w["group_by"] = group if group in kinds and group != w["x"] else None
        w["stacked"] = bool(raw.get("stacked")) and w["group_by"] is not None
    if wtype in ("line", "area"):
        grain = raw.get("time_grain") if raw.get("time_grain") in TIME_GRAINS else "month"
        w["time_grain"] = grain if kinds[w["x"]] == "date" else None
    if wtype == "bar":
        w["sort"] = raw.get("sort") if raw.get("sort") in BAR_SORTS else "desc"
    if wtype in LIMITS:
        default, high = LIMITS[wtype]
        w["limit"] = _int(raw.get("limit"), default, 1, high)
    if not w["title"]:
        w["title"] = _default_title(w)
    w["layout"], order = _layout(raw.get("layout"), wtype)
    return w, order


def _pack(widgets):
    """Left-to-right rows on the 12-column grid, in reading order; no overlaps."""
    x = y = row_height = 0
    for w in widgets:
        width, height = w["layout"]["w"], w["layout"]["h"]
        if x + width > GRID_COLUMNS:
            x, y, row_height = 0, y + row_height, 0
        w["layout"] = {"x": x, "y": y, "w": width, "h": height}
        x += width
        row_height = max(row_height, height)


def _assign_ids(items, prefix):
    used = set()
    for item in items:
        valid = isinstance(item["id"], str) and _ID_RE.match(item["id"])
        if valid and item["id"] not in used:
            used.add(item["id"])
        else:
            item["id"] = None
    n = 1
    for item in items:
        if item["id"] is None:
            while f"{prefix}{n}" in used:
                n += 1
            item["id"] = f"{prefix}{n}"
            used.add(item["id"])


def _filters(raw_filters, kinds, warnings):
    out, seen = [], set()
    for raw in raw_filters if isinstance(raw_filters, list) else []:
        if not isinstance(raw, dict):
            continue
        column = raw.get("column")
        if column not in kinds:
            warnings.append(f"ตัดตัวกรอง: ไม่มีคอลัมน์ {column}")
            continue
        if column in seen or len(out) >= MAX_FILTERS:
            continue
        seen.add(column)
        out.append({"id": raw.get("id"), "column": column,
                    "type": "date_range" if kinds[column] == "date" else "select",
                    "label": _text(raw.get("label"), 40) or column})
    return out


def validate_spec(raw, profile):
    """(spec, warnings). Raises SpecError when raw is not an object or no widget survives."""
    if not isinstance(raw, dict):
        raise SpecError("สเปกต้องเป็น JSON object")
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    warnings = []
    raw_widgets = raw.get("widgets") if isinstance(raw.get("widgets"), list) else []
    if len(raw_widgets) > MAX_WIDGETS:
        warnings.append(f"ใช้ {MAX_WIDGETS} วิดเจ็ตแรก จาก {len(raw_widgets)}")
    placed = []
    for index, item in enumerate(raw_widgets[:MAX_WIDGETS]):
        result = _widget(item, kinds, warnings)
        if result:
            widget, order = result
            placed.append((order, index, widget))
    if not placed:
        raise SpecError("ไม่มีวิดเจ็ตที่ใช้ได้")
    widgets = [w for _, _, w in sorted(placed, key=lambda p: (p[0], p[1]))]
    _assign_ids(widgets, "w")
    _pack(widgets)
    filters = _filters(raw.get("filters"), kinds, warnings)
    _assign_ids(filters, "f")
    return {"version": SPEC_VERSION, "title": _text(raw.get("title"), 120) or "แดชบอร์ด",
            "description": _text(raw.get("description"), 300),
            "audience": raw.get("audience") if raw.get("audience") in AUDIENCES else "business",
            "filters": filters, "widgets": widgets}, warnings


def diff_specs(old, new):
    """What a refinement changed, by widget id; titles are what the user sees."""
    before = {w["id"]: w for w in old["widgets"]}
    after = {w["id"]: w for w in new["widgets"]}
    common = [i for i in after if i in before]

    def content(w):
        return {k: v for k, v in w.items() if k != "layout"}

    old_filters = {f["column"] for f in old["filters"]}
    new_filters = {f["column"] for f in new["filters"]}
    return {"added": [after[i]["title"] for i in after if i not in before],
            "removed": [before[i]["title"] for i in before if i not in after],
            "changed": [after[i]["title"] for i in common if content(after[i]) != content(before[i])],
            "layout_changed": any(after[i]["layout"] != before[i]["layout"] for i in common),
            "filters_added": sorted(new_filters - old_filters),
            "filters_removed": sorted(old_filters - new_filters)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2
Expected: PASS ทั้ง 11 test

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_spec.py services/api/tests/test_dashboard_spec.py
git commit -m "feat(api): dashboard spec v1 with a whitelist validator and refinement diff"
```

---

### Task 3: คำนวณข้อมูลของวิดเจ็ตและตัวกรอง

**Files:**
- Create: `services/api/app/api/dashboard_compute.py`
- Test: `services/api/tests/test_dashboard_compute.py`

**Interfaces:**
- Consumes: `prepare_frame` (Task 1), `validate_spec` (Task 2), `_records_json_safe` จาก `data_export.py`
- Produces:
  - `EMPTY = "(ว่าง)"`, `OTHER = "อื่นๆ"`, `MAX_SERIES = 8`
  - `apply_filters(df, selections, kinds) -> DataFrame`
  - `filter_options(df, spec) -> {column: {"values": [str]} | {"min": "YYYY-MM-DD", "max": "YYYY-MM-DD"}}`
  - `compute_dashboard(df, spec, profile, selections=None) -> {"widgets": {id: data}, "filter_options", "rows_total", "rows_after_filter"}`
  - `_COMPUTE` (dict ชนิดวิดเจ็ต → ฟังก์ชัน; test ใช้แทนค่า)

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_dashboard_compute.py`:

```python
import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_compute  # noqa: E402
from app.api.dashboard_compute import compute_dashboard  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import validate_spec  # noqa: E402

RAW = pd.DataFrame({
    "order_date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28", "2025-03-10", "2025-03-11"],
    "region": ["North", "South", "North", "East", "South", None],
    "segment": ["A", "A", "B", "B", "C", "A"],
    "amount": [100.0, 200.0, 50.0, 80.0, 40.0, 30.0],
})
DF, PROFILE = prepare_frame(RAW.copy())
SUM = {"agg": "sum", "column": "amount"}


def run(widget, selections=None, filters=()):
    spec, _ = validate_spec({"widgets": [widget], "filters": list(filters)}, PROFILE)
    return compute_dashboard(DF, spec, PROFILE, selections)


def one(widget, selections=None):
    result = run(widget, selections)
    (data,) = result["widgets"].values()
    return data


def test_kpi_aggregations():
    assert one({"type": "kpi", "metric": SUM})["value"] == 500.0
    assert one({"type": "kpi", "metric": {"agg": "count", "column": None}})["value"] == 6
    assert one({"type": "kpi", "metric": {"agg": "count_distinct", "column": "region"}})["value"] == 3
    assert one({"type": "kpi", "metric": {"agg": "avg", "column": "amount"}})["value"] == pytest.approx(83.3333)


def test_kpi_compares_the_latest_period_with_the_one_before():
    data = one({"type": "kpi", "metric": SUM, "compare": {"date_column": "order_date", "time_grain": "month"}})
    assert data == {"value": 500.0, "current": 70.0, "previous": 130.0, "period": "2025-03-01", "change_pct": -46.2}


def test_bar_sorts_and_limits_and_names_empty_values():
    data = one({"type": "bar", "x": "region", "metric": SUM})
    assert data == {"series": ["value"], "rows": [
        {"x": "South", "value": 240.0}, {"x": "North", "value": 150.0},
        {"x": "East", "value": 80.0}, {"x": "(ว่าง)", "value": 30.0}]}
    assert [r["x"] for r in one({"type": "bar", "x": "region", "metric": SUM, "limit": 2})["rows"]] == ["South", "North"]
    assert [r["x"] for r in one({"type": "bar", "x": "region", "metric": SUM, "sort": "x"})["rows"]] == [
        "(ว่าง)", "East", "North", "South"]


def test_bar_with_group_by_gives_one_series_per_group():
    data = one({"type": "bar", "x": "region", "metric": SUM, "group_by": "segment"})
    assert data["series"] == ["A", "B", "C"]
    assert data["rows"][0] == {"x": "South", "A": 200.0, "B": None, "C": 40.0}


def test_groups_beyond_the_series_limit_are_folded_into_other(monkeypatch):
    monkeypatch.setattr(dashboard_compute, "MAX_SERIES", 2)
    data = one({"type": "bar", "x": "region", "metric": SUM, "group_by": "segment"})
    assert data["series"] == ["A", "B", "อื่นๆ"]
    assert data["rows"][0] == {"x": "South", "A": 200.0, "B": None, "อื่นๆ": 40.0}


def test_line_buckets_dates_by_month_in_time_order():
    data = one({"type": "line", "x": "order_date", "time_grain": "month", "metric": SUM})
    assert data["rows"] == [{"x": "2025-01-01", "value": 300.0}, {"x": "2025-02-01", "value": 130.0},
                            {"x": "2025-03-01", "value": 70.0}]


def test_pie_keeps_the_biggest_slices_and_sums_the_rest():
    data = one({"type": "pie", "x": "region", "metric": SUM, "limit": 2})
    assert data["rows"] == [{"x": "South", "value": 240.0}, {"x": "North", "value": 150.0},
                            {"x": "อื่นๆ", "value": 110.0}]


def test_table_orders_and_limits_rows_but_reports_the_total():
    data = one({"type": "table", "columns": ["region", "amount"], "order_by": {"column": "amount", "desc": True}, "limit": 2})
    assert data == {"columns": ["region", "amount"], "total_rows": 6,
                    "rows": [{"region": "South", "amount": 200.0}, {"region": "North", "amount": 100.0}]}


def test_selections_filter_every_widget():
    kpi = {"type": "kpi", "metric": SUM}
    assert one(kpi, {"region": {"values": ["North"]}})["value"] == 150.0
    assert one(kpi, {"region": {"values": ["(ว่าง)"]}})["value"] == 30.0
    assert one(kpi, {"order_date": {"from": "2025-02-01", "to": "2025-02-28"}})["value"] == 130.0
    assert one(kpi, {"order_date": {"from": "", "to": None}})["value"] == 500.0
    assert one(kpi, {"province": {"values": ["x"]}, "region": "North"})["value"] == 500.0
    result = run(kpi, {"segment": {"values": ["A"]}})
    assert result["rows_total"] == 6 and result["rows_after_filter"] == 3


def test_filter_options_come_from_the_unfiltered_data():
    result = run({"type": "kpi", "metric": SUM}, {"region": {"values": ["North"]}},
                 filters=[{"column": "region"}, {"column": "order_date"}])
    assert result["filter_options"] == {"region": {"values": ["East", "North", "South"]},
                                        "order_date": {"min": "2025-01-05", "max": "2025-03-11"}}


def test_one_broken_widget_does_not_blank_the_others(monkeypatch):
    def boom(df, widget):
        raise ValueError("boom")

    monkeypatch.setitem(dashboard_compute._COMPUTE, "bar", boom)
    spec, _ = validate_spec({"widgets": [{"id": "k", "type": "kpi", "metric": SUM},
                                         {"id": "b", "type": "bar", "x": "region", "metric": SUM}]}, PROFILE)
    widgets = compute_dashboard(DF, spec, PROFILE)["widgets"]
    assert widgets["k"]["value"] == 500.0
    assert widgets["b"] == {"error": "คำนวณวิดเจ็ตนี้ไม่ได้: boom"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboard_compute.py"`
Expected: FAIL ด้วย `ImportError: cannot import name 'dashboard_compute'`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/api/app/api/dashboard_compute.py`:

```python
"""Chart-ready numbers for a validated dashboard spec (pandas, in the API process).

Every column and aggregation reaching this module was accepted by validate_spec(), so
the work here is plain group-by arithmetic over the active-layer DataFrame."""
import pandas as pd

from .data_export import _records_json_safe

EMPTY = "(ว่าง)"
OTHER = "อื่นๆ"
MAX_SERIES = 8
MAX_POINTS = 500
MAX_FILTER_OPTIONS = 100
_PERIODS = {"day": "D", "week": "W", "month": "M", "quarter": "Q", "year": "Y"}
_REDUCERS = {"sum": "sum", "avg": "mean", "min": "min", "max": "max"}


def _value(v):
    if v is None or pd.isna(v):
        return None
    return round(float(v), 4)


def _day(v):
    return None if pd.isna(v) else pd.Timestamp(v).date().isoformat()


def _labels(series):
    return series.astype("string").fillna(EMPTY)


def _bucket(series, grain):
    return series.dt.to_period(_PERIODS[grain]).dt.start_time


def _aggregate(frame, metric):
    agg, column = metric["agg"], metric["column"]
    if agg == "count":
        return len(frame)
    if agg == "count_distinct":
        return int(frame[column].nunique())
    numbers = pd.to_numeric(frame[column], errors="coerce")
    return _value(getattr(numbers, _REDUCERS[agg])())


def _grouped(frame, keys, metric):
    groups = frame.groupby(keys, sort=False)
    agg, column = metric["agg"], metric["column"]
    if agg == "count":
        return groups.size()
    if agg == "count_distinct":
        return groups[column].nunique()
    return groups[column].agg(_REDUCERS[agg])


def _top(totals, limit, ascending=False):
    return list(totals.sort_values(ascending=ascending, kind="stable").index[:limit])


def _pivot_rows(frame, keys, metric, group):
    """rows [{"x": key, <series>: value}] for the given x keys, and the series names."""
    if not group:
        totals = _grouped(frame, ["_x"], metric)
        return [{"x": k, "value": _value(totals.get(k))} for k in keys], ["value"]
    frame = frame.assign(_g=_labels(frame[group]))
    totals = _grouped(frame, ["_g"], metric)
    names = _top(totals, MAX_SERIES)
    if len(totals) > MAX_SERIES:
        frame = frame.assign(_g=frame["_g"].where(frame["_g"].isin(names), OTHER))
        names = names + [OTHER]
    cells = _grouped(frame, ["_x", "_g"], metric)
    return [{"x": k, **{s: _value(cells.get((k, s))) for s in names}} for k in keys], names


def _kpi(df, w):
    out = {"value": _value(_aggregate(df, w["metric"]))}
    compare = w.get("compare")
    if compare:
        buckets = _bucket(df[compare["date_column"]], compare["time_grain"])
        periods = sorted(buckets.dropna().unique())
        if len(periods) >= 2:
            current = _aggregate(df[buckets == periods[-1]], w["metric"])
            previous = _aggregate(df[buckets == periods[-2]], w["metric"])
            change = round((current - previous) / abs(previous) * 100, 1) if previous and current is not None else None
            out.update(current=_value(current), previous=_value(previous),
                       period=_day(periods[-1]), change_pct=change)
    return out


def _bar(df, w):
    frame = df.assign(_x=_labels(df[w["x"]]))
    totals = _grouped(frame, ["_x"], w["metric"])
    if w["sort"] == "x":
        keys = sorted(totals.index)[: w["limit"]]
    else:
        keys = _top(totals, w["limit"], ascending=(w["sort"] == "asc"))
    rows, series = _pivot_rows(frame[frame["_x"].isin(keys)], keys, w["metric"], w["group_by"])
    return {"rows": rows, "series": series}


def _pie(df, w):
    frame = df.assign(_x=_labels(df[w["x"]]))
    totals = _grouped(frame, ["_x"], w["metric"])
    keys = _top(totals, w["limit"])
    if len(totals) > len(keys):
        frame = frame.assign(_x=frame["_x"].where(frame["_x"].isin(keys), OTHER))
        totals = _grouped(frame, ["_x"], w["metric"])
        keys = keys + [OTHER]
    return {"rows": [{"x": k, "value": _value(totals.get(k))} for k in keys], "series": ["value"]}


def _time(df, w):
    x = w["x"]
    frame = df.assign(_t=_bucket(df[x], w["time_grain"]) if w["time_grain"] else df[x]).dropna(subset=["_t"])
    points = sorted(frame["_t"].unique())[-MAX_POINTS:]
    label = _day if w["time_grain"] else _value
    frame = frame[frame["_t"].isin(points)]
    frame = frame.assign(_x=frame["_t"].map(label))
    rows, series = _pivot_rows(frame, [label(t) for t in points], w["metric"], w["group_by"])
    return {"rows": rows, "series": series}


def _table(df, w):
    frame = df[w["columns"]]
    order = w.get("order_by")
    if order:
        frame = frame.sort_values(order["column"], ascending=not order["desc"], na_position="last", kind="stable")
    return {"columns": w["columns"], "rows": _records_json_safe(frame.head(w["limit"])), "total_rows": len(df)}


_COMPUTE = {"kpi": _kpi, "bar": _bar, "line": _time, "area": _time, "pie": _pie, "donut": _pie, "table": _table}


def _timestamp(value):
    if not value:
        return None
    try:
        ts = pd.Timestamp(value)
    except (TypeError, ValueError):
        return None
    return None if pd.isna(ts) else ts


def apply_filters(df, selections, kinds):
    """Rows matching the viewer's choices. {"values": [...]} matches the labels the charts
    show, so a drill-down click on "(ว่าง)" works; {"from", "to"} on a date column includes
    both days. Unknown columns and malformed selections are ignored."""
    for column, selection in (selections or {}).items():
        if column not in kinds or not isinstance(selection, dict):
            continue
        values = selection.get("values")
        if isinstance(values, list) and values:
            df = df[_labels(df[column]).isin([str(v) for v in values])]
        if kinds[column] == "date":
            start, end = _timestamp(selection.get("from")), _timestamp(selection.get("to"))
            if start is not None:
                df = df[df[column] >= start]
            if end is not None:
                df = df[df[column] < end + pd.Timedelta(days=1)]
    return df


def filter_options(df, spec):
    options = {}
    for f in spec["filters"]:
        column = df[f["column"]]
        if f["type"] == "date_range":
            options[f["column"]] = {"min": _day(column.min()), "max": _day(column.max())}
        else:
            values = sorted(column.dropna().astype("string").unique().tolist())
            options[f["column"]] = {"values": values[:MAX_FILTER_OPTIONS]}
    return options


def compute_dashboard(df, spec, profile, selections=None):
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    filtered = apply_filters(df, selections, kinds)
    widgets = {}
    for w in spec["widgets"]:
        try:
            widgets[w["id"]] = _COMPUTE[w["type"]](filtered, w)
        except Exception as exc:  # one broken widget must not blank the whole dashboard
            widgets[w["id"]] = {"error": f"คำนวณวิดเจ็ตนี้ไม่ได้: {exc}"}
    return {"widgets": widgets, "filter_options": filter_options(df, spec),
            "rows_total": len(df), "rows_after_filter": len(filtered)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2
Expected: PASS ทั้ง 11 test

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_compute.py services/api/tests/test_dashboard_compute.py
git commit -m "feat(api): compute dashboard widgets, filters and drill-down selections with pandas"
```

---

### Task 4: LLM (Groq) สร้างและปรับ spec

**Files:**
- Create: `services/api/app/api/dashboard_llm.py`
- Test: `services/api/tests/test_dashboard_llm.py`

**Interfaces:**
- Consumes: `validate_spec`, `diff_specs`, `SpecError` และค่าคงที่จาก Task 2; `_get_groq_api_key()` จาก `whitebox.py`; `get_system_settings()` จาก `system.py`
- Produces:
  - `class LLMUnavailable(RuntimeError)`
  - `groq_settings() -> (api_key, model)`
  - `call_groq(messages, api_key, model) -> str` (content ของคำตอบ)
  - `profile_for_prompt(profile) -> dict`
  - `build_generate_messages(table_name, profile, context, audience) -> list[dict]`
  - `build_refine_messages(table_name, profile, spec, instruction) -> list[dict]`
  - `parse_json_object(text) -> dict` (raise `SpecError`)
  - `fallback_spec(profile, context="") -> dict` (spec ดิบ ต้องผ่าน `validate_spec`)
  - `generate_spec(table_name, profile, context, audience) -> {"spec", "warnings", "engine": "groq" | "rules", "model"}`
  - `refine_spec(table_name, profile, spec, instruction) -> {"spec", "warnings", "engine": "groq", "model", "changes"}` (raise `LLMUnavailable` หรือ `SpecError`)

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_dashboard_llm.py`:

```python
import json
import os
import sys

import pandas as pd
import pytest
import requests

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_llm  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import SpecError, validate_spec  # noqa: E402

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboard_llm.py"`
Expected: FAIL ด้วย `ImportError: cannot import name 'dashboard_llm'`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/api/app/api/dashboard_llm.py`:

```python
"""LLM side of the Create Dashboard tab (Groq, OpenAI-compatible chat completions).

The prompt carries the dataset's column profile (names, kinds, distinct and missing
counts, numeric and date ranges) and the user's request. It never carries rows or
category labels, so dataset values do not leave the system. The LLM answers with a
spec (dashboard_spec.py) that is validated before anything is computed. Without a key,
or when Groq fails, generation uses a rule-based spec and refinement reports that the AI
is unavailable."""
import json
import logging
import os

import requests

from .dashboard_spec import (AGGREGATIONS, AUDIENCES, FORMATS, GRID_COLUMNS, MAX_ROW_SPAN, TIME_GRAINS,
                             WIDGET_TYPES, SpecError, diff_specs, validate_spec)
from .system import get_system_settings
from .whitebox import _get_groq_api_key

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"
TIMEOUT_S = 45


class LLMUnavailable(RuntimeError):
    """No key, Groq unreachable, or Groq answered with an error."""


SYSTEM_PROMPT = f"""You design business-intelligence dashboards in the style of Power BI and Databricks.
Reply with ONE JSON object and nothing else, following this schema:
{{
  "title": string,
  "description": string (one sentence),
  "audience": one of {json.dumps(list(AUDIENCES))},
  "filters": [{{"id": string, "column": string, "label": string}}],
  "widgets": [{{
    "id": string,
    "type": one of {json.dumps(list(WIDGET_TYPES))},
    "title": string,
    "metric": {{"agg": one of {json.dumps(list(AGGREGATIONS))}, "column": string or null}},
    "format": one of {json.dumps(list(FORMATS))},
    "x": string,
    "group_by": string or null,
    "stacked": boolean,
    "time_grain": one of {json.dumps(list(TIME_GRAINS))},
    "sort": "desc" | "asc" | "x",
    "limit": integer,
    "compare": {{"date_column": string, "time_grain": string}},
    "columns": [string],
    "order_by": {{"column": string, "desc": boolean}},
    "layout": {{"x": integer, "y": integer, "w": 1-{GRID_COLUMNS}, "h": 1-{MAX_ROW_SPAN}}}
  }}]
}}
Fields by widget type:
- kpi: metric, format, optional compare (change of the latest period against the one before).
- bar: x, metric, optional group_by and stacked, sort, limit (max 20).
- line, area: x must be a date or numeric column; time_grain for dates; optional group_by and stacked.
- pie, donut: x with few distinct values, metric, limit (max 8).
- table: columns, optional order_by, limit (max 200).
Rules:
- Use column names exactly as they appear in the profile. Never invent columns.
- sum, avg, min and max need a numeric column; count takes "column": null.
- The grid has {GRID_COLUMNS} columns. Put 3-4 kpi cards (w 3, h 2) on the first row, charts below (w 4 or 6, h 4) and a table last (w 12, h 5).
- Use 5-10 widgets and 1-3 filters on the most useful categorical or date columns.
- audience "management": headline kpis with compare and trends, no wide tables. "analyst": more breakdowns and a detail table. "business": balanced.
- Write the title, description, widget titles and filter labels in the language of the user's request."""

REFINE_RULES = """
You are EDITING the dashboard in "current_spec". Change only what "instruction" asks for.
Keep every other widget and filter exactly as it is, with the same id. Give new widgets new ids.
Return the complete updated spec."""


def groq_settings():
    """(api_key, model): the key in the same order as the other LLM features (the setting
    saved on the Rules page, then GROQ_API_KEY), the model from that setting or GROQ_MODEL."""
    key = _get_groq_api_key()
    try:
        model = get_system_settings().get("groq_model") or DEFAULT_MODEL
    except Exception:
        model = os.getenv("GROQ_MODEL", "").strip() or DEFAULT_MODEL
    return key, model


def call_groq(messages, api_key, model):
    try:
        res = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
                     "User-Agent": "SDOQAP-Dashboard-Builder/1.0"},
            json={"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 8192,
                  "response_format": {"type": "json_object"}},
            timeout=TIMEOUT_S,
        )
    except requests.RequestException as exc:
        raise LLMUnavailable(f"เชื่อมต่อ Groq ไม่ได้ ({exc.__class__.__name__})") from exc
    if res.status_code != 200:
        logger.warning("Groq returned HTTP %s: %s", res.status_code, res.text[:300])
        raise LLMUnavailable(f"Groq ตอบกลับ HTTP {res.status_code}")
    try:
        return res.json()["choices"][0]["message"]["content"] or ""
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise LLMUnavailable("Groq ตอบกลับในรูปแบบที่อ่านไม่ได้") from exc


def profile_for_prompt(profile):
    """The column profile without any cell value except numeric and date ranges."""
    columns = []
    for c in profile["columns"]:
        item = {"name": c["name"], "kind": c["kind"], "distinct": c["distinct"], "missing_pct": c["missing_pct"]}
        if c["kind"] in ("numeric", "date"):
            item["min"], item["max"] = c.get("min"), c.get("max")
        columns.append(item)
    return {"rows": profile["rows"], "columns": columns}


def build_generate_messages(table_name, profile, context, audience):
    user = {"dataset": table_name, "audience": audience, "request": context, "profile": profile_for_prompt(profile)}
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def build_refine_messages(table_name, profile, spec, instruction):
    user = {"dataset": table_name, "profile": profile_for_prompt(profile), "current_spec": spec,
            "instruction": instruction}
    return [{"role": "system", "content": SYSTEM_PROMPT + REFINE_RULES},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def parse_json_object(text):
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise SpecError("คำตอบของ AI ไม่มี JSON")
    try:
        return json.loads(text[start:end + 1])
    except ValueError as exc:
        raise SpecError(f"JSON จาก AI อ่านไม่ได้: {exc}") from exc


def _ask(messages, profile):
    """(spec, warnings, model). One retry that tells the LLM why its answer was rejected."""
    key, model = groq_settings()
    if not key:
        raise LLMUnavailable("ยังไม่ได้ตั้งค่า Groq API key")
    content = call_groq(messages, key, model)
    try:
        spec, warnings = validate_spec(parse_json_object(content), profile)
    except SpecError as exc:
        retry = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": f"That answer was rejected: {exc}. Reply again with the corrected JSON object only."},
        ]
        spec, warnings = validate_spec(parse_json_object(call_groq(retry, key, model)), profile)
    return spec, warnings, model


def fallback_spec(profile, context=""):
    """A sensible dashboard from the column kinds alone, used when the LLM is unavailable."""
    columns = profile["columns"]
    numeric = [c["name"] for c in columns if c["kind"] == "numeric"]
    dates = [c["name"] for c in columns if c["kind"] == "date"]
    categories = sorted((c for c in columns if c["kind"] == "categorical"), key=lambda c: c["distinct"])
    main = {"agg": "sum", "column": numeric[0]} if numeric else {"agg": "count", "column": None}
    widgets = [{"type": "kpi", "title": "จำนวนแถว", "metric": {"agg": "count", "column": None}}]
    widgets += [{"type": "kpi", "title": f"ผลรวม {n}", "metric": {"agg": "sum", "column": n}} for n in numeric[:3]]
    if dates:
        widgets.append({"type": "line", "title": f"แนวโน้มรายเดือนตาม {dates[0]}", "x": dates[0],
                        "time_grain": "month", "metric": main})
    if categories:
        widest = categories[-1]["name"]
        widgets.append({"type": "bar", "title": f"แยกตาม {widest}", "x": widest, "metric": main})
        if len(categories) > 1 and categories[0]["distinct"] <= 8:
            narrow = categories[0]["name"]
            widgets.append({"type": "donut", "title": f"สัดส่วนตาม {narrow}", "x": narrow, "metric": main})
    widgets.append({"type": "table", "title": "ตัวอย่างข้อมูล", "columns": [c["name"] for c in columns[:8]]})
    filters = [{"column": c["name"]} for c in categories[:2]] + [{"column": d} for d in dates[:1]]
    return {"title": "แดชบอร์ดภาพรวม", "description": context[:300], "widgets": widgets, "filters": filters}


def generate_spec(table_name, profile, context, audience):
    try:
        spec, warnings, model = _ask(build_generate_messages(table_name, profile, context, audience), profile)
        engine = "groq"
    except (LLMUnavailable, SpecError) as exc:
        logger.warning("Dashboard generation fell back to rules: %s", exc)
        spec, warnings = validate_spec(fallback_spec(profile, context), profile)
        warnings = [f"ใช้แดชบอร์ดอัตโนมัติแบบกฎแทน AI: {exc}"] + warnings
        engine, model = "rules", None
    spec["audience"] = audience
    return {"spec": spec, "warnings": warnings, "engine": engine, "model": model}


def refine_spec(table_name, profile, spec, instruction):
    """Raises LLMUnavailable or SpecError; there is no rule-based refinement."""
    new_spec, warnings, model = _ask(build_refine_messages(table_name, profile, spec, instruction), profile)
    return {"spec": new_spec, "warnings": warnings, "engine": "groq", "model": model,
            "changes": diff_specs(spec, new_spec)}
```

หมายเหตุสำหรับ `test_the_rule_based_spec_uses_the_column_kinds`: profile ใน test มี `region` เป็นหมวดหมู่ตัวเดียว (`customer` 60 ค่าไม่ซ้ำจึงเป็น text) และมีตัวเลขตัวเดียว (`amount`) ผลจึงเป็น kpi จำนวนแถว, kpi ผลรวม amount, line, bar และ table โดยไม่มี donut เพราะมีหมวดหมู่แค่ตัวเดียว

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2
Expected: PASS ทั้ง 13 test

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_llm.py services/api/tests/test_dashboard_llm.py
git commit -m "feat(api): Groq dashboard generation and refinement with a privacy-safe prompt and rule fallback"
```

---

### Task 5: Router `/api/v1/dashboards` (datasets, preview, generate, refine, render)

**Files:**
- Create: `services/api/app/api/dashboards.py`
- Modify: `services/api/main.py` (เพิ่ม import และ `include_router` ต่อจาก `auth_router`)
- Modify: `services/api/tests/test_route_contract.py` (เพิ่ม `CALLS`)
- Test: `services/api/tests/test_dashboards_api.py`

**Interfaces:**
- Consumes: `dashboard_data.load_active_dataset`, `dashboard_data.list_datasets`, `dashboard_data.preview_dataset` (Task 1); `validate_spec`, `SpecError`, `AUDIENCES` (Task 2); `compute_dashboard` (Task 3); `dashboard_llm.generate_spec`, `dashboard_llm.refine_spec`, `dashboard_llm.LLMUnavailable` (Task 4); `require_session` จาก `auth.py`; `get_es_client` จาก `config.py`
- Produces: `router` (prefix `/api/v1/dashboards`), `_es_or_none()`, `_checked_spec(raw, profile)`, `_audience(value)`, `DASHBOARDS_INDEX = "sdoqap_dashboards"` (Task 6 ใช้ต่อ) และ route ตามตาราง "API ใหม่"

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_dashboards_api.py`:

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
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_llm, dashboards  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402

RAW = pd.DataFrame({
    "order_date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28", "2025-03-10", "2025-03-11"],
    "region": ["North", "South", "North", "East", "South", None],
    "amount": [100.0, 200.0, 50.0, 80.0, 40.0, 30.0],
})
DF, PROFILE = dashboard_data.prepare_frame(RAW.copy())
SUM = {"agg": "sum", "column": "amount"}
SPEC = {"title": "ยอดขาย", "filters": [{"column": "region"}], "widgets": [
    {"id": "total", "type": "kpi", "title": "ยอดขายรวม", "metric": SUM},
    {"id": "by_region", "type": "bar", "title": "ตามภูมิภาค", "x": "region", "metric": SUM}]}


def client(logged_in=True):
    app = FastAPI()
    app.include_router(dashboards.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


@pytest.fixture(autouse=True)
def dataset(monkeypatch):
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))


def llm_answers(monkeypatch, *answers):
    queue = list(answers)
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", lambda messages, key, model: queue.pop(0))


def test_every_route_needs_a_login():
    c = client(logged_in=False)
    assert c.get("/api/v1/dashboards/datasets").status_code == 401
    assert c.get("/api/v1/dashboards/datasets/sales/preview").status_code == 401
    for path in ("generate", "refine", "render"):
        assert c.post(f"/api/v1/dashboards/{path}", json={}).status_code == 401


def test_datasets_lists_the_catalog(monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)
    monkeypatch.setattr(dashboard_data, "list_datasets", lambda es: [{"name": "sales"}])
    res = client().get("/api/v1/dashboards/datasets")
    assert res.status_code == 200 and res.json() == {"datasets": [{"name": "sales"}]}


def test_preview_returns_profile_and_sample():
    body = client().get("/api/v1/dashboards/datasets/sales/preview").json()
    assert body["profile"]["rows"] == 6 and len(body["sample"]) == 6


def test_generate_without_a_key_still_returns_a_computed_dashboard():
    res = client().post("/api/v1/dashboards/generate",
                        json={"table_name": "sales", "context": "ยอดขายรายเดือน", "audience": "management"})
    body = res.json()
    assert res.status_code == 200 and body["engine"] == "rules"
    assert body["spec"]["audience"] == "management"
    assert set(body["data"]["widgets"]) == {w["id"] for w in body["spec"]["widgets"]}
    assert "Groq API key" in body["warnings"][0]


def test_generate_with_the_llm_computes_its_spec(monkeypatch):
    llm_answers(monkeypatch, json.dumps(SPEC, ensure_ascii=False))
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": "sales", "context": "ยอดขาย", "audience": "business"}).json()
    assert body["engine"] == "groq" and body["model"] == "openai/gpt-oss-120b"
    assert body["data"]["widgets"]["total"]["value"] == 500.0


def test_generate_checks_its_input():
    c = client()
    assert c.post("/api/v1/dashboards/generate", json={"table_name": "sales", "context": "ยอดขาย", "audience": "ceo"}).status_code == 400
    assert c.post("/api/v1/dashboards/generate", json={"table_name": "sales", "context": "a"}).status_code == 422


def test_render_applies_the_viewer_selections():
    body = client().post("/api/v1/dashboards/render", json={
        "table_name": "sales", "spec": SPEC, "selections": {"region": {"values": ["North"]}}}).json()
    assert body["data"]["widgets"]["total"]["value"] == 150.0
    assert body["data"]["rows_after_filter"] == 2
    assert body["spec"]["widgets"][0]["layout"] == {"x": 0, "y": 0, "w": 3, "h": 2}


def test_render_rejects_a_spec_with_nothing_to_draw():
    res = client().post("/api/v1/dashboards/render", json={"table_name": "sales", "spec": {"widgets": []}})
    assert res.status_code == 422 and "ไม่มีวิดเจ็ต" in res.json()["detail"]


def test_refine_without_a_key_is_unavailable():
    res = client().post("/api/v1/dashboards/refine", json={"table_name": "sales", "spec": SPEC, "instruction": "เพิ่มกราฟ"})
    assert res.status_code == 503 and "Groq API key" in res.json()["detail"]


def test_refine_returns_the_new_spec_its_changes_and_numbers(monkeypatch):
    refined = dict(SPEC, widgets=SPEC["widgets"] + [
        {"id": "trend", "type": "line", "title": "ยอดขายรายเดือน", "x": "order_date", "metric": SUM}])
    llm_answers(monkeypatch, json.dumps(refined, ensure_ascii=False))
    body = client().post("/api/v1/dashboards/refine",
                         json={"table_name": "sales", "spec": SPEC, "instruction": "เพิ่มกราฟยอดขายรายเดือน"}).json()
    assert body["changes"]["added"] == ["ยอดขายรายเดือน"]
    assert body["data"]["widgets"]["trend"]["rows"][0] == {"x": "2025-01-01", "value": 300.0}


def test_refine_reports_an_unusable_llm_answer(monkeypatch):
    llm_answers(monkeypatch, "{}", "{}")
    res = client().post("/api/v1/dashboards/refine", json={"table_name": "sales", "spec": SPEC, "instruction": "เพิ่มกราฟ"})
    assert res.status_code == 422 and res.json()["detail"].startswith("AI ตอบสเปกที่ใช้ไม่ได้")
```

เพิ่มใน `CALLS` ของ `services/api/tests/test_route_contract.py` ก่อนบรรทัด `# infra/n8n/ingestion_workflow.json and infra/grafana alert_rules.yaml`:

```python
    # DashboardBuilder.jsx via utils/dashboardsApi.js
    same("GET", "/api/v1/dashboards/datasets"),
    ("GET", "/api/v1/dashboards/datasets/t1/preview", "/api/v1/dashboards/datasets/{table_name}/preview"),
    same("POST", "/api/v1/dashboards/generate"),
    same("POST", "/api/v1/dashboards/refine"),
    same("POST", "/api/v1/dashboards/render"),
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboards_api.py tests/test_route_contract.py"`
Expected: FAIL `test_dashboards_api.py` ด้วย `ImportError: cannot import name 'dashboards'` และ 5 กรณีใหม่ใน `test_route_contract.py` ล้มเพราะ `resolve()` คืน `None`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/api/app/api/dashboards.py`:

```python
"""Create Dashboard tab: list the Quality-Gate-passed datasets, preview one, let the LLM
draft a dashboard spec from the user's request, recompute it for the viewer's filters
and refine it with follow-up instructions."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import dashboard_data, dashboard_llm
from .auth import require_session
from .config import get_es_client
from .dashboard_compute import compute_dashboard
from .dashboard_spec import AUDIENCES, SpecError, validate_spec

router = APIRouter(prefix="/api/v1/dashboards", tags=["dashboards"], dependencies=[Depends(require_session)])

DASHBOARDS_INDEX = "sdoqap_dashboards"


class GeneratePayload(BaseModel):
    table_name: str
    context: str = Field(min_length=3, max_length=2000)
    audience: str = "business"


class RefinePayload(BaseModel):
    table_name: str
    spec: Dict[str, Any]
    instruction: str = Field(min_length=2, max_length=1000)


class RenderPayload(BaseModel):
    table_name: str
    spec: Dict[str, Any]
    selections: Dict[str, Any] = Field(default_factory=dict)


def _es_or_none():
    try:
        return get_es_client()
    except HTTPException:
        return None


def _checked_spec(raw, profile):
    try:
        return validate_spec(raw, profile)[0]
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"สเปกแดชบอร์ดใช้ไม่ได้: {exc}")


def _audience(value):
    if value not in AUDIENCES:
        raise HTTPException(status_code=400, detail=f"audience ต้องเป็นหนึ่งใน {', '.join(AUDIENCES)}")
    return value


@router.get("/datasets")
def list_dashboard_datasets():
    return {"datasets": dashboard_data.list_datasets(_es_or_none())}


@router.get("/datasets/{table_name}/preview")
def preview_dashboard_dataset(table_name: str):
    return dashboard_data.preview_dataset(table_name)


@router.post("/generate")
def generate_dashboard(payload: GeneratePayload):
    audience = _audience(payload.audience)
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    result = dashboard_llm.generate_spec(payload.table_name, profile, payload.context.strip(), audience)
    result["data"] = compute_dashboard(df, result["spec"], profile)
    return result


@router.post("/refine")
def refine_dashboard(payload: RefinePayload):
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    current = _checked_spec(payload.spec, profile)
    try:
        result = dashboard_llm.refine_spec(payload.table_name, profile, current, payload.instruction.strip())
    except dashboard_llm.LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"ปรับด้วย AI ไม่ได้ตอนนี้: {exc}")
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"AI ตอบสเปกที่ใช้ไม่ได้: {exc}")
    result["data"] = compute_dashboard(df, result["spec"], profile)
    return result


@router.post("/render")
def render_dashboard(payload: RenderPayload):
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    return {"spec": spec, "data": compute_dashboard(df, spec, profile, payload.selections)}
```

แก้ `services/api/main.py`: ต่อจากบรรทัด `from app.api.auth import router as auth_router` เพิ่ม

```python
from app.api.dashboards import router as dashboards_router
```

และต่อจากบรรทัด `app.include_router(auth_router)` เพิ่ม

```python
app.include_router(dashboards_router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2
Expected: PASS ทั้งหมด (11 test ใน `test_dashboards_api.py` และทุกกรณีใน `test_route_contract.py`)

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboards.py services/api/main.py services/api/tests/test_dashboards_api.py services/api/tests/test_route_contract.py
git commit -m "feat(api): /api/v1/dashboards routes for datasets, preview, generate, refine and render"
```

---

### Task 6: บันทึกและจัดการแดชบอร์ด (Elasticsearch)

**Files:**
- Modify: `services/api/app/api/dashboards.py` (เพิ่ม import, model `SavePayload`, helper และ 5 route)
- Modify: `services/api/tests/fakes.py` (เพิ่ม `FakeES.delete`)
- Modify: `services/api/tests/test_route_contract.py`
- Test: `services/api/tests/test_dashboards_saved.py`

**Interfaces:**
- Consumes: `router`, `_checked_spec`, `_audience`, `DASHBOARDS_INDEX` (Task 5); `dashboard_data.load_active_dataset` (Task 1)
- Produces: route `/api/v1/dashboards/saved` ตามตาราง โดยเอกสารเต็มที่ตอบกลับคือ `{"id", "name", "description", "table_name", "context", "audience", "spec", "refinements", "created_by", "created_at", "updated_at", "updated_by"}` และสรุปในรายการคือ `{"id", "name", "description", "table_name", "audience", "created_by", "created_at", "updated_at", "widget_count"}` ใน ES เก็บ spec เป็นสตริง `spec_json` เพราะฟิลด์ของแต่ละชนิดวิดเจ็ตต่างกัน ถ้าเก็บเป็น object จะทำให้ dynamic mapping ชนกัน

- [ ] **Step 1: Write the failing test**

เพิ่มใน `class FakeES` ของ `services/api/tests/fakes.py` ต่อจากเมธอด `update`:

```python
    def delete(self, index, id, refresh=None):
        try:
            del self.docs[index][id]
        except KeyError as exc:
            raise NotFound(id) from exc
```

สร้าง `services/api/tests/test_dashboards_saved.py`:

```python
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

from app.api import dashboard_data, dashboards  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

DF, PROFILE = dashboard_data.prepare_frame(pd.DataFrame({
    "region": ["North", "South"], "amount": [100.0, 200.0]}))
SUM = {"agg": "sum", "column": "amount"}
SPEC = {"title": "ยอดขาย", "filters": [{"column": "region"}], "widgets": [
    {"id": "total", "type": "kpi", "title": "ยอดขายรวม", "metric": SUM},
    {"id": "by_region", "type": "bar", "title": "ตามภูมิภาค", "x": "region", "metric": SUM}]}
BODY = {"name": "ยอดขายผู้บริหาร", "description": "ภาพรวมรายเดือน", "table_name": "sales",
        "context": "ยอดขายรายเดือน", "audience": "management", "spec": SPEC, "refinements": ["เพิ่ม Filter จังหวัด"]}
BASE = "/api/v1/dashboards/saved"


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    monkeypatch.setattr(dashboards, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    return fake


def client(logged_in=True):
    app = FastAPI()
    app.include_router(dashboards.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


def test_saved_routes_need_a_login(es):
    c = client(logged_in=False)
    assert c.get(BASE).status_code == 401
    assert c.post(BASE, json=BODY).status_code == 401


def test_save_then_open_returns_the_validated_spec_and_the_request(es):
    c = client()
    saved = c.post(BASE, json=BODY).json()
    assert len(saved["id"]) == 32 and saved["created_by"] == "tester"
    assert [w["id"] for w in saved["spec"]["widgets"]] == ["total", "by_region"]
    assert saved["spec"]["widgets"][1]["layout"] == {"x": 3, "y": 0, "w": 6, "h": 4}
    opened = c.get(f"{BASE}/{saved['id']}").json()
    assert opened == saved
    assert opened["context"] == "ยอดขายรายเดือน" and opened["refinements"] == ["เพิ่ม Filter จังหวัด"]
    assert "spec_json" not in opened


def test_the_list_is_empty_before_anything_is_saved_and_shows_summaries_after(es):
    c = client()
    assert c.get(BASE).json() == {"dashboards": []}
    saved = c.post(BASE, json=BODY).json()
    (item,) = c.get(BASE).json()["dashboards"]
    assert item["id"] == saved["id"] and item["name"] == "ยอดขายผู้บริหาร"
    assert item["widget_count"] == 2 and item["table_name"] == "sales"
    assert "spec" not in item and "spec_json" not in item


def test_update_keeps_who_created_it_and_when(es):
    c = client()
    saved = c.post(BASE, json=BODY).json()
    updated = c.put(f"{BASE}/{saved['id']}", json=dict(BODY, name="ยอดขาย Q4")).json()
    assert updated["name"] == "ยอดขาย Q4" and updated["id"] == saved["id"]
    assert updated["created_at"] == saved["created_at"] and updated["created_by"] == "tester"
    assert updated["updated_at"] >= saved["updated_at"]


def test_delete_removes_it(es):
    c = client()
    saved = c.post(BASE, json=BODY).json()
    assert c.delete(f"{BASE}/{saved['id']}").json() == {"status": "deleted", "id": saved["id"]}
    assert c.get(f"{BASE}/{saved['id']}").status_code == 404


def test_unknown_and_malformed_ids_are_not_found(es):
    c = client()
    c.post(BASE, json=BODY)
    assert c.get(f"{BASE}/{'0' * 32}").status_code == 404
    assert c.get(f"{BASE}/not-an-id").status_code == 404
    assert c.delete(f"{BASE}/{'0' * 32}").status_code == 404


def test_an_invalid_spec_is_not_saved(es):
    res = client().post(BASE, json=dict(BODY, spec={"widgets": []}))
    assert res.status_code == 422
    assert es.docs.get(dashboards.DASHBOARDS_INDEX, {}) == {}


def test_open_before_anything_is_saved_is_not_found(es):
    assert client().get(f"{BASE}/{'a' * 32}").status_code == 404
```

เพิ่มใน `CALLS` ของ `services/api/tests/test_route_contract.py` ต่อจากบรรทัด `same("POST", "/api/v1/dashboards/render"),`:

```python
    same("GET", "/api/v1/dashboards/saved"),
    same("POST", "/api/v1/dashboards/saved"),
    ("GET", "/api/v1/dashboards/saved/D1", "/api/v1/dashboards/saved/{dashboard_id}"),
    ("PUT", "/api/v1/dashboards/saved/D1", "/api/v1/dashboards/saved/{dashboard_id}"),
    ("DELETE", "/api/v1/dashboards/saved/D1", "/api/v1/dashboards/saved/{dashboard_id}"),
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboards_saved.py tests/test_route_contract.py"`
Expected: FAIL (route `/saved` ยังไม่มี จึงได้ 404/405 และ 5 กรณีใหม่ใน route contract ล้ม)

- [ ] **Step 3: Write minimal implementation**

แก้ `services/api/app/api/dashboards.py`:

แทนบรรทัด import ด้านบน `from typing import Any, Dict` ด้วย:

```python
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
```

ต่อจากบรรทัด `DASHBOARDS_INDEX = "sdoqap_dashboards"` เพิ่ม:

```python
_ID_RE = re.compile(r"^[a-f0-9]{32}$")
```

ต่อจาก `class RenderPayload` เพิ่ม:

```python
class SavePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    table_name: str
    context: str = Field(default="", max_length=2000)
    audience: str = "business"
    spec: Dict[str, Any]
    refinements: List[str] = Field(default_factory=list, max_length=50)
```

ต่อท้ายไฟล์ เพิ่ม:

```python
def _summary(doc):
    spec = json.loads(doc["spec_json"])
    keys = ("id", "name", "description", "table_name", "audience", "created_by", "created_at", "updated_at")
    return {**{k: doc.get(k) for k in keys}, "widget_count": len(spec.get("widgets", []))}


def _full(doc):
    out = {k: v for k, v in doc.items() if k != "spec_json"}
    out["spec"] = json.loads(doc["spec_json"])
    return out


def _find(es, dashboard_id):
    if not _ID_RE.match(dashboard_id) or not es.indices.exists(index=DASHBOARDS_INDEX):
        raise HTTPException(status_code=404, detail="ไม่พบแดชบอร์ดนี้")
    res = es.search(index=DASHBOARDS_INDEX, query={"bool": {"filter": [{"term": {"id.keyword": dashboard_id}}]}}, size=1)
    hits = res["hits"]["hits"]
    if not hits:
        raise HTTPException(status_code=404, detail="ไม่พบแดชบอร์ดนี้")
    return hits[0]["_source"]


def _document(payload, user, dashboard_id, created_at=None, created_by=None):
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    now = datetime.now(timezone.utc).isoformat()
    return {"id": dashboard_id, "name": payload.name.strip(), "description": payload.description.strip(),
            "table_name": payload.table_name, "context": payload.context, "audience": _audience(payload.audience),
            # A string, not an object: widget fields differ by type and would fight over one ES mapping.
            "spec_json": json.dumps(spec, ensure_ascii=False), "refinements": payload.refinements,
            "created_by": created_by or user, "created_at": created_at or now, "updated_at": now, "updated_by": user}


@router.get("/saved")
def list_saved_dashboards():
    es = get_es_client()
    if not es.indices.exists(index=DASHBOARDS_INDEX):
        return {"dashboards": []}
    res = es.search(index=DASHBOARDS_INDEX, query={"match_all": {}}, size=100,
                    sort=[{"updated_at": {"order": "desc"}}])
    return {"dashboards": [_summary(h["_source"]) for h in res["hits"]["hits"]]}


@router.post("/saved")
def create_saved_dashboard(payload: SavePayload, user: str = Depends(require_session)):
    es = get_es_client()
    doc = _document(payload, user, uuid.uuid4().hex)
    es.index(index=DASHBOARDS_INDEX, id=doc["id"], document=doc, refresh="wait_for")
    return _full(doc)


@router.get("/saved/{dashboard_id}")
def get_saved_dashboard(dashboard_id: str):
    return _full(_find(get_es_client(), dashboard_id))


@router.put("/saved/{dashboard_id}")
def update_saved_dashboard(dashboard_id: str, payload: SavePayload, user: str = Depends(require_session)):
    es = get_es_client()
    existing = _find(es, dashboard_id)
    doc = _document(payload, user, dashboard_id, existing.get("created_at"), existing.get("created_by"))
    es.index(index=DASHBOARDS_INDEX, id=dashboard_id, document=doc, refresh="wait_for")
    return _full(doc)


@router.delete("/saved/{dashboard_id}")
def delete_saved_dashboard(dashboard_id: str):
    es = get_es_client()
    _find(es, dashboard_id)
    es.delete(index=DASHBOARDS_INDEX, id=dashboard_id, refresh="wait_for")
    return {"status": "deleted", "id": dashboard_id}
```

แก้ docstring ด้านบนของไฟล์ให้ลงท้ายว่า `... refine it with follow-up instructions and save it (ES index sdoqap_dashboards).`

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่งเดียวกับ Step 2 แล้วรันทั้งชุดเพื่อดูว่า `FakeES.delete` ไม่ทำให้ test อื่นพัง:
`MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests"`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboards.py services/api/tests/fakes.py services/api/tests/test_dashboards_saved.py services/api/tests/test_route_contract.py
git commit -m "feat(api): save, open, update and delete generated dashboards"
```

---

### Task 7: API client, ตัวจัดรูปแบบตัวเลข, ลงทะเบียนหน้า และขั้นที่ 1 (เลือกชุดข้อมูล)

**Files:**
- Create: `services/ui/src/utils/numberFormat.js`, `services/ui/src/utils/numberFormat.test.js`
- Create: `services/ui/src/utils/dashboardsApi.js`, `services/ui/src/utils/dashboardsApi.test.js`
- Create: `services/ui/src/components/builder/DatasetPicker.jsx`
- Create: `services/ui/src/pages/DashboardBuilder.jsx`, `services/ui/src/pages/DashboardBuilder.css`, `services/ui/src/pages/DashboardBuilder.test.jsx`
- Modify: `services/ui/src/config/pages.js`, `services/ui/src/config/pages.test.js`, `services/ui/src/App.jsx`, `services/ui/src/components/NavBar.jsx`

**Interfaces:**
- Consumes: route จาก Task 5–6; `friendlyApiError(detail, fallback)` จาก `utils/apiError.js`; `PageHeader` จาก `components/ui`
- Produces:
  - `formatValue(value, format = "number") -> string`
  - `dashboardsApi.{listDatasets(), previewDataset(table), generate(table, context, audience), refine(table, spec, instruction), render(table, spec, selections), listSaved(), getSaved(id), createSaved(doc), updateSaved(id, doc), deleteSaved(id)}` ทุกตัวคืน Promise ของ JSON และ throw `Error(ข้อความที่อ่านเข้าใจได้)`
  - `KIND_LABELS`, `describeKinds(counts)`, `formatDate(iso)` และ `DatasetPicker({ selected, onSelect })` จาก `DatasetPicker.jsx`
  - หน้า key `builder` ที่ path `/dashboard-builder`, `STEPS` (export จาก `DashboardBuilder.jsx`)
  - class CSS ทั้งหมดที่ขึ้นต้นด้วย `dbb-` (Task 8–11 ใช้ต่อ)

- [ ] **Step 1: Write the failing test**

สร้าง `services/ui/src/utils/numberFormat.test.js`:

```js
import { it, expect } from "vitest";
import { formatValue } from "./numberFormat";

it("shortens big numbers the way BI cards do", () => {
  expect(formatValue(1770000)).toBe("1.77M");
  expect(formatValue(12200)).toBe("12.2K");
  expect(formatValue(93)).toBe("93");
  expect(formatValue(1234.567)).toBe("1,234.57");
});

it("formats currency and percent", () => {
  expect(formatValue(21900, "currency")).toBe("฿21.9K");
  expect(formatValue(95.1, "percent")).toBe("95.1%");
});

it("shows a dash for missing values", () => {
  for (const v of [null, undefined, ""]) expect(formatValue(v)).toBe("—");
});
```

สร้าง `services/ui/src/utils/dashboardsApi.test.js`:

```js
import { it, expect } from "vitest";
import { dashboardsApi } from "./dashboardsApi";
import { mockFetchByUrl } from "../test/renderPage";

it("sends JSON and returns the body", async () => {
  const fetchMock = mockFetchByUrl([["/dashboards/generate", { body: { engine: "groq" } }]]);
  const result = await dashboardsApi.generate("sales", "ยอดขาย", "business");
  expect(result.engine).toBe("groq");
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/dashboards/generate");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({ table_name: "sales", context: "ยอดขาย", audience: "business" });
});

it("turns the API detail into the error message", async () => {
  mockFetchByUrl([["/dashboards/refine", { status: 503, body: { detail: "ปรับด้วย AI ไม่ได้ตอนนี้: ยังไม่ได้ตั้งค่า Groq API key" } }]]);
  await expect(dashboardsApi.refine("sales", {}, "เพิ่มกราฟ")).rejects.toThrow("ยังไม่ได้ตั้งค่า Groq API key");
});

it("does not show server paths from an error", async () => {
  mockFetchByUrl([["/dashboards/datasets", { status: 404, body: { detail: "Delta log not found at /data/active/sales/_delta_log" } }]]);
  await expect(dashboardsApi.listDatasets()).rejects.toThrow("คำขอล้มเหลว (HTTP 404)");
});
```

สร้าง `services/ui/src/pages/DashboardBuilder.test.jsx`:

```jsx
import { it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import DashboardBuilder from "./DashboardBuilder";

const DATASETS = { datasets: [
  { name: "sales", source: "File upload", records: 1200, columns: 6,
    kind_counts: { numeric: 2, categorical: 3, date: 1, text: 0 }, last_updated: "2026-10-01T03:00:00Z", error: null },
  { name: "broken", source: null, records: null, columns: null, kind_counts: null, last_updated: null,
    error: "Delta log not found at /data/active/broken/_delta_log" }
] };

it("lists the datasets that passed the quality gate with their key facts", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: DATASETS }]]);
  expect(screen.getByText("sales")).toBeInTheDocument();
  expect(screen.getByText("File upload")).toBeInTheDocument();
  expect(screen.getByText("1,200")).toBeInTheDocument();
  expect(screen.getByText("ตัวเลข 2 · หมวดหมู่ 3 · วันที่ 1")).toBeInTheDocument();
  expect(screen.getByText("อ่านชุดข้อมูลนี้ไม่ได้")).toBeInTheDocument();
  expect(screen.queryByText(/\/data\/active/)).toBeNull();
});

it("enables the next step only after a readable dataset is chosen", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: DATASETS }]]);
  const next = screen.getByRole("button", { name: "ถัดไป" });
  expect(next).toBeDisabled();
  expect(screen.getByRole("radio", { name: "เลือก broken" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  expect(next).toBeEnabled();
});

it("points to ingestion when no dataset has passed the gate yet", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: { datasets: [] } }]]);
  expect(screen.getByText("ยังไม่มีชุดข้อมูลที่ผ่าน Quality Gate")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "นำเข้าข้อมูล" })).toHaveAttribute("href", "/ingestion");
});
```

แก้ `services/ui/src/config/pages.test.js` ใน test `"covers every routed path in App.jsx"` ให้รายการ `routed` มี `"/dashboard-builder"` ด้วย:

```js
    const routed = ["/", "/dashboard", "/dashboard-builder", "/analytics", "/pipeline", "/schema", "/rules", "/guide", "/ingestion", "/export", "/whitebox"];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/utils/numberFormat.test.js src/utils/dashboardsApi.test.js src/pages/DashboardBuilder.test.jsx src/config/pages.test.js`
Expected: FAIL (โมดูลยังไม่มี และ `/dashboard-builder` ยังไม่อยู่ใน `PAGES`)

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/ui/src/utils/numberFormat.js`:

```js
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

// KPI and axis numbers: 1,234.57 below ten thousand, 12.2K / 1.77M above.
export function formatValue(value, format = "number") {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const text = Math.abs(n) >= 10000 ? compact.format(n) : plain.format(n);
  if (format === "percent") return `${text}%`;
  if (format === "currency") return `฿${text}`;
  return text;
}
```

สร้าง `services/ui/src/utils/dashboardsApi.js`:

```js
import { friendlyApiError } from "./apiError";

const BASE = "/api/v1/dashboards";

async function request(path, { method = "GET", body } = {}) {
  const options = { method, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, options);
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
    throw new Error(friendlyApiError(detail, `คำขอล้มเหลว (HTTP ${res.status})`));
  }
  return data;
}

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

สร้าง `services/ui/src/components/builder/DatasetPicker.jsx`:

```jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { friendlyApiError } from "../../utils/apiError";

export const KIND_LABELS = { numeric: "ตัวเลข", categorical: "หมวดหมู่", date: "วันที่", text: "ข้อความ" };

export function describeKinds(counts) {
  if (!counts) return "—";
  const parts = Object.entries(KIND_LABELS)
    .filter(([kind]) => counts[kind] > 0)
    .map(([kind, label]) => `${label} ${counts[kind]}`);
  return parts.length ? parts.join(" · ") : "—";
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function DatasetPicker({ selected, onSelect }) {
  const [datasets, setDatasets] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardsApi.listDatasets()
      .then((res) => setDatasets(res.datasets || []))
      .catch((e) => { setError(e.message); setDatasets([]); });
  }, []);

  if (datasets === null) return <p className="dbb-muted">กำลังโหลดชุดข้อมูล…</p>;
  if (error) return <p role="alert" className="dbb-error">{error}</p>;
  if (datasets.length === 0) {
    return (
      <div className="dbb-empty">
        <p>ยังไม่มีชุดข้อมูลที่ผ่าน Quality Gate</p>
        <Link to="/ingestion">นำเข้าข้อมูล</Link>
      </div>
    );
  }
  return (
    <div className="dbb-scroll">
      <table className="dbb-table">
        <thead>
          <tr>
            <th aria-label="เลือก" />
            <th>ชุดข้อมูล</th>
            <th>แหล่งที่มา</th>
            <th>จำนวนแถว</th>
            <th>คอลัมน์</th>
            <th>ชนิดข้อมูล</th>
            <th>อัปเดตล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((d) => {
            const isSelected = selected?.name === d.name;
            return (
              <tr key={d.name} className={isSelected ? "is-selected" : ""}>
                <td>
                  <input
                    type="radio"
                    name="dbb-dataset"
                    aria-label={`เลือก ${d.name}`}
                    checked={isSelected}
                    disabled={Boolean(d.error)}
                    onChange={() => onSelect(d)}
                  />
                </td>
                <td>
                  <strong>{d.name}</strong>
                  {d.error && <div className="dbb-error-inline">{friendlyApiError(d.error, "อ่านชุดข้อมูลนี้ไม่ได้")}</div>}
                </td>
                <td>{d.source || "—"}</td>
                <td>{d.records == null ? "—" : d.records.toLocaleString("en-US")}</td>
                <td>{d.columns ?? "—"}</td>
                <td>{describeKinds(d.kind_counts)}</td>
                <td>{formatDate(d.last_updated)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

สร้าง `services/ui/src/pages/DashboardBuilder.jsx`:

```jsx
import React, { useState } from "react";
import { PageHeader } from "../components/ui";
import DatasetPicker from "../components/builder/DatasetPicker";
import "./DashboardBuilder.css";

export const STEPS = ["เลือกชุดข้อมูล", "ดูข้อมูล", "ระบุความต้องการ", "แดชบอร์ด"];

function Stepper({ step, maxStep, onStep }) {
  return (
    <ol className="dbb-stepper" aria-label="ขั้นตอนสร้างแดชบอร์ด">
      {STEPS.map((label, i) => (
        <li key={label} className={i === step ? "is-current" : i <= maxStep ? "is-done" : ""}>
          <button type="button" onClick={() => onStep(i)} disabled={i > maxStep} aria-current={i === step ? "step" : undefined}>
            <span className="dbb-step-num">{i + 1}</span>
            {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function DashboardBuilder() {
  const [step, setStep] = useState(0);
  const [dataset, setDataset] = useState(null);
  const maxStep = 0;

  return (
    <div className="dbb-page">
      <PageHeader pageKey="builder" />
      <Stepper step={step} maxStep={maxStep} onStep={setStep} />
      {step === 0 && (
        <section className="dbb-panel" aria-label={STEPS[0]}>
          <DatasetPicker selected={dataset} onSelect={setDataset} />
          <div className="dbb-actions">
            <button type="button" className="dbb-btn-primary" disabled={!dataset} onClick={() => setStep(1)}>ถัดไป</button>
          </div>
        </section>
      )}
    </div>
  );
}
```

สร้าง `services/ui/src/pages/DashboardBuilder.css`:

```css
/* Create Dashboard tab: pages/DashboardBuilder.jsx and components/builder/* */
.dbb-page {
  --dbb-ink: #0f172a;
  --dbb-muted: #64748b;
  --dbb-border: #e2e8f0;
  --dbb-surface: #ffffff;
  --dbb-canvas: #f5f6f8;
  --dbb-primary: #2272b4;
  --dbb-primary-soft: #e8f1fa;
  --dbb-up: #17803d;
  --dbb-down: #b42318;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 32px 48px;
  color: var(--dbb-ink);
}
.dbb-page button { font: inherit; }
.dbb-stepper { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.dbb-stepper button {
  display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 6px;
  border: 1px solid var(--dbb-border); border-radius: 999px; background: var(--dbb-surface);
  color: var(--dbb-muted); font-size: 13px; cursor: pointer;
}
.dbb-stepper button:disabled { cursor: not-allowed; opacity: 0.55; }
.dbb-step-num {
  display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
  background: #f1f5f9; font-size: 12px; font-weight: 700;
}
.dbb-stepper .is-done button { color: var(--dbb-ink); }
.dbb-stepper .is-current button { border-color: var(--dbb-primary); background: var(--dbb-primary-soft); color: var(--dbb-primary); font-weight: 600; }
.dbb-stepper .is-current .dbb-step-num { background: var(--dbb-primary); color: #fff; }
.dbb-panel { display: flex; flex-direction: column; gap: 16px; padding: 20px; border: 1px solid var(--dbb-border); border-radius: 8px; background: var(--dbb-surface); }
.dbb-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.dbb-actions button, .dbb-btn-primary, .dbb-btn-danger {
  padding: 7px 14px; border: 1px solid var(--dbb-border); border-radius: 6px; background: var(--dbb-surface);
  color: var(--dbb-ink); font-size: 13px; cursor: pointer;
}
.dbb-actions .dbb-btn-primary, .dbb-btn-primary { border-color: var(--dbb-primary); background: var(--dbb-primary); color: #fff; font-weight: 600; }
.dbb-btn-primary:disabled { cursor: not-allowed; opacity: 0.5; }
.dbb-actions .dbb-btn-danger, .dbb-btn-danger { border-color: var(--dbb-down); background: var(--dbb-down); color: #fff; }
.dbb-muted { margin: 0; color: var(--dbb-muted); font-size: 13px; }
.dbb-error { margin: 0; padding: 8px 12px; border: 1px solid #fecdca; border-radius: 6px; background: #fef3f2; color: var(--dbb-down); font-size: 13px; }
.dbb-error-inline { margin: 4px 0 0; color: var(--dbb-down); font-size: 12px; }
.dbb-notice { margin: 0; padding: 8px 12px; border: 1px solid #abefc6; border-radius: 6px; background: #ecfdf3; color: var(--dbb-up); font-size: 13px; }
.dbb-empty { padding: 32px; color: var(--dbb-muted); text-align: center; }
.dbb-scroll { max-width: 100%; overflow: auto; }
.dbb-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dbb-table th, .dbb-table td { padding: 8px 10px; border-bottom: 1px solid var(--dbb-border); text-align: left; white-space: nowrap; }
.dbb-table th { position: sticky; top: 0; background: #f8fafc; color: var(--dbb-muted); font-size: 12px; font-weight: 600; }
.dbb-table th button { all: unset; cursor: pointer; }
.dbb-table tbody tr.is-selected { background: var(--dbb-primary-soft); }
.dbb-null { color: #94a3b8; font-style: italic; }
.dbb-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 0; }
.dbb-stats div { padding: 10px 12px; border: 1px solid var(--dbb-border); border-radius: 6px; }
.dbb-stats dt { color: var(--dbb-muted); font-size: 12px; }
.dbb-stats dd { margin: 4px 0 0; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dbb-kind { padding: 2px 8px; border-radius: 999px; background: #f1f5f9; font-size: 11px; font-weight: 600; }
.dbb-kind-numeric { background: #e8f1fa; color: #1d5f96; }
.dbb-kind-date { background: #f1ecfb; color: #5b3aa8; }
.dbb-kind-categorical { background: #e9f6ef; color: #17683a; }
.dbb-kind-text { background: #f4f4f5; color: #52525b; }
.dbb-preview h3, .dbb-saved h3 { margin: 8px 0 0; font-size: 15px; }
.dbb-context, .dbb-refine { display: flex; flex-direction: column; gap: 10px; }
.dbb-context > label, .dbb-refine > label { font-weight: 600; }
.dbb-context textarea, .dbb-refine textarea, .dbb-modal-card input, .dbb-modal-card textarea {
  padding: 10px 12px; border: 1px solid var(--dbb-border); border-radius: 6px; font: inherit; font-size: 14px; resize: vertical;
}
.dbb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dbb-chip { padding: 4px 12px; border: 1px solid var(--dbb-border); border-radius: 999px; background: #f8fafc; font-size: 12px; cursor: pointer; }
.dbb-chip.is-active { border-color: var(--dbb-primary); background: var(--dbb-primary-soft); color: var(--dbb-primary); }
.dbb-audience { display: flex; flex-wrap: wrap; gap: 16px; margin: 0; padding: 0; border: none; font-size: 14px; }
.dbb-audience legend { margin-bottom: 6px; font-weight: 600; }
.dbb-audience label { display: inline-flex; align-items: center; gap: 6px; }
.dbb-toolbar { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dbb-engine { padding: 6px 12px; border-radius: 6px; font-size: 13px; }
.dbb-engine.is-groq { background: #f1ecfb; color: #5b3aa8; }
.dbb-engine.is-rules { background: #fff7e6; color: #8a5a00; }
.dbb-engine.is-saved { background: #f1f5f9; color: var(--dbb-ink); }
.dbb-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 300px; align-items: start; gap: 16px; }
.dbb-workspace > .dbb-canvas:only-child { grid-column: 1 / -1; }
.dbb-canvas { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 8px; background: var(--dbb-canvas); transition: opacity 0.15s; }
.dbb-canvas.is-busy { opacity: 0.6; }
.dbb-canvas-head h2 { margin: 0; font-size: 22px; }
.dbb-canvas-head p { margin: 4px 0 0; color: var(--dbb-muted); font-size: 13px; }
.dbb-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.dbb-filter { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; border: none; color: var(--dbb-muted); font-size: 12px; }
.dbb-filter legend { margin-bottom: 4px; padding: 0; }
.dbb-filter select, .dbb-filter input { padding: 5px 8px; border: 1px solid var(--dbb-border); border-radius: 6px; background: #fff; color: var(--dbb-ink); font: inherit; font-size: 13px; }
.dbb-filter input + input { margin-left: 6px; }
.dbb-drills { display: flex; flex-wrap: wrap; gap: 6px; }
.dbb-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: 72px; gap: 12px; }
.dbb-cell {
  display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; padding: 12px 14px;
  grid-column: var(--x) / span var(--w); grid-row: var(--y) / span var(--h);
  border: 1px solid var(--dbb-border); border-radius: 8px; background: var(--dbb-surface);
}
.dbb-cell-title { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
.dbb-chart { flex: 1; min-height: 0; }
.dbb-kpi { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; }
.dbb-kpi-value { color: var(--dbb-primary); font-size: 34px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.dbb-kpi-change { margin-top: 4px; font-size: 12px; }
.dbb-kpi-change.is-up { color: var(--dbb-up); }
.dbb-kpi-change.is-down { color: var(--dbb-down); }
.dbb-cell-table .dbb-scroll { flex: 1; }
.dbb-refine { position: sticky; top: 16px; padding: 14px; border: 1px solid var(--dbb-border); border-radius: 8px; background: var(--dbb-surface); }
.dbb-changes { margin: 0; padding-left: 18px; font-size: 13px; }
.dbb-saved ul { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.dbb-saved li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--dbb-border); border-radius: 6px; }
.dbb-saved li p { margin: 2px 0 0; color: var(--dbb-muted); font-size: 13px; }
.dbb-modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, 0.4); }
.dbb-modal-card { display: flex; flex-direction: column; gap: 8px; width: min(440px, 100%); padding: 20px; border-radius: 8px; background: var(--dbb-surface); }
.dbb-modal-card h2 { margin: 0 0 4px; font-size: 18px; }
.dbb-modal-card label { font-size: 13px; font-weight: 600; }
@media (max-width: 1100px) {
  .dbb-workspace { grid-template-columns: 1fr; }
  .dbb-refine { position: static; }
}
@media (max-width: 760px) {
  .dbb-page { padding: 16px; }
  .dbb-cell { grid-column: 1 / -1; grid-row: auto / span var(--h); }
}
```

แก้ `services/ui/src/config/pages.js`: ต่อจากบรรทัดของ `dashboard` เพิ่ม

```js
  { key: "builder", path: "/dashboard-builder", label: "Create Dashboard", subtitle: "สร้างแดชบอร์ดจากชุดข้อมูลด้วย AI", group: "monitor" },
```

แก้ `services/ui/src/App.jsx`: ต่อจาก `import Dashboard from "./pages/Dashboard";` เพิ่ม `import DashboardBuilder from "./pages/DashboardBuilder";` และต่อจาก route `/dashboard` เพิ่ม

```jsx
              <Route path="/dashboard-builder" element={<RequireAuth><DashboardBuilder /></RequireAuth>} />
```

แก้ `services/ui/src/components/NavBar.jsx`: ใน `NAV_ICONS` ต่อจาก `dashboard: <DashboardIcon />,` เพิ่ม `builder: <DashboardIcon />,`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npx vitest run src/utils/numberFormat.test.js src/utils/dashboardsApi.test.js src/pages/DashboardBuilder.test.jsx src/config/pages.test.js src/components/NavBar.test.jsx`
Expected: PASS ทั้งหมด (NavBar test ตรวจว่าทุก label ใน `PAGES` แสดง รวม "Create Dashboard")

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/utils/numberFormat.js services/ui/src/utils/numberFormat.test.js services/ui/src/utils/dashboardsApi.js services/ui/src/utils/dashboardsApi.test.js services/ui/src/components/builder/DatasetPicker.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.css services/ui/src/pages/DashboardBuilder.test.jsx services/ui/src/config/pages.js services/ui/src/config/pages.test.js services/ui/src/App.jsx services/ui/src/components/NavBar.jsx
git commit -m "feat(ui): Create Dashboard page with dataset selection"
```

---

### Task 8: ตัววาดแดชบอร์ด (KPI, กราฟ, ตาราง, ตัวกรอง, drill-down)

ก่อนเริ่ม Task นี้ ให้ implementer โหลด skill `dataviz` และตรวจ `SERIES_COLORS` ด้วยตัวตรวจสีของ skill นั้น ถ้าตัวตรวจแนะนำค่าอื่น ให้แทนได้เฉพาะค่าสีโดยคงลำดับและจำนวนไว้

**Files:**
- Create: `services/ui/src/components/builder/palette.js`
- Create: `services/ui/src/components/builder/KpiCard.jsx`, `ChartWidget.jsx`, `TableWidget.jsx`, `FilterBar.jsx`, `DashboardCanvas.jsx`
- Create: `services/ui/src/test/dashboardFixtures.js`
- Test: `services/ui/src/components/builder/DashboardCanvas.test.jsx`

**Interfaces:**
- Consumes: spec และ data ตามหัวข้อ "Dashboard spec v1"; `formatValue` (Task 7)
- Produces:
  - `DashboardCanvas({ spec, data, selections = {}, onSelectionsChange, busy = false })` เมื่อผู้ใช้กรอง/drill/ล้าง จะเรียก `onSelectionsChange(nextSelections)`
  - `drillValue(entry) -> string | null` และ `OTHER_LABEL = "อื่นๆ"` จาก `ChartWidget.jsx`
  - `compareCells(a, b)` จาก `TableWidget.jsx`
  - `SPEC`, `DATA` จาก `src/test/dashboardFixtures.js` (Task 9–11 ใช้)

- [ ] **Step 1: Write the failing test**

สร้าง `services/ui/src/test/dashboardFixtures.js`:

```js
// A generated dashboard and its numbers, shared by the builder UI tests.
export const SPEC = {
  version: 1,
  title: "ภาพรวมยอดขาย",
  description: "ยอดขายรายเดือนและตามภูมิภาค",
  audience: "business",
  filters: [
    { id: "f1", column: "region", type: "select", label: "ภูมิภาค" },
    { id: "f2", column: "order_date", type: "date_range", label: "วันที่สั่งซื้อ" }
  ],
  widgets: [
    { id: "w1", type: "kpi", title: "ยอดขายรวม", metric: { agg: "sum", column: "amount" }, format: "currency", layout: { x: 0, y: 0, w: 3, h: 2 } },
    { id: "w2", type: "bar", title: "ยอดขายตามภูมิภาค", x: "region", metric: { agg: "sum", column: "amount" }, format: "number",
      group_by: null, stacked: false, sort: "desc", limit: 10, layout: { x: 3, y: 0, w: 6, h: 4 } },
    { id: "w3", type: "table", title: "รายการล่าสุด", columns: ["region", "amount"], limit: 50, layout: { x: 0, y: 4, w: 12, h: 5 } }
  ]
};

export const DATA = {
  rows_total: 6,
  rows_after_filter: 6,
  filter_options: { region: { values: ["East", "North", "South"] }, order_date: { min: "2025-01-05", max: "2025-03-11" } },
  widgets: {
    w1: { value: 1770000, current: 70, previous: 130, change_pct: -46.2, period: "2025-03-01" },
    w2: { rows: [{ x: "South", value: 240 }, { x: "North", value: 150 }], series: ["value"] },
    w3: { columns: ["region", "amount"], rows: [{ region: "South", amount: 200 }, { region: "North", amount: 100 }, { region: "East", amount: 80 }], total_rows: 6 }
  }
};
```

สร้าง `services/ui/src/components/builder/DashboardCanvas.test.jsx`:

```jsx
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DashboardCanvas from "./DashboardCanvas";
import { drillValue } from "./ChartWidget";
import { SPEC, DATA } from "../../test/dashboardFixtures";

function draw(props = {}) {
  const onSelectionsChange = vi.fn();
  render(<DashboardCanvas spec={SPEC} data={DATA} selections={{}} onSelectionsChange={onSelectionsChange} {...props} />);
  return onSelectionsChange;
}

it("draws every widget with its title and the KPI in BI short form", () => {
  draw();
  for (const title of ["ภาพรวมยอดขาย", "ยอดขายรวม", "ยอดขายตามภูมิภาค", "รายการล่าสุด"]) {
    expect(screen.getByText(title)).toBeInTheDocument();
  }
  expect(screen.getByText("฿1.77M")).toBeInTheDocument();
  expect(screen.getByText(/46\.2%/)).toHaveClass("is-down");
  expect(screen.getByText("6 จาก 6 แถว")).toBeInTheDocument();
});

it("places widgets on the 12-column grid from their layout", () => {
  draw();
  const bar = screen.getByRole("article", { name: "ยอดขายตามภูมิภาค" });
  expect(bar.style.getPropertyValue("--x")).toBe("4");
  expect(bar.style.getPropertyValue("--w")).toBe("6");
  expect(bar.style.getPropertyValue("--h")).toBe("4");
});

it("sends a select filter as the viewer's selection", () => {
  const onChange = draw();
  fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value: "North" } });
  expect(onChange).toHaveBeenCalledWith({ region: { values: ["North"] } });
});

it("clears a select filter when the viewer picks all", () => {
  const onChange = draw({ selections: { region: { values: ["North"] } } });
  fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value: "" } });
  expect(onChange).toHaveBeenCalledWith({});
});

it("sends a date range filter", () => {
  const onChange = draw();
  fireEvent.change(screen.getByLabelText("วันที่สั่งซื้อ ตั้งแต่"), { target: { value: "2025-02-01" } });
  expect(onChange).toHaveBeenCalledWith({ order_date: { from: "2025-02-01" } });
});

it("shows a chip for a drill-down value and clears it", () => {
  const onChange = draw({ selections: { segment: { values: ["A"] } } });
  fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง segment" }));
  expect(onChange).toHaveBeenCalledWith({});
});

it("reads the clicked category from a recharts event and ignores the others bucket", () => {
  expect(drillValue({ payload: { x: "South" } })).toBe("South");
  expect(drillValue({ name: "Inbound" })).toBe("Inbound");
  expect(drillValue({ payload: { x: "อื่นๆ" } })).toBeNull();
  expect(drillValue(undefined)).toBeNull();
});

it("sorts a table widget by a clicked column", () => {
  draw();
  const table = within(screen.getByRole("article", { name: "รายการล่าสุด" }));
  const amounts = () => table.getAllByRole("row").slice(1).map((row) => row.lastChild.textContent);
  fireEvent.click(table.getByRole("button", { name: /amount/ }));
  expect(amounts()).toEqual(["80", "100", "200"]);
  fireEvent.click(table.getByRole("button", { name: /amount/ }));
  expect(amounts()).toEqual(["200", "100", "80"]);
  expect(table.getByText("แสดง 3 จาก 6 แถว")).toBeInTheDocument();
});

it("shows a widget's own error without hiding the others", () => {
  draw({ data: { ...DATA, widgets: { ...DATA.widgets, w2: { error: "คำนวณวิดเจ็ตนี้ไม่ได้: boom" } } } });
  expect(screen.getByText("คำนวณวิดเจ็ตนี้ไม่ได้: boom")).toBeInTheDocument();
  expect(screen.getByText("฿1.77M")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/components/builder/DashboardCanvas.test.jsx`
Expected: FAIL ด้วย `Failed to resolve import "./DashboardCanvas"`

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/ui/src/components/builder/palette.js`:

```js
// Categorical series colours, blue/purple first like the Databricks reference.
// Series i gets SERIES_COLORS[i]; the folded "others" series is always grey.
export const SERIES_COLORS = ["#2272B4", "#7F56D9", "#E07B39", "#2E9E6B", "#C2417F", "#5B6B8C", "#C9A227", "#3AA6B9"];
export const OTHER_COLOR = "#A3ACB9";

export function colorFor(name, index, otherLabel) {
  return name === otherLabel ? OTHER_COLOR : SERIES_COLORS[index % SERIES_COLORS.length];
}
```

สร้าง `services/ui/src/components/builder/KpiCard.jsx`:

```jsx
import React from "react";
import { formatValue } from "../../utils/numberFormat";

export default function KpiCard({ widget, data }) {
  const change = data?.change_pct;
  return (
    <div className="dbb-kpi">
      <div className="dbb-kpi-value">{formatValue(data?.value, widget.format)}</div>
      {change != null && (
        <div className={`dbb-kpi-change ${change >= 0 ? "is-up" : "is-down"}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% ช่วงล่าสุดเทียบช่วงก่อน
        </div>
      )}
    </div>
  );
}
```

สร้าง `services/ui/src/components/builder/ChartWidget.jsx`:

```jsx
import React from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { formatValue } from "../../utils/numberFormat";
import { colorFor } from "./palette";

export const OTHER_LABEL = "อื่นๆ";
const DRILLABLE = new Set(["bar", "pie", "donut"]);
const AXIS_TICK = { fontSize: 11, fill: "#64748B" };

// The category a viewer clicked on a bar or a pie slice; null for the folded "others".
export function drillValue(entry) {
  const value = entry?.payload?.x ?? entry?.x ?? entry?.name;
  return value === undefined || value === null || value === OTHER_LABEL ? null : String(value);
}

export default function ChartWidget({ widget, data, onDrill }) {
  const rows = data?.rows || [];
  if (rows.length === 0) return <p className="dbb-muted">ไม่มีข้อมูลตามตัวกรอง</p>;
  const fmt = (v) => formatValue(v, widget.format);
  const series = data.series || ["value"];
  const seriesName = (s) => (s === "value" ? widget.title : s);
  const legend = series.length > 1;
  const drill = DRILLABLE.has(widget.type) && onDrill
    ? (entry) => { const v = drillValue(entry); if (v !== null) onDrill(widget.x, v); }
    : undefined;
  const cursor = drill ? "pointer" : undefined;

  let chart;
  if (widget.type === "pie" || widget.type === "donut") {
    chart = (
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="x" innerRadius={widget.type === "donut" ? "55%" : 0} outerRadius="85%" onClick={drill} cursor={cursor}>
          {rows.map((r, i) => <Cell key={String(r.x)} fill={colorFor(r.x, i, OTHER_LABEL)} />)}
        </Pie>
        <Tooltip formatter={(v) => fmt(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    );
  } else if (widget.type === "bar") {
    chart = (
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="x" tick={AXIS_TICK} />
        <YAxis tickFormatter={fmt} tick={AXIS_TICK} width={56} />
        <Tooltip formatter={(v) => fmt(v)} />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Bar key={s} dataKey={s} name={seriesName(s)} fill={colorFor(s, i, OTHER_LABEL)} stackId={widget.stacked ? "stack" : undefined}
            radius={widget.stacked ? 0 : [3, 3, 0, 0]} onClick={drill} cursor={cursor} />
        ))}
      </BarChart>
    );
  } else if (widget.type === "area") {
    chart = (
      <AreaChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="x" tick={AXIS_TICK} />
        <YAxis tickFormatter={fmt} tick={AXIS_TICK} width={56} />
        <Tooltip formatter={(v) => fmt(v)} />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Area key={s} type="monotone" dataKey={s} name={seriesName(s)} stroke={colorFor(s, i, OTHER_LABEL)} fill={colorFor(s, i, OTHER_LABEL)}
            fillOpacity={0.35} stackId={widget.stacked ? "stack" : undefined} />
        ))}
      </AreaChart>
    );
  } else {
    chart = (
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="x" tick={AXIS_TICK} />
        <YAxis tickFormatter={fmt} tick={AXIS_TICK} width={56} />
        <Tooltip formatter={(v) => fmt(v)} />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Line key={s} type="monotone" dataKey={s} name={seriesName(s)} stroke={colorFor(s, i, OTHER_LABEL)} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    );
  }
  return (
    <div className="dbb-chart">
      <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
    </div>
  );
}
```

สร้าง `services/ui/src/components/builder/TableWidget.jsx`:

```jsx
import React, { useMemo, useState } from "react";

export function compareCells(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "th");
}

function cell(value) {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return String(value);
}

export default function TableWidget({ widget, data }) {
  const [sort, setSort] = useState(null);
  const columns = data?.columns || widget.columns;
  const rows = useMemo(() => {
    const list = [...(data?.rows || [])];
    if (!sort) return list;
    return list.sort((a, b) => {
      const order = compareCells(a[sort.column], b[sort.column]);
      return a[sort.column] == null || b[sort.column] == null ? order : sort.desc ? -order : order;
    });
  }, [data, sort]);
  const toggle = (column) => setSort((s) => (s?.column === column ? { column, desc: !s.desc } : { column, desc: false }));

  return (
    <div className="dbb-scroll">
      <table className="dbb-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} aria-sort={sort?.column === c ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button type="button" onClick={() => toggle(c)}>
                  {c}{sort?.column === c ? (sort.desc ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c}>{cell(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {data?.total_rows > rows.length && (
        <p className="dbb-muted">แสดง {rows.length} จาก {data.total_rows.toLocaleString("en-US")} แถว</p>
      )}
    </div>
  );
}
```

สร้าง `services/ui/src/components/builder/FilterBar.jsx`:

```jsx
import React from "react";

export default function FilterBar({ filters, options, selections, onChange }) {
  const set = (column, selection) => {
    const next = { ...selections };
    if (selection) next[column] = selection;
    else delete next[column];
    onChange(next);
  };

  return (
    <div className="dbb-filters" role="group" aria-label="ตัวกรอง">
      {filters.map((f) => {
        const current = selections[f.column] || {};
        const opt = options[f.column] || {};
        if (f.type === "date_range") {
          const update = (key, value) => {
            const selection = { ...current };
            if (value) selection[key] = value;
            else delete selection[key];
            set(f.column, selection.from || selection.to ? selection : null);
          };
          return (
            <fieldset key={f.id} className="dbb-filter">
              <legend>{f.label}</legend>
              <div>
                <input type="date" aria-label={`${f.label} ตั้งแต่`} min={opt.min || undefined} max={opt.max || undefined}
                  value={current.from || ""} onChange={(e) => update("from", e.target.value)} />
                <input type="date" aria-label={`${f.label} ถึง`} min={opt.min || undefined} max={opt.max || undefined}
                  value={current.to || ""} onChange={(e) => update("to", e.target.value)} />
              </div>
            </fieldset>
          );
        }
        const id = `dbb-filter-${f.id}`;
        return (
          <div key={f.id} className="dbb-filter">
            <label htmlFor={id}>{f.label}</label>
            <select id={id} value={current.values?.[0] ?? ""}
              onChange={(e) => set(f.column, e.target.value ? { values: [e.target.value] } : null)}>
              <option value="">ทั้งหมด</option>
              {(opt.values || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}
```

สร้าง `services/ui/src/components/builder/DashboardCanvas.jsx`:

```jsx
import React from "react";
import KpiCard from "./KpiCard";
import ChartWidget from "./ChartWidget";
import TableWidget from "./TableWidget";
import FilterBar from "./FilterBar";

function WidgetBody({ widget, data, onDrill }) {
  if (data?.error) return <p className="dbb-error-inline">{data.error}</p>;
  if (widget.type === "kpi") return <KpiCard widget={widget} data={data} />;
  if (widget.type === "table") return <TableWidget widget={widget} data={data} />;
  return <ChartWidget widget={widget} data={data} onDrill={onDrill} />;
}

export default function DashboardCanvas({ spec, data, selections = {}, onSelectionsChange, busy = false }) {
  const filterColumns = new Set(spec.filters.map((f) => f.column));
  const drills = Object.entries(selections).filter(([column, sel]) => !filterColumns.has(column) && sel?.values?.length);
  const drill = (column, value) => onSelectionsChange({ ...selections, [column]: { values: [value] } });
  const clear = (column) => {
    const next = { ...selections };
    delete next[column];
    onSelectionsChange(next);
  };

  return (
    <div className={`dbb-canvas${busy ? " is-busy" : ""}`} aria-busy={busy}>
      <header className="dbb-canvas-head">
        <h2>{spec.title}</h2>
        {spec.description && <p>{spec.description}</p>}
      </header>
      {spec.filters.length > 0 && (
        <FilterBar filters={spec.filters} options={data?.filter_options || {}} selections={selections} onChange={onSelectionsChange} />
      )}
      {drills.length > 0 && (
        <div className="dbb-drills" aria-label="ตัวกรองจากการคลิกกราฟ">
          {drills.map(([column, sel]) => (
            <button type="button" key={column} className="dbb-chip is-active" onClick={() => clear(column)} aria-label={`ล้างตัวกรอง ${column}`}>
              {column}: {sel.values[0]} ×
            </button>
          ))}
        </div>
      )}
      {data && (
        <p className="dbb-muted">
          {data.rows_after_filter.toLocaleString("en-US")} จาก {data.rows_total.toLocaleString("en-US")} แถว
        </p>
      )}
      <div className="dbb-grid">
        {spec.widgets.map((w) => (
          <article
            key={w.id}
            className={`dbb-cell dbb-cell-${w.type}`}
            aria-label={w.title}
            style={{ "--x": w.layout.x + 1, "--y": w.layout.y + 1, "--w": w.layout.w, "--h": w.layout.h }}
          >
            <h3 className="dbb-cell-title">{w.title}</h3>
            <WidgetBody widget={w} data={data?.widgets?.[w.id]} onDrill={drill} />
          </article>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npx vitest run src/components/builder/DashboardCanvas.test.jsx`
Expected: PASS ทั้ง 9 test (คำเตือน `width(0) and height(0)` ของ recharts ใน jsdom เป็นเรื่องปกติ)

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/components/builder/palette.js services/ui/src/components/builder/KpiCard.jsx services/ui/src/components/builder/ChartWidget.jsx services/ui/src/components/builder/TableWidget.jsx services/ui/src/components/builder/FilterBar.jsx services/ui/src/components/builder/DashboardCanvas.jsx services/ui/src/components/builder/DashboardCanvas.test.jsx services/ui/src/test/dashboardFixtures.js
git commit -m "feat(ui): dashboard canvas with KPI cards, charts, tables, filters and drill-down"
```

---

### Task 9: ขั้นที่ 2–4 (ดูข้อมูล, ระบุความต้องการ, สร้างด้วย AI และกรองแบบ interactive)

**Files:**
- Create: `services/ui/src/components/builder/DataPreview.jsx`, `services/ui/src/components/builder/ContextForm.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.jsx` (เขียนใหม่ทั้งไฟล์ตามด้านล่าง)
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx` (เพิ่ม test)

**Interfaces:**
- Consumes: `dashboardsApi.previewDataset`, `dashboardsApi.generate`, `dashboardsApi.render` (Task 7); `KIND_LABELS` (Task 7); `DashboardCanvas` (Task 8); `SPEC`, `DATA` (Task 8)
- Produces:
  - `DataPreview({ table })`
  - `ContextForm({ table, value: {context, audience}, onChange, onGenerate, busy })`, `EXAMPLES`, `AUDIENCES`
  - ใน `DashboardBuilder.jsx`: state `draft = {spec, data, engine, model, warnings, savedName?}`, `selections`, `request`, `busy`, `error`, คอมโพเนนต์ `EngineNote({ draft })` และ class `dbb-workspace` กับ `dbb-toolbar` (Task 10–11 แก้ต่อ)

- [ ] **Step 1: Write the failing test**

เพิ่มที่ต้นไฟล์ `services/ui/src/pages/DashboardBuilder.test.jsx` (แทนบรรทัด import เดิมทั้งสามบรรทัดแรก):

```jsx
import { it, expect } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import DashboardBuilder from "./DashboardBuilder";
import { SPEC, DATA } from "../test/dashboardFixtures";
```

เพิ่มท้ายไฟล์:

```jsx
const PREVIEW = {
  table_name: "sales",
  profile: {
    rows: 6, column_count: 3, missing_cells: 1, kind_counts: { numeric: 1, categorical: 1, date: 1, text: 0 },
    columns: [
      { name: "order_date", kind: "date", dtype: "datetime64[ns]", missing: 0, missing_pct: 0, distinct: 6 },
      { name: "region", kind: "categorical", dtype: "string", missing: 1, missing_pct: 16.67, distinct: 3 },
      { name: "amount", kind: "numeric", dtype: "Float64", missing: 0, missing_pct: 0, distinct: 6 }
    ]
  },
  sample: [
    { order_date: "2025-01-05T00:00:00.000", region: "North", amount: 100 },
    { order_date: "2025-01-20T00:00:00.000", region: null, amount: 200 }
  ]
};
const GENERATED = { engine: "groq", model: "openai/gpt-oss-120b", warnings: [], spec: SPEC, data: DATA };
const EXAMPLE = "สร้าง Dashboard สำหรับวิเคราะห์ยอดขายรายเดือน";

// extra routes go first so they override the defaults (mockFetchByUrl: first match wins).
function builderRoutes(extra = []) {
  return [
    ...extra,
    ["/dashboards/datasets/sales/preview", { body: PREVIEW }],
    ["/dashboards/datasets", { body: DATASETS }],
    ["/dashboards/generate", { body: GENERATED }],
    ["/dashboards/render", { body: { spec: SPEC, data: { ...DATA, rows_after_filter: 2 } } }]
  ];
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

const callTo = (part, method) =>
  fetch.mock.calls.find(([url, options]) => String(url).includes(part) && (!method || options?.method === method));

async function generateDashboard(extra = []) {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes(extra));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  fireEvent.click(screen.getByRole("button", { name: EXAMPLE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })); });
  await settle();
}

it("previews the chosen dataset before asking what to analyse", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(screen.getByText("จำนวนแถว")).toBeInTheDocument();
  expect(screen.getByText("คอลัมน์วันที่")).toBeInTheDocument();
  expect(screen.getByText("1 (16.67%)")).toBeInTheDocument();
  expect(screen.getAllByText("null")).toHaveLength(1);
  expect(screen.getByText("ตัวอย่าง 2 แถวแรก")).toBeInTheDocument();
});

it("walks from dataset to an AI-generated dashboard", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  const generate = screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" });
  expect(generate).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: EXAMPLE }));
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await act(async () => { fireEvent.click(generate); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/generate")[1].body)).toEqual({ table_name: "sales", context: EXAMPLE, audience: "management" });
  expect(screen.getByText("ภาพรวมยอดขาย")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("openai/gpt-oss-120b");
});

it("recomputes the dashboard when the viewer filters it", async () => {
  await generateDashboard();
  fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value: "North" } });
  await settle();
  const body = JSON.parse(callTo("/dashboards/render")[1].body);
  expect(body.table_name).toBe("sales");
  expect(body.selections).toEqual({ region: { values: ["North"] } });
  expect(screen.getByText("2 จาก 6 แถว")).toBeInTheDocument();
});

it("says when the dashboard came from rules because the AI is unavailable", async () => {
  const rules = { ...GENERATED, engine: "rules", model: null, warnings: ["ใช้แดชบอร์ดอัตโนมัติแบบกฎแทน AI: ยังไม่ได้ตั้งค่า Groq API key"] };
  await generateDashboard([["/dashboards/generate", { body: rules }]]);
  expect(screen.getByRole("status")).toHaveTextContent("สร้างแบบกฎอัตโนมัติ");
  expect(screen.getByText(/ยังไม่ได้ตั้งค่า Groq API key/)).toBeInTheDocument();
});

it("shows the API error when generation fails", async () => {
  await generateDashboard([["/dashboards/generate", { status: 404, body: { detail: "ไม่พบชุดข้อมูล sales" } }]]);
  expect(screen.getByRole("alert")).toHaveTextContent("ไม่พบชุดข้อมูล sales");
  expect(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })).toBeEnabled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx`
Expected: FAIL (กด "ถัดไป" แล้วยังไม่มีขั้นดูข้อมูล จึงหา "จำนวนแถว" ไม่เจอ) ส่วน 3 test ของ Task 7 ยังผ่าน

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/ui/src/components/builder/DataPreview.jsx`:

```jsx
import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { KIND_LABELS } from "./DatasetPicker";

export default function DataPreview({ table }) {
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
      <h3>ตัวอย่าง {sample.length} แถวแรก</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr>{profile.columns.map((c) => <th key={c.name}>{c.name}</th>)}</tr>
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

สร้าง `services/ui/src/components/builder/ContextForm.jsx`:

```jsx
import React from "react";

export const EXAMPLES = [
  "สร้าง Dashboard สำหรับวิเคราะห์ยอดขายรายเดือน",
  "ต้องการดูสินค้าขายดีที่สุดและยอดขายแยกตามจังหวัด",
  "สร้าง Dashboard สำหรับติดตาม Data Quality"
];

export const AUDIENCES = [
  { value: "business", label: "Business User" },
  { value: "analyst", label: "Data Analyst" },
  { value: "management", label: "Management" }
];

export default function ContextForm({ table, value, onChange, onGenerate, busy }) {
  const ready = value.context.trim().length >= 3 && !busy;
  const submit = (e) => {
    e.preventDefault();
    if (ready) onGenerate();
  };

  return (
    <form className="dbb-context" onSubmit={submit}>
      <label htmlFor="dbb-context-input">อยากวิเคราะห์อะไรจาก {table}</label>
      <textarea id="dbb-context-input" rows={4} maxLength={2000} value={value.context} placeholder={EXAMPLES[0]}
        onChange={(e) => onChange({ ...value, context: e.target.value })} />
      <div className="dbb-chips" aria-label="ตัวอย่างความต้องการ">
        {EXAMPLES.map((example) => (
          <button type="button" key={example} className="dbb-chip" onClick={() => onChange({ ...value, context: example })}>
            {example}
          </button>
        ))}
      </div>
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

หมายเหตุ: ระหว่างรอ ปุ่มเปลี่ยนชื่อเป็น "AI กำลังออกแบบแดชบอร์ด…" ใน test `shows the API error when generation fails` ปุ่มกลับมาเป็น "สร้างแดชบอร์ดด้วย AI" และกดได้อีกครั้งหลังเกิด error เพราะ `busy` ถูกล้างใน `finally`

เขียน `services/ui/src/pages/DashboardBuilder.jsx` ใหม่ทั้งไฟล์:

```jsx
import React, { useState } from "react";
import { PageHeader } from "../components/ui";
import DatasetPicker from "../components/builder/DatasetPicker";
import DataPreview from "../components/builder/DataPreview";
import ContextForm from "../components/builder/ContextForm";
import DashboardCanvas from "../components/builder/DashboardCanvas";
import { dashboardsApi } from "../utils/dashboardsApi";
import "./DashboardBuilder.css";

export const STEPS = ["เลือกชุดข้อมูล", "ดูข้อมูล", "ระบุความต้องการ", "แดชบอร์ด"];

function Stepper({ step, maxStep, onStep }) {
  return (
    <ol className="dbb-stepper" aria-label="ขั้นตอนสร้างแดชบอร์ด">
      {STEPS.map((label, i) => (
        <li key={label} className={i === step ? "is-current" : i <= maxStep ? "is-done" : ""}>
          <button type="button" onClick={() => onStep(i)} disabled={i > maxStep} aria-current={i === step ? "step" : undefined}>
            <span className="dbb-step-num">{i + 1}</span>
            {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

function EngineNote({ draft }) {
  const label = {
    groq: `สร้างโดย AI (${draft.model})`,
    rules: "สร้างแบบกฎอัตโนมัติ เพราะ AI ไม่พร้อม",
    saved: `แดชบอร์ดที่บันทึกไว้: ${draft.savedName}`
  }[draft.engine];
  return (
    <div className={`dbb-engine is-${draft.engine}`} role="status">
      {label}
      {draft.warnings?.length > 0 && (
        <details>
          <summary>หมายเหตุ {draft.warnings.length} รายการ</summary>
          <ul>{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export default function DashboardBuilder() {
  const [step, setStep] = useState(0);
  const [dataset, setDataset] = useState(null);
  const [request, setRequest] = useState({ context: "", audience: "business" });
  const [draft, setDraft] = useState(null);
  const [selections, setSelections] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const maxStep = draft ? 3 : dataset ? 2 : 0;

  const chooseDataset = (next) => {
    if (dataset?.name !== next.name) {
      setDraft(null);
      setSelections({});
    }
    setDataset(next);
  };

  const run = async (kind, work) => {
    setBusy(kind);
    setError("");
    try {
      return await work();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  };

  const generate = () => run("generate", async () => {
    const result = await dashboardsApi.generate(dataset.name, request.context, request.audience);
    setDraft(result);
    setSelections({});
    setStep(3);
  });

  const changeSelections = (next) => {
    setSelections(next);
    return run("render", async () => {
      const result = await dashboardsApi.render(dataset.name, draft.spec, next);
      setDraft((d) => ({ ...d, spec: result.spec, data: result.data }));
    });
  };

  return (
    <div className="dbb-page">
      <PageHeader pageKey="builder" />
      <Stepper step={step} maxStep={maxStep} onStep={setStep} />
      {error && <p role="alert" className="dbb-error">{error}</p>}

      {step === 0 && (
        <section className="dbb-panel" aria-label={STEPS[0]}>
          <DatasetPicker selected={dataset} onSelect={chooseDataset} />
          <div className="dbb-actions">
            <button type="button" className="dbb-btn-primary" disabled={!dataset} onClick={() => setStep(1)}>ถัดไป</button>
          </div>
        </section>
      )}

      {step === 1 && dataset && (
        <section className="dbb-panel" aria-label={STEPS[1]}>
          <DataPreview table={dataset.name} />
          <div className="dbb-actions">
            <button type="button" onClick={() => setStep(0)}>ย้อนกลับ</button>
            <button type="button" className="dbb-btn-primary" onClick={() => setStep(2)}>ถัดไป</button>
          </div>
        </section>
      )}

      {step === 2 && dataset && (
        <section className="dbb-panel" aria-label={STEPS[2]}>
          <ContextForm table={dataset.name} value={request} onChange={setRequest} onGenerate={generate} busy={busy === "generate"} />
        </section>
      )}

      {step === 3 && draft && (
        <section className="dbb-panel" aria-label={STEPS[3]}>
          <div className="dbb-toolbar">
            <EngineNote draft={draft} />
            <div className="dbb-actions">
              <button type="button" onClick={() => setStep(2)}>แก้ความต้องการ</button>
            </div>
          </div>
          <div className="dbb-workspace">
            <DashboardCanvas spec={draft.spec} data={draft.data} selections={selections}
              onSelectionsChange={changeSelections} busy={busy === "render"} />
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx`
Expected: PASS ทั้ง 8 test

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/components/builder/DataPreview.jsx services/ui/src/components/builder/ContextForm.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(ui): data preview, dashboard request and AI generation steps"
```

---

### Task 10: ปรับแดชบอร์ดด้วย AI

**Files:**
- Create: `services/ui/src/components/builder/RefinePanel.jsx`
- Test: `services/ui/src/components/builder/RefinePanel.test.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.jsx`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx` (เพิ่ม test)

**Interfaces:**
- Consumes: `dashboardsApi.refine` (Task 7); `changes` ตามรูปแบบ `diff_specs` (Task 2); `run`, `draft`, `dataset`, `setDraft`, `setSelections` ใน `DashboardBuilder.jsx` (Task 9); helper `generateDashboard`, `settle`, `callTo` ใน test (Task 9)
- Produces: `RefinePanel({ onRefine, busy, changes, history })` (โดย `onRefine(text)` คืน Promise ที่ resolve เป็นค่า truthy เมื่อสำเร็จ), `describeChanges(changes) -> string[]`, `REFINE_EXAMPLES` และ state `refinements` (array ของคำสั่ง) ใน `DashboardBuilder.jsx` ที่ Task 11 ใช้

- [ ] **Step 1: Write the failing test**

สร้าง `services/ui/src/components/builder/RefinePanel.test.jsx`:

```jsx
import { it, expect } from "vitest";
import { describeChanges } from "./RefinePanel";

it("lists every kind of change in plain words", () => {
  expect(describeChanges({ added: ["ยอดขายรายเดือน"], removed: ["ตารางเก่า"], changed: ["ตามภูมิภาค"], layout_changed: true,
    filters_added: ["province"], filters_removed: [] })).toEqual([
    "เพิ่ม: ยอดขายรายเดือน", "แก้ไข: ตามภูมิภาค", "ลบ: ตารางเก่า", "เพิ่มตัวกรอง: province", "จัดตำแหน่งใหม่"]);
});

it("says so when the AI changed nothing", () => {
  expect(describeChanges({ added: [], removed: [], changed: [], layout_changed: false, filters_added: [], filters_removed: [] }))
    .toEqual(["AI ไม่ได้เปลี่ยนอะไร"]);
});
```

เพิ่มท้าย `services/ui/src/pages/DashboardBuilder.test.jsx`:

```jsx
const REFINED_SPEC = { ...SPEC, widgets: [...SPEC.widgets,
  { id: "w4", type: "line", title: "ยอดขายรายเดือน", x: "order_date", time_grain: "month", metric: { agg: "sum", column: "amount" },
    format: "number", group_by: null, stacked: false, layout: { x: 0, y: 9, w: 6, h: 4 } }] };
const REFINED = { engine: "groq", model: "openai/gpt-oss-120b", warnings: [], spec: REFINED_SPEC, data: DATA,
  changes: { added: ["ยอดขายรายเดือน"], removed: [], changed: [], layout_changed: true, filters_added: [], filters_removed: [] } };

it("refines the dashboard with an instruction and lists what changed", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }]]);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มกราฟยอดขายรายเดือน" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  const body = JSON.parse(callTo("/dashboards/refine")[1].body);
  expect(body).toEqual({ table_name: "sales", spec: SPEC, instruction: "เพิ่มกราฟยอดขายรายเดือน" });
  expect(screen.getByText("เพิ่ม: ยอดขายรายเดือน")).toBeInTheDocument();
  expect(screen.getByText("จัดตำแหน่งใหม่")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "ยอดขายรายเดือน" })).toBeInTheDocument();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeInTheDocument();
  expect(screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" })).toHaveValue("");
});

it("keeps the dashboard and explains when AI refinement is unavailable", async () => {
  await generateDashboard([["/dashboards/refine", { status: 503, body: { detail: "ปรับด้วย AI ไม่ได้ตอนนี้: ยังไม่ได้ตั้งค่า Groq API key" } }]]);
  fireEvent.change(screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" }), { target: { value: "เพิ่ม Filter จังหวัด" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("ยังไม่ได้ตั้งค่า Groq API key");
  expect(screen.getByText("ภาพรวมยอดขาย")).toBeInTheDocument();
  expect(screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" })).toHaveValue("เพิ่ม Filter จังหวัด");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/components/builder/RefinePanel.test.jsx src/pages/DashboardBuilder.test.jsx`
Expected: FAIL (`./RefinePanel` ยังไม่มี และไม่มีปุ่ม "ปรับแดชบอร์ด")

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/ui/src/components/builder/RefinePanel.jsx`:

```jsx
import React, { useState } from "react";

export const REFINE_EXAMPLES = [
  "เพิ่มกราฟยอดขายรายเดือน",
  "เปลี่ยนกราฟนี้เป็น Bar Chart",
  "เพิ่ม Filter จังหวัด",
  "เน้น KPI ที่สำคัญ",
  "ปรับ Layout ให้เหมาะกับผู้บริหาร"
];

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

export default function RefinePanel({ onRefine, busy, changes, history = [] }) {
  const [text, setText] = useState("");
  const ready = text.trim().length >= 2 && !busy;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    if (await onRefine(text.trim())) setText("");
  };

  return (
    <form className="dbb-refine" onSubmit={submit} aria-label="ปรับด้วย AI">
      <label htmlFor="dbb-refine-input">ปรับแดชบอร์ดด้วย AI</label>
      <textarea id="dbb-refine-input" rows={3} maxLength={1000} value={text} placeholder={REFINE_EXAMPLES[0]}
        onChange={(e) => setText(e.target.value)} />
      <div className="dbb-chips">
        {REFINE_EXAMPLES.map((example) => (
          <button type="button" key={example} className="dbb-chip" onClick={() => setText(example)}>{example}</button>
        ))}
      </div>
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

แก้ `services/ui/src/pages/DashboardBuilder.jsx`:

1. ต่อจาก `import DashboardCanvas from "../components/builder/DashboardCanvas";` เพิ่ม

```jsx
import RefinePanel from "../components/builder/RefinePanel";
```

2. ต่อจาก `const [error, setError] = useState("");` เพิ่ม

```jsx
  const [refinements, setRefinements] = useState([]);
  const [changes, setChanges] = useState(null);
```

3. ในฟังก์ชัน `generate` แทนบรรทัด

```jsx
    setDraft(result);
    setSelections({});
    setStep(3);
  });
```

ด้วย

```jsx
    setDraft(result);
    setSelections({});
    setRefinements([]);
    setChanges(null);
    setStep(3);
  });

  const refine = (instruction) => run("refine", async () => {
    const result = await dashboardsApi.refine(dataset.name, draft.spec, instruction);
    setDraft(result);
    setSelections({});
    setChanges(result.changes);
    setRefinements((list) => [...list, instruction]);
    return true;
  });
```

4. ใน `<div className="dbb-workspace">` ต่อจาก `<DashboardCanvas ... />` เพิ่ม

```jsx
            <RefinePanel onRefine={refine} busy={busy === "refine"} changes={changes} history={refinements} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npx vitest run src/components/builder/RefinePanel.test.jsx src/pages/DashboardBuilder.test.jsx`
Expected: PASS ทั้งหมด (2 + 10 test)

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/components/builder/RefinePanel.jsx services/ui/src/components/builder/RefinePanel.test.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(ui): refine a generated dashboard with follow-up AI instructions"
```

---

### Task 11: บันทึก เปิด และลบแดชบอร์ด

**Files:**
- Create: `services/ui/src/components/builder/SaveDialog.jsx`, `services/ui/src/components/builder/SavedDashboards.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.jsx`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx` (เพิ่ม test)

**Interfaces:**
- Consumes: `dashboardsApi.listSaved/getSaved/createSaved/updateSaved/deleteSaved/render` (Task 7); `formatDate` (Task 7); `run`, `refinements`, `setRefinements`, `setChanges`, `EngineNote` (รองรับ `engine: "saved"` แล้วใน Task 9)
- Produces: `SaveDialog({ initial: {name, description}, onSave({name, description}), onCancel, busy })`, `SavedDashboards({ onOpen(id) })` และ body ของการบันทึก `{name, description, table_name, context, audience, spec, refinements}`

- [ ] **Step 1: Write the failing test**

เพิ่มท้าย `services/ui/src/pages/DashboardBuilder.test.jsx`:

```jsx
const ID = "a".repeat(32);
const SAVED_DOC = { id: ID, name: "ยอดขายผู้บริหาร", description: "รายเดือน", table_name: "sales", context: EXAMPLE,
  audience: "management", spec: SPEC, refinements: ["เพิ่ม Filter จังหวัด"], created_at: "2026-10-02T03:00:00Z",
  updated_at: "2026-10-02T03:00:00Z" };
const SUMMARY = { id: ID, name: "ยอดขายผู้บริหาร", description: "รายเดือน", table_name: "sales", widget_count: 3,
  updated_at: "2026-10-02T03:00:00Z" };

it("saves the dashboard with its dataset, request and refinements, then updates the same one", async () => {
  await generateDashboard([[`/dashboards/saved/${ID}`, { body: SAVED_DOC }], ["/dashboards/saved", { body: SAVED_DOC }]]);
  fireEvent.click(screen.getByRole("button", { name: "บันทึกแดชบอร์ด" }));
  fireEvent.change(screen.getByLabelText("ชื่อแดชบอร์ด"), { target: { value: "ยอดขายผู้บริหาร" } });
  fireEvent.change(screen.getByLabelText("คำอธิบาย"), { target: { value: "รายเดือน" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึก" })); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/saved", "POST")[1].body)).toEqual({
    name: "ยอดขายผู้บริหาร", description: "รายเดือน", table_name: "sales", context: EXAMPLE,
    audience: "business", spec: SPEC, refinements: [] });
  expect(screen.getByText('บันทึก "ยอดขายผู้บริหาร" แล้ว')).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  expect(screen.getByLabelText("ชื่อแดชบอร์ด")).toHaveValue("ยอดขายผู้บริหาร");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึก" })); });
  await settle();
  expect(callTo(`/dashboards/saved/${ID}`, "PUT")).toBeTruthy();
});

it("suggests the dashboard title as the name and does not save a blank one", async () => {
  await generateDashboard();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกแดชบอร์ด" }));
  expect(screen.getByLabelText("ชื่อแดชบอร์ด")).toHaveValue("ภาพรวมยอดขาย");
  fireEvent.change(screen.getByLabelText("ชื่อแดชบอร์ด"), { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "บันทึก" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

const SAVED_ROUTES = [
  [`/dashboards/saved/${ID}`, { body: SAVED_DOC }],
  ["/dashboards/saved", { body: { dashboards: [SUMMARY] } }],
  ["/dashboards/datasets", { body: DATASETS }],
  ["/dashboards/render", { body: { spec: SPEC, data: DATA } }]
];

it("opens a saved dashboard from the list", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", SAVED_ROUTES);
  expect(screen.getByText("ยอดขายผู้บริหาร")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "เปิด ยอดขายผู้บริหาร" })); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/render")[1].body)).toEqual({ table_name: "sales", spec: SPEC, selections: {} });
  expect(screen.getByText("ภาพรวมยอดขาย")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("แดชบอร์ดที่บันทึกไว้: ยอดขายผู้บริหาร");
  expect(screen.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeInTheDocument();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeInTheDocument();
});

it("asks before deleting a saved dashboard", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", SAVED_ROUTES);
  fireEvent.click(screen.getByRole("button", { name: "ลบ ยอดขายผู้บริหาร" }));
  expect(callTo("/dashboards/saved", "DELETE")).toBeUndefined();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ ยอดขายผู้บริหาร" })); });
  await settle();
  expect(callTo(`/dashboards/saved/${ID}`, "DELETE")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx`
Expected: FAIL 4 test ใหม่ (ไม่มีปุ่ม "บันทึกแดชบอร์ด" และไม่มีรายการที่บันทึกไว้)

- [ ] **Step 3: Write minimal implementation**

สร้าง `services/ui/src/components/builder/SaveDialog.jsx`:

```jsx
import React, { useState } from "react";

export default function SaveDialog({ initial, onSave, onCancel, busy }) {
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");
  const ready = name.trim().length > 0 && !busy;
  const submit = (e) => {
    e.preventDefault();
    if (ready) onSave({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className="dbb-modal" role="dialog" aria-modal="true" aria-labelledby="dbb-save-title">
      <form className="dbb-modal-card" onSubmit={submit}>
        <h2 id="dbb-save-title">บันทึกแดชบอร์ด</h2>
        <label htmlFor="dbb-save-name">ชื่อแดชบอร์ด</label>
        <input id="dbb-save-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="dbb-save-description">คำอธิบาย</label>
        <textarea id="dbb-save-description" rows={3} maxLength={500} value={description}
          onChange={(e) => setDescription(e.target.value)} />
        <div className="dbb-actions">
          <button type="button" onClick={onCancel}>ยกเลิก</button>
          <button type="submit" className="dbb-btn-primary" disabled={!ready}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </form>
    </div>
  );
}
```

สร้าง `services/ui/src/components/builder/SavedDashboards.jsx`:

```jsx
import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { formatDate } from "./DatasetPicker";

export default function SavedDashboards({ onOpen }) {
  const [items, setItems] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");

  const load = () => dashboardsApi.listSaved()
    .then((res) => setItems(res.dashboards || []))
    .catch((e) => { setError(e.message); setItems([]); });

  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    try {
      await dashboardsApi.deleteSaved(id);
      setConfirmId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (items === null) return null;
  return (
    <section className="dbb-saved" aria-label="แดชบอร์ดที่บันทึกไว้">
      <h3>แดชบอร์ดที่บันทึกไว้</h3>
      {error && <p role="alert" className="dbb-error">{error}</p>}
      {items.length === 0 ? (
        <p className="dbb-muted">ยังไม่มีแดชบอร์ดที่บันทึกไว้</p>
      ) : (
        <ul>
          {items.map((d) => (
            <li key={d.id}>
              <div>
                <strong>{d.name}</strong>
                <span className="dbb-muted"> · {d.table_name} · {d.widget_count} วิดเจ็ต · {formatDate(d.updated_at)}</span>
                {d.description && <p>{d.description}</p>}
              </div>
              <div className="dbb-actions">
                <button type="button" aria-label={`เปิด ${d.name}`} onClick={() => onOpen(d.id)}>เปิด</button>
                {confirmId === d.id ? (
                  <>
                    <button type="button" className="dbb-btn-danger" aria-label={`ยืนยันลบ ${d.name}`} onClick={() => remove(d.id)}>ยืนยันลบ</button>
                    <button type="button" onClick={() => setConfirmId(null)}>ยกเลิก</button>
                  </>
                ) : (
                  <button type="button" aria-label={`ลบ ${d.name}`} onClick={() => setConfirmId(d.id)}>ลบ</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

แก้ `services/ui/src/pages/DashboardBuilder.jsx`:

1. ต่อจาก `import RefinePanel from "../components/builder/RefinePanel";` เพิ่ม

```jsx
import SaveDialog from "../components/builder/SaveDialog";
import SavedDashboards from "../components/builder/SavedDashboards";
```

2. ต่อจาก `const [changes, setChanges] = useState(null);` เพิ่ม

```jsx
  const [saved, setSaved] = useState(null);
  const [showSave, setShowSave] = useState(false);
  const [notice, setNotice] = useState("");
```

3. ในฟังก์ชัน `chooseDataset` แทน

```jsx
      setDraft(null);
      setSelections({});
    }
```

ด้วย

```jsx
      setDraft(null);
      setSelections({});
      setSaved(null);
    }
```

4. ต่อจากฟังก์ชัน `refine` เพิ่ม

```jsx
  const save = ({ name, description }) => run("save", async () => {
    const doc = { name, description, table_name: dataset.name, context: request.context,
      audience: request.audience, spec: draft.spec, refinements };
    const result = saved ? await dashboardsApi.updateSaved(saved.id, doc) : await dashboardsApi.createSaved(doc);
    setSaved({ id: result.id, name: result.name, description: result.description || "" });
    setShowSave(false);
    setNotice(`บันทึก "${result.name}" แล้ว`);
  });

  const openSaved = (id) => run("open", async () => {
    const doc = await dashboardsApi.getSaved(id);
    const rendered = await dashboardsApi.render(doc.table_name, doc.spec, {});
    setDataset({ name: doc.table_name });
    setRequest({ context: doc.context || "", audience: doc.audience || "business" });
    setRefinements(doc.refinements || []);
    setChanges(null);
    setSaved({ id: doc.id, name: doc.name, description: doc.description || "" });
    setDraft({ spec: rendered.spec, data: rendered.data, engine: "saved", model: null, warnings: [], savedName: doc.name });
    setSelections({});
    setNotice("");
    setStep(3);
  });
```

5. แทนบรรทัด `{error && <p role="alert" className="dbb-error">{error}</p>}` ด้วย

```jsx
      {error && <p role="alert" className="dbb-error">{error}</p>}
      {notice && <p className="dbb-notice">{notice}</p>}
```

6. ในส่วน `step === 0` ต่อจาก `</div>` ของปุ่ม "ถัดไป" (ก่อน `</section>`) เพิ่ม

```jsx
          <SavedDashboards onOpen={openSaved} />
```

7. ในส่วน `step === 3` แทน

```jsx
              <button type="button" onClick={() => setStep(2)}>แก้ความต้องการ</button>
```

ด้วย

```jsx
              <button type="button" onClick={() => setStep(2)}>แก้ความต้องการ</button>
              <button type="button" className="dbb-btn-primary" onClick={() => setShowSave(true)}>
                {saved ? "บันทึกการแก้ไข" : "บันทึกแดชบอร์ด"}
              </button>
```

8. ก่อน `</div>` ตัวสุดท้ายของ `<div className="dbb-page">` เพิ่ม

```jsx
      {showSave && (
        <SaveDialog initial={saved || { name: draft?.spec.title || "", description: draft?.spec.description || "" }}
          onSave={save} onCancel={() => setShowSave(false)} busy={busy === "save"} />
      )}
```

dialog ของแดชบอร์ดที่ยังไม่เคยบันทึกจะเติมชื่อและคำอธิบายจาก `spec.title` / `spec.description` ไว้ให้ ส่วนแดชบอร์ดที่บันทึกแล้วจะเติมชื่อเดิม

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx` แล้วรันทั้งชุด `cd services/ui && npm test`
Expected: PASS ทั้งหมด รวม `textBudget.test.jsx`, `NavBar.test.jsx` และ `pages.test.js`

- [ ] **Step 5: Commit**

```bash
git add services/ui/src/components/builder/SaveDialog.jsx services/ui/src/components/builder/SavedDashboards.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat(ui): save, reopen and delete generated dashboards"
```

---

### Task 12: ชุดข้อมูลผลตรวจคุณภาพ (สำหรับแดชบอร์ด Data Quality)

**Files:**
- Modify: `services/api/app/api/dashboard_data.py`
- Modify: `services/api/app/api/dashboards.py` (route `GET /datasets`)
- Test: `services/api/tests/test_dashboard_quality_dataset.py`
- Modify: `services/ui/src/components/builder/DatasetPicker.jsx`, `services/ui/src/components/builder/SavedDashboards.jsx`, `services/ui/src/pages/DashboardBuilder.jsx`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx` (เพิ่ม test)

**Interfaces:**
- Consumes: `_read_active`, `dataset_profile`, `load_active_dataset`, `prepare_frame` (Task 1); `list_dashboard_datasets` และ `_es_or_none` (Task 5); `get_es_client` จาก `config.py`; `DatasetPicker`, `SavedDashboards`, `ContextForm` ใน `DashboardBuilder.jsx` (Task 7, 9, 11)
- Produces:
  - `QUALITY_DATASET = "_quality_runs"`, `QUALITY_INDEX = "sdoqap_quality_runs"`, `QUALITY_COLUMNS`, `QUALITY_MAX_RUNS = 5000`
  - `_read_quality_runs() -> DataFrame` (raise 404 ถ้ายังไม่มี index และ 503 ถ้า ES ล่ม)
  - `quality_dataset_entry(es_or_None) -> dict | None` (แถวในรายการชุดข้อมูล รูปแบบเดียวกับ `list_datasets`)
  - `GET /api/v1/dashboards/datasets` คืนชุดข้อมูลผลตรวจคุณภาพเป็นรายการแรกเมื่อ ES มีผลตรวจแล้ว
  - UI: `QUALITY_DATASET`, `datasetLabel(name) -> string` จาก `DatasetPicker.jsx`
- ชุดข้อมูลนี้ผ่าน `load_active_dataset` เหมือนตารางอื่น จึงใช้ preview, generate, refine, render และ save ได้ทันทีโดยไม่ต้องแก้ route อื่น

- [ ] **Step 1: Write the failing test**

สร้าง `services/api/tests/test_dashboard_quality_dataset.py`:

```python
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

from app.api import dashboard_data, dashboard_llm, dashboards  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

Q = dashboard_data.QUALITY_DATASET
RUNS = [
    {"run_id": "r1", "table_name": "sales", "timestamp": "2026-10-01T01:00:00+00:00", "total_records": 100,
     "clean_records": 95, "quarantined_records": 5, "quality_score": 95.0, "effective_quality_threshold": 90.0,
     "duration_seconds": 12.5, "freshness_lag_hours": 0.0, "quarantined_financial_value": 10.0,
     "operational_impact_score": 0.2, "is_anomaly": False, "rules_mode": "static", "remediation_logs": ["x"],
     "stage_seconds": {"load": 1.0}},
    {"run_id": "r2", "table_name": "students", "timestamp": "2026-10-02T01:00:00+00:00", "total_records": 50,
     "clean_records": 40, "quarantined_records": 10, "quality_score": 80.0, "effective_quality_threshold": 90.0,
     "is_anomaly": True, "rules_mode": "adaptive"},
    {"run_id": "r3", "table_name": "sales", "timestamp": "2026-10-03T01:00:00+00:00", "total_records": 120,
     "clean_records": 119, "quarantined_records": 1, "quality_score": 99.2},
]


@pytest.fixture(autouse=True)
def empty_caches():
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()
    yield
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    for run in RUNS:
        fake.index(dashboard_data.QUALITY_INDEX, run["run_id"], run)
    monkeypatch.setattr(dashboard_data, "get_es_client", lambda: fake)
    return fake


def test_one_row_per_quality_run_with_flat_fields_and_the_gate_result(es):
    df = dashboard_data._read_quality_runs()
    assert list(df.columns) == list(dashboard_data.QUALITY_COLUMNS) + ["gate_result"]
    assert len(df) == 3
    by_table = df.set_index("timestamp")["gate_result"].to_dict()
    assert by_table["2026-10-01T01:00:00+00:00"] == "ผ่าน"
    assert by_table["2026-10-02T01:00:00+00:00"] == "ไม่ผ่าน"
    assert pd.isna(by_table["2026-10-03T01:00:00+00:00"])  # no threshold recorded: empty, not "ไม่ผ่าน"


def test_the_quality_dataset_loads_like_any_table(es):
    df, profile = dashboard_data.load_active_dataset(Q)
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    assert kinds["timestamp"] == "date" and kinds["table_name"] == "categorical"
    assert kinds["quality_score"] == "numeric" and kinds["quarantined_records"] == "numeric"
    assert kinds["gate_result"] == "categorical"
    for nested in ("remediation_logs", "stage_seconds", "run_id"):
        assert nested not in kinds
    assert profile["rows"] == 3


def test_no_quality_runs_yet_is_a_clear_404(monkeypatch):
    monkeypatch.setattr(dashboard_data, "get_es_client", FakeES)
    with pytest.raises(HTTPException) as exc:
        dashboard_data._read_quality_runs()
    assert exc.value.status_code == 404


def test_catalog_entry_only_exists_once_there_are_runs(es):
    assert dashboard_data.quality_dataset_entry(None) is None
    assert dashboard_data.quality_dataset_entry(FakeES()) is None
    entry = dashboard_data.quality_dataset_entry(es)
    assert entry["name"] == Q and entry["source"] == "Quality Gate (Elasticsearch)"
    assert entry["records"] == 3 and entry["columns"] == len(dashboard_data.QUALITY_COLUMNS) + 1
    assert entry["last_updated"] == "2026-10-03T01:00:00Z" and entry["error"] is None


def client():
    app = FastAPI()
    app.include_router(dashboards.router)
    return TestClient(app, cookies={SESSION_COOKIE_NAME: create_session_token("tester")})


def test_the_dataset_list_puts_quality_runs_first(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: es)
    monkeypatch.setattr(dashboard_data, "list_datasets", lambda e: [{"name": "sales"}])
    names = [d["name"] for d in client().get("/api/v1/dashboards/datasets").json()["datasets"]]
    assert names == [Q, "sales"]


def test_a_data_quality_dashboard_can_be_generated_and_computed(es, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": Q, "context": "สร้าง Dashboard สำหรับติดตาม Data Quality", "audience": "management"}).json()
    assert body["engine"] == "rules"
    columns_used = {w.get("x") for w in body["spec"]["widgets"]} | {w.get("metric", {}).get("column") for w in body["spec"]["widgets"]}
    assert "timestamp" in columns_used
    assert all("error" not in data for data in body["data"]["widgets"].values())
```

เพิ่มท้าย `services/ui/src/pages/DashboardBuilder.test.jsx`:

```jsx
const WITH_QUALITY = { datasets: [
  { name: "_quality_runs", source: "Quality Gate (Elasticsearch)", records: 42, columns: 14,
    kind_counts: { numeric: 9, categorical: 4, date: 1, text: 0 }, last_updated: "2026-10-02T01:00:00Z", error: null },
  ...DATASETS.datasets
] };

it("offers the quality-run history as a dataset under a readable name", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [
    ["/dashboards/datasets/_quality_runs/preview", { body: PREVIEW }],
    ["/dashboards/datasets", { body: WITH_QUALITY }]
  ]);
  expect(screen.getByText("ผลตรวจคุณภาพข้อมูล (ทุกตาราง)")).toBeInTheDocument();
  expect(screen.getByText("Quality Gate (Elasticsearch)")).toBeInTheDocument();
  expect(screen.queryByText("_quality_runs")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "เลือก ผลตรวจคุณภาพข้อมูล (ทุกตาราง)" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(callTo("/dashboards/datasets/_quality_runs/preview")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  expect(screen.getByLabelText("อยากวิเคราะห์อะไรจาก ผลตรวจคุณภาพข้อมูล (ทุกตาราง)")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests/test_dashboard_quality_dataset.py"`
Expected: FAIL ด้วย `AttributeError: module 'app.api.dashboard_data' has no attribute 'QUALITY_DATASET'`

Run: `cd services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx`
Expected: FAIL เฉพาะ test ใหม่ (หน้าแสดง `_quality_runs` แทนชื่อที่อ่านได้)

- [ ] **Step 3: Write minimal implementation**

แก้ `services/api/app/api/dashboard_data.py`:

1. ต่อจาก `from fastapi import HTTPException` เพิ่ม import และต่อจากบรรทัด `SOURCE_LABELS = ...` เพิ่มค่าคงที่:

```python
from .config import get_es_client
```

```python
# The quality-run history (one row per run in sdoqap_quality_runs) is offered as a dataset
# too, for "track data quality" dashboards. The leading "_" can never clash with an HDFS
# table: list_active_tables() skips such names.
QUALITY_DATASET = "_quality_runs"
QUALITY_INDEX = "sdoqap_quality_runs"
QUALITY_MAX_RUNS = 5000
QUALITY_COLUMNS = ("timestamp", "table_name", "total_records", "clean_records", "quarantined_records",
                   "quality_score", "effective_quality_threshold", "duration_seconds", "freshness_lag_hours",
                   "quarantined_financial_value", "operational_impact_score", "is_anomaly", "rules_mode")
```

2. แทนฟังก์ชัน `_read_active` เดิมด้วย:

```python
def _read_quality_runs() -> pd.DataFrame:
    """Flat fields of the newest QUALITY_MAX_RUNS quality runs, plus gate_result
    (ผ่าน / ไม่ผ่าน; empty when the run did not record its threshold)."""
    es = get_es_client()
    if not es.indices.exists(index=QUALITY_INDEX):
        raise HTTPException(status_code=404, detail="ยังไม่มีผลตรวจคุณภาพ รัน Pipeline อย่างน้อยหนึ่งครั้งก่อน")
    res = es.search(index=QUALITY_INDEX, query={"match_all": {}}, size=QUALITY_MAX_RUNS,
                    sort=[{"timestamp": {"order": "desc"}}])
    rows = [{c: h["_source"].get(c) for c in QUALITY_COLUMNS} for h in res["hits"]["hits"]]
    df = pd.DataFrame(rows, columns=list(QUALITY_COLUMNS))
    score = pd.to_numeric(df["quality_score"], errors="coerce")
    threshold = pd.to_numeric(df["effective_quality_threshold"], errors="coerce")
    passed = (score >= threshold).map({True: "ผ่าน", False: "ไม่ผ่าน"})
    df["gate_result"] = passed.where(score.notna() & threshold.notna())
    return df


def _read_active(table_name: str) -> pd.DataFrame:
    if table_name == QUALITY_DATASET:
        return _read_quality_runs()
    return read_parquet_folder_to_df(f"/data/active/{table_name}")
```

3. ต่อท้ายไฟล์ เพิ่ม:

```python
def quality_dataset_entry(es):
    """Catalog row for the quality-run history, or None until a run has been recorded."""
    if es is None:
        return None
    try:
        if not es.indices.exists(index=QUALITY_INDEX):
            return None
    except Exception:
        return None
    entry = {"name": QUALITY_DATASET, "source": "Quality Gate (Elasticsearch)", "records": None, "columns": None,
             "kind_counts": None, "last_updated": None, "quality_score": None, "error": None}
    try:
        profile = dataset_profile(QUALITY_DATASET)
        newest = next((c.get("max") for c in profile["columns"] if c["name"] == "timestamp"), None)
        entry.update(records=profile["rows"], columns=profile["column_count"], kind_counts=profile["kind_counts"],
                     last_updated=f"{newest}Z" if newest else None)  # timestamps are kept as naive UTC
    except HTTPException as exc:
        entry["error"] = str(exc.detail)
    except Exception as exc:
        entry["error"] = f"อ่านข้อมูลไม่ได้: {exc}"
    return entry
```

แก้ `services/api/app/api/dashboards.py` แทน route `list_dashboard_datasets` เดิมด้วย:

```python
@router.get("/datasets")
def list_dashboard_datasets():
    es = _es_or_none()
    quality = dashboard_data.quality_dataset_entry(es)
    return {"datasets": ([quality] if quality else []) + dashboard_data.list_datasets(es)}
```

แก้ `services/ui/src/components/builder/DatasetPicker.jsx`:

1. ต่อจาก `export const KIND_LABELS = ...` เพิ่ม:

```jsx
// Must match QUALITY_DATASET in services/api/app/api/dashboard_data.py.
export const QUALITY_DATASET = "_quality_runs";

export function datasetLabel(name) {
  return name === QUALITY_DATASET ? "ผลตรวจคุณภาพข้อมูล (ทุกตาราง)" : name;
}
```

2. แทน `aria-label={`เลือก ${d.name}`}` ด้วย `aria-label={`เลือก ${datasetLabel(d.name)}`}` และแทน `<strong>{d.name}</strong>` ด้วย `<strong>{datasetLabel(d.name)}</strong>`

แก้ `services/ui/src/components/builder/SavedDashboards.jsx`:

1. แทน `import { formatDate } from "./DatasetPicker";` ด้วย `import { datasetLabel, formatDate } from "./DatasetPicker";`
2. แทน `{d.table_name}` ใน `<span className="dbb-muted">` ด้วย `{datasetLabel(d.table_name)}`

แก้ `services/ui/src/pages/DashboardBuilder.jsx`:

1. แทน `import DatasetPicker from "../components/builder/DatasetPicker";` ด้วย `import DatasetPicker, { datasetLabel } from "../components/builder/DatasetPicker";`
2. แทน `<ContextForm table={dataset.name}` ด้วย `<ContextForm table={datasetLabel(dataset.name)}`

- [ ] **Step 4: Run test to verify it passes**

Run: คำสั่ง API ของ Step 2 แล้วรัน API test ทั้งชุด (`... python -m pytest -q -p no:cacheprovider tests`) และ `cd services/ui && npm test`
Expected: PASS ทั้งหมด รวม `test_dashboard_data.py` และ `test_dashboards_api.py` เดิม (สอง test นั้นไม่เห็นชุดข้อมูลผลตรวจคุณภาพ เพราะชุดนี้ถูกเพิ่มที่ route ไม่ใช่ใน `list_datasets` และ test ของ route ใช้ `_es_or_none` ที่คืน `None`)

- [ ] **Step 5: Commit**

```bash
git add services/api/app/api/dashboard_data.py services/api/app/api/dashboards.py services/api/tests/test_dashboard_quality_dataset.py services/ui/src/components/builder/DatasetPicker.jsx services/ui/src/components/builder/SavedDashboards.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx
git commit -m "feat: offer the quality-run history as a dataset for Data Quality dashboards"
```

---

### Task 13: ทดสอบกับระบบจริงและ Groq จริง แล้วเขียนเอกสาร

Task นี้ไม่มี test อัตโนมัติใหม่ เป็นการพิสูจน์ว่าทั้ง flow ทำงานบน stack จริง ถ้าขั้นใดไม่ผ่าน ให้หยุดและรายงานพร้อม log ห้ามข้าม

**Files:**
- Modify: `README.md` (เพิ่มหัวข้อ Create Dashboard)

- [ ] **Step 1: รัน test ทั้งหมด**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests"
```

```bash
cd services/ui && npm test
```

Expected: ผ่านทั้งหมดทั้งสองชุด

- [ ] **Step 2: build และเปิด stack**

```bash
docker compose up -d --build api ui nginx
```

Expected: `docker compose ps api ui nginx` แสดงทั้งสามเป็น running และ `curl -s -o /dev/null -w "%{http_code}" http://localhost/api/v1/dashboards/datasets` ได้ `401` (มี route และต้อง login)

- [ ] **Step 3: ตรวจว่ามีคีย์ Groq (ห้ามแสดงค่า)**

```bash
docker compose exec -T api sh -c 'test -n "$GROQ_API_KEY" && echo "env key: set" || echo "env key: not set"'
```

ถ้าได้ "not set" ให้ขอให้เจ้าของระบบเปิดหน้า Expectations & Alerts แล้วบันทึกคีย์ Groq เอง (หรือเพิ่ม `GROQ_API_KEY=` ใน `.env` แล้ว `docker compose up -d api`) จากนั้นตรวจในหน้านั้นว่าช่องคีย์แสดงค่าแบบปิดบัง (`gsk_..xxxx`) agent ห้ามพิมพ์ คัดลอก หรือเปิดดูค่าคีย์เอง

- [ ] **Step 4: เตรียมชุดข้อมูลใน active layer**

เปิดหน้า Create Dashboard แล้วดูว่ามีชุดข้อมูลในรายการหรือไม่ ถ้าไม่มี ให้นำเข้า `data/samples/global_ecommerce_sales.csv` ที่หน้า Data Ingestion ในชื่อ table `global_ecommerce_sales` แล้วรอจน run เป็น `SUCCEEDED` ในหน้า Jobs & Pipelines

- [ ] **Step 5: เดิน flow ใน browser pane**

เปิด `http://localhost/dashboard-builder` ใน browser pane ของแอป ถ้าระบบพาไปหน้า login ให้ผู้ใช้ login เอง จากนั้นทำและตรวจตามลำดับ:

1. ขั้นที่ 1: เห็น `global_ecommerce_sales` พร้อมแหล่งที่มา `File upload`, จำนวนแถว, 15 คอลัมน์ และชนิดข้อมูล
2. ขั้นที่ 2: เห็นสถิติ, ตารางโครงสร้างคอลัมน์ (`Order_Date` เป็นวันที่, `Total_Sales` เป็นตัวเลข, `Region` เป็นหมวดหมู่, `Customer_Name` เป็นข้อความ) และตัวอย่าง 20 แถว
3. ขั้นที่ 3: พิมพ์ "สร้าง Dashboard สำหรับวิเคราะห์ยอดขายรายเดือน แยกตามภูมิภาคและหมวดสินค้า" เลือก Management แล้วกดสร้าง
4. ขั้นที่ 4: แถบสถานะต้องเป็น "สร้างโดย AI (openai/gpt-oss-120b)" ไม่ใช่ "สร้างแบบกฎอัตโนมัติ" มี KPI แถวบนสุดและกราฟ เลือกตัวกรองภูมิภาคแล้วตัวเลขเปลี่ยน คลิกแท่งกราฟแล้วมี chip ขึ้นและกดล้างได้
5. ปรับด้วย AI: กด "เพิ่ม Filter จังหวัด" หรือพิมพ์ "เพิ่ม Filter Country" แล้วกด "ปรับแดชบอร์ด" รายการ "สิ่งที่เปลี่ยน" ต้องมี "เพิ่มตัวกรอง: Country" และวิดเจ็ตเดิมยังอยู่
6. บันทึกในชื่อ "ยอดขายรายเดือน (ทดสอบ)" แล้วรีโหลดหน้า เปิดจากรายการ "แดชบอร์ดที่บันทึกไว้" ต้องได้แดชบอร์ดเดิม
7. กลับไปขั้นที่ 1 เลือก "ผลตรวจคุณภาพข้อมูล (ทุกตาราง)" (ต้องอยู่บนสุด และจำนวนแถวเท่ากับจำนวนรอบที่รันแล้ว) พิมพ์ "สร้าง Dashboard สำหรับติดตาม Data Quality" แล้วสร้าง แดชบอร์ดต้องมี quality score หรือจำนวนแถวที่ถูกกักตามเวลา และแยกตาม `table_name` หรือ `gate_result`
8. ถ่าย screenshot ของแดชบอร์ดยอดขายและแดชบอร์ด Data Quality ไว้ให้ผู้ใช้ดูในแชต (ไม่ต้อง commit รูป)

ถ้าข้อ 4 หรือ 7 ได้ "สร้างแบบกฎอัตโนมัติ" ทั้งที่มีคีย์แล้ว ให้ดู log:

```bash
docker compose logs api --since 10m | grep -E "Groq returned|fell back"
```

ถ้าเป็น `HTTP 400` ที่อ้างถึง `response_format` ให้เอา `"response_format": {"type": "json_object"}` ออกจาก `call_groq` พร้อมบรรทัด assert เดียวกันใน `test_call_groq_asks_for_a_json_object_and_returns_the_content` (ตัว parse ยังหา JSON จากข้อความได้) รัน test ของ Task 4 ใหม่ แล้ว commit แยกเป็น `fix(api): call Groq without JSON mode for <model>` สาเหตุอื่นให้หยุดและรายงาน

- [ ] **Step 6: ลบแดชบอร์ดทดสอบ**

ลบ "ยอดขายรายเดือน (ทดสอบ)" จากรายการ (กด "ลบ" แล้ว "ยืนยันลบ") หลังผู้ใช้ดู screenshot แล้ว

- [ ] **Step 7: เพิ่มเอกสารใน README**

ใน `README.md` ต่อจากหัวข้อที่อธิบายหน้า Dashboards (ถ้าไม่มีหัวข้อแบบนั้น ให้เพิ่มก่อนหัวข้อ environment variables) เพิ่ม:

```markdown
### Create Dashboard (AI)

หน้า `/dashboard-builder` สร้างแดชบอร์ดจากชุดข้อมูลที่ผ่าน Quality Gate แล้ว (active layer) ด้วยภาษาธรรมชาติ:
เลือกชุดข้อมูล → ดูข้อมูล → พิมพ์ความต้องการและเลือกผู้ใช้ (Business User / Data Analyst / Management) → AI สร้างแดชบอร์ด → กรองหรือคลิกกราฟเพื่อ drill-down → สั่งปรับด้วย AI → บันทึก

- LLM: Groq `openai/gpt-oss-120b` ใช้คีย์เดียวกับฟีเจอร์ AI อื่น (หน้า Expectations & Alerts หรือ `GROQ_API_KEY`) ถ้าไม่มีคีย์ ระบบจะสร้างแดชบอร์ดแบบกฎจากชนิดคอลัมน์ให้แทน
- AI ไม่ได้คำนวณตัวเลขและไม่ได้เขียน SQL แต่ตอบเป็น dashboard spec (JSON) ที่ API ตรวจกับ whitelist ก่อน แล้ว API คำนวณเองด้วย pandas
- ข้อมูลที่ส่งให้ Groq มีแค่ชื่อคอลัมน์ ชนิด จำนวนค่าไม่ซ้ำ % ค่าว่าง และช่วงของตัวเลข/วันที่ ไม่มีแถวข้อมูลหรือค่าหมวดหมู่
- นอกจากตารางใน active layer แล้ว ยังเลือก "ผลตรวจคุณภาพข้อมูล (ทุกตาราง)" ได้ด้วย (หนึ่งแถวต่อหนึ่งรอบการตรวจใน `sdoqap_quality_runs` พร้อมคอลัมน์ `gate_result`) เพื่อสร้างแดชบอร์ดติดตาม Data Quality
- แดชบอร์ดที่บันทึกเก็บใน Elasticsearch index `sdoqap_dashboards`
- API: `/api/v1/dashboards/*` (ต้อง login)
```

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs: Create Dashboard (AI) section in README"
```

---

## Self-Review (ผู้เขียนแผนตรวจแล้ว)

- **ครอบคลุมความต้องการ:** R1–R11 มี Task รองรับตามตารางด้านบน ชุดข้อมูลผลตรวจคุณภาพ (R11) ผ่าน `load_active_dataset` เหมือนตารางอื่น จึงใช้ทุก route ได้โดยไม่ต้องมีทางแยก ส่วน "Data Preview" ครบทั้งตัวอย่าง, ชนิด, จำนวนแถว/คอลัมน์, missing และจำนวนคอลัมน์แต่ละชนิด ส่วน "ใช้ prompt/context ที่สร้าง" บันทึกทั้ง `context` และ `refinements`
- **ชื่อที่ใช้ข้าม Task ตรงกัน:** `load_active_dataset`, `prepare_frame`, `validate_spec`, `diff_specs`, `compute_dashboard`, `generate_spec`, `refine_spec`, `LLMUnavailable`, `SpecError`, `DASHBOARDS_INDEX`, `_checked_spec`, `_audience` ฝั่ง UI มี `dashboardsApi.*`, `formatValue`, `KIND_LABELS`, `formatDate`, `DashboardCanvas`, `drillValue`, `SPEC`/`DATA`, `generateDashboard`/`settle`/`callTo`, `run`, `refinements` และ `EngineNote` ที่รองรับ `saved`
- **ฟิลด์ของ spec:** bar ใช้ `sort` (สตริง) ส่วน table ใช้ `order_by` (object) เพื่อไม่ให้ชื่อชนกัน ทั้งใน validator, compute, prompt และ fixture
- **ข้อจำกัดที่รู้:** โหลดทั้งตารางเข้า pandas ใน process ของ API (cache 4 ตาราง) เหมาะกับข้อมูลระดับหลักแสนแถวของโปรเจกต์ ถ้าข้อมูลใหญ่กว่านี้ควรย้ายการคำนวณไป Spark ซึ่งอยู่นอกขอบเขตแผนนี้
