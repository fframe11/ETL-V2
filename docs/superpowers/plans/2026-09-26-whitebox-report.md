# White-Box Report of SDOQAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a Thai report for the project committee that takes every part of SDOQAP a user sees only as "input → result" (a black box) and explains, step by step, how it really works inside (white box), with formulas, code references and real worked examples.

**Architecture:** One Markdown file per black box under `docs/whitebox-report/`, all with the same five-part template, plus an index. Every claim about how the system works cites `path:line` in the code, and a small script checks those citations. Every number in a worked example comes from running the real system or code, and the raw output is kept under `docs/whitebox-report/evidence/`.

**Tech Stack:** Markdown + Mermaid diagrams; Python 3 for the citation checker and the demo-data generator; the running Docker stack (`api`, `elasticsearch`, `spark-master`) for evidence.

**Spec:** No separate spec file. The request (from the user, in Thai): identify the black-box parts of the system and write each one up as a white box, detailed enough that a committee member understands what that part really does. Scope and format were not specified by the user; the decisions are recorded under "Rulings".

## Global Constraints

- Language: Thai prose. Code names, file paths, formulas and column names stay in English.
- Location: `docs/whitebox-report/`. File names exactly as in the File map.
- Every section uses the five-part template in Task 1, with the headings exactly as written.
- Every statement about behaviour cites the code as `` `path:line` `` or `` `path:start-end` `` (relative to the repo root, inside backticks). `docs/whitebox-report/tools/check_citations.py` must pass before each commit.
- Every number in a worked example comes from (a) running the real system or function, with the raw output saved under `docs/whitebox-report/evidence/`, or (b) a hand calculation shown line by line from a cited formula, labelled "คำนวณด้วยมือจากสูตรที่ `path:line`". No unexplained numbers.
- Honesty rule: say plainly what is computed, what is a fixed constant or fixed text, what is a fallback, and what is not what its name suggests (for example "clustering" that is keyword matching, not machine learning). Do not describe anything as AI unless it calls a model.
- Documentation only. Do not change system code. If a task finds a bug, write it in that section's part 4 and in the index's findings list; do not fix it.
- Evidence files must not contain secrets. Before committing, run `grep -rniE "sdoqap_secure|password|api_key|bearer|gsk_" docs/whitebox-report/evidence/` and expect no output; if something appears, replace the value with `***`.
- Local stack: http://localhost, login `admin`/`admin` (local testing only). Elasticsearch: `http://localhost:9200`, user `elastic`; read the password at run time from the API container (`docker compose exec -T api printenv ELASTICSEARCH_PASSWORD`) into a shell variable; never write it into a file or the report.
- Branch `bell`. Commit after every task. Do not push. End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Code line numbers were taken at commit `753983c`. Re-check them when you read the code; cite what you actually see.

## Rulings (decisions made without the user's answer)

- Scope: all ten black boxes below, not a subset — a committee report must not leave parts unexplained. Cost if wrong: extra sections the user can drop.
- Format: Markdown with Mermaid, one file per section. It renders on GitHub and converts to Word later (e.g. with pandoc). Cost if wrong: one conversion step.
- The demo dataset generator is committed (the CSV itself is ignored by `.gitignore`) so the committee can reproduce the numbers.

## Black boxes covered

| # | What the user sees | Where it really lives |
|---|---|---|
| 01 | Ingestion / Rules / Pipeline pages sort rows into ผ่าน / รอตรวจ / กักกัน | `api/app/api/whitebox.py` (pandas, interactive) |
| 02 | Dashboard / Audit Trail show quality score, quarantine counts per run | `spark/spark_quality_engine.py` `run_quality_check` (Spark, batch) |
| 03 | Messy category values become clean categories | `spark/spark_quality_engine.py` `LocalSemanticStandardizer` |
| 04 | Thresholds that "adapt" and "drift" warnings | `spark/dynamic_rules_engine.py`, `spark/data_profile_store.py` |
| 05 | "AI" explanations and AI-proposed rules | `api/app/api/whitebox.py` AI context, `spark/ai_rule_advisor.py` |
| 06 | Query & Metrics 7/14/30-day quality forecast and SLA breach % | `api/app/api/analytics.py` projection, `ui/src/pages/Analytics.jsx` |
| 07 | Money lost to bad data (COPDQ, USD with ≈฿) | `api/app/api/analytics.py` impact, Spark COPDQ, `ui/src/utils/currency.js` |
| 08 | Multi-table "relationship analysis" and join | `api/app/api/whitebox.py` multi-table |
| 09 | Catalog: schema change proposals to approve/reject | `spark/spark_quality_engine.py` drift check, `api/app/api/schema.py` |
| 10 | Query & Metrics "รูปแบบข้อผิดพลาด" (error pattern) chart | `api/app/api/analytics.py` clustering |

## File map

