from datetime import datetime, timezone

from pyspark.sql import functions as F

from sdoqap.common.reasons import bound_breakdown, split_reasons
from sdoqap.pipeline.registry import stage


@stage("distribution", "สรุปการกระจายของข้อมูล", "post_load")
def distribution(ctx):
    spark, table_name, clean_count = ctx.spark, ctx.table_name, ctx.clean_count
    active_path = ctx.paths["active"]
    # Class Balance / Data Distribution calculation
    class_balance = []
    group_col = None
    if clean_count > 0:
        try:
            clean_run_df = spark.read.format("delta").load(active_path)
            # 1. Search for common categorical column names (Case Insensitive)
            common_categorical_cols = ["label", "role", "category", "type", "status", "class", "gender", "country", "state", "sector", "transaction_type"]
            df_cols_lower = {c.lower(): c for c in clean_run_df.columns}
            
            for col_name in common_categorical_cols:
                if col_name in df_cols_lower:
                    group_col = df_cols_lower[col_name]
                    break

            # 2. Cardinality-based automatic String column fallback (detects 2 to 25 categories)
            if not group_col:
                string_cols = [f.name for f in clean_run_df.schema.fields if f.dataType.__class__.__name__ == "StringType"]
                if string_cols:
                    agg_exprs = [F.countDistinct(col_name).alias(col_name) for col_name in string_cols]
                    try:
                        counts_row = clean_run_df.agg(*agg_exprs).first()
                        if counts_row:
                            for col_name in string_cols:
                                distinct_count = counts_row[col_name]
                                if 1 < distinct_count <= 25:
                                    group_col = col_name
                                    break
                    except Exception as e:
                        print(f"[DISTRIBUTION] Warning: Failed to scan distinct count in parallel: {e}")

            if group_col:
                balance_df = clean_run_df.groupBy(group_col).count().collect()
                # Sort descending by count and take top 25 to avoid large payload and prevent mapping explosion
                sorted_balance = sorted(balance_df, key=lambda x: x['count'] if x['count'] is not None else 0, reverse=True)[:25]
                class_balance = []
                for row in sorted_balance:
                    val = row[group_col]
                    key_str = str(val) if val is not None else "NULL"
                    if not key_str.strip():
                        key_str = "SPACES"
                    key_str = key_str.replace(".", "_")
                    class_balance.append({"key": key_str, "value": int(row["count"])})
                print(f"Data Distribution for {table_name} grouped by '{group_col}': {class_balance}")
        except Exception as e:
            print(f"Error computing data distribution: {e}")
    ctx.metrics["class_balance"], ctx.metrics["group_col"] = class_balance, group_col
    return ctx


@stage("quarantine_breakdown", "สรุปเหตุผลที่กักกัน", "post_load")
def quarantine_breakdown_stage(ctx):
    spark, run_id, quarantine_count = ctx.spark, ctx.run_id, ctx.quarantine_count
    quarantine_path = ctx.paths["quarantine"]
    quar_run_df = None
    # Quarantine Reasons Breakdown
    quarantine_breakdown = {}
    if quarantine_count > 0:
        try:
            quar_run_df = spark.read.format("delta").load(quarantine_path).filter(F.col("run_id") == run_id)
            if "reject_reason" in quar_run_df.columns:
                breakdown_df = quar_run_df.groupBy("reject_reason").count().collect()
                for row in breakdown_df:
                    count = row["count"]
                    # Keys are bounded by columns, never by data values (see sdoqap.common.reasons).
                    for reason in split_reasons(row["reject_reason"]):
                        quarantine_breakdown[reason] = quarantine_breakdown.get(reason, 0) + count
                quarantine_breakdown = bound_breakdown(quarantine_breakdown)
                print(f"Quarantine Breakdown: {quarantine_breakdown}")
        except Exception as e:
            print(f"Error computing quarantine breakdown: {e}")
    ctx.metrics["quarantine_breakdown"], ctx.quarantine_run_df = quarantine_breakdown, quar_run_df
    return ctx


