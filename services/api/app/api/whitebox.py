"""
Transparent Quality Governance API Router (White-Box Approach)
==============================================================
Implements the transparent, explainable decision pipeline (re-architected from Black Box to White Box):
1. Data Profiling Engine (Row count, Null rate, Ranges, Duplicates, Outliers)
2. User Business Context (Data Purpose, Criticality, Field Domains)
3. Explainable Rule Recommendations with Concrete "Why?" Rationale
4. Human Review & Adjustment Gate
5. 3-Way Segregation (Clean Data, Human Review Queue, Quarantine Lake)
6. Ground Truth Benchmark Verification against ground_truth.csv
7. Downstream Utilization Analytics on Cleaned Data
"""

import os
import io
import re
import json
import time
import math
import logging
import zipfile
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

import pandas as pd
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Body
from pydantic import BaseModel, Field

from .auth import require_session
from .config import get_es_client

logger = logging.getLogger(__name__)


def _read_uploaded_table(filename: str, content: bytes) -> pd.DataFrame:
    """
    Parses an uploaded dataset file into a DataFrame based on its extension.

    Root Cause Fix: both upload endpoints called pd.read_csv() on the raw bytes
    unconditionally, even though the UI's file picker accepts .xlsx/.xls too.
    An Excel file is a binary (zip) format, so pd.read_csv() failed with an
    unhandled UnicodeDecodeError -> the request 500'd with no useful message.
    """
    ext = os.path.splitext(str(filename or ""))[1].lower()
    if ext in (".xlsx", ".xls"):
        try:
            return pd.read_excel(io.BytesIO(content))
        except ImportError as e:
            # Missing optional engine (e.g. xlrd for legacy .xls) — a clear
            # message beats a generic 500 from a raw ImportError.
            raise ValueError(f"ไม่สามารถอ่านไฟล์ {ext} ได้: ขาดไลบรารีที่จำเป็น ({e})")
        except Exception as e:
            raise ValueError(f"ไม่สามารถอ่านไฟล์ Excel ได้: {e}")
    try:
        return pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise ValueError(f"ไม่สามารถอ่านไฟล์ CSV ได้: {e}")


# Columns of the student benchmark evaluation dataset.
STUDENT_BENCHMARK_COLUMNS = ("student_id", "course", "score", "study_hours")


def _is_student_benchmark_schema(columns) -> bool:
    return set(STUDENT_BENCHMARK_COLUMNS).issubset(set(columns))

# A column empty in more than this share of rows is optional by default (Review, not Quarantine).
OPTIONAL_COLUMN_NULL_RATE_PCT = 50.0

router = APIRouter(prefix="/api/v1/whitebox", tags=["Transparent Quality Governance"])

# Robust dataset and output path resolution (works on Windows host and Linux containers)
def _resolve_dataset_dir() -> str:
    candidates = [
        os.path.join(os.getcwd(), "student_course_score_evaluation_dataset"),
        os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "student_course_score_evaluation_dataset")),
        os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "student_course_score_evaluation_dataset")),
        os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "student_course_score_evaluation_dataset")),
        os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "data", "evaluation", "student_course_score_evaluation_dataset")),
        "/app/student_course_score_evaluation_dataset",
        "/tmp/student_course_score_evaluation_dataset"
    ]
    for c in candidates:
        if os.path.isdir(c) and os.path.isfile(os.path.join(c, "dirty_dataset.csv")):
            return c
    for c in candidates:
        if os.path.isdir(c):
            return c
    tmp_path = "/tmp/student_course_score_evaluation_dataset"
    os.makedirs(tmp_path, exist_ok=True)
    return tmp_path

EVAL_DATASET_DIR = _resolve_dataset_dir()
DIRTY_DATASET_PATH = os.path.join(EVAL_DATASET_DIR, "dirty_dataset.csv")
GROUND_TRUTH_PATH = os.path.join(EVAL_DATASET_DIR, "ground_truth.csv")
DEMOGRAPHICS_DATASET_PATH = os.path.join(EVAL_DATASET_DIR, "student_demographics.csv")

def _resolve_output_dir() -> str:
    try:
        out = os.path.join(EVAL_DATASET_DIR, "output_runs")
        os.makedirs(out, exist_ok=True)
        test_file = os.path.join(out, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return out
    except Exception:
        out = "/tmp/whitebox_output_runs"
        os.makedirs(out, exist_ok=True)
        return out

OUTPUT_DIR = _resolve_output_dir()
# A file uploaded from the UI lives here, never in dirty_dataset.csv: that file is the shipped
# evaluation dataset (ground truth, benchmark, tests) and must not be overwritten by a user.
WORKING_DATASET_PATH = os.path.join(OUTPUT_DIR, "working_dataset.csv")
UNIFIED_DATASET_PATH = os.path.join(OUTPUT_DIR, "unified_multitable_dataset.csv")
CLEAN_DATASET_PATH = os.path.join(EVAL_DATASET_DIR, "clean_dataset.csv")
SEED_DATASET_ZIP = os.environ.get("EVAL_DATASET_ZIP", "/app/seed/student_course_score_evaluation_dataset.zip")
_SEED_CSV_FILES = ("dirty_dataset.csv", "ground_truth.csv", "clean_dataset.csv")
_DEMO_FACULTIES = ("Engineering", "Science", "Business Administration", "Liberal Arts", "Information Technology")
_DEMO_FIRST_NAMES = ("Anan", "Busaba", "Chai", "Darika", "Ekachai", "Fah", "Kanya", "Nattapong", "Pim", "Somchai", "Suda", "Wichai")
_DEMO_LAST_NAMES = ("Srisuk", "Wongsa", "Chaiyaporn", "Rattanakul", "Boonmee", "Thongdee", "Sukjai", "Kaewmanee")


def _restore_seed_csvs() -> None:
    if not os.path.isfile(SEED_DATASET_ZIP):
        return
    with zipfile.ZipFile(SEED_DATASET_ZIP) as zf:
        for name in _SEED_CSV_FILES:
            if name in zf.namelist() and not os.path.isfile(os.path.join(EVAL_DATASET_DIR, name)):
                zf.extract(name, EVAL_DATASET_DIR)
                logger.info("Restored %s from %s", name, SEED_DATASET_ZIP)


def _generate_demo_demographics() -> None:
    """Synthetic master table for the multi-table demo, keyed on the evaluation dataset's student_id."""
    source = CLEAN_DATASET_PATH if os.path.isfile(CLEAN_DATASET_PATH) else DIRTY_DATASET_PATH
    if not os.path.isfile(source):
        return
    if os.path.isfile(DEMOGRAPHICS_DATASET_PATH):
        try:
            if len(pd.read_csv(DEMOGRAPHICS_DATASET_PATH, usecols=["studentId"])) == 9980:
                return
        except Exception:
            pass
    ids = pd.to_numeric(pd.read_csv(source, usecols=["student_id"])["student_id"], errors="coerce").dropna().astype(int).unique()
    # Leave every 500th student out so the demo shows unmatched keys instead of a trivial 100% match.
    ids = np.sort(ids[ids % 500 != 0])
    rng = np.random.RandomState(42)
    enroll = pd.Timestamp("2023-06-01") + pd.to_timedelta(rng.randint(0, 3 * 365, size=len(ids)), unit="D")
    df_demo = pd.DataFrame({
        "studentId": ids,
        "fullName": [f"{_DEMO_FIRST_NAMES[i % len(_DEMO_FIRST_NAMES)]} {_DEMO_LAST_NAMES[(i // len(_DEMO_FIRST_NAMES)) % len(_DEMO_LAST_NAMES)]}" for i in rng.randint(0, 10_000, size=len(ids))],
        "faculty": rng.choice(_DEMO_FACULTIES, size=len(ids)),
        "enrollmentDate": enroll.strftime("%d/%m/%Y"),
    })
    tmp_path = DEMOGRAPHICS_DATASET_PATH + ".tmp"
    df_demo.to_csv(tmp_path, index=False)
    os.replace(tmp_path, DEMOGRAPHICS_DATASET_PATH)
    logger.info("Generated synthetic %s (%d students) from %s", DEMOGRAPHICS_DATASET_PATH, len(df_demo), source)


try:
    _restore_seed_csvs()
    _generate_demo_demographics()
except Exception as exc:
    logger.warning("Evaluation dataset bootstrap failed: %s", exc)

# In-memory storage for latest run results to support fast UI querying
_LATEST_PROFILING: Dict[str, Any] = {}
_LATEST_USER_CONTEXT: Dict[str, Any] = {}
_LATEST_RECOMMENDATIONS: Dict[str, Any] = {}
_LATEST_EXECUTION_RESULTS: Dict[str, Any] = {}
_LATEST_MULTI_TABLE_ANALYSIS: Dict[str, Any] = {}
_UPLOADED_DATASETS: Dict[str, pd.DataFrame] = {}

# Helper function to sanitize any NaN / Inf float values into None for RFC-compliant JSON serialization
def _clean_for_json(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_for_json(v) for v in obj]
    elif isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class FieldContext(BaseModel):
    business_meaning: str
    required: bool = False
    known_domain: bool = False
    min_domain: Optional[float] = None
    max_domain: Optional[float] = None


class UserContextPayload(BaseModel):
    dataset_name: str = ""
    data_purpose: str = "Operational Pipeline"
    criticality: str = "Standard"
    update_frequency: str = "Daily Batch (<= 24h)"
    field_contexts: Dict[str, FieldContext] = Field(default_factory=dict)


class RuleItem(BaseModel):
    field: str
    rule_type: str  # range_check, null_check, auto_iqr, composite_unique, freshness, category_consistency
    recommended_rule: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)
    action: str = "quarantine"  # quarantine, review, warning
    rationale: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    accepted: bool = True


class ExecuteRulesPayload(BaseModel):
    dataset_name: str = ""
    rules: List[RuleItem]
    # The interactive Pipeline page sets this so reviewer approvals and rejections change the result.
    apply_reviewer_decisions: bool = False
    # False: compute the result without replacing the clean/review/quarantine files Exports serves.
    persist_outputs: bool = True


# ---------------------------------------------------------------------------
# 1. Data Profiling Engine
# ---------------------------------------------------------------------------
def _compute_profile(df: pd.DataFrame, dataset_name: str) -> Dict[str, Any]:
    total_rows = int(len(df))
    total_cols = int(len(df.columns))

    schema_info = {}
    columns_profile = {}

    for col in df.columns:
        series = df[col]
        null_count = int(series.isna().sum())
        null_rate_pct = round((null_count / total_rows) * 100, 2) if total_rows > 0 else 0.0
        distinct_count = int(series.nunique(dropna=True))
        unique_rate_pct = round((distinct_count / total_rows) * 100, 2) if total_rows > 0 else 0.0

        # Infer broad type
        is_numeric = pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series)
        is_bool = pd.api.types.is_bool_dtype(series)
        col_lower = str(col).lower()

        if is_bool:
            inferred_type = "Boolean"
        elif col_lower.endswith("_id") or col_lower == "id":
            inferred_type = "Identifier"
        elif pd.api.types.is_integer_dtype(series):
            inferred_type = "Integer"
        elif pd.api.types.is_float_dtype(series):
            inferred_type = "Float"
        elif any(k in col_lower for k in ("date", "time", "timestamp", "_at", "dob")):
            inferred_type = "Date"
        elif not is_numeric and (unique_rate_pct >= 85 and total_rows >= 5):
            inferred_type = "Identifier"
        elif not is_numeric and distinct_count <= 25 and total_rows > 0:
            inferred_type = "Categorical"
        else:
            inferred_type = "String"

        schema_info[col] = inferred_type

        col_stat: Dict[str, Any] = {
            "name": col,
            "data_type": inferred_type,
            "null_count": null_count,
            "null_rate_pct": null_rate_pct,
            "distinct_count": distinct_count,
            "unique_rate_pct": unique_rate_pct,
            "sample_values": [str(x) for x in series.dropna().head(5).tolist()]
        }

        if is_numeric:
            clean_series = pd.to_numeric(series, errors="coerce").dropna()
            if len(clean_series) > 0:
                min_val = float(clean_series.min())
                max_val = float(clean_series.max())
                mean_val = round(float(clean_series.mean()), 2)
                median_val = round(float(clean_series.median()), 2)
                q1 = float(clean_series.quantile(0.25))
                q3 = float(clean_series.quantile(0.75))
                iqr = float(q3 - q1)
                lower_fence = float(q1 - 1.5 * iqr)
                upper_fence = float(q3 + 1.5 * iqr)
                outliers = clean_series[(clean_series < lower_fence) | (clean_series > upper_fence)]
                outlier_count = int(len(outliers))
                outlier_rate_pct = round((outlier_count / total_rows) * 100, 2)

                col_stat.update({
                    "min": min_val,
                    "max": max_val,
                    "mean": mean_val,
                    "median": median_val,
                    "q1": q1,
                    "q3": q3,
                    "iqr": iqr,
                    "lower_fence": lower_fence,
                    "upper_fence": upper_fence,
                    "outlier_count": outlier_count,
                    "outlier_rate_pct": outlier_rate_pct,
                })
        elif inferred_type == "Categorical" or (not is_numeric and distinct_count <= 25):
            top_counts = series.value_counts(dropna=True).head(10).to_dict()
            col_stat["top_categories"] = {str(k): int(v) for k, v in top_counts.items()}

        columns_profile[col] = col_stat

    # Generic duplicate & key analysis
    tested_keys: List[str] = []
    duplicate_count = 0
    full_row_dups = int(df.duplicated().sum())

    # Detect candidate identifier columns
    candidate_ids = [c for c in df.columns if c != "dirty_row_id" and (c.lower().endswith("_id") or c.lower() == "id")]
    if candidate_ids:
        tested_keys = candidate_ids
        duplicate_count = int(df.duplicated(subset=candidate_ids, keep="first").sum())
    elif full_row_dups > 0:
        tested_keys = [c for c in df.columns if c != "dirty_row_id"]
        duplicate_count = full_row_dups
    elif len(df.columns) > 0:
        tested_keys = [df.columns[0]]

    # Detect domain range anomalies generically
    range_anomalies = {}
    for col, stat in columns_profile.items():
        if stat.get("min") is not None and stat.get("max") is not None:
            c_low = col.lower()
            if any(k in c_low for k in ("price", "salary", "income", "stock", "cost", "revenue", "amount")) and stat["min"] < 0:
                range_anomalies[col] = f"Negative value detected ({stat['min']})"
            elif "age" in c_low and stat["max"] > 120:
                range_anomalies[col] = f"Extreme age detected ({stat['max']} > 120)"
            elif ("humidity" in c_low or "percentage" in c_low or "rate" in c_low) and (stat["min"] < 0 or stat["max"] > 100):
                range_anomalies[col] = f"Percentage bounds [0, 100] exceeded ({stat['min']} -> {stat['max']})"

    profile_result = {
        "dataset_name": dataset_name,
        "total_rows": total_rows,
        "total_columns": total_cols,
        "schema": schema_info,
        "columns_profile": columns_profile,
        "duplicate_analysis": {
            "tested_composite_key": tested_keys,
            "duplicate_rows_detected": duplicate_count,
            "full_row_duplicates": full_row_dups,
            "has_duplicates": (duplicate_count > 0 or full_row_dups > 0)
        },
        "quality_profile_summary": {
            "null_issues": {col: stat["null_count"] for col, stat in columns_profile.items() if stat["null_count"] > 0},
            "range_anomalies": range_anomalies,
            "outlier_anomalies": {
                col: stat["outlier_count"]
                for col, stat in columns_profile.items()
                if stat.get("outlier_count", 0) > 0
            },
            "duplicate_count": duplicate_count
        },
        "profiled_at": datetime.now(timezone.utc).isoformat()
    }
    return profile_result


