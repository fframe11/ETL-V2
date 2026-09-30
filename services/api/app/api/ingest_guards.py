"""Input guards for /api/v1/pipeline/ingest/*: which URLs, SQL and upload sizes the
extraction layer accepts."""
import os
from urllib.parse import urljoin, urlparse

import requests
from fastapi import HTTPException

MAX_REDIRECTS = 3
_REDIRECT_CODES = (301, 302, 303, 307, 308)


def allowlisted_hosts(env_var: str) -> list:
    raw = os.getenv(env_var, "")
    return [h.strip().lower() for h in raw.split(",") if h.strip()]


def _is_data_go_th(host: str) -> bool:
    return host == "data.go.th" or host.endswith(".data.go.th")


def validate_api_ingest_url(url: str) -> None:
    """Fail closed: only data.go.th (built-in integration) and hosts listed in
    API_INGEST_ALLOWED_HOSTS may be fetched."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail=f"Only http/https URLs can be ingested (got '{parsed.scheme or 'none'}').")
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=400, detail="URL has no host.")
    if _is_data_go_th(host):
        return
    if host not in allowlisted_hosts("API_INGEST_ALLOWED_HOSTS"):
        raise HTTPException(
            status_code=400,
            detail=f"Host '{host}' is not in API_INGEST_ALLOWED_HOSTS. Add it to .env to allow ingestion from it.",
        )


def safe_get(url, headers=None, timeout=15, session_get=requests.get):
    """GET that re-validates every redirect hop, so an allowed host cannot bounce the
    request to an internal service such as elasticsearch:9200."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        validate_api_ingest_url(current)
        res = session_get(current, headers=headers, timeout=timeout, allow_redirects=False)
        location = res.headers.get("Location") if res.status_code in _REDIRECT_CODES else None
        if not location:
            return res
        current = urljoin(current, location)
    raise HTTPException(status_code=400, detail=f"Too many redirects (more than {MAX_REDIRECTS}).")


def validate_select_only(query: str) -> None:
    stripped = query.strip()
    if ";" in stripped.rstrip(";"):
        raise HTTPException(status_code=400, detail="Multiple statements are not allowed in the query.")
    first_token = stripped.split(None, 1)[0].upper() if stripped else ""
    if first_token != "SELECT":
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed for RDBMS ingestion.")


def validate_rdbms_host(host: str) -> None:
    allowed = allowlisted_hosts("RDBMS_ALLOWED_HOSTS")
    if not allowed:
        raise HTTPException(
            status_code=400,
            detail="RDBMS ingestion is disabled: set RDBMS_ALLOWED_HOSTS in .env to a comma-separated allowlist of database hosts.",
        )
    if host.strip().lower() not in allowed:
        raise HTTPException(status_code=400, detail=f"Host '{host}' is not in the RDBMS_ALLOWED_HOSTS allowlist.")


def run_readonly_query(connect, query: str, max_rows: int, statement_timeout_ms: int = 30000):
    """Run a SELECT inside a read-only transaction with a server-side timeout. The
    first-word check alone still lets `SELECT ... INTO new_table` create a table."""
    validate_select_only(query)
    conn = connect()
    try:
        conn.set_session(readonly=True)
        cur = conn.cursor()
        cur.execute(f"SET statement_timeout = {int(statement_timeout_ms)}")
        cur.execute(query)
        columns = [d[0] for d in cur.description]
        rows = cur.fetchmany(max_rows + 1)
        if len(rows) > max_rows:
            raise HTTPException(
                status_code=413,
                detail=f"Query returned more than {max_rows} rows. Narrow it with WHERE/LIMIT or raise RDBMS_MAX_ROWS.",
            )
        return columns, rows
    finally:
        conn.close()


def max_upload_bytes() -> int:
    return int(os.getenv("MAX_UPLOAD_MB", "200")) * 1024 * 1024


def read_upload_limited(upload, max_bytes: int, chunk_size: int = 1024 * 1024) -> bytes:
    buf = bytearray()
    while True:
        chunk = upload.file.read(chunk_size)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > max_bytes:
            raise HTTPException(status_code=413, detail=f"File is larger than the upload limit of {max_bytes} bytes (MAX_UPLOAD_MB).")
    return bytes(buf)
