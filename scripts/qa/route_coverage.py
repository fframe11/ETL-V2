"""Which API routes did a QA run actually exercise?

Compares the API's OpenAPI document with the call log written by scripts/qa/lib.sh (one
line per call: METHOD PATH STATUS) and classifies every route:
  OK         at least one call answered 2xx or 3xx
  REACHED    the handler answered, but never with success (4xx/5xx other than 401/403)
  AUTH_ONLY  only 401/403 or a failed connection was seen: the route was never exercised
  UNTESTED   no call at all
Exit code 1 while any route is AUTH_ONLY or UNTESTED.

Usage: python scripts/qa/route_coverage.py --calls docs/testing/evidence/route-calls.log"""
import argparse
import json
import sys
import urllib.request
from collections import Counter

HTTP_METHODS = ("get", "post", "put", "patch", "delete")
# Registered with include_in_schema=False in services/api/main.py, so absent from OpenAPI.
EXTRA_ROUTES = [("GET", "/healthz")]
STATES = ("OK", "REACHED", "AUTH_ONLY", "UNTESTED")


def load_routes(doc):
    routes = [(method.upper(), template)
              for template, item in doc.get("paths", {}).items()
              for method in HTTP_METHODS if method in item]
    return routes + [r for r in EXTRA_ROUTES if r not in routes]


def _segments(path):
    return [s for s in path.split("/") if s]


def _matches(template, path):
    t, p = _segments(template), _segments(path)
    return len(t) == len(p) and all(a.startswith("{") or a == b for a, b in zip(t, p))


def match_route(method, path, routes):
    """The route a call hits. A literal segment beats a {parameter}: this API registers
    its literal routes before the parameter routes they overlap with."""
    hits = [r for r in routes if r[0] == method and _matches(r[1], path)]
    if not hits:
        return None
    return max(hits, key=lambda r: sum(not s.startswith("{") for s in _segments(r[1])))


def parse_calls(text):
    calls = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[2].isdigit():
            calls.append((parts[0].upper(), parts[1].split("?")[0], int(parts[2])))
    return calls


def classify(statuses):
    if not statuses:
        return "UNTESTED"
    if any(200 <= s < 400 for s in statuses):
        return "OK"
    if all(s in (0, 401, 403) for s in statuses):
        return "AUTH_ONLY"
    return "REACHED"


def coverage(routes, calls):
    seen = {route: set() for route in routes}
    unmatched = []
    for method, path, status in calls:
        route = match_route(method, path, routes)
        if route is None:
            unmatched.append((method, path, status))
        else:
            seen[route].add(status)
    return seen, unmatched


def _read(source):
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source, timeout=15) as resp:
            return resp.read().decode("utf-8")
    with open(source, encoding="utf-8") as fh:
        return fh.read()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Route coverage of a QA run")
    parser.add_argument("--openapi", default="http://localhost:8002/openapi.json", help="URL or file")
    parser.add_argument("--calls", required=True, help="call log: METHOD PATH STATUS per line")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp874/cp1252

    seen, unmatched = coverage(load_routes(json.loads(_read(args.openapi))), parse_calls(_read(args.calls)))
    print("| Result | Method | Route | Statuses seen |")
    print("|---|---|---|---|")
    for (method, template), statuses in seen.items():
        shown = " ".join(str(s) for s in sorted(statuses)) or "-"
        print(f"| {classify(statuses)} | {method} | `{template}` | {shown} |")
    if unmatched:
        print("\nCalls that matched no route:")
        for method, path, status in sorted(set(unmatched)):
            print(f"- {method} {path} -> {status}")
    counts = Counter(classify(statuses) for statuses in seen.values())
    print(f"\nroutes={len(seen)} " + " ".join(f"{state}={counts.get(state, 0)}" for state in STATES))
    return 1 if counts.get("AUTH_ONLY") or counts.get("UNTESTED") else 0


if __name__ == "__main__":
    sys.exit(main())
