# Deep White-Box Report of SDOQAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the white-box report into a study guide deep enough that the project owner can read it, understand how every part of SDOQAP really works, and answer the committee's questions — including hard questions about weaknesses — without looking at the code.

**Architecture:** Same folder `docs/whitebox-report/`, one Markdown chapter per part of the system. Every chapter follows a new 8-part template that adds a 30-second spoken answer, annotated code walkthroughs (verbatim excerpts, checked by script), design rationale, and a graded question bank. Adds chapters for the parts the first plan skipped (system architecture, ingestion and job triggering, Gold layer and lineage, auto-remediation and alerts, login and security), an end-to-end trace of real rows, and a consolidated question bank.

**Tech Stack:** Markdown + Mermaid; Python 3 for the checker; the running Docker stack (`api`, `elasticsearch`, `spark-master`, `namenode`) for evidence.

**Spec:** The user's request (Thai): "จากรายงานขอรายละเอียดกว่านี้ได้มั้ย อยากได้เพื่ออ่านทำความเข้าใจในระบบจริงๆ เพื่อให้สามารถตอบคำถามกรรมการได้" — more detail, to truly understand the system and answer the committee. This plan supersedes Tasks 4–12 of `docs/superpowers/plans/2026-09-26-whitebox-report.md`; that plan's Tasks 1–3 are done (commits `d5d4fb6`, `b500d7f`) and are upgraded here.

## Global Constraints

- Language: Thai prose. Code, file paths, formulas, column and index names stay in English.
- Reader: someone who can program but does not know Spark, statistics or this codebase. Define every technical term the first time a chapter uses it (one sentence, plain words; an everyday comparison is welcome).
- Every chapter follows `docs/whitebox-report/TEMPLATE.md` (Task 1) with its eight headings exactly as written there.
- Every statement about behaviour cites the code as `` `path:line` `` or `` `path:start-end` ``.
- Every code excerpt is a verbatim copy of consecutive source lines, in a fenced block whose first line is `# path:start-end` (Python/YAML) or `// path:start-end` (JS/JSX). At most 30 source lines per excerpt.
- `python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md` must print `OK` before every commit (it checks both citations and excerpts after Task 1).
- Every number in a worked example comes from running the real system or function (raw output saved in `docs/whitebox-report/evidence/`), or from a hand calculation shown line by line and labelled "คำนวณด้วยมือจากสูตรที่ `path:line`".
- Honesty rule: say plainly what is computed, what is a fixed constant or fixed text, what is a fallback, and what is not what its name suggests. Never call something AI or machine learning unless it runs a model.
- Documentation only: do not change system code. Bugs found go in the chapter's part 7 and the README findings list.
- No secrets in any committed file. Before each commit: `grep -rniE "sdoqap_secure|password=|api_key|bearer [a-z0-9]|gsk_|hooks.slack.com/services/[A-Z0-9]" docs/whitebox-report/` must print nothing. Replace any value with `***`.
- Elasticsearch access: `ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')`, then `curl -u "elastic:$ES_PASS" http://localhost:9200/...`. Never write the password to a file.
- API access: `curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}'` with `C` a cookie file in a temp directory; then `curl -s -b "$C" ...`. Local test credentials only.
- Windows Git Bash: prefix `docker compose cp/exec` with `MSYS_NO_PATHCONV=1`; run Python with `PYTHONIOENCODING=utf-8`.
- Branch `bell`. Commit after every task. Do not push. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers below were taken at commit `b500d7f`. Re-check them when reading; cite what you actually see.

## File map

| File | Status | Responsibility |
|---|---|---|
| `docs/whitebox-report/TEMPLATE.md` | new | The 8-part chapter template and writing rules |
| `docs/whitebox-report/tools/check_citations.py` | modify | Also verify code excerpts are verbatim |
| `docs/whitebox-report/tools/test_check_citations.py` | new | Tests for the checker |
| `docs/whitebox-report/README.md` | new | Index: how to read, reading order, 1-page summary, findings, glossary |
| `docs/whitebox-report/00-system-overview.md` | new | Services, data stores, data flow, which page reads what |
| `docs/whitebox-report/01-interactive-quality-gates.md` | upgrade | Existing chapter → 8-part template |
| `docs/whitebox-report/02-spark-batch-quality-engine.md` | upgrade | Existing chapter → 8-part template |
| `docs/whitebox-report/03-…` to `10-…` | new | The remaining algorithm chapters (names in Tasks 5–12) |
| `docs/whitebox-report/11-ingestion-and-job-triggering.md` | new | CSV/API/RDBMS/Kafka intake → HDFS → trigger daemon → Spark |
| `docs/whitebox-report/12-gold-layer-and-lineage.md` | new | Gold summary tables and lineage/trust check |
| `docs/whitebox-report/13-auto-remediation-and-alerts.md` | new | Automatic re-fix of quarantined data, alert routing |
| `docs/whitebox-report/14-authentication-and-security.md` | new | Login, session tokens, service key, input guards, known gaps |
| `docs/whitebox-report/15-end-to-end-trace.md` | new | Real rows followed through both engines |
| `docs/whitebox-report/16-committee-question-bank.md` | new | All questions in one place, by theme and difficulty |

---

### Task 1: Chapter template and excerpt checking

**Files:**
- Create: `docs/whitebox-report/TEMPLATE.md`
- Modify: `docs/whitebox-report/tools/check_citations.py`
- Create: `docs/whitebox-report/tools/test_check_citations.py`

**Interfaces:**
- Produces: `check_excerpts(md_path: Path, root: Path) -> tuple[list[str], int]` in `check_citations.py`; `main()` output becomes `OK (<n> citations, <m> excerpts)`.
- Produces: `TEMPLATE.md`, which every later task follows.

- [ ] **Step 1: Write the failing tests**

Create `docs/whitebox-report/tools/test_check_citations.py`:

```python
"""Run from the repo root: python docs/whitebox-report/tools/test_check_citations.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from check_citations import check, check_excerpts  # noqa: E402

ROOT = Path.cwd()
SRC = "api/app/api/whitebox.py"
src_lines = (ROOT / SRC).read_text(encoding="utf-8").splitlines()


def write_md(text):
    f = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
    f.write(text)
    f.close()
    return Path(f.name)


def fence(header, body_lines):
    return "```python\n" + header + "\n" + "\n".join(body_lines) + "\n```\n"


def test_verbatim_excerpt_passes():
    md = write_md(fence(f"# {SRC}:1-3", src_lines[0:3]))
    problems, count = check_excerpts(md, ROOT)
    assert count == 1 and problems == [], problems


def test_edited_excerpt_fails():
    body = list(src_lines[0:3])
    body[1] = body[1] + " edited"
    md = write_md(fence(f"# {SRC}:1-3", body))
    problems, count = check_excerpts(md, ROOT)
    assert count == 1 and len(problems) == 1, problems


def test_wrong_range_fails():
    md = write_md(fence(f"# {SRC}:2-4", src_lines[0:3]))
    problems, _ = check_excerpts(md, ROOT)
    assert len(problems) == 1, problems


def test_js_comment_header_is_recognised():
    js = "ui/src/utils/currency.js"
    js_lines = (ROOT / js).read_text(encoding="utf-8").splitlines()
    md = write_md("```js\n// " + js + ":1-2\n" + "\n".join(js_lines[0:2]) + "\n```\n")
    problems, count = check_excerpts(md, ROOT)
    assert count == 1 and problems == [], problems


