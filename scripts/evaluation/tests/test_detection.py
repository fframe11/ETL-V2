import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from detection import evaluate


def d(i, sid, course="A"):
    return {"dirty_row_id": str(i), "student_id": sid, "course": course, "semester": "1/2026"}


def g(i, status, etype):
    return {"dirty_row_id": str(i), "expected_status": status, "expected_error_type": etype}


DIRTY = [d(1, "s1"), d(2, "s1"), d(3, "s2"), d(4, "s3"), d(5, "s4"), d(6, "s5")]
GT = [g(1, "Valid", "None"), g(2, "Invalid", "Duplicate"), g(3, "Invalid", "Missing Score"),
      g(4, "Invalid", "Invalid Score Range"), g(5, "Review", "Study Hours Outlier"), g(6, "Valid", "None")]


def test_perfect_run():
    res = evaluate(DIRTY, GT, active_ids={"1", "6"},
                   quarantine_reasons={"3": "null_value_in_score", "4": "out_of_range_score", "5": "study_hours > 9"})
    assert res["per_type"]["Duplicate"] == {"actual": 1, "detected": 1, "rate": 1.0}
    assert res["confusion"] == {"tp": 4, "fp": 0, "fn": 0, "tn": 2}
    assert res["precision"] == 1.0 and res["recall"] == 1.0
    assert res["outcomes"]["2"] == "dropped"


def test_system_keeping_the_copy_instead_of_the_original_still_counts():
    res = evaluate(DIRTY, GT, active_ids={"2", "6"},
                   quarantine_reasons={"1": "duplicate_records", "3": "x", "4": "y", "5": "z"})
    assert res["per_type"]["Duplicate"]["detected"] == 1
    assert res["confusion"]["fp"] == 0


def test_missed_errors_and_false_alarms():
    res = evaluate(DIRTY, GT, active_ids={"1", "2", "3", "4", "5"}, quarantine_reasons={"6": "anomaly_z"})
    assert res["per_type"]["Missing Score"]["detected"] == 0
    assert res["per_type"]["Duplicate"]["detected"] == 0
    assert res["confusion"] == {"tp": 0, "fp": 1, "fn": 4, "tn": 1}
    assert res["false_positive_reasons"] == {"anomaly_z": 1}
    assert res["precision"] == 0.0
