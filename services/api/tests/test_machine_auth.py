import os
import sys
import threading

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import system  # noqa: E402

GRAFANA_PAYLOAD = {"alerts": [{"annotations": {"summary": "s", "description": "d"}, "labels": {"severity": "warning"}}]}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET_KEY", "test-session-secret")
    monkeypatch.setenv("ALERT_WEBHOOK_SECRET", "hook-secret")
    monkeypatch.setenv("INGEST_SERVICE_KEY", "svc-key")
    routed, cleanup_ran = [], threading.Event()
    # Never run the real retention script from a test: it deletes data.
    monkeypatch.setattr(system, "_run_retention_cleanup", cleanup_ran.set)
    monkeypatch.setattr(system, "_load_route_alert",
                        lambda: lambda title, message, severity: routed.append((title, severity)))
    app = FastAPI()
    app.include_router(system.router)
    c = TestClient(app)
    c.routed, c.cleanup_ran = routed, cleanup_ran
    return c


def test_cleanup_rejects_a_call_without_credentials(client):
    assert client.post("/api/v1/system/cleanup").status_code == 401
    assert not client.cleanup_ran.is_set()


def test_cleanup_rejects_a_wrong_service_key(client):
    assert client.post("/api/v1/system/cleanup", headers={"X-Service-Key": "nope"}).status_code == 401
    assert not client.cleanup_ran.is_set()


def test_cleanup_accepts_the_n8n_service_key(client):
    r = client.post("/api/v1/system/cleanup", headers={"X-Service-Key": "svc-key"})
    assert r.status_code == 200
    assert r.json()["status"] == "triggered"
    assert client.cleanup_ran.wait(2)


def test_alert_accepts_x_webhook_secret(client):
    r = client.post("/api/v1/system/alert", headers={"X-Webhook-Secret": "hook-secret"},
                    json={"title": "t", "message": "m", "severity": "info"})
    assert r.status_code == 200
    assert client.routed == [("t", "info")]


def test_alert_accepts_bearer_authorization_from_grafana(client):
    r = client.post("/api/v1/system/alert", headers={"Authorization": "Bearer hook-secret"}, json=GRAFANA_PAYLOAD)
    assert r.status_code == 200
    assert client.routed == [("s", "warning")]


@pytest.mark.parametrize("headers", [
    {},
    {"X-Webhook-Secret": "nope"},
    {"Authorization": "Bearer nope"},
    {"Authorization": "Basic hook-secret"},
    {"Authorization": "Bearer"},
])
def test_alert_rejects_a_missing_or_wrong_secret(client, headers):
    r = client.post("/api/v1/system/alert", headers=headers, json=GRAFANA_PAYLOAD)
    assert r.status_code == 401
    assert client.routed == []
