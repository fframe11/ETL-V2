import os
import io
import requests
import pandas as pd
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from elasticsearch import Elasticsearch

router = APIRouter(prefix="/api/v1/export", tags=["Data Export"])

from .config import get_elasticsearch_url
ELASTICSEARCH_URL = get_elasticsearch_url()

_es_client = None

def get_es():
    global _es_client
    if _es_client is None:
        try:
            _es_client = Elasticsearch(ELASTICSEARCH_URL)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to connect to Elasticsearch: {str(e)}")
    return _es_client


from urllib.parse import urlparse, urlunparse
import json

def _resolve_schema_registry_path() -> str:
    candidates = [
        "/opt/spark-apps/schema_registry.json",
        os.path.normpath(
            os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "..", "..", "..", "spark", "schema_registry.json")
        ),
        os.path.join(os.getcwd(), "spark", "schema_registry.json"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return candidates[1]


def load_registered_schema_columns(table_name: str):
    """Load column names from schema_registry.json for a given table."""
    schema_path = _resolve_schema_registry_path()
    if os.path.exists(schema_path):
        try:
            with open(schema_path, "r", encoding="utf-8") as f:
                registry = json.load(f)
                table_conf = registry.get(table_name)
                if table_conf and "schema_spec" in table_conf:
                    return list(table_conf["schema_spec"].keys())
        except Exception:
            pass
    return None


def replace_hdfs_redirect_host(redirect_url: str) -> str:
    """Robustly parse redirect URL and replace container ID/localhost with 'datanode' service name."""
    parsed = urlparse(redirect_url)
    port = parsed.port or 9864
    new_parsed = parsed._replace(netloc=f"datanode:{port}")
    return urlunparse(new_parsed)


def read_hdfs_file(path: str) -> bytes:
    """Read full file content from WebHDFS (follows redirection to datanode)."""
    webhdfs_url = f"http://namenode:9870/webhdfs/v1{path}?op=OPEN&user.name=spark"
    try:
        r = requests.get(webhdfs_url, allow_redirects=False, timeout=10)
        if r.status_code == 307:
            redirect_url = replace_hdfs_redirect_host(r.headers["Location"])
            r2 = requests.get(redirect_url, timeout=20)
            if r2.status_code == 200:
                return r2.content
            raise HTTPException(status_code=500, detail=f"Failed to fetch from datanode: HTTP {r2.status_code}")
        elif r.status_code == 200:
            return r.content
        raise HTTPException(status_code=r.status_code, detail=f"WebHDFS read failed: {r.text}")
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HDFS read exception: {str(e)}")


def stream_hdfs_file_raw(path: str):
    """Stream large raw files from WebHDFS in chunks."""
    webhdfs_url = f"http://namenode:9870/webhdfs/v1{path}?op=OPEN&user.name=spark"
    try:
        r = requests.get(webhdfs_url, allow_redirects=False, timeout=10)
        if r.status_code == 307:
            redirect_url = replace_hdfs_redirect_host(r.headers["Location"])
            r2 = requests.get(redirect_url, stream=True, timeout=30)
            r2.raise_for_status()
            for chunk in r2.iter_content(chunk_size=16384):
                yield chunk
        elif r.status_code == 200:
            for chunk in r.iter_content(chunk_size=16384):
                yield chunk
        else:
            raise HTTPException(status_code=r.status_code, detail=f"WebHDFS stream failed: {r.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HDFS stream exception: {str(e)}")


def read_parquet_folder_to_df(hdfs_folder: str) -> pd.DataFrame:
    """Read Delta Lake table correctly by parsing _delta_log to find active Parquet files only.
    
    Delta Lake stores transaction history in _delta_log/. Each commit JSON lists
    which .parquet files were 'add'ed or 'remove'd. We parse the latest commit
    to read ONLY the currently active files, preventing data duplication from
    historical commits.
    
    Fallback: If no _delta_log exists (plain Parquet folder), reads all .parquet files.
    """
    import json

    # Step 1: Check if _delta_log exists (i.e., this is a Delta table)
    delta_log_url = f"http://namenode:9870/webhdfs/v1{hdfs_folder}/_delta_log?op=LISTSTATUS&user.name=spark"
    is_delta = False
    active_files = set()

    try:
        r_log = requests.get(delta_log_url, timeout=10)
        if r_log.status_code == 200:
            log_files = r_log.json().get("FileStatuses", {}).get("FileStatus", [])
            # Get all .json commit files sorted (00000000000000000000.json, etc.)
            commit_files = sorted(
                [f["pathSuffix"] for f in log_files if f["pathSuffix"].endswith(".json")],
                reverse=True
            )
            if commit_files:
                is_delta = True
                # Parse ALL commits from oldest to newest to reconstruct the active file set
                for commit_file in sorted(commit_files):
                    commit_path = f"{hdfs_folder}/_delta_log/{commit_file}"
                    try:
                        commit_content = read_hdfs_file(commit_path)
                        for line in commit_content.decode("utf-8").strip().split("\n"):
                            entry = json.loads(line)
                            if "add" in entry:
                                active_files.add(entry["add"]["path"])
                            if "remove" in entry:
                                active_files.discard(entry["remove"]["path"])
                    except Exception:
                        continue
    except Exception:
        pass  # Not a Delta table or _delta_log inaccessible, fall back to plain read

    if is_delta and active_files:
        # Read only the currently active Parquet files from the Delta table
        dfs = []
        for file_path in active_files:
            full_path = f"{hdfs_folder}/{file_path}"
            try:
                content = read_hdfs_file(full_path)
                df = pd.read_parquet(io.BytesIO(content))
                dfs.append(df)
            except Exception:
                continue
        if not dfs:
            raise HTTPException(status_code=404, detail=f"No active Parquet data in Delta table {hdfs_folder}")
        return pd.concat(dfs, ignore_index=True)

    # Fallback: Plain Parquet folder (no _delta_log)
    list_url = f"http://namenode:9870/webhdfs/v1{hdfs_folder}?op=LISTSTATUS&user.name=spark"
    try:
        r = requests.get(list_url, timeout=10)
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail=f"HDFS path {hdfs_folder} not found")
        r.raise_for_status()
        
        files = r.json().get("FileStatuses", {}).get("FileStatus", [])
        parquet_files = [f["pathSuffix"] for f in files if f["pathSuffix"].endswith(".parquet")]
        
        if not parquet_files:
            raise HTTPException(status_code=404, detail=f"No parquet data files found in {hdfs_folder}")
            
        dfs = []
        for file_name in parquet_files:
            file_path = f"{hdfs_folder}/{file_name}"
            content = read_hdfs_file(file_path)
            df = pd.read_parquet(io.BytesIO(content))
            dfs.append(df)
            
        if not dfs:
            raise HTTPException(status_code=404, detail="No datasets could be loaded")
            
        return pd.concat(dfs, ignore_index=True)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading Parquet dataset: {str(e)}")


