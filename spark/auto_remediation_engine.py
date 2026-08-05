import os
import sys
import json
import time
import csv
import io
import datetime
import urllib.parse
import requests
import pyarrow as pa
import pyarrow.parquet as pq

def load_env_file():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    for _ in range(3):
        env_path = os.path.join(current_dir, ".env")
        if os.path.exists(env_path):
            try:
                with open(env_path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            os.environ.setdefault(k.strip(), v.strip())
            except Exception:
                pass
            break
        current_dir = os.path.dirname(current_dir)
load_env_file()

def _get_es_connection():
    from urllib.parse import urlparse
    es_url = os.getenv("ELASTICSEARCH_URL", "")
    parsed = urlparse(es_url)
    auth = (parsed.username, parsed.password) if parsed.username else None
    if parsed.username:
        base_url = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
    else:
        base_url = es_url
    return base_url, auth

def read_hdfs_file(path):
    """Read a file from HDFS via WebHDFS."""
    url = f"http://namenode:9870/webhdfs/v1{path}?op=OPEN&user.name=spark"
    r = requests.get(url, allow_redirects=False, timeout=10)
    if r.status_code == 307:
        redirect_url = r.headers["Location"]
        redirect_url = redirect_url.replace("localhost:", "datanode:").replace("127.0.0.1:", "datanode:")
        r2 = requests.get(redirect_url, timeout=30)
        r2.raise_for_status()
        return r2.content
    elif r.status_code == 200:
        return r.content
    else:
        raise Exception(f"HDFS read failed: HTTP {r.status_code}")

def list_hdfs_dir(path):
    url = f"http://namenode:9870/webhdfs/v1{path}?op=LISTSTATUS&user.name=spark"
    r = requests.get(url, timeout=10)
    if r.status_code == 404:
        return []
    r.raise_for_status()
    statuses = r.json().get("FileStatuses", {}).get("FileStatus", [])
    return sorted([s["pathSuffix"] for s in statuses if s["pathSuffix"]])

def write_csv_to_hdfs(table_name, csv_content):
    path = f"/data/raw/{table_name}/{table_name}.csv"
    url = f"http://namenode:9870/webhdfs/v1{path}?op=CREATE&overwrite=true&user.name=spark"
    r = requests.put(url, allow_redirects=False, timeout=10)
    if r.status_code == 307:
        redirect_url = r.headers["Location"]
        redirect_url = redirect_url.replace("localhost:", "datanode:").replace("127.0.0.1:", "datanode:")
        r2 = requests.put(redirect_url, data=csv_content.encode('utf-8'), 
                          headers={'Content-Type': 'application/octet-stream'}, timeout=30)
        r2.raise_for_status()
    elif r.status_code != 201:
        raise Exception(f"HDFS write failed: HTTP {r.status_code}")

def call_ollama(prompt, model=None):
    ollama_url = os.getenv("OLLAMA_URL", "http://ollama:11434")
    model = model or os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.0, "num_predict": 4096}
    }
    r = requests.post(f"{ollama_url}/api/generate", json=payload, timeout=120)
    r.raise_for_status()
    return json.loads(r.json()["response"])

