"""Semantic layer API: column meaning and metric definitions per dataset, drafted by AI
(or by the name rules), edited and approved by a person. Stored in the ES index
sdoqap_semantic_layer, one document per dataset (id = dataset name)."""
import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from elasticsearch import ApiError, ConflictError, NotFoundError, TransportError
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


STALE_APPROVAL = "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่"
STALE_DRAFT = "มีคนแก้ไขพร้อมกัน กรุณาลองใหม่"
ES_OFFLINE = "Elasticsearch service is offline"
# A request to ES that failed on the wire, timed out or was refused. Conflicts (409) are
# handled by the callers, and json decode errors are not ES errors, so neither is caught here.
ES_ERRORS = (ApiError, TransportError, OSError)


class SemanticPayload(BaseModel):
    # Any, not Dict/List: a wrong-typed part is repaired by validate_semantic (spec 13),
    # only a body that is not a JSON object is a 422.
    columns: Any = None
    metrics: Any = None


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


def _read_source(es, table_name):
    """The stored document exactly as Elasticsearch holds it, or None."""
    if not es.indices.exists(index=SEMANTIC_INDEX):
        return None
    res = es.search(index=SEMANTIC_INDEX, query={"bool": {"filter": [{"term": {"table_name.keyword": table_name}}]}}, size=1)
    hits = res["hits"]["hits"]
    return hits[0]["_source"] if hits else None


def read_doc(es, table_name):
    source = _read_source(es, table_name)
    return decode_doc(source) if source else None


@contextmanager
def _es_guard(action):
    """The cached ES client is not pinged per call, so ES can fail after get_es_client
    succeeded. Any such failure is the spec's 503, never a 500."""
    try:
        yield
    except ConflictError:
        raise
    except ES_ERRORS as exc:
        logger.warning("Elasticsearch failed while %s the semantic layer", action, exc_info=True)
        raise HTTPException(status_code=503, detail=ES_OFFLINE) from exc


def _read_for_update(es, table_name):
    """The stored document plus its _seq_no/_primary_term in doc["_cas"] (None when the
    document does not exist yet). encode_doc never stores _cas."""
    try:
        res = es.get(index=SEMANTIC_INDEX, id=table_name)
    except NotFoundError:
        return {**_empty(table_name), "_cas": None}
    return {**decode_doc(res["_source"]), "_cas": (res["_seq_no"], res["_primary_term"])}


def _write(es, doc):
    """Optimistic concurrency: only replaces the version that was read (ConflictError
    otherwise); the first write only creates."""
    cas = doc.get("_cas")
    guard = {"op_type": "create"} if cas is None else {"if_seq_no": cas[0], "if_primary_term": cas[1]}
    es.index(index=SEMANTIC_INDEX, id=doc["table_name"], document=encode_doc(doc), refresh="wait_for", **guard)


def _update(es, table_name, mutate, conflict_detail):
    """Read, mutate(doc), write. Another writer in between is a ConflictError: read again
    and redo the change once, then give up with 409 so nothing newer is overwritten."""
    for _ in range(2):
        with _es_guard("reading"):
            doc = _read_for_update(es, table_name)
        mutate(doc)
        try:
            with _es_guard("writing"):
                _write(es, doc)
        except ConflictError:
            continue
        return doc
    raise HTTPException(status_code=409, detail=conflict_detail)


def _es_or_none():
    try:
        return get_es_client()
    except HTTPException:
        return None


def _flagged_personal(source, profile):
    """Columns a stored document marks personal (a boolean true), read straight from the raw
    parts so a part that is broken elsewhere cannot make the flag disappear."""
    names = {c["name"] for c in profile["columns"]}
    found = set()
    for key in ("approved", "draft"):
        try:
            columns = json.loads(source[key]["content_json"])["columns"]
            found |= {n for n, m in columns.items() if n in names and isinstance(m, dict) and m.get("pii") is True}
        except Exception:  # this part is unreadable or has the wrong shape; the other one may still be usable
            continue
    return found


