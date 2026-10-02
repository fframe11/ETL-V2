"""Datasets for the Create Dashboard tab.

Only the active layer (/data/active/<table>, the rows that passed the Quality Gate) is
offered. A table is loaded with pandas once per cache period, its technical columns are
dropped and every column is classified as numeric, date, categorical or text; both the
dashboard spec and the LLM prompt are built from that profile."""
import logging
import math
import re
import threading
import time

import pandas as pd
from fastapi import HTTPException

from .config import get_es_client
from .data_export import _list_hdfs_dir, _records_json_safe, read_parquet_folder_to_df
from .validation import validate_table_name

logger = logging.getLogger(__name__)

KINDS = ("numeric", "categorical", "date", "text")
TECHNICAL_COLUMNS = {"run_id", "ingest_id", "__index_level_0__"}
CATEGORY_MAX_DISTINCT = 50
PARSE_MIN_RATIO = 0.9
PREVIEW_ROWS = 20
SOURCE_LABELS = {"file": "File upload", "api": "REST API", "rdbms": "Database"}

# The quality-run history (one row per run in sdoqap_quality_runs) is offered as a dataset
# too, for "track data quality" dashboards. The leading "_" can never clash with an HDFS
# table: list_active_tables() skips such names.
QUALITY_DATASET = "_quality_runs"
QUALITY_INDEX = "sdoqap_quality_runs"
QUALITY_MAX_RUNS = 5000
QUALITY_COLUMNS = ("timestamp", "table_name", "total_records", "clean_records", "quarantined_records",
                   "quality_score", "effective_quality_threshold", "duration_seconds", "freshness_lag_hours",
                   "quarantined_financial_value", "operational_impact_score", "is_anomaly", "rules_mode")

_CACHE_TTL_S = 120
_FRAME_CACHE_MAX = 4
_FRAME_CACHE = {}    # table -> (loaded_at, df, profile)
_PROFILE_CACHE = {}  # table -> (loaded_at, profile); profiles are small, frames are not
_CACHE_LOCK = threading.Lock()  # guards both caches; never held while a table is being read
_LEADING_ZERO = re.compile(r"^0\d")  # phone numbers, zip codes: digits that are not quantities
# What pd.to_numeric may be given. pandas 2.3.3 segfaults (killing the API process) on strings
# such as the MD5 digest "81e89603437810ef..." that start like a float exponent, so any other
# string is turned into NaN before pandas sees it. The exponent is capped at 3 digits.
_PLAIN_NUMBER = re.compile(r"\s*[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d{1,3})?|inf|infinity)\s*", re.IGNORECASE)


def _parsable(value) -> bool:
    return not isinstance(value, str) or _PLAIN_NUMBER.fullmatch(value) is not None


def to_numeric_safe(series: pd.Series) -> pd.Series:
    """pd.to_numeric(errors="coerce") that cannot crash the interpreter on odd strings."""
    return pd.to_numeric(series.where(series.map(_parsable)), errors="coerce")


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
    if to_numeric_safe(sample).notna().mean() >= PARSE_MIN_RATIO:
        # "0812345678" or "01234" is an identifier: converting it would drop the leading zero.
        if not sample.str.match(_LEADING_ZERO).any():
            return "numeric"
    elif _parse_dates(sample).notna().mean() >= PARSE_MIN_RATIO:
        return "date"
    distinct = values.nunique()
    if distinct <= CATEGORY_MAX_DISTINCT or distinct <= 0.5 * len(values):
        return "categorical"
    return "text"


def _number(value):
    """A rounded float, or None for a missing or non-finite value (JSON cannot carry inf/nan)."""
    return None if pd.isna(value) or not math.isfinite(float(value)) else round(float(value), 4)


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
            numbers = to_numeric_safe(series)
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
            df[name] = to_numeric_safe(df[name])
        elif kind == "date":
            df[name] = _parse_dates(df[name])
    return df, profile_dataframe(df)


