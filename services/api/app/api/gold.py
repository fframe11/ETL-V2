import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends

from .config import get_es_client
from .auth import require_session

router = APIRouter(tags=["gold"])

# ─────────────────────────────────────────────────────────────────────────────
# GOLD LAYER ENDPOINTS
# Pre-aggregated summary data (faster than real-time Elasticsearch queries)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/v1/gold/daily-quality")
def get_gold_daily_quality(days: int = 14):
    """Return daily quality summary per table from Gold Layer (last N days)."""
    es = get_es_client()
    default = []
    try:
        if not es.indices.exists(index="sdoqap_gold_daily_quality"):
            return {"data": default, "source": "no_gold_layer"}
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        res = es.search(
            index="sdoqap_gold_daily_quality",
            body={
                "size": 200,
                "query": {"range": {"date": {"gte": cutoff}}},
                "sort": [{"date": {"order": "asc"}}, {"table_name": {"order": "asc"}}]
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        records = [h["_source"] for h in hits]
        return {"data": records, "count": len(records), "source": "gold_layer"}
    except Exception as e:
        return {"data": default, "error": str(e), "source": "error"}

@router.get("/api/v1/gold/error-patterns")
def get_gold_error_patterns(days: int = 14):
    """Return aggregated error pattern trends from Gold Layer (last N days)."""
    es = get_es_client()
    default = []
    try:
        if not es.indices.exists(index="sdoqap_gold_error_patterns"):
            return {"data": default, "source": "no_gold_layer"}
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        res = es.search(
            index="sdoqap_gold_error_patterns",
            body={
                "size": 200,
                "query": {"range": {"date": {"gte": cutoff}}},
                "sort": [{"date": {"order": "asc"}}, {"count": {"order": "desc"}}]
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        records = [h["_source"] for h in hits]
        # Build summary: top error types overall
        totals = {}
        for r in records:
            et = r.get("error_type", "unknown")
            totals[et] = totals.get(et, 0) + r.get("count", 0)
        top_errors = sorted(totals.items(), key=lambda x: x[1], reverse=True)[:5]
        return {
            "data": records,
            "top_errors": [{"error_type": k, "total_count": v} for k, v in top_errors],
            "count": len(records),
            "source": "gold_layer"
        }
    except Exception as e:
        return {"data": default, "error": str(e), "source": "error"}

@router.get("/api/v1/gold/financial-impact")
def get_gold_financial_impact(days: int = 30):
    """Return daily and cumulative financial impact (COPDQ) from Gold Layer."""
    es = get_es_client()
    default_data = {
        "daily": [],
        "total_quarantined": 0,
        "total_cost_usd": 0.0,
        "cumulative_cost_usd": 0.0,
        "most_impacted_table": "N/A"
    }
    try:
        if not es.indices.exists(index="sdoqap_gold_financial_impact"):
            return {**default_data, "source": "no_gold_layer"}
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        res = es.search(
            index="sdoqap_gold_financial_impact",
            body={
                "size": 100,
                "query": {"range": {"date": {"gte": cutoff}}},
                "sort": [{"date": {"order": "asc"}}]
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        records = [h["_source"] for h in hits]
        if not records:
            return {**default_data, "source": "gold_layer_empty"}
        total_q = sum(r.get("total_quarantined_records", 0) for r in records)
        total_cost = sum(r.get("estimated_cost_usd", 0.0) for r in records)
        latest = records[-1] if records else {}
        cumulative = latest.get("cumulative_cost_usd", total_cost)
        # Most impacted table across window
        table_costs = {}
        for r in records:
            t = r.get("most_impacted_table", "unknown")
            table_costs[t] = table_costs.get(t, 0) + r.get("estimated_cost_usd", 0)
        most_impacted = max(table_costs, key=table_costs.get) if table_costs else "N/A"
        return {
            "daily": records,
            "total_quarantined": total_q,
            "total_cost_usd": round(total_cost, 2),
            "cumulative_cost_usd": round(cumulative, 2),
            "most_impacted_table": most_impacted,
            "source": "gold_layer"
        }
    except Exception as e:
        return {**default_data, "error": str(e), "source": "error"}

@router.get("/api/v1/gold/schema-drift-history")
def get_gold_schema_drift_history(days: int = 30):
    """Return schema drift event history from Gold Layer."""
    es = get_es_client()
    try:
        if not es.indices.exists(index="sdoqap_gold_schema_drift"):
            return {"data": [], "total_drift_events": 0, "source": "no_gold_layer"}
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        res = es.search(
            index="sdoqap_gold_schema_drift",
            body={
                "size": 200,
                "query": {"range": {"date": {"gte": cutoff}}},
                "sort": [{"date": {"order": "asc"}}]
            }
        )
        hits = res.get("hits", {}).get("hits", [])
        records = [h["_source"] for h in hits]
        total_events = sum(r.get("drift_count", 0) for r in records)
        return {
            "data": records,
            "total_drift_events": total_events,
            "source": "gold_layer"
        }
    except Exception as e:
        return {"data": [], "error": str(e), "source": "error"}

@router.post("/api/v1/gold/rebuild")
def trigger_gold_rebuild(_user: str = Depends(require_session)):
    """Trigger an async Gold Layer rebuild by calling the Spark Trigger Daemon."""
    import requests, threading
    def run_gold():
        spark_host = os.getenv("SPARK_MASTER_HOST", "spark-master")
        try:
            res = requests.post(f"http://{spark_host}:8099/gold/rebuild", timeout=5)
            if res.status_code == 200:
                print("[GOLD REBUILD] Successfully triggered rebuild on Spark Trigger Daemon.")
            else:
                print(f"[GOLD REBUILD ERROR] Spark Trigger Daemon returned status {res.status_code}: {res.text}")
        except Exception as e:
            print(f"[GOLD REBUILD ERROR] Failed to connect to Spark Trigger Daemon: {e}")
    thread = threading.Thread(target=run_gold, daemon=True)
    thread.start()
    return {"status": "rebuild_triggered", "message": "Gold Layer rebuild started in background via Spark Daemon."}
