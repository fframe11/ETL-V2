import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sdoqap.common.reasons import (
    MAX_BREAKDOWN_REASONS, OTHER_REASONS_KEY, bound_breakdown, normalize_reason, split_reasons,
)


def test_plain_reasons_are_kept():
    assert split_reasons("missing_primary_key; null_value_in_a") == ["missing_primary_key", "null_value_in_a"]
    assert normalize_reason("duplicate_records") == "duplicate_records"


def test_outlier_reason_drops_the_data_value():
    # Same column, different values -> one key. This was one new Elasticsearch field per value.
    a = split_reasons("product_weight_g=40000 (expected [1.0000, 9.0000])")
    b = split_reasons("product_weight_g=41234 (expected [1.0000, 9.0000])")
    assert a == b == ["outlier_product_weight_g"]


def test_zscore_reason_and_pipe_separated_columns():
    assert split_reasons("price_zscore=4.12 (val=price deviates > 3.0σ)") == ["zscore_price"]
    assert split_reasons("a=1 (expected [0, 1]) | b=2 (expected [0, 1])") == ["outlier_a", "outlier_b"]


def test_empty_reason_is_unknown_and_dots_are_replaced():
    assert split_reasons("") == ["unknown"]
    assert split_reasons(None) == ["unknown"]
    assert normalize_reason("null_value_in_a.b") == "null_value_in_a_b"


def test_breakdown_is_bounded_and_keeps_the_total():
    breakdown = {f"reason_{i}": i + 1 for i in range(MAX_BREAKDOWN_REASONS + 30)}
    bounded = bound_breakdown(breakdown)
    assert len(bounded) == MAX_BREAKDOWN_REASONS + 1
    assert sum(bounded.values()) == sum(breakdown.values())
    assert OTHER_REASONS_KEY in bounded
    assert "reason_0" not in bounded  # the smallest were folded into the other key


def test_small_breakdown_is_returned_unchanged():
    breakdown = {"a": 2, "b": 1}
    assert bound_breakdown(breakdown) == {"a": 2, "b": 1}
