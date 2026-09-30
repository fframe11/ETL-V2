import sys
import argparse
import os

from sdoqap.common.settings import load_env_file
load_env_file(os.path.dirname(os.path.abspath(__file__)))

try:
    from api.app.api.config import get_required_env
except ModuleNotFoundError:
    # Fallback implementation when the 'api' package is unavailable (e.g., inside Docker container)
    def get_required_env(name: str) -> str:
        """Retrieve required environment variable or raise a clear error."""
        import os
        value = os.getenv(name)
        if value is None:
            raise RuntimeError(f"Missing required environment variable '{name}'. Set it in the environment.")
        return value

# Set default env values if not provided by OS environment or loaded .env file
os.environ.setdefault('ELASTICSEARCH_USER', 'elastic')
os.environ.setdefault('ELASTICSEARCH_HOST', 'localhost')
os.environ.setdefault('ELASTICSEARCH_PORT', '9200')
os.environ.setdefault('HDFS_URL', 'hdfs://namenode:9000')
os.environ.setdefault('N8N_WEBHOOK_URL', 'http://localhost:5678')
import json
import yaml
import subprocess

# Load HDFS configuration from yaml if available
_config_path = os.path.join(os.path.dirname(__file__), "config", "hdfs_config.yaml")
if os.path.isfile(_config_path):
    try:
        with open(_config_path) as f:
            _cfg = yaml.safe_load(f)
        HDFS_URL = _cfg.get("hdfs", {}).get("url", HDFS_URL)
    except Exception as e:
        print(f"Failed to load HDFS config: {e}")
from datetime import datetime, timedelta, timezone
import requests
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from run_support import EXIT_SKIPPED, Heartbeat, archive_paths, raw_read_path, should_optimize
from sdoqap.common.names import clean_column_name, normalize_name
from sdoqap.common.es import es_base_and_auth
from sdoqap.semantic.similarity import char_ngrams, hybrid_similarity, ngram_cosine
from sdoqap.common.ship import ship_package
import sdoqap.stages  # noqa: F401  (registers stages)
from sdoqap.pipeline.context import RunContext
from sdoqap.pipeline.registry import run_stages
from sdoqap.pipeline import plan

def get_elasticsearch_url():
    # Prefer full URL if provided via environment
    es_url = os.getenv("ELASTICSEARCH_URL")
    if es_url:
        return es_url
    # Otherwise construct from components, using defaults where appropriate
    es_user = get_required_env("ELASTICSEARCH_USER")
    es_pass = get_required_env("ELASTICSEARCH_PASSWORD")
    es_host = os.getenv("ELASTICSEARCH_HOST", "localhost")
    es_port = os.getenv("ELASTICSEARCH_PORT", "9200")
    return f"http://{es_user}:{es_pass}@{es_host}:{es_port}"

ELASTICSEARCH_URL = get_elasticsearch_url()
HDFS_URL = get_required_env("HDFS_URL")

def get_spark_session(app_name):
    builder = (
        SparkSession.builder
        .appName(app_name)
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
        .config("spark.executor.memory", "2g")
        .config("spark.executor.cores", "2")
        .config("spark.sql.adaptive.enabled", "true")
        .config("spark.sql.shuffle.partitions", "200")
        .config("spark.dynamicAllocation.enabled", "true")
        .config("spark.dynamicAllocation.minExecutors", "1")
        .config("spark.dynamicAllocation.maxExecutors", "4")
        .config("spark.hadoop.fs.defaultFS", HDFS_URL)
        .config("spark.hadoop.fs.hdfs.impl", "org.apache.hadoop.hdfs.DistributedFileSystem")
        .config("spark.hadoop.fs.file.impl", "org.apache.hadoop.fs.LocalFileSystem")
        .config("spark.databricks.delta.schema.autoMerge.enabled", "true")
        .config("spark.databricks.delta.properties.defaults.autoOptimize.optimizeWrite", "true")
        .config("spark.databricks.delta.properties.defaults.autoOptimize.autoCompact", "true")
    )
    if "SPARK_HOME" not in os.environ:
        builder = builder.master("local[*]")
        builder = builder.config("spark.driver.host", "127.0.0.1") \
                         .config("spark.driver.bindAddress", "127.0.0.1")
                         
    return builder.getOrCreate()

def log_to_elasticsearch(index_name, doc):
    """Writes metadata document directly to Elasticsearch."""
    url = f"{ELASTICSEARCH_URL}/{index_name}/_doc"
    headers = {"Content-Type": "application/json"}
    
    # Parse basic auth from URL if present (e.g., http://user:pass@host:port)
    auth = None
    from urllib.parse import urlparse
    parsed = urlparse(ELASTICSEARCH_URL)
    if parsed.username and parsed.password:
        auth = (parsed.username, parsed.password)
        # Remove credentials from the URL used for the request to avoid exposure
        base_url = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
        url = f"{base_url}/{index_name}/_doc"

    try:
        res = requests.post(url, headers=headers, auth=auth, data=json.dumps(doc), timeout=10)
        res.raise_for_status()
        print(f"Metrics logged to Elasticsearch index '{index_name}' successfully.")
    except Exception as e:
        print(f"Error logging to Elasticsearch: {e}")
        try:
            if 'res' in locals() and hasattr(res, 'text'):
                print(f"ES Error Response: {res.text}")
        except Exception:
            pass

N8N_WEBHOOK_URL = get_required_env("N8N_WEBHOOK_URL")

