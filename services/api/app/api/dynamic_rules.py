"""
Dynamic Rules API Router
=========================
Provides endpoints for managing data quality rules dynamically:
- Read/write merged rules per table from rules_config.json
- Query column profiles (null rates, value ranges) from Elasticsearch
- Review, approve, or reject AI-generated rule proposals

Design notes
------------
* rules_config.json may live at different paths depending on the runtime
  environment (host dev, API container, Spark container). The helper
  ``_resolve_rules_path()`` walks a fallback chain so the router works
  everywhere without hard-coding a single path.
* All Elasticsearch access follows the same ``get_elasticsearch_url`` /
  ``Elasticsearch`` client pattern used by the rest of the SDOQAP API.
"""

import os
import sys
import json
import logging
import copy
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from elasticsearch import Elasticsearch, ConflictError

from .config import get_elasticsearch_url, get_es_client
from .auth import require_session
from .validation import validate_table_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/rules", tags=["Dynamic Rules"])

ELASTICSEARCH_URL = get_elasticsearch_url()

# ---------------------------------------------------------------------------
# ES indices used by this router
# ---------------------------------------------------------------------------
ES_INDEX_DYNAMIC_RULES_LOG = "sdoqap_dynamic_rules_log"
ES_INDEX_AI_PROPOSALS = "sdoqap_ai_rule_proposals"

# ---------------------------------------------------------------------------
# Rules config file resolution
# ---------------------------------------------------------------------------
# Ordered list of candidate paths.  The first one that exists wins.
_RULES_CONFIG_CANDIDATES = [
    # 1. Mounted Spark volume (available when docker-compose mounts ./spark)
    "/opt/spark-apps/rules_config.json",
    # 2. Relative path from *this* file (works during local development)
    os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "..", "..", "..", "spark", "rules_config.json")
    ),
    # 3. Project-root fallback (if CWD is the project root)
    os.path.join(os.getcwd(), "spark", "rules_config.json"),
]


def _resolve_rules_path() -> str:
    """Return the first existing rules_config.json path from the candidate list.

    Raises:
        HTTPException 404: when no candidate path exists on disk.
    """
    for candidate in _RULES_CONFIG_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    raise HTTPException(
        status_code=404,
        detail=(
            "rules_config.json not found. Searched paths: "
            + ", ".join(_RULES_CONFIG_CANDIDATES)
        ),
    )