def load_primary_key(table_name: str) -> str:
    """Load primary key from schema_registry.json for a given table."""
    schema_path = _resolve_schema_registry_path()
    if os.path.exists(schema_path):
        try:
            with open(schema_path, "r", encoding="utf-8") as f:
                registry = json.load(f)
                table_conf = registry.get(table_name)
                if table_conf and "primary_key" in table_conf:
                    return table_conf["primary_key"]
        except Exception:
            pass
    return None


def prepare_df_for_export(df: pd.DataFrame, table_name: str = None) -> bytes:
    """Clean DataFrame for end-user export: drop internal columns, fix types, sort, encode for Excel.
    
    This ensures that ALL exported data is immediately ready-to-use:
    1. Strips internal pipeline metadata columns (run_id, __index_level_0__)
    2. Sorts data logically by date (ascending), product name (ascending), then primary key (ascending)
    3. Preserves integer types (prevents 1 → 1.0 float conversion)
    4. Encodes with UTF-8 BOM for proper Thai/Unicode display in Excel on Windows
    """
    internal_cols = ["run_id", "__index_level_0__"]
    for col in internal_cols:
        if col in df.columns:
            df = df.drop(columns=[col])
            
    # Generic sorting hierarchy for human readability
    sort_by_cols = []
    
    # 1. Date column candidates
    date_candidates = ["วันที่", "date", "Date", "order_date", "created_at"]
    date_col = next((c for c in date_candidates if c in df.columns), None)
    if date_col:
        sort_by_cols.append(date_col)
        
    # 2. Product/Category column candidates
    prod_candidates = ["รายการสินค้า", "product", "product_name", "category"]
    prod_col = next((c for c in prod_candidates if c in df.columns), None)
    if prod_col:
        sort_by_cols.append(prod_col)
        
    # 3. Primary Key
    if table_name:
        pk = load_primary_key(table_name)
        if pk and pk in df.columns and pk not in sort_by_cols:
            sort_by_cols.append(pk)
            
    if sort_by_cols:
        try:
            # Sort values naturally (placing NAs at the end)
            df = df.sort_values(by=sort_by_cols, ascending=[True] * len(sort_by_cols), na_position='last')
        except Exception:
            pass
                
    df = df.convert_dtypes()
    return df.to_csv(index=False).encode("utf-8-sig")


