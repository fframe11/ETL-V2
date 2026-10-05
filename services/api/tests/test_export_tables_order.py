import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import data_export  # noqa: E402


class _Resp:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload

    def json(self):
        return self._payload


def _dir(name, modified_ms):
    return {"type": "DIRECTORY", "pathSuffix": name, "modificationTime": modified_ms}


def _fake_hdfs(listing_by_path):
    def get(url, timeout=None, **_):
        for path, files in listing_by_path.items():
            if f"/webhdfs/v1{path}?op=LISTSTATUS" in url:
                return _Resp(200, {"FileStatuses": {"FileStatus": files}})
        return _Resp(404, {})
    return get


def test_newest_imported_table_comes_first_not_the_first_alphabetically(monkeypatch):
    monkeypatch.setattr(data_export.requests, "get", _fake_hdfs({
        "/data/raw": [_dir("olist_products_dataset", 1_790_000_300_000)],
        "/data/active": [_dir("bench_10000", 1_790_000_100_000), _dir("olist_products_dataset", 1_790_000_200_000)],
        "/data/quarantine": [_dir("alpha_old", 1_790_000_050_000)],
    }))
    out = data_export.list_export_tables()
    names = [t["name"] for t in out["tables"]]
    assert names == ["olist_products_dataset", "bench_10000", "alpha_old"]
    first = out["tables"][0]
    assert first["layers"] == ["raw", "active"]
    assert first["updated_at"].startswith("2026-")  # newest time across the layers


def test_tables_without_a_time_still_list_and_sort_by_name(monkeypatch):
    monkeypatch.setattr(data_export.requests, "get", _fake_hdfs({
        "/data/active": [{"type": "DIRECTORY", "pathSuffix": "b"}, {"type": "DIRECTORY", "pathSuffix": "a"}],
    }))
    out = data_export.list_export_tables()
    assert [t["name"] for t in out["tables"]] == ["a", "b"]
    assert all(t["updated_at"] is None for t in out["tables"])
