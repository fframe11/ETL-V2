import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")

from app.api import data_export  # noqa: E402


class FakeES:
    def __init__(self, hits=None, fail=False):
        self.hits, self.fail = hits or [], fail
        self.indices = self

    def exists(self, index):
        return True

    def search(self, index, body):
        if self.fail:
            raise RuntimeError("boom")
        return {"hits": {"hits": self.hits}}


def client_for(monkeypatch, es):
    monkeypatch.setattr(data_export, "get_es", lambda: es)
    app = FastAPI()
    app.include_router(data_export.router)
    return TestClient(app)


def test_no_records_in_the_window_is_a_404_with_a_message(monkeypatch):
    r = client_for(monkeypatch, FakeES()).get("/api/v1/export/gold/schema-drift?days=14")
    assert r.status_code == 404
    assert "No gold metric records found in the last 14 days" in r.json()["detail"]


def test_records_are_returned_as_csv(monkeypatch):
    es = FakeES(hits=[{"_source": {"date": "2026-10-01", "drift_count": 3}}])
    r = client_for(monkeypatch, es).get("/api/v1/export/gold/schema-drift?days=14")
    assert r.status_code == 200
    assert r.text.splitlines() == ["date,drift_count", "2026-10-01,3"]


def test_a_real_elasticsearch_failure_is_still_a_500(monkeypatch):
    r = client_for(monkeypatch, FakeES(fail=True)).get("/api/v1/export/gold/schema-drift?days=14")
    assert r.status_code == 500
    assert "boom" in r.json()["detail"]
