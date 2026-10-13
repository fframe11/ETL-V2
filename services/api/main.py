import os
import sys

# Ensure api directory is always on sys.path for consistent imports across runtimes
api_dir = os.path.dirname(os.path.abspath(__file__))
if api_dir not in sys.path:
    sys.path.insert(0, api_dir)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    load_dotenv()
except Exception:
    pass
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
from app.api.auth import router as auth_router
from app.api.dashboards import router as dashboards_router
from app.api.semantic import router as semantic_router
from app.api.jobs import router as jobs_router

app = FastAPI(
    title="SDOQAP Serving API",
    description="Serving Layer API for Scalable Data Observability and Quality Assurance Platform",
    version="1.0.0"
)

cors_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
if not cors_origins_env or cors_origins_env.strip() == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https://.*\.vercel\.app$|^http://localhost(:\d+)?$|^http://127\.0\.0\.1(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    allowed_origins = [orig.strip() for orig in cors_origins_env.split(",") if orig.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Logging configuration – level can be set via LOG_LEVEL env var
import logging
from app.api.config import get_elasticsearch_url
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=log_level)

ELASTICSEARCH_URL = get_elasticsearch_url()

# Rate limiting – 100 requests per minute per IP (adjust as needed)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Liveness probe (process is up and responding)
@app.get("/live", tags=["Health"])
def liveness() -> dict:
    return {"status": "alive", "service": "SDOQAP API Serving Layer"}

# Readiness probe (mandatory dependencies operational)
@app.get("/ready", tags=["Health"])
def readiness() -> dict:
    from app.api.config import get_database_url
    db_url = get_database_url()
    pg_ok = False
    if db_url:
        try:
            import psycopg2
            conn = psycopg2.connect(db_url, connect_timeout=2)
            conn.close()
            pg_ok = True
        except Exception:
            pg_ok = False

    if not pg_ok:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "postgres": "error" if db_url else "unconfigured",
                "message": "Mandatory database storage is unavailable"
            }
        )

    es_ok = False
    try:
        res = requests.head(ELASTICSEARCH_URL, timeout=1)
        es_ok = res.status_code < 500
    except Exception:
        es_ok = False

    return {
        "status": "ready",
        "mode": "full" if es_ok else "degraded_hybrid",
        "postgres": "ok",
        "elasticsearch": "ok" if es_ok else "offline (postgresql fallback active)"
    }

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
    # PostgreSQL check (if configured)
    from app.api.config import get_database_url
    db_url = get_database_url()
    if db_url:
        try:
            import psycopg2
            conn = psycopg2.connect(db_url, connect_timeout=2)
            conn.close()
            status["postgres"] = "ok"
        except Exception:
            status["postgres"] = "error"
    else:
        status["postgres"] = "unconfigured"
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
app.include_router(auth_router)
app.include_router(dashboards_router)
app.include_router(semantic_router)
app.include_router(jobs_router)

