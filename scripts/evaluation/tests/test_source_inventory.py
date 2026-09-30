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
