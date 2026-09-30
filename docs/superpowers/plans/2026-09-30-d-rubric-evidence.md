# Plan D — หลักฐานตามเกณฑ์การให้คะแนน Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหลักฐานที่วัดจากระบบจริงสำหรับทุกหัวข้อในเกณฑ์ Data Eng (CLO5 55% + CLO6 15%) และรวมเป็นรายงาน `docs/evaluation/rubric-mapping.md` ที่สร้างจากไฟล์หลักฐานโดยอัตโนมัติ ไม่มีตัวเลขที่พิมพ์เอง

**Architecture:** สคริปต์ Python ล้วน (stdlib `csv`/`json` ไม่ต้องใช้ pandas บน host) สำหรับเตรียมชุดข้อมูล, profile ก่อน transform, วัด detection เทียบ ground truth, benchmark ตามขนาด, สรุปการใช้ประโยชน์ และสำรวจแหล่งข้อมูล — ส่วนที่ต้องอ่าน Delta Lake รันใน container `spark-master` แล้วคัดลอกผลออกมา ทุกสคริปต์เขียนผลเป็น JSON ใน `docs/evaluation/evidence/` แล้ว `build_rubric_report.py` แปลง JSON เป็น markdown ถ้าหลักฐานไหนยังไม่มี รายงานจะเขียนว่ายังไม่มีพร้อมคำสั่งที่ต้องรัน

**Tech Stack:** Python 3 stdlib, Bash (Git Bash), Docker Compose, PySpark (ใน container), pytest

**Spec:** เกณฑ์การให้คะแนน (รูปภาพจากผู้ใช้ — คัดลอกไว้ในหัวข้อถัดไป), `docs/requirements/Evalution_Guildline.md` (Step 1–11), `docs/etl-review/2026-09-30-etl-system-review.md` ข้อ 6.2

**ลำดับแผน:** A → B → C (เสร็จแล้ว) → **D (แผนนี้)** — Task 4 ต้องใช้ registry และ `range_rules` จาก Plan C Task 9

## เกณฑ์การให้คะแนน (คัดจากรูปของผู้ใช้)

| กลุ่ม | หัวข้อ | คะแนน |
|---|---|---:|
| CLO5 — ปริมาณและขอบเขต (25%) | จำนวนแหล่งข้อมูลและปริมาณข้อมูล | 10 |
| | จำนวนกระบวนการในการจัดการข้อมูล | 15 |
| CLO5 — คุณภาพและความสมบูรณ์ (30%) | ความครบถ้วนสมบูรณ์ของการสกัดข้อมูล (Data extraction) | 10 |
| | ความครบถ้วนสมบูรณ์ของการเปลี่ยนแปลงข้อมูล (Data transformation) | 10 |
| | ความครบถ้วนสมบูรณ์ของการถ่ายโอนข้อมูล (Data loading) | 5 |
| | ประสิทธิผลของการใช้ประโยชน์จากข้อมูล | 5 |
| CLO6 (15%) | ขอบเขตโครงงานมีความน่าสนใจ/แปลกใหม่ | 5 |
| | Component/Feature ของโครงงานพัฒนาโดยใช้นวัตกรรมที่สร้างสรรค์/แปลกใหม่ | 5 |
| | ใช้เทคนิค/วิธีการที่มีอยู่มาดัดแปลงและประยุกต์ใช้ในโครงงานได้อย่างเหมาะสม | 5 |

## Global Constraints

- **ห้ามแต่งตัวเลข:** ทุกตัวเลขในรายงานต้องมาจากไฟล์ใน `docs/evaluation/evidence/` ที่สคริปต์สร้างจากการรันจริง (`Evalution_Guildline.md` Step 6: "ห้ามคิดตัวเลขย้อนหลังเพื่อให้สวย") ถ้ารันไม่สำเร็จ (เช่น 1M แถวไม่ไหว) ให้บันทึกว่าล้มเหลวพร้อมข้อความ error ตามจริง
- ห้ามแก้ระบบ Dashboard (หน้า Dashboards/Query & Metrics, `analytics.py`, `gold.py`, `spark_gold_layer.py`, Grafana, Kibana) — "การใช้ประโยชน์จากข้อมูล" ทำเป็นรายงานไฟล์ ไม่ใช่หน้า dashboard
- สคริปต์บน host ใช้ Python stdlib เท่านั้น (host ไม่มี pandas/pyspark/fastapi)
- ไฟล์ CSV ที่สร้างขึ้นอยู่ใต้ `data/evaluation/` ซึ่งถูก ignore อยู่แล้ว (`**/*.csv`) — commit เฉพาะ JSON/markdown ใน `docs/evaluation/`
- commit ลงท้าย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## คำสั่งมาตรฐาน

เทสต์สคริปต์ประเมิน (บน host): `python -m pytest -q scripts/evaluation/tests` (ถ้าไม่มี pytest: `python -m pip install --user pytest`)
Spark unit tests: ตาม Plan C

## File Structure

| ไฟล์ | หน้าที่ | หัวข้อเกณฑ์ |
|---|---|---|
| `scripts/evaluation/prepare_datasets.py` | แตก zip ชุดประเมิน + สร้างชุดขยาย 10K/100K/500K/1M | ปริมาณข้อมูล |
| `scripts/evaluation/profile_before.py` | ค่าก่อน transform (rows, null, invalid, duplicate, outlier, min/max) | Guideline Step 6 |
| `services/spark/scripts/export_run_rows.py` | ดึงแถว active/quarantine ของรอบจาก Delta (รันใน container) | transformation, loading |
| `scripts/evaluation/detection.py` | detection rate, precision, recall เทียบ ground truth | transformation |
| `scripts/evaluation/run_batch_evaluation.sh` | ต่อทุกขั้นของการประเมินเส้นทาง Spark | extraction→loading |
| `scripts/evaluation/run_scale_benchmark.sh` | เวลาประมวลผลตามขนาด | ปริมาณข้อมูล, Guideline Step 9 |
| `scripts/evaluation/utilization_report.py` | ค่าเฉลี่ยรายวิชา, pass/fail, การกระจาย, นักศึกษาที่ต้องติดตาม | การใช้ประโยชน์ |
| `scripts/evaluation/source_inventory.py` | แหล่งข้อมูล ชนิด connector ปริมาณที่ประมวลผลแล้ว | แหล่งข้อมูล |
| `scripts/evaluation/build_rubric_report.py` | รวมหลักฐานเป็น `docs/evaluation/rubric-mapping.md` | ทุกหัวข้อ |
| `docker-compose.yml`, `.env.example` | compose profiles (streaming, ai, tools) | ข้อ 6.2 ของรีวิว |

---

### Task 1: เตรียมชุดข้อมูลประเมินและชุดขยาย

**Files:**
- Create: `scripts/evaluation/prepare_datasets.py`
- Test: `scripts/evaluation/tests/test_prepare_datasets.py`

**Interfaces:**
- Produces:
  - `extract_originals(zip_path, out_dir) -> list[str]` → `data/evaluation/original/{dirty_dataset,ground_truth,clean_dataset}.csv`
  - `scale_dataset(dirty_rows, gt_rows, target) -> (rows, gt_rows)` — ต่อสำเนาโดยเลื่อน `student_id`, `dirty_row_id`, `record_id` ทีละ 1,000,000 × ลำดับสำเนา แล้วตัดให้เหลือ `target` แถว (คีย์ `student_id+course+semester` ไม่ชนข้ามสำเนา สัดส่วนปัญหาคงเดิม)
  - CLI เขียน `data/evaluation/scale/dirty_<n>.csv` และ `ground_truth_<n>.csv` สำหรับ `n` ใน `10000 100000 500000 1000000`

- [ ] **Step 1: เทสต์ที่ fail** — `scripts/evaluation/tests/test_prepare_datasets.py`

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prepare_datasets import scale_dataset

DIRTY = [
    {"dirty_row_id": "1", "record_id": "1", "student_id": "65001", "course": "Python", "score": "70", "semester": "1/2026", "study_hours": "3", "updated_at": "t"},
    {"dirty_row_id": "2", "record_id": "1", "student_id": "65001", "course": "Python", "score": "70", "semester": "1/2026", "study_hours": "3", "updated_at": "t"},
    {"dirty_row_id": "3", "record_id": "2", "student_id": "65002", "course": "Stats", "score": "", "semester": "1/2026", "study_hours": "3", "updated_at": "t"},
]
GT = [
    {"dirty_row_id": "1", "record_id": "1", "expected_status": "Valid", "expected_error_type": "None"},
    {"dirty_row_id": "2", "record_id": "1", "expected_status": "Invalid", "expected_error_type": "Duplicate"},
    {"dirty_row_id": "3", "record_id": "2", "expected_status": "Invalid", "expected_error_type": "Missing Score"},
]


