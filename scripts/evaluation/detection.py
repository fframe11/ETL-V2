"""Compare one batch run's outcome with ground_truth.csv (Evaluation Guideline Step 8).
Usage: python scripts/evaluation/detection.py --dirty D.csv --ground-truth G.csv --active A.csv --quarantine Q.csv"""
import argparse
import csv
import json
from collections import Counter, defaultdict

ERROR_TYPES = ("Missing Score", "Invalid Score Range", "Study Hours Outlier", "Duplicate")
KEY = ("student_id", "course", "semester")


def evaluate(dirty_rows, gt_rows, active_ids, quarantine_reasons, key_cols=KEY):
    def outcome(i):
        if i in quarantine_reasons:
            return "quarantined"
        return "clean" if i in active_ids else "dropped"

    groups = defaultdict(list)
    for r in dirty_rows:
        groups[tuple(r[c] for c in key_cols)].append(r["dirty_row_id"])
    group_of = {i: members for members in groups.values() if len(members) > 1 for i in members}

    per_type = {t: {"actual": 0, "detected": 0} for t in ERROR_TYPES}
    confusion = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    fp_reasons = Counter()
    outcomes = {}
    for g in gt_rows:
        i, etype = g["dirty_row_id"], g["expected_error_type"]
        bad = g["expected_status"] != "Valid"
        outcomes[i] = outcome(i)
        members = group_of.get(i)
        collapsed = bool(members) and sum(outcome(m) == "clean" for m in members) <= 1
        if etype == "Duplicate":
            detected = collapsed
        elif not bad and members and collapsed:
            detected = False  # the kept/removed original of a resolved duplicate is not an error
        else:
            detected = outcomes[i] != "clean"
        if etype in per_type:
            per_type[etype]["actual"] += 1
            per_type[etype]["detected"] += int(detected)
        if bad and detected:
            confusion["tp"] += 1
        elif bad:
            confusion["fn"] += 1
        elif detected:
            confusion["fp"] += 1
            fp_reasons[quarantine_reasons.get(i, "dropped")] += 1
        else:
            confusion["tn"] += 1
    for t in per_type.values():
        t["rate"] = round(t["detected"] / t["actual"], 4) if t["actual"] else None
    tp, fp, fn, tn = confusion["tp"], confusion["fp"], confusion["fn"], confusion["tn"]
    return {
        "per_type": per_type,
        "confusion": confusion,
        "precision": round(tp / (tp + fp), 4) if tp + fp else 0.0,
        "recall": round(tp / (tp + fn), 4) if tp + fn else 0.0,
        "accuracy": round((tp + tn) / (tp + fp + fn + tn), 4) if gt_rows else 0.0,
        "false_positive_reasons": dict(fp_reasons.most_common(10)),
        "outcomes": outcomes,
    }


def _read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    p = argparse.ArgumentParser()
    for name in ("--dirty", "--ground-truth", "--active", "--quarantine"):
        p.add_argument(name, required=True)
    a = p.parse_args()
    active = {r["dirty_row_id"] for r in _read(a.active)}
    quarantine = {r["dirty_row_id"]: r.get("reject_reason", "") for r in _read(a.quarantine)}
    res = evaluate(_read(a.dirty), _read(a.ground_truth), active, quarantine)
    res["outcome_counts"] = dict(Counter(res.pop("outcomes").values()))
    print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