def test_plain_code_block_is_ignored():
    md = write_md("```python\nprint('not an excerpt')\n```\n")
    problems, count = check_excerpts(md, ROOT)
    assert count == 0 and problems == []


def test_citation_check_still_works():
    md = write_md(f"see `{SRC}:1` and `{SRC}:999999`")
    problems, count = check(md, ROOT)
    assert count == 2 and len(problems) == 1, problems


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"{len(tests)} passed")
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd /c/ETL && PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/test_check_citations.py`
Expected: `ImportError: cannot import name 'check_excerpts'`.

- [ ] **Step 3: Implement excerpt checking**

In `docs/whitebox-report/tools/check_citations.py`, add below the `CITATION` pattern:

```python
EXCERPT_HEADER = re.compile(
    r"^(?:#|//)\s*((?:api|spark|ui|tests|scripts)/[\w./-]+\.(?:py|jsx|js|yml|css)):(\d+)-(\d+)\s*$"
)


def check_excerpts(md_path: Path, root: Path):
    """A fenced block whose first line is `# path:a-b` or `// path:a-b` must
    contain exactly source lines a..b (trailing whitespace ignored)."""
    problems, count = [], 0
    lines = md_path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        if not lines[i].startswith("```"):
            i += 1
            continue
        j = i + 1
        while j < len(lines) and not lines[j].startswith("```"):
            j += 1
        header = EXCERPT_HEADER.match(lines[i + 1].strip()) if i + 1 < j else None
        if header:
            count += 1
            rel, start, end = header.group(1), int(header.group(2)), int(header.group(3))
            target = root / rel
            if not target.is_file():
                problems.append(f"BAD {md_path}: excerpt {rel}:{start}-{end} — file not found")
            else:
                src = target.read_text(encoding="utf-8", errors="replace").splitlines()[start - 1:end]
                body = lines[i + 2:j]
                if [s.rstrip() for s in body] != [s.rstrip() for s in src]:
                    problems.append(f"BAD {md_path}: excerpt {rel}:{start}-{end} does not match the source")
        i = j + 1
    return problems, count
```

In `main()`, run both checks per file and change the success line:

```python
    all_problems, total, excerpts = [], 0, 0
    for f in files:
        problems, count = check(f, root)
        e_problems, e_count = check_excerpts(f, root)
        all_problems += problems + e_problems
        total += count
        excerpts += e_count
    for p in all_problems:
        print(p)
    if all_problems:
        return 1
    print(f"OK ({total} citations, {excerpts} excerpts)")
    return 0
```

- [ ] **Step 4: Run tests and the checker**

Run: `cd /c/ETL && PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/test_check_citations.py`
Expected: six `PASS` lines, `6 passed`.
Run: `PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md`
Expected: `OK (96 citations, 0 excerpts)`.

- [ ] **Step 5: Write the template**

Create `docs/whitebox-report/TEMPLATE.md` with exactly this content:

````markdown
# แม่แบบของแต่ละบท

ทุกบทใช้หัวข้อ 8 ข้อนี้ตามลำดับ และสะกดหัวข้อตามนี้ทุกตัวอักษร

```markdown
# NN. <ชื่อส่วน>

> ผู้ใช้เห็นส่วนนี้ที่: <หน้าในระบบ> · โค้ดหลัก: `path:start-end`

## 1. คำตอบ 30 วินาที
3–5 ประโยคที่พูดตอบกรรมการได้ทันที: ส่วนนี้ทำอะไร ใช้วิธีอะไร ผลลัพธ์คืออะไร ข้อจำกัดหลักคืออะไร

## 2. มุมมองแบบ Black Box
ผู้ใช้ป้อนอะไร เห็นอะไรบนหน้าจอ โดยยังไม่อธิบายว่าระบบคิดอย่างไร

## 3. การทำงานภายใน (White Box)
ทุกขั้นตามลำดับที่โค้ดทำงานจริง ครอบคลุมทุกทางแยก (if/else) ที่เปลี่ยนผลลัพธ์ พร้อมสูตร ค่าคงที่ และ `path:line`
มี Mermaid flowchart หนึ่งภาพถ้ากระบวนการมีมากกว่า 3 ขั้น

## 4. เดินผ่านโค้ดจริง
โค้ดส่วนที่ตัดสินผลลัพธ์ คัดลอกตรงตามไฟล์ (บรรทัดแรกของบล็อกคือ `# path:start-end`) ไม่เกิน 30 บรรทัดต่อบล็อก
ใต้แต่ละบล็อกมีตาราง | บรรทัด | ทำอะไร | อธิบายทีละบรรทัดหรือทีละกลุ่มบรรทัดเป็นภาษาไทย

## 5. ตัวอย่างการคำนวณจริง
ข้อมูลเข้า → ค่ากลางทุกขั้น → ผลลัพธ์ อ้างไฟล์หลักฐานใน `evidence/` และแสดงการคำนวณซ้ำด้วยมือเทียบกับผลของระบบ

## 6. ทำไมออกแบบแบบนี้ และทางเลือกอื่น
แต่ละการตัดสินใจสำคัญ: เลือกอะไร ทำไม ทางเลือกอื่นที่เป็นไปได้ ได้/เสียอะไร

## 7. ข้อจำกัด ค่าตายตัว และข้อสังเกต
อะไรคำนวณจริง อะไรเป็นค่าตายตัว อะไรเป็นค่าสำรอง บั๊กที่พบ (พร้อมหลักฐาน) และผลกระทบต่อผู้ใช้

## 8. คำถามกรรมการ
แบ่ง 3 ระดับ แต่ละข้อมีคำตอบ 2–5 ประโยค และบอกว่าจะชี้ส่วนไหนของรายงานหรือโค้ดประกอบ
### พื้นฐาน (อย่างน้อย 3 ข้อ)
### เชิงลึก (อย่างน้อย 3 ข้อ)
### จุดอ่อน (อย่างน้อย 2 ข้อ) — ตอบตรงไปตรงมา: ยอมรับข้อจำกัด อธิบายผลกระทบ และบอกว่าจะแก้อย่างไร
```

## กติกาการเขียน

- นิยามศัพท์เทคนิคทุกคำเมื่อใช้ครั้งแรกในบท ประโยคเดียว ภาษาง่าย
- ประโยคที่บอกว่าระบบทำอะไร ต้องมี `path:line` กำกับ
- ตัวเลขทุกตัวในข้อ 5 มาจากหลักฐานหรือการคำนวณด้วยมือที่แสดงขั้นตอน
- ข้อ 4 ต้องครอบคลุมโค้ดที่ "ตัดสิน" ผลลัพธ์ (เงื่อนไข สูตร เกณฑ์) ไม่ใช่โค้ดเชื่อมต่อทั่วไป
````

- [ ] **Step 6: Check and commit**

```bash
cd /c/ETL
PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md
git add docs/whitebox-report/TEMPLATE.md docs/whitebox-report/tools
git commit -m "docs(whitebox-report): 8-part template, verbatim excerpt checking

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Common procedure for chapter tasks (Tasks 2–17)

