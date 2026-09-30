import io
import os
import sys

import pytest
from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import ingest_guards as g


class FakeResponse:
    def __init__(self, status_code, location=None):
        self.status_code = status_code
        self.headers = {"Location": location} if location else {}


def test_api_url_rejected_when_allowlist_unset(monkeypatch):
    monkeypatch.delenv("API_INGEST_ALLOWED_HOSTS", raising=False)
    with pytest.raises(HTTPException) as err:
        g.validate_api_ingest_url("https://example.com/data.json")
    assert err.value.status_code == 400
    assert "API_INGEST_ALLOWED_HOSTS" in err.value.detail


def test_data_go_th_is_always_allowed(monkeypatch):
    monkeypatch.delenv("API_INGEST_ALLOWED_HOSTS", raising=False)
    g.validate_api_ingest_url("https://data.go.th/api/3/action/datastore_search?resource_id=x")
    g.validate_api_ingest_url("https://catalog.data.go.th/dataset/abc")


def test_allowlisted_host_passes(monkeypatch):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com, other.org")
    g.validate_api_ingest_url("https://example.com/x")
    g.validate_api_ingest_url("http://other.org/y")


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.com/x", "https:///nohost"])
def test_non_http_or_hostless_urls_rejected(monkeypatch, url):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com")
    with pytest.raises(HTTPException) as err:
        g.validate_api_ingest_url(url)
    assert err.value.status_code == 400


def test_safe_get_blocks_redirect_to_internal_service(monkeypatch):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com")
    calls = []

    def fake_get(url, headers=None, timeout=None, allow_redirects=True):
        calls.append((url, allow_redirects))
        return FakeResponse(302, "http://elasticsearch:9200/_cat/indices")

    with pytest.raises(HTTPException) as err:
        g.safe_get("https://example.com/data", session_get=fake_get)
    assert err.value.status_code == 400
    assert calls == [("https://example.com/data", False)]


def test_safe_get_follows_redirect_within_allowlist(monkeypatch):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com")
    responses = [FakeResponse(301, "/v2/data"), FakeResponse(200)]
    urls = []

    def fake_get(url, headers=None, timeout=None, allow_redirects=True):
        urls.append(url)
        return responses.pop(0)

    res = g.safe_get("https://example.com/data", session_get=fake_get)
    assert res.status_code == 200
    assert urls == ["https://example.com/data", "https://example.com/v2/data"]


def test_safe_get_gives_up_after_max_redirects(monkeypatch):
    monkeypatch.setenv("API_INGEST_ALLOWED_HOSTS", "example.com")
    calls = []

    def fake_get(url, headers=None, timeout=None, allow_redirects=True):
        calls.append(url)
        return FakeResponse(302, "/again")

    with pytest.raises(HTTPException) as err:
        g.safe_get("https://example.com/start", session_get=fake_get)
    assert "Too many redirects" in err.value.detail
    assert len(calls) == g.MAX_REDIRECTS + 1


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self.description = [("a",)]

    def execute(self, sql):
        self.conn.executed.append(sql)

    def fetchmany(self, n):
        return self.conn.rows[:n]


class FakeConn:
    def __init__(self, rows):
        self.rows = rows
        self.executed = []
        self.session = None
        self.closed = False

    def set_session(self, **kwargs):
        self.session = kwargs

    def cursor(self):
        return FakeCursor(self)

    def close(self):
        self.closed = True


def test_query_runs_in_readonly_transaction_with_timeout():
    conn = FakeConn(rows=[(1,), (2,)])
    columns, rows = g.run_readonly_query(lambda: conn, "SELECT a FROM t", max_rows=10)
    assert conn.session == {"readonly": True}
    assert conn.executed[0] == "SET statement_timeout = 30000"
    assert conn.executed[1] == "SELECT a FROM t"
    assert columns == ["a"] and rows == [(1,), (2,)]
    assert conn.closed


def test_query_over_row_cap_is_rejected_and_connection_closed():
    conn = FakeConn(rows=[(1,), (2,), (3,)])
    with pytest.raises(HTTPException) as err:
        g.run_readonly_query(lambda: conn, "SELECT a FROM t", max_rows=2)
    assert err.value.status_code == 413
    assert conn.closed


@pytest.mark.parametrize("sql", ["SELECT 1; DROP TABLE x", "DELETE FROM x", "WITH d AS (DELETE FROM x) SELECT 1"])
def test_non_select_sql_rejected(sql):
    with pytest.raises(HTTPException) as err:
        g.validate_select_only(sql)
    assert err.value.status_code == 400


class FakeUpload:
    def __init__(self, data):
        self.file = io.BytesIO(data)


def test_upload_over_limit_rejected():
    with pytest.raises(HTTPException) as err:
        g.read_upload_limited(FakeUpload(b"x" * 11), max_bytes=10, chunk_size=4)
    assert err.value.status_code == 413


def test_upload_under_limit_returned_whole():
    assert g.read_upload_limited(FakeUpload(b"abc"), max_bytes=10) == b"abc"


def test_max_upload_bytes_reads_env(monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "3")
    assert g.max_upload_bytes() == 3 * 1024 * 1024
