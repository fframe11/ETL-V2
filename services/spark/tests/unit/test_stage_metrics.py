from datetime import datetime, timedelta, timezone

from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
from sdoqap.stages.report import build_quality_run_doc
import sdoqap.stages  # noqa: F401

SPEC = {"id": "StringType", "v": "DoubleType"}


def counted_ctx(spark, clean, quarantined, **kw):
    ctx = make_ctx(spark, [], SPEC, **kw)
    ctx.clean_count, ctx.quarantine_count, ctx.total_records = clean, quarantined, clean + quarantined
    return ctx


def test_quality_score_and_alert_below_threshold(spark):
    ctx = counted_ctx(spark, 85, 15)
    ctx.quality_threshold = 90.0
    run_stages(["quality_score"], ctx)
    assert ctx.metrics["quality_score"] == 85.0
    assert any(sev == "critical" for _, sev in ctx.alerts)


def test_empty_input_scores_zero_and_says_why(spark):
    ctx = counted_ctx(spark, 0, 0)
    run_stages(["quality_score"], ctx)
    assert ctx.metrics["quality_score"] == 0.0
    assert any("Empty source file" in log for log in ctx.remediation_logs)


def test_quarantine_rate_jump_is_an_anomaly(spark):
    ctx = counted_ctx(spark, 50, 50)
    ctx.historical_stats = lambda table: [0.1, 0.1, 0.1, 0.1]
    run_stages(["quality_score"], ctx)
    assert ctx.metrics["is_anomaly"] is True
    assert ctx.metrics["z_score"] > 3.0


def test_ai_advisory_disabled_is_a_no_op(spark):
    ctx = counted_ctx(spark, 10, 0, rules={"ai_advisor": {"enabled": False}})
    ctx.paths = {"active": "unused", "quarantine": "unused", "raw": "unused"}
    ctx.metrics.update(is_anomaly=False, quality_score=100.0, z_score=0.0,
                       historical_rates=[], current_quarantine_rate=0.0)
    run_stages(["ai_advisory"], ctx)
    assert "profile_report" not in ctx.metrics or ctx.metrics["profile_report"] is None


def test_breakdown_splits_multi_reason_rows(spark, tmp_path):
    qpath = str(tmp_path / "q")
    spark.createDataFrame([("r1", "a; b"), ("r1", "a"), ("r2", "c")], ["run_id", "reject_reason"]) \
        .write.format("delta").partitionBy("run_id").save(qpath)
    ctx = counted_ctx(spark, 0, 2, run_id="r1")
    ctx.paths = {"quarantine": qpath, "active": str(tmp_path / "a"), "raw": "raw"}
    run_stages(["quarantine_breakdown"], ctx)
    assert ctx.metrics["quarantine_breakdown"] == {"a": 2, "b": 1}


def test_quality_run_doc_has_counts_timing_and_stage_seconds(spark):
    ctx = counted_ctx(spark, 9, 1, run_id="r1")
    ctx.ingest_id = "i1"
    ctx.metrics.update(quality_score=90.0, max_lag_hours=0.0, quarantined_financial_value=0.0,
                       operational_impact_score=10.0, z_score=0.0, is_anomaly=False,
                       stage_seconds={"validation": 0.5}, started_at=datetime.now(timezone.utc) - timedelta(seconds=3))
    ctx.pop_fallback_metrics = lambda: {"fallback_rate": 0.1}
    doc = build_quality_run_doc(ctx, finished_at=datetime.now(timezone.utc))
    assert (doc["total_records"], doc["clean_records"], doc["quarantined_records"]) == (10, 9, 1)
    assert doc["ingest_id"] == "i1" and doc["duration_seconds"] >= 3
    assert doc["stage_seconds"] == {"validation": 0.5}
    assert doc["fallback_metrics"] == {"fallback_rate": 0.1}