Every chapter task follows these steps; each task lists its own reading, evidence, required facts, required excerpts, design topics and hard questions.

1. Read the listed code. Confirm every required fact; if the code says something else, write what the code says and note the difference in part 7.
2. Collect evidence with the given commands; save raw output under `docs/whitebox-report/evidence/` with the given names.
3. Write the chapter with `TEMPLATE.md`. Part 3 covers every branch that changes the result. Part 4 includes every "Required excerpt" of the task, each followed by its line-by-line table. Part 6 covers every "Design topic". Part 8 includes every "Hard question" of the task plus your own to reach the minimum counts.
4. Run `PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md` → `OK`.
5. Run the secret check from Global Constraints → no output.
6. Tick every Required fact / excerpt / design topic / hard question against the text.
7. Commit the chapter and its evidence.

---

### Task 2: Chapter 00 — System overview

**Files:**
- Create: `docs/whitebox-report/00-system-overview.md`
- Create: `docs/whitebox-report/evidence/00-services.txt`, `00-indices.txt`

**Read:** `docker-compose.yml:1-460` (every service), `api/main.py:1-140` (routers mounted), `ui/src/config/pages.js:1-40` (pages), `nginx/nginx.conf` (routing).

**Evidence:**

```bash
cd /c/ETL
docker compose ps --format "table {{.Name}}\t{{.Service}}\t{{.Status}}\t{{.Ports}}" > docs/whitebox-report/evidence/00-services.txt
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
curl -s -u "elastic:$ES_PASS" "http://localhost:9200/_cat/indices/sdoqap_*?v&h=index,docs.count&s=index" > docs/whitebox-report/evidence/00-indices.txt
```

**Required facts:**
- A table of all 15 services in `docker-compose.yml` (elasticsearch, kibana, namenode, datanode, spark-master, spark-worker, n8n, api, grafana, postgres, ollama, ui, nginx, zookeeper, kafka): what each does in this system in one line, its port, and whether the core flow needs it.
- The three storage places and what lives where: HDFS (`/data/raw`, `/data/active` Delta, `/data/quarantine`, `/data/staging`), Elasticsearch (every `sdoqap_*` index in the evidence, with one line each), and files/memory inside the `api` container (interactive engine state, uploaded CSV, output CSVs).
- One Mermaid diagram of the whole flow: sources → API ingest → HDFS raw → trigger daemon → Spark engine → Delta active/quarantine + Elasticsearch → API → UI pages; and the separate interactive path upload → API pandas engine → output CSVs → Export page.
- A table mapping each UI page in `pages.js` to the API routes it calls and the store behind them (read the page files to confirm).
- How a browser request reaches the API (nginx `/api/` → `api` service).

**Required excerpts:** the `app.include_router(...)` block in `api/main.py`. Also show the `location /api/` block of `nginx/nginx.conf` as a plain code block with no header line (the checker does not verify `.conf` files) and give its line numbers in the sentence above it.

**Design topics:** why two quality engines; why Elasticsearch as the run store instead of PostgreSQL; why HDFS + Delta Lake; what the extra services (Kibana, Grafana, n8n, Ollama) add and whether the core works without them.

**Hard questions:** "ถ้าปิด Elasticsearch ระบบยังใช้ได้ไหม"; "ทำไมต้องใช้ 15 container สำหรับข้อมูลหลักร้อยแถว"; "ข้อมูลอยู่ที่ไหนบ้าง ลบหมดได้อย่างไร".

---

### Task 3: Upgrade chapter 01 — Interactive quality gates

**Files:**
- Modify: `docs/whitebox-report/01-interactive-quality-gates.md` (restructure to the 8-part template; keep every existing fact, citation and number)

**Read:** the current chapter, `api/app/api/whitebox.py:165-268`, `:1129-1149`, `:1173-1335`, `:1338-1400`, `:1436-1480`; `ui/src/pages/Ingestion.jsx` (cards), `ui/src/pages/RulesConfig.jsx` (where the user changes k, null policy, dedup strategy — find the calls to `/api/v1/whitebox/state`).

**Evidence:** existing `evidence/01-*.{json,txt}`. Add one run with the other settings:

```bash
cd /c/ETL
C=$(mktemp); curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" -X POST http://localhost/api/v1/whitebox/state -H "Content-Type: application/json" -d '{"null_policy":"adaptive_5","tukey_multiplier":"1.5"}' -o /dev/null
curl -s -b "$C" http://localhost/api/v1/whitebox/state | PYTHONIOENCODING=utf-8 python -c "import json,sys; d=json.load(sys.stdin); m=d['metrics']; [m.pop(k,None) for k in ('sample_clean','sample_review','sample_quarantine')]; print(json.dumps({'null_policy':d['null_policy'],'tukey_multiplier':d['tukey_multiplier'],'metrics':m},ensure_ascii=False,indent=2))" > docs/whitebox-report/evidence/01-state-adaptive-k15.json
curl -s -b "$C" -X POST http://localhost/api/v1/whitebox/state -H "Content-Type: application/json" -d '{"null_policy":"strict_0","tukey_multiplier":"3.0"}' -o /dev/null
```

The last call restores the defaults. Confirm the new file shows 12 missing-score rows moved to review (quarantine 26, review 24) and state the k = 1.5 fence (12.05) from it.

**Required excerpts:** `api/app/api/whitebox.py:1216-1238` (the three masks and the fence); `api/app/api/whitebox.py:1244-1260` (status assignment); `api/app/api/whitebox.py:1263-1285` (human decisions); `api/app/api/whitebox.py:1311` inside a block of `:1308-1311`.

**Design topics:** why duplicates are checked before null/range; why outliers go to review but out-of-range goes to quarantine; why Tukey instead of mean ± 3 SD; why k = 3.0 by default; why keep-first for duplicates; why pandas in the API process instead of Spark for this flow.

**Hard questions:** "ถ้าไฟล์มีหนึ่งล้านแถว ส่วนนี้ยังใช้ได้ไหม"; "ทำไมการ์ดบอกค่าผิดปกติ N แต่คิวรอตรวจไม่เท่า N" (two fences); "ถ้า API รีสตาร์ต สิ่งที่ผู้ตรวจอนุมัติไปแล้วหายไหม".

---

### Task 4: Upgrade chapter 02 — Spark batch quality engine

**Files:**
- Modify: `docs/whitebox-report/02-spark-batch-quality-engine.md` (restructure to the 8-part template; keep every existing fact, citation and number, including the inference path added at `spark/spark_quality_engine.py:2917-3016`)

**Read:** the current chapter and `spark/spark_quality_engine.py:1684-3044`.

**Evidence:** existing `evidence/02-*`. Add the history the z-score uses for the table in the worked example:

```bash
cd /c/ETL
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
curl -s -u "elastic:$ES_PASS" -H "Content-Type: application/json" "http://localhost:9200/sdoqap_quality_runs/_search" -d '{"size":15,"sort":[{"timestamp":"desc"}],"_source":["run_id","timestamp","total_records","quarantined_records","quality_score","z_score","is_anomaly"],"query":{"term":{"table_name.keyword":"grocery_sales"}}}' > docs/whitebox-report/evidence/02-grocery-history.json
```

