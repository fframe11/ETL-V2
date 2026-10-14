"""
SDOQAP Elasticsearch-to-PostgreSQL Compatibility Bridge
========================================================
Emulates the subset of Elasticsearch client methods (search, get, index,
indices.exists, update, delete) used by SDOQAP's serving routers, backed
by PostgreSQL JSONB (public.sdoqap_metadata).

Enables full serving functionality on Cloud Free Tier (Neon PostgreSQL)
without requiring an Elasticsearch cluster.
"""

import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta

from .config import get_postgres_connection

logger = logging.getLogger(__name__)


class BridgeIndicesClient:
    """Emulates es.indices namespace."""

    def __init__(self, bridge: "ESPostgresBridge"):
        self.bridge = bridge
        self._exists_cache = {}

    def exists(self, index: str) -> bool:
        """Returns True if the logical index/collection has documents or is registered."""
        import time
        now = time.time()
        cached = self._exists_cache.get(index)
        if cached and now < cached[1]:
            return cached[0]

        try:
            conn = self.bridge._get_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 1 FROM public.sdoqap_metadata
                        WHERE collection = %s LIMIT 1;
                    """, (index,))
                    res = cur.fetchone() is not None
                    self._exists_cache[index] = (res, now + 15.0)
                    return res
            finally:
                conn.close()
        except Exception as e:
            logger.debug("Bridge indices.exists check failed for '%s': %s", index, e)
            return False

    def create(self, index: str, **kwargs) -> Dict[str, Any]:
        """Registers a logical collection in sdoqap_metadata with a marker document."""
        try:
            conn = self.bridge._get_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO public.sdoqap_metadata (collection, doc_id, table_name, data, updated_at)
                        VALUES (%s, '__meta_index__', NULL, '{}'::jsonb, NOW())
                        ON CONFLICT (collection, doc_id) DO NOTHING;
                    """, (index,))
                    conn.commit()
                self._exists_cache[index] = (True, time.time() + 15.0)
                return {"acknowledged": True, "shards_acknowledged": True, "index": index}
            finally:
                conn.close()
        except Exception as e:
            logger.debug("Bridge indices.create failed for '%s': %s", index, e)
            return {"acknowledged": True, "shards_acknowledged": True, "index": index}

    def delete(self, index: str, **kwargs) -> Dict[str, Any]:
        """Clears all records belonging to index in sdoqap_metadata."""
        self._exists_cache.pop(index, None)
        try:
            conn = self.bridge._get_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM public.sdoqap_metadata WHERE collection = %s;", (index,))
                    conn.commit()
                return {"acknowledged": True}
            finally:
                conn.close()
        except Exception as e:
            logger.debug("Bridge indices.delete failed: %s", e)
            return {"acknowledged": False}


