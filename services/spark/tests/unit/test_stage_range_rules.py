from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
import sdoqap.stages  # noqa: F401

SPEC = {"id": "StringType", "score": "DoubleType", "hours": "DoubleType"}
RULES = {"range_checks": {"score": {"min": 0, "max": 100}, "hours": {"min": 0, "max": None}}}


def ctx_with(spark, rows, rules=RULES):
    ctx = make_ctx(spark, rows, SPEC, rules=rules)
    ctx.clean_df = ctx.df
    return ctx


def test_values_outside_business_range_are_quarantined_with_reason(spark):
    ctx = ctx_with(spark, [("a", 50.0, 2.0), ("b", 150.0, 1.0), ("c", -5.0, -1.0)])
    run_stages(["range_rules"], ctx)
    bad = {r["id"]: r["reject_reason"] for r in ctx.range_violation_df.collect()}
    assert bad == {"b": "out_of_range_score", "c": "out_of_range_score; out_of_range_hours"}
    assert [r["id"] for r in ctx.clean_df.collect()] == ["a"]


def test_bounds_are_inclusive_and_nulls_are_not_range_errors(spark):
    ctx = ctx_with(spark, [("a", 0.0, 0.0), ("b", 100.0, None)])
    run_stages(["range_rules"], ctx)
    assert ctx.range_violation_df.count() == 0
    assert ctx.clean_df.count() == 2


def test_no_rules_means_no_op(spark):
    ctx = ctx_with(spark, [("a", 500.0, 1.0)], rules={})
    run_stages(["range_rules"], ctx)
    assert ctx.range_violation_df is None and ctx.clean_df.count() == 1


def test_unknown_column_is_ignored(spark):
    ctx = ctx_with(spark, [("a", 50.0, 1.0)], rules={"range_checks": {"nope": {"min": 0, "max": 1}}})
    run_stages(["range_rules"], ctx)
    assert ctx.range_violation_df is None


def test_assembly_includes_range_violations(spark):
    ctx = make_ctx(spark, [("a", 50.0, 1.0), ("b", 150.0, 1.0)], SPEC, rules=RULES)
    run_stages(["validation", "dedup", "range_rules", "quarantine_assembly"], ctx)
    assert (ctx.clean_count, ctx.quarantine_count) == (1, 1)
