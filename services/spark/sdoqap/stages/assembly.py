from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("quarantine_assembly", "รวมแถวที่ไม่ผ่านเข้าโซนกักกัน", "transform")
def quarantine_assembly(ctx):
    invalid_df, duplicate_df = ctx.invalid_df, ctx.duplicate_df
    outlier_df, unsupervised_outlier_df, induced_outlier_df = ctx.outlier_df, ctx.unsupervised_outlier_df, ctx.induced_outlier_df
    run_id, clean_df = ctx.run_id, ctx.clean_df
    # Combine all quarantined records (null PKs + duplicates + outliers + unsupervised anomalies + induced anomalies)
    all_quarantined = invalid_df.unionByName(duplicate_df, allowMissingColumns=True)
    if unsupervised_outlier_df is not None:
        try:
            if unsupervised_outlier_df.count() > 0:
                all_quarantined = all_quarantined.unionByName(unsupervised_outlier_df, allowMissingColumns=True)
        except Exception:
            pass
    if outlier_df is not None:
        try:
            outlier_count_check = outlier_df.count()
            if outlier_count_check > 0:
                all_quarantined = all_quarantined.unionByName(outlier_df, allowMissingColumns=True)
        except Exception:
            pass
    if induced_outlier_df is not None:
        try:
            if induced_outlier_df.count() > 0:
                all_quarantined = all_quarantined.unionByName(induced_outlier_df, allowMissingColumns=True)
        except Exception:
            pass

    # Add run_id partition structure to quarantined parquet
    all_quarantined_write = all_quarantined.withColumn("run_id", F.lit(run_id)) \
                                           .withColumn("rejected_at", F.current_timestamp())

    # Cache and count before writing to avoid re-reading and partial failures
    clean_df.cache()
    all_quarantined_write.cache()

    clean_count = clean_df.count()
    quarantine_count = all_quarantined_write.count()
    total_records = clean_count + quarantine_count
    ctx.clean_df = clean_df
    ctx.all_quarantined, ctx.all_quarantined_write = all_quarantined, all_quarantined_write
    ctx.clean_count, ctx.quarantine_count, ctx.total_records = clean_count, quarantine_count, total_records
    return ctx


@stage("column_filter", "ตัดคอลัมน์ที่ไม่อยู่ใน schema", "transform")
def column_filter(ctx):
    schema_spec, primary_key, rules = ctx.schema_spec, ctx.primary_key, ctx.rules
    clean_df, remediation_logs = ctx.clean_df, ctx.remediation_logs
    if schema_spec:
        allowed_cols = list(schema_spec.keys())
        if primary_key == "row_hash" and "row_hash" not in allowed_cols:
            allowed_cols.append("row_hash")
        for rule in rules.get("remediation_rules", []):
            if rule.get("type") in ("standardize", "semantic_standardize", "auto_strategy"):
                keep_orig = rule.get("keep_original", True)
                if keep_orig:
                    c_name = rule.get("column")
                    out_col = rule.get("output_column", f"{c_name}_semantic" if rule.get("type") in ("semantic_standardize", "auto_strategy") else c_name)
                    if out_col not in allowed_cols:
                        allowed_cols.append(out_col)
                        
        extra_cols = [c for c in clean_df.columns if c not in allowed_cols]
        if extra_cols:
            print(f"[COLUMN FILTER] Stripping {len(extra_cols)} extra columns not in schema: {extra_cols}")
            clean_df = clean_df.select([F.col(c) for c in clean_df.columns if c in allowed_cols])
            remediation_logs.append(f"extra_columns_stripped_{len(extra_cols)}")
    ctx.clean_df = clean_df
    return ctx