class AutoRemediationEngine:
    def __init__(self, table_name, run_id):
        self.table_name = table_name
        self.run_id = run_id
        self.schema_spec = self._load_schema()
        self.es_base_url, self.es_auth = _get_es_connection()
        self.min_confidence = float(os.getenv("REMEDIATION_CONFIDENCE", "0.80"))
        
    def _load_schema(self):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        schema_path = os.path.join(script_dir, "schema_registry.json")
        try:
            with open(schema_path, "r") as f:
                registry = json.load(f)
                if self.table_name in registry:
                    return registry[self.table_name]
        except Exception as e:
            print(f"[REMEDIATION] Error loading schema: {e}")
        return None

    def _get_groq_api_key(self):
        try:
            url = f"{self.es_base_url}/sdoqap_settings/_doc/global"
            r = requests.get(url, auth=self.es_auth, timeout=5)
            if r.status_code == 200:
                data = r.json()
                return data.get("_source", {}).get("groq_api_key")
        except Exception:
            pass
        return None

    def call_groq(self, prompt, api_key):
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "response_format": {"type": "json_object"}
        }
        r = requests.post(url, headers=headers, json=payload, timeout=60)
        r.raise_for_status()
        return json.loads(r.json()["choices"][0]["message"]["content"])

    def read_quarantine_data(self):
        print(f"[REMEDIATION] Reading quarantine data for {self.table_name}")
        delta_path = f"/data/quarantine/{self.table_name}"
        log_dir = f"{delta_path}/_delta_log"
        files = list_hdfs_dir(log_dir)
        commit_files = [f for f in files if f.endswith(".json")]
        
        active_files = set()
        for cfile in commit_files:
            try:
                content = read_hdfs_file(f"{log_dir}/{cfile}")
                for line in content.decode('utf-8').strip().split('\n'):
                    if not line:
                        continue
                    action = json.loads(line)
                    if "add" in action:
                        active_files.add(action["add"]["path"])
                    if "remove" in action:
                        active_files.discard(action["remove"]["path"])
            except Exception as e:
                print(f"[REMEDIATION] Error processing delta log {cfile}: {e}")

        records = []
        for file_path in active_files:
            try:
                content = read_hdfs_file(f"{delta_path}/{file_path}")
                table = pq.read_table(io.BytesIO(content))
                df = table.to_pandas()
                if "run_id" in df.columns:
                    df = df[df["run_id"] == self.run_id]
                records.extend(df.to_dict(orient="records"))
            except Exception as e:
                print(f"[REMEDIATION] Error reading parquet {file_path}: {e}")
                
        # Limit to 500 records
        if len(records) > 500:
            print(f"[REMEDIATION] Limiting records from {len(records)} to 500")
            records = records[:500]
            
        return records

    def categorize_records(self, records):
        categories = {
            "type_mismatch": [],
            "null_values": [],
            "format_errors": [],
            "outliers": [],
            "unfixable": []
        }
        
        for idx, rec in enumerate(records):
            reason = str(rec.get("reject_reason", ""))
            entry = {"index": idx, "record": rec, "reason": reason}
            
            if "duplicate_records" in reason:
                categories["unfixable"].append(entry)
            elif "invalid_type_" in reason:
                categories["type_mismatch"].append(entry)
            elif "null_value_in_" in reason or "missing_primary_key" in reason:
                categories["null_values"].append(entry)
            elif "missing_date" in reason:
                categories["format_errors"].append(entry)
            elif "outlier" in reason or "anomaly" in reason or "unsupervised" in reason:
                categories["outliers"].append(entry)
            else:
                categories["unfixable"].append(entry)
                
        return categories

    def get_ai_fix(self, category, batch):
        if not batch:
            return []
            
        prompt = f'''You are a Data Remediation Engineer. Fix these quarantined records to match the expected schema.

## Target Schema
{json.dumps(self.schema_spec, indent=2)}

## Records to Fix (Category: {category})
{json.dumps([b["record"] for b in batch], indent=2, default=str)}

## Instructions
For each record:
1. Identify what's wrong based on the reject_reason
2. Fix the values to match the expected schema types and constraints
3. Rate your confidence (0.0-1.0) for each fix
4. If a record cannot be reasonably fixed, set confidence to 0.0

## Required JSON Output
{{"fixed_records": [{{"original_index": 0, "fixed_row": {{...}}, "confidence": 0.95, "fix_description": "..."}}]}}
'''
        
        try:
            return call_ollama(prompt)
        except Exception as e:
            print(f"[REMEDIATION] Ollama failed: {e}. Trying Groq fallback.")
            groq_key = self._get_groq_api_key()
            if groq_key:
                try:
                    return self.call_groq(prompt, groq_key)
                except Exception as ge:
                    print(f"[REMEDIATION] Groq failed: {ge}. Using heuristics.")
            else:
                print("[REMEDIATION] No Groq API key available. Using heuristics.")
                
        return self._heuristic_fix(category, batch)

    def _heuristic_fix(self, category, batch):
        results = {"fixed_records": []}
        for i, item in enumerate(batch):
            rec = item["record"].copy()
            conf = 0.0
            
            try:
                if category == "type_mismatch":
                    # basic string replacements
                    for k, v in rec.items():
                        if isinstance(v, str):
                            rec[k] = v.replace('$', '').replace(',', '')
                    conf = 0.85
                elif category == "null_values":
                    for k, v in rec.items():
                        if v is None or (isinstance(v, float) and str(v) == 'nan') or v == '':
                            rec[k] = 'UNKNOWN'
                    conf = 0.85
                elif category == "format_errors":
                    conf = 0.85
                elif category == "outliers":
                    conf = 0.70
            except:
                conf = 0.0
                
            results["fixed_records"].append({
                "original_index": i,
                "fixed_row": rec,
                "confidence": conf,
                "fix_description": "Heuristic fallback fix"
            })
        return results

    def run(self):
        start_time = time.time()
        records = self.read_quarantine_data()
        
        if not records:
            print("[REMEDIATION] No quarantine records found.")
            return {"total": 0, "attempted": 0, "fixed": 0, "unfixable": 0}

        if not self.schema_spec:
            print("[REMEDIATION] Target schema not available.")
            return {"total": len(records), "attempted": 0, "fixed": 0, "unfixable": len(records)}

        categories = self.categorize_records(records)
        
        fixed_data = []
        stats = {
            "total_quarantined": len(records),
            "attempted": 0,
            "fixed": 0,
            "unfixable": len(categories["unfixable"]),
            "categories": {},
            "model_used": os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
        }
        
        total_conf = 0.0

        for cat, items in categories.items():
            if cat == "unfixable" or not items:
                continue
                
            stats["categories"][cat] = {"attempted": len(items), "fixed": 0}
            stats["attempted"] += len(items)
            
            # Batch by 20
            for i in range(0, len(items), 20):
                batch = items[i:i+20]
                try:
                    res = self.get_ai_fix(cat, batch)
                    fixed_list = res.get("fixed_records", [])
                    
                    for fix_item in fixed_list:
                        conf = float(fix_item.get("confidence", 0.0))
                        if conf >= self.min_confidence:
                            fixed_row = fix_item.get("fixed_row", {})
                            if fixed_row:
                                fixed_data.append(fixed_row)
                                stats["fixed"] += 1
                                stats["categories"][cat]["fixed"] += 1
                                total_conf += conf
                        else:
                            stats["unfixable"] += 1
                except Exception as e:
                    print(f"[REMEDIATION] Error fixing batch in {cat}: {e}")
                    stats["unfixable"] += len(batch)

        stats["confidence_avg"] = round(total_conf / stats["fixed"], 4) if stats["fixed"] > 0 else 0.0
        stats["duration_seconds"] = round(time.time() - start_time, 2)

        if fixed_data:
            self._write_to_raw(fixed_data)
            
        self._log_to_es(stats)
        
        return {
            "total": stats["total_quarantined"],
            "fixed": stats["fixed"],
            "unfixable": stats["unfixable"]
        }

    def _write_to_raw(self, fixed_data):
        print(f"[REMEDIATION] Writing {len(fixed_data)} fixed records to raw layer")
        # Get columns from schema_spec (dict of col_name: type)
        schema_spec = self.schema_spec.get("schema_spec", {})
        schema_cols = list(schema_spec.keys())
        
        # Filter columns
        filtered_data = []
        for row in fixed_data:
            clean_row = {}
            for col in schema_cols:
                clean_row[col] = row.get(col, "")
            filtered_data.append(clean_row)
            
        if not filtered_data:
            return
            
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=schema_cols)
        writer.writeheader()
        writer.writerows(filtered_data)
        
        write_csv_to_hdfs(self.table_name, output.getvalue())

    def _log_to_es(self, stats):
        if not self.es_base_url:
            return
            
        doc = {
            "table_name": self.table_name,
            "run_id": self.run_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            **stats
        }
        
        try:
            url = f"{self.es_base_url}/sdoqap_remediations/_doc"
            r = requests.post(url, json=doc, auth=self.es_auth, timeout=10)
            r.raise_for_status()
            print("[REMEDIATION] Successfully logged results to Elasticsearch")
        except Exception as e:
            print(f"[REMEDIATION] Error logging to ES: {e}")

def main():
    if len(sys.argv) < 3:
        print("Usage: python auto_remediation_engine.py <table_name> <run_id>")
        sys.exit(1)
    
    table_name = sys.argv[1]
    run_id = sys.argv[2]
    
    print(f"[REMEDIATION] Starting Auto-Remediation for table '{table_name}', run_id='{run_id}'")
    
    engine = AutoRemediationEngine(table_name, run_id)
    result = engine.run()
    
    if result['fixed'] > 0:
        print(f"[REMEDIATION] Successfully remediated {result['fixed']}/{result['total']} records")
        sys.exit(0)
    else:
        print(f"[REMEDIATION] No records could be remediated. {result['unfixable']} remain in quarantine.")
        sys.exit(1)

if __name__ == "__main__":
    main()