Recompute the z-score of the latest run from this history by hand (mean, population SD with the 0.05 floor, the 0.02 dead-band) and show it equals the stored `z_score`.

**Required excerpts:** `spark/spark_quality_engine.py:1938-1956` (drift severity); `:2039-2060` (auto-clean dedup — the rows that vanish); `:2062-2088` (row validation); `:2567-2574` (quality score); `:2584-2610` (quarantine-rate z-score); `:2762-2797` (operational impact weights, split into two blocks of at most 30 lines); `:1845-1853` (the numeric cleaning bug).

**Design topics:** why Delta MERGE instead of overwrite; why quarantine is appended per `run_id`; why a lock in Elasticsearch instead of a database lock; why z-score on the quarantine rate with a 0.05 floor and 0.02 dead-band; why raw files are kept when anything is quarantined; why the engine infers a schema for unknown tables.

**Hard questions:** "คะแนน 99.29% เชื่อได้แค่ไหน ในเมื่อแถวซ้ำไม่ถูกนับ"; "ถ้าสองคนสั่งรันตารางเดียวกันพร้อมกันเกิดอะไรขึ้น"; "ระบบเดาคีย์หลักผิดได้ไหม ผลคืออะไร".

---

### Task 5: Chapter 03 — Standardisation of values (DSL rules, semantic matching, keyword categories, dates)

**Files:**
- Create: `docs/whitebox-report/03-semantic-standardization.md`
- Create: `docs/whitebox-report/evidence/03-standardizer-run.txt`

**Read:** `spark/spark_quality_engine.py:233-305` (rule loading, keyword UDF), `:306-442` (`LocalSemanticStandardizer`), `:443-745` (optimized and UDF versions, low-confidence policy), `:746-943` (learning memory), `:944-1348` (`apply_dsl_remediation_rules` — list every rule type it supports), `:2139-2224` (date standardisation and registry keyword categories); `api/app/api/standardize.py:1-232` (API side).

**Evidence:** run the real class inside Spark (`standardize(value)` returns `(category, score)`, `spark/spark_quality_engine.py:390`):

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

Also save a hand-trace of `n_gram_cosine_similarity` for `'wheat bred'` vs `'whole wheat bread'` (bigrams listed, dot product, norms). The 0.5 threshold is only for the demonstration; state the real default the engine uses. If the import fails, record the error in the evidence file and do the whole example as a hand trace.

**Required facts:**
- There are three different mechanisms; say which runs when: (a) DSL remediation rules during auto-clean (every rule type, including `standardize`, `semantic_standardize`, `auto_strategy`), (b) registry `standardization_rules` keyword substring categories after validation, (c) date standardisation for columns named `วันที่`/`date`/`Date`.
- How `LocalSemanticStandardizer` indexes categories (first token, word tokens ≥ 2 characters, character bigrams) and the exact scoring formulas of `n_gram_cosine_similarity` and `hybrid_similarity`.
- Threshold, fallback, `low_confidence_policy` values and what each does.
- The learning memory: what is stored, where, and whether it changes later matches.
- The date rules: Buddhist year (> 2500 → −543), day-first assumption, unknown month → January, unparseable → returned unchanged.

**Required excerpts:** `spark/spark_quality_engine.py:331-389` (two blocks: cosine and hybrid similarity); `:390-442` (two blocks: `standardize`); `:2207-2221` (keyword categories); `:2146-2181` (two blocks: date parsing).

**Design topics:** string similarity vs a language model or embeddings (cost, speed, privacy, explainability); why keep the original value in a separate column; why a fallback category.

**Hard questions:** "ทำไม 'coke' ไม่ถูกจัดเป็น Beverage"; "ถ้าวันที่เป็น 05/07/2026 ระบบรู้ได้อย่างไรว่าเป็นวันที่ 5 หรือเดือน 5"; "การเรียนรู้ของระบบเรียนผิดได้ไหม".

---

### Task 6: Chapter 04 — Adaptive thresholds, anomaly detection and drift

**Files:**
- Create: `docs/whitebox-report/04-adaptive-rules-and-drift.md`
- Create: `docs/whitebox-report/evidence/04-worked-math.txt`

**Read:** `spark/dynamic_rules_engine.py:112-203`, `:204-267`, `:268-360`, `:361-497`, `:498-592`, `:593-678`, `:679-762`; `spark/data_profile_store.py:166-289`, `:290-388`, `:389-456`, `:457-512`, `:513-573`, `:574-673`.

**Evidence:** read the constants first, then create a work directory with `W=$(mktemp -d)` and write `$W/ws04.py` that reproduces, with the code's own constants, for the list `[4, 5, 5, 6, 6, 7, 30]`: Q1, Q3, IQR (same quantile method as the Spark code), 1.5×IQR fences; each value's z-score and which exceed 3.0; one EMA update of a stored mean; PSI for two 4-bin distributions with the code's bin handling and epsilon; the adaptive threshold for a made-up history of 10 quality scores. Save script and output together:

```bash
PYTHONIOENCODING=utf-8 python "$W/ws04.py" > docs/whitebox-report/evidence/04-worked-math.txt
```

(Paste the script at the top of the evidence file too.)

**Required facts:** adaptive threshold formula, history source and size, minimum history and fallback; IQR multiplier and columns; z-score formula, threshold 3.0 and what happens to flagged rows (quarantined in chapter 02); EMA formula and smoothing factor; PSI formula, bins, epsilon and drift thresholds; null-rate drift comparison; what `generate_rules_from_schema` writes for a new table.

**Required excerpts:** `spark/dynamic_rules_engine.py` — the core of `compute_adaptive_threshold`, `compute_value_range_rules`, `detect_unsupervised_anomalies`; `spark/data_profile_store.py` — `update_profiles_ema`, `compute_psi`. Keep each block ≤ 30 lines; split if needed.

**Design topics:** why adaptive thresholds at all; IQR vs z-score (when each fails); why PSI for drift; why EMA instead of storing all history.

**Hard questions:** "ถ้าข้อมูลแย่ลงทีละนิดทุกวัน เกณฑ์แบบ adaptive จะลดตามจนไม่เตือนเลยไหม"; "z-score บนข้อมูลที่ไม่ใช่การแจกแจงปกติใช้ได้หรือ"; "ทำไมเรียกว่า adaptive ถ้าไม่มีการฝึกโมเดล".

---

### Task 7: Chapter 05 — Where AI is used, and where it is not

**Files:**
- Create: `docs/whitebox-report/05-ai-in-the-system.md`
- Create: `docs/whitebox-report/evidence/05-ai-context.json`, `05-ai-proposals.json`

**Read:** `api/app/api/whitebox.py:1528-1640`, `:1641-1723`; `spark/ai_rule_advisor.py:96-322`, `:323-400`, and the functions `should_trigger`, `ai_analyze_quarantined_sample`, `run_profile_based_analysis`, `induce_rules_from_data`, `log_proposal_to_es` (find them with `grep -n "def " spark/ai_rule_advisor.py`); `spark/auto_remediation_engine.py:150-163` (`call_ollama`); `api/app/api/dynamic_rules.py:318-560` (list, approve with guardrails, reset, reject).

