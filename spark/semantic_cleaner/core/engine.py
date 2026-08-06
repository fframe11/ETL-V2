import os
import sys
from typing import Dict, Any, Union
from pyspark.sql import DataFrame

# Ensure the parent spark directory is in the import path
spark_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if spark_dir not in sys.path:
    sys.path.insert(0, spark_dir)

from spark_quality_engine import apply_dsl_remediation_rules

class SemanticCleaner:
    """Enterprise wrapper class for executing declarative DSL-driven data standardization on PySpark DataFrames."""
    
    def __init__(self, config: Union[str, Dict[str, Any]], table_name: str = None):
        """Initializes the SemanticCleaner with a path to a YAML file, a YAML string, or a rules dictionary.
        
        Args:
            config: Path to a YAML file, a YAML string, or parsed dictionary config.
            table_name: Optional name of the table to load default category mappings from rules_config.json registry.
        """
        from semantic_cleaner.rules.parser import parse_yaml_config
        self.config_raw = config
        self.table_name = table_name
        self.compiled_rules = parse_yaml_config(config, table_name)
        
    def transform(self, df: DataFrame) -> DataFrame:
        """Applies the parsed DSL configuration rules on the given PySpark DataFrame.
        
        Args:
            df: Input PySpark DataFrame.
            
        Returns:
            DataFrame: Transformed PySpark DataFrame.
        """
        import time
        import json
        
        print(f"[DSL ENGINE] [LIBRARY] Executing SemanticCleaner transformation pipeline for table: {self.compiled_rules.get('table_name')}")
        
        start_time = time.time()
        
        # Apply transformation
        df_out = apply_dsl_remediation_rules(df, self.compiled_rules)
        
        # Compute and print metrics (Observability Layer)
        try:
            input_count = df.count()
            output_count = df_out.count()
            duration = time.time() - start_time
            
            method_counts = {}
            
            # 1. Check flat lineage columns
            method_cols = [c for c in df_out.columns if c.endswith("_method")]
            for m_col in method_cols:
                counts = df_out.groupBy(m_col).count().collect()
                for r in counts:
                    method_counts[r[0]] = method_counts.get(r[0], 0) + r[1]
                    
            # 2. Check nested struct columns
            struct_cols = [c for c in df_out.columns if c.startswith("_semantic_")]
            for s_col in struct_cols:
                # Group by struct field e.g. _semantic_item.method
                counts = df_out.groupBy(f"`{s_col}`.method").count().collect()
                for r in counts:
                    method_counts[r[0]] = method_counts.get(r[0], 0) + r[1]
            
            exact_hits = method_counts.get("exact", 0)
            fuzzy_hits = method_counts.get("fuzzy_ngram", 0)
            fallback_hits = method_counts.get("fallback", 0)
            
            metrics = {
                "table_name": self.compiled_rules.get("table_name", "unknown"),
                "execution_id": self.compiled_rules.get("execution_id"),
                "schema_mode": self.compiled_rules.get("schema_mode"),
                "dry_run": self.compiled_rules.get("dry_run", False),
                "input_rows": input_count,
                "output_rows": output_count,
                "duration_seconds": round(duration, 3),
                "throughput_rows_per_second": round(input_count / max(duration, 0.001), 1),
                "exact_match_hits": exact_hits,
                "fuzzy_match_hits": fuzzy_hits,
                "fallback_hits": fallback_hits
            }
            print(f"[DSL OBSERVABILITY METRICS] {json.dumps(metrics)}")
        except Exception as e:
            print(f"[DSL OBSERVABILITY ERROR] Failed to compute metrics: {e}")
            
        return df_out
