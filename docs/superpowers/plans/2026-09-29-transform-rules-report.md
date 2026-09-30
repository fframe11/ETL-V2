# Transform Rules Report (BlackBox → WhiteBox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a Thai report for the team that answers the friend's two-part Transform brief, grounded in code and real engine runs:
- **Part 1:** explain the rules through four questions.
- **Part 2:** analyse which parts of Transform are black boxes and how to make them white boxes *without adding explanatory text to the web UI*.

**Architecture:** The report is a documentation-only deliverable in `docs/transform-report/`. It covers both rule sets:
- the three interactive rule cards at the top of Expectations & Alerts;
- the per-table Spark rules under advanced settings.

Every number comes from one of two sources:
- a script that runs the real interactive engine in-process inside the api container on `sample_data/student_scores_sample.csv`, without touching the live dataset or live state;
- saved API/Elasticsearch output for the Spark side.

Citations are checked by the existing `docs/whitebox-report/tools/check_citations.py`.

**Tech Stack:** Markdown (Thai prose, Mermaid diagrams), Python 3 + pandas (inside the `api` container), curl against the local API and Elasticsearch.

**Spec:** the friend's brief as relayed by the user on 2026-09-29, copied verbatim here because there is no separate spec file:

> Transform
> ส่วนที่ 1 อธิบายกฎ ต้องตอบ 4 ข้อ
> -ตั้งกฎไปทำไม แต่ละกฎกันปัญหาอะไร
> -ผู้ใช้นำข้อมูลเข้าแล้วตั้งค่ากฎ ค่านั้นถูกส่งไปไหน
> -ตัวเลขในกฎถูกเอาไปคำนวณยังไง ตัดสินว่าแถวไหนผ่านหรือไม่ผ่าน
> -หลังตรวจตามกฎแล้ว ข้อมูลไปต่อที่กระบวนการไหน
>
> ส่วนที่ 2 วิเคราะห์ Transform ว่าควรปรับอะไร และควรเน้นอะไร

The spec also carries two scope rulings from the friend:
- "Rules" means **both** the 3 cards (ช่วงคะแนน / ห้ามซ้ำ / ค่าผิดปกติ) **and** the per-table rules in advanced settings ("รวมเลย").
- Part 2 must find the black-box parts of every Transform-related page and propose white-box fixes that are **not** "เขียนอธิบายเพิ่มหรือเนื้อหาให้อ่านลงในเว็บ".

## Global Constraints

**Language and audience**
- Thai prose. Code, file paths, formulas, column/field/index names stay in English.
- Reader: a teammate who can program but does not know pandas, Spark, statistics or this codebase. Define each technical term once, in one plain sentence, the first time it appears.

**Citations and code excerpts**
- Every statement about behaviour cites code as `` `path:line` `` or `` `path:start-end` ``. Line numbers below were read on 2026-09-29 on branch `bell` with uncommitted changes. Re-check them when reading and cite what you actually see.
- Code excerpts:
  - must be verbatim consecutive source lines;
  - go in a fenced block whose first line is `# path:start-end` (Python) or `// path:start-end` (JSX);
  - are at most 30 source lines each;
  - use 3-backtick fences only.
- `PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/check_citations.py docs/transform-report/*.md` must print `OK` before the task ends.

**Numbers and evidence**
- Every specific number (row counts, fences, thresholds, percentages) must come from one of two places:
  - a file under `docs/transform-report/evidence/`;
  - a hand calculation shown line by line and labelled `คำนวณด้วยมือจากสูตรที่ path:line`.

**Honesty rule**
- Say plainly what is computed, what is a fixed constant or fixed text, what is a fallback, and which settings have no effect.
- Never call something AI unless it calls a model.

**No changes to the system**
- Documentation only: do not change files under `api/`, `spark/`, `ui/`, `docker-compose.yml`.
- Do not change live system state:
  - never `POST /api/v1/whitebox/state`;
  - never upload a file;
  - never `PUT /api/v1/rules/...`;
  - never approve or reject proposals;
  - never trigger a pipeline run.
  - Read-only GETs are fine.

**Secrets**
- No secrets in any file. Before finishing each task, this must print nothing:

  ```bash
  grep -rniE "sdoqap_secure|password[[:space:]]*=[[:space:]]*[\"']?[A-Za-z0-9_-]|api_key[[:space:]]*=[[:space:]]*[\"']?(gsk_|sk-)|bearer [a-z0-9]|gsk_|hooks.slack.com/services/[A-Z0-9]" docs/transform-report/
  ```

- Elasticsearch access: `ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')`, then `curl -s -u "elastic:$ES_PASS" http://localhost:9200/...`. Never write the password to a file.
- API access: log in with `curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}'` with `C` a cookie file in the scratchpad, then call `curl -s -b "$C" ...`. These are local test credentials.

**Environment (Windows Git Bash)**
- Prefix `docker compose cp/exec` with `MSYS_NO_PATHCONV=1`.
- Run Python with `PYTHONIOENCODING=utf-8`.

**Git**
- Branch `bell`. Stage files only by explicit path. Never `git add -A`, `git add .` or `git commit -a`.
- `spark/schema_registry.json` and `docs/BlackBox_to_WhiteBox_Report.md` must stay uncommitted.
- **Commit only if the user has said yes to committing in this session**; otherwise skip every "Commit" step and list the files in the final report.
- Never push. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Facts already verified (the tasks re-confirm them in the code)

