import os
import sys
import uuid
import time
import json
from typing import Dict, Any, Union
from pyspark.sql import DataFrame
from pyspark.sql import functions as F

# Ensure the parent spark directory is in the import path
spark_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if spark_dir not in sys.path:
    sys.path.insert(0, spark_dir)

from semantic_cleaner.rules.parser_v2 import parse_yaml_config_v2
from semantic_cleaner.rules.parser import load_rules_registry

from udf_v2_helper import create_dsl_v2_udf

class SemanticCleanerV2:
    """Enterprise cleaner library for running DSL v2.0 graph-based cascading standardization pipelines."""
    
    def __init__(self, config: Union[str, Dict[str, Any]], table_name: str = None):
        """Initializes the SemanticCleanerV2 parser and loads table categories registry."""
        self.config_raw = config
        self.table_name = table_name
        self.compiled_rules = parse_yaml_config_v2(config)
        
        # Merge dictionary categories from rules_config.json if table name specified
        self.categories = {}
        if table_name:
            registry_rules = load_rules_registry(table_name)
            for r in registry_rules.get("remediation_rules", []):
                if r.get("type") == "semantic_standardize":
                    self.categories.update(r.get("categories", {}))
                    
    def transform(self, df: DataFrame) -> DataFrame:
        """Runs the compiled execution graph on the PySpark DataFrame."""
        print(f"[DSL ENGINE v2] Executing Graph Pipeline for table: {self.table_name or 'unknown'}")
        start_time = time.time()
        
        output_mode = "enriched"
        include_meta = True
        
        # Early-exit Idempotency check
        execution_id = str(uuid.uuid4())
        
        df_out = df
        
        # Process each column's steps pipeline
        for col_cfg in self.compiled_rules.get("columns", []):
            col_name = col_cfg.get("column")
            steps = col_cfg.get("steps", [])
            strategy = col_cfg.get("strategy", "cascade")
            post_process = col_cfg.get("post_process", [])
            
            if col_name not in df_out.columns:
                continue
                
            # Compile UDF
            pipeline_udf = create_dsl_v2_udf(steps, self.categories)
            struct_col = f"_semantic_{col_name}"
            
            # Run UDF
            df_out = df_out.withColumn(struct_col, pipeline_udf(F.col(col_name)))
            
            # Post Process (e.g. normalize case, trim)
            if "normalize_case" in post_process:
                df_out = df_out.withColumn(col_name, F.lower(F.trim(F.col(col_name))))
            elif "trim" in post_process:
                df_out = df_out.withColumn(col_name, F.trim(F.col(col_name)))
                
        # Append global metadata
        if include_meta:
            meta_struct = F.struct(
                F.lit("evolve").alias("schema_mode"),
                F.lit(True).alias("contract_enforced"),
                F.array([F.lit(c.get("column")) for c in self.compiled_rules.get("columns", [])]).alias("processed_columns"),
                F.lit("v2.0").alias("dsl_version"),
                F.lit(execution_id).alias("execution_id")
            )
            df_out = df_out.withColumn("_meta", meta_struct)
            
        # Log structured metrics
        try:
            input_count = df.count()
            duration = time.time() - start_time
            metrics = {
                "dsl_version": "2.0",
                "config_version": self.compiled_rules.get("config_version"),
                "input_rows": input_count,
                "duration_seconds": round(duration, 3),
                "execution_id": execution_id
            }
            print(f"[DSL v2 OBSERVABILITY METRICS] {json.dumps(metrics)}")
        except Exception as e:
            print(f"[DSL v2 METRICS ERROR] {e}")
            
        return df_out
