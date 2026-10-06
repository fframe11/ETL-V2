"""Create Dashboard tab: list the Quality-Gate-passed datasets, preview one, let the LLM
draft a dashboard spec from the user's request, recompute it for the viewer's filters
and refine it with follow-up instructions and save it (ES index sdoqap_dashboards)."""
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import dashboard_data, dashboard_llm, dashboard_suggest
from .auth import require_session
from .config import get_es_client
from .dashboard_compute import compute_dashboard
from .dashboard_spec import AUDIENCES, SpecError, validate_spec

router = APIRouter(prefix="/api/v1/dashboards", tags=["dashboards"], dependencies=[Depends(require_session)])

DASHBOARDS_INDEX = "sdoqap_dashboards"
_ID_RE = re.compile(r"^[a-f0-9]{32}$")


class GeneratePayload(BaseModel):
    table_name: str
    context: str = Field(min_length=3, max_length=2000)
    audience: str = "business"


class RefinePayload(BaseModel):
    table_name: str
    spec: Dict[str, Any]
    instruction: str = Field(min_length=2, max_length=1000)


class SuggestChangesPayload(BaseModel):
    table_name: str
    spec: Dict[str, Any]


class RenderPayload(BaseModel):
    table_name: str
    spec: Dict[str, Any]
    selections: Dict[str, Any] = Field(default_factory=dict)


class SavePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    table_name: str
    context: str = Field(default="", max_length=2000)
    audience: str = "business"
    spec: Dict[str, Any]
    refinements: List[str] = Field(default_factory=list, max_length=50)


def _es_or_none():
    try:
        return get_es_client()
    except HTTPException:
        return None


def _checked_spec(raw, profile):
    try:
        return validate_spec(raw, profile)[0]
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"สเปกแดชบอร์ดใช้ไม่ได้: {exc}")


def _audience(value):
    if value not in AUDIENCES:
        raise HTTPException(status_code=400, detail=f"audience ต้องเป็นหนึ่งใน {', '.join(AUDIENCES)}")
    return value


@router.get("/datasets")
def list_dashboard_datasets():
    es = _es_or_none()
    quality = dashboard_data.quality_dataset_entry(es)
    return {"datasets": ([quality] if quality else []) + dashboard_data.list_datasets(es)}


@router.get("/datasets/{table_name}/preview")
def preview_dashboard_dataset(table_name: str):
    return dashboard_data.preview_dataset(table_name)


@router.get("/datasets/{table_name}/suggestions")
def dashboard_suggestions(table_name: str, audience: str = "business"):
    audience = _audience(audience)
    _, profile = dashboard_data.load_active_dataset(table_name)
    found = dashboard_suggest.suggest_from_profile(profile, audience)
    return {"table_name": table_name, "suggestions": [{"id": s["id"], "rule": s["rule"], "text": s["text"]} for s in found]}


@router.post("/suggest-changes")
def suggest_dashboard_changes(payload: SuggestChangesPayload):
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    return {"suggestions": dashboard_suggest.suggest_refinements(profile, spec)}


@router.post("/generate")
def generate_dashboard(payload: GeneratePayload):
    audience = _audience(payload.audience)
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    result = dashboard_llm.generate_spec(payload.table_name, profile, payload.context.strip(), audience)
    result["data"] = compute_dashboard(df, result["spec"], profile)
    return result


@router.post("/refine")
def refine_dashboard(payload: RefinePayload):
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    current = _checked_spec(payload.spec, profile)
    try:
        result = dashboard_llm.refine_spec(payload.table_name, profile, current, payload.instruction.strip())
    except dashboard_llm.LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"ปรับด้วย AI ไม่ได้ตอนนี้: {exc}")
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"AI ตอบสเปกที่ใช้ไม่ได้: {exc}")
    result["data"] = compute_dashboard(df, result["spec"], profile)
    return result


@router.post("/render")
def render_dashboard(payload: RenderPayload):
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    return {"spec": spec, "data": compute_dashboard(df, spec, profile, payload.selections)}


def _summary(doc):
    spec = json.loads(doc["spec_json"])
    keys = ("id", "name", "description", "table_name", "audience", "created_by", "created_at", "updated_at")
    return {**{k: doc.get(k) for k in keys}, "widget_count": len(spec.get("widgets", []))}


def _full(doc):
    out = {k: v for k, v in doc.items() if k != "spec_json"}
    out["spec"] = json.loads(doc["spec_json"])
    return out


def _find(es, dashboard_id):
    if not _ID_RE.match(dashboard_id) or not es.indices.exists(index=DASHBOARDS_INDEX):
        raise HTTPException(status_code=404, detail="ไม่พบแดชบอร์ดนี้")
    res = es.search(index=DASHBOARDS_INDEX, query={"bool": {"filter": [{"term": {"id.keyword": dashboard_id}}]}}, size=1)
    hits = res["hits"]["hits"]
    if not hits:
        raise HTTPException(status_code=404, detail="ไม่พบแดชบอร์ดนี้")
    return hits[0]["_source"]


def _document(payload, user, dashboard_id, created_at=None, created_by=None):
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    now = datetime.now(timezone.utc).isoformat()
    return {"id": dashboard_id, "name": payload.name.strip(), "description": payload.description.strip(),
            "table_name": payload.table_name, "context": payload.context, "audience": _audience(payload.audience),
            # A string, not an object: widget fields differ by type and would fight over one ES mapping.
            "spec_json": json.dumps(spec, ensure_ascii=False), "refinements": payload.refinements,
            "created_by": created_by or user, "created_at": created_at or now, "updated_at": now, "updated_by": user}


@router.get("/saved")
def list_saved_dashboards():
    es = get_es_client()
    if not es.indices.exists(index=DASHBOARDS_INDEX):
        return {"dashboards": []}
    res = es.search(index=DASHBOARDS_INDEX, query={"match_all": {}}, size=100,
                    sort=[{"updated_at": {"order": "desc"}}])
    return {"dashboards": [_summary(h["_source"]) for h in res["hits"]["hits"]]}


@router.post("/saved")
def create_saved_dashboard(payload: SavePayload, user: str = Depends(require_session)):
    es = get_es_client()
    doc = _document(payload, user, uuid.uuid4().hex)
    es.index(index=DASHBOARDS_INDEX, id=doc["id"], document=doc, refresh="wait_for")
    return _full(doc)


@router.get("/saved/{dashboard_id}")
def get_saved_dashboard(dashboard_id: str):
    return _full(_find(get_es_client(), dashboard_id))


@router.put("/saved/{dashboard_id}")
def update_saved_dashboard(dashboard_id: str, payload: SavePayload, user: str = Depends(require_session)):
    es = get_es_client()
    existing = _find(es, dashboard_id)
    doc = _document(payload, user, dashboard_id, existing.get("created_at"), existing.get("created_by"))
    es.index(index=DASHBOARDS_INDEX, id=dashboard_id, document=doc, refresh="wait_for")
    return _full(doc)


@router.delete("/saved/{dashboard_id}")
def delete_saved_dashboard(dashboard_id: str):
    es = get_es_client()
    _find(es, dashboard_id)
    es.delete(index=DASHBOARDS_INDEX, id=dashboard_id, refresh="wait_for")
    return {"status": "deleted", "id": dashboard_id}
