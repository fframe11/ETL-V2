# เตรียมพรีเซนต์ต่อคณะกรรมการ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิดช่องว่างของหลักฐานตามเกณฑ์คะแนน 3 จุดที่คุ้มที่สุด แล้วสร้างชุดเอกสารพรีเซนต์ (ตัวเลข สไลด์ สคริปต์สาธิต) จากหลักฐานที่วัดจริง

**Architecture:** งานแบ่งเป็นสองช่วง ช่วงแรก (Task 1–3) แก้สคริปต์ประเมินใน `scripts/evaluation/` แบบ TDD แล้วรันกับ stack จริงเพื่อสร้างหลักฐานใหม่ใน `docs/evaluation/evidence/` และ `docs/evaluation/rubric-mapping.md` ช่วงหลัง (Task 4–6) ดึงตัวเลขจากหลักฐานมาเป็นเอกสารใน `docs/presentation/` ไม่มีการแก้เอนจิน Spark, API หรือ UI

**Tech Stack:** Python 3 stdlib, pytest, Git Bash, Docker Compose (stack ต้องรันอยู่), curl

**Spec:** `docs/presentation/03-rubric-scorecard.md` (ผลประเมินและรายการช่องว่าง) อ่านคู่กับ `docs/presentation/01-system-explainer.md`, `docs/presentation/02-committee-qa.md` และ `docs/requirements/Evalution_Guildline.md` (โครง 6 สไลด์ของส่วนประเมินผล)

## Global Constraints

- **ห้ามแต่งตัวเลข** ทุกตัวเลขในเอกสารพรีเซนต์ต้องมาจากไฟล์ใน `docs/evaluation/evidence/` หรือจาก API ของ stack ที่รันอยู่ (`Evalution_Guildline.md` Step 6: "ห้ามคิดตัวเลขย้อนหลังเพื่อให้สวย") ถ้ารันไม่สำเร็จให้บันทึกว่าล้มเหลวพร้อมข้อความ error
- **ห้ามแก้ผลคาดหวังให้ตรงผลจริง** ถ้าผลไม่ตรง `Expected` ให้หยุดและรายงาน
- **ห้ามแก้** `services/spark/`, `services/api/`, `services/ui/` — ข้อจำกัดของเอนจิน (Z-score, การเติม 0, แถวซ้ำ) จะถูกรายงานตามจริง ไม่แก้ก่อนพรีเซนต์ (เหตุผลใน spec หัวข้อ "ช่องว่างเรียงตามความคุ้ม")
- สคริปต์บน host ใช้ Python stdlib เท่านั้น (host ไม่มี pandas/pyspark/fastapi)
- รันคำสั่ง shell จาก **Git Bash** ที่ root ของ repo (`C:\ETL`) ยกเว้นที่ระบุว่า PowerShell
- ไฟล์ `*.csv` ถูก ignore อยู่แล้ว commit เฉพาะ JSON/markdown/โค้ด
- commit message ใช้รูปแบบเดิมของ repo (`fix(eval): ...`, `docs(...): ...`) และ**ไม่ใส่**บรรทัด `Co-Authored-By` หรือ `Generated with`
- ทำงานบน branch ปัจจุบัน `new-optimizer` ไม่ push เว้นแต่เจ้าของงานสั่ง
- ชื่อตารางที่แผนนี้สร้าง: `churn_from_postgres`, `gov_open_data`, `demo_rehearsal_1`, `demo_rehearsal_2`, `demo_scores` (ตาราง Postgres: `churn_modelling`) ห้ามลบหรือแก้ตารางอื่น

## คำสั่งมาตรฐาน

```bash
# เทสต์สคริปต์ประเมิน (host)
python -m pytest -q scripts/evaluation/tests

# helper ของ QA: login, เรียก API, รอ run (ตั้ง CALLS=/dev/null เพื่อไม่ให้เขียนทับ log ของรายงานทดสอบ)
source scripts/qa/lib.sh; CALLS=/dev/null

# สร้างรายงานเกณฑ์ใหม่จากหลักฐาน
python scripts/evaluation/build_rubric_report.py
```

ก่อนเริ่มทุก task: `docker compose ps` ต้องเห็น `sdoqap-api`, `sdoqap-spark-master`, `sdoqap-spark-worker`, `sdoqap-namenode`, `sdoqap-datanode`, `sdoqap-elasticsearch`, `sdoqap-nginx` เป็น `healthy` ถ้าไม่ใช่ให้รัน `start_system.bat` แล้วรอ

หลังรันกับ stack ทุกครั้ง: ดู `git status --short` ถ้ามีไฟล์ tracked นอกรายการ `Files` ของ task ถูกแก้ (รอบก่อนเคยเป็น `services/spark/schema_registry.json`) ให้ดู `git diff <ไฟล์>` ถ้าเป็นรายการของตารางที่แผนนี้สร้างซึ่งเอนจินเพิ่มเอง ให้คืนด้วย `git checkout -- <ไฟล์>` ถ้าเป็นอย่างอื่นให้หยุดและรายงาน

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `scripts/evaluation/run_scale_benchmark.py` | หา Git Bash ให้ถูกบน Windows, บันทึกสาเหตุเมื่อรันล้ม | 1 |
| `scripts/evaluation/tests/test_run_scale_benchmark.py` | เทสต์ของสองฟังก์ชันข้างบน | 1 |
| `docs/evaluation/evidence/d-scale.json`, `data/evaluation/output/bench_*.json` | ผล benchmark 4 ขนาด | 1 |
| `scripts/evaluation/source_inventory.py` | นับเอกสารจาก stream ใน Elasticsearch | 2 |
| `scripts/evaluation/build_rubric_report.py` | พิมพ์ตารางการนำเข้าจริงแยกตามแหล่ง, ประโยคเทียบผลวิเคราะห์กับข้อมูลอ้างอิง | 2, 3 |
| `scripts/evaluation/tests/test_build_rubric_report.py` | เทสต์ของส่วนที่เพิ่ม | 2, 3 |
| `docs/evaluation/evidence/d-source-inventory.json` | แหล่งข้อมูลและปริมาณหลังนำเข้าจริงครบ 4 ชนิด | 2 |
| `scripts/evaluation/utilization_report.py` | เทียบผลวิเคราะห์ ก่อน ETL / หลัง ETL / ข้อมูลอ้างอิง | 3 |
| `scripts/evaluation/tests/test_utilization_report.py` | เทสต์ของการเทียบ | 3 |
| `scripts/evaluation/run_batch_evaluation.sh` | ส่งไฟล์อ้างอิงและไฟล์ดิบให้ `utilization_report.py` | 3 |
| `docs/evaluation/d-utilization.md`, `docs/evaluation/evidence/d-utilization.json` | รายงานการใช้ประโยชน์ที่มีตารางเทียบ | 3 |
| `docs/evaluation/rubric-mapping.md` | รายงานเกณฑ์ (สร้างอัตโนมัติ) | 1, 2, 3 |
| `docs/presentation/04-numbers.md` | ตัวเลขทุกตัวที่ใช้ในสไลด์ พร้อมไฟล์ที่มา | 4 |
| `docs/presentation/05-slides.md` | เนื้อหาสไลด์ 12 หน้า | 5 |
| `docs/presentation/06-demo-runbook.md` | สคริปต์สาธิตและแผนสำรอง | 6 |

---

### Task 1: ผล benchmark ตามขนาดข้อมูลกลับมาเป็นของจริง

ปิดช่องว่างลำดับ 1 ของ spec: `docs/evaluation/rubric-mapping.md` แสดง `FAILED` ทั้ง 4 ขนาด สาเหตุ: เมื่อเรียก Python จาก PowerShell `shutil.which("bash")` คืน `C:\Windows\system32\bash.EXE` (ตัวเรียก WSL) แทน Git Bash สคริปต์จึงล้มใน 1 วินาทีโดยไม่มีข้อความ error

**Files:**
- Modify: `scripts/evaluation/run_scale_benchmark.py:19-24` (ค่าคงที่ `BASH`) และ `:57-62` (ใน `run_size`)
- Create: `scripts/evaluation/tests/test_run_scale_benchmark.py`
- Regenerate: `docs/evaluation/evidence/d-scale.json`, `data/evaluation/output/bench_10000.json`, `bench_100000.json`, `bench_500000.json`, `bench_1000000.json`, `docs/evaluation/rubric-mapping.md`

**Interfaces:**
- Produces:
  - `find_bash(platform=sys.platform, isfile=os.path.isfile, which=shutil.which, env=os.environ) -> str`
  - `failure_text(proc, bash) -> str` (`proc` มี `stdout`, `stderr`, `returncode`)
  - `d-scale.json`: list ของ `{"rows", "table", "state", "duration_seconds", "end_to_end_seconds", "total_records", "quarantined_records", "error"}` — Task 4 อ่านไฟล์นี้

- [ ] **Step 1: เขียนเทสต์ที่ fail** — สร้าง `scripts/evaluation/tests/test_run_scale_benchmark.py`

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from run_scale_benchmark import failure_text, find_bash

GIT_BASH = r"C:\Program Files\Git\bin\bash.exe"
WSL_LAUNCHER = r"C:\Windows\system32\bash.EXE"


def test_windows_prefers_git_bash_over_the_wsl_launcher():
    got = find_bash(platform="win32", isfile=lambda p: p == GIT_BASH, which=lambda _: WSL_LAUNCHER, env={})
    assert got == GIT_BASH


