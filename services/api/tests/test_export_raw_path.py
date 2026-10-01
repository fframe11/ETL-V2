import os
import sys

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")

from app.api import data_export  # noqa: E402


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


def listing(*entries):
    return FakeResponse(200, {"FileStatuses": {"FileStatus": [
        {"pathSuffix": name, "type": kind, "modificationTime": mtime} for name, kind, mtime in entries
    ]}})


def hdfs_lists(monkeypatch, response):
    monkeypatch.setattr(data_export.requests, "get", lambda url, **kwargs: response)


def test_newest_ingest_folder_wins(monkeypatch):
    hdfs_lists(monkeypatch, listing(
        ("20261001T010000-aaaaaaaa", "DIRECTORY", 100),
        ("20261001T020000-bbbbbbbb", "DIRECTORY", 200),
    ))
    assert data_export.resolve_raw_csv_path("scores") == "/data/raw/scores/20261001T020000-bbbbbbbb/scores.csv"


def test_legacy_file_is_used_when_it_was_written_last(monkeypatch):
    hdfs_lists(monkeypatch, listing(
        ("20261001T010000-aaaaaaaa", "DIRECTORY", 100),
        ("scores.csv", "FILE", 300),
    ))
    assert data_export.resolve_raw_csv_path("scores") == "/data/raw/scores/scores.csv"


def test_table_written_only_by_the_scheduled_flows_still_resolves(monkeypatch):
    hdfs_lists(monkeypatch, listing(("gov_data.csv", "FILE", 5), ("_SUCCESS", "FILE", 9)))
    assert data_export.resolve_raw_csv_path("gov_data") == "/data/raw/gov_data/gov_data.csv"


def test_unknown_table_is_404(monkeypatch):
    hdfs_lists(monkeypatch, FakeResponse(404))
    with pytest.raises(HTTPException) as err:
        data_export.resolve_raw_csv_path("nope")
    assert err.value.status_code == 404


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(data_export, "resolve_raw_csv_path", lambda table: f"/data/raw/{table}/I1/{table}.csv")
    app = FastAPI()
    app.include_router(data_export.router)
    return TestClient(app)


def test_raw_preview_reads_the_resolved_file_and_keeps_blank_cells_as_null(client, monkeypatch):
    opened = []
    monkeypatch.setattr(data_export, "read_hdfs_file",
                        lambda path: opened.append(path) or b"student_id,score\nS1,80\nS2,\n")
    r = client.get("/api/v1/export/preview/raw/scores")
    assert r.status_code == 200
    assert opened == ["/data/raw/scores/I1/scores.csv"]
    assert r.json() == {"columns": ["student_id", "score"],
                        "rows": [{"student_id": "S1", "score": 80.0}, {"student_id": "S2", "score": None}]}


def test_raw_download_streams_the_resolved_file(client, monkeypatch):
    monkeypatch.setattr(data_export, "stream_hdfs_file_raw", lambda path: iter([path.encode()]))
    r = client.get("/api/v1/export/raw/scores")
    assert r.status_code == 200
    assert r.content == b"/data/raw/scores/I1/scores.csv"
    assert "scores_raw.csv" in r.headers["content-disposition"]
