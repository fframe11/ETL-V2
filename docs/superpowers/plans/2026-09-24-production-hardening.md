# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix every finding from the 8-domain audit of SDOQAP (Spark quality engine, API routers, UI, infra), add real backend session authentication, remove all hardcoded/fabricated data, and make n8n the real ingestion orchestrator — per explicit user direction: root-cause every issue, zero hardcoding, production-deployable.

**Architecture:** No new services. Adds one new module (`api/app/api/auth.py`, HMAC-signed session cookie) and a handful of new required env vars (no hardcoded defaults, per the "no hardcode" mandate). All other work is fixes within existing files. Every wave is verified against the live running Docker stack (rebuild affected container(s), curl/exercise the change, check logs) before moving to the next wave, and committed to `main` per the user's earlier explicit consent to commit directly to main.

**User decisions locked in for this plan:**
1. Auth: single admin credential, backend-verified, HttpOnly signed session cookie (not a full multi-user system).
2. `/ingest/rdbms`: restrict to `SELECT`-only + host allowlist (not open arbitrary SQL).
3. n8n: wire it to be the real orchestrator — webhook receives real payload and drives real ingestion.
4. Hardcoded "audit" panels (WhiteBoxPipeline 3-Zone Audit, `evaluate_ground_truth` 7-dimension block, fake rows in Pipeline.jsx/DataExport.jsx): remove entirely rather than backfill with new unscoped compliance-scoring logic.

**Honesty note carried into every wave:** "zero vulnerabilities" cannot be mathematically guaranteed for a system this size with no existing test suite. This plan fixes every concretely identified issue and verifies each fix against the live stack; it is not a formal security certification.

---

## Wave 1 — Critical security & data-loss (pure fixes, no new subsystem)

