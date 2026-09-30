#!/bin/bash
if [ "$SPARK_MODE" = "master" ]; then
    echo "Seeding rules/schema registries into Elasticsearch (never overwrites existing docs)..."
    (for i in $(seq 1 30); do python /opt/spark-apps/scripts/seed_config_to_es.py && break; sleep 10; done) &
    echo "Starting Spark Trigger Daemon inside /docker-entrypoint-initdb.d..."
    python /opt/spark-apps/spark_trigger_daemon.py &
fi
