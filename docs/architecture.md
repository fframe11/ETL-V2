# SDOQAP - Architecture Design

This document details the technical architecture of the Scalable Data Observability and Quality Assurance Platform (SDOQAP).

---

## 1. System Overview

SDOQAP is a modular, containerized data platform (Docker Compose) that ingests data from files or APIs, lands it in HDFS, runs Spark-based quality checks, records results in Elasticsearch, and serves both a React dashboard and Grafana for observability.

```
+------------+      +------------------+      +-------------------+
|  Sources   | ---> |   n8n Ingestion  | ---> |   HDFS (raw)      |
| (CSV, API) |      |   Workflow       |      |  namenode/datanode |
+------------+      +------------------+      +-------------------+
                                                          |
                                                          v
+------------+      +------------------+      +-------------------+
|  UI / API  | <--- |   FastAPI        | <--- |  Spark Quality     |
| (React)    |      |   Serving Layer  |      |  Engine (active/  |
+------------+      +------------------+      |  quarantine split)|
      |                      ^                +-------------------+
      v                      |                          |
+------------+      +------------------+                v
| Grafana /  | <--- |  Elasticsearch   | <----------------
| Kibana     |      |  (quality_runs,  |
+------------+      |  schema_drifts,  |
                     |  pipeline_runs)  |
                     +------------------+
```

---

## 2. Component Design & Service Boundaries

### 2.1 Ingestion (n8n)
- **Role**: Orchestrates the ingestion workflow (`n8n/ingestion_workflow.json`) triggered by `test_data_source.bat` or the UI's Ingestion page.
- **Boundaries**: Reads local CSV files or an API URL, normalizes to CSV, and uploads to HDFS under `/data/raw/<table>/`.

### 2.2 Storage (HDFS)
- **Role**: Landing zone and versioned data lake, split into `raw`, `active`, and `quarantine` paths.
- **Boundaries**: `namenode`/`datanode` containers (`bde2020/hadoop-*`), single-replica for local dev.

### 2.3 Data Quality Layer (Apache Spark)
- **Role**: Runs schema validation, quality scoring, and quarantine routing (`spark/spark_quality_engine.py`), schema drift detection against `spark/schema_registry.json`, and config-driven rule evaluation against `spark/rules_config.json` (`spark/dynamic_rules_engine.py`).
- **Boundaries**: Reads from HDFS `raw`, writes clean records to `active`, flagged records to `quarantine`, and run results to Elasticsearch.

### 2.4 Metadata & Observability (Elasticsearch)
- **Role**: System of record for quality run history, schema drift events, pipeline run status, and gold-layer aggregates.
- **Indices**: `sdoqap_quality_runs`, `sdoqap_schema_drifts`, `sdoqap_pipeline_runs`, `sdoqap_gold_*`, `sdoqap_settings`, `sdoqap_upstream_remediations`.

### 2.5 Serving Layer (FastAPI)
- **Role**: Exposes REST endpoints for the UI and external consumers — quality runs, lineage, schema governance (approve/reject drift proposals), dynamic rules, executive/analytics dashboards, and a trust-check API for downstream BI/ML consumers.
- **Boundaries**: Routers live under `api/app/api/` (`lineage`, `pipeline`, `quality`, `schema`, `data_export`, `dynamic_rules`, `standardize`, `whitebox`, `analytics`, `gold`, `system`); `api/main.py` only assembles the app and exposes health checks.

### 2.6 Observability (Grafana, Kibana, Prometheus)
- **Role**: Grafana dashboards query Elasticsearch directly (`grafana/provisioning`); Kibana gives raw index exploration; Prometheus scrapes container metrics (`prometheus/prometheus.yml`).

### 2.7 Streaming (Kafka, Zookeeper)
- **Role**: Backing broker for streaming ingestion experiments (`spark/streaming_job.py`, `scripts/reddit_stream.py`).

---

## 3. Data Flow & Governance

### 3.1 Schema Drift Governance
- On ingestion, Spark compares incoming schema against `spark/schema_registry.json`.
- A drift creates a `PENDING` proposal in Elasticsearch and blocks the registry update.
- Operators approve/reject via `GET/POST /api/v1/schema/proposals[...]` (`api/app/api/schema.py`).

### 3.2 Quality Scoring
- `Quality Score = (Passed Rules / Total Rules) * 100`, evaluated per `spark/rules_config.json` (severity: critical/warning, per-table `quality_score_threshold`).
- Results are written to `sdoqap_quality_runs` and surfaced on the UI's Dashboard/Analytics pages and Grafana.

### 3.3 Trust-Check API
- `GET /api/v1/lineage/{table_name}/trust-check` lets downstream systems check `is_safe_to_consume` before reading a table, based on the latest quality score and any pending schema proposals.

---

## 4. Related Documents

- Root [`README.md`](../README.md) — setup and day-to-day usage (`start_system.bat`, `test_data_source.bat`).
- [`docs/folder_structure.md`](folder_structure.md) — repository layout.
- [`docs/schema_drift_governance.md`](schema_drift_governance.md) — schema drift workflow detail.
