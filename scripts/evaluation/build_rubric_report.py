"""Render docs/evaluation/rubric-mapping.md from the evidence files. Every number printed
here is read from docs/evaluation/evidence/; missing evidence is reported as missing."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVIDENCE = os.path.join(ROOT, "docs", "evaluation", "evidence")
OUT = os.path.join(ROOT, "docs", "evaluation", "rubric-mapping.md")
NAMES = ("d-source-inventory", "d-stage-list", "d-profile-before", "d-batch-run", "d-detection", "d-scale",
         "d-utilization", "d-detection-iqr1_5", "d-batch-run-iqr1_5", "c-golden-before", "c-golden-after")


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


def _detection_table(det):
    lines = ["| ชนิดปัญหา | จริง | ตรวจพบ | อัตรา |", "|---|---:|---:|---:|"]
    for t, v in det["per_type"].items():
        rate = "—" if v["rate"] is None else f"{v['rate']:.2%}"
        lines.append(f"| {t} | {v['actual']:,} | {v['detected']:,} | {rate} |")
    c = det["confusion"]
    lines += ["", f"precision {det['precision']} · recall {det['recall']} · accuracy {det['accuracy']} "
                  f"(TP {c['tp']:,}, FP {c['fp']:,}, FN {c['fn']:,}, TN {c['tn']:,})"]
    return lines


def _transformation(ev):
    before, det = ev.get("d-profile-before"), ev.get("d-detection")
    if not before or not det:
        return _missing("bash scripts/evaluation/run_batch_evaluation.sh")
    lines = ["**ก่อน transform** (`d-profile-before.json`): "
             f"{before['rows']:,} แถว, score ว่าง {before['null_counts'].get('score', 0):,}, score นอกช่วง {before['invalid_score']:,}, "
             f"คีย์ซ้ำ {before['duplicate_rows']:,}, study_hours outlier {before['study_hours_outliers']:,}", "",
             "**Detection เทียบ ground truth** (`d-detection.json`, IQR multiplier ตามค่าใน `services/spark/rules_config.json`):", ""]
    lines += _detection_table(det)
    if det.get("false_positive_reasons"):
        top = list(det["false_positive_reasons"].items())[:3]
        lines += ["", "สาเหตุ false positive อันดับต้น: " + "; ".join(f"`{k}` ×{v}" for k, v in top)]
    old = ev.get("d-detection-iqr1_5")
    if old:
        lines += ["", "**เปรียบเทียบการตั้งค่า IQR** (ค่าตั้งของ test case นี้ ไม่ใช่ค่าที่ถูกต้องสำหรับข้อมูลทุกชนิด):", "",
                  "| IQR multiplier | precision | recall | accuracy | false positive |", "|---|---:|---:|---:|---:|",
                  f"| 1.5 | {old['precision']} | {old['recall']} | {old['accuracy']} | {old['confusion']['fp']:,} |",
                  f"| 3.0 | {det['precision']} | {det['recall']} | {det['accuracy']} | {det['confusion']['fp']:,} |"]
    gb, ga = ev.get("c-golden-before"), ev.get("c-golden-after")
    if gb and ga:
        same = all(gb.get(k) == ga.get(k) for k in ("total_records", "clean_records", "quarantined_records", "quarantine_breakdown"))
        lines += ["", f"Golden test ก่อน/หลังแยก stage: {'ตรงกันทุกตัวเลข' if same else 'ไม่ตรงกัน — ดูไฟล์ c-golden-*.json'}"]
    return "\n".join(lines) + "\n"


def _loading(ev):
    run = ev.get("d-batch-run")
    lines = ["- เขียน quarantine แบบ idempotent (ลบตาม `ingest_id` แล้วเขียนใหม่) **ก่อน** Delta MERGE, ย้าย raw ไป `/data/archive/` แทนการลบ, lock มี heartbeat, สถานะ QUEUED→RUNNING→SUCCEEDED/FAILED/SKIPPED ใน `sdoqap_runs`"]
    if run:
        total = run["clean_records"] + run["quarantined_records"]
        lines.append(f"- รอบประเมิน: รับเข้า {run['total_records']:,} แถว → active {run['clean_records']:,} + quarantine "
                     f"{run['quarantined_records']:,} ({'ครบถ้วน' if total == run['total_records'] else 'ไม่ครบ'}), "
                     f"เวลาใน engine {run['duration_seconds']} วินาที")
    else:
        lines.append(_missing("bash scripts/evaluation/run_batch_evaluation.sh"))
    scale = ev.get("d-scale")
    if scale:
        lines += ["", "| แถว | สถานะ | เวลาใน engine (s) | end-to-end (s) | หมายเหตุ |", "|---:|---|---:|---:|---|"]
        for s in scale:
            lines.append(f"| {s['rows']:,} | {s['state']} | {s.get('duration_seconds', '—')} | {s.get('end_to_end_seconds', '—')} | {(s.get('error') or '')[:80]} |")
    else:
        lines.append(_missing("python scripts/evaluation/run_scale_benchmark.py"))
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
        "- ฟอร์มนำเข้าในหน้า Data Ingestion เรียกเอนจินโต้ตอบเท่านั้น การนำเข้า HDFS/Spark ใช้ผ่าน API, n8n หรือ `test_data_source.bat`",
        "- เกณฑ์ IQR/Z-score ที่ใช้เป็นค่าของ test case นี้ ไม่ใช่ค่าที่ถูกต้องสำหรับข้อมูลทุกประเภท",
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