@router.get("/tables")
def list_export_tables():
    """List all available tables across active, raw, and quarantine layers."""
    tables_map = {}
    
    # helper to check paths
    def check_layer(path, layer_name):
        url = f"http://namenode:9870/webhdfs/v1{path}?op=LISTSTATUS&user.name=spark"
        try:
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                files = r.json().get("FileStatuses", {}).get("FileStatus", [])
                for f in files:
                    if f["type"] == "DIRECTORY":
                        t_name = f["pathSuffix"]
                        if t_name not in tables_map:
                            tables_map[t_name] = []
                        tables_map[t_name].append(layer_name)
        except Exception:
            pass

    check_layer("/data/raw", "raw")
    check_layer("/data/active", "active")
    check_layer("/data/quarantine", "quarantine")
    
    # Reddit streaming dataset check
    has_reddit = False
    try:
        r = requests.get("http://namenode:9870/webhdfs/v1/data/reddit/parquet?op=LISTSTATUS&user.name=spark", timeout=5)
        if r.status_code == 200:
            has_reddit = True
    except Exception:
        pass

    results = []
    for name, layers in tables_map.items():
        results.append({"name": name, "layers": layers})
        
    return {
        "tables": results,
        "reddit_available": has_reddit
    }


@router.delete("/tables/{table_name}")
def delete_table(table_name: str):
    """Delete a table across HDFS layers, ES metadata indices, and local configs."""
    es = get_es()
    
    # 1. Delete from HDFS
    layers = ["/data/raw", "/data/active", "/data/quarantine"]
    deleted_layers = []
    for layer in layers:
        hdfs_path = f"{layer}/{table_name}"
        webhdfs_url = f"http://namenode:9870/webhdfs/v1{hdfs_path}?op=DELETE&recursive=true&user.name=spark"
        try:
            r = requests.delete(webhdfs_url, timeout=10)
            if r.status_code == 200:
                deleted_layers.append(layer.split("/")[-1])
        except Exception as e:
            print(f"[DELETE TABLE] Failed to delete HDFS path {hdfs_path}: {e}")
            
    # 2. Delete Elasticsearch entries
    indices_to_clean = {
        "sdoqap_quality_runs": "table_name.keyword",
        "sdoqap_pipeline_runs": "table_name.keyword",
        "sdoqap_schema_drifts": "table_name.keyword",
        "sdoqap_schema_proposals": "table_name.keyword",
        "sdoqap_ai_rule_proposals": "table_name.keyword",
        "sdoqap_unmapped_terms": "table_name.keyword",
        "sdoqap_upstream_remediations": "table_name.keyword"
    }
    
    for idx, field in indices_to_clean.items():
        try:
            if es.indices.exists(index=idx):
                es.delete_by_query(
                    index=idx,
                    body={"query": {"term": {field: table_name}}},
                    refresh=True
                )
        except Exception as e:
            print(f"[DELETE TABLE] Failed to delete from ES index {idx}: {e}")
            
    # Delete from sdoqap_rules_registry and sdoqap_schema_registry
    for idx in ["sdoqap_rules_registry", "sdoqap_schema_registry"]:
        try:
            if es.indices.exists(index=idx) and es.exists(index=idx, id=table_name):
                es.delete(index=idx, id=table_name, refresh=True)
        except Exception as e:
            print(f"[DELETE TABLE] Failed to delete document from {idx}: {e}")
            
    # 3. Delete from local rules_config.json
    try:
        from .dynamic_rules import _resolve_rules_path, _load_rules_config, _save_rules_config
        rules_path = _resolve_rules_path()
        if os.path.exists(rules_path):
            config = _load_rules_config()
            if table_name in config:
                del config[table_name]
                _save_rules_config(config)
    except Exception as e:
        print(f"[DELETE TABLE] Failed to remove table from rules_config.json: {e}")
        
    # 4. Delete from local schema_registry.json
    try:
        from .schema import SCHEMA_REGISTRY_PATH
        if os.path.exists(SCHEMA_REGISTRY_PATH):
            with open(SCHEMA_REGISTRY_PATH, "r", encoding="utf-8") as f:
                schema_registry = json.load(f)
            if table_name in schema_registry:
                del schema_registry[table_name]
                with open(SCHEMA_REGISTRY_PATH, "w", encoding="utf-8") as f:
                    json.dump(schema_registry, f, indent=2, ensure_ascii=False)
                    f.write("\n")
    except Exception as e:
        print(f"[DELETE TABLE] Failed to remove table from schema_registry.json: {e}")
        
    return {
        "status": "success",
        "message": f"Table '{table_name}' and all associated metadata deleted successfully.",
        "hdfs_deleted_layers": deleted_layers
    }


