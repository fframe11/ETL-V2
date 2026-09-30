"""Stage order used by spark_quality_engine.run_quality_check."""
ALIGN = ["schema_align"]
TRANSFORM = ["schema_drift", "auto_clean", "validation", "dedup", "standardize_dates", "standardize_categories"]
POST_LOAD = []
