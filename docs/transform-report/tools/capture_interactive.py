"""Run the real interactive rule engine on the sample CSV under fixed scenarios.

Runs inside the api container. It never touches the live dataset or the saved
workflow state: it points the module at a temp copy and restores the in-memory
state after each scenario.

Usage (from repo root, Git Bash):
  MSYS_NO_PATHCONV=1 docker compose cp sample_data/student_scores_sample.csv api:/tmp/tr_sample.csv
  MSYS_NO_PATHCONV=1 docker compose exec -T api python - < docs/transform-report/tools/capture_interactive.py
"""
import copy
import json
import os
import tempfile

import pandas as pd

import app.api.whitebox as wb

SAMPLE = "/tmp/tr_sample.csv"
METRIC_KEYS = [
    "total_rows", "clean_rows", "review_rows", "quarantine_rows", "quality_score_pct",
    "missing_score_count", "invalid_range_count", "duplicate_count", "initial_outlier_count",
    "gate1_quarantined", "gate2_quarantined", "upper_fence", "q1", "q3", "iqr",
]

SCENARIOS = {
    "S1_default": {},
    "S2_k_1_5": {"tukey_multiplier": "1.5"},
    "S3_min_score_40": {"min_score": 40.0},
    "S4_null_adaptive_5": {"null_policy": "adaptive_5", "max_null_pct": 5.0},
    "S5_null_adaptive_3": {"null_policy": "adaptive_5", "max_null_pct": 3.0},
    "S6_dedup_review_all": {"dedup_strategy": "review_all"},
    "S7_unknown_key_record_id": {"composite_key": "record_id"},
    "S8_custom_fence_12": {"tukey_multiplier": "custom", "custom_upper_fence": 12.0},
    "S9_rule3_off": {"rule3_confirmed": False},
    # file has the 4 required columns but no `semester`: the dedup key silently shrinks
    "S10_file_without_semester": {"_drop_columns": ["semester"]},
}

BASE = {
    "min_score": 0.0, "max_score": 100.0, "null_policy": "strict_0", "max_null_pct": 5.0,
    "composite_key": "student_id + course + semester", "dedup_strategy": "keep_first_quarantine",
    "tukey_multiplier": "3.0", "custom_upper_fence": None,
    "rule1_confirmed": True, "rule2_confirmed": True, "rule3_confirmed": True,
    "selected_findings": ["score_range_null", "composite_key_dup", "study_hours_outlier"],
    "review_action": "KEEP", "row_decisions": {}, "row_edits": {},
}


def main():
    tmp_dir = tempfile.mkdtemp(prefix="tr_")
    df = pd.read_csv(SAMPLE)
    df.insert(0, "dirty_row_id", range(1, len(df) + 1))
    dirty = os.path.join(tmp_dir, "dirty.csv")
    df.to_csv(dirty, index=False)

    saved_state = copy.deepcopy(wb._WORKFLOW_STATE)
    saved_paths = (wb.DIRTY_DATASET_PATH, wb.OUTPUT_DIR)
    wb.DIRTY_DATASET_PATH, wb.OUTPUT_DIR = dirty, tmp_dir
    out = {}
    try:
        for name, overrides in SCENARIOS.items():
            wb._WORKFLOW_STATE.clear()
            wb._WORKFLOW_STATE.update(copy.deepcopy(saved_state))
            wb._WORKFLOW_STATE.update(copy.deepcopy(BASE))
            overrides = dict(overrides)
            dropped = overrides.pop("_drop_columns", [])
            wb._WORKFLOW_STATE.update(overrides)
            if dropped:
                alt = os.path.join(tmp_dir, "dirty_alt.csv")
                df.drop(columns=dropped).to_csv(alt, index=False)
                wb.DIRTY_DATASET_PATH = alt
            else:
                wb.DIRTY_DATASET_PATH = dirty
            result = wb._recompute_interactive_state()
            frames = [pd.read_csv(os.path.join(tmp_dir, f)) for f in
                      ("clean_dataset_run.csv", "review_queue_run.csv", "quarantine_lake_run.csv")]
            rows = pd.concat(frames, ignore_index=True)
            examples = (rows[rows["whitebox_error_type"] != "None"]
                        .groupby("whitebox_error_type").head(1)
                        [["dirty_row_id", "score", "study_hours", "whitebox_status",
                          "whitebox_error_type", "whitebox_rule_applied"]])
            out[name] = {
                "params": {**overrides, **({"_drop_columns": dropped} if dropped else {})},
                "metrics": {k: result["metrics"][k] for k in METRIC_KEYS},
                "rule_applied_counts": rows["whitebox_rule_applied"].value_counts().to_dict(),
                "examples": json.loads(examples.to_json(orient="records")),
            }
    finally:
        wb.DIRTY_DATASET_PATH, wb.OUTPUT_DIR = saved_paths
        wb._WORKFLOW_STATE.clear()
        wb._WORKFLOW_STATE.update(saved_state)
    print(json.dumps(out, ensure_ascii=False, indent=2, default=str))


main()
