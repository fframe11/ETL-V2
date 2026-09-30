"""Inventory of data sources and volumes for the rubric's 'sources and volume' criterion.
Usage: python scripts/evaluation/source_inventory.py [--es-url http://elastic:PW@localhost:9200]"""
import argparse
import base64
import csv
import json
import os
import sys
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
    sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp874/cp1252
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
