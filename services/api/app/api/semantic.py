"""Semantic layer API: column meaning and metric definitions per dataset, drafted by AI
(or by the name rules), edited and approved by a person. Stored in the ES index
sdoqap_semantic_layer, one document per dataset (id = dataset name)."""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import dashboard_data, semantic_llm
from .auth import require_session
from .config import get_es_client
from .dashboard_compute import metric_values
from .semantic_layer import resolve, validate_semantic

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/semantic", tags=["semantic"], dependencies=[Depends(require_session)])

SEMANTIC_INDEX = "sdoqap_semantic_layer"
MAX_HISTORY = 10


class SemanticPayload(BaseModel):
    columns: Dict[str, Any] = Field(default_factory=dict)
    metrics: List[Any] = Field(default_factory=list)


class ApprovePayload(SemanticPayload):
    base_version: int = Field(ge=0)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _encode_part(part):
    if not part:
        return None
    meta = {k: v for k, v in part.items() if k not in ("columns", "metrics")}
    # A string, not an object: column and metric fields would fight over one ES mapping.
    return {**meta, "content_json": json.dumps({"columns": part["columns"], "metrics": part["metrics"]}, ensure_ascii=False)}


def _decode_part(part):
    if not part:
        return None
    meta = {k: v for k, v in part.items() if k != "content_json"}
    return {**meta, **json.loads(part["content_json"])}


def encode_doc(doc):
    return {"table_name": doc["table_name"], "draft": _encode_part(doc.get("draft")),
            "approved": _encode_part(doc.get("approved")), "history": doc.get("history") or []}


def decode_doc(source):
    return {"table_name": source["table_name"], "draft": _decode_part(source.get("draft")),
            "approved": _decode_part(source.get("approved")), "history": source.get("history") or []}


def read_doc(es, table_name):
    if not es.indices.exists(index=SEMANTIC_INDEX):
        return None
    res = es.search(index=SEMANTIC_INDEX, query={"bool": {"filter": [{"term": {"table_name.keyword": table_name}}]}}, size=1)
    hits = res["hits"]["hits"]
    return decode_doc(hits[0]["_source"]) if hits else None


def _write(es, doc):
    es.index(index=SEMANTIC_INDEX, id=doc["table_name"], document=encode_doc(doc), refresh="wait_for")


def _es_or_none():
    try:
        return get_es_client()
    except HTTPException:
        return None


def load_view(table_name, profile, es):
    """The semantic view Create Dashboard uses. Without Elasticsearch it is the rule
    guess (status "unavailable"), which still hides columns whose names look personal."""
    if es is None:
        return resolve(table_name, None, profile, available=False)
    try:
        doc = read_doc(es, table_name)
    except Exception:  # ES answered the ping but not the read: hide by the name rules, as when it is down
        logger.warning("Reading the semantic layer of %s failed; using the name rules", table_name, exc_info=True)
        return resolve(table_name, None, profile, available=False)
    return resolve(table_name, doc, profile)


def _empty(table_name):
    return {"table_name": table_name, "draft": None, "approved": None, "history": []}


def _complete(semantic, view, profile):
    """Columns the body left out keep their current meaning, so a stored version always
    covers every column of the dataset."""
    columns = {c["name"]: semantic["columns"].get(c["name"], view["effective"]["columns"][c["name"]])
               for c in profile["columns"]}
    return {"columns": columns, "metrics": semantic["metrics"]}


def _answer(table_name, doc, profile, df, warnings=()):
    view = resolve(table_name, doc, profile)
    view["metric_values"] = metric_values(df, view["effective"]["metrics"])
    view["warnings"] = list(warnings) + view["warnings"]
    return view


@router.get("/{table_name}")
def get_semantic(table_name: str):
    df, profile = dashboard_data.load_active_dataset(table_name)
    view = load_view(table_name, profile, _es_or_none())
    view["metric_values"] = metric_values(df, view["effective"]["metrics"])
    return view


@router.post("/{table_name}/draft")
def draft_semantic_with_ai(table_name: str, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    current = resolve(table_name, doc, profile)
    result = semantic_llm.draft_semantic(table_name, profile, current["hidden_columns"])
    doc["draft"] = {**result["semantic"], "generated_by": result["engine"], "model": result["model"],
                    "updated_by": user, "updated_at": _now()}
    _write(es, doc)
    view = _answer(table_name, doc, profile, df, result["warnings"])
    view.update(engine=result["engine"], model=result["model"])
    return view


@router.put("/{table_name}/draft")
def save_semantic_draft(table_name: str, payload: SemanticPayload, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    semantic_doc, warnings = validate_semantic(payload.model_dump(), profile)
    current = resolve(table_name, doc, profile)
    doc["draft"] = {**_complete(semantic_doc, current, profile), "generated_by": "user", "model": None,
                    "updated_by": user, "updated_at": _now()}
    _write(es, doc)
    return _answer(table_name, doc, profile, df, warnings)


@router.post("/{table_name}/approve")
def approve_semantic(table_name: str, payload: ApprovePayload, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    version = (doc.get("approved") or {}).get("version", 0)
    if payload.base_version != version:
        raise HTTPException(status_code=409, detail="มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่")
    semantic_doc, warnings = validate_semantic(payload.model_dump(exclude={"base_version"}), profile)
    current = resolve(table_name, doc, profile)
    now = _now()
    doc["approved"] = {**_complete(semantic_doc, current, profile), "version": version + 1,
                       "approved_by": user, "approved_at": now}
    doc["draft"] = None
    doc["history"] = ([{"version": version + 1, "approved_by": user, "approved_at": now}] + doc["history"])[:MAX_HISTORY]
    _write(es, doc)
    return _answer(table_name, doc, profile, df, warnings)
