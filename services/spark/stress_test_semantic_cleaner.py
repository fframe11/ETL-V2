import os
import sys
import time
import json
import psutil
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

# Ensure path is accessible
spark_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, spark_dir)

from semantic_cleaner import SemanticCleanerV2

def print_memory_usage():
    process = psutil.Process(os.getpid())
    mem_mb = process.memory_info().rss / (1024 * 1024)
    print(f"[STRESS TEST] Driver memory usage: {mem_mb:.2f} MB")
    return mem_mb

def main():
    print("=== Starting PySpark Semantic Cleaner Stress Test ===")
    
    # 1. Initialize Spark Session
    spark = SparkSession.builder \
        .appName("SDOQAP-Semantic-Cleaner-Stress-Test") \
        .master("local[*]") \
        .config("spark.driver.bindAddress", "127.0.0.1") \
        .config("spark.driver.memory", "4g") \
        .config("spark.executor.memory", "4g") \
        .get_url() if hasattr(SparkSession.builder, "get_url") else SparkSession.builder.getOrCreate()
        
    spark.sparkContext.setLogLevel("ERROR")
    
    # 2. Write DSL config for stress test
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
    yaml_path = os.path.join(spark_dir, "stress_test_config.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_content)
        
    try:
        # 3. Generate Large Synthetic Dataset (100,000 Rows)
        print("\n[STRESS TEST] Generating 100,000 synthetic rows of text data...")
        import random
        candidates = [
            "Pepsi Max",          # Exact match
            "น้ำเปล่าสิง",          # Fuzzy match
            "intj personality",   # ML model match
            "random noise 123"    # Fallback
        ]
        
        # Build dataset
        raw_data = [(random.choice(candidates), float(random.randint(10, 100))) for _ in range(100000)]
        df = spark.createDataFrame(raw_data, ["text_input", "ราคา"])
        
        print_memory_usage()
        
        # 4. Initialize Engine v2
        cleaner = SemanticCleanerV2(config=yaml_path, table_name="unknown")
        
        # 5. Measure Execution Performance
        print("\n[STRESS TEST] Executing transformation graph on 100,000 rows...")
        start_time = time.time()
        
        # Apply transformation
        df_clean = cleaner.transform(df)
        
        # Force evaluation via show / count
        import io
        from contextlib import redirect_stdout
        f_null = io.StringIO()
        with redirect_stdout(f_null):
            df_clean.show(1) # Triggers UDF initialization
            total_rows = df_clean.count() # Force evaluation across partitions
            
        end_time = time.time()
        duration = end_time - start_time
        throughput = total_rows / duration
        
        print("\n=== STRESS TEST RESULTS ===")
        print(f"Total Rows Processed: {total_rows:,} rows")
        print(f"Execution Duration:  {duration:.3f} seconds")
        print(f"System Throughput:   {throughput:.2f} rows/second")
        print_memory_usage()
        print("===========================")
        
        # Verify schema is healthy
        assert "_semantic_text_input" in df_clean.columns
        assert "_meta" in df_clean.columns
        print("\n[STRESS TEST] System integrity verified successfully!")
        
    finally:
        # Cleanup
        if os.path.exists(yaml_path):
            os.remove(yaml_path)
        spark.stop()

if __name__ == "__main__":
    main()