| File | Responsibility |
|---|---|
| `docs/whitebox-report/00-index.md` | Purpose, how to read, template, table of contents, findings list, glossary, how to reproduce |
| `docs/whitebox-report/01-interactive-quality-gates.md` … `10-error-pattern-grouping.md` | One black box each |
| `docs/whitebox-report/tools/check_citations.py` | Verifies every `path:line` citation points at a real line |
| `docs/whitebox-report/tools/gen_demo_dataset.py` | Rebuilds the 250-row demo dataset |
| `docs/whitebox-report/evidence/*.json` / `*.txt` | Raw outputs behind the worked examples |

## Common procedure for sections 01–10

Every section task (Tasks 2–11) follows these steps. The task itself lists what to read, which evidence to collect, and the facts the section must contain.

1. Read the code ranges listed in the task. Confirm each required fact against the code; if the code says something different, write what the code says and note the difference in part 4.
2. Collect the evidence with the commands given; save raw output under `docs/whitebox-report/evidence/` with the file name given.
3. Write the section with the template from Task 1. Part 2 must walk through the steps in the order the code runs them; include one Mermaid flowchart when the process has more than three steps.
4. Run `python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/NN-*.md` → expect `OK`.
5. Run the secret check from Global Constraints → expect no output.
6. Tick every item of the task's "Required facts" list against the written section.
7. Commit the section and its evidence files.

---

### Task 1: Scaffold — template, index, citation checker, demo data generator

**Files:**
- Create: `docs/whitebox-report/00-index.md`
- Create: `docs/whitebox-report/tools/check_citations.py`
- Create: `docs/whitebox-report/tools/gen_demo_dataset.py`
- Create: `docs/whitebox-report/evidence/.gitkeep`

**Interfaces:**
- Produces: `python docs/whitebox-report/tools/check_citations.py <files...>` — prints `OK (<n> citations)` and exits 0 when every citation resolves; otherwise prints one `BAD <file>: <citation> — <reason>` line per problem and exits 1. Used by every later task.
- Produces: the five-part section template (below), used by every later task.

- [ ] **Step 1: Write the citation checker**

Create `docs/whitebox-report/tools/check_citations.py`:

```python
"""Checks that every `path:line` / `path:start-end` citation in the report
points at lines that exist. Run from the repo root.

Usage: python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md
"""
import re
import sys
from pathlib import Path

CITATION = re.compile(
    r"`((?:api|spark|ui|tests|docs|scripts)/[\w./-]+\.(?:py|jsx|js|json|css|yml|md)):(\d+)(?:-(\d+))?`"
)


def check(md_path: Path, root: Path):
    problems, count = [], 0
    for match in CITATION.finditer(md_path.read_text(encoding="utf-8")):
        count += 1
        rel, start, end = match.group(1), int(match.group(2)), match.group(3)
        end = int(end) if end else start
        target = root / rel
        if not target.is_file():
            problems.append(f"BAD {md_path}: {match.group(0)} — file not found")
            continue
        total = len(target.read_text(encoding="utf-8", errors="replace").splitlines())
        if start < 1 or end < start or end > total:
            problems.append(f"BAD {md_path}: {match.group(0)} — file has {total} lines")
    return problems, count


def main(argv):
    root = Path.cwd()
    files = [Path(a) for a in argv[1:]]
    if not files:
        print("usage: check_citations.py <markdown files>")
        return 2
    all_problems, total = [], 0
    for f in files:
        problems, count = check(f, root)
        all_problems += problems
        total += count
    for p in all_problems:
        print(p)
    if all_problems:
        return 1
    print(f"OK ({total} citations)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

- [ ] **Step 2: Test the checker against a good and a bad citation**

```bash
cd /c/ETL
printf 'good `api/app/api/whitebox.py:1`\n' > /tmp/cite_good.md
printf 'bad `api/app/api/whitebox.py:999999`\nmissing `api/nope.py:1`\n' > /tmp/cite_bad.md
python docs/whitebox-report/tools/check_citations.py /tmp/cite_good.md; echo "exit=$?"
python docs/whitebox-report/tools/check_citations.py /tmp/cite_bad.md; echo "exit=$?"
```

Expected: first prints `OK (1 citations)` and `exit=0`; second prints two `BAD` lines and `exit=1`.

- [ ] **Step 3: Commit the demo data generator**

Create `docs/whitebox-report/tools/gen_demo_dataset.py` with this exact content (the same random seed and call order as the file already used this session, only the output path became an argument):

```python
# -*- coding: utf-8 -*-
"""Rebuilds the 250-row demo dataset used in the report's worked examples.

Usage: python docs/whitebox-report/tools/gen_demo_dataset.py <output.csv>

Contents: 200 clean rows, 12 missing score, 13 score outside [0, 100],
13 duplicate (student_id, course, semester), 12 study_hours outliers.
"""
import csv
import random
import sys

random.seed(42)

