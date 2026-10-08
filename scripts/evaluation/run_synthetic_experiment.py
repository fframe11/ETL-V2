"""Run one CSV through the real pipeline and append what was measured to e-runs.jsonl.

Measures only; never edits an earlier result. Each call adds one JSON line to
docs/evaluation/evidence/e-runs.jsonl with: run ids, row counts, quality score (system and
true clean-row rate), per-anomaly-type detection against ground truth, precision / recall / F1,
processing time, remediation and drift records written during the run.

Usage (stack running, repo root, Git Bash):
  python scripts/evaluation/run_synthetic_experiment.py --label d10k --table eval_cust_10000 \
      --csv data/evaluation/synthetic/customers_10000.csv --truth data/evaluation/synthetic/ground_truth_10000.csv
  python scripts/evaluation/run_synthetic_experiment.py --label drift_v1 --table eval_drift \
      --csv data/evaluation/synthetic/drift/v1_add_column.csv            (no --truth: counts and drift only)
"""
import argparse
import base64
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVIDENCE = os.path.join(ROOT, "docs", "evaluation", "evidence", "e-runs.jsonl")
ES = f"http://localhost:{os.getenv('ES_HOST_PORT', '9200')}"
BASH = shutil.which("bash") or "bash"
ENV = dict(os.environ, MSYS_NO_PATHCONV="1", PYTHONUTF8="1")


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, cwd=ROOT, env=ENV, stdin=subprocess.DEVNULL, **kw)


