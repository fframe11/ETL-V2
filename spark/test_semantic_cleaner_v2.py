import os
import sys
from pyspark.sql import SparkSession

# Ensure project and package paths are accessible
spark_dir = os.path.dirname(os.path.abspath(__file__))
if spark_dir not in sys.path:
    sys.path.insert(0, spark_dir)

from semantic_cleaner import SemanticCleanerV2

def main():
    print("=== Starting Declarative DSL v2.0 Graph Execution Test ===")
    
    # 1. Initialize PySpark Session
    spark = SparkSession.builder \
        .appName("SDOQAP-DSL-v2-Graph-Test") \
        .master("local[*]") \
        .config("spark.driver.bindAddress", "127.0.0.1") \
        .get_url() if hasattr(SparkSession.builder, "get_url") else SparkSession.builder.getOrCreate()
        
    spark.sparkContext.setLogLevel("ERROR")
    
    # 2. Write DSL v2.0 YAML spec config
    yaml_content = """
dsl_version: 2.0
config_version: 2026.08.06

pipeline:
  default_strategy: cascade

global:
  schema_mode: evolve
  dry_run: false

columns:
  - name: text_input
    type: string
    pipeline:
      - step: exact_match
        source: product_dict
        output: category
      - step: fuzzy_match
        source: product_dict
        threshold: 0.5
        output: category
      - step: model_inference
        model: mbti_classifier
        output: category
      - step: fallback
        value: unknown_fallback
    post_process:
      - normalize_case
"""
    yaml_path = os.path.join(spark_dir, "remediation_rules_v2_test.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_content)
        
    print(f"Created temporary YAML DSL v2.0 rules config at: {yaml_path}")
    
    try:
        # 3. Create Sample Spark DataFrame with inputs for different cascade steps
        data = [
            ("Pepsi Max", 12.0),                # Should match exactly -> Category: น้ำอัดลม (exact)
            ("น้ำเปล่าสิง", 5.0),                # Typo, should match fuzzy -> Category: น้ำดื่ม (fuzzy)
            ("intj personality", 20.0),          # Should trigger ML mock -> Category: Introverted Intuitive Thinking Judging (ml_model)
            ("unrelated raw value x999", 15.0)   # Should fall back -> Category: unknown_fallback (fallback)
        ]
        columns = ["text_input", "ราคา"]
        df = spark.createDataFrame(data, columns)
        
        print("\n--- Original Input DataFrame ---")
        df.show(truncate=False)
        
        # 4. Initialize the SemanticCleanerV2 Library
        cleaner = SemanticCleanerV2(config=yaml_path, table_name="unknown")
        
        # 5. Execute Transformation
        df_clean = cleaner.transform(df)
        
        # 4. Fetch results by capturing show() stdout to bypass Windows collect() and file-writing limitations
        import io
        from contextlib import redirect_stdout
        
        print("Capturing show() output...")
        f_capture = io.StringIO()
        with redirect_stdout(f_capture):
            df_clean.show(truncate=False)
        output_str = f_capture.getvalue()
        
        print("Standardized DataFrame results:")
        print(output_str)
        
        # Simple ASCII table parser
        lines = [line.strip() for line in output_str.splitlines() if line.strip()]
        headers = []
        rows = []
        for line in lines:
            if line.startswith("+"):
                continue
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if not headers:
                headers = parts
            else:
                rows.append(dict(zip(headers, parts)))
                
        # Assert schema columns exist in parsed headers
        assert "_semantic_text_input" in headers
        assert "_meta" in headers
        print("Schema columns assertions passed")
                
        # Assertions
        assert "น้ำอัดลม" in rows[0]["_semantic_text_input"]
        assert "exact" in rows[0]["_semantic_text_input"]
        print(f"Row 1 Assertion Passed: exact match -> {rows[0]['_semantic_text_input']}")
        
        assert "น้ำดื่ม" in rows[1]["_semantic_text_input"]
        assert "fuzzy" in rows[1]["_semantic_text_input"]
        print(f"Row 2 Assertion Passed: fuzzy match -> {rows[1]['_semantic_text_input']}")
        
        assert "Introverted Intuitive Thinking Judging" in rows[2]["_semantic_text_input"]
        assert "ml_model" in rows[2]["_semantic_text_input"]
        print(f"Row 3 Assertion Passed: ML model match -> {rows[2]['_semantic_text_input']}")
        
        assert "unknown_fallback" in rows[3]["_semantic_text_input"]
        assert "fallback" in rows[3]["_semantic_text_input"]
        print(f"Row 4 Assertion Passed: fallback default -> {rows[3]['_semantic_text_input']}")
        
        print("\n=== Declarative DSL v2.0 Graph Execution Test PASSED SUCCESSFULLY ===")
        
    finally:
        # Cleanup
        if os.path.exists(yaml_path):
            os.remove(yaml_path)
        spark.stop()

if __name__ == "__main__":
    main()