@stage("copdq", "ประเมินมูลค่าความเสียหาย (COPDQ)", "post_load")
def copdq(ctx):
    quarantine_count, quar_run_df = ctx.quarantine_count, ctx.quarantine_run_df
    # Calculate Dynamic Financial COPDQ (Root Cause Fix for hardcoded math)
    quarantined_financial_value = 0.0
    if quarantine_count > 0:
        try:
            fin_cols = ["total_sales", "sales", "revenue", "profit", "price", "amount", "total"]
            fin_col_actual = None
            df_cols_lower = {c.lower(): c for c in quar_run_df.columns}
            for c in fin_cols:
                if c in df_cols_lower:
                    fin_col_actual = df_cols_lower[c]
                    break
            
            if fin_col_actual:
                sum_val = quar_run_df.select(F.sum(F.col(fin_col_actual).cast("double"))).collect()[0][0]
                quarantined_financial_value = float(sum_val) if sum_val is not None else 0.0
                print(f"Dynamic COPDQ: Calculated ${quarantined_financial_value:.2f} lost from '{fin_col_actual}'")
        except Exception as e:
            print(f"Error computing financial loss: {e}")
    ctx.metrics["quarantined_financial_value"] = quarantined_financial_value
    return ctx


@stage("freshness", "วัดความสดใหม่ของข้อมูล", "post_load")
def freshness(ctx):
    spark, table_name, date_column, run_id = ctx.spark, ctx.table_name, ctx.date_column, ctx.run_id
    clean_count, active_path = ctx.clean_count, ctx.paths["active"]
    # 3. FRESHNESS LAG
    max_lag_hours = 0.0
    # Root Cause Fix (Point 27): Skip Freshness if table is known to be historical or static
    is_historical = table_name.endswith("_historical") or table_name == "global_ecommerce_sales"

    if date_column and clean_count > 0 and not is_historical:
        try:
            clean_run_df = spark.read.format("delta").load(active_path).filter(F.col("run_id") == run_id)
            if date_column in clean_run_df.columns:
                max_ts = clean_run_df.select(F.max(date_column)).collect()[0][0]
                if max_ts:
                    if isinstance(max_ts, str):
                        try:
                            max_ts = datetime.fromisoformat(max_ts.replace("Z", "+00:00"))
                        except ValueError:
                            parsed = False
                            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y/%m/%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
                                try:
                                    max_ts = datetime.strptime(max_ts, fmt)
                                    parsed = True
                                    break
                                except ValueError:
                                    continue
                            if not parsed:
                                raise ValueError(f"Unsupported timestamp format: {max_ts}")
                    now_utc = datetime.now(timezone.utc)
                    if max_ts.tzinfo is None:
                        max_ts = max_ts.replace(tzinfo=timezone.utc)
                    lag_seconds = (now_utc - max_ts).total_seconds()
                    max_lag_hours = max(0.0, lag_seconds / 3600.0)
        except Exception as e:
            print(f"Error computing freshness: {e}")
    elif is_historical:
        print(f"Skipping freshness check for historical dataset '{table_name}'.")
    ctx.metrics["max_lag_hours"] = max_lag_hours
    return ctx


