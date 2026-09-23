import os
from fastapi import APIRouter, HTTPException
from elasticsearch import Elasticsearch

router = APIRouter(
    prefix="/api/v1/quality",
    tags=["quality"]
)

from .config import get_elasticsearch_url, get_es_client

@router.get("")
def list_quality_runs(page: int = 1, size: int = 50, limit: int = 50, paginated: bool = False):
    """
    Retrieves history logs of all data quality validations from Elasticsearch with pagination.
    """
    es = get_es_client()
    try:
        if not es.indices.exists(index="sdoqap_quality_runs"):
            return {"data": [], "total": 0, "page": page, "size": size} if paginated else []
            
        actual_size = limit if limit != 50 else size
        from_idx = (page - 1) * actual_size
        
        # Prevent ES Deep Pagination memory blowup (> 10000 window limit)
        if from_idx + actual_size > 10000:
            raise HTTPException(
                status_code=400,
                detail="Deep pagination limit exceeded. Elasticsearch restricts offsets above 10,000 to prevent memory exhaustion."
            )
            
        res = es.search(
            index="sdoqap_quality_runs",
            query={"match_all": {}},
            sort=[{"timestamp": {"order": "desc"}}],
            from_=from_idx,
            size=actual_size
        )
        data = []
        for hit in res["hits"]["hits"]:
            doc = hit["_source"]
            if not isinstance(doc, dict):
                continue
            # Preserve semantic truth: None indicates metric was never computed/missing, not 0
            doc.setdefault("total_records", None)
            doc.setdefault("clean_records", None)
            doc.setdefault("quarantined_records", None)
            doc.setdefault("quality_score", None)
            data.append(doc)
        if paginated:
            total = res["hits"]["total"]["value"] if isinstance(res["hits"]["total"], dict) else res["hits"]["total"]
            return {"data": data, "total": total, "page": page, "size": actual_size}
        else:
            return data
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch query failed: {str(e)}")

@router.get("/{table_name}")
def get_table_quality_history(table_name: str, page: int = 1, size: int = 20, limit: int = 20, paginated: bool = False):
    """
    Retrieves the quality scorecard history for a specific table from Elasticsearch with pagination.
    """
    es = get_es_client()
    try:
        if not es.indices.exists(index="sdoqap_quality_runs"):
            raise HTTPException(status_code=404, detail="Quality runs index 'sdoqap_quality_runs' not found.")
            
        actual_size = limit if limit != 20 else size
        from_idx = (page - 1) * actual_size
        
        # Prevent ES Deep Pagination memory blowup (> 10000 window limit)
        if from_idx + actual_size > 10000:
            raise HTTPException(
                status_code=400,
                detail="Deep pagination limit exceeded. Elasticsearch restricts offsets above 10,000 to prevent memory exhaustion."
            )
            
        res = es.search(
            index="sdoqap_quality_runs",
            query={"term": {"table_name.keyword": {"value": table_name, "case_insensitive": True}}},
            sort=[{"timestamp": {"order": "desc"}}],
            from_=from_idx,
            size=actual_size
        )
        hits = res["hits"]["hits"]
        if not hits and not paginated:
            raise HTTPException(
                status_code=404, 
                detail=f"No quality logs found for table query '{table_name}'."
            )
        data = [hit["_source"] for hit in hits]
        if paginated:
            total = res["hits"]["total"]["value"] if isinstance(res["hits"]["total"], dict) else res["hits"]["total"]
            return {"data": data, "total": total, "page": page, "size": actual_size}
        else:
            return data
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch query failed: {str(e)}")
