import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import dynamic_rules_engine as engine


def _clear(monkeypatch):
    for key in ("ELASTICSEARCH_URL", "ELASTICSEARCH_USER", "ELASTICSEARCH_PASSWORD", "ELASTICSEARCH_HOST", "ELASTICSEARCH_PORT"):
        monkeypatch.delenv(key, raising=False)


def test_builds_the_url_from_parts_when_no_full_url_is_set(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("ELASTICSEARCH_USER", "elastic")
    monkeypatch.setenv("ELASTICSEARCH_PASSWORD", "pw")
    monkeypatch.setenv("ELASTICSEARCH_HOST", "elasticsearch")
    monkeypatch.setenv("ELASTICSEARCH_PORT", "9200")
    base_url, auth = engine._get_es_connection()
    assert base_url == "http://elasticsearch:9200"
    assert auth == ("elastic", "pw")


def test_a_full_url_still_wins_and_credentials_leave_the_url(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("ELASTICSEARCH_URL", "http://u:p@es-host:9201")
    base_url, auth = engine._get_es_connection()
    assert base_url == "http://es-host:9201"
    assert auth == ("u", "p")


def test_nothing_configured_stays_empty(monkeypatch):
    _clear(monkeypatch)
    assert engine._get_es_connection() == ("", None)