**Evidence:**

```bash
cd /c/ETL
C=$(mktemp); curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" "http://localhost/api/v1/whitebox/ai-context-explanations?force=true" > docs/whitebox-report/evidence/05-ai-context.json
curl -s -b "$C" "http://localhost/api/v1/rules/ai-proposals" > docs/whitebox-report/evidence/05-ai-proposals.json
```

**Required facts:** every place that can call a language model (Groq, Ollama) and the deterministic fallback of each; which runs on this stack today (`ai_live_generated` false, `model` null); exactly what the model receives (quote the prompt building — only computed numbers, settings, and a sample of quarantined rows for the advisor: state which) and what it returns; that no model decides which rows are bad; the decision tree: features, label (clean vs quarantined), how rules are extracted, the AUC it reports, and that every proposal waits for a human; the approve guardrails in `dynamic_rules.py`; the `live_metrics` bug fixed in `3d55699`; what data leaves the machine when Groq is enabled.

**Required excerpts:** prompt construction in `generate_ai_context_explanations`; the Groq/Ollama routing in `ai_rule_advisor.py`; the decision-tree fit and rule extraction; the approve guardrail checks in `dynamic_rules.py`.

**Design topics:** why the LLM only writes explanations; why a decision tree (readable rules) rather than a black-box classifier; why every proposal needs approval; local Ollama vs cloud Groq (privacy vs quality).

**Hard questions:** "ถ้า AI ตอบผิด ระบบเสียหายไหม"; "ข้อมูลนักศึกษาถูกส่งออกไปนอกองค์กรหรือเปล่า"; "decision tree ที่ฝึกจากตัวอย่างไม่กี่สิบแถวเชื่อได้แค่ไหน".

---

### Task 8: Chapter 06 — Quality forecast and SLA breach probability

**Files:**
- Create: `docs/whitebox-report/06-quality-forecast.md`
- Create: `docs/whitebox-report/evidence/06-projection.json`, `06-history.json`, `06-recompute.txt`

**Read:** `api/app/api/analytics.py:460-600`; `ui/src/pages/Analytics.jsx:44-95`.

**Evidence:**

```bash
cd /c/ETL
C=$(mktemp); curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" http://localhost/api/v1/analytics/projection > docs/whitebox-report/evidence/06-projection.json
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
W=$(mktemp -d)
curl -s -u "elastic:$ES_PASS" "http://localhost:9200/sdoqap_quality_runs/_search?size=1&sort=timestamp:desc&_source=table_name" > "$W/latest.json"
TABLE=$(PYTHONIOENCODING=utf-8 python -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['hits']['hits'][0]['_source']['table_name'])" "$W/latest.json")
curl -s -u "elastic:$ES_PASS" -H "Content-Type: application/json" "http://localhost:9200/sdoqap_quality_runs/_search" -d "{\"size\":10,\"sort\":[{\"timestamp\":\"desc\"}],\"_source\":[\"table_name\",\"quality_score\",\"timestamp\"],\"query\":{\"term\":{\"table_name.keyword\":\"$TABLE\"}}}" > docs/whitebox-report/evidence/06-history.json
```

Write `$W/ws06.py` (same work directory) that recomputes slope, intercept, standard error, the 7 projections, CI bounds, stability index and breach probability from `06-history.json` with the code's formulas; save script + output in `06-recompute.txt`; results must match `06-projection.json` to 2 decimals (explain any difference).

**Required facts:** last 10 runs of the most recent table; x in days since the first run (index if all equal); OLS slope and intercept formulas, `m = −0.5` when the denominator is 0; standard error `√(SSE/(n−2))` floored at 0.5 (variance 2.0 when n ≤ 2); projections for days 1–7 clamped to [0, 100]; CI margin `se × (1 + 0.2d)`; stability `clamp(100 − 4σ, 5, 100)`; breach 99.9% if the last score is already < 95, else the max over days of `0.5(1 − erf(z/√2))`, `z = (projected − 95)/se`, clamped [0.1, 99.9]; crisis if a projection < 90; fewer than 2 runs → empty forecast.

**Required excerpts:** `api/app/api/analytics.py:486-529` (two blocks); `:531-565`; `ui/src/pages/Analytics.jsx:57-70` (days 8+ invented).

**Design topics:** linear regression vs moving average vs ARIMA/Prophet for 10 points; why a widening CI; why normal CDF.

**Hard questions:** "พยากรณ์ 30 วันในหน้าเว็บมาจากไหน" (answer honestly: days 8+ are invented by the page, `ui/src/pages/Analytics.jsx:57-70`); "ใช้ข้อมูลแค่ 10 จุดพยากรณ์ได้จริงหรือ"; "ทำไมผู้ใช้เปลี่ยนเป้า SLA ได้ แต่ API ยังใช้ 95".

---

### Task 9: Chapter 07 — Money lost to bad data (COPDQ)

**Files:**
- Create: `docs/whitebox-report/07-copdq-financial-impact.md`
- Create: `docs/whitebox-report/evidence/07-impact.json`, `07-aggregates.json`

**Read:** `api/app/api/analytics.py:673-770`; `spark/spark_quality_engine.py:2513-2530`; `spark/spark_gold_layer.py:317-384`; `ui/src/utils/currency.js:1-34`.

**Evidence:**

```bash
cd /c/ETL
C=$(mktemp); curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" http://localhost/api/v1/analytics/impact > docs/whitebox-report/evidence/07-impact.json
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
curl -s -u "elastic:$ES_PASS" -H "Content-Type: application/json" "http://localhost:9200/sdoqap_quality_runs/_search" -d '{"size":100,"_source":["quarantined_records","total_records","quarantined_financial_value"]}' > docs/whitebox-report/evidence/07-aggregates.json
curl -s -u "elastic:$ES_PASS" "http://localhost:9200/sdoqap_schema_drifts/_search?size=1" >> docs/whitebox-report/evidence/07-aggregates.json
```

(The API reads the first 100 run documents without sorting; the evidence uses the same request so the sums can be reproduced exactly.)

**Required facts:** correction = quarantined × 2 USD; lost opportunities = Σ `quarantined_financial_value` if > 0 else quarantined × 0.05 × 50; risk = quarantined × `drift_severity` of the first drift document (else × 1); KPI mapping and percentages (`error_rate × 0.8`, `drift_severity × error_rate × 0.3` or `error_rate × 0.4`); where `quarantined_financial_value` comes from in Spark; the Gold-layer financial table; the THB figure is display-only at 36.5.

**Required excerpts:** `api/app/api/analytics.py:704-741` (two blocks); `spark/spark_quality_engine.py:2513-2530`; `ui/src/utils/currency.js:1-34` (two blocks).

**Design topics:** why a cost model at all; why USD constants stay USD; what a real company would replace the constants with.

**Hard questions:** "ตัวเลข 14,277 ดอลลาร์เป็นเงินจริงไหม"; "ทำไมความเสี่ยงคูณ drift_severity ของตารางอื่น"; "ถ้าผู้บริหารเอาตัวเลขนี้ไปตัดสินใจจะเสี่ยงอะไร".

