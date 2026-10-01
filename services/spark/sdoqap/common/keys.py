"""Primary-key guess for a table that has no registered schema yet.

The old guess was "the first column whose name contains 'id'". On the student scores
sample that is student_id, which repeats (250 distinct values in 1030 rows), so the MERGE
into the active layer silently collapsed 1030 rows to 250. A guessed key is now checked
against the data: it must be (almost) unique, and when a single id column is not enough the
smallest composite of id + text/date columns that is is used. When nothing qualifies the
caller keeps every row by falling back to a row hash."""
from itertools import combinations

from pyspark.sql import functions as F

# A few genuinely duplicated (dirty) rows must not hide the real key, so this is a ratio.
MIN_UNIQUE_RATIO = 0.9
MAX_EXTRA_COLUMNS = 5
MAX_KEY_SIZE = 3
# Measures (numbers, timestamps) can look unique by accident, so only these join a composite.
_COMPOSITE_PART_TYPES = ("StringType", "DateType", "BooleanType")


def id_candidates(columns, table_name):
    """Id-like columns, best first: an exact id name, then every column containing 'id'."""
    exact_names = ("id", f"{table_name}_id", f"{table_name}id")
    exact = [c for c in columns if c.lower() in exact_names][:1]
    return exact + [c for c in columns if "id" in c.lower() and c not in exact]


def infer_primary_key(df, table_name, min_unique_ratio=MIN_UNIQUE_RATIO, log=print):
    """A column name, a list of column names, or None when no id-like column is unique enough."""
    candidates = id_candidates(df.columns, table_name)
    if not candidates:
        return None
    first = candidates[0]
    types = {f.name: f.dataType.__class__.__name__ for f in df.schema.fields}
    extras = [c for c in df.columns if c != first and types[c] in _COMPOSITE_PART_TYPES][:MAX_EXTRA_COLUMNS]

    keys = [(c,) for c in candidates]
    for size in range(1, MAX_KEY_SIZE):
        keys += [(first,) + combo for combo in combinations(extras, size)]

    row = df.agg(F.count(F.lit(1)).alias("total"),
                 *[F.countDistinct(*[F.col(c) for c in key]).alias(f"k{i}") for i, key in enumerate(keys)]).first()
    total = row["total"]
    if not total:
        return first  # nothing to judge on an empty dataset; keep the old behaviour
    ratios = [row[f"k{i}"] / total for i in range(len(keys))]
    for key, ratio in zip(keys, ratios):
        log(f"[KEY] {'+'.join(key)}: {ratio:.1%} distinct")

    singles = [(k, r) for k, r in zip(keys, ratios) if len(k) == 1 and r >= min_unique_ratio]
    if singles:
        return singles[0][0][0]
    composites = sorted(((len(k), -r, i, k) for i, (k, r) in enumerate(zip(keys, ratios))
                         if len(k) > 1 and r >= min_unique_ratio))
    return list(composites[0][3]) if composites else None
