"""Datasets for the Create Dashboard tab.

Only the active layer (/data/active/<table>, the rows that passed the Quality Gate) is
offered. A table is loaded with pandas once per cache period, its technical columns are
dropped and every column is classified as numeric, date, categorical or text; both the
dashboard spec and the LLM prompt are built from that profile."""
import logging
import time

import pandas as pd
from fastapi import HTTPException

from .data_export import _list_hdfs_dir, _records_json_safe, read_parquet_folder_to_df
from .validation import validate_table_name

logger = logging.getLogger(__name__)

KINDS = ("numeric", "categorical", "date", "text")
TECHNICAL_COLUMNS = {"run_id", "ingest_id", "__index_level_0__"}
CATEGORY_MAX_DISTINCT = 50
PARSE_MIN_RATIO = 0.9
PREVIEW_ROWS = 20
SOURCE_LABELS = {"file": "File upload", "api": "REST API", "rdbms": "Database"}

_CACHE_TTL_S = 120
_FRAME_CACHE_MAX = 4
_FRAME_CACHE = {}    # table -> (loaded_at, df, profile)
_PROFILE_CACHE = {}  # table -> (loaded_at, profile); profiles are small, frames are not


def _parse_dates(series: pd.Series) -> pd.Series:
    """Datetimes without a timezone (UTC wall time), so filters compare like with like."""
    return pd.to_datetime(series, errors="coerce", format="mixed", utc=True).dt.tz_convert(None)


def classify_column(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "categorical"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    values = series.dropna()
    if values.empty:
        return "text"
    sample = values.astype(str).head(500)
    if pd.to_numeric(sample, errors="coerce").notna().mean() >= PARSE_MIN_RATIO:
        return "numeric"
    if _parse_dates(sample).notna().mean() >= PARSE_MIN_RATIO:
        return "date"
    distinct = values.nunique()
    if distinct <= CATEGORY_MAX_DISTINCT or distinct <= 0.5 * len(values):
        return "categorical"
    return "text"


def _number(value):
    return None if pd.isna(value) else round(float(value), 4)


def _iso(value):
    return None if pd.isna(value) else pd.Timestamp(value).isoformat()


def profile_dataframe(df: pd.DataFrame) -> dict:
    rows = len(df)
    columns = []
    for name in df.columns:
        series = df[name]
        kind = classify_column(series)
        missing = int(series.isna().sum())
        column = {"name": name, "kind": kind, "dtype": str(series.dtype), "missing": missing,
                  "missing_pct": round(missing / rows * 100, 2) if rows else 0.0,
                  "distinct": int(series.nunique(dropna=True))}
        if kind == "numeric":
            numbers = pd.to_numeric(series, errors="coerce")
            column.update(min=_number(numbers.min()), max=_number(numbers.max()), mean=_number(numbers.mean()))
        elif kind == "date":
            column.update(min=_iso(series.min()), max=_iso(series.max()))
        columns.append(column)
    return {"rows": rows, "column_count": len(columns), "missing_cells": int(df.isna().sum().sum()),
            "kind_counts": {k: sum(c["kind"] == k for c in columns) for k in KINDS}, "columns": columns}


def prepare_frame(df: pd.DataFrame):
    """(DataFrame ready for aggregation, its profile)."""
    df = df.drop(columns=[c for c in df.columns if c in TECHNICAL_COLUMNS]).reset_index(drop=True)
    df.columns = [str(c) for c in df.columns]
    for name in df.columns:
        kind = classify_column(df[name])
        if kind == "numeric" and not pd.api.types.is_numeric_dtype(df[name]):
            df[name] = pd.to_numeric(df[name], errors="coerce")
        elif kind == "date":
            df[name] = _parse_dates(df[name])
    return df, profile_dataframe(df)


def _read_active(table_name: str) -> pd.DataFrame:
    return read_parquet_folder_to_df(f"/data/active/{table_name}")


def load_active_dataset(table_name: str):
    """(DataFrame, profile) of a table's active layer, cached for _CACHE_TTL_S seconds."""
    validate_table_name(table_name)
    hit = _FRAME_CACHE.get(table_name)
    if hit and time.time() - hit[0] < _CACHE_TTL_S:
        return hit[1], hit[2]
    df, profile = prepare_frame(_read_active(table_name))
    if table_name not in _FRAME_CACHE and len(_FRAME_CACHE) >= _FRAME_CACHE_MAX:
        _FRAME_CACHE.pop(min(_FRAME_CACHE, key=lambda k: _FRAME_CACHE[k][0]))
    now = time.time()
    _FRAME_CACHE[table_name] = (now, df, profile)
    _PROFILE_CACHE[table_name] = (now, profile)
    return df, profile


def dataset_profile(table_name: str) -> dict:
    """Profile only. A miss fills _PROFILE_CACHE and never _FRAME_CACHE, so listing many
    tables cannot evict the frame of the dataset being worked on."""
    validate_table_name(table_name)
    hit = _PROFILE_CACHE.get(table_name)
    if hit and time.time() - hit[0] < _CACHE_TTL_S:
        return hit[1]
    _, profile = prepare_frame(_read_active(table_name))
    _PROFILE_CACHE[table_name] = (time.time(), profile)
    return profile


def list_active_tables():
    return [e["pathSuffix"] for e in _list_hdfs_dir("/data/active")
            if e["type"] == "DIRECTORY" and not e["pathSuffix"].startswith(("_", "."))]


def _latest(es, index, table_name, sort_field):
    if es is None:
        return None
    try:
        if not es.indices.exists(index=index):
            return None
        res = es.search(index=index, query={"bool": {"filter": [{"term": {"table_name.keyword": table_name}}]}},
                        size=1, sort=[{sort_field: {"order": "desc"}}])
        hits = res["hits"]["hits"]
        return hits[0]["_source"] if hits else None
    except Exception:
        logger.warning("Elasticsearch lookup failed (index=%s, table=%s); continuing without it",
                       index, table_name, exc_info=True)
        return None


def list_datasets(es):
    """Catalog rows for the dataset picker. A table that cannot be read stays in the list
    with its error, so the user sees why it cannot be chosen."""
    datasets = []
    for name in sorted(list_active_tables()):
        run = _latest(es, "sdoqap_runs", name, "created_at") or {}
        quality = _latest(es, "sdoqap_quality_runs", name, "timestamp") or {}
        entry = {"name": name, "source": SOURCE_LABELS.get(run.get("source"), run.get("source")),
                 "records": None, "columns": None, "kind_counts": None,
                 "last_updated": quality.get("timestamp") or run.get("updated_at"),
                 "quality_score": quality.get("quality_score"), "error": None}
        try:
            profile = dataset_profile(name)
            entry.update(records=profile["rows"], columns=profile["column_count"], kind_counts=profile["kind_counts"])
        except HTTPException as exc:
            entry["error"] = str(exc.detail)
        except Exception as exc:
            entry["error"] = f"อ่านข้อมูลไม่ได้: {exc}"
        datasets.append(entry)
    return datasets


def preview_dataset(table_name: str) -> dict:
    df, profile = load_active_dataset(table_name)
    return {"table_name": table_name, "profile": profile, "sample": _records_json_safe(df.head(PREVIEW_ROWS))}
