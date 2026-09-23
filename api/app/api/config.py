import os
import time
from elasticsearch import Elasticsearch
from fastapi import HTTPException

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
    es_pass = os.getenv("ELASTICSEARCH_PASSWORD", "sdoqap_secure")
    es_host = os.getenv("ELASTICSEARCH_HOST", "localhost")
    es_port = os.getenv("ELASTICSEARCH_PORT", "9200")
    return f"http://{es_user}:{es_pass}@{es_host}:{es_port}"

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
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.1)
        s.connect((es_host, es_port))
        s.close()
    except Exception:
        raise HTTPException(status_code=503, detail="Elasticsearch service is offline")

    es_url = get_elasticsearch_url()
    try:
        client = Elasticsearch(es_url, request_timeout=1)
        if client.ping():
            _es_client = client
            return _es_client
    except Exception:
        pass
    raise HTTPException(status_code=503, detail="Elasticsearch ping check failed")

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