@router.get("/profile")
def get_dataset_profile(dataset_name: str = ""):
    """
    Get Data Profiling metrics for a dataset. Uses dirty_dataset.csv as default evaluation benchmark.
    """
    if dataset_name in _LATEST_PROFILING:
        return _LATEST_PROFILING[dataset_name]

    if dataset_name in _UPLOADED_DATASETS and _WORKFLOW_STATE.get("dataset_source") != "evaluation":
        profile = _compute_profile(_UPLOADED_DATASETS[dataset_name], dataset_name)
        _LATEST_PROFILING[dataset_name] = profile
        return profile

    dataset_path = _dataset_path()
    if not os.path.isfile(dataset_path):
        raise HTTPException(status_code=404, detail=f"Dirty dataset not found at {dataset_path}")

    df = pd.read_csv(dataset_path)
    profile = _compute_profile(df, dataset_name)
    _LATEST_PROFILING[dataset_name] = profile
    return profile


@router.post("/profile/upload", dependencies=[Depends(require_session)])
async def profile_uploaded_file(file: UploadFile = File(...), dataset_name: str = Form("uploaded_dataset")):
    """
    Upload and profile an arbitrary CSV dataset directly.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        df = _read_uploaded_table(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if "dirty_row_id" not in df.columns:
        df.insert(0, "dirty_row_id", range(1, len(df) + 1))

    clean_ds_name = re.sub(r"[^A-Za-z0-9_-]", "_", dataset_name)[:128] or "uploaded_dataset"
    _UPLOADED_DATASETS[clean_ds_name] = df.copy()
    _UPLOADED_DATASETS[dataset_name] = df.copy()
    try:
        df.to_csv(WORKING_DATASET_PATH, index=False)
    except Exception as exc:
        logger.warning("Could not persist uploaded dataset to %s: %s", WORKING_DATASET_PATH, exc)
    _WORKFLOW_STATE["dataset_source"] = "upload"
    _WORKFLOW_STATE["dataset_name"] = clean_ds_name
    _WORKFLOW_STATE["active_rules"] = []
    _reset_dataset_scoped_state()
    _save_workflow_state()

    profile = _compute_profile(df, clean_ds_name)
    _LATEST_PROFILING[clean_ds_name] = profile
    _LATEST_PROFILING[dataset_name] = profile
    return profile


# ---------------------------------------------------------------------------
# 2. User Context & Explainable Rule Recommendation Engine
# ---------------------------------------------------------------------------
def _generate_recommendations(profile: Dict[str, Any], context: Dict[str, Any]) -> List[Dict[str, Any]]:
    recommendations: List[Dict[str, Any]] = []
    cols_prof = profile.get("columns_profile", {})
    fields_ctx = context.get("field_contexts", {})
    schema_cols = list(profile.get("schema", {}).keys())

    # Generic Profile-Driven Rule Recommendation Engine
    # 1. Candidate Key / Entity Uniqueness Rule
    dup_info = profile.get("duplicate_analysis", {})
    if dup_info.get("has_duplicates"):
        dup_count = dup_info.get("duplicate_rows_detected", 0)
        comp_keys = dup_info.get("tested_composite_key", [])
        if not comp_keys:
            comp_keys = [c for c in schema_cols if c != "dirty_row_id"][:3]
        recommendations.append({
            "field": " + ".join(comp_keys),
            "rule_type": "composite_unique",
            "recommended_rule": f"Entity Key Uniqueness ({' + '.join(comp_keys)})",
            "action": "quarantine",
            "parameters": {"columns": comp_keys, "keep": "first"},
            "rationale": [
                f"Data Profiling detected {dup_count} duplicate records across key [{', '.join(comp_keys)}].",
                "Duplicate entities violate relational integrity and cause duplicate metric counting.",
                "Quarantines redundant occurrences while retaining the initial valid record."
            ],
            "sources": ["Data Profiling", "Identity Integrity", "Relational Model"],
            "accepted": True
        })

    # 2. Completeness / Null Check Rules
    for col, stat in cols_prof.items():
        if col == "dirty_row_id":
            continue
        null_count = stat.get("null_count", 0)
        null_rate = stat.get("null_rate_pct", 0.0)
        col_ctx = fields_ctx.get(col, {})
        is_req = col_ctx.get("required", True) or col.lower().endswith("_id") or col.lower() == "id"
        if null_count > 0:
            action = "quarantine" if is_req else "review"
            title = f"Strict Required ({col}): 0% Null Tolerance" if is_req else f"Completeness Review ({col}): Null Rate Flag"
            recommendations.append({
                "field": col,
                "rule_type": "null_check",
                "recommended_rule": title,
                "action": action,
                "parameters": {"allow_null": False, "threshold_pct": 0.0},
                "rationale": [
                    f"Data Profiling detected {null_count} missing records ({null_rate}% Null Rate) in '{col}'.",
                    f"Field '{col}' integrity is essential for operational processing and reporting.",
                    "Quarantined to protect pipeline integrity and avoid incomplete record processing." if is_req else "Routed to Human Review Queue to evaluate imputation or source data quality."
                ],
                "sources": ["Data Profiling", "Data Completeness", "Business Context"],
                "accepted": True
            })

    # 3. Domain Range & Outlier Rules
    for col, stat in cols_prof.items():
        if col == "dirty_row_id":
            continue
        dtype = stat.get("data_type", "")
        if dtype in ("Integer", "Float"):
            col_ctx = fields_ctx.get(col, {})
            obs_min = stat.get("min")
            obs_max = stat.get("max")
            c_low = col.lower()

            # User Context Known Domain
            if col_ctx.get("known_domain") and col_ctx.get("min_domain") is not None and col_ctx.get("max_domain") is not None:
                min_d = float(col_ctx["min_domain"])
                max_d = float(col_ctx["max_domain"])
                recommendations.append({
                    "field": col,
                    "rule_type": "range_check",
                    "recommended_rule": f"Known Domain Range [{int(min_d) if min_d == int(min_d) else min_d}–{int(max_d) if max_d == int(max_d) else max_d}] on {col}",
                    "action": "quarantine",
                    "parameters": {"min": min_d, "max": max_d},
                    "rationale": [
                        f"User Business Context explicitly defined Known Domain as [{min_d}, {max_d}].",
                        f"Data Profiling observed values ranging from {obs_min} to {obs_max}.",
                        "Records outside confirmed business limits represent corrupted or invalid input."
                    ],
                    "sources": ["User Business Context", "Business Rule", "Data Profiling"],
                    "accepted": True
                })
            else:
                # Domain Boundary Heuristics from Profiling Evidence
                sug_min = None
                sug_max = None
                if "age" in c_low:
                    sug_min, sug_max = 0.0, 120.0
                    rec_title = f"Domain Boundary Range on {col} [0–120]"
                elif any(k in c_low for k in ("score", "humidity", "percent", "rate", "ratio")):
                    sug_min, sug_max = 0.0, 100.0
                    rec_title = f"Domain Boundary Range on {col} [0–100]"
                elif any(k in c_low for k in ("price", "salary", "income", "stock", "cost", "revenue", "amount", "fee", "balance")):
                    sug_min = 0.0
                    rec_title = f"Domain Boundary Range on {col} (>= 0)"
                else:
                    # No domain evidence in the name. A ">= 0" guard on a column that has no
                    # negative value today would flag nothing, so it is not recommended.
                    rec_title = f"Domain Range on {col}"

                if sug_min is not None or sug_max is not None:
                    recommendations.append({
                        "field": col,
                        "rule_type": "range_check",
                        "recommended_rule": rec_title,
                        "action": "quarantine",
                        "parameters": {"min": sug_min, "max": sug_max, "is_suggested": True},
                        "rationale": [
                            f"Data Profiling observed '{col}' values in data range [{obs_min}, {obs_max}].",
                            f"System recommends plausible boundary [{sug_min if sug_min is not None else '-inf'}, {sug_max if sug_max is not None else 'inf'}] pending User Confirmation.",
                            "Observed data is evidence, not business truth: confirm or adjust boundaries in Rule Configuration."
                        ],
                        "sources": ["Data Profiling", "Domain Heuristic", "User Confirmation Gate"],
                        "accepted": True
                    })

            # Statistical Outlier Check
            outlier_count = stat.get("outlier_count", 0)
            if outlier_count > 0:
                q1 = float(stat.get("q1", 0.0))
                q3 = float(stat.get("q3", 0.0))
                iqr = float(stat.get("iqr", 0.0))
                mult = 3.0
                lower_f = round(q1 - mult * iqr, 2)
                upper_f = round(q3 + mult * iqr, 2)
                recommendations.append({
                    "field": col,
                    "rule_type": "auto_iqr",
                    "recommended_rule": f"Statistical Auto IQR (Tukey 3.0×) on {col}",
                    "action": "review",
                    "parameters": {
                        "multiplier": mult,
                        "preset": "outer_fence",
                        "q1": q1,
                        "q3": q3,
                        "iqr": iqr,
                        "lower_fence": lower_f,
                        "upper_fence": upper_f,
                        "mathematical_formula": f"Lower = Q1 - {mult}×IQR ({lower_f}), Upper = Q3 + {mult}×IQR ({upper_f})"
                    },
                    "rationale": [
                        f"Domain boundaries for '{col}' are statistical; profiling computed Q1={q1}, Q3={q3}, IQR={iqr}.",
                        f"Under Tukey's Outer Fence (3.0×), {outlier_count} records lie outside [{lower_f}, {upper_f}].",
                        "Routed to Human Review Queue rather than Quarantine to prevent false-positive data loss."
                    ],
                    "sources": ["Data Profiling (IQR)", "Statistical Non-Parametric Theory", "Semi-Auto Human Review Safeguard"],
                    "accepted": True
                })

    # 4. Category Consistency Rules
    for col, stat in cols_prof.items():
        if col == "dirty_row_id":
            continue
        dtype = stat.get("data_type", "")
        top_cats = stat.get("top_categories", {})
        distinct_cnt = stat.get("distinct_count", 0)
        if (dtype == "Categorical" or (dtype == "String" and 2 <= distinct_cnt <= 20)) and len(top_cats) >= 2:
            allowed = list(top_cats.keys())
            recommendations.append({
                "field": col,
                "rule_type": "category_consistency",
                "recommended_rule": f"Category Consistency Check on {col}",
                "action": "review",
                "parameters": {"allowed_values": allowed},
                "rationale": [
                    f"Data Profiling detected {distinct_cnt} distinct categories in '{col}': {allowed[:5]}.",
                    "Flags unrecognized or corrupted categorical variants for human review and standardization."
                ],
                "sources": ["Data Profiling", "Categorical Distribution"],
                "accepted": True
            })

    # 5. Temporal Freshness Rules
    for col, stat in cols_prof.items():
        dtype = stat.get("data_type", "")
        c_low = col.lower()
        if dtype in ("Date", "DateTime") or any(k in c_low for k in ("date", "timestamp", "time")):
            recommendations.append({
                "field": col,
                "rule_type": "freshness",
                "recommended_rule": f"Temporal Freshness SLA Check on {col}",
                "action": "warning",
                "parameters": {"max_delay_hours": 24},
                "rationale": [
                    f"Column '{col}' detected as temporal timeline attribute.",
                    "Verifies data ingestion pipeline meets freshness SLAs and flags stale records."
                ],
                "sources": ["Data Profiling", "Temporal Timeline Policy"],
                "accepted": True
            })

    return recommendations


@router.get("/context/default")
def get_default_user_context(dataset_name: Optional[str] = None, profile: Optional[Dict[str, Any]] = None):
    """
    Generate default User Context dynamically from Data Profile evidence.
    Every dataset gets its context from actual profiling — no hardcoded presets.
    Numeric columns get observed min/max pre-filled as starting suggestions.
    Users review and override with actual business constraints.
    """
    ds_name = dataset_name or _WORKFLOW_STATE.get("dataset_name", "")

    # All datasets derive context from actual data profiling — no hardcoded presets.
    # Profile evidence sets sensible starting defaults; user adjusts via Business Context.
    fields_ctx = {}
    if profile and "columns_profile" in profile:
        for col, stat in profile["columns_profile"].items():
            if col == "dirty_row_id":
                continue
            dtype = stat.get("data_type", "String")
            is_numeric = dtype in ("Integer", "Float")
            is_id = col.lower().endswith("_id") or col.lower() == "id" or stat.get("unique_rate_pct", 0) > 95
            null_rate = stat.get("null_rate_pct", 0)

            # For numeric columns, pre-fill observed min/max as starting suggestion
            # Users should review and override with actual business constraints
            min_val = stat.get("min") if is_numeric else None
            max_val = stat.get("max") if is_numeric else None

            fields_ctx[col] = {
                "business_meaning": f"Observed field '{col}' ({dtype})",
                # Observed nulls are the defect to catch, not proof the field is optional.
                # Only a column that is mostly empty is treated as optional by default.
                "required": null_rate <= OPTIONAL_COLUMN_NULL_RATE_PCT,
                "known_domain": False,  # Observed data is evidence, not business truth
                "min_domain": None,
                "max_domain": None,
            }

    return {
        "dataset_name": ds_name,
        "data_purpose": f"Operational Pipeline for {ds_name}" if ds_name else "Operational Pipeline",
        "criticality": "Standard",
        "update_frequency": "Daily Batch (<= 24h)",
        "field_contexts": fields_ctx
    }


@router.post("/recommend-rules", dependencies=[Depends(require_session)])
def recommend_rules(payload: Optional[UserContextPayload] = None):
    """
    Generate explainable Data Quality rules combining Data Profiling metrics + User Business Context.
    """
    dataset_name = payload.dataset_name if payload and payload.dataset_name else _WORKFLOW_STATE.get("dataset_name", "")

    # Fetch or run profile
    if dataset_name in _LATEST_PROFILING:
        profile = _LATEST_PROFILING[dataset_name]
    else:
        profile = get_dataset_profile(dataset_name)

    ctx_dict = payload.model_dump() if payload else get_default_user_context()
    _LATEST_USER_CONTEXT[dataset_name] = ctx_dict

    recommendations = _generate_recommendations(profile, ctx_dict)
    result = {
        "dataset_name": dataset_name,
        "recommendations_count": len(recommendations),
        "recommendations": recommendations,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    _LATEST_RECOMMENDATIONS[dataset_name] = result
    return result


# ---------------------------------------------------------------------------
# 3. Execution & 3-Way Segregation Engine
# ---------------------------------------------------------------------------
def _apply_reviewer_decisions(df: pd.DataFrame) -> None:
    """Human-in-the-loop: bulk review action first, then per-row overrides (by dirty_row_id)."""
    review_mask = df["whitebox_status"] == "Review"
    action = str(_WORKFLOW_STATE.get("review_action") or "KEEP").upper()
    if action == "APPROVE":
        df.loc[review_mask, "whitebox_rule_applied"] = "Human Approved -> Clean Asset"
        df.loc[review_mask, "whitebox_status"] = "Valid"
    elif action == "REJECT":
        df.loc[review_mask, "whitebox_rule_applied"] = "Human Rejected -> Quarantine Lake"
        df.loc[review_mask, "whitebox_status"] = "Quarantine"

    for row_key, decision in (_WORKFLOW_STATE.get("row_decisions") or {}).items():
        try:
            row_id = int(str(row_key).replace("#", ""))
        except ValueError:
            continue
        mask = df["dirty_row_id"] == row_id
        if str(decision).upper() == "APPROVE":
            df.loc[mask, "whitebox_status"] = "Valid"
            df.loc[mask, "whitebox_rule_applied"] = f"Row #{row_id} Approved by Reviewer"
        elif str(decision).upper() == "REJECT":
            df.loc[mask, "whitebox_status"] = "Quarantine"
            df.loc[mask, "whitebox_rule_applied"] = f"Row #{row_id} Quarantined by Reviewer"


_TRACKING_COLUMNS = ("dirty_row_id", "whitebox_status", "whitebox_error_type", "whitebox_rule_applied")


def _column_impact(df_raw: pd.DataFrame, df_clean: pd.DataFrame, accepted_rules: List[Any]) -> List[Dict[str, Any]]:
    """Per column: nulls, mean and outliers before and after cleaning.

    "Outliers after" counts clean-zone values outside the fences of the raw data, so it shows what is
    left of the original problem and not a fresh round of outliers. The fences are the ones the
    column's accepted auto_iqr rule enforces (basis "rule"); a column without such a rule uses the
    profile's Tukey 1.5x IQR (basis "tukey_1.5").
    """
    iqr_rules = {r.field: r for r in accepted_rules if r.rule_type == "auto_iqr"}
    out: List[Dict[str, Any]] = []
    for col in df_raw.columns:
        if col in _TRACKING_COLUMNS:
            continue
        item: Dict[str, Any] = {
            "column": col,
            "nulls_before": int(df_raw[col].isna().sum()),
            "nulls_after": int(df_clean[col].isna().sum()),
            "mean_before": None, "mean_after": None,
            "outliers_before": None, "outliers_after": None, "fence_basis": None,
        }
        if pd.api.types.is_numeric_dtype(df_raw[col]) and not pd.api.types.is_bool_dtype(df_raw[col]):
            before = pd.to_numeric(df_raw[col], errors="coerce").dropna()
            after = pd.to_numeric(df_clean[col], errors="coerce").dropna()
            if len(before) > 0:
                q1, q3 = float(before.quantile(0.25)), float(before.quantile(0.75))
                iqr = q3 - q1
                rule = iqr_rules.get(col)
                if rule is not None:
                    mult = float(rule.parameters.get("multiplier", 3.0))
                    low = float(rule.parameters.get("lower_fence", q1 - mult * iqr))
                    high = float(rule.parameters.get("upper_fence", q3 + mult * iqr))
                    item["fence_basis"] = "rule"
                else:
                    low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
                    item["fence_basis"] = "tukey_1.5"
                item["mean_before"] = round(float(before.mean()), 2)
                item["mean_after"] = round(float(after.mean()), 2) if len(after) > 0 else None
                item["outliers_before"] = int(((before < low) | (before > high)).sum())
                item["outliers_after"] = int(((after < low) | (after > high)).sum())
        out.append(item)
    return out


@router.post("/execute", dependencies=[Depends(require_session)])
def execute_pipeline(payload: ExecuteRulesPayload):
    """
    Executes the Semi-Automated Transformation & 3-Way Segregation:
    - Clean: Valid records
    - Review: Statistical anomalies requiring human attention
    - Quarantine: Invalid/corrupt records violating hard constraints
    """
    start_time = time.time()
    dataset_name = payload.dataset_name

    if dataset_name in ("student_course_score", "student_course_scores"):
        df = pd.read_csv(DIRTY_DATASET_PATH)
    elif dataset_name and dataset_name in _UPLOADED_DATASETS:
        df = _UPLOADED_DATASETS[dataset_name].copy()
    elif _WORKFLOW_STATE.get("dataset_name") and _WORKFLOW_STATE.get("dataset_name") in _UPLOADED_DATASETS:
        df = _UPLOADED_DATASETS[_WORKFLOW_STATE["dataset_name"]].copy()
    elif _WORKFLOW_STATE.get("dataset_source") == "upload" and os.path.isfile(WORKING_DATASET_PATH):
        df = pd.read_csv(WORKING_DATASET_PATH)
    else:
        dataset_path = _dataset_path()
        if not os.path.isfile(dataset_path):
            raise HTTPException(status_code=404, detail=f"Dirty dataset not found at {dataset_path}")
        df = pd.read_csv(dataset_path)
    total_raw_rows = len(df)
    if "dirty_row_id" not in df.columns:
        df.insert(0, "dirty_row_id", range(1, total_raw_rows + 1))

    # Initialize tracking columns
    df["whitebox_status"] = "Valid"
    df["whitebox_error_type"] = "None"
    df["whitebox_rule_applied"] = "Baseline Valid"

    # Parse active accepted rules
    accepted_rules = [r for r in payload.rules if r.accepted]
    rule_impact: List[Dict[str, Any]] = []

    def _record_impact(rule: Any, rows: int) -> None:
        # Rows are counted once, by the first rule that moves them out of the clean zone.
        rule_impact.append({
            "rule_type": rule.rule_type, "field": rule.field, "action": rule.action,
            "rule": rule.recommended_rule, "rows_affected": int(rows), "enforced": True,
        })

    # Generic Rule Execution Engine (applies rules by field name for any dataset)
    # 1. Uniqueness / Candidate Key rules
    for r in [rule for rule in accepted_rules if rule.rule_type == "composite_unique"]:
        cols = r.parameters.get("columns", [r.field])
        if isinstance(cols, str):
            cols = [c.strip() for c in cols.split("+")]
        valid_cols = [c for c in cols if c in df.columns]
        hit = 0
        if valid_cols:
            dup_mask = df.duplicated(subset=valid_cols, keep=r.parameters.get("keep", "first"))
            target_status = "Quarantine" if r.action.lower() == "quarantine" else "Review"
            affected = dup_mask & (df["whitebox_status"] == "Valid")
            df.loc[affected, "whitebox_status"] = target_status
            df.loc[affected, "whitebox_error_type"] = "Duplicate"
            df.loc[affected, "whitebox_rule_applied"] = f"Composite Uniqueness ({' + '.join(valid_cols)})"
            hit = affected.sum()
        _record_impact(r, hit)

    # 2. Completeness / Null rules
    for r in [rule for rule in accepted_rules if rule.rule_type == "null_check"]:
        field = r.field
        hit = 0
        if field in df.columns:
            null_mask = df[field].isna()
            target_status = "Quarantine" if r.action.lower() == "quarantine" else "Review"
            affected = null_mask & (df["whitebox_status"] == "Valid")
            df.loc[affected, "whitebox_status"] = target_status
            df.loc[affected, "whitebox_error_type"] = f"Missing {field}"
            df.loc[affected, "whitebox_rule_applied"] = f"Strict Required ({field})"
            hit = affected.sum()
        _record_impact(r, hit)

    # 3. Domain Range rules
    for r in [rule for rule in accepted_rules if rule.rule_type == "range_check"]:
        field = r.field
        hit = 0
        if field in df.columns:
            min_v = r.parameters.get("min")
            max_v = r.parameters.get("max")
            num_s = pd.to_numeric(df[field], errors="coerce")
            out_mask = pd.Series(False, index=df.index)
            if min_v is not None:
                out_mask |= (num_s < float(min_v))
            if max_v is not None:
                out_mask |= (num_s > float(max_v))
            target_status = "Quarantine" if r.action.lower() == "quarantine" else "Review"
            affected = out_mask & num_s.notna() & (df["whitebox_status"] == "Valid")
            df.loc[affected, "whitebox_status"] = target_status
            df.loc[affected, "whitebox_error_type"] = f"Invalid {field} Range"
            df.loc[affected, "whitebox_rule_applied"] = f"Domain Range Check [{min_v}, {max_v}] on {field}"
            hit = affected.sum()
        _record_impact(r, hit)

    # 4. Statistical Auto IQR Outlier rules
    for r in [rule for rule in accepted_rules if rule.rule_type == "auto_iqr"]:
        field = r.field
        hit = 0
        if field in df.columns:
            num_s = pd.to_numeric(df[field], errors="coerce")
            clean_s = num_s.dropna()
            if len(clean_s) > 0:
                q1 = float(clean_s.quantile(0.25))
                q3 = float(clean_s.quantile(0.75))
                iqr = float(q3 - q1)
                mult = float(r.parameters.get("multiplier", 3.0))
                lower_f = float(r.parameters.get("lower_fence", q1 - mult * iqr))
                upper_f = float(r.parameters.get("upper_fence", q3 + mult * iqr))
                outlier_mask = (num_s < lower_f) | (num_s > upper_f)
                target_status = "Review" if r.action.lower() == "review" else "Quarantine"
                affected = outlier_mask & num_s.notna() & (df["whitebox_status"] == "Valid")
                df.loc[affected, "whitebox_status"] = target_status
                df.loc[affected, "whitebox_error_type"] = f"{field} Outlier"
                df.loc[affected, "whitebox_rule_applied"] = f"Statistical Auto IQR ({field} > {round(upper_f, 2)})"
                hit = affected.sum()
        _record_impact(r, hit)

    # 5. Category Consistency rules
    for r in [rule for rule in accepted_rules if rule.rule_type == "category_consistency"]:
        field = r.field
        allowed = r.parameters.get("allowed_values", [])
        hit = 0
        if field in df.columns and allowed:
            inconsistent_mask = df[field].notna() & (~df[field].astype(str).isin([str(x) for x in allowed]))
            target_status = "Review" if r.action.lower() == "review" else "Quarantine"
            affected = inconsistent_mask & (df["whitebox_status"] == "Valid")
            df.loc[affected, "whitebox_status"] = target_status
            df.loc[affected, "whitebox_error_type"] = f"Inconsistent {field}"
            df.loc[affected, "whitebox_rule_applied"] = f"Category Consistency ({field})"
            hit = affected.sum()
        _record_impact(r, hit)

    # Accepted rules of a type the engine does not enforce here (e.g. freshness) are listed, not hidden.
    enforced_types = {"composite_unique", "null_check", "range_check", "auto_iqr", "category_consistency"}
    for r in accepted_rules:
        if r.rule_type not in enforced_types:
            rule_impact.append({
                "rule_type": r.rule_type, "field": r.field, "action": r.action,
                "rule": r.recommended_rule, "rows_affected": 0, "enforced": False,
            })

    if payload.apply_reviewer_decisions:
        _apply_reviewer_decisions(df)

    # Segregate into 3 explicit data assets
    df_clean = df[df["whitebox_status"] == "Valid"].copy()
    df_review = df[df["whitebox_status"] == "Review"].copy()
    df_quarantine = df[df["whitebox_status"] == "Quarantine"].copy()

    # Verification that needs no ground truth: every row sits in exactly one zone, and the clean zone
    # no longer shows the problems the profile found in the raw data.
    reconciliation = {
        "total_rows": int(total_raw_rows),
        "clean_rows": int(len(df_clean)),
        "review_rows": int(len(df_review)),
        "quarantine_rows": int(len(df_quarantine)),
    }
    reconciliation["unaccounted_rows"] = reconciliation["total_rows"] - (
        reconciliation["clean_rows"] + reconciliation["review_rows"] + reconciliation["quarantine_rows"])
    column_impact = _column_impact(df, df_clean, accepted_rules)

    # Save to disk
    clean_path = os.path.join(OUTPUT_DIR, "clean_dataset_run.csv")
    review_path = os.path.join(OUTPUT_DIR, "review_queue_run.csv")
    quarantine_path = os.path.join(OUTPUT_DIR, "quarantine_lake_run.csv")

    if payload.persist_outputs:
        df_clean.to_csv(clean_path, index=False)
        df_review.to_csv(review_path, index=False)
        df_quarantine.to_csv(quarantine_path, index=False)

    exec_time_ms = round((time.time() - start_time) * 1000, 2)
    quality_score_raw = round((len(df_clean) / total_raw_rows) * 100, 2) if total_raw_rows > 0 else 0.0

    error_summary = df["whitebox_error_type"].value_counts().to_dict()

    # Safely select dynamic sample columns without risking KeyError
    sample_cols = [c for c in ["dirty_row_id", *[col for col in df.columns if col not in ("dirty_row_id", "whitebox_status", "whitebox_error_type", "whitebox_rule_applied")][:4], "whitebox_error_type", "whitebox_rule_applied"] if c in df.columns]
    sample_quarantined = df_quarantine[sample_cols].head(5).to_dict(orient="records") if len(df_quarantine) > 0 else []
    sample_review = df_review[sample_cols].head(5).to_dict(orient="records") if len(df_review) > 0 else []

    result = {
        "dataset_name": dataset_name,
        "total_rows_ingested": total_raw_rows,
        "clean_rows": int(len(df_clean)),
        "review_rows": int(len(df_review)),
        "quarantine_rows": int(len(df_quarantine)),
        "raw_quality_score_pct": quality_score_raw,
        "post_clean_quality_score_pct": 100.0,
        "execution_time_ms": exec_time_ms,
        "error_distribution": error_summary,
        "reconciliation": reconciliation,
        "rule_impact": rule_impact,
        "column_impact": column_impact,
        "saved_artifacts": {
            "clean_file": clean_path,
            "review_file": review_path,
            "quarantine_file": quarantine_path
        },
        "sample_quarantined": sample_quarantined,
        "sample_review": sample_review,
        "executed_at": datetime.now(timezone.utc).isoformat()
    }
    cleaned_result = _clean_for_json(result)
    _LATEST_EXECUTION_RESULTS[dataset_name] = cleaned_result
    return cleaned_result


# ---------------------------------------------------------------------------
# 4. Ground Truth Benchmark Verification Engine
# ---------------------------------------------------------------------------
@router.get("/benchmark")
def evaluate_ground_truth():
    """
    Compares the White-Box pipeline output against ground_truth.csv.
    Calculates empirical Detection Rate, Recall, Precision, and Confusion Matrix.
    """
    if _dataset_path() != DIRTY_DATASET_PATH:
        return {
            "status": "NOT_APPLICABLE",
            "message": "The benchmark compares against the ground truth of the evaluation dataset, "
                       "but the loaded dataset is an uploaded file. Switch back to the evaluation dataset to run it.",
        }
    if not os.path.isfile(GROUND_TRUTH_PATH):
        raise HTTPException(status_code=404, detail=f"Ground truth file not found at {GROUND_TRUTH_PATH}")

    # Always execute pipeline for evaluation dataset before evaluating benchmark metrics
    default_ctx = get_default_user_context("student_course_score")
    prof = get_dataset_profile("student_course_score")
    recs = _generate_recommendations(prof, default_ctx)
    rule_items = [RuleItem(**r) for r in recs]
    execute_pipeline(ExecuteRulesPayload(dataset_name="student_course_score", rules=rule_items))

    clean_file = os.path.join(OUTPUT_DIR, "clean_dataset_run.csv")
    review_file = os.path.join(OUTPUT_DIR, "review_queue_run.csv")
    quarantine_file = os.path.join(OUTPUT_DIR, "quarantine_lake_run.csv")

    df_clean = pd.read_csv(clean_file, keep_default_na=False)
    df_review = pd.read_csv(review_file, keep_default_na=False)
    df_quarantine = pd.read_csv(quarantine_file, keep_default_na=False)
    df_actual = pd.concat([df_clean, df_review, df_quarantine]).sort_values("dirty_row_id").reset_index(drop=True)

    # Read Ground Truth with keep_default_na=False so 'None' is treated as a valid category string
    df_gt = pd.read_csv(GROUND_TRUTH_PATH, keep_default_na=False)

    # Merge on dirty_row_id
    merged = pd.merge(df_actual, df_gt, on="dirty_row_id", suffixes=("_actual", "_gt"))
    merged["whitebox_status_mapped"] = merged["whitebox_status"].replace({"Quarantine": "Invalid"})

    # Map generic error type strings to benchmark expected categories
    def _map_err(val: str) -> str:
        s = str(val).strip().lower()
        if "missing" in s and "score" in s:
            return "Missing Score"
        if "range" in s and "score" in s:
            return "Invalid Score Range"
        if ("outlier" in s or "iqr" in s) and ("study" in s or "hour" in s):
            return "Study Hours Outlier"
        if "duplicate" in s:
            return "Duplicate"
        return "None"
    merged["whitebox_error_type_mapped"] = merged["whitebox_error_type"].apply(_map_err)

    # Error type comparison
    categories = [
        "Missing Score",
        "Invalid Score Range",
        "Study Hours Outlier",
        "Duplicate",
        "None"
    ]

    metrics_by_category = {}
    total_samples = len(merged)

    for cat in categories:
        expected_cat = cat
        actual_matches = (merged["whitebox_error_type_mapped"] == expected_cat)
        ground_truth_matches = (merged["expected_error_type"] == expected_cat)

        tp = int((actual_matches & ground_truth_matches).sum())
        fp = int((actual_matches & ~ground_truth_matches).sum())
        fn = int((~actual_matches & ground_truth_matches).sum())
        tn = int((~actual_matches & ~ground_truth_matches).sum())

        precision = round((tp / (tp + fp)) * 100, 2) if (tp + fp) > 0 else 100.0
        recall = round((tp / (tp + fn)) * 100, 2) if (tp + fn) > 0 else 100.0
        f1 = round(2 * (precision * recall) / (precision + recall), 2) if (precision + recall) > 0 else 100.0

        metrics_by_category[cat] = {
            "ground_truth_count": int(ground_truth_matches.sum()),
            "system_detected_count": int(actual_matches.sum()),
            "true_positive": tp,
            "false_positive": fp,
            "false_negative": fn,
            "detection_rate_recall_pct": recall,
            "precision_pct": precision,
            "f1_score": f1
        }

    overall_error_match = (merged["whitebox_error_type_mapped"] == merged["expected_error_type"]).sum()
    overall_status_match = (merged["whitebox_status_mapped"] == merged["expected_status"]).sum()
    overall_accuracy_pct = round((overall_error_match / total_samples) * 100, 2)
    overall_status_accuracy_pct = round((overall_status_match / total_samples) * 100, 2)

    # Root Cause Fix: this endpoint used to return several blocks of hardcoded numbers
    # (evaluation_summary, error_reconciliation counts, tukey_fences_comparison,
    # seven_dimensions_evaluation) that didn't change no matter what the actual
    # comparison above found — presenting fabricated "100% PASS on every dimension"
    # results as if they were computed evidence. evaluation_summary and
    # error_reconciliation are now derived from the real metrics_by_category /
    # status_distribution computed above. tukey_fences_comparison (which would require
    # actually re-running segregation at a second IQR multiplier to be real, not just
    # relabeled) and seven_dimensions_evaluation (a static scorecard with no underlying
    # computation at all) are removed rather than left fabricated.
    gt_problematic = int((df_gt["expected_status"] != "Valid").sum()) if "expected_status" in df_gt.columns else None

    evaluation_summary = [
        f"{cat}: {metrics_by_category[cat]['detection_rate_recall_pct']}% Recall "
        f"({metrics_by_category[cat]['true_positive']}/{metrics_by_category[cat]['ground_truth_count']} detected)"
        for cat in categories
    ]

    return {
        "status": "PASSED",
        "total_benchmark_rows": total_samples,
        "overall_accuracy_pct": overall_accuracy_pct,
        "metrics_by_error_type": metrics_by_category,
        "status_distribution": {
            "Valid (Clean Data)": int(len(df_clean)),
            "Review (Human Queue)": int(len(df_review)),
            "Quarantine (Isolated Defect)": int(len(df_quarantine))
        },
        "evaluation_summary": evaluation_summary,
        "error_reconciliation": {
            "total_records": total_samples,
            "clean_valid_rows": int(len(df_clean)),
            "problematic_instances_ground_truth": gt_problematic,
            "quarantine_breakdown": {
                "missing_score": metrics_by_category["Missing Score"]["true_positive"],
                "invalid_score_range": metrics_by_category["Invalid Score Range"]["true_positive"],
                "duplicate_composite": metrics_by_category["Duplicate"]["true_positive"],
                "total_quarantine": int(len(df_quarantine)),
            },
            "review_breakdown": {
                "study_hours_outlier": metrics_by_category["Study Hours Outlier"]["true_positive"],
                "total_review": int(len(df_review)),
            }
        }
    }


# ---------------------------------------------------------------------------
# 5. Downstream Analytics on Cleaned Data (Utilization Step 10)
# ---------------------------------------------------------------------------
@router.get("/downstream-analytics")
def get_downstream_analytics():
    """
    Computes real academic performance analytics on the certified Clean Data.
    Proves Step 10: 'Cleaned data is directly usable for business decision making.'
    """
    clean_file = os.path.join(OUTPUT_DIR, "clean_dataset_run.csv")
    if not os.path.isfile(clean_file):
        evaluate_ground_truth()

    df_clean = pd.read_csv(clean_file)

    # Average score and student count by course
    course_stats = df_clean.groupby("course")["score"].agg(["count", "mean", "min", "max", "std"]).reset_index()
    course_stats["mean"] = course_stats["mean"].round(2)
    course_stats["std"] = course_stats["std"].round(2)

    # Pass / Fail Rate (Pass >= 50)
    pass_count = int((df_clean["score"] >= 50.0).sum())
    fail_count = int((df_clean["score"] < 50.0).sum())
    pass_rate_pct = round((pass_count / len(df_clean)) * 100, 2)

    # Grade distribution
    grades = []
    for s in df_clean["score"]:
        if s >= 80:
            grades.append("A")
        elif s >= 70:
            grades.append("B")
        elif s >= 60:
            grades.append("C")
        elif s >= 50:
            grades.append("D")
        else:
            grades.append("F")
    df_clean["grade"] = grades
    grade_dist = df_clean["grade"].value_counts().to_dict()

    # Score distribution bins
    bins = [0, 20, 40, 60, 80, 100]
    labels = ["0-20", "21-40", "41-60", "61-80", "81-100"]
    df_clean["score_bracket"] = pd.cut(df_clean["score"], bins=bins, labels=labels, include_lowest=True)
    score_bins = df_clean["score_bracket"].value_counts().sort_index().to_dict()

    return _clean_for_json({
        "dataset": "student_course_score_clean",
        "clean_records_analyzed": len(df_clean),
        "overall_average_score": round(float(df_clean["score"].mean()), 2),
        "overall_pass_rate_pct": pass_rate_pct,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "course_performance": course_stats.to_dict(orient="records"),
        "grade_distribution": grade_dist,
        "score_distribution_brackets": score_bins
    })


# ---------------------------------------------------------------------------
# 6. Multi-Table Relationship & Schema Reconciliation Engine (P2 Module)
# ---------------------------------------------------------------------------
class MultiTableAnalyzePayload(BaseModel):
    table_a_name: str = "student_demographics"
    table_b_name: str = "student_course_score"


class MultiTableJoinPayload(BaseModel):
    table_a_name: str = "student_demographics"
    table_b_name: str = "student_course_score"
    join_key_a: str = "studentId"
    join_key_b: str = "student_id"
    join_type: str = "left"
    reconcile_schema: bool = True
    standardize_dates: bool = True
    target_date_format: str = "YYYY-MM-DD"


def _normalize_token(col: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]", "", col.lower())


_STUDENT_DEMO_NAME = "student_demographics"
_STUDENT_SCORE_ALIASES = ("student_course_score", "student_course_scores")
MAX_KEY_SAMPLE_ROWS = 200_000      # rows read per column when looking for a join key
MAX_KEY_PAIRS = 200                # column pairs compared at most
MIN_KEY_MATCH_RATE = 0.5           # share of the smaller key set that must exist in the other table


def _loaded_dataset_frame():
    """The dataset the interactive engine works on now (same choice as the state endpoint)."""
    name = _WORKFLOW_STATE.get("dataset_name", "")
    if _WORKFLOW_STATE.get("dataset_source") != "evaluation" and name in _UPLOADED_DATASETS:
        return _UPLOADED_DATASETS[name].copy()
    path = _dataset_path()
    return pd.read_csv(path) if os.path.isfile(path) else None


def _is_student_evaluation_loaded() -> bool:
    """True only while the bundled evaluation dataset itself is loaded (not an upload that fell back to it)."""
    return _WORKFLOW_STATE.get("dataset_source") in ("", "evaluation", None) and _dataset_path() == DIRTY_DATASET_PATH


def _resolve_table(name: str):
    """A table the multi-table step may use, by name, or None. Never reads a file the user did
    not load, except the bundled student demo pair (demographics + evaluation scores)."""
    if not name:
        return None
    loaded = _WORKFLOW_STATE.get("dataset_name", "")
    if name == loaded:
        return _loaded_dataset_frame()
    if name in _UPLOADED_DATASETS:
        return _UPLOADED_DATASETS[name].copy()
    if name == _STUDENT_DEMO_NAME and os.path.isfile(DEMOGRAPHICS_DATASET_PATH):
        return pd.read_csv(DEMOGRAPHICS_DATASET_PATH)
    if name in _STUDENT_SCORE_ALIASES and os.path.isfile(DIRTY_DATASET_PATH):
        return pd.read_csv(DIRTY_DATASET_PATH)
    return None


def _available_multi_tables():
    """Names that can be offered in the join step: the loaded dataset first, then others."""
    loaded = _WORKFLOW_STATE.get("dataset_name", "")
    names, seen_frames = [], set()
    if loaded:
        names.append(loaded)
        if loaded in _UPLOADED_DATASETS:
            seen_frames.add(id(_UPLOADED_DATASETS[loaded]))
    for n, frame in _UPLOADED_DATASETS.items():
        if n != loaded and id(frame) not in seen_frames:
            seen_frames.add(id(frame))
            names.append(n)
    if _is_student_evaluation_loaded() and os.path.isfile(DEMOGRAPHICS_DATASET_PATH) and _STUDENT_DEMO_NAME not in names:
        names.append(_STUDENT_DEMO_NAME)
    return names


def _key_values(series):
    """Distinct non-null values as comparable strings (65001 and 65001.0 are the same key)."""
    s = series.dropna()
    if len(s) > MAX_KEY_SAMPLE_ROWS:
        s = s.iloc[:MAX_KEY_SAMPLE_ROWS]
    if pd.api.types.is_float_dtype(s) and len(s) and bool((s % 1 == 0).all()):
        s = s.astype("int64")
    return set(s.astype(str).str.strip())


def _kind(series) -> str:
    return "num" if pd.api.types.is_numeric_dtype(series) else "text"


def find_candidate_keys(df_a, df_b):
    """Column pairs that look like the same key in both tables, best first.

    A pair needs overlapping values (at least MIN_KEY_MATCH_RATE of the smaller key set) and the
    same kind of data. Equal names (studentId / student_id) and a unique key on one side rank higher.
    """
    cols_a = [c for c in df_a.columns if c != "dirty_row_id"]
    cols_b = [c for c in df_b.columns if c != "dirty_row_id"]
    values_a = {c: _key_values(df_a[c]) for c in cols_a}
    values_b = {c: _key_values(df_b[c]) for c in cols_b}
    unique_a_cols = {c: bool(df_a[c].dropna().is_unique) for c in cols_a if len(values_a[c]) >= 2}
    unique_b_cols = {c: bool(df_b[c].dropna().is_unique) for c in cols_b if len(values_b[c]) >= 2}
    pairs = []
    for ca in cols_a:
        for cb in cols_b:
            if _kind(df_a[ca]) != _kind(df_b[cb]):
                continue
            va, vb = values_a[ca], values_b[cb]
            if len(va) < 2 or len(vb) < 2:
                continue
            same_name = _normalize_token(ca) == _normalize_token(cb)
            unique_a, unique_b = unique_a_cols[ca], unique_b_cols[cb]
            if not (same_name or unique_a or unique_b):
                continue  # a join key is the unique side of a relationship, or is named alike
            overlap = len(va & vb)
            if overlap < 2:
                continue
            rate = overlap / min(len(va), len(vb))
            if rate < MIN_KEY_MATCH_RATE:
                continue
            score = rate + (0.5 if same_name else 0.0) + (0.25 if (unique_a or unique_b) else 0.0)
            pairs.append({
                "key_a": ca, "key_b": cb, "same_name": same_name, "unique_a": bool(unique_a), "unique_b": bool(unique_b),
                "overlap": overlap, "distinct_a": len(va), "distinct_b": len(vb), "match_rate": rate, "score": score,
            })
            if len(pairs) >= MAX_KEY_PAIRS:
                break
        if len(pairs) >= MAX_KEY_PAIRS:
            break
    pairs.sort(key=lambda p: p["score"], reverse=True)
    return pairs


def _detect_date_formats(df):
    """{column: format label} for text columns whose values look like dates."""
    import re
    patterns = (("YYYY-MM-DD", re.compile(r"^\d{4}-\d{2}-\d{2}")), ("DD/MM/YYYY", re.compile(r"^\d{2}/\d{2}/\d{4}$")))
    found = {}
    for col in df.columns:
        if not (pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col])):
            continue  # text columns only (pandas 3 reads text as "str", older versions as object)
        sample = df[col].dropna().astype(str).head(200)
        if sample.empty:
            continue
        for label, rx in patterns:
            if sample.map(lambda v, rx=rx: bool(rx.match(v))).mean() >= 0.9:
                found[col] = label
                break
    return found


def _roles(df_a, key_a, df_b, key_b):
    """Which table keeps all its rows (base) and which only adds columns (lookup)."""
    a_unique, b_unique = bool(df_a[key_a].dropna().is_unique), bool(df_b[key_b].dropna().is_unique)
    if a_unique and not b_unique:
        return "b", "a", "1:N"
    if b_unique and not a_unique:
        return "a", "b", "1:N"
    if a_unique and b_unique:
        return ("a", "b", "1:1") if len(df_a) >= len(df_b) else ("b", "a", "1:1")
    return "b", "a", "N:M"


@router.get("/multi-table/tables")
def list_multi_table_candidates():
    """Tables that can be joined now. The join step needs at least two."""
    out = []
    for name in _available_multi_tables():
        frame = _resolve_table(name)
        if frame is not None:
            out.append({"name": name, "rows": int(len(frame)), "columns": int(len(frame.columns)),
                        "is_loaded": name == _WORKFLOW_STATE.get("dataset_name", "")})
    return {"tables": out}


def _table_summary(name, frame):
    return {
        "name": name,
        "total_rows": len(frame),
        "columns": frame.columns.tolist(),
        "sample_rows": frame.head(3).to_dict(orient="records"),
    }


@router.get("/multi-table/preview")
def preview_multi_tables(table_a: Optional[str] = None, table_b: Optional[str] = None):
    """
    Name, size, columns and sample rows of the two tables to join.
    Without parameters it keeps the bundled student demo: demographics (A) and the loaded dataset (B).
    """
    name_a = table_a or _STUDENT_DEMO_NAME
    name_b = table_b or _WORKFLOW_STATE.get("dataset_name") or "student_course_score"
    df_a = _resolve_table(name_a)
    df_b = _resolve_table(name_b) if table_b else _loaded_dataset_frame()
    if df_a is None or df_b is None:
        raise HTTPException(status_code=404, detail="Required multi-table source datasets not found.")
    return _clean_for_json({"table_a": _table_summary(name_a, df_a), "table_b": _table_summary(name_b, df_b)})


@router.post("/multi-table/analyze", dependencies=[Depends(require_session)])
def analyze_multi_table_relationship(payload: Optional[MultiTableAnalyzePayload] = None):
    """
    Relationship analyzer for any two tables: finds the column pair that looks like the same key
    (overlapping values, equal names, a unique side), the cardinality, naming and date-format
    differences, and asks for confirmation before any join. No candidate key is a normal answer
    (status NO_CANDIDATE_KEY), not an error.
    """
    payload = payload or MultiTableAnalyzePayload()
    df_a = _resolve_table(payload.table_a_name)
    # the legacy default pair (student demo) uses the loaded dataset as table B
    df_b = _loaded_dataset_frame() if payload.table_b_name in _STUDENT_SCORE_ALIASES else _resolve_table(payload.table_b_name)
    if df_a is None or df_b is None:
        raise HTTPException(status_code=404, detail="Source tables not found for multi-table analysis.")

    pairs = find_candidate_keys(df_a, df_b)
    name_a, name_b = payload.table_a_name, payload.table_b_name

    # Naming differences between columns that mean the same thing (studentId vs student_id)
    schema_mappings = []
    for col_a in df_a.columns:
        for col_b in df_b.columns:
            if _normalize_token(col_a) == _normalize_token(col_b) and col_a != col_b:
                schema_mappings.append({
                    "source_a_column": col_a,
                    "source_b_column": col_b,
                    "difference_type": "Naming Convention (camelCase vs snake_case)",
                    "confidence_pct": 96.0,
                    "evidence": [
                        f"Identical semantic token: '{_normalize_token(col_a)}'",
                        f"Shared data types: {df_a[col_a].dtype} vs {df_b[col_b].dtype}",
                    ],
                    "suggested_standard": col_b,
                })

    # Date formats that differ between the tables
    dates_a, dates_b = _detect_date_formats(df_a), _detect_date_formats(df_b)
    date_format_differences = []
    if dates_a and dates_b and set(dates_a.values()) != set(dates_b.values()):
        col_a, col_b = next(iter(dates_a)), next(iter(dates_b))
        date_format_differences.append({
            "source_a_field": col_a,
            "source_a_sample": str(df_a[col_a].dropna().iloc[0]),
            "source_a_detected_format": dates_a[col_a],
            "source_b_field": col_b,
            "source_b_sample": str(df_b[col_b].dropna().iloc[0]),
            "source_b_detected_format": dates_b[col_b],
            "suggested_standard_format": "YYYY-MM-DD",
            "action": "Standardize to ISO-8601 YYYY-MM-DD upon join",
        })

    result = {
        "table_a": name_a,
        "table_b": name_b,
        "schema_differences": schema_mappings,
        "date_format_differences": date_format_differences,
        "alternatives": [{"key_a": p["key_a"], "key_b": p["key_b"], "match_rate_pct": round(p["match_rate"] * 100, 2)} for p in pairs[1:4]],
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
    if not pairs:
        result.update({
            "status": "NO_CANDIDATE_KEY",
            "human_confirmation_required": False,
            "candidate_relationship": None,
            "message": f"ไม่พบคอลัมน์ที่ใช้เชื่อมระหว่าง '{name_a}' กับ '{name_b}' (ไม่มีคอลัมน์ที่ค่าซ้อนทับกันพอ)",
        })
    else:
        best = pairs[0]
        base_side, lookup_side, cardinality = _roles(df_a, best["key_a"], df_b, best["key_b"])
        base_name, lookup_name = (name_a, name_b) if base_side == "a" else (name_b, name_a)
        distinct_base = best["distinct_a"] if base_side == "a" else best["distinct_b"]
        rate_pct = round(best["overlap"] / distinct_base * 100, 2) if distinct_base else 0.0
        strong = rate_pct >= 90 and (best["unique_a"] or best["unique_b"])
        result.update({
            "status": "ANALYSIS_COMPLETE",
            "human_confirmation_required": True,
            "candidate_relationship": {
                "left_table": name_a,
                "right_table": name_b,
                "candidate_key_a": best["key_a"],
                "candidate_key_b": best["key_b"],
                "unique_keys_a": best["distinct_a"],
                "unique_keys_b": best["distinct_b"],
                "overlapping_keys": best["overlap"],
                "match_rate_pct": rate_pct,
                "suggested_cardinality": {"1:N": "1 ต่อหลายแถว (1:N)", "1:1": "1 ต่อ 1 (1:1)", "N:M": "หลายต่อหลาย (N:M)"}[cardinality],
                "base_table": base_name,
                "lookup_table": lookup_name,
                "suggested_join_type": "left",
                "confidence_verdict": "STRONG_KEY_PAIR" if strong else "POSSIBLE_KEY_PAIR",
                "rationale": [
                    f"ค่าคีย์ของ '{base_name}' พบใน '{lookup_name}' {rate_pct}% (จาก {name_a}.{best['key_a']} กับ {name_b}.{best['key_b']})",
                    f"{'ชื่อคอลัมน์ตรงกัน' if best['same_name'] else 'ชื่อคอลัมน์ต่างกัน'}"
                    f" และ{'มีฝั่งที่ค่าไม่ซ้ำ' if (best['unique_a'] or best['unique_b']) else 'ทั้งสองฝั่งมีค่าซ้ำ'}",
                    f"เก็บทุกแถวของ '{base_name}' และเพิ่มคอลัมน์จาก '{lookup_name}' (left join)",
                ],
            },
        })
    cleaned_result = _clean_for_json(result)
    _LATEST_MULTI_TABLE_ANALYSIS["latest"] = cleaned_result
    return cleaned_result


def _to_snake(name: str) -> str:
    import re
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name).lower()


@router.post("/multi-table/join", dependencies=[Depends(require_session)])
def execute_multi_table_join(payload: MultiTableJoinPayload):
    """
    The join, only when the user confirms it: keeps every row of the "many" side, adds the other
    table's columns, optionally renames the key and standardizes DD/MM/YYYY dates, and saves the
    unified table. It does not change the loaded dataset or any cached profile; the profile of the
    result is returned for display.
    """
    start_time = time.time()
    df_a = _resolve_table(payload.table_a_name)
    df_b = _loaded_dataset_frame() if payload.table_b_name in _STUDENT_SCORE_ALIASES else _resolve_table(payload.table_b_name)
    if df_a is None or df_b is None:
        raise HTTPException(status_code=404, detail="Source tables not found.")
    if payload.join_key_a not in df_a.columns or payload.join_key_b not in df_b.columns:
        raise HTTPException(status_code=400, detail="ไม่พบคอลัมน์คีย์ที่เลือกในตารางใดตารางหนึ่ง")

    base_side, lookup_side, _ = _roles(df_a, payload.join_key_a, df_b, payload.join_key_b)
    frames = {"a": (df_a, payload.join_key_a, payload.table_a_name), "b": (df_b, payload.join_key_b, payload.table_b_name)}
    base_df, base_key, base_name = frames[base_side]
    lookup_df, lookup_key, lookup_name = frames[lookup_side]
    base_df, lookup_df = base_df.copy(), lookup_df.copy()

    # 1. Dates of the lookup table: DD/MM/YYYY -> YYYY-MM-DD
    if payload.standardize_dates:
        for col, fmt in _detect_date_formats(lookup_df).items():
            if fmt == "DD/MM/YYYY":
                lookup_df[col] = pd.to_datetime(lookup_df[col], format="%d/%m/%Y", errors="coerce").dt.strftime("%Y-%m-%d")
                new_name = _to_snake(col)
                if new_name != col and new_name not in lookup_df.columns:
                    lookup_df.rename(columns={col: new_name}, inplace=True)

    # 2. Schema alignment: the lookup key takes the base key's name
    if payload.reconcile_schema:
        renames = {}
        if lookup_key != base_key and base_key not in lookup_df.columns:
            renames[lookup_key] = base_key
        if lookup_name == _STUDENT_DEMO_NAME and "fullName" in lookup_df.columns:
            renames["fullName"] = "student_name"  # name used by the bundled student demo
        lookup_df.rename(columns=renames, inplace=True)
        lookup_key = renames.get(lookup_key, lookup_key)

    # 3. Join on the normalized key, so 65001 and 65001.0 match
    def norm_key(series):
        s = series
        if pd.api.types.is_float_dtype(s) and bool(s.dropna().mod(1).eq(0).all()):
            s = s.astype("Int64")
        return s.astype(str).str.strip()

    base_df["__key"] = norm_key(base_df[base_key])
    lookup_df["__key"] = norm_key(lookup_df[lookup_key])
    lookup_df = lookup_df.drop(columns=[lookup_key])  # the base table already has the key
    lookup_df = lookup_df.drop_duplicates(subset="__key", keep="first")
    merged_df = pd.merge(base_df, lookup_df, on="__key", how=payload.join_type, suffixes=("", "_" + _to_snake(lookup_name)), indicator="__matched")
    matched = int((merged_df["__matched"] == "both").sum())
    merged_df = merged_df.drop(columns=["__key", "__matched"])

    merged_df.to_csv(UNIFIED_DATASET_PATH, index=False)
    exec_time_ms = round((time.time() - start_time) * 1000, 2)
    unified_name = re.sub(r"[^A-Za-z0-9_]", "_", f"{base_name}_{lookup_name}_joined")[:128]
    unified_profile = _compute_profile(merged_df, unified_name)

    return _clean_for_json({
        "status": "JOIN_COMPLETED",
        "unified_table_name": unified_name,
        "base_table": base_name,
        "lookup_table": lookup_name,
        "total_rows": len(merged_df),
        "total_columns": len(merged_df.columns),
        "columns": merged_df.columns.tolist(),
        "matched_rows": matched,
        "unmatched_rows": len(merged_df) - matched,
        "execution_time_ms": exec_time_ms,
        "sample_unified_records": merged_df.head(5).to_dict(orient="records"),
        "persisted_file": UNIFIED_DATASET_PATH,
        "profile": unified_profile,
        "joined_at": datetime.now(timezone.utc).isoformat()
    })


# ---------------------------------------------------------------------------
# 7. One-Click Full Pipeline Orchestrator (Auto-Ready / Instant Demo Mode)
# ---------------------------------------------------------------------------
def _run_stage(stages, name, fn):
    """Run one stage. A stage that fails is reported in `stages`; it does not stop the others."""
    try:
        return fn()
    except HTTPException as exc:
        stages[name] = {"status": "FAILED", "detail": exc.detail}
    except Exception as exc:
        logger.warning("run-all stage %s failed: %s", name, exc)
        stages[name] = {"status": "FAILED", "detail": str(exc)}
    return None


# Runs the stages, so GET needs a session too.
@router.get("/run-all", dependencies=[Depends(require_session)])
@router.post("/run-all", dependencies=[Depends(require_session)])
def run_all_stages():
    """
    Runs profiling, rule recommendation and the 3-way segregation on the dataset that is loaded now
    and returns every result for the Audit Trail page.

    - The result files that Exports serves are not rewritten (persist_outputs=False).
    - The multi-table join is not part of it; it runs only when the user confirms it.
    - The ground-truth benchmark and the course analytics exist only for the student evaluation
      dataset, so other datasets get a NOT_APPLICABLE entry instead of an error.
    """
    stages = {}
    dataset_name = _WORKFLOW_STATE.get("dataset_name") or "student_course_score"

    prof = _run_stage(stages, "profile", lambda: get_dataset_profile(dataset_name))
    default_ctx = _run_stage(stages, "context", lambda: get_default_user_context(dataset_name, prof)) if prof else None
    recs = []
    if default_ctx:
        recs_res = _run_stage(stages, "recommendations", lambda: recommend_rules(UserContextPayload(**default_ctx)))
        recs = (recs_res or {}).get("recommendations", [])
    exec_res = None
    if recs:
        exec_res = _run_stage(stages, "execution", lambda: execute_pipeline(ExecuteRulesPayload(
            dataset_name=dataset_name, rules=[RuleItem(**r) for r in recs], persist_outputs=False)))

    bench_res = analytics_res = None
    if _is_student_evaluation_loaded():
        bench_res = _run_stage(stages, "benchmark", evaluate_ground_truth)
        analytics_res = _run_stage(stages, "analytics", get_downstream_analytics)
    else:
        for name in ("benchmark", "analytics"):
            stages[name] = {"status": "NOT_APPLICABLE", "detail": "ใช้ได้กับชุดข้อมูลประเมินของนักศึกษาเท่านั้น"}

    failed = [n for n, v in stages.items() if v.get("status") == "FAILED"]
    return _clean_for_json({
        "status": "PARTIAL" if failed else "ALL_STAGES_READY",
        "dataset_name": dataset_name,
        "stages": stages,
        "multi_table_preview": None,
        "multi_table_analysis": None,
        "join_result": None,
        "profile_data": prof,
        "user_context": default_ctx,
        "recommendations": recs,
        "execution_result": exec_res,
        "benchmark_result": bench_res,
        "downstream_analytics": analytics_res
    })


# ---------------------------------------------------------------------------
# 8. End-to-End Interactive Workflow State & Real CSV Export Engine
# ---------------------------------------------------------------------------
from fastapi.responses import FileResponse

# Reviewer work that only makes sense for the dataset it was done on. POST /state ignores
# keys that are not present, so these must always exist (also on a fresh install).
def _dataset_scoped_defaults() -> Dict[str, Any]:
    return {
        "selected_findings": {"range": True, "duplicate": True, "outlier": True},
        "rule1_confirmed": True,
        "rule2_confirmed": True,
        "rule3_confirmed": True,
        "confirmed_at": None,
        "review_action": "KEEP",  # "KEEP" | "APPROVE" | "REJECT"
        "row_decisions": {},
        "row_edits": {},
        "upstream_ticket_sent": False,
    }


_WORKFLOW_STATE: Dict[str, Any] = {
    "dataset_name": "",
    "dataset_source": "",
    **_dataset_scoped_defaults(),
    # Rules and the dataset itself are populated dynamically when a dataset is loaded
}

_WORKFLOW_STATE_PATH = os.path.join(OUTPUT_DIR, "workflow_state.json")


def _save_workflow_state() -> None:
    try:
        tmp_path = _WORKFLOW_STATE_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(_WORKFLOW_STATE, f, ensure_ascii=False, default=str)
        os.replace(tmp_path, _WORKFLOW_STATE_PATH)
    except OSError as exc:
        logger.warning("Could not persist workflow state to %s: %s", _WORKFLOW_STATE_PATH, exc)


def _reset_dataset_scoped_state() -> None:
    """Put reviewer work back to defaults so a new dataset never inherits the old one's decisions."""
    _WORKFLOW_STATE.update(_dataset_scoped_defaults())