**Interactive engine (3 cards)**
- `ui/src/pages/RulesConfig.jsx:130-150`: `syncWbState` posts every card value to `POST /api/v1/whitebox/state` on each change, and the inputs call it directly (`:645`, `:664`, `:677`, `:707`, `:723`, `:755`, `:774`).
  - The "บันทึกกฎ" button (`:612`) only re-sends the same values.
- `api/app/api/whitebox.py:1418-1440`: `update_workflow_state` stores the values in `_WORKFLOW_STATE`, persists them to `workflow_state.json` (`_save_workflow_state`), and recomputes.
  - `_recompute_interactive_state` (`:1248-1411`) re-reads the whole `dirty_dataset.csv` on every `GET`/`POST /state`.
- Check order in `_recompute_interactive_state`:
  - `row_edits` are applied first (`:1261-1272`).
  - Then duplicates (`:1291-1292`).
  - Then null / range, only on non-duplicate rows (`:1294-1298`).
  - Then the Tukey IQR fence (`:1300-1312`), only on rows that passed both.
  - `review_action` is applied next (`:1337-1344`); `row_decisions` override it (`:1346-1360`).
- Hidden or quiet behaviours in the interactive engine:
  - An unknown `composite_key` silently falls back to `student_id, course, semester` (`:1279-1281`).
  - `tukey_multiplier` values other than `3.0`/`1.5`/`custom` become 3.0 (`:1284`).
  - Q1 and Q3 are computed over **all** `study_hours`, including duplicate and invalid rows (`:1300-1303`).
  - There is a lower fence as well (`:1310`, `:1313`).
  - A non-custom run overwrites `custom_upper_fence` with the computed fence (`:1308-1309`).
  - `null_policy="adaptive_5"` sends nulls to Review only while `observed_null_pct <= max_null_pct`, measured over all rows (`:1294-1296`).
  - `dedup_strategy="review_all"` sends duplicates to Review (`:1319`).
- Outputs:
  - three CSVs in `OUTPUT_DIR` (`:1366-1371`), read by Jobs & Pipelines and Workspace Exports;
  - `quality_score_pct = clean / total` (`:1386`).
- Rule cards in the UI:
  - The cards show fixed rings `percent={95}` / `{99}` / `{99}` (`RulesConfig.jsx:631`, `:693`, `:741`).
  - The k selector hardcodes `12.0`/`9.0` fence labels (`:772`, `:778`).

**Spark per-table rules**
- The UI saves with `PUT /api/v1/rules/{table}` (`RulesConfig.jsx:537`). The API merges into `spark/rules_config.json` and syncs Elasticsearch `sdoqap_rules_registry` (`api/app/api/dynamic_rules.py:659-690`, `:106-157`).
- Loading the rules in Spark:
  - `load_rules_config` reads Elasticsearch **first** and falls back to the JSON file (`spark/spark_quality_engine.py:1501-1548`).
  - It merges `_default` with the table's section (`:1550-1563`).
- Adaptive quality threshold:
  - `apply_adaptive_rules(..., df=None)` (`:1711-1731`) means only `quality_score_threshold` adapts (`spark/dynamic_rules_engine.py:407-436`). The formula is `max(moving_avg − std_dev, min_value)` over the last `window` runs (`spark/dynamic_rules_engine.py:268-300`).
- `null_checks` has no effect:
  - the adaptive branch needs `df` (`dynamic_rules_engine.py:438-449`);
  - the engine comment says it is unimplemented (`spark_quality_engine.py:1717-1723`);
  - the UI still offers a selector for it (`RulesConfig.jsx:1037-1038`).
- `value_range` **is** active (`spark_quality_engine.py:2231-2263`): IQR on every numeric schema column, using `iqr_multiplier` (default 1.5).
- Hidden rule: `detect_unsupervised_anomalies(..., threshold=3.0)` also quarantines rows on every numeric column (`:2265-2283`), with no config key and no UI.
- `null_primary_key.enabled`, `duplicate_check.enabled`, `null_date_column.enabled` are never read by the engine; grep finds them only in generators and proposals. Checks always run:
  - PK null (`:2062-2072`);
  - null in every schema column (`:2074-2089`);
  - numeric type cast (`:2091-2110`);
  - missing date (`:2112-2121`);
  - dedup keeping the latest by date (`:2127-2137`, `:2227-2229`).
- What happens after the checks:
  - Quarantine appends to Delta partitioned by `run_id` (`:2346-2347`, `:2436`).
  - Clean rows are `MERGE`d into `/data/active/{table}` (`:2383-2405`).
  - `quality_score = clean / total × 100` (`:2566-2574`); below the threshold an n8n alert fires (`:2577-2582`).
  - Pipeline state is `success`/`warnings` (`:2850-2855`).
  - At or above the threshold, the Gold layer rebuild runs (`:2860-2870`).
- **Correction to the earlier chat answer:** the run document **does** store `effective_quality_threshold`, `effective_freshness_threshold`, `value_range_profile` and `quarantine_breakdown` (`:2815-2833`). The black box is that the UI never shows them, not that they are missing.
- `GET /api/v1/rules/{table}` returns merged config, not runtime values (`dynamic_rules.py:613-630`).