class ESPostgresBridge:
    """Drop-in adapter for Elasticsearch client backed by PostgreSQL JSONB."""

    def __init__(self):
        self.indices = BridgeIndicesClient(self)

    def _get_conn(self):
        return get_postgres_connection(connect_timeout=3)

    def ping(self) -> bool:
        """Verifies PostgreSQL connectivity."""
        try:
            conn = self._get_conn()
            conn.close()
            return True
        except Exception:
            return False

    def exists(self, index: str, id: str) -> bool:
        """Checks if a document exists in the collection."""
        try:
            conn = self._get_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 1 FROM public.sdoqap_metadata
                        WHERE collection = %s AND doc_id = %s;
                    """, (index, str(id)))
                    return cur.fetchone() is not None
            finally:
                conn.close()
        except Exception:
            return False

    def get(self, index: str, id: str, **kwargs) -> Dict[str, Any]:
        """Retrieves a document by index and id, matching ES get format."""
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT data FROM public.sdoqap_metadata
                    WHERE collection = %s AND doc_id = %s;
                """, (index, str(id)))
                row = cur.fetchone()
                if not row:
                    raise KeyError(f"Document '{id}' not found in index '{index}'.")
                data = row[0]
                if isinstance(data, str):
                    data = json.loads(data)
                return {
                    "_index": index,
                    "_id": str(id),
                    "_version": 1,
                    "_seq_no": 0,
                    "_primary_term": 1,
                    "found": True,
                    "_source": data
                }
        finally:
            conn.close()

    def index(self, index: str, document: Optional[Dict[str, Any]] = None,
              id: Optional[str] = None, body: Optional[Dict[str, Any]] = None,
              refresh: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """Saves a document into the collection."""
        doc = document or body or {}
        doc_id = str(id or doc.get("id") or doc.get("run_id") or doc.get("ingest_id") or doc.get("table_name") or f"doc_{int(datetime.now(timezone.utc).timestamp()*1000)}")
        tbl = doc.get("table_name") or doc.get("table")

        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                data_json = json.dumps(doc)
                cur.execute("""
                    INSERT INTO public.sdoqap_metadata (collection, doc_id, table_name, data, updated_at)
                    VALUES (%s, %s, %s, %s::jsonb, NOW())
                    ON CONFLICT (collection, doc_id)
                    DO UPDATE SET data = EXCLUDED.data, table_name = EXCLUDED.table_name, updated_at = NOW();
                """, (index, doc_id, tbl, data_json))
                conn.commit()
            return {
                "_index": index,
                "_id": doc_id,
                "_version": 1,
                "result": "created",
                "_seq_no": 0,
                "_primary_term": 1
            }
        finally:
            conn.close()

    def update(self, index: str, id: str, body: Optional[Dict[str, Any]] = None, **kwargs) -> Dict[str, Any]:
        """Updates a document by merging doc fields."""
        doc_update = (body or {}).get("doc", {})
        existing = {}
        try:
            existing = self.get(index, id)["_source"]
        except Exception:
            pass
        existing.update(doc_update)
        return self.index(index=index, id=id, document=existing)

    def delete(self, index: str, id: str, **kwargs) -> Dict[str, Any]:
        """Deletes a document from the collection."""
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM public.sdoqap_metadata
                    WHERE collection = %s AND doc_id = %s;
                """, (index, str(id)))
                conn.commit()
            return {
                "_index": index,
                "_id": str(id),
                "_version": 1,
                "result": "deleted"
            }
        finally:
            conn.close()

    def delete_by_query(self, index: str, body: Optional[Dict[str, Any]] = None, **kwargs) -> Dict[str, Any]:
        """Deletes documents matching query from collection."""
        res = self.search(index=index, body=body, size=10000)
        hits = res.get("hits", {}).get("hits", [])
        doc_ids = [h["_id"] for h in hits if h["_id"] != "__meta_index__"]
        deleted_count = 0
        if doc_ids:
            conn = self._get_conn()
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        DELETE FROM public.sdoqap_metadata
                        WHERE collection = %s AND doc_id = ANY(%s);
                    """, (index, doc_ids))
                    deleted_count = cur.rowcount
                    conn.commit()
            finally:
                conn.close()
        return {
            "took": 1,
            "timed_out": False,
            "total": deleted_count,
            "deleted": deleted_count,
            "batches": 1,
            "version_conflicts": 0,
            "noops": 0,
            "retries": {"bulk": 0, "search": 0},
            "throttled_millis": 0,
            "requests_per_second": -1.0,
            "throttled_until_millis": 0,
            "failures": []
        }

    def count(self, index: str, body: Optional[Dict[str, Any]] = None, **kwargs) -> Dict[str, Any]:
        """Returns document count matching query in collection."""
        res = self.search(index=index, body=body, size=0, **kwargs)
        return {"count": res["hits"]["total"]["value"]}

    def search(self, index: str, query: Optional[Dict[str, Any]] = None,
               body: Optional[Dict[str, Any]] = None, sort: Any = None,
               from_: int = 0, size: int = 50, **kwargs) -> Dict[str, Any]:
        """Executes a search query over sdoqap_metadata with term, terms, match, range, exists, bool, sort, and aggregations."""
        search_body = body or {}
        q = query or search_body.get("query", {})
        s_sort = sort or search_body.get("sort")
        s_from = from_ if from_ != 0 else search_body.get("from", 0)
        s_size = size if size != 50 else search_body.get("size", 50)

        filter_col, filter_val = _extract_sql_filter(q)
        sql_where = "WHERE collection = %s AND doc_id != '__meta_index__'"
        params = [index]
        if filter_col and filter_val:
            if filter_col in ("table_name", "table"):
                sql_where += " AND (table_name = %s OR data->>'table_name' = %s)"
                params.extend([filter_val, filter_val])
            elif filter_col in ("doc_id", "id", "run_id", "ingest_id"):
                sql_where += " AND (doc_id = %s OR data->>'run_id' = %s OR data->>'ingest_id' = %s)"
                params.extend([filter_val, filter_val, filter_val])
            else:
                sql_where += " AND data->>%s = %s"
                params.extend([filter_col, filter_val])

        aggs_req = search_body.get("aggs") or search_body.get("aggregations") or {}

        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                # Fast path for count-only queries
                if s_size == 0 and not aggs_req:
                    cur.execute(f"SELECT COUNT(*) FROM public.sdoqap_metadata {sql_where};", params)
                    row = cur.fetchone()
                    total_count = row[0] if row else 0
                    return {
                        "took": 1,
                        "timed_out": False,
                        "_shards": {"total": 1, "successful": 1, "skipped": 0, "failed": 0},
                        "hits": {"total": {"value": total_count, "relation": "eq"}, "max_score": 1.0, "hits": []},
                        "aggregations": {}
                    }

                cur.execute(f"""
                    SELECT doc_id, data FROM public.sdoqap_metadata
                    {sql_where};
                """, params)
                all_rows = cur.fetchall()

            all_docs = []
            for doc_id, data in all_rows:
                if isinstance(data, str):
                    try:
                        data = json.loads(data)
                    except Exception:
                        data = {}
                doc_obj = dict(data)
                doc_obj["_meta_doc_id"] = doc_id
                all_docs.append((doc_id, doc_obj))

            # Filter documents matching q
            matching = [(d_id, d_obj) for d_id, d_obj in all_docs if _doc_matches(d_obj, q)]
            total_count = len(matching)
            matching_docs = [d_obj for _, d_obj in matching]

            # Compute real aggregations
            computed_aggs = {}
            aggs_req = search_body.get("aggs") or search_body.get("aggregations") or {}
            if aggs_req:
                for agg_k, agg_v in aggs_req.items():
                    if not isinstance(agg_v, dict):
                        continue
                    if "sum" in agg_v:
                        fld = agg_v["sum"].get("field", "")
                        s_val = sum(float(d.get(fld, 0) or 0) for d in matching_docs if d.get(fld) is not None)
                        computed_aggs[agg_k] = {"value": round(s_val, 2)}
                    elif "avg" in agg_v:
                        fld = agg_v["avg"].get("field", "")
                        vals = [float(d.get(fld) or 0) for d in matching_docs if d.get(fld) is not None]
                        a_val = (sum(vals) / len(vals)) if vals else None
                        computed_aggs[agg_k] = {"value": round(a_val, 2) if a_val is not None else None}
                    elif "terms" in agg_v:
                        fld = agg_v["terms"].get("field", "").replace(".keyword", "")
                        groups = {}
                        for d in matching_docs:
                            g_key = str(d.get(fld) or d.get("table_name") or d.get("table") or "")
                            if g_key:
                                groups.setdefault(g_key, []).append(d)
                        b_list = []
                        for g_key, g_docs in groups.items():
                            g_docs.sort(key=lambda x: str(x.get("timestamp") or x.get("updated_at") or ""), reverse=True)
                            b_item = {"key": g_key, "doc_count": len(g_docs)}
                            if "aggs" in agg_v and "last" in agg_v["aggs"]:
                                b_item["last"] = {"hits": {"hits": [{"_source": g_docs[0]}] if g_docs else []}}
                            b_list.append(b_item)
                        computed_aggs[agg_k] = {"buckets": b_list}

            # Sort
            if s_sort:
                matching = _sort_items(matching, s_sort)
            else:
                matching.sort(key=lambda item: str(item[1].get("timestamp") or item[1].get("updated_at") or item[1].get("created_at") or ""), reverse=True)

            # Paginate
            paged = matching[s_from: s_from + s_size] if s_size > 0 else []
            hits = []
            for d_id, d_obj in paged:
                src = {k: v for k, v in d_obj.items() if k != "_meta_doc_id"}
                hits.append({
                    "_index": index,
                    "_id": d_id,
                    "_score": 1.0,
                    "_source": src
                })

            return {
                "took": 1,
                "timed_out": False,
                "_shards": {"total": 1, "successful": 1, "skipped": 0, "failed": 0},
                "hits": {
                    "total": {"value": total_count, "relation": "eq"},
                    "max_score": 1.0,
                    "hits": hits
                },
                "aggregations": computed_aggs
            }
        finally:
            conn.close()


