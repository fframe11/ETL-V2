import os
import sys

import pandas as pd
import pytest
from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import dashboard_data  # noqa: E402
from fakes import FakeES  # noqa: E402

SALES = pd.DataFrame({
    "order_date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28", None],
    "region": ["North", "South", "North", "East", "South"],
    "amount": [100.0, 250.5, None, 80.0, 40.0],
    "units": ["3", "5", "2", "1", "4"],
    "note": ["a1", "b2", "c3", "d4", "e5"],
    "run_id": ["r1"] * 5,
})


@pytest.fixture(autouse=True)
def empty_caches():
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()
    yield
    dashboard_data._FRAME_CACHE.clear()
    dashboard_data._PROFILE_CACHE.clear()


def test_columns_are_classified_by_what_they_hold():
    kind = dashboard_data.classify_column
    assert kind(pd.Series([1.5, 2.0, None])) == "numeric"
    assert kind(pd.Series(["3", "5", "2"])) == "numeric"
    assert kind(pd.Series(["2025-01-05", "2025-02-01"])) == "date"
    assert kind(pd.to_datetime(pd.Series(["2025-01-05"]))) == "date"
    assert kind(pd.Series(["North", "South", "North"])) == "categorical"
    assert kind(pd.Series([True, False])) == "categorical"
    assert kind(pd.Series([f"customer-{i}" for i in range(60)])) == "text"
    assert kind(pd.Series([None, None], dtype="object")) == "text"


def test_prepare_frame_drops_technical_columns_and_converts_types():
    df, profile = dashboard_data.prepare_frame(SALES.copy())
    assert "run_id" not in df.columns
    assert pd.api.types.is_numeric_dtype(df["units"])
    assert pd.api.types.is_datetime64_any_dtype(df["order_date"])
    assert profile["rows"] == 5 and profile["column_count"] == 5
    assert profile["missing_cells"] == 2
    assert profile["kind_counts"] == {"numeric": 2, "categorical": 2, "date": 1, "text": 0}
    amount = next(c for c in profile["columns"] if c["name"] == "amount")
    assert amount["missing"] == 1 and amount["missing_pct"] == 20.0
    assert amount["min"] == 40.0 and amount["max"] == 250.5
    order_date = next(c for c in profile["columns"] if c["name"] == "order_date")
    assert order_date["min"] == "2025-01-05T00:00:00" and order_date["max"] == "2025-02-28T00:00:00"


def test_timezone_aware_dates_become_naive_so_filters_can_compare_them():
    raw = pd.DataFrame({"at": pd.to_datetime(["2025-01-05T10:00:00+07:00"])})
    df, _ = dashboard_data.prepare_frame(raw)
    assert df["at"].dt.tz is None


def test_list_shows_catalog_facts_and_keeps_unreadable_tables_visible(monkeypatch):
    def read(name):
        if name == "broken":
            raise HTTPException(status_code=404, detail="Delta log not found")
        return SALES.copy()

    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: ["sales", "broken"])
    monkeypatch.setattr(dashboard_data, "_read_active", read)
    es = FakeES()
    es.index("sdoqap_runs", "i1", {"table_name": "sales", "source": "file", "created_at": "2026-10-01T00:00:00Z",
                                   "updated_at": "2026-10-01T00:05:00Z"})
    es.index("sdoqap_quality_runs", "q1", {"table_name": "sales", "timestamp": "2026-10-01T01:00:00Z", "quality_score": 97.5})

    broken, sales = dashboard_data.list_datasets(es)
    assert sales == {"name": "sales", "source": "File upload", "records": 5, "columns": 5,
                     "kind_counts": {"numeric": 2, "categorical": 2, "date": 1, "text": 0},
                     "last_updated": "2026-10-01T01:00:00Z", "quality_score": 97.5, "error": None}
    assert broken["name"] == "broken" and broken["records"] is None
    assert broken["error"] == "Delta log not found"


def test_list_works_without_elasticsearch(monkeypatch):
    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: ["sales"])
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())
    (sales,) = dashboard_data.list_datasets(None)
    assert sales["source"] is None and sales["last_updated"] is None and sales["records"] == 5


def test_preview_returns_profile_and_json_safe_sample(monkeypatch):
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())
    preview = dashboard_data.preview_dataset("sales")
    assert preview["table_name"] == "sales"
    assert preview["profile"]["rows"] == 5
    assert len(preview["sample"]) == 5
    assert preview["sample"][2]["amount"] is None
    assert preview["sample"][4]["order_date"] is None


def test_a_table_is_read_once_per_cache_period(monkeypatch):
    calls = []
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: calls.append(name) or SALES.copy())
    dashboard_data.load_active_dataset("sales")
    dashboard_data.load_active_dataset("sales")
    assert calls == ["sales"]


def test_unsafe_table_names_are_rejected():
    with pytest.raises(HTTPException) as exc:
        dashboard_data.load_active_dataset("../etc")
    assert exc.value.status_code == 400