## File Structure

| File | Responsibility |
|---|---|
| `docs/transform-report/README.md` | Entry page: what the report answers, how to read it, one-screen summary of findings and priorities, reading order |
| `docs/transform-report/01-interactive-rules.md` | Part 1 for the 3 rule cards: the 4 questions, value-flow diagram, worked examples from evidence |
| `docs/transform-report/02-spark-table-rules.md` | Part 1 for the per-table Spark rules: the 4 questions, load/merge/adapt flow, check order, outputs |
| `docs/transform-report/03-transform-analysis.md` | Part 2: black-box inventory per page, non-text white-box fixes, what to improve, what to emphasise, priority list |
| `docs/transform-report/tools/capture_interactive.py` | Runs the real `_recompute_interactive_state` in-process on the sample CSV under fixed scenarios; prints JSON |
| `docs/transform-report/evidence/interactive-scenarios.json` | Output of the script |
| `docs/transform-report/evidence/spark-*.json` | Saved read-only API/ES responses for the Spark side |

---

### Task 1: Evidence capture for the interactive engine

**Files:**
- Create: `docs/transform-report/tools/capture_interactive.py`
- Create: `docs/transform-report/evidence/interactive-scenarios.json`

**Interfaces:**
- Consumes: `app.api.whitebox` module inside the api container (`DIRTY_DATASET_PATH`, `OUTPUT_DIR`, `_WORKFLOW_STATE`, `_recompute_interactive_state`).
- Produces: `interactive-scenarios.json`, a JSON object keyed by scenario name. Each value has:
  - `params` (the state overrides);
  - `metrics` (the subset listed in the script);
  - `rule_applied_counts` (dict of `whitebox_rule_applied` → count);
  - `examples` (first row per `whitebox_error_type`, with `dirty_row_id`, `score`, `study_hours`, `whitebox_status`, `whitebox_rule_applied`).
  - Tasks 2 and 4 quote these keys.

- [ ] **Step 1: Make sure the stack is up and the module imports**

Run:
```bash
cd /c/ETL && docker compose up -d api && MSYS_NO_PATHCONV=1 docker compose exec -T api python -c "import app.api.whitebox as w; print(w.DIRTY_DATASET_PATH, w.OUTPUT_DIR)"
```
Expected: two paths printed, no traceback. If the import path differs, find it with `docker compose exec -T api ls /app/app/api` and use the path you find in Step 2.

- [ ] **Step 2: Write the capture script**

```python
"""Run the real interactive rule engine on the sample CSV under fixed scenarios.

Runs inside the api container. It never touches the live dataset or the saved
workflow state: it points the module at a temp copy and restores the in-memory
state after each scenario.

Usage (from repo root, Git Bash):
  MSYS_NO_PATHCONV=1 docker compose cp sample_data/student_scores_sample.csv api:/tmp/tr_sample.csv
  MSYS_NO_PATHCONV=1 docker compose exec -T api python - < docs/transform-report/tools/capture_interactive.py
"""
import copy
import json
import os
import tempfile

import pandas as pd

import app.api.whitebox as wb

SAMPLE = "/tmp/tr_sample.csv"
METRIC_KEYS = [
    "total_rows", "clean_rows", "review_rows", "quarantine_rows", "quality_score_pct",
    "missing_score_count", "invalid_range_count", "duplicate_count", "initial_outlier_count",
    "gate1_quarantined", "gate2_quarantined", "upper_fence", "q1", "q3", "iqr",
]

SCENARIOS = {
    "S1_default": {},
    "S2_k_1_5": {"tukey_multiplier": "1.5"},
    "S3_min_score_40": {"min_score": 40.0},
    "S4_null_adaptive_5": {"null_policy": "adaptive_5", "max_null_pct": 5.0},
    "S5_null_adaptive_3": {"null_policy": "adaptive_5", "max_null_pct": 3.0},
    "S6_dedup_review_all": {"dedup_strategy": "review_all"},
    "S7_unknown_key_record_id": {"composite_key": "record_id"},
    "S8_custom_fence_12": {"tukey_multiplier": "custom", "custom_upper_fence": 12.0},
    "S9_rule3_off": {"rule3_confirmed": False},
}

BASE = {
    "min_score": 0.0, "max_score": 100.0, "null_policy": "strict_0", "max_null_pct": 5.0,
    "composite_key": "student_id + course + semester", "dedup_strategy": "keep_first_quarantine",
    "tukey_multiplier": "3.0", "custom_upper_fence": None,
    "rule1_confirmed": True, "rule2_confirmed": True, "rule3_confirmed": True,
    "selected_findings": ["score_range_null", "composite_key_dup", "study_hours_outlier"],
    "review_action": "KEEP", "row_decisions": {}, "row_edits": {},
}


def main():
    tmp_dir = tempfile.mkdtemp(prefix="tr_")
    df = pd.read_csv(SAMPLE)
    df.insert(0, "dirty_row_id", range(1, len(df) + 1))
    dirty = os.path.join(tmp_dir, "dirty.csv")
    df.to_csv(dirty, index=False)

    saved_state = copy.deepcopy(wb._WORKFLOW_STATE)
    saved_paths = (wb.DIRTY_DATASET_PATH, wb.OUTPUT_DIR)
    wb.DIRTY_DATASET_PATH, wb.OUTPUT_DIR = dirty, tmp_dir
    out = {}
    try:
        for name, overrides in SCENARIOS.items():
            wb._WORKFLOW_STATE.clear()
            wb._WORKFLOW_STATE.update(copy.deepcopy(saved_state))
            wb._WORKFLOW_STATE.update(copy.deepcopy(BASE))
            wb._WORKFLOW_STATE.update(overrides)
            result = wb._recompute_interactive_state()
            frames = [pd.read_csv(os.path.join(tmp_dir, f)) for f in
                      ("clean_dataset_run.csv", "review_queue_run.csv", "quarantine_lake_run.csv")]
            rows = pd.concat(frames, ignore_index=True)
            examples = (rows[rows["whitebox_error_type"] != "None"]
                        .groupby("whitebox_error_type").head(1)
                        [["dirty_row_id", "score", "study_hours", "whitebox_status",
                          "whitebox_error_type", "whitebox_rule_applied"]])
            out[name] = {
                "params": overrides,
                "metrics": {k: result["metrics"][k] for k in METRIC_KEYS},
                "rule_applied_counts": rows["whitebox_rule_applied"].value_counts().to_dict(),
                "examples": json.loads(examples.to_json(orient="records")),
            }
    finally:
        wb.DIRTY_DATASET_PATH, wb.OUTPUT_DIR = saved_paths
        wb._WORKFLOW_STATE.clear()
        wb._WORKFLOW_STATE.update(saved_state)
    print(json.dumps(out, ensure_ascii=False, indent=2, default=str))


main()
```

