"""Machine callers must send the key their target requires. Guards the tracked config
of n8n, Grafana and compose; the secrets themselves stay in .env."""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

REQUIRED_HEADERS = [
    ("http://api:8000/api/v1/pipeline/ingest/", "X-Service-Key", "={{ $env.INGEST_SERVICE_KEY }}"),
    ("http://api:8000/api/v1/system/cleanup", "X-Service-Key", "={{ $env.INGEST_SERVICE_KEY }}"),
    ("http://api:8000/api/v1/system/alert", "X-Webhook-Secret", "={{ $env.ALERT_WEBHOOK_SECRET }}"),
    ("http://spark-master:8099/", "X-Trigger-Secret", "={{ $env.TRIGGER_SHARED_SECRET }}"),
    ("http://elasticsearch:9200/", "Authorization",
     "={{ 'Basic ' + ('elastic:' + $env.ELASTICSEARCH_PASSWORD).base64Encode() }}"),
]


def _read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as fh:
        return fh.read()


def _http_nodes():
    workflow = json.loads(_read("infra", "n8n", "ingestion_workflow.json"))
    return [n for n in workflow["nodes"] if n["type"] == "n8n-nodes-base.httpRequest"]


def _headers(node):
    params = node["parameters"]
    if not params.get("sendHeaders"):
        return {}
    return {h["name"]: h["value"] for h in params.get("headerParameters", {}).get("parameters", [])}


def test_every_n8n_call_to_a_protected_service_sends_its_key():
    missing = []
    for node in _http_nodes():
        url = node["parameters"]["url"]
        for prefix, name, value in REQUIRED_HEADERS:
            if url.startswith(prefix) and _headers(node).get(name) != value:
                missing.append(f"{node['name']} -> {url} needs {name}")
    assert missing == []


def test_every_protected_target_is_still_called():
    # Keeps the test above honest: if a URL changes, the prefixes must change with it.
    urls = [n["parameters"]["url"] for n in _http_nodes()]
    for prefix, _, _ in REQUIRED_HEADERS:
        assert any(u.startswith(prefix) for u in urls), prefix


def test_n8n_workflow_holds_no_literal_secret():
    auth_headers = {name for _, name, _ in REQUIRED_HEADERS}
    for node in _http_nodes():
        for name, value in _headers(node).items():
            if name in auth_headers:
                assert value.startswith("={{") and "$env." in value, f"{node['name']}: {name}"


def test_grafana_webhook_sends_the_alert_secret():
    text = _read("infra", "grafana", "provisioning", "alerting", "alert_rules.yaml")
    assert re.search(r"^\s*authorization_scheme: Bearer\s*$", text, re.M)
    assert re.search(r"^\s*authorization_credentials: \$ALERT_WEBHOOK_SECRET\s*$", text, re.M)


def test_grafana_container_receives_the_alert_secret():
    compose = _read("docker-compose.yml")
    grafana = compose.split("\n  grafana:\n", 1)[1].split("\n  postgres:\n", 1)[0]
    assert "- ALERT_WEBHOOK_SECRET=${ALERT_WEBHOOK_SECRET}" in grafana