@router.get("/preview/{layer}/{table_name}")
def get_dataset_preview(layer: str, table_name: str):
    """Get a 10-row JSON preview of the dataset from HDFS raw, active, or quarantine layers."""
    try:
        if layer == "raw":
            # Read first few lines of CSV
            file_path = f"/data/raw/{table_name}/{table_name}.csv"
            webhdfs_url = f"http://namenode:9870/webhdfs/v1{file_path}?op=OPEN&user.name=spark"
            r = requests.get(webhdfs_url, allow_redirects=False, timeout=10)
            if r.status_code == 307:
                redirect_url = r.headers["Location"]
                redirect_url = redirect_url.replace("localhost:", "datanode:").replace("127.0.0.1:", "datanode:")
                r2 = requests.get(redirect_url, timeout=10)
                if r2.status_code == 200:
                    df = pd.read_csv(io.StringIO(r2.text), nrows=10)
                    return {"columns": list(df.columns), "rows": df.to_dict(orient="records")}
            elif r.status_code == 200:
                df = pd.read_csv(io.StringIO(r.text), nrows=10)
                return {"columns": list(df.columns), "rows": df.to_dict(orient="records")}
            raise HTTPException(status_code=404, detail="Raw CSV file not found")
            
        elif layer in ("active", "quarantine"):
            folder_path = f"/data/{layer}/{table_name}"
            try:
                df = read_parquet_folder_to_df(folder_path)
                preview_df = df.head(10)
                return {"columns": list(preview_df.columns), "rows": preview_df.to_dict(orient="records")}
            except HTTPException as he:
                if he.status_code == 404:
                    cols = load_registered_schema_columns(table_name)
                    if cols:
                        return {"columns": cols, "rows": []}
                raise he
            
        elif layer == "reddit":
            folder_path = f"/data/reddit/parquet/subreddit={table_name}"
            df = read_parquet_folder_to_df(folder_path)
            df["subreddit"] = table_name
            preview_df = df.head(10)
            return {"columns": list(preview_df.columns), "rows": preview_df.to_dict(orient="records")}
            
        else:
            raise HTTPException(status_code=400, detail="Invalid layer name")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview generation error: {str(e)}")


