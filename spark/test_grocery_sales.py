import os
import requests
import time

HDFS_URL = "http://namenode:9870/webhdfs/v1"

def upload_to_hdfs(table_name, file_path):
    print(f"Uploading CSV file {file_path} to HDFS raw layer under '{table_name}'...")
    
    with open(file_path, "rb") as f:
        content = f.read()
        
    path = f"/data/raw/{table_name}/{table_name}.csv"
    
    # WebHDFS Create - Step 1: PUT to namenode
    url = f"{HDFS_URL}{path}?op=CREATE&overwrite=true&user.name=spark"
    r = requests.put(url, allow_redirects=False)
    
    # Step 2: PUT to datanode redirect
    if r.status_code == 307:
        redirect_url = r.headers["Location"]
        r2 = requests.put(redirect_url, data=content)
        if r2.status_code == 201:
            print("Successfully uploaded CSV to HDFS.")
            return True
    print(f"Failed to upload CSV to HDFS: {r.status_code}")
    return False

def trigger_daemon_validation(table_name):
    print(f"Triggering Quality Validation pipeline for table '{table_name}'...")
    url = "http://localhost:8099/retry"
    payload = {"table": table_name}
    try:
        r = requests.post(url, json=payload)
        if r.status_code == 200:
            res = r.json()
            print(f"Validation successfully triggered: {res.get('message')}")
            return True
        print(f"Failed to trigger validation: {r.status_code} - {r.text}")
    except Exception as e:
        print(f"Failed to connect to trigger daemon: {e}")
    return False

def main():
    table_name = "grocery_sales"
    file_path = "/opt/spark-apps/grocery_sales.csv"
    
    # 1. Upload CSV to HDFS
    if not upload_to_hdfs(table_name, file_path):
        return
        
    # 2. Trigger Quality Check
    if not trigger_daemon_validation(table_name):
        return
        
    print("\n--- Pipeline Triggered Successfully ---")
    print("Please watch the trigger daemon logs for validation & auto-remediation completion.")

if __name__ == "__main__":
    main()
