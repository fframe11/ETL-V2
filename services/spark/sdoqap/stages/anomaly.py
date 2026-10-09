from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("anomaly_iqr", "หา outlier ด้วย IQR", "transform")
def anomaly_iqr(ctx):
    rules, schema_spec, clean_df, remediation_logs = ctx.rules, ctx.schema_spec, ctx.clean_df, ctx.remediation_logs
    # ─── DYNAMIC RULES Layer 2: IQR Value Range Outlier Detection ─────────────
    outlier_df = None
    value_range_profile = {}
    try:
        from dynamic_rules_engine import compute_value_range_rules, flag_outlier_rows
        vr_config = rules.get("value_range", {})
        od_config = rules.get("outlier_detection", {})
        vr_mode = vr_config.get("mode", "off") if isinstance(vr_config, dict) else "off"
        od_method = od_config.get("method") if isinstance(od_config, dict) else None
        
        if vr_mode in ("auto", "adaptive") or od_method == "iqr":
            # Identify numeric columns from outlier_detection columns or schema_spec
            if od_method == "iqr" and od_config.get("columns"):
                numeric_cols = [c for c in od_config.get("columns", []) if c in clean_df.columns]
            else:
                numeric_cols = [col for col, t in schema_spec.items() 
                               if t in ("IntegerType", "DoubleType") and col in clean_df.columns]
            
            if numeric_cols:
                iqr_mult = od_config.get("multiplier", 1.5) if od_method == "iqr" else vr_config.get("iqr_multiplier", 1.5)
                value_range_profile = compute_value_range_rules(clean_df, numeric_cols, multiplier=iqr_mult)
                
                if value_range_profile:
                    flagged_df = flag_outlier_rows(clean_df, value_range_profile)
                    outlier_df = flagged_df.filter(F.col("_outlier_flag") == True) \
                                          .withColumn("is_invalid", F.lit(True)) \
                                          .withColumn("reject_reason", F.col("_outlier_details")) \
                                          .drop("_outlier_flag", "_outlier_details")
                    clean_df = flagged_df.filter((F.col("_outlier_flag") == False) | F.col("_outlier_flag").isNull()) \
                                        .drop("_outlier_flag", "_outlier_details")
                    
                    outlier_count = outlier_df.count()
                    if outlier_count > 0:
                        print(f"[DYNAMIC RULES] IQR outlier detection flagged {outlier_count} rows as value outliers")
                        remediation_logs.append(f"iqr_outliers_flagged_{outlier_count}")
    except ImportError:
        pass  # dynamic_rules_engine not available, skip outlier detection
    except Exception as ore:
        print(f"[DYNAMIC RULES] IQR outlier detection failed: {ore}. Continuing without outlier flagging.")
    ctx.outlier_df, ctx.value_range_profile, ctx.clean_df = outlier_df, value_range_profile, clean_df
    return ctx


@stage("anomaly_zscore", "หา anomaly ด้วย Z-score", "transform")
def anomaly_zscore(ctx):
    schema_spec, clean_df, remediation_logs = ctx.schema_spec, ctx.clean_df, ctx.remediation_logs
    # ─── DYNAMIC RULES: Unsupervised Anomaly Detection (Z-score) ──────────────
    unsupervised_outlier_df = None
    try:
        from dynamic_rules_engine import detect_unsupervised_anomalies
        # Find numeric columns
        numeric_cols = [col for col, t in schema_spec.items() 
                       if t in ("IntegerType", "DoubleType") and col in clean_df.columns]
        if numeric_cols:
            flagged_unsupervised = detect_unsupervised_anomalies(clean_df, numeric_cols, threshold=3.0)
            unsupervised_outlier_df = flagged_unsupervised.filter(F.col("_unsupervised_anomaly") == True) \
                                                          .withColumn("is_invalid", F.lit(True)) \
                                                          .withColumn("reject_reason", F.col("_unsupervised_anomaly_details")) \
                                                          .drop("_unsupervised_anomaly", "_unsupervised_anomaly_details")
            clean_df = flagged_unsupervised.filter((F.col("_unsupervised_anomaly") == False) | F.col("_unsupervised_anomaly").isNull()) \
                                           .drop("_unsupervised_anomaly", "_unsupervised_anomaly_details")
            
            unsupervised_count = unsupervised_outlier_df.count()
            if unsupervised_count > 0:
                print(f"[DYNAMIC RULES] Unsupervised Z-score anomaly detection flagged {unsupervised_count} rows")
                remediation_logs.append(f"unsupervised_anomalies_flagged_{unsupervised_count}")
    except ImportError:
        pass
    except Exception as uae:
        print(f"[DYNAMIC RULES] Unsupervised anomaly detection failed: {uae}. Continuing.")
    ctx.unsupervised_outlier_df, ctx.clean_df = unsupervised_outlier_df, clean_df
    return ctx


@stage("anomaly_induced", "ใช้กฎที่เรียนรู้จาก Decision Tree", "transform")
def anomaly_induced(ctx):
    rules, clean_df, remediation_logs = ctx.rules, ctx.clean_df, ctx.remediation_logs
    # ─── DYNAMIC RULES: Induced Tree Rules ────────────────────────────────────
    induced_outlier_df = None
    try:
        induced_config = rules.get("induced", {})
        if induced_config:
            # We will build a combined SQL filter expression from all induced rules
            conditions = []
            for rule_name, rule_data in induced_config.items():
                cond = rule_data.get("condition")
                if cond:
                    conditions.append(f"({cond})")
            
            if conditions:
                combined_sql_cond = " OR ".join(conditions)
                print(f"[DYNAMIC ENGINE] Applying induced rules filter: {combined_sql_cond}")
                
                # Flag rows matching the induced conditions
                flagged_induced = clean_df.withColumn(
                    "_induced_anomaly", 
                    F.expr(combined_sql_cond)
                )
                
                induced_outlier_df = flagged_induced.filter(F.col("_induced_anomaly") == True) \
                    .withColumn("is_invalid", F.lit(True)) \
                    .withColumn("reject_reason", F.lit("induced_tree_rule_match")) \
                    .drop("_induced_anomaly")
                
                clean_df = flagged_induced.filter((F.col("_induced_anomaly") == False) | F.col("_induced_anomaly").isNull()) \
                    .drop("_induced_anomaly")
                
                induced_count = induced_outlier_df.count()
                if induced_count > 0:
                    print(f"[DYNAMIC ENGINE] Induced ML rules flagged {induced_count} rows")
                    remediation_logs.append(f"induced_rules_flagged_{induced_count}")
    except Exception as ie:
        print(f"[DYNAMIC ENGINE] Induced rules execution failed: {ie}. Continuing.")
    ctx.induced_outlier_df, ctx.clean_df = induced_outlier_df, clean_df
    return ctx
