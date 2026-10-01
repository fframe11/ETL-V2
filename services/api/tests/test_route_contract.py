"""Caller -> route contract.

Every call a client of this API makes (the React UI, the n8n workflow, Grafana, the
compose healthcheck) must resolve to a registered route with that method. The list is
the caller inventory of services/ui/src and infra/n8n/ingestion_workflow.json; add a
line when a caller gains a new call."""
import os
import sys

import pytest
from starlette.routing import Route

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")

import main  # noqa: E402

ROUTES = [r for r in main.app.routes if isinstance(r, Route)]


def resolve(method, path):
    """Template of the first route FastAPI would dispatch this call to."""
    for route in ROUTES:
        if method in route.methods and route.path_regex.match(path):
            return route.path
    return None


def same(method, path):
    return (method, path, path)


CALLS = [
    # hooks/useAuth.js
    same("POST", "/api/v1/auth/login"),
    same("POST", "/api/v1/auth/logout"),
    same("GET", "/api/v1/auth/me"),
    # NavBar.jsx, Home.jsx, Dashboard.jsx
    same("GET", "/api/v1/services/status"),
    same("GET", "/api/v1/kpi/stats"),
    same("GET", "/api/v1/executive/overview"),
    same("GET", "/api/v1/anomaly/sources"),
    same("GET", "/api/v1/system/activity"),
    same("GET", "/api/v1/quality"),
    same("GET", "/api/v1/system/remediations"),
    ("POST", "/api/v1/system/remediations/T1/resolve", "/api/v1/system/remediations/{ticket_id}/resolve"),
    # Analytics.jsx, Dashboard.jsx
    same("GET", "/api/v1/analytics/projection"),
    same("GET", "/api/v1/analytics/clustering"),
    same("GET", "/api/v1/analytics/impact"),
    same("GET", "/api/v1/analytics/recommendations"),
    same("GET", "/api/v1/analytics/sell-in-out"),
    # Pipeline.jsx, Dashboard.jsx, hooks/useRunStatus.js
    same("GET", "/api/v1/pipeline"),
    ("POST", "/api/v1/pipeline/retry/R1", "/api/v1/pipeline/retry/{run_id}"),
    ("GET", "/api/v1/pipeline/runs/I1", "/api/v1/pipeline/runs/{ingest_id}"),
    same("POST", "/api/v1/gold/rebuild"),
    # Ingestion.jsx
    same("POST", "/api/v1/pipeline/ingest/csv"),
    same("POST", "/api/v1/pipeline/ingest/api"),
    same("POST", "/api/v1/pipeline/ingest/rdbms"),
    same("POST", "/api/v1/pipeline/ingest/reddit"),
    same("POST", "/api/v1/pipeline/ingest/reddit/stop"),
    same("GET", "/api/v1/pipeline/ingest/reddit/status"),
    same("POST", "/api/v1/whitebox/upload-csv"),
    same("POST", "/api/v1/whitebox/ingest-source"),
    # Schema.jsx, NavBar.jsx, App.jsx
    same("GET", "/api/v1/schema/proposals"),
    same("POST", "/api/v1/schema/proposals/create"),
    same("POST", "/api/v1/schema/proposals/approve-all"),
    same("POST", "/api/v1/schema/proposals/reject-all"),
    ("POST", "/api/v1/schema/proposals/P1/approve", "/api/v1/schema/proposals/{proposal_id}/approve"),
    ("POST", "/api/v1/schema/proposals/P1/reject", "/api/v1/schema/proposals/{proposal_id}/reject"),
    # RulesConfig.jsx
    same("GET", "/api/v1/rules/ai-proposals"),
    ("POST", "/api/v1/rules/ai-proposals/P1/approve", "/api/v1/rules/ai-proposals/{proposal_id}/approve"),
    ("POST", "/api/v1/rules/ai-proposals/P1/reject", "/api/v1/rules/ai-proposals/{proposal_id}/reject"),
    ("GET", "/api/v1/rules/profiles/t1", "/api/v1/rules/profiles/{table_name}"),
    ("GET", "/api/v1/rules/t1", "/api/v1/rules/{table_name}"),
    ("PUT", "/api/v1/rules/t1", "/api/v1/rules/{table_name}"),
    same("GET", "/api/v1/standardize/review-queue"),
    ("POST", "/api/v1/standardize/review-queue/I1/approve", "/api/v1/standardize/review-queue/{item_id}/approve"),
    ("POST", "/api/v1/standardize/review-queue/I1/reject", "/api/v1/standardize/review-queue/{item_id}/reject"),
    ("POST", "/api/v1/standardize/review-queue/I1/override", "/api/v1/standardize/review-queue/{item_id}/override"),
    same("GET", "/api/v1/system/settings"),
    same("POST", "/api/v1/system/settings"),
    # DataExport.jsx, RunRecordsPanel.jsx
    same("GET", "/api/v1/export/tables"),
    ("DELETE", "/api/v1/export/tables/t1", "/api/v1/export/tables/{table_name}"),
    ("GET", "/api/v1/export/preview/raw/t1", "/api/v1/export/preview/{layer}/{table_name}"),
    ("GET", "/api/v1/export/preview/active/t1", "/api/v1/export/preview/{layer}/{table_name}"),
    ("GET", "/api/v1/export/preview/quarantine/t1", "/api/v1/export/preview/{layer}/{table_name}"),
    ("GET", "/api/v1/export/preview/reddit/python", "/api/v1/export/preview/{layer}/{table_name}"),
    ("GET", "/api/v1/export/records/active/t1", "/api/v1/export/records/{layer}/{table_name}"),
    ("GET", "/api/v1/export/raw/t1", "/api/v1/export/raw/{table_name}"),
    ("GET", "/api/v1/export/active/t1", "/api/v1/export/active/{table_name}"),
    ("GET", "/api/v1/export/quarantine/t1", "/api/v1/export/quarantine/{table_name}"),
    same("GET", "/api/v1/export/reddit"),
    ("GET", "/api/v1/export/gold/daily-quality", "/api/v1/export/gold/{metric}"),
    ("GET", "/api/v1/export/gold/schema-drift", "/api/v1/export/gold/{metric}"),
    same("GET", "/api/v1/gold/daily-quality"),
    same("GET", "/api/v1/gold/error-patterns"),
    same("GET", "/api/v1/gold/financial-impact"),
    same("GET", "/api/v1/gold/schema-drift"),
    ("GET", "/api/v1/lineage/t1/trust-check", "/api/v1/lineage/{table_name}/trust-check"),
    # WhiteBoxPipeline.jsx and the pages that read the interactive engine
    same("GET", "/api/v1/whitebox/state"),
    same("POST", "/api/v1/whitebox/state"),
    same("GET", "/api/v1/whitebox/profile"),
    same("GET", "/api/v1/whitebox/benchmark"),
    same("GET", "/api/v1/whitebox/downstream-analytics"),
    same("GET", "/api/v1/whitebox/ai-context-explanations"),
    same("POST", "/api/v1/whitebox/run-all"),
    same("POST", "/api/v1/whitebox/recommend-rules"),
    same("POST", "/api/v1/whitebox/execute"),
    same("GET", "/api/v1/whitebox/multi-table/preview"),
    same("POST", "/api/v1/whitebox/multi-table/analyze"),
    same("POST", "/api/v1/whitebox/multi-table/join"),
    ("GET", "/api/v1/whitebox/preview-zone/raw", "/api/v1/whitebox/preview-zone/{zone}"),
    ("GET", "/api/v1/whitebox/export-csv/clean", "/api/v1/whitebox/export-csv/{zone}"),
    # infra/n8n/ingestion_workflow.json and infra/grafana alert_rules.yaml
    same("POST", "/api/v1/system/cleanup"),
    same("POST", "/api/v1/system/alert"),
    # docker-compose.yml healthcheck of the api service
    same("GET", "/healthz"),
]


@pytest.mark.parametrize("method,path,expected", CALLS)
def test_caller_path_resolves_to_its_route(method, path, expected):
    assert resolve(method, path) == expected