# ─── FIX 2A: Distributed Lock via Elasticsearch with Self-Healing ────────────────
def acquire_lock(table_name: str, run_id: str, force: bool = False) -> bool:
    """Atomically lock a table before Spark starts. Uses ES op_type=create.
    If lock exists (409 Conflict), checks expires_at. If expired, force overwrites it
    using Optimistic Concurrency Control (seq_no & primary_term) to ensure atomicity."""
    from urllib.parse import urlparse
    from datetime import timezone
    base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
    lock_doc = {
        "table_name": table_name,
        "run_id": run_id,
        "status": "RUNNING",
        "locked_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    }
    try:
        url = f"{base_url}/sdoqap_run_locks/_doc/{table_name}?op_type=create"
        res = requests.put(url, json=lock_doc, auth=auth, timeout=5)
        if res.status_code == 201:
            print(f"[LOCK] Acquired lock for '{table_name}' (run_id={run_id})")
            return True
        elif res.status_code == 409:
            # Lock already exists
            if force:
                # Force overwrite the existing lock
                print(f"[LOCK] Force flag enabled. Overwriting existing lock for '{table_name}'.")
                lock_url = f"{base_url}/sdoqap_run_locks/_doc/{table_name}"
                get_res = requests.get(lock_url, auth=auth, timeout=5)
                if get_res.status_code == 200:
                    existing = get_res.json()
                    seq_no = existing.get("_seq_no")
                    primary_term = existing.get("_primary_term")
                    occ_url = f"{lock_url}?if_seq_no={seq_no}&if_primary_term={primary_term}"
                    res = requests.put(occ_url, json=lock_doc, auth=auth, timeout=5)
                    if res.status_code in [200, 201]:
                        print(f"[LOCK] Forced lock acquisition for '{table_name}'.")
                        return True
                # If unable to force, fall through to abort
                print(f"[LOCK] Failed to force lock for '{table_name}'. Aborting.")
                return False
            else:
                # Normal behavior: check expiration
                lock_url = f"{base_url}/sdoqap_run_locks/_doc/{table_name}"
                get_res = requests.get(lock_url, auth=auth, timeout=5)
                if get_res.status_code == 200:
                    existing = get_res.json()
                    expires_at_str = existing.get("_source", {}).get("expires_at")
                    if expires_at_str:
                        expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                        if datetime.now(timezone.utc) > expires_at:
                            print(f"[LOCK] Previous lock for '{table_name}' expired. Overwriting...")
                            seq_no = existing.get("_seq_no")
                            primary_term = existing.get("_primary_term")
                            occ_url = f"{lock_url}?if_seq_no={seq_no}&if_primary_term={primary_term}"
                            res = requests.put(occ_url, json=lock_doc, auth=auth, timeout=5)
                            if res.status_code in [200, 201]:
                                print(f"[LOCK] Re-acquired expired lock for '{table_name}'.")
                                return True
                print(f"[LOCK] Table '{table_name}' already locked. Aborting duplicate run.")
                return False
        return False
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as conn_err:
        # Root Cause Fix: a quality-assurance system must fail CLOSED when its coordination
        # store is unreachable, not bypass mutual exclusion. Bypassing here was exactly the
        # condition most likely to let two runs write to the same Delta table concurrently.
        print(f"[LOCK] Elasticsearch is offline ({conn_err}). Aborting (fail-closed) — cannot safely coordinate concurrent runs.")
        return False
    except Exception as e:
        print(f"[LOCK] Lock acquisition failed: {e}. Aborting (fail-safe).")
        return False

def release_lock(table_name: str):
    """Release the distributed lock for a table after job completes or fails."""
    try:
        from urllib.parse import urlparse
        base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
        requests.delete(f"{base_url}/sdoqap_run_locks/_doc/{table_name}", auth=auth, timeout=5)
        print(f"[LOCK] Released lock for '{table_name}'.")
    except Exception as e:
        print(f"[LOCK] Failed to release lock: {e}")

def renew_lock(table_name: str, run_id: str, minutes: int = 15) -> None:
    """Push expires_at forward, but only while the lock still belongs to this run."""
    from urllib.parse import urlparse
    from datetime import timezone
    base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
    body = {
        "script": {
            "source": "if (ctx._source.run_id == params.run_id) { ctx._source.expires_at = params.exp } else { ctx.op = 'noop' }",
            "params": {"run_id": run_id,
                       "exp": (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()},
        }
    }
    requests.post(f"{base_url}/sdoqap_run_locks/_update/{table_name}", json=body, auth=auth, timeout=5)


# ─── DATA-DRIVEN STANDARDIZATION RULES (from Elasticsearch) ───────────────
def _load_standardization_rules(table_name: str) -> dict:
    """Loads standardization_rules for a table from the schema registry in ES.
    Returns a dict like: { "column_name": { "categories": { "Cat": ["kw1", ...] }, "fallback": "Other" } }
    Returns empty dict if no rules are defined — the system simply skips standardization.
    No hardcoding. All rules are data."""
    from urllib.parse import urlparse
    base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)

    url = f"{base_url}/sdoqap_schema_registry/_doc/{table_name}"
    try:
        res = requests.get(url, auth=auth, timeout=5)
        if res.status_code == 200:
            doc = res.json().get("_source", {})
            rules = doc.get("standardization_rules", {})
            if rules:
                print(f"[STANDARDIZATION] Loaded {len(rules)} standardization rule(s) for '{table_name}' from ES registry.")
            return rules
    except Exception as e:
        print(f"[STANDARDIZATION] Could not load rules from ES: {e}")

    # Fallback: check local schema_registry.json
    try:
        registry_file = "/opt/spark-apps/schema_registry.json"
        if os.path.exists(registry_file):
            with open(registry_file, "r", encoding="utf-8") as f:
                local_reg = json.load(f)
                normalized = normalize_name(table_name)
                for tbl_name, spec in local_reg.items():
                    if normalize_name(tbl_name) == normalized:
                        return spec.get("standardization_rules", {})
    except Exception:
        pass

    return {}

# ─── DETERMINISTIC DSL REMEDIATION ENGINE (Layer 3) ─────────────────────────
LATEST_FALLBACK_METRICS = {}

def _pop_fallback_metrics():
    global LATEST_FALLBACK_METRICS
    metrics = dict(LATEST_FALLBACK_METRICS)
    LATEST_FALLBACK_METRICS = {}
    return metrics

def create_standardize_udf(categories: dict, fallback: str):
    from pyspark.sql.types import StringType
    from pyspark.sql.functions import udf

    norm_categories = {str(k).lower().strip(): str(v) for k, v in categories.items()}

    def standardize_val(val):
        if val is None:
            if fallback == "original":
                return None
            return fallback
        
        val_str = str(val).strip()
        val_lower = val_str.lower()

        # 1. Memory Mapping: Exact Match
        if val_lower in norm_categories:
            return norm_categories[val_lower]

        # 2. Semantic Mapping: Substring/Keyword Check
        for key, target_val in norm_categories.items():
            if len(key) >= 3 and key in val_lower:
                return target_val
            if len(val_lower) >= 3 and val_lower in key:
                return target_val

        # 3. Fallback Mapping
        if fallback == "original":
            return val_str
        return fallback

    return udf(standardize_val, StringType())

class LocalSemanticStandardizer:
    def __init__(self, categories: dict, threshold: float, fallback: str):
        self.threshold = threshold
        self.fallback = fallback
        self.norm_categories = {str(k).lower().strip(): str(v) for k, v in categories.items()}
        
        self.first_token_to_keys = {}
        self.word_token_to_keys = {}
        for key in self.norm_categories.keys():
            words = str(key).split()
            if words:
                self.first_token_to_keys.setdefault(words[0], set()).add(key)
                for word in words:
                    if len(word) >= 2:
                        self.word_token_to_keys.setdefault(word, set()).add(key)

        self.ngram_to_keys = {}
        for key in self.norm_categories.keys():
            for ng in self.get_char_ngrams(key):
                self.ngram_to_keys.setdefault(ng, set()).add(key)

    def get_char_ngrams(self, s, n=2):
        return char_ngrams(s, n)

    def n_gram_cosine_similarity(self, s1, s2):
        return ngram_cosine(s1, s2)

    def hybrid_similarity(self, s1, s2):
        return hybrid_similarity(s1, s2)

    def standardize(self, val):
        if val is None:
            if self.fallback == "original":
                return (None, 0.0)
            return (self.fallback, 0.0)
            
        val_str = str(val).strip()
        val_lower = val_str.lower()
        
        if val_lower in self.norm_categories:
            return (self.norm_categories[val_lower], 1.0)
            
        val_words = val_lower.split()
        first_token = val_words[0] if val_words else ""
        
        candidates = set()
        
        if first_token and first_token in self.first_token_to_keys:
            candidates.update(self.first_token_to_keys[first_token])
            
        if len(candidates) < 5:
            for token in val_words:
                if len(token) >= 2 and token in self.word_token_to_keys:
                    candidates.update(self.word_token_to_keys[token])
                    
        if not candidates or len(candidates) < 3:
            val_ngrams = self.get_char_ngrams(val_lower)
            for ng in val_ngrams:
                if ng in self.ngram_to_keys:
                    candidates.update(self.ngram_to_keys[ng])
                    
        if not candidates:
            if self.fallback == "original":
                return (val_str, 0.0)
            return (self.fallback, 0.0)
            
        best_match = None
        best_score = -1.0
        
        for key in candidates:
            target_val = self.norm_categories[key]
            score = self.hybrid_similarity(val_lower, key)
            if score > best_score:
                best_score = score
                best_match = target_val
                
        if best_score >= self.threshold:
            return (best_match, float(best_score))
            
        if self.fallback == "original":
            return (val_str, float(best_score) if best_score > 0 else 0.0)
        return (self.fallback, float(best_score) if best_score > 0 else 0.0)

def apply_optimized_semantic_standardize(df, col_name, target_col, categories, threshold, fallback, version="v1.0", low_confidence_policy="keep_original", semantic_type="rule_based"):
    from pyspark.sql import functions as F
    
    # 1. Get unique values of the input column, filtering out nulls
    unique_df = df.select(col_name).distinct().filter(F.col(col_name).isNotNull())
    
    # 2. Split unique values into exact matches and fuzzy matches
    spark = df.sparkSession
    mapping_data = [(k, v) for k, v in categories.items()]
    score_col = f"{target_col}_score"
    method_col = f"{target_col}_method"
    version_col = f"{target_col}_version"
    processed_at_col = f"{target_col}_processed_at"
    semantic_type_col = f"{target_col}_semantic_type"
    
    if mapping_data:
        # Convert categories dictionary to a Spark DataFrame for joining
        # Lowercase the key for case-insensitive matching
        mapping_df = spark.createDataFrame(mapping_data, ["raw_key", "mapped_val"])
        mapping_df = mapping_df.withColumn("raw_key_lower", F.lower(F.trim(F.col("raw_key")))).drop("raw_key")
        
        # Left join unique_df with mapping_df
        unique_df_lower = unique_df.withColumn("raw_val_lower", F.lower(F.trim(F.col(col_name))))
        joined_unique = unique_df_lower.join(F.broadcast(mapping_df), unique_df_lower.raw_val_lower == mapping_df.raw_key_lower, "left")
        
        # Split into exact matches (mapped_val is not null) and fuzzy matches (mapped_val is null)
        exact_matches = joined_unique.filter(F.col("mapped_val").isNotNull()) \
                                     .select(
                                         col_name, 
                                         F.col("mapped_val").alias(target_col), 
                                         F.lit(1.0).alias(score_col),
                                         F.lit("exact").alias(method_col),
                                         F.lit(version).alias(version_col),
                                         F.current_timestamp().cast("string").alias(processed_at_col),
                                         F.lit(semantic_type).alias(semantic_type_col)
                                     )
                                     
        fuzzy_needed = joined_unique.filter(F.col("mapped_val").isNull()).select(col_name)
    else:
        exact_matches = None
        fuzzy_needed = unique_df
        
    # 3. Apply UDF ONLY on the fuzzy_needed subset
    bc_categories = spark.sparkContext.broadcast(categories)
    semantic_udf = create_semantic_standardize_udf(bc_categories.value, threshold, fallback, version, low_confidence_policy, semantic_type)
    
    struct_col = f"{target_col}_struct"
    
    # Check if we have records that require fuzzy match
    fuzzy_count = 0
    try:
        # Limit to check non-emptiness without full count overhead
        fuzzy_count = len(fuzzy_needed.limit(1).collect())
    except Exception:
        pass
        
    if fuzzy_count > 0:
        fuzzy_mapped = fuzzy_needed.withColumn(struct_col, semantic_udf(F.col(col_name))) \
                                   .withColumn(target_col, F.col(f"{struct_col}.value")) \
                                   .withColumn(score_col, F.col(f"{struct_col}.score")) \
                                   .withColumn(method_col, F.col(f"{struct_col}.match_method")) \
                                   .withColumn(version_col, F.col(f"{struct_col}.mapping_version")) \
                                   .withColumn(processed_at_col, F.col(f"{struct_col}.processed_at")) \
                                   .withColumn(semantic_type_col, F.col(f"{struct_col}.semantic_type")) \
                                   .drop(struct_col)
    else:
        # Create empty DataFrame with same schema
        from pyspark.sql.types import StructType, StructField, StringType, DoubleType
        schema = StructType([
            StructField(col_name, StringType(), True),
            StructField(target_col, StringType(), True),
            StructField(score_col, DoubleType(), True),
            StructField(method_col, StringType(), True),
            StructField(version_col, StringType(), True),
            StructField(processed_at_col, StringType(), True),
            StructField(semantic_type_col, StringType(), True)
        ])
        fuzzy_mapped = spark.createDataFrame([], schema)
        
    # 4. Combine exact matches and fuzzy matches
    if exact_matches:
        unique_mapped = exact_matches.unionByName(fuzzy_mapped)
    else:
        unique_mapped = fuzzy_mapped
        
    # 5. Left join the combined unique mapping table back to the main dataframe
    df_joined = df.join(F.broadcast(unique_mapped), on=col_name, how="left")
    
    # Handle null input values or unjoined fallback
    df_joined = df_joined.withColumn(
        target_col,
        F.when(F.col(col_name).isNull(), F.lit(fallback if fallback != "original" else None))
         .otherwise(F.coalesce(F.col(target_col), F.lit(fallback if fallback != "original" else None)))
    ).withColumn(
        score_col,
        F.when(F.col(col_name).isNull(), F.lit(0.0))
         .otherwise(F.coalesce(F.col(score_col), F.lit(0.0)))
    ).withColumn(
        method_col,
        F.when(F.col(col_name).isNull(), F.lit("fallback"))
         .otherwise(F.coalesce(F.col(method_col), F.lit("fallback")))
    ).withColumn(
        version_col,
        F.when(F.col(col_name).isNull(), F.lit(version))
         .otherwise(F.coalesce(F.col(version_col), F.lit(version)))
    ).withColumn(
        processed_at_col,
        F.when(F.col(col_name).isNull(), F.current_timestamp().cast("string"))
         .otherwise(F.coalesce(F.col(processed_at_col), F.current_timestamp().cast("string")))
    ).withColumn(
        semantic_type_col,
        F.when(F.col(col_name).isNull(), F.lit(semantic_type))
         .otherwise(F.coalesce(F.col(semantic_type_col), F.lit(semantic_type)))
    )
    return df_joined

def create_semantic_standardize_udf(categories: dict, threshold: float, fallback: str, version: str = "v1.0", low_confidence_policy: str = "map_to_fallback", semantic_type: str = "rule_based"):
    from pyspark.sql.types import StructType, StructField, StringType, DoubleType
    from pyspark.sql.functions import udf

    norm_categories = {str(k).lower().strip(): str(v) for k, v in categories.items()}
    _local_cache = {}

    get_char_ngrams = char_ngrams
    n_gram_cosine_similarity = ngram_cosine

    # 1. Build Token-based Indexes for Multi-Stage Candidate Pruning
    first_token_to_keys = {}
    word_token_to_keys = {}
    for key in norm_categories.keys():
        words = str(key).split()
        if words:
            first_token_to_keys.setdefault(words[0], set()).add(key)
            for word in words:
                if len(word) >= 2:
                    word_token_to_keys.setdefault(word, set()).add(key)

    # 2. Build Inverted Character N-gram Index (typo fallback)
    ngram_to_keys = {}
    for key in norm_categories.keys():
        for ng in get_char_ngrams(key):
            ngram_to_keys.setdefault(ng, set()).add(key)

    def semantic_standardize_val(val):
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).isoformat()
        try:
            if val is None:
                if low_confidence_policy == "keep_original":
                    return (None, 0.0, "fallback", version, ts, semantic_type)
                elif low_confidence_policy == "null":
                    return (None, 0.0, "fallback", version, ts, semantic_type)
                else:
                    return (fallback if fallback != "original" else None, 0.0, "fallback", version, ts, semantic_type)
                
            val_str = str(val).strip()
            val_lower = val_str.lower()
            
            # Check local worker cache
            if val_lower in _local_cache:
                return _local_cache[val_lower]
                
            if val_lower in norm_categories:
                res = (norm_categories[val_lower], 1.0, "exact", version, ts, semantic_type)
                _local_cache[val_lower] = res
                return res
                
            val_words = val_lower.split()
            first_token = val_words[0] if val_words else ""
            
            # Multi-stage Candidate Pruning
            candidates = set()
            match_method = "fuzzy_token"
            
            # Stage 1: First Token Filter
            if first_token and first_token in first_token_to_keys:
                candidates.update(first_token_to_keys[first_token])
                
            # Stage 2: Inverted Word Token Index (expand search if candidates < 5)
            if len(candidates) < 5:
                match_method = "fuzzy_ngram"
                for token in val_words:
                    if len(token) >= 2 and token in word_token_to_keys:
                        candidates.update(word_token_to_keys[token])
                        
            # Stage 3: Character N-gram Index (expand search if candidates < 3, robust to typos)
            if not candidates or len(candidates) < 3:
                match_method = "fuzzy_ngram"
                val_ngrams = get_char_ngrams(val_lower)
                for ng in val_ngrams:
                    if ng in ngram_to_keys:
                        candidates.update(ngram_to_keys[ng])
                        
            if not candidates:
                if low_confidence_policy == "keep_original":
                    res = (val_str, 0.0, "fallback", version, ts, semantic_type)
                elif low_confidence_policy == "null":
                    res = (None, 0.0, "fallback", version, ts, semantic_type)
                else:
                    res = (fallback if fallback != "original" else val_str, 0.0, "fallback", version, ts, semantic_type)
                _local_cache[val_lower] = res
                return res
                
            best_match = None
            best_score = -1.0
            
            for key in candidates:
                target_val = norm_categories[key]
                score = hybrid_similarity(val_lower, key)
                if score > best_score:
                    best_score = score
                    best_match = target_val
                    
            if best_score >= threshold:
                res = (best_match, float(best_score), match_method, version, ts, semantic_type)
            else:
                if low_confidence_policy == "keep_original":
                    res = (val_str, float(best_score) if best_score > 0 else 0.0, "fallback", version, ts, semantic_type)
                elif low_confidence_policy == "null":
                    res = (None, float(best_score) if best_score > 0 else 0.0, "fallback", version, ts, semantic_type)
                else:
                    res = (fallback if fallback != "original" else val_str, float(best_score) if best_score > 0 else 0.0, "fallback", version, ts, semantic_type)
                
            _local_cache[val_lower] = res
            return res
        except Exception as udf_err:
            import traceback
            with open("udf_error.log", "a", encoding="utf-8") as f_err:
                f_err.write(f"ERROR on val={val}: {udf_err}\n")
                traceback.print_exc(file=f_err)
            raise udf_err

    struct_schema = StructType([
        StructField("value", StringType(), True),
        StructField("score", DoubleType(), True),
        StructField("match_method", StringType(), True),
        StructField("mapping_version", StringType(), True),
        StructField("processed_at", StringType(), True),
        StructField("semantic_type", StringType(), True)
    ])

    return udf(semantic_standardize_val, struct_schema)