def _load_rules_config() -> dict:
    """ES (sdoqap_rules_registry) is the source of truth once seeded; the JSON file is
    only read when the index does not exist yet (fresh install before seeding)."""
    try:
        es = _get_es()
        if es.indices.exists(index="sdoqap_rules_registry"):
            res = es.search(index="sdoqap_rules_registry", body={"query": {"match_all": {}}, "size": 1000})
            return {h["_id"]: h["_source"] for h in res.get("hits", {}).get("hits", [])}
    except Exception as exc:
        logger.warning("Failed to read rules from ES: %s. Falling back to rules_config.json.", exc)
    try:
        with open(_resolve_rules_path(), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.warning("Failed to read local rules_config.json: %s", exc)
        return {}


def _save_rules_config(config: dict, tables=None) -> None:
    """Write rules to rules_config.json (atomic, file-locked, versioned backup) and sync them to
    the Elasticsearch registry that the API and the engine read.

    *config* is the full registry view. Pass the names of the tables that actually changed in
    *tables*: only those are updated in the file (every other table, the _comment and any
    hand edit stay as they are) and in Elasticsearch. Without *tables* (rollback) the whole
    config replaces the file."""
    path = None
    try:
        import time
        path = _resolve_rules_path()
        lock_path = path + ".lock"
        
        # Acquire atomic file-based lock
        acquired = False
        for _ in range(30):
            try:
                fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
                acquired = True
                break
            except FileExistsError:
                time.sleep(0.1)
                
        try:
            # Create a versioned backup before writing
            if os.path.exists(path):
                try:
                    import shutil
                    import glob
                    backup_dir = os.path.join(os.path.dirname(path), "backups")
                    os.makedirs(backup_dir, exist_ok=True)
                    timestamp = int(time.time())
                    shutil.copy(path, os.path.join(backup_dir, f"rules_config_{timestamp}.json"))
                    
                    # Keep only latest 10 versions in backups folder
                    backups = sorted(glob.glob(os.path.join(backup_dir, "rules_config_*.json")))
                    if len(backups) > 10:
                        for b in backups[:-10]:
                            try:
                                os.remove(b)
                            except Exception:
                                pass
                except Exception as backup_err:
                    logger.warning("Failed to create versioned rules backup: %s", backup_err)

            to_write = config
            if tables is not None:
                try:
                    with open(path, "r", encoding="utf-8") as fh:
                        on_disk = json.load(fh)
                    if isinstance(on_disk, dict):
                        for name in tables:
                            if name in config:
                                on_disk[name] = config[name]
                            else:
                                on_disk.pop(name, None)
                        to_write = on_disk
                except (OSError, ValueError) as read_err:
                    logger.warning("Could not merge into the existing rules file (%s); writing the full config.", read_err)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(to_write, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
        finally:
            if acquired:
                try:
                    os.remove(lock_path)
                except Exception:
                    pass
    except Exception as exc:
        logger.warning("Failed to write local rules_config.json: %s", exc)

    # Sync to ES sdoqap_rules_registry index
    try:
        es = _get_es()
        if not es.indices.exists(index="sdoqap_rules_registry"):
            es.indices.create(index="sdoqap_rules_registry")
            
        to_sync = config.items() if tables is None else [(n, config[n]) for n in tables if n in config]
        for table_name, table_rules in to_sync:
            if table_name == "_comment":
                continue
            es.index(index="sdoqap_rules_registry", id=table_name, document=table_rules)
        logger.info("Successfully synced rules config to Elasticsearch sdoqap_rules_registry.")
    except Exception as exc:
        logger.warning("Failed to sync rules config to ES: %s", exc)
        # Raise HTTP 500 only if saving locally failed as well
        if not path or not os.path.exists(path):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to write rules_config.json: {exc}",
            )


def _merge_rules(default: dict, table_specific: dict) -> dict:
    """Deep-merge *table_specific* overrides onto a copy of *default*.

    For each key present in *table_specific*, the table value replaces
    the default value.  Keys present only in *default* are preserved.
    """
    merged = copy.deepcopy(default)
    for key, value in table_specific.items():
        if (
            isinstance(value, dict)
            and isinstance(merged.get(key), dict)
        ):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


# ---------------------------------------------------------------------------
# Singleton Elasticsearch client
# ---------------------------------------------------------------------------
def _get_es() -> Elasticsearch:
    return get_es_client()


# ---------------------------------------------------------------------------
# AI advisor (the same AIRuleAdvisor the Spark pipeline uses)
# ---------------------------------------------------------------------------
# Spark's code is mounted into this container at /opt/spark-apps; local dev finds
# it at ../../../spark. Importing it keeps one LLM path (Groq -> Ollama -> rules)
# for the pipeline and for the on-demand "Generate" button.
_ADVISOR_DIR_CANDIDATES = [
    "/opt/spark-apps",
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "..", "..", "..", "spark")),
]


def _get_advisor():
    for candidate in _ADVISOR_DIR_CANDIDATES:
        if os.path.isfile(os.path.join(candidate, "ai_rule_advisor.py")):
            if candidate not in sys.path:
                sys.path.insert(0, candidate)
            from ai_rule_advisor import AIRuleAdvisor
            return AIRuleAdvisor(es_url=ELASTICSEARCH_URL)
    raise HTTPException(status_code=503, detail="AI advisor module (ai_rule_advisor.py) not found.")


def _read_quarantine_sample(table: str, limit: int = 20):
    """Return ``(rows, total)``: up to ``limit`` real quarantined rows and the layer's row count."""
    from .data_export import read_parquet_folder_to_df
    try:
        df = read_parquet_folder_to_df(f"/data/quarantine/{table}")
    except HTTPException as he:
        if he.status_code == 404:
            return [], 0
        raise
    return json.loads(df.head(limit).to_json(orient="records", date_format="iso")), int(len(df))