### 1.1 Spark: stop the destructive merge-failure overwrite
**File:** `spark/spark_quality_engine.py:2394-2401` (the `except Exception` fallback around the Delta MERGE).
Replace the blind `mode("overwrite")` fallback with fail-closed behavior: on merge failure, log a `[CRITICAL]` message, write a `state: "failed"` doc to `sdoqap_pipeline_runs` with the error, **do not** touch `active_path`, and `raise` so the process exits non-zero. Also gate the HDFS raw-folder cleanup (`spark/spark_quality_engine.py:2847-2864`) so it never runs when the run failed (it's currently reached unconditionally after the merge block — needs a `success` flag threaded through).

### 1.2 Spark: lock must fail closed when ES is unreachable
**File:** `spark/spark_quality_engine.py:210-212`. Change `return True` (bypass) to `return False` (abort) on `ConnectionError`/`Timeout`. A quality-assurance system must never let two runs write concurrently just because its coordination store is briefly down.

### 1.3 API: RDBMS ingest — SELECT-only + host allowlist, remove fake-data fallback
**File:** `api/app/api/pipeline.py:540-623` (`ingest_rdbms`).
- Add `validate_select_only(query: str)`: reject anything whose first non-whitespace token isn't `SELECT`, and reject if it contains `;` (no statement chaining) — raise 400 otherwise.
- Add host allowlist: new required-if-used env var `RDBMS_ALLOWED_HOSTS` (comma-separated), checked before connecting; reject with 400 if `payload.host` isn't in the list.
- **Delete** the `# Fallback simulated data if connection fails` block (lines 582-602) entirely. A failed DB connection must raise `HTTPException(502, ...)` with the real error, never fabricate rows.

### 1.4 API: API-ingest SSRF — host allowlist
**File:** `api/app/api/pipeline.py:301-482` (`ingest_api`).
Add new required-if-used env var `API_INGEST_ALLOWED_HOSTS` (comma-separated hostnames; `data.go.th` implicitly allowed since it's a documented built-in). Validate the final `resolved_url`'s host against the allowlist immediately before the `requests.get(resolved_url, ...)` call (line 404) — reject with 400 if not allowlisted and the list is non-empty. If `API_INGEST_ALLOWED_HOSTS` is unset, log a startup warning (like the ES-password one) that the ingest-API endpoint is unrestricted.

**Wave 1 verification:** `docker compose build api spark-worker spark-master && docker compose up -d`, curl the ingest endpoints with a disallowed host (expect 400) and a malformed RDBMS query (expect 400), confirm `sdoqap-api` stays healthy.

---

## Wave 2 — Real backend session authentication

### 2.1 New module `api/app/api/auth.py`
- Required env vars (fail fast at import if unset — no defaults): `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET_KEY`.
- `create_session_token(username) -> str`: `payload = f"{username}:{expiry_unix_ts}"`, `sig = hmac.new(SESSION_SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()`, token = `base64(payload) + "." + sig`. 12-hour expiry.
- `verify_session_token(token) -> Optional[str]`: decode, recompute HMAC with `hmac.compare_digest`, check expiry, return username or `None`.
- `POST /api/v1/auth/login` (body: `username`, `password`): compare against `ADMIN_USERNAME`/`ADMIN_PASSWORD` with `hmac.compare_digest`; on success `Set-Cookie: sdoqap_session=<token>; HttpOnly; SameSite=Lax; Path=/` (+ `Secure` when `SESSION_COOKIE_SECURE` env, default `false` to match this stack's current plain-HTTP nginx front door — documented in README as "set true behind TLS").
- `POST /api/v1/auth/logout`: clear cookie.
- `GET /api/v1/auth/me`: 200 with username if valid session, 401 otherwise.
- `require_session` FastAPI dependency (reads `Request.cookies`, 401 if invalid/missing) — importable by every other router.

### 2.2 Protect every mutating endpoint with `Depends(require_session)`
- `schema.py`: approve/reject/approve-all/reject-all proposal endpoints.
- `dynamic_rules.py`: `PUT /{table_name}`, approve_proposal, reject_proposal.
- `standardize.py`: approve/override/reject/rollback.
- `pipeline.py`: all `/ingest/*` endpoints, `/retry/{run_id}`, `/acknowledge/{run_id}`.
- `system.py`: `/system/cleanup`, `POST /system/settings`, `/system/remediations/{id}/resolve`.
- `gold.py`: `POST /gold/rebuild`.
- `whitebox.py`: `/execute`, `/upload-csv`, and any other state-mutating endpoint found on re-read of the file.

### 2.3 `system/alert` gets machine-to-machine auth instead (it's a Grafana webhook, not a logged-in user)
Add `ALERT_WEBHOOK_SECRET` required env var; check header `X-Webhook-Secret` via `hmac.compare_digest`, 401 if missing/wrong. Document the header requirement in the Grafana alerting docs / README.

### 2.4 Frontend auth rewrite
- `ui/src/pages/Login.jsx`: remove the printed `admin`/`admin` credential hint, the "Auto-fill Admin" button, and the "Go to Dashboard" skip link. `onSubmit` calls `POST /api/v1/auth/login` with the entered credentials; on success navigate to `/dashboard`, on 401 show "Invalid credentials."
- `ui/src/App.jsx` `RequireAuth`: replace the self-granting block with a `GET /api/v1/auth/me` check (via `useEffect`/`useApi`); render children only on success, otherwise `<Navigate to="/login" />`. Wrap `/whitebox` in `RequireAuth` too (currently unwrapped).
- `ui/src/hooks/useApi.js`: ensure fetches use `credentials: 'same-origin'` explicitly, and on a global 401 response redirect to `/login`.

**Wave 2 verification:** rebuild `api` + `ui`, curl a protected endpoint with no cookie (expect 401), log in via the real endpoint, retry with the returned cookie (expect 200), click through the UI in the browser pane to confirm login → dashboard → logout works.

---

## Wave 3 — Business logic correctness

### 3.1 Fix the adaptive-rules dead code
**Files:** `spark/dynamic_rules_engine.py:397-477`, `spark/spark_quality_engine.py:1715` (call site), `spark/rules_config.json` (shape).
Fix `apply_adaptive_rules` to read the threshold mode from the actual nested shape (`rules_config[table]["quality_score_threshold"]["mode"]`, not a flat sibling key), and change the `spark_quality_engine.py:1715` call site to pass the real `df`/`spark` objects instead of `None` so `null_checks`/`value_range` branches execute. Fix `resolve_rule_value()` (`spark_quality_engine.py:1563-1571`) to actually use the dynamically-computed value when `mode == "adaptive"` instead of always reading `base_value`.

### 3.2 Gold layer: use the real computed financial value
**File:** `spark/spark_gold_layer.py:317-364`. Replace `quarantined_records * COST_PER_QUARANTINED_RECORD_USD` with a sum of the run docs' real `quarantined_financial_value` field (already computed and stored by `spark_quality_engine.py:2492-2506`); fall back to the flat estimate only for runs predating that field (log which mode was used per record, for transparency, rather than silently blending both).

### 3.3 Auto-remediation: enforce the confidence gate, stop fabricating stats
**File:** `spark/auto_remediation_engine.py:169, 450-462`. Actually check `analysis_confidence >= self.min_confidence` before calling `save_remediation_rules`; if below threshold, mark the suggestion `PENDING_REVIEW` instead of auto-applying. Replace the hardcoded `confidence_avg = 0.90` with the real average of applied rules' reported confidences, and only increment `stats["fixed"]` after verifying the rule actually reduces the failure count on a sample, not merely on receiving a JSON response.

### 3.4 Whitebox `/execute`: respect rejected rules
**File:** `api/app/api/whitebox.py:572-585`. Gate the missing-score and score-range checks behind `accepted_rules` membership, matching how the duplicate/outlier checks already work — a rule a reviewer rejected must not still run.

### 3.5 AI rule advisor: remove the self-reported-confidence auto-promotion bypass; fix backup/write safety
**Files:** `spark/spark_quality_engine.py:2677-2682`, `spark/ai_rule_advisor.py:1156-1264`.
- Remove the `confidence >= 0.90` auto-approve branch; every AI-suggested rule change becomes a `PENDING` proposal requiring the same human approval path as schema drift (no exceptions).
- `promote_rules_to_config`: add an explicit allowlist of rule-path prefixes the advisor may write (reuse/extend the existing threshold/tolerance guardrails to cover every field it's allowed to touch; anything else is rejected, not silently written).
- Fix backup ordering: write `.bak` from the **pre-mutation** config, before `config[table_name] = table_config` runs.
- Fix non-atomic write: write to a temp file in the same directory, then `os.replace()` onto `rules_config.json`.

### 3.6 Optimistic concurrency on approve/reject endpoints
**Files:** `api/app/api/schema.py`, `api/app/api/standardize.py`, `api/app/api/dynamic_rules.py` (proposal approve/reject paths). Carry `_seq_no`/`_primary_term` from the initial `es.get()` into the `es.update()` call (`if_seq_no=`/`if_primary_term=`); return 409 Conflict if the document changed since it was read.

### 3.7 Trust-check: fail closed on query errors
**File:** `api/app/api/lineage.py:358-378`. On an exception querying `sdoqap_schema_proposals`, do not silently default `pending_proposals_count` to 0 — return `is_safe_to_consume: false` with a reason, matching the existing fail-closed behavior for missing quality runs.

**Wave 3 verification:** rebuild `api` + `spark` images, run `spark/tests/run_integration_test.py` (existing integration test), curl the affected endpoints, inspect a real run doc in ES to confirm the adaptive threshold and financial fields are populated as expected.

---

## Wave 4 — Remove all hardcoded/fabricated data

### 4.1 `whitebox.py` `evaluate_ground_truth`
**File:** `api/app/api/whitebox.py:727-822`. Remove the hardcoded `evaluation_summary`/`seven_dimensions_evaluation`/reconciliation numbers; derive every field from the actually-computed `metrics_by_category`, or omit the field (not fabricate a value) where no real computation exists yet.

### 4.2 `WhiteBoxPipeline.jsx` — remove the static 3-Zone Audit panel
**File:** `ui/src/pages/WhiteBoxPipeline.jsx:1374-1400`. Remove the hardcoded numbers; either bind the panel to real fields from `benchmarkResult` (if the equivalent real data exists elsewhere on the page, e.g. `metrics_by_error_type`) or remove the panel entirely per the user's decision.

### 4.3 `Pipeline.jsx` — remove the 5 fake review rows
**File:** `ui/src/pages/Pipeline.jsx:502-677`. Replace the hardcoded `#105`/`#48`/etc. rows with a render over real review-queue data from the API; show an empty state ("No records pending review") when there is none.

### 4.4 `DataExport.jsx` — remove fabricated owner/timestamp
**File:** `ui/src/pages/DataExport.jsx:371,389,407`. Remove the hardcoded `fframew01@gmail.com` / fixed date; use real metadata from the export API response, or omit the field.

### 4.5 `Dashboard.jsx` — replace fake fallbacks with honest states, wire the real COPDQ breakdown
**File:** `ui/src/pages/Dashboard.jsx:70-76, 942-956, 125-131`.
- Replace the hardcoded `wbTotal`/`wbClean`/etc. fallback constants with `null`/loading-state rendering (e.g. a skeleton or "—") instead of fabricated numbers.
- Replace the invented client-side `0.35/0.45/0.20` COPDQ split with the real `cost_of_correction`/`cost_of_lost_opportunities`/`cost_of_risk` breakdown already computed by `GET /api/v1/analytics/impact` (`api/app/api/analytics.py`'s `get_business_impact` — these three real components already exist server-side and are currently discarded by the UI in favor of an invented ratio).
- Data Availability/Freshness badge logic (`526-551`): treat `score === null` as a distinct "Loading" state, not `false >= threshold` → red "DEGRADED".

**Wave 4 verification:** rebuild `api` + `ui`, load each affected page in the browser pane, confirm no panel shows a number that isn't traceable to a real API field, confirm empty/loading states render sensibly with no data.

---

## Wave 5 — n8n: make it the real orchestrator

### 5.1 Webhook uses the real payload
**File:** `n8n/ingestion_workflow.json`. Rework the `WebhookTrigger` node's downstream connections so its output (the POST body: expected shape `{table_name, source_type: "csv"|"api"|"rdbms", ...}`) is actually consumed, not discarded in favor of the three static branches.

### 5.2 Webhook delegates to the real ingestion endpoints
Add an HTTP Request node per source type that calls the already-correct `POST /api/v1/pipeline/ingest/{csv|api|rdbms}` endpoints (the same ones `test_data_source.bat` and the UI's Ingestion page use), passing through the webhook's payload — instead of re-implementing HDFS upload logic inside n8n. This makes n8n a legitimate second front door onto the one real ingestion path, closing the "two disconnected pipelines" gap.

### 5.3 Keep the 3 scheduled hardcoded-source nodes, but route them through the same real endpoint too
Olist/gov-API/Postgres-sales nodes stay as intentional recurring scheduled jobs (a reasonable feature), but their HTTP calls are pointed at the same `ingest/*` endpoints rather than any bypass, so they benefit from the Wave 1/2/3 fixes (host allowlist, auth, SELECT-only validation) automatically. The Postgres node's query needs to pass the new SELECT-only validation — confirm it already is a SELECT (per the audit, it queries `sales_records`).

### 5.4 Wire error handling in-workflow
Replace reliance on the n8n instance-level "Error Workflow" setting (not expressible in this JSON) with `onError: "continueErrorOutput"` on each HTTP Request node, wired directly to the existing `Send Failure Alert` node.

**Wave 5 verification:** trigger the webhook manually (`curl -X POST http://localhost:5678/webhook/ingest -d '{"table_name":"test_n8n","source_type":"csv",...}'` or equivalent), confirm it reaches HDFS via the same path as `test_data_source.bat`, confirm a forced failure (bad host) routes to the failure-alert node.

---

## Wave 6 — Infra fixes

### 6.1 `datanode` healthcheck
**File:** `docker-compose.yml:90-108`. Add a healthcheck (e.g. `curl -f http://localhost:9864` — the datanode web UI port) so `spark-master`/`spark-worker`'s `depends_on: datanode: condition: service_healthy` actually resolves.

### 6.2 Verify/fix the Spark Trigger Daemon startup
Check `docker exec sdoqap-spark-master ps aux | grep trigger_daemon`. If it's not running, fix `spark/Dockerfile`/`docker-compose.yml` so `spark_trigger_daemon.py` actually launches (Bitnami Spark image doesn't source `/docker-entrypoint-initdb.d/` — needs an explicit background launch, e.g. via a custom entrypoint wrapper or `command:` override).

### 6.3 Shared table-name sanitizer
New helper (e.g. `api/app/api/validation.py`): `validate_table_name(name: str)` — allow only `[A-Za-z0-9_-]`, reject `.`/`/`/empty. Apply at the top of every endpoint in `pipeline.py`, `data_export.py`, and `whitebox.py` that interpolates a table/subreddit name into an HDFS path or local file path.

**Wave 6 verification:** `docker compose up -d`, confirm `datanode` shows healthy, confirm the trigger daemon responds on port 8099, curl an ingest endpoint with a path-traversal table name (expect 400).

---

## Execution notes
- Each wave is committed separately (matching the pattern already established this session), verified against the live stack before the next wave starts.
- `README.md` gets a new "Required Environment Variables" addendum for `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET_KEY`, `SESSION_COOKIE_SECURE`, `ALERT_WEBHOOK_SECRET`, `RDBMS_ALLOWED_HOSTS`, `API_INGEST_ALLOWED_HOSTS`, and `.env` gets example values (not real secrets).
- If any wave uncovers a blocker that changes scope materially, stop and report before continuing to the next wave, per the executing-plans skill.