def _update_standardization_memory(table_name: str, col_name: str, raw_val: str, mapped_val: str):
    """Adds a new category mapping to memory registry (ES + rules_config.json) for the given table/column."""
    import json
    import os
    import requests
    
    # 1. Update rules_config.json on disk
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules_config.json")
    if not os.path.exists(config_path):
        config_path = "/opt/spark-apps/rules_config.json"
        if not os.path.exists(config_path):
            config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules_config.json")
            
    try:
        config = {}
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
                
        table_rules = config.setdefault(table_name, {})
        remediation_rules = table_rules.setdefault("remediation_rules", [])
        
        # Find semantic_standardize or auto_strategy rule for this column
        target_rule = None
        for r in remediation_rules:
            if r.get("column") == col_name and r.get("type") in ("semantic_standardize", "auto_strategy"):
                target_rule = r
                break
                
        if not target_rule:
            target_rule = {
                "column": col_name,
                "type": "semantic_standardize",
                "categories": {},
                "fallback": "อื่นๆ",
                "threshold": 0.85
            }
            remediation_rules.append(target_rule)
            
        categories = target_rule.setdefault("categories", {})
        norm_key = str(raw_val).lower().strip()
        if norm_key not in categories:
            categories[norm_key] = mapped_val
            
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
                f.write("\n")
            print(f"[AUTO-LEARN] Saved new mapping '{norm_key}' -> '{mapped_val}' to rules_config.json")
            
            # 2. Update Elasticsearch index sdoqap_rules_registry
            try:
                from urllib.parse import urlparse
                base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
                
                url_table = f"{base_url}/sdoqap_rules_registry/_doc/{table_name}"
                requests.post(url_table, auth=auth, json=table_rules, timeout=3)
                print(f"[AUTO-LEARN] Updated ES registry for table '{table_name}'")
            except Exception as es_err:
                print(f"[AUTO-LEARN] Warning: failed to sync memory to ES: {es_err}")
    except Exception as e:
        print(f"[AUTO-LEARN] Failed to update standardization memory: {e}")

def _process_standardize_learning(df, col_name, target_col, score_col, fallback, threshold, table_name, rules_dict, categories):
    global LATEST_FALLBACK_METRICS
    from datetime import datetime, timezone
    import requests
    from pyspark.sql import functions as F
    
    # 1. Group by the raw column and count, then collect to driver.
    # This does NOT execute any UDFs inside Spark, making it 100% stable and fast!
    try:
        raw_counts_df = df.groupBy(col_name).count()
        raw_counts_rows = raw_counts_df.orderBy(F.col("count").desc()).collect()
    except Exception as count_err:
        print(f"[AUTO-LEARN] Warning: failed to collect raw counts for standardization learning: {count_err}")
        return
        
    if not raw_counts_rows:
        return

    # 2. Instantiate LocalSemanticStandardizer
    local_std = LocalSemanticStandardizer(categories, threshold, fallback)
    
    # 3. Calculate metrics and build unmapped/learning suggestions locally
    total_count = 0
    fallback_count = 0
    total_confidence = 0.0
    low_conf_count = 0
    
    unmapped_list = []
    new_unseen_count = 0
    
    mapping_override_rate = 0.0
    try:
        from urllib.parse import urlparse
        base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
        
        res_reviews = requests.post(f"{base_url}/sdoqap_mapping_reviews/_search", auth=auth, json={
            "size": 0,
            "aggs": {
                "total_reviews": {"value_count": {"field": "is_override"}},
                "overrides": {"filter": {"term": {"is_override": True}}}
            }
        }, timeout=2)
        if res_reviews.status_code == 200:
            agg_data = res_reviews.json().get("aggregations", {})
            total_revs = agg_data.get("total_reviews", {}).get("value") or 0
            ovrs = agg_data.get("overrides", {}).get("doc_count") or 0
            if total_revs > 0:
                mapping_override_rate = (ovrs / total_revs) * 100.0
    except Exception:
        pass

    for row in raw_counts_rows:
        raw_val = row[col_name]
        freq = int(row["count"])
        total_count += freq
        
        # Local evaluation
        mapped_val, score = local_std.standardize(raw_val)
        total_confidence += score * freq
        
        if mapped_val == fallback:
            fallback_count += freq
            
        if score < 0.85 or mapped_val == fallback:
            low_conf_count += freq
            
        if not raw_val or not str(raw_val).strip():
            continue
            
        raw_val_str = str(raw_val).strip()
        if score == 1.0:
            continue
            
        if score > 0.90:
            _update_standardization_memory(table_name, col_name, raw_val_str, mapped_val)
            print(f"[AUTO-LEARN] Auto-learned mapping: '{raw_val_str}' -> '{mapped_val}' (confidence={score:.2f})")
        elif score > 0.60:
            unmapped_list.append({"term": raw_val_str, "count": freq})
            new_unseen_count += 1
            priority = freq * (1.0 - score)
            try:
                log_to_elasticsearch("sdoqap_unmapped_terms", {
                    "table_name": table_name,
                    "column_name": col_name,
                    "unmapped_value": raw_val_str,
                    "suggested_category": mapped_val,
                    "confidence": score,
                    "frequency": freq,
                    "priority": priority,
                    "status": "PENDING_REVIEW",
                    "detected_at": datetime.now(timezone.utc).isoformat()
                })
            except Exception as e:
                print(f"[AUTO-LEARN] Failed to log Level 2 unmapped term: {e}")
        else:
            unmapped_list.append({"term": raw_val_str, "count": freq})
            new_unseen_count += 1
            priority = freq * (1.0 - score)
            try:
                log_to_elasticsearch("sdoqap_unmapped_terms", {
                    "table_name": table_name,
                    "column_name": col_name,
                    "unmapped_value": raw_val_str,
                    "suggested_category": "อื่นๆ",
                    "confidence": score,
                    "frequency": freq,
                    "priority": priority,
                    "status": "PENDING_REVIEW",
                    "detected_at": datetime.now(timezone.utc).isoformat()
                })
            except Exception as e:
                print(f"[AUTO-LEARN] Failed to log Level 3 unmapped term: {e}")
                
    fallback_rate = (fallback_count / total_count) * 100.0 if total_count > 0 else 0.0
    match_rate = 100.0 - fallback_rate
    avg_confidence = (total_confidence / total_count) if total_count > 0 else 0.0
    concept_drift_rate = (low_conf_count / total_count) * 100.0 if total_count > 0 else 0.0
    
    LATEST_FALLBACK_METRICS[target_col] = {
        "fallback_value": fallback,
        "fallback_count": fallback_count,
        "fallback_rate": fallback_rate,
        "match_rate": match_rate,
        "avg_confidence": avg_confidence * 100.0,
        "concept_drift_rate": concept_drift_rate,
        "mapping_override_rate": mapping_override_rate,
        "new_unseen_values": new_unseen_count,
        "unmapped_samples": unmapped_list[:20]
    }
    
    print(f"[DSL ENGINE] Standardized stats for '{target_col}': Match={match_rate:.2f}%, Fallback={fallback_rate:.2f}%, AvgConf={avg_confidence * 100.0:.2f}%, ConceptDrift={concept_drift_rate:.2f}%")

