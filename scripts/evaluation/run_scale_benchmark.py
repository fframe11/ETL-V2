"""Processing time by dataset size (Evaluation Guideline Step 9).

Each size gets its own table (bench_<N>) with the same schema registry and rules as
student_course_scores. A size that fails or times out is recorded with the error, never
dropped, and results are written after every size so a crash keeps what was measured.

Usage: python scripts/evaluation/run_scale_benchmark.py [sizes...]   (default 10000 100000 500000 1000000)
Needs the stack running; run from the repo root.
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "evaluation", "evidence", "d-scale.json")
ES = f"http://localhost:{os.getenv('ES_HOST_PORT', '9200')}"
TEMPLATE_TABLE = "student_course_scores"
# On Windows a bare "bash" resolves to the WSL launcher in System32, not Git Bash.
BASH = shutil.which("bash") or "bash"


def _api_env(name):
    res = subprocess.run(["docker", "compose", "exec", "-T", "api", "printenv", name],
                         capture_output=True, text=True, cwd=ROOT, env=dict(os.environ, MSYS_NO_PATHCONV="1"))
    return res.stdout.strip()


def _es(method, path, password, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{ES}{path}", data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    token = base64.b64encode(f"elastic:{password}".encode()).decode()
    req.add_header("Authorization", f"Basic {token}")
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def copy_registry(table, password):
    for index in ("sdoqap_schema_registry", "sdoqap_rules_registry"):
        doc = _es("GET", f"/{index}/_doc/{TEMPLATE_TABLE}", password)["_source"]
        _es("PUT", f"/{index}/_doc/{table}?refresh=true", password, doc)


def run_size(n, password):
    table = f"bench_{n}"
    csv_path = os.path.join("data", "evaluation", "scale", f"dirty_{n}.csv")
    out_json = os.path.join(ROOT, "data", "evaluation", "output", f"bench_{n}.json")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    copy_registry(table, password)
    started = time.time()
    env = dict(os.environ, PYTHONUTF8="1", PYTHON=sys.executable)
    proc = subprocess.run([BASH, "scripts/evaluation/golden_run.sh", table, csv_path, out_json],
                          capture_output=True, text=True, cwd=ROOT, env=env, stdin=subprocess.DEVNULL)
    elapsed = round(time.time() - started)
    if proc.returncode != 0:
        tail = (proc.stdout + proc.stderr)[-500:]
        return {"rows": n, "table": table, "state": "FAILED", "end_to_end_seconds": elapsed, "error": tail}
    with open(out_json, encoding="utf-8") as f:
        run = json.load(f)
    return {"rows": n, "table": table, "state": "SUCCEEDED", "duration_seconds": run.get("duration_seconds"),
            "end_to_end_seconds": elapsed, "total_records": run.get("total_records"),
            "quarantined_records": run.get("quarantined_records"), "error": None}


def main(argv):
    sizes = [int(a) for a in argv[1:]] or [10000, 100000, 500000, 1000000]
    password = _api_env("ELASTICSEARCH_PASSWORD")
    results = []
    for n in sizes:
        entry = run_size(n, password)
        results.append(entry)
        print(json.dumps(entry, ensure_ascii=False), flush=True)
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv)
