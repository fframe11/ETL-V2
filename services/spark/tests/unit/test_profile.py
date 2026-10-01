from helpers import make_ctx
from sdoqap.common.profile import null_profile
from sdoqap.stages.report import build_quality_run_doc
from datetime import datetime, timezone

RULES = {"null_checks": {"mode": "adaptive", "default_tolerance": 0.05, "column_overrides": {"name": 0.5}}}


def frame(spark):
    return spark.createDataFrame(
        [(1, "a", None), (2, None, 5.0), (3, "c", float("nan")), (4, "d", 7.0)], "id int, name string, v double")


def test_null_rate_counts_nulls_and_nan(spark):
    prof = null_profile(frame(spark), ["id"], RULES)
    assert prof["id"]["null_rate"] == 0.0
    assert prof["name"]["null_rate"] == 0.25
    assert prof["v"]["null_rate"] == 0.5  # one null and one NaN out of four


def test_tolerance_comes_from_the_rules_and_primary_key_is_required(spark):
    prof = null_profile(frame(spark), ["id"], RULES)
    assert prof["id"] == {"null_rate": 0.0, "tolerance": 0.05, "is_required": True}
    assert prof["name"]["tolerance"] == 0.5 and prof["name"]["is_required"] is False
    assert prof["v"]["tolerance"] == 0.05


def test_strict_mode_tolerates_no_nulls(spark):
    prof = null_profile(frame(spark), ["id"], {"null_checks": {"mode": "strict"}})
    assert prof["name"]["tolerance"] == 0.0


def test_composite_primary_key_columns_are_all_required(spark):
    prof = null_profile(frame(spark), ["id", "name"], RULES)
    assert prof["id"]["is_required"] and prof["name"]["is_required"] and not prof["v"]["is_required"]


def test_no_rules_falls_back_to_five_percent(spark):
    assert null_profile(frame(spark), ["id"], {})["v"]["tolerance"] == 0.05


def test_empty_dataset_has_no_profile(spark):
    assert null_profile(spark.createDataFrame([], "id int, name string"), ["id"], RULES) == {}


def test_quality_run_doc_carries_the_null_profile(spark):
    ctx = make_ctx(spark, [], {"id": "StringType"})
    ctx.metrics = {"started_at": datetime.now(timezone.utc), "quality_score": 95.0}
    ctx.null_profile = {"id": {"null_rate": 0.0, "tolerance": 0.05, "is_required": True}}
    ctx.value_range_profile = {"v": {"q1": 1.0, "q3": 2.0, "lower_bound": 0.0, "upper_bound": 3.0}}
    doc = build_quality_run_doc(ctx, finished_at=datetime.now(timezone.utc))
    assert doc["null_profile"] == ctx.null_profile
    assert doc["value_range_profile"] == ctx.value_range_profile
