"""Per-column profile stored on every quality run, read by the Rules page "Column Profiler"."""
from pyspark.sql import functions as F

DEFAULT_NULL_TOLERANCE = 0.05
_FLOAT_TYPES = ("DoubleType", "FloatType")


def _tolerance(column, rules):
    config = (rules or {}).get("null_checks") or {}
    if config.get("mode") == "strict":
        return 0.0
    overrides = config.get("column_overrides") or {}
    value = overrides.get(column, config.get("default_tolerance", DEFAULT_NULL_TOLERANCE))
    return float(value)


def null_profile(df, pk_cols, rules):
    """{column: {null_rate, tolerance, is_required}} for the whole dataset.

    null_rate counts NULL and, for floating point columns, NaN. Primary key columns are the
    required ones. One aggregation pass; an empty dataset has no rates to report."""
    types = {f.name: f.dataType.__class__.__name__ for f in df.schema.fields}
    exprs = [F.count(F.lit(1)).alias("__total")]
    for i, column in enumerate(df.columns):
        missing = F.col(column).isNull()
        if types[column] in _FLOAT_TYPES:
            missing = missing | F.isnan(F.col(column))
        exprs.append(F.sum(F.when(missing, 1).otherwise(0)).alias(f"n{i}"))
    row = df.agg(*exprs).first()
    total = row["__total"]
    if not total:
        return {}
    required = set(pk_cols or [])
    return {
        column: {
            "null_rate": round((row[f"n{i}"] or 0) / total, 6),
            "tolerance": _tolerance(column, rules),
            "is_required": column in required,
        }
        for i, column in enumerate(df.columns)
    }
