"""Generate a synthetic student-scores CSV with a known number of injected problems, plus its answer key.

Usage: python sample_data/generate_student_scores.py
Output: sample_data/student_scores_sample.csv, sample_data/student_scores_answer_key.csv
Standard library only, fixed seed, so every run produces the same files.
"""
import csv
import random
from pathlib import Path

SEED = 2026
OUT_DIR = Path(__file__).resolve().parent
COURSES = ["Python", "Statistics", "Database", "Data Warehouse", "Machine Learning"]
SEMESTERS = ["1/2026", "2/2026"]
N_STUDENTS = 250
ENROLLMENTS_PER_STUDENT = 4

N_MISSING_SCORE = 40
N_NEGATIVE_SCORE = 15
N_OVER_100_SCORE = 10
N_DUPLICATES = 30
N_HOURS_OUTLIERS = 20


def main() -> None:
    rng = random.Random(SEED)
    rows = []
    for i in range(N_STUDENTS):
        student_id = 66001 + i
        combos = rng.sample([(c, s) for c in COURSES for s in SEMESTERS], ENROLLMENTS_PER_STUDENT)
        for course, semester in combos:
            day = 1 if semester == "1/2026" else 15
            rows.append({
                "student_id": student_id,
                "course": course,
                "semester": semester,
                "score": round(min(100.0, max(0.0, rng.gauss(72, 12))), 1),
                "study_hours": rng.randint(1, 10),
                "updated_at": f"2026-09-{day:02d} {rng.randint(8, 18):02d}:00:00",
                "_zone": "CLEAN",
                "_reason": "",
            })

    picks = rng.sample(range(len(rows)), N_MISSING_SCORE + N_NEGATIVE_SCORE + N_OVER_100_SCORE + N_HOURS_OUTLIERS + N_DUPLICATES)
    missing, rest = picks[:N_MISSING_SCORE], picks[N_MISSING_SCORE:]
    negative, rest = rest[:N_NEGATIVE_SCORE], rest[N_NEGATIVE_SCORE:]
    over_100, rest = rest[:N_OVER_100_SCORE], rest[N_OVER_100_SCORE:]
    outliers, dup_sources = rest[:N_HOURS_OUTLIERS], rest[N_HOURS_OUTLIERS:]

    for i in missing:
        rows[i].update(score="", _zone="QUARANTINE", _reason="missing score")
    for i in negative:
        rows[i].update(score=rng.choice([-5.0, -10.0, -1.0]), _zone="QUARANTINE", _reason="score out of range (< 0)")
    for i in over_100:
        rows[i].update(score=rng.choice([105.0, 120.0, 150.0]), _zone="QUARANTINE", _reason="score out of range (> 100)")
    for i in outliers:
        rows[i].update(study_hours=rng.randint(35, 60), _zone="REVIEW", _reason="study_hours outlier")
    rows += [dict(rows[i]) for i in dup_sources]

    rng.shuffle(rows)
    seen = set()
    for row in rows:
        key = (row["student_id"], row["course"], row["semester"])
        if key in seen:
            row.update(_zone="QUARANTINE", _reason="duplicate student_id + course + semester")
        seen.add(key)

    data_cols = ["student_id", "course", "semester", "score", "study_hours", "updated_at"]
    with open(OUT_DIR / "student_scores_sample.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=data_cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    with open(OUT_DIR / "student_scores_answer_key.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["dirty_row_id", "student_id", "course", "semester", "expected_zone", "expected_reason"])
        for n, row in enumerate(rows, start=1):
            writer.writerow([n, row["student_id"], row["course"], row["semester"], row["_zone"], row["_reason"]])

    counts = {z: sum(r["_zone"] == z for r in rows) for z in ("CLEAN", "REVIEW", "QUARANTINE")}
    print(f"rows={len(rows)} expected={counts}")


if __name__ == "__main__":
    main()