Note: if `sample_data/student_scores_sample.csv` already has a `dirty_row_id` column, drop the `df.insert` line. Check with `head -1 sample_data/student_scores_sample.csv`; the header is `student_id,course,semester,score,study_hours,updated_at`, so the insert is needed.

- [ ] **Step 3: Run it and save the output**

```bash
cd /c/ETL && MSYS_NO_PATHCONV=1 docker compose cp sample_data/student_scores_sample.csv api:/tmp/tr_sample.csv && MSYS_NO_PATHCONV=1 docker compose exec -T api python - < docs/transform-report/tools/capture_interactive.py > docs/transform-report/evidence/interactive-scenarios.json && head -40 docs/transform-report/evidence/interactive-scenarios.json
```

Expected `S1_default.metrics` values, all matching `sample_data/README.md`:

| Field | Value |
|---|---|
| `total_rows` | 1030 |
| `clean_rows` | 915 |
| `review_rows` | 20 |
| `quarantine_rows` | 95 |
| `upper_fence` | 23.0 |

Expected for `S2_k_1_5`: `upper_fence: 15.5`.

If S1 differs, stop and report. Do not tune the script to hit the numbers.

- [ ] **Step 4: Prove the live state was not touched**

```bash
cd /c/ETL && C=$(mktemp) && curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' >/dev/null && curl -s -b "$C" http://localhost/api/v1/whitebox/state | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('dataset_name'), d['metrics']['total_rows'])"
```
Expected: the same dataset name and row count as before Step 3. Run this command once before Step 3 as well and compare the two outputs.

- [ ] **Step 5: Secret check, then commit (only if commits are approved)**

```bash
git add docs/transform-report/tools/capture_interactive.py docs/transform-report/evidence/interactive-scenarios.json
git commit -m "docs(transform-report): capture interactive rule scenarios from the real engine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Part 1 — the three rule cards (`01-interactive-rules.md`)

**Files:**
- Create: `docs/transform-report/01-interactive-rules.md`
- Read: `ui/src/pages/RulesConfig.jsx:100-200`, `:600-800`; `api/app/api/whitebox.py:1175-1200`, `:1248-1450`; `ui/src/pages/Pipeline.jsx:260-300`; `ui/src/pages/DataExport.jsx` (the download section)

**Interfaces:**
- Consumes: `docs/transform-report/evidence/interactive-scenarios.json` (scenario keys S1–S9 from Task 1).
- Produces: section anchors `#q1`, `#q2`, `#q3`, `#q4` in this file. Task 4 links them as `01-interactive-rules.md#q2` etc.

- [ ] **Step 1: Re-confirm every fact in "Facts already verified → Interactive engine"**

For each bullet, open the cited lines. If the code says something else, write what the code says and add a line to a "ข้อที่ต่างจากที่คาด" list at the end of the chapter.

- [ ] **Step 2: Write the chapter with exactly these headings**

```markdown
# ส่วนที่ 1A: กฎ 3 การ์ดบนหน้า Expectations & Alerts
## ภาพรวมใน 5 บรรทัด
## <a id="q1"></a>ข้อ 1: ตั้งกฎไปทำไม แต่ละกฎกันปัญหาอะไร
## <a id="q2"></a>ข้อ 2: ตั้งค่าแล้ว ค่าถูกส่งไปไหน
## <a id="q3"></a>ข้อ 3: ตัวเลขในกฎถูกเอาไปคำนวณยังไง
## <a id="q4"></a>ข้อ 4: หลังตรวจแล้ว ข้อมูลไปต่อที่ไหน
## ข้อที่ต่างจากที่คาด
```

Required content per heading:

**Q1.** A table with one row per card: card, problem it prevents, what goes wrong downstream if it is off. Use concrete sample rows from `S1_default.examples`. Also cover the two hidden options the engine supports but the cards do not expose:
- `null_policy="adaptive_5"`;
- `dedup_strategy="review_all"`.

**Q2.** A Mermaid `flowchart LR` of the path: input on card → `syncWbState` → `POST /api/v1/whitebox/state` → `_WORKFLOW_STATE` → `workflow_state.json` → `_recompute_interactive_state` → 3 CSVs → Jobs & Pipelines / Workspace Exports. Then:
- one verbatim excerpt of `RulesConfig.jsx` `syncWbState`;
- one of `update_workflow_state`, each with a short line-by-line table;
- a statement that the value takes effect immediately on every change, and that "บันทึกกฎ" only re-sends.

**Q3.** For each check, in real order (row_edits → duplicates → null/range → IQR → review_action → row_decisions), give:
- the formula;
- the verbatim excerpt (≤30 lines per block);
- a worked example with numbers from the evidence.

Required worked examples:
- **IQR, S1 vs S2:** Q1, Q3, IQR, fence for k=3.0 and k=1.5, and how many rows move. Show the fence arithmetic by hand, labelled with the formula line.
- **Range:** S3, `min_score=40`, compared with S1.
- **Nulls:** S4 vs S5. The observed null % is 40/1030; show the hand calculation and why 5 % keeps nulls in Review while 3 % quarantines them.
- **Duplicates:** S6 shows duplicates moving to Review.
- **Unknown key:** S7 shows the silent fallback, with counts identical to S1.
- **Custom fence:** S8, 12.0h.
- **Rule 3 off:** S9 shows the outlier rows staying Clean.
- **Label vs reality:** a note that the UI label `> 12.0h` is fixed text (`RulesConfig.jsx:778`) while the real fence for this data is 23.0h (S1).

**Q4.** A table covering the three statuses:
- Valid → `clean_dataset_run.csv`;
- Review → `review_queue_run.csv`;
- Quarantine → `quarantine_lake_run.csv`.

Then cover:
- which pages read each file;
- how review actions and per-row decisions move rows afterwards, with the precedence order;
- `quality_score_pct = clean / total` with S1 numbers (915/1030);
- a plain statement that the interactive engine only classifies and tags rows; it does not change values, except `row_edits` typed by a reviewer.

- [ ] **Step 3: Run the checks**

```bash
cd /c/ETL && PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/check_citations.py docs/transform-report/*.md
```
Expected: `OK`. Then run the secret check from Global Constraints (expected: no output).

- [ ] **Step 4: Tick the list**

Confirm every Q1–Q4 required item above appears, and that every number in the chapter is in `interactive-scenarios.json` or in a labelled hand calculation.

- [ ] **Step 5: Commit (only if commits are approved)**

```bash
git add docs/transform-report/01-interactive-rules.md
git commit -m "docs(transform-report): explain the three interactive rule cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Part 1 — per-table Spark rules (`02-spark-table-rules.md`)

**Files:**
- Create: `docs/transform-report/02-spark-table-rules.md`
- Create: `docs/transform-report/evidence/spark-rules-<table>.json`, `docs/transform-report/evidence/spark-quality-runs-<table>.json`, `docs/transform-report/evidence/spark-adaptive-threshold-worked.txt`
- Read:
  - `spark/rules_config.json`;
  - `spark/spark_quality_engine.py:1501-1577`, `:1684-1740`, `:2030-2440`, `:2566-2640`, `:2760-2870`;
  - `spark/dynamic_rules_engine.py:204-460`, `:498-680`;
  - `api/app/api/dynamic_rules.py:100-180`, `:613-690`;
  - `ui/src/pages/RulesConfig.jsx:455-560`, `:930-1090`.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - section anchors `#q1`–`#q4`;
  - a subsection `### ตั้งค่าไหนมีผลจริง` with a table whose rows are the config keys. Task 4 links to it as `02-spark-table-rules.md#ตั้งค่าไหนมีผลจริง`.

- [ ] **Step 1: Pick the table and save evidence (read-only)**

```bash
cd /c/ETL && ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r') && curl -s -u "elastic:$ES_PASS" "http://localhost:9200/sdoqap_quality_runs/_search" -H "Content-Type: application/json" -d '{"size":0,"aggs":{"t":{"terms":{"field":"table_name.keyword","size":20}}}}'
```
Pick the table with the most runs; call it `<table>`. If `table_name.keyword` does not exist, use `"field":"table_name"`.

Then save the rules and the run history:

```bash
cd /c/ETL && T=<table> && C=$(mktemp) && curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' >/dev/null && curl -s -b "$C" "http://localhost/api/v1/rules/$T" > docs/transform-report/evidence/spark-rules-$T.json && ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r') && curl -s -u "elastic:$ES_PASS" "http://localhost:9200/sdoqap_quality_runs/_search" -H "Content-Type: application/json" -d "{\"size\":16,\"sort\":[{\"timestamp\":\"desc\"}],\"query\":{\"match\":{\"table_name\":\"$T\"}},\"_source\":[\"run_id\",\"timestamp\",\"quality_score\",\"effective_quality_threshold\",\"effective_freshness_threshold\",\"rules_mode\",\"quarantine_breakdown\",\"value_range_profile\",\"clean_records\",\"quarantined_records\",\"total_records\",\"z_score\",\"is_anomaly\"]}" > docs/transform-report/evidence/spark-quality-runs-$T.json
```

