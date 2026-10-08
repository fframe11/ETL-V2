import logging
import os
import sys

import pytest
import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import system  # noqa: E402
from fakes import FakeES  # noqa: E402

INDEX = "sdoqap_upstream_remediations"


class TicketES(FakeES):
    def exists(self, index, id):
        return id in self.docs.get(index, {})


class _Resp:
    def __init__(self, status_code):
        self.status_code = status_code


@pytest.fixture
def env(monkeypatch):
    es = TicketES()
    es.index(index=INDEX, id="T1", document={"table_name": "orders", "status": "OPEN"})
    es.index(index=INDEX, id="T2", document={"status": "OPEN"})
    monkeypatch.setattr(system, "get_es_client", lambda: es)
    monkeypatch.setenv("TRIGGER_SHARED_SECRET", "trig-secret")
    app = FastAPI()
    app.include_router(system.router)
    app.dependency_overrides[system.require_session] = lambda: "admin"
    client = TestClient(app)
    client.es, client.calls = es, []
    return client


def _daemon(monkeypatch, client, outcome):
    def fake_post(url, json=None, headers=None, timeout=None):
        client.calls.append({"url": url, "json": json, "headers": headers})
        if isinstance(outcome, Exception):
            raise outcome
        return _Resp(outcome)

    monkeypatch.setattr(system.requests, "post", fake_post)


def test_resolve_reports_when_the_daemon_accepted_the_job(env, monkeypatch):
    _daemon(monkeypatch, env, 202)
    body = env.post("/api/v1/system/remediations/T1/resolve").json()
    assert body["spark_triggered"] is True
    assert body["trigger_error"] is None
    assert env.calls[0]["json"] == {"table": "orders"}
    assert env.calls[0]["headers"] == {"X-Trigger-Secret": "trig-secret"}


def test_resolve_says_so_when_the_daemon_cannot_be_reached(env, monkeypatch, caplog):
    _daemon(monkeypatch, env, requests.ConnectionError("no route"))
    with caplog.at_level(logging.WARNING):
        body = env.post("/api/v1/system/remediations/T1/resolve").json()
    assert body["spark_triggered"] is False
    assert "ConnectionError" in body["trigger_error"]
    assert "not started" in body["message"]
    assert env.es.docs[INDEX]["T1"]["status"] == "RESOLVED"
    assert any("T1" in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize("status", [401, 500])
def test_resolve_says_so_when_the_daemon_refuses_the_job(env, monkeypatch, status):
    _daemon(monkeypatch, env, status)
    body = env.post("/api/v1/system/remediations/T1/resolve").json()
    assert body["spark_triggered"] is False
    assert str(status) in body["trigger_error"]
    assert "not started" in body["message"]


def test_resolve_says_so_when_the_ticket_has_no_table(env, monkeypatch):
    _daemon(monkeypatch, env, 202)
    body = env.post("/api/v1/system/remediations/T2/resolve").json()
    assert body["spark_triggered"] is False
    assert "table" in body["trigger_error"]
    assert env.calls == []


def test_the_error_text_never_carries_the_trigger_secret(env, monkeypatch):
    _daemon(monkeypatch, env, requests.ConnectionError("cannot reach host with trig-secret"))
    body = env.post("/api/v1/system/remediations/T1/resolve").json()
    assert "trig-secret" not in str(body)
