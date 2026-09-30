# Plan C — แยก Transformation ออกเป็น Stage ที่นับและทดสอบได้ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แยก `run_quality_check` (~1,200 บรรทัด) ออกเป็น Stage ที่มีชื่อ มีเทสต์ของตัวเอง และแสดงรายการได้ด้วยคำสั่งเดียว โดยผลลัพธ์ต้องเหมือนเดิมทุกตัวเลข (golden test) แล้วจึงเพิ่มกฎช่วงค่าตามธุรกิจ (0–100) ที่ขาดอยู่ — ตรงกับเกณฑ์ "จำนวนกระบวนการในการจัดการข้อมูล (15)" และ "ความครบถ้วนของการเปลี่ยนแปลงข้อมูล (10)"

**Architecture:** package ใหม่ `services/spark/sdoqap/` มี `RunContext` (dataclass ที่ถือ DataFrame และค่าที่ส่งต่อระหว่างขั้น), registry ของ Stage (`@stage(name, title, phase)`) และ `run_stages(names, ctx)` ที่จับเวลาแต่ละขั้น แต่ละ Stage ย้ายโค้ด**ตามตัวอักษร**จาก engine ด้วยรูปแบบ "prologue ผูกชื่อตัวแปรจาก ctx → บล็อกเดิมไม่แก้ → epilogue เขียนกลับ ctx" ทำให้ไม่ต้องเปลี่ยนชื่อตัวแปรในบล็อกเดิมเลย ส่วนที่มี side effect (ES, n8n, registry) ถูกส่งเข้ามาทาง ctx เป็น callable จึงไม่มี circular import และเทสต์แทนด้วย list ได้ การย้ายทำทีละกลุ่ม โดย engine เรียก `run_stages` ตรงจุดเดิมแล้ว re-bind ตัวแปร local ทำให้แต่ละ task ปล่อยของที่ยังทำงานได้

**Tech Stack:** PySpark 3.4 (local[1] สำหรับเทสต์ใน container `spark-master`), Delta 2.4, pytest

**Spec:** `docs/etl-review/2026-09-30-etl-system-review.md` — F-M1, F-M2, F-M3, F-M4, F-T2 และ Class Diagram ข้อ 3.2

**ลำดับแผน:** A → B (เสร็จแล้ว) → **C (แผนนี้)** → D

## Global Constraints

- **ห้ามเปลี่ยนผลลัพธ์ใน Task 1–8** (refactor ล้วน): ตัวเลข `total_records`, `clean_records`, `quarantined_records`, `quarantine_breakdown` ของ golden run ต้องเท่าเดิมทุกตัว — Task 9 เป็น task เดียวที่ตั้งใจเปลี่ยนพฤติกรรม
- ห้ามแก้: `services/spark/spark_gold_layer.py`, `services/api/app/api/{analytics,gold}.py`, หน้า Dashboard/Analytics, `infra/grafana/**`; บล็อก "Track 3: Downstream Event-Driven Trigger" (เรียก gold layer) ใน engine ต้องคงไว้ตามเดิม
- บล็อกโค้ดที่ย้ายเข้า Stage ต้อง**คัดลอกตามตัวอักษร** ห้ามแก้ logic ระหว่างย้าย; ถ้าเห็นบั๊กให้จดไว้ในรายงาน task แล้วแก้แยกเป็น task ใหม่หลัง golden test ผ่าน
- ชื่อ Stage (ใช้เป็น key ของ `stage_seconds` และในเอกสาร rubric) ต้องตรงตามตารางในหัวข้อ File Structure
- ทุกไฟล์ใน `sdoqap/` import ได้โดยไม่ต้องมี Elasticsearch/HDFS (side effect ผ่าน ctx เท่านั้น)
- commit ลงท้าย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## คำสั่งมาตรฐาน

Spark unit tests:

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T -w /opt/spark-apps spark-master sh -c "python -m pip install -q pytest && python -m pytest -q -p no:cacheprovider tests/unit"
```

ถ้า `import pyspark` ไม่เจอ ให้เติม `PYTHONPATH=/opt/bitnami/spark/python:$(ls /opt/bitnami/spark/python/lib/py4j-*.zip)` หน้า `python -m pytest`

คอมไพล์ engine: `python -m py_compile services/spark/spark_quality_engine.py && echo COMPILE_OK`

## File Structure

```
services/spark/sdoqap/
├── __init__.py
├── common/
│   ├── __init__.py
│   ├── settings.py        load_env_file(start_dir), get_required_env(name)
│   ├── es.py              es_base_and_auth(url) -> (base_url, auth)
│   ├── names.py           clean_column_name, normalize_name  (ย้ายจาก engine)
│   └── ship.py            ship_package(spark) — ส่ง sdoqap ไปให้ executor
├── semantic/
│   ├── __init__.py
│   └── similarity.py      char_ngrams, ngram_cosine, hybrid_similarity
├── pipeline/
│   ├── __init__.py
│   ├── __main__.py        python -m sdoqap.pipeline --list-stages
│   ├── context.py         RunContext
│   ├── registry.py        stage(), run_stages(), list_stages(), STAGES
│   └── plan.py            ALIGN, TRANSFORM, POST_LOAD (ลำดับชื่อ stage)
└── stages/
    ├── __init__.py        import ทุกโมดูลเพื่อให้ลงทะเบียน
    ├── schema.py          schema_align, schema_drift
    ├── cleansing.py       auto_clean, validation, dedup
    ├── standardize.py     standardize_dates, standardize_categories
    ├── rules.py           range_rules (Task 9)
    ├── anomaly.py         anomaly_iqr, anomaly_zscore, anomaly_induced
    ├── assembly.py        quarantine_assembly, column_filter
    ├── metrics.py         distribution, quarantine_breakdown, copdq, freshness, quality_score, operational_impact
    ├── advisory.py        ai_advisory
    └── report.py          report
```

| ชื่อ stage | phase | ชื่อไทย (title) |
|---|---|---|
| `schema_align` | align | จัดชื่อคอลัมน์และแปลงชนิดข้อมูล |
| `schema_drift` | transform | ตรวจการเปลี่ยนโครงสร้างตาราง |
| `auto_clean` | transform | แก้ข้อมูลอัตโนมัติด้วยกฎ DSL และลบแถวซ้ำตามคีย์ |
| `validation` | transform | ตรวจค่าว่าง ชนิดข้อมูล และวันที่ |
| `dedup` | transform | คัดแถวซ้ำและเก็บแถวล่าสุด |
| `standardize_dates` | transform | ปรับรูปแบบวันที่ (รวม พ.ศ.) |
| `standardize_categories` | transform | จัดหมวดค่าตามคำสำคัญ |
| `range_rules` | transform | ตรวจช่วงค่าตามกฎธุรกิจ (Task 9) |
| `anomaly_iqr` | transform | หา outlier ด้วย IQR |
| `anomaly_zscore` | transform | หา anomaly ด้วย Z-score |
| `anomaly_induced` | transform | ใช้กฎที่เรียนรู้จาก Decision Tree |
| `quarantine_assembly` | transform | รวมแถวที่ไม่ผ่านเข้าโซนกักกัน |
| `column_filter` | transform | ตัดคอลัมน์ที่ไม่อยู่ใน schema |
| `distribution` | post_load | สรุปการกระจายของข้อมูล |
| `quarantine_breakdown` | post_load | สรุปเหตุผลที่กักกัน |
| `copdq` | post_load | ประเมินมูลค่าความเสียหาย (COPDQ) |
| `freshness` | post_load | วัดความสดใหม่ของข้อมูล |
| `quality_score` | post_load | คำนวณคะแนนคุณภาพและ anomaly ของอัตรากักกัน |
| `ai_advisory` | post_load | วิเคราะห์ด้วย AI และเสนอกฎ |
| `operational_impact` | post_load | คะแนนผลกระทบเชิงปฏิบัติการแบบถ่วงน้ำหนัก |
| `report` | post_load | บันทึกผลลง Elasticsearch |

---

### Task 0: เก็บ golden baseline ก่อนแตะโค้ด

**Files:**
- Create: `scripts/evaluation/golden_run.sh`, `scripts/evaluation/compare_golden.py`, `scripts/evaluation/tests/test_compare_golden.py`
- Create (ผล): `docs/evaluation/evidence/c-golden-before.json`

**Interfaces:**
- Produces: `golden_run.sh <table> <csv> <out.json>`; `compare_golden.py <before.json> <after.json>` (exit 0 = เท่ากัน); ฟิลด์ที่เทียบ: `total_records, clean_records, quarantined_records, quarantine_breakdown`

- [ ] **Step 1: เทสต์ของตัวเทียบ** — `scripts/evaluation/tests/test_compare_golden.py`

```python
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from compare_golden import diff_runs

BASE = {"total_records": 10, "clean_records": 8, "quarantined_records": 2,
        "quarantine_breakdown": {"duplicate_records": 2}, "duration_seconds": 5.0}


def test_identical_runs_have_no_diff():
    assert diff_runs(BASE, dict(BASE, duration_seconds=9.9)) == []


def test_count_change_is_reported():
    diffs = diff_runs(BASE, dict(BASE, clean_records=7))
    assert diffs == ["clean_records: 8 != 7"]


def test_breakdown_change_is_reported():
    diffs = diff_runs(BASE, dict(BASE, quarantine_breakdown={"duplicate_records": 1, "x": 1}))
    assert len(diffs) == 1 and diffs[0].startswith("quarantine_breakdown")


