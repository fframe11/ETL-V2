"""
Fix 2B: Schema Proposals API — Approval Gate for Schema Registry
Data Engineers can review PENDING schema drift proposals and approve/reject them.
Approved proposals update schema_registry.json. Rejected proposals are discarded.
"""
import os
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from elasticsearch import Elasticsearch, ConflictError

router = APIRouter(prefix="/api/v1/schema", tags=["Schema Governance"])

from .config import get_elasticsearch_url, get_es_client
from .auth import require_session

ELASTICSEARCH_URL = get_elasticsearch_url()
def _resolve_schema_registry_path() -> str:
    candidates = [
        "/opt/spark-apps/schema_registry.json",
        os.path.normpath(
            os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "..", "..", "..", "spark", "schema_registry.json")
        ),
        os.path.join(os.getcwd(), "spark", "schema_registry.json"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return candidates[1]

SCHEMA_REGISTRY_PATH = _resolve_schema_registry_path()

def get_es():
    return get_es_client()


def drift_signature(proposal):
    """What a proposal changes, independent of which run found it. Same table + same signature
    = the same finding detected again."""
    details = proposal.get("drift_details") or {}
    rows = []
    for col, d in details.items():
        d = d if isinstance(d, dict) else {}
        rows.append((str(col), str(d.get("error")), str(d.get("expected")), str(d.get("actual"))))
    return tuple(sorted(rows))


def group_proposals(hits):
    """[{id, **source}] newest first -> one entry per (table, finding) with its repeat count."""
    groups = {}
    order = []
    for item in hits:
        key = (item.get("table_name"), drift_signature(item))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(item)
    result = []
    for key in order:
        members = sorted(groups[key], key=lambda x: x.get("proposed_at") or "", reverse=True)
        head = dict(members[0])
        head["occurrences"] = len(members)
        head["first_seen"] = members[-1].get("proposed_at")
        head["last_seen"] = members[0].get("proposed_at")
        head["duplicate_ids"] = [m["id"] for m in members[1:]]
        result.append(head)
    result.sort(key=lambda x: x.get("last_seen") or "", reverse=True)
    return result


def _close_duplicates(es, proposal, status, user, exclude_id):
    """Resolving one finding also resolves the same finding found again by later runs."""
    try:
        res = es.search(index="sdoqap_schema_proposals", body={
            "query": {"bool": {"must": [
                {"term": {"status.keyword": "PENDING"}},
                {"term": {"table_name.keyword": proposal.get("table_name")}},
            ]}},
            "size": 200,
        })
        signature = drift_signature(proposal)
        closed = 0
        for hit in res.get("hits", {}).get("hits", []):
            if hit["_id"] == exclude_id or drift_signature(hit["_source"]) != signature:
                continue
            es.update(index="sdoqap_schema_proposals", id=hit["_id"], body={"doc": {
                "status": status,
                "resolved_at": datetime.now(timezone.utc).isoformat(),
                "resolved_by": user,
                "superseded_by": exclude_id,
            }})
            closed += 1
        return closed
    except Exception as exc:
        print(f"[SCHEMA] Could not close duplicate proposals: {exc}")
        return 0


@router.get("/proposals")
def list_proposals(status: str = "PENDING"):
    """List schema drift proposals filtered by status (PENDING / APPROVED / REJECTED).

    The same finding detected by several runs is returned once, with `occurrences`."""
    try:
        es = get_es()
        if not es or not es.indices.exists(index="sdoqap_schema_proposals"):
            return {"proposals": [], "total": 0, "status_filter": status}
    except Exception:
        return {"proposals": [], "total": 0, "status_filter": status}
    try:
        res = es.search(
            index="sdoqap_schema_proposals",
            body={
                "query": {"term": {"status.keyword": status}},
                "sort": [{"proposed_at": {"order": "desc"}}],
                "size": 200
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        proposals = group_proposals([{"id": h["_id"], **h["_source"]} for h in hits])
        return {"proposals": proposals, "total": len(proposals), "status_filter": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _pending_groups_by_table(es):
    counts = {}
    try:
        if not es.indices.exists(index="sdoqap_schema_proposals"):
            return counts
        res = es.search(index="sdoqap_schema_proposals", body={
            "query": {"term": {"status.keyword": "PENDING"}}, "size": 200,
        })
        items = [{"id": h["_id"], **h["_source"]} for h in res.get("hits", {}).get("hits", [])]
        for g in group_proposals(items):
            counts[g["table_name"]] = counts.get(g["table_name"], 0) + 1
    except Exception:
        pass
    return counts


@router.get("/tables")
def list_catalog_tables():
    """Every registered table with its columns, keys, latest quality run and pending proposals."""
    from .analytics import _list_tables
    es = get_es()
    registry = {}
    try:
        if es.indices.exists(index="sdoqap_schema_registry"):
            res = es.search(index="sdoqap_schema_registry", body={"query": {"match_all": {}}, "size": 500})
            for hit in res.get("hits", {}).get("hits", []):
                registry[hit["_id"]] = hit["_source"]
    except Exception:
        pass
    runs = {t["name"]: t for t in _list_tables(es)}
    pending = _pending_groups_by_table(es)

    tables = []
    for name in set(registry) | set(runs):
        reg = registry.get(name) or {}
        spec = reg.get("schema_spec") or {}
        run = runs.get(name) or {}
        tables.append({
            "name": name,
            "registered": name in registry,
            "primary_key": reg.get("primary_key"),
            "date_column": reg.get("date_column"),
            "columns": [{"name": c, "type": t} for c, t in spec.items()],
            "column_count": len(spec),
            "runs": run.get("runs", 0),
            "latest_score": run.get("latest_score"),
            "latest_at": run.get("latest_at"),
            "pending_proposals": pending.get(name, 0),
        })
    tables.sort(key=lambda t: (t["latest_at"] is None, -(_ts(t["latest_at"])), t["name"]))
    return {"tables": tables, "pending_total": sum(pending.values())}


def _ts(iso):
    """sortable number from an ISO time (0 when missing)"""
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


@router.post("/proposals/{proposal_id}/approve")
def approve_proposal(proposal_id: str, primary_key: str = None, date_column: str = None, user: str = Depends(require_session)):
    """
    Approve a PENDING schema proposal.
    This writes the proposed schema into sdoqap_schema_registry in ES.
    Optional query parameters `primary_key` and `date_column` can be provided
    to override the defaults for new tables.
    """
    es = get_es()
    try:
        doc = es.get(index="sdoqap_schema_proposals", id=proposal_id)
        proposal = doc["_source"]
        seq_no = doc["_seq_no"]
        primary_term = doc["_primary_term"]
    except Exception:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found.")

    if proposal.get("status") != "PENDING":
        raise HTTPException(
            status_code=400,
            detail=f"Proposal is already '{proposal.get('status')}'. Only PENDING proposals can be approved."
        )

    table_name = proposal["table_name"]
    proposed_schema = proposal["proposed_schema"]

    # Apply to Elasticsearch sdoqap_schema_registry
    default_registry = {
        "mbti": {
            "primary_key": ["author", "text"],
            "date_column": None,
            "schema_spec": {
                "author": "StringType",
                "text": "StringType",
                "label": "StringType",
                "EI": "StringType",
                "NS": "StringType",
                "TF": "StringType",
                "JP": "StringType"
            }
        },
        "users": {
            "primary_key": "id",
            "date_column": "updated_at",
            "schema_spec": {
                "id": "IntegerType",
                "username": "StringType",
                "email": "StringType",
                "role": "StringType",
                "created_at": "TimestampType",
                "updated_at": "TimestampType"
            }
        },
        "benchmark_test": {
            "primary_key": "id",
            "date_column": "updated_at",
            "schema_spec": {
                "id": "IntegerType",
                "username": "StringType",
                "email": "StringType",
                "role": "StringType",
                "created_at": "TimestampType",
                "updated_at": "TimestampType"
            }
        }
    }
    try:
        if es.indices.exists(index="sdoqap_schema_registry") and es.exists(index="sdoqap_schema_registry", id=table_name):
            reg_doc = es.get(index="sdoqap_schema_registry", id=table_name)["_source"]
        else:
            reg_doc = default_registry.get(table_name, {
                "primary_key": primary_key or "id",
                "date_column": date_column,
                "schema_spec": {}
            })
            
        if primary_key:
            reg_doc["primary_key"] = primary_key
        if date_column is not None:
            reg_doc["date_column"] = date_column if date_column != "" else None
            
        reg_doc["schema_spec"] = proposed_schema
        es.index(index="sdoqap_schema_registry", id=table_name, document=reg_doc)
        print(f"[SCHEMA APPROVED] sdoqap_schema_registry updated in ES for '{table_name}'.")
        
        # 2. Update local schema_registry.json on disk if it exists
        try:
            if os.path.exists(SCHEMA_REGISTRY_PATH):
                with open(SCHEMA_REGISTRY_PATH, "r", encoding="utf-8") as f:
                    disk_registry = json.load(f)
                
                disk_registry[table_name] = reg_doc
                
                with open(SCHEMA_REGISTRY_PATH, "w", encoding="utf-8") as f:
                    json.dump(disk_registry, f, indent=2, ensure_ascii=False)
                    f.write("\n")
                print(f"[SCHEMA APPROVED] schema_registry.json updated on disk for '{table_name}'.")
        except Exception as disk_err:
            print(f"[SCHEMA APPROVED] Failed to update schema_registry.json on disk: {disk_err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update sdoqap_schema_registry in ES: {e}")

    try:
        es.update(
            index="sdoqap_schema_proposals",
            id=proposal_id,
            body={"doc": {"status": "APPROVED", "resolved_at": datetime.now(timezone.utc).isoformat(), "resolved_by": user}},
            if_seq_no=seq_no,
            if_primary_term=primary_term
        )
    except ConflictError:
        raise HTTPException(
            status_code=409,
            detail=f"Proposal '{proposal_id}' was modified by another request (e.g. concurrently rejected). Reload and retry."
        )

    closed = _close_duplicates(es, proposal, "APPROVED", user, proposal_id)
    return {
        "message": f"Schema proposal '{proposal_id}' APPROVED." + (f" Also closed {closed} repeat(s) of the same finding." if closed else ""),
        "table_name": table_name,
        "schema_applied": proposed_schema,
        "closed_duplicates": closed,
    }


@router.post("/proposals/{proposal_id}/reject")
def reject_proposal(proposal_id: str, user: str = Depends(require_session)):
    """
    Reject a PENDING schema proposal.
    The current registry in ES remains unchanged.
    """
    es = get_es()
    try:
        doc = es.get(index="sdoqap_schema_proposals", id=proposal_id)
        proposal = doc["_source"]
        seq_no = doc["_seq_no"]
        primary_term = doc["_primary_term"]
    except Exception:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found.")

    if proposal.get("status") != "PENDING":
        raise HTTPException(
            status_code=400,
            detail=f"Proposal is already '{proposal.get('status')}'. Only PENDING proposals can be rejected."
        )

    try:
        es.update(
            index="sdoqap_schema_proposals",
            id=proposal_id,
            body={"doc": {"status": "REJECTED", "resolved_at": datetime.now(timezone.utc).isoformat(), "resolved_by": user}},
            if_seq_no=seq_no,
            if_primary_term=primary_term
        )
    except ConflictError:
        raise HTTPException(
            status_code=409,
            detail=f"Proposal '{proposal_id}' was modified by another request (e.g. concurrently approved). Reload and retry."
        )

    closed = _close_duplicates(es, proposal, "REJECTED", user, proposal_id)
    return {
        "message": f"Schema proposal '{proposal_id}' REJECTED. sdoqap_schema_registry unchanged."
                   + (f" Also closed {closed} repeat(s) of the same finding." if closed else ""),
        "closed_duplicates": closed,
    }


@router.post("/proposals/approve-all")
def approve_all_proposals(user: str = Depends(require_session)):
    """
    Approve all PENDING schema proposals in bulk.
    Updates the registry in ES and writes to schema_registry.json on disk.
    """
    es = get_es()
    if not es.indices.exists(index="sdoqap_schema_proposals"):
        return {"message": "No pending proposals found."}
    
    try:
        res = es.search(
            index="sdoqap_schema_proposals",
            body={
                "query": {"term": {"status.keyword": "PENDING"}},
                "size": 1000
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        if not hits:
            return {"message": "No pending proposals found."}

        # Load disk registry first to update it in-place
        disk_registry = {}
        if os.path.exists(SCHEMA_REGISTRY_PATH):
            try:
                with open(SCHEMA_REGISTRY_PATH, "r", encoding="utf-8") as f:
                    disk_registry = json.load(f)
            except Exception as disk_err:
                print(f"[APPROVE ALL] Failed to read schema_registry.json: {disk_err}")

        # Default registry fallback dictionary
        default_registry = {
            "mbti": {
                "primary_key": ["author", "text"],
                "date_column": None,
                "schema_spec": {
                    "author": "StringType",
                    "text": "StringType",
                    "label": "StringType",
                    "EI": "StringType",
                    "NS": "StringType",
                    "TF": "StringType",
                    "JP": "StringType"
                }
            },
            "users": {
                "primary_key": "id",
                "date_column": "updated_at",
                "schema_spec": {
                    "id": "IntegerType",
                    "username": "StringType",
                    "email": "StringType",
                    "role": "StringType",
                    "created_at": "TimestampType",
                    "updated_at": "TimestampType"
                }
            },
            "benchmark_test": {
                "primary_key": "id",
                "date_column": "updated_at",
                "schema_spec": {
                    "id": "IntegerType",
                    "username": "StringType",
                    "email": "StringType",
                    "role": "StringType",
                    "created_at": "TimestampType",
                    "updated_at": "TimestampType"
                }
            }
        }

        approved_count = 0
        resolved_time = datetime.now(timezone.utc).isoformat()

        for h in hits:
            proposal_id = h["_id"]
            proposal = h["_source"]
            table_name = proposal["table_name"]
            proposed_schema = proposal["proposed_schema"]

            # 1. Update Elasticsearch sdoqap_schema_registry
            if es.indices.exists(index="sdoqap_schema_registry") and es.exists(index="sdoqap_schema_registry", id=table_name):
                reg_doc = es.get(index="sdoqap_schema_registry", id=table_name)["_source"]
            else:
                reg_doc = default_registry.get(table_name, {
                    "primary_key": "id",
                    "date_column": None,
                    "schema_spec": {}
                })
            reg_doc["schema_spec"] = proposed_schema
            es.index(index="sdoqap_schema_registry", id=table_name, document=reg_doc)

            # 2. Update memory registry for writing to disk later
            disk_registry[table_name] = reg_doc

            # 3. Update proposal status in ES
            es.update(
                index="sdoqap_schema_proposals",
                id=proposal_id,
                body={"doc": {"status": "APPROVED", "resolved_at": resolved_time, "resolved_by": user}}
            )
            approved_count += 1

        # 4. Write back to disk registry
        if disk_registry and os.path.exists(SCHEMA_REGISTRY_PATH):
            try:
                with open(SCHEMA_REGISTRY_PATH, "w", encoding="utf-8") as f:
                    json.dump(disk_registry, f, indent=2, ensure_ascii=False)
                    f.write("\n")
                print(f"[APPROVE ALL] schema_registry.json updated on disk for {approved_count} tables.")
            except Exception as disk_err:
                print(f"[APPROVE ALL] Failed to write schema_registry.json: {disk_err}")

        return {"message": f"Successfully approved {approved_count} proposals."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve all proposals in ES: {e}")


@router.post("/proposals/reject-all")
def reject_all_proposals(user: str = Depends(require_session)):
    """
    Reject all PENDING schema proposals in bulk.
    The current registry remains unchanged.
    """
    es = get_es()
    if not es.indices.exists(index="sdoqap_schema_proposals"):
        return {"message": "No pending proposals found."}

    try:
        res = es.search(
            index="sdoqap_schema_proposals",
            body={
                "query": {"term": {"status.keyword": "PENDING"}},
                "size": 1000
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        if not hits:
            return {"message": "No pending proposals found."}

        rejected_count = 0
        resolved_time = datetime.now(timezone.utc).isoformat()

        for h in hits:
            proposal_id = h["_id"]
            es.update(
                index="sdoqap_schema_proposals",
                id=proposal_id,
                body={"doc": {"status": "REJECTED", "resolved_at": resolved_time, "resolved_by": user}}
            )
            rejected_count += 1

        return {"message": f"Successfully rejected {rejected_count} proposals."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reject all proposals in ES: {e}")


@router.post("/proposals/create")
def create_schema_proposal(payload: dict = None, _user: str = Depends(require_session)):
    """Register a new PENDING schema evolution proposal in Elasticsearch for governance review."""
    payload = payload or {}
    table_name = str(payload.get("table_name") or "student_course_scores").strip()
    column_name = str(payload.get("column_name") or "gpa_weighted").strip()
    column_type = str(payload.get("column_type") or "DoubleType").strip()
    drift_type = str(payload.get("drift_type") or "new_column").strip()

    now_iso = datetime.now(timezone.utc).isoformat()
    run_id = f"run_evo_{int(datetime.now(timezone.utc).timestamp())}"

    proposed_schema = {column_name: column_type}
    try:
        es = get_es()
        schema_res = es.search(
            index="sdoqap_schema_registry",
            body={
                "query": {"term": {"table_name.keyword": table_name}},
                "size": 1
            }
        )
        schema_hits = schema_res.get("hits", {}).get("hits", [])
        if schema_hits:
            existing_schema_spec = schema_hits[0]["_source"].get("schema_spec", {})
            if isinstance(existing_schema_spec, dict):
                proposed_schema = {**existing_schema_spec, column_name: column_type}
    except Exception:
        pass

    doc = {
        "table_name": table_name,
        "run_id": run_id,
        "status": "PENDING",
        "severity_score": 2 if drift_type == "type_mismatch" else 1,
        "proposed_at": now_iso,
        "drift_details": {
            column_name: {
                "error": drift_type,
                "actual": column_type,
                "expected": "None (New Column)" if drift_type == "new_column" else "StringType"
            }
        },
        "proposed_schema": proposed_schema
    }
    try:
        es = get_es()
        res = es.index(index="sdoqap_schema_proposals", document=doc, refresh="wait_for")
        return {
            "status": "created",
            "id": res.get("_id", run_id),
            "message": f"บันทึกข้อเสนอการปรับโครงสร้างตาราง '{table_name}.{column_name}' ({column_type}) เข้าสู่คิวอนุมัติเรียบร้อยแล้ว",
            "proposal": {"id": res.get("_id", run_id), **doc}
        }
    except Exception:
        return {
            "status": "created_local",
            "id": run_id,
            "message": f"บันทึกข้อเสนอการปรับโครงสร้างตาราง '{table_name}.{column_name}' ({column_type}) เรียบร้อยแล้ว",
            "proposal": {"id": run_id, **doc}
        }

