from dataclasses import dataclass, field
from typing import Any, Callable, Optional


def _noop(*args, **kwargs):
    return None


@dataclass
class RunContext:
    """Everything one quality run passes from stage to stage. Side effects (ES, n8n,
    schema registry) are injected as callables so stages stay importable and testable."""
    spark: Any
    table_name: str
    run_id: str
    primary_key: Any
    date_column: Optional[str]
    schema_spec: dict
    rules: dict
    ingest_id: Optional[str] = None
    paths: dict = field(default_factory=dict)          # raw, active, quarantine
    quality_threshold: float = 90.0
    freshness_limit_hours: float = 48.0

    # DataFrames
    df: Any = None
    df_with_status: Any = None
    invalid_df: Any = None
    valid_df: Any = None
    valid_df_with_id: Any = None
    valid_dedup_with_id: Any = None
    clean_df: Any = None
    duplicate_df: Any = None
    range_violation_df: Any = None
    outlier_df: Any = None
    unsupervised_outlier_df: Any = None
    induced_outlier_df: Any = None
    all_quarantined: Any = None
    all_quarantined_write: Any = None
    quarantine_run_df: Any = None

    # Findings and counts
    drift_detected: bool = False
    drift_details: dict = field(default_factory=dict)
    value_range_profile: dict = field(default_factory=dict)
    null_profile: dict = field(default_factory=dict)
    remediation_logs: list = field(default_factory=list)
    auto_clean: bool = True
    clean_count: int = 0
    quarantine_count: int = 0
    total_records: int = 0
    metrics: dict = field(default_factory=dict)

    # Injected side effects
    log_es: Callable = _noop                 # (index, doc)
    alert: Callable = _noop                  # (title, message, severity)
    evolve_schema: Callable = _noop          # (table_name, proposed_schema)
    apply_dsl: Callable = lambda df, rules: df
    load_std_rules: Callable = lambda table_name: {}
    historical_stats: Callable = lambda table_name: []
    pop_fallback_metrics: Callable = lambda: {}

    @property
    def pk_cols(self):
        return [self.primary_key] if isinstance(self.primary_key, str) else list(self.primary_key)
