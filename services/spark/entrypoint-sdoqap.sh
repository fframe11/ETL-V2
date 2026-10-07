#!/bin/bash
set -e

if [ "$SPARK_MODE" = "master" ]; then
    echo "[SDOQAP] Starting background Spark Trigger Daemon (port 8099)..."
    (
        sleep 2
        python /opt/spark-apps/spark_trigger_daemon.py
    ) &
fi

if [ $# -eq 0 ]; then
    set -- "/opt/bitnami/scripts/spark/run.sh"
fi

exec /opt/bitnami/scripts/spark/entrypoint.sh "$@"
