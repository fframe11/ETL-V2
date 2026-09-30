"""Profile a raw CSV before it enters the ETL (Evaluation Guideline Step 6).
Usage: python scripts/evaluation/profile_before.py <csv>  -> JSON on stdout"""
import csv
import json
import sys


def percentile(sorted_values, q):
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    pos = (len(sorted_values) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(sorted_values) - 1)
    return float(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo))


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def profile(rows, key_cols=("student_id", "course", "semester"), score_col="score", hours_col="study_hours", tukey=3.0):
    columns = list(rows[0].keys()) if rows else []
    null_counts = {c: sum(1 for r in rows if str(r.get(c, "")).strip() == "") for c in columns}
    scores = [s for s in (_num(r.get(score_col)) for r in rows) if s is not None]
    hours = sorted(h for h in (_num(r.get(hours_col)) for r in rows) if h is not None)
    seen, duplicates = set(), 0
    for r in rows:
        key = tuple(r.get(c) for c in key_cols)
        if key in seen:
            duplicates += 1
        seen.add(key)
    fences = None
    outliers = 0
    if hours:
        q1, q3 = percentile(hours, 0.25), percentile(hours, 0.75)
        fences = [q1 - tukey * (q3 - q1), q3 + tukey * (q3 - q1)]
        outliers = sum(1 for h in hours if h < fences[0] or h > fences[1])
    return {
        "rows": len(rows),
        "null_counts": null_counts,
        "invalid_score": sum(1 for s in scores if s < 0 or s > 100),
        "duplicate_rows": duplicates,
        "study_hours_outliers": outliers,
        "study_hours_fences": fences,
        "score_min": min(scores) if scores else None,
        "score_max": max(scores) if scores else None,
        "study_hours_min": hours[0] if hours else None,
        "study_hours_max": hours[-1] if hours else None,
    }


if __name__ == "__main__":
    with open(sys.argv[1], newline="", encoding="utf-8") as f:
        print(json.dumps(profile(list(csv.DictReader(f))), indent=2, ensure_ascii=False))
