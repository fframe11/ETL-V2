from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("auto_clean", "แก้ข้อมูลอัตโนมัติด้วยกฎ DSL และลบแถวซ้ำตามคีย์", "transform")
def auto_clean(ctx):
    rules, df, primary_key, date_column = ctx.rules, ctx.df, ctx.primary_key, ctx.date_column
    apply_dsl_remediation_rules = ctx.apply_dsl
    # 2. AUTO-CLEANSING & HEALING (Self-Healing Data Pipeline - Correct Enterprise Logic)
    # We do NOT generate fake values (UUIDs/Timestamps) for structural keys (PKs/Dates) as it violates data integrity.
    # We only perform safe deduplication and format-level normalization.
    auto_clean = rules.get("auto_clean", True)
    remediation_logs = []
    
    if auto_clean:
        print("[AUTO-CLEAN] Starting self-healing preprocessing...")
        # Apply deterministic DSL remediation rules (L3 Rule Engine)
        df = apply_dsl_remediation_rules(df, rules)
        
        # 2.1 Safe Deduplication (Resolve duplicates on valid PKs)
        pk_cols = [primary_key] if isinstance(primary_key, str) else primary_key
        
        # Filter rows with non-null PKs for deduplication, leaving null PKs to be quarantined
        non_null_pk_cond = F.col(primary_key).isNotNull() if isinstance(primary_key, str) else F.col(pk_cols[0]).isNotNull()
        df_non_null = df.filter(non_null_pk_cond)
        df_null_pk = df.filter(~non_null_pk_cond)
        
        df_count_before = df_non_null.count()
        if date_column and date_column in df.columns:
            df_non_null = df_non_null.orderBy(F.col(date_column).desc())
            
        df_non_null_dedup = df_non_null.dropDuplicates(subset=pk_cols)
        df_count_after = df_non_null_dedup.count()
        
        dup_resolved = df_count_before - df_count_after
        if dup_resolved > 0:
            print(f"[AUTO-CLEAN] Deduplicated and resolved {dup_resolved} duplicate records.")
            remediation_logs.append(f"resolved_{dup_resolved}_duplicates")
            
        # Re-combine non-null deduped rows with null PK rows to preserve data integrity
        df = df_non_null_dedup.unionByName(df_null_pk, allowMissingColumns=True)
    ctx.df, ctx.remediation_logs, ctx.auto_clean = df, remediation_logs, auto_clean
    return ctx


