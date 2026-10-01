| Result | Method | Route | Statuses seen |
|---|---|---|---|
| OK | GET | `/api/v1/lineage/{table_name}` | 200 404 |
| OK | GET | `/api/v1/lineage/inspect/{table_name}/{node_id}` | 200 |
| OK | GET | `/api/v1/lineage/{table_name}/trust-check` | 200 |
| OK | GET | `/api/v1/pipeline` | 200 400 |
| OK | GET | `/api/v1/pipeline/{run_id}` | 200 404 |
| OK | POST | `/api/v1/pipeline/acknowledge/{run_id}` | 200 |
| OK | POST | `/api/v1/pipeline/retry/{run_id}` | 200 401 404 |
| OK | GET | `/api/v1/pipeline/runs/{ingest_id}` | 200 404 |
| OK | POST | `/api/v1/pipeline/ingest/csv` | 0 200 202 400 |
| OK | POST | `/api/v1/pipeline/ingest/api` | 200 202 400 401 |
| OK | POST | `/api/v1/pipeline/ingest/reddit` | 200 401 |
| OK | GET | `/api/v1/pipeline/ingest/reddit/status` | 200 |
| REACHED | POST | `/api/v1/pipeline/ingest/reddit/stop` | 400 |
| OK | POST | `/api/v1/pipeline/ingest/rdbms` | 202 400 502 |
| OK | GET | `/api/v1/quality` | 200 |
| OK | GET | `/api/v1/quality/{table_name}` | 200 |
| OK | GET | `/api/v1/schema/proposals` | 200 |
| OK | POST | `/api/v1/schema/proposals/{proposal_id}/approve` | 200 404 |
| OK | POST | `/api/v1/schema/proposals/{proposal_id}/reject` | 200 |
| AUTH_ONLY | POST | `/api/v1/schema/proposals/approve-all` | 401 |
| UNTESTED | POST | `/api/v1/schema/proposals/reject-all` | - |
| OK | POST | `/api/v1/schema/proposals/simulate` | 200 |
| OK | POST | `/api/v1/schema/proposals/create` | 200 |
| OK | GET | `/api/v1/export/tables` | 200 |
| OK | DELETE | `/api/v1/export/tables/{table_name}` | 200 401 404 |
| OK | GET | `/api/v1/export/preview/{layer}/{table_name}` | 200 404 500 |
| OK | GET | `/api/v1/export/records/{layer}/{table_name}` | 200 |
| OK | GET | `/api/v1/export/raw/{table_name}` | 200 404 |
| OK | GET | `/api/v1/export/active/{table_name}` | 200 |
| OK | GET | `/api/v1/export/quarantine/{table_name}` | 200 |
| REACHED | GET | `/api/v1/export/reddit` | 404 |
| OK | GET | `/api/v1/export/gold/{metric}` | 200 404 500 |
| OK | GET | `/api/v1/rules/profiles/{table_name}` | 200 |
| OK | GET | `/api/v1/rules/ai-proposals` | 200 |
| OK | POST | `/api/v1/rules/ai-proposals/{proposal_id}/approve` | 200 404 |
| OK | POST | `/api/v1/rules/ai-proposals/reset` | 200 |
| OK | POST | `/api/v1/rules/ai-proposals/{proposal_id}/reject` | 200 |
| OK | GET | `/api/v1/rules/{table_name}` | 200 |
| OK | PUT | `/api/v1/rules/{table_name}` | 200 400 401 |
| OK | GET | `/api/v1/standardize/review-queue` | 200 |
| OK | POST | `/api/v1/standardize/review-queue/{item_id}/approve` | 200 404 |
| OK | POST | `/api/v1/standardize/review-queue/{item_id}/override` | 200 404 |
| OK | POST | `/api/v1/standardize/review-queue/{item_id}/reject` | 200 400 404 |
| OK | POST | `/api/v1/standardize/rollback` | 200 |
| OK | GET | `/api/v1/whitebox/profile` | 200 |
| OK | POST | `/api/v1/whitebox/profile/upload` | 200 |
| OK | GET | `/api/v1/whitebox/context/default` | 200 |
| OK | POST | `/api/v1/whitebox/recommend-rules` | 200 |
| OK | POST | `/api/v1/whitebox/execute` | 200 422 |
| OK | GET | `/api/v1/whitebox/benchmark` | 200 |
| OK | GET | `/api/v1/whitebox/downstream-analytics` | 200 |
| OK | GET | `/api/v1/whitebox/multi-table/preview` | 200 |
| OK | POST | `/api/v1/whitebox/multi-table/analyze` | 200 |
| OK | POST | `/api/v1/whitebox/multi-table/join` | 200 |
| OK | GET | `/api/v1/whitebox/run-all` | 200 |
| OK | POST | `/api/v1/whitebox/run-all` | 200 |
| OK | GET | `/api/v1/whitebox/state` | 200 |
| OK | POST | `/api/v1/whitebox/state` | 200 |
| OK | GET | `/api/v1/whitebox/export-csv/{zone}` | 200 |
| OK | GET | `/api/v1/whitebox/preview-zone/{zone}` | 200 |
| OK | POST | `/api/v1/whitebox/upload-csv` | 200 |
| OK | POST | `/api/v1/whitebox/ingest-source` | 200 |
| OK | GET | `/api/v1/whitebox/ai-context-explanations` | 200 |
| OK | POST | `/api/v1/whitebox/ai-context-explanations` | 200 |
| OK | GET | `/api/v1/kpi/stats` | 200 |
| OK | GET | `/api/v1/executive/overview` | 200 |
| OK | GET | `/api/v1/anomaly/sources` | 200 |
| OK | GET | `/api/v1/analytics/projection` | 200 |
| OK | GET | `/api/v1/analytics/clustering` | 200 |
| OK | GET | `/api/v1/analytics/impact` | 200 |
| OK | GET | `/api/v1/analytics/sell-in-out` | 200 |
| OK | GET | `/api/v1/analytics/recommendations` | 200 |
| OK | GET | `/api/v1/gold/daily-quality` | 200 |
| OK | GET | `/api/v1/gold/error-patterns` | 200 |
| OK | GET | `/api/v1/gold/financial-impact` | 200 |
| OK | GET | `/api/v1/gold/schema-drift-history` | 200 |
| OK | GET | `/api/v1/gold/schema-drift` | 200 |
| OK | POST | `/api/v1/gold/rebuild` | 200 401 |
| OK | GET | `/api/v1/services/status` | 200 502 |
| OK | GET | `/api/v1/performance/metrics` | 200 |
| OK | GET | `/api/v1/system/activity` | 200 |
| AUTH_ONLY | POST | `/api/v1/system/cleanup` | 401 |
| OK | GET | `/api/v1/system/settings` | 200 |
| OK | POST | `/api/v1/system/settings` | 200 400 401 |
| OK | POST | `/api/v1/system/alert` | 200 401 |
| OK | GET | `/api/v1/system/remediations` | 200 |
| REACHED | POST | `/api/v1/system/remediations/{ticket_id}/resolve` | 404 |
| OK | POST | `/api/v1/auth/login` | 200 401 |
| OK | POST | `/api/v1/auth/logout` | 200 |
| OK | GET | `/api/v1/auth/me` | 200 401 |
| OK | GET | `/` | 200 |
| OK | GET | `/health` | 200 |
| OK | POST | `/health` | 200 |
| OK | GET | `/healthz` | 200 |

routes=94 OK=88 REACHED=3 AUTH_ONLY=2 UNTESTED=1
