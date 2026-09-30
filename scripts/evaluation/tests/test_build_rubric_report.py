import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from build_rubric_report import render

FULL = {
    "d-source-inventory": {"connectors": [{"type": "file", "name": "CSV", "endpoint": "e", "code": "c"}],
                           "dataset_files": [{"path": "data/x.csv", "rows": 10, "columns": 2, "bytes": 5}],
                           "quality_runs": {"tables": 3, "runs": 7, "records_processed": 12345, "largest_run": 10100}},
    "d-stage-list": [{"order": 1, "name": "schema_align", "title": "จัดชื่อ", "phase": "align"}],
    "d-profile-before": {"rows": 10100, "null_counts": {"score": 300}, "invalid_score": 200, "duplicate_rows": 100, "study_hours_outliers": 100},
    "d-batch-run": {"total_records": 10000, "clean_records": 9400, "quarantined_records": 600, "duration_seconds": 42.5,
                    "stage_seconds": {"schema_align": 1.0}},
    "d-detection": {"per_type": {"Duplicate": {"actual": 100, "detected": 100, "rate": 1.0}},
                    "precision": 0.98, "recall": 0.97, "accuracy": 0.99, "confusion": {"tp": 1, "fp": 0, "fn": 0, "tn": 1}},
    "d-scale": [{"rows": 10000, "state": "SUCCEEDED", "duration_seconds": 40.0, "end_to_end_seconds": 90},
                {"rows": 1000000, "state": "FAILED", "error": "OOM"}],
    "d-utilization": {"rows": 9400, "students": 5000, "pass_rate": 0.8, "by_course": [], "follow_up_students": ["1"]},
    "b-e2e-ingest-check": "PASS distinct ingest ids\nPASS duplicate detected\n",
    "c-golden-before": {"total_records": 1}, "c-golden-after": {"total_records": 1},
}


def test_every_rubric_criterion_has_a_section():
    md = render(FULL)
    for title in ("จำนวนแหล่งข้อมูลและปริมาณข้อมูล", "จำนวนกระบวนการในการจัดการข้อมูล", "Data extraction",
                  "Data transformation", "Data loading", "ประสิทธิผลของการใช้ประโยชน์จากข้อมูล", "CLO6"):
        assert title in md


def test_numbers_come_from_evidence():
    md = render(FULL)
    assert "12,345" in md and "10,100" in md and "42.5" in md and "0.97" in md
    assert "FAILED" in md and "OOM" in md


def test_missing_evidence_is_stated_not_invented():
    md = render({})
    assert md.count("ยังไม่มีหลักฐาน") >= 5
    assert "run_batch_evaluation.sh" in md
