from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
import sdoqap.stages  # noqa: F401

SPEC = {"id": "StringType", "v": "DoubleType"}


def numeric_ctx(spark, values, rules=None):
    rows = [(f"r{i}", float(v)) for i, v in enumerate(values)]
    ctx = make_ctx(spark, rows, SPEC, rules=rules or {})
    ctx.clean_df = ctx.df
    return ctx


def test_iqr_moves_far_value_to_outliers(spark):
    ctx = numeric_ctx(spark, list(range(1, 21)) + [500], {"value_range": {"mode": "auto", "iqr_multiplier": 1.5}})
    run_stages(["anomaly_iqr"], ctx)
    assert [r["v"] for r in ctx.outlier_df.collect()] == [500.0]
    assert ctx.clean_df.count() == 20
    assert "v" in ctx.value_range_profile


def test_iqr_off_by_default(spark):
    ctx = numeric_ctx(spark, [1, 2, 500])
    run_stages(["anomaly_iqr"], ctx)
    assert ctx.outlier_df is None and ctx.clean_df.count() == 3


def test_zscore_flags_value_beyond_three_sigma(spark):
    ctx = numeric_ctx(spark, [10] * 30 + [1000])
    run_stages(["anomaly_zscore"], ctx)
    assert [r["v"] for r in ctx.unsupervised_outlier_df.collect()] == [1000.0]
    assert ctx.clean_df.count() == 30


def test_induced_rule_condition_quarantines_matches(spark):
    ctx = numeric_ctx(spark, [10, 95, 99], {"induced": {"r1": {"condition": "v > 90"}}})
    run_stages(["anomaly_induced"], ctx)
    rows = ctx.induced_outlier_df.collect()
    assert sorted(r["v"] for r in rows) == [95.0, 99.0]
    assert {r["reject_reason"] for r in rows} == {"induced_tree_rule_match"}


def test_assembly_counts_every_rejected_row_once(spark):
    ctx = make_ctx(spark, [("a", 1.0), ("a", 1.0), (None, 2.0), ("b", 3.0)], SPEC)
    run_stages(["validation", "dedup", "quarantine_assembly"], ctx)
    assert (ctx.clean_count, ctx.quarantine_count, ctx.total_records) == (2, 2, 4)
    assert "run_id" in ctx.all_quarantined_write.columns


def test_column_filter_strips_columns_outside_schema(spark):
    ctx = make_ctx(spark, [("a", 1.0, "junk")], SPEC, columns=["id", "v", "extra"])
    ctx.clean_df = ctx.df
    run_stages(["column_filter"], ctx)
    assert ctx.clean_df.columns == ["id", "v"]
    assert ctx.remediation_logs == ["extra_columns_stripped_1"]