def apply_dsl_remediation_rules(df, rules_dict: dict):
    """Applies declarative DSL remediation rules natively to PySpark DataFrame.
    Guarantees 100% deterministic execution and avoids executing arbitrary python code.
    """
    global LATEST_FALLBACK_METRICS
    import re
    from pyspark.sql import functions as F
    
    # Early idempotency check: exit if dataset has already been processed with the same execution_id
    execution_id = rules_dict.get("execution_id")
    if execution_id and "_meta" in df.columns:
        try:
            first_row = df.select("_meta.execution_id").first()
            if first_row and first_row[0] == execution_id:
                print(f"[DSL ENGINE] [IDEMPOTENCY] Skip processing: Dataset already processed with execution_id '{execution_id}'.")
                return df
        except Exception as e:
            print(f"[DSL ENGINE] [IDEMPOTENCY] Non-fatal check error: {e}")
    
    remediation_rules = rules_dict.get("remediation_rules", [])
    if not remediation_rules:
        return df
        
    import uuid
    schema_mode = rules_dict.get("schema_mode", "strict")
    execution_id = rules_dict.get("execution_id", str(uuid.uuid4()))
    processed_cols = []
    print(f"[DSL ENGINE] Applying {len(remediation_rules)} deterministic remediation rule(s) (schema_mode={schema_mode}, execution_id={execution_id})...")
    for rule in remediation_rules:
        col_name = rule.get("column")
        r_type = rule.get("type")
        
        if r_type == "fillna":
            val = rule.get("value")
            if col_name in df.columns:
                df = df.withColumn(col_name, F.coalesce(F.col(col_name), F.lit(val)))
                print(f"[DSL ENGINE] Applied fillna for column '{col_name}' with value '{val}'")
                
        elif r_type == "calculate":
            expr_str = rule.get("expression")
            cond_str = rule.get("condition")
            if not expr_str:
                continue
                
            # Security verification: only allow alphanumeric, spaces, and math operators
            if not re.match(r'^[\w\s\+\-\*/\(\)]+$', expr_str):
                print(f"[DSL ENGINE] Security Warning: Skipped invalid calculate expression: {expr_str}")
                continue
                
            if col_name not in df.columns:
                continue
                
            # Apply condition if present
            if cond_str:
                if not re.match(r'^[\w\s\+\-\*/\(\)<>=!]+$', cond_str):
                    print(f"[DSL ENGINE] Security Warning: Skipped invalid condition: {cond_str}")
                    continue
                df = df.withColumn(
                    col_name,
                    F.when(F.expr(cond_str), F.expr(expr_str)).otherwise(F.col(col_name))
                )
                print(f"[DSL ENGINE] Applied conditional calculation for '{col_name}': if '{cond_str}' then '{expr_str}'")
            else:
                df = df.withColumn(col_name, F.expr(expr_str))
                print(f"[DSL ENGINE] Applied calculation for '{col_name}': '{expr_str}'")
                
        elif r_type == "cast":
            to_type = rule.get("to")
            if col_name in df.columns and to_type in ("int", "integer", "double", "float", "string", "timestamp"):
                df = df.withColumn(col_name, F.col(col_name).cast(to_type))
                print(f"[DSL ENGINE] Applied cast for column '{col_name}' to '{to_type}'")
                
        elif r_type == "standardize":
            categories = rule.get("categories")
            fallback = rule.get("fallback", "original")
            keep_orig = rule.get("keep_original", True)
            out_col = rule.get("output_column", col_name)
            if not categories or not isinstance(categories, dict):
                print(f"[DSL ENGINE] Skipped invalid standardize rule for '{col_name}': categories must be a dictionary.")
                continue
            if col_name in df.columns:
                target_col = out_col if keep_orig else col_name
                standardize_udf = create_standardize_udf(categories, fallback)
                df = df.withColumn(target_col, standardize_udf(F.col(col_name)))
                print(f"[DSL ENGINE] Applied adaptive standardization mapping for '{col_name}' -> '{target_col}'")
                
        elif r_type == "semantic_standardize":
            categories = rule.get("categories")
            threshold = float(rule.get("threshold", 0.85))
            fallback = rule.get("fallback", "original")
            keep_orig = rule.get("keep_original", True)
            out_col = rule.get("output_column", f"{col_name}_semantic")
            if not categories or not isinstance(categories, dict):
                print(f"[DSL ENGINE] Skipped invalid semantic_standardize rule for '{col_name}': categories must be a dictionary.")
                continue
            if col_name in df.columns:
                target_col = out_col if keep_orig else col_name
                score_col = f"{target_col}_score"
                method_col = f"{target_col}_method"
                version_col = f"{target_col}_version"
                processed_at_col = f"{target_col}_processed_at"
                semantic_type_col = f"{target_col}_semantic_type"
                version = rule.get("version", "v1.0")
                
                # Check Idempotency Guarantee
                overwrite_strategy = rule.get("overwrite_strategy", "skip_if_processed")
                if overwrite_strategy == "skip_if_processed":
                    if f"_raw_{col_name}" in df.columns or f"_semantic_{col_name}" in df.columns:
                        print(f"[DSL ENGINE] Column '{col_name}' already processed in a previous execution. Skipping due to skip_if_processed idempotency policy.")
                        continue
                
                # Extract Lineage Configurations
                low_confidence_policy = rule.get("low_confidence_policy", "map_to_fallback")
                semantic_type = rule.get("semantic_type", "rule_based")
                dry_run = rules_dict.get("dry_run", False)
                
                output_mode = rule.get("output_mode", "enriched")  # Default to enriched for semantic rules to avoid data loss
                if dry_run:
                    print(f"[DSL ENGINE] [DRY RUN] Overriding output mode to 'full' for column '{col_name}' to prevent data modification.")
                    output_mode = "full"
                elif schema_mode == "strict" and output_mode in ("enriched", "full"):
                    print(f"[SCHEMA GUARD] [WARN] Schema mode is set to 'strict'. Overriding output mode from '{output_mode}' to 'semantic_overwrite' for column '{col_name}' to prevent schema changes. In-place values will be overwritten.")
                    output_mode = "semantic_overwrite"
                
                if output_mode == "clean_only":
                    # Just trim, lowercase, and handle null fallback in-place (Syntax cleaning only)
                    df = df.withColumn(
                        col_name,
                        F.when(F.col(col_name).isNull(), F.lit(fallback if fallback != "original" else None))
                         .otherwise(F.lower(F.trim(F.col(col_name))))
                    )
                    print(f"[DSL ENGINE] Applied 'clean_only' syntactic cleaning on column '{col_name}' (Semantic mapping bypassed).")
                else:
                    # Track processed columns for lineage auditing
                    processed_cols.append(col_name)
                    # Apply optimized broadcast exact-match + fuzzy UDF on unique values
                    df = apply_optimized_semantic_standardize(
                        df, col_name, target_col, categories, threshold, fallback, version,
                        low_confidence_policy=low_confidence_policy, semantic_type=semantic_type
                    )
                    print(f"[DSL ENGINE] Applied optimized semantic standardization mapping for '{col_name}' -> '{target_col}' with threshold={threshold} (version={version})")
                    
                    try:
                        table_name = rules_dict.get("table_name", "unknown")
                        _process_standardize_learning(df, col_name, target_col, score_col, fallback, threshold, table_name, rules_dict, categories)
                    except Exception as fe:
                        print(f"[DSL ENGINE] Non-fatal error calculating fallback rate: {fe}")

                    if output_mode == "enriched":
                        # Ensure original column is syntactically cleaned
                        df = df.withColumn(col_name, F.lower(F.trim(F.col(col_name))))
                        # Nest semantic fields into namespace-isolated struct or JSON
                        struct_name = f"_semantic_{col_name}"
                        struct_expr = F.struct(
                            F.col(target_col).alias("category"),
                            F.col(score_col).alias("confidence"),
                            F.col(method_col).alias("method"),
                            F.col(version_col).alias("version"),
                            F.col(processed_at_col).alias("processed_at"),
                            F.col(semantic_type_col).alias("semantic_type")
                        )
                        enriched_format = rule.get("enriched_format", "struct")
                        if enriched_format == "json":
                            df = df.withColumn(struct_name, F.to_json(struct_expr))
                            print(f"[DSL ENGINE] Semantic results nested under namespace '{struct_name}' in JSON format.")
                        else:
                            df = df.withColumn(struct_name, struct_expr)
                            print(f"[DSL ENGINE] Semantic results nested under namespace '{struct_name}' in Struct format.")
                            
                        df = df.drop(target_col, score_col, method_col, version_col, processed_at_col, semantic_type_col)
                    elif output_mode == "semantic_overwrite":
                        preserve_raw = rule.get("preserve_raw", True)
                        if preserve_raw:
                            if schema_mode == "evolve":
                                df = df.withColumn(f"_raw_{col_name}", F.col(col_name))
                                print(f"[DSL ENGINE] Backed up raw values of '{col_name}' into '_raw_{col_name}' before overwriting.")
                            else:
                                print(f"[SCHEMA GUARD] [WARN] Schema mode is set to 'strict'. Cannot backup raw column to '_raw_{col_name}' because schema alterations are locked. Overwriting in-place without backup.")
                        
                        print(f"[DSL WARNING] Output mode 'semantic_overwrite' will replace original values in column '{col_name}'. Data loss warning!")
                        df = df.withColumn(col_name, F.col(target_col))
                        df = df.drop(target_col, score_col, method_col, version_col, processed_at_col, semantic_type_col)
                    elif output_mode == "full":
                        # Keep original column syntactically cleaned and flat lineage columns
                        df = df.withColumn(col_name, F.lower(F.trim(F.col(col_name))))
                        
                        # Apply lineage field limiting to prevent schema explosion
                        lineage_mode = rule.get("lineage_mode", "full")
                        if lineage_mode == "minimal":
                            enabled_fields = ["category", "confidence"]
                        else:
                            enabled_fields = rule.get("enabled_lineage_fields", ["category", "confidence", "method", "version", "processed_at", "semantic_type"])
                            
                        if "category" not in enabled_fields:
                            df = df.drop(target_col)
                        if "confidence" not in enabled_fields:
                            df = df.drop(score_col)
                        if "method" not in enabled_fields:
                            df = df.drop(method_col)
                        if "version" not in enabled_fields:
                            df = df.drop(version_col)
                        if "processed_at" not in enabled_fields:
                            df = df.drop(processed_at_col)
                        if "semantic_type" not in enabled_fields:
                            df = df.drop(semantic_type_col)
                    
        elif r_type == "auto_strategy":
            strategies = rule.get("strategies", ["clean", "categorize", "semantic_expand"])
            threshold = float(rule.get("confidence_threshold", 0.80))
            fallback = rule.get("fallback", "original")
            keep_orig = rule.get("keep_original", True)
            out_col = rule.get("output_column", f"{col_name}_semantic")
            categories = rule.get("categories", {})
            
            if col_name in df.columns:
                print(f"[DSL AUTO-STRATEGY] Starting dynamic data-aware profiling on '{col_name}'...")
                try:
                    total_count = df.count()
                    if total_count == 0:
                        print(f"[DSL AUTO-STRATEGY] Empty DataFrame. Skipping strategy execution for '{col_name}'")
                        continue
                        
                    distinct_count = df.select(col_name).distinct().count()
                    dtype = dict(df.dtypes)[col_name]
                    is_numeric = dtype in ("int", "integer", "double", "float", "long", "short", "decimal")
                    
                    avg_len = 0.0
                    if not is_numeric:
                        avg_len_row = df.select(F.mean(F.length(F.col(col_name)))).collect()[0][0]
                        avg_len = float(avg_len_row) if avg_len_row is not None else 0.0
                        
                    print(f"[DSL AUTO-STRATEGY] Profile results for '{col_name}': type={dtype}, cardinality={distinct_count}, avg_length={avg_len:.2f}")
                    
                    selected_strategy = "preserve_mode"
                    confidence = 1.0
                    
                    if is_numeric and "clean" in strategies:
                        selected_strategy = "numeric_cleaning"
                    elif not is_numeric:
                        if distinct_count < 50 and avg_len < 12 and "categorize" in strategies:
                            selected_strategy = "categorical_mapping"
                        elif "semantic_expand" in strategies:
                            selected_strategy = "semantic_expand"
                            
                    print(f"[DSL AUTO-STRATEGY] Selected strategy: '{selected_strategy}' (confidence={confidence})")
                    
                    target_col = out_col if keep_orig else col_name
                    
                    if selected_strategy == "numeric_cleaning":
                        df = df.withColumn(target_col, F.coalesce(F.col(col_name).cast("double"), F.lit(0.0)))
                        print(f"[DSL AUTO-STRATEGY] Applied 'numeric_cleaning' on '{col_name}' -> '{target_col}'")
                        
                    elif selected_strategy == "categorical_mapping":
                        standardize_udf = create_standardize_udf(categories, fallback)
                        df = df.withColumn(target_col, standardize_udf(F.col(col_name)))
                        print(f"[DSL AUTO-STRATEGY] Applied 'categorical_mapping' on '{col_name}' -> '{target_col}'")
                        
                    elif selected_strategy == "semantic_expand":
                        score_col = f"{target_col}_score"
                        version = rule.get("version", "v1.0")
                        output_mode = rule.get("output_mode", "enriched")  # Default to enriched for semantic rules to avoid data loss
                        if dry_run:
                            print(f"[DSL AUTO-STRATEGY] [DRY RUN] Overriding output mode to 'full' for column '{col_name}' to prevent data modification.")
                            output_mode = "full"
                        elif schema_mode == "strict" and output_mode in ("enriched", "full"):
                            print(f"[SCHEMA GUARD] [WARN] Schema mode is set to 'strict'. Overriding output mode from '{output_mode}' to 'semantic_overwrite' for column '{col_name}' to prevent schema changes. In-place values will be overwritten.")
                            output_mode = "semantic_overwrite"
                            
                        method_col = f"{target_col}_method"
                        version_col = f"{target_col}_version"
                        processed_at_col = f"{target_col}_processed_at"
                        semantic_type_col = f"{target_col}_semantic_type"

                        # Extract Lineage Configurations
                        low_confidence_policy = rule.get("low_confidence_policy", "map_to_fallback")
                        semantic_type = rule.get("semantic_type", "rule_based")

                        if output_mode == "clean_only":
                            # Just trim, lowercase, and handle null fallback in-place (Syntax cleaning only)
                            df = df.withColumn(
                                col_name,
                                F.when(F.col(col_name).isNull(), F.lit(fallback if fallback != "original" else None))
                                 .otherwise(F.lower(F.trim(F.col(col_name))))
                            )
                            print(f"[DSL AUTO-STRATEGY] Applied 'clean_only' syntactic cleaning on column '{col_name}' (Semantic mapping bypassed).")
                        else:
                            # Apply optimized broadcast exact-match + fuzzy UDF on unique values
                            df = apply_optimized_semantic_standardize(
                                df, col_name, target_col, categories, threshold, fallback, version,
                                low_confidence_policy=low_confidence_policy, semantic_type=semantic_type
                            )
                            print(f"[DSL AUTO-STRATEGY] Applied 'semantic_expand' on '{col_name}' -> '{target_col}' (version={version})")
                            
                            try:
                                table_name = rules_dict.get("table_name", "unknown")
                                _process_standardize_learning(df, col_name, target_col, score_col, fallback, threshold, table_name, rules_dict, categories)
                            except Exception as fe:
                                print(f"[DSL AUTO-STRATEGY] Non-fatal error calculating fallback rate: {fe}")

                            if output_mode == "enriched":
                                # Ensure original column is syntactically cleaned
                                df = df.withColumn(col_name, F.lower(F.trim(F.col(col_name))))
                                # Nest semantic fields into namespace-isolated struct or JSON
                                struct_name = f"_semantic_{col_name}"
                                struct_expr = F.struct(
                                    F.col(target_col).alias("category"),
                                    F.col(score_col).alias("confidence"),
                                    F.col(method_col).alias("method"),
                                    F.col(version_col).alias("version"),
                                    F.col(processed_at_col).alias("processed_at"),
                                    F.col(semantic_type_col).alias("semantic_type")
                                )
                                enriched_format = rule.get("enriched_format", "struct")
                                if enriched_format == "json":
                                    df = df.withColumn(struct_name, F.to_json(struct_expr))
                                    print(f"[DSL AUTO-STRATEGY] Semantic results nested under namespace '{struct_name}' in JSON format.")
                                else:
                                    df = df.withColumn(struct_name, struct_expr)
                                    print(f"[DSL AUTO-STRATEGY] Semantic results nested under namespace '{struct_name}' in Struct format.")
                                    
                                df = df.drop(target_col, score_col, method_col, version_col, processed_at_col, semantic_type_col)
                            elif output_mode == "semantic_overwrite":
                                print(f"[DSL WARNING] Output mode 'semantic_overwrite' will replace original values in column '{col_name}'. Data loss warning!")
                                df = df.withColumn(col_name, F.col(target_col))
                                df = df.drop(target_col, score_col, method_col, version_col, processed_at_col, semantic_type_col)
                            elif output_mode == "full":
                                # Keep original column syntactically cleaned and flat lineage columns
                                df = df.withColumn(col_name, F.lower(F.trim(F.col(col_name))))
                                
                                # Apply lineage field limiting to prevent schema explosion
                                lineage_mode = rule.get("lineage_mode", "full")
                                if lineage_mode == "minimal":
                                    enabled_fields = ["category", "confidence"]
                                else:
                                    enabled_fields = rule.get("enabled_lineage_fields", ["category", "confidence", "method", "version", "processed_at", "semantic_type"])
                                    
                                if "category" not in enabled_fields:
                                    df = df.drop(target_col)
                                if "confidence" not in enabled_fields:
                                    df = df.drop(score_col)
                                if "method" not in enabled_fields:
                                    df = df.drop(method_col)
                                if "version" not in enabled_fields:
                                    df = df.drop(version_col)
                                if "processed_at" not in enabled_fields:
                                    df = df.drop(processed_at_col)
                                if "semantic_type" not in enabled_fields:
                                    df = df.drop(semantic_type_col)
                            
                    else:
                        print(f"[DSL AUTO-STRATEGY] Applied 'preserve_mode' (Do Nothing) on '{col_name}'")
                        
                except Exception as prof_err:
                    print(f"[DSL AUTO-STRATEGY] Profiler execution failed: {prof_err}. Defaulting to preserve_mode.")
                
        elif r_type == "filter":
            cond_str = rule.get("condition")
            if cond_str:
                if not re.match(r'^[\w\s\+\-\*/\(\)<>=!]+$', cond_str):
                    print(f"[DSL ENGINE] Security Warning: Skipped invalid filter condition: {cond_str}")
                    continue
                df = df.filter(F.expr(cond_str))
                print(f"[DSL ENGINE] Applied filter condition: '{cond_str}'")
                
    # Append global metadata struct column if schema_mode is evolve to support data contract verification
    if schema_mode == "evolve":
        fallback_cols = []
        for rule in remediation_rules:
            if rule.get("type") in ("standardize", "semantic_standardize", "auto_strategy"):
                fallback_cols.append(rule.get("column"))
                
        if fallback_cols:
            fb_arr = F.array([F.lit(c) for c in fallback_cols])
        else:
            fb_arr = F.lit(None).cast("array<string>")
            
        if processed_cols:
            pc_arr = F.array([F.lit(c) for c in processed_cols])
        else:
            pc_arr = F.lit(None).cast("array<string>")
            
        # Get semantic version from the first semantic standardization rule if available
        semantic_version = "v1.0"
        for rule in remediation_rules:
            if rule.get("type") in ("semantic_standardize", "auto_strategy") and "version" in rule:
                semantic_version = rule["version"]
                break

        df = df.withColumn(
            "_meta",
            F.struct(
                F.lit(schema_mode).alias("schema_mode"),
                F.lit(True).alias("contract_enforced"),
                fb_arr.alias("fallback_columns"),
                pc_arr.alias("processed_columns"),
                F.lit(semantic_version).alias("semantic_version"),
                F.lit(execution_id).alias("execution_id")
            )
        )
        print(f"[DSL ENGINE] Appended contract metadata layer to '_meta' column (schema_mode=evolve, execution_id={execution_id}).")

    return df


