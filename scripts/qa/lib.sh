#!/usr/bin/env bash
# Helpers for docs/superpowers/plans/2026-10-01-real-use-feature-test.md
# Usage: source scripts/qa/lib.sh   (from anywhere inside the repo)
ROOT="$(git rev-parse --show-toplevel)"
BASE="${BASE:-http://localhost}"
QA_TMP="${TMPDIR:-/tmp}/qa"; mkdir -p "$QA_TMP"
# Git Bash: native curl/python cannot open /tmp/... inside "-F file=@..."; use C:/... instead.
command -v cygpath >/dev/null 2>&1 && QA_TMP="$(cygpath -m "$QA_TMP")"
JAR="$QA_TMP/session.jar"
EVID="$ROOT/docs/testing/evidence"; mkdir -p "$EVID"
REPORT="$ROOT/docs/testing/2026-10-01-real-use-test-report.md"
QX="$EVID/tmp/qa_scores_x.xlsx"   # generated test workbook (gitignored); mkdir -p "$EVID/tmp" before use
CALLS="$EVID/route-calls.log"   # one line per API call: METHOD PATH STATUS (input of route_coverage.py)

# Git Bash would rewrite container paths such as /data/raw into C:/Program Files/Git/data/raw.
docker() { MSYS_NO_PATHCONV=1 command docker "$@"; }

# The host Python has no pandas; run Python snippets in the api container (pandas, openpyxl),
# with the repo mounted at /work. Paths passed in must therefore be repo-relative or under /work.
pyc() { MSYS_NO_PATHCONV=1 command docker compose -f "$ROOT/docker-compose.yml" run --rm --no-deps -T -v "$ROOT:/work" -w /work api python "$@"; }

envval() { grep -E "^$1=" "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '\r'; }
redact() { sed -E 's#(://[^:/@ ]+:)[^@/ ]+@#\1***@#g'; }
qa_set() { printf '%s' "$2" > "$QA_TMP/$1"; }
qa_get() { cat "$QA_TMP/$1"; }
jget()   { python -c "import sys,json; d=json.load(sys.stdin); print(d.get(sys.argv[1],''))" "$1"; }
API_DIRECT="${API_DIRECT:-http://localhost:$(envval API_PORT)}"   # the API port itself, not nginx

_log() { printf '%s %s %s\n' "$1" "${2%%\?*}" "$3" >> "$CALLS"; }
_req() { # _req BASE JAR-or-"" METHOD PATH [curl args] -> sets _BODY and _CODE, logs the call
  local base="$1" jar="$2" m="$3" p="$4" out; shift 4
  out=$(curl -s ${jar:+-b "$jar"} -X "$m" -w '\n%{http_code}' "$@" "$base$p")
  _CODE="${out##*$'\n'}"; _BODY="${out%$'\n'*}"
  _log "$m" "$p" "$_CODE"
}

qa_login() {
  local body c
  body=$(printf '{"username":"%s","password":"%s"}' "$(envval ADMIN_USERNAME)" "$(envval ADMIN_PASSWORD)")
  c=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -H 'Content-Type: application/json' -d "$body" "$BASE/api/v1/auth/login")
  _log POST /api/v1/auth/login "$c"; echo "login HTTP $c"
}
api()    { _req "$BASE" "$JAR" "$@"; printf '%s\nHTTP %s\n' "$_BODY" "$_CODE"; }
apij()   { _req "$BASE" "$JAR" "$@"; printf '%s' "$_BODY"; }
code()   { _req "$BASE" "$JAR" "$@" -o /dev/null; printf '%s' "$_CODE"; }
anon()   { _req "$BASE" "" "$@" -o /dev/null; printf '%s' "$_CODE"; }
direct() { _req "$API_DIRECT" "" "$@" -o /dev/null; printf '%s' "$_CODE"; }

es() { # es PATH [json-body]
  if [ $# -gt 1 ]; then
    docker exec -i sdoqap-elasticsearch sh -c "curl -s -u elastic:\$ELASTIC_PASSWORD -H 'Content-Type: application/json' 'localhost:9200$1' -d @-" <<<"$2"
  else
    docker exec sdoqap-elasticsearch sh -c "curl -s -u elastic:\$ELASTIC_PASSWORD 'localhost:9200$1'"
  fi
}

wait_run() { # wait_run INGEST_ID [max_seconds]
  local id="$1" max="${2:-300}" t=0 state=""
  while [ "$t" -lt "$max" ]; do
    state=$(apij GET "/api/v1/pipeline/runs/$id" | jget state)
    case "$state" in SUCCEEDED|FAILED|TRIGGER_FAILED) echo "$id -> $state after ${t}s"; return 0;; esac
    sleep 5; t=$((t+5))
  done
  echo "$id still '$state' after ${max}s"; return 1
}

last_quality() { # last_quality TABLE
  es "/sdoqap_quality_runs/_search" "{\"size\":1,\"sort\":[{\"timestamp\":\"desc\"}],\"query\":{\"term\":{\"table_name.keyword\":\"$1\"}}}" \
  | python -c "import sys,json; h=json.load(sys.stdin)['hits']['hits']; s=h[0]['_source'] if h else {}; print({k:s.get(k) for k in ('run_id','table_name','total_records','clean_records','quarantined_records','quality_score')})"
}

qa_record() { # qa_record ID "feature" PASS|FAIL|SKIP "note"
  printf '| %s | %s | %s | %s |\n' "$1" "$2" "$3" "$4" >> "$REPORT"
}
