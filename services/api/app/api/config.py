import os
import time
import logging
import threading
from elasticsearch import Elasticsearch
from fastapi import HTTPException

logger = logging.getLogger(__name__)

def get_required_env(name: str) -> str:
    """Return the value of an environment variable or raise a clear error.

    Args:
        name: The environment variable name.
    Returns:
        The variable's value.
    Raises:
        RuntimeError: If the variable is not set.
    """
    value = os.getenv(name)
    if value is None:
        raise RuntimeError(
            f"Missing required environment variable '{name}'. Set it in the deployment environment or .env file."
        )
    return value

def get_elasticsearch_url():
    # Prefer full URL if provided via environment
    es_url = os.getenv("ELASTICSEARCH_URL")
    if es_url:
        return es_url
    # Otherwise construct from components, using defaults where appropriate
    es_user = os.getenv("ELASTICSEARCH_USER", "elastic")
    es_pass = os.getenv("ELASTICSEARCH_PASSWORD")
    es_host = os.getenv("ELASTICSEARCH_HOST", "localhost")
    es_port = os.getenv("ELASTICSEARCH_PORT", "9200")
    if es_pass:
        return f"http://{es_user}:{es_pass}@{es_host}:{es_port}"
    return f"http://{es_host}:{es_port}"

_es_client = None

def get_es_client() -> Elasticsearch:
    """Returns a singleton Elasticsearch client with fast failover when ES is offline."""
    global _es_client
    if _es_client is not None:
        return _es_client

    es_host = os.getenv("ELASTICSEARCH_HOST", "localhost")
    es_port = int(os.getenv("ELASTICSEARCH_PORT", "9200"))
    
    # Fast non-blocking socket probe (0.1s timeout)
    import socket
    es_available = False
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.1)
        s.connect((es_host, es_port))
        s.close()
        es_available = True
    except Exception:
        pass

    if es_available:
        try:
            es_url = get_elasticsearch_url()
            client = Elasticsearch(es_url, request_timeout=int(os.getenv("ES_REQUEST_TIMEOUT", "10")))
            if client.ping():
                _es_client = client
                return _es_client
        except Exception:
            pass

    # Fallback to PostgreSQL Metadata Bridge if DATABASE_URL is configured
    if get_database_url():
        try:
            from .es_postgres_bridge import get_bridge_client
            bridge = get_bridge_client()
            if bridge.ping():
                _es_client = bridge
                return _es_client
        except Exception:
            pass

    raise HTTPException(status_code=503, detail="Elasticsearch service is offline and PostgreSQL metadata store is unconfigured")

_session = None

def get_http_session():
    """Returns a thread-safe singleton requests.Session with connection pooling."""
    global _session
    if _session is None:
        import requests
        from requests.adapters import HTTPAdapter
        _session = requests.Session()
        adapter = HTTPAdapter(pool_connections=20, pool_maxsize=50)
        _session.mount("http://", adapter)
        _session.mount("https://", adapter)
    return _session


def get_database_url():
    """Return normalized PostgreSQL connection URL from environment.

    Supports DATABASE_URL (standard 12-factor / Neon / Render) with fallback to
    component variables: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST,
    POSTGRES_PORT, POSTGRES_DB, and POSTGRES_SSLMODE.
    """
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        # Standardize driver prefix for modern python drivers
        if db_url.startswith("postgres://"):
            db_url = "postgresql://" + db_url[len("postgres://"):]
        return db_url

    pg_user = os.getenv("POSTGRES_USER")
    pg_pass = os.getenv("POSTGRES_PASSWORD")
    pg_host = os.getenv("POSTGRES_HOST")
    pg_port = os.getenv("POSTGRES_PORT", "5432")
    pg_db = os.getenv("POSTGRES_DB", "sdoqap_oltp")
    pg_ssl = os.getenv("POSTGRES_SSLMODE")

    if pg_host and pg_user and pg_pass:
        base = f"postgresql://{pg_user}:{pg_pass}@{pg_host}:{pg_port}/{pg_db}"
        if pg_ssl:
            base += f"?sslmode={pg_ssl}"
        return base
    return None