COURSES = ["CS101", "MATH201", "ENG105", "PHYS110", "BIO220"]
SEMESTERS = ["2025-1", "2025-2"]

rows = []

for i in range(200):
    rows.append({
        "student_id": f"S{3001 + i}",
        "course": random.choice(COURSES),
        "semester": random.choice(SEMESTERS),
        "score": round(random.uniform(45, 98), 1),
        "study_hours": round(random.uniform(2, 8), 1),
    })

for i in range(12):
    rows.append({
        "student_id": f"S{4001 + i}",
        "course": random.choice(COURSES),
        "semester": random.choice(SEMESTERS),
        "score": "",
        "study_hours": round(random.uniform(2, 8), 1),
    })

for i in range(13):
    bad_score = round(random.uniform(-30, -1), 1) if i % 2 == 0 else round(random.uniform(101, 160), 1)
    rows.append({
        "student_id": f"S{4101 + i}",
        "course": random.choice(COURSES),
        "semester": random.choice(SEMESTERS),
        "score": bad_score,
        "study_hours": round(random.uniform(2, 8), 1),
    })

dup_sources = random.sample(rows[:200], 13)
for src in dup_sources:
    rows.append({
        "student_id": src["student_id"],
        "course": src["course"],
        "semester": src["semester"],
        "score": round(random.uniform(45, 98), 1),
        "study_hours": round(random.uniform(2, 8), 1),
    })

for i in range(12):
    rows.append({
        "student_id": f"S{4301 + i}",
        "course": random.choice(COURSES),
        "semester": random.choice(SEMESTERS),
        "score": round(random.uniform(45, 98), 1),
        "study_hours": round(random.uniform(28, 55), 1),
    })

random.shuffle(rows)

out_path = sys.argv[1]
with open(out_path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["student_id", "course", "semester", "score", "study_hours"])
    w.writeheader()
    w.writerows(rows)

print("wrote", len(rows), "rows to", out_path)
```

Verify it reproduces the file already in the repo root byte for byte:

```bash
cd /c/ETL
python docs/whitebox-report/tools/gen_demo_dataset.py /tmp/demo_check.csv
cmp /tmp/demo_check.csv dirty_course_scores_demo.csv && echo SAME
```

Expected: `wrote 250 rows …` then `SAME`. If `cmp` reports a difference, stop and report — the worked examples depend on this exact data.

- [ ] **Step 4: Write the index with the template**

Create `docs/whitebox-report/00-index.md` containing, in this order:

1. `# รายงานอธิบายการทำงานภายในของระบบ SDOQAP (White-Box Report)`
2. `## วัตถุประสงค์` — two or three sentences: the user interface shows results without showing how they are produced; this report opens each of those parts.
3. `## ระบบนี้มีเอนจินตรวจคุณภาพข้อมูล 2 ชุด` — explain early, because committee members will confuse them:
   - Interactive engine (pandas, inside the API): works on one uploaded dataset, drives Ingestion → Expectations & Alerts → Jobs & Pipelines → Workspace Exports. Cite `api/app/api/whitebox.py:1173`.
   - Batch engine (Spark): runs pipeline jobs per table, writes each run to Elasticsearch index `sdoqap_quality_runs`, which Dashboards / Query & Metrics / Audit Trail read. Cite `spark/spark_quality_engine.py:1684` and `spark/spark_quality_engine.py:2838`.
4. `## รูปแบบของแต่ละบท` — the template, verbatim:

```markdown
# NN. <ชื่อส่วน>

> ผู้ใช้เห็นส่วนนี้ที่: <หน้าในระบบ> · โค้ดหลัก: `path:line`

## 1. มุมมองแบบ Black Box (ผู้ใช้เห็นอะไร)
ข้อมูลเข้า → ผลลัพธ์ที่เห็นบนหน้าจอ โดยยังไม่อธิบายว่าคิดอย่างไร

## 2. การทำงานภายใน (White Box)
ขั้นตอนตามลำดับที่โค้ดทำงานจริง พร้อมสูตร ค่าคงที่ และการอ้างอิง `path:line`

## 3. ตัวอย่างการคำนวณจริง
ข้อมูลตัวอย่าง → ค่ากลางทุกขั้น → ผลลัพธ์ พร้อมอ้างไฟล์หลักฐานใน `evidence/`

## 4. สิ่งที่เป็นค่าคงที่ ข้อจำกัด และข้อสังเกต
อะไรคำนวณจริง อะไรเป็นค่าตายตัว อะไรเป็นค่าสำรอง และปัญหาที่พบ

## 5. คำถามที่กรรมการอาจถาม
คำถามพร้อมคำตอบสั้น 3–5 ข้อ
```

