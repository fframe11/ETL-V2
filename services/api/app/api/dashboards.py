"""Create Dashboard tab: list the Quality-Gate-passed datasets, preview one, let the LLM
draft a dashboard spec from the user's request, recompute it for the viewer's filters
and refine it with follow-up instructions."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import dashboard_data, dashboard_llm
from .auth import require_session
from .config import get_es_client
from .dashboard_compute import compute_dashboard
from .dashboard_spec import AUDIENCES, SpecError, validate_spec

router = APIRouter(prefix="/api/v1/dashboards", tags=["dashboards"], dependencies=[Depends(require_session)])

DASHBOARDS_INDEX = "sdoqap_dashboards"


class GeneratePayload(BaseModel):
    table_name: str
    context: str = Field(min_length=3, max_length=2000)
    audience: str = "business"


class RefinePayload(BaseModel):
    table_name: str
    spec: Dict[str, Any]
    instruction: str = Field(min_length=2, max_length=1000)


class RenderPayload(BaseModel):
    table_name: str
    spec: Dict[str, Any]
    selections: Dict[str, Any] = Field(default_factory=dict)


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
    return {"datasets": dashboard_data.list_datasets(_es_or_none())}


@router.get("/datasets/{table_name}/preview")
def preview_dashboard_dataset(table_name: str):
    return dashboard_data.preview_dataset(table_name)


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
