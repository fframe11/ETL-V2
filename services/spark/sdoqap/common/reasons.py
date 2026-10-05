"""Quarantine reject reasons -> the keys of the per-run quarantine_breakdown.

The breakdown is stored in Elasticsearch with every key as its own field. Some reasons embed a
data value ("product_weight_g=40000 (expected [1.0, 9.0])"), so using the text as a key opened a
new field per distinct value and pushed sdoqap_quality_runs past its field limit; the run then
finished without its quality record. Keys must stay bounded by the number of columns, not rows.
"""
import re

MAX_BREAKDOWN_REASONS = 50
OTHER_REASONS_KEY = "other_reasons"

_SPLIT = re.compile(r"[;|]")


def normalize_reason(reason):
    """One reason fragment -> a key without data values. Plain reasons ("missing_date") are kept."""
    reason = reason.strip()
    if "=" in reason:
        name = reason.split("=", 1)[0].strip()
        if name.endswith("_zscore"):
            reason = f"zscore_{name[:-len('_zscore')]}"
        else:
            reason = f"outlier_{name}"
    return reason.replace(".", "_")


def split_reasons(reason_text):
    """A stored reject_reason (several reasons joined by ';' or '|') -> list of normalized keys."""
    keys = [normalize_reason(part) for part in _SPLIT.split(reason_text or "") if part.strip()]
    return [k for k in keys if k.strip()] or ["unknown"]


def bound_breakdown(breakdown, limit=MAX_BREAKDOWN_REASONS):
    """Keep the `limit` biggest reasons and fold the rest into one key."""
    if len(breakdown) <= limit:
        return breakdown
    ranked = sorted(breakdown.items(), key=lambda kv: kv[1], reverse=True)
    kept = dict(ranked[:limit])
    kept[OTHER_REASONS_KEY] = sum(count for _, count in ranked[limit:])
    return kept
