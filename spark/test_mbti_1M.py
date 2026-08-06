import subprocess
import time
import sys

def main():
    print("--- Starting 1 Million Records (mbti_1M) Scalability Test ---")
    start_time = time.time()
    
    # 1. Upload CSV to HDFS raw layer
    print("Uploading mbti_1M.csv to HDFS raw layer...")
    upload_cmd = [
        "docker", "exec", "sdoqap-spark-master", "python", "-c",
        "from pyspark.sql import SparkSession; "
        "spark = SparkSession.builder.appName('Upload-1M').getOrCreate(); "
        "df = spark.read.option('header', 'true').option('multiLine', 'true').option('escape', '\"').option('quote', '\"').csv('/opt/spark-apps/mbti_1M.csv'); "
        "df.write.mode('overwrite').option('header', 'true').csv('hdfs://namenode:9000/data/raw/mbti_1M')"
    ]
    
    up_res = subprocess.run(upload_cmd, capture_output=True, text=True)
    if up_res.returncode != 0:
        print(f"Error uploading to HDFS: {up_res.stderr}")
        sys.exit(1)
    print("Successfully uploaded 1M records dataset to HDFS raw.")
    
    # 2. Trigger validation engine for mbti_1M
    print("Triggering Spark Quality Validation Engine for mbti_1M...")
    validation_start = time.time()
    
    val_cmd = [
        "docker", "exec", "sdoqap-spark-master",
        "/opt/bitnami/spark/bin/spark-submit",
        "--master", "spark://spark-master:7077",
        "--executor-memory", "2g",
        "--executor-cores", "2",
        "--conf", "spark.sql.shuffle.partitions=200",
        "/opt/spark-apps/spark_quality_engine.py",
        "mbti_1M"
    ]
    
    # Run the validation check
    val_res = subprocess.run(val_cmd, capture_output=True, text=True)
    validation_end = time.time()
    
    # Print outputs
    print("\n--- Validation Engine Outputs ---")
    print(val_res.stdout)
    if val_res.returncode != 0:
        print("Validation Failed!")
        print(val_res.stderr)
        sys.exit(1)
        
    total_duration = time.time() - start_time
    val_duration = validation_end - validation_start
    
    print("\n--- Scalability Test Completed Successfully ---")
    print(f"HDFS Upload Time: {validation_start - start_time:.2f} seconds")
    print(f"Spark Validation & Optimization Time: {val_duration:.2f} seconds")
    print(f"Total Scalability Run Duration: {total_duration:.2f} seconds")

if __name__ == "__main__":
    main()
