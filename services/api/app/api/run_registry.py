"""Run registry: one document per ingestion (id = ingest_id) in ES index sdoqap_runs,
tracking QUEUED -> RUNNING -> SUCCEEDED / FAILED / SKIPPED, or TRIGGER_FAILED when the
Spark trigger daemon could not be reached. The API creates the document; the daemon
moves it through the states from the engine's exit code."""
import hashlib
import uuid
from datetime import datetime, timezone

RUNS_INDEX = "sdoqap_runs"
IN_FLIGHT_OR_DONE = ["QUEUED", "RUNNING", "SUCCEEDED"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_ingest_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]


def checksum(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def raw_ingest_dir(table: str, ingest_id: str) -> str:
    return f"/data/raw/{table}/{ingest_id}"


def _search_one(es, filters):
    if not es.indices.exists(index=RUNS_INDEX):
        return None
    res = es.search(index=RUNS_INDEX, query={"bool": {"filter": filters}}, size=1,
                    sort=[{"created_at": {"order": "desc"}}])
    hits = res["hits"]["hits"]
    return hits[0]["_source"] if hits else None


def get_run(es, ingest_id: str):
    return _search_one(es, [{"term": {"ingest_id.keyword": ingest_id}}])


def find_duplicate(es, table: str, sha: str):
    return _search_one(es, [
        {"term": {"table_name.keyword": table}},
        {"term": {"checksum.keyword": sha}},
        {"terms": {"state.keyword": IN_FLIGHT_OR_DONE}},
    ])


def create_run(es, table: str, ingest_id: str, sha: str, source: str, size_bytes: int) -> dict:
    now = _now()
    doc = {
        "ingest_id": ingest_id,
        "table_name": table,
        "checksum": sha,
        "source": source,
        "size_bytes": size_bytes,
        "raw_path": raw_ingest_dir(table, ingest_id),
        "state": "QUEUED",
        "created_at": now,
        "updated_at": now,
    }
    es.index(index=RUNS_INDEX, id=ingest_id, document=doc, refresh="wait_for")
    return doc


def update_run(es, ingest_id: str, state: str, **fields) -> None:
    es.update(index=RUNS_INDEX, id=ingest_id, doc={"state": state, "updated_at": _now(), **fields}, refresh="wait_for")
