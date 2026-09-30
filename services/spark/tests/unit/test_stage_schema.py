from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
import sdoqap.stages  # noqa: F401


def test_align_renames_to_registered_name_and_casts(spark):
    spec = {"student_id": "StringType", "score": "IntegerType", "updated_at": "TimestampType"}
    ctx = make_ctx(spark, [("S1", "1,234", "2026-09-15 14:00:00")], spec, primary_key="student_id",
                   columns=["Student ID", "score", "updated_at"])
    run_stages(["schema_align"], ctx)
    row = ctx.df.collect()[0]
    assert "student_id" in ctx.df.columns
    assert row["score"] == 1234
    assert row["updated_at"].year == 2026


def test_align_promotes_integer_with_decimals_to_double(spark):
    spec = {"id": "StringType", "score": "IntegerType"}
    ctx = make_ctx(spark, [("a", "12.50"), ("b", "3")], spec)
    run_stages(["schema_align"], ctx)
    assert ctx.schema_spec["score"] == "DoubleType"
    assert sorted(r["score"] for r in ctx.df.collect()) == [3.0, 12.5]


def test_drift_fills_missing_column_and_logs_proposal(spark):
    spec = {"id": "StringType", "name": "StringType", "score": "StringType"}
    ctx = make_ctx(spark, [("a", "x")], spec, columns=["id", "name"])
    ctx.schema_spec = spec  # engine passes the registered spec, df lacks 'score'
    run_stages(["schema_drift"], ctx)
    assert ctx.drift_detected is True
    assert ctx.drift_details["score"]["error"] == "missing_column"
    assert "score" in ctx.df.columns
    indices = [i for i, _ in ctx.es_docs]
    assert "sdoqap_schema_drifts" in indices and "sdoqap_schema_proposals" in indices
    proposal = [d for i, d in ctx.es_docs if i == "sdoqap_schema_proposals"][0]
    assert proposal["status"] == "PENDING"
    assert any(sev == "critical" for _, sev in ctx.alerts)


def test_no_drift_when_columns_match(spark):
    spec = {"id": "StringType", "name": "StringType"}
    ctx = make_ctx(spark, [("a", "x")], spec)
    run_stages(["schema_drift"], ctx)
    assert ctx.drift_detected is False and ctx.es_docs == []