@stage("validation", "ตรวจค่าว่าง ชนิดข้อมูล และวันที่", "transform")
def validation(ctx):
    primary_key, df, schema_spec, date_column = ctx.primary_key, ctx.df, ctx.schema_spec, ctx.date_column
    # 3. DATA VALIDATION (Row-level Quality check)
    pk_cols = [primary_key] if isinstance(primary_key, str) else primary_key
    if isinstance(primary_key, list):
        null_cond = F.col(primary_key[0]).isNull()
        for pk in primary_key[1:]:
            null_cond = null_cond | F.col(pk).isNull()
        df_with_status = df.withColumn("is_invalid", null_cond) \
                           .withColumn("reject_reason", F.when(F.col("is_invalid"), F.lit("missing_primary_key")).otherwise(F.lit("")))
    else:
        df_with_status = df.withColumn("is_invalid", F.col(primary_key).isNull()) \
                           .withColumn("reject_reason", F.when(F.col("is_invalid"), F.lit("missing_primary_key")).otherwise(F.lit("")))

    # ─── Null Validation: Check all schema columns for null values ─────────────
    non_pk_cols = [c for c in schema_spec.keys() if c not in pk_cols and c in df.columns]
    for col_name in non_pk_cols:
        null_reason = f"null_value_in_{col_name}"
        df_with_status = df_with_status.withColumn(
            "reject_reason",
            F.when(
                (~F.col("is_invalid")) & F.col(col_name).isNull(),
                F.when(F.col("reject_reason") == F.lit(""), F.lit(null_reason))
                 .otherwise(F.concat(F.col("reject_reason"), F.lit("; "), F.lit(null_reason)))
            ).otherwise(F.col("reject_reason"))
        ).withColumn(
            "is_invalid",
            F.col("is_invalid") | F.col(col_name).isNull()
        )

    # ─── Type Validation: Check numeric columns for invalid values ─────────────
    numeric_type_cols = [c for c, t in schema_spec.items()
                         if t in ("IntegerType", "DoubleType") and c in df.columns and c != primary_key]
    for col_name in numeric_type_cols:
        cast_type = "int" if schema_spec[col_name] == "IntegerType" else "double"
        cast_col_name = f"__{col_name}_cast_check"
        df_with_status = df_with_status.withColumn(
            cast_col_name, F.col(col_name).cast(cast_type)
        )
        type_reason = f"invalid_type_{col_name}"
        df_with_status = df_with_status.withColumn(
            "reject_reason",
            F.when(
                (~F.col("is_invalid")) & F.col(col_name).isNotNull() & F.col(cast_col_name).isNull(),
                F.when(F.col("reject_reason") == F.lit(""), F.lit(type_reason))
                 .otherwise(F.concat(F.col("reject_reason"), F.lit("; "), F.lit(type_reason)))
            ).otherwise(F.col("reject_reason"))
        ).withColumn(
            "is_invalid",
            F.col("is_invalid") | (F.col(col_name).isNotNull() & F.col(cast_col_name).isNull())
        ).drop(cast_col_name)

    if date_column and date_column in df.columns:
        df_with_status = df_with_status.withColumn(
            "is_invalid",
            F.col("is_invalid") | F.col(date_column).isNull()
        ).withColumn(
            "reject_reason",
            F.when(F.col(date_column).isNull() & F.col("is_invalid"), F.concat(F.col("reject_reason"), F.lit("; missing_date")))
             .when(F.col(date_column).isNull(), F.lit("missing_date"))
             .otherwise(F.col("reject_reason"))
        )

    # Filter Valid vs Invalid records (handling NULLs in is_invalid)
    invalid_df = df_with_status.filter(F.col("is_invalid") | F.col("is_invalid").isNull())
    valid_df = df_with_status.filter(~F.col("is_invalid") & F.col("is_invalid").isNotNull())
    ctx.df_with_status, ctx.invalid_df, ctx.valid_df = df_with_status, invalid_df, valid_df
    return ctx


@stage("dedup", "คัดแถวซ้ำและเก็บแถวล่าสุด", "transform")
def dedup(ctx):
    valid_df, primary_key, date_column, df = ctx.valid_df, ctx.primary_key, ctx.date_column, ctx.df
    # Check duplicates on valid records (incremental deduplication)
    # Bug 1 & 2 Fix: OOM Window Function -> Optimized dropDuplicates and Anti-Join
    pk_cols = [primary_key] if isinstance(primary_key, str) else primary_key
    valid_df_with_id = valid_df.withColumn("__row_id", F.monotonically_increasing_id())

    if date_column and date_column in df.columns:
        valid_df_with_id = valid_df_with_id.orderBy(F.col(date_column).desc())
    
    # Efficiently keep only the latest unique records
    valid_dedup_with_id = valid_df_with_id.dropDuplicates(subset=pk_cols)
    clean_df = valid_dedup_with_id.drop("__row_id", "is_invalid", "reject_reason")
    # Find the dropped duplicates by Anti-Join to send to quarantine
    duplicate_df = valid_df_with_id.join(valid_dedup_with_id.select("__row_id"), on="__row_id", how="left_anti") \
                                   .drop("__row_id") \
                                   .withColumn("reject_reason", F.lit("duplicate_records"))
    ctx.valid_df_with_id, ctx.valid_dedup_with_id = valid_df_with_id, valid_dedup_with_id
    ctx.clean_df, ctx.duplicate_df = clean_df, duplicate_df
    return ctx
