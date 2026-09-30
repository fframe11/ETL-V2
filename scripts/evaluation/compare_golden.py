"""Compare two golden-run results; exit 1 when any counted field differs.
Timing fields are ignored on purpose: a refactor may change speed, not results."""
import json
import sys

FIELDS = ("total_records", "clean_records", "quarantined_records", "quarantine_breakdown")


def diff_runs(before: dict, after: dict) -> list:
    return [f"{f}: {before.get(f)} != {after.get(f)}" for f in FIELDS if before.get(f) != after.get(f)]


def main(argv):
    with open(argv[1], encoding="utf-8") as f:
        before = json.load(f)
    with open(argv[2], encoding="utf-8") as f:
        after = json.load(f)
    diffs = diff_runs(before, after)
    for d in diffs:
        print("DIFF", d)
    print("GOLDEN MATCH" if not diffs else f"GOLDEN MISMATCH ({len(diffs)} fields)")
    return 1 if diffs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
