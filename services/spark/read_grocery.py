from pyspark.sql import SparkSession

def main():
    spark = SparkSession.builder.appName("ReadGrocery").getOrCreate()
    
    print("\n--- GROCERY SALES ACTIVE TABLE ---")
    try:
        df_active = spark.read.format("delta").load("hdfs://namenode:9000/data/active/grocery_sales")
        print(f"Total active records: {df_active.count()}")
        print("Schema:")
        df_active.printSchema()
        print("First 10 records:")
        df_active.show(10, truncate=False)
    except Exception as e:
        print(f"Error loading active table: {e}")
        
    print("\n--- GROCERY SALES QUARANTINE TABLE ---")
    try:
        df_quar = spark.read.format("delta").load("hdfs://namenode:9000/data/quarantine/grocery_sales")
        print(f"Total quarantined records: {df_quar.count()}")
        latest_run = df_quar.select("run_id").distinct().orderBy("run_id", ascending=False).first()
        if latest_run:
            print(f"Showing latest quarantine run: {latest_run[0]}")
            df_quar.filter(df_quar.run_id == latest_run[0]).show(10, truncate=False)
    except Exception as e:
        print(f"Error loading quarantine table: {e}")

if __name__ == "__main__":
    main()
