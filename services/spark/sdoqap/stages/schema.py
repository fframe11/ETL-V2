import json
from datetime import datetime, timezone

from pyspark.sql import functions as F

from sdoqap.common.names import clean_column_name, normalize_name
from sdoqap.pipeline.registry import stage


@stage("schema_align", "จัดชื่อคอลัมน์และแปลงชนิดข้อมูล", "align")
def schema_align(ctx):
    df, schema_spec, primary_key = ctx.df, ctx.schema_spec, ctx.primary_key
    for col_name in df.columns:
        cleaned_col = clean_column_name(col_name)
        if col_name != cleaned_col:
            df = df.withColumnRenamed(col_name, cleaned_col)

    # Dynamically add row_hash if it is in schema_spec or if it is the primary key (Dynamic single primary key hashing for Big Data scaling)
    if "row_hash" in schema_spec or primary_key == "row_hash":
        exclude_cols = {"run_id", "rejected_at", "reject_reason", "is_invalid", "row_hash"}
        hash_cols = sorted([c for c in df.columns if c not in exclude_cols])
        concat_exprs = []
        for c in hash_cols:
            concat_exprs.append(F.coalesce(F.col(c).cast("string"), F.lit("")))
        df = df.withColumn("row_hash", F.md5(F.concat_ws("||", *concat_exprs)))

    # Column Name Standardization (Fuzzy/Alias Mapping)
    normalized_spec = {normalize_name(k): k for k in schema_spec.keys()}
    for col_name in df.columns:
        norm_col = normalize_name(col_name)
        if norm_col in normalized_spec:
            canonical_name = normalized_spec[norm_col]
            if col_name != canonical_name:
                print(f"[RENAME] Standardizing column name: '{col_name}' -> '{canonical_name}'")
                df = df.withColumnRenamed(col_name, canonical_name)

    # Cast columns according to schema_spec with Smart Parser / Normalization / Type Promotion
    from pyspark.sql.types import IntegerType, DoubleType, TimestampType, StringType
    # Safe Type Promotion: IntegerType to DoubleType if non-zero decimals exist
    integer_promotion_candidates = [col_name for col_name, t_str in schema_spec.items() if t_str == "IntegerType" and col_name in df.columns]
    promoted_columns = set()
    if integer_promotion_candidates:
        agg_exprs = []
        for col_name in integer_promotion_candidates:
            non_null_col = F.coalesce(F.col(col_name), F.lit(""))
            agg_exprs.append(F.max(F.when(non_null_col.rlike(r"\.[0-9]*[1-9]+"), 1).otherwise(0)).alias(col_name))
        if agg_exprs:
            try:
                res_row = df.agg(*agg_exprs).first()
                if res_row:
                    for col_name in integer_promotion_candidates:
                        if res_row[col_name] == 1:
                            promoted_columns.add(col_name)
            except Exception as e:
                print(f"[PROMOTION] Warning: Failed to scan decimals in parallel: {e}")

    for col_name, type_str in list(schema_spec.items()):
        if col_name in df.columns:
            if type_str == "IntegerType" and col_name in promoted_columns:
                print(f"[PROMOTION] Column '{col_name}' promoted from IntegerType to DoubleType to preserve decimal precision.")
                type_str = "DoubleType"
                schema_spec[col_name] = "DoubleType"

            if type_str == "IntegerType":
                # Remove all non-numeric characters (except digits and negative sign)
                clean_col = F.regexp_replace(F.col(col_name), r"[^\d\-]", "")
                # Cast to double first, then to integer, so float strings like "12.00" don't become null
                df = df.withColumn(col_name, clean_col.cast("double").cast(IntegerType()))
            elif type_str == "DoubleType":
                # Remove all non-numeric characters (except digits, decimal point, and negative sign)
                clean_col = F.regexp_replace(F.col(col_name), r"[^\d\.\-]", "")
                df = df.withColumn(col_name, clean_col.cast(DoubleType()))
            elif type_str == "TimestampType":
                # Support multiple common date/timestamp formats
                date_formats = [
                    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                    "yyyy-MM-dd'T'HH:mm:ss",
                    "yyyy-MM-dd HH:mm:ss",
                    "yyyy-MM-dd",
                    "dd/MM/yyyy",
                    "MM/dd/yyyy"
                ]
                parsed_ts = None
                for fmt in date_formats:
                    ts_attempt = F.to_timestamp(F.col(col_name), fmt)
                    parsed_ts = ts_attempt if parsed_ts is None else F.coalesce(parsed_ts, ts_attempt)
                
                # Epoch unix timestamp support (if input is numerical string)
                epoch_ts_ms = F.to_timestamp(F.col(col_name).cast("double") / 1000.0)
                epoch_ts_sec = F.to_timestamp(F.col(col_name).cast("double"))
                parsed_ts = F.coalesce(parsed_ts, epoch_ts_ms, epoch_ts_sec)
                
                df = df.withColumn(col_name, parsed_ts)

    # Partition data into smaller chunks to enable parallel processing in small batches
    df = df.repartition(10)
    ctx.df = df
    return ctx


