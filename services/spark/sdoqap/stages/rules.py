from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


def _violation(col, bounds):
    cond = F.lit(False)
    if bounds.get("min") is not None:
        cond = cond | (F.col(col) < F.lit(bounds["min"]))
    if bounds.get("max") is not None:
        cond = cond | (F.col(col) > F.lit(bounds["max"]))
    return F.col(col).isNotNull() & cond


@stage("range_rules", "ตรวจช่วงค่าตามกฎธุรกิจ", "transform")
def range_rules(ctx):
    """Business range checks from rules['range_checks'], e.g. score 0-100. Unlike IQR,
    these bounds are declared by the data owner, so a batch where every score is out
    of range is still caught. Bounds are inclusive; NULLs are left to validation."""
    checks = {c: b for c, b in (ctx.rules.get("range_checks") or {}).items() if c in ctx.clean_df.columns}
    vr = ctx.rules.get("value_range")
    if isinstance(vr, dict) and vr.get("mode") == "non_negative":
        min_v = vr.get("min_value", 0.0)
        for col in vr.get("columns", []):
            if col in ctx.clean_df.columns and col not in checks:
                checks[col] = {"min": min_v}
    if not checks:
        return ctx
    reasons = [F.when(_violation(c, b), F.lit(f"out_of_range_{c}")) for c, b in checks.items()]
    flagged = ctx.clean_df.withColumn("_range_reason", F.concat_ws("; ", *reasons))
    ctx.range_violation_df = flagged.filter(F.col("_range_reason") != "") \
        .withColumn("is_invalid", F.lit(True)) \
        .withColumn("reject_reason", F.col("_range_reason")) \
        .drop("_range_reason")
    ctx.clean_df = flagged.filter(F.col("_range_reason") == "").drop("_range_reason")
    count = ctx.range_violation_df.count()
    if count:
        ctx.remediation_logs.append(f"range_rule_violations_{count}")
    return ctx
