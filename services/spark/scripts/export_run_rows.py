"""Export one run's clean and quarantined rows from Delta Lake to CSV (run inside spark-master).
Usage: python /opt/spark-apps/scripts/export_run_rows.py --table T --run-id R --out /tmp/eval_rows"""
import argparse
import csv
import os

_EXCLUDE_META = {"run_id", "processed_at", "_hoodie_commit_time", "__index_level_0__"}


def select_run_rows(df, run_id):
    from pyspark.sql import functions as F
    columns = [c for c in df.columns if c not in _EXCLUDE_META]
    return df.filter(F.col("run_id") == run_id).select(*columns)


def main():
    from pyspark.sql import SparkSession
    p = argparse.ArgumentParser()
    p.add_argument("--table", required=True)
    p.add_argument("--run-id", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    hdfs = os.getenv("HDFS_URL", "hdfs://namenode:9000")
    spark = SparkSession.builder.appName("SDOQAP_ExportRunRows").getOrCreate()
    os.makedirs(a.out, exist_ok=True)
    for layer in ("active", "quarantine"):
        df = spark.read.format("delta").load(f"{hdfs}/data/{layer}/{a.table}")
        selected = select_run_rows(df, a.run_id)
        rows = selected.collect()  # small per-run result; avoids needing pandas on the image
        with open(os.path.join(a.out, f"{layer}.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(selected.columns)
            for r in rows:
                w.writerow(["" if v is None else v for v in r])
        print(f"{layer}: {len(rows)} rows")
    spark.stop()


if __name__ == "__main__":
    main()
