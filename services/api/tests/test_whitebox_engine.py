import os
import sys
import pytest
import pandas as pd

# Add api to path
API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.whitebox import (
    _compute_profile,
    _generate_recommendations,
    execute_pipeline,
    evaluate_ground_truth,
    get_default_user_context,
    ExecuteRulesPayload,
    RuleItem,
    DIRTY_DATASET_PATH,
    GROUND_TRUTH_PATH,
    DEMOGRAPHICS_DATASET_PATH,
    UNIFIED_DATASET_PATH,
    preview_multi_tables,
    analyze_multi_table_relationship,
    execute_multi_table_join,
    MultiTableJoinPayload
)

def test_profiling_engine():
    assert os.path.isfile(DIRTY_DATASET_PATH), "dirty_dataset.csv must exist"
    df = pd.read_csv(DIRTY_DATASET_PATH)
    profile = _compute_profile(df, "student_course_score")

    assert profile["total_rows"] == 10100
    assert profile["total_columns"] == 8
    assert "score" in profile["columns_profile"]
    assert profile["columns_profile"]["score"]["null_count"] > 0
    assert profile["duplicate_analysis"]["duplicate_rows_detected"] == 100
    assert profile["columns_profile"]["study_hours"]["outlier_count"] > 0

def test_explainable_rules_generation():
    df = pd.read_csv(DIRTY_DATASET_PATH)
    profile = _compute_profile(df, "student_course_score")
    user_ctx = get_default_user_context()
    recs = _generate_recommendations(profile, user_ctx)

    assert len(recs) >= 4
    rule_types = [r["rule_type"] for r in recs]
    assert "range_check" in rule_types
    assert "null_check" in rule_types
    assert "auto_iqr" in rule_types
    assert "composite_unique" in rule_types

    for r in recs:
        assert "rationale" in r
        assert len(r["rationale"]) > 0
        assert "sources" in r
        assert len(r["sources"]) > 0

def test_pipeline_execution_and_segregation():
    df = pd.read_csv(DIRTY_DATASET_PATH)
    profile = _compute_profile(df, "student_course_score")
    user_ctx = get_default_user_context()
    recs = _generate_recommendations(profile, user_ctx)
    rule_items = [RuleItem(**r) for r in recs]

    res = execute_pipeline(ExecuteRulesPayload(dataset_name="student_course_score", rules=rule_items))
    assert res["total_rows_ingested"] == 10100
    assert res["clean_rows"] == 9400
    assert res["review_rows"] == 100
    assert res["quarantine_rows"] == 600
    assert res["raw_quality_score_pct"] == 93.07
    assert res["post_clean_quality_score_pct"] == 100.0

def test_ground_truth_benchmark_100_percent_recall():
    benchmark = evaluate_ground_truth()
    assert benchmark["status"] == "PASSED"
    assert benchmark["overall_accuracy_pct"] == 100.0

    metrics = benchmark["metrics_by_error_type"]
    assert metrics["Missing Score"]["detection_rate_recall_pct"] == 100.0
    assert metrics["Invalid Score Range"]["detection_rate_recall_pct"] == 100.0
    assert metrics["Study Hours Outlier"]["detection_rate_recall_pct"] == 100.0
    assert metrics["Duplicate"]["detection_rate_recall_pct"] == 100.0
    assert metrics["None"]["detection_rate_recall_pct"] == 100.0

def test_multi_table_preview():
    assert os.path.isfile(DEMOGRAPHICS_DATASET_PATH), "demographics CSV must exist"
    data = preview_multi_tables()
    assert "table_a" in data
    assert "table_b" in data
    # _generate_demo_demographics leaves every 500th student out (20 of 10,000) so the demo has unmatched keys.
    assert data["table_a"]["total_rows"] == 9980
    assert data["table_b"]["total_rows"] == 10100
    assert "studentId" in data["table_a"]["columns"]
    assert "student_id" in data["table_b"]["columns"]

def test_multi_table_analysis_schema_and_key_matching():
    analysis = analyze_multi_table_relationship()
    assert analysis["status"] == "ANALYSIS_COMPLETE"
    assert analysis["human_confirmation_required"] is True

    # 1. Verify schema difference detection
    schema_diffs = analysis["schema_differences"]
    assert len(schema_diffs) >= 1
    naming_match = next((s for s in schema_diffs if s["source_a_column"] == "studentId"), None)
    assert naming_match is not None
    assert naming_match["source_b_column"] == "student_id"
    assert naming_match["confidence_pct"] >= 90.0

    # 2. Verify date format difference detection
    date_diffs = analysis["date_format_differences"]
    assert len(date_diffs) >= 1
    assert date_diffs[0]["source_a_field"] == "enrollmentDate"
    assert date_diffs[0]["suggested_standard_format"] == "YYYY-MM-DD"

    # 3. Verify Candidate Key overlap calculation (99.8% match rate)
    rel = analysis["candidate_relationship"]
    assert rel["candidate_key_a"] == "studentId"
    assert rel["candidate_key_b"] == "student_id"
    assert rel["match_rate_pct"] == 99.8
    assert "1:N" in rel["suggested_cardinality"]

