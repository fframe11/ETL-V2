"""Pure helpers for spark_trigger_daemon.py (no pyspark): auth, name validation, the
per-table job queue, the spark-submit command and run-registry updates."""
import hmac
import os
import re
import threading
from collections import deque
from datetime import datetime, timezone

import requests

SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
EXIT_OK = 0
EXIT_SKIPPED = 75  # must match run_support.EXIT_SKIPPED
RUNS_INDEX = "sdoqap_runs"
SPARK_SUBMIT = "/opt/bitnami/spark/bin/spark-submit"
ENGINE_SCRIPT = "/opt/spark-apps/spark_quality_engine.py"


def is_authorized(headers, secret: str) -> bool:
    provided = headers.get("X-Trigger-Secret") or ""
    return bool(secret) and hmac.compare_digest(provided, secret)


def valid_name(name) -> bool:
    return isinstance(name, str) and bool(SAFE_NAME_RE.match(name))


def build_submit_cmd(table: str, ingest_id: str = None) -> list:
    # Delta jars are baked into the image (services/spark/Dockerfile), so no --packages.
    cmd = [
        SPARK_SUBMIT,
        "--master", "spark://spark-master:7077",
        "--conf", "spark.executorEnv.HADOOP_USER_NAME=spark",
        "--conf", "spark.executor.extraJavaOptions=-DHADOOP_USER_NAME=spark",
        "--conf", "spark.driver.extraJavaOptions=-DHADOOP_USER_NAME=spark",
        ENGINE_SCRIPT,
        table,
    ]
    if ingest_id:
        cmd += ["--ingest-id", ingest_id]
    return cmd


def state_for_exit(code: int) -> str:
    if code == EXIT_OK:
        return "SUCCEEDED"
    if code == EXIT_SKIPPED:
        return "SKIPPED"
    return "FAILED"


class TableJobQueue:
    """At most one engine run per table; later requests for the same table wait in
    FIFO order instead of being rejected with 409."""

    def __init__(self):
        self._lock = threading.Lock()
        self._running = set()
        self._pending = {}

    def submit(self, table: str, ingest_id) -> bool:
        """True: caller must start the job now. False: it was queued behind a running one."""
        with self._lock:
            if table in self._running:
                self._pending.setdefault(table, deque()).append(ingest_id)
                return False
            self._running.add(table)
            return True

    def next_or_release(self, table: str):
        with self._lock:
            q = self._pending.get(table)
            if q:
                return True, q.popleft()
            self._pending.pop(table, None)
            self._running.discard(table)
            return False, None

    def pending(self, table: str) -> int:
        with self._lock:
            return len(self._pending.get(table, ()))


def _es_base_and_auth():
    host = os.getenv("ELASTICSEARCH_HOST", "elasticsearch")
    port = os.getenv("ELASTICSEARCH_PORT", "9200")
    user = os.getenv("ELASTICSEARCH_USER", "elastic")
    password = os.getenv("ELASTICSEARCH_PASSWORD", "")
    return f"http://{host}:{port}", ((user, password) if password else None)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def update_run_state(ingest_id, state: str, post=requests.post, **fields) -> bool:
    if not ingest_id:
        return False
    base, auth = _es_base_and_auth()
    doc = {"state": state, "updated_at": _now(), **fields}
    try:
        res = post(f"{base}/{RUNS_INDEX}/_update/{ingest_id}", json={"doc": doc}, auth=auth, timeout=5)
        return res.status_code in (200, 201)
    except requests.RequestException:
        return False


def find_quality_run(ingest_id, post=requests.post):
    base, auth = _es_base_and_auth()
    query = {"size": 1, "sort": [{"timestamp": {"order": "desc"}}],
             "query": {"term": {"ingest_id.keyword": ingest_id}}}
    try:
        res = post(f"{base}/sdoqap_quality_runs/_search", json=query, auth=auth, timeout=5)
    except requests.RequestException:
        return None
    if res.status_code != 200:
        return None
    hits = res.json().get("hits", {}).get("hits", [])
    return hits[0]["_source"] if hits else None
