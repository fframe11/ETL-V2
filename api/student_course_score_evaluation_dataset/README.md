# Student Course Score — ETL Evaluation Dataset

Use this package to evaluate the Semi-Auto ETL platform.

## Files
- clean_dataset.csv — 10,000 clean reference rows
- dirty_dataset.csv — 10,100 rows with intentionally injected problems
- ground_truth.csv — expected status/error for every dirty row

## Injected problems
- Missing Score: 300 rows
- Invalid Score Range: 200 rows
- Study Hours Outlier: 100 rows
- Duplicate rows: 100 rows

## Business rules for the test
- student_id: required
- score: required for official grades
- score: valid range 0–100
- student_id + course + semester: should not duplicate
- updated_at: Daily Batch
- Max freshness delay: 24 hours
- study_hours: unknown domain, so Auto IQR can be tested
- Suggested Quality Target: 95% (starting point for this experiment, not universal)

## Evaluation steps
1. Profile dirty_dataset.csv.
2. Record row count, null rate, min/max, outliers, duplicates, schema and data types.
3. Apply the rules and run Transform.
4. Record detected errors, cleaned rows, quality score and processing time.
5. Compare detected results with ground_truth.csv.
6. Use the cleaned output for analysis: average score by course, pass/fail rate, score distribution, and students needing follow-up.

## Important
Use the actual results from your system in the presentation. Do not invent performance numbers.

## Runtime setup (api container)
This folder is bind-mounted into the `api` container, so uploads and `output_runs/` survive rebuilds.
On startup the API restores the three CSVs above from `student_course_score_evaluation_dataset.zip`
(repo root) if they are missing, and generates `student_demographics.csv` if it is missing.

`student_demographics.csv` is **synthetic demo data** for the multi-table (Audit Trail stage 0) demo:
one row per `student_id` in `clean_dataset.csv`, except every 500th id (left out on purpose so the
demo shows unmatched keys). Names, faculties and enrollment dates are random (seed 42), not real people.
Delete the file to regenerate it.