Expected: both files are non-empty JSON, and the newest hit has `effective_quality_threshold`.

- [ ] **Step 2: Reproduce the adaptive threshold by hand**

Read `compute_adaptive_threshold` in full (`spark/dynamic_rules_engine.py:268-360`) to learn:
- which runs it uses (sort order, window, whether it includes the current run);
- population vs sample std;
- fallbacks.

Using the saved run history, compute `max(mean − std, min_value)` line by line for the newest run, with the same window and std convention as the code. Write the arithmetic to `docs/transform-report/evidence/spark-adaptive-threshold-worked.txt`, then compare it with that run's `effective_quality_threshold`.

If the numbers differ, record both values and the reason you find (for example, the run history at the time of that run was different). Do not force a match.

Also note whether the adaptive value can exceed `base_value`, since the code takes no `min(…, base)`.

- [ ] **Step 3: Confirm the "which settings take effect" facts**

```bash
cd /c/ETL && grep -rnE "null_primary_key|duplicate_check|null_date_column|freshness_threshold_hours|null_checks|value_range|ai_advisor|auto_clean|column_weights|induced" spark/spark_quality_engine.py spark/dynamic_rules_engine.py
```

Build the table for `### ตั้งค่าไหนมีผลจริง`. Columns:

| key | UI มีช่องไหม (cite) | engine อ่านไหม (cite) | ผลจริง |
|---|---|---|---|

Rows at minimum:
- `quality_score_threshold.mode/base_value/min_value/adjustment_window_runs`
- `null_checks.mode/default_tolerance`
- `value_range.mode/iqr_multiplier/column_overrides`
- `null_primary_key.enabled`
- `duplicate_check.enabled`
- `null_date_column.enabled`
- `freshness_threshold_hours`
- `ai_advisor.enabled/model/trigger`
- `auto_clean`

Add a separate row for the Z-score 3.0 anomaly check, which has no key at all.

`value_range.column_overrides` needs special care. Verify whether `compute_value_range_rules` or its caller reads `column_overrides` (grep it). If nothing reads it, state that the `bank_data_csv.age` override in `rules_config.json` has no effect.

- [ ] **Step 4: Write the chapter with exactly these headings**

```markdown
# ส่วนที่ 1B: กฎรายตาราง (Spark) ในตั้งค่าขั้นสูง
## ภาพรวมใน 5 บรรทัด
## <a id="q1"></a>ข้อ 1: ตั้งกฎไปทำไม แต่ละกฎกันปัญหาอะไร
## <a id="q2"></a>ข้อ 2: ตั้งค่าแล้ว ค่าถูกส่งไปไหน
## <a id="q3"></a>ข้อ 3: ตัวเลขในกฎถูกเอาไปคำนวณยังไง
### ตั้งค่าไหนมีผลจริง
## <a id="q4"></a>ข้อ 4: หลังตรวจแล้ว ข้อมูลไปต่อที่ไหน
## เทียบกับกฎ 3 การ์ด
## ข้อที่ต่างจากที่คาด
```

Required content per heading:

**Q1.** One row per check the engine really runs:
- PK null;
- null in schema columns;
- numeric type cast;
- missing date;
- duplicates;
- IQR value range;
- Z-score anomaly;
- induced rules (only if present in config);
- quality threshold / alert.

For each, give the problem it prevents and the `reject_reason` it writes. Use real reason strings from `quarantine_breakdown` in the evidence.

**Q2.** A Mermaid flowchart covering:
- UI `PUT /api/v1/rules/{table}` → `_save_rules_config`, which writes the JSON, keeps backups and syncs ES;
- the next Spark run → `load_rules_config` (ES first, JSON fallback) → `_merge_configs_dict(_default, table)` → `apply_adaptive_rules` → `resolve_rule_value`.

State plainly:
- changes apply only on the next run, not to data already processed;
- `GET /rules/{table}` shows config, not the values a run actually used.

**Q3.** For each check in execution order, give the verbatim excerpt (≤30 lines per block), the formula, and worked numbers:
- **Adaptive threshold:** from `spark-adaptive-threshold-worked.txt`.
- **IQR:** from one column of `value_range_profile` in the newest run. Show `Q1`, `Q3`, `IQR`, `multiplier` → bounds by hand.
- **Quality score:** `clean / total × 100` from the newest run.

Then the `### ตั้งค่าไหนมีผลจริง` table.

**Q4.** Cover:
- Quarantine → Delta append partitioned by `run_id`;
- Clean → Delta `MERGE` into `/data/active/<table>`, so the active layer is merged state, not "this run";
- the ES documents written (`sdoqap_quality_runs`, `sdoqap_lineage_runs`, `sdoqap_pipeline_runs`);
- score vs threshold → n8n alert, `success`/`warnings`, Gold layer rebuild when at or above the threshold;
- the AI advisor trigger condition (`trigger == "always"` or anomaly or score < threshold − 15 or drift);
- how Jobs & Pipelines "ดูข้อมูล" reads active/quarantine (`api/app/api/data_export.py`, the `/records/{layer}/{table_name}` endpoint).

**เทียบกับกฎ 3 การ์ด.** A side-by-side table of the two engines:
- data source;
- when rules apply;
- check order;
- outlier method and k;
- whether rows go to Review or only Quarantine;
- where outputs go.