@router.get("/raw/{table_name}")
def export_raw_data(table_name: str):
    """Download the raw CSV file directly from HDFS raw storage."""
    file_path = f"/data/raw/{table_name}/{table_name}.csv"
    
    # Fast check if file exists
    check_url = f"http://namenode:9870/webhdfs/v1{file_path}?op=GETFILESTATUS&user.name=spark"
    try:
        r = requests.get(check_url, timeout=5)
        if r.status_code != 200:
            raise HTTPException(status_code=404, detail=f"Raw dataset file not found for table '{table_name}'")
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(
        stream_hdfs_file_raw(file_path),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={table_name}_raw.csv"}
    )


@router.get("/active/{table_name}")
def export_active_data(table_name: str, limit: int = None):
    """Download clean Silver active dataset as CSV."""
    try:
        df = read_parquet_folder_to_df(f"/data/active/{table_name}")
        if limit:
            df = df.head(limit)
        csv_bytes = prepare_df_for_export(df, table_name)
        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": f"attachment; filename={table_name}_active.csv"}
        )
    except HTTPException as he:
        if he.status_code == 404:
            cols = load_registered_schema_columns(table_name)
            if cols:
                csv_str = ",".join(cols) + "\n"
                return Response(
                    content=csv_str.encode("utf-8-sig"),
                    media_type="text/csv; charset=utf-8-sig",
                    headers={"Content-Disposition": f"attachment; filename={table_name}_active.csv"}
                )
        raise he


@router.get("/quarantine/{table_name}")
def export_quarantine_data(table_name: str, limit: int = None):
    """Download quarantined records dataset as CSV."""
    try:
        df = read_parquet_folder_to_df(f"/data/quarantine/{table_name}")
        if limit:
            df = df.head(limit)
        csv_bytes = prepare_df_for_export(df, table_name)
        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": f"attachment; filename={table_name}_quarantine.csv"}
        )
    except HTTPException as he:
        if he.status_code == 404:
            cols = load_registered_schema_columns(table_name)
            if cols:
                # Add quarantine metadata columns to headers
                meta_cols = cols + ["is_invalid", "reject_reason", "rejected_at"]
                csv_str = ",".join(meta_cols) + "\n"
                return Response(
                    content=csv_str.encode("utf-8-sig"),
                    media_type="text/csv; charset=utf-8-sig",
                    headers={"Content-Disposition": f"attachment; filename={table_name}_quarantine.csv"}
                )
        raise he


@router.get("/reddit")
def export_reddit_data(subreddit: str = "python", limit: int = None):
    """Download parsed Reddit streaming data from HDFS parquet files as CSV."""
    folder_path = f"/data/reddit/parquet/subreddit={subreddit}"
    df = read_parquet_folder_to_df(folder_path)
    
    # Inject subreddit name column since it is partitioned out in HDFS path
    df["subreddit"] = subreddit
    
    if limit:
        df = df.head(limit)
        
    csv_bytes = prepare_df_for_export(df)
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f"attachment; filename=reddit_{subreddit}.csv"}
    )


@router.get("/gold/{metric}")
def export_gold_metric(metric: str, days: int = 14):
    """Download aggregated Gold metrics from Elasticsearch as a clean CSV report."""
    es = get_es()
    index_name = f"sdoqap_gold_{metric.replace('-', '_')}"
    
    if not es.indices.exists(index=index_name):
        raise HTTPException(status_code=404, detail=f"Gold metric index '{index_name}' does not exist")
        
    try:
        res = es.search(
            index=index_name,
            body={
                "query": {
                    "range": {
                        "date": {
                            "gte": f"now-{days}d/d",
                            "lte": "now/d"
                        }
                    }
                },
                "size": 10000,
                "sort": [{"date": {"order": "desc"}}]
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        if not hits:
            raise HTTPException(status_code=404, detail=f"No gold metric records found in the last {days} days")
            
        data = [h["_source"] for h in hits]
        df = pd.DataFrame(data)
        
        # Sort column names for standard presentation
        df = df.reindex(sorted(df.columns), axis=1)
        
        csv_data = df.to_csv(index=False)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=gold_{metric}_{days}d.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch metrics export error: {str(e)}")
