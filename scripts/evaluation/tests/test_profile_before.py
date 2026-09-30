import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from profile_before import percentile, profile


def row(sid, course, score, hours, sem="1/2026"):
    return {"student_id": sid, "course": course, "semester": sem, "score": score, "study_hours": hours}


def test_percentile_linear_interpolation():
    assert percentile([1, 2, 3, 4], 0.5) == 2.5
    assert percentile([10], 0.25) == 10


def test_profile_counts_each_problem_type():
    rows = [row(str(i), "A", "50", "3") for i in range(20)]
    rows += [row("x1", "A", "", "3"), row("x2", "A", "150", "3"), row("x3", "A", "-1", "3"),
             row("0", "A", "50", "3"), row("x4", "A", "60", "60")]
    p = profile(rows)
    assert p["rows"] == 25
    assert p["null_counts"]["score"] == 1
    assert p["invalid_score"] == 2
    assert p["duplicate_rows"] == 1
    assert p["study_hours_outliers"] == 1
    assert (p["score_min"], p["score_max"]) == (-1.0, 150.0)