@stage("quality_score", "คำนวณคะแนนคุณภาพและ anomaly ของอัตรากักกัน", "post_load")
def quality_score_stage(ctx):
    clean_count, total_records, quarantine_count = ctx.clean_count, ctx.total_records, ctx.quarantine_count
    remediation_logs, quality_threshold = ctx.remediation_logs, ctx.quality_threshold
    table_name, run_id = ctx.table_name, ctx.run_id
    send_n8n_alert, get_historical_stats = ctx.alert, ctx.historical_stats
    # 4. QUALITY SCORE
    passed_tests = clean_count
    total_tests = total_records
    if total_tests == 0:
        quality_score = 0.0
        remediation_logs.append("Warning: Empty source file ingested. Quality score defaulted to 0.0% to prevent masking upstream ingestion failure.")
    else:
        quality_score = (passed_tests / total_tests) * 100.0

    # FIX 3A: Use per-table threshold from rules_config instead of hardcoded 90.0
    if quality_score < quality_threshold:
        send_n8n_alert(
            title=f"🚨 Critical Data Quality Drop: {table_name}",
            message=f"Run ID: {run_id}\nQuality Score: {quality_score:.1f}% (threshold={quality_threshold}%)\nQuarantined: {quarantine_count} rows\nClean: {clean_count} rows",
            severity="critical"
        )

    # 4.1 Z-Score Anomaly Detection on Quarantine Rate (Task 3 with Bug 6 Fix)
    current_quarantine_rate = 0.0 if total_records == 0 else float(quarantine_count) / float(total_records)
    historical_rates = get_historical_stats(table_name)
    z_score = 0.0
    is_anomaly = False
    
    # We need at least 3 historical runs to compute standard deviation
    if len(historical_rates) >= 3:
        avg_rate = sum(historical_rates) / len(historical_rates)
        variance = sum((x - avg_rate) ** 2 for x in historical_rates) / len(historical_rates)
        std_dev = variance ** 0.5
        # Robust Z-Score: minimum standard deviation floor of 0.05 (5%) to prevent scaling blowup
        std_dev = max(std_dev, 0.05)
        # Prevent false alarms on tiny, insignificant fluctuations by ignoring changes under 2%
        if abs(current_quarantine_rate - avg_rate) < 0.02:
            z_score = 0.0
        else:
            z_score = abs(current_quarantine_rate - avg_rate) / std_dev
        
        if z_score > 3.0:
            is_anomaly = True
            print(f"[ANOMALY] Statistical Anomaly Detected! Quarantine Rate: {current_quarantine_rate*100:.2f}% vs Avg: {avg_rate*100:.2f}%, Z-Score: {z_score:.2f}")
            send_n8n_alert(
                title=f"🚨 CRITICAL ANOMALY: {table_name} Data Anomaly",
                message=f"Run ID: {run_id}\nQuarantine Rate: {current_quarantine_rate*100:.2f}% (Historical Avg: {avg_rate*100:.2f}%)\nZ-Score: {z_score:.2f} (exceeds threshold 3.0)",
                severity="critical"
            )
    ctx.metrics.update(quality_score=quality_score, current_quarantine_rate=current_quarantine_rate,
                       historical_rates=historical_rates, z_score=z_score, is_anomaly=is_anomaly)
    return ctx


@stage("operational_impact", "คะแนนผลกระทบเชิงปฏิบัติการแบบถ่วงน้ำหนัก", "post_load")
def operational_impact(ctx):
    rules, primary_key, pk_cols, date_column = ctx.rules, ctx.primary_key, ctx.pk_cols, ctx.date_column
    total_records, quarantine_count, all_quarantined = ctx.total_records, ctx.quarantine_count, ctx.all_quarantined
    # 4.2 Weighted Operational COPDQ Score (Task 4 with Bug 5 Row-Level Max Weight Fix)
    column_weights = rules.get("column_weights", {})
    pk_weight = column_weights.get(primary_key if isinstance(primary_key, str) else pk_cols[0], 1.0)
    date_weight = column_weights.get(date_column, 0.5) if date_column else 0.5
    
    operational_impact_score = 0.0
    if total_records > 0 and quarantine_count > 0:
        try:
            # Build Spark expression to calculate max failure weight per row
            weight_col = F.lit(0.0)
            weight_col = F.when(
                F.col("reject_reason").contains("primary") | F.col("reject_reason").contains("duplicate"),
                F.lit(pk_weight)
            ).otherwise(weight_col)
            
            weight_col = F.when(
                F.col("reject_reason").contains("date"),
                F.greatest(weight_col, F.lit(date_weight))
            ).otherwise(weight_col)
            
            for col, w in column_weights.items():
                pks = primary_key if isinstance(primary_key, list) else [primary_key]
                if col not in pks and col != date_column:
                    weight_col = F.when(
                        F.col("reject_reason").contains(col),
                        F.greatest(weight_col, F.lit(w))
                    ).otherwise(weight_col)
            
            weight_col = F.when(
                (F.col("reject_reason") != "") & (F.col("reject_reason").isNotNull()),
                F.greatest(weight_col, F.lit(0.2))
            ).otherwise(weight_col)
            
            sum_val = all_quarantined.select(F.sum(weight_col)).collect()[0][0]
            sum_of_max_row_weights = float(sum_val) if sum_val is not None else 0.0
            operational_impact_score = (sum_of_max_row_weights / total_records) * 100.0
        except Exception as e:
            print(f"Error calculating row-level weighted score: {e}")
            operational_impact_score = (float(quarantine_count) / float(total_records)) * 100.0
    print(f"Weighted Operational Impact Score: {operational_impact_score:.2f}%")
    ctx.metrics["operational_impact_score"] = operational_impact_score
    return ctx