def _latest_run_context(table: str) -> dict:
    """Totals and score of the table's latest quality run; empty when unavailable."""
    try:
        es = _get_es()
        res = es.search(
            index="sdoqap_quality_runs",
            body={"query": {"term": {"table_name.keyword": {"value": table, "case_insensitive": True}}},
                  "sort": [{"timestamp": {"order": "desc"}}], "size": 1},
        )
        hits = res.get("hits", {}).get("hits", [])
        if hits:
            doc = hits[0]["_source"]
            return {"total_records": doc.get("total_records", 0),
                    "current_quality": doc.get("quality_score")}
    except Exception:
        pass
    return {}


# ═══════════════════════════════════════════════════════════════════════════
#  RULES CRUD
# ═══════════════════════════════════════════════════════════════════════════

# Wildcard routes are moved to the end of the file to prevent FastAPI route conflicts


# ═══════════════════════════════════════════════════════════════════════════
#  COLUMN PROFILES (from Dynamic Rules Engine logs)
# ═══════════════════════════════════════════════════════════════════════════

def _latest_run_profile(es, table_name: str):
    """Profile stored on the table's newest quality run (null rates and IQR bounds per
    column, written by the Spark report stage), shaped the way the Rules page reads it."""
    try:
        if not es.indices.exists(index="sdoqap_quality_runs"):
            return None
        res = es.search(
            index="sdoqap_quality_runs",
            body={
                "query": {"term": {"table_name.keyword": {"value": table_name, "case_insensitive": True}}},
                "sort": [{"timestamp": {"order": "desc"}}],
                "size": 1,
            },
        )
        hits = res.get("hits", {}).get("hits", [])
    except Exception as exc:
        logger.warning("Could not read the latest quality run for %s: %s", table_name, exc)
        return None
    run = hits[0]["_source"] if hits else None
    if not run or not (run.get("null_profile") or run.get("value_range_profile")):
        return None
    result = {
        "table": table_name,
        "run_id": run.get("run_id"),
        "timestamp": run.get("timestamp"),
        "source": "sdoqap_quality_runs",
    }
    if run.get("null_profile"):
        result["null_profile"] = run["null_profile"]
    if run.get("value_range_profile"):
        result["value_ranges"] = run["value_range_profile"]
    return result


