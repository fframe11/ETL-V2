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
        self.es_base_url, self.es_auth = _get_es_connection()
        self.min_confidence = float(os.getenv("REMEDIATION_CONFIDENCE", "0.80"))
        self.schema_spec = self._load_schema()
        
    def _load_schema(self):
        # 1. Try loading from Elasticsearch sdoqap_schema_registry index
        if self.es_base_url:
            url = f"{self.es_base_url}/sdoqap_schema_registry/_doc/{self.table_name}"
            try:
                res = requests.get(url, auth=self.es_auth, timeout=5)
                if res.status_code == 200:
                    doc = res.json().get("_source", {})
                    print(f"[REMEDIATION] Loaded schema spec for '{self.table_name}' from Elasticsearch sdoqap_schema_registry.")
                    return doc
            except Exception as e:
                print(f"[REMEDIATION] Failed to load schema from ES: {e}")

        # 2. Fallback to local schema_registry.json file
        script_dir = os.path.dirname(os.path.abspath(__file__))
        schema_path = os.path.join(script_dir, "schema_registry.json")
        try:
            with open(schema_path, "r", encoding="utf-8") as f:
                registry = json.load(f)
                if self.table_name in registry:
                    print(f"[REMEDIATION] Loaded schema spec for '{self.table_name}' from local schema_registry.json fallback.")
                    return registry[self.table_name]
        except Exception as e:
            print(f"[REMEDIATION] Error loading schema from disk: {e}")
        return None

    def _get_groq_api_key(self):
        env_key = os.getenv("GROQ_API_KEY")
        if env_key:
            return env_key
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
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "response_format": {"type": "json_object"}
        }
        
        max_retries = 5
        backoff = 4
        for attempt in range(max_retries):
            try:
                r = requests.post(url, headers=headers, json=payload, timeout=60)
                if r.status_code == 429:
                    print(f"[REMEDIATION] Groq API returned 429 (Rate Limit). Retrying in {backoff} seconds...")
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                if r.status_code != 200:
                    print(f"[REMEDIATION] Groq API returned error: {r.status_code} - {r.text}")
                r.raise_for_status()
                return json.loads(r.json()["choices"][0]["message"]["content"])
            except Exception as e:
                if attempt == max_retries - 1:
                    raise e
                print(f"[REMEDIATION] Groq call attempt {attempt+1} failed: {e}. Retrying in {backoff} seconds...")
                time.sleep(backoff)
                backoff *= 2

    def get_synthesized_python_function(self, category, sample_batch):
        if not sample_batch:
            return None
            
        samples = [item["record"] for item in sample_batch[:5]]
        
        # Get target columns and metadata
        schema_cols = self.schema_spec.get("schema_spec", {}) if self.schema_spec else {}
        primary_key = self.schema_spec.get("primary_key") if self.schema_spec else None
        date_column = self.schema_spec.get("date_column") if self.schema_spec else None
        
        prompt = f'''You are an expert Python data engineer.
Analyze the target column types and the representative sample of quarantined records (which failed validation for category "{category}") for the table "{self.table_name}".
Synthesize a pure Python function `remediate(row)` that fixes the records of this category to match the target schema.

## Target Table Name
{self.table_name}

## Target Column Types (Expected Keys & Types)
{json.dumps(schema_cols, indent=2)}

## Primary Key Column(s)
{primary_key}

## Date Column
{date_column}

## Representative Samples of Quarantined Records
{json.dumps(samples, indent=2, default=str)}

## Requirements for the Python function:
1. It must be named `remediate(row)` where `row` is a dictionary representing a single record.
2. It must modify and return the `row` dictionary in-place.
3. Clean up formatting, cast strings to correct types (int, float, string) if needed, handle NaNs/Nulls or empty strings safely.
4. Translate and map Thai column meanings if they exist:
   - "รายการสินค้า" means "Product Name" (a string description, NOT numeric, e.g. "sugar", "น้ำตาล").
   - "ราคาต่อหน่วย" means "Unit Price" (an integer or numeric value, e.g. 25, 50).
   - "จำนวน" means "Quantity" (could be numeric or string, e.g. 1, 3, or "4 ชิ้น" which needs to be parsed/extracted to retrieve the numeric part 4).
   - "ยอดขายรวม" means "Total Sales" (the calculated total value, e.g. 100).
5. If "ยอดขายรวม" (Total Sales) is null/None/empty/invalid, attempt to reconstruct and calculate it by multiplying the numeric value of "จำนวน" (Quantity) and the numeric value of "ราคาต่อหน่วย" (Unit Price). For example: row['ยอดขายรวม'] = str(int(quantity_numeric) * int(price_per_unit_numeric)). Ensure you clean and parse both Quantity ("จำนวน") and Unit Price ("ราคาต่อหน่วย") to extract numbers before multiplying.
6. Only use column keys that exist exactly in the Target Column Types. Do NOT reference columns that do not exist (like 'ชื่อสินค้า' or 'product_name') – only reference actual schema keys.
7. Ensure the function handles None or unexpected values defensively. If an error occurs inside the logic that you cannot recover from, let it raise the exception so that the system fallback can trigger.
8. Only use standard Python library (do not import external libraries like pandas or numpy inside the function).
9. If a row cannot be reasonably fixed (e.g. missing primary key that cannot be reconstructed), return `None`.
10. Output ONLY a valid JSON object containing the python code under the key "python_code". Do NOT wrap the JSON in markdown code blocks. No preamble.

## Expected JSON Output Format:
{{"python_code": "def remediate(row):\\n    # fix logic here\\n    return row"}}
'''
        res = None
        try:
            res = call_ollama(prompt)
        except Exception as e:
            print(f"[REMEDIATION] Ollama failed: {e}. Trying Groq fallback.")
            groq_key = self._get_groq_api_key()
            if groq_key:
                try:
                    res = self.call_groq(prompt, groq_key)
                except Exception as ge:
                    print(f"[REMEDIATION] Groq failed: {ge}.")
            else:
                print("[REMEDIATION] No Groq API key available.")
                
        if not res or not isinstance(res, dict) or "python_code" not in res:
            print(f"[REMEDIATION] Failed to synthesize python code for category '{category}'. Falling back to heuristics.")
            return None
            
        code = res["python_code"]
        print(f"[REMEDIATION] Synthesized code for category '{category}':\n{code}")
        
        try:
            local_vars = {}
            exec(code, {}, local_vars)
            remediate_fn = local_vars.get("remediate")
            if remediate_fn and callable(remediate_fn):
                return code
            else:
                print(f"[REMEDIATION] Code compiled but 'remediate' function was not found or not callable.")
        except Exception as e:
            print(f"[REMEDIATION] Failed to compile synthesized code: {e}")
            
        return None

    def read_quarantine_data(self):
        print(f"[REMEDIATION] Reading quarantine data for {self.table_name}")
        from pyspark.sql import SparkSession
        import pyspark.sql.functions as F
        
        spark = SparkSession.builder \
            .appName("SDOQAP-AutoRemediation") \
            .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
            .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
            .getOrCreate()
            
        delta_path = f"hdfs://namenode:9000/data/quarantine/{self.table_name}"
        try:
            df = spark.read.format("delta").load(delta_path)
            df_run = df.filter(F.col("run_id") == self.run_id)
            
            # Fetch a sample batch of up to 100 records for LLM synthesis
            sample_rows = df_run.limit(100).collect()
            sample_records = []
            
            allowed_cols = set()
            if self.schema_spec and "schema_spec" in self.schema_spec:
                allowed_cols = set(self.schema_spec["schema_spec"].keys())
            allowed_cols.add("reject_reason")
            
            for row in sample_rows:
                r = row.asDict()
                filtered = {}
                for k, v in r.items():
                    if k in allowed_cols:
                        if isinstance(v, float) and (v != v or str(v) == 'nan'):
                            filtered[k] = None
                        else:
                            filtered[k] = v
                sample_records.append(filtered)
                
            return df_run, sample_records
        except Exception as e:
            print(f"[REMEDIATION] Error reading quarantine Delta table from HDFS: {e}")
            return None, []

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
            print(f"[REMEDIATION] Prompt length: {len(prompt)} characters. Record keys: {list(batch[0]['record'].keys()) if batch else 'empty'}")
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
        df_run, records = self.read_quarantine_data()
        
        if df_run is None or df_run.count() == 0:
            print("[REMEDIATION] No quarantine records found.")
            return {"total": 0, "fixed": 0, "unfixable": 0}

        if not self.schema_spec:
            print("[REMEDIATION] Target schema not available.")
            total_count = df_run.count()
            return {"total": total_count, "fixed": 0, "unfixable": total_count}

        categories = self.categorize_records(records)
        
        schema_spec = self.schema_spec.get("schema_spec", {})
        schema_cols = list(schema_spec.keys())
        
        fixed_data = []
        total_quarantined = df_run.count()
        
        stats = {
            "total_quarantined": total_quarantined,
            "attempted": 0,
            "fixed": 0,
            "unfixable": 0,
            "categories": {},
            "model_used": os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
        }
        
        # Calculate unfixable records from the DataFrame (missing primary key)
        pk = self.schema_spec.get("primary_key", "row_hash")
        import pyspark.sql.functions as F
        
        if isinstance(pk, list):
            null_cond = F.col(pk[0]).isNull()
            for p in pk[1:]:
                null_cond = null_cond | F.col(p).isNull()
            unfixable_count = df_run.filter(null_cond).count()
        else:
            unfixable_count = df_run.filter(F.col(pk).isNull()).count()
            
        stats["unfixable"] = unfixable_count
        total_conf = 0.0

        cat_keywords = {
            "null_values": "null_value",
            "type_mismatch": "type_mismatch",
            "format_errors": "format_error",
            "outliers": "expected"
        }

        for cat, items in categories.items():
            if cat == "unfixable" or not items:
                continue
                
            keyword = cat_keywords.get(cat, cat)
            df_cat = df_run.filter(F.col("reject_reason").contains(keyword))
            cat_count = df_cat.count()
            
            if cat_count == 0:
                continue
                
            stats["categories"][cat] = {"attempted": cat_count, "fixed": 0}
            stats["attempted"] += cat_count
            
            # Synthesize Python function code using a sample of representative records
            code_str = self.get_synthesized_python_function(cat, items)
            schema = df_cat.schema
            
            # Define heuristic fallback logic
            heur_fn = None
            if cat == "type_mismatch":
                heur_fn = lambda r: {k: (v.replace('$', '').replace(',', '') if isinstance(v, str) else v) for k, v in r.items()}
            elif cat == "null_values":
                heur_fn = lambda r: {k: ('UNKNOWN' if v is None or v == '' else v) for k, v in r.items()}

            # Distribute execution across cluster executors using mapPartitions
            def make_remediate_partition_mapper(code, h_fn, cols):
                def map_partition(partition):
                    local_remediate = None
                    if code:
                        try:
                            l_vars = {}
                            exec(code, {}, l_vars)
                            local_remediate = l_vars.get("remediate")
                        except Exception:
                            pass
                            
                    for row in partition:
                        row_dict = row.asDict()
                        clean_dict = {k: v for k, v in row_dict.items() if k in cols}
                        
                        fixed_row = None
                        if local_remediate:
                            try:
                                fixed_row = local_remediate(clean_dict)
                            except Exception:
                                pass
                                
                        if fixed_row is None and h_fn:
                            try:
                                fixed_row = h_fn(clean_dict)
                            except Exception:
                                pass
                                
                        if fixed_row is not None:
                            out_row = {}
                            for field in schema.fields:
                                out_row[field.name] = fixed_row.get(field.name, None)
                            yield out_row
                return map_partition

            fixed_rdd = df_cat.rdd.mapPartitions(make_remediate_partition_mapper(code_str, heur_fn, schema_cols))
            
            # Collect results to driver (safe since quarantine size is small)
            try:
                fixed_rows = fixed_rdd.collect()
                fixed_data.extend(fixed_rows)
                stats["fixed"] += len(fixed_rows)
                stats["categories"][cat]["fixed"] += len(fixed_rows)
                total_conf += (0.90 if code_str else 0.85) * len(fixed_rows)
            except Exception as e:
                print(f"[REMEDIATION] Error collecting parallel remediation results for '{cat}': {e}")
                stats["unfixable"] += cat_count

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
