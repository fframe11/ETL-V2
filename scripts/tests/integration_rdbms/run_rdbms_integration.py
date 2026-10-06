"""Integration test: Mock PostgreSQL (Docker) -> POST /api/v1/pipeline/ingest/rdbms -> HDFS -> Spark quality engine.

Nothing here replaces SDOQAP logic. The mock DB is only the source; every check goes through the
real API endpoint, the real WebHDFS landing, the real run registry and the real quality engine.

Usage (from this folder, after `docker compose ... up -d`, see README.md):
    python run_rdbms_integration.py [--api http://localhost:8012] [--wait 420] [--cleanup]

Writes evidence/report-default.{json,md} (or report-control.* with --control) next to this script.
"""
import argparse
import csv
import io
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE / "evidence"

MOCK = dict(container="sdoqap-mockdb", host="sdoqap-mockdb", port=5432,
            username="mock_user", password="mock_pass_123", database="mock_students",
            table="student_scores")
API_CONTAINER = "sdoqap-api-it"
COLUMNS = ["student_id", "name", "course", "semester", "score", "study_hours"]
QUERY = f"SELECT {', '.join(COLUMNS)} FROM {MOCK['table']} ORDER BY row_id"

RESULTS = []


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", **kw)


def psql(sql):
    r = sh(["docker", "exec", MOCK["container"], "psql", "-U", MOCK["username"], "-d", MOCK["database"],
            "-At", "-F", "|", "-c", sql])
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return [line for line in r.stdout.splitlines() if line != ""]


def api_py(code):
    """Run python inside the API container (it already has ES credentials and psycopg2)."""
    r = sh(["docker", "exec", API_CONTAINER, "python", "-c", code])
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-500:])
    return r.stdout


def env_value(name):
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"{name} missing from .env")


def record(tc, name, expected, actual, passed, evidence):
    RESULTS.append(dict(tc=tc, name=name, expected=expected, actual=actual,
                        result="PASS" if passed else "FAIL", evidence=evidence))
    print(f"[{'PASS' if passed else 'FAIL'}] {tc} {name}\n       expected: {expected}\n       actual:   {actual}")


def hdfs_cat(table, ingest_id):
    """Raw landing is /data/raw/<t>/<id>/<t>.csv; the engine moves it to /data/archive/<t>/<id>/ when done."""
    for base in ("/data/raw", "/data/archive"):
        r = sh(["docker", "exec", "sdoqap-namenode", "hdfs", "dfs", "-cat", f"{base}/{table}/{ingest_id}/{table}.csv"])
        if r.returncode == 0 and r.stdout:
            return base, r.stdout
    return None, None


def source_rows():
    """Read the source through psycopg2 inside the API container so Python types match the API's own read."""
    out = api_py(
        "import psycopg2,json,decimal;"
        f"c=psycopg2.connect(host='{MOCK['host']}',port={MOCK['port']},user='{MOCK['username']}',"
        f"password='{MOCK['password']}',database='{MOCK['database']}');cur=c.cursor();cur.execute({QUERY!r});"
        "print(json.dumps([[None if v is None else str(v) for v in r] for r in cur.fetchall()]))")
    return json.loads(out)


def es_docs(index, field, value):
    out = api_py(
        "import json;from app.api.config import get_es_client;es=get_es_client();"
        f"r=es.search(index={index!r},query={{'term':{{'{field}':{value!r}}}}},size=50);"
        "print(json.dumps([h['_source'] for h in r['hits']['hits']],default=str))")
    return json.loads(out)