def _read_quality_runs() -> pd.DataFrame:
    """Flat fields of the newest QUALITY_MAX_RUNS quality runs, plus gate_result
    (ผ่าน / ไม่ผ่าน; empty when the run did not record its threshold)."""
    es = get_es_client()
    if not es.indices.exists(index=QUALITY_INDEX):
        raise HTTPException(status_code=404, detail="ยังไม่มีผลตรวจคุณภาพ รัน Pipeline อย่างน้อยหนึ่งครั้งก่อน")
    try:
        res = es.search(index=QUALITY_INDEX, query={"match_all": {}}, size=QUALITY_MAX_RUNS,
                        sort=[{"timestamp": {"order": "desc"}}])
    except Exception as exc:
        logger.warning("Reading the quality runs from Elasticsearch failed", exc_info=True)
        raise HTTPException(status_code=503, detail="อ่านผลตรวจคุณภาพจาก Elasticsearch ไม่ได้ในตอนนี้") from exc
    rows = [{c: h["_source"].get(c) for c in QUALITY_COLUMNS} for h in res["hits"]["hits"]]
    df = pd.DataFrame(rows, columns=list(QUALITY_COLUMNS))
    score = pd.to_numeric(df["quality_score"], errors="coerce")
    threshold = pd.to_numeric(df["effective_quality_threshold"], errors="coerce")
    passed = (score >= threshold).map({True: "ผ่าน", False: "ไม่ผ่าน"})
    df["gate_result"] = passed.where(score.notna() & threshold.notna())
    return df


def _read_active(table_name: str) -> pd.DataFrame:
    if table_name == QUALITY_DATASET:
        return _read_quality_runs()
    return read_parquet_folder_to_df(f"/data/active/{table_name}")


def load_active_dataset(table_name: str):
    """(DataFrame, profile) of a table's active layer, cached for _CACHE_TTL_S seconds."""
    validate_table_name(table_name)
    with _CACHE_LOCK:
        hit = _FRAME_CACHE.get(table_name)
    if hit and time.time() - hit[0] < _CACHE_TTL_S:
        return hit[1], hit[2]
    df, profile = prepare_frame(_read_active(table_name))
    now = time.time()
    with _CACHE_LOCK:
        if table_name not in _FRAME_CACHE and len(_FRAME_CACHE) >= _FRAME_CACHE_MAX:
            _FRAME_CACHE.pop(min(_FRAME_CACHE, key=lambda k: _FRAME_CACHE[k][0]))
        _FRAME_CACHE[table_name] = (now, df, profile)
        _PROFILE_CACHE[table_name] = (now, profile)
    return df, profile


def dataset_profile(table_name: str) -> dict:
    """Profile only. A miss fills _PROFILE_CACHE and never _FRAME_CACHE, so listing many
    tables cannot evict the frame of the dataset being worked on."""
    validate_table_name(table_name)
    with _CACHE_LOCK:
        hit = _PROFILE_CACHE.get(table_name)
    if hit and time.time() - hit[0] < _CACHE_TTL_S:
        return hit[1]
    _, profile = prepare_frame(_read_active(table_name))
    with _CACHE_LOCK:
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


def quality_dataset_entry(es):
    """Catalog row for the quality-run history, or None until a run has been recorded."""
    if es is None:
        return None
    try:
        if not es.indices.exists(index=QUALITY_INDEX):
            return None
    except Exception:
        return None
    entry = {"name": QUALITY_DATASET, "source": "Quality Gate (Elasticsearch)", "records": None, "columns": None,
             "kind_counts": None, "last_updated": None, "quality_score": None, "error": None}
    try:
        profile = dataset_profile(QUALITY_DATASET)
        newest = next((c.get("max") for c in profile["columns"] if c["name"] == "timestamp"), None)
        entry.update(records=profile["rows"], columns=profile["column_count"], kind_counts=profile["kind_counts"],
                     last_updated=f"{newest}Z" if newest else None)  # timestamps are kept as naive UTC
    except HTTPException as exc:
        entry["error"] = str(exc.detail)
    except Exception as exc:
        entry["error"] = f"อ่านข้อมูลไม่ได้: {exc}"
    return entry