@router.get("/profiles/{table_name}", summary="Get column profiles for a table")
def get_column_profiles(table_name: str) -> dict:
    """Null-rate and value-range profile of ``table_name``: from its newest quality run
    (``sdoqap_quality_runs``), else from the latest dynamic-rule computation
    (``sdoqap_dynamic_rules_log``)."""
    es = _get_es()

    from_run = _latest_run_profile(es, table_name)
    if from_run:
        return from_run

    if not es.indices.exists(index=ES_INDEX_DYNAMIC_RULES_LOG):
        return {
            "table": table_name,
            "profiles": [],
            "source": "no_index",
            "message": f"Index '{ES_INDEX_DYNAMIC_RULES_LOG}' does not exist yet.",
        }

    try:
        res = es.search(
            index=ES_INDEX_DYNAMIC_RULES_LOG,
            body={
                "query": {
                    "term": {
                        "table_name.keyword": {
                            "value": table_name,
                            "case_insensitive": True,
                        }
                    }
                },
                "sort": [{"timestamp": {"order": "desc"}}],
                "size": 1,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Elasticsearch query failed: {exc}",
        )

    hits = res.get("hits", {}).get("hits", [])
    if not hits:
        return {
            "table": table_name,
            "profiles": [],
            "source": "empty",
            "message": f"No dynamic-rule log entries found for table '{table_name}'.",
        }

    doc = hits[0]["_source"]
    return {
        "table": table_name,
        "timestamp": doc.get("timestamp"),
        "null_profiles": doc.get("null_profiles", []),
        "value_range_profiles": doc.get("value_range_profiles", []),
        "suggested_rules": doc.get("suggested_rules", {}),
        "source": ES_INDEX_DYNAMIC_RULES_LOG,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  AI RULE PROPOSALS
# ═══════════════════════════════════════════════════════════════════════════

_FALLBACK_AI_PROPOSALS = []


@router.get("/ai-proposals", summary="List pending AI rule proposals")
def list_ai_proposals(table: Optional[str] = Query(None, description="Filter by table name")) -> dict:
    """Return all AI-generated rule proposals with ``status='PROPOSED'``,
    sorted by timestamp descending.

    Source index: ``sdoqap_ai_rule_proposals``
    """
    proposals = []
    try:
        es = _get_es()
        if es and es.indices.exists(index=ES_INDEX_AI_PROPOSALS):
            must_clauses: list = [{"term": {"status.keyword": "PROPOSED"}}]
            if table:
                must_clauses.append(
                    {"term": {"table_name.keyword": {"value": table, "case_insensitive": True}}}
                )
            res = es.search(
                index=ES_INDEX_AI_PROPOSALS,
                body={
                    "query": {"bool": {"must": must_clauses}},
                    "sort": [{"timestamp": {"order": "desc"}}],
                    "size": 100,
                },
            )
            hits = res.get("hits", {}).get("hits", [])
            for hit in hits:
                proposal = hit["_source"]
                proposal["_id"] = hit["_id"]
                proposals.append(proposal)
    except Exception:
        pass

    is_example = not proposals
    if is_example:
        for p in _FALLBACK_AI_PROPOSALS:
            if p.get("status") == "PROPOSED":
                if not table or p.get("table_name", "").lower() == table.lower():
                    proposals.append(p)

    return {
        "proposals": proposals,
        "count": len(proposals),
        "is_example": is_example,
        "source": "example_proposals" if is_example else ES_INDEX_AI_PROPOSALS,
    }


_CRITICAL_CHECKS = {"null_primary_key", "duplicate_check"}


@router.post("/ai-proposals/{proposal_id}/approve", summary="Approve an AI rule proposal")
def approve_proposal(proposal_id: str, _user: str = Depends(require_session)) -> dict:
    """Mark an AI proposal as ``APPROVED`` and merge its ``suggested_rules``
    into ``rules_config.json`` for the relevant table.
    """
    for p in _FALLBACK_AI_PROPOSALS:
        if p.get("_id") == proposal_id:
            p["status"] = "APPROVED"
            return {"status": "approved", "proposal_id": proposal_id, "is_example": True,
                    "message": f"'{proposal_id}' is a built-in example proposal: marked approved, but no rule was changed."}

    es = _get_es()

    if not es.indices.exists(index=ES_INDEX_AI_PROPOSALS):
        raise HTTPException(
            status_code=404,
            detail=f"Index '{ES_INDEX_AI_PROPOSALS}' does not exist.",
        )

    # Fetch the proposal document
    try:
        doc = es.get(index=ES_INDEX_AI_PROPOSALS, id=proposal_id)
    except Exception:
        raise HTTPException(
            status_code=404,
            detail=f"Proposal '{proposal_id}' not found.",
        )

    source = doc.get("_source", {})
    current_status = source.get("status", "")
    seq_no = doc.get("_seq_no")
    primary_term = doc.get("_primary_term")

    if current_status != "PROPOSED":
        raise HTTPException(
            status_code=409,
            detail=f"Proposal '{proposal_id}' is already '{current_status}' and cannot be approved.",
        )

    # 1. Update status in Elasticsearch
    try:
        es.update(
            index=ES_INDEX_AI_PROPOSALS,
            id=proposal_id,
            body={
                "doc": {
                    "status": "APPROVED",
                    "approved_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            if_seq_no=seq_no,
            if_primary_term=primary_term,
        )
    except ConflictError:
        raise HTTPException(
            status_code=409,
            detail=f"Proposal '{proposal_id}' was modified by another request. Reload and retry.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update proposal status: {exc}",
        )

    # 2. If the proposal contains suggested_rules, merge them into rules_config.json
    analysis = source.get("analysis_result", {})
    suggested = analysis.get("suggested_rules", [])
    target_table = source.get("table_name")
 
    if suggested and target_table:
        try:
            config = _load_rules_config()
            table_config = config.setdefault(target_table, {})
            
            # Support both list of dicts (from advisor) and raw dict override format
            rules_list = suggested if isinstance(suggested, list) else [suggested]
            
            promoted_count = 0
            for rule in rules_list:
                if not isinstance(rule, dict):
                    continue
                rule_path = rule.get("rule_path", "")
                val = rule.get("value")
                action = rule.get("action", "update")
                condition = rule.get("condition")

                # Handle normal overrides
                if rule_path and val is not None:
                    if action == "escalate":
                        continue
                    parts = rule_path.split(".")

                    # ── Hard Guardrails Validation Layer (Task 3) ─────────────────────
                    # 1. Quality threshold base floor at 70.0%
                    if any(t in rule_path for t in ["quality_score_threshold", "base_value", "min_value"]) and isinstance(val, (int, float)):
                        if val < 70.0:
                            print(f"[GUARDRAIL VIOLATION] API rejected threshold change for '{rule_path}' = {val} on table '{target_table}'. Hard floor is 70.0%")
                            continue
                        
                        # 2. Maximum deviation (decrease) cap of 10% from active configuration
                        curr = table_config
                        for part in parts:
                            if isinstance(curr, dict) and part in curr:
                                curr = curr[part]
                            else:
                                curr = None
                                break
                        
                        if isinstance(curr, (int, float)) and curr > 0:
                            max_reduction = curr * 0.90
                            if val < max_reduction:
                                print(f"[GUARDRAIL VIOLATION] API rejected threshold change from {curr} to {val} on table '{target_table}'. Exceeds 10% allowed decrease (Limit: {max_reduction:.2f})")
                                continue

                    # 4. Root Cause Fix: a rule_path outside the threshold/tolerance
                    # guardrails above (e.g. "null_primary_key.enabled") previously hit no
                    # validation at all. Explicitly block AI-suggested disabling of a
                    # critical-severity check — that decision requires a human editing
                    # rules_config.json directly via the authenticated PUT endpoint, not an
                    # AI proposal approval.
                    if parts[-1] == "enabled" and val is False and any(chk in rule_path for chk in _CRITICAL_CHECKS):
                        print(f"[GUARDRAIL VIOLATION] API rejected disabling critical check '{rule_path}' on table '{target_table}' via AI proposal.")
                        continue

                    # Dotted path update
                    d = table_config
                    for part in parts[:-1]:
                        d = d.setdefault(part, {})

                    # 3. Check guardrails: Null tolerance cap at 0.30
                    if "tolerance" in parts[-1] and isinstance(val, (int, float)):
                        val = min(val, 0.30)

                    d[parts[-1]] = val
                    promoted_count += 1

                # Handle induced tree rules
                elif rule_path and condition:
                    parts = rule_path.split(".")
                    induced_sec = table_config.setdefault("induced", {})
                    rule_name = parts[-1]
                    induced_sec[rule_name] = {
                        "condition": condition,
                        "action": "quarantine",
                        "origin": rule.get("origin", "decision_tree_induction"),
                        "reason": rule.get("reason", "Auto-induced rule")
                    }
                    promoted_count += 1

            if promoted_count > 0:
                _save_rules_config(config, tables=[target_table])
                logger.info(
                    "AI proposal '%s' approved — successfully merged %d rules for table '%s'.",
                    proposal_id,
                    promoted_count,
                    target_table,
                )
        except Exception as exc:
            logger.warning(
                "Proposal '%s' approved in ES but rules config merge failed: %s",
                proposal_id,
                exc,
            )

    return {"status": "approved", "proposal_id": proposal_id}


@router.post("/ai-proposals/reset", summary="Restore the built-in example proposals")
def reset_ai_proposals(_user: str = Depends(require_session)) -> dict:
    """Puts the hard-coded examples back to PROPOSED. Does not call any model;
    use ``POST /ai-proposals/generate`` for a real analysis."""
    for p in _FALLBACK_AI_PROPOSALS:
        p["status"] = "PROPOSED"
    return {"status": "reset", "count": len(_FALLBACK_AI_PROPOSALS), "is_example": True,
            "proposals": _FALLBACK_AI_PROPOSALS}


@router.post("/ai-proposals/generate", summary="Analyse a table's quarantined rows with the AI advisor")
def generate_ai_proposal(table: str = Query(..., description="Table to analyse"),
                         _user: str = Depends(require_session)) -> dict:
    """Run the advisor (Groq, else local Ollama, else the rule-based advisor) on real
    quarantined rows and store the result as a ``PROPOSED`` item for human approval.
    Nothing is written to ``rules_config.json`` here."""
    validate_table_name(table, "table")
    rows, total = _read_quarantine_sample(table)
    if not rows:
        raise HTTPException(status_code=404,
                            detail=f"No quarantined rows found for table '{table}'; nothing to analyse.")

    columns = sorted({c for r in rows for c in r})
    column_stats = {c: {"null_in_sample": sum(1 for r in rows if r.get(c) is None)} for c in columns}
    try:
        from .data_export import load_primary_key
        primary_key = load_primary_key(table) or "unknown"
    except Exception:
        primary_key = "unknown"
    context = {"primary_key": primary_key, "date_column": "unknown", "total_records": 0,
               **_latest_run_context(table), "quarantined_records": total}

    advisor = _get_advisor()
    analysis = advisor.ai_analyze_quarantined_sample(table, rows, column_stats, context)
    if not analysis or analysis.get("status") == "FAILED":
        raise HTTPException(status_code=502, detail="The AI advisor could not produce an analysis.")

    run_id = "manual_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    if not advisor.log_proposal_to_es(table, run_id, analysis):
        raise HTTPException(status_code=502, detail="Analysis finished but the proposal could not be stored.")

    meta = analysis.get("analysis_metadata", {})
    return {"status": "PROPOSED", "table": table, "run_id": run_id, "stored": True,
            "is_example": False, "method": meta.get("method"), "model": meta.get("model"),
            "confidence": analysis.get("confidence"), "sample_size": len(rows), "quarantined_records": total}


@router.post("/ai-proposals/{proposal_id}/reject", summary="Reject an AI rule proposal")
def reject_proposal(proposal_id: str, _user: str = Depends(require_session)) -> dict:
    """Mark an AI proposal as ``REJECTED``.

    No changes are made to ``rules_config.json``.
    """
    for p in _FALLBACK_AI_PROPOSALS:
        if p.get("_id") == proposal_id:
            p["status"] = "REJECTED"
            return {"status": "rejected", "proposal_id": proposal_id, "message": f"Proposal '{proposal_id}' rejected."}

    es = _get_es()

    if not es.indices.exists(index=ES_INDEX_AI_PROPOSALS):
        raise HTTPException(
            status_code=404,
            detail=f"Index '{ES_INDEX_AI_PROPOSALS}' does not exist.",
        )

    # Fetch the proposal document to verify it exists and is in PROPOSED state
    try:
        doc = es.get(index=ES_INDEX_AI_PROPOSALS, id=proposal_id)
    except Exception:
        raise HTTPException(
            status_code=404,
            detail=f"Proposal '{proposal_id}' not found.",
        )

    source = doc.get("_source", {})
    current_status = source.get("status", "")
    seq_no = doc.get("_seq_no")
    primary_term = doc.get("_primary_term")

    if current_status != "PROPOSED":
        raise HTTPException(
            status_code=409,
            detail=f"Proposal '{proposal_id}' is already '{current_status}' and cannot be rejected.",
        )

    try:
        es.update(
            index=ES_INDEX_AI_PROPOSALS,
            id=proposal_id,
            body={
                "doc": {
                    "status": "REJECTED",
                    "rejected_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            if_seq_no=seq_no,
            if_primary_term=primary_term,
        )
    except ConflictError:
        raise HTTPException(
            status_code=409,
            detail=f"Proposal '{proposal_id}' was modified by another request. Reload and retry.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update proposal status: {exc}",
        )

    logger.info("AI proposal '%s' rejected.", proposal_id)

    return {"status": "rejected", "proposal_id": proposal_id}


# ═══════════════════════════════════════════════════════════════════════════
#  WILDCARD RULES CRUD (Moved to the end to prevent route conflicts)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{table_name}", summary="Get effective rules for a table")
def get_rules_for_table(table_name: str) -> dict:
    """Return the *effective* rules for ``table_name``.

    The effective rules are computed by merging the ``_default`` section
    with the table-specific overrides (if any) stored in
    ``rules_config.json``.
    """
    config = _load_rules_config()

    defaults = config.get("_default", {})
    table_overrides = config.get(table_name, {})

    effective = _merge_rules(defaults, table_overrides)

    return {
        "table": table_name,
        "effective_rules": effective,
        "has_overrides": bool(table_overrides),
        "default_rules": defaults,
        "table_overrides": table_overrides,
    }


def _validate_rules_body(body: Dict[str, Any]) -> None:
    """Root Cause Fix: the direct rule-edit endpoint previously merged any caller-supplied
    dict with zero validation — a threshold could be set to -50 or 500, silently weakening
    or breaking the quality gate. Apply the same sanity bounds the AI-approval guardrails
    already enforce (spark/rules_config.json's documented 0-100 percentage fields)."""
    qst = body.get("quality_score_threshold")
    if isinstance(qst, dict):
        for key in ("base_value", "min_value"):
            val = qst.get(key)
            if isinstance(val, (int, float)) and not (0.0 <= val <= 100.0):
                raise HTTPException(status_code=400, detail=f"quality_score_threshold.{key} must be between 0 and 100 (got {val}).")
    freshness = body.get("freshness_threshold_hours")
    if isinstance(freshness, dict):
        val = freshness.get("base_value")
        if isinstance(val, (int, float)) and val < 0:
            raise HTTPException(status_code=400, detail=f"freshness_threshold_hours.base_value cannot be negative (got {val}).")
    for check_name in _CRITICAL_CHECKS:
        section = body.get(check_name)
        if isinstance(section, dict) and section.get("enabled") is False:
            logger.warning("Rule edit disables critical check '%s' for a table — allowed (authenticated direct edit), but flagged.", check_name)


@router.put("/{table_name}", summary="Update rule overrides for a table")
def update_rules_for_table(table_name: str, body: Dict[str, Any], user: str = Depends(require_session)) -> dict:
    """Merge *body* into the table-specific section of ``rules_config.json``.

    This endpoint does **not** touch the ``_default`` block; it only
    creates or updates the ``table_name`` key.

    Upstream-First note: rule changes made here are persisted so that
    the next Spark quality-engine run picks them up automatically.
    """
    if table_name == "_default":
        raise HTTPException(
            status_code=400,
            detail="Use a specific table name. Editing '_default' directly is not allowed via this endpoint.",
        )
    if table_name == "_comment":
        raise HTTPException(
            status_code=400,
            detail="'_comment' is a reserved key.",
        )

    _validate_rules_body(body)

    config = _load_rules_config()

    # Merge new values into the existing table section (create if absent)
    existing = config.get(table_name, {})
    before_snapshot = copy.deepcopy(existing)
    existing.update(body)
    config[table_name] = existing

    _save_rules_config(config, tables=[table_name])

    logger.info("Rules updated for table '%s' by '%s': %s", table_name, user, body)

    # Root Cause Fix: persist a real audit trail (who/when/what changed), not just a
    # transient log line, matching the same governance standard as schema drift approvals.
    try:
        es = _get_es()
        es.index(index="sdoqap_rules_audit_log", document={
            "table_name": table_name,
            "changed_by": user,
            "changed_at": datetime.now(timezone.utc).isoformat(),
            "body_applied": body,
            "before": before_snapshot,
        })
    except Exception as audit_err:
        logger.warning("Failed to write rules audit log entry: %s", audit_err)

    return {"status": "updated", "table": table_name}
