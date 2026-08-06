import os
import sys
from pyspark.sql import SparkSession

# Ensure project and package paths are accessible
spark_dir = os.path.dirname(os.path.abspath(__file__))
if spark_dir not in sys.path:
    sys.path.insert(0, spark_dir)

from semantic_cleaner import SemanticCleaner

def main():
    print("=== Starting Declarative DSL Semantic Cleaner Test ===")
    
    # 1. Initialize PySpark Session
    spark = SparkSession.builder \
        .appName("SDOQAP-DSL-Semantic-Cleaner-Test") \
        .master("local[*]") \
        .config("spark.driver.bindAddress", "127.0.0.1") \
        .get_url() if hasattr(SparkSession.builder, "get_url") else SparkSession.builder.getOrCreate()
        
    spark.sparkContext.setLogLevel("ERROR")
    
    # 2. Write Test YAML Configuration File
    yaml_content = """
dsl_version: 1.0
config_version: 2026.08.06
global:
  schema_mode: evolve
  execution_id: test-idempotency-uuid-7777
  dry_run: false
columns:
  รายการสินค้า:
    semantic:
      enabled: true
      threshold: 0.85
      model_version: v2.5
      dictionary_version: v5
      low_confidence_policy: map_to_fallback
      semantic_type: rule_based
      fallback: อื่นๆ
    output:
      mode: enriched
      enriched_format: struct
      preserve_raw: true
  ราคา:
    cleaning:
      type: numeric
    output:
      mode: clean_only
"""
    yaml_path = os.path.join(spark_dir, "remediation_rules_test.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_content)
        
    print(f"Created temporary YAML DSL rules config at: {yaml_path}")
    
    try:
        # 3. Create Sample Spark DataFrame
        data = [
            ("2026-08-05", "Coke Zero", 10.0),
            ("2026-08-05", "Pepsi Max", 12.0),
            ("2026-08-05", "น้ำเปล่าสิงห์", 5.0),
            ("2026-08-05", "Unknown Brand x123", 20.0),
            ("2026-08-05", None, 15.0)
        ]
        columns = ["วันที่", "รายการสินค้า", "ราคา"]
        df = spark.createDataFrame(data, columns)
        
        print("\n--- Original Input DataFrame ---")
        df.show()
        
        # 4. Initialize the SemanticCleaner Library
        cleaner = SemanticCleaner(config=yaml_path, table_name="unknown")
        
        print("\nParsed Compiled Rules Payload:")
        import pprint
        pprint.pprint(cleaner.compiled_rules)
        
        # Verify compiled rules structure
        assert cleaner.compiled_rules["schema_mode"] == "evolve"
        assert cleaner.compiled_rules["dry_run"] is False
        assert cleaner.compiled_rules["config_version"] == "2026.08.06"
        assert len(cleaner.compiled_rules["remediation_rules"]) == 2
        
        rule_sem = cleaner.compiled_rules["remediation_rules"][0]
        assert rule_sem["column"] == "รายการสินค้า"
        assert rule_sem["type"] == "semantic_standardize"
        assert rule_sem["version"] == "v2.5+v5"
        # Loaded categories from rules_config.json's "unknown" table key:
        assert "pepsi max" in rule_sem["categories"]
        
        # 5. Execute Transformation
        df_clean = cleaner.transform(df)
        
        print("\n--- Processed Cleaned DataFrame (Evolve + Enriched Mode) ---")
        df_clean.show(truncate=False)
        
        # Schema assertions
        print(f"Cleaned Schema Columns: {df_clean.columns}")
        assert "_semantic_รายการสินค้า" in df_clean.columns
        assert "_meta" in df_clean.columns
        
        # 5b. Verify Idempotency Check
        print("\n--- Testing Idempotency early-exit check ---")
        df_idempotent = cleaner.transform(df_clean)
        # Check that it returns the exact same DataFrame reference (early exit)
        assert df_idempotent is df_clean
        print("Idempotency verification PASSED")
        
        # 6. Test DRY RUN Mode
        print("\n--- Starting Dry Run Mode Test ---")
        dry_run_yaml_content = yaml_content.replace("dry_run: false", "dry_run: true")
        dry_run_cleaner = SemanticCleaner(config=dry_run_yaml_content, table_name="unknown")
        
        df_dry = dry_run_cleaner.transform(df)
        print("\n--- Processed Dry Run DataFrame (Should be Flat Lineage, No Overwrites) ---")
        df_dry.show(truncate=False)
        
        print(f"Dry Run Schema Columns: {df_dry.columns}")
        # Dry run forces output mode to "full"
        assert "รายการสินค้า_semantic" in df_dry.columns
        assert "รายการสินค้า_semantic_score" in df_dry.columns
        assert "รายการสินค้า_semantic_semantic_type" in df_dry.columns
        
        print("\n=== Declarative DSL Semantic Cleaner Test PASSED SUCCESSFULLY ===")
        
    finally:
        # Cleanup
        if os.path.exists(yaml_path):
            os.remove(yaml_path)
        spark.stop()

if __name__ == "__main__":
    main()
