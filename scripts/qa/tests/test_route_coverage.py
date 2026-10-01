import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from route_coverage import classify, coverage, load_routes, main, match_route, parse_calls

DOC = {"paths": {
    "/": {"get": {}},
    "/api/v1/rules/ai-proposals": {"get": {}},
    "/api/v1/rules/{table_name}": {"get": {}, "put": {}, "parameters": []},
    "/api/v1/gold/rebuild": {"post": {}},
    "/api/v1/export/tables/{table_name}": {"delete": {}},
}}
ROUTES = load_routes(DOC)


def test_routes_are_method_and_template_pairs_plus_the_hidden_healthz():
    assert ROUTES == [
        ("GET", "/"),
        ("GET", "/api/v1/rules/ai-proposals"),
        ("GET", "/api/v1/rules/{table_name}"),
        ("PUT", "/api/v1/rules/{table_name}"),
        ("POST", "/api/v1/gold/rebuild"),
        ("DELETE", "/api/v1/export/tables/{table_name}"),
        ("GET", "/healthz"),
    ]


def test_a_literal_route_wins_over_a_parameter_route():
    assert match_route("GET", "/api/v1/rules/ai-proposals", ROUTES) == ("GET", "/api/v1/rules/ai-proposals")
    assert match_route("GET", "/api/v1/rules/qa_scores", ROUTES) == ("GET", "/api/v1/rules/{table_name}")
    assert match_route("GET", "/", ROUTES) == ("GET", "/")


def test_method_and_segment_count_must_match():
    assert match_route("POST", "/api/v1/rules/qa_scores", ROUTES) is None
    assert match_route("GET", "/api/v1/rules/qa_scores/extra", ROUTES) is None


def test_calls_are_parsed_without_query_strings_and_junk_lines():
    text = "GET /api/v1/rules/qa_scores?x=1 200\n\nnot a call\nput /api/v1/rules/qa_scores 401\nGET /x 000\n"
    assert parse_calls(text) == [
        ("GET", "/api/v1/rules/qa_scores", 200),
        ("PUT", "/api/v1/rules/qa_scores", 401),
        ("GET", "/x", 0),
    ]


def test_classification():
    assert classify(set()) == "UNTESTED"
    assert classify({401}) == "AUTH_ONLY"
    assert classify({0, 403}) == "AUTH_ONLY"
    assert classify({401, 404}) == "REACHED"
    assert classify({500}) == "REACHED"
    assert classify({401, 200}) == "OK"


def test_coverage_groups_statuses_by_route_and_keeps_unmatched_calls():
    calls = parse_calls("GET /api/v1/rules/a 200\nGET /api/v1/rules/b 404\nGET /nowhere 404\n")
    seen, unmatched = coverage(ROUTES, calls)
    assert seen[("GET", "/api/v1/rules/{table_name}")] == {200, 404}
    assert seen[("POST", "/api/v1/gold/rebuild")] == set()
    assert unmatched == [("GET", "/nowhere", 404)]


def write(tmp_path, calls):
    openapi = tmp_path / "openapi.json"
    openapi.write_text(json.dumps(DOC), encoding="utf-8")
    log = tmp_path / "route-calls.log"
    log.write_text(calls, encoding="utf-8")
    return ["--openapi", str(openapi), "--calls", str(log)]


def test_main_fails_while_a_route_is_untested_or_only_refused(tmp_path, capsys):
    assert main(write(tmp_path, "GET / 200\nPOST /api/v1/gold/rebuild 401\n")) == 1
    out = capsys.readouterr().out
    assert "| AUTH_ONLY | POST | `/api/v1/gold/rebuild` | 401 |" in out
    assert "| UNTESTED | GET | `/healthz` | - |" in out
    assert "routes=7 OK=1 REACHED=0 AUTH_ONLY=1 UNTESTED=5" in out


def test_main_passes_when_every_route_was_reached(tmp_path, capsys):
    calls = ("GET / 200\nGET /api/v1/rules/ai-proposals 200\nGET /api/v1/rules/t 200\nPUT /api/v1/rules/t 400\n"
             "POST /api/v1/gold/rebuild 200\nDELETE /api/v1/export/tables/t 200\nGET /healthz 200\n")
    assert main(write(tmp_path, calls)) == 0
    assert "routes=7 OK=6 REACHED=1 AUTH_ONLY=0 UNTESTED=0" in capsys.readouterr().out
