from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("ai_advisory", "วิเคราะห์ด้วย AI และเสนอกฎ", "post_load")
def ai_advisory(ctx):
    m = ctx.metrics
    rules, spark, table_name, run_id = ctx.rules, ctx.spark, ctx.table_name, ctx.run_id
    active_path, quarantine_path = ctx.paths["active"], ctx.paths["quarantine"]
    remediation_logs, quality_threshold = ctx.remediation_logs, ctx.quality_threshold
    is_anomaly, quality_score, z_score = m["is_anomaly"], m["quality_score"], m["z_score"]
    historical_rates, current_quarantine_rate = m["historical_rates"], m["current_quarantine_rate"]
    quarantine_breakdown = m.get("quarantine_breakdown", {})
    drift_detected, value_range_profile = ctx.drift_detected, ctx.value_range_profile
    total_records, quarantine_count = ctx.total_records, ctx.quarantine_count
    primary_key, pk_cols, date_column = ctx.primary_key, ctx.pk_cols, ctx.date_column
    # ─── DYNAMIC RULES Layer 3: Dynamic Decision Engine ─────────────────────────
    ai_config = rules.get("ai_advisor", {})
    ai_enabled = ai_config.get("enabled", False) if isinstance(ai_config, dict) else False
    profile_report = None
    
    # ── Component A: Data Profile Cycle (runs every time when enabled) ─────────
    if ai_enabled:
        try:
            from data_profile_store import run_profile_cycle
            # Use clean_df snapshot to build profiles (read from Delta since clean_df is unpersisted)
            try:
                profile_df = spark.read.format("delta").load(active_path)
                profile_report = run_profile_cycle(profile_df, table_name)
                
                if profile_report.get("total_drifted_columns", 0) > 0:
                    remediation_logs.append(f"profile_drift_detected_{profile_report['total_drifted_columns']}_columns")
                    # Drift counts as an anomaly signal for triggering deeper analysis
                    if not is_anomaly:
                        print("[DYNAMIC ENGINE] Distribution drift detected — escalating to AI analysis.")
            except Exception as profile_err:
                print(f"[DYNAMIC ENGINE] Profile cycle failed (non-fatal): {profile_err}")
                profile_report = None
        except ImportError:
            print("[DYNAMIC ENGINE] data_profile_store module not available. Skipping profile cycle.")
    
    # ── Components B+C: AI Analysis + Rule Induction (on anomaly/drift) ────────
    trigger_always = ai_config.get("trigger", "on_anomaly") == "always"
    if ai_enabled and (trigger_always or is_anomaly or quality_score < (quality_threshold - 15) or
                       (profile_report and profile_report.get("total_drifted_columns", 0) > 0)):
        try:
            from ai_rule_advisor import get_ai_advisor
            advisor = get_ai_advisor()
            if advisor:
                quality_context = {
                    "is_anomaly": is_anomaly,
                    "quality_score": quality_score,
                    "current_threshold": quality_threshold,
                    "historical_avg": 100.0 - (sum(historical_rates) / len(historical_rates) * 100) if historical_rates else 90.0,
                    "z_score": z_score,
                    "schema_drift_detected": drift_detected,
                    "quarantine_rate": current_quarantine_rate,
                    "table_name": table_name,
                    "trigger_always": trigger_always
                }
                
                if trigger_always or advisor.should_trigger(quality_context) or \
                   (profile_report and profile_report.get("total_drifted_columns", 0) > 0):
                    max_ai_rows = ai_config.get("max_rows_to_analyze", 50)
                    # Sample quarantined rows from persisted Delta Lake
                    try:
                        sample_rows = [
                            row.asDict() for row in spark.read.format("delta").load(quarantine_path)
                            .filter(F.col("run_id") == run_id)
                            .limit(max_ai_rows).collect()
                        ]
                    except Exception as sample_err:
                        print(f"[DYNAMIC ENGINE] Failed to read quarantine sample from Delta: {sample_err}")
                        sample_rows = []
                    
                    # Gather column statistics
                    col_stats = {}
                    if value_range_profile:
                        col_stats["value_ranges"] = value_range_profile
                    col_stats["quarantine_breakdown"] = quarantine_breakdown
                    
                    historical_ctx = {
                        "avg_quality": quality_context["historical_avg"],
                        "current_quality": quality_score,
                        "current_threshold": quality_threshold,
                        "total_records": total_records,
                        "quarantined_records": quarantine_count,
                        "primary_key": primary_key if isinstance(primary_key, str) else ",".join(pk_cols) if pk_cols else "unknown",
                        "date_column": date_column or "unknown"
                    }
                    
                    # ── Component B: Profile-Based Analysis (enhanced heuristic + drift) ──
                    if profile_report and not profile_report.get("is_first_run"):
                        analysis = advisor.run_profile_based_analysis(
                            table_name, sample_rows, col_stats, historical_ctx,
                            profile_report=profile_report
                        )
                    else:
                        analysis = advisor.ai_analyze_quarantined_sample(
                            table_name, sample_rows, col_stats, historical_ctx
                        )
                    
                    min_confidence = ai_config.get("confidence_threshold", 0.7)
                    if analysis and analysis.get("confidence", 0) >= min_confidence:
                        # Root Cause Fix: this used to auto-write suggested rules straight
                        # into rules_config.json whenever the LLM's own self-reported
                        # confidence was >= 0.90 — nothing independently verified that
                        # number, so a hijacked or simply overconfident model response
                        # could bypass the human-approval governance gate documented in
                        # README.md's "Schema Approval Gate" section entirely. Every
                        # AI-suggested rule change now always goes through the same
                        # PENDING proposal + human approve/reject path as everything else
                        # (api/app/api/dynamic_rules.py's /ai-proposals/{id}/approve,
                        # which enforces its own independent guardrails).
                        advisor.log_proposal_to_es(table_name, run_id, analysis)
                        method = analysis.get("analysis_metadata", {}).get("method", "unknown")
                        print(f"[DYNAMIC ENGINE] Analysis complete ({method}). Root cause: {analysis.get('root_cause', 'N/A')}")
                        print(f"[DYNAMIC ENGINE] Suggested {len(analysis.get('suggested_rules', []))} rules. Confidence: {analysis.get('confidence', 0):.0%}")
                        remediation_logs.append(f"ai_advisor_triggered_confidence_{analysis.get('confidence', 0):.2f}")
                    else:
                        print(f"[DYNAMIC ENGINE] Analysis returned low confidence. No proposal created.")
                    
                    # ── Component C: Decision Tree Rule Induction (only on anomaly) ──
                    if is_anomaly and quarantine_count >= 10:
                        try:
                            # Get numeric columns for features
                            numeric_features = profile_report.get("numeric_columns", []) if profile_report else []
                            if not numeric_features:
                                from pyspark.sql.types import IntegerType, LongType, FloatType, DoubleType, ShortType, DecimalType
                                numeric_types = (IntegerType, LongType, FloatType, DoubleType, ShortType, DecimalType)
                                try:
                                    active_df_check = spark.read.format("delta").load(active_path)
                                    numeric_features = [f.name for f in active_df_check.schema.fields
                                                        if isinstance(f.dataType, numeric_types)]
                                except Exception:
                                    numeric_features = []
                            
                            if len(numeric_features) >= 2:
                                clean_for_tree = spark.read.format("delta").load(active_path)
                                quarantine_for_tree = spark.read.format("delta").load(quarantine_path) \
                                    .filter(F.col("run_id") == run_id)
                                
                                induction_result = advisor.induce_rules_from_data(
                                    spark, clean_for_tree, quarantine_for_tree,
                                    numeric_features, table_name, run_id
                                )
                                
                                n_induced = len(induction_result.get("induced_rules", []))
                                if n_induced > 0:
                                    auc = induction_result.get("model_accuracy", 0)
                                    # Root Cause Fix: same governance gap as the LLM path above —
                                    # a high AUC on this run's small quarantine sample doesn't
                                    # guarantee the induced rule generalizes; it must go through
                                    # human approval like every other rule change, not write
                                    # straight to rules_config.json.
                                    print(f"[DYNAMIC ENGINE] Decision Tree induced {n_induced} rules (AUC={auc:.4f}) — logged as a pending proposal for review.")
                                    remediation_logs.append(f"decision_tree_induced_{n_induced}_rules_auc_{auc:.2f}")
                        except Exception as dt_err:
                            print(f"[DYNAMIC ENGINE] Decision Tree induction failed (non-fatal): {dt_err}")
                    
        except ImportError:
            print(f"[DYNAMIC ENGINE] ai_rule_advisor module not available. Skipping AI analysis.")
        except Exception as ai_err:
            print(f"[DYNAMIC ENGINE] AI analysis failed (non-fatal): {ai_err}")
    m["profile_report"] = profile_report
    return ctx