def post_ingest(api, headers, **over):
    body = dict(table_name=over.pop("table_name"), db_type="postgresql", host=MOCK["host"], port=MOCK["port"],
                username=MOCK["username"], password=MOCK["password"], database=MOCK["database"], query=QUERY)
    body.update(over)
    return requests.post(f"{api}/api/v1/pipeline/ingest/rdbms", json=body, headers=headers, timeout=60)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8012")
    ap.add_argument("--wait", type=int, default=420, help="seconds to wait for the quality run")
    ap.add_argument("--cleanup", action="store_true", help="delete the test table through the real API afterwards")
    ap.add_argument("--control", action="store_true",
                    help="rewrite semester '2025-1' to the project's own format '1/2025' inside the SELECT")
    args = ap.parse_args()
    global QUERY
    if args.control:
        cols = [c if c != "semester" else r"regexp_replace(semester, '^(\d{4})-(\d)$', '\2/\1') AS semester" for c in COLUMNS]
        QUERY = f"SELECT {', '.join(cols)} FROM {MOCK['table']} ORDER BY row_id"
    api = args.api.rstrip("/")
    EVIDENCE.mkdir(exist_ok=True)
    headers = {"X-Service-Key": env_value("INGEST_SERVICE_KEY")}
    table = "itest_mockdb_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    ev = {}

    # TC1 Connect to Mock PostgreSQL (from the backend container, the environment the API really uses)
    try:
        who = api_py(
            "import psycopg2;"
            f"c=psycopg2.connect(host='{MOCK['host']}',port={MOCK['port']},user='{MOCK['username']}',"
            f"password='{MOCK['password']}',database='{MOCK['database']}',connect_timeout=3);cur=c.cursor();"
            "cur.execute('select current_database(),current_user,inet_server_addr(),version()');print(cur.fetchone())").strip()
        record("TC1", "Connect to Mock PostgreSQL from backend container",
               "psycopg2 connects to sdoqap-mockdb:5432 as mock_user", who[:160], "mock_students" in who, who[:160])
    except Exception as e:
        record("TC1", "Connect to Mock PostgreSQL from backend container", "connection succeeds", str(e), False, str(e))
        sys.exit("Mock DB unreachable; start it first (README.md)")

    # TC2 Query table (ground truth from the source)
    total = int(psql(f"SELECT COUNT(*) FROM {MOCK['table']}")[0])
    cols = [l.split("|") for l in psql(
        "SELECT column_name,data_type FROM information_schema.columns "
        f"WHERE table_name='{MOCK['table']}' ORDER BY ordinal_position")]
    pk = psql("SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) "
              f"WHERE i.indrelid='{MOCK['table']}'::regclass AND i.indisprimary")
    stats = psql(
        "SELECT COUNT(*)-COUNT(score), COUNT(*)-COUNT(name), COUNT(*)-COUNT(study_hours), COUNT(*)-COUNT(DISTINCT student_id), "
        "COUNT(*) FILTER (WHERE score<0 OR score>100), COUNT(*) FILTER (WHERE study_hours>168) "
        f"FROM {MOCK['table']}")[0].split("|")
    ev["source"] = dict(total=total, columns=cols, primary_key=pk, null_score=stats[0], null_name=stats[1],
                        null_hours=stats[2], duplicate_ids=stats[3], bad_score=stats[4], bad_hours=stats[5])
    record("TC2", "Query table", "20 rows; PK row_id; NULL score/name/hours = 1/1/1; duplicate student_id = 1; "
           "out-of-range score = 2, study_hours = 1", json.dumps(ev["source"]),
           total == 20 and pk == ["row_id"] and stats == ["1", "1", "1", "1", "2", "1"], json.dumps(ev["source"]))

    # TC3 Ingest through the real API
    t0 = time.time()
    r = post_ingest(api, headers, table_name=table)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    ev["ingest_response"] = body
    ingest_id = body.get("ingest_id")
    ok = (r.status_code == 202 and body.get("status") == "queued" and body.get("spark_triggered") is True and bool(ingest_id))
    record("TC3", "Ingest through API (POST /api/v1/pipeline/ingest/rdbms)",
           "HTTP 202, status=queued, ingest_id present, spark_triggered=true",
           f"HTTP {r.status_code} {json.dumps(body)[:300]}", ok, json.dumps(body))
    if not ingest_id:
        finish(ev, table)
        return

    # TC4 Row count: API response vs source vs landed CSV
    base, text = hdfs_cat(table, ingest_id)
    landed = list(csv.reader(io.StringIO(text))) if text else []
    landed_header, landed_rows = (landed[0], landed[1:]) if landed else ([], [])
    ev["landed"] = dict(hdfs_base=base, rows=len(landed_rows))
    record("TC4", "Verify row count", f"rows_ingested = SELECT COUNT(*) = rows in landed HDFS CSV = {total}",
           f"rows_ingested={body.get('rows_ingested')}, source={total}, hdfs_csv={len(landed_rows)} ({base})",
           body.get("rows_ingested") == total == len(landed_rows), json.dumps(ev["landed"]))

    # TC5 Schema
    record("TC5", "Verify schema", f"CSV header = query columns {COLUMNS}", f"header={landed_header}",
           landed_header == COLUMNS, f"header={landed_header}")

    # TC6 Data equality (None is written by csv.writer as an empty field)
    expected = [["" if v is None else v for v in row] for row in source_rows()]
    same = landed_rows == expected
    diffs = [(i, a, b) for i, (a, b) in enumerate(zip(landed_rows, expected)) if a != b][:3]
    ev["sample"] = landed_rows[:3]
    record("TC6", "Verify data", "every landed row equals the source row (incl. NULLs, duplicate, out-of-range)",
           "identical, 20/20 rows" if same else f"differs: {diffs}", same,
           f"sample={landed_rows[:3]} nulls={landed_rows[14:16]} dup={landed_rows[16]} out_of_range={landed_rows[17:20]}"
           if len(landed_rows) == 20 else f"landed {len(landed_rows)} rows")

    # TC7 Pipeline / run status + quality engine
    deadline = time.time() + args.wait
    run = {}
    while time.time() < deadline:
        try:  # the API can answer slowly while Spark is saturating Elasticsearch
            run = requests.get(f"{api}/api/v1/pipeline/runs/{ingest_id}", timeout=45).json()
        except requests.RequestException:
            time.sleep(5)
            continue
        if run.get("state") in ("SUCCEEDED", "FAILED", "SKIPPED", "TRIGGER_FAILED"):
            break
        time.sleep(5)
    q = es_docs("sdoqap_quality_runs", "table_name.keyword", table)
    qd = q[0] if q else {}
    ev["run"] = run
    ev["quality"] = {k: qd.get(k) for k in ("total_records", "clean_records", "quarantined_records", "quality_score",
                                             "run_id", "ingest_id", "timestamp") if k in qd}
    record("TC7", "Verify pipeline / run status and quality engine",
           "run state QUEUED -> SUCCEEDED (source=rdbms, table_name matches) and a sdoqap_quality_runs document exists",
           f"state={run.get('state')} source={run.get('source')} size={run.get('size_bytes')} "
           f"elapsed={round(time.time() - t0)}s quality={json.dumps(ev['quality'])}",
           run.get("state") == "SUCCEEDED" and run.get("source") == "rdbms" and bool(qd), json.dumps({"run": run, "quality": ev["quality"]}, default=str))

    # TC7b Quality engine accounting. The engine de-duplicates on its inferred primary key, so the
    # expected total is the source rows minus the seeded duplicates.
    if qd:
        dups = int(ev["source"]["duplicate_ids"])
        tr, cr, qr = qd.get("total_records"), qd.get("clean_records"), qd.get("quarantined_records")
        logs = qd.get("remediation_logs") or []
        record("TC7b", "Quality engine accounting",
               f"total_records = {total} - {dups} duplicate = {total - dups}, remediation log 'resolved_{dups}_duplicates', "
               "clean + quarantined = total_records",
               f"total={tr} clean={cr} quarantined={qr} score={qd.get('quality_score')} remediation={logs}",
               tr == total - dups and f"resolved_{dups}_duplicates" in logs and cr is not None and qr is not None and cr + qr == tr,
               json.dumps(ev["quality"], default=str))
        bd = qd.get("quarantine_breakdown") or {}
        ev["quarantine_breakdown"] = bd
        ev["null_profile"] = qd.get("null_profile")
        # Seeded defects: NULL name (1 row), NULL score, NULL study_hours, score 150 and -5, study_hours 999.
        record("TC7c", "Quality engine detects the seeded NULL name",
               "quarantine_breakdown contains null_value_in_name = 1",
               f"quarantine_breakdown={json.dumps(bd)}", bd.get("null_value_in_name") == 1, json.dumps(bd))
        record("TC7d", "Quality engine clean rows",
               "at least the 14 normal rows are clean (clean_records >= 14)",
               f"clean_records={cr}, "
               f"quarantine_breakdown={json.dumps(bd)}", cr is not None and cr >= 14, json.dumps(bd))

    # TC8 Error handling
    before = len(es_docs("sdoqap_runs", "table_name.keyword", table))
    cases = [
        ("TC8a", "wrong password", dict(password="definitely-wrong"), 502, "PostgreSQL fetch failed"),
        ("TC8b", "table does not exist", dict(query="SELECT * FROM no_such_table"), 502, "does not exist"),
        ("TC8c", "host not in RDBMS_ALLOWED_HOSTS", dict(host="evil.example"), 400, "allowlist"),
        ("TC8d", "non-SELECT statement", dict(query=f"DELETE FROM {MOCK['table']}"), 400, "Only SELECT"),
        ("TC8e", "unsupported db_type", dict(db_type="mysql"), 400, "Only 'postgresql'"),
        ("TC8f", "query returns no rows", dict(query=f"SELECT * FROM {MOCK['table']} WHERE 1=0"), 400, "no rows"),
        ("TC8g", "wrong port (unreachable DB)", dict(port=5999), 502, "PostgreSQL fetch failed"),
    ]
    for tc, label, over, want, needle in cases:
        resp = post_ingest(api, headers, table_name=table + "_err", **over)
        detail = resp.json().get("detail", "") if resp.headers.get("content-type", "").startswith("application/json") else resp.text
        ok = resp.status_code == want and needle.lower() in str(detail).lower() and "Traceback" not in resp.text \
            and MOCK["password"] not in resp.text and "definitely-wrong" not in resp.text
        record(tc, f"Error handling: {label}", f"HTTP {want}, message contains '{needle}', no stack trace, no password echoed",
               f"HTTP {resp.status_code} {str(detail)[:200]}", ok, f"HTTP {resp.status_code} {detail}")
    noauth = requests.post(f"{api}/api/v1/pipeline/ingest/rdbms", json=dict(
        table_name=table + "_err", host=MOCK["host"], port=MOCK["port"], username=MOCK["username"],
        password=MOCK["password"], database=MOCK["database"], query=QUERY), timeout=15)
    record("TC8h", "Error handling: no credentials for the API", "HTTP 401", f"HTTP {noauth.status_code}", noauth.status_code == 401,
           f"HTTP {noauth.status_code} {noauth.text[:120]}")
    dup = post_ingest(api, headers, table_name=table)
    dbody = dup.json()
    record("TC8i", "Re-ingesting identical data is detected", "HTTP 200, status=duplicate, same ingest_id, spark_triggered=false",
           f"HTTP {dup.status_code} {json.dumps(dbody)[:200]}",
           dup.status_code == 200 and dbody.get("status") == "duplicate" and dbody.get("ingest_id") == ingest_id
           and dbody.get("spark_triggered") is False, json.dumps(dbody))
    after = len(es_docs("sdoqap_runs", "table_name.keyword", table))
    health = requests.get(f"{api}/healthz", timeout=10).status_code
    still = requests.get(f"{api}/api/v1/pipeline/runs/{ingest_id}", timeout=15).json().get("state")
    record("TC8j", "Failed requests leave the pipeline intact",
           "no extra run documents, API healthy, original run state unchanged",
           f"runs before={before} after={after}, /healthz={health}, run state={still}",
           before == after == 1 and health == 200 and still == run.get("state"), f"runs {before}->{after}")

    finish(ev, table, cleanup=args.cleanup, api=api)