5. `## สารบัญ` — a table with the ten sections from "Black boxes covered" (number, Thai title, file link, page where the user sees it). Leave a column `สรุปหนึ่งบรรทัด` empty for now; Task 12 fills it.
6. `## วิธีทำซ้ำตัวอย่างในรายงาน` — commands: rebuild the demo CSV with `tools/gen_demo_dataset.py`, start the stack with `docker compose up -d`, upload the CSV on the Data Ingestion page or with curl, and check citations with `tools/check_citations.py`.
7. `## ข้อสังเกตที่พบระหว่างเขียนรายงาน` — empty list; each section task appends to it.
8. `## อ้างอิงเวอร์ชันโค้ด` — "เขียนจากโค้ด commit `<HEAD short SHA at time of writing>`" (fill with `git rev-parse --short HEAD`).

Create `docs/whitebox-report/evidence/.gitkeep` (empty).

- [ ] **Step 5: Check and commit**

```bash
cd /c/ETL
python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/00-index.md
git add docs/whitebox-report
git commit -m "docs(whitebox-report): scaffold, template, citation checker, demo data generator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `OK (3 citations)` before the commit.

---

### Task 2: Section 01 — Interactive quality gates (Ingestion → Export)

**Files:**
- Create: `docs/whitebox-report/01-interactive-quality-gates.md`
- Create: `docs/whitebox-report/evidence/01-profile.json`, `01-state.json`

**Interfaces:**
- Consumes: template and checker from Task 1; the demo CSV at `C:\ETL\dirty_course_scores_demo.csv`.

**Read:** `api/app/api/whitebox.py:165-230` (`_compute_profile`), `:1119-1140` (default settings in `_WORKFLOW_STATE`), `:1173-1335` (`_recompute_interactive_state`), `:1436-1480` (`upload_csv_dataset`), `:57-66` (`QUALITY_ENGINE_COLUMNS`); `ui/src/pages/Ingestion.jsx` (what the cards show).

**Evidence:**

```bash
cd /c/ETL
curl -s -c /tmp/c.txt -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b /tmp/c.txt -F table_name=dirty_course_scores_demo -F "file=@dirty_course_scores_demo.csv;type=text/csv" http://localhost/api/v1/whitebox/upload-csv -o /dev/null -w "%{http_code}\n"
curl -s -b /tmp/c.txt http://localhost/api/v1/whitebox/profile > docs/whitebox-report/evidence/01-profile.json
curl -s -b /tmp/c.txt http://localhost/api/v1/whitebox/state > docs/whitebox-report/evidence/01-state.json
```

Expected: `200`, then two JSON files. In `01-state.json`, `metrics.total_rows` 250, `clean_rows` 200, `review_rows` 12, `quarantine_rows` 38. Drop the `sample_*` arrays from the saved state JSON if they make it long (keep the numbers).

**Required facts:**
- Which files are allowed in: only files with all of `student_id, course, score, study_hours`; other files are only profiled.
- The profile step (`_compute_profile`): per column null count, distinct count, and for numbers min/max/mean/median/Q1/Q3/IQR with fences at **1.5×IQR**; duplicate count on `student_id + course + semester` keeping the first.
- The gates in the order the code applies them: (1) duplicate key → marked first, kept-first rule; (2) on non-duplicate rows: missing `score` and `score` outside `[min_score, max_score]` (default `[0, 100]`); (3) on rows that passed 1 and 2: `study_hours` above `Q3 + k×IQR` or below `Q1 − k×IQR`, `k = 3.0` by default or `1.5`.
- Where each rule sends a row: duplicate → กักกัน (or รอตรวจ if `dedup_strategy = review_all`); missing score → กักกัน under `strict_0`, otherwise รอตรวจ unless the null rate exceeds `max_null_pct` 5%; out of range → กักกัน; outlier → รอตรวจ.
- Human review: `review_action` KEEP / APPROVE / REJECT for the whole review queue, and per-row decisions that override it.
- Quality score = clean rows ÷ total rows × 100.
- Q1/Q3 for the fence are computed over **all** rows' `study_hours` (including rows already failed by gates 1–2).
- Part 4 must note: the profile card uses a 1.5×IQR fence while the gate uses 3.0×IQR by default, so the Ingestion "ค่าผิดปกติ" count and the pipeline's review count can differ on other data; state is held in process memory (`_WORKFLOW_STATE`) and lost on API restart.
- Worked example with the demo data: the counts 12 / 13 / 13 / 12, the real Q1, Q3, IQR and upper fence from `01-state.json`, and 200 + 12 + 38 = 250, quality 80%.

---

### Task 3: Section 02 — Spark batch quality engine (Dashboard, Audit Trail)

**Files:**
- Create: `docs/whitebox-report/02-spark-batch-quality-engine.md`
- Create: `docs/whitebox-report/evidence/02-latest-quality-run.json`

**Read:** `spark/spark_quality_engine.py:148-232` (lock), `:1349-1500` (schema registry, auto-evolve), `:1501-1600` (rules config, track detection), `:1630-1683` (history), `:1684-2900` (`run_quality_check`, follow the section comments in order), `:2838` (write to `sdoqap_quality_runs`).

**Evidence:**

```bash
cd /c/ETL
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '')
curl -s -u "elastic:$ES_PASS" "http://localhost:9200/sdoqap_quality_runs/_search?size=1&sort=timestamp:desc" > docs/whitebox-report/evidence/02-latest-quality-run.json
```

Never write the password into the report or evidence.

**Required facts (confirm each in the code, cite it):**
- The stage order inside `run_quality_check` from the lock to the final Elasticsearch write, as a numbered list and one Mermaid flowchart: lock → Spark session and track → read raw data → schema drift check (missing columns, new columns) → safe dedup → null and type validation → standardisation → IQR outlier → z-score anomaly → induced tree rules → combine quarantine → Delta Lake MERGE of clean rows and quarantine write partitioned by `run_id` → metrics (freshness lag, quality score, z-score on quarantine rate, COPDQ) → write run document → downstream trigger.
- What "quality score" means here, its formula, and the per-table threshold from rules config (not a hard-coded 90).
- The quarantine reasons that end up in the run document, and the field names the Dashboard reads (use the evidence JSON).
- That no fake keys or timestamps are generated for missing primary keys/dates (quote the comment at the self-healing step).
- Part 4: which inputs this engine needs that the demo stack may not have (HDFS paths, schema registry entries), what happens when the registry has no entry for a table, and any stage that is logged as a comment but not implemented (the code notes that `null_checks` tolerance learning is not implemented — confirm and cite).
- Worked example: one real run from the evidence file, reading off total, clean, quarantined, quality score, and showing the quality score recomputed by hand from those fields.

---

### Task 4: Section 03 — Semantic standardisation of category values

**Files:**
- Create: `docs/whitebox-report/03-semantic-standardization.md`
- Create: `docs/whitebox-report/evidence/03-standardizer-run.txt`

**Read:** `spark/spark_quality_engine.py:233-305` (rules loading, simple UDF), `:306-442` (`LocalSemanticStandardizer`), `:443-560` (`apply_optimized_semantic_standardize`), `:559-745` (semantic UDF, low-confidence policy), `:746-943` (learning memory).

**Evidence:** run the real class on a few values inside the Spark container. `standardize(value)` returns `(category, score)` (`spark/spark_quality_engine.py:390`):

```bash
cd /c/ETL
MSYS_NO_PATHCONV=1 docker compose exec -T spark-master python3 -c "
import sys; sys.path.insert(0, '/opt/spark-apps')
from spark_quality_engine import LocalSemanticStandardizer
cats = {'fresh milk': 'Dairy', 'whole wheat bread': 'Bakery', 'coca cola': 'Beverage'}
s = LocalSemanticStandardizer(cats, threshold=0.5, fallback='Other')
for v in ['fresh milk', 'Fresh Milk 1L', 'wheat bred', 'coke', 'laptop', None]:
    print(repr(v), '->', s.standardize(v))