# ─── FIX 3B: Database-Backed Schema Registry via Elasticsearch ───────────────
def load_expected_schema(table_name: str) -> dict:
    """Loads schema spec, primary key, and date column for a table from Elasticsearch index sdoqap_schema_registry.
    Falls back to default_registry if Elasticsearch doesn't have it."""
    from urllib.parse import urlparse
    base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
    
    url = f"{base_url}/sdoqap_schema_registry/_doc/{table_name}"
    try:
        res = requests.get(url, auth=auth, timeout=5)
        if res.status_code == 200:
            doc = res.json().get("_source", {})
            print(f"[REGISTRY] Loaded schema spec for '{table_name}' from Elasticsearch sdoqap_schema_registry.")
            return doc
    except Exception as e:
        print(f"[REGISTRY] Failed to read from Elasticsearch: {e}. Falling back to default registry.")
        
    # Fallback to local schema_registry.json file first
    try:
        registry_file = "/opt/spark-apps/schema_registry.json"
        if os.path.exists(registry_file):
            with open(registry_file, "r", encoding="utf-8") as f:
                disk_registry = json.load(f)
                normalized_target = normalize_name(table_name)
                for tbl_name, spec in disk_registry.items():
                    if normalize_name(tbl_name) == normalized_target:
                        print(f"[REGISTRY] Loaded schema spec for '{tbl_name}' from local schema_registry.json fallback.")
                        return spec
    except Exception as io_err:
        print(f"[REGISTRY] Failed to read schema_registry.json: {io_err}")

    # Fallback to default in-memory registry if not found
    default_registry = {
        "mbti": {
            "primary_key": ["author", "text"],
            "date_column": None,
            "schema_spec": {
                "author": "StringType",
                "text": "StringType",
                "label": "StringType",
                "EI": "StringType",
                "NS": "StringType",
                "TF": "StringType",
                "JP": "StringType"
            }
        },
        "users": {
            "primary_key": "id",
            "date_column": "updated_at",
            "schema_spec": {
                "id": "IntegerType",
                "username": "StringType",
                "email": "StringType",
                "role": "StringType",
                "created_at": "TimestampType",
                "updated_at": "TimestampType"
            }
        },
        "benchmark_test": {
            "primary_key": "id",
            "date_column": "updated_at",
            "schema_spec": {
                "id": "IntegerType",
                "username": "StringType",
                "email": "StringType",
                "role": "StringType",
                "created_at": "TimestampType",
                "updated_at": "TimestampType"
            }
        }
    }
    
    normalized_target = normalize_name(table_name)
    for tbl_name, spec in default_registry.items():
        if normalize_name(tbl_name) == normalized_target:
            print(f"[REGISTRY] Found fallback matching registry spec for '{tbl_name}'")
            return spec
    return None

def save_registry_to_es(table_name: str, spec: dict) -> bool:
    """Saves schema specification to Elasticsearch index sdoqap_schema_registry."""
    from urllib.parse import urlparse
    base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
    url = f"{base_url}/sdoqap_schema_registry/_doc/{table_name}"
    try:
        res = requests.put(url, json=spec, auth=auth, headers={"Content-Type": "application/json"}, timeout=5)
        if res.status_code in [200, 201]:
            print(f"[REGISTRY] Saved schema spec for '{table_name}' to Elasticsearch sdoqap_schema_registry.")
            return True
    except Exception as e:
        print(f"[REGISTRY] Failed to save schema spec to Elasticsearch: {e}")
    return False

def auto_evolve_schema_registry(table_name: str, proposed_schema: dict) -> bool:
    """Auto-evolves the schema registry in ES and local schema_registry.json.
    Called when drift is determined to be safe (only new columns added).
    """
    # 1. Fetch current registry doc from ES (or construct standard fallback)
    try:
        from urllib.parse import urlparse
        base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
        
        url = f"{base_url}/sdoqap_schema_registry/_doc/{table_name}"
        res = requests.get(url, auth=auth, timeout=5)
        if res.status_code == 200:
            reg_doc = res.json().get("_source", {})
        else:
            reg_doc = {
                "primary_key": "id",
                "date_column": None,
                "schema_spec": {}
            }
        
        # Merge proposed schema spec
        reg_doc["schema_spec"] = proposed_schema
        
        # Write back to ES
        requests.put(url, json=reg_doc, auth=auth, headers={"Content-Type": "application/json"}, timeout=5)
        print(f"[AUTO-EVOLVE] Successfully auto-evolved sdoqap_schema_registry in ES for '{table_name}'.")
        
        # 2. Update local schema_registry.json
        local_registry_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema_registry.json")
        if os.path.exists(local_registry_path):
            with open(local_registry_path, "r", encoding="utf-8") as f:
                local_reg = json.load(f)
            
            table_entry = local_reg.setdefault(table_name, {
                "primary_key": reg_doc.get("primary_key", "id"),
                "date_column": reg_doc.get("date_column"),
                "schema_spec": {}
            })
            table_entry["schema_spec"] = proposed_schema
            
            # Save backup
            with open(local_registry_path + ".bak", "w", encoding="utf-8") as f:
                json.dump(local_reg, f, indent=4)
                
            with open(local_registry_path, "w", encoding="utf-8") as f:
                json.dump(local_reg, f, indent=4)
            print(f"[AUTO-EVOLVE] Successfully updated local schema_registry.json for '{table_name}'.")
            return True
            
    except Exception as e:
        print(f"[AUTO-EVOLVE] Failed to auto-evolve schema: {e}")
    return False

# ─── FIX 3A: Config-Driven Rules Engine ───────────────────────────────────────
def load_rules_config(table_name: str) -> dict:
    """Load validation rules from Elasticsearch index sdoqap_rules_registry first.
    Falls back to rules_config.json on disk if ES is unreachable or index does not exist.
    """
    from urllib.parse import urlparse
    base_url, auth = es_base_and_auth(ELASTICSEARCH_URL)
    
    # 1. Try reading from ES
    es_default = {}
    es_table = {}
    es_read_success = False
    
    try:
        # Read default config
        url_default = f"{base_url}/sdoqap_rules_registry/_doc/_default"
        res_default = requests.get(url_default, auth=auth, timeout=3)
        if res_default.status_code == 200:
            es_default = res_default.json().get("_source", {})
            es_read_success = True
            
        # Read table-specific overrides
        url_table = f"{base_url}/sdoqap_rules_registry/_doc/{table_name}"
        res_table = requests.get(url_table, auth=auth, timeout=3)
        if res_table.status_code == 200:
            es_table = res_table.json().get("_source", {})
            es_read_success = True
            
        if es_read_success:
            print(f"[RULES] Successfully loaded configuration for '{table_name}' from Elasticsearch sdoqap_rules_registry.")
            return _merge_configs_dict(es_default, es_table)
    except Exception as e:
        print(f"[RULES] Failed to read rules from Elasticsearch: {e}. Falling back to rules_config.json on disk.")

    # 2. Fallback to local file config
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules_config.json")
    if not os.path.exists(config_path):
        return {"quality_score_threshold": 90.0, "freshness_threshold_hours": 48}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            all_rules = json.load(f)
        default = all_rules.get("_default", {})
        table_rules = all_rules.get(table_name, {})
        return _merge_configs_dict(default, table_rules)
    except Exception as e:
        print(f"[RULES] Failed to load rules_config.json: {e}. Using defaults.")
        return {"quality_score_threshold": 90.0, "freshness_threshold_hours": 48}

def _merge_configs_dict(default: dict, table_rules: dict) -> dict:
    """Helper to deep merge table-specific configs override default configs."""
    merged = {}
    for key in set(list(default.keys()) + list(table_rules.keys())):
        default_val = default.get(key)
        table_val = table_rules.get(key)
        if table_val is not None:
            if isinstance(default_val, dict) and isinstance(table_val, dict):
                merged[key] = {**default_val, **table_val}
            else:
                merged[key] = table_val
        elif default_val is not None:
            merged[key] = default_val
    return merged


def resolve_rule_value(rule_entry, fallback):
    """Extract the effective scalar value from a rule entry.
    Supports both v1 flat format (e.g., 90.0) and v2 nested format (e.g., {'mode': 'adaptive', 'base_value': 90.0}).
    Returns the base_value from nested format, or the raw value from flat format."""
    if isinstance(rule_entry, dict):
        return rule_entry.get("base_value", fallback)
    if rule_entry is not None:
        return rule_entry
    return fallback

FAST_TRACK_MB_LIMIT = 50

def detect_track(spark, table_name: str) -> str:
    """Detect whether a table should use Fast Track or Batch Track
    based on the raw data size on HDFS. Defaults to 'batch' on any error."""
    try:
        sc = spark.sparkContext
        conf = sc._jsc.hadoopConfiguration()
        URI = sc._gateway.jvm.java.net.URI
        FileSystem = sc._gateway.jvm.org.apache.hadoop.fs.FileSystem
        Path = sc._gateway.jvm.org.apache.hadoop.fs.Path
        fs = FileSystem.get(URI(HDFS_URL), conf)
        
        raw_dir = Path(f"/data/raw/{table_name}")
        if fs.exists(raw_dir):
            size_bytes = fs.getContentSummary(raw_dir).getLength()
            track = "fast" if size_bytes < FAST_TRACK_MB_LIMIT * 1024 * 1024 else "batch"
            print(f"[TRACK] Table '{table_name}' size={size_bytes//1024}KB -> {track.upper()} track")
            return track
    except Exception as e:
        print(f"[TRACK] Size detection failed: {e}. Defaulting to batch track.")
    return "batch"