def test_windows_without_git_bash_falls_back_to_path():
    got = find_bash(platform="win32", isfile=lambda p: False, which=lambda _: WSL_LAUNCHER, env={})
    assert got == WSL_LAUNCHER


def test_other_platforms_use_path():
    got = find_bash(platform="linux", isfile=lambda p: True, which=lambda _: "/usr/bin/bash", env={})
    assert got == "/usr/bin/bash"


def test_override_wins():
    got = find_bash(platform="win32", isfile=lambda p: True, which=lambda _: WSL_LAUNCHER, env={"SDOQAP_BASH": "D:/tools/bash.exe"})
    assert got == "D:/tools/bash.exe"


class _Proc:
    def __init__(self, stdout, stderr, returncode):
        self.stdout, self.stderr, self.returncode = stdout, stderr, returncode


def test_failure_keeps_the_end_of_the_output():
    assert failure_text(_Proc("x" * 600, "run did not succeed\n", 1), "bash") == ("x" * 480) + "run did not succeed"


def test_empty_output_still_explains_the_failure():
    assert failure_text(_Proc("", None, 1), WSL_LAUNCHER) == f"exit code 1 from {WSL_LAUNCHER}"
```

- [ ] **Step 2: รันให้ fail**

Run: `python -m pytest -q scripts/evaluation/tests/test_run_scale_benchmark.py`
Expected: FAIL ตอน import ด้วย `ImportError: cannot import name 'failure_text' from 'run_scale_benchmark'`

- [ ] **Step 3: แก้ `scripts/evaluation/run_scale_benchmark.py`**

แทนสองบรรทัดนี้

```python
# On Windows a bare "bash" resolves to the WSL launcher in System32, not Git Bash.
BASH = shutil.which("bash") or "bash"
```

ด้วย

```python
GIT_BASH_PATHS = (r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files\Git\usr\bin\bash.exe")


def find_bash(platform=sys.platform, isfile=os.path.isfile, which=shutil.which, env=os.environ):
    """The bash that runs golden_run.sh. Started from PowerShell or cmd, a bare "bash" on
    Windows is the WSL launcher in System32, so Git Bash is looked up by path first.
    SDOQAP_BASH overrides the lookup."""
    if env.get("SDOQAP_BASH"):
        return env["SDOQAP_BASH"]
    if platform == "win32":
        for path in GIT_BASH_PATHS:
            if isfile(path):
                return path
    return which("bash") or "bash"


def failure_text(proc, bash):
    tail = ((proc.stdout or "") + (proc.stderr or ""))[-500:].strip()
    return tail or f"exit code {proc.returncode} from {bash}"


BASH = find_bash()
```

ใน `run_size` แทนสามบรรทัดนี้

```python
    proc = subprocess.run([BASH, "scripts/evaluation/golden_run.sh", table, csv_path, out_json],
                          capture_output=True, text=True, cwd=ROOT, env=env, stdin=subprocess.DEVNULL)
    elapsed = round(time.time() - started)
    if proc.returncode != 0:
        tail = (proc.stdout + proc.stderr)[-500:]
        return {"rows": n, "table": table, "state": "FAILED", "end_to_end_seconds": elapsed, "error": tail}
```

ด้วย (เพิ่ม `encoding`/`errors` เพราะคอนโซลภาษาไทยใช้ cp874 แล้วถอดรหัส output ของ Spark ไม่ได้ — F-24 ในรายงานทดสอบ)

```python
    proc = subprocess.run([BASH, "scripts/evaluation/golden_run.sh", table, csv_path, out_json],
                          capture_output=True, text=True, encoding="utf-8", errors="replace",
                          cwd=ROOT, env=env, stdin=subprocess.DEVNULL)
    elapsed = round(time.time() - started)
    if proc.returncode != 0:
        return {"rows": n, "table": table, "state": "FAILED", "end_to_end_seconds": elapsed,
                "error": failure_text(proc, BASH)}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `python -m pytest -q scripts/evaluation/tests`
Expected: `27 passed` (เดิม 21 + ใหม่ 6)

- [ ] **Step 5: ยืนยันว่าแก้ที่ต้นเหตุ** (PowerShell)

Run: `python -c "import sys; sys.path.insert(0, 'scripts/evaluation'); import run_scale_benchmark as r; print(r.BASH)"`
Expected: `C:\Program Files\Git\bin\bash.exe` (ก่อนแก้ได้ `C:\Windows\system32\bash.EXE`)

- [ ] **Step 6: รัน benchmark ทั้ง 4 ขนาด** (stack รันอยู่; ใช้เวลาราว 20 นาที ขนาด 1M ราว 8 นาที)

```bash
ls data/evaluation/scale/dirty_10000.csv data/evaluation/scale/dirty_1000000.csv || python scripts/evaluation/prepare_datasets.py
python scripts/evaluation/run_scale_benchmark.py
```

Expected: พิมพ์ 4 บรรทัด JSON ทุกบรรทัดมี `"state": "SUCCEEDED"` โดย `total_records` เป็น `10000`, `99100`, `495100`, `990100` และ `quarantined_records` เป็น `630`, `6238`, `31184`, `62373` (ค่าเดิมของ commit `3013226`; เวลาเดิมในเอนจิน 66 / 85 / 203 / 414 วินาที) ถ้าขนาดใดเป็น `FAILED` ให้คัดลอกค่า `error` มารายงาน ห้ามลบบรรทัดนั้นออก และห้ามกู้ไฟล์จาก commit เก่ามาแทน

- [ ] **Step 7: ตรวจข้อกำหนด TOR "ล้านแถวไม่เกิน 10 นาที"**

Run: `python -c "import json; d=json.load(open('docs/evaluation/evidence/d-scale.json')); print([(e['rows'], e['state'], e.get('duration_seconds'), e['end_to_end_seconds']) for e in d])"`
Expected: 4 รายการ `SUCCEEDED` และ `end_to_end_seconds` ของ 1,000,000 แถว < `600`

- [ ] **Step 8: สร้างรายงานเกณฑ์ใหม่**

```bash
python scripts/evaluation/build_rubric_report.py
grep -c "| SUCCEEDED |" docs/evaluation/rubric-mapping.md; grep -c "| FAILED |" docs/evaluation/rubric-mapping.md
```

Expected: `wrote docs/evaluation/rubric-mapping.md` แล้วได้ `4` และ `0` (ก่อนทำ task นี้ได้ `0` และ `4`)

- [ ] **Step 9: Commit**

```bash
git status --short
git add scripts/evaluation/run_scale_benchmark.py scripts/evaluation/tests/test_run_scale_benchmark.py docs/evaluation/evidence/d-scale.json data/evaluation/output/bench_10000.json data/evaluation/output/bench_100000.json data/evaluation/output/bench_500000.json data/evaluation/output/bench_1000000.json docs/evaluation/rubric-mapping.md
git commit -m "fix(eval): scale benchmark finds Git Bash from any Windows shell; results re-measured for all four sizes"
```

---

### Task 2: หลักฐานว่าใช้แหล่งข้อมูลครบ 4 ชนิดจริง

ปิดช่องว่างลำดับ 2 ของ spec: `d-source-inventory.json` บันทึกการนำเข้าจริงแค่ `file` และรายงานเกณฑ์ไม่ได้พิมพ์ตารางการนำเข้าแยกตามแหล่ง

**Files:**
- Modify: `scripts/evaluation/build_rubric_report.py:17-35` (ฟังก์ชัน `_sources`)
- Modify: `scripts/evaluation/source_inventory.py:66-87` (`_es_search_all`, `main`)
- Test: `scripts/evaluation/tests/test_build_rubric_report.py`
- Regenerate: `docs/evaluation/evidence/d-source-inventory.json`, `docs/evaluation/rubric-mapping.md`

**Interfaces:**
- Consumes: `scripts/qa/lib.sh` (`qa_login`, `api`, `apij`, `jget`, `envval`, `es`, `wait_run INGEST_ID [max_sec]`, `last_quality TABLE`)
- Produces: `d-source-inventory.json` มีคีย์เพิ่ม `"stream": {"index": "reddit", "documents": <int>}` และ `"ingestions": {"by_source": {"file"|"api"|"rdbms": {"ingestions", "succeeded", "bytes"}}}` — Task 4 อ่านทั้งสองคีย์

- [ ] **Step 1: เขียนเทสต์ที่ fail** — ต่อท้าย `scripts/evaluation/tests/test_build_rubric_report.py`

```python
def test_real_ingestions_are_listed_per_source():
    ev = dict(FULL)
    ev["d-source-inventory"] = dict(
        FULL["d-source-inventory"],
        ingestions={"by_source": {"rdbms": {"ingestions": 1, "succeeded": 1, "bytes": 50},
                                  "file": {"ingestions": 14, "succeeded": 12, "bytes": 1000}}, "total_bytes": 1050},
        stream={"index": "reddit", "documents": 56})
    md = render(ev)
    assert "| file | 14 | 12 | 1,000 |" in md and "| rdbms | 1 | 1 | 50 |" in md
    assert md.index("| file | 14") < md.index("| rdbms | 1")
    assert "`reddit`): 56 เอกสาร" in md


def test_no_ingestion_table_without_registry_evidence():
    assert "sdoqap_runs" not in render(FULL).split("### จำนวนกระบวนการ")[0]
```

- [ ] **Step 2: รันให้ fail**

Run: `python -m pytest -q scripts/evaluation/tests/test_build_rubric_report.py`
Expected: `test_real_ingestions_are_listed_per_source` FAIL ด้วย `AssertionError` (อีกข้อผ่านอยู่แล้ว)

- [ ] **Step 3: แก้ `_sources` ใน `scripts/evaluation/build_rubric_report.py`**

แทรกบล็อกนี้ก่อนบรรทัด `q = inv.get("quality_runs")`

```python
    by_source = (inv.get("ingestions") or {}).get("by_source")
    if by_source:
        lines += ["", "การนำเข้าจริงที่บันทึกใน run registry (`sdoqap_runs`) แยกตามชนิดแหล่ง:", "",
                  "| ชนิด | จำนวนครั้ง | สำเร็จ | ขนาดรวม (bytes) |", "|---|---:|---:|---:|"]
        lines += [f"| {k} | {v['ingestions']:,} | {v['succeeded']:,} | {v['bytes']:,} |" for k, v in sorted(by_source.items())]
        lines.append("")
    stream = inv.get("stream")
    if stream:
        lines.append(f"ข้อความจาก stream ที่ลง Elasticsearch (`{stream['index']}`): {stream['documents']:,} เอกสาร")
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `python -m pytest -q scripts/evaluation/tests`
Expected: `29 passed`

- [ ] **Step 5: ให้ `source_inventory.py` นับเอกสารของ stream**

เพิ่ม `import urllib.error` ใต้ `import sys` แล้วแทนฟังก์ชัน `_es_search_all` ทั้งตัวด้วย

```python
def _es_get(es_url, path, body=None):
    parsed = urlparse(es_url)
    base = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
    req = urllib.request.Request(f"{base}/{path}", data=body, headers={"Content-Type": "application/json"})
    if parsed.username:
        token = base64.b64encode(f"{parsed.username}:{parsed.password}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def _es_search_all(es_url, index):
    return [h["_source"] for h in _es_get(es_url, f"{index}/_search?size=10000", b'{"query":{"match_all":{}}}')["hits"]["hits"]]


def _es_count(es_url, index):
    try:
        return _es_get(es_url, f"{index}/_count")["count"]
    except urllib.error.HTTPError as e:
        if e.code == 404:  # the index is created by the first streaming batch
            return 0
        raise
```

และใน `main` เพิ่มบรรทัดนี้ใต้ `report["quality_runs"] = ...`

```python
        report["stream"] = {"index": "reddit", "documents": _es_count(a.es_url, "reddit")}
```

Run: `python -m pytest -q scripts/evaluation/tests`
Expected: `29 passed` (เทสต์เดิมของ `source_inventory` ยังผ่าน)

- [ ] **Step 6: โหลดข้อมูลจริง 10,000 แถวเข้า PostgreSQL** (ชุด Churn Modelling จาก Kaggle ที่มีใน repo)

```bash
source scripts/qa/lib.sh; CALLS=/dev/null
docker cp data/samples/Churn_Modelling.csv sdoqap-postgres:/tmp/churn_modelling.csv
docker exec sdoqap-postgres psql -U sdoqap -d sdoqap_oltp -c "create table if not exists churn_modelling (rownumber numeric, customerid numeric, surname text, creditscore numeric, geography text, gender text, age numeric, tenure numeric, balance numeric, numofproducts numeric, hascrcard numeric, isactivemember numeric, estimatedsalary numeric, exited numeric); truncate churn_modelling;"
docker exec sdoqap-postgres psql -U sdoqap -d sdoqap_oltp -c "\copy churn_modelling from '/tmp/churn_modelling.csv' csv header"
docker exec sdoqap-postgres psql -U sdoqap -d sdoqap_oltp -tAc "select count(*) from churn_modelling"
```

Expected: `COPY 10000` แล้ว `10000`

- [ ] **Step 7: นำเข้าจาก PostgreSQL ผ่านเส้นทางจริง**

```bash
source scripts/qa/lib.sh; CALLS=/dev/null
qa_login
PW=$(envval POSTGRES_PASSWORD); PW=${PW:-sdoqap}
BODY=$(printf '{"table_name":"churn_from_postgres","db_type":"postgresql","host":"postgres","port":5432,"username":"sdoqap","password":"%s","database":"sdoqap_oltp","query":"SELECT * FROM churn_modelling"}' "$PW")
RES=$(apij POST /api/v1/pipeline/ingest/rdbms -H 'Content-Type: application/json' -d "$BODY"); echo "$RES"
wait_run "$(echo "$RES" | jget ingest_id)" 600 && last_quality churn_from_postgres
```

Expected: `login HTTP 200`, `"status":"queued"`, `... -> SUCCEEDED after ...s` และ `total_records` = `10000` ถ้าได้ HTTP 400 ที่มีคำว่า `RDBMS_ALLOWED_HOSTS` แปลว่า `.env` ไม่ได้ตั้ง `RDBMS_ALLOWED_HOSTS=postgres` ให้หยุดและรายงาน (ค่าปัจจุบันใน `.env` ตั้งไว้แล้ว) ถ้า `total_records` ไม่ใช่ 10000 ให้จดค่าจริงและรายงาน ห้ามแก้ตัวเลขคาดหวัง

- [ ] **Step 8: นำเข้าจาก REST API (data.go.th)**

```bash
source scripts/qa/lib.sh; CALLS=/dev/null
qa_login >/dev/null
RES=$(apij POST /api/v1/pipeline/ingest/api -H 'Content-Type: application/json' -d '{"table_name":"gov_open_data","url":"https://data.go.th/api/3/action/datastore_search?resource_id=b5c54455-9447-407a-8002-7660703484d7&limit=50"}'); echo "$RES"
wait_run "$(echo "$RES" | jget ingest_id)" 600 && last_quality gov_open_data
```

Expected: `"status":"queued"` → `SUCCEEDED`, `total_records` = `11` (ชุดข้อมูลต้นทางมี 11 ระเบียนทั้งหมด ยืนยันไว้ใน `docs/testing/evidence/t3-gov-record-count.txt`) ถ้า data.go.th ตอบ 4xx/5xx หรือไม่มีอินเทอร์เน็ต ให้ข้ามขั้นนี้และจดว่า "API: ข้าม เพราะต้นทางไม่ตอบ" ไว้ใช้ใน Task 4

- [ ] **Step 9: รัน stream 60 วินาที**

```bash
source scripts/qa/lib.sh; CALLS=/dev/null
qa_login >/dev/null
BEFORE=$(es /reddit/_count | jget count); echo "before: ${BEFORE:-0}"
api POST /api/v1/pipeline/ingest/reddit -H 'Content-Type: application/json' -d '{"subreddits":"python","duration":60}'
for i in $(seq 1 40); do S=$(apij GET /api/v1/pipeline/ingest/reddit/status | jget status); [ "$S" = "running" ] || break; sleep 5; done; echo "status: $S"
es /reddit/_count | jget count
```

Expected: `HTTP 200`, `status: idle` และจำนวนสุดท้าย ≥ ค่า `before` (รอบก่อนหน้ามี 56 เอกสาร) ถ้า Reddit ไม่ตอบและจำนวนไม่เพิ่ม ให้ใช้จำนวนที่มีอยู่และจดไว้

- [ ] **Step 10: สร้างหลักฐานและรายงานใหม่**

```bash
source scripts/qa/lib.sh; CALLS=/dev/null
PW=$(envval ELASTICSEARCH_PASSWORD)
PYTHONUTF8=1 python scripts/evaluation/source_inventory.py --es-url "http://elastic:${PW}@localhost:9200" > docs/evaluation/evidence/d-source-inventory.json
python -c "import json; d=json.load(open('docs/evaluation/evidence/d-source-inventory.json', encoding='utf-8')); print(sorted(d['ingestions']['by_source'])); print(d['stream']); print(d['quality_runs'])"
python scripts/evaluation/build_rubric_report.py
grep -n "| api |\|| rdbms |\|| file |\|เอกสาร" docs/evaluation/rubric-mapping.md
```

Expected: บรรทัดแรกมีอย่างน้อย `'file'` และ `'rdbms'` (และ `'api'` ถ้า Step 8 ไม่ถูกข้าม) บรรทัด `stream` มี `documents` > 0 และ `grep` เจอแถวตารางของแต่ละชนิดกับบรรทัดจำนวนเอกสาร stream ตรวจด้วยตาว่าไฟล์ JSON ไม่มีรหัสผ่านอยู่ข้างใน: `grep -c "elastic:" docs/evaluation/evidence/d-source-inventory.json` ต้องได้ `0`

- [ ] **Step 11: Commit**

```bash
git status --short
git add scripts/evaluation/build_rubric_report.py scripts/evaluation/source_inventory.py scripts/evaluation/tests/test_build_rubric_report.py docs/evaluation/evidence/d-source-inventory.json docs/evaluation/rubric-mapping.md
git commit -m "feat(eval): rubric report lists real ingestions per source type and stream volume; inventory re-taken after API, RDBMS and stream runs"
```

---

### Task 3: รายงานการใช้ประโยชน์เทียบกับข้อมูลอ้างอิง

ปิดช่องว่างลำดับ 3 ของ spec: รายงานปัจจุบันสรุปเฉพาะข้อมูลหลัง ETL จึงมองไม่เห็นว่า ETL ทำให้ผลวิเคราะห์ดีขึ้นแค่ไหน และมองไม่เห็นว่ารายชื่อนักศึกษาที่ต้องติดตามหายไป

**Files:**
- Modify: `scripts/evaluation/utilization_report.py` (เพิ่ม `_overview`, `compare`, `render_comparison`; แทน `main`)
- Modify: `scripts/evaluation/build_rubric_report.py:123-129` (ฟังก์ชัน `_utilization`)
- Modify: `scripts/evaluation/run_batch_evaluation.sh:27`
- Test: `scripts/evaluation/tests/test_utilization_report.py`, `scripts/evaluation/tests/test_build_rubric_report.py`
- Regenerate: `docs/evaluation/d-utilization.md`, `docs/evaluation/evidence/d-utilization.json`, `docs/evaluation/rubric-mapping.md`

**Interfaces:**
- Consumes: `data/evaluation/output/active.csv` (ผลของรอบ `d-batch-run.json` มีอยู่ในเครื่องแล้ว ไม่ต้องรัน Spark ใหม่), `data/evaluation/original/clean_dataset.csv`, `data/evaluation/original/dirty_dataset.csv`
- Produces:
  - `compare(reference_rows, dirty_rows, clean_rows, pass_mark=50.0) -> dict` คีย์ `reference`, `before_etl`, `after_etl` (แต่ละตัวคือ `{"rows", "avg_score", "pass_rate", "below_pass_students"}`), `follow_up_truth`, `follow_up_found`, `follow_up_recall`
  - `render_comparison(c) -> str`
  - `d-utilization.json` มีคีย์เพิ่ม `"comparison"` รูปเดียวกับผลของ `compare` — Task 4 อ่านคีย์นี้
  - CLI: `python scripts/evaluation/utilization_report.py <active.csv> <out.md> <out.json> [<reference.csv> <dirty.csv>]`

- [ ] **Step 1: เขียนเทสต์ที่ fail** — ใน `scripts/evaluation/tests/test_utilization_report.py` แก้บรรทัด import เป็น

```python
from utilization_report import compare, render_comparison, render_markdown, summarize
```

แล้วต่อท้ายไฟล์

```python
REFERENCE = [
    {"student_id": "1", "course": "Python", "score": "80"},
    {"student_id": "2", "course": "Python", "score": "40"},
    {"student_id": "3", "course": "Stats", "score": "45"},
    {"student_id": "4", "course": "Stats", "score": "90"},
]
DIRTY = REFERENCE + [{"student_id": "5", "course": "Stats", "score": "-10"},
                     {"student_id": "6", "course": "Stats", "score": ""}]
CLEAN = [REFERENCE[0], REFERENCE[1], REFERENCE[3]]  # student 3, a real fail, was quarantined


def test_comparison_shows_what_etl_changed_and_what_it_lost():
    c = compare(REFERENCE, DIRTY, CLEAN)
    assert c["reference"] == {"rows": 4, "avg_score": 63.75, "pass_rate": 0.5, "below_pass_students": 2}
    assert c["before_etl"] == {"rows": 6, "avg_score": 49.0, "pass_rate": 0.4, "below_pass_students": 3}
    assert c["after_etl"] == {"rows": 3, "avg_score": 70.0, "pass_rate": 0.6667, "below_pass_students": 1}
    assert (c["follow_up_truth"], c["follow_up_found"], c["follow_up_recall"]) == (2, 1, 0.5)


def test_comparison_without_reference_fails_has_no_recall():
    c = compare([REFERENCE[0]], [REFERENCE[0]], [REFERENCE[0]])
    assert c["follow_up_truth"] == 0 and c["follow_up_recall"] is None
    assert "—" in render_comparison(c)


def test_comparison_is_rendered():
    md = render_comparison(compare(REFERENCE, DIRTY, CLEAN))
    assert "| หลัง ETL | 3 | 70.00 | 66.67% | 1 |" in md
    assert "อ้างอิง 2 คน หลัง ETL ยังพบ 1 คน (50.00%)" in md
```

(ค่าใน `before_etl`: คะแนนที่อ่านได้ 5 ค่า 80, 40, 45, 90, −10 เฉลี่ย 49.0 ผ่าน 2 จาก 5 ต่ำกว่าเกณฑ์ 3 คน)

- [ ] **Step 2: รันให้ fail**

Run: `python -m pytest -q scripts/evaluation/tests/test_utilization_report.py`
Expected: FAIL ตอน import ด้วย `ImportError: cannot import name 'compare' from 'utilization_report'`

- [ ] **Step 3: แก้ `scripts/evaluation/utilization_report.py`**

แก้ docstring บรรทัด Usage เป็น

```python
Usage: python scripts/evaluation/utilization_report.py <active.csv> <out.md> <out.json> [<reference.csv> <dirty.csv>]"""
```

เพิ่มสามฟังก์ชันนี้ก่อน `def main(argv):`

```python
def _overview(rows, pass_mark):
    scored = [(r, s) for r, s in ((r, _score(r)) for r in rows) if s is not None]
    n = len(scored)
    below = {r["student_id"] for r, s in scored if s < pass_mark}
    stats = {"rows": len(rows),
             "avg_score": round(sum(s for _, s in scored) / n, 2) if n else 0.0,
             "pass_rate": round(sum(1 for _, s in scored if s >= pass_mark) / n, 4) if n else 0.0,
             "below_pass_students": len(below)}
    return stats, below


def compare(reference_rows, dirty_rows, clean_rows, pass_mark=50.0):
    """The same analysis on the known-correct reference, the raw file and the pipeline's
    output, and how many of the reference's follow-up students the output still contains."""
    (ref, truth), (before, _), (after, kept) = (_overview(r, pass_mark) for r in (reference_rows, dirty_rows, clean_rows))
    found = truth & kept
    return {"reference": ref, "before_etl": before, "after_etl": after,
            "follow_up_truth": len(truth), "follow_up_found": len(found),
            "follow_up_recall": round(len(found) / len(truth), 4) if truth else None}


def render_comparison(c):
    names = (("reference", "ข้อมูลอ้างอิงที่ถูกต้อง"), ("before_etl", "ก่อน ETL (ข้อมูลดิบ)"), ("after_etl", "หลัง ETL"))
    recall = "—" if c["follow_up_recall"] is None else f"{c['follow_up_recall']:.2%}"
    lines = ["", "## เทียบผลวิเคราะห์ก่อนและหลัง ETL กับข้อมูลอ้างอิง", "",
             "| ชุดข้อมูล | แถว | คะแนนเฉลี่ย | อัตราผ่าน | นักศึกษาต่ำกว่าเกณฑ์ |", "|---|---:|---:|---:|---:|"]
    lines += [f"| {title} | {c[k]['rows']:,} | {c[k]['avg_score']:.2f} | {c[k]['pass_rate']:.2%} | {c[k]['below_pass_students']:,} |"
              for k, title in names]
    lines += ["", f"นักศึกษาที่ต้องติดตามตามข้อมูลอ้างอิง {c['follow_up_truth']:,} คน หลัง ETL ยังพบ {c['follow_up_found']:,} คน ({recall}) "
                  "ที่เหลือไม่อยู่ในข้อมูลสะอาด (ถูกกักกัน หรือเป็นแถวที่ชุดทดสอบใส่ปัญหาไว้)"]
    return "\n".join(lines) + "\n"


def _read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))
```

แล้วแทน `main` ทั้งฟังก์ชันด้วย

```python
def main(argv):
    active = _read(argv[1])
    summary = summarize(active)
    md = render_markdown(summary)
    if len(argv) > 5:
        summary["comparison"] = compare(_read(argv[4]), _read(argv[5]), active)
        md += render_comparison(summary["comparison"])
    with open(argv[2], "w", encoding="utf-8") as f:
        f.write(md)
    with open(argv[3], "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"{summary['rows']} rows, {len(summary['by_course'])} courses")
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `python -m pytest -q scripts/evaluation/tests/test_utilization_report.py`
Expected: `5 passed`

- [ ] **Step 5: เทสต์ที่ fail ของรายงานเกณฑ์** — ต่อท้าย `scripts/evaluation/tests/test_build_rubric_report.py`

```python
def test_utilization_is_compared_with_the_reference():
    ev = dict(FULL)
    ev["d-utilization"] = dict(FULL["d-utilization"], comparison={
        "reference": {"pass_rate": 0.9972}, "before_etl": {"pass_rate": 0.9894}, "after_etl": {"pass_rate": 0.9995},
        "follow_up_truth": 28, "follow_up_found": 5, "follow_up_recall": 0.1786})
    md = render(ev)
    assert "98.94%" in md and "99.95%" in md and "99.72%" in md and "พบ 5 จาก 28 คน" in md
```

Run: `python -m pytest -q scripts/evaluation/tests/test_build_rubric_report.py`
Expected: ข้อใหม่ FAIL ด้วย `AssertionError`

- [ ] **Step 6: แก้ `_utilization` ใน `scripts/evaluation/build_rubric_report.py`** — แทนทั้งฟังก์ชันด้วย

```python
def _utilization(ev):
    u = ev.get("d-utilization")
    if not u:
        return _missing("bash scripts/evaluation/run_batch_evaluation.sh")
    text = (f"ข้อมูลสะอาด {u['rows']:,} แถวของนักศึกษา {u['students']:,} คน ถูกนำไปสรุปคะแนนเฉลี่ยรายวิชา อัตราผ่าน "
            f"({u['pass_rate']:.2%}) การกระจายคะแนน และรายชื่อนักศึกษาที่ต้องติดตาม {len(u['follow_up_students']):,} คน — "
            "ดู [d-utilization.md](d-utilization.md)\n")
    c = u.get("comparison")
    if c:
        text += (f"\nเทียบกับข้อมูลอ้างอิง: อัตราผ่านก่อน ETL {c['before_etl']['pass_rate']:.2%} → หลัง ETL {c['after_etl']['pass_rate']:.2%} "
                 f"(ค่าจริง {c['reference']['pass_rate']:.2%}) · นักศึกษาที่ต้องติดตามพบ {c['follow_up_found']:,} จาก {c['follow_up_truth']:,} คน "
                 "เพราะแถวคะแนนต่ำที่ถูกต้องถูก Z-score กักกัน (ดูข้อจำกัด)\n")
    return text
```

และใน `render` เพิ่มข้อจำกัดหนึ่งบรรทัดต่อจากบรรทัดสุดท้ายของรายการ `"## ข้อจำกัดที่ทราบ"` (หลังบรรทัดที่ขึ้นต้นด้วย `"- เกณฑ์ IQR/Z-score ที่ใช้เป็นค่าของ test case นี้`)

```python
        "- Z-score 3σ ใช้กับทุกคอลัมน์ตัวเลขและตั้งรายคอลัมน์ไม่ได้ จึงกักกันคะแนนต่ำที่ถูกต้อง; ค่าว่างของ score ถูกเติม 0 แล้วจับด้วย IQR; แถวคีย์ซ้ำถูกตัดทิ้งโดยไม่เก็บใน quarantine",
```

- [ ] **Step 7: รันเทสต์ทั้งชุดให้ผ่าน**

Run: `python -m pytest -q scripts/evaluation/tests`
Expected: `33 passed`

- [ ] **Step 8: ให้การประเมินรอบถัดไปสร้างตารางเทียบเอง** — ใน `scripts/evaluation/run_batch_evaluation.sh` แทนบรรทัด

```bash
python scripts/evaluation/utilization_report.py "$OUT/active.csv" docs/evaluation/d-utilization.md "$EV/d-utilization.json"
```

ด้วย

```bash
python scripts/evaluation/utilization_report.py "$OUT/active.csv" docs/evaluation/d-utilization.md "$EV/d-utilization.json" \
  "$ORIG/clean_dataset.csv" "$ORIG/dirty_dataset.csv"
```

- [ ] **Step 9: สร้างรายงานจากผลของรอบประเมินที่มีอยู่**

```bash
python -c "import csv; print(sum(1 for _ in csv.DictReader(open('data/evaluation/output/active.csv', encoding='utf-8'))))"
PYTHONUTF8=1 python scripts/evaluation/utilization_report.py data/evaluation/output/active.csv docs/evaluation/d-utilization.md docs/evaluation/evidence/d-utilization.json data/evaluation/original/clean_dataset.csv data/evaluation/original/dirty_dataset.csv
tail -8 docs/evaluation/d-utilization.md
python scripts/evaluation/build_rubric_report.py
grep -n "พบ 5 จาก 28" docs/evaluation/rubric-mapping.md
```

Expected: บรรทัดแรก `9370` (ต้องตรงกับ `clean_records` ใน `d-batch-run.json`; ถ้าไม่ตรงหรือไม่มีไฟล์ ให้รัน `bash scripts/evaluation/run_batch_evaluation.sh` แทนขั้นนี้ทั้งขั้น) แล้ว `9370 rows, 5 courses` และตารางท้ายไฟล์ต้องเป็น

```text
| ข้อมูลอ้างอิงที่ถูกต้อง | 10,000 | 77.91 | 99.72% | 28 |
| ก่อน ETL (ข้อมูลดิบ) | 10,100 | 77.83 | 98.94% | 104 |
| หลัง ETL | 9,370 | 78.00 | 99.95% | 5 |

นักศึกษาที่ต้องติดตามตามข้อมูลอ้างอิง 28 คน หลัง ETL ยังพบ 5 คน (17.86%) ที่เหลือไม่อยู่ในข้อมูลสะอาด (ถูกกักกัน หรือเป็นแถวที่ชุดทดสอบใส่ปัญหาไว้)
```

`grep` ต้องเจอ 1 บรรทัด

- [ ] **Step 10: Commit**

```bash
git add scripts/evaluation/utilization_report.py scripts/evaluation/build_rubric_report.py scripts/evaluation/run_batch_evaluation.sh scripts/evaluation/tests/test_utilization_report.py scripts/evaluation/tests/test_build_rubric_report.py docs/evaluation/d-utilization.md docs/evaluation/evidence/d-utilization.json docs/evaluation/rubric-mapping.md
git commit -m "feat(eval): utilization report compares the analysis before and after ETL with the reference data"
```

---

### Task 4: ตารางตัวเลขสำหรับสไลด์ และผลชุดทดสอบล่าสุด

**Files:**
- Create: `docs/presentation/04-numbers.md`
- Regenerate: `docs/testing/evidence/t0-api-pytest.txt`, `t0-ui-vitest.txt`, `t0-eval-pytest.txt`, `t0-scripts-pytest.txt`, `t0-spark-unit.txt`

**Interfaces:**
- Consumes: `d-scale.json` (Task 1), `d-source-inventory.json` (Task 2), `d-utilization.json` คีย์ `comparison` (Task 3), `d-detection.json`, `d-detection-iqr1_5.json`, `d-batch-run.json`, `d-stage-list.json`
- Produces: `docs/presentation/04-numbers.md` — ตาราง `| รหัส | ตัวเลข | ค่า | ที่มา |` รหัส `N1`–`N16` ที่ Task 5 อ้างถึง

- [ ] **Step 1: รันชุดทดสอบทั้ง 5 ชุด** (ผลครั้งก่อนคือวันที่ 2026-10-01 ก่อน commit แก้บั๊กอีก 9 ตัว)

```bash
source scripts/qa/lib.sh; CALLS=/dev/null
docker compose run --rm --no-deps -v "$ROOT/services/api:/app" -w /app api sh -c "pip install -q --user pytest 'httpx<0.28' && python -m pytest -q -p no:cacheprovider tests" 2>&1 | tail -5 | tee "$EVID/t0-api-pytest.txt"
( cd services/ui && npm test ) 2>&1 | tail -8 | tee "$EVID/t0-ui-vitest.txt"
( cd scripts/evaluation && python -m pytest -q tests ) 2>&1 | tail -5 | tee "$EVID/t0-eval-pytest.txt"
python -m pytest -q scripts/qa/tests scripts/dev/tests 2>&1 | tail -3 | tee "$EVID/t0-scripts-pytest.txt"
docker compose exec -T -w /opt/spark-apps spark-master sh -c "python -m pip install -q pytest && python -m pytest -q -p no:cacheprovider tests/unit" 2>&1 | tail -8 | tee "$EVID/t0-spark-unit.txt"
```

Expected: ไม่มีคำว่า `failed` ในทั้ง 5 ไฟล์; eval ได้ `33 passed`; ค่าครั้งก่อนของชุดอื่น: API `156 passed`, UI `76 passed`, scripts `18 passed`, Spark `60 passed` (จำนวนอาจมากขึ้นจาก commit หลังวันที่ 2026-10-01) ถ้ามี `failed` ให้หยุดและรายงานชื่อเทสต์ ถ้า `import pyspark` ไม่เจอ ให้เติม `PYTHONPATH=/opt/bitnami/spark/python:$(ls /opt/bitnami/spark/python/lib/py4j-*.zip)` หน้า `python -m pytest`

- [ ] **Step 2: สร้าง `docs/presentation/04-numbers.md` จากหลักฐาน**

```bash
export PYTHONUTF8=1
KPI=$(curl -s http://localhost/api/v1/kpi/stats)
TESTS=$(for f in api-pytest ui-vitest eval-pytest scripts-pytest spark-unit; do printf '%s=%s; ' "$f" "$(grep -oE '[0-9]+ passed' docs/testing/evidence/t0-$f.txt | tail -1)"; done)
python - "$KPI" "$TESTS" > docs/presentation/04-numbers.md <<'EOF'
import datetime
import json
import sys

EV = "docs/evaluation/evidence/"


def load(name):
    with open(EV + name, encoding="utf-8") as f:
        return json.load(f)


kpi, tests = json.loads(sys.argv[1]), sys.argv[2]
run, det, old, scale = load("d-batch-run.json"), load("d-detection.json"), load("d-detection-iqr1_5.json"), load("d-scale.json")
util, inv, stages = load("d-utilization.json"), load("d-source-inventory.json"), load("d-stage-list.json")
c, cmp_ = det["confusion"], util["comparison"]
big = max(scale, key=lambda s: s["rows"])
with open(f"data/evaluation/output/bench_{big['rows']}.json", encoding="utf-8") as f:
    slow = sorted(json.load(f)["stage_seconds"].items(), key=lambda kv: -kv[1])[:3]
idle = [k for k, v in run["stage_seconds"].items() if v <= 0.01]
by_source = inv.get("ingestions", {}).get("by_source", {})
q = inv["quality_runs"]

rows = [
    ("N1", "ชุดประเมิน: แถวที่นับ → active / quarantine", f"{run['total_records']:,} → {run['clean_records']:,} / {run['quarantined_records']:,}", "d-batch-run.json"),
    ("N2", "Detection: recall / precision / accuracy", f"{det['recall']:.2%} / {det['precision']:.2%} / {det['accuracy']:.2%}", "d-detection.json"),
    ("N3", "Confusion: TP / FP / FN / TN", f"{c['tp']:,} / {c['fp']:,} / {c['fn']:,} / {c['tn']:,}", "d-detection.json"),
    ("N4", "IQR 1.5 → 3.0: false positive และ precision", f"{old['confusion']['fp']:,} → {c['fp']:,} แถว, {old['precision']:.2%} → {det['precision']:.2%}", "d-detection-iqr1_5.json, d-detection.json"),
    ("N5", "เวลาในเอนจินตามขนาด (วินาที)", " · ".join(f"{s['rows']:,}: {s.get('duration_seconds', s['state'])}" for s in scale), "d-scale.json"),
    ("N6", "เวลา end-to-end ตามขนาด (วินาที)", " · ".join(f"{s['rows']:,}: {s['end_to_end_seconds']}" for s in scale), "d-scale.json"),
    ("N7", f"stage ที่ช้าที่สุดที่ {big['rows']:,} แถว (วินาที)", ", ".join(f"{k} {v}" for k, v in slow), f"bench_{big['rows']}.json"),
    ("N8", "จำนวน stage / stage ที่ใช้เวลา ≤ 0.01 วินาทีในรอบประเมิน", f"{len(stages)} / {len(idle)} ({', '.join(idle)})", "d-stage-list.json, d-batch-run.json"),
    ("N9", "การนำเข้าจริงแยกตามแหล่ง (ครั้ง / สำเร็จ)", " · ".join(f"{k}: {v['ingestions']}/{v['succeeded']}" for k, v in sorted(by_source.items())), "d-source-inventory.json"),
    ("N10", "ข้อความจาก stream ใน Elasticsearch", f"{inv.get('stream', {}).get('documents', 0):,} เอกสาร", "d-source-inventory.json"),
    ("N11", "Spark สะสม: รอบ / ตาราง / แถว / รอบใหญ่สุด", f"{q['runs']:,} / {q['tables']:,} / {q['records_processed']:,} / {q['largest_run']:,}", "d-source-inventory.json"),
    ("N12", "KPI สด: แถวรวม / คะแนนเฉลี่ย / กักกัน", f"{kpi['total_records_ingested']:,} / {kpi['global_quality_score']} / {kpi['quarantined_records']:,}", "GET /api/v1/kpi/stats"),
    ("N13", "อัตราผ่าน: ก่อน ETL → หลัง ETL (ค่าจริง)", f"{cmp_['before_etl']['pass_rate']:.2%} → {cmp_['after_etl']['pass_rate']:.2%} ({cmp_['reference']['pass_rate']:.2%})", "d-utilization.json"),
    ("N14", "คะแนนเฉลี่ย: ก่อน ETL → หลัง ETL (ค่าจริง)", f"{cmp_['before_etl']['avg_score']:.2f} → {cmp_['after_etl']['avg_score']:.2f} ({cmp_['reference']['avg_score']:.2f})", "d-utilization.json"),
    ("N15", "นักศึกษาที่ต้องติดตาม: พบ / มีจริง", f"{cmp_['follow_up_found']} / {cmp_['follow_up_truth']}", "d-utilization.json"),
    ("N16", "ชุดทดสอบที่ผ่าน", tests.strip("; "), "docs/testing/evidence/t0-*.txt"),
]
print("# ตัวเลขสำหรับสไลด์")
print()
print(f"สร้างเมื่อ {datetime.date.today().isoformat()} จากไฟล์ใน `docs/evaluation/evidence/` และ API ของ stack ที่รันอยู่ ห้ามแก้ด้วยมือ สร้างใหม่ด้วยคำสั่งใน Task 4 ของ `docs/superpowers/plans/2026-10-02-committee-presentation-prep.md`")
print()
print("| รหัส | ตัวเลข | ค่า | ที่มา |")
print("|---|---|---|---|")
for r in rows:
    print("| " + " | ".join(r) + " |")
EOF
cat docs/presentation/04-numbers.md
```

Expected: ตาราง 16 แถว `N1`–`N16` โดย `N1` = `10,000 → 9,370 / 630`, `N2` = `100.00% / 95.89% / 99.70%`, `N3` = `700 / 30 / 0 / 9,370`, `N4` = `101 → 30 แถว, 87.39% → 95.89%`, `N8` ขึ้นต้นด้วย `21 / `, `N13` = `98.94% → 99.95% (99.72%)`, `N15` = `5 / 28` ถ้าสคริปต์ขึ้น `KeyError: 'comparison'` แปลว่า Task 3 ยังไม่เสร็จ ถ้าขึ้น `JSONDecodeError` ที่ `sys.argv[1]` แปลว่า API ไม่ตอบ ให้ตรวจ `docker compose ps`

- [ ] **Step 3: ตรวจว่าตัวเลขใน `docs/presentation/01`–`03` ยังตรง**

Run: `grep -n "414\|66 วิ\|3,576,836\|183 รอบ\|94.61\|169,851\|156\|76 \|60 " docs/presentation/01-system-explainer.md docs/presentation/02-committee-qa.md`
แล้วเทียบกับ `N5`, `N11`, `N12`, `N16` ทีละค่า ถ้าต่าง ให้แก้ค่าในเอกสารสองไฟล์นั้นให้เท่ากับ `04-numbers.md` (แก้เฉพาะตัวเลข) และถ้า Step 8 ของ Task 2 ถูกข้าม ให้เพิ่มประโยค "รอบล่าสุดไม่ได้นำเข้าจาก API เพราะต้นทางไม่ตอบ" ต่อท้ายคำตอบข้อ 6 ใน `02-committee-qa.md`

- [ ] **Step 4: Commit**

```bash
git add docs/presentation docs/testing/evidence/t0-api-pytest.txt docs/testing/evidence/t0-ui-vitest.txt docs/testing/evidence/t0-eval-pytest.txt docs/testing/evidence/t0-scripts-pytest.txt docs/testing/evidence/t0-spark-unit.txt
git commit -m "docs(presentation): system explainer, committee Q&A, rubric scorecard and the numbers table generated from evidence"
```

---

### Task 5: เนื้อหาสไลด์ 12 หน้า

สมมติฐาน: พรีเซนต์ 15 นาที + ถามตอบ ถ้าเวลาจริงสั้นกว่า ให้ตัดสไลด์ 2 และ 11 ก่อน โครงสไลด์ 6–9 ตรงกับ 6 หัวข้อของ `docs/requirements/Evalution_Guildline.md` (Objective, Scenario, Metrics, Before vs After, Results, Utilization)

**Files:**
- Create: `docs/presentation/05-slides.md`

**Interfaces:**
- Consumes: `docs/presentation/04-numbers.md` รหัส `N1`–`N16` (Task 4)
- Produces: `docs/presentation/05-slides.md` — เนื้อหาที่เจ้าของงานนำไปวางในเครื่องมือทำสไลด์ และ Task 6 อ้างตำแหน่ง "หลังสไลด์ 5"

- [ ] **Step 1: สร้าง `docs/presentation/05-slides.md`** ด้วยเนื้อหานี้ โดยแทนทุก `{N…}` ด้วยค่าในคอลัมน์ "ค่า" ของรหัสนั้นจาก `04-numbers.md` (คัดลอกตรงตัว ห้ามปัดหรือเปลี่ยนหน่วย)

```markdown
# SDOQAP — เนื้อหาสไลด์

ตัวเลขทุกตัวมาจาก [04-numbers.md](04-numbers.md) รหัสในวงเล็บท้ายบรรทัดคือที่มา

## 1. ชื่องาน (30 วินาที)
- SDOQAP: Scalable Data Observability and Quality Assurance Platform
- ETL ที่มีด่านตรวจคุณภาพเป็นแกน: ทุกแถวที่ถูกคัดออกมีเหตุผลกำกับ
- ชื่อผู้จัดทำ / อาจารย์ที่ปรึกษา / วันที่
พูด: "ระบบนี้ตอบคำถามเดียว: ข้อมูลที่กำลังจะใช้ เชื่อได้หรือไม่ และถ้าไม่ เพราะแถวไหน"

## 2. ปัญหา (45 วินาที)
- ข้อมูลเสียไหลเข้ารายงานโดยไม่มีใครรู้
- ต้นทางเปลี่ยนโครงสร้างตารางแล้ว pipeline พัง
- กฎคุณภาพฝังในโค้ด แก้ทีต้อง deploy ใหม่
ภาพ: ตัวอย่าง 5 แถวจาก `dirty_dataset.csv` ที่มีคะแนน −10, 150 และค่าว่าง

## 3. สถาปัตยกรรมและการไหลของข้อมูล (1.5 นาที)
- ภาพ: แผนภาพในหัวข้อ 3 ของ 01-system-explainer.md
- E: API รับ 4 ชนิดแหล่ง ให้ ingest_id ตรวจไฟล์ซ้ำ เข้าคิว → HDFS raw
- T: Spark 21 stage
- L: Delta active + quarantine, ผลลง Elasticsearch, ไฟล์ดิบย้ายไป archive
- ใช้: Dashboard, export, Trust-Check API
พูด: ชี้เส้นทางทีละช่วงตามลำดับ E → T → L

## 4. แหล่งข้อมูลและปริมาณ (1 นาที) — เกณฑ์ 10 คะแนน
- ตัวเชื่อม 4 ชนิด: ไฟล์ CSV/Excel · REST API (data.go.th) · PostgreSQL · Reddit → Kafka → Spark Streaming
- การนำเข้าจริงแยกตามแหล่ง: {N9}; stream {N10}
- Spark ประมวลผลสะสม: {N11}
- บอกตรงๆ: ปริมาณส่วนใหญ่มาจากไฟล์ และรอบ benchmark เป็นสำเนาของชุดประเมิน
ภาพ: ตาราง "การนำเข้าจริงแยกตามชนิดแหล่ง" จาก rubric-mapping.md

## 5. กระบวนการจัดการข้อมูล (1.5 นาที) — เกณฑ์ 15 คะแนน
- 21 stage ใน 5 กลุ่ม: จัดโครงสร้าง 3 · ทำความสะอาด 5 · ตรวจความผิดปกติ 4 · แยกโซน 1 · วัดผลหลังโหลด 8
- ทุก stage จับเวลาแยก และมี unit test
- กับชุดประเมิน: {N8} — stage ที่เหลือทำงานเมื่อข้อมูลมีลักษณะนั้น (วันที่ พ.ศ., schema เปลี่ยน, คอลัมน์มูลค่าเงิน)
ภาพ: ตาราง 5 กลุ่มจากหัวข้อ 5 ของ 01-system-explainer.md

## (สาธิตสด 4 นาที — ตาม 06-demo-runbook.md)

## 6. การประเมิน: วัตถุประสงค์และสถานการณ์ (1 นาที)
- ต้องการวัด: จับข้อมูลผิดได้ครบไหม จับผิดตัวไหม ใช้เวลาเท่าไร ข้อมูลที่ได้ใช้ต่อได้ไหม
- ชุดข้อมูล: คะแนนนักศึกษา 10,100 แถว = ถูกต้อง 9,400 + ค่าว่าง 300 + นอกช่วง 0–100 200 + outlier ชั่วโมงเรียน 100 + ซ้ำ 100
- มี ground truth รายแถว จึงวัด precision/recall ได้
- กฎ: score จำเป็น, score 0–100, student_id + course + semester ไม่ซ้ำ, IQR 3.0

## 7. ตัวชี้วัด และก่อน-หลัง (1 นาที)
- ตัวชี้วัด: recall, precision, accuracy, เวลาประมวลผล, ความตรงของผลวิเคราะห์ปลายทาง
- ก่อน: 10,100 แถว, score ว่าง 305, นอกช่วง 204, คีย์ซ้ำ 100, outlier 100, ช่วงคะแนน −10 ถึง 150
- หลัง: {N1}; แถวคีย์ซ้ำ 100 แถวถูกตัดก่อนนับ
ภาพ: แผนภูมิแท่งก่อน/หลัง

## 8. ผลการประเมิน (1.5 นาที) — เกณฑ์ transformation 10 + loading 5
- Detection: {N2} ({N3})
- การตั้งค่ามีผล: {N4}
- เวลาในเอนจิน: {N5}; คอขวด: {N7}
- ผ่านข้อกำหนด "ล้านแถวไม่เกิน 10 นาที" (end-to-end: {N6})
ภาพ: กราฟเส้นเวลา vs จำนวนแถว

## 9. การใช้ประโยชน์จากข้อมูล (1 นาที) — เกณฑ์ 5 คะแนน
- อัตราผ่าน: {N13} · คะแนนเฉลี่ย: {N14}
- ข้อมูลดิบมีคะแนน −10 ถึง 150 ปนอยู่ หลัง ETL ไม่มี
- ข้อค้นพบที่ต้องบอก: นักศึกษาที่ต้องติดตาม {N15} — แถวคะแนนต่ำที่ถูกต้องถูก Z-score กักกัน
- ปลายทางอื่น: Dashboard, export CSV, Trust-Check API
ภาพ: ตารางเทียบ 3 ชุดจาก d-utilization.md

## 10. นวัตกรรม (1 นาที) — เกณฑ์ 15 คะแนน
- อธิบายได้ทุกแถว: reject_reason รายแถว + เอนจินโต้ตอบที่บอกที่มาของกฎ
- กฎปรับตามข้อมูล: เกณฑ์ตามประวัติ, PSI ตรวจการกระจายเปลี่ยน, IQR/Z-score
- คนเป็นผู้อนุมัติ: schema drift และกฎที่ AI เสนอ ต้องผ่านการอนุมัติก่อนมีผล
- รองรับข้อมูลไทย: วันที่ พ.ศ., จัดหมวดข้อความไทยไม่เว้นวรรค
- ยังไม่ได้วัดผลของแต่ละฟีเจอร์แยกกัน

## 11. การทดสอบ (45 วินาที)
- ชุดทดสอบอัตโนมัติ: {N16}
- ทดสอบการใช้งานจริง 88 ข้อ ครอบคลุม API ทุกเส้น: ผ่าน 66, ไม่ผ่าน 18, ข้าม 4
- บั๊กระดับสูง 6 ตัวที่พบ แก้แล้วทั้งหมด (เช่น คีย์หลักเดาผิดทำให้ 1,030 แถวเหลือ 250)
- รายงานบันทึกข้อที่ไม่ผ่านตามจริง

## 12. ข้อจำกัดและงานต่อ (1 นาที)
- วัดความแม่นยำกับชุดสังเคราะห์ชุดเดียว
- Z-score กักกันคะแนนต่ำที่ถูกต้อง → ให้ตั้งรายคอลัมน์ได้ และเพิ่มโซนรอคนตรวจใน Spark
- ค่าว่างถูกเติม 0 แล้วจับด้วย IQR; แถวซ้ำไม่ถูกเก็บใน quarantine → เก็บพร้อมเหตุผลตรงตัว
- เอนจินโต้ตอบใช้ได้ทีละคน; Dashboard มีตัวกรองที่ยังไม่ทำงาน
- ยังไม่ได้วัด MTTD และผลของฟีเจอร์นวัตกรรม
พูด: "ข้อจำกัดทั้งหมดนี้เราวัดเองและมีตัวเลข"
```

- [ ] **Step 2: ตรวจว่าไม่เหลือรหัสที่ยังไม่ถูกแทน**

Run: `grep -c "{N[0-9]*}" docs/presentation/05-slides.md`
Expected: `0`

- [ ] **Step 3: ตรวจตัวเลขคงที่ในสไลด์ 6, 7, 11 กับหลักฐาน**

```bash
python -c "import json; print(json.load(open('docs/evaluation/evidence/d-profile-before.json')))"
grep -n "รวม 88 ข้อ" docs/testing/2026-10-01-real-use-test-report.md
```

Expected: `rows` 10100, `null_counts.score` 305, `invalid_score` 204, `duplicate_rows` 100, `study_hours_outliers` 100, `score_min` -10.0, `score_max` 150.0 และบรรทัด `รวม 88 ข้อ: **PASS 66 · FAIL 18 · SKIP 4**` ตรงกับสไลด์ 7 และ 11

- [ ] **Step 4: Commit**

```bash
git add docs/presentation/05-slides.md
git commit -m "docs(presentation): slide content with every number taken from the evidence table"
```

---

### Task 6: สคริปต์สาธิตและการซ้อม

เส้นทางสาธิตเลี่ยงสามจุดที่รู้ว่ามีปัญหา (spec ช่องว่างลำดับ 6): ปุ่ม "เชื่อมต่อและตรวจข้อมูล" ของแท็บ Database/API/Stream (โหมดสาธิต F-19), ตัวกรอง Time/Business Area และ breakdown บน Dashboard (F-22, F-23), ปุ่ม Generate ข้อเสนอ AI (F-6)

**Files:**
- Create: `docs/presentation/06-demo-runbook.md`
- Create: `docs/presentation/screenshots/01-home.png` … `07-trust-check.png` (ภาพสำรอง ถ่ายด้วยมือ)

**Interfaces:**
- Consumes: `scripts/qa/lib.sh`; ไฟล์สาธิต `data/samples/student_scores/student_scores_sample.csv` (1,030 แถว); ค่าที่คาดจากรายงานทดสอบ T11.3 (เอนจินโต้ตอบ 915 / 20 / 95) และหมายเหตุหลังแก้ F-2 (Spark นับ 1,000 แถว)
- Produces: `docs/presentation/06-demo-runbook.md`

- [ ] **Step 1: สร้าง `docs/presentation/06-demo-runbook.md`**

```markdown
# สคริปต์สาธิต (4 นาที)

เปิดเว็บที่ http://localhost (ถ้าตั้ง `NGINX_HOST_PORT` ใน `.env` ให้ใช้พอร์ตนั้น) ลำดับในสไลด์: หลังสไลด์ 5

## ก่อนเริ่ม 15 นาที

1. `docker compose ps` — ทุก container เป็น healthy (Spark master ใช้ราว 2 นาทีหลัง start)
2. เข้าสู่ระบบค้างไว้ที่หน้า Home
3. เปิดแท็บเบราว์เซอร์ที่สอง: `docs/evaluation/rubric-mapping.md`
4. เปิด terminal (Git Bash) ที่ root ของ repo แล้วรัน `source scripts/qa/lib.sh; CALLS=/dev/null; qa_login`
5. ตั้งชื่อตารางของรอบนี้ให้ไม่ซ้ำกับรอบซ้อม: `demo_scores`

## ขั้นตอน

| # | เวลา | ทำ | ต้องเห็น | พูด |
|---:|---|---|---|---|
| 1 | 0:00 | หน้า Home | บริการ ONLINE และ KPI รวม | "ระบบรันบน Docker ทั้งชุด ตัวเลขนี้คือทุกรอบที่ Spark ประมวลผล" |
| 2 | 0:20 | Data Ingestion → แท็บ File → เลือก `data/samples/student_scores/student_scores_sample.csv` → แก้ชื่อตารางเป็น `demo_scores` → กดปุ่มนำเข้า | โปรไฟล์ 1,030 แถว และข้อความว่าส่งเข้าคิวตรวจคุณภาพแล้ว | "ไฟล์เดียวไปสองทาง: โปรไฟล์ทันทีในหน้านี้ และเข้าคิว Spark" |
| 3 | 0:50 | Audit Trail (ระหว่างรอ Spark ราว 1–2 นาที) | กฎแต่ละข้อพร้อมเหตุผล และผลแบ่ง 3 โซน: 915 สะอาด / 20 รอตรวจ / 95 กักกัน | "ทุกกฎบอกที่มา: มาจากบริบทที่ผู้ใช้ให้ หรือจากสถิติของข้อมูล" |
| 4 | 1:50 | Jobs & Pipelines → กรองตาราง `demo_scores` | รอบสถานะ SUCCESS หรือ QUARANTINED จำนวนแถว 1,000 | "1,030 แถวมี 30 แถวคีย์ซ้ำ ถูกรวมตามคีย์หลัก เหลือ 1,000" |
| 5 | 2:20 | Workspace Exports → ตาราง `demo_scores` → layer Quarantine → Preview | คอลัมน์ `reject_reason` รายแถว | "แถวที่ไม่ผ่านไม่ถูกลบ เก็บพร้อมเหตุผล แก้แล้วนำกลับมาได้" |
| 6 | 2:50 | Data Ingestion → อัปโหลดไฟล์เดิม ชื่อตารางเดิม | ข้อความว่าไฟล์นี้เคยนำเข้าแล้ว (duplicate) | "ตรวจ checksum: ไฟล์เดิมไม่ถูกประมวลผลซ้ำ" |
| 7 | 3:15 | terminal: `apij GET /api/v1/lineage/demo_scores/trust-check` | JSON มี `is_safe_to_consume`, `quality_score`, `quality_threshold`, `recommendation` | "ระบบปลายทางถามก่อนใช้ข้อมูลได้ว่าตารางนี้ปลอดภัยไหม" |
| 8 | 3:40 | แท็บที่สอง: ตาราง benchmark ใน rubric-mapping.md | 4 ขนาด SUCCEEDED | "ไฟล์สาธิตเล็ก ส่วนนี้คือผลที่วัดถึงล้านแถว" |

## ห้ามกดระหว่างสาธิต

- ปุ่ม "เชื่อมต่อและตรวจข้อมูล" ในแท็บ Database / API / Stream (ขึ้นคำว่า "โหมดสาธิต")
- ตัวกรอง Time และ Business Area บนหน้า Dashboards (ไม่เปลี่ยนตัวเลข)
- ปุ่ม Generate ในส่วน AI proposals ของหน้า Expectations & Alerts (คืนข้อเสนอตัวอย่าง)

ถ้ากรรมการขอให้กด ให้กดและบอกว่าเป็นข้อจำกัดที่รู้แล้ว พร้อมรหัส F-19 / F-23 / F-6 ในรายงานทดสอบ

## แผนสำรอง

| อาการ | ทำ |
|---|---|
| หน้าเว็บไม่ขึ้น | เปิดภาพใน `docs/presentation/screenshots/` ตามลำดับ 01–07 แล้วเล่าต่อ |
| รอบ Spark ค้าง RUNNING เกิน 3 นาที | ข้ามไปขั้น 5 ด้วยตาราง `demo_rehearsal_2` ที่รันไว้แล้ว และบอกว่ารอบสดยังรันอยู่ |
| ขั้น 2 ขึ้น duplicate | ชื่อตารางซ้ำกับรอบซ้อม เปลี่ยนชื่อเป็น `demo_scores_2` แล้วนำเข้าใหม่ |
| trust-check ตอบ 404 | รอบยังไม่เสร็จ ใช้ `apij GET /api/v1/lineage/demo_rehearsal_2/trust-check` |

## หลังสาธิต

เอนจินโต้ตอบจะค้างอยู่กับไฟล์ที่อัปโหลด ถ้าต้องการกลับไปชุดประเมิน:
`api POST /api/v1/whitebox/state -H 'Content-Type: application/json' -d '{"dataset_source":"evaluation"}'`
```

- [ ] **Step 2: ซ้อมรอบที่ 1 ผ่าน API เพื่อยืนยันค่าที่คาดในตาราง**

```bash
source scripts/qa/lib.sh; CALLS=/dev/null
qa_login
RES=$(apij POST /api/v1/pipeline/ingest/csv -F "table_name=demo_rehearsal_1" -F "file=@data/samples/student_scores/student_scores_sample.csv"); echo "$RES"
ID=$(echo "$RES" | jget ingest_id)
wait_run "$ID" 600 && last_quality demo_rehearsal_1
RES2=$(apij POST /api/v1/pipeline/ingest/csv -F "table_name=demo_rehearsal_1" -F "file=@data/samples/student_scores/student_scores_sample.csv"); echo "$RES2" | jget status
apij GET /api/v1/lineage/demo_rehearsal_1/trust-check
```

Expected: `login HTTP 200`; `"status":"queued"`; `... -> SUCCEEDED after ...s`; `total_records` = `1000`; การอัปโหลดซ้ำได้ `duplicate`; trust-check คืน JSON ที่มีคีย์ `is_safe_to_consume`, `quality_score`, `quality_threshold`, `pending_schema_proposals`, `recommendation` จดเวลาที่ `wait_run` พิมพ์ (วินาที) ถ้า `total_records` ไม่ใช่ 1000 ให้แก้ตัวเลขในขั้น 4 ของ runbook เป็นค่าที่ได้จริงพร้อมคำอธิบายจาก `remediation_logs` และรายงาน

- [ ] **Step 3: ซ้อมรอบที่ 2 ผ่านหน้าเว็บ และถ่ายภาพสำรอง** (ทำโดยคน)

ทำตามตารางขั้นตอนใน runbook ด้วยชื่อตาราง `demo_rehearsal_2` จับเวลารวม ถ่ายภาพหน้าจอทุกขั้นบันทึกเป็น `docs/presentation/screenshots/01-home.png`, `02-ingestion-profile.png`, `03-audit-trail.png`, `04-pipeline-run.png`, `05-quarantine-preview.png`, `06-duplicate.png`, `07-trust-check.png`

Expected: เวลารวมไม่เกิน 5 นาที; ขั้น 3 เห็น 915 / 20 / 95; ขั้น 4 เห็น 1,000 แถว ถ้าข้อความบนหน้าจอขั้นใดไม่ตรงกับคอลัมน์ "ต้องเห็น" ให้แก้ runbook ให้ตรงกับที่เห็นจริง (แก้คำบรรยาย ไม่แก้ระบบ)

- [ ] **Step 4: ซ้อมถามตอบ** (ทำโดยคน)

ให้คนอื่นสุ่มถาม 10 ข้อจาก `docs/presentation/02-committee-qa.md` โดยต้องมีข้อ 6, 10, 12, 13, 22, 24 ตอบโดยไม่เปิดเอกสาร แล้วเปิดไฟล์หลักฐานที่คำตอบอ้างถึงให้ได้ภายใน 15 วินาทีต่อข้อ

Expected: ตอบตัวเลขถูกทั้ง 6 ตัวในเช็กลิสต์ท้าย `02-committee-qa.md`

- [ ] **Step 5: Commit**

```bash
git add docs/presentation/06-demo-runbook.md docs/presentation/screenshots
git commit -m "docs(presentation): demo runbook rehearsed against the live stack, with backup screenshots"
```

---

## ลำดับและเวลา

| Task | พึ่ง | เวลาโดยประมาณ |
|---|---|---|
| 1 Benchmark | — | 30 นาที + รัน 20 นาที |
| 2 แหล่งข้อมูล | — | 1 ชั่วโมง |
| 3 การใช้ประโยชน์ | — (แก้ `build_rubric_report.py` ไฟล์เดียวกับ Task 2 ให้ทำต่อกัน ไม่ทำขนาน) | 45 นาที |
| 4 ตัวเลข | 1, 2, 3 | 30 นาที |
| 5 สไลด์ | 4 | 1 ชั่วโมง + ทำสไลด์จริง |
| 6 สาธิต | 4 (ใช้ตาราง benchmark ของ Task 1 ในขั้น 8) | 1.5 ชั่วโมง |

ถ้าเวลาเหลือน้อยกว่าครึ่งวัน: ทำ Task 1 → Task 3 → Task 6 Step 1–3 และพูดจากเอกสาร `01`–`03` ที่มีอยู่แล้ว