def test_scale_keeps_error_mix_and_unique_ids():
    rows, gt = scale_dataset(DIRTY, GT, 9)
    assert len(rows) == len(gt) == 9
    assert len({r["dirty_row_id"] for r in rows}) == 9
    assert [g["expected_error_type"] for g in gt].count("Duplicate") == 3
    assert [r["dirty_row_id"] for r in rows] == [g["dirty_row_id"] for g in gt]


def test_copies_do_not_share_keys_but_duplicates_inside_a_copy_still_collide():
    rows, _ = scale_dataset(DIRTY, GT, 6)
    keys = [(r["student_id"], r["course"], r["semester"]) for r in rows]
    assert keys[0] == keys[1]
    assert keys[3] == keys[4]
    assert keys[0] != keys[3]


def test_truncates_mid_copy():
    rows, gt = scale_dataset(DIRTY, GT, 4)
    assert [r["dirty_row_id"] for r in rows] == ["1", "2", "3", "1000001"]
```

- [ ] **Step 2: รันให้ fail** — Expected: `ModuleNotFoundError: prepare_datasets`

- [ ] **Step 3: เขียน `scripts/evaluation/prepare_datasets.py`**

```python
"""Extract the evaluation dataset and build larger copies for the scale benchmark.
Usage: python scripts/evaluation/prepare_datasets.py [--sizes 10000 100000 500000 1000000]"""
import argparse
import csv
import io
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ZIP_PATH = os.path.join(ROOT, "data", "evaluation", "student_course_score_evaluation_dataset.zip")
ORIGINAL_DIR = os.path.join(ROOT, "data", "evaluation", "original")
SCALE_DIR = os.path.join(ROOT, "data", "evaluation", "scale")
OFFSET = 1_000_000
SHIFTED = ("dirty_row_id", "record_id", "student_id")


def extract_originals(zip_path=ZIP_PATH, out_dir=ORIGINAL_DIR):
    os.makedirs(out_dir, exist_ok=True)
    written = []
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if name.endswith(".csv"):
                target = os.path.join(out_dir, os.path.basename(name))
                with z.open(name) as src, open(target, "wb") as dst:
                    dst.write(src.read())
                written.append(target)
    return written


def _shift(row, copy_index):
    if copy_index == 0:
        return dict(row)
    out = dict(row)
    for col in SHIFTED:
        if col in out and str(out[col]).strip().isdigit():
            out[col] = str(int(out[col]) + copy_index * OFFSET)
    return out


def scale_dataset(dirty_rows, gt_rows, target):
    rows, gt, copy_index = [], [], 0
    while len(rows) < target:
        for d, g in zip(dirty_rows, gt_rows):
            if len(rows) == target:
                break
            rows.append(_shift(d, copy_index))
            gt.append(_shift(g, copy_index))
        copy_index += 1
    return rows, gt


def _read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sizes", nargs="*", type=int, default=[10000, 100000, 500000, 1000000])
    args = parser.parse_args()
    for path in extract_originals():
        print("extracted", os.path.relpath(path, ROOT))
    dirty = _read(os.path.join(ORIGINAL_DIR, "dirty_dataset.csv"))
    gt = _read(os.path.join(ORIGINAL_DIR, "ground_truth.csv"))
    os.makedirs(SCALE_DIR, exist_ok=True)
    for n in args.sizes:
        rows, g = scale_dataset(dirty, gt, n)
        _write(os.path.join(SCALE_DIR, f"dirty_{n}.csv"), rows)
        _write(os.path.join(SCALE_DIR, f"ground_truth_{n}.csv"), g)
        print(f"scale {n}: {len(rows)} rows")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน แล้วรันจริง**

```bash
python -m pytest -q scripts/evaluation/tests/test_prepare_datasets.py
python scripts/evaluation/prepare_datasets.py
```

Expected: 3 passed; พิมพ์ `extracted data/evaluation/original/dirty_dataset.csv` ฯลฯ และ `scale 10000: 10000 rows` … `scale 1000000: 1000000 rows`

- [ ] **Step 5: Commit**

```bash
git add scripts/evaluation/prepare_datasets.py scripts/evaluation/tests/test_prepare_datasets.py
git commit -m "feat(eval): extract the evaluation dataset and build 10K-1M scaled copies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Profile ก่อน transform (Guideline Step 6)

**Files:**
- Create: `scripts/evaluation/profile_before.py`
- Test: `scripts/evaluation/tests/test_profile_before.py`

**Interfaces:**
- Produces: `profile(rows, key_cols=("student_id","course","semester"), score_col="score", hours_col="study_hours", tukey=3.0) -> dict` มีคีย์ `rows, null_counts, invalid_score, duplicate_rows, study_hours_outliers, score_min, score_max, study_hours_min, study_hours_max, study_hours_fences`; CLI `profile_before.py <csv>` พิมพ์ JSON

- [ ] **Step 1: เทสต์ที่ fail** — `scripts/evaluation/tests/test_profile_before.py`

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from profile_before import percentile, profile


def row(sid, course, score, hours, sem="1/2026"):
    return {"student_id": sid, "course": course, "semester": sem, "score": score, "study_hours": hours}


def test_percentile_linear_interpolation():
    assert percentile([1, 2, 3, 4], 0.5) == 2.5
    assert percentile([10], 0.25) == 10


def test_profile_counts_each_problem_type():
    rows = [row(str(i), "A", "50", "3") for i in range(20)]
    rows += [row("x1", "A", "", "3"), row("x2", "A", "150", "3"), row("x3", "A", "-1", "3"),
             row("0", "A", "50", "3"), row("x4", "A", "60", "60")]
    p = profile(rows)
    assert p["rows"] == 25
    assert p["null_counts"]["score"] == 1
    assert p["invalid_score"] == 2
    assert p["duplicate_rows"] == 1
    assert p["study_hours_outliers"] == 1
    assert (p["score_min"], p["score_max"]) == (-1.0, 150.0)
```

- [ ] **Step 2: รันให้ fail** — Expected: `ModuleNotFoundError: profile_before`

- [ ] **Step 3: เขียน `scripts/evaluation/profile_before.py`**

```python
"""Profile a raw CSV before it enters the ETL (Evaluation Guideline Step 6).
Usage: python scripts/evaluation/profile_before.py <csv>  -> JSON on stdout"""
import csv
import json
import sys


def percentile(sorted_values, q):
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    pos = (len(sorted_values) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(sorted_values) - 1)
    return float(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo))


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def profile(rows, key_cols=("student_id", "course", "semester"), score_col="score", hours_col="study_hours", tukey=3.0):
    columns = list(rows[0].keys()) if rows else []
    null_counts = {c: sum(1 for r in rows if str(r.get(c, "")).strip() == "") for c in columns}
    scores = [s for s in (_num(r.get(score_col)) for r in rows) if s is not None]
    hours = sorted(h for h in (_num(r.get(hours_col)) for r in rows) if h is not None)
    seen, duplicates = set(), 0
    for r in rows:
        key = tuple(r.get(c) for c in key_cols)
        if key in seen:
            duplicates += 1
        seen.add(key)
    fences = None
    outliers = 0
    if hours:
        q1, q3 = percentile(hours, 0.25), percentile(hours, 0.75)
        fences = [q1 - tukey * (q3 - q1), q3 + tukey * (q3 - q1)]
        outliers = sum(1 for h in hours if h < fences[0] or h > fences[1])
    return {
        "rows": len(rows),
        "null_counts": null_counts,
        "invalid_score": sum(1 for s in scores if s < 0 or s > 100),
        "duplicate_rows": duplicates,
        "study_hours_outliers": outliers,
        "study_hours_fences": fences,
        "score_min": min(scores) if scores else None,
        "score_max": max(scores) if scores else None,
        "study_hours_min": hours[0] if hours else None,
        "study_hours_max": hours[-1] if hours else None,
    }


if __name__ == "__main__":
    with open(sys.argv[1], newline="", encoding="utf-8") as f:
        print(json.dumps(profile(list(csv.DictReader(f))), indent=2, ensure_ascii=False))
```

- [ ] **Step 4: รันให้ผ่านแล้วเก็บหลักฐาน**

```bash
python -m pytest -q scripts/evaluation/tests/test_profile_before.py
python scripts/evaluation/profile_before.py data/evaluation/original/dirty_dataset.csv > docs/evaluation/evidence/d-profile-before.json
cat docs/evaluation/evidence/d-profile-before.json
```

Expected: 2 passed; `rows: 10100`, `null_counts.score: 300`, `invalid_score: 200`, `duplicate_rows: 100` (ค่าจากชุดข้อมูลจริง — ถ้าไม่ตรง README ของชุดข้อมูลให้บันทึกตามที่ได้ ไม่ต้องปรับ)

- [ ] **Step 5: Commit**

