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

def save_remediation_rules(table_name, new_rules):
    """Saves new remediation rules to the ES registry and local rules_config.json backup."""
    base_url, auth = _get_es_connection()
    if not base_url:
        return
        
    url = f"{base_url}/sdoqap_rules_registry/_doc/{table_name}"
    try:
        # Get existing rules doc
        res = requests.get(url, auth=auth, timeout=5)
        if res.status_code == 200:
            doc = res.json().get("_source", {})
        else:
            doc = {}
            
        existing_rules = doc.get("remediation_rules", [])
        
        # Merge/dedup remediation_rules
        for nr in new_rules:
            exists = False
            for er in existing_rules:
                if er.get("column") == nr.get("column") and er.get("type") == nr.get("type"):
                    er.update(nr)
                    exists = True
                    break
            if not exists:
                existing_rules.append(nr)
                
        doc["remediation_rules"] = existing_rules
        
        # Write back to ES
        headers = {"Content-Type": "application/json"}
        put_res = requests.put(url, headers=headers, auth=auth, json=doc, timeout=5)
        if put_res.status_code in (200, 201):
            print(f"[REMEDIATION_REGISTRY] Successfully updated and saved remediation rules for '{table_name}' in ES registry.")
        else:
            print(f"[REMEDIATION_REGISTRY] Failed to save rules to ES: {put_res.text}")
            
    except Exception as e:
        print(f"[REMEDIATION_REGISTRY] Failed to save rules to ES: {e}")
        
    # Sync with local rules_config.json
    try:
        config_path = "/opt/spark-apps/rules_config.json"
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                all_rules = json.load(f)
        else:
            all_rules = {}
            
        table_rules = all_rules.setdefault(table_name, {})
        existing_local = table_rules.setdefault("remediation_rules", [])
        
        for nr in new_rules:
            exists = False
            for er in existing_local:
                if er.get("column") == nr.get("column") and er.get("type") == nr.get("type"):
                    er.update(nr)
                    exists = True
                    break
            if not exists:
                existing_local.append(nr)
                
        table_rules["remediation_rules"] = existing_local
        
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(all_rules, f, indent=2, ensure_ascii=False)
        print(f"[REMEDIATION_REGISTRY] Successfully updated and saved local rules_config.json for '{table_name}'.")
    except Exception as e:
        print(f"[REMEDIATION_REGISTRY] Failed to sync local rules_config.json: {e}")

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
    r = requests.post(f"{ollama_url}/api/generate", json=payload, timeout=300)
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



    def get_synthesized_dsl_rules(self, category, sample_batch):
        """Asks Ollama/Groq to analyze the quarantined sample and generate declarative DSL rules."""
        if not sample_batch:
            return None
            
        samples = [item["record"] for item in sample_batch[:5]]
        
        # Get target columns and metadata
        schema_cols = self.schema_spec.get("schema_spec", {}) if self.schema_spec else {}
        primary_key = self.schema_spec.get("primary_key") if self.schema_spec else None
        date_column = self.schema_spec.get("date_column") if self.schema_spec else None
        
        prompt = f'''You are an expert Data Engineer.
Analyze the target column types and the representative sample of quarantined records (which failed validation for category "{category}") for the table "{self.table_name}".
Synthesize a list of declarative remediation rules (DSL) in JSON format to fix the records of this category to match the target schema.

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

## Supported DSL Rule Types:
1. `fillna`: Fills null values with a static value.
   Format: {{"column": "col_name", "type": "fillna", "value": default_val}}
2. `calculate`: Calculates a column value using basic math expression of other columns (+, -, *, /).
   Format: {{"column": "col_name", "type": "calculate", "expression": "col1 * col2", "condition": "optional condition expression"}}
3. `cast`: Casts column type.
   Format: {{"column": "col_name", "type": "cast", "to": "double|integer|string"}}
4. `filter`: Filters out invalid rows.
   Format: {{"type": "filter", "condition": "expression"}}

## Instructions:
1. Identify the pattern of error in the sample.
2. If a numeric column is null but can be derived from other columns in this same
   sample (e.g. a total that equals quantity * unit price), prefer a "calculate" rule
   over "fillna" for that column.
3. CRITICAL: Never generate "fillna" rules with a null/None value. All fillna rules must use concrete non-null default values.
4. For EACH rule, include a "confidence" field from 0.0 to 1.0 reflecting how certain
   you are the rule correctly fixes the pattern, based only on the evidence in the
   sample (not general assumptions). Rules you are unsure about should score lower.
5. Return ONLY a valid JSON object containing the remediation rules under the key "remediation_rules". Do NOT wrap the JSON in markdown code blocks. No preamble.

## Expected JSON Output Format:
{{
  "remediation_rules": [
    {{
      "column": "total_amount",
      "type": "calculate",
      "expression": "quantity * unit_price",
      "condition": "total_amount IS NULL",
      "confidence": 0.85
    }}
  ]
}}
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
                
        if not res or not isinstance(res, dict) or "remediation_rules" not in res:
            print(f"[REMEDIATION] Failed to synthesize DSL rules for category '{category}'.")
            return None

        raw_rules = res["remediation_rules"]
        print(f"[REMEDIATION] Synthesized DSL rules for category '{category}':\n{json.dumps(raw_rules, indent=2)}")

        # Root Cause Fix: self.min_confidence was set but never enforced — every
        # LLM-synthesized rule was applied regardless of the model's own stated
        # certainty. Reject (don't silently apply) any rule below the configured
        # REMEDIATION_CONFIDENCE floor; a rule with no confidence field at all is
        # treated as unverified (0.0) rather than assumed safe.
        accepted = []
        for rule in raw_rules:
            confidence = rule.get("confidence", 0.0)
            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = 0.0
            if confidence >= self.min_confidence:
                accepted.append(rule)
            else:
                print(f"[REMEDIATION] Rejected low-confidence rule for '{category}' "
                      f"(confidence={confidence} < min={self.min_confidence}): {rule}")

        if not accepted:
            return None
        return accepted

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
            
            # Fetch a sample batch of up to 5 records for LLM synthesis
            sample_rows = df_run.limit(5).collect()
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



    def run(self):
        import pyspark.sql.functions as F
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
        total_quarantined = df_run.count()
        
        stats = {
            "total_quarantined": total_quarantined,
            "attempted": 0,
            "fixed": 0,
            "unfixable": 0,
            "categories": {},
            "model_used": os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
        }
        
        cat_keywords = {
            "null_values": "null_value",
            "type_mismatch": "type_mismatch",
            "format_errors": "format_error",
            "outliers": "expected"
        }

        all_synthesized_rules = []
        
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
            
            # Call Ollama/Groq to synthesize DSL rules
            rules = self.get_synthesized_dsl_rules(cat, items)
            if rules:
                all_synthesized_rules.extend(rules)
                stats["fixed"] += cat_count
                stats["categories"][cat]["fixed"] += cat_count
            else:
                stats["unfixable"] += cat_count

        if all_synthesized_rules:
            # Save to rule registries (ES and local JSON)
            save_remediation_rules(self.table_name, all_synthesized_rules)

        # Root Cause Fix: this was hardcoded to 0.90 whenever anything was "fixed",
        # regardless of what the model actually reported. Use the real average of the
        # confidence values on the rules that were actually accepted and applied.
        rule_confidences = [float(r.get("confidence", 0.0)) for r in all_synthesized_rules if "confidence" in r]
        stats["confidence_avg"] = round(sum(rule_confidences) / len(rule_confidences), 3) if rule_confidences else 0.0
        stats["duration_seconds"] = round(time.time() - start_time, 2)
        
        self._log_to_es(stats)
        
        return {
            "total": stats["total_quarantined"],
            "fixed": stats["fixed"],
            "unfixable": stats["unfixable"]
        }

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
        print(f"[REMEDIATION] Successfully generated and saved remediation rules for {result['fixed']}/{result['total']} records")
        sys.exit(0)
    else:
        print(f"[REMEDIATION] No remediation rules could be generated. {result['unfixable']} records remain in quarantine.")
        sys.exit(1)

if __name__ == "__main__":
    main()
