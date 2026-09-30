import os
import sys

import pytest
import requests
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import pipeline, run_registry
from app.api.auth import require_session, require_session_or_service_key
from fakes import FakeES

CSV = b"student_id,course,score\nS1,DW,80\n"


@pytest.fixture
def client(monkeypatch):
    es = FakeES()
    uploads, triggers = [], []
    monkeypatch.setattr(pipeline, "get_es_client", lambda: es)
    monkeypatch.setattr(pipeline, "upload_to_webhdfs",
                        lambda t, c, i: uploads.append((t, c, i)) or f"/data/raw/{t}/{i}/{t}.csv")
    monkeypatch.setattr(pipeline, "trigger_spark_job",
                        lambda t, i: triggers.append((t, i)) or {"status": "running"})
    app = FastAPI()
    app.include_router(pipeline.router)
    app.dependency_overrides[require_session_or_service_key] = lambda: "test"
    app.dependency_overrides[require_session] = lambda: "test"
    c = TestClient(app)
    c.es, c.uploads, c.triggers = es, uploads, triggers
    return c


def post_csv(client, content=CSV, table="scores"):
    return client.post("/api/v1/pipeline/ingest/csv", data={"table_name": table},
                       files={"file": ("scores.csv", content, "text/csv")})


def test_upload_lands_in_its_own_folder_and_is_queued(client):
    r = post_csv(client)
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "queued" and body["spark_triggered"] is True
    ingest_id = body["ingest_id"]
    assert client.uploads == [("scores", CSV, ingest_id)]
    assert client.triggers == [("scores", ingest_id)]
    assert run_registry.get_run(client.es, ingest_id)["state"] == "QUEUED"


def test_two_different_uploads_never_share_a_raw_folder(client):
    a = post_csv(client).json()["ingest_id"]
    b = post_csv(client, CSV + b"S2,DW,70\n").json()["ingest_id"]
    assert a != b
    assert {u[2] for u in client.uploads} == {a, b}


def test_same_file_twice_is_a_duplicate_and_not_reprocessed(client):
    first = post_csv(client).json()
    second = post_csv(client)
    assert second.status_code == 200
    assert second.json()["status"] == "duplicate"
    assert second.json()["ingest_id"] == first["ingest_id"]
    assert len(client.triggers) == 1


def test_daemon_down_marks_trigger_failed_and_returns_503(client, monkeypatch):
    def boom(table, ingest_id):
        raise HTTPException(status_code=503, detail="daemon down")

    monkeypatch.setattr(pipeline, "trigger_spark_job", boom)
    r = post_csv(client)
    assert r.status_code == 503
    (run,) = client.es.docs["sdoqap_runs"].values()
    assert run["state"] == "TRIGGER_FAILED" and run["error"] == "daemon down"


def test_file_missing_registered_primary_key_is_rejected_before_landing(client):
    client.es.index(index="sdoqap_schema_registry", id="scores", document={"primary_key": "student_id"})
    r = post_csv(client, b"course,score\nDW,80\n")
    assert r.status_code == 400
    assert "student_id" in r.json()["detail"]
    assert client.uploads == []


def test_primary_key_match_ignores_case_spaces_and_underscores(client):
    client.es.index(index="sdoqap_schema_registry", id="scores",
                    document={"primary_key": ["student_id", "course"]})
    assert post_csv(client, b"Student ID,COURSE,score\nS1,DW,80\n").status_code == 202


def test_oversized_upload_is_rejected(client, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "0")
    assert post_csv(client).status_code == 413
    assert client.uploads == []


def test_run_status_endpoint(client):
    ingest_id = post_csv(client).json()["ingest_id"]
    r = client.get(f"/api/v1/pipeline/runs/{ingest_id}")
    assert r.status_code == 200 and r.json()["state"] == "QUEUED"
    assert client.get("/api/v1/pipeline/runs/nope").status_code == 404


def test_retry_by_ingest_id_requeues_same_folder(client):
    ingest_id = post_csv(client).json()["ingest_id"]
    run_registry.update_run(client.es, ingest_id, "FAILED", error="x")
    r = client.post(f"/api/v1/pipeline/retry/{ingest_id}")
    assert r.status_code == 200
    assert client.triggers[-1] == ("scores", ingest_id)
    assert run_registry.get_run(client.es, ingest_id)["state"] == "QUEUED"


def test_trigger_has_no_local_fallback(monkeypatch):
    class Refusing:
        def post(self, *args, **kwargs):
            raise requests.ConnectionError("refused")

    popen_calls = []
    import subprocess
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: popen_calls.append(a))
    monkeypatch.setattr(pipeline, "get_http_session", lambda: Refusing())
    with pytest.raises(HTTPException) as err:
        pipeline.trigger_spark_job("scores", "i1")
    assert err.value.status_code == 503
    assert popen_calls == []


def test_trigger_sends_secret_and_ingest_id(monkeypatch):
    sent = {}

    class Ok:
        status_code = 202

        def json(self):
            return {"status": "queued"}

    class Session:
        def post(self, url, json=None, headers=None, timeout=None):
            sent.update(url=url, json=json, headers=headers)
            return Ok()

    monkeypatch.setenv("TRIGGER_SHARED_SECRET", "s3cret")
    monkeypatch.setattr(pipeline, "get_http_session", lambda: Session())
    assert pipeline.trigger_spark_job("scores", "i1") == {"status": "queued"}
    assert sent["url"].endswith(":8099/retry")
    assert sent["json"] == {"table": "scores", "ingest_id": "i1"}
    assert sent["headers"] == {"X-Trigger-Secret": "s3cret"}
