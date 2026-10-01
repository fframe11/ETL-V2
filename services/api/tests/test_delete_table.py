import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")

from app.api import data_export, dynamic_rules, schema  # noqa: E402


class Response:
    status_code = 200


class RecordingES:
    """Just enough Elasticsearch to record what delete_table cleans."""

    def __init__(self):
        self.cleaned = []
        self.indices = self

    def exists(self, index, id=None):
        return True

    def delete_by_query(self, index, body, refresh=None):
        self.cleaned.append((index, body["query"]["term"]))

    def delete(self, index, id, refresh=None):
        self.cleaned.append((index, id))


def delete(monkeypatch, table="scores"):
    es, urls = RecordingES(), []
    monkeypatch.setattr(data_export, "get_es", lambda: es)
    monkeypatch.setattr(data_export.requests, "delete", lambda url, **kw: urls.append(url) or Response())
    # Keep the local-file steps away from the real config files.
    monkeypatch.setattr(dynamic_rules, "_resolve_rules_path", lambda: "/nonexistent/rules_config.json")
    monkeypatch.setattr(schema, "SCHEMA_REGISTRY_PATH", "/nonexistent/schema_registry.json")
    result = data_export.delete_table(table, _user="test")
    return result, es, urls


def test_every_hdfs_layer_including_the_archive_is_deleted(monkeypatch):
    result, _, urls = delete(monkeypatch)
    assert [u.split("/webhdfs/v1")[1].split("?")[0] for u in urls] == [
        "/data/raw/scores", "/data/active/scores", "/data/quarantine/scores", "/data/archive/scores",
    ]
    assert result["hdfs_deleted_layers"] == ["raw", "active", "quarantine", "archive"]


def test_the_run_registry_is_cleared_so_the_same_file_can_be_ingested_again(monkeypatch):
    # sdoqap_runs keeps one doc per ingestion; a leftover SUCCEEDED doc makes the same
    # file "duplicate" of data that no longer exists.
    _, es, _ = delete(monkeypatch)
    assert ("sdoqap_runs", {"table_name.keyword": "scores"}) in es.cleaned