- [ ] **Step 5: Run the checks**

Run the citation check (expected `OK`) and the secret check (expected: no output).

- [ ] **Step 6: Commit (only if commits are approved)**

```bash
git add docs/transform-report/02-spark-table-rules.md docs/transform-report/evidence/spark-rules-*.json docs/transform-report/evidence/spark-quality-runs-*.json docs/transform-report/evidence/spark-adaptive-threshold-worked.txt
git commit -m "docs(transform-report): explain per-table Spark rules end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Part 2 — Transform analysis (`03-transform-analysis.md`)

**Files:**
- Create: `docs/transform-report/03-transform-analysis.md`
- Read:
  - `01-interactive-rules.md` and `02-spark-table-rules.md` (Tasks 2–3);
  - `ui/src/pages/Ingestion.jsx`, `ui/src/pages/RulesConfig.jsx`, `ui/src/pages/Pipeline.jsx`, `ui/src/pages/DataExport.jsx`;
  - `ui/src/components/RunRecordsPanel.jsx`.

**Interfaces:**
- Consumes:
  - anchors `01-interactive-rules.md#q1..#q4`;
  - `02-spark-table-rules.md#q1..#q4`;
  - `02-spark-table-rules.md#ตั้งค่าไหนมีผลจริง`;
  - evidence scenario keys S1–S9.
- Produces: finding IDs `BB-01` … `BB-nn`, used by the README in Task 5.

- [ ] **Step 1: Build the black-box inventory**

A spot counts as a black box when a user who changes an input or reads an output **cannot see, from the system itself**, what the system did. For each Transform page (Data Ingestion, Expectations & Alerts: cards, Expectations & Alerts: per-table rules, Jobs & Pipelines, Workspace Exports), list findings with these fields:

| ID | หน้า | จุด | หลักฐาน (cite / evidence key) | ทำไมเป็น black box | วิธีทำให้เป็น white box (ไม่ใช่ข้อความ) | ประเภท A–F | ขนาดงาน S/M/L | ไฟล์ที่ต้องแก้ |
|---|---|---|---|---|---|---|---|---|

Method types, the same six as the earlier chat answer:
- **A:** show the computation visually.
- **B:** show the evidence rows.
- **C:** preview the impact before applying.
- **D:** structured per-row trace.
- **E:** echo the parameters actually used (run manifest).
- **F:** remove or disable fake or ineffective controls, or compute the real value.

Every finding must cite code or evidence.

The findings must include at least the items below. Confirm each one in code; drop any that turn out false and list it under "ข้อที่ตรวจแล้วไม่จริง".

*Data Ingestion*
- The column-requirement check is silent: rules need `score`/`study_hours`, and a file without them is only profiled. Find the exact branch in `upload_csv_dataset` / `_recompute_interactive_state`.
- The outlier card uses a fixed 1.5×IQR while the rules use 3.0 by default.
- Uploading replaces the dataset with no history.

*Rule cards*
- The value applies on each keystroke, and "บันทึกกฎ" only re-sends (`RulesConfig.jsx:612`).
- The fixed rings 95/99/99 (`:631`, `:693`, `:741`).
- The fixed fence label `> 12.0h` vs a real 23.0h (S1).
- Card order 1→2→3 vs real order duplicates → null/range → IQR.
- The lower fence is invisible.
- There is no path from a count to the rows it caught.
- An unknown key silently falls back (S7).
- Hidden supported options (`adaptive_5`, `review_all`).
- Q1/Q3 are computed over all rows, including rows already rejected.

*Per-table rules*
- The effective adaptive threshold is stored per run but never shown. This is a correction to the earlier chat claim; say so.
- The `null_checks` selector has no effect.
- The `*.enabled` flags are not read.
- The Z-score 3.0 rule has no control.
- `GET /rules` shows config, not runtime values.
- The AI advisor fallback (model call vs rule-based) is not visible per run. Confirm in `spark/ai_rule_advisor.py` what happens without an API key.

*Jobs & Pipelines*
- `whitebox_rule_applied` / `reject_reason` are one flat string without the offending value.
- `row_decisions` overriding `review_action` is not marked.
- "รัน Pipeline" on the interactive side just recomputes the same result.
- The funnel labels "Gate 1 / Gate 2" (`Pipeline.jsx:279-280`) do not match the real order.
- Spark `quarantine_breakdown` exists but is not shown per run on this page. Check `Dashboard.jsx:1627` for where it is shown today.

*Workspace Exports*
- The exported CSVs carry no rules version or parameters, and are regenerated on every rule change.

- [ ] **Step 2: Check the "no explanatory text" constraint**

Re-read every "วิธีทำให้เป็น white box" cell. Rewrite any cell that proposes a tooltip, info icon, help paragraph, banner, or guide page as a mechanism: a chart, a preview, a drill-down, a structured column, a stored manifest, or a removed or disabled control.

Add one short paragraph noting that the `?`/InfoHint and banners added earlier in this session are text, and so do not count toward this goal. The team decides whether to keep them.

- [ ] **Step 3: Write the chapter with exactly these headings**

