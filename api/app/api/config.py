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
    """Returns a singleton Elasticsearch client, retrying connection up to 5 times with delay if starting up."""
    global _es_client
    if _es_client is None:
        es_url = get_elasticsearch_url()
        last_err = None
        for attempt in range(5):
            try:
                client = Elasticsearch(es_url)
                if client.ping():
                    _es_client = client
                    return _es_client
                else:
                    last_err = "Elasticsearch ping check returned False"
            except Exception as e:
                last_err = str(e)
            print(f"[ES Connection] Elasticsearch not ready. Retrying in 2s... (Attempt {attempt+1}/5)")
            time.sleep(2)
        raise HTTPException(status_code=500, detail=f"Failed to connect to Elasticsearch: {last_err}")
    return _es_client
