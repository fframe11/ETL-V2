import json
import os
import re
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import system  # noqa: E402

CREDENTIAL_IN_URL = re.compile(r"://[^/\s\"@]+:[^/\s\"@]+@")


def test_services_status_never_returns_a_password(monkeypatch):
    # /api/v1/services/status is public (the login page footer reads it), so no URL in
    # it may embed credentials.
    monkeypatch.setenv("ELASTICSEARCH_USER", "elastic")
    monkeypatch.setenv("ELASTICSEARCH_PASSWORD", "s3cret-pw")
    body = json.dumps(system.get_services_status())
    assert "s3cret-pw" not in body
    assert not CREDENTIAL_IN_URL.search(body)


def test_services_status_keeps_its_shape_and_the_elasticsearch_link(monkeypatch):
    monkeypatch.setenv("ELASTICSEARCH_PASSWORD", "s3cret-pw")
    result = system.get_services_status()
    assert set(result["Elasticsearch"]) == {"status", "url"}
    assert result["Elasticsearch"]["url"] == "http://localhost:9200"