def _extract_sql_filter(q: Optional[Dict[str, Any]]):
    """Extracts simple column and value for SQL index filtering where applicable."""
    if not q or not isinstance(q, dict):
        return None, None
    if "term" in q and isinstance(q["term"], dict):
        for k, v in q["term"].items():
            col = k.replace(".keyword", "")
            val = v.get("value") if isinstance(v, dict) else v
            return col, str(val)
    elif "match" in q and isinstance(q["match"], dict):
        for k, v in q["match"].items():
            col = k.replace(".keyword", "")
            val = v.get("query") if isinstance(v, dict) else v
            return col, str(val)
    elif "bool" in q and isinstance(q["bool"], dict):
        clauses = []
        if "filter" in q["bool"] and isinstance(q["bool"]["filter"], list):
            clauses.extend(q["bool"]["filter"])
        if "must" in q["bool"] and isinstance(q["bool"]["must"], list):
            clauses.extend(q["bool"]["must"])
        for f in clauses:
            col, val = _extract_sql_filter(f)
            if col:
                return col, val
    return None, None


def _doc_matches(doc: Dict[str, Any], q: Optional[Dict[str, Any]]) -> bool:
    """Evaluates whether doc satisfies the Elasticsearch query DSL."""
    if not q or q == {"match_all": {}}:
        return True
    if "match_all" in q:
        return True

    if "term" in q and isinstance(q["term"], dict):
        for k, v in q["term"].items():
            col = k.replace(".keyword", "")
            target = v.get("value") if isinstance(v, dict) else v
            case_insensitive = v.get("case_insensitive", False) if isinstance(v, dict) else False
            doc_val = doc.get(col)
            if doc_val is None:
                return False
            if case_insensitive and isinstance(doc_val, str) and isinstance(target, str):
                if doc_val.lower() != target.lower():
                    return False
            elif str(doc_val) != str(target):
                return False

    if "terms" in q and isinstance(q["terms"], dict):
        for k, v in q["terms"].items():
            col = k.replace(".keyword", "")
            target_list = [str(x).lower() for x in v] if isinstance(v, (list, tuple, set)) else [str(v).lower()]
            doc_val = str(doc.get(col) or "").lower()
            if doc_val not in target_list:
                return False

    if "match" in q and isinstance(q["match"], dict):
        for k, v in q["match"].items():
            col = k.replace(".keyword", "")
            target = v.get("query") if isinstance(v, dict) else v
            doc_val = doc.get(col)
            if doc_val is None or str(doc_val).lower() != str(target).lower():
                return False

    if "exists" in q and isinstance(q["exists"], dict):
        col = q["exists"].get("field", "").replace(".keyword", "")
        if doc.get(col) is None:
            return False

    if "range" in q and isinstance(q["range"], dict):
        for k, v in q["range"].items():
            col = k.replace(".keyword", "")
            doc_val = doc.get(col)
            if doc_val is None:
                return False
            for op, bound in v.items():
                if isinstance(bound, str) and bound.startswith("now-"):
                    unit = bound[-1]
                    num_str = bound[4:-1]
                    num = int(num_str) if num_str.isdigit() else 1
                    delta = timedelta(hours=num) if unit == "h" else timedelta(days=num)
                    bound = (datetime.now(timezone.utc) - delta).isoformat()
                try:
                    d_num, b_num = float(doc_val), float(bound)
                    if op == "gte" and not (d_num >= b_num):
                        return False
                    if op == "gt" and not (d_num > b_num):
                        return False
                    if op == "lte" and not (d_num <= b_num):
                        return False
                    if op == "lt" and not (d_num < b_num):
                        return False
                except (ValueError, TypeError):
                    d_str, b_str = str(doc_val), str(bound)
                    if op == "gte" and not (d_str >= b_str):
                        return False
                    if op == "gt" and not (d_str > b_str):
                        return False
                    if op == "lte" and not (d_str <= b_str):
                        return False
                    if op == "lt" and not (d_str < b_str):
                        return False

    if "bool" in q and isinstance(q["bool"], dict):
        bq = q["bool"]
        must = bq.get("must", [])
        if not isinstance(must, list):
            must = [must]
        for sub_q in must:
            if not _doc_matches(doc, sub_q):
                return False

        flt = bq.get("filter", [])
        if not isinstance(flt, list):
            flt = [flt]
        for sub_q in flt:
            if not _doc_matches(doc, sub_q):
                return False

        must_not = bq.get("must_not", [])
        if not isinstance(must_not, list):
            must_not = [must_not]
        for sub_q in must_not:
            if _doc_matches(doc, sub_q):
                return False

    return True