```bash
git add scripts/evaluation/profile_before.py scripts/evaluation/tests/test_profile_before.py docs/evaluation/evidence/d-profile-before.json
git commit -m "feat(eval): before-transform profile of the dirty dataset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: วัด detection เทียบ ground truth + ดึงแถวของรอบจาก Delta

**Files:**
- Create: `scripts/evaluation/detection.py`, `services/spark/scripts/export_run_rows.py`
- Test: `scripts/evaluation/tests/test_detection.py`, `services/spark/tests/unit/test_export_run_rows.py`

**Interfaces:**
- Produces:
  - `export_run_rows.py --table T --run-id R --out DIR` → `DIR/active.csv`, `DIR/quarantine.csv` (คอลัมน์ `dirty_row_id, record_id, student_id, course, semester, score, study_hours, reject_reason` เท่าที่มี) ; ฟังก์ชัน `select_run_rows(df, run_id, columns)`
  - `evaluate(dirty_rows, gt_rows, active_ids: set, quarantine_reasons: dict) -> dict` คืน `per_type`, `confusion`, `precision`, `recall`, `accuracy`, `false_positive_reasons`, `outcomes`
  - กติกา: แถวหนึ่งมีผลลัพธ์ `clean` (อยู่ใน active ของรอบ), `quarantined` (อยู่ใน quarantine ของรอบ), หรือ `dropped` (หายไปทั้งสองที่ = ถูก `auto_clean` ลบเพราะคีย์ซ้ำ) — "ตรวจพบ" = ไม่ใช่ `clean`; สำหรับกลุ่มคีย์ซ้ำ นับว่าตรวจพบเมื่อกลุ่มเหลือแถว `clean` ไม่เกิน 1 แถว (ไม่สนว่าระบบเก็บแถวไหนไว้) และแถว Valid ในกลุ่มนั้นที่ถูกเอาออกไม่นับเป็น false positive

- [ ] **Step 1: เทสต์ detection ที่ fail** — `scripts/evaluation/tests/test_detection.py`

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from detection import evaluate


def d(i, sid, course="A"):
    return {"dirty_row_id": str(i), "student_id": sid, "course": course, "semester": "1/2026"}


def g(i, status, etype):
    return {"dirty_row_id": str(i), "expected_status": status, "expected_error_type": etype}


DIRTY = [d(1, "s1"), d(2, "s1"), d(3, "s2"), d(4, "s3"), d(5, "s4"), d(6, "s5")]
GT = [g(1, "Valid", "None"), g(2, "Invalid", "Duplicate"), g(3, "Invalid", "Missing Score"),
      g(4, "Invalid", "Invalid Score Range"), g(5, "Review", "Study Hours Outlier"), g(6, "Valid", "None")]


def test_perfect_run():
    res = evaluate(DIRTY, GT, active_ids={"1", "6"},
                   quarantine_reasons={"3": "null_value_in_score", "4": "out_of_range_score", "5": "study_hours > 9"})
    assert res["per_type"]["Duplicate"] == {"actual": 1, "detected": 1, "rate": 1.0}
    assert res["confusion"] == {"tp": 4, "fp": 0, "fn": 0, "tn": 2}
    assert res["precision"] == 1.0 and res["recall"] == 1.0
    assert res["outcomes"]["2"] == "dropped"


def test_system_keeping_the_copy_instead_of_the_original_still_counts():
    res = evaluate(DIRTY, GT, active_ids={"2", "6"},
                   quarantine_reasons={"1": "duplicate_records", "3": "x", "4": "y", "5": "z"})
    assert res["per_type"]["Duplicate"]["detected"] == 1
    assert res["confusion"]["fp"] == 0


def test_missed_errors_and_false_alarms():
    res = evaluate(DIRTY, GT, active_ids={"1", "2", "3", "4", "5"}, quarantine_reasons={"6": "anomaly_z"})
    assert res["per_type"]["Missing Score"]["detected"] == 0
    assert res["per_type"]["Duplicate"]["detected"] == 0
    assert res["confusion"] == {"tp": 0, "fp": 1, "fn": 4, "tn": 1}
    assert res["false_positive_reasons"] == {"anomaly_z": 1}
    assert res["precision"] == 0.0
```

- [ ] **Step 2: รันให้ fail** — Expected: `ModuleNotFoundError: detection`

- [ ] **Step 3: เขียน `scripts/evaluation/detection.py`**

```python
"""Compare one batch run's outcome with ground_truth.csv (Evaluation Guideline Step 8).
Usage: python scripts/evaluation/detection.py --dirty D.csv --ground-truth G.csv --active A.csv --quarantine Q.csv"""
import argparse
import csv
import json
from collections import Counter, defaultdict

ERROR_TYPES = ("Missing Score", "Invalid Score Range", "Study Hours Outlier", "Duplicate")
KEY = ("student_id", "course", "semester")


def evaluate(dirty_rows, gt_rows, active_ids, quarantine_reasons, key_cols=KEY):
    def outcome(i):
        if i in quarantine_reasons:
            return "quarantined"
        return "clean" if i in active_ids else "dropped"

    groups = defaultdict(list)
    for r in dirty_rows:
        groups[tuple(r[c] for c in key_cols)].append(r["dirty_row_id"])
    group_of = {i: members for members in groups.values() if len(members) > 1 for i in members}

    per_type = {t: {"actual": 0, "detected": 0} for t in ERROR_TYPES}
    confusion = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    fp_reasons = Counter()
    outcomes = {}
    for g in gt_rows:
        i, etype = g["dirty_row_id"], g["expected_error_type"]
        bad = g["expected_status"] != "Valid"
        outcomes[i] = outcome(i)
        members = group_of.get(i)
        collapsed = bool(members) and sum(outcome(m) == "clean" for m in members) <= 1
        if etype == "Duplicate":
            detected = collapsed
        elif not bad and members and collapsed:
            detected = False  # the kept/removed original of a resolved duplicate is not an error
        else:
            detected = outcomes[i] != "clean"
        if etype in per_type:
            per_type[etype]["actual"] += 1
            per_type[etype]["detected"] += int(detected)
        if bad and detected:
            confusion["tp"] += 1
        elif bad:
            confusion["fn"] += 1
        elif detected:
            confusion["fp"] += 1
            fp_reasons[quarantine_reasons.get(i, "dropped")] += 1
        else:
            confusion["tn"] += 1
    for t in per_type.values():
        t["rate"] = round(t["detected"] / t["actual"], 4) if t["actual"] else None
    tp, fp, fn, tn = confusion["tp"], confusion["fp"], confusion["fn"], confusion["tn"]
    return {
        "per_type": per_type,
        "confusion": confusion,
        "precision": round(tp / (tp + fp), 4) if tp + fp else 0.0,
        "recall": round(tp / (tp + fn), 4) if tp + fn else 0.0,
        "accuracy": round((tp + tn) / (tp + fp + fn + tn), 4) if gt_rows else 0.0,
        "false_positive_reasons": dict(fp_reasons.most_common(10)),
        "outcomes": outcomes,
    }


def _read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    p = argparse.ArgumentParser()
    for name in ("--dirty", "--ground-truth", "--active", "--quarantine"):
        p.add_argument(name, required=True)
    a = p.parse_args()
    active = {r["dirty_row_id"] for r in _read(a.active)}
    quarantine = {r["dirty_row_id"]: r.get("reject_reason", "") for r in _read(a.quarantine)}
    res = evaluate(_read(a.dirty), _read(a.ground_truth), active, quarantine)
    res["outcome_counts"] = dict(Counter(res.pop("outcomes").values()))
    print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: รันเทสต์ detection ให้ผ่าน** — Expected: 3 passed

- [ ] **Step 5: เทสต์ของตัวดึงแถว** — `services/spark/tests/unit/test_export_run_rows.py`

```python
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts"))

from export_run_rows import select_run_rows


def test_only_this_runs_rows_and_known_columns(spark):
    df = spark.createDataFrame([("1", "r1", "x"), ("2", "r2", "y")], ["dirty_row_id", "run_id", "reject_reason"])
    out = select_run_rows(df, "r1", ["dirty_row_id", "reject_reason", "not_there"])
    assert out.columns == ["dirty_row_id", "reject_reason"]
    assert [r["dirty_row_id"] for r in out.collect()] == ["1"]
```

- [ ] **Step 6: เขียน `services/spark/scripts/export_run_rows.py`**

```python
"""Export one run's clean and quarantined rows from Delta Lake to CSV (run inside spark-master).
Usage: python /opt/spark-apps/scripts/export_run_rows.py --table T --run-id R --out /tmp/eval_rows"""
import argparse
import os

COLUMNS = ["dirty_row_id", "record_id", "student_id", "course", "semester", "score", "study_hours", "reject_reason"]


def select_run_rows(df, run_id, columns):
    from pyspark.sql import functions as F
    return df.filter(F.col("run_id") == run_id).select(*[c for c in columns if c in df.columns])


