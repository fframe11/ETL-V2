"""Login requirement of the Data Export routes.

The preview, raw, active, quarantine and reddit routes return whole rows of a pipeline
layer, every column included, so they need a session like /records does. Nothing is
masked on them by design: they ARE the raw, active and quarantine layers that data
engineers inspect, and the app has no role system, so any logged-in user sees every column.
/tables (table names only) and /gold/{metric} (aggregate quality metrics) are not
row-level and stay open on purpose."""
import os
import sys

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import data_export  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402

FRAME = pd.DataFrame({"student_id": [1, 2], "email": ["a@example.org", "b@example.org"], "score": [80.5, 70.0]})

ROW_LEVEL_ROUTES = [
    "/api/v1/export/preview/raw/scores",
    "/api/v1/export/preview/active/scores",
    "/api/v1/export/preview/quarantine/scores",
    "/api/v1/export/preview/reddit/python",
    "/api/v1/export/raw/scores",
    "/api/v1/export/active/scores",
    "/api/v1/export/quarantine/scores",
    "/api/v1/export/reddit?subreddit=python",
]


@pytest.fixture
def backend(monkeypatch):
    monkeypatch.setattr(data_export, "resolve_raw_csv_path", lambda table: f"/data/raw/{table}/I1/{table}.csv")
    monkeypatch.setattr(data_export, "read_hdfs_file", lambda path: b"student_id,email,score\n1,a@example.org,80.5\n")
    monkeypatch.setattr(data_export, "stream_hdfs_file_raw", lambda path: iter([b"student_id,email,score\n"]))
    monkeypatch.setattr(data_export, "read_parquet_folder_to_df", lambda folder: FRAME.copy())


def client(logged_in):
    app = FastAPI()
    app.include_router(data_export.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


@pytest.mark.parametrize("url", ROW_LEVEL_ROUTES)
def test_row_level_routes_need_a_login(backend, url):
    r = client(logged_in=False).get(url)
    assert r.status_code == 401
    assert "email" not in r.text and "a@example.org" not in r.text  # nothing of the data leaks into the refusal


@pytest.mark.parametrize("url", ROW_LEVEL_ROUTES)
def test_row_level_routes_still_work_with_a_session(backend, url):
    r = client(logged_in=True).get(url)
    assert r.status_code == 200
    assert "email" in r.text  # every column comes back, personal ones included, by design


def test_a_bad_session_cookie_is_refused(backend):
    app = FastAPI()
    app.include_router(data_export.router)
    c = TestClient(app, cookies={SESSION_COOKIE_NAME: "forged.token"})
    assert c.get("/api/v1/export/active/scores").status_code == 401


def test_tables_listing_stays_open(monkeypatch):
    # Open on purpose: it returns table names only, and scripts/ops/run_all_quality.sh and
    # scripts/windows/run_quality_metrics.ps1 call it with no cookie. Protecting it would break them.
    monkeypatch.setattr(data_export.requests, "get", lambda url, **kw: (_ for _ in ()).throw(OSError("hdfs down")))
    r = client(logged_in=False).get("/api/v1/export/tables")
    assert r.status_code == 200
    assert r.json() == {"tables": [], "reddit_available": False}


def test_gold_metric_export_stays_open(monkeypatch):
    # Open on purpose: aggregate quality metrics, no row-level or personal data.
    class NoIndexES:
        indices = None

        def __init__(self):
            self.indices = self

        def exists(self, index):
            return False

    monkeypatch.setattr(data_export, "get_es", lambda: NoIndexES())
    r = client(logged_in=False).get("/api/v1/export/gold/daily-quality")
    assert r.status_code == 404  # reached the handler, not refused with 401