def _sort_items(items: list, s_sort: Any) -> list:
    if not items or not s_sort:
        return items
    sort_key = "timestamp"
    reverse = True
    if isinstance(s_sort, list) and len(s_sort) > 0:
        first = s_sort[0]
        if isinstance(first, dict):
            for k, v in first.items():
                sort_key = k.replace(".keyword", "")
                if isinstance(v, str):
                    reverse = (v.lower() != "asc")
                elif isinstance(v, dict):
                    reverse = (v.get("order", "desc").lower() != "asc")
                break
        elif isinstance(first, str):
            parts = first.split()
            sort_key = parts[0].replace(".keyword", "")
            reverse = (parts[1].lower() != "asc") if len(parts) > 1 else True
    elif isinstance(s_sort, str):
        parts = s_sort.split()
        sort_key = parts[0].replace(".keyword", "")
        reverse = (parts[1].lower() != "asc") if len(parts) > 1 else True

    return sorted(items, key=lambda item: (item[1].get(sort_key) is not None, str(item[1].get(sort_key) or "")), reverse=reverse)


_bridge_singleton = None


def get_bridge_client() -> ESPostgresBridge:
    """Returns singleton ESPostgresBridge instance."""
    global _bridge_singleton
    if _bridge_singleton is None:
        _bridge_singleton = ESPostgresBridge()
    return _bridge_singleton