---

### Task 10: Chapter 08 — Multi-table relationship analysis and join

**Files:**
- Create: `docs/whitebox-report/08-multi-table-relationship.md`
- Create: `docs/whitebox-report/evidence/08-analyze.json`, `08-normalize.txt`

**Read:** `api/app/api/whitebox.py:891-1100` and `_normalize_token` (`grep -n "def _normalize_token" api/app/api/whitebox.py`); the multi-table part of `ui/src/pages/WhiteBoxPipeline.jsx:95-160`.

**Evidence:**

```bash
cd /c/ETL
C=$(mktemp); curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" -X POST http://localhost/api/v1/whitebox/multi-table/analyze -H "Content-Type: application/json" -d '{}' > docs/whitebox-report/evidence/08-analyze.json
MSYS_NO_PATHCONV=1 docker compose exec -T -w /app api python -c "
from app.api.whitebox import _normalize_token
for s in ['studentId', 'student_id', 'Student ID', 'enrollmentDate', 'updated_at']:
    print(repr(s), '->', repr(_normalize_token(s)))
" > docs/whitebox-report/evidence/08-normalize.txt
```

If analyze returns 404 (demo tables absent), keep the 404 as evidence and build the worked example from `08-normalize.txt` plus a hand calculation of overlap and cardinality on a 5-row example defined in the chapter.

**Required facts — in two explicit lists "คำนวณจริง" and "เป็นค่าตายตัว":** computed: token-normalised name matching, key overlap rate, uniqueness → cardinality; fixed: `confidence_pct` 96.0, date format labels, table and key column names, `suggested_join_type` left, `confidence_verdict`; the join step and `human_confirmation_required`.

**Required excerpts:** `api/app/api/whitebox.py:934-952`; `:954-969`; `:971-985`; the core of the join function.

**Design topics:** why ask a human before joining; what real relationship discovery would need (value-overlap scans across all column pairs, inclusion dependencies).

**Hard questions:** "ความมั่นใจ 96% คำนวณจากอะไร" (honest: fixed); "ใช้กับตารางอื่นได้ไหม"; "ถ้า join ผิดจะเกิดอะไร".

---

### Task 11: Chapter 09 — Schema drift and the Catalog approval flow

**Files:**
- Create: `docs/whitebox-report/09-schema-drift-and-catalog.md`
- Create: `docs/whitebox-report/evidence/09-proposals.json`

**Read:** `spark/spark_quality_engine.py:1891-2026`, `:1349-1500`; `api/app/api/schema.py:38-420`; `ui/src/pages/Schema.jsx` (calls to `/api/v1/schema/...`).

**Evidence:**

```bash
cd /c/ETL
C=$(mktemp); curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" http://localhost/api/v1/schema/proposals > docs/whitebox-report/evidence/09-proposals.json
```

**Required facts:** detection (registry in ES `sdoqap_schema_registry`, fallback `spark/schema_registry.json`) → missing / type mismatch / new column; severity weights 5/5/1; auto-approve only when all changes are new columns, `allow_new_columns` true, `require_approval` false and column count ≤ `max_columns` (50); otherwise PENDING or REJECTED with reason; what approve and reject write; that the run continues with the drifted data meanwhile; that a missing column makes every row fail null validation (cross-reference chapter 02); what `simulate` fakes.

**Required excerpts:** `spark/spark_quality_engine.py:1896-1933` (two blocks); `:1958-1975`; `:1993-2004`; the approve handler in `api/app/api/schema.py`.

**Design topics:** why new columns are "safe" but missing columns are not; why a human gate; why log proposals instead of editing the registry directly.

**Hard questions:** "ถ้าไม่มีใครกดอนุมัติ ข้อมูลรอบนั้นไปไหน"; "ทำไมคอลัมน์หายแล้วทั้งไฟล์ถูกกักกัน"; "ใครมีสิทธิ์อนุมัติ" (single admin — cross-reference chapter 14).

---

### Task 12: Chapter 10 — Error pattern grouping ("clustering")

**Files:**
- Create: `docs/whitebox-report/10-error-pattern-grouping.md`
- Create: `docs/whitebox-report/evidence/10-clustering.json`

**Read:** `api/app/api/analytics.py:599-672`; `spark/spark_gold_layer.py:256-316`; the chart in `ui/src/pages/Analytics.jsx`.

**Evidence:**

```bash
cd /c/ETL
C=$(mktemp); curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" http://localhost/api/v1/analytics/clustering > docs/whitebox-report/evidence/10-clustering.json
```

**Required facts:** input (up to 100 runs with `quarantined_records > 0`); every keyword rule → bucket (source, pattern); counts and percentages; the Gold-layer error-pattern table; plainly: rule-based grouping, not a clustering algorithm; the "Unknown" share in the evidence.

**Required excerpts:** the keyword rules block of `get_diagnostic_clustering` (split if > 30 lines).

**Design topics:** rules vs real clustering (k-means on reason text, TF-IDF) — explainability vs coverage.

**Hard questions:** "ทำไมเรียก clustering"; "ทำไม Unknown ใหญ่ที่สุด"; "จะทำให้เป็น clustering จริงต้องทำอะไร".

---

### Task 13: Chapter 11 — Ingestion and job triggering

**Files:**
- Create: `docs/whitebox-report/11-ingestion-and-job-triggering.md`
- Create: `docs/whitebox-report/evidence/11-ingest-response.json`, `11-quality-run.json`, `11-hdfs-listing.txt`

**Interfaces:**
- Produces: a real Spark run of table `wb_trace_demo` and its evidence files, reused by Task 17.

**Read:** `api/app/api/pipeline.py:20-64` (guards), `:246-317` (`upload_to_webhdfs`, `trigger_spark_job`), `:318-350` (CSV), `:350-533` (API), `:534-600` (Reddit/Kafka), `:600-659` (RDBMS); `spark/spark_trigger_daemon.py:1-130`, `:131-243` (auto-remediation hook), `:244-455` (routes `/retry`, `/gold/rebuild`, `/stream/*`); `spark/streaming_job.py:1-72`; `spark/reddit_stream.py` (producer); `ui/src/pages/Ingestion.jsx` (which tab calls which route).

**Evidence:** send a small CSV through the real ingest path and wait for its Spark run.

```bash
cd /c/ETL
T=$(mktemp -d)
printf 'id,product,quantity,price,order_date\n1,Fresh Milk,2,45.50,2026-09-20\n2,wheat bread,1,35.00,2026-09-21\n2,wheat bread,1,35.00,2026-09-21\n3,Coke,,20.00,2026-09-22\n4,Laptop,1,99999.99,2026-09-23\n5,Rice,3,60.00,22/09/2569\n' > "$T/wb_trace_demo.csv"
cp "$T/wb_trace_demo.csv" docs/whitebox-report/evidence/11-input.csv.txt
C="$T/c.txt"; curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" -F table_name=wb_trace_demo -F "file=@$T/wb_trace_demo.csv;type=text/csv" http://localhost/api/v1/pipeline/ingest/csv > docs/whitebox-report/evidence/11-ingest-response.json
cat docs/whitebox-report/evidence/11-ingest-response.json
```