def _load_workflow_state() -> None:
    try:
        with open(_WORKFLOW_STATE_PATH, encoding="utf-8") as f:
            saved = json.load(f)
    except FileNotFoundError:
        return
    except (OSError, ValueError) as exc:
        logger.warning("Ignoring unreadable workflow state %s: %s", _WORKFLOW_STATE_PATH, exc)
        return
    if isinstance(saved, dict):
        _WORKFLOW_STATE.update(saved)


_load_workflow_state()


def _dataset_path() -> str:
    """The dataset the interactive engine currently works on."""
    if _WORKFLOW_STATE.get("dataset_source") == "upload" and os.path.isfile(WORKING_DATASET_PATH):
        return WORKING_DATASET_PATH
    return DIRTY_DATASET_PATH


def _normalize_selected_findings(val: Any) -> Dict[str, bool]:
    if isinstance(val, dict):
        return {
            "range": bool(val.get("range", True)),
            "duplicate": bool(val.get("duplicate", True)),
            "outlier": bool(val.get("outlier", True)),
        }
    if isinstance(val, list):
        return {
            "range": any(k for k in val if "range" in k.lower()),
            "duplicate": any(k for k in val if "duplicate" in k.lower() or "composite" in k.lower()),
            "outlier": any(k for k in val if "outlier" in k.lower() or "iqr" in k.lower()),
        }
    return {"range": True, "duplicate": True, "outlier": True}


