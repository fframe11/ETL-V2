import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prepare_datasets import scale_dataset

DIRTY = [
    {"dirty_row_id": "1", "record_id": "1", "student_id": "65001", "course": "Python", "score": "70", "semester": "1/2026", "study_hours": "3", "updated_at": "t"},
    {"dirty_row_id": "2", "record_id": "1", "student_id": "65001", "course": "Python", "score": "70", "semester": "1/2026", "study_hours": "3", "updated_at": "t"},
    {"dirty_row_id": "3", "record_id": "2", "student_id": "65002", "course": "Stats", "score": "", "semester": "1/2026", "study_hours": "3", "updated_at": "t"},
]
GT = [
    {"dirty_row_id": "1", "record_id": "1", "expected_status": "Valid", "expected_error_type": "None"},
    {"dirty_row_id": "2", "record_id": "1", "expected_status": "Invalid", "expected_error_type": "Duplicate"},
    {"dirty_row_id": "3", "record_id": "2", "expected_status": "Invalid", "expected_error_type": "Missing Score"},
]


def test_scale_keeps_error_mix_and_unique_ids():
    rows, gt = scale_dataset(DIRTY, GT, 9)
    assert len(rows) == len(gt) == 9
    assert len({r["dirty_row_id"] for r in rows}) == 9
    assert [g["expected_error_type"] for g in gt].count("Duplicate") == 3
    assert [r["dirty_row_id"] for r in rows] == [g["dirty_row_id"] for g in gt]


def test_copies_do_not_share_keys_but_duplicates_inside_a_copy_still_collide():
    rows, _ = scale_dataset(DIRTY, GT, 6)
    keys = [(r["student_id"], r["course"], r["semester"]) for r in rows]
    assert keys[0] == keys[1]
    assert keys[3] == keys[4]
    assert keys[0] != keys[3]


def test_truncates_mid_copy():
    rows, gt = scale_dataset(DIRTY, GT, 4)
    assert [r["dirty_row_id"] for r in rows] == ["1", "2", "3", "1000001"]
