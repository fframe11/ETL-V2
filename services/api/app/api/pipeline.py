import csv
import io
import os
import re
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/v1/pipeline",
    tags=["pipeline"]
)

from . import run_registry
from .auth import require_session, require_session_or_service_key
from .config import get_es_client, get_http_session
from .ingest_guards import (
    max_upload_bytes,
    read_upload_limited,
    run_readonly_query,
    safe_get,
    validate_rdbms_host,
)
from .validation import validate_table_name


def _daemon_url(path: str) -> str:
    return f"http://{os.getenv('SPARK_MASTER_HOST', 'spark-master')}:8099{path}"


def _daemon_headers() -> dict:
    return {"X-Trigger-Secret": os.getenv("TRIGGER_SHARED_SECRET", "")}


@router.get("")
def list_pipeline_runs(page: int = 1, size: int = 50, limit: int = 50, paginated: bool = False):
    """
    Retrieves the execution runs history from Elasticsearch with pagination.
    """
    es = get_es_client()
    try:
        if not es.indices.exists(index="sdoqap_pipeline_runs"):
            return {"data": [], "total": 0, "page": page, "size": size} if paginated else []
            
        actual_size = limit if limit != 50 else size
        from_idx = (page - 1) * actual_size
        
        # Prevent ES Deep Pagination memory blowup (> 10000 window limit)
        if from_idx + actual_size > 10000:
            raise HTTPException(
                status_code=400,
                detail="Deep pagination limit exceeded. Elasticsearch restricts offsets above 10,000 to prevent memory exhaustion."
            )
            
        res = es.search(
            index="sdoqap_pipeline_runs",
            query={"match_all": {}},
            sort=[{"timestamp": {"order": "desc"}}],
            from_=from_idx,
            size=actual_size
        )
        data = [hit["_source"] for hit in res["hits"]["hits"]]
        if paginated:
            total = res["hits"]["total"]["value"] if isinstance(res["hits"]["total"], dict) else res["hits"]["total"]
            return {"data": data, "total": total, "page": page, "size": actual_size}
        else:
            return data
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch query failed: {str(e)}")