@stage("schema_drift", "ตรวจการเปลี่ยนโครงสร้างตาราง", "transform")
def schema_drift(ctx):
    df, schema_spec, rules = ctx.df, ctx.schema_spec, ctx.rules
    run_id, table_name = ctx.run_id, ctx.table_name
    send_n8n_alert, log_to_elasticsearch, auto_evolve_schema_registry = ctx.alert, ctx.log_es, ctx.evolve_schema
    # 1. AUTO SCHEMA EVOLUTION & DRIFT CHECK
    actual_columns = {field.name: field.dataType.__class__.__name__ for field in df.schema.fields}
    drift_detected = False
    drift_details = {}

    # 1.1 Check missing columns in DF (API didn't send them)
    for col_name, expected_type in schema_spec.items():
        if col_name not in actual_columns:
            drift_detected = True
            drift_details[col_name] = {"error": "missing_column", "action": "auto_filled_null"}
            # Auto fill with null casted to expected type
            spark_type_map = {
                "IntegerType": "integer",
                "DoubleType": "double",
                "TimestampType": "timestamp",
                "StringType": "string"
            }
            sql_type = spark_type_map.get(expected_type, "string")
            df = df.withColumn(col_name, F.lit(None).cast(sql_type))
            actual_columns[col_name] = expected_type
            send_n8n_alert(
                title=f"🚨 CRITICAL Schema Drift: Missing Column in {table_name}",
                message=f"Column '{col_name}' is missing from source data. Auto-healed with NULLs.",
                severity="critical"
            )
        elif actual_columns[col_name] != expected_type:
            drift_detected = True
            drift_details[col_name] = {"error": "type_mismatch", "expected": expected_type, "actual": actual_columns[col_name], "action": "coerced_to_string"}
            df = df.withColumn(col_name, F.col(col_name).cast("string"))
            schema_spec[col_name] = "StringType"
            actual_columns[col_name] = "StringType"
            send_n8n_alert(
                title=f"🚨 CRITICAL Schema Drift: Type Mismatch in {table_name}",
                message=f"Column '{col_name}' changed from {expected_type} to {actual_columns[col_name]}.",
                severity="critical"
            )

    # 1.2 Check new columns in DF (API sent extra fields)
    for col_name, actual_type in list(actual_columns.items()):
        if col_name not in schema_spec:
            drift_detected = True
            drift_details[col_name] = {"error": "new_column", "actual": actual_type, "action": "auto_added"}
            schema_spec[col_name] = actual_type

    if drift_detected:
        print(f"Schema drift detected and auto-evolved: {drift_details}")
        
        # Calculate overall drift severity weight (Root Cause Fix for Binary Drift - Point 26)
        total_drift_severity = 0
        for col, details in drift_details.items():
            if details["error"] == "new_column":
                total_drift_severity += 1  # Low risk
            elif details["error"] == "missing_column":
                total_drift_severity += 5  # High risk
            elif details["error"] == "type_mismatch":
                total_drift_severity += 5  # High risk

        log_to_elasticsearch("sdoqap_schema_drifts", {
            "run_id": run_id,
            "table_name": table_name,
            "registered_schema": schema_spec,
            "detected_schema": actual_columns,
            "drift_details": drift_details,
            "drift_severity": total_drift_severity,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        # FIX 2B: Self-Healing Schema Evolution Gate with Governance Policy
        is_safe_drift = all(details["error"] == "new_column" for details in drift_details.values())
        
        # Load schema evolution governance configurations
        se_config = rules.get("schema_evolution", {})
        policy_allow_new = se_config.get("allow_new_columns", True)
        policy_max_cols = se_config.get("max_columns", 50)
        policy_req_approval = se_config.get("require_approval", True)
        
        num_proposed_cols = len(actual_columns)
        
        # Auto approve only if safe drift, new columns allowed, no manual approval required, and columns under limit
        can_auto_approve = (
            is_safe_drift and 
            policy_allow_new and 
            (not policy_req_approval) and 
            (num_proposed_cols <= policy_max_cols)
        )
        
        if can_auto_approve:
            print(f"[SELF-HEALING] Safe schema drift detected (only new columns). Automatically evolving schema...")
            auto_evolve_schema_registry(table_name, actual_columns)
            log_to_elasticsearch("sdoqap_schema_proposals", {
                "run_id": run_id,
                "table_name": table_name,
                "current_schema": {k: v for k, v in schema_spec.items()},
                "proposed_schema": actual_columns,
                "drift_details": drift_details,
                "drift_severity": total_drift_severity,
                "status": "APPROVED",
                "proposed_at": datetime.now(timezone.utc).isoformat(),
                "proposed_by": f"spark_engine/{run_id}",
                "resolved_at": datetime.now(timezone.utc).isoformat()
            })
            print(f"[SELF-HEALING] Auto-evolved schema proposal logged as APPROVED.")
        else:
            # Requires Data Engineer manual approval or rejected due to policies
            status = "PENDING"
            reason = "Awaiting manual approval"
            if not policy_allow_new and is_safe_drift:
                status = "REJECTED"
                reason = "Blocked by governance policy: allow_new_columns is set to false"
            elif num_proposed_cols > policy_max_cols:
                status = "REJECTED"
                reason = f"Blocked by governance policy: proposed column count ({num_proposed_cols}) exceeds limit ({policy_max_cols})"
            elif not is_safe_drift:
                reason = "Contains dangerous changes (missing columns or type mismatches)"
                
            log_to_elasticsearch("sdoqap_schema_proposals", {
                "run_id": run_id,
                "table_name": table_name,
                "current_schema": {k: v for k, v in schema_spec.items()},
                "proposed_schema": actual_columns,
                "drift_details": drift_details,
                "drift_severity": total_drift_severity,
                "status": status,
                "rejection_reason": reason if status == "REJECTED" else None,
                "proposed_at": datetime.now(timezone.utc).isoformat(),
                "proposed_by": f"spark_engine/{run_id}"
            })
            print(f"[APPROVAL GATE] Schema drift proposal written as {status}. Reason: {reason}")
            print(f"[APPROVAL GATE] schema_registry.json NOT modified. Review at /api/v1/schema/proposals")
            
            # Send alert
            send_n8n_alert(
                title=f"⚠️ Schema Change {status}: {table_name}",
                message=f"Run ID: {run_id}\nChanges: {json.dumps(drift_details)}\nStatus: {status}\nReason: {reason}",
                severity="critical" if status == "REJECTED" else "warning"
            )
    ctx.df, ctx.drift_detected, ctx.drift_details = df, drift_detected, drift_details
    return ctx
