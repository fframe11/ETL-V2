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


def _json_bodies():
    return [(n["name"], n["parameters"]["jsonBody"]) for n in _http_nodes()
            if n["parameters"].get("specifyBody") == "json" and "jsonBody" in n["parameters"]]


def test_every_n8n_json_body_is_valid_for_n8n_2():
    # n8n 2.x: a body starting with "=" is an expression and must be written "={{ ... }}"; a bare
    # "={ "k": $json.x }" is read as literal text and fails with "not valid JSON". Bodies without
    # "=" must be plain valid JSON.
    bad = []
    for name, body in _json_bodies():
        if body.startswith("="):
            if not (body.startswith("={{") and body.rstrip().endswith("}}")):
                bad.append(f"{name}: expression must be ={{{{ ... }}}}")
        else:
            try:
                json.loads(body)
            except ValueError:
                bad.append(f"{name}: not valid JSON")
    assert bad == []


def test_json_body_expressions_still_send_the_fields_the_api_expects():
    bodies = dict(_json_bodies())
    for field in ("table_name", "url", "headers", "api_key"):
        assert f"{field}: $json.{field}" in bodies["Relay Ingest API"]
    for field in ("table_name", "db_type", "host", "port", "username", "password", "database", "query"):
        assert f"{field}: $json.{field}" in bodies["Relay Ingest RDBMS"]
    for name in ("Route Remediation Alert", "Route Quality Alert"):
        for field in ("title", "message", "severity"):
            assert f"{field}: $json.{field}" in bodies[name]
    failure = bodies["Send Failure Alert"]
    assert "n8n Ingestion Pipeline Failure" in failure and "critical" in failure and "execution?.error?.message" in failure
