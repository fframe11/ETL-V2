# -*- coding: utf-8 -*-
"""Rebuilds the 250-row demo dataset used in the report's worked examples.

Usage: python docs/whitebox-report/tools/gen_demo_dataset.py <output.csv>

Contents: 200 clean rows, 12 missing score, 13 score outside [0, 100],
13 duplicate (student_id, course, semester), 12 study_hours outliers.
"""
import csv
import random
import sys

random.seed(42)

COURSES = ["CS101", "MATH201", "ENG105", "PHYS110", "BIO220"]
SEMESTERS = ["2025-1", "2025-2"]

rows = []

# 1) Baseline: 200 clean rows
for i in range(200):
    rows.append({
        "student_id": f"S{3001 + i}",
        "course": random.choice(COURSES),
        "semester": random.choice(SEMESTERS),
        "score": round(random.uniform(45, 98), 1),
        "study_hours": round(random.uniform(2, 8), 1),
    })

# 2) Missing score (12 rows)
for i in range(12):
    rows.append({
        "student_id": f"S{4001 + i}",
        "course": random.choice(COURSES),
        "semester": random.choice(SEMESTERS),
        "score": "",
        "study_hours": round(random.uniform(2, 8), 1),
    })

# 3) Out-of-range score (13 rows: negative and over 100)
for i in range(13):
    bad_score = round(random.uniform(-30, -1), 1) if i % 2 == 0 else round(random.uniform(101, 160), 1)
    rows.append({
        "student_id": f"S{4101 + i}",
        "course": random.choice(COURSES),
        "semester": random.choice(SEMESTERS),
        "score": bad_score,
        "study_hours": round(random.uniform(2, 8), 1),
    })

# 4) Duplicate composite key (13 rows): reuse (student_id, course, semester)
#    of a baseline row
dup_sources = random.sample(rows[:200], 13)
for src in dup_sources:
    rows.append({
        "student_id": src["student_id"],
        "course": src["course"],
        "semester": src["semester"],
        "score": round(random.uniform(45, 98), 1),
        "study_hours": round(random.uniform(2, 8), 1),
    })

# 5) study_hours outliers (12 rows): normal is about 2-8 hours
for i in range(12):
    rows.append({
        "student_id": f"S{4301 + i}",
        "course": random.choice(COURSES),
        "semester": random.choice(SEMESTERS),
        "score": round(random.uniform(45, 98), 1),
        "study_hours": round(random.uniform(28, 55), 1),
    })

random.shuffle(rows)

out_path = sys.argv[1]
with open(out_path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["student_id", "course", "semester", "score", "study_hours"])
    w.writeheader()
    w.writerows(rows)

print("wrote", len(rows), "rows to", out_path)