def test_cli_exit_code(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    a.write_text(json.dumps(BASE))
    b.write_text(json.dumps(dict(BASE, total_records=11)))
    script = os.path.join(os.path.dirname(HERE), "compare_golden.py")
    assert subprocess.run([sys.executable, script, str(a), str(a)]).returncode == 0
    assert subprocess.run([sys.executable, script, str(a), str(b)]).returncode == 1
```

- [ ] **Step 2: รันให้ fail** — `python -m pytest -q scripts/evaluation/tests/test_compare_golden.py` (บน host; ถ้าไม่มี pytest: `python -m pip install --user pytest`) Expected: `ModuleNotFoundError: compare_golden`

- [ ] **Step 3: เขียน `scripts/evaluation/compare_golden.py`**

```python
"""Compare two golden-run results; exit 1 when any counted field differs.
Timing fields are ignored on purpose: a refactor may change speed, not results."""
import json
import sys

FIELDS = ("total_records", "clean_records", "quarantined_records", "quarantine_breakdown")


def diff_runs(before: dict, after: dict) -> list:
    return [f"{f}: {before.get(f)} != {after.get(f)}" for f in FIELDS if before.get(f) != after.get(f)]


def main(argv):
    with open(argv[1], encoding="utf-8") as f:
        before = json.load(f)
    with open(argv[2], encoding="utf-8") as f:
        after = json.load(f)
    diffs = diff_runs(before, after)
    for d in diffs:
        print("DIFF", d)
    print("GOLDEN MATCH" if not diffs else f"GOLDEN MISMATCH ({len(diffs)} fields)")
    return 1 if diffs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

- [ ] **Step 4: รันให้ผ่าน** — Expected: 4 passed

- [ ] **Step 5: เขียน `scripts/evaluation/golden_run.sh`**

```bash
#!/usr/bin/env bash
# Run one CSV through the real batch pipeline and save the counted results.
# First call for a table ingests it; later calls re-process the same ingestion via retry,
# so before/after comparisons always use identical input.
# Usage: bash scripts/evaluation/golden_run.sh <table> <csv> <out.json>
set -eu
TABLE=$1; CSV=$2; OUT=$3
HOST="http://localhost:${NGINX_HOST_PORT:-80}"
KEY=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv INGEST_SERVICE_KEY | tr -d '\r')
USER_=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ADMIN_USERNAME | tr -d '\r')
PASS_=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ADMIN_PASSWORD | tr -d '\r')
JAR=$(mktemp)
curl -s -c "$JAR" -H "Content-Type: application/json" -d "{\"username\":\"$USER_\",\"password\":\"$PASS_\"}" "$HOST/api/v1/auth/login" >/dev/null

T0=$(date -u +%Y-%m-%dT%H:%M:%S)
RESP=$(curl -s -H "X-Service-Key: $KEY" -F "table_name=$TABLE" -F "file=@$CSV" "$HOST/api/v1/pipeline/ingest/csv")
ID=$(python -c "import sys,json;print(json.loads(sys.argv[1])['ingest_id'])" "$RESP")
if echo "$RESP" | grep -q '"status":"duplicate"'; then
  curl -s -b "$JAR" -X POST "$HOST/api/v1/pipeline/retry/$ID" >/dev/null
fi
echo "ingest $ID"
for i in $(seq 1 90); do
  S=$(curl -s "$HOST/api/v1/pipeline/runs/$ID" | python -c "import sys,json;print(json.load(sys.stdin).get('state'))")
  case "$S" in QUEUED|RUNNING) sleep 10;; *) break;; esac
done
echo "state $S"
[ "$S" = "SUCCEEDED" ] || { echo "run did not succeed"; exit 1; }
curl -s "$HOST/api/v1/quality/$TABLE?limit=50" | python -c "
import sys, json
rows = [r for r in json.load(sys.stdin) if r.get('ingest_id') == sys.argv[1] and r.get('timestamp', '') >= sys.argv[2]]
rows.sort(key=lambda r: r['timestamp'])
first = rows[0]
keep = ('ingest_id', 'run_id', 'total_records', 'clean_records', 'quarantined_records', 'quarantine_breakdown', 'duration_seconds', 'stage_seconds')
json.dump({k: first.get(k) for k in keep}, open(sys.argv[3], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print(json.dumps({k: first.get(k) for k in keep[:6]}, ensure_ascii=False))
" "$ID" "$T0" "$OUT"
rm -f "$JAR"
```

(ใช้เอกสาร quality run **แรก** หลังเวลาเริ่ม เพราะ auto-remediation อาจรันซ้ำและเขียนเอกสารที่สองด้วยกฎใหม่)

- [ ] **Step 6: สร้าง baseline** (ต้องมี stack รันอยู่ และ Plan B เสร็จแล้ว)

```bash
mkdir -p docs/evaluation/evidence
bash scripts/evaluation/golden_run.sh golden_student_scores data/samples/student_scores/student_scores_sample.csv /tmp/golden-first.json
bash scripts/evaluation/golden_run.sh golden_student_scores data/samples/student_scores/student_scores_sample.csv docs/evaluation/evidence/c-golden-before.json
cat docs/evaluation/evidence/c-golden-before.json
```

Expected: ทั้งสองครั้งจบด้วย `state SUCCEEDED`; ครั้งที่สองเป็น retry (ใช้ ingest เดิม) และไฟล์ JSON มี `total_records: 1030` — ครั้งแรกอาจเป็นสาขาอนุมาน schema จึงใช้ผลครั้งที่สองเป็น baseline

- [ ] **Step 7: Commit**

```bash
git add scripts/evaluation/golden_run.sh scripts/evaluation/compare_golden.py scripts/evaluation/tests/test_compare_golden.py docs/evaluation/evidence/c-golden-before.json
git commit -m "test(golden): capture batch-engine baseline before the stage refactor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: โครง package `sdoqap` — common, context, registry (F-M3)

**Files:**
- Create: `services/spark/sdoqap/__init__.py`, `sdoqap/common/{__init__,settings,es,names,ship}.py`, `sdoqap/pipeline/{__init__,__main__,context,registry,plan}.py`, `sdoqap/stages/__init__.py`
- Modify: `services/spark/tests/unit/conftest.py` (เพิ่ม fixture `spark`), Create `services/spark/tests/unit/helpers.py`
- Test: `services/spark/tests/unit/test_sdoqap_core.py`
- Modify: `services/spark/spark_quality_engine.py`, `dynamic_rules_engine.py`, `ai_rule_advisor.py`, `auto_remediation_engine.py`, `data_profile_store.py` (ใช้ `load_env_file` ตัวเดียว), `services/spark/Dockerfile` (COPY `sdoqap/`)

**Interfaces:**
- Produces:
  - `sdoqap.common.settings.load_env_file(start_dir: str) -> None`, `get_required_env(name: str) -> str`
  - `sdoqap.common.es.es_base_and_auth(url: str) -> tuple[str, tuple|None]`
  - `sdoqap.common.names.clean_column_name(name) -> str`, `normalize_name(name) -> str`
  - `sdoqap.common.ship.ship_package(spark) -> str` (path ของ zip)
  - `sdoqap.pipeline.context.RunContext` (ฟิลด์ตามโค้ดด้านล่าง; ใช้ทุก task ถัดไป)
  - `sdoqap.pipeline.registry.stage(name, title, phase)`, `run_stages(names, ctx) -> ctx`, `list_stages() -> list[dict]`, `STAGES: dict[str, StageInfo]`
  - `sdoqap.pipeline.plan.ALIGN`, `TRANSFORM`, `POST_LOAD` (list[str])
  - เทสต์: fixture `spark` (session), `helpers.make_ctx(spark, rows, schema_spec, **kw) -> RunContext`

- [ ] **Step 1: เพิ่ม fixture และ helper**

ต่อท้าย `services/spark/tests/unit/conftest.py`:

```python
import pytest


@pytest.fixture(scope="session")
def spark():
    from pyspark.sql import SparkSession
    session = (SparkSession.builder.master("local[1]").appName("sdoqap-unit")
               .config("spark.sql.shuffle.partitions", "1")
               .config("spark.ui.enabled", "false")
               .getOrCreate())
    yield session
    session.stop()
```

สร้าง `services/spark/tests/unit/helpers.py`:

```python
from sdoqap.pipeline.context import RunContext


def make_ctx(spark, rows, schema_spec, primary_key="id", date_column=None, rules=None, columns=None, **kw):
    """Build a RunContext around a small in-memory DataFrame; side effects are captured in lists."""
    columns = columns or list(schema_spec.keys())
    df = spark.createDataFrame(rows, columns) if rows else spark.createDataFrame([], ", ".join(f"{c} string" for c in columns))
    ctx = RunContext(spark=spark, table_name=kw.pop("table_name", "t"), run_id=kw.pop("run_id", "run_test"),
                     primary_key=primary_key, date_column=date_column, schema_spec=dict(schema_spec),
                     rules=rules or {}, **kw)
    ctx.df = df
    ctx.es_docs, ctx.alerts = [], []
    ctx.log_es = lambda index, doc: ctx.es_docs.append((index, doc))
    ctx.alert = lambda title, message, severity="warning": ctx.alerts.append((title, severity))
    return ctx
```

- [ ] **Step 2: เทสต์ที่ fail** — `services/spark/tests/unit/test_sdoqap_core.py`

```python
import os
import zipfile

from sdoqap.common.es import es_base_and_auth
from sdoqap.common.names import clean_column_name, normalize_name
from sdoqap.common.settings import load_env_file
from sdoqap.pipeline import registry
from sdoqap.pipeline.context import RunContext


def test_es_url_split_into_base_and_auth():
    assert es_base_and_auth("http://elastic:pw@es:9200") == ("http://es:9200", ("elastic", "pw"))
    assert es_base_and_auth("http://es:9200") == ("http://es:9200", None)


def test_column_name_helpers_match_engine_behaviour():
    assert clean_column_name("Order (ID)") == "Order_ID"
    assert clean_column_name("a,,b") == "a_b"
    assert normalize_name("Student ID") == normalize_name("student_id") == "studentid"


def test_env_file_loaded_without_overriding(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("SDOQAP_T1=from_file\nSDOQAP_T2=from_file\n# c=d\n")
    nested = tmp_path / "a" / "b"
    nested.mkdir(parents=True)
    monkeypatch.setenv("SDOQAP_T2", "from_env")
    monkeypatch.delenv("SDOQAP_T1", raising=False)
    load_env_file(str(nested))
    assert os.environ["SDOQAP_T1"] == "from_file"
    assert os.environ["SDOQAP_T2"] == "from_env"


def test_run_stages_runs_in_order_and_times_each(monkeypatch):
    monkeypatch.setattr(registry, "STAGES", {})
    seen = []

    @registry.stage("one", "หนึ่ง", "transform")
    def one(ctx):
        seen.append("one")
        return ctx

    @registry.stage("two", "สอง", "transform")
    def two(ctx):
        seen.append("two")
        return ctx

    ctx = RunContext(spark=None, table_name="t", run_id="r", primary_key="id", date_column=None, schema_spec={}, rules={})
    registry.run_stages(["two", "one"], ctx)
    assert seen == ["two", "one"]
    assert set(ctx.metrics["stage_seconds"]) == {"one", "two"}


def test_pk_cols_normalises_single_and_composite_keys():
    base = dict(spark=None, table_name="t", run_id="r", date_column=None, schema_spec={}, rules={})
    assert RunContext(primary_key="id", **base).pk_cols == ["id"]
    assert RunContext(primary_key=["a", "b"], **base).pk_cols == ["a", "b"]


def test_ship_package_zips_sdoqap(spark):
    from sdoqap.common.ship import ship_package
    path = ship_package(spark)
    with zipfile.ZipFile(path) as z:
        assert "sdoqap/__init__.py" in z.namelist()
        assert "sdoqap/pipeline/context.py" in z.namelist()
```

- [ ] **Step 3: รันให้ fail** — Expected: `ModuleNotFoundError: No module named 'sdoqap'`

- [ ] **Step 4: เขียนไฟล์ common**

`services/spark/sdoqap/__init__.py`:

```python
"""SDOQAP Spark-side library: shared helpers, the run context, and the pipeline stages."""
```

`services/spark/sdoqap/common/__init__.py`: ว่าง (บรรทัดเดียว `"""Shared helpers."""`)

`services/spark/sdoqap/common/settings.py`:

```python
import os


def load_env_file(start_dir: str) -> None:
    """Walk up to 3 directories from start_dir looking for a .env file and load its
    key=value pairs into os.environ without overwriting variables already set."""
    current_dir = start_dir
    for _ in range(3):
        env_path = os.path.join(current_dir, ".env")
        if os.path.exists(env_path):
            try:
                with open(env_path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            os.environ.setdefault(k.strip(), v.strip())
            except Exception:
                pass
            break
        current_dir = os.path.dirname(current_dir)


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None:
        raise RuntimeError(f"Missing required environment variable '{name}'. Set it in the environment.")
    return value
```

`services/spark/sdoqap/common/es.py`:

```python
from urllib.parse import urlparse


def es_base_and_auth(url: str):
    """Split http://user:pass@host:port into ('http://host:port', (user, pass) | None)."""
    parsed = urlparse(url)
    auth = (parsed.username, parsed.password) if parsed.username else None
    return f"{parsed.scheme}://{parsed.hostname}:{parsed.port}", auth
```

`services/spark/sdoqap/common/names.py` — ย้ายสองฟังก์ชันจาก engine ตามตัวอักษร:

```python
import re


def normalize_name(name):
    if not name:
        return ""
    return re.sub(r'[\s\-_]', '', name).lower()


def clean_column_name(name):
    if not name:
        return ""
    cleaned = re.sub(r'[ ,;{}()\n\t=]', '_', name)
    cleaned = re.sub(r'_{2,}', '_', cleaned)
    return cleaned.strip('_')
```

`services/spark/sdoqap/common/ship.py`:

```python
import os
import tempfile
import zipfile

PACKAGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ship_package(spark) -> str:
    """Zip the sdoqap package and add it to the SparkContext so executors can import
    it (UDFs that reference sdoqap functions are pickled by reference)."""
    fd, path = tempfile.mkstemp(prefix="sdoqap-", suffix=".zip")
    os.close(fd)
    root = os.path.dirname(PACKAGE_DIR)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for folder, _, files in os.walk(PACKAGE_DIR):
            for name in files:
                if name.endswith(".py"):
                    full = os.path.join(folder, name)
                    z.write(full, os.path.relpath(full, root).replace(os.sep, "/"))
    spark.sparkContext.addPyFile(path)
    return path
```

- [ ] **Step 5: เขียนไฟล์ pipeline**

`services/spark/sdoqap/pipeline/__init__.py`: `"""Run context, stage registry and stage order."""`

`services/spark/sdoqap/pipeline/context.py`:

```python
from dataclasses import dataclass, field
from typing import Any, Callable, Optional


def _noop(*args, **kwargs):
    return None


@dataclass
class RunContext:
    """Everything one quality run passes from stage to stage. Side effects (ES, n8n,
    schema registry) are injected as callables so stages stay importable and testable."""
    spark: Any
    table_name: str
    run_id: str
    primary_key: Any
    date_column: Optional[str]
    schema_spec: dict
    rules: dict
    ingest_id: Optional[str] = None
    paths: dict = field(default_factory=dict)          # raw, active, quarantine
    quality_threshold: float = 90.0
    freshness_limit_hours: float = 48.0

    # DataFrames
    df: Any = None
    df_with_status: Any = None
    invalid_df: Any = None
    valid_df: Any = None
    valid_df_with_id: Any = None
    valid_dedup_with_id: Any = None
    clean_df: Any = None
    duplicate_df: Any = None
    range_violation_df: Any = None
    outlier_df: Any = None
    unsupervised_outlier_df: Any = None
    induced_outlier_df: Any = None
    all_quarantined: Any = None
    all_quarantined_write: Any = None
    quarantine_run_df: Any = None

    # Findings and counts
    drift_detected: bool = False
    drift_details: dict = field(default_factory=dict)
    value_range_profile: dict = field(default_factory=dict)
    remediation_logs: list = field(default_factory=list)
    auto_clean: bool = True
    clean_count: int = 0
    quarantine_count: int = 0
    total_records: int = 0
    metrics: dict = field(default_factory=dict)

    # Injected side effects
    log_es: Callable = _noop                 # (index, doc)
    alert: Callable = _noop                  # (title, message, severity)
    evolve_schema: Callable = _noop          # (table_name, proposed_schema)
    apply_dsl: Callable = lambda df, rules: df
    load_std_rules: Callable = lambda table_name: {}
    historical_stats: Callable = lambda table_name: []
    pop_fallback_metrics: Callable = lambda: {}

    @property
    def pk_cols(self):
        return [self.primary_key] if isinstance(self.primary_key, str) else list(self.primary_key)
```

`services/spark/sdoqap/pipeline/registry.py`:

```python
import time
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class StageInfo:
    name: str
    title: str
    phase: str
    fn: Callable


STAGES = {}


def stage(name: str, title: str, phase: str):
    def register(fn):
        STAGES[name] = StageInfo(name, title, phase, fn)
        return fn
    return register


def run_stages(names, ctx):
    """Run stages in the given order; record wall-clock seconds per stage (includes the
    Spark actions a stage triggers) in ctx.metrics['stage_seconds']."""
    timings = ctx.metrics.setdefault("stage_seconds", {})
    for name in names:
        started = time.perf_counter()
        ctx = STAGES[name].fn(ctx)
        timings[name] = round(time.perf_counter() - started, 3)
    return ctx


def list_stages():
    import sdoqap.stages  # noqa: F401  (registers every stage)
    from sdoqap.pipeline.plan import ALIGN, POST_LOAD, TRANSFORM
    order = ALIGN + TRANSFORM + POST_LOAD
    return [{"order": i + 1, "name": n, "title": STAGES[n].title, "phase": STAGES[n].phase}
            for i, n in enumerate(order) if n in STAGES]
```

`services/spark/sdoqap/pipeline/plan.py` (เริ่มว่าง แล้วแต่ละ task เติมชื่อ):

```python
"""Stage order used by spark_quality_engine.run_quality_check."""
ALIGN = []
TRANSFORM = []
POST_LOAD = []
```

`services/spark/sdoqap/pipeline/__main__.py`:

```python
import json
import sys

from sdoqap.pipeline.registry import list_stages

if __name__ == "__main__":
    stages = list_stages()
    if "--json" in sys.argv:
        print(json.dumps(stages, ensure_ascii=False, indent=2))
    else:
        for s in stages:
            print(f"{s['order']:>2}. [{s['phase']}] {s['name']} — {s['title']}")
        print(f"total: {len(stages)} stages")
```

`services/spark/sdoqap/stages/__init__.py`:

```python
"""Importing this package registers every stage."""
```

- [ ] **Step 6: รันให้ผ่าน** — Expected: `test_sdoqap_core.py` PASS

- [ ] **Step 7: ใช้ helper ร่วมใน engine และโมดูลอื่น**

(a) `spark_quality_engine.py`: แทนฟังก์ชัน `load_env_file` ทั้งตัวและบรรทัด `load_env_file()` ที่ตามมา ด้วย:

```python
from sdoqap.common.settings import load_env_file
load_env_file(os.path.dirname(os.path.abspath(__file__)))
```

ลบฟังก์ชัน `normalize_name` และ `clean_column_name` ใน engine แล้วเพิ่มบรรทัด import ต่อจาก `from run_support import ...`:

```python
from sdoqap.common.names import clean_column_name, normalize_name
from sdoqap.common.es import es_base_and_auth
```

ลบบรรทัด `os.environ.setdefault('ELASTICSEARCH_PASSWORD', 'sdoqap_secure')` (รหัสผ่านต้องมาจาก env — F-S4)

(b) ใน engine แทนทุกชุดสามบรรทัดที่หน้าตาแบบนี้ (ใน `acquire_lock`, `release_lock`, `renew_lock`, `load_expected_schema`, `load_rules_config` และที่อื่นที่เจอ):

```python
    parsed = urlparse(ELASTICSEARCH_URL)
    auth = (parsed.username, parsed.password) if parsed.username else None
    base_url = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
```

ด้วยบรรทัดเดียว (รักษาระดับย่อหน้าเดิม):

```python
    base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
```

แล้วลบ `from urllib.parse import urlparse` ที่ไม่ได้ใช้แล้วในฟังก์ชันเหล่านั้น ตรวจ:

```bash
grep -n "parsed = urlparse(ELASTICSEARCH_URL)" services/spark/spark_quality_engine.py
```

Expected: เหลือเฉพาะใน `get_historical_stats` (โครงสร้างต่างกัน — คงไว้)

(c) ใน `dynamic_rules_engine.py`, `ai_rule_advisor.py`, `auto_remediation_engine.py` แทนฟังก์ชัน `load_env_file` ทั้งตัว + บรรทัดที่เรียก และใน `data_profile_store.py` แทน `_load_env_file` + บรรทัดที่เรียก ด้วยสองบรรทัดเดียวกับ (a) ตรวจ:

```bash
grep -n "def load_env_file\|def _load_env_file" services/spark/*.py
```

Expected: ไม่พบ

(d) `services/spark/Dockerfile` ต่อท้ายบรรทัด COPY ที่มีอยู่ ให้เพิ่มอีกบรรทัด:

```dockerfile
COPY sdoqap /opt/spark-apps/sdoqap
```

- [ ] **Step 8: ตรวจ engine และสคริปต์ที่เกี่ยวข้องยังทำงาน**

```bash
for f in spark_quality_engine dynamic_rules_engine ai_rule_advisor auto_remediation_engine data_profile_store; do python -m py_compile services/spark/$f.py || echo "FAIL $f"; done; echo COMPILE_DONE
MSYS_NO_PATHCONV=1 docker compose exec -T -w /opt/spark-apps spark-master python -c "import spark_quality_engine" && echo IMPORT_OK
```

Expected: `COMPILE_DONE` ไม่มี FAIL, `IMPORT_OK` แล้วรัน Spark unit tests ทั้งหมด → PASS

- [ ] **Step 9: Commit**

```bash
git add services/spark/sdoqap services/spark/tests/unit services/spark/spark_quality_engine.py services/spark/dynamic_rules_engine.py services/spark/ai_rule_advisor.py services/spark/auto_remediation_engine.py services/spark/data_profile_store.py services/spark/Dockerfile
git commit -m "refactor(spark): add sdoqap package with run context, stage registry and shared env/ES/name helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: รวมตัวคำนวณ similarity ให้เหลือชุดเดียว และลบโค้ดที่ไม่มีใครใช้ (F-M2)

**Files:**
- Create: `services/spark/sdoqap/semantic/__init__.py`, `services/spark/sdoqap/semantic/similarity.py`
- Test: `services/spark/tests/unit/test_similarity.py`
- Modify: `services/spark/spark_quality_engine.py` (`LocalSemanticStandardizer`, `create_semantic_standardize_udf`, `run_quality_check` เรียก `ship_package`)
- Delete: `services/spark/semantic_cleaner/`, `services/spark/udf_v2_helper.py`, `services/spark/scripts/manual/{run_semantic_cleaner,test_semantic_cleaner_dsl,test_semantic_cleaner_v2,stress_test_semantic_cleaner}.py`

**Interfaces:**
- Produces: `char_ngrams(s, n=2) -> list[str]`, `ngram_cosine(s1, s2) -> float`, `hybrid_similarity(s1, s2) -> float`

- [ ] **Step 1: ยืนยันว่าโค้ดที่จะลบไม่มีใครใช้**

```bash
grep -rn "semantic_cleaner\|udf_v2_helper\|SemanticCleaner" --include=*.py --include=*.sh --include=*.bat --include=*.yml --include=Dockerfile services scripts .github infra | grep -v "^services/spark/semantic_cleaner/\|^services/spark/udf_v2_helper.py\|scripts/manual/\(run_semantic_cleaner\|test_semantic_cleaner_dsl\|test_semantic_cleaner_v2\|stress_test_semantic_cleaner\).py"
```

Expected: ไม่พบ — ถ้าพบ ให้หยุดและรายงาน

- [ ] **Step 2: เทสต์ที่ fail** — `services/spark/tests/unit/test_similarity.py`

ค่าที่คาดหวังคำนวณจากสูตรเดิมใน engine (substring 0.4 + token/ngram overlap 0.3 + cosine 0.3, ปัดเป็น 1.0 เมื่อ ≥ 0.95):

```python
import pytest

from sdoqap.semantic.similarity import char_ngrams, hybrid_similarity, ngram_cosine


def test_char_ngrams():
    assert char_ngrams(" AbC ") == ["ab", "bc"]
    assert char_ngrams("a") == []


def test_ngram_cosine_bounds():
    assert ngram_cosine("apple", "apple") == pytest.approx(1.0)
    assert ngram_cosine("ab", "cd") == 0.0
    assert ngram_cosine("a", "abc") == 0.0


def test_identical_and_case_insensitive_is_one():
    assert hybrid_similarity("Data Warehouse", " data warehouse ") == 1.0


def test_substring_scores_at_least_the_substring_weight():
    assert hybrid_similarity("warehouse", "data warehouse") >= 0.4


def test_unrelated_strings_score_low():
    assert hybrid_similarity("apple", "zebra") < 0.2


def test_engine_standardizer_uses_the_shared_function():
    import spark_quality_engine as eng
    std = eng.LocalSemanticStandardizer({"fruit": "Fruit"}, 0.5, "Other")
    for a, b in [("apple juice", "apple"), ("ข้าวผัด", "ข้าวผัดกุ้ง"), ("x", "y")]:
        assert std.hybrid_similarity(a, b) == hybrid_similarity(a, b)
```

- [ ] **Step 3: รันให้ fail** — Expected: `ModuleNotFoundError: sdoqap.semantic`

- [ ] **Step 4: สร้าง `sdoqap/semantic/similarity.py`** — ย้ายสามเมธอดจาก `LocalSemanticStandardizer` (engine) ออกมาเป็นฟังก์ชันระดับโมดูลตามตัวอักษร โดยเปลี่ยนเพียง `self.get_char_ngrams` → `char_ngrams`, `self.n_gram_cosine_similarity` → `ngram_cosine` และตัด `self`:

```python
"""Hybrid string similarity used by semantic standardization: substring containment
(weight 0.4) + token overlap, falling back to character-bigram overlap for Thai
run-together words (0.3) + character-bigram cosine (0.3)."""


def char_ngrams(s, n=2):
    s = str(s).lower().strip()
    return [s[i:i+n] for i in range(len(s)-n+1)]


def ngram_cosine(s1, s2):
    ngrams1 = char_ngrams(s1)
    ngrams2 = char_ngrams(s2)
    if not ngrams1 or not ngrams2:
        return 0.0

    bag1 = {}
    for ng in ngrams1:
        bag1[ng] = bag1.get(ng, 0) + 1

    bag2 = {}
    for ng in ngrams2:
        bag2[ng] = bag2.get(ng, 0) + 1

    all_ngrams = set(bag1.keys()).union(set(bag2.keys()))
    dot = sum(bag1.get(ng, 0) * bag2.get(ng, 0) for ng in all_ngrams)
    norm1 = sum(v**2 for v in bag1.values())**0.5
    norm2 = sum(v**2 for v in bag2.values())**0.5

    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


def hybrid_similarity(s1, s2):
    s1_clean = str(s1).lower().strip()
    s2_clean = str(s2).lower().strip()

    if s1_clean == s2_clean:
        return 1.0

    # 1. Substring component (containment check)
    sub_score = 0.0
    if s2_clean in s1_clean or s1_clean in s2_clean:
        sub_score = 1.0

    # 2. Token Overlap component
    overlap = 0.0
    tokens1 = set(s1_clean.split())
    tokens2 = set(s2_clean.split())
    if tokens1 and tokens2:
        intersection = tokens1.intersection(tokens2)
        overlap = len(intersection) / min(len(tokens1), len(tokens2))

    # 3. N-gram Cosine component
    ngram = ngram_cosine(s1_clean, s2_clean)

    # If token overlap is 0 (like in Thai run-together words), fallback to n-gram overlap
    if overlap == 0.0:
        ng1 = char_ngrams(s1_clean)
        ng2 = char_ngrams(s2_clean)
        if ng1 and ng2:
            overlap = len(set(ng1).intersection(set(ng2))) / min(len(set(ng1)), len(set(ng2)))

    final_score = (sub_score * 0.4) + (overlap * 0.3) + (ngram * 0.3)
    if final_score >= 0.95:
        return 1.0

    return final_score
```

`sdoqap/semantic/__init__.py`: `"""Semantic standardization helpers."""`

- [ ] **Step 5: ให้ engine ใช้ฟังก์ชันชุดเดียว**

(a) import: เพิ่มหลังบรรทัด import ของ sdoqap ที่มีอยู่:

```python
from sdoqap.semantic.similarity import char_ngrams, hybrid_similarity, ngram_cosine
from sdoqap.common.ship import ship_package
```

(b) ใน `class LocalSemanticStandardizer` แทนเนื้อสามเมธอด `get_char_ngrams`, `n_gram_cosine_similarity`, `hybrid_similarity` ด้วย:

```python
    def get_char_ngrams(self, s, n=2):
        return char_ngrams(s, n)

    def n_gram_cosine_similarity(self, s1, s2):
        return ngram_cosine(s1, s2)

    def hybrid_similarity(self, s1, s2):
        return hybrid_similarity(s1, s2)
```

(c) ใน `create_semantic_standardize_udf` ลบนิยามซ้อนสามตัว (`def get_char_ngrams(s, n=2):` … จนจบ `def hybrid_similarity(s1, s2):` ก่อนคอมเมนต์ `# 1. Build Token-based Indexes`) แล้วใส่แทนที่ตรงนั้น:

```python
    get_char_ngrams = char_ngrams
    n_gram_cosine_similarity = ngram_cosine
```

(ชื่อ `hybrid_similarity` อ้างถึงฟังก์ชันระดับโมดูลที่ import มาแล้ว ส่วนสองบรรทัดนี้ทำให้โค้ดที่เหลือในฟังก์ชันซึ่งเรียก `get_char_ngrams(...)` และ `n_gram_cosine_similarity(...)` ใช้ได้โดยไม่ต้องแก้)

(d) UDF ตอนนี้อ้างโมดูล `sdoqap` → ต้องส่ง package ไปให้ executor: ใน `run_quality_check` ต่อจากบรรทัด `spark = get_spark_session(f"SDOQAP_QualityCheck_{table_name}")` เพิ่ม:

```python
    ship_package(spark)
```

- [ ] **Step 6: ลบโค้ดที่ไม่ได้ใช้**

```bash
git rm -rq services/spark/semantic_cleaner services/spark/udf_v2_helper.py
git rm -q services/spark/scripts/manual/run_semantic_cleaner.py services/spark/scripts/manual/test_semantic_cleaner_dsl.py services/spark/scripts/manual/test_semantic_cleaner_v2.py services/spark/scripts/manual/stress_test_semantic_cleaner.py
```

- [ ] **Step 7: รันเทสต์ + คอมไพล์** — Expected: PASS, `COMPILE_OK`

- [ ] **Step 8: Commit**

```bash
git add -A services/spark
git commit -m "refactor(spark): one shared hybrid-similarity implementation; remove unused semantic_cleaner package and its scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Stage `schema_align` และ `schema_drift` + สร้าง ctx ใน engine

**Files:**
- Create: `services/spark/sdoqap/stages/schema.py`
- Modify: `services/spark/sdoqap/stages/__init__.py`, `services/spark/sdoqap/pipeline/plan.py`, `services/spark/spark_quality_engine.py`
- Test: `services/spark/tests/unit/test_stage_schema.py`

**Interfaces:**
- Consumes: `RunContext`, `stage`, `run_stages` (Task 1)
- Produces: stage `schema_align` (อ่าน/เขียน `ctx.df`; แก้ `ctx.schema_spec` in place เมื่อ promote เป็น DoubleType), stage `schema_drift` (เขียน `ctx.df`, `ctx.drift_detected`, `ctx.drift_details`; เรียก `ctx.log_es`, `ctx.alert`, `ctx.evolve_schema`); ใน engine: ตัวแปร `ctx` ที่สร้างหลังโหลด rules

- [ ] **Step 1: เทสต์ที่ fail** — `services/spark/tests/unit/test_stage_schema.py`

```python
from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
import sdoqap.stages  # noqa: F401


def test_align_renames_to_registered_name_and_casts(spark):
    spec = {"student_id": "StringType", "score": "IntegerType", "updated_at": "TimestampType"}
    ctx = make_ctx(spark, [("S1", "1,234", "2026-09-15 14:00:00")], spec, primary_key="student_id",
                   columns=["Student ID", "score", "updated_at"])
    run_stages(["schema_align"], ctx)
    row = ctx.df.collect()[0]
    assert "student_id" in ctx.df.columns
    assert row["score"] == 1234
    assert row["updated_at"].year == 2026


def test_align_promotes_integer_with_decimals_to_double(spark):
    spec = {"id": "StringType", "score": "IntegerType"}
    ctx = make_ctx(spark, [("a", "12.50"), ("b", "3")], spec)
    run_stages(["schema_align"], ctx)
    assert ctx.schema_spec["score"] == "DoubleType"
    assert sorted(r["score"] for r in ctx.df.collect()) == [3.0, 12.5]


def test_drift_fills_missing_column_and_logs_proposal(spark):
    spec = {"id": "StringType", "name": "StringType", "score": "StringType"}
    ctx = make_ctx(spark, [("a", "x")], spec, columns=["id", "name"])
    ctx.schema_spec = spec  # engine passes the registered spec, df lacks 'score'
    run_stages(["schema_drift"], ctx)
    assert ctx.drift_detected is True
    assert ctx.drift_details["score"]["error"] == "missing_column"
    assert "score" in ctx.df.columns
    indices = [i for i, _ in ctx.es_docs]
    assert "sdoqap_schema_drifts" in indices and "sdoqap_schema_proposals" in indices
    proposal = [d for i, d in ctx.es_docs if i == "sdoqap_schema_proposals"][0]
    assert proposal["status"] == "PENDING"
    assert any(sev == "critical" for _, sev in ctx.alerts)


def test_no_drift_when_columns_match(spark):
    spec = {"id": "StringType", "name": "StringType"}
    ctx = make_ctx(spark, [("a", "x")], spec)
    run_stages(["schema_drift"], ctx)
    assert ctx.drift_detected is False and ctx.es_docs == []
```

หมายเหตุ: `test_no_drift_when_columns_match` ใช้ DataFrame ที่ทุกคอลัมน์เป็น string และ spec เป็น `StringType` ซึ่ง `field.dataType.__class__.__name__` คืน `"StringType"` ตรงกัน

- [ ] **Step 2: รันให้ fail** — Expected: `KeyError: 'schema_align'`

- [ ] **Step 3: สร้าง `services/spark/sdoqap/stages/schema.py`**

โครงไฟล์:

```python
import json

from pyspark.sql import functions as F

from sdoqap.common.names import clean_column_name, normalize_name
from sdoqap.pipeline.registry import stage


@stage("schema_align", "จัดชื่อคอลัมน์และแปลงชนิดข้อมูล", "align")
def schema_align(ctx):
    df, schema_spec, primary_key = ctx.df, ctx.schema_spec, ctx.primary_key
    # ── BLOCK A (verbatim from spark_quality_engine.run_quality_check) ──
    ctx.df = df
    return ctx


@stage("schema_drift", "ตรวจการเปลี่ยนโครงสร้างตาราง", "transform")
def schema_drift(ctx):
    df, schema_spec, rules = ctx.df, ctx.schema_spec, ctx.rules
    run_id, table_name = ctx.run_id, ctx.table_name
    send_n8n_alert, log_to_elasticsearch, auto_evolve_schema_registry = ctx.alert, ctx.log_es, ctx.evolve_schema
    # ── BLOCK B (verbatim from spark_quality_engine.run_quality_check) ──
    ctx.df, ctx.drift_detected, ctx.drift_details = df, drift_detected, drift_details
    return ctx
```

**BLOCK A** = ใน engine ภายใน `try:` ของการอ่านข้อมูล ตั้งแต่บรรทัด `        for col_name in df.columns:` ที่อยู่ **ถัดจาก** บล็อก `# ─── GUARD: Empty file protection` จนถึงและรวม `        df = df.repartition(10)` — ตัดออกจาก engine แล้ววางแทนที่บรรทัด `# ── BLOCK A ...` โดย**ลดย่อหน้าลง 4 ช่อง** (จาก 8 เป็น 4) ห้ามแก้อย่างอื่น

**BLOCK B** = ใน engine ตั้งแต่บรรทัด `    # 1. AUTO SCHEMA EVOLUTION & DRIFT CHECK` จนถึงบรรทัดสุดท้ายก่อน `    # 2. AUTO-CLEANSING & HEALING` — ตัดออกแล้ววางแทนที่ `# ── BLOCK B ...` ย่อหน้าเดิม (4 ช่อง) ไม่ต้องแก้

ตรวจว่าวางครบ:

```bash
grep -c "df = df.repartition(10)\|# 1.2 Check new columns in DF" services/spark/sdoqap/stages/schema.py
```

Expected: `2`

- [ ] **Step 4: ลงทะเบียนและลำดับ**

`sdoqap/stages/__init__.py` เพิ่ม: `from sdoqap.stages import schema  # noqa: F401`

`sdoqap/pipeline/plan.py`: `ALIGN = ["schema_align"]` และ `TRANSFORM = ["schema_drift"]`

- [ ] **Step 5: ต่อ engine เข้ากับ stage**

(a) import เพิ่ม:

```python
import sdoqap.stages  # noqa: F401  (registers stages)
from sdoqap.pipeline.context import RunContext
from sdoqap.pipeline.registry import run_stages
from sdoqap.pipeline import plan
```

(b) เพิ่มฟังก์ชันใน engine (ใต้ `LATEST_FALLBACK_METRICS = {}`):

```python
def _pop_fallback_metrics():
    global LATEST_FALLBACK_METRICS
    metrics = dict(LATEST_FALLBACK_METRICS)
    LATEST_FALLBACK_METRICS = {}
    return metrics
```

(c) ใน `run_quality_check` ต่อจากบล็อกที่กำหนด `active_path`, `staging_path`, `quarantine_path` เพิ่ม:

```python
    ctx = RunContext(
        spark=spark, table_name=table_name, run_id=run_id, ingest_id=ingest_id,
        primary_key=primary_key, date_column=date_column, schema_spec=schema_spec, rules=rules,
        paths={"raw": raw_path, "active": active_path, "quarantine": quarantine_path},
        quality_threshold=quality_threshold, freshness_limit_hours=freshness_limit_hours,
        log_es=log_to_elasticsearch, alert=send_n8n_alert, evolve_schema=auto_evolve_schema_registry,
        apply_dsl=apply_dsl_remediation_rules, load_std_rules=_load_standardization_rules,
        historical_stats=get_historical_stats, pop_fallback_metrics=_pop_fallback_metrics,
    )
```

(d) ตรงที่ BLOCK A เคยอยู่ (ใน `try:` หลัง empty-file guard) ใส่:

```python
        ctx.df = df
        ctx = run_stages(plan.ALIGN, ctx)
        df = ctx.df
```

(e) ตรงที่ BLOCK B เคยอยู่ใส่:

```python
    ctx.df = df
    ctx = run_stages(["schema_drift"], ctx)
    df, drift_detected, drift_details = ctx.df, ctx.drift_detected, ctx.drift_details
```

- [ ] **Step 6: รันเทสต์ + คอมไพล์** — Expected: PASS, `COMPILE_OK`

- [ ] **Step 7: Commit**

```bash
git add -A services/spark
git commit -m "refactor(engine): extract schema_align and schema_drift stages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Stage `auto_clean`, `validation`, `dedup`, `standardize_dates`, `standardize_categories`

**Files:**
- Create: `services/spark/sdoqap/stages/cleansing.py`, `services/spark/sdoqap/stages/standardize.py`
- Modify: `sdoqap/stages/__init__.py`, `sdoqap/pipeline/plan.py`, `spark_quality_engine.py`
- Test: `services/spark/tests/unit/test_stage_cleansing.py`

**Interfaces:**
- Produces:
  - `auto_clean`: เขียน `ctx.df`, `ctx.remediation_logs` (สร้าง list ใหม่), `ctx.auto_clean`; เรียก `ctx.apply_dsl(df, rules)`
  - `validation`: เขียน `ctx.df_with_status`, `ctx.invalid_df`, `ctx.valid_df`
  - `dedup`: เขียน `ctx.valid_df_with_id`, `ctx.valid_dedup_with_id`, `ctx.clean_df`, `ctx.duplicate_df`
  - `standardize_dates`, `standardize_categories`: อ่าน/เขียน `ctx.clean_df`; ตัวหลังเรียก `ctx.load_std_rules(table_name)`

- [ ] **Step 1: เทสต์ที่ fail** — `services/spark/tests/unit/test_stage_cleansing.py`

```python
from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
import sdoqap.stages  # noqa: F401

SPEC = {"id": "StringType", "score": "StringType"}


def test_auto_clean_keeps_one_row_per_key_and_keeps_null_keys(spark):
    ctx = make_ctx(spark, [("a", "1"), ("a", "2"), (None, "3")], SPEC, rules={"auto_clean": True})
    run_stages(["auto_clean"], ctx)
    assert ctx.df.count() == 2
    assert ctx.remediation_logs == ["resolved_1_duplicates"]


def test_auto_clean_off_leaves_data_untouched(spark):
    ctx = make_ctx(spark, [("a", "1"), ("a", "2")], SPEC, rules={"auto_clean": False})
    run_stages(["auto_clean"], ctx)
    assert ctx.df.count() == 2 and ctx.remediation_logs == []


def test_validation_flags_missing_key_and_null_values(spark):
    ctx = make_ctx(spark, [("a", "1"), (None, "2"), ("c", None)], SPEC)
    run_stages(["validation"], ctx)
    reasons = {r["reject_reason"] for r in ctx.invalid_df.collect()}
    assert reasons == {"missing_primary_key", "null_value_in_score"}
    assert [r["id"] for r in ctx.valid_df.collect()] == ["a"]


def test_dedup_moves_extra_copies_to_duplicates(spark):
    ctx = make_ctx(spark, [("a", "1"), ("a", "1"), ("b", "2")], SPEC)
    run_stages(["validation", "dedup"], ctx)
    assert ctx.clean_df.count() == 2
    dups = ctx.duplicate_df.collect()
    assert len(dups) == 1 and dups[0]["reject_reason"] == "duplicate_records"
    assert "is_invalid" not in ctx.clean_df.columns


def test_dates_standardised_including_buddhist_year(spark):
    spec = {"id": "StringType", "date": "StringType"}
    ctx = make_ctx(spark, [("a", "21 Jul 2569"), ("b", "15/09/2026")], spec)
    run_stages(["validation", "dedup", "standardize_dates"], ctx)
    assert sorted(r["date"] for r in ctx.clean_df.collect()) == ["2026-07-21", "2026-09-15"]


def test_categories_mapped_by_keyword_with_fallback(spark):
    spec = {"id": "StringType", "product": "StringType"}
    ctx = make_ctx(spark, [("a", "Green Apple"), ("b", "Rock")], spec)
    ctx.load_std_rules = lambda table: {"product": {"categories": {"Fruit": ["apple"]}, "fallback": "Other"}}
    run_stages(["validation", "dedup", "standardize_categories"], ctx)
    assert {r["id"]: r["product"] for r in ctx.clean_df.collect()} == {"a": "Fruit", "b": "Other"}
```

- [ ] **Step 2: รันให้ fail** — Expected: `KeyError: 'auto_clean'`

- [ ] **Step 3: สร้าง `sdoqap/stages/cleansing.py`**

```python
from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("auto_clean", "แก้ข้อมูลอัตโนมัติด้วยกฎ DSL และลบแถวซ้ำตามคีย์", "transform")
def auto_clean(ctx):
    rules, df, primary_key, date_column = ctx.rules, ctx.df, ctx.primary_key, ctx.date_column
    apply_dsl_remediation_rules = ctx.apply_dsl
    # ── BLOCK C ──
    ctx.df, ctx.remediation_logs, ctx.auto_clean = df, remediation_logs, auto_clean
    return ctx


@stage("validation", "ตรวจค่าว่าง ชนิดข้อมูล และวันที่", "transform")
def validation(ctx):
    primary_key, df, schema_spec, date_column = ctx.primary_key, ctx.df, ctx.schema_spec, ctx.date_column
    # ── BLOCK D ──
    ctx.df_with_status, ctx.invalid_df, ctx.valid_df = df_with_status, invalid_df, valid_df
    return ctx


@stage("dedup", "คัดแถวซ้ำและเก็บแถวล่าสุด", "transform")
def dedup(ctx):
    valid_df, primary_key, date_column, df = ctx.valid_df, ctx.primary_key, ctx.date_column, ctx.df
    # ── BLOCK E ──
    # ── BLOCK F ──
    ctx.valid_df_with_id, ctx.valid_dedup_with_id = valid_df_with_id, valid_dedup_with_id
    ctx.clean_df, ctx.duplicate_df = clean_df, duplicate_df
    return ctx
```

**BLOCK C** = engine ตั้งแต่ `    # 2. AUTO-CLEANSING & HEALING (Self-Healing Data Pipeline - Correct Enterprise Logic)` ถึงและรวม `        df = df_non_null_dedup.unionByName(df_null_pk, allowMissingColumns=True)`
**BLOCK D** = ตั้งแต่ `    # 3. DATA VALIDATION (Row-level Quality check)` ถึงและรวม `    valid_df = df_with_status.filter(~F.col("is_invalid") & F.col("is_invalid").isNotNull())`
**BLOCK E** = ตั้งแต่ `    # Check duplicates on valid records (incremental deduplication)` ถึงและรวม `    clean_df = valid_dedup_with_id.drop("__row_id", "is_invalid", "reject_reason")`
**BLOCK F** = สามบรรทัดตั้งแต่ `    # Find the dropped duplicates by Anti-Join to send to quarantine` ถึง `                                   .withColumn("reject_reason", F.lit("duplicate_records"))` (ย้ายขึ้นมาก่อน standardization ได้ เพราะใช้แค่ `valid_df_with_id` กับ `valid_dedup_with_id` ซึ่ง standardization ไม่แตะ)

ทุกบล็อกย่อหน้าเดิม 4 ช่อง วางตามตัวอักษร

- [ ] **Step 4: สร้าง `sdoqap/stages/standardize.py`**

```python
from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("standardize_dates", "ปรับรูปแบบวันที่ (รวม พ.ศ.)", "transform")
def standardize_dates(ctx):
    clean_df = ctx.clean_df
    # ── BLOCK G ──
    ctx.clean_df = clean_df
    return ctx


@stage("standardize_categories", "จัดหมวดค่าตามคำสำคัญ", "transform")
def standardize_categories(ctx):
    clean_df, table_name = ctx.clean_df, ctx.table_name
    _load_standardization_rules = ctx.load_std_rules
    # ── BLOCK H ──
    ctx.clean_df = clean_df
    return ctx
```

**BLOCK G** = engine ตั้งแต่ `    # ─── STANDARDIZATION LAYER (Date and Product categorization)` ถึงและรวม `            clean_df = clean_df.withColumn(dc, std_date_udf(F.col(dc)))`
**BLOCK H** = ตั้งแต่ `    # ─── GENERIC DATA-DRIVEN STANDARDIZATION (from Schema Registry)` ถึงและรวม `        print(f"[STANDARDIZATION] Warning: Could not apply standardization rules: {std_err}")`

- [ ] **Step 5: ลงทะเบียนและลำดับ**

`sdoqap/stages/__init__.py` เพิ่ม `from sdoqap.stages import cleansing, standardize  # noqa: F401`
`plan.py`: `TRANSFORM = ["schema_drift", "auto_clean", "validation", "dedup", "standardize_dates", "standardize_categories"]`

- [ ] **Step 6: ต่อ engine** — ตรงที่ BLOCK C…H เคยอยู่ (ตอนนี้ติดกันหลังตัด F ออก) ใส่แทนที่ BLOCK C:

```python
    ctx.df = df
    ctx = run_stages(["auto_clean", "validation", "dedup", "standardize_dates", "standardize_categories"], ctx)
    df, remediation_logs, auto_clean = ctx.df, ctx.remediation_logs, ctx.auto_clean
    df_with_status, invalid_df, valid_df = ctx.df_with_status, ctx.invalid_df, ctx.valid_df
    valid_df_with_id, valid_dedup_with_id = ctx.valid_df_with_id, ctx.valid_dedup_with_id
    clean_df, duplicate_df = ctx.clean_df, ctx.duplicate_df
    pk_cols = ctx.pk_cols
```

(`pk_cols` ถูกใช้ต่อใน `column_filter`, MERGE และ AI — เดิมถูกกำหนดใน BLOCK D/E)

- [ ] **Step 7: รันเทสต์ + คอมไพล์** — Expected: PASS, `COMPILE_OK`

- [ ] **Step 8: Commit**

```bash
git add -A services/spark
git commit -m "refactor(engine): extract cleansing, validation, dedup and standardization stages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Stage anomaly (IQR, Z-score, induced), `quarantine_assembly`, `column_filter`

**Files:**
- Create: `services/spark/sdoqap/stages/anomaly.py`, `services/spark/sdoqap/stages/assembly.py`
- Modify: `sdoqap/stages/__init__.py`, `plan.py`, `spark_quality_engine.py`
- Test: `services/spark/tests/unit/test_stage_anomaly.py`

**Interfaces:**
- Produces:
  - `anomaly_iqr`: `ctx.outlier_df`, `ctx.value_range_profile`, `ctx.clean_df`
  - `anomaly_zscore`: `ctx.unsupervised_outlier_df`, `ctx.clean_df`
  - `anomaly_induced`: `ctx.induced_outlier_df`, `ctx.clean_df`
  - `quarantine_assembly`: `ctx.all_quarantined`, `ctx.all_quarantined_write`, `ctx.clean_count`, `ctx.quarantine_count`, `ctx.total_records` (และ cache `clean_df`)
  - `column_filter`: `ctx.clean_df`

- [ ] **Step 1: เทสต์ที่ fail** — `services/spark/tests/unit/test_stage_anomaly.py`

```python
from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
import sdoqap.stages  # noqa: F401

SPEC = {"id": "StringType", "v": "DoubleType"}


def numeric_ctx(spark, values, rules=None):
    rows = [(f"r{i}", float(v)) for i, v in enumerate(values)]
    ctx = make_ctx(spark, rows, SPEC, rules=rules or {})
    ctx.clean_df = ctx.df
    return ctx


def test_iqr_moves_far_value_to_outliers(spark):
    ctx = numeric_ctx(spark, list(range(1, 21)) + [500], {"value_range": {"mode": "auto", "iqr_multiplier": 1.5}})
    run_stages(["anomaly_iqr"], ctx)
    assert [r["v"] for r in ctx.outlier_df.collect()] == [500.0]
    assert ctx.clean_df.count() == 20
    assert "v" in ctx.value_range_profile


def test_iqr_off_by_default(spark):
    ctx = numeric_ctx(spark, [1, 2, 500])
    run_stages(["anomaly_iqr"], ctx)
    assert ctx.outlier_df is None and ctx.clean_df.count() == 3


def test_zscore_flags_value_beyond_three_sigma(spark):
    ctx = numeric_ctx(spark, [10] * 30 + [1000])
    run_stages(["anomaly_zscore"], ctx)
    assert [r["v"] for r in ctx.unsupervised_outlier_df.collect()] == [1000.0]
    assert ctx.clean_df.count() == 30


def test_induced_rule_condition_quarantines_matches(spark):
    ctx = numeric_ctx(spark, [10, 95, 99], {"induced": {"r1": {"condition": "v > 90"}}})
    run_stages(["anomaly_induced"], ctx)
    rows = ctx.induced_outlier_df.collect()
    assert sorted(r["v"] for r in rows) == [95.0, 99.0]
    assert {r["reject_reason"] for r in rows} == {"induced_tree_rule_match"}


def test_assembly_counts_every_rejected_row_once(spark):
    ctx = make_ctx(spark, [("a", 1.0), ("a", 1.0), (None, 2.0), ("b", 3.0)], SPEC)
    run_stages(["validation", "dedup", "quarantine_assembly"], ctx)
    assert (ctx.clean_count, ctx.quarantine_count, ctx.total_records) == (2, 2, 4)
    assert "run_id" in ctx.all_quarantined_write.columns


def test_column_filter_strips_columns_outside_schema(spark):
    ctx = make_ctx(spark, [("a", 1.0, "junk")], SPEC, columns=["id", "v", "extra"])
    ctx.clean_df = ctx.df
    run_stages(["column_filter"], ctx)
    assert ctx.clean_df.columns == ["id", "v"]
    assert ctx.remediation_logs == ["extra_columns_stripped_1"]
```

- [ ] **Step 2: รันให้ fail** — Expected: `KeyError: 'anomaly_iqr'`

- [ ] **Step 3: สร้าง `sdoqap/stages/anomaly.py`**

```python
from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("anomaly_iqr", "หา outlier ด้วย IQR", "transform")
def anomaly_iqr(ctx):
    rules, schema_spec, clean_df, remediation_logs = ctx.rules, ctx.schema_spec, ctx.clean_df, ctx.remediation_logs
    # ── BLOCK I ──
    ctx.outlier_df, ctx.value_range_profile, ctx.clean_df = outlier_df, value_range_profile, clean_df
    return ctx


@stage("anomaly_zscore", "หา anomaly ด้วย Z-score", "transform")
def anomaly_zscore(ctx):
    schema_spec, clean_df, remediation_logs = ctx.schema_spec, ctx.clean_df, ctx.remediation_logs
    # ── BLOCK J ──
    ctx.unsupervised_outlier_df, ctx.clean_df = unsupervised_outlier_df, clean_df
    return ctx


@stage("anomaly_induced", "ใช้กฎที่เรียนรู้จาก Decision Tree", "transform")
def anomaly_induced(ctx):
    rules, clean_df, remediation_logs = ctx.rules, ctx.clean_df, ctx.remediation_logs
    # ── BLOCK K ──
    ctx.induced_outlier_df, ctx.clean_df = induced_outlier_df, clean_df
    return ctx
```

**BLOCK I** = engine ตั้งแต่ `    # ─── DYNAMIC RULES Layer 2: IQR Value Range Outlier Detection` ถึงและรวม `        print(f"[DYNAMIC RULES] IQR outlier detection failed: {ore}. Continuing without outlier flagging.")`
**BLOCK J** = ตั้งแต่ `    # ─── DYNAMIC RULES: Unsupervised Anomaly Detection (Z-score)` ถึงและรวม `        print(f"[DYNAMIC RULES] Unsupervised anomaly detection failed: {uae}. Continuing.")`
**BLOCK K** = ตั้งแต่ `    # ─── DYNAMIC RULES: Induced Tree Rules` ถึงและรวม `        print(f"[DYNAMIC ENGINE] Induced rules execution failed: {ie}. Continuing.")`

(`from dynamic_rules_engine import ...` ภายในบล็อกยังทำงาน เพราะ `/opt/spark-apps` อยู่ใน `sys.path` ของ driver และใน pytest ผ่าน conftest)

- [ ] **Step 4: สร้าง `sdoqap/stages/assembly.py`**

```python
from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("quarantine_assembly", "รวมแถวที่ไม่ผ่านเข้าโซนกักกัน", "transform")
def quarantine_assembly(ctx):
    invalid_df, duplicate_df = ctx.invalid_df, ctx.duplicate_df
    outlier_df, unsupervised_outlier_df, induced_outlier_df = ctx.outlier_df, ctx.unsupervised_outlier_df, ctx.induced_outlier_df
    run_id, clean_df = ctx.run_id, ctx.clean_df
    # ── BLOCK L ──
    ctx.all_quarantined, ctx.all_quarantined_write = all_quarantined, all_quarantined_write
    ctx.clean_count, ctx.quarantine_count, ctx.total_records = clean_count, quarantine_count, total_records
    return ctx


@stage("column_filter", "ตัดคอลัมน์ที่ไม่อยู่ใน schema", "transform")
def column_filter(ctx):
    schema_spec, primary_key, rules = ctx.schema_spec, ctx.primary_key, ctx.rules
    clean_df, remediation_logs = ctx.clean_df, ctx.remediation_logs
    # ── BLOCK M ──
    ctx.clean_df = clean_df
    return ctx
```

**BLOCK L** = engine ตั้งแต่ `    # Combine all quarantined records (null PKs + duplicates + outliers + unsupervised anomalies + induced anomalies)` ถึงและรวม `    total_records = clean_count + quarantine_count`
**BLOCK M** = ตั้งแต่ `    if schema_spec:` (บรรทัดถัดมาคือ `        allowed_cols = list(schema_spec.keys())`) ถึงและรวม `            remediation_logs.append(f"extra_columns_stripped_{len(extra_cols)}")`
บรรทัด `    print("Writing validated datasets to HDFS using Delta Lake...")` ที่อยู่ระหว่าง L กับ M ให้**คงไว้ใน engine**

- [ ] **Step 5: ลงทะเบียนและลำดับ**

`__init__.py` เพิ่ม `from sdoqap.stages import anomaly, assembly  # noqa: F401`
`plan.py`: `TRANSFORM` ต่อท้ายด้วย `"anomaly_iqr", "anomaly_zscore", "anomaly_induced", "quarantine_assembly", "column_filter"`

- [ ] **Step 6: ต่อ engine**

ตรงที่ BLOCK I เคยอยู่ (I, J, K, L ติดกัน) ใส่:

```python
    ctx = run_stages(["anomaly_iqr", "anomaly_zscore", "anomaly_induced", "quarantine_assembly"], ctx)
    outlier_df, value_range_profile = ctx.outlier_df, ctx.value_range_profile
    unsupervised_outlier_df, induced_outlier_df = ctx.unsupervised_outlier_df, ctx.induced_outlier_df
    all_quarantined, all_quarantined_write = ctx.all_quarantined, ctx.all_quarantined_write
    clean_df = ctx.clean_df
    clean_count, quarantine_count, total_records = ctx.clean_count, ctx.quarantine_count, ctx.total_records
```

ตรงที่ BLOCK M เคยอยู่ (หลังบรรทัด print "Writing validated datasets") ใส่:

```python
    ctx = run_stages(["column_filter"], ctx)
    clean_df = ctx.clean_df
```

- [ ] **Step 7: รันเทสต์ + คอมไพล์** — Expected: PASS, `COMPILE_OK`

- [ ] **Step 8: Commit**

```bash
git add -A services/spark
git commit -m "refactor(engine): extract anomaly, quarantine assembly and column filter stages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Stage หลังโหลด — metrics, `ai_advisory`, `report`

**Files:**
- Create: `services/spark/sdoqap/stages/metrics.py`, `advisory.py`, `report.py`
- Modify: `sdoqap/stages/__init__.py`, `plan.py`, `spark_quality_engine.py`
- Test: `services/spark/tests/unit/test_stage_metrics.py`

**Interfaces:**
- Consumes: `ctx.paths["active"]`, `ctx.paths["quarantine"]`, `ctx.paths["raw"]`, counts จาก Task 5
- Produces: ค่าใน `ctx.metrics`: `class_balance`, `group_col`, `quarantine_breakdown`, `quarantined_financial_value`, `max_lag_hours`, `quality_score`, `current_quarantine_rate`, `historical_rates`, `z_score`, `is_anomaly`, `operational_impact_score`, `quality_run_doc`; `ctx.quarantine_run_df`
- ฟังก์ชันบริสุทธิ์ `sdoqap.stages.report.build_quality_run_doc(ctx, finished_at) -> dict` ใช้ในเทสต์และใน stage `report`

- [ ] **Step 1: เทสต์ที่ fail** — `services/spark/tests/unit/test_stage_metrics.py`

```python
from datetime import datetime, timedelta, timezone

from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
from sdoqap.stages.report import build_quality_run_doc
import sdoqap.stages  # noqa: F401

SPEC = {"id": "StringType", "v": "DoubleType"}


def counted_ctx(spark, clean, quarantined, **kw):
    ctx = make_ctx(spark, [], SPEC, **kw)
    ctx.clean_count, ctx.quarantine_count, ctx.total_records = clean, quarantined, clean + quarantined
    return ctx


def test_quality_score_and_alert_below_threshold(spark):
    ctx = counted_ctx(spark, 85, 15)
    ctx.quality_threshold = 90.0
    run_stages(["quality_score"], ctx)
    assert ctx.metrics["quality_score"] == 85.0
    assert any(sev == "critical" for _, sev in ctx.alerts)


def test_empty_input_scores_zero_and_says_why(spark):
    ctx = counted_ctx(spark, 0, 0)
    run_stages(["quality_score"], ctx)
    assert ctx.metrics["quality_score"] == 0.0
    assert any("Empty source file" in log for log in ctx.remediation_logs)


def test_quarantine_rate_jump_is_an_anomaly(spark):
    ctx = counted_ctx(spark, 50, 50)
    ctx.historical_stats = lambda table: [0.1, 0.1, 0.1, 0.1]
    run_stages(["quality_score"], ctx)
    assert ctx.metrics["is_anomaly"] is True
    assert ctx.metrics["z_score"] > 3.0


def test_ai_advisory_disabled_is_a_no_op(spark):
    ctx = counted_ctx(spark, 10, 0, rules={"ai_advisor": {"enabled": False}})
    ctx.paths = {"active": "unused", "quarantine": "unused", "raw": "unused"}
    ctx.metrics.update(is_anomaly=False, quality_score=100.0, z_score=0.0,
                       historical_rates=[], current_quarantine_rate=0.0)
    run_stages(["ai_advisory"], ctx)
    assert "profile_report" not in ctx.metrics or ctx.metrics["profile_report"] is None


def test_breakdown_splits_multi_reason_rows(spark, tmp_path):
    qpath = str(tmp_path / "q")
    spark.createDataFrame([("r1", "a; b"), ("r1", "a"), ("r2", "c")], ["run_id", "reject_reason"]) \
        .write.format("delta").partitionBy("run_id").save(qpath)
    ctx = counted_ctx(spark, 0, 2, run_id="r1")
    ctx.paths = {"quarantine": qpath, "active": str(tmp_path / "a"), "raw": "raw"}
    run_stages(["quarantine_breakdown"], ctx)
    assert ctx.metrics["quarantine_breakdown"] == {"a": 2, "b": 1}


def test_quality_run_doc_has_counts_timing_and_stage_seconds(spark):
    ctx = counted_ctx(spark, 9, 1, run_id="r1")
    ctx.ingest_id = "i1"
    ctx.metrics.update(quality_score=90.0, max_lag_hours=0.0, quarantined_financial_value=0.0,
                       operational_impact_score=10.0, z_score=0.0, is_anomaly=False,
                       stage_seconds={"validation": 0.5}, started_at=datetime.now(timezone.utc) - timedelta(seconds=3))
    ctx.pop_fallback_metrics = lambda: {"fallback_rate": 0.1}
    doc = build_quality_run_doc(ctx, finished_at=datetime.now(timezone.utc))
    assert (doc["total_records"], doc["clean_records"], doc["quarantined_records"]) == (10, 9, 1)
    assert doc["ingest_id"] == "i1" and doc["duration_seconds"] >= 3
    assert doc["stage_seconds"] == {"validation": 0.5}
    assert doc["fallback_metrics"] == {"fallback_rate": 0.1}
```

- [ ] **Step 2: รันให้ fail** — Expected: `KeyError: 'quality_score'`

- [ ] **Step 3: สร้าง `sdoqap/stages/metrics.py`**

```python
from datetime import datetime, timezone

from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("distribution", "สรุปการกระจายของข้อมูล", "post_load")
def distribution(ctx):
    spark, table_name, clean_count = ctx.spark, ctx.table_name, ctx.clean_count
    active_path = ctx.paths["active"]
    # ── BLOCK N ──
    ctx.metrics["class_balance"], ctx.metrics["group_col"] = class_balance, group_col
    return ctx


@stage("quarantine_breakdown", "สรุปเหตุผลที่กักกัน", "post_load")
def quarantine_breakdown_stage(ctx):
    spark, run_id, quarantine_count = ctx.spark, ctx.run_id, ctx.quarantine_count
    quarantine_path = ctx.paths["quarantine"]
    quar_run_df = None
    # ── BLOCK O ──
    ctx.metrics["quarantine_breakdown"], ctx.quarantine_run_df = quarantine_breakdown, quar_run_df
    return ctx


@stage("copdq", "ประเมินมูลค่าความเสียหาย (COPDQ)", "post_load")
def copdq(ctx):
    quarantine_count, quar_run_df = ctx.quarantine_count, ctx.quarantine_run_df
    # ── BLOCK P ──
    ctx.metrics["quarantined_financial_value"] = quarantined_financial_value
    return ctx


@stage("freshness", "วัดความสดใหม่ของข้อมูล", "post_load")
def freshness(ctx):
    spark, table_name, date_column, run_id = ctx.spark, ctx.table_name, ctx.date_column, ctx.run_id
    clean_count, active_path = ctx.clean_count, ctx.paths["active"]
    # ── BLOCK Q ──
    ctx.metrics["max_lag_hours"] = max_lag_hours
    return ctx


@stage("quality_score", "คำนวณคะแนนคุณภาพและ anomaly ของอัตรากักกัน", "post_load")
def quality_score_stage(ctx):
    clean_count, total_records, quarantine_count = ctx.clean_count, ctx.total_records, ctx.quarantine_count
    remediation_logs, quality_threshold = ctx.remediation_logs, ctx.quality_threshold
    table_name, run_id = ctx.table_name, ctx.run_id
    send_n8n_alert, get_historical_stats = ctx.alert, ctx.historical_stats
    # ── BLOCK R ──
    ctx.metrics.update(quality_score=quality_score, current_quarantine_rate=current_quarantine_rate,
                       historical_rates=historical_rates, z_score=z_score, is_anomaly=is_anomaly)
    return ctx


@stage("operational_impact", "คะแนนผลกระทบเชิงปฏิบัติการแบบถ่วงน้ำหนัก", "post_load")
def operational_impact(ctx):
    rules, primary_key, pk_cols, date_column = ctx.rules, ctx.primary_key, ctx.pk_cols, ctx.date_column
    total_records, quarantine_count, all_quarantined = ctx.total_records, ctx.quarantine_count, ctx.all_quarantined
    # ── BLOCK T ──
    ctx.metrics["operational_impact_score"] = operational_impact_score
    return ctx
```

**BLOCK N** = engine ตั้งแต่ `    # Class Balance / Data Distribution calculation` ถึงและรวม `            print(f"Error computing data distribution: {e}")`
**BLOCK O** = ตั้งแต่ `    # Quarantine Reasons Breakdown` ถึงและรวม `            print(f"Error computing quarantine breakdown: {e}")` (ตัวแปร `quar_run_df = None` ใน prologue ทำให้ BLOCK P ได้ `None` แทน `NameError` เมื่อ breakdown ล้ม — ผลเหมือนเดิมเพราะ BLOCK P ครอบด้วย try และพิมพ์ error)
**BLOCK P** = ตั้งแต่ `    # Calculate Dynamic Financial COPDQ (Root Cause Fix for hardcoded math)` ถึงและรวม `            print(f"Error computing financial loss: {e}")`
**BLOCK Q** = ตั้งแต่ `    # 3. FRESHNESS LAG` ถึงและรวม `        print(f"Skipping freshness check for historical dataset '{table_name}'.")`
**BLOCK R** = ตั้งแต่ `    # 4. QUALITY SCORE` ถึงบรรทัดสุดท้ายของ `send_n8n_alert(...)` ใน `if z_score > 3.0:` (บรรทัด `            )` ก่อน `    # ─── DYNAMIC RULES Layer 3: Dynamic Decision Engine`)
**BLOCK T** = ตั้งแต่ `    # 4.2 Weighted Operational COPDQ Score` ถึงและรวม `    print(f"Weighted Operational Impact Score: {operational_impact_score:.2f}%")`

- [ ] **Step 4: สร้าง `sdoqap/stages/advisory.py`**

```python
from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("ai_advisory", "วิเคราะห์ด้วย AI และเสนอกฎ", "post_load")
def ai_advisory(ctx):
    m = ctx.metrics
    rules, spark, table_name, run_id = ctx.rules, ctx.spark, ctx.table_name, ctx.run_id
    active_path, quarantine_path = ctx.paths["active"], ctx.paths["quarantine"]
    remediation_logs, quality_threshold = ctx.remediation_logs, ctx.quality_threshold
    is_anomaly, quality_score, z_score = m["is_anomaly"], m["quality_score"], m["z_score"]
    historical_rates, current_quarantine_rate = m["historical_rates"], m["current_quarantine_rate"]
    quarantine_breakdown = m.get("quarantine_breakdown", {})
    drift_detected, value_range_profile = ctx.drift_detected, ctx.value_range_profile
    total_records, quarantine_count = ctx.total_records, ctx.quarantine_count
    primary_key, pk_cols, date_column = ctx.primary_key, ctx.pk_cols, ctx.date_column
    # ── BLOCK S ──
    m["profile_report"] = profile_report
    return ctx
```

**BLOCK S** = engine ตั้งแต่ `    # ─── DYNAMIC RULES Layer 3: Dynamic Decision Engine` ถึงและรวม `            print(f"[DYNAMIC ENGINE] AI analysis failed (non-fatal): {ai_err}")`

- [ ] **Step 5: สร้าง `sdoqap/stages/report.py`**

```python
from datetime import datetime, timezone

from sdoqap.pipeline.registry import stage


def build_quality_run_doc(ctx, finished_at):
    m = ctx.metrics
    rules = ctx.rules
    started_at = m["started_at"]
    doc = {
        "run_id": ctx.run_id,
        "ingest_id": ctx.ingest_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round((finished_at - started_at).total_seconds(), 3),
        "table_name": ctx.table_name,
        "total_records": ctx.total_records,
        "clean_records": ctx.clean_count,
        "quarantined_records": ctx.quarantine_count,
        "quality_score": m["quality_score"],
        "freshness_lag_hours": m.get("max_lag_hours", 0.0),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "quarantined_financial_value": m.get("quarantined_financial_value", 0.0),
        "operational_impact_score": m.get("operational_impact_score", 0.0),
        "z_score": m.get("z_score", 0.0),
        "is_anomaly": m.get("is_anomaly", False),
        "remediation_logs": ctx.remediation_logs,
        "auto_cleaned": ctx.auto_clean,
        "stage_seconds": dict(m.get("stage_seconds", {})),
    }
    if m.get("class_balance"):
        doc["class_balance"] = m["class_balance"]
        doc["class_balance_column"] = m.get("group_col")
    if m.get("quarantine_breakdown"):
        doc["quarantine_breakdown"] = m["quarantine_breakdown"]
    doc["rules_mode"] = "adaptive" if isinstance(rules.get("quality_score_threshold"), dict) else "static"
    doc["effective_quality_threshold"] = ctx.quality_threshold
    doc["effective_freshness_threshold"] = ctx.freshness_limit_hours
    if ctx.value_range_profile:
        doc["value_range_profile"] = ctx.value_range_profile
    fallback = ctx.pop_fallback_metrics()
    if fallback:
        doc["fallback_metrics"] = fallback
    return doc


@stage("report", "บันทึกผลลง Elasticsearch", "post_load")
def report(ctx):
    now = datetime.now(timezone.utc)
    doc = build_quality_run_doc(ctx, finished_at=now)
    ctx.log_es("sdoqap_quality_runs", doc)
    ctx.log_es("sdoqap_lineage_runs", {
        "run_id": ctx.run_id,
        "ingest_id": ctx.ingest_id,
        "source_table": f"raw-{ctx.table_name}",
        "target_table": f"active-{ctx.table_name}",
        "source_path": ctx.paths["raw"],
        "target_path": ctx.paths["active"],
        "quarantine_path": ctx.paths["quarantine"],
        "timestamp": now.isoformat(),
    })
    ctx.log_es("sdoqap_pipeline_runs", {
        "run_id": ctx.run_id,
        "ingest_id": ctx.ingest_id,
        "table_name": ctx.table_name,
        "state": "success" if ctx.metrics["quality_score"] >= ctx.quality_threshold else "warnings",
        "timestamp": now.isoformat(),
    })
    print(f"Quality validation completed. Quality Score: {ctx.metrics['quality_score']:.2f}% (threshold={ctx.quality_threshold}%)")
    ctx.metrics["quality_run_doc"] = doc
    return ctx
```

(ฟิลด์ใน `build_quality_run_doc` คัดมาจาก `quality_run_doc` ใน engine ที่ Plan B Task 5 แก้แล้วครบทุกตัว บวก `stage_seconds` ใหม่ — ตรวจเทียบทีละคีย์กับ engine ก่อนลบของเดิมใน Step 7)

- [ ] **Step 6: ลงทะเบียนและลำดับ**

`__init__.py` เพิ่ม `from sdoqap.stages import metrics, advisory, report  # noqa: F401`
`plan.py`: `POST_LOAD = ["distribution", "quarantine_breakdown", "copdq", "freshness", "quality_score", "ai_advisory", "operational_impact", "report"]`

- [ ] **Step 7: ต่อ engine**

1. เพิ่ม `ctx.metrics["started_at"] = started_at` ต่อจากตอนสร้าง `ctx` (Task 3 Step 5c)
2. หลังบรรทัด `    all_quarantined_write.unpersist()` ลบบล็อก N, O, P, Q, R, S, T และส่วน "Log operational run metrics to Elasticsearch" ทั้งหมดจนถึงและรวม `    print(f"Quality validation completed. Quality Score: {quality_score:.2f}% (threshold={quality_threshold}%)")` แล้วใส่แทน:

```python
    ctx.clean_df, ctx.all_quarantined = clean_df, all_quarantined
    ctx = run_stages(plan.POST_LOAD, ctx)
    quality_score = ctx.metrics["quality_score"]
```

3. บล็อก `# ─── Track 3: Downstream Event-Driven Trigger` (gold layer) ที่ใช้ `quality_score` และ `quality_threshold` คงไว้ไม่แก้; บล็อก archive ที่ใช้ `quarantine_count` ยังใช้ตัวแปร local ที่ re-bind ไว้ใน Task 5

ตรวจว่าไม่เหลือ logic ซ้ำ:

```bash
grep -n "quality_run_doc = {\|# Class Balance\|# 4.2 Weighted\|Dynamic Decision Engine" services/spark/spark_quality_engine.py
```

Expected: ไม่พบ

- [ ] **Step 8: รันเทสต์ + คอมไพล์** — Expected: PASS, `COMPILE_OK`

- [ ] **Step 9: Commit**

```bash
git add -A services/spark
git commit -m "refactor(engine): extract metrics, AI advisory and report stages; record per-stage seconds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: เก็บกวาด glue ใน engine และคำสั่งแสดงรายการ stage

**Files:**
- Modify: `services/spark/spark_quality_engine.py`
- Test: `services/spark/tests/unit/test_stage_plan.py`

- [ ] **Step 1: เทสต์ที่ fail** — `services/spark/tests/unit/test_stage_plan.py`

```python
import subprocess
import sys

from sdoqap.pipeline import plan
from sdoqap.pipeline.registry import STAGES, list_stages
import sdoqap.stages  # noqa: F401


def test_every_planned_stage_is_registered_once():
    names = plan.ALIGN + plan.TRANSFORM + plan.POST_LOAD
    assert len(names) == len(set(names))
    assert all(n in STAGES for n in names)


def test_list_stages_has_titles_and_phases():
    stages = list_stages()
    assert stages[0]["name"] == "schema_align"
    assert stages[-1]["name"] == "report"
    assert all(s["title"] and s["phase"] in {"align", "transform", "post_load"} for s in stages)


def test_cli_lists_stages():
    out = subprocess.run([sys.executable, "-m", "sdoqap.pipeline"], capture_output=True, text=True, check=True).stdout
    assert "schema_drift" in out and "total:" in out
```

- [ ] **Step 2: รัน** — Expected: PASS ถ้า Task 3–6 ครบ (ถ้า fail แปลว่ามี stage ตกหล่น ให้แก้ก่อน)

- [ ] **Step 3: รวม glue ที่กระจายให้เป็นสามจุด**

ใน `run_quality_check` ปัจจุบันมี `run_stages([...])` หลายจุดพร้อม re-bind ให้รวมเป็น:
1. ใน `try:` ของการอ่าน: `ctx = run_stages(plan.ALIGN, ctx)` (มีอยู่แล้ว)
2. หลังออกจาก `try/except` ของการอ่าน: รวม `schema_drift` … `quarantine_assembly` เป็นคำสั่งเดียว

```python
    ctx.df = df
    ctx = run_stages([n for n in plan.TRANSFORM if n != "column_filter"], ctx)
    ...re-bind เดิมทั้งหมดของ Task 3–5 รวมกันที่นี่...
```

   แล้ว `column_filter` คงอยู่ตำแหน่งเดิมหลัง print "Writing validated datasets" (เพราะ print นั้นต้องอยู่ก่อน)
3. `ctx = run_stages(plan.POST_LOAD, ctx)` หลังโหลด (มีอยู่แล้ว)

ลบ re-bind ของตัวแปรที่ไม่ได้ถูกใช้ต่อใน engine แล้ว — ตรวจว่าตัวแปรไหนยังถูกอ้าง:

```bash
for v in drift_detected drift_details df_with_status invalid_df valid_df valid_df_with_id valid_dedup_with_id duplicate_df outlier_df unsupervised_outlier_df induced_outlier_df value_range_profile remediation_logs auto_clean; do
  printf "%s: " $v; grep -c "\b$v\b" services/spark/spark_quality_engine.py
done
```

ตัวที่นับได้ `1` (เหลือแค่บรรทัด re-bind) ให้ลบออกจากบรรทัด re-bind

- [ ] **Step 4: คอมไพล์ + unit tests** — Expected: `COMPILE_OK`, PASS

- [ ] **Step 5: Commit**

```bash
git add -A services/spark
git commit -m "refactor(engine): run_quality_check drives the stage plan in three calls; add stage listing test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Golden test — ผลต้องเหมือนก่อน refactor

- [ ] **Step 1: build และรีสตาร์ท Spark**

```bash
docker compose build spark-master spark-worker
docker compose up -d --force-recreate spark-master spark-worker
sleep 150
```

- [ ] **Step 2: รัน golden อีกครั้งและเทียบ**

```bash
bash scripts/evaluation/golden_run.sh golden_student_scores data/samples/student_scores/student_scores_sample.csv docs/evaluation/evidence/c-golden-after.json
python scripts/evaluation/compare_golden.py docs/evaluation/evidence/c-golden-before.json docs/evaluation/evidence/c-golden-after.json
```

Expected: `GOLDEN MATCH` และไฟล์ after มี `stage_seconds` ครบทุก stage

ถ้าได้ `GOLDEN MISMATCH`: ห้ามแก้ baseline ให้ใช้ `git bisect` ระหว่าง commit ของ Task 2 ถึง Task 7 (รัน golden_run ที่แต่ละ commit) หา stage ที่ทำให้ต่าง แล้วเทียบบล็อกที่ย้ายกับต้นฉบับ (`git show HEAD~N:services/spark/spark_quality_engine.py`)

- [ ] **Step 3: บันทึกรายการ stage เป็นหลักฐาน**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T -w /opt/spark-apps spark-master python -m sdoqap.pipeline > docs/evaluation/evidence/c-stage-list.txt
cat docs/evaluation/evidence/c-stage-list.txt
```

Expected: 20 stage และบรรทัด `total: 20 stages`

- [ ] **Step 4: Commit**

```bash
git add docs/evaluation/evidence/c-golden-after.json docs/evaluation/evidence/c-stage-list.txt
git commit -m "test(golden): stage refactor reproduces baseline counts exactly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Stage ใหม่ `range_rules` และแก้ registry ของชุดข้อมูลประเมิน (ตั้งใจเปลี่ยนพฤติกรรม)

ปัจจุบัน engine ไม่มีกฎ "ช่วงค่าตามธุรกิจ" (เช่น score 0–100 ตาม `docs/requirements/Evalution_Guildline.md` Step 3) — IQR จับได้เฉพาะค่าที่หลุดจากการกระจาย และ registry ของ `student_course_scores` ใช้คีย์หลักผิด (`student_id` อย่างเดียว ทั้งที่คีย์จริงคือ `student_id + course + semester`) และใช้ `semester` (ข้อความ "2/2026") เป็น date column

**Files:**
- Create: `services/spark/sdoqap/stages/rules.py`
- Modify: `sdoqap/stages/assembly.py` (รวม `range_violation_df`), `sdoqap/stages/__init__.py`, `plan.py`
- Modify: `services/spark/schema_registry.json` (entry `student_course_scores`), `services/spark/rules_config.json` (เปลี่ยนชื่อ `student_course_score` → `student_course_scores` และเพิ่ม `range_checks`)
- Test: `services/spark/tests/unit/test_stage_range_rules.py`

**Interfaces:**
- rules ใหม่: `"range_checks": {"<column>": {"min": <number|null>, "max": <number|null>}}`
- Produces: stage `range_rules` เขียน `ctx.range_violation_df` (reason `out_of_range_<column>`, หลายคอลัมน์คั่น `; `), `ctx.clean_df`

- [ ] **Step 1: เทสต์ที่ fail** — `services/spark/tests/unit/test_stage_range_rules.py`

```python
from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
import sdoqap.stages  # noqa: F401

SPEC = {"id": "StringType", "score": "DoubleType", "hours": "DoubleType"}
RULES = {"range_checks": {"score": {"min": 0, "max": 100}, "hours": {"min": 0, "max": None}}}


def ctx_with(spark, rows, rules=RULES):
    ctx = make_ctx(spark, rows, SPEC, rules=rules)
    ctx.clean_df = ctx.df
    return ctx


def test_values_outside_business_range_are_quarantined_with_reason(spark):
    ctx = ctx_with(spark, [("a", 50.0, 2.0), ("b", 150.0, 1.0), ("c", -5.0, -1.0)])
    run_stages(["range_rules"], ctx)
    bad = {r["id"]: r["reject_reason"] for r in ctx.range_violation_df.collect()}
    assert bad == {"b": "out_of_range_score", "c": "out_of_range_score; out_of_range_hours"}
    assert [r["id"] for r in ctx.clean_df.collect()] == ["a"]


def test_bounds_are_inclusive_and_nulls_are_not_range_errors(spark):
    ctx = ctx_with(spark, [("a", 0.0, 0.0), ("b", 100.0, None)])
    run_stages(["range_rules"], ctx)
    assert ctx.range_violation_df.count() == 0
    assert ctx.clean_df.count() == 2


def test_no_rules_means_no_op(spark):
    ctx = ctx_with(spark, [("a", 500.0, 1.0)], rules={})
    run_stages(["range_rules"], ctx)
    assert ctx.range_violation_df is None and ctx.clean_df.count() == 1


def test_unknown_column_is_ignored(spark):
    ctx = ctx_with(spark, [("a", 50.0, 1.0)], rules={"range_checks": {"nope": {"min": 0, "max": 1}}})
    run_stages(["range_rules"], ctx)
    assert ctx.range_violation_df is None


def test_assembly_includes_range_violations(spark):
    ctx = make_ctx(spark, [("a", 50.0, 1.0), ("b", 150.0, 1.0)], SPEC, rules=RULES)
    run_stages(["validation", "dedup", "range_rules", "quarantine_assembly"], ctx)
    assert (ctx.clean_count, ctx.quarantine_count) == (1, 1)
```

- [ ] **Step 2: รันให้ fail** — Expected: `KeyError: 'range_rules'`

- [ ] **Step 3: สร้าง `sdoqap/stages/rules.py`**

```python
from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


def _violation(col, bounds):
    cond = F.lit(False)
    if bounds.get("min") is not None:
        cond = cond | (F.col(col) < F.lit(bounds["min"]))
    if bounds.get("max") is not None:
        cond = cond | (F.col(col) > F.lit(bounds["max"]))
    return F.col(col).isNotNull() & cond


@stage("range_rules", "ตรวจช่วงค่าตามกฎธุรกิจ", "transform")
def range_rules(ctx):
    """Business range checks from rules['range_checks'], e.g. score 0-100. Unlike IQR,
    these bounds are declared by the data owner, so a batch where every score is out
    of range is still caught. Bounds are inclusive; NULLs are left to validation."""
    checks = {c: b for c, b in (ctx.rules.get("range_checks") or {}).items() if c in ctx.clean_df.columns}
    if not checks:
        return ctx
    reasons = [F.when(_violation(c, b), F.lit(f"out_of_range_{c}")) for c, b in checks.items()]
    flagged = ctx.clean_df.withColumn("_range_reason", F.concat_ws("; ", *reasons))
    ctx.range_violation_df = flagged.filter(F.col("_range_reason") != "") \
        .withColumn("is_invalid", F.lit(True)) \
        .withColumn("reject_reason", F.col("_range_reason")) \
        .drop("_range_reason")
    ctx.clean_df = flagged.filter(F.col("_range_reason") == "").drop("_range_reason")
    count = ctx.range_violation_df.count()
    if count:
        ctx.remediation_logs.append(f"range_rule_violations_{count}")
    return ctx
```

(`concat_ws` ข้ามค่า NULL ที่ `F.when` คืนเมื่อไม่ผิด จึงได้สตริงว่างสำหรับแถวที่ผ่าน)

- [ ] **Step 4: ให้ `quarantine_assembly` รวมผลของกฎช่วงค่า**

ใน `sdoqap/stages/assembly.py` ฟังก์ชัน `quarantine_assembly` เพิ่มหลังบรรทัดแรกของ BLOCK L (`all_quarantined = invalid_df.unionByName(duplicate_df, allowMissingColumns=True)`):

```python
    if ctx.range_violation_df is not None:
        all_quarantined = all_quarantined.unionByName(ctx.range_violation_df, allowMissingColumns=True)
```

- [ ] **Step 5: ลงทะเบียนและลำดับ**

`__init__.py` เพิ่ม `from sdoqap.stages import rules  # noqa: F401`
`plan.py` แทรก `"range_rules"` ต่อจาก `"standardize_categories"` ใน `TRANSFORM`

- [ ] **Step 6: รันเทสต์** — Expected: PASS ทั้งหมด (golden ของ `golden_student_scores` ไม่กระทบ เพราะตารางนั้นไม่มี `range_checks`)

- [ ] **Step 7: แก้ registry และ rules ของชุดข้อมูลประเมิน**

ใน `services/spark/schema_registry.json` แทน entry `"student_course_scores"` ทั้งก้อนด้วย (คอลัมน์ตรงกับ `dirty_dataset.csv` ต้นฉบับใน `data/evaluation/student_course_score_evaluation_dataset.zip`: `dirty_row_id,record_id,student_id,course,score,semester,study_hours,updated_at`):

```json
  "student_course_scores": {
    "primary_key": ["student_id", "course", "semester"],
    "date_column": "updated_at",
    "schema_spec": {
      "dirty_row_id": "StringType",
      "record_id": "StringType",
      "student_id": "StringType",
      "course": "StringType",
      "semester": "StringType",
      "score": "DoubleType",
      "study_hours": "DoubleType",
      "updated_at": "TimestampType"
    }
  },
```

ใน `services/spark/rules_config.json` เปลี่ยน key `"student_course_score"` เป็น `"student_course_scores"` และให้เนื้อในเป็น (รวมค่าเดิมที่มีอยู่ถ้ามี):

```json
  "student_course_scores": {
    "range_checks": {
      "score": {"min": 0, "max": 100},
      "study_hours": {"min": 0, "max": null}
    },
    "value_range": {"mode": "auto", "method": "iqr", "iqr_multiplier": 3.0}
  },
```

(ค่า Tukey 3.0 ตรงกับ `tukey_multiplier: "3.0"` ของเอนจินโต้ตอบใน `whitebox.py` เพื่อให้สองเส้นทางใช้เกณฑ์เดียวกัน; `dirty_row_id` เป็น `StringType` เพราะเป็นเลขแถวอ้างอิงกับ ground truth ถ้าเป็นชนิดตัวเลขจะถูกส่งเข้า IQR/Z-score โดยไม่มีความหมาย)

ตรวจ JSON ถูกต้อง:

```bash
python -X utf8 -c "import json;[json.load(open(p,encoding='utf-8')) for p in ('services/spark/schema_registry.json','services/spark/rules_config.json')];print('JSON_OK')"
```

- [ ] **Step 8: ส่งค่าใหม่เข้า ES** — engine อ่าน ES ก่อนไฟล์ จึงต้องอัปเดตเอกสารใน ES ด้วย (Task 10 จะทำให้ขั้นนี้อัตโนมัติ):

```bash
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
python -X utf8 -c "import json;d=json.load(open('services/spark/schema_registry.json',encoding='utf-8'))['student_course_scores'];print(json.dumps(d))" > /tmp/reg.json
python -X utf8 -c "import json;d=json.load(open('services/spark/rules_config.json',encoding='utf-8'))['student_course_scores'];print(json.dumps(d))" > /tmp/rules.json
curl -s -u "elastic:$ES_PASS" -X PUT -H "Content-Type: application/json" "http://localhost:9200/sdoqap_schema_registry/_doc/student_course_scores" --data-binary @/tmp/reg.json; echo
curl -s -u "elastic:$ES_PASS" -X PUT -H "Content-Type: application/json" "http://localhost:9200/sdoqap_rules_registry/_doc/student_course_scores" --data-binary @/tmp/rules.json; echo
```

Expected: ทั้งสองตอบ `"result":"updated"` หรือ `"created"`

- [ ] **Step 9: Commit**

```bash
git add -A services/spark
git commit -m "feat(engine): business range_rules stage; fix student_course_scores key, date column and ranges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ให้ ES เป็นแหล่งความจริงเดียวของกฎและ schema (F-M4)

**Files:**
- Create: `services/spark/scripts/seed_config_to_es.py`
- Test: `services/spark/tests/unit/test_seed_config.py`
- Modify: `services/api/app/api/dynamic_rules.py` (`_load_rules_config`)
- Modify: `services/spark/start_daemon.sh` (seed ตอน container เริ่ม)

**Interfaces:**
- Produces: `seed_config_to_es.plan_seed(file_docs: dict, existing_ids: set) -> dict` (เฉพาะ doc ที่ยังไม่มีใน ES), CLI `python scripts/seed_config_to_es.py` (idempotent)
- พฤติกรรม: ไฟล์ JSON = ค่าเริ่มต้น (seed) เท่านั้น; ES = ค่าที่ใช้จริง; API อ่าน ES เป็นหลัก ใช้ไฟล์เฉพาะตอน ES ไม่มีดัชนี

- [ ] **Step 1: เทสต์ที่ fail** — `services/spark/tests/unit/test_seed_config.py`

```python
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts"))

from seed_config_to_es import plan_seed


def test_only_missing_docs_are_seeded():
    file_docs = {"a": {"x": 1}, "b": {"x": 2}, "_comment": "ignore me"}
    assert plan_seed(file_docs, existing_ids={"a"}) == {"b": {"x": 2}}


def test_non_dict_entries_are_skipped():
    assert plan_seed({"_comment": "text", "t": {"k": 1}}, existing_ids=set()) == {"t": {"k": 1}}
```

- [ ] **Step 2: รันให้ fail** — Expected: `ModuleNotFoundError: seed_config_to_es`

- [ ] **Step 3: เขียน `services/spark/scripts/seed_config_to_es.py`**

```python
"""Seed sdoqap_rules_registry and sdoqap_schema_registry from the JSON files, without
overwriting anything already in Elasticsearch. After seeding, ES is the source of truth;
the JSON files are only the defaults for a fresh install."""
import json
import os
import sys

import requests

SPARK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SPARK_DIR)

SEEDS = (("rules_config.json", "sdoqap_rules_registry"), ("schema_registry.json", "sdoqap_schema_registry"))


def plan_seed(file_docs: dict, existing_ids: set) -> dict:
    return {k: v for k, v in file_docs.items() if isinstance(v, dict) and k not in existing_ids}


def _existing_ids(base, auth, index):
    r = requests.post(f"{base}/{index}/_search", json={"size": 1000, "_source": False, "query": {"match_all": {}}},
                      auth=auth, timeout=10)
    if r.status_code == 404:
        return set()
    r.raise_for_status()
    return {h["_id"] for h in r.json()["hits"]["hits"]}


def main():
    from sdoqap.common.es import es_base_and_auth
    url = os.getenv("ELASTICSEARCH_URL") or "http://{}:{}@{}:{}".format(
        os.getenv("ELASTICSEARCH_USER", "elastic"), os.environ["ELASTICSEARCH_PASSWORD"],
        os.getenv("ELASTICSEARCH_HOST", "elasticsearch"), os.getenv("ELASTICSEARCH_PORT", "9200"))
    base, auth = es_base_and_auth(url)
    for filename, index in SEEDS:
        with open(os.path.join(SPARK_DIR, filename), encoding="utf-8") as f:
            docs = json.load(f)
        todo = plan_seed(docs, _existing_ids(base, auth, index))
        for doc_id, doc in todo.items():
            requests.put(f"{base}/{index}/_doc/{doc_id}", json=doc, auth=auth, timeout=10).raise_for_status()
        print(f"[SEED] {index}: {len(todo)} new, {len(docs) - len(todo)} kept")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: รันให้ผ่าน** — Expected: PASS

- [ ] **Step 5: seed ตอนเริ่ม container** — ใน `services/spark/start_daemon.sh` ภายใน `if [ "$SPARK_MODE" = "master" ]; then` ก่อนบรรทัดที่เริ่ม daemon เพิ่ม:

```bash
    (for i in $(seq 1 30); do python /opt/spark-apps/scripts/seed_config_to_es.py && break; sleep 10; done) &
```

- [ ] **Step 6: API อ่าน ES เป็นหลัก** — ใน `services/api/app/api/dynamic_rules.py` แทนฟังก์ชัน `_load_rules_config` ทั้งตัวด้วย:

```python
def _load_rules_config() -> dict:
    """ES (sdoqap_rules_registry) is the source of truth once seeded; the JSON file is
    only read when the index does not exist yet (fresh install before seeding)."""
    try:
        es = _get_es()
        if es.indices.exists(index="sdoqap_rules_registry"):
            res = es.search(index="sdoqap_rules_registry", body={"query": {"match_all": {}}, "size": 1000})
            return {h["_id"]: h["_source"] for h in res.get("hits", {}).get("hits", [])}
    except Exception as exc:
        logger.warning("Failed to read rules from ES: %s. Falling back to rules_config.json.", exc)
    try:
        with open(_resolve_rules_path(), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.warning("Failed to read local rules_config.json: %s", exc)
        return {}
```

(`_save_rules_config` ที่เขียนทั้งไฟล์และ ES คงไว้ — ไฟล์กลายเป็นสำเนาส่งออก ไม่ใช่แหล่งที่อ่าน)

- [ ] **Step 7: รัน API tests + Spark unit tests** — Expected: PASS

- [ ] **Step 8: ตรวจจริง**

```bash
docker compose up -d --force-recreate spark-master
sleep 150
MSYS_NO_PATHCONV=1 docker compose logs spark-master | grep "\[SEED\]"
```

Expected: สองบรรทัด `[SEED] sdoqap_rules_registry: N new, M kept` และ `[SEED] sdoqap_schema_registry: ...`

- [ ] **Step 9: Commit**

```bash
git add services/spark/scripts/seed_config_to_es.py services/spark/tests/unit/test_seed_config.py services/spark/start_daemon.sh services/api/app/api/dynamic_rules.py
git commit -m "feat(config): Elasticsearch is the single source of truth for rules and schema; JSON files only seed a fresh install

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: รัน Spark unit tests ใน CI (F-T2)

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: เพิ่ม job** (ระดับเดียวกับ `api-tests`)

```yaml
  spark-unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "11"
      - uses: actions/setup-python@v5
        with:
          python-version: "3.10"
      - name: Install PySpark + Delta
        run: pip install pyspark==3.4.1 delta-spark==2.4.0 requests pyyaml pytest
      - name: Run Spark unit tests
        working-directory: services/spark
        env:
          PYSPARK_SUBMIT_ARGS: "--packages io.delta:delta-core_2.12:2.4.0 --conf spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension --conf spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog pyspark-shell"
          ELASTICSEARCH_PASSWORD: ci
          HDFS_URL: hdfs://localhost:9000
          N8N_WEBHOOK_URL: http://localhost:5678
        run: python -m pytest -q tests/unit
```

(`PYSPARK_SUBMIT_ARGS` ให้ Delta กับ SparkSession แบบ local ใน CI เหมือนที่ `spark-defaults.conf` ทำใน image)

- [ ] **Step 2: ตรวจว่าเทสต์ที่ import engine ไม่ต้องต่อ ES จริง** — `test_similarity.py` import `spark_quality_engine` ซึ่งอ่าน env ตอน import; ถ้าใน CI ยัง fail เพราะ env อื่น ให้เพิ่ม env นั้นในบล็อก `env:` ข้างบน (ห้ามเปลี่ยนโค้ด engine เพื่อ CI)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run Spark stage unit tests with local PySpark and Delta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- F-M1 (Task 3–7), F-M2 (Task 2), F-M3 (Task 1), F-M4 (Task 10), F-T2 (Task 11); กฎช่วงค่าธุรกิจ + registry ของชุดประเมิน (Task 9) คือสิ่งที่ Plan D ต้องใช้วัด detection ของเส้นทาง Spark
- จำนวน stage หลัง Task 9 = 21 (ALIGN 1 + TRANSFORM 12 + POST_LOAD 8); Task 8 Step 3 เก็บรายการตอนมี 20 stage — Plan D Task 5 จะเก็บรายการล่าสุดอีกครั้ง
- ชื่อที่ใช้ข้าม task: `RunContext.paths["raw"|"active"|"quarantine"]`, `ctx.metrics["started_at"|"stage_seconds"|"quality_score"]`, `range_violation_df`, `build_quality_run_doc(ctx, finished_at)`