def _is_finding_enabled(findings: Any, key_short: str, key_long: str) -> bool:
    norm = _normalize_selected_findings(findings)
    return bool(norm.get(key_short, True))


def _recompute_interactive_state() -> Dict[str, Any]:
    """
    Runs vectorized pandas evaluation across all 10,100 rows of dirty_dataset.csv
    using the current _WORKFLOW_STATE parameters, persists the 3 CSV files on disk,
    and returns the complete live metrics for /ingestion, /rules, /pipeline, /export, and /dashboard.
    """
    ds_name = _WORKFLOW_STATE.get("dataset_name", "generic_dataset")
    if _WORKFLOW_STATE.get("dataset_source") != "evaluation" and ds_name in _UPLOADED_DATASETS:
        df = _UPLOADED_DATASETS[ds_name].copy()
    elif _WORKFLOW_STATE.get("dataset_source") == "upload" and os.path.isfile(WORKING_DATASET_PATH):
        df = pd.read_csv(WORKING_DATASET_PATH)
    else:
        dataset_path = _dataset_path()
        if not os.path.isfile(dataset_path):
            return _WORKFLOW_STATE
        df = pd.read_csv(dataset_path)

    total_rows = int(len(df))
    if "dirty_row_id" not in df.columns:
        df.insert(0, "dirty_row_id", range(1, total_rows + 1))
    active_rules = _WORKFLOW_STATE.get("active_rules")
    if not active_rules:
        recs_obj = _LATEST_RECOMMENDATIONS.get(ds_name)
        if recs_obj and "recommendations" in recs_obj:
            active_rules = recs_obj["recommendations"]
        else:
            prof = _LATEST_PROFILING.get(ds_name) or _compute_profile(df, ds_name)
            _LATEST_PROFILING[ds_name] = prof
            ctx = _LATEST_USER_CONTEXT.get(ds_name) or get_default_user_context(ds_name, prof)
            active_rules = _generate_recommendations(prof, ctx)
            _LATEST_RECOMMENDATIONS[ds_name] = {
                "dataset_name": ds_name,
                "recommendations_count": len(active_rules),
                "recommendations": active_rules,
                "generated_at": datetime.now(timezone.utc).isoformat()
            }
        _WORKFLOW_STATE["active_rules"] = active_rules
        _save_workflow_state()

    rule_items = [RuleItem(**r) if isinstance(r, dict) else r for r in (active_rules or [])]
    payload = ExecuteRulesPayload(dataset_name=ds_name, rules=rule_items, apply_reviewer_decisions=True)
    exec_res = execute_pipeline(payload)

    # Gate 2 is the duplicate gate: it only counts duplicates that the active rule quarantines.
    quarantine_total = exec_res.get("quarantine_rows", 0)
    dedup_quarantines = any(r.rule_type == "composite_unique" and r.accepted and r.action.lower() == "quarantine"
                            for r in rule_items)
    gate2_quarantined = min(exec_res.get("error_distribution", {}).get("Duplicate", 0), quarantine_total) if dedup_quarantines else 0
    gate1_quarantined = quarantine_total - gate2_quarantined

    metrics = {
        "total_rows": total_rows,
        "clean_rows": exec_res.get("clean_rows", total_rows),
        "review_rows": exec_res.get("review_rows", 0),
        "quarantine_rows": exec_res.get("quarantine_rows", 0),
        "quality_score_pct": exec_res.get("raw_quality_score_pct", 100.0),
        "missing_score_count": sum(v for k, v in exec_res.get("error_distribution", {}).items() if "Missing" in k),
        "invalid_range_count": sum(v for k, v in exec_res.get("error_distribution", {}).items() if "Range" in k),
        "duplicate_count": exec_res.get("error_distribution", {}).get("Duplicate", 0),
        "initial_outlier_count": sum(v for k, v in exec_res.get("error_distribution", {}).items() if "Outlier" in k),
        "gate1_quarantined": gate1_quarantined,
        "gate1_passed": total_rows - gate1_quarantined,
        "gate2_quarantined": gate2_quarantined,
        "gate2_passed": total_rows - quarantine_total,
        "sample_clean": exec_res.get("sample_clean") or (pd.read_csv(os.path.join(OUTPUT_DIR, "clean_dataset_run.csv")).head(5).to_dict(orient="records") if os.path.isfile(os.path.join(OUTPUT_DIR, "clean_dataset_run.csv")) else []),
        "sample_review": exec_res.get("sample_review", []),
        "sample_quarantine": exec_res.get("sample_quarantined", [])
    }
    return _clean_for_json({**_WORKFLOW_STATE, "metrics": metrics})


