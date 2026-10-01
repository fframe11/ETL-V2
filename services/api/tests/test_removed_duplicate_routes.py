import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.routing import Route

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

import main  # noqa: E402
from app.api import whitebox  # noqa: E402

ROUTES = {(m, r.path) for r in main.app.routes if isinstance(r, Route) for m in r.methods if m != "HEAD"}


@pytest.mark.parametrize("method,path", [
    ("POST", "/api/v1/schema/proposals/simulate"),          # same handler as /proposals/create
    ("POST", "/health"),                                    # same handler as GET /health
    ("POST", "/api/v1/whitebox/ai-context-explanations"),   # same handler as the GET
])
def test_duplicate_routes_are_gone(method, path):
    assert (method, path) not in ROUTES


@pytest.mark.parametrize("method,path", [
    ("POST", "/api/v1/schema/proposals/create"),
    ("GET", "/health"),
    ("GET", "/healthz"),
    ("GET", "/api/v1/whitebox/ai-context-explanations"),
    ("GET", "/api/v1/gold/schema-drift-history"),  # legacy alias kept for older callers
])
def test_the_routes_that_replace_them_remain(method, path):
    assert (method, path) in ROUTES


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(whitebox, "_recompute_interactive_state", lambda: {"dataset_name": "t", "metrics": {}})
    monkeypatch.setattr(whitebox, "_AI_CONTEXT_CACHE", {})
    app = FastAPI()
    app.include_router(whitebox.router)
    return TestClient(app)


def test_forcing_the_llm_to_regenerate_needs_a_login(client):
    # GET ...?force=true calls Groq on every request; without this anyone could burn the quota.
    assert client.get("/api/v1/whitebox/ai-context-explanations?force=true").status_code == 401


def test_reading_the_cached_explanations_stays_public(client):
    r = client.get("/api/v1/whitebox/ai-context-explanations")
    assert r.status_code == 200
    assert r.json()["available"] is False  # no metrics yet, so the rule-based text is empty