def main():
    from pyspark.sql import SparkSession
    p = argparse.ArgumentParser()
    p.add_argument("--table", required=True)
    p.add_argument("--run-id", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    hdfs = os.getenv("HDFS_URL", "hdfs://namenode:9000")
    spark = SparkSession.builder.appName("SDOQAP_ExportRunRows").getOrCreate()
    os.makedirs(a.out, exist_ok=True)
    for layer in ("active", "quarantine"):
        df = spark.read.format("delta").load(f"{hdfs}/data/{layer}/{a.table}")
        rows = select_run_rows(df, a.run_id, COLUMNS).toPandas()
        rows.to_csv(os.path.join(a.out, f"{layer}.csv"), index=False)
        print(f"{layer}: {len(rows)} rows")
    spark.stop()


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: รัน Spark unit tests** — Expected: PASS (รวม `test_export_run_rows.py`)

- [ ] **Step 8: Commit**

```bash
git add scripts/evaluation/detection.py scripts/evaluation/tests/test_detection.py services/spark/scripts/export_run_rows.py services/spark/tests/unit/test_export_run_rows.py
git commit -m "feat(eval): detection metrics against ground truth and per-run Delta row export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: รายงานการใช้ประโยชน์จากข้อมูล (Guideline Step 10, ไม่ใช่ dashboard)

**Files:**
- Create: `scripts/evaluation/utilization_report.py`
- Test: `scripts/evaluation/tests/test_utilization_report.py`

**Interfaces:**
- Produces: `summarize(rows, pass_mark=50.0) -> dict` มี `students, rows, by_course[{course,n,avg_score,pass_rate}], pass_rate, fail_rate, distribution{"0-49","50-59","60-69","70-79","80-89","90-100"}, follow_up_students`; `render_markdown(summary) -> str`; CLI `utilization_report.py <active.csv> <out.md> <out.json>`

- [ ] **Step 1: เทสต์ที่ fail** — `scripts/evaluation/tests/test_utilization_report.py`

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utilization_report import render_markdown, summarize

ROWS = [
    {"student_id": "1", "course": "Python", "score": "80"},
    {"student_id": "2", "course": "Python", "score": "40"},
    {"student_id": "1", "course": "Stats", "score": "95"},
    {"student_id": "3", "course": "Stats", "score": "59.5"},
    {"student_id": "4", "course": "Stats", "score": ""},
]


def test_summary_numbers():
    s = summarize(ROWS)
    assert s["rows"] == 4 and s["students"] == 3
    py = next(c for c in s["by_course"] if c["course"] == "Python")
    assert py == {"course": "Python", "n": 2, "avg_score": 60.0, "pass_rate": 0.5}
    assert s["pass_rate"] == 0.75 and s["fail_rate"] == 0.25
    assert s["distribution"] == {"0-49": 1, "50-59": 1, "60-69": 0, "70-79": 0, "80-89": 1, "90-100": 1}
    assert s["follow_up_students"] == ["2"]


def test_markdown_mentions_every_course():
    md = render_markdown(summarize(ROWS))
    assert "Python" in md and "Stats" in md and "90-100" in md
```

- [ ] **Step 2: รันให้ fail** — Expected: `ModuleNotFoundError: utilization_report`

- [ ] **Step 3: เขียน `scripts/evaluation/utilization_report.py`**

```python
"""Use the cleaned (active) rows of one run for analysis (Evaluation Guideline Step 10):
average score per course, pass/fail rate, score distribution, students needing follow-up.
Usage: python scripts/evaluation/utilization_report.py <active.csv> <out.md> <out.json>"""
import csv
import json
import sys
from collections import defaultdict

BUCKETS = (("0-49", 0, 50), ("50-59", 50, 60), ("60-69", 60, 70), ("70-79", 70, 80), ("80-89", 80, 90), ("90-100", 90, 100.0001))


def _score(row):
    try:
        return float(row.get("score"))
    except (TypeError, ValueError):
        return None


def summarize(rows, pass_mark=50.0):
    scored = [(r, _score(r)) for r in rows]
    scored = [(r, s) for r, s in scored if s is not None]
    per_course = defaultdict(list)
    for r, s in scored:
        per_course[r["course"]].append(s)
    passed = sum(1 for _, s in scored if s >= pass_mark)
    n = len(scored)
    return {
        "rows": n,
        "students": len({r["student_id"] for r, _ in scored}),
        "by_course": [
            {"course": c, "n": len(v), "avg_score": round(sum(v) / len(v), 2),
             "pass_rate": round(sum(1 for s in v if s >= pass_mark) / len(v), 4)}
            for c, v in sorted(per_course.items())
        ],
        "pass_rate": round(passed / n, 4) if n else 0.0,
        "fail_rate": round((n - passed) / n, 4) if n else 0.0,
        "distribution": {name: sum(1 for _, s in scored if lo <= s < hi) for name, lo, hi in BUCKETS},
        "follow_up_students": sorted({r["student_id"] for r, s in scored if s < pass_mark}),
        "pass_mark": pass_mark,
    }


def render_markdown(s):
    lines = [
        "# การใช้ประโยชน์จากข้อมูลที่ผ่าน ETL",
        "",
        f"ข้อมูลสะอาด {s['rows']:,} แถว จากนักศึกษา {s['students']:,} คน (เกณฑ์ผ่าน {s['pass_mark']:g} คะแนน)",
        "",
        f"- อัตราผ่าน: {s['pass_rate']:.2%} · อัตราไม่ผ่าน: {s['fail_rate']:.2%}",
        f"- นักศึกษาที่ต้องติดตาม (มีวิชาที่ต่ำกว่าเกณฑ์): {len(s['follow_up_students']):,} คน",
        "",
        "## คะแนนเฉลี่ยรายวิชา",
        "",
        "| วิชา | จำนวนแถว | คะแนนเฉลี่ย | อัตราผ่าน |",
        "|---|---:|---:|---:|",
    ]
    lines += [f"| {c['course']} | {c['n']:,} | {c['avg_score']:.2f} | {c['pass_rate']:.2%} |" for c in s["by_course"]]
    lines += ["", "## การกระจายของคะแนน", "", "| ช่วงคะแนน | จำนวน |", "|---|---:|"]
    lines += [f"| {k} | {v:,} |" for k, v in s["distribution"].items()]
    return "\n".join(lines) + "\n"


def main(argv):
    with open(argv[1], newline="", encoding="utf-8") as f:
        summary = summarize(list(csv.DictReader(f)))
    with open(argv[2], "w", encoding="utf-8") as f:
        f.write(render_markdown(summary))
    with open(argv[3], "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"{summary['rows']} rows, {len(summary['by_course'])} courses")


if __name__ == "__main__":
    main(sys.argv)
```

- [ ] **Step 4: รันให้ผ่าน** — Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/evaluation/utilization_report.py scripts/evaluation/tests/test_utilization_report.py
git commit -m "feat(eval): data utilization report from cleaned rows (per-course average, pass rate, distribution, follow-up list)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: รันการประเมินเส้นทาง Spark ครบวงจร และ benchmark ตามขนาด

**Files:**
- Create: `scripts/evaluation/run_batch_evaluation.sh`, `scripts/evaluation/run_scale_benchmark.sh`
- Create (ผล): `docs/evaluation/evidence/d-batch-run.json`, `d-detection.json`, `d-utilization.json`, `docs/evaluation/d-utilization.md`, `d-whitebox-evaluation.txt`, `d-scale.json`, `d-stage-list.json`

**Interfaces:**
- Consumes: `golden_run.sh` (Plan C Task 0), `export_run_rows.py`, `detection.py`, `utilization_report.py`, `profile_before.py`, `python -m sdoqap.pipeline --json`
- Produces: `d-scale.json` = list ของ `{rows, table, state, duration_seconds, end_to_end_seconds, total_records, quarantined_records, error}`

- [ ] **Step 1: เขียน `scripts/evaluation/run_batch_evaluation.sh`**

```bash
#!/usr/bin/env bash
# Full evaluation of the Spark path on the original dirty dataset (Guideline Steps 5-10).
# Usage: bash scripts/evaluation/run_batch_evaluation.sh   (stack running, repo root)
set -eu
EV=docs/evaluation/evidence
ORIG=data/evaluation/original
OUT=data/evaluation/output
TABLE=student_course_scores
mkdir -p "$EV" "$OUT"

[ -f "$ORIG/dirty_dataset.csv" ] || python scripts/evaluation/prepare_datasets.py --sizes
python scripts/evaluation/profile_before.py "$ORIG/dirty_dataset.csv" > "$EV/d-profile-before.json"

bash scripts/evaluation/golden_run.sh "$TABLE" "$ORIG/dirty_dataset.csv" "$EV/d-batch-run.json"
RUN_ID=$(python -c "import json;print(json.load(open('$EV/d-batch-run.json'))['run_id'])")

MSYS_NO_PATHCONV=1 docker compose exec -T spark-master rm -rf /tmp/eval_rows
MSYS_NO_PATHCONV=1 docker compose exec -T spark-master python /opt/spark-apps/scripts/export_run_rows.py \
  --table "$TABLE" --run-id "$RUN_ID" --out /tmp/eval_rows
MSYS_NO_PATHCONV=1 docker compose cp spark-master:/tmp/eval_rows/active.csv "$OUT/active.csv"
MSYS_NO_PATHCONV=1 docker compose cp spark-master:/tmp/eval_rows/quarantine.csv "$OUT/quarantine.csv"

python scripts/evaluation/detection.py --dirty "$ORIG/dirty_dataset.csv" --ground-truth "$ORIG/ground_truth.csv" \
  --active "$OUT/active.csv" --quarantine "$OUT/quarantine.csv" > "$EV/d-detection.json"
python scripts/evaluation/utilization_report.py "$OUT/active.csv" docs/evaluation/d-utilization.md "$EV/d-utilization.json"

MSYS_NO_PATHCONV=1 docker compose exec -T -w /opt/spark-apps spark-master python -m sdoqap.pipeline --json > "$EV/d-stage-list.json"

# Interactive (whitebox) engine on the same original dataset. Its runtime folder may hold a
# file the user uploaded later, so back it up, evaluate the original, then put it back.
RT=data/evaluation/student_course_score_evaluation_dataset
cp "$RT/dirty_dataset.csv" "$RT/dirty_dataset.before-eval.csv"
cp "$RT/ground_truth.csv" "$RT/ground_truth.before-eval.csv"
cp "$ORIG/dirty_dataset.csv" "$ORIG/ground_truth.csv" "$RT/"
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$PWD:/repo" -w /repo api \
  python scripts/evaluation/run_whitebox_evaluation.py > "$EV/d-whitebox-evaluation.txt" 2>&1 \
  || echo "whitebox evaluation failed; see $EV/d-whitebox-evaluation.txt"
mv "$RT/dirty_dataset.before-eval.csv" "$RT/dirty_dataset.csv"
mv "$RT/ground_truth.before-eval.csv" "$RT/ground_truth.csv"
echo "done: run $RUN_ID"
```

(mount ทั้ง repo ที่ `/repo` เพื่อให้ `PROJECT_ROOT/services/api` ของสคริปต์ชี้ถูก และ `_resolve_dataset_dir()` เจอ `data/evaluation/...` ผ่าน candidate ที่ Plan A Task 3 เพิ่มไว้)

- [ ] **Step 2: รันการประเมิน**

```bash
bash scripts/evaluation/run_batch_evaluation.sh
python -c "import json;d=json.load(open('docs/evaluation/evidence/d-detection.json'));print(json.dumps({k:d[k] for k in ('per_type','precision','recall','accuracy')},indent=1,ensure_ascii=False))"
```

Expected: จบด้วย `done: run run_...`; `d-detection.json` มี `per_type` ครบ 4 ชนิด — **บันทึกผลตามจริง** ถ้า detection บางชนิดต่ำ ให้เขียนสาเหตุที่พบไว้ในรายงาน task (เช่น Z-score จับคะแนนปกติที่สุดโต่งเป็น false positive) ห้ามปรับเกณฑ์เพื่อให้ตัวเลขสวยโดยไม่มีเหตุผลทางธุรกิจ

- [ ] **Step 3: เขียน `scripts/evaluation/run_scale_benchmark.sh`**

```bash
#!/usr/bin/env bash
# Processing time by dataset size (Guideline Step 9). Each size gets its own table with
# the same registry/rules as student_course_scores. A size that fails is recorded, not hidden.
# Usage: bash scripts/evaluation/run_scale_benchmark.sh [sizes...]   (default 10000 100000 500000 1000000)
set -u
SIZES=${*:-"10000 100000 500000 1000000"}
EV=docs/evaluation/evidence
HOST="http://localhost:${NGINX_HOST_PORT:-80}"
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
ES="http://localhost:${ES_HOST_PORT:-9200}"
RESULTS=$(mktemp)
echo "[" > "$RESULTS"; FIRST=1
for N in $SIZES; do
  TABLE="bench_${N}"
  for IDX in sdoqap_schema_registry sdoqap_rules_registry; do
    curl -s -u "elastic:$ES_PASS" "$ES/$IDX/_doc/student_course_scores" | python -c "import sys,json;print(json.dumps(json.load(sys.stdin)['_source']))" > /tmp/doc.json
    curl -s -u "elastic:$ES_PASS" -X PUT -H "Content-Type: application/json" "$ES/$IDX/_doc/$TABLE" --data-binary @/tmp/doc.json > /dev/null
  done
  START=$(date +%s)
  if bash scripts/evaluation/golden_run.sh "$TABLE" "data/evaluation/scale/dirty_${N}.csv" "/tmp/bench_${N}.json" > "/tmp/bench_${N}.log" 2>&1; then
    END=$(date +%s)
    ENTRY=$(python -c "
import json,sys
d=json.load(open('/tmp/bench_$N.json'))
print(json.dumps({'rows':$N,'table':'$TABLE','state':'SUCCEEDED','duration_seconds':d.get('duration_seconds'),
  'end_to_end_seconds':$((END-START)),'total_records':d.get('total_records'),'quarantined_records':d.get('quarantined_records'),'error':None}))")
  else
    ENTRY=$(python -c "import json;print(json.dumps({'rows':$N,'table':'$TABLE','state':'FAILED','error':open('/tmp/bench_$N.log').read()[-500:]}))")
  fi
  [ $FIRST -eq 1 ] || echo "," >> "$RESULTS"; FIRST=0
  echo "$ENTRY" >> "$RESULTS"
  echo "$N: $ENTRY"
done
echo "]" >> "$RESULTS"
python -c "import json;json.dump(json.load(open('$RESULTS')),open('$EV/d-scale.json','w'),indent=2)"
```

- [ ] **Step 4: รัน benchmark**

```bash
bash scripts/evaluation/run_scale_benchmark.sh
cat docs/evaluation/evidence/d-scale.json
```

Expected: หนึ่งรายการต่อขนาด; ขนาดที่เครื่องรับไม่ไหวจะเป็น `"state": "FAILED"` พร้อม error — ยอมรับได้และต้องคงไว้ในหลักฐาน (Guideline Step 9: "ใช้ขนาดที่เครื่องและระบบรองรับจริง แล้วรายงานตามจริง")

- [ ] **Step 5: Commit**

```bash
git add scripts/evaluation/run_batch_evaluation.sh scripts/evaluation/run_scale_benchmark.sh docs/evaluation/evidence docs/evaluation/d-utilization.md
git commit -m "eval: batch-path detection, utilization and scale benchmark evidence from real runs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: สำรวจแหล่งข้อมูลและปริมาณที่ประมวลผลแล้ว

**Files:**
- Create: `scripts/evaluation/source_inventory.py`
- Test: `scripts/evaluation/tests/test_source_inventory.py`
- Create (ผล): `docs/evaluation/evidence/d-source-inventory.json`

**Interfaces:**
- Produces: `count_csv(path) -> {"rows", "columns"}`; `summarize_runs(run_docs) -> {"by_source": {...}, "total_bytes"}`; `summarize_quality(quality_docs) -> {"tables", "runs", "records_processed", "largest_run"}`; `CONNECTORS` (list ชนิดแหล่งข้อมูลที่ระบบรองรับพร้อมไฟล์โค้ด); CLI `source_inventory.py [--es-url URL]`

- [ ] **Step 1: เทสต์ที่ fail** — `scripts/evaluation/tests/test_source_inventory.py`

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from source_inventory import CONNECTORS, count_csv, summarize_quality, summarize_runs


def test_count_csv(tmp_path):
    p = tmp_path / "a.csv"
    p.write_text("a,b,c\n1,2,3\n4,5,6\n", encoding="utf-8")
    assert count_csv(str(p)) == {"rows": 2, "columns": 3}


def test_runs_grouped_by_source():
    docs = [{"source": "file", "size_bytes": 10, "state": "SUCCEEDED"},
            {"source": "api", "size_bytes": 5, "state": "SUCCEEDED"},
            {"source": "file", "size_bytes": 1, "state": "FAILED"}]
    s = summarize_runs(docs)
    assert s["by_source"]["file"] == {"ingestions": 2, "succeeded": 1, "bytes": 11}
    assert s["total_bytes"] == 16


def test_quality_totals():
    docs = [{"table_name": "a", "total_records": 100}, {"table_name": "a", "total_records": 50},
            {"table_name": "b", "total_records": 1000}]
    s = summarize_quality(docs)
    assert s == {"tables": 2, "runs": 3, "records_processed": 1150, "largest_run": 1000}


def test_connectors_point_at_real_code():
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    assert {c["type"] for c in CONNECTORS} >= {"file", "api", "rdbms", "stream"}
    for c in CONNECTORS:
        assert os.path.isfile(os.path.join(root, c["code"])), c["code"]
```

- [ ] **Step 2: รันให้ fail** — Expected: `ModuleNotFoundError: source_inventory`

- [ ] **Step 3: เขียน `scripts/evaluation/source_inventory.py`**

```python
"""Inventory of data sources and volumes for the rubric's 'sources and volume' criterion.
Usage: python scripts/evaluation/source_inventory.py [--es-url http://elastic:PW@localhost:9200]"""
import argparse
import base64
import csv
import json
import os
import urllib.request
from collections import defaultdict
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CONNECTORS = [
    {"type": "file", "name": "CSV / Excel upload", "endpoint": "POST /api/v1/pipeline/ingest/csv", "code": "services/api/app/api/pipeline.py"},
    {"type": "api", "name": "REST API (JSON/CSV) + data.go.th resolver", "endpoint": "POST /api/v1/pipeline/ingest/api", "code": "services/api/app/api/pipeline.py"},
    {"type": "rdbms", "name": "PostgreSQL (read-only SELECT)", "endpoint": "POST /api/v1/pipeline/ingest/rdbms", "code": "services/api/app/api/pipeline.py"},
    {"type": "stream", "name": "Reddit → Kafka → Spark Structured Streaming", "endpoint": "POST /api/v1/pipeline/ingest/reddit", "code": "services/spark/streaming_job.py"},
]


def count_csv(path):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader, [])
        rows = sum(1 for _ in reader)
    return {"rows": rows, "columns": len(header)}


def summarize_runs(run_docs):
    by_source = defaultdict(lambda: {"ingestions": 0, "succeeded": 0, "bytes": 0})
    for d in run_docs:
        s = by_source[d.get("source", "unknown")]
        s["ingestions"] += 1
        s["succeeded"] += int(d.get("state") == "SUCCEEDED")
        s["bytes"] += int(d.get("size_bytes") or 0)
    return {"by_source": dict(by_source), "total_bytes": sum(s["bytes"] for s in by_source.values())}


def summarize_quality(quality_docs):
    totals = [int(d.get("total_records") or 0) for d in quality_docs]
    return {
        "tables": len({d.get("table_name") for d in quality_docs}),
        "runs": len(quality_docs),
        "records_processed": sum(totals),
        "largest_run": max(totals) if totals else 0,
    }


def dataset_files():
    out = []
    for folder, _, files in os.walk(os.path.join(ROOT, "data")):
        for name in sorted(files):
            path = os.path.join(folder, name)
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            entry = {"path": rel, "bytes": os.path.getsize(path)}
            if name.lower().endswith(".csv"):
                entry.update(count_csv(path))
            if name.lower().endswith((".csv", ".xlsx", ".json", ".parquet", ".avro", ".xml", ".zip")):
                out.append(entry)
    return out


def _es_search_all(es_url, index):
    parsed = urlparse(es_url)
    base = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
    req = urllib.request.Request(f"{base}/{index}/_search?size=10000", data=b'{"query":{"match_all":{}}}',
                                 headers={"Content-Type": "application/json"})
    if parsed.username:
        token = base64.b64encode(f"{parsed.username}:{parsed.password}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
    with urllib.request.urlopen(req, timeout=30) as res:
        return [h["_source"] for h in json.load(res)["hits"]["hits"]]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--es-url", default=None)
    a = p.parse_args()
    report = {"connectors": CONNECTORS, "dataset_files": dataset_files()}
    if a.es_url:
        report["ingestions"] = summarize_runs(_es_search_all(a.es_url, "sdoqap_runs"))
        report["quality_runs"] = summarize_quality(_es_search_all(a.es_url, "sdoqap_quality_runs"))
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: รันให้ผ่านแล้วเก็บหลักฐาน**

```bash
python -m pytest -q scripts/evaluation/tests/test_source_inventory.py
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
python scripts/evaluation/source_inventory.py --es-url "http://elastic:${ES_PASS}@localhost:${ES_HOST_PORT:-9200}" > docs/evaluation/evidence/d-source-inventory.json
python -c "import json;d=json.load(open('docs/evaluation/evidence/d-source-inventory.json'));print(len(d['dataset_files']),'files',d.get('quality_runs'))"
grep -c "$ES_PASS" docs/evaluation/evidence/d-source-inventory.json || true
```

Expected: 4 passed; พิมพ์จำนวนไฟล์และสรุป quality runs; บรรทัดสุดท้ายต้องเป็น `0` (รหัสผ่านไม่หลุดเข้าไฟล์)

- [ ] **Step 5: Commit**

```bash
git add scripts/evaluation/source_inventory.py scripts/evaluation/tests/test_source_inventory.py docs/evaluation/evidence/d-source-inventory.json
git commit -m "feat(eval): source and volume inventory from data/ and the run registry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Compose profiles — เปิดเฉพาะที่ต้องใช้ (รีวิวข้อ 6.2)

**Files:**
- Modify: `docker-compose.yml` (service `zookeeper`, `kafka`, `ollama`, `pgadmin`), `.env.example`, `.env` (ของเครื่อง), `README.md`

- [ ] **Step 1: ตรวจว่าไม่มี service หลักที่ `depends_on` ตัวที่จะย้ายเข้า profile**

```bash
grep -n -A4 "depends_on:" docker-compose.yml | grep -E "zookeeper|kafka|ollama|pgadmin"
```

Expected: มีแค่บรรทัด `zookeeper:` ใต้ `depends_on` ของ `kafka` (อยู่ profile เดียวกัน) — ถ้ามี service อื่นพึ่งตัวใดตัวหนึ่ง ให้หยุดและรายงาน

- [ ] **Step 2: ใส่ profile** — เพิ่มบรรทัดใต้ชื่อ service แต่ละตัว (ระดับเดียวกับ `image:`):
- `zookeeper`, `kafka`: `    profiles: ["streaming"]`
- `ollama`: `    profiles: ["ai"]`
- `pgadmin`: `    profiles: ["tools"]`

- [ ] **Step 3: คงพฤติกรรมเดิมเป็นค่าเริ่มต้น**

```bash
cat >> .env.example <<'EOF'

# Optional service groups. Remove a name to run a lighter stack:
#   streaming = kafka + zookeeper (Reddit stream ingestion), ai = ollama, tools = pgadmin
COMPOSE_PROFILES=streaming,ai,tools
EOF
grep -q "^COMPOSE_PROFILES=" .env || echo "COMPOSE_PROFILES=streaming,ai,tools" >> .env
```

- [ ] **Step 4: ตรวจทั้งสองโหมด**

```bash
docker compose config --services | sort > /tmp/full.txt
COMPOSE_PROFILES= docker compose config --services | sort > /tmp/lean.txt
diff /tmp/full.txt /tmp/lean.txt
```

Expected: diff แสดงว่า lean ไม่มี `kafka`, `ollama`, `pgadmin`, `zookeeper` เท่านั้น

- [ ] **Step 5: README** — เพิ่มท้ายหัวข้อ "Start ระบบ":

```markdown
### โหมดเบา

ค่าเริ่มต้นใน `.env` คือ `COMPOSE_PROFILES=streaming,ai,tools` (เปิดครบ) ถ้าไม่ใช้ Reddit stream, AI ในเครื่อง หรือ pgAdmin ให้ลบชื่อนั้นออก เช่น `COMPOSE_PROFILES=` จะไม่เปิด kafka, zookeeper, ollama และ pgadmin ประหยัด RAM ตาม limit ใน compose ได้ราว 8 GB
```

(8 GB = limit ของ ollama 6G + kafka 512M + zookeeper 384M + pgadmin ที่ไม่มี limit — ตรวจตัวเลข 6G/512M/384M กับ `docker-compose.yml` ก่อน commit)

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example README.md
git commit -m "feat(compose): optional streaming/ai/tools profiles, full stack stays the default

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: สร้างรายงาน rubric จากหลักฐาน

**Files:**
- Create: `scripts/evaluation/build_rubric_report.py`
- Test: `scripts/evaluation/tests/test_build_rubric_report.py`
- Create (ผล): `docs/evaluation/rubric-mapping.md`, `docs/evaluation/README.md`

**Interfaces:**
- Consumes (ทุกไฟล์ optional): `docs/evaluation/evidence/{d-source-inventory,d-stage-list,d-profile-before,d-batch-run,d-detection,d-scale,d-utilization}.json`, `b-e2e-ingest-check.txt`, `c-golden-before.json`, `c-golden-after.json`
- Produces: `render(evidence: dict) -> str` (key = ชื่อไฟล์ไม่มีนามสกุล, value = JSON/str หรือไม่มี); CLI เขียน `docs/evaluation/rubric-mapping.md`

- [ ] **Step 1: เทสต์ที่ fail** — `scripts/evaluation/tests/test_build_rubric_report.py`

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from build_rubric_report import render

FULL = {
    "d-source-inventory": {"connectors": [{"type": "file", "name": "CSV", "endpoint": "e", "code": "c"}],
                           "dataset_files": [{"path": "data/x.csv", "rows": 10, "columns": 2, "bytes": 5}],
                           "quality_runs": {"tables": 3, "runs": 7, "records_processed": 12345, "largest_run": 10100}},
    "d-stage-list": [{"order": 1, "name": "schema_align", "title": "จัดชื่อ", "phase": "align"}],
    "d-profile-before": {"rows": 10100, "null_counts": {"score": 300}, "invalid_score": 200, "duplicate_rows": 100, "study_hours_outliers": 100},
    "d-batch-run": {"total_records": 10000, "clean_records": 9400, "quarantined_records": 600, "duration_seconds": 42.5,
                    "stage_seconds": {"schema_align": 1.0}},
    "d-detection": {"per_type": {"Duplicate": {"actual": 100, "detected": 100, "rate": 1.0}},
                    "precision": 0.98, "recall": 0.97, "accuracy": 0.99, "confusion": {"tp": 1, "fp": 0, "fn": 0, "tn": 1}},
    "d-scale": [{"rows": 10000, "state": "SUCCEEDED", "duration_seconds": 40.0, "end_to_end_seconds": 90},
                {"rows": 1000000, "state": "FAILED", "error": "OOM"}],
    "d-utilization": {"rows": 9400, "students": 5000, "pass_rate": 0.8, "by_course": [], "follow_up_students": ["1"]},
    "b-e2e-ingest-check": "PASS distinct ingest ids\nPASS duplicate detected\n",
    "c-golden-before": {"total_records": 1}, "c-golden-after": {"total_records": 1},
}


def test_every_rubric_criterion_has_a_section():
    md = render(FULL)
    for title in ("จำนวนแหล่งข้อมูลและปริมาณข้อมูล", "จำนวนกระบวนการในการจัดการข้อมูล", "Data extraction",
                  "Data transformation", "Data loading", "ประสิทธิผลของการใช้ประโยชน์จากข้อมูล", "CLO6"):
        assert title in md


def test_numbers_come_from_evidence():
    md = render(FULL)
    assert "12,345" in md and "10,100" in md and "42.5" in md and "0.97" in md
    assert "FAILED" in md and "OOM" in md


def test_missing_evidence_is_stated_not_invented():
    md = render({})
    assert md.count("ยังไม่มีหลักฐาน") >= 5
    assert "run_batch_evaluation.sh" in md
```

- [ ] **Step 2: รันให้ fail** — Expected: `ModuleNotFoundError: build_rubric_report`

- [ ] **Step 3: เขียน `scripts/evaluation/build_rubric_report.py`**

```python
"""Render docs/evaluation/rubric-mapping.md from the evidence files. Every number printed
here is read from docs/evaluation/evidence/; missing evidence is reported as missing."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVIDENCE = os.path.join(ROOT, "docs", "evaluation", "evidence")
OUT = os.path.join(ROOT, "docs", "evaluation", "rubric-mapping.md")
NAMES = ("d-source-inventory", "d-stage-list", "d-profile-before", "d-batch-run", "d-detection", "d-scale",
         "d-utilization", "c-golden-before", "c-golden-after")


def _missing(cmd):
    return f"> ยังไม่มีหลักฐาน — รัน `{cmd}`\n"


def _sources(ev):
    inv = ev.get("d-source-inventory")
    if not inv:
        return _missing("python scripts/evaluation/source_inventory.py --es-url ... > docs/evaluation/evidence/d-source-inventory.json")
    lines = ["| ชนิด | แหล่งข้อมูล | จุดเข้า | โค้ด |", "|---|---|---|---|"]
    lines += [f"| {c['type']} | {c['name']} | `{c['endpoint']}` | `{c['code']}` |" for c in inv["connectors"]]
    files = inv.get("dataset_files", [])
    rows = sum(f.get("rows", 0) for f in files)
    lines += ["", f"ไฟล์ข้อมูลใน `data/`: {len(files):,} ไฟล์ รวม {rows:,} แถว (นับเฉพาะ CSV)"]
    q = inv.get("quality_runs")
    if q:
        lines.append(f"ประมวลผลผ่าน Spark แล้ว {q['runs']:,} รอบ จาก {q['tables']:,} ตาราง รวม {q['records_processed']:,} แถว "
                     f"(รอบใหญ่สุด {q['largest_run']:,} แถว)")
    return "\n".join(lines) + "\n"


def _stages(ev):
    stages = ev.get("d-stage-list")
    if not stages:
        return _missing("docker compose exec -T -w /opt/spark-apps spark-master python -m sdoqap.pipeline --json > docs/evaluation/evidence/d-stage-list.json")
    lines = [f"เส้นทาง Spark มี {len(stages)} กระบวนการ แต่ละตัวมีเทสต์ใน `services/spark/tests/unit/` และจับเวลาแยกใน `stage_seconds`",
             "", "| # | phase | stage | หน้าที่ |", "|---:|---|---|---|"]
    lines += [f"| {s['order']} | {s['phase']} | `{s['name']}` | {s['title']} |" for s in stages]
    run = ev.get("d-batch-run") or {}
    if run.get("stage_seconds"):
        lines += ["", "เวลาต่อ stage ในรอบประเมิน (วินาที): " +
                  ", ".join(f"`{k}` {v}" for k, v in run["stage_seconds"].items())]
    return "\n".join(lines) + "\n"


def _extraction(ev):
    log = ev.get("b-e2e-ingest-check")
    parts = ["- แต่ละการนำเข้าได้ `ingest_id` และโฟลเดอร์ `/data/raw/<table>/<ingest_id>/` ของตัวเอง, ตรวจ checksum ซ้ำ, ตรวจคีย์หลักก่อนลง HDFS, allowlist URL แบบ fail-closed, SQL แบบ read-only, จำกัดขนาดไฟล์ (`services/api/app/api/{pipeline,ingest_guards,run_registry}.py`)"]
    if log:
        passes = [l for l in log.splitlines() if l.startswith(("PASS", "FAIL"))]
        parts += ["", "ผลทดสอบ end-to-end (`docs/evaluation/evidence/b-e2e-ingest-check.txt`):", ""] + [f"- {l}" for l in passes]
    else:
        parts.append(_missing("bash scripts/ops/e2e_ingest_check.sh | tee docs/evaluation/evidence/b-e2e-ingest-check.txt"))
    return "\n".join(parts) + "\n"


def _transformation(ev):
    before, det = ev.get("d-profile-before"), ev.get("d-detection")
    if not before or not det:
        return _missing("bash scripts/evaluation/run_batch_evaluation.sh")
    lines = ["**ก่อน transform** (`d-profile-before.json`): "
             f"{before['rows']:,} แถว, score ว่าง {before['null_counts'].get('score', 0):,}, score นอกช่วง {before['invalid_score']:,}, "
             f"คีย์ซ้ำ {before['duplicate_rows']:,}, study_hours outlier {before['study_hours_outliers']:,}", "",
             "**Detection เทียบ ground truth** (`d-detection.json`):", "",
             "| ชนิดปัญหา | จริง | ตรวจพบ | อัตรา |", "|---|---:|---:|---:|"]
    for t, v in det["per_type"].items():
        rate = "—" if v["rate"] is None else f"{v['rate']:.2%}"
        lines.append(f"| {t} | {v['actual']:,} | {v['detected']:,} | {rate} |")
    c = det["confusion"]
    lines += ["", f"precision {det['precision']} · recall {det['recall']} · accuracy {det['accuracy']} "
                  f"(TP {c['tp']:,}, FP {c['fp']:,}, FN {c['fn']:,}, TN {c['tn']:,})"]
    gb, ga = ev.get("c-golden-before"), ev.get("c-golden-after")
    if gb and ga:
        same = all(gb.get(k) == ga.get(k) for k in ("total_records", "clean_records", "quarantined_records", "quarantine_breakdown"))
        lines += ["", f"Golden test ก่อน/หลังแยก stage: {'ตรงกันทุกตัวเลข' if same else 'ไม่ตรงกัน — ดูไฟล์ c-golden-*.json'}"]
    return "\n".join(lines) + "\n"


def _loading(ev):
    run = ev.get("d-batch-run")
    lines = ["- เขียน quarantine แบบ idempotent (ลบตาม `ingest_id` แล้วเขียนใหม่) **ก่อน** Delta MERGE, ย้าย raw ไป `/data/archive/` แทนการลบ, lock มี heartbeat, สถานะ QUEUED→RUNNING→SUCCEEDED/FAILED/SKIPPED ใน `sdoqap_runs`"]
    if run:
        lines.append(f"- รอบประเมิน: รับเข้า {run['total_records']:,} แถว → active {run['clean_records']:,} + quarantine "
                     f"{run['quarantined_records']:,} (ครบ {run['clean_records'] + run['quarantined_records'] == run['total_records']}), "
                     f"เวลาใน engine {run['duration_seconds']} วินาที")
    else:
        lines.append(_missing("bash scripts/evaluation/run_batch_evaluation.sh"))
    scale = ev.get("d-scale")
    if scale:
        lines += ["", "| แถว | สถานะ | เวลาใน engine (s) | end-to-end (s) | หมายเหตุ |", "|---:|---|---:|---:|---|"]
        for s in scale:
            lines.append(f"| {s['rows']:,} | {s['state']} | {s.get('duration_seconds', '—')} | {s.get('end_to_end_seconds', '—')} | {(s.get('error') or '')[:80]} |")
    else:
        lines.append(_missing("bash scripts/evaluation/run_scale_benchmark.sh"))
    return "\n".join(lines) + "\n"


def _utilization(ev):
    u = ev.get("d-utilization")
    if not u:
        return _missing("bash scripts/evaluation/run_batch_evaluation.sh")
    return (f"ข้อมูลสะอาด {u['rows']:,} แถวของนักศึกษา {u['students']:,} คน ถูกนำไปสรุปคะแนนเฉลี่ยรายวิชา อัตราผ่าน "
            f"({u['pass_rate']:.2%}) การกระจายคะแนน และรายชื่อนักศึกษาที่ต้องติดตาม {len(u['follow_up_students']):,} คน — "
            "ดู [d-utilization.md](d-utilization.md)\n")


CLO6 = """### ขอบเขตโครงงานน่าสนใจ/แปลกใหม่
แพลตฟอร์มตรวจคุณภาพข้อมูลที่อธิบายเหตุผลได้ทุกขั้น (white-box) มีสองเส้นทาง: เอนจินโต้ตอบสำหรับทดลองกฎทันที และ Spark สำหรับข้อมูลจริงหลายแหล่ง พร้อม governance ของ schema และกฎ

### Component ที่ใช้นวัตกรรม
- ปรับเกณฑ์คุณภาพตามประวัติ (adaptive threshold) — `services/spark/dynamic_rules_engine.py`
- ตรวจ distribution drift ด้วย PSI และโปรไฟล์ EMA — `services/spark/data_profile_store.py`
- เรียนรู้กฎจากข้อมูลด้วย Decision Tree และเสนอกฎด้วย LLM ผ่านการอนุมัติของคน — `services/spark/ai_rule_advisor.py`
- จัดหมวดข้อความแบบ hybrid similarity ที่รองรับภาษาไทยไม่เว้นวรรค — `services/spark/sdoqap/semantic/similarity.py`
- Schema drift gate ที่อนุมัติอัตโนมัติเฉพาะการเพิ่มคอลัมน์ — stage `schema_drift`

### ดัดแปลงเทคนิคที่มีอยู่
Tukey IQR, Z-score (มีพื้น std 5% กัน false alarm), Delta Lake MERGE/idempotent quarantine, คิวต่อตารางแบบ FIFO, character n-gram cosine, Buddhist-year date normalisation
"""


def render(ev):
    sections = [
        "# ความสอดคล้องกับเกณฑ์การให้คะแนน (Data Eng)",
        "",
        "สร้างโดย `python scripts/evaluation/build_rubric_report.py` จากไฟล์ใน `docs/evaluation/evidence/` — ตัวเลขทุกตัวมาจากการรันจริง",
        "",
        "## CLO5 · ปริมาณและขอบเขต (25%)",
        "", "### จำนวนแหล่งข้อมูลและปริมาณข้อมูล (10)", "", _sources(ev),
        "### จำนวนกระบวนการในการจัดการข้อมูล (15)", "", _stages(ev),
        "## CLO5 · คุณภาพและความสมบูรณ์ (30%)",
        "", "### ความครบถ้วนของการสกัดข้อมูล — Data extraction (10)", "", _extraction(ev),
        "### ความครบถ้วนของการเปลี่ยนแปลงข้อมูล — Data transformation (10)", "", _transformation(ev),
        "### ความครบถ้วนของการถ่ายโอนข้อมูล — Data loading (5)", "", _loading(ev),
        "### ประสิทธิผลของการใช้ประโยชน์จากข้อมูล (5)", "", _utilization(ev),
        "## CLO6 · นวัตกรรม (15%)", "", CLO6,
        "## ข้อจำกัดที่ทราบ", "",
        "- เอนจินโต้ตอบ (Audit Trail/Ingestion แท็บ File) เก็บสถานะชุดเดียวร่วมกันทุกผู้ใช้ — ใช้สาธิตได้ทีละคน",
        "- Rate limit ของ API นับตาม IP ของ nginx (ผู้ใช้ทุกคนใช้โควตาเดียวกัน)",
    ]
    return "\n".join(sections) + "\n"


def load_evidence(folder=EVIDENCE):
    ev = {}
    for name in NAMES:
        path = os.path.join(folder, f"{name}.json")
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                ev[name] = json.load(f)
    txt = os.path.join(folder, "b-e2e-ingest-check.txt")
    if os.path.isfile(txt):
        with open(txt, encoding="utf-8", errors="replace") as f:
            ev["b-e2e-ingest-check"] = f.read()
    return ev


if __name__ == "__main__":
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(render(load_evidence()))
    print("wrote", os.path.relpath(OUT, ROOT))
```

- [ ] **Step 4: รันให้ผ่านแล้วสร้างรายงานจริง**

```bash
python -m pytest -q scripts/evaluation/tests/test_build_rubric_report.py
python scripts/evaluation/build_rubric_report.py
grep -c "ยังไม่มีหลักฐาน" docs/evaluation/rubric-mapping.md || true
```

Expected: 3 passed; `wrote docs/evaluation/rubric-mapping.md`; จำนวน "ยังไม่มีหลักฐาน" = `0` ถ้า Task 2–6 และ Plan B Task 8 รันครบ — ถ้าไม่ใช่ 0 ให้รันคำสั่งที่รายงานบอกแล้วสร้างใหม่

- [ ] **Step 5: เขียน `docs/evaluation/README.md`**

````markdown
# Evaluation

รายงานหลัก: [rubric-mapping.md](rubric-mapping.md) (สร้างอัตโนมัติ ห้ามแก้ด้วยมือ)

## สร้างหลักฐานใหม่ทั้งหมด (stack ต้องรันอยู่)

```bash
python scripts/evaluation/prepare_datasets.py
bash scripts/ops/e2e_ingest_check.sh | tee docs/evaluation/evidence/b-e2e-ingest-check.txt
bash scripts/evaluation/run_batch_evaluation.sh
bash scripts/evaluation/run_scale_benchmark.sh
python scripts/evaluation/source_inventory.py --es-url "http://elastic:<password>@localhost:9200" > docs/evaluation/evidence/d-source-inventory.json
python scripts/evaluation/build_rubric_report.py
```

| ไฟล์ใน `evidence/` | มาจาก |
|---|---|
| `b-e2e-ingest-check.txt` | การอัปโหลดพร้อมกัน, ไฟล์ซ้ำ, archive |
| `c-golden-before.json`, `c-golden-after.json`, `c-stage-list.txt` | golden test ของการแยก stage |
| `d-profile-before.json` | profile ก่อน transform |
| `d-batch-run.json`, `d-detection.json` | รอบประเมินและ detection เทียบ ground truth |
| `d-utilization.json` (+ `../d-utilization.md`) | การใช้ประโยชน์จากข้อมูลสะอาด |
| `d-scale.json` | เวลาตามขนาดข้อมูล |
| `d-source-inventory.json` | แหล่งข้อมูลและปริมาณ |
| `d-stage-list.json` | รายการ stage |
| `d-whitebox-evaluation.txt` | ผลประเมินเอนจินโต้ตอบ |
````

- [ ] **Step 6: Commit**

```bash
git add scripts/evaluation/build_rubric_report.py scripts/evaluation/tests/test_build_rubric_report.py docs/evaluation/rubric-mapping.md docs/evaluation/README.md
git commit -m "docs(eval): rubric mapping generated from real-run evidence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- ทุกหัวข้อในรูปเกณฑ์มี section ใน `render()` และมีสคริปต์สร้างหลักฐาน: แหล่งข้อมูล (Task 6), กระบวนการ (Plan C + `d-stage-list`), extraction (Plan B Task 8), transformation (Task 2, 3, 5), loading (Task 5 + Plan B), การใช้ประโยชน์ (Task 4, 5), CLO6 (ข้อความอ้างไฟล์โค้ดจริง ไม่มีตัวเลข)
- Evalution_Guildline Step 1–11: dataset (Task 1), ground truth (zip), rules (Plan C Task 9), config (rules_config), run (Task 5), before (Task 2), after + detection (Task 3, 5), time (Task 5 scale), utilization (Task 4) — screenshot (Step 11) เป็นงานของผู้ใช้ ไม่อยู่ในแผน
- ชื่อที่ใช้ข้าม task: `golden_run.sh` คืน JSON ที่มี `run_id` (Plan C Task 0 เก็บคีย์นี้ไว้), `export_run_rows.py` → `active.csv`/`quarantine.csv`, ชื่อไฟล์หลักฐานตรงกับ `NAMES` ใน `build_rubric_report.py`
