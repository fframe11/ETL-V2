import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.whitebox import _build_dynamic_context_fallback

STATE = {"min_score": 0, "max_score": 100, "null_policy": "strict_0", "tukey_multiplier": "3.0"}


def test_no_metrics_means_no_text():
    result = _build_dynamic_context_fallback("t", {}, STATE, {})
    assert result["available"] is False
    assert result["step1_findings"] == {}
    assert result["model"] is None


def test_text_uses_real_counts_including_zero():
    metrics = {
        "total_rows": 61, "clean_rows": 58, "review_rows": 1, "quarantine_rows": 2,
        "quality_score_pct": 95.1, "missing_score_count": 0, "invalid_range_count": 1,
        "gate2_quarantined": 1, "upper_fence": 9.0, "q1": 4.0, "q3": 6.0, "iqr": 2.0,
    }
    profile = {"columns_profile": {"score": {"min": 50.0, "max": 150.0}}}
    result = _build_dynamic_context_fallback("ui_check", metrics, STATE, profile)
    text = " ".join(
        v for section in ("step1_findings", "step2_rules", "step5_lineage") for v in result[section].values()
    )
    assert result["available"] is True
    assert result["ai_live_generated"] is False and result["model"] is None
    assert "61 แถว" in text and "58 แถว" in text
    assert "ค่าว่าง 0 แถว" in text  # a real zero must not become a demo default
    assert "50 ถึง 150" in text
    for invented in ("9,400", "93.1", "-10", "Batch Retry"):
        assert invented not in text
