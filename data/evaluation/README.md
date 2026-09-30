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