def load_view(table_name, profile, es):
    """The semantic view Create Dashboard uses. Without Elasticsearch, or when the stored
    document cannot be read, it is the rule guess (status "unavailable") plus every personal
    flag that can still be found in the stored parts, so columns a person flagged stay hidden."""
    if es is None:
        return resolve(table_name, None, profile, available=False)
    source = None
    try:
        source = _read_source(es, table_name)
        return resolve(table_name, decode_doc(source) if source else None, profile)
    except Exception:  # ES answered the ping but not the read, or the document has the wrong shape
        logger.warning("The semantic layer of %s is unreadable; using the name rules and its stored personal flags",
                       table_name, exc_info=True)
        flagged = _flagged_personal(source, profile) if isinstance(source, dict) else set()
        return resolve(table_name, None, profile, available=False, salvaged_pii=flagged)


def _empty(table_name):
    return {"table_name": table_name, "draft": None, "approved": None, "history": []}


def _complete(semantic, view, profile):
    """Columns the body left out keep their current meaning, so a stored version always
    covers every column of the dataset."""
    columns = {c["name"]: semantic["columns"].get(c["name"], view["effective"]["columns"][c["name"]])
               for c in profile["columns"]}
    return {"columns": columns, "metrics": semantic["metrics"]}


def _with_values(view, df):
    """Current values for the metrics the page shows: the effective ones, and the ones being
    edited (computed again only when a saved draft makes them differ)."""
    view["metric_values"] = metric_values(df, view["effective"]["metrics"])
    editing = view["editing"]
    editing["metric_values"] = (view["metric_values"] if editing["metrics"] == view["effective"]["metrics"]
                                else metric_values(df, editing["metrics"]))
    return view


def _answer(table_name, doc, profile, df, warnings=()):
    view = _with_values(resolve(table_name, doc, profile), df)
    view["warnings"] = list(warnings) + view["warnings"]
    return view


@router.get("/{table_name}")
def get_semantic(table_name: str):
    df, profile = dashboard_data.load_active_dataset(table_name)
    return _with_values(load_view(table_name, profile, _es_or_none()), df)


@router.post("/{table_name}/draft")
def draft_semantic_with_ai(table_name: str, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    with _es_guard("reading"):
        doc = read_doc(es, table_name) or _empty(table_name)
    current = resolve(table_name, doc, profile)
    # The AI is asked once; a retry after a write conflict reuses its answer.
    result = semantic_llm.draft_semantic(table_name, profile, current["hidden_columns"])

    def mutate(fresh):
        fresh["draft"] = {**result["semantic"], "generated_by": result["engine"], "model": result["model"],
                          "updated_by": user, "updated_at": _now()}

    doc = _update(es, table_name, mutate, STALE_DRAFT)
    view = _answer(table_name, doc, profile, df, result["warnings"])
    view.update(engine=result["engine"], model=result["model"])
    return view


@router.put("/{table_name}/draft")
def save_semantic_draft(table_name: str, payload: SemanticPayload, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    semantic_doc, warnings = validate_semantic(payload.model_dump(), profile)

    def mutate(fresh):
        current = resolve(table_name, fresh, profile)
        fresh["draft"] = {**_complete(semantic_doc, current, profile), "generated_by": "user", "model": None,
                          "updated_by": user, "updated_at": _now()}

    doc = _update(es, table_name, mutate, STALE_DRAFT)
    return _answer(table_name, doc, profile, df, warnings)


@router.post("/{table_name}/approve")
def approve_semantic(table_name: str, payload: ApprovePayload, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    semantic_doc, warnings = validate_semantic(payload.model_dump(exclude={"base_version"}), profile)

    def mutate(fresh):
        version = (fresh.get("approved") or {}).get("version", 0)
        if payload.base_version != version:
            raise HTTPException(status_code=409, detail=STALE_APPROVAL)
        current = resolve(table_name, fresh, profile)
        now = _now()
        fresh["approved"] = {**_complete(semantic_doc, current, profile), "version": version + 1,
                             "approved_by": user, "approved_at": now}
        fresh["draft"] = None
        fresh["history"] = ([{"version": version + 1, "approved_by": user, "approved_at": now}] + fresh["history"])[:MAX_HISTORY]

    doc = _update(es, table_name, mutate, STALE_APPROVAL)
    return _answer(table_name, doc, profile, df, warnings)