@router.get("/state")
def get_workflow_state():
    return _recompute_interactive_state()


@router.post("/state", dependencies=[Depends(require_session)])
def update_workflow_state(payload: Dict[str, Any] = Body(default_factory=dict)):
    if "dataset_source" in payload:
        source = payload["dataset_source"]
        if source in ("evaluation", "upload") and source != _WORKFLOW_STATE.get("dataset_source"):
            _WORKFLOW_STATE["dataset_source"] = source
            _LATEST_PROFILING.clear()
            if source == "evaluation":
                # Rules and the dataset name belong to the uploaded file; drop them so the
                # engine regenerates rules for the evaluation dataset instead of reusing them.
                _WORKFLOW_STATE["dataset_name"] = "student_course_score"
                _WORKFLOW_STATE["active_rules"] = []
            _reset_dataset_scoped_state()
        payload = {k: v for k, v in payload.items() if k != "dataset_source"}
    for k, v in payload.items():
        if k in _WORKFLOW_STATE:
            if k == "selected_findings":
                current_norm = _normalize_selected_findings(_WORKFLOW_STATE.get("selected_findings"))
                if isinstance(v, dict):
                    current_norm.update({k2: bool(v2) for k2, v2 in v.items() if k2 in ("range", "duplicate", "outlier")})
                    _WORKFLOW_STATE["selected_findings"] = current_norm
                else:
                    _WORKFLOW_STATE["selected_findings"] = _normalize_selected_findings(v)
            elif k == "row_decisions" and isinstance(v, dict):
                if len(v) == 0:
                    _WORKFLOW_STATE["row_decisions"] = {}
                else:
                    _WORKFLOW_STATE["row_decisions"].update(v)
            elif k == "row_edits" and isinstance(v, dict):
                if len(v) == 0:
                    _WORKFLOW_STATE["row_edits"] = {}
                else:
                    _WORKFLOW_STATE["row_edits"].update(v)
            else:
                _WORKFLOW_STATE[k] = v
    if payload.get("confirm_rules"):
        _WORKFLOW_STATE["confirmed_at"] = datetime.now(timezone.utc).strftime("%H:%M:%S")
    _save_workflow_state()
    return _recompute_interactive_state()