" > docs/whitebox-report/evidence/03-standardizer-run.txt
cat docs/whitebox-report/evidence/03-standardizer-run.txt
```

Expected: six lines like `'fresh milk' -> ('Dairy', 1.0)`. Use the real threshold value the engine passes (find it in `apply_optimized_semantic_standardize`) in the section text; 0.5 here is only for the demonstration and must be labelled as such. If importing `spark_quality_engine` fails in `spark-master`, write "รันจริงไม่ได้เพราะ <error>" in the evidence file and do the worked example as a hand trace of `n_gram_cosine_similarity` / `hybrid_similarity` (`spark/spark_quality_engine.py:331-389`) instead.

**Required facts:**
- How categories and keywords are indexed (first token, word tokens of length ≥ 2, character bigrams) and how a value is scored against them; the exact scoring formula as coded.
- The threshold and what happens below it (`low_confidence_policy`: keep original vs map to fallback).
- Where the category rules come from (Elasticsearch schema registry `standardization_rules`, per table) — no hard-coded categories in the engine.
- The learning memory: what is stored, where, and whether it changes future matches.
- Part 4: this is string similarity, not a language model; name its failure cases visible in the evidence (e.g. abbreviations like "coke").

---

### Task 5: Section 04 — Adaptive thresholds, anomaly detection and drift

**Files:**
- Create: `docs/whitebox-report/04-adaptive-rules-and-drift.md`
- Create: `docs/whitebox-report/evidence/04-worked-math.txt`

**Read:** `spark/dynamic_rules_engine.py:112-203` (null profile), `:204-267` (IQR value ranges), `:268-360` (adaptive threshold), `:361-497` (apply), `:498-592` (flag outliers), `:593-678` (z-score anomalies); `spark/data_profile_store.py:166-289` (current profile), `:290-388` (EMA update), `:389-456` (PSI), `:457-512` (distribution drift), `:513-573` (null-rate drift), `:574-673` (profile cycle).

**Evidence:** these functions take Spark DataFrames, so reproduce the formulas in plain Python on a tiny example and save the output. Write a short script in `/tmp/ws04.py` that computes, for the list `[4, 5, 5, 6, 6, 7, 30]`: Q1, Q3, IQR, the 1.5×IQR fences, each value's z-score and which exceed 3.0; an EMA update of a stored mean with the smoothing factor used in `update_profiles_ema`; and PSI for two 4-bin distributions using the exact bin handling and epsilon in `compute_psi`. Use the same constants the code uses (read them first). Run it and save the output:

```bash
python /tmp/ws04.py > docs/whitebox-report/evidence/04-worked-math.txt
```

Paste the script itself at the top of the evidence file too, so the committee can re-run it.

**Required facts:**
- Adaptive threshold: which history it reads (index, number of runs), the formula it applies to the base value, and the fallback when there is too little history.
- IQR value ranges: multiplier and which columns.
- Z-score anomaly: formula, threshold 3.0 (confirm), what happens to flagged rows.
- EMA profile update: the formula and smoothing factor.
- PSI: formula, bins, epsilon, and the thresholds that decide "drift".
- Null-rate drift: how the current null rate is compared with the stored one.
- Part 4: what "adaptive" does not mean (no model is trained here), minimum history needed, and the `null_checks` tolerance learning that is noted as not implemented (cross-reference section 02).

---

### Task 6: Section 05 — Where AI is used, and where it is not

**Files:**
- Create: `docs/whitebox-report/05-ai-in-the-system.md`
- Create: `docs/whitebox-report/evidence/05-ai-context.json`

**Read:** `api/app/api/whitebox.py:1528-1640` (`_build_dynamic_context_fallback`), `:1641-1723` (`generate_ai_context_explanations`); `spark/ai_rule_advisor.py:96-322` (class, Groq call), `:323-400` (Ollama call), `:850-950` (decision tree rule induction around `dt.fit`), `:1143-1185` (`get_ai_advisor`); the rules endpoints that serve AI proposals (`grep -n "ai-proposals" api/app/api/*.py`).

**Evidence:**

```bash
cd /c/ETL
curl -s -b /tmp/c.txt "http://localhost/api/v1/whitebox/ai-context-explanations?force=true" > docs/whitebox-report/evidence/05-ai-context.json
```

(Log in first as in Task 2 if `/tmp/c.txt` is missing.)

**Required facts:**
- The three paths for text generation and which one runs today: Groq API (needs `GROQ_API_KEY`), local Ollama, and the rule-based template. Show from the evidence that `ai_live_generated` is `false` and `model` is `null` on this stack.
- What the language model is given (quote the prompt construction: only pre-computed numbers and rule settings) and what it returns (wording only). It does not decide which rows are bad.
- The decision tree in `ai_rule_advisor.py`: what features and label it trains on, what rules it outputs, and that a human approves proposals before they apply (cite the approve path).
- Part 4: the earlier bug where the summary used demo numbers because it read `live_metrics` instead of `metrics` (fixed in commit `3d55699`), and data sent to an external service when Groq is enabled (table/column names and counts, no rows).

---

### Task 7: Section 06 — Quality forecast and SLA breach probability

**Files:**
- Create: `docs/whitebox-report/06-quality-forecast.md`
- Create: `docs/whitebox-report/evidence/06-projection.json`, `06-history.json`, `06-recompute.txt`

**Read:** `api/app/api/analytics.py:460-600` (`get_quality_projection`); `ui/src/pages/Analytics.jsx:44-90` (how the page extends and scales the forecast).

**Evidence:**

```bash
cd /c/ETL
curl -s -b /tmp/c.txt http://localhost/api/v1/analytics/projection > docs/whitebox-report/evidence/06-projection.json
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '')
curl -s -u "elastic:$ES_PASS" "http://localhost:9200/sdoqap_quality_runs/_search?size=10&sort=timestamp:desc&_source=table_name,quality_score,timestamp" > docs/whitebox-report/evidence/06-history.json
```

Then write `/tmp/ws06.py` that takes the scores and timestamps of the latest table from `06-history.json` and recomputes, with the same formulas as the code, the slope, intercept, standard error, 7 projected scores, CI bounds, stability index and SLA breach probability. Save script + output to `06-recompute.txt` and compare with `06-projection.json` (they must match to 2 decimals; if not, find out why and write it down).

**Required facts:**
- Input: the last 10 runs of the most recent table; x = days since the first of those runs (index 0,1,2… if all timestamps are equal).
- Ordinary least squares: slope `m = (nΣxy − ΣxΣy)/(nΣx² − (Σx)²)`, intercept `c = (Σy − mΣx)/n`, and `m = −0.5` when the denominator is 0.
- Standard error `√(SSE/(n−2))`, floor 0.5 (variance fixed at 2.0 when n ≤ 2).
- Projection for days 1–7 clamped to [0, 100]; CI margin `se × (1 + 0.2×d)`.
- Stability index `clamp(100 − 4σ, 5, 100)`.
- SLA breach: 99.9% if the latest score is already below 95; otherwise the maximum over the 7 days of `0.5×(1 − erf(z/√2))` with `z = (projected − 95)/se`, clamped to [0.1, 99.9]. Crisis flag when a projection is below 90.
- Fewer than 2 runs → empty forecast and "N/A".
- Part 4, stated plainly: the API returns only 7 days; for 14 or 30 days the page (`ui/src/pages/Analytics.jsx:57-70`) invents days 8+ by adding `min(4.5, 0.18 × extra days)` to the last value, and uses 93.1 / 95.5 / 90.5 when there is no data. Those points are not a forecast. Also: the SLA threshold is fixed at 95 in the API even though the page lets the user type a different target.
- Name it correctly: linear regression, not machine learning.

---

### Task 8: Section 07 — Money lost to bad data (COPDQ)

**Files:**
- Create: `docs/whitebox-report/07-copdq-financial-impact.md`
- Create: `docs/whitebox-report/evidence/07-impact.json`, `07-aggregates.json`

**Read:** `api/app/api/analytics.py:673-770` (`get_business_impact`); the Spark COPDQ step (`grep -n "COPDQ" spark/spark_quality_engine.py`); `ui/src/utils/currency.js` (display rate).

**Evidence:**

```bash
cd /c/ETL
curl -s -b /tmp/c.txt http://localhost/api/v1/analytics/impact > docs/whitebox-report/evidence/07-impact.json
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '')
curl -s -u "elastic:$ES_PASS" -H "Content-Type: application/json" "http://localhost:9200/sdoqap_quality_runs/_search" -d '{"size":0,"aggs":{"q":{"sum":{"field":"quarantined_records"}},"t":{"sum":{"field":"total_records"}},"f":{"sum":{"field":"quarantined_financial_value"}}}}' > docs/whitebox-report/evidence/07-aggregates.json
curl -s -u "elastic:$ES_PASS" "http://localhost:9200/sdoqap_schema_drifts/_search?size=1" >> docs/whitebox-report/evidence/07-aggregates.json
```

Note: the API reads the first 100 run documents, not all of them; if the aggregate totals differ from what the API used, say so and explain the 100-document limit.

**Required facts:**
- The three parts and their formulas: correction = quarantined × 2 USD; lost opportunities = sum of `quarantined_financial_value` if above 0, otherwise quarantined × 0.05 × 50 USD; risk = quarantined × `drift_severity` if a schema drift document exists, otherwise × 1.
- How they are shown: "Sales Report Accuracy" gets lost opportunities; "Inventory Forecast Reliability" gets correction + risk; the percentages `error_rate × 0.8` and `drift_severity × error_rate × 0.3` (or `error_rate × 0.4`).
- The Spark-side financial COPDQ computed per run (what columns it uses).
- The Baht figure is a display conversion at a fixed 36.5 THB/USD (`ui/src/utils/currency.js`), not a Baht calculation, and why the constants stay in USD (their Gartner/IBM source is USD).
- Worked example: reproduce `07-impact.json`'s three parts and total from the evidence aggregates by hand.
- Part 4: these are assumptions, not the company's real costs; `drift_severity` comes from the first drift document found, not the table in question.

---

### Task 9: Section 08 — Multi-table relationship analysis and join

**Files:**
- Create: `docs/whitebox-report/08-multi-table-relationship.md`
- Create: `docs/whitebox-report/evidence/08-analyze.json`, `08-normalize.txt`

**Read:** `api/app/api/whitebox.py:891-918` (preview), `:919-1017` (analyze), `:1020-1100` (join); `_normalize_token` (`grep -n "def _normalize_token" api/app/api/whitebox.py`).

**Evidence:**

```bash
cd /c/ETL
curl -s -b /tmp/c.txt -X POST http://localhost/api/v1/whitebox/multi-table/analyze -H "Content-Type: application/json" -d '{}' > docs/whitebox-report/evidence/08-analyze.json
MSYS_NO_PATHCONV=1 docker compose exec -T -w /app api python -c "
from app.api.whitebox import _normalize_token
for s in ['studentId', 'student_id', 'Student ID', 'enrollmentDate', 'updated_at']:
    print(repr(s), '->', repr(_normalize_token(s)))
" > docs/whitebox-report/evidence/08-normalize.txt
```

If the analyze call returns 404 (source tables missing), keep that response as evidence and base the worked example on `08-normalize.txt` plus a hand calculation of key overlap and cardinality on a 5-row example you define in the section.

**Required facts — split explicitly into "คำนวณจริง" and "เป็นค่าตายตัว":**
- Computed: column-name matching by normalised token; key overlap rate = shared IDs ÷ unique IDs in the score table × 100; cardinality from uniqueness of each side (1:1, 1:N, N:M).
- Fixed: `confidence_pct` 96.0; the date format labels ("DD/MM/YYYY", "ISO-8601") are fixed strings, not detected; the table names, key column names (`studentId`, `student_id`) and date columns are hard-coded; `suggested_join_type` is always `left`; `confidence_verdict` is fixed text.
- The join step and the human confirmation gate (`human_confirmation_required`).
- Part 4: this works only for the two demo tables; it is not a general relationship discovery.

---

### Task 10: Section 09 — Schema drift and the Catalog approval flow

**Files:**
- Create: `docs/whitebox-report/09-schema-drift-and-catalog.md`
- Create: `docs/whitebox-report/evidence/09-proposals.json`

**Read:** `spark/spark_quality_engine.py` section "1. AUTO SCHEMA EVOLUTION & DRIFT CHECK" (find it with `grep -n "AUTO SCHEMA EVOLUTION" spark/spark_quality_engine.py`) and `:1445-1500` (`auto_evolve_schema_registry`); `api/app/api/schema.py:38-420` (list, approve, reject, approve-all, reject-all, create, simulate); `ui/src/pages/Schema.jsx` (what the Catalog page calls).

**Evidence:**

```bash
cd /c/ETL
curl -s -b /tmp/c.txt http://localhost/api/v1/schema/proposals > docs/whitebox-report/evidence/09-proposals.json
```

**Required facts:**
- How drift is detected: expected columns from the schema registry (Elasticsearch `sdoqap_schema_registry`, fallback `spark/schema_registry.json`) compared with the incoming columns → missing columns and new columns.
- Which drift is applied automatically (only new columns → `auto_evolve_schema_registry`) and which becomes a proposal for a human.
- What approve and reject each change (registry document, proposal status) — cite the lines.
- Where `drift_severity` comes from (it feeds section 07).
- Worked example: one proposal from the evidence, walked from detection to what approval would write.
- Part 4: anything the simulate endpoint fakes, and whether rows in the drifted run are held back until approval.

---

### Task 11: Section 10 — Error pattern grouping ("clustering")

**Files:**
- Create: `docs/whitebox-report/10-error-pattern-grouping.md`
- Create: `docs/whitebox-report/evidence/10-clustering.json`

**Read:** `api/app/api/analytics.py:599-672` (`get_diagnostic_clustering`); the chart in `ui/src/pages/Analytics.jsx` that renders it.

**Evidence:**

```bash
cd /c/ETL
curl -s -b /tmp/c.txt http://localhost/api/v1/analytics/clustering > docs/whitebox-report/evidence/10-clustering.json
```

**Required facts:**
- Input: up to 100 run documents with `quarantined_records > 0`.
- Method: each run's quarantine reason is put into a bucket by keyword rules (list every rule and the bucket name/"source" it maps to, e.g. drift words → "CSV File Ingestion" / "Schema Drift Mismatch"); counts and percentages per bucket.
- Say plainly: this is rule-based grouping, not a clustering algorithm (no k-means, no distance measure), even though the endpoint and page call it clustering.
- Worked example: one or two reasons from the evidence and the bucket each lands in.
- Part 4: reasons that match no rule land in "Unknown" — in the current data that bucket is the largest (read the share from the evidence).

---

### Task 12: Finish the index and check the whole report

**Files:**
- Modify: `docs/whitebox-report/00-index.md`

- [ ] **Step 1:** Fill the `สรุปหนึ่งบรรทัด` column of the table of contents from each section's part 1–2.
- [ ] **Step 2:** Collect every item from all sections' part 4 that is a bug, a fixed/fake value shown as real, or a misleading name, into `## ข้อสังเกตที่พบระหว่างเขียนรายงาน`, each with a link to its section.
- [ ] **Step 3:** Add `## อภิธานศัพท์` (glossary): IQR, Tukey fence, z-score, EMA, PSI, OLS linear regression, standard error, CI, SLA, COPDQ, schema drift, quarantine, Delta Lake MERGE, LLM — one line each in Thai.
- [ ] **Step 4:** Add `## สรุปสำหรับกรรมการ` at the top (after the purpose): at most 10 bullets — the two engines, what is statistical vs rule-based vs AI, and the most important limits.
- [ ] **Step 5:** Update `## อ้างอิงเวอร์ชันโค้ด` to the current `git rev-parse --short HEAD`.
- [ ] **Step 6:** Run the checks over the whole report:

```bash
cd /c/ETL
python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md
grep -rniE "sdoqap_secure|password|api_key|bearer|gsk_" docs/whitebox-report/ ; echo "secret-check exit=$?"
```

Expected: `OK (<n> citations)`; the grep prints nothing and `secret-check exit=1` (no matches).

- [ ] **Step 7:** Commit.

```bash
git add docs/whitebox-report
git commit -m "docs(whitebox-report): index summary, findings, glossary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
