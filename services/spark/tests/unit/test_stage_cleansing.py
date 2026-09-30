from helpers import make_ctx
from sdoqap.pipeline.registry import run_stages
import sdoqap.stages  # noqa: F401

SPEC = {"id": "StringType", "score": "StringType"}


def test_auto_clean_keeps_one_row_per_key_and_keeps_null_keys(spark):
    ctx = make_ctx(spark, [("a", "1"), ("a", "2"), (None, "3")], SPEC, rules={"auto_clean": True})
    run_stages(["auto_clean"], ctx)
    assert ctx.df.count() == 2
    assert ctx.remediation_logs == ["resolved_1_duplicates"]


def test_auto_clean_off_leaves_data_untouched(spark):
    ctx = make_ctx(spark, [("a", "1"), ("a", "2")], SPEC, rules={"auto_clean": False})
    run_stages(["auto_clean"], ctx)
    assert ctx.df.count() == 2 and ctx.remediation_logs == []


def test_validation_flags_missing_key_and_null_values(spark):
    ctx = make_ctx(spark, [("a", "1"), (None, "2"), ("c", None)], SPEC)
    run_stages(["validation"], ctx)
    reasons = {r["reject_reason"] for r in ctx.invalid_df.collect()}
    assert reasons == {"missing_primary_key", "null_value_in_score"}
    assert [r["id"] for r in ctx.valid_df.collect()] == ["a"]


def test_dedup_moves_extra_copies_to_duplicates(spark):
    ctx = make_ctx(spark, [("a", "1"), ("a", "1"), ("b", "2")], SPEC)
    run_stages(["validation", "dedup"], ctx)
    assert ctx.clean_df.count() == 2
    dups = ctx.duplicate_df.collect()
    assert len(dups) == 1 and dups[0]["reject_reason"] == "duplicate_records"
    assert "is_invalid" not in ctx.clean_df.columns


def test_dates_standardised_including_buddhist_year(spark):
    spec = {"id": "StringType", "date": "StringType"}
    ctx = make_ctx(spark, [("a", "21 Jul 2569"), ("b", "15/09/2026")], spec)
    run_stages(["validation", "dedup", "standardize_dates"], ctx)
    assert sorted(r["date"] for r in ctx.clean_df.collect()) == ["2026-07-21", "2026-09-15"]


def test_categories_mapped_by_keyword_with_fallback(spark):
    spec = {"id": "StringType", "product": "StringType"}
    ctx = make_ctx(spark, [("a", "Green Apple"), ("b", "Rock")], spec)
    ctx.load_std_rules = lambda table: {"product": {"categories": {"Fruit": ["apple"]}, "fallback": "Other"}}
    run_stages(["validation", "dedup", "standardize_categories"], ctx)
    assert {r["id"]: r["product"] for r in ctx.clean_df.collect()} == {"a": "Fruit", "b": "Other"}