Then wait (up to 10 minutes) until Elasticsearch has a run for the table. If your shell blocks `sleep`, run this loop in the background and check its output:

```bash
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
for i in $(seq 1 60); do
  N=$(curl -s -u "elastic:$ES_PASS" -H "Content-Type: application/json" "http://localhost:9200/sdoqap_quality_runs/_count" -d '{"query":{"term":{"table_name.keyword":"wb_trace_demo"}}}' | PYTHONIOENCODING=utf-8 python -c "import json,sys;print(json.load(sys.stdin).get('count',0))")
  [ "$N" -gt 0 ] && break; sleep 10
done
curl -s -u "elastic:$ES_PASS" -H "Content-Type: application/json" "http://localhost:9200/sdoqap_quality_runs/_search" -d '{"size":1,"sort":[{"timestamp":"desc"}],"query":{"term":{"table_name.keyword":"wb_trace_demo"}}}' > docs/whitebox-report/evidence/11-quality-run.json
MSYS_NO_PATHCONV=1 docker compose exec -T namenode hdfs dfs -ls -R /data/raw/wb_trace_demo /data/active/wb_trace_demo /data/quarantine/wb_trace_demo > docs/whitebox-report/evidence/11-hdfs-listing.txt 2>&1
```

If no run appears after 10 minutes, collect `docker compose logs --tail=200 spark-master` and the trigger daemon's log into `evidence/11-trigger-failure.txt`, write in the chapter what failed and where the chain stopped, and continue — the honest failure is the evidence.

**Required facts:** each intake route (CSV, REST API pull, RDBMS SELECT, Reddit→Kafka stream): input, guards (host allowlist, SELECT-only, size), where the data lands; WebHDFS write to `/data/raw/<table>`; how the daemon on port 8099 is called and what `/retry`, `/gold/rebuild`, `/stream/start|stop|status` do; the fallback when the daemon is unreachable; what happens after the Spark run (auto-remediation hook — cross-reference chapter 13); which UI tab uses which path, and that the Ingestion page's File tab uses the interactive engine (`/whitebox/upload-csv`), not this path.

**Required excerpts:** `validate_select_only` and `validate_rdbms_host` in `pipeline.py`; `upload_to_webhdfs`; `trigger_spark_job`; the `/retry` handler in the daemon.

**Design topics:** why land raw data in HDFS before validating; why an HTTP daemon to start Spark instead of the API running Spark itself; batch vs streaming paths.

**Hard questions:** "อัปโหลดไฟล์ในหน้า Ingestion แล้วข้อมูลเข้า Spark ไหม" (answer: no — the File tab uses the interactive engine); "กันไม่ให้ผู้ใช้ส่ง SQL อันตรายอย่างไร"; "ถ้า Spark ล่มระหว่างทาง ไฟล์ดิบหายไหม".

---

### Task 14: Chapter 12 — Gold layer and lineage

**Files:**
- Create: `docs/whitebox-report/12-gold-layer-and-lineage.md`
- Create: `docs/whitebox-report/evidence/12-gold-daily.json`, `12-lineage.json`, `12-trust-check.json`

**Read:** `spark/spark_gold_layer.py:1-451`; `api/app/api/gold.py:1-163`; `api/app/api/lineage.py:1-429`.

**Evidence:**

```bash
cd /c/ETL
C=$(mktemp); curl -s -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -o /dev/null
curl -s -b "$C" "http://localhost/api/v1/gold/daily-quality?days=14" > docs/whitebox-report/evidence/12-gold-daily.json
curl -s -b "$C" "http://localhost/api/v1/lineage/grocery_sales" > docs/whitebox-report/evidence/12-lineage.json
curl -s -b "$C" "http://localhost/api/v1/lineage/grocery_sales/trust-check" > docs/whitebox-report/evidence/12-trust-check.json
```

**Required facts:** what "Gold" means here (four Elasticsearch summary indices built from run documents — list them with their fields and how each is aggregated); when Gold is rebuilt (after a passing run, or on demand); what the lineage endpoint returns and where each node's data comes from (real vs fixed text); how the trust check decides its verdict (every condition).

**Required excerpts:** `build_gold_daily_quality` core aggregation; the trust-check decision block in `lineage.py`.

**Design topics:** medallion layers (raw/bronze → active/silver → gold) and why Gold here is Elasticsearch documents rather than Delta tables; why precompute summaries.

**Hard questions:** "Gold layer ต่างจาก Dashboard อ่านข้อมูลดิบอย่างไร"; "lineage บอกได้ไหมว่าแถวไหนมาจากไฟล์ไหน"; "trust check ผ่าน แปลว่าข้อมูลถูกต้องหรือ".

---

### Task 15: Chapter 13 — Auto-remediation and alerts

**Files:**
- Create: `docs/whitebox-report/13-auto-remediation-and-alerts.md`
- Create: `docs/whitebox-report/evidence/13-remediation-docs.json`, `13-alert-config.txt`

**Read:** `spark/auto_remediation_engine.py:1-544`; `spark/spark_trigger_daemon.py:131-243`; `spark/alert_router.py:1-99`; `spark/spark_quality_engine.py:1599-1629` (`send_n8n_alert`).

**Evidence:**

```bash
cd /c/ETL
ES_PASS=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ELASTICSEARCH_PASSWORD | tr -d '\r')
curl -s -u "elastic:$ES_PASS" "http://localhost:9200/_cat/indices/sdoqap_*remed*?v&h=index,docs.count" > docs/whitebox-report/evidence/13-remediation-docs.json
for IDX in $(curl -s -u "elastic:$ES_PASS" "http://localhost:9200/_cat/indices/sdoqap_*remed*?h=index"); do
  curl -s -u "elastic:$ES_PASS" "http://localhost:9200/$IDX/_search?size=2&sort=timestamp:desc" >> docs/whitebox-report/evidence/13-remediation-docs.json
done
for V in N8N_WEBHOOK_URL SLACK_WEBHOOK_URL LINE_NOTIFY_TOKEN; do
  VAL=$(MSYS_NO_PATHCONV=1 docker compose exec -T spark-master printenv $V | tr -d '\r'); echo "$V: $([ -n "$VAL" ] && echo set || echo not set)"
done > docs/whitebox-report/evidence/13-alert-config.txt
```

(Only "set / not set" is recorded — never the values. If the variable names differ, use the names from `alert_router.py` and `send_n8n_alert`.)

**Required facts:** when remediation starts (daemon hook after a run with quarantined rows, the one-retry guard); every remediation strategy the engine applies and in what order; which strategies call Ollama and the fallback; how fixed rows go back (written to HDFS raw and re-run); where results are logged; alert routing: n8n webhook, Slack, LINE, severity levels, and which are configured on this stack.

**Required excerpts:** the retry guard in `_try_auto_remediate`; the strategy selection in `AutoRemediationEngine`; `route_alert`.

**Design topics:** auto-fix vs human fix (risk of silently changing data); why retry at most once; why route alerts through n8n.

**Hard questions:** "ระบบแก้ข้อมูลเองโดยไม่มีคนเห็นได้ไหม"; "ถ้าแก้ผิดแล้วเข้า active ไปแล้วย้อนกลับได้ไหม" (Delta history); "แจ้งเตือนไปถึงใครจริงๆ บน stack นี้".