_pg_pool = None
_pg_pool_url = None
_pg_pool_lock = threading.Lock()


class PooledConnectionProxy:
    """Thread-safe proxy for pooled psycopg2 connections.

    Intercepts close() to return the underlying connection to the ThreadedConnectionPool
    rather than destroying the underlying TCP/TLS socket. Automatically resets any pending
    transaction status with rollback() to ensure a clean state for subsequent borrowers.
    """

    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool
        self._returned = False

    def close(self):
        if not self._returned:
            self._returned = True
            if self._pool is not None:
                try:
                    if getattr(self._conn, "closed", 0) == 0:
                        try:
                            self._conn.rollback()
                        except Exception:
                            pass
                        self._pool.putconn(self._conn)
                    else:
                        self._pool.putconn(self._conn, close=True)
                except Exception:
                    try:
                        self._pool.putconn(self._conn, close=True)
                    except Exception:
                        pass
            else:
                try:
                    self._conn.close()
                except Exception:
                    pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_postgres_pool(connect_timeout: int = 5):
    """Initializes or returns the thread-safe connection pool singleton."""
    global _pg_pool, _pg_pool_url
    conn_url = get_database_url()
    if not conn_url:
        raise HTTPException(
            status_code=503,
            detail="PostgreSQL connection is not configured (DATABASE_URL or POSTGRES_HOST missing)"
        )

    with _pg_pool_lock:
        if _pg_pool is not None and _pg_pool_url != conn_url:
            try:
                _pg_pool.closeall()
            except Exception:
                pass
            _pg_pool = None

        if _pg_pool is None:
            try:
                from psycopg2.pool import ThreadedConnectionPool
                minconn = int(os.getenv("POSTGRES_POOL_MIN", "1"))
                maxconn = int(os.getenv("POSTGRES_POOL_MAX", "10"))
                _pg_pool = ThreadedConnectionPool(
                    minconn,
                    maxconn,
                    conn_url,
                    connect_timeout=connect_timeout
                )
                _pg_pool_url = conn_url
            except Exception as e:
                logger.warning("PostgreSQL pool initialization failed: %s", type(e).__name__)
                raise HTTPException(
                    status_code=503,
                    detail="PostgreSQL service is unavailable or connection timed out."
                )
    return _pg_pool


def close_postgres_pool():
    """Cleanly closes all connections in the pool on shutdown or testing teardown."""
    global _pg_pool, _pg_pool_url
    with _pg_pool_lock:
        if _pg_pool is not None:
            try:
                _pg_pool.closeall()
            except Exception:
                pass
            _pg_pool = None
            _pg_pool_url = None


def get_postgres_connection(connect_timeout: int = 5):
    """Returns a thread-safe pooled connection proxy or raises 503 if unavailable / exhausted."""
    use_pool = os.getenv("POSTGRES_USE_POOL", "true").lower() in ("true", "1", "yes")
    conn_url = get_database_url()
    if not conn_url:
        raise HTTPException(
            status_code=503,
            detail="PostgreSQL connection is not configured (DATABASE_URL or POSTGRES_HOST missing)"
        )

    if not use_pool:
        import psycopg2
        try:
            return psycopg2.connect(conn_url, connect_timeout=connect_timeout)
        except Exception as e:
            logger.warning("PostgreSQL connection attempt failed: %s", type(e).__name__)
            raise HTTPException(
                status_code=503,
                detail="PostgreSQL service is unavailable or connection timed out."
            )

    pool = get_postgres_pool(connect_timeout=connect_timeout)
    try:
        raw_conn = pool.getconn()
    except Exception as e:
        logger.warning("PostgreSQL pool exhaustion or getconn failure: %s", type(e).__name__)
        raise HTTPException(
            status_code=503,
            detail="PostgreSQL connection pool exhausted. Please retry later."
        )

    if getattr(raw_conn, "closed", 0) != 0:
        try:
            pool.putconn(raw_conn, close=True)
            raw_conn = pool.getconn()
        except Exception:
            raise HTTPException(
                status_code=503,
                detail="PostgreSQL service is unavailable or connection timed out."
            )

    return PooledConnectionProxy(raw_conn, pool)

