#!/usr/bin/env bash
# End-to-end check of the ingestion/loading guarantees from Plan B.
# Usage: bash scripts/ops/e2e_ingest_check.sh  (stack running, run from repo root)
set -u
BASE="http://localhost:${NGINX_HOST_PORT:-80}/api/v1/pipeline"
KEY=$(MSYS_NO_PATHCONV=1 docker compose exec -T api printenv INGEST_SERVICE_KEY | tr -d '\r')
TABLE="e2e_ingest_$(date +%s)"
SAMPLE="data/samples/student_scores/student_scores_sample.csv"
TMP=$(mktemp -d)
head -n 501 "$SAMPLE" > "$TMP/a.csv"
{ head -n 1 "$SAMPLE"; tail -n +502 "$SAMPLE"; } > "$TMP/b.csv"

post() { curl -s -H "X-Service-Key: $KEY" -F "table_name=$TABLE" -F "file=@$1" "$BASE/ingest/csv"; }
state() { curl -s "$BASE/runs/$1" | python -c "import sys,json;print(json.load(sys.stdin).get('state'))"; }
ingest_of() { python -c "import sys,json;print(json.loads(sys.argv[1]).get('ingest_id',''))" "$1"; }

echo "== 1. two different files back-to-back (used to overwrite each other)"
A=$(post "$TMP/a.csv"); B=$(post "$TMP/b.csv")
IA=$(ingest_of "$A"); IB=$(ingest_of "$B")
echo "A: $A"; echo "B: $B"
[ -n "$IA" ] && [ -n "$IB" ] && [ "$IA" != "$IB" ] && echo "PASS distinct ingest ids" || echo "FAIL ingest ids"

echo "== 2. same file again -> duplicate"
C=$(post "$TMP/a.csv"); echo "C: $C"
echo "$C" | grep -q '"status":"duplicate"' && echo "PASS duplicate detected" || echo "FAIL duplicate"

echo "== 3. wait for both runs to finish (queued one after the other)"
SA=""; SB=""
for i in $(seq 1 60); do
  SA=$(state "$IA"); SB=$(state "$IB")
  echo "  t=$((i*10))s A=$SA B=$SB"
  case "$SA$SB" in *QUEUED*|*RUNNING*) sleep 10;; *) break;; esac
done
[ "$SA" = "SUCCEEDED" ] && [ "$SB" = "SUCCEEDED" ] && echo "PASS both processed" || echo "FAIL states A=$SA B=$SB"

echo "== 4. both raw folders archived, none deleted"
MSYS_NO_PATHCONV=1 docker compose exec -T namenode hdfs dfs -ls "/data/archive/$TABLE" 2>&1 | tail -n +2
MSYS_NO_PATHCONV=1 docker compose exec -T namenode hdfs dfs -ls "/data/raw/$TABLE" 2>&1 | tail -n +2

echo "== 5. processing time recorded per ingestion"
curl -s "http://localhost:${NGINX_HOST_PORT:-80}/api/v1/quality/$TABLE" | python -c "
import sys, json
d = json.load(sys.stdin)
runs = d if isinstance(d, list) else d.get('runs', d.get('items', []))
for r in runs:
    print(' ', r.get('ingest_id'), r.get('total_records'), r.get('quarantined_records'), r.get('duration_seconds'))
"
rm -rf "$TMP"