def send_n8n_alert(title, message, severity="warning"):
    """Sends an alert to n8n webhook and routes to active channels."""
    # 1. Route to external platforms (Slack / LINE Notify)
    try:
        from alert_router import route_alert
        route_alert(title, message, severity)
    except Exception as e:
        print(f"Failed to route alert locally: {e}")

    # 2. Original n8n webhook alert
    payload = {
        "title": title,
        "message": message,
        "severity": severity,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    def _send():
        try:
            res = requests.post(N8N_WEBHOOK_URL, headers={"Content-Type": "application/json"}, json=payload, timeout=5)
            if res.status_code == 200:
                print(f"Alert sent to n8n successfully: {title}")
            else:
                print(f"Failed to send alert to n8n. Status: {res.status_code}")
        except Exception as e:
            print(f"Error sending alert to n8n: {e}")
            
    import threading
    t = threading.Thread(target=_send)
    t.daemon = True
    t.start()

def get_historical_stats(table_name):
    """Fetches historical quarantine rates for z-score anomaly detection."""
    url = f"{ELASTICSEARCH_URL}/sdoqap_quality_runs/_search"
    query = {
        "query": {
            "term": {
                "table_name.keyword": table_name
            }
        },
        "sort": [{"timestamp": {"order": "desc"}}],
        "size": 15
    }
    try:
        # Parse basic auth from URL if present
        auth = None
        from urllib.parse import urlparse
        parsed = urlparse(ELASTICSEARCH_URL)
        if parsed.username and parsed.password:
            auth = (parsed.username, parsed.password)
            base_url = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
            url = f"{base_url}/sdoqap_quality_runs/_search"

        res = requests.post(url, json=query, auth=auth, headers={"Content-Type": "application/json"}, timeout=5)
        if res.status_code == 200:
            hits = res.json().get("hits", {}).get("hits", [])
            rates = []
            for hit in hits:
                source = hit.get("_source", {})
                total = source.get("total_records", 0)
                quar = source.get("quarantined_records", 0)
                if total > 0:
                    rates.append(float(quar) / float(total))
            return rates
        return []
    except Exception as e:
        print(f"[STAT] Failed to fetch historical stats: {e}")
    return []

def lock_protector(func):
    import functools
    @functools.wraps(func)
    def wrapper(table_name, *args, **kwargs):
        try:
            return func(table_name, *args, **kwargs)
        except BaseException as e:
            print(f"[LOCK-PROTECTOR] Run failed or terminated for '{table_name}': {e}")
            try:
                release_lock(table_name)
            except Exception as le:
                print(f"[LOCK-PROTECTOR] Redundant lock release failed: {le}")
            raise e
    return wrapper

@lock_protector
def run_quality_check(table_name, primary_key, date_column, schema_spec, input_table_name=None, ingest_id=None):
    if not input_table_name:
        input_table_name = table_name

    schema_spec = {clean_column_name(k): v for k, v in schema_spec.items()}
    if isinstance(primary_key, list):
        primary_key = [clean_column_name(pk) for pk in primary_key]
    elif isinstance(primary_key, str):
        primary_key = clean_column_name(primary_key)
    if date_column:
        date_column = clean_column_name(date_column)

    started_at = datetime.now(timezone.utc)
    run_id = f"run_{started_at.strftime('%Y%m%d_%H%M%S_%f')}"

    # Acquire the distributed lock before starting Spark. Returning (not sys.exit) here
    # matters: lock_protector would otherwise release the lock held by the other run.
    if not acquire_lock(table_name, run_id, force=FORCE_LOCK):
        print(f"[ABORT] Table '{table_name}' is locked by another run. Skipping.")
        return "SKIPPED"
    heartbeat = Heartbeat(60, lambda: renew_lock(table_name, run_id)).start()

    # ─── FIX 1B: Create Spark session, detect track, and configure Spark resources accordingly ────────
    spark = get_spark_session(f"SDOQAP_QualityCheck_{table_name}")
    ship_package(spark)
    track = detect_track(spark, input_table_name)
    if track == "fast":
        spark.conf.set("spark.sql.shuffle.partitions", "2")
    else:
        spark.conf.set("spark.sql.shuffle.partitions", "10")

    rules = load_rules_config(table_name)
    rules["table_name"] = table_name
    
    # Try to apply dynamic adaptive rules (Layer 2: Statistical Engine)
    # Falls back gracefully to base values if dynamic_rules_engine is unavailable
    #
    # Note: the raw DataFrame isn't loaded yet at this point in the run, so only the
    # quality_score_threshold branch (which queries ES history, not the DataFrame) is
    # active here — that's the field every table's rules_config.json actually sets to
    # "adaptive" mode. null_checks tolerance-learning has no consumer anywhere else in
    # this file (unlike value_range, which is computed independently further down at
    # the point value_range_profile is built) — it remains unimplemented; treat
    # rules_config.json's null_checks.mode as informational until that's built.
    try:
        from dynamic_rules_engine import apply_adaptive_rules
        rules = apply_adaptive_rules(rules, table_name, df=None, spark=spark)
        print(f"[DYNAMIC RULES] Adaptive rules applied for '{table_name}'")
    except ImportError:
        print(f"[DYNAMIC RULES] dynamic_rules_engine not available, using base config")
    except Exception as dre:
        print(f"[DYNAMIC RULES] Failed to apply adaptive rules: {dre}. Using base config.")
    
    quality_threshold = resolve_rule_value(rules.get("quality_score_threshold"), 90.0)
    freshness_limit_hours = resolve_rule_value(rules.get("freshness_threshold_hours"), 48)

    # Resolve which files this run reads: one ingestion's folder (normal path) or the
    # whole table folder (manual CLI run without --ingest-id).
    sc = spark.sparkContext
    jvm = sc._gateway.jvm
    fs = jvm.org.apache.hadoop.fs.FileSystem.get(jvm.java.net.URI(HDFS_URL), sc._jsc.hadoopConfiguration())
    HPath = jvm.org.apache.hadoop.fs.Path

    def hdfs_exists(p):
        return fs.exists(HPath(p))

    if ingest_id:
        raw_path, recursive_read = raw_read_path(HDFS_URL, input_table_name, ingest_id, exists=hdfs_exists)
    else:
        source_table = input_table_name if hdfs_exists(f"/data/raw/{input_table_name}") else table_name
        raw_path, recursive_read = raw_read_path(HDFS_URL, source_table)
    print(f"[PATH] Reading raw input from {raw_path} (recursive={recursive_read})")

    active_path = f"{HDFS_URL}/data/active/{table_name}"
    staging_path = f"{HDFS_URL}/data/staging/{table_name}/run_id={run_id}"
    quarantine_path = f"{HDFS_URL}/data/quarantine/{table_name}"

    ctx = RunContext(
        spark=spark, table_name=table_name, run_id=run_id, ingest_id=ingest_id,
        primary_key=primary_key, date_column=date_column, schema_spec=schema_spec, rules=rules,
        paths={"raw": raw_path, "active": active_path, "quarantine": quarantine_path},
        quality_threshold=quality_threshold, freshness_limit_hours=freshness_limit_hours,
        log_es=log_to_elasticsearch, alert=send_n8n_alert, evolve_schema=auto_evolve_schema_registry,
        apply_dsl=apply_dsl_remediation_rules, load_std_rules=_load_standardization_rules,
        historical_stats=get_historical_stats, pop_fallback_metrics=_pop_fallback_metrics,
    )

    print(f"Starting quality check for '{table_name}' in run {run_id} [{track.upper()} track]...")

    try:
        # Load raw data from HDFS as strings to avoid inference issues (Bug 6)
        print(f"Reading raw CSV data from {raw_path}")
        df = spark.read.option("header", "true").option("multiLine", "true").option("escape", "\"").option("quote", "\"") \
            .option("recursiveFileLookup", "true" if recursive_read else "false").csv(raw_path)

        # ─── GUARD: CSV Ingestion Safety Check (Goal 3) ───
        is_csv_input = "csv" in raw_path.lower()
        if is_csv_input:
            string_cols = [c for c, t in df.dtypes if t == "string"]
            if string_cols:
                try:
                    sample_df = df.limit(100)
                    avg_lens = sample_df.select([F.mean(F.length(c)).alias(c) for c in string_cols]).first()
                    if avg_lens:
                        max_avg_len = max([float(avg_lens[c]) if avg_lens[c] is not None else 0.0 for c in string_cols])
                        if max_avg_len > 150.0:
                            print(f"[INGESTION-GUARD] WARNING: Detected long text column(s) (avg length={max_avg_len:.1f} chars) in CSV format!")
                            ingestion_policy = rules.get("ingestion_guard", {})
                            strict_guard = ingestion_policy.get("strict_csv_guard", False)
                            if strict_guard:
                                raise ValueError(
                                    f"Data Contract Violation: Ingestion of CSV files with long text columns (avg length > 150) is blocked in production. "
                                    f"Please convert to JSON Lines (.jsonl) or Parquet format to prevent row misalignment and corruption."
                                )
                except Exception as check_err:
                    if isinstance(check_err, ValueError):
                        raise check_err
                    print(f"[INGESTION-GUARD] Non-fatal check error: {check_err}")

        # ─── GUARD: Empty file protection ─────────────────────────
        if len(df.columns) == 0 or df.head(1) is None or len(df.head(1)) == 0:
            print(f"SKIPPED: '{table_name}' has 0 records or no columns. Nothing to process.")
            spark.stop()
            sys.exit(EXIT_SKIPPED)

        ctx.df = df
        ctx = run_stages(plan.ALIGN, ctx)
        df = ctx.df
    except Exception as e:
        print(f"Error reading raw data path {raw_path}: {e}")
        log_to_elasticsearch("sdoqap_pipeline_runs", {
            "run_id": run_id,
            "table_name": table_name,
            "state": "failed",
            "error_msg": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        release_lock(table_name)  # FIX 2A: Always release lock on failure
        spark.stop()
        sys.exit(1)

    ctx.df = df
    ctx = run_stages(["schema_drift"], ctx)
    df, drift_detected, drift_details = ctx.df, ctx.drift_detected, ctx.drift_details

    ctx.df = df
    ctx = run_stages(["auto_clean", "validation", "dedup", "standardize_dates", "standardize_categories"], ctx)
    df, remediation_logs, auto_clean = ctx.df, ctx.remediation_logs, ctx.auto_clean
    df_with_status, invalid_df, valid_df = ctx.df_with_status, ctx.invalid_df, ctx.valid_df
    valid_df_with_id, valid_dedup_with_id = ctx.valid_df_with_id, ctx.valid_dedup_with_id
    clean_df, duplicate_df = ctx.clean_df, ctx.duplicate_df
    pk_cols = ctx.pk_cols


    

    

    ctx = run_stages(["anomaly_iqr", "anomaly_zscore", "anomaly_induced", "quarantine_assembly"], ctx)
    outlier_df, value_range_profile = ctx.outlier_df, ctx.value_range_profile
    unsupervised_outlier_df, induced_outlier_df = ctx.unsupervised_outlier_df, ctx.induced_outlier_df
    all_quarantined, all_quarantined_write = ctx.all_quarantined, ctx.all_quarantined_write
    clean_df = ctx.clean_df
    clean_count, quarantine_count, total_records = ctx.clean_count, ctx.quarantine_count, ctx.total_records




    print("Writing validated datasets to HDFS using Delta Lake...")

    ctx = run_stages(["column_filter"], ctx)
    clean_df = ctx.clean_df

    # Quarantine first, keyed by ingest_id: if the MERGE below fails, a retry of the same
    # ingestion replaces these rows instead of appending a second copy.
    from delta.tables import DeltaTable
    quarantine_write_df = all_quarantined_write.withColumn("ingest_id", F.lit(ingest_id or run_id))
    if ingest_id and DeltaTable.isDeltaTable(spark, quarantine_path):
        quarantine_table = DeltaTable.forPath(spark, quarantine_path)
        if "ingest_id" in quarantine_table.toDF().columns:
            quarantine_table.delete(F.col("ingest_id") == F.lit(ingest_id))
    quarantine_write_df.write.format("delta").mode("append").option("mergeSchema", "true") \
        .partitionBy("run_id").save(quarantine_path)

    # Delta Lake MERGE (True Upsert)
    clean_df_for_upsert = clean_df.withColumn("run_id", F.lit(run_id))
    
    try:
        from delta.tables import DeltaTable
        if DeltaTable.isDeltaTable(spark, active_path):
            print("Existing Delta Table found. Performing MERGE INTO...")
            delta_table = DeltaTable.forPath(spark, active_path)
            if isinstance(pk_cols, list) and len(pk_cols) > 0:
                merge_cond = " AND ".join([f"old.`{col}` = new.`{col}`" for col in pk_cols])
            else:
                merge_cond = f"old.`{pk_cols}` = new.`{pk_cols}`"
            delta_table.alias("old").merge(
                clean_df_for_upsert.alias("new"),
                merge_cond
            ).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
            print("Delta Lake Upsert completed successfully.")
        else:
            print(f"No existing Delta table. Creating new Delta table at: {active_path}")
            clean_df_for_upsert.write \
                .format("delta") \
                .mode("overwrite") \
                .save(active_path)
            print("Delta Lake table created successfully.")
    except Exception as e:
        # Root Cause Fix: a MERGE failure must never fall back to mode("overwrite") — that
        # silently replaces the entire active table with just this run's batch, destroying
        # all previously accumulated clean history. Fail the run closed instead: record it,
        # release the lock, and exit non-zero. The raw source folder is left untouched (the
        # cleanup step below only runs on the success path), so the run is safely retriable.
        print(f"[CRITICAL] Delta MERGE failed for '{table_name}': {e}. Aborting run without touching active table.")
        log_to_elasticsearch("sdoqap_pipeline_runs", {
            "run_id": run_id,
            "table_name": table_name,
            "state": "failed",
            "error_msg": f"Delta MERGE failed, active table left untouched: {str(e)}",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        release_lock(table_name)
        spark.stop()
        sys.exit(1)
    # ─── Delta Maintenance (Optimize & Vacuum for scale-ready Day-2 Operations) ───
    try:
        optimize_every = int(os.getenv("DELTA_OPTIMIZE_EVERY", "10"))
        version = DeltaTable.forPath(spark, active_path).history(1).select("version").first()[0]
        if should_optimize(version, optimize_every):
            print(f"[DELTA MAINTENANCE] Version {version}: running OPTIMIZE ZORDER BY (row_hash) and VACUUM 168h...")
            spark.sql(f"OPTIMIZE delta.`{active_path}` ZORDER BY (row_hash)")
            spark.sql(f"VACUUM delta.`{active_path}` RETAIN 168 HOURS")
        else:
            print(f"[DELTA MAINTENANCE] Version {version}: skipped (runs every {optimize_every} versions).")
    except Exception as maint_err:
        print(f"[DELTA MAINTENANCE] Non-fatal maintenance error: {maint_err}")

    # Quarantined data written with run_id partition for traceability

    # Release cached DataFrames from memory to prevent memory leaks and OOM
    clean_df.unpersist()
    all_quarantined_write.unpersist()

    # Class Balance / Data Distribution calculation
    class_balance = []
    group_col = None
    if clean_count > 0:
        try:
            clean_run_df = spark.read.format("delta").load(active_path)
            # 1. Search for common categorical column names (Case Insensitive)
            common_categorical_cols = ["label", "role", "category", "type", "status", "class", "gender", "country", "state", "sector", "transaction_type"]
            df_cols_lower = {c.lower(): c for c in clean_run_df.columns}
            
            for col_name in common_categorical_cols:
                if col_name in df_cols_lower:
                    group_col = df_cols_lower[col_name]
                    break

            # 2. Cardinality-based automatic String column fallback (detects 2 to 25 categories)
            if not group_col:
                string_cols = [f.name for f in clean_run_df.schema.fields if f.dataType.__class__.__name__ == "StringType"]
                if string_cols:
                    agg_exprs = [F.countDistinct(col_name).alias(col_name) for col_name in string_cols]
                    try:
                        counts_row = clean_run_df.agg(*agg_exprs).first()
                        if counts_row:
                            for col_name in string_cols:
                                distinct_count = counts_row[col_name]
                                if 1 < distinct_count <= 25:
                                    group_col = col_name
                                    break
                    except Exception as e:
                        print(f"[DISTRIBUTION] Warning: Failed to scan distinct count in parallel: {e}")

            if group_col:
                balance_df = clean_run_df.groupBy(group_col).count().collect()
                # Sort descending by count and take top 25 to avoid large payload and prevent mapping explosion
                sorted_balance = sorted(balance_df, key=lambda x: x['count'] if x['count'] is not None else 0, reverse=True)[:25]
                class_balance = []
                for row in sorted_balance:
                    val = row[group_col]
                    key_str = str(val) if val is not None else "NULL"
                    if not key_str.strip():
                        key_str = "SPACES"
                    key_str = key_str.replace(".", "_")
                    class_balance.append({"key": key_str, "value": int(row["count"])})
                print(f"Data Distribution for {table_name} grouped by '{group_col}': {class_balance}")
        except Exception as e:
            print(f"Error computing data distribution: {e}")

    # Quarantine Reasons Breakdown
    quarantine_breakdown = {}
    if quarantine_count > 0:
        try:
            quar_run_df = spark.read.format("delta").load(quarantine_path).filter(F.col("run_id") == run_id)
            if "reject_reason" in quar_run_df.columns:
                breakdown_df = quar_run_df.groupBy("reject_reason").count().collect()
                for row in breakdown_df:
                    reason_str = row["reject_reason"] or "unknown"
                    count = row["count"]
                    if reason_str == "":
                        reason_str = "unknown"
                    reasons = [r.strip() for r in reason_str.split(";") if r.strip()]
                    if not reasons:
                        reasons = ["unknown"]
                    for r in reasons:
                        r_clean = r.replace(".", "_")
                        if not r_clean.strip():
                            r_clean = "unknown"
                        quarantine_breakdown[r_clean] = quarantine_breakdown.get(r_clean, 0) + count
                print(f"Quarantine Breakdown: {quarantine_breakdown}")
        except Exception as e:
            print(f"Error computing quarantine breakdown: {e}")

    # Calculate Dynamic Financial COPDQ (Root Cause Fix for hardcoded math)
    quarantined_financial_value = 0.0
    if quarantine_count > 0:
        try:
            fin_cols = ["total_sales", "sales", "revenue", "profit", "price", "amount", "total"]
            fin_col_actual = None
            df_cols_lower = {c.lower(): c for c in quar_run_df.columns}
            for c in fin_cols:
                if c in df_cols_lower:
                    fin_col_actual = df_cols_lower[c]
                    break
            
            if fin_col_actual:
                sum_val = quar_run_df.select(F.sum(F.col(fin_col_actual).cast("double"))).collect()[0][0]
                quarantined_financial_value = float(sum_val) if sum_val is not None else 0.0
                print(f"Dynamic COPDQ: Calculated ${quarantined_financial_value:.2f} lost from '{fin_col_actual}'")
        except Exception as e:
            print(f"Error computing financial loss: {e}")

    # 3. FRESHNESS LAG
    max_lag_hours = 0.0
    # Root Cause Fix (Point 27): Skip Freshness if table is known to be historical or static
    is_historical = table_name.endswith("_historical") or table_name == "global_ecommerce_sales"

    if date_column and clean_count > 0 and not is_historical:
        try:
            clean_run_df = spark.read.format("delta").load(active_path).filter(F.col("run_id") == run_id)
            if date_column in clean_run_df.columns:
                max_ts = clean_run_df.select(F.max(date_column)).collect()[0][0]
                if max_ts:
                    if isinstance(max_ts, str):
                        try:
                            max_ts = datetime.fromisoformat(max_ts.replace("Z", "+00:00"))
                        except ValueError:
                            parsed = False
                            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y/%m/%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
                                try:
                                    max_ts = datetime.strptime(max_ts, fmt)
                                    parsed = True
                                    break
                                except ValueError:
                                    continue
                            if not parsed:
                                raise ValueError(f"Unsupported timestamp format: {max_ts}")
                    now_utc = datetime.now(timezone.utc)
                    if max_ts.tzinfo is None:
                        max_ts = max_ts.replace(tzinfo=timezone.utc)
                    lag_seconds = (now_utc - max_ts).total_seconds()
                    max_lag_hours = max(0.0, lag_seconds / 3600.0)
        except Exception as e:
            print(f"Error computing freshness: {e}")
    elif is_historical:
        print(f"Skipping freshness check for historical dataset '{table_name}'.")

    # 4. QUALITY SCORE
    passed_tests = clean_count
    total_tests = total_records
    if total_tests == 0:
        quality_score = 0.0
        remediation_logs.append("Warning: Empty source file ingested. Quality score defaulted to 0.0% to prevent masking upstream ingestion failure.")
    else:
        quality_score = (passed_tests / total_tests) * 100.0

    # FIX 3A: Use per-table threshold from rules_config instead of hardcoded 90.0
    if quality_score < quality_threshold:
        send_n8n_alert(
            title=f"🚨 Critical Data Quality Drop: {table_name}",
            message=f"Run ID: {run_id}\nQuality Score: {quality_score:.1f}% (threshold={quality_threshold}%)\nQuarantined: {quarantine_count} rows\nClean: {clean_count} rows",
            severity="critical"
        )

    # 4.1 Z-Score Anomaly Detection on Quarantine Rate (Task 3 with Bug 6 Fix)
    current_quarantine_rate = 0.0 if total_records == 0 else float(quarantine_count) / float(total_records)
    historical_rates = get_historical_stats(table_name)
    z_score = 0.0
    is_anomaly = False
    
    # We need at least 3 historical runs to compute standard deviation
    if len(historical_rates) >= 3:
        avg_rate = sum(historical_rates) / len(historical_rates)
        variance = sum((x - avg_rate) ** 2 for x in historical_rates) / len(historical_rates)
        std_dev = variance ** 0.5
        # Robust Z-Score: minimum standard deviation floor of 0.05 (5%) to prevent scaling blowup
        std_dev = max(std_dev, 0.05)
        # Prevent false alarms on tiny, insignificant fluctuations by ignoring changes under 2%
        if abs(current_quarantine_rate - avg_rate) < 0.02:
            z_score = 0.0
        else:
            z_score = abs(current_quarantine_rate - avg_rate) / std_dev
        
        if z_score > 3.0:
            is_anomaly = True
            print(f"[ANOMALY] Statistical Anomaly Detected! Quarantine Rate: {current_quarantine_rate*100:.2f}% vs Avg: {avg_rate*100:.2f}%, Z-Score: {z_score:.2f}")
            send_n8n_alert(
                title=f"🚨 CRITICAL ANOMALY: {table_name} Data Anomaly",
                message=f"Run ID: {run_id}\nQuarantine Rate: {current_quarantine_rate*100:.2f}% (Historical Avg: {avg_rate*100:.2f}%)\nZ-Score: {z_score:.2f} (exceeds threshold 3.0)",
                severity="critical"
            )

    # ─── DYNAMIC RULES Layer 3: Dynamic Decision Engine ─────────────────────────
    ai_config = rules.get("ai_advisor", {})
    ai_enabled = ai_config.get("enabled", False) if isinstance(ai_config, dict) else False
    profile_report = None
    
    # ── Component A: Data Profile Cycle (runs every time when enabled) ─────────
    if ai_enabled:
        try:
            from data_profile_store import run_profile_cycle
            # Use clean_df snapshot to build profiles (read from Delta since clean_df is unpersisted)
            try:
                profile_df = spark.read.format("delta").load(active_path)
                profile_report = run_profile_cycle(profile_df, table_name)
                
                if profile_report.get("total_drifted_columns", 0) > 0:
                    remediation_logs.append(f"profile_drift_detected_{profile_report['total_drifted_columns']}_columns")
                    # Drift counts as an anomaly signal for triggering deeper analysis
                    if not is_anomaly:
                        print("[DYNAMIC ENGINE] Distribution drift detected — escalating to AI analysis.")
            except Exception as profile_err:
                print(f"[DYNAMIC ENGINE] Profile cycle failed (non-fatal): {profile_err}")
                profile_report = None
        except ImportError:
            print("[DYNAMIC ENGINE] data_profile_store module not available. Skipping profile cycle.")
    
    # ── Components B+C: AI Analysis + Rule Induction (on anomaly/drift) ────────
    trigger_always = ai_config.get("trigger", "on_anomaly") == "always"
    if ai_enabled and (trigger_always or is_anomaly or quality_score < (quality_threshold - 15) or
                       (profile_report and profile_report.get("total_drifted_columns", 0) > 0)):
        try:
            from ai_rule_advisor import get_ai_advisor
            advisor = get_ai_advisor()
            if advisor:
                quality_context = {
                    "is_anomaly": is_anomaly,
                    "quality_score": quality_score,
                    "current_threshold": quality_threshold,
                    "historical_avg": 100.0 - (sum(historical_rates) / len(historical_rates) * 100) if historical_rates else 90.0,
                    "z_score": z_score,
                    "schema_drift_detected": drift_detected,
                    "quarantine_rate": current_quarantine_rate,
                    "table_name": table_name,
                    "trigger_always": trigger_always
                }
                
                if trigger_always or advisor.should_trigger(quality_context) or \
                   (profile_report and profile_report.get("total_drifted_columns", 0) > 0):
                    max_ai_rows = ai_config.get("max_rows_to_analyze", 50)
                    # Sample quarantined rows from persisted Delta Lake
                    try:
                        sample_rows = [
                            row.asDict() for row in spark.read.format("delta").load(quarantine_path)
                            .filter(F.col("run_id") == run_id)
                            .limit(max_ai_rows).collect()
                        ]
                    except Exception as sample_err:
                        print(f"[DYNAMIC ENGINE] Failed to read quarantine sample from Delta: {sample_err}")
                        sample_rows = []
                    
                    # Gather column statistics
                    col_stats = {}
                    if value_range_profile:
                        col_stats["value_ranges"] = value_range_profile
                    col_stats["quarantine_breakdown"] = quarantine_breakdown
                    
                    historical_ctx = {
                        "avg_quality": quality_context["historical_avg"],
                        "current_quality": quality_score,
                        "current_threshold": quality_threshold,
                        "total_records": total_records,
                        "quarantined_records": quarantine_count,
                        "primary_key": primary_key if isinstance(primary_key, str) else ",".join(pk_cols) if pk_cols else "unknown",
                        "date_column": date_column or "unknown"
                    }
                    
                    # ── Component B: Profile-Based Analysis (enhanced heuristic + drift) ──
                    if profile_report and not profile_report.get("is_first_run"):
                        analysis = advisor.run_profile_based_analysis(
                            table_name, sample_rows, col_stats, historical_ctx,
                            profile_report=profile_report
                        )
                    else:
                        analysis = advisor.ai_analyze_quarantined_sample(
                            table_name, sample_rows, col_stats, historical_ctx
                        )
                    
                    min_confidence = ai_config.get("confidence_threshold", 0.7)
                    if analysis and analysis.get("confidence", 0) >= min_confidence:
                        # Root Cause Fix: this used to auto-write suggested rules straight
                        # into rules_config.json whenever the LLM's own self-reported
                        # confidence was >= 0.90 — nothing independently verified that
                        # number, so a hijacked or simply overconfident model response
                        # could bypass the human-approval governance gate documented in
                        # README.md's "Schema Approval Gate" section entirely. Every
                        # AI-suggested rule change now always goes through the same
                        # PENDING proposal + human approve/reject path as everything else
                        # (api/app/api/dynamic_rules.py's /ai-proposals/{id}/approve,
                        # which enforces its own independent guardrails).
                        advisor.log_proposal_to_es(table_name, run_id, analysis)
                        method = analysis.get("analysis_metadata", {}).get("method", "unknown")
                        print(f"[DYNAMIC ENGINE] Analysis complete ({method}). Root cause: {analysis.get('root_cause', 'N/A')}")
                        print(f"[DYNAMIC ENGINE] Suggested {len(analysis.get('suggested_rules', []))} rules. Confidence: {analysis.get('confidence', 0):.0%}")
                        remediation_logs.append(f"ai_advisor_triggered_confidence_{analysis.get('confidence', 0):.2f}")
                    else:
                        print(f"[DYNAMIC ENGINE] Analysis returned low confidence. No proposal created.")
                    
                    # ── Component C: Decision Tree Rule Induction (only on anomaly) ──
                    if is_anomaly and quarantine_count >= 10:
                        try:
                            # Get numeric columns for features
                            numeric_features = profile_report.get("numeric_columns", []) if profile_report else []
                            if not numeric_features:
                                from pyspark.sql.types import IntegerType, LongType, FloatType, DoubleType, ShortType, DecimalType
                                numeric_types = (IntegerType, LongType, FloatType, DoubleType, ShortType, DecimalType)
                                try:
                                    active_df_check = spark.read.format("delta").load(active_path)
                                    numeric_features = [f.name for f in active_df_check.schema.fields
                                                        if isinstance(f.dataType, numeric_types)]
                                except Exception:
                                    numeric_features = []
                            
                            if len(numeric_features) >= 2:
                                clean_for_tree = spark.read.format("delta").load(active_path)
                                quarantine_for_tree = spark.read.format("delta").load(quarantine_path) \
                                    .filter(F.col("run_id") == run_id)
                                
                                induction_result = advisor.induce_rules_from_data(
                                    spark, clean_for_tree, quarantine_for_tree,
                                    numeric_features, table_name, run_id
                                )
                                
                                n_induced = len(induction_result.get("induced_rules", []))
                                if n_induced > 0:
                                    auc = induction_result.get("model_accuracy", 0)
                                    # Root Cause Fix: same governance gap as the LLM path above —
                                    # a high AUC on this run's small quarantine sample doesn't
                                    # guarantee the induced rule generalizes; it must go through
                                    # human approval like every other rule change, not write
                                    # straight to rules_config.json.
                                    print(f"[DYNAMIC ENGINE] Decision Tree induced {n_induced} rules (AUC={auc:.4f}) — logged as a pending proposal for review.")
                                    remediation_logs.append(f"decision_tree_induced_{n_induced}_rules_auc_{auc:.2f}")
                        except Exception as dt_err:
                            print(f"[DYNAMIC ENGINE] Decision Tree induction failed (non-fatal): {dt_err}")
                    
        except ImportError:
            print(f"[DYNAMIC ENGINE] ai_rule_advisor module not available. Skipping AI analysis.")
        except Exception as ai_err:
            print(f"[DYNAMIC ENGINE] AI analysis failed (non-fatal): {ai_err}")


    # 4.2 Weighted Operational COPDQ Score (Task 4 with Bug 5 Row-Level Max Weight Fix)
    column_weights = rules.get("column_weights", {})
    pk_weight = column_weights.get(primary_key if isinstance(primary_key, str) else pk_cols[0], 1.0)
    date_weight = column_weights.get(date_column, 0.5) if date_column else 0.5
    
    operational_impact_score = 0.0
    if total_records > 0 and quarantine_count > 0:
        try:
            # Build Spark expression to calculate max failure weight per row
            weight_col = F.lit(0.0)
            weight_col = F.when(
                F.col("reject_reason").contains("primary") | F.col("reject_reason").contains("duplicate"),
                F.lit(pk_weight)
            ).otherwise(weight_col)
            
            weight_col = F.when(
                F.col("reject_reason").contains("date"),
                F.greatest(weight_col, F.lit(date_weight))
            ).otherwise(weight_col)
            
            for col, w in column_weights.items():
                pks = primary_key if isinstance(primary_key, list) else [primary_key]
                if col not in pks and col != date_column:
                    weight_col = F.when(
                        F.col("reject_reason").contains(col),
                        F.greatest(weight_col, F.lit(w))
                    ).otherwise(weight_col)
            
            weight_col = F.when(
                (F.col("reject_reason") != "") & (F.col("reject_reason").isNotNull()),
                F.greatest(weight_col, F.lit(0.2))
            ).otherwise(weight_col)
            
            sum_val = all_quarantined.select(F.sum(weight_col)).collect()[0][0]
            sum_of_max_row_weights = float(sum_val) if sum_val is not None else 0.0
            operational_impact_score = (sum_of_max_row_weights / total_records) * 100.0
        except Exception as e:
            print(f"Error calculating row-level weighted score: {e}")
            operational_impact_score = (float(quarantine_count) / float(total_records)) * 100.0
    print(f"Weighted Operational Impact Score: {operational_impact_score:.2f}%")

    # Log operational run metrics to Elasticsearch
    finished_at = datetime.now(timezone.utc)
    quality_run_doc = {
        "run_id": run_id,
        "ingest_id": ingest_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round((finished_at - started_at).total_seconds(), 3),
        "table_name": table_name,
        "total_records": total_records,
        "clean_records": clean_count,
        "quarantined_records": quarantine_count,
        "quality_score": quality_score,
        "freshness_lag_hours": max_lag_hours,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "quarantined_financial_value": quarantined_financial_value,
        "operational_impact_score": operational_impact_score,
        "z_score": z_score,
        "is_anomaly": is_anomaly,
        "remediation_logs": remediation_logs,
        "auto_cleaned": auto_clean
    }
    if class_balance:
        quality_run_doc["class_balance"] = class_balance
        quality_run_doc["class_balance_column"] = group_col
    if quarantine_breakdown:
        quality_run_doc["quarantine_breakdown"] = quarantine_breakdown
    # Dynamic Rules metadata: log which mode was used and computed thresholds
    quality_run_doc["rules_mode"] = "adaptive" if isinstance(rules.get("quality_score_threshold"), dict) else "static"
    quality_run_doc["effective_quality_threshold"] = quality_threshold
    quality_run_doc["effective_freshness_threshold"] = freshness_limit_hours
    if value_range_profile:
        quality_run_doc["value_range_profile"] = value_range_profile

    # Inject tracked fallback rate metrics
    global LATEST_FALLBACK_METRICS
    if LATEST_FALLBACK_METRICS:
        quality_run_doc["fallback_metrics"] = dict(LATEST_FALLBACK_METRICS)
        LATEST_FALLBACK_METRICS = {}

    log_to_elasticsearch("sdoqap_quality_runs", quality_run_doc)

    log_to_elasticsearch("sdoqap_lineage_runs", {
        "run_id": run_id,
        "ingest_id": ingest_id,
        "source_table": f"raw-{table_name}",
        "target_table": f"active-{table_name}",
        "source_path": raw_path,
        "target_path": active_path,
        "quarantine_path": quarantine_path,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    log_to_elasticsearch("sdoqap_pipeline_runs", {
        "run_id": run_id,
        "ingest_id": ingest_id,
        "table_name": table_name,
        "state": "success" if quality_score >= quality_threshold else "warnings",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    print(f"Quality validation completed. Quality Score: {quality_score:.2f}% (threshold={quality_threshold}%)")

    # ─── Track 3: Downstream Event-Driven Trigger ─────────────────────────────
    if quality_score >= quality_threshold:
        try:
            print("[DYNAMIC ENGINE] Automatically triggering downstream Gold Layer rebuild locally...")
            import subprocess
            gold_script = "/opt/spark-apps/spark_gold_layer.py"
            if not os.path.exists(gold_script):
                gold_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spark_gold_layer.py")
            subprocess.Popen(["python", gold_script])
            print("[DYNAMIC ENGINE] Gold Layer rebuild triggered successfully in background.")
        except Exception as gold_err:
            print(f"[DYNAMIC ENGINE] Local downstream trigger failed (non-fatal): {gold_err}")

    # ─── Raw landing → archive (keep the source so any ingestion can be reprocessed) ───
    try:
        if ingest_id:
            src, dst = archive_paths(input_table_name, ingest_id)
            if hdfs_exists(src):
                fs.mkdirs(HPath(dst).getParent())
                fs.rename(HPath(src), HPath(dst))
                print(f"[ARCHIVE] Moved {src} -> {dst}")
        else:
            cleanup_target = input_table_name or table_name
            raw_dir_path = HPath(f"/data/raw/{cleanup_target}")
            if fs.exists(raw_dir_path) and quarantine_count == 0:
                print(f"[CLEANUP] Legacy run: deleting raw folder with 0 quarantined records: {raw_dir_path}")
                fs.delete(raw_dir_path, True)
    except Exception as cleanup_err:
        print(f"[ARCHIVE] Warning: could not archive raw input: {cleanup_err}")

    heartbeat.stop()

    # FIX 2A: Release the distributed lock after all work is done
    release_lock(table_name)
    spark.stop()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Spark Quality Engine")
    parser.add_argument("table", nargs='?', default="users", help="Target table name")
    parser.add_argument("--force", action="store_true", help="Force lock acquisition, overriding existing locks")
    parser.add_argument("--ingest-id", default=None, help="Process only /data/raw/<table>/<ingest_id> (set by the trigger daemon)")
    args = parser.parse_args()
    target_table = args.table
    FORCE_LOCK = args.force
    INGEST_ID = args.ingest_id

    # Load canonical schema registry config from ES or default fallbacks
    spec = load_expected_schema(target_table)

    if spec:
        # Resolve table name from spec if it was fuzzy matched
        normalized_target = normalize_name(target_table)
        matched_table_name = target_table
        default_registry_tables = ["mbti", "users", "benchmark_test"]
        for tbl in default_registry_tables:
            if normalize_name(tbl) == normalized_target:
                matched_table_name = tbl
                break
        
        if run_quality_check(matched_table_name, spec["primary_key"], spec["date_column"], spec["schema_spec"],
                             input_table_name=target_table, ingest_id=INGEST_ID) == "SKIPPED":
            sys.exit(EXIT_SKIPPED)
    else:
        print(f"Table '{target_table}' not found in registry. Inferring configuration dynamically...")
        # Resolve configuration dynamically using the standard Spark session
        temp_spark = get_spark_session(f"SDOQAP_Infer_{target_table}")

        raw_path, recursive_read = raw_read_path(HDFS_URL, target_table, INGEST_ID)
        try:
            # 1. Read raw strings to preserve exact values
            df_raw = temp_spark.read.option("header", "true").option("multiLine", "true").option("escape", "\"").option("quote", "\"").option("recursiveFileLookup", "true" if recursive_read else "false").csv(raw_path)

            # ─── GUARD: Empty file protection in schema inference ───
            if len(df_raw.columns) == 0 or df_raw.head(1) is None or len(df_raw.head(1)) == 0:
                print(f"SKIPPED: Raw data for '{target_table}' is empty. Nothing to infer.")
                temp_spark.stop()
                sys.exit(EXIT_SKIPPED)

            for col_name in df_raw.columns:
                cleaned_col = clean_column_name(col_name)
                if col_name != cleaned_col:
                    df_raw = df_raw.withColumnRenamed(col_name, cleaned_col)

            # 2. Read with inferSchema to get Spark's baseline guesses
            df_infer = temp_spark.read.option("header", "true").option("inferSchema", "true").option("multiLine", "true").option("escape", "\"").option("quote", "\"").option("recursiveFileLookup", "true" if recursive_read else "false").csv(raw_path)
            for col_name in df_infer.columns:
                cleaned_col = clean_column_name(col_name)
                if col_name != cleaned_col:
                    df_infer = df_infer.withColumnRenamed(col_name, cleaned_col)
            
            # 3. Deterministic Profiling (Full 100% Dataset Pass)
            # We check EVERY row to see if ANY row contains a leading zero (e.g. '01234')
            agg_exprs = []
            for col in df_raw.columns:
                agg_exprs.append(
                    F.max(F.when(F.col(col).rlike("^0[0-9]+$"), 1).otherwise(0)).alias(f"{col}_has_leading_zero")
                )
            
            # Execute full dataset scan
            profile_row = df_raw.agg(*agg_exprs).collect()[0]
            
            schema_spec = {}
            for field in df_infer.schema.fields:
                col = field.name
                inferred_type = field.dataType.__class__.__name__
                has_leading_zero = profile_row[f"{col}_has_leading_zero"] == 1
                
                if has_leading_zero:
                    # Root Cause Fix: 100% Guarantee no leading zeros are lost
                    schema_spec[col] = "StringType"
                else:
                    # Safe to use Spark's inferred type (Integer, Double, Timestamp, etc.)
                    schema_spec[col] = inferred_type

            columns = list(schema_spec.keys())

            # 1. Infer Primary Key
            primary_key = None
            # Look for exact match first
            for col in columns:
                if col.lower() == "id" or col.lower() == f"{target_table}_id" or col.lower() == f"{target_table}id":
                    primary_key = col
                    break
            # Look for sub-string match
            if not primary_key:
                for col in columns:
                    if "id" in col.lower():
                        primary_key = col
                        break
            # Default to row_hash if no natural ID found
            if not primary_key:
                primary_key = "row_hash"
                schema_spec["row_hash"] = "StringType"

            # 2. Infer Date Column
            date_column = None
            for col in columns:
                if col.lower() in ["updated_at", "created_at", "timestamp", "date", "time"]:
                    date_column = col
                    break
            if not date_column:
                for col in columns:
                    if "date" in col.lower() or "time" in col.lower() or "timestamp" in col.lower():
                        date_column = col
                        break

            print(f"Inferred configuration for '{target_table}':")
            print(f"  Primary Key: {primary_key}")
            print(f"  Date Column: {date_column}")
            print(f"  Schema Spec: {schema_spec}")

            inferred_spec = {
                "primary_key": primary_key,
                "date_column": date_column,
                "schema_spec": schema_spec
            }

            # Save inferred registry config to ES sdoqap_schema_registry
            save_registry_to_es(target_table, inferred_spec)

            # Auto-generate dynamic rules configuration for new table
            try:
                from dynamic_rules_engine import generate_rules_from_schema
                generate_rules_from_schema(target_table, schema_spec, primary_key, date_column)
            except Exception as ar_err:
                print(f"[DYNAMIC_RULES] Failed to generate default rules for '{target_table}': {ar_err}")

            # Stop the temporary Spark session so that the main job can run on the cluster
            temp_spark.stop()

            # Now execute quality check with inferred schema
            if run_quality_check(target_table, primary_key, date_column, schema_spec, ingest_id=INGEST_ID) == "SKIPPED":
                sys.exit(EXIT_SKIPPED)

        except Exception as infer_err:
            print(f"Failed to infer schema dynamically for '{target_table}': {infer_err}")
            # Write a failed run document to ES
            run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
            doc = {
                "run_id": run_id,
                "table_name": target_table,
                "state": "failed",
                "error_msg": f"Failed to infer schema: {str(infer_err)}",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            try:
                log_to_elasticsearch("sdoqap_pipeline_runs", doc)
            except Exception:
                pass
            temp_spark.stop()
            sys.exit(1)
