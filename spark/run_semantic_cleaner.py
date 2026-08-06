import os
import sys
import argparse
from pyspark.sql import SparkSession

# Ensure project and package paths are accessible
spark_dir = os.path.dirname(os.path.abspath(__file__))
if spark_dir not in sys.path:
    sys.path.insert(0, spark_dir)

from semantic_cleaner import SemanticCleaner

def main():
    parser = argparse.ArgumentParser(description="SDOQAP PySpark Semantic Cleaner Runner Script")
    parser.add_argument("--config", required=True, help="Path to declarative YAML DSL configuration file")
    parser.add_argument("--table", required=False, help="Optional table name to load categories from rules_config.json")
    parser.add_argument("--input", required=True, help="Path to input dataset (CSV, Parquet, or local/HDFS path)")
    parser.add_argument("--output", required=True, help="Path to write cleaned output dataset")
    parser.add_argument("--partition-date", required=False, help="Execution/partition date filter (e.g. YYYY-MM-DD)")
    
    args = parser.parse_args()
    
    if args.partition_date:
        args.input = args.input.replace("{ds}", args.partition_date).replace("{partition_date}", args.partition_date)
        args.output = args.output.replace("{ds}", args.partition_date).replace("{partition_date}", args.partition_date)
        
    print(f"[ORCHESTRATOR] Starting Semantic Cleaner Orchestrator Job")
    if args.partition_date:
        print(f"[ORCHESTRATOR] Partition Date Filter active: {args.partition_date}")
    print(f"[ORCHESTRATOR] Config: {args.config}")
    print(f"[ORCHESTRATOR] Table:  {args.table}")
    print(f"[ORCHESTRATOR] Input:  {args.input}")
    print(f"[ORCHESTRATOR] Output: {args.output}")
    
    # 1. Initialize Spark Session
    spark = SparkSession.builder \
        .appName(f"SDOQAP-Orchestrated-Cleaner-{args.table or 'unknown'}") \
        .master("local[*]") \
        .config("spark.driver.bindAddress", "127.0.0.1") \
        .get_url() if hasattr(SparkSession.builder, "get_url") else SparkSession.builder.getOrCreate()
        
    spark.sparkContext.setLogLevel("ERROR")
    
    try:
        # 2. Read Input Data with local Pandas fallback for JDK 23 compatibility
        try:
            if args.input.endswith(".parquet") or "parquet" in args.input:
                df = spark.read.parquet(args.input)
            else:
                df = spark.read.option("header", "true").option("inferSchema", "true").csv(args.input)
            print(f"[ORCHESTRATOR] PySpark read data successfully.")
        except Exception as read_err:
            print(f"[ORCHESTRATOR] [WARN] PySpark native read failed: {read_err}. Falling back to Pandas file loader.")
            import pandas as pd
            if args.input.endswith(".parquet") or "parquet" in args.input:
                pdf = pd.read_parquet(args.input)
            else:
                pdf = pd.read_csv(args.input)
            # Fill NaN values with None for proper Spark conversion
            pdf = pdf.where(pd.notnull(pdf), None)
            df = spark.createDataFrame(pdf)
            
        print(f"[ORCHESTRATOR] Input loaded successfully. Columns: {df.columns}")
        
        # 3. Initialize and Apply Cleaner
        cleaner = SemanticCleaner(config=args.config, table_name=args.table)
        df_clean = cleaner.transform(df)
        
        # 4. Save Output Data with local Pandas fallback for JDK 23 compatibility
        try:
            if args.output.endswith(".parquet"):
                df_clean.write.mode("overwrite").parquet(args.output)
            else:
                df_clean.write.mode("overwrite").option("header", "true").csv(args.output)
            print(f"[ORCHESTRATOR] Output written successfully via PySpark.")
        except Exception as write_err:
            print(f"[ORCHESTRATOR] [WARN] PySpark native write failed: {write_err}. Falling back to Pandas file writer.")
            pdf_clean = df_clean.toPandas()
            # If target is a directory and doesn't end with extension
            if not args.output.endswith((".csv", ".parquet")):
                os.makedirs(args.output, exist_ok=True)
                target_file = os.path.join(args.output, "cleaned_output.csv")
                pdf_clean.to_csv(target_file, index=False, encoding="utf-8")
            else:
                os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)
                if args.output.endswith(".parquet"):
                    pdf_clean.to_parquet(args.output, index=False)
                else:
                    pdf_clean.to_csv(args.output, index=False, encoding="utf-8")
            
        print(f"[ORCHESTRATOR] Output successfully written to: {args.output}")
        
    except Exception as e:
        print(f"[ORCHESTRATOR] [CRITICAL ERROR] Job failed: {e}")
        sys.exit(1)
    finally:
        spark.stop()
        print(f"[ORCHESTRATOR] Job execution finished. Spark session stopped.")

if __name__ == "__main__":
    main()
