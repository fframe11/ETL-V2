from datetime import datetime, timezone

from sdoqap.pipeline.registry import stage


def build_quality_run_doc(ctx, finished_at):
    m = ctx.metrics
    rules = ctx.rules
    started_at = m["started_at"]
    doc = {
        "run_id": ctx.run_id,
        "ingest_id": ctx.ingest_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round((finished_at - started_at).total_seconds(), 3),
        "table_name": ctx.table_name,
        "total_records": ctx.total_records,
        "clean_records": ctx.clean_count,
        "quarantined_records": ctx.quarantine_count,
        "quality_score": m["quality_score"],
        "freshness_lag_hours": m.get("max_lag_hours", 0.0),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "quarantined_financial_value": m.get("quarantined_financial_value", 0.0),
        "operational_impact_score": m.get("operational_impact_score", 0.0),
        "z_score": m.get("z_score", 0.0),
        "is_anomaly": m.get("is_anomaly", False),
        "remediation_logs": ctx.remediation_logs,
        "auto_cleaned": ctx.auto_clean,
        "stage_seconds": dict(m.get("stage_seconds", {})),
    }
    if m.get("class_balance"):
        doc["class_balance"] = m["class_balance"]
        doc["class_balance_column"] = m.get("group_col")
    if m.get("quarantine_breakdown"):
        doc["quarantine_breakdown"] = m["quarantine_breakdown"]
    # Dynamic Rules metadata: log which mode was used and computed thresholds
    doc["rules_mode"] = "adaptive" if isinstance(rules.get("quality_score_threshold"), dict) else "static"
    doc["effective_quality_threshold"] = ctx.quality_threshold
    doc["effective_freshness_threshold"] = ctx.freshness_limit_hours
    if ctx.value_range_profile:
        doc["value_range_profile"] = ctx.value_range_profile
    # Inject tracked fallback rate metrics
    fallback = ctx.pop_fallback_metrics()
    if fallback:
        doc["fallback_metrics"] = fallback
    return doc


@stage("report", "บันทึกผลลง Elasticsearch", "post_load")
def report(ctx):
    now = datetime.now(timezone.utc)
    doc = build_quality_run_doc(ctx, finished_at=now)
    ctx.log_es("sdoqap_quality_runs", doc)
    ctx.log_es("sdoqap_lineage_runs", {
        "run_id": ctx.run_id,
        "ingest_id": ctx.ingest_id,
        "source_table": f"raw-{ctx.table_name}",
        "target_table": f"active-{ctx.table_name}",
        "source_path": ctx.paths["raw"],
        "target_path": ctx.paths["active"],
        "quarantine_path": ctx.paths["quarantine"],
        "timestamp": now.isoformat(),
    })
    ctx.log_es("sdoqap_pipeline_runs", {
        "run_id": ctx.run_id,
        "ingest_id": ctx.ingest_id,
        "table_name": ctx.table_name,
        "state": "success" if ctx.metrics["quality_score"] >= ctx.quality_threshold else "warnings",
        "timestamp": now.isoformat(),
    })
    print(f"Quality validation completed. Quality Score: {ctx.metrics['quality_score']:.2f}% (threshold={ctx.quality_threshold}%)")
    ctx.metrics["quality_run_doc"] = doc
    return ctx