```markdown
# ส่วนที่ 2: วิเคราะห์ Transform — ควรปรับอะไร ควรเน้นอะไร
## นิยาม black box / white box ที่ใช้ในรายงานนี้
## 6 วิธีทำ white box โดยไม่เพิ่มข้อความ
## จุด black box แยกตามหน้า
### Data Ingestion
### Expectations & Alerts: กฎ 3 การ์ด
### Expectations & Alerts: กฎรายตาราง (Spark)
### Jobs & Pipelines
### Workspace Exports
## ควรปรับอะไร (เรียงตามลำดับความสำคัญ)
## ควรเน้นอะไร
## ข้อที่ตรวจแล้วไม่จริง
## แก้ไขจากคำตอบในแชทก่อนหน้า
```

Required content:

**"ควรปรับอะไร".** A ranked list of 5–8 items. Each item gives:
- the BB IDs it closes;
- why it ranks there (how many BB items it closes, and how directly it answers the friend's Q2/Q3);
- size;
- the files it would touch.

The expected top of the list, which the executor may reorder only with a written reason:
1. A run manifest for both engines: store and show the effective parameters per run. The Spark side already stores most of them, so it is mainly UI work.
2. A live `study_hours` histogram with Q1/Q3/fences that moves with k and shows counts.
3. A draft → impact → apply flow with a rule version number.
4. Per-row structured reasons (rule / column / value / operator / threshold) plus click-a-count-to-see-rows.
5. Removing fake or ineffective controls and numbers: the rings, the fixed fence labels, `null_checks`, the `*.enabled` flags. Alternatively, make them real.

**"ควรเน้นอะไร".** Three to five points on what the team should stress when presenting Transform:
- traceability from a rule value to a row;
- the same numbers everywhere;
- no control without effect;
- two engines with different behaviour, each shown honestly.

**"แก้ไขจากคำตอบในแชทก่อนหน้า".** List the two corrections:
- the effective threshold is stored, not missing;
- `value_range` is active and only `null_checks` is dead.

Add any further ones found.

- [ ] **Step 4: Run the checks**

Run the citation check (expected `OK`) and the secret check (expected: no output). Also confirm every BB row has a citation or evidence key and a non-text fix.

- [ ] **Step 5: Commit (only if commits are approved)**

```bash
git add docs/transform-report/03-transform-analysis.md
git commit -m "docs(transform-report): analyse Transform black boxes and non-text white-box fixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: README and final pass

**Files:**
- Create: `docs/transform-report/README.md`

**Interfaces:**
- Consumes: all three chapters, BB IDs, and anchors.
- Produces: the entry page the user sends to the friend.

- [ ] **Step 1: Write the README with exactly these headings**

```markdown
# รายงาน Transform: กฎทำงานยังไง และทำให้เป็น White Box
## งานนี้ตอบอะไร
## อ่านตรงไหนก่อน
## คำตอบสั้น 4 ข้อ (ส่วนที่ 1)
## สรุปส่วนที่ 2 ใน 1 หน้าจอ
## ข้อมูลที่ใช้ทดสอบ
## วิธีรันหลักฐานซ้ำ
```

Required content per heading:

**งานนี้ตอบอะไร.** Quote the friend's brief (the Spec block above) and the scope ruling "รวมเลย".

**อ่านตรงไหนก่อน.** Links to the three chapters, with one line each.

**คำตอบสั้น 4 ข้อ.** For each question, two short lines (cards, then Spark), each linking to the chapter anchor.

**สรุปส่วนที่ 2.** The ranked "ควรปรับอะไร" list, one line per item with its BB IDs, plus the "ควรเน้นอะไร" bullets.

**ข้อมูลที่ใช้ทดสอบ.** `sample_data/student_scores_sample.csv` (1,030 rows, expected 915 / 20 / 95), and the Spark table picked in Task 3.

**วิธีรันหลักฐานซ้ำ.** The exact commands from Task 1 Step 3 and Task 3 Step 1.

- [ ] **Step 2: Final checks**

```bash
cd /c/ETL && PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/check_citations.py docs/transform-report/*.md
```
Expected: `OK`.

Then:
- Run the secret check (expected: no output).
- Run `git status --short` and confirm only `docs/transform-report/**` (and this plan) are new or changed by this work. Nothing under `api/`, `spark/`, `ui/` should have changed.

- [ ] **Step 3: Commit (only if commits are approved)**

```bash
git add docs/transform-report/README.md docs/superpowers/plans/2026-09-29-transform-rules-report.md
git commit -m "docs(transform-report): add entry page and summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

**Spec coverage**
- Part 1 Q1–Q4 × both rule sets are covered: Task 2 (cards) and Task 3 (Spark), each with `#q1`–`#q4`.
- Part 2 "what to improve / what to emphasise" is covered by Task 4's "ควรปรับอะไร" and "ควรเน้นอะไร".
- The friend's added requirement (black-box spots per Transform page, fixed without adding text) is covered by the Task 4 inventory, with the Step 2 constraint check.
- Scope "รวมเลย" is covered by Tasks 2 and 3 plus the comparison table.

**Consistency**
- Scenario keys S1–S9 are defined in Task 1 and used in Tasks 2 and 4.
- Anchors `#q1`–`#q4` and `#ตั้งค่าไหนมีผลจริง` are defined in Tasks 2 and 3 and consumed in Tasks 4 and 5.
- Finding IDs `BB-nn` are defined in Task 4 and consumed in Task 5.
