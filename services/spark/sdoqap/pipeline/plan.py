"""Stage order used by spark_quality_engine.run_quality_check."""
ALIGN = ["schema_align"]
TRANSFORM = ["schema_drift", "auto_clean", "validation", "dedup", "standardize_dates", "standardize_categories",
             "anomaly_iqr", "anomaly_zscore", "anomaly_induced", "quarantine_assembly", "column_filter"]
POST_LOAD = ["distribution", "quarantine_breakdown", "copdq", "freshness", "quality_score",
             "ai_advisory", "operational_impact", "report"]