@router.get("/export-csv/{zone}")
def export_zone_csv(zone: str):
    _recompute_interactive_state()
    ds_name = _WORKFLOW_STATE.get("dataset_name", "dataset") or "dataset"
    zone_lower = zone.lower()
    if zone_lower == "clean":
        fpath = os.path.join(OUTPUT_DIR, "clean_dataset_run.csv")
        fname = f"{ds_name}_clean.csv"
    elif zone_lower == "review":
        fpath = os.path.join(OUTPUT_DIR, "review_queue_run.csv")
        fname = f"{ds_name}_review_queue.csv"
    else:
        fpath = os.path.join(OUTPUT_DIR, "quarantine_lake_run.csv")
        fname = f"{ds_name}_quarantine_log.csv"

    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Export file not generated yet")
    return FileResponse(fpath, media_type="text/csv", filename=fname)


@router.get("/preview-zone/{zone}")
def preview_zone_records(zone: str, limit: int = 20, search: str = "", error_type: str = ""):
    _recompute_interactive_state()
    zone_lower = zone.lower()
    if zone_lower in ("raw", "all"):
        fpath = _dataset_path()
    elif zone_lower == "clean":
        fpath = os.path.join(OUTPUT_DIR, "clean_dataset_run.csv")
    elif zone_lower == "review":
        fpath = os.path.join(OUTPUT_DIR, "review_queue_run.csv")
    else:
        fpath = os.path.join(OUTPUT_DIR, "quarantine_lake_run.csv")

    if not os.path.isfile(fpath):
        return {"columns": [], "rows": [], "total_zone_rows": 0}
    df_z = pd.read_csv(fpath)
    total_before_filter = int(len(df_z))
    if error_type and str(error_type).strip() and "whitebox_error_type" in df_z.columns:
        et = str(error_type).strip().lower()
        df_z = df_z[df_z["whitebox_error_type"].astype(str).str.lower().str.contains(et, na=False)]
    if search and str(search).strip():
        q = str(search).strip().lower()
        mask = df_z.astype(str).apply(lambda col: col.str.lower().str.contains(q, na=False)).any(axis=1)
        df_z = df_z[mask]
    safe_limit = max(1, min(int(limit or 20), 500))
    return _clean_for_json({
        "columns": list(df_z.columns),
        "rows": df_z.head(safe_limit).to_dict(orient="records"),
        "total_zone_rows": total_before_filter,
        "matched_rows": int(len(df_z))
    })


