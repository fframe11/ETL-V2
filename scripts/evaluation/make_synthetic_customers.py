"""Synthetic customer dataset with known anomalies, for evaluating the pipeline against ground truth.

Everything here is SYNTHETIC TEST DATA (fixed seed, reproducible). Nothing is read from real customers.

Outputs, per size N, in data/evaluation/synthetic/:
  customers_<N>.csv           the file to ingest (no label columns, so the engine cannot see the answer)
  ground_truth_<N>.csv        rec_no, is_anomaly_ground_truth (0/1), anomaly_type, expected_handling
  customers_<N>_labeled.csv   both joined, for reading only (do not ingest)
and schema drift variants of a 2,000 row batch in data/evaluation/synthetic/drift/.

The join key is `rec_no`, a column with no "id" in its name, so primary-key inference still picks
customer_id (the real business key) and duplicate customer_ids stay detectable.

Usage: python scripts/evaluation/make_synthetic_customers.py [--sizes 10000 50000] [--seed 20261008]
"""
import argparse
import csv
import os
import random
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "evaluation", "synthetic")
COLUMNS = ["customer_id", "rec_no", "age", "income", "email", "phone", "signup_date", "quantity", "price", "segment"]
SEGMENTS = ["Retail", "Wholesale", "Online", "Corporate"]  # no food or seafood terms (project invariant)
BASE_DATE = datetime(2026, 1, 1)

# Share of N for each injected problem. Clean rows end up around 80 to 85 percent.
RATES = {
    "null_customer_id": 0.010,
    "null_age": 0.020,
    "null_income": 0.020,
    "duplicate": 0.020,
    "invalid_email": 0.030,
    "invalid_phone": 0.030,
    "impossible_date": 0.010,
    "outlier_income": 0.020,
    "outlier_quantity": 0.010,
    "outlier_price": 0.010,
}
DATE_VARIANT_RATE = 0.05  # valid dates written dd/MM/yyyy: NOT anomalies, must be standardised


