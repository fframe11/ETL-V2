import os
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Body
from elasticsearch import Elasticsearch, ConflictError
from .config import get_elasticsearch_url, get_es_client
from .dynamic_rules import _load_rules_config, _save_rules_config
from .auth import require_session

router = APIRouter(prefix="/api/v1/standardize", tags=["Standardization Governance"])

ELASTICSEARCH_URL = get_elasticsearch_url()
def get_es():
    return get_es_client()

@router.get("/review-queue")
def list_review_queue(status: str = "PENDING_REVIEW"):
    """List all pending review items sorted by priority DESC."""
    es = get_es()
    if not es.indices.exists(index="sdoqap_unmapped_terms"):
        return {"items": [], "total": 0}
    try:
        res = es.search(
            index="sdoqap_unmapped_terms",
            body={
                "query": {"term": {"status.keyword": status}},
                "sort": [{"priority": {"order": "desc"}}],
                "size": 100
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        items = [{"id": h["_id"], **h["_source"]} for h in hits]
        return {"items": items, "total": len(items)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _update_memory_registry(table_name: str, col_name: str, raw_val: str, approved_cat: str):
    """Updates both disk config and ES registry with the approved category mapping."""
    try:
        config = _load_rules_config()
        table_rules = config.setdefault(table_name, {})
        remediation_rules = table_rules.setdefault("remediation_rules", [])
        
        # Locate the rule
        target_rule = None
        for r in remediation_rules:
            if r.get("column") == col_name and r.get("type") in ("semantic_standardize", "auto_strategy"):
                target_rule = r
                break
                
        if not target_rule:
            target_rule = {
                "column": col_name,
                "type": "semantic_standardize",
                "categories": {},
                "fallback": "อื่นๆ",
                "threshold": 0.85
            }
            remediation_rules.append(target_rule)
            
        categories = target_rule.setdefault("categories", {})
        norm_key = str(raw_val).lower().strip()
        categories[norm_key] = approved_cat
        
        _save_rules_config(config)
        print(f"[API GOVERNANCE] Updated memory mapping for {table_name}.{col_name}: '{norm_key}' -> '{approved_cat}'")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update rules configuration: {str(e)}")

@router.post("/review-queue/{item_id}/approve")
def approve_item(item_id: str, _user: str = Depends(require_session)):
    """Approve suggestion, adding it to the memory registry mapping."""
    es = get_es()
    try:
        doc = es.get(index="sdoqap_unmapped_terms", id=item_id)
        item = doc["_source"]
        seq_no = doc["_seq_no"]
        primary_term = doc["_primary_term"]
    except Exception:
        raise HTTPException(status_code=404, detail=f"Review item '{item_id}' not found.")

    if item.get("status") != "PENDING_REVIEW":
        raise HTTPException(status_code=400, detail="Item is already processed.")

    table_name = item["table_name"]
    col_name = item["column_name"]
    raw_val = item["unmapped_value"]
    suggested_cat = item["suggested_category"]

    # Level 2 / Assisted approval -> suggested category is approved
    _update_memory_registry(table_name, col_name, raw_val, suggested_cat)

    # Log review feedback to compute mapping override rate
    try:
        es.index(index="sdoqap_mapping_reviews", document={
            "table_name": table_name,
            "column_name": col_name,
            "raw_value": raw_val,
            "suggested_category": suggested_cat,
            "approved_category": suggested_cat,
            "is_override": False,
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        print(f"[API GOVERNANCE] Warning: failed to log mapping review: {e}")

    # Mark as APPROVED in review queue
    try:
        es.update(
            index="sdoqap_unmapped_terms",
            id=item_id,
            body={"doc": {"status": "APPROVED", "resolved_at": datetime.now(timezone.utc).isoformat()}},
            if_seq_no=seq_no,
            if_primary_term=primary_term
        )
    except ConflictError:
        raise HTTPException(status_code=409, detail=f"Review item '{item_id}' was modified by another request. Reload and retry.")

    return {"message": "Item approved and added to memory mapping.", "raw_value": raw_val, "category": suggested_cat}

@router.post("/review-queue/{item_id}/override")
def override_item(item_id: str, approved_category: str = Body(..., embed=True), _user: str = Depends(require_session)):
    """Override suggestion with user custom category, adding it to the memory registry mapping."""
    es = get_es()
    try:
        doc = es.get(index="sdoqap_unmapped_terms", id=item_id)
        item = doc["_source"]
        seq_no = doc["_seq_no"]
        primary_term = doc["_primary_term"]
    except Exception:
        raise HTTPException(status_code=404, detail=f"Review item '{item_id}' not found.")

    if item.get("status") != "PENDING_REVIEW":
        raise HTTPException(status_code=400, detail="Item is already processed.")

    table_name = item["table_name"]
    col_name = item["column_name"]
    raw_val = item["unmapped_value"]
    suggested_cat = item["suggested_category"]

    # Write customized mapping to registry
    _update_memory_registry(table_name, col_name, raw_val, approved_category)

    # Log override review feedback
    is_override = str(approved_category).strip().lower() != str(suggested_cat).strip().lower()
    try:
        es.index(index="sdoqap_mapping_reviews", document={
            "table_name": table_name,
            "column_name": col_name,
            "raw_value": raw_val,
            "suggested_category": suggested_cat,
            "approved_category": approved_category,
            "is_override": is_override,
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        print(f"[API GOVERNANCE] Warning: failed to log override feedback: {e}")

    # Mark as APPROVED in review queue
    try:
        es.update(
            index="sdoqap_unmapped_terms",
            id=item_id,
            body={"doc": {"status": "APPROVED", "resolved_at": datetime.now(timezone.utc).isoformat()}},
            if_seq_no=seq_no,
            if_primary_term=primary_term
        )
    except ConflictError:
        raise HTTPException(status_code=409, detail=f"Review item '{item_id}' was modified by another request. Reload and retry.")

    return {"message": "Item overridden and added to memory mapping.", "raw_value": raw_val, "category": approved_category}

@router.post("/review-queue/{item_id}/reject")
def reject_item(item_id: str, _user: str = Depends(require_session)):
    """Reject item, marking it rejected in review queue without modifying mapping config."""
    es = get_es()
    try:
        doc = es.get(index="sdoqap_unmapped_terms", id=item_id)
        item = doc["_source"]
        seq_no = doc["_seq_no"]
        primary_term = doc["_primary_term"]
    except Exception:
        raise HTTPException(status_code=404, detail=f"Review item '{item_id}' not found.")

    if item.get("status") != "PENDING_REVIEW":
        raise HTTPException(status_code=400, detail="Item is already processed.")

    try:
        es.update(
            index="sdoqap_unmapped_terms",
            id=item_id,
            body={"doc": {"status": "REJECTED", "resolved_at": datetime.now(timezone.utc).isoformat()}},
            if_seq_no=seq_no,
            if_primary_term=primary_term
        )
    except ConflictError:
        raise HTTPException(status_code=409, detail=f"Review item '{item_id}' was modified by another request. Reload and retry.")

    return {"message": "Item rejected."}

@router.post("/rollback")
def rollback_rules_config(_user: str = Depends(require_session)):
    """Roll back the rules configuration to the previous version from backups folder."""
    try:
        from .dynamic_rules import _resolve_rules_path, _load_rules_config, _save_rules_config
        import glob
        import shutil
        
        path = _resolve_rules_path()
        backup_dir = os.path.join(os.path.dirname(path), "backups")
        if not os.path.exists(backup_dir):
            raise HTTPException(status_code=400, detail="No backups available to rollback.")
            
        backups = sorted(glob.glob(os.path.join(backup_dir, "rules_config_*.json")))
        if not backups:
            raise HTTPException(status_code=400, detail="No backups found to rollback.")
            
        latest_backup = backups[-1]
        
        # Load the configuration from backup
        with open(latest_backup, "r", encoding="utf-8") as f:
            backed_config = json.load(f)
            
        # Write back to main rules config
        _save_rules_config(backed_config)
        
        # Delete that specific backup file since we restored it
        os.remove(latest_backup)
        
        return {"message": "Rollback executed successfully.", "restored_from": os.path.basename(latest_backup)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rollback failed: {str(e)}")