def test_multi_table_join_execution_and_schema_standardization():
    payload = MultiTableJoinPayload(
        table_a_name="student_demographics",
        table_b_name="student_course_score",
        join_key_a="studentId",
        join_key_b="student_id",
        join_type="left",
        reconcile_schema=True,
        standardize_dates=True,
        target_date_format="YYYY-MM-DD"
    )
    result = execute_multi_table_join(payload)
    assert result["status"] == "JOIN_COMPLETED"
    assert result["total_rows"] == 10100
    assert result["total_columns"] >= 10
    assert os.path.isfile(UNIFIED_DATASET_PATH)

    # Check generated unified file
    unified_df = pd.read_csv(UNIFIED_DATASET_PATH)
    assert len(unified_df) == 10100
    assert "student_id" in unified_df.columns
    assert "student_name" in unified_df.columns
    assert "faculty" in unified_df.columns
    assert "enrollment_date" in unified_df.columns
    # Check date standardization pattern YYYY-MM-DD
    valid_dates = unified_df["enrollment_date"].dropna()
    assert valid_dates.str.match(r"^\d{4}-\d{2}-\d{2}$").all()



def test_profile_handles_boolean_columns():
    # Regression: pandas reads true/false columns as bool and is_numeric_dtype(bool) is True,
    # which sent them to quantile() and raised "numpy boolean subtract" (HTTP 500 on upload).
    df = pd.DataFrame({
        "id": [1, 2, 3, 4],
        "arrest": [True, False, False, True],
        "domestic": [False, False, False, True],
        "score": [10.0, 20.0, 30.0, 40.0],
    })
    profile = _compute_profile(df, "bool_cols")
    assert profile["columns_profile"]["arrest"]["distinct_count"] == 2
    assert "iqr" not in profile["columns_profile"]["arrest"]
    assert profile["columns_profile"]["score"]["iqr"] > 0


def test_app_path_keeps_student_benchmark_split():
    """The /state path builds rules from the profile, unlike the profile-less call above.

    A column with a few percent of nulls (score: 300 of 10,100) must still quarantine
    those rows, otherwise the benchmark split drifts to 9,400 / 400 / 300.
    """
    df = pd.read_csv(DIRTY_DATASET_PATH)
    profile = _compute_profile(df, "student_course_score")
    recs = _generate_recommendations(profile, get_default_user_context("student_course_score", profile))
    res = execute_pipeline(ExecuteRulesPayload(
        dataset_name="student_course_score", rules=[RuleItem(**r) for r in recs]))
    assert (res["clean_rows"], res["review_rows"], res["quarantine_rows"]) == (9400, 100, 600)


def test_mostly_empty_column_is_optional_not_quarantined():
    df = pd.DataFrame({"id": range(10), "note": [None] * 7 + ["a", "b", "c"], "n": range(10)})
    profile = _compute_profile(df, "notes_table")
    recs = _generate_recommendations(profile, get_default_user_context("notes_table", profile))
    null_rules = {r["field"]: r["action"] for r in recs if r["rule_type"] == "null_check"}
    assert null_rules == {"note": "review"}


def test_gate_split_counts_quarantined_duplicates_in_gate2(tmp_path, monkeypatch):
    from app.api import whitebox
    out = tmp_path / "out"
    out.mkdir()
    monkeypatch.setattr(whitebox, "OUTPUT_DIR", str(out))
    monkeypatch.setattr(whitebox, "WORKING_DATASET_PATH", str(out / "working_dataset.csv"))
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE_PATH", str(tmp_path / "state.json"))
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE", dict(whitebox._WORKFLOW_STATE))
    caches = (whitebox._LATEST_PROFILING, whitebox._LATEST_RECOMMENDATIONS, whitebox._LATEST_USER_CONTEXT)
    saved = [dict(c) for c in caches]
    whitebox._WORKFLOW_STATE.update(dataset_source="evaluation", dataset_name="student_course_score", active_rules=[])
    for c in caches:
        c.clear()
    try:
        m = whitebox._recompute_interactive_state()["metrics"]
    finally:
        for c, old in zip(caches, saved):
            c.clear()
            c.update(old)
    assert m["gate2_quarantined"] == 100  # duplicates
    assert m["gate1_quarantined"] == m["quarantine_rows"] - 100
    assert m["gate1_passed"] - m["gate2_quarantined"] == m["gate2_passed"]


def test_no_range_rule_that_cannot_flag_anything():
    df = pd.DataFrame({
        "id": range(6),
        "weight_g": [100, 250, 300, 80, 90, 120],      # never negative, no domain hint in the name
        "balance_delta": [5, -3, 4, 8, -1, 2],          # has negatives, no domain hint in the name
        "price": [10, 20, 30, 40, 50, 60],              # named domain: keeps its guard
    })
    profile = _compute_profile(df, "t")
    recs = _generate_recommendations(profile, get_default_user_context("t", profile))
    range_fields = {r["field"] for r in recs if r["rule_type"] == "range_check"}
    assert "weight_g" not in range_fields
    assert "price" in range_fields