@router.get("/{run_id}")
def get_pipeline_run_detail(run_id: str):
    """
    Retrieves detailed validation logs and metadata for a specific execution run.
    """
    es = get_es_client()
    try:
        if not es.indices.exists(index="sdoqap_pipeline_runs"):
            raise HTTPException(status_code=404, detail="Pipeline runs index 'sdoqap_pipeline_runs' not found.")
            
        # Get run details
        res_run = es.search(
            index="sdoqap_pipeline_runs",
            query={"term": {"run_id.keyword": run_id}}
        )
        hits_run = res_run["hits"]["hits"]
        if not hits_run:
            raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
        run_detail = hits_run[0]["_source"]
        
        # Get associated quality checks
        quality = []
        if es.indices.exists(index="sdoqap_quality_runs"):
            res_q = es.search(
                index="sdoqap_quality_runs",
                query={"term": {"run_id.keyword": run_id}}
            )
            quality = [hit["_source"] for hit in res_q["hits"]["hits"]]
            
        # Get schema drift logs
        drifts = []
        if es.indices.exists(index="sdoqap_schema_drifts"):
            res_d = es.search(
                index="sdoqap_schema_drifts",
                query={"term": {"run_id.keyword": run_id}}
            )
            drifts = [hit["_source"] for hit in res_d["hits"]["hits"]]
            
        # Check ES for acknowledgement
        is_ack = False
        try:
            if es.indices.exists(index="sdoqap_acknowledged_runs") and es.exists(index="sdoqap_acknowledged_runs", id=run_id):
                is_ack = True
        except Exception:
            pass

        return {
            "run_details": run_detail,
            "quality_audits": quality,
            "schema_drift_alerts": [] if is_ack else drifts,
            "is_acknowledged": is_ack
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch query failed: {str(e)}")

@router.post("/acknowledge/{run_id}")
def acknowledge_run_drift(run_id: str, _user: str = Depends(require_session)):
    """
    Acknowledges the schema drift for a specific execution run. Stored in ES for persistence.
    """
    es = get_es_client()
    try:
        from datetime import timezone
        es.index(
            index="sdoqap_acknowledged_runs",
            id=run_id,
            document={
                "run_id": run_id,
                "acknowledged_at": datetime.now(timezone.utc).isoformat()
            }
        )
        return {"status": "success", "run_id": run_id, "message": "Schema drift acknowledged and saved to Elasticsearch."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to persist acknowledgement in Elasticsearch: {str(e)}")


@router.post("/retry/{run_id}")
def retry_pipeline_run(run_id: str, _user: str = Depends(require_session)):
    """Reprocess an ingestion by its ingest_id (same raw folder, or its archived copy),
    or fall back to re-running a whole table from an older pipeline run id."""
    es = get_es_client()
    ingest = run_registry.get_run(es, run_id)
    if ingest:
        run_registry.update_run(es, run_id, "QUEUED", retried_at=datetime.now(timezone.utc).isoformat())
        try:
            trigger_spark_job(ingest["table_name"], run_id)
        except HTTPException as exc:
            run_registry.update_run(es, run_id, "TRIGGER_FAILED", error=str(exc.detail))
            raise
        return {"status": "queued", "ingest_id": run_id,
                "message": f"Ingest '{run_id}' re-queued for table '{ingest['table_name']}'."}

    if not es.indices.exists(index="sdoqap_pipeline_runs"):
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    res = es.search(index="sdoqap_pipeline_runs", query={"term": {"run_id.keyword": run_id}})
    hits = res["hits"]["hits"]
    if not hits:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    table_name = hits[0]["_source"].get("table_name")
    if not table_name:
        raise HTTPException(status_code=400, detail="Cannot retry: run document has no 'table_name'.")
    trigger_spark_job(table_name, None)
    return {"status": "queued", "message": f"Pipeline rerun queued for table '{table_name}'."}


class ApiIngestPayload(BaseModel):
    table_name: str
    url: str
    headers: Optional[dict] = None
    api_key: Optional[str] = None

class RedditIngestPayload(BaseModel):
    subreddits: str = "python"
    duration: int = 40

def upload_to_webhdfs(table_name: str, content: bytes, ingest_id: str) -> str:
    """Write one ingestion to its own folder /data/raw/<table>/<ingest_id>/ so a second
    upload can never overwrite, or be deleted together with, the first."""
    hdfs_path = f"{run_registry.raw_ingest_dir(table_name, ingest_id)}/{table_name}.csv"
    max_retries = 5
    retry_delay = 3
    for attempt in range(max_retries):
        try:
            webhdfs_url = f"http://namenode:9870/webhdfs/v1{hdfs_path}?op=CREATE&overwrite=true&user.name=spark"
            r1 = get_http_session().put(webhdfs_url, allow_redirects=False, timeout=5)
            if r1.status_code != 307:
                if "SafeModeException" in r1.text or r1.status_code == 403:
                    print(f"[WebHDFS] NameNode is in Safe Mode. Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
                    time.sleep(retry_delay)
                    continue
                raise HTTPException(status_code=500, detail=f"WebHDFS create handshake failed: HTTP {r1.status_code}")
            redirect_url = r1.headers["Location"].replace("localhost:", "datanode:").replace("127.0.0.1:", "datanode:")
            r2 = get_http_session().put(redirect_url, data=content, timeout=180)
            if r2.status_code not in (200, 201):
                if "SafeModeException" in r2.text:
                    time.sleep(retry_delay)
                    continue
                raise HTTPException(status_code=500, detail=f"WebHDFS write failed: HTTP {r2.status_code} - {r2.text}")
            return hdfs_path
        except HTTPException:
            if attempt == max_retries - 1:
                raise
            time.sleep(retry_delay)
        except Exception as e:
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail=f"WebHDFS upload exception: {str(e)}")
            print(f"[WebHDFS] Transient error: {e}. Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
            time.sleep(retry_delay)
    raise HTTPException(status_code=500, detail="WebHDFS upload failed after retries.")


def trigger_spark_job(table_name: str, ingest_id: Optional[str]) -> dict:
    """Ask the Spark trigger daemon to run the quality engine. There is deliberately no
    local fallback: the api image has no pyspark, so a fallback only pretended to run."""
    payload = {"table": table_name}
    if ingest_id:
        payload["ingest_id"] = ingest_id
    try:
        res = get_http_session().post(_daemon_url("/retry"), json=payload, headers=_daemon_headers(), timeout=5)
    except requests.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Spark trigger daemon is unreachable: {e}")
    if res.status_code not in (200, 202):
        raise HTTPException(status_code=503, detail=f"Spark trigger daemon refused the job (HTTP {res.status_code}).")
    return res.json()


def _normalize_col(name: str) -> str:
    # Mirrors normalize_name() in services/spark/spark_quality_engine.py.
    return re.sub(r"[\s\-_]", "", name or "").lower()


def missing_primary_key_columns(content: bytes, primary_key) -> list:
    """Fail fast in the API instead of after a 1-2 minute spark-submit: the engine
    cannot MERGE rows whose primary key column is absent."""
    if not primary_key or primary_key == "row_hash":
        return []
    first_line = content.split(b"\n", 1)[0].decode("utf-8-sig", errors="replace").strip("\r")
    header = next(csv.reader([first_line]), [])
    present = {_normalize_col(c) for c in header}
    keys = [primary_key] if isinstance(primary_key, str) else list(primary_key)
    return [k for k in keys if _normalize_col(k) not in present]


def _registered_primary_key(es, table_name: str):
    try:
        if not es.indices.exists(index="sdoqap_schema_registry"):
            return None
        return es.get(index="sdoqap_schema_registry", id=table_name)["_source"].get("primary_key")
    except Exception:
        return None


def land_and_queue(table_name: str, content: bytes, source: str, es=None) -> dict:
    """Extraction -> raw landing -> run registry -> trigger (activity diagram 4.3)."""
    es = es if es is not None else get_es_client()
    sha = run_registry.checksum(content)
    existing = run_registry.find_duplicate(es, table_name, sha)
    if existing:
        return {
            "status": "duplicate",
            "ingest_id": existing["ingest_id"],
            "run_state": existing["state"],
            "spark_triggered": False,
            "message": f"This exact file was already ingested for '{table_name}' (ingest {existing['ingest_id']}, "
                       f"{existing['state']}). POST /api/v1/pipeline/retry/{existing['ingest_id']} reprocesses it.",
        }
    missing = missing_primary_key_columns(content, _registered_primary_key(es, table_name))
    if missing:
        raise HTTPException(status_code=400, detail=f"File is missing primary key column(s) {missing} registered for '{table_name}'.")
    ingest_id = run_registry.new_ingest_id()
    upload_to_webhdfs(table_name, content, ingest_id)
    run_registry.create_run(es, table_name, ingest_id, sha, source, len(content))
    try:
        daemon = trigger_spark_job(table_name, ingest_id)
    except HTTPException as exc:
        run_registry.update_run(es, ingest_id, "TRIGGER_FAILED", error=str(exc.detail))
        raise
    return {
        "status": "queued",
        "ingest_id": ingest_id,
        "run_state": "QUEUED",
        "spark_triggered": True,
        "daemon_status": daemon.get("status"),
        "message": f"Data landed in HDFS for '{table_name}' and queued for the quality check (ingest {ingest_id}).",
    }


@router.get("/runs/{ingest_id}")
def get_ingest_run(ingest_id: str):
    validate_table_name(ingest_id, "ingest_id")
    run = run_registry.get_run(get_es_client(), ingest_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Ingest '{ingest_id}' not found.")
    return run


@router.post("/ingest/csv", status_code=202)
def ingest_csv(response: Response, table_name: str = Form(...), file: UploadFile = File(...),
               _user: str = Depends(require_session_or_service_key)):
    """Ingest an uploaded CSV or Excel file into its own raw folder and queue the quality check."""
    validate_table_name(table_name)
    filename = (file.filename or "").lower()
    content = read_upload_limited(file, max_upload_bytes())
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if filename.endswith((".xlsx", ".xls")):
        try:
            import pandas as pd
            content = pd.read_excel(io.BytesIO(content)).to_csv(index=False).encode("utf-8")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to convert Excel to CSV: {str(e)}")
    result = land_and_queue(table_name, content, source="file")
    if result["status"] == "duplicate":
        response.status_code = 200
    return result

@router.post("/ingest/api", status_code=202)
def ingest_api(payload: ApiIngestPayload, response: Response, _user: str = Depends(require_session_or_service_key)):
    """
    Downloads JSON data from an API, converts it to CSV, writes it to HDFS, and triggers Spark.
    """
    table_name = validate_table_name(payload.table_name)
    url = payload.url
    req_headers = payload.headers or {}
    
    # Auto-inject api_key if provided
    if payload.api_key:
        req_headers["api-key"] = payload.api_key
        req_headers["Authorization"] = f"Bearer {payload.api_key}"
        
    meta_headers = {}
    if payload.api_key:
        meta_headers["api-key"] = payload.api_key
        meta_headers["Authorization"] = f"Bearer {payload.api_key}"
    
    # Smart data.go.th URL & Resource ID Resolver
    resolved_url = url.strip()
    uuid_pattern = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    
    # Check if raw Resource UUID was supplied
    resource_id = None
    if uuid_pattern.match(resolved_url):
        resource_id = resolved_url
    elif "data.go.th/dataset/" in resolved_url and "/resource/" in resolved_url:
        try:
            parts = resolved_url.split("/resource/")
            if len(parts) > 1:
                res_id = parts[1].split("/")[0].split("?")[0]
                if uuid_pattern.match(res_id):
                    resource_id = res_id
        except Exception:
            pass
            
    # If we have a resource ID (directly or from URL):
    if resource_id:
        # First try to query datastore_search
        test_url = f"https://data.go.th/api/3/action/datastore_search?resource_id={resource_id}"
        print(f"[SMART INGEST] Trying CKAN Datastore API: {test_url}")
        res = requests.get(test_url, headers=meta_headers, timeout=10)
        if res.status_code == 200:
            resolved_url = test_url
        else:
            # Datastore search failed/404, query resource_show to find direct download link
            print(f"[SMART INGEST] Datastore 404, querying resource_show for download link...")
            show_url = f"https://data.go.th/api/3/action/resource_show?id={resource_id}"
            show_res = requests.get(show_url, headers=meta_headers, timeout=10)
            if show_res.status_code == 200:
                show_json = show_res.json()
                if show_json.get("success"):
                    direct_url = show_json.get("result", {}).get("url")
                    if direct_url:
                        # Check file format of direct url
                        if direct_url.lower().endswith(".xlsx") or direct_url.lower().endswith(".xls"):
                            raise HTTPException(
                                status_code=400,
                                detail="This data.go.th resource is an Excel (.xlsx) file. SDOQAP normalizer currently supports JSON APIs and CSV formats. Please download the CSV version, or upload it via Local CSV."
                            )
                        resolved_url = direct_url
                        print(f"[SMART INGEST] Auto-resolved to direct download link: {resolved_url}")
            
    # Case 3: data.go.th Dataset page URL (without resource id in path)
    elif "data.go.th/dataset/" in resolved_url:
        try:
            parts = resolved_url.split("data.go.th/dataset/")
            if len(parts) > 1:
                dataset_name = parts[1].split("/")[0].split("?")[0]
                meta_url = f"https://data.go.th/api/3/action/package_show?id={dataset_name}"
                meta_res = requests.get(meta_url, headers=meta_headers, timeout=10)
                if meta_res.status_code == 200:
                    meta_json = meta_res.json()
                    if meta_json.get("success"):
                        resources = meta_json.get("result", {}).get("resources", [])
                        if resources:
                            # 1. Prefer resources with datastore_active
                            datastore_res = next((r for r in resources if r.get("datastore_active")), None)
                            if datastore_res:
                                resource_id = datastore_res.get("id")
                                resolved_url = f"https://data.go.th/api/3/action/datastore_search?resource_id={resource_id}"
                            else:
                                # 2. Prefer CSV format
                                csv_res = next((r for r in resources if r.get("format", "").lower() == "csv"), None)
                                if csv_res:
                                    resolved_url = csv_res.get("url")
                                else:
                                    # check if xlsx
                                    first_url = resources[0].get("url")
                                    if first_url.lower().endswith(".xlsx") or first_url.lower().endswith(".xls"):
                                        raise HTTPException(
                                            status_code=400,
                                            detail="This data.go.th package contains Excel (.xlsx) files. SDOQAP normalizer currently supports JSON APIs and CSV formats."
                                        )
                                    resolved_url = first_url
                            print(f"[SMART INGEST] Auto-resolved data.go.th package to: {resolved_url}")
        except HTTPException as he:
            raise he
        except Exception as resolver_err:
            print(f"[SMART INGEST] Failed to resolve data.go.th package: {resolver_err}")
            
    try:
        api_res = safe_get(resolved_url, headers=req_headers, timeout=15)
        if api_res.status_code != 200:
            raise HTTPException(status_code=400, detail=f"API returned status code {api_res.status_code}")
            
        records = []
        # Try parsing JSON first
        try:
            json_data = api_res.json()
            if isinstance(json_data, list):
                records = json_data
            elif isinstance(json_data, dict):
                if "result" in json_data and isinstance(json_data["result"], dict) and "records" in json_data["result"]:
                    records = json_data["result"]["records"]
                elif "records" in json_data and isinstance(json_data["records"], list):
                    records = json_data["records"]
                elif "data" in json_data and isinstance(json_data["data"], list):
                    records = json_data["data"]
                elif "items" in json_data and isinstance(json_data["items"], list):
                    records = json_data["items"]
                else:
                    records = [json_data]
            else:
                raise ValueError("Unsupported JSON type")
        except Exception:
            # Fallback to CSV parsing (in case we resolved to a direct CSV download link!)
            text_content = api_res.text
            csv_file = io.StringIO(text_content)
            reader = csv.DictReader(csv_file)
            records = list(reader)
            if not records or len(reader.fieldnames or []) < 2:
                raise HTTPException(
                    status_code=400, 
                    detail="Failed to parse response. Source is not valid JSON, and CSV parsing failed (too few fields or empty content)."
                )
            print(f"[SMART INGEST] Successfully resolved and parsed direct CSV link ({len(records)} records)")
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch API or parse dataset: {str(e)}")
        
    if not records:
        raise HTTPException(status_code=400, detail="No valid records found in the API response.")
        
    headers = set()
    for r in records:
        if isinstance(r, dict):
            headers.update(r.keys())
    headers = sorted(list(headers))
    if not headers:
        headers = ["value"]
        
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    for r in records:
        if isinstance(r, dict):
            row = {}
            for k, v in r.items():
                if isinstance(v, (dict, list)):
                    import json
                    row[k] = json.dumps(v)
                else:
                    row[k] = v
            writer.writerow(row)
        else:
            writer.writerow({"value": str(r)})
            
    result = land_and_queue(table_name, output.getvalue().encode("utf-8"), source="api")
    if result["status"] == "duplicate":
        response.status_code = 200
    return result

@router.post("/ingest/reddit")
def ingest_reddit(payload: RedditIngestPayload, _user: str = Depends(require_session)):
    """
    Triggers Reddit live streaming pipeline via the Spark Trigger Daemon.
    """
    spark_host = os.getenv("SPARK_MASTER_HOST", "spark-master")
    try:
        res = requests.post(
            f"http://{spark_host}:8099/stream/start",
            json={"subreddits": payload.subreddits, "duration": payload.duration},
            headers=_daemon_headers(),
            timeout=5
        )
        if res.status_code == 200:
            return res.json()
        else:
            raise HTTPException(status_code=res.status_code, detail=res.text)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with Spark Trigger Daemon: {str(e)}")

@router.get("/ingest/reddit/status")
def ingest_reddit_status():
    """
    Fetches the status and logs of the active Reddit streaming job.
    """
    spark_host = os.getenv("SPARK_MASTER_HOST", "spark-master")
    try:
        res = requests.get(f"http://{spark_host}:8099/stream/status", headers=_daemon_headers(), timeout=5)
        if res.status_code == 200:
            return res.json()
        else:
            raise HTTPException(status_code=res.status_code, detail=res.text)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch streaming status: {str(e)}")

@router.post("/ingest/reddit/stop")
def ingest_reddit_stop(_user: str = Depends(require_session)):
    """
    Forcibly terminates the active Reddit streaming job.
    """
    spark_host = os.getenv("SPARK_MASTER_HOST", "spark-master")
    try:
        res = requests.post(f"http://{spark_host}:8099/stream/stop", headers=_daemon_headers(), timeout=5)
        if res.status_code == 200:
            return res.json()
        else:
            raise HTTPException(status_code=res.status_code, detail=res.text)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop streaming job: {str(e)}")


class RdbmsIngestPayload(BaseModel):
    table_name: str
    db_type: str = "postgresql"
    host: str
    port: int
    username: str
    password: str
    database: str
    query: str

@router.post("/ingest/rdbms", status_code=202)
def ingest_rdbms(payload: RdbmsIngestPayload, response: Response, _user: str = Depends(require_session_or_service_key)):
    """
    Connects to an RDBMS database, fetches results, converts to CSV, writes to HDFS, and triggers Spark.
    """
    table_name = validate_table_name(payload.table_name)
    db_type = payload.db_type.lower()
    records = []

    if db_type != "postgresql":
        raise HTTPException(status_code=400, detail=f"Unsupported db_type '{db_type}'. Only 'postgresql' is currently supported.")

    validate_rdbms_host(payload.host)
    import psycopg2

    def connect():
        return psycopg2.connect(host=payload.host, port=payload.port, user=payload.username,
                                password=payload.password, database=payload.database, connect_timeout=3)

    try:
        colnames, rows = run_readonly_query(connect, payload.query, max_rows=int(os.getenv("RDBMS_MAX_ROWS", "1000000")))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PostgreSQL fetch failed: {str(e)}")
    if not rows:
        raise HTTPException(status_code=400, detail="Query executed successfully but returned no rows to ingest.")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(colnames)
    writer.writerows(rows)
    result = land_and_queue(table_name, output.getvalue().encode("utf-8"), source="rdbms")
    result["rows_ingested"] = len(rows)
    if result["status"] == "duplicate":
        response.status_code = 200
    return result