---

### Task 16: Chapter 14 — Login and security

**Files:**
- Create: `docs/whitebox-report/14-authentication-and-security.md`
- Create: `docs/whitebox-report/evidence/14-auth-checks.txt`

**Read:** `api/app/api/auth.py:1-134`; `api/main.py:1-140` (CORS, rate limiting, routers); `api/app/api/pipeline.py:20-64`; `api/app/api/whitebox.py:1436-1443` (path sanitising); `docker-compose.yml:1-40`.

**Evidence:**

```bash
cd /c/ETL
T=$(mktemp -d); C="$T/c.txt"
{
echo "## protected route without login"; curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost/api/v1/whitebox/state -H "Content-Type: application/json" -d '{}'
echo "## wrong password"; curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"wrong"}'
echo "## login response headers (cookie value hidden)"; curl -s -D - -o /dev/null -c "$C" -X POST http://localhost/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' | grep -i "set-cookie" | sed -E 's/=([^;]+);/=***;/'
echo "## same route with login"; curl -s -b "$C" -o /dev/null -w "%{http_code}\n" http://localhost/api/v1/auth/me
} > docs/whitebox-report/evidence/14-auth-checks.txt
cat docs/whitebox-report/evidence/14-auth-checks.txt
```

**Required facts:** how the session token is built and checked (payload, expiry 12 h, HMAC-SHA256 with `SESSION_SECRET_KEY`, constant-time compare); cookie flags (HttpOnly, SameSite, Secure depends on `SESSION_COOKIE_SECURE`); the service key path for machine callers; which routes need a session and which are public; input guards (SELECT-only SQL, host allowlists, table-name sanitising against path traversal); CORS settings; rate limiting (confirm in `main.py`); known gaps stated plainly: one shared admin account, no roles, audit logs cannot say who, Elasticsearch password written in `docker-compose.yml`, state in memory.

**Required excerpts:** `create_session_token` and `verify_session_token`; the login compare; one input guard.

**Design topics:** stateless signed token vs server-side session store; why constant-time comparison; what multi-user with roles would require.

**Hard questions:** "ถ้าขโมยคุกกี้ได้ใช้ได้นานแค่ไหน"; "ทำไมมีผู้ใช้คนเดียว" (answer: development stage; list what production needs); "รหัสผ่านฐานข้อมูลอยู่ในไฟล์ที่ commit แล้วปลอดภัยไหม".

---

### Task 17: Chapter 15 — End-to-end trace of real rows

**Files:**
- Create: `docs/whitebox-report/15-end-to-end-trace.md`

**Interfaces:**
- Consumes: `evidence/01-*` (Task 3) for the interactive path; `evidence/11-*` (Task 13) for the batch path.

**Required content:**
- **Path A — interactive:** follow five demo rows (rows 2, 3, 7, 25, and one clean row of your choice from `dirty_course_scores_demo.csv`) from upload to the Export file each lands in, citing the exact line that decides each step and the `whitebox_rule_applied` text it gets. Confirm by reading the output CSVs inside the api container (`MSYS_NO_PATHCONV=1 docker compose exec -T api sh -c 'grep -E "^(2|3|7|25)," /app/*/output_runs/*_run.csv'` — adjust the path to what `_resolve_output_dir` returns) and save the output as `evidence/15-interactive-rows.txt`.
- **Path B — batch:** follow each of the six rows of `evidence/11-input.csv.txt` through chapter 02's stages using `evidence/11-quality-run.json` and `evidence/11-hdfs-listing.txt`: which stage touches it, what happens, where it ends (active, quarantine with which reason, or silently dropped as a duplicate). Note what did not happen that a reader might expect (for example `order_date` is not date-standardised because only columns named `วันที่`/`date`/`Date` are). If Task 13 recorded a failure instead of a run, trace up to the point of failure.
- One table per path: row → each stage → final place → cited line.
- Part 8 hard question: "ถ้ากรรมการให้ยกตัวอย่างแถวเสียหนึ่งแถว ตอบอย่างไร" — give the scripted answer using one traced row.

---

### Task 18: Question bank, index, final checks

**Files:**
- Create: `docs/whitebox-report/16-committee-question-bank.md`
- Create: `docs/whitebox-report/README.md`

- [ ] **Step 1: Question bank.** Collect every question from chapters 00–15, grouped by theme (ภาพรวมและสถาปัตยกรรม / คุณภาพข้อมูลและกฎ / สถิติและการพยากรณ์ / AI / ความปลอดภัย / ข้อจำกัดและงานต่อ), each tagged พื้นฐาน / เชิงลึก / จุดอ่อน and linking to its chapter. Add these cross-cutting questions with answers: "ทำไมไม่ใช้เครื่องมือสำเร็จรูปอย่าง Great Expectations หรือ dbt tests"; "ระบบรองรับข้อมูลใหญ่แค่ไหน และคอขวดอยู่ตรงไหน"; "ทดสอบระบบอย่างไร" (count the frontend tests with `cd ui && npx vitest run` and the backend test files under `tests/`, report the real numbers); "ข้อมูลส่วนบุคคล (PDPA) จัดการอย่างไร"; "ถ้ามีเวลาอีก 3 เดือนจะปรับอะไรก่อน".
- [ ] **Step 2: README.** Sections in this order: `# รายงานอธิบายการทำงานภายในของระบบ SDOQAP`; `## สรุปหนึ่งหน้าสำหรับกรรมการ` (at most 12 bullets: the two engines, what is statistics vs rules vs AI, the main limits); `## ลำดับการอ่าน` (suggested order: 00 → 11 → 01 → 02 → 15 → the rest → 16); `## สารบัญ` (table: chapter, title, one-line summary, page where the user sees it); `## ข้อสังเกตและบั๊กที่พบ` (every item from all part-7 sections, with severity and link); `## อภิธานศัพท์` (every term defined in the chapters, one line each); `## วิธีทำซ้ำตัวอย่าง` (generator, stack start, login, checker); `## อ้างอิงเวอร์ชันโค้ด` (`git rev-parse --short HEAD`).
- [ ] **Step 3: Checks.**

```bash
cd /c/ETL
PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/test_check_citations.py
PYTHONIOENCODING=utf-8 python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md
grep -rniE "sdoqap_secure|password=|api_key|bearer [a-z0-9]|gsk_|hooks.slack.com/services/[A-Z0-9]" docs/whitebox-report/ ; echo "secret-check exit=$?"
for f in docs/whitebox-report/[0-9][0-9]-*.md; do for h in "## 1. คำตอบ 30 วินาที" "## 4. เดินผ่านโค้ดจริง" "## 6. ทำไมออกแบบแบบนี้ และทางเลือกอื่น" "## 8. คำถามกรรมการ"; do grep -qF "$h" "$f" || echo "MISSING '$h' in $f"; done; done
```

Expected: `6 passed`; `OK (...)`; `secret-check exit=1`; no `MISSING` lines (chapter 16 is exempt from the heading check — skip it if it is reported).

- [ ] **Step 4: Commit.**

```bash
git add docs/whitebox-report
git commit -m "docs(whitebox-report): question bank, index and final checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