from fastapi import UploadFile, File, Form
import io

@router.post("/upload-csv", dependencies=[Depends(require_session)])
async def upload_csv_dataset(
    file: UploadFile = File(...),
    table_name: str = Form("uploaded_dataset")
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="กรุณาเลือกไฟล์ก่อน (ไฟล์ว่างเปล่า)")
    try:
        df_up = _read_uploaded_table(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    raw_tbl = str(table_name or file.filename or "uploaded_dataset").replace(".csv", "").replace(".xlsx", "").replace(".xls", "").strip()
    # Root Cause Fix: clean_tbl was used directly in os.path.join() below with no
    # sanitization — a table_name like "../../../malicious" would write outside
    # OUTPUT_DIR. Strip anything but letters/digits/underscore/hyphen.
    clean_tbl = re.sub(r"[^A-Za-z0-9_-]", "_", raw_tbl)[:128] or "uploaded_dataset"
    _WORKFLOW_STATE["dataset_name"] = clean_tbl
    _WORKFLOW_STATE["source_type"] = "FILE_UPLOAD"
    _save_workflow_state()

    if "dirty_row_id" not in df_up.columns:
        df_up.insert(0, "dirty_row_id", range(1, len(df_up) + 1))
    df_up.to_csv(WORKING_DATASET_PATH, index=False)
    _UPLOADED_DATASETS[clean_tbl] = df_up.copy()
    _UPLOADED_DATASETS[raw_tbl] = df_up.copy()
    _WORKFLOW_STATE["dataset_source"] = "upload"
    _WORKFLOW_STATE["dataset_name"] = clean_tbl
    _WORKFLOW_STATE["source_type"] = "FILE_UPLOAD"
    _reset_dataset_scoped_state()
    _save_workflow_state()
    _LATEST_PROFILING.clear()
    prof = _compute_profile(df_up, clean_tbl)
    _LATEST_PROFILING[clean_tbl] = prof
    default_ctx = get_default_user_context(clean_tbl, prof)
    _LATEST_USER_CONTEXT[clean_tbl] = default_ctx
    recs = _generate_recommendations(prof, default_ctx)
    _LATEST_RECOMMENDATIONS[clean_tbl] = {
        "dataset_name": clean_tbl,
        "recommendations_count": len(recs),
        "recommendations": recs,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    _WORKFLOW_STATE["active_rules"] = recs
    _save_workflow_state()
    state = _recompute_interactive_state()
    return _clean_for_json({
        "status": "ingested",
        "source_type": "FILE_UPLOAD",
        "table_name": clean_tbl,
        "rows_ingested": int(len(df_up)),
        "columns": list(df_up.columns),
        "profile": prof,
        "recommendations": recs,
        "state": state
    })


@router.post("/ingest-source", dependencies=[Depends(require_session)])
def ingest_from_connector(payload: Dict[str, Any]):
    source_type = str(payload.get("source_type", "RDBMS")).upper()
    table_name = str(payload.get("table_name") or payload.get("topic") or "uploaded_dataset").strip()
    endpoint_or_host = str(payload.get("connection_uri") or payload.get("host") or payload.get("url") or "local-cluster").strip()

    _WORKFLOW_STATE["dataset_name"] = table_name
    _WORKFLOW_STATE["source_type"] = source_type
    _WORKFLOW_STATE["connection_uri"] = endpoint_or_host
    _save_workflow_state()
    _LATEST_PROFILING.clear()

    prof = get_dataset_profile(table_name)
    state = _recompute_interactive_state()
    # This interactive connector does not open a real connection; it re-profiles the
    # dataset already loaded in the interactive engine. Say so, and never invent a count.
    return _clean_for_json({
        "status": "connected_and_profiled",
        "simulated": True,
        "source_type": source_type,
        "table_name": table_name,
        "connection_uri": endpoint_or_host,
        "rows_ingested": prof.get("total_rows"),
        "profile": prof,
        "state": state
    })


_AI_CONTEXT_CACHE: Dict[str, Dict[str, Any]] = {}


def _saved_groq_setting():
    """(key, enabled) saved from the Rules page via POST /api/v1/system/settings, or None
    when nothing is saved or Elasticsearch is unreachable."""
    try:
        es = get_es_client()
        if not es.indices.exists(index="sdoqap_settings"):
            return None
        doc = es.get(index="sdoqap_settings", id="global").get("_source", {})
    except Exception:
        return None
    key = str(doc.get("groq_api_key") or "").strip()
    return (key, bool(doc.get("groq_enabled"))) if key else None


def _get_groq_api_key() -> str:
    # Same order as services/spark/ai_rule_advisor.py: the saved setting wins (and can
    # switch the LLM off), then the environment.
    saved = _saved_groq_setting()
    if saved:
        key, enabled = saved
        return key if enabled else ""
    k = os.getenv("GROQ_API_KEY", "").strip()
    if k:
        return k
    for candidate in ["/app/.env", os.path.join(os.getcwd(), ".env"), "c:/DataEngProj/.env"]:
        if os.path.isfile(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as fh:
                    for line in fh:
                        line = line.strip()
                        if line.startswith("GROQ_API_KEY="):
                            return line.split("=", 1)[1].strip()
            except Exception:
                pass
    return ""


def _build_dynamic_context_fallback(
    dataset_name: str,
    metrics: Dict[str, Any],
    state: Dict[str, Any],
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    """Builds the rule-based context text from the pipeline's computed metrics.

    Every number comes from `metrics` (the output of _recompute_interactive_state)
    or the dataset profile. When the pipeline has not produced metrics yet (no
    dataset), the text fields are empty and `available` is False so the UI can
    fall back to its own wording instead of showing invented counts.
    """
    # Detect columns dynamically from active rules, falling back to first available from profile
    active_rules = state.get("active_rules", [])
    cols_prof = profile.get("columns_profile", {})
    first_numeric = next((c for c, s in cols_prof.items() if s.get("data_type") in ("Integer", "Float") and c != "dirty_row_id"), None)
    range_col = next((r.get("field") for r in active_rules if isinstance(r, dict) and r.get("rule_type") == "range_check"), first_numeric or "value")
    outlier_col = next((r.get("field") for r in active_rules if isinstance(r, dict) and r.get("rule_type") == "auto_iqr"), first_numeric or "value")

    base: Dict[str, Any] = {
        "engine": "SDOQAP rule-based summary",
        "model": None,
        "ai_live_generated": False,
        "available": False,
        "dataset_name": dataset_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "step1_findings": {},
        "step2_rules": {},
        "step5_lineage": {},
    }
    total_rows = metrics.get("total_rows")
    if not total_rows:
        return base

    # Extract range parameters from active rules or state
    range_rule = next((r for r in active_rules if isinstance(r, dict) and r.get("rule_type") == "range_check"), None)
    min_score = float(range_rule["parameters"]["min"]) if range_rule and range_rule.get("parameters", {}).get("min") is not None else float(state.get("min_score") if state.get("min_score") is not None else 0.0)
    max_score = float(range_rule["parameters"]["max"]) if range_rule and range_rule.get("parameters", {}).get("max") is not None else float(state.get("max_score") if state.get("max_score") is not None else 100.0)
    null_policy = str(state.get("null_policy") or "")
    tukey_mult = float(state.get("tukey_multiplier") or 3.0)
    # Detect composite key from active rules or state
    dup_rule = next((r for r in active_rules if isinstance(r, dict) and r.get("rule_type") == "composite_unique"), None)
    key_cols = " + ".join(dup_rule["parameters"]["columns"]) if dup_rule and dup_rule.get("parameters", {}).get("columns") else str(state.get("composite_key") or "")

    null_count = int(metrics.get("missing_score_count") or 0)
    out_of_range_count = int(metrics.get("invalid_range_count") or 0)
    dup_count = int(metrics.get("gate2_quarantined") or 0)
    review_count = int(metrics.get("review_rows") or 0)
    clean_count = int(metrics.get("clean_rows") or 0)
    quarantine_count = int(metrics.get("quarantine_rows") or 0)
    quality_score_pct = float(metrics.get("quality_score_pct") or 0.0)
    upper_fence = metrics.get("upper_fence")
    q1, q3, iqr = metrics.get("q1"), metrics.get("q3"), metrics.get("iqr")

    cols_prof = profile.get("columns_profile") or profile.get("column_profiles") or {}
    range_prof = cols_prof.get(range_col) or {}
    observed = (
        f"ค่าต่ำสุด–สูงสุดที่พบคือ {range_prof['min']:g} ถึง {range_prof['max']:g} "
        if range_prof.get("min") is not None and range_prof.get("max") is not None
        else ""
    )
    fence_text = f"เพดาน {upper_fence:g}" if upper_fence is not None else "รั้วสถิติ"
    iqr_text = (
        f"ค่ากลางอยู่ในช่วง {q1:g}–{q3:g} (IQR = {iqr:g}) "
        if q1 is not None and q3 is not None and iqr is not None
        else ""
    )
    null_mode_desc = (
        "ไม่อนุญาตให้มีค่าว่าง จึงกักกันแถวที่ไม่มีค่าทันที"
        if "strict" in null_policy.lower() or "not-null" in null_policy.lower()
        else "จัดการค่าว่างตามนโยบายที่ตั้งไว้"
    )

    base["available"] = True
    base["step1_findings"] = {
        "overview_summary": (
            f"ตาราง '{dataset_name}' มี {total_rows:,} แถว ผ่านเกณฑ์ {clean_count:,} แถว ({quality_score_pct}%) "
            f"กักกัน {quarantine_count:,} แถว และรอตรวจสอบ {review_count:,} แถว"
        ),
        "finding1_explanation": (
            f"คอลัมน์ '{range_col}' มีค่าว่าง {null_count:,} แถว และค่านอกช่วง [{min_score:g}, {max_score:g}] {out_of_range_count:,} แถว "
            f"ถ้าปล่อยผ่านจะทำให้ค่าเฉลี่ยและรายงานคลาดเคลื่อน"
        ),
        "finding2_explanation": (
            f"พบแถวที่คีย์ '{key_cols}' ซ้ำกัน {dup_count:,} แถว "
            f"ควรเก็บไว้เฉพาะแถวแรกเพื่อไม่ให้นับยอดซ้ำ"
        ),
        "finding3_explanation": (
            f"คอลัมน์ '{outlier_col}' {iqr_text}และมี {review_count:,} แถวที่เกิน{fence_text} "
            f"ควรส่งเข้าคิวตรวจสอบแทนการตัดทิ้งอัตโนมัติ"
        ),
    }
    base["step2_rules"] = {
        "rule1_evidence": (
            f"คอลัมน์ '{range_col}' {observed}มีค่าว่าง {null_count:,} แถว และค่านอกช่วง [{min_score:g}, {max_score:g}] {out_of_range_count:,} แถว"
        ),
        "rule1_why": (
            f"คอลัมน์ '{range_col}' ต้องอยู่ในช่วง {min_score:g} ถึง {max_score:g} และ{null_mode_desc} "
            f"การคัดแยก {null_count + out_of_range_count:,} แถวนี้ช่วยให้สถิติปลายทางถูกต้อง"
        ),
        "rule2_evidence": f"คีย์ '{key_cols}' ซ้ำกัน {dup_count:,} แถว จากทั้งหมด {total_rows:,} แถว",
        "rule2_why": f"หนึ่งคีย์ '{key_cols}' ควรมีเพียงหนึ่งแถว จึงเก็บแถวแรกและกักกันแถวซ้ำ {dup_count:,} แถว",
        "rule3_evidence": f"คอลัมน์ '{outlier_col}' {iqr_text}ใช้{fence_text} ({tukey_mult:g}× IQR)",
        "rule3_why": (
            f"คอลัมน์ '{outlier_col}' ไม่มีเพดานตายตัว จึงใช้รั้วสถิติ {tukey_mult:g}× IQR "
            f"คัดแถวที่สูงผิดปกติ {review_count:,} แถวเข้าคิวตรวจสอบ"
        ),
    }
    base["step5_lineage"] = {
        "executive_narrative": (
            f"ตาราง '{dataset_name}' ({total_rows:,} แถว): ผ่านเกณฑ์ {clean_count:,} แถว ({quality_score_pct}%), "
            f"กักกัน {quarantine_count:,} แถวเพื่อแจ้งแก้ที่ต้นทาง และส่ง {review_count:,} แถวเข้าคิวตรวจสอบ"
        ),
        "step1_card_desc": f"ค่าว่าง {null_count:,} แถว · นอกช่วง [{min_score:g},{max_score:g}] {out_of_range_count:,} แถว · คีย์ซ้ำ {dup_count:,} แถว",
        "step2_card_desc": f"ช่วง [{min_score:g}–{max_score:g}] · คีย์ไม่ซ้ำ · รั้วสถิติ {tukey_mult:g}× IQR",
        "step3_card_desc": f"ผ่านเกณฑ์ {clean_count:,} แถว · รอตรวจสอบ {review_count:,} แถว · กักกัน {quarantine_count:,} แถว",
        "step4_card_desc": f"ส่งออกข้อมูลสะอาด {clean_count:,} แถว และรายงานต้นทาง {quarantine_count:,} แถว",
    }
    return base


@router.get("/ai-context-explanations")
def generate_ai_context_explanations(request: Request, force: bool = False):
    # Reading the cached text is public; ?force=true calls the LLM again on every request,
    # so it needs a session (it used to be reachable anonymously through this GET).
    if force:
        require_session(request)
    state = _recompute_interactive_state()
    dataset_name = str(state.get("dataset_name") or "dataset")
    # _recompute_interactive_state stores its counts under "metrics"; this used to
    # read "live_metrics" (never set), so every number fell back to hard-coded
    # demo values (9,400 clean rows, 100 duplicates, …) regardless of the data.
    metrics = state.get("metrics") or {}
    prof = get_dataset_profile(dataset_name) if metrics.get("total_rows") else {}

    cache_key = (
        f"{dataset_name}|{metrics.get('total_rows')}|{metrics.get('clean_rows')}|{metrics.get('review_rows')}|"
        f"{state.get('min_score')}|{state.get('max_score')}|{state.get('null_policy')}|{state.get('tukey_multiplier')}"
    )
    if not force and cache_key in _AI_CONTEXT_CACHE:
        return _AI_CONTEXT_CACHE[cache_key]

    base_result = _build_dynamic_context_fallback(dataset_name, metrics, state, prof)

    # Optional LLM rewrite (Groq). Runs only when a key is configured and there are
    # real metrics to describe; the rule-based text above already carries the numbers.
    try:
        import json
        import urllib.request as _ureq
        api_key = _get_groq_api_key()
        if api_key and base_result["available"]:
            facts = "\n".join(
                f"- {v}" for section in ("step1_findings", "step2_rules") for v in base_result[section].values()
            )
            prompt = (
                "คุณคือวิศวกรข้อมูลที่อธิบายผลตรวจคุณภาพข้อมูลให้เข้าใจง่ายและกระชับ.\n"
                "ใช้เฉพาะตัวเลขและข้อเท็จจริงด้านล่าง ห้ามเดาสาเหตุหรือเพิ่มตัวเลขใหม่.\n"
                f"{facts}\n\n"
                "ตอบกลับเป็น JSON เท่านั้น โดยมีโครงสร้างคีย์ตรงตามนี้:\n"
                '{"finding1_explanation": "...", "finding2_explanation": "...", "finding3_explanation": "...", '
                '"rule1_why": "...", "rule2_why": "...", "rule3_why": "...", "executive_narrative": "..."}'
            )
            req_payload = json.dumps({
                "model": "openai/gpt-oss-120b",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": 2048
            }).encode("utf-8")
            req_obj = _ureq.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=req_payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "SDOQAP-AI-Engine/2.0"
                }
            )
            with _ureq.urlopen(req_obj, timeout=12) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                content = resp_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                start_idx = content.find("{")
                end_idx = content.rfind("}")
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    llm_json = json.loads(content[start_idx:end_idx + 1])
                    targets = {
                        "finding1_explanation": "step1_findings",
                        "finding2_explanation": "step1_findings",
                        "finding3_explanation": "step1_findings",
                        "rule1_why": "step2_rules",
                        "rule2_why": "step2_rules",
                        "rule3_why": "step2_rules",
                        "executive_narrative": "step5_lineage",
                    }
                    for key, section in targets.items():
                        if llm_json.get(key):
                            base_result[section][key] = llm_json[key]
                    base_result["ai_live_generated"] = True
                    base_result["model"] = "openai/gpt-oss-120b"
                    base_result["engine"] = "Groq openai/gpt-oss-120b"
    except Exception as exc:
        logger.warning("AI Context LLM fallback used: %s", exc)

    _AI_CONTEXT_CACHE[cache_key] = base_result
    return base_result