def finish(ev, table, cleanup=False, api=None):
    mode = "control" if "regexp_replace" in QUERY else "default"
    if cleanup and api:
        try:
            s = requests.Session()
            s.post(f"{api}/api/v1/auth/login", json=dict(username=env_value("ADMIN_USERNAME"),
                                                         password=env_value("ADMIN_PASSWORD")), timeout=15)
            d = s.delete(f"{api}/api/v1/export/tables/{table}", timeout=60)
            print(f"[cleanup] DELETE /api/v1/export/tables/{table} -> HTTP {d.status_code}")
        except Exception as e:
            print(f"[cleanup] failed: {e}")
    passed = sum(1 for r in RESULTS if r["result"] == "PASS")
    (EVIDENCE / f"report-{mode}.json").write_text(json.dumps(dict(table=table, summary=f"{passed}/{len(RESULTS)} PASS",
                                                          results=RESULTS, evidence=ev), indent=2, default=str), encoding="utf-8")
    lines = [f"# RDBMS ingestion integration test ({table})", "", f"Result: {passed}/{len(RESULTS)} PASS", "",
             "| Test case | Expected | Actual | Result |", "|---|---|---|---|"]
    for r in RESULTS:
        esc = lambda s: str(s).replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {r['tc']} {esc(r['name'])} | {esc(r['expected'])} | {esc(r['actual'])} | {r['result']} |")
    (EVIDENCE / f"report-{mode}.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\n{passed}/{len(RESULTS)} PASS. Evidence: {EVIDENCE}")
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    main()
