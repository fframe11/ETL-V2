#!/usr/bin/env bash
export PYTHONUTF8=1
# Full evaluation of the Spark path on the original dirty dataset (Guideline Steps 5-10).
# Usage: bash scripts/evaluation/run_batch_evaluation.sh   (stack running, repo root)
set -eu
EV=docs/evaluation/evidence
ORIG=data/evaluation/original
OUT=data/evaluation/output
TABLE=student_course_scores
mkdir -p "$EV" "$OUT"

[ -f "$ORIG/dirty_dataset.csv" ] || python scripts/evaluation/prepare_datasets.py --sizes
python scripts/evaluation/profile_before.py "$ORIG/dirty_dataset.csv" > "$EV/d-profile-before.json"

bash scripts/evaluation/golden_run.sh "$TABLE" "$ORIG/dirty_dataset.csv" "$EV/d-batch-run.json"
RUN_ID=$(python -c "import json;print(json.load(open('$EV/d-batch-run.json'))['run_id'])")

MSYS_NO_PATHCONV=1 docker compose exec -T spark-master rm -rf /tmp/eval_rows
MSYS_NO_PATHCONV=1 docker compose exec -T spark-master python /opt/spark-apps/scripts/export_run_rows.py \
  --table "$TABLE" --run-id "$RUN_ID" --out /tmp/eval_rows
MSYS_NO_PATHCONV=1 docker compose cp spark-master:/tmp/eval_rows/active.csv "$OUT/active.csv"
MSYS_NO_PATHCONV=1 docker compose cp spark-master:/tmp/eval_rows/quarantine.csv "$OUT/quarantine.csv"

python scripts/evaluation/detection.py --dirty "$ORIG/dirty_dataset.csv" --ground-truth "$ORIG/ground_truth.csv" \
  --active "$OUT/active.csv" --quarantine "$OUT/quarantine.csv" > "$EV/d-detection.json"
python scripts/evaluation/utilization_report.py "$OUT/active.csv" docs/evaluation/d-utilization.md "$EV/d-utilization.json"

MSYS_NO_PATHCONV=1 docker compose exec -T -w /opt/spark-apps spark-master python -m sdoqap.pipeline --json > "$EV/d-stage-list.json"

# Interactive (whitebox) engine on the same original dataset. It runs in a throwaway copy of
# the code and data so the dataset and workflow state the running API uses are not touched.
WB=$(mktemp -d)
mkdir -p "$WB/services" "$WB/scripts/evaluation" "$WB/data/evaluation/student_course_score_evaluation_dataset"
cp -r services/api "$WB/services/api"
cp scripts/evaluation/run_whitebox_evaluation.py "$WB/scripts/evaluation/"
cp "$ORIG/dirty_dataset.csv" "$ORIG/ground_truth.csv" "$ORIG/clean_dataset.csv" "$WB/data/evaluation/student_course_score_evaluation_dataset/"
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(cygpath -w "$WB"):/repo" -w /repo api \
  python scripts/evaluation/run_whitebox_evaluation.py > "$EV/d-whitebox-evaluation.txt" 2>&1 \
  || echo "whitebox evaluation failed; see $EV/d-whitebox-evaluation.txt"
rm -rf "$WB"
echo "done: run $RUN_ID"