def es(password, method, path, body=None):
    req = urllib.request.Request(ES + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Basic " + base64.b64encode(f"elastic:{password}".encode()).decode()})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"hits": {"hits": []}}
        raise


def hits(password, index, query, size=200):
    res = es(password, "POST", f"/{index}/_search", {"size": size, "query": query})
    return sorted((h["_source"] for h in res["hits"]["hits"]), key=lambda d: str(d.get("timestamp") or d.get("proposed_at") or ""))


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def evaluate(input_rows, truth_rows, active, quarantine):
    """active: {rec_no}, quarantine: {rec_no: reason}. Everything else was dropped (dedup)."""
    by_rec = {r["rec_no"]: r for r in input_rows}
    groups = defaultdict(list)
    for r in input_rows:
        if r.get("customer_id"):
            groups[r["customer_id"]].append(r["rec_no"])
    collapsed = {}
    for members in groups.values():
        if len(members) > 1:
            kept = sum(m in active for m in members)
            for m in members:
                collapsed[m] = kept <= 1
    per_type = defaultdict(lambda: {"rows": 0, "flagged": 0})
    cm = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    fp_reasons, variants_ok = Counter(), [0, 0]
    for t in truth_rows:
        i, typ, bad = t["rec_no"], t["anomaly_type"], t["is_anomaly_ground_truth"] == "1"
        if typ == "duplicate":
            flagged = collapsed.get(i, False)
        elif i in collapsed and collapsed[i] and not bad:
            flagged = False  # the surviving/removed original of a resolved duplicate is not an error
        else:
            flagged = i not in active
        per_type[typ]["rows"] += 1
        per_type[typ]["flagged"] += int(flagged)
        if typ == "date_format_variant":
            variants_ok[1] += 1
            variants_ok[0] += int(i in active)
        if bad and flagged:
            cm["tp"] += 1
        elif bad:
            cm["fn"] += 1
        elif flagged:
            cm["fp"] += 1
            fp_reasons[quarantine.get(i, "dropped")[:70]] += 1
        else:
            cm["tn"] += 1
    tp, fp, fn, tn = cm["tp"], cm["fp"], cm["fn"], cm["tn"]
    prec = tp / (tp + fp) if tp + fp else None
    rec = tp / (tp + fn) if tp + fn else None
    f1 = 2 * prec * rec / (prec + rec) if prec and rec else None
    return {"confusion": cm, "precision": prec, "recall": rec, "f1": f1,
            "accuracy": (tp + tn) / sum(cm.values()) if sum(cm.values()) else None,
            "per_type": {k: dict(v, rate=round(v["flagged"] / v["rows"], 4)) for k, v in sorted(per_type.items())},
            "date_variants_accepted": {"in_active": variants_ok[0], "of": variants_ok[1]},
            "top_false_positive_reasons": dict(fp_reasons.most_common(8))}


def export_rows(table, run_id):
    out = tempfile.mkdtemp()
    sh(["docker", "compose", "exec", "-T", "spark-master", "rm", "-rf", "/tmp/eval_rows"])
    p = sh(["docker", "compose", "exec", "-T", "spark-master", "python", "/opt/spark-apps/scripts/export_run_rows.py",
            "--table", table, "--run-id", run_id, "--out", "/tmp/eval_rows"])
    if p.returncode != 0:
        raise RuntimeError("export failed: " + (p.stdout + p.stderr)[-400:])
    for layer in ("active", "quarantine"):
        sh(["docker", "compose", "cp", f"spark-master:/tmp/eval_rows/{layer}.csv", os.path.join(out, f"{layer}.csv")])
    return read_csv(os.path.join(out, "active.csv")), read_csv(os.path.join(out, "quarantine.csv"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--table", required=True)
    ap.add_argument("--csv", required=True)
    ap.add_argument("--truth")
    ap.add_argument("--note", default="")
    a = ap.parse_args()

    password = sh(["docker", "compose", "exec", "-T", "api", "printenv", "ELASTICSEARCH_PASSWORD"]).stdout.strip()
    t0 = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    started = time.time()
    first_json = os.path.join(tempfile.mkdtemp(), "first.json")
    proc = sh([BASH, "scripts/evaluation/golden_run.sh", a.table, a.csv, first_json])
    wall = round(time.time() - started, 1)
    rec = {"label": a.label, "table": a.table, "dataset": a.csv.replace("\\", "/"), "synthetic": True, "note": a.note,
           "started_utc": t0, "wall_seconds": wall, "input_rows": len(read_csv(a.csv))}
    if proc.returncode != 0:
        rec.update(state="FAILED", error=(proc.stdout + proc.stderr)[-500:])
    else:
        first = json.load(open(first_json, encoding="utf-8"))
        ingest_id = first["ingest_id"]
        runs = hits(password, "sdoqap_quality_runs", {"term": {"ingest_id.keyword": ingest_id}})
        last = runs[-1] if runs else first
        rec.update(state="SUCCEEDED", ingest_id=ingest_id, quality_docs=len(runs), revalidated=len(runs) > 1,
                   first_pass={k: first.get(k) for k in ("run_id", "total_records", "clean_records", "quarantined_records", "duration_seconds")},
                   final={k: last.get(k) for k in ("run_id", "total_records", "clean_records", "quarantined_records", "duration_seconds")},
                   stage_seconds=first.get("stage_seconds"), quarantine_breakdown=first.get("quarantine_breakdown"))
        tot, clean = last.get("total_records") or 0, last.get("clean_records") or 0
        rec["quality_score_system"] = round(100.0 * clean / tot, 3) if tot else None
        rec["clean_row_rate_of_input"] = round(100.0 * clean / rec["input_rows"], 3)
        rec["dedup_dropped"] = rec["input_rows"] - tot
        rec["records_per_second"] = round(tot / first["duration_seconds"], 1) if first.get("duration_seconds") else None
        rec["rows_recovered_by_revalidation"] = clean - (first.get("clean_records") or 0)
        rec["drift_records"] = [{"drift_details": h.get("drift_details"), "severity": h.get("drift_severity")}
                                for h in hits(password, "sdoqap_schema_drifts", {"bool": {"filter": [{"term": {"table_name.keyword": a.table}}, {"range": {"timestamp": {"gte": t0}}}]}})]
        rec["schema_proposals"] = [{"status": h.get("status"), "reason": h.get("rejection_reason")}
                                   for h in hits(password, "sdoqap_schema_proposals", {"bool": {"filter": [{"term": {"table_name.keyword": a.table}}, {"range": {"proposed_at": {"gte": t0}}}]}})]
        rec["ai_rule_proposals"] = [{"status": h.get("status"), "rule": h.get("rule_path") or h.get("rule")}
                                    for h in hits(password, "sdoqap_ai_rule_proposals", {"term": {"table_name.keyword": a.table}})]
        rec["remediation_docs"] = hits(password, "sdoqap_remediations", {"bool": {"filter": [{"term": {"table_name.keyword": a.table}}, {"range": {"timestamp": {"gte": t0}}}]}})
        log = sh(["docker", "compose", "logs", "--no-color", "--since", t0 + "Z", "spark-master"]).stdout
        rec["remediation_log_lines"] = [l.split("|", 1)[-1].strip()[:200] for l in log.splitlines() if "[REMEDIATION]" in l or "Auto-Remediation" in l][:12]
        if a.truth:
            active, quarantine = export_rows(a.table, last["run_id"])
            act = {r["rec_no"] for r in active}
            q = {r["rec_no"]: r.get("reject_reason", "") for r in quarantine}
            rec["exported_rows"] = {"active": len(active), "quarantine": len(quarantine)}
            rec["detection"] = evaluate(read_csv(a.csv), read_csv(a.truth), act, q)
    with open(EVIDENCE, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    brief = {k: rec.get(k) for k in ("label", "state", "input_rows", "quality_score_system", "clean_row_rate_of_input", "revalidated", "wall_seconds")}
    if "detection" in rec:
        brief.update({k: rec["detection"][k] for k in ("precision", "recall", "f1")})
    print(json.dumps(brief, ensure_ascii=False))


if __name__ == "__main__":
    main()
