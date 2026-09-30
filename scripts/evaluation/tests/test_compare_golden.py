import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from compare_golden import diff_runs

BASE = {"total_records": 10, "clean_records": 8, "quarantined_records": 2,
        "quarantine_breakdown": {"duplicate_records": 2}, "duration_seconds": 5.0}


def test_identical_runs_have_no_diff():
    assert diff_runs(BASE, dict(BASE, duration_seconds=9.9)) == []


def test_count_change_is_reported():
    diffs = diff_runs(BASE, dict(BASE, clean_records=7))
    assert diffs == ["clean_records: 8 != 7"]


def test_breakdown_change_is_reported():
    diffs = diff_runs(BASE, dict(BASE, quarantine_breakdown={"duplicate_records": 1, "x": 1}))
    assert len(diffs) == 1 and diffs[0].startswith("quarantine_breakdown")


def test_cli_exit_code(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    a.write_text(json.dumps(BASE))
    b.write_text(json.dumps(dict(BASE, total_records=11)))
    script = os.path.join(os.path.dirname(HERE), "compare_golden.py")
    assert subprocess.run([sys.executable, script, str(a), str(a)]).returncode == 0
    assert subprocess.run([sys.executable, script, str(a), str(b)]).returncode == 1
