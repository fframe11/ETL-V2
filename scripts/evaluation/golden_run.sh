#!/usr/bin/env bash
export PYTHONUTF8=1
# Run one CSV through the real batch pipeline and save the counted results.
# First call for a table ingests it; later calls re-process the same ingestion via retry,
# so before/after comparisons always use identical input.
# Usage: bash scripts/evaluation/golden_run.sh <table> <csv> <out.json>
set -eu
TABLE=$1; CSV=$2; OUT=$3
HOST="http://localhost:${NGINX_HOST_PORT:-80}"
KEY=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv INGEST_SERVICE_KEY | tr -d '\r')
USER_=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ADMIN_USERNAME | tr -d '\r')
PASS_=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv ADMIN_PASSWORD | tr -d '\r')
JAR=$(mktemp)
curl -s -c "$JAR" -H "Content-Type: application/json" -d "{\"username\":\"$USER_\",\"password\":\"$PASS_\"}" "$HOST/api/v1/auth/login" >/dev/null

T0=$(date -u +%Y-%m-%dT%H:%M:%S)
RESP=$(curl -s -H "X-Service-Key: $KEY" -F "table_name=$TABLE" -F "file=@$CSV" "$HOST/api/v1/pipeline/ingest/csv")
ID=$(python -c "import sys,json;print(json.loads(sys.argv[1])['ingest_id'])" "$RESP")
if echo "$RESP" | grep -q '"status":"duplicate"'; then
  curl -s -b "$JAR" -X POST "$HOST/api/v1/pipeline/retry/$ID" >/dev/null
fi
echo "ingest $ID"
S=""
for i in $(seq 1 360); do
  S=$(curl -s "$HOST/api/v1/pipeline/runs/$ID" | python -c "import sys,json;print(json.load(sys.stdin).get('state'))")
  case "$S" in QUEUED|RUNNING) sleep 10;; *) break;; esac
done
echo "state $S"
[ "$S" = "SUCCEEDED" ] || { echo "run did not succeed"; rm -f "$JAR"; exit 1; }
curl -s "$HOST/api/v1/quality/$TABLE?limit=50" | python -c "
import sys, json
rows = [r for r in json.load(sys.stdin) if r.get('ingest_id') == sys.argv[1] and r.get('timestamp', '') >= sys.argv[2]]
rows.sort(key=lambda r: r['timestamp'])
first = rows[0]
keep = ('ingest_id', 'run_id', 'total_records', 'clean_records', 'quarantined_records', 'quarantine_breakdown', 'duration_seconds', 'stage_seconds')
json.dump({k: first.get(k) for k in keep}, open(sys.argv[3], 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print(json.dumps({k: first.get(k) for k in keep[:6]}, ensure_ascii=False))
" "$ID" "$T0" "$OUT"
rm -f "$JAR"
