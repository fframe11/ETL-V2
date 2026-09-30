# Sample data for trying the system

`student_scores_sample.csv` — synthetic course scores (1,030 rows, 250 students), not real people.
`student_scores_answer_key.csv` — the zone every row should land in, and why.
Regenerate both with `python sample_data/generate_student_scores.py` (fixed seed, same output every time).

## Injected problems

| Problem | Rows | Expected zone |
|---|---|---|
| Missing `score` | 40 | Quarantine (Gate 1) |
| `score` below 0 | 15 | Quarantine (Gate 1) |
| `score` above 100 | 10 | Quarantine (Gate 1) |
| Duplicate `student_id + course + semester` | 30 | Quarantine (Gate 2) |
| `study_hours` 35–60 (normal is 1–10) | 20 | Review (Gate 3) |

Expected result with the default rules: **Clean 915 · Review 20 · Quarantine 95** (Gate 1: 65, Gate 2: 30).
Verified against the real engine: 1,030 / 1,030 rows land in the zone the answer key says.

## How to use

1. Log in at http://localhost (`admin` / `admin`).
2. Data Ingestion → File tab → choose `student_scores_sample.csv` → import.
3. Jobs & Pipelines shows the three zones; Audit Trail explains each step.

Uploading replaces the dataset currently loaded in the interactive engine (one dataset at a time).
To go back to the original evaluation dataset, delete
`api/student_course_score_evaluation_dataset/dirty_dataset.csv` and restart the api container —
it is restored from `student_course_score_evaluation_dataset.zip`.