def _clean_row(rng, n):
    signup = BASE_DATE + timedelta(days=rng.randint(0, 250), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
    cid = 100000 + n
    return {
        "customer_id": str(cid),
        "age": str(min(80, max(18, round(rng.gauss(38, 11))))),
        "income": str(round(min(95000, max(9000, rng.gauss(35000, 9000))), 2)),
        "email": f"user{cid}@example.com",
        "phone": "0" + rng.choice("689") + "".join(rng.choice("0123456789") for _ in range(8)),
        "signup_date": signup.strftime("%Y-%m-%d %H:%M:%S"),
        "quantity": str(rng.randint(1, 10)),
        "price": str(round(rng.uniform(50, 2000), 2)),
        "segment": rng.choice(SEGMENTS),
    }


def _bad_email(rng, row):
    return rng.choice([row["email"].replace("@", ""), row["email"].replace(".com", ""), "user @example.com", "@example.com"])


def _bad_phone(rng):
    return rng.choice(["12345", "0812-ABC-999", "+66 (0) 81", "081234567890123", "call-me"])


def build(n_rows, seed):
    """Return (rows, truth). rows are dicts with COLUMNS; truth are dicts keyed by rec_no."""
    rng = random.Random(seed)
    counts = {k: int(round(v * n_rows)) for k, v in RATES.items()}
    n_base = n_rows - counts["duplicate"]
    rows = [_clean_row(rng, i) for i in range(n_base)]
    truth = [{"anomaly_type": "none", "expected_handling": "active"} for _ in rows]

    # One problem per row (disjoint rows), so every label is unambiguous.
    free = list(range(n_base))
    rng.shuffle(free)
    take = lambda k: [free.pop() for _ in range(k)]

    for i in take(counts["null_customer_id"]):
        rows[i]["customer_id"] = ""
        truth[i] = {"anomaly_type": "null_customer_id", "expected_handling": "quarantine"}
    for i in take(counts["null_age"]):
        rows[i]["age"] = ""
        truth[i] = {"anomaly_type": "null_age", "expected_handling": "quarantine"}
    for i in take(counts["null_income"]):
        rows[i]["income"] = ""
        truth[i] = {"anomaly_type": "null_income", "expected_handling": "quarantine"}
    for i in take(counts["invalid_email"]):
        rows[i]["email"] = _bad_email(rng, rows[i])
        truth[i] = {"anomaly_type": "invalid_email", "expected_handling": "quarantine"}
    for i in take(counts["invalid_phone"]):
        rows[i]["phone"] = _bad_phone(rng)
        truth[i] = {"anomaly_type": "invalid_phone", "expected_handling": "quarantine"}
    for i in take(counts["impossible_date"]):
        rows[i]["signup_date"] = rng.choice(["2026-13-45", "31/02/2026", "not-a-date", "0000-00-00"])
        truth[i] = {"anomaly_type": "impossible_date", "expected_handling": "quarantine"}
    for i in take(counts["outlier_income"]):
        rows[i]["income"] = str(round(rng.uniform(900000, 5000000), 2))
        truth[i] = {"anomaly_type": "outlier_income", "expected_handling": "quarantine"}
    for i in take(counts["outlier_quantity"]):
        rows[i]["quantity"] = str(rng.choice([500, 1000, 5000, 9999]))
        truth[i] = {"anomaly_type": "outlier_quantity", "expected_handling": "quarantine"}
    for i in take(counts["outlier_price"]):
        rows[i]["price"] = str(rng.choice([-100.0, -1.0, 99999.0, 250000.0]))
        truth[i] = {"anomaly_type": "outlier_price", "expected_handling": "quarantine"}
    # Valid dates in another notation: should be standardised, not rejected.
    for i in take(int(round(DATE_VARIANT_RATE * n_rows))):
        d = datetime.strptime(rows[i]["signup_date"], "%Y-%m-%d %H:%M:%S")
        # Day above 12 so dd/MM/yyyy cannot be mistaken for MM/dd/yyyy.
        rows[i]["signup_date"] = d.replace(day=rng.randint(13, 28)).strftime("%d/%m/%Y")
        truth[i] = {"anomaly_type": "date_format_variant", "expected_handling": "active_standardised"}

    # Duplicates: exact copies of clean rows (same customer_id), appended at random positions.
    clean_idx = [i for i, t in enumerate(truth) if t["anomaly_type"] == "none"]
    for src in rng.sample(clean_idx, counts["duplicate"]):
        rows.append(dict(rows[src]))
        truth.append({"anomaly_type": "duplicate", "expected_handling": "dropped_by_dedup"})
    order = list(range(len(rows)))
    rng.shuffle(order)
    rows = [rows[i] for i in order]
    truth = [truth[i] for i in order]
    for n, (r, t) in enumerate(zip(rows, truth), start=1):
        r["rec_no"] = str(n)
        t["rec_no"] = str(n)
        t["is_anomaly_ground_truth"] = "0" if t["anomaly_type"] in ("none", "date_format_variant") else "1"
    return rows, truth, counts


def _write(path, rows, fields):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def write_dataset(n_rows, seed):
    rows, truth, counts = build(n_rows, seed)
    _write(os.path.join(OUT, f"customers_{n_rows}.csv"), rows, COLUMNS)
    tfields = ["rec_no", "is_anomaly_ground_truth", "anomaly_type", "expected_handling"]
    _write(os.path.join(OUT, f"ground_truth_{n_rows}.csv"), truth, tfields)
    labeled = [{**r, **{k: t[k] for k in tfields[1:]}} for r, t in zip(rows, truth)]
    _write(os.path.join(OUT, f"customers_{n_rows}_labeled.csv"), labeled, COLUMNS + tfields[1:])
    anomalies = sum(t["is_anomaly_ground_truth"] == "1" for t in truth)
    print(f"{n_rows}: {len(rows)} rows, {anomalies} anomalies ({anomalies / len(rows):.1%}), clean {len(rows) - anomalies}")
    return rows


def write_drift_variants(seed, n_rows=2000):
    """Five batches of the same table. v0a/v0b share the schema (v0b is the false-detection control)."""
    d = os.path.join(OUT, "drift")
    v0a, _, _ = build(n_rows, seed + 1)
    v0b, _, _ = build(n_rows, seed + 2)
    for r in v0b:  # distinct business keys so v0b is a new batch, not a replay
        r["customer_id"] = str(int(r["customer_id"]) + 500000) if r["customer_id"] else ""
    _write(os.path.join(d, "v0a_original.csv"), v0a, COLUMNS)
    _write(os.path.join(d, "v0b_original_control.csv"), v0b, COLUMNS)

    rng = random.Random(seed + 3)
    base = build(n_rows, seed + 4)[0]
    for r in base:
        r["customer_id"] = str(int(r["customer_id"]) + 900000) if r["customer_id"] else ""

    add = [dict(r, loyalty_tier=rng.choice(["bronze", "silver", "gold"])) for r in base]
    _write(os.path.join(d, "v1_add_column.csv"), add, COLUMNS + ["loyalty_tier"])

    remove = [{k: v for k, v in r.items() if k != "phone"} for r in base]
    _write(os.path.join(d, "v2_remove_column.csv"), remove, [c for c in COLUMNS if c != "phone"])

    retype = [dict(r) for r in base]
    for r in retype:  # age and income switch from numbers to text
        if r["age"]:
            r["age"] = f"{r['age']} years"
        if r["income"]:
            r["income"] = f"{float(r['income']):,.0f} THB"
    _write(os.path.join(d, "v3_change_type.csv"), retype, COLUMNS)

    rename = [dict(r) for r in base]
    for r in rename:
        r["annual_income"] = r.pop("income")
    _write(os.path.join(d, "v4_rename_column.csv"), rename, [("annual_income" if c == "income" else c) for c in COLUMNS])
    print(f"drift variants: 6 files of {n_rows} rows in {os.path.relpath(d, ROOT)}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--sizes", nargs="*", type=int, default=[10000, 50000])
    p.add_argument("--seed", type=int, default=20261008)
    a = p.parse_args()
    for n in a.sizes:
        write_dataset(n, a.seed)
    write_drift_variants(a.seed)


if __name__ == "__main__":
    main()
