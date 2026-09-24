import os
import requests
import socket
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api.lineage import router as lineage_router
from app.api.pipeline import router as pipeline_router
from app.api.quality import router as quality_router
from app.api.schema import router as schema_router  # Fix 2B: Schema Governance API
from app.api.data_export import router as data_export_router
from app.api.dynamic_rules import router as dynamic_rules_router
from app.api.standardize import router as standardize_router
from app.api.whitebox import router as whitebox_router
from app.api.analytics import router as analytics_router
from app.api.gold import router as gold_router
from app.api.system import router as system_router

app = FastAPI(
    title="SDOQAP Serving API",
    description="Serving Layer API for Scalable Data Observability and Quality Assurance Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging configuration – level can be set via LOG_LEVEL env var
import logging
from app.api.config import get_elasticsearch_url
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=log_level)

# Rate limiting – 100 requests per minute per IP (adjust as needed)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Enhanced health‑check endpoint – also verifies dependent services
@app.get("/healthz", include_in_schema=False)
def health_check() -> dict:
    status = {"app": "ok"}
    # Elasticsearch check
    try:
        res = requests.head(ELASTICSEARCH_URL, timeout=2)
        status["elasticsearch"] = "ok" if res.status_code < 500 else "error"
    except Exception:
        status["elasticsearch"] = "error"
    # Spark master availability (basic TCP check)
    try:
        spark_host = os.getenv("SPARK_MASTER_HOST", "spark-master")
        spark_port = int(os.getenv("SPARK_MASTER_PORT", "7077"))
        with socket.create_connection((spark_host, spark_port), timeout=2):
            status["spark_master"] = "ok"
    except Exception:
        status["spark_master"] = "error"
    return status


app.include_router(lineage_router)
app.include_router(pipeline_router)
app.include_router(quality_router)
app.include_router(schema_router)  # Fix 2B: Schema Governance API
app.include_router(data_export_router)
app.include_router(dynamic_rules_router)
app.include_router(standardize_router)
app.include_router(whitebox_router)
app.include_router(analytics_router)
app.include_router(gold_router)
app.include_router(system_router)

ELASTICSEARCH_URL = get_elasticsearch_url()

if not os.getenv("ELASTICSEARCH_PASSWORD"):
    logging.getLogger("sdoqap.startup").warning(
        "ELASTICSEARCH_PASSWORD is not set — falling back to the default "
        "credential documented in README.md. This default is public; set "
        "ELASTICSEARCH_PASSWORD in .env before exposing this stack beyond localhost."
    )

@app.get("/")
def read_portal():
    return {
        "status": "healthy",
        "service": "SDOQAP API Serving Layer",
        "documentation": "/docs"
    }

@app.get("/health")
@app.post("/health")
def health_check_legacy():
    health = {
        "status": "healthy",
        "elasticsearch": "unknown"
    }

    try:
        res = requests.get(ELASTICSEARCH_URL, timeout=5)
        if res.status_code == 200:
            health["elasticsearch"] = "connected"
        else:
            health["status"] = "unhealthy"
            health["elasticsearch"] = f"status code {res.status_code}"
    except Exception as e:
        health["status"] = "unhealthy"
        health["elasticsearch"] = f"connection error: {str(e)}"
        raise HTTPException(status_code=500, detail=health)

    return health