def configure_elasticsearch_startup():
    """Evaluates runtime environment and configures truthful logging and security checks
    for Elasticsearch and PostgreSQL Metadata Fallback modes:
    1. If running in Production (e.g. Render) without an active Elasticsearch cluster:
       Truthfully logs that PostgreSQL Metadata Bridge fallback is active, without
       misleadingly referencing default credentials.
    2. If Elasticsearch is explicitly enabled or actively listening (external or active localhost):
       Enforces that a secure, non-default ELASTICSEARCH_PASSWORD is provided on Production (Fail-Closed).
    3. If running in Local/Dev:
       Warns if ELASTICSEARCH_PASSWORD is unset or using a known default credential.
    """
    from app.api.auth import is_production_environment
    from app.api.config import get_database_url

    logger = logging.getLogger("sdoqap.startup")
    is_prod = is_production_environment()
    has_postgres = bool(get_database_url())

    es_host = os.getenv("ELASTICSEARCH_HOST", "localhost").strip()
    es_port_str = os.getenv("ELASTICSEARCH_PORT", "9200").strip()
    try:
        es_port = int(es_port_str)
    except ValueError:
        es_port = 9200

    es_url = os.getenv("ELASTICSEARCH_URL", "").strip().lower()
    es_explicitly_enabled = os.getenv("ENABLE_ELASTICSEARCH", "").strip().lower() in ("true", "1", "yes")

    # An active Elasticsearch in Production is configured if explicitly enabled
    # (for either localhost or cluster) or targeted via external non-localhost endpoint.
    is_external_target = bool(
        (es_host and es_host.lower() not in ("localhost", "127.0.0.1", ""))
        or (es_url and "localhost" not in es_url and "127.0.0.1" not in es_url and es_url != "")
    )
    is_prod_es_enabled = bool(es_explicitly_enabled or is_external_target)

    es_pass = os.getenv("ELASTICSEARCH_PASSWORD", "").strip()
    banned_default_passwords = {"sdoqap_secure", "changeme", "elastic", "password", "123456", "admin", "default"}

    if is_prod:
        # Fail closed on any banned/default password in production
        if es_pass and es_pass.lower() in banned_default_passwords:
            raise RuntimeError(
                "Default or insecure ELASTICSEARCH_PASSWORD is strictly forbidden in production. "
                "Please configure a strong, unique secret."
            )

        # Production mode using PostgreSQL Metadata Bridge (e.g. Render Cloud Free Tier)
        if not is_prod_es_enabled:
            if has_postgres:
                logger.info(
                    "Operating in PostgreSQL fallback mode (degraded_hybrid). "
                    "Elasticsearch is not deployed on this instance; serving layer queries "
                    "are routed via PostgreSQL Metadata Bridge."
                )
            else:
                logger.warning(
                    "Neither Elasticsearch nor PostgreSQL connection is fully configured on production."
                )
            return

        # Production with Elasticsearch enabled (external or active localhost)
        if not es_pass:
            raise RuntimeError(
                "ELASTICSEARCH_PASSWORD must be configured with a secure credential "
                "when Elasticsearch is enabled in production."
            )
        logger.info("Elasticsearch configuration verified with custom credentials.")
        return

    # Local Development (not production)
    if not es_pass:
        logger.warning(
            "ELASTICSEARCH_PASSWORD is not set for local Elasticsearch. Please configure "
            "ELASTICSEARCH_PASSWORD in .env before exposing this stack beyond localhost."
        )
    elif es_pass.lower() in banned_default_passwords:
        logger.warning(
            "ELASTICSEARCH_PASSWORD is using a known default credential from documentation. "
            "Do NOT use this credential in public or production environments."
        )
    else:
        logger.info("Elasticsearch configuration verified with custom credentials.")


configure_elasticsearch_startup()

@app.get("/")
def read_portal():
    return {
        "status": "healthy",
        "service": "SDOQAP API Serving Layer",
        "documentation": "/docs"
    }

@app.get("/health", tags=["Health"])
def health_check_legacy():
    from app.api.config import get_database_url
    db_url = get_database_url()
    pg_ok = False
    if db_url:
        try:
            import psycopg2
            conn = psycopg2.connect(db_url, connect_timeout=2)
            conn.close()
            pg_ok = True
        except Exception:
            pg_ok = False

    es_connected = False
    try:
        res = requests.get(ELASTICSEARCH_URL, timeout=2)
        if res.status_code == 200:
            es_connected = True
    except Exception:
        es_connected = False

    if es_connected:
        return {
            "status": "healthy",
            "elasticsearch": "connected",
            "postgres": "ok" if pg_ok else "unconfigured"
        }
    elif pg_ok:
        return {
            "status": "degraded",
            "elasticsearch": "connection error (service offline)",
            "postgres": "connected (metadata store active)",
            "note": "Operating with graceful degradation via PostgreSQL metadata bridge"
        }
    else:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "elasticsearch": "connection error (service offline or unreachable)",
                "postgres": "error or unconfigured"
            }
        )
