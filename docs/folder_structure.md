# Project Folder Structure

This document outlines the monorepo folder structure for SDOQAP (Scalable Data Observability and Quality Assurance Platform).

---

## 1. Directory Tree

```
/ (Project Root)
├── docker-compose.yml              # Orchestrates HDFS, Spark, Elasticsearch, n8n, API, UI, Grafana, Kafka, etc.
├── docker-swarm-ha.yml             # HA deployment variant
├── start_system.bat                # Brings up the full stack
├── test_data_source.bat            # Menu-driven dataset/API ingestion test
├── .env                            # Elasticsearch/HDFS credentials (gitignored)
├── api/                            # Serving Layer (FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                     # App assembly, health checks, router registration
│   ├── seed_es.py                  # Elasticsearch index seeding
│   └── app/api/                    # Routers: lineage, pipeline, quality, schema,
│                                    #   data_export, dynamic_rules, standardize,
│                                    #   whitebox, analytics, gold, system, config
├── spark/                          # Quality engine and rule/schema config
│   ├── Dockerfile
│   ├── spark_quality_engine.py     # Core quality check + quarantine logic
│   ├── spark_gold_layer.py         # Pre-aggregated summary tables
│   ├── dynamic_rules_engine.py     # Evaluates spark/rules_config.json
│   ├── ai_rule_advisor.py          # Ollama-backed rule suggestions
│   ├── schema_registry.json        # Per-table primary key/date column/schema spec
│   ├── rules_config.json           # Per-table quality rules and thresholds
│   ├── semantic_cleaner/           # Semantic data-cleaning module
│   └── tests/                      # Integration tests (run_integration_test.py, etc.)
├── ui/                              # React (Vite) frontend — the Central Portal
│   └── src/
│       ├── pages/                  # Dashboard, Ingestion, Pipeline, Schema,
│       │                           #   RulesConfig, DataExport, Analytics, Metadata, ...
│       ├── components/
│       └── hooks/useApi.js
├── n8n/                             # Ingestion workflow definition (n8n)
├── grafana/provisioning/            # Grafana datasources + dashboards
├── prometheus/                      # Prometheus scrape config
├── nginx/                           # Reverse proxy in front of ui + api
├── scripts/                         # Host/API-container-side operational scripts
│   ├── dev/                        # activate_db, check_webhooks, inspect_db
│   ├── maintenance/                # cleanup, install, run_phase (.bat)
│   └── verify/                     # verify_pipeline.bat
├── user_inputs/                     # Where users drop dataset/API test files
│   ├── datasets/
│   └── apis/
├── dummy_data/                      # Sample data in multiple formats (csv/json/parquet/avro/xml)
└── docs/                            # This directory
```

---

## 2. Directory Descriptions

- **`/api`**: FastAPI serving layer. `main.py` only assembles the app (CORS, rate limiting, health checks, router registration); all domain logic lives in `app/api/*.py` routers, each with its own `APIRouter`.
- **`/spark`**: Runs inside the `spark-master`/`spark-worker` containers (mounted at `/opt/spark-apps`). Owns quality scoring, schema drift detection, and config-driven rules. Note: this directory is *not* the same mount as `/scripts` — some utility scripts (e.g. `alert_router.py`, `reddit_stream.py`) are intentionally duplicated between `/scripts` and `/spark` because the two containers don't share a volume.
- **`/ui`**: React dashboard, built and served behind `nginx`.
- **`/n8n`**: Ingestion workflow definitions used by `test_data_source.bat`.
- **`/grafana`, `/prometheus`**: Observability provisioning, auto-loaded on `docker compose up`.
- **`/scripts`**: Operational scripts mounted read-only into the `api` container at `/app/scripts`.
- **`/user_inputs`**: Drop zone for local CSV datasets and downloaded API responses (gitignored, except READMEs).
