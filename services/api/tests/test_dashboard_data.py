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
    es.index("sdoqap_quality_runs", "q1", {"table_name": "sales", "timestamp": "2026-10-01T01:00:00Z", "quality_score": 97.5,
                                           "effective_quality_threshold": 90.0, "total_records": 200, "clean_records": 195, "quarantined_records": 5})

    broken, sales = dashboard_data.list_datasets(es)
    assert sales == {"name": "sales", "source": "File upload", "records": 5, "columns": 5,
                     "kind_counts": {"numeric": 2, "categorical": 2, "date": 1, "text": 0},
                     "last_updated": "2026-10-01T01:00:00Z", "error": None,
                     "quality": {"score": 97.5, "threshold": 90.0, "passed": True, "total_records": 200,
                                 "clean_records": 195, "quarantined_records": 5, "timestamp": "2026-10-01T01:00:00Z"}}
    assert broken["name"] == "broken" and broken["records"] is None
    assert broken["error"] == "Delta log not found"
    assert broken["quality"] is None


def test_quality_below_the_threshold_is_flagged_and_a_missing_threshold_is_not_guessed(monkeypatch):
    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: ["low", "old"])
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())
    es = FakeES()
    es.index("sdoqap_quality_runs", "q1", {"table_name": "low", "timestamp": "2026-10-01T01:00:00Z", "quality_score": 62.0,
                                           "effective_quality_threshold": 90.0, "total_records": 5000, "clean_records": 3100, "quarantined_records": 1900})
    es.index("sdoqap_quality_runs", "q2", {"table_name": "old", "timestamp": "2026-10-01T01:00:00Z", "quality_score": 88.0})

    low, old = dashboard_data.list_datasets(es)
    assert low["quality"]["passed"] is False and low["quality"]["quarantined_records"] == 1900
    assert low["quality"]["clean_records"] == 3100
    assert old["quality"]["score"] == 88.0 and old["quality"]["threshold"] is None and old["quality"]["passed"] is None


def test_a_run_without_a_clean_count_derives_it_so_the_three_numbers_always_add_up(monkeypatch):
    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: ["sales"])
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())
    es = FakeES()
    es.index("sdoqap_quality_runs", "q1", {"table_name": "sales", "timestamp": "2026-10-01T01:00:00Z", "quality_score": 66.0,
                                           "effective_quality_threshold": 70.0, "total_records": 100, "quarantined_records": 34})
    (sales,) = dashboard_data.list_datasets(es)
    assert sales["quality"]["clean_records"] == 66


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


def test_the_stored_and_the_prepared_frame_have_the_same_rows_and_only_the_stored_one_keeps_every_value(monkeypatch):
    frame = pd.DataFrame({"run_id": ["r"] * 20, "n": ["10"] * 18 + ["N/A", "12A"], "region": ["a", "b"] * 10})
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: frame.copy())
    stored, prepared, profile = dashboard_data.load_active_pair("sales")
    assert list(stored.columns) == list(prepared.columns) == ["n", "region"] and len(stored) == len(prepared) == 20
    assert list(stored.index) == list(prepared.index) == list(range(20))
    assert stored["n"].tolist()[-2:] == ["N/A", "12A"] and prepared["n"].isna().sum() == 2
    assert profile["rows"] == 20 and not dashboard_data._FRAME_CACHE  # a fresh read, not the cache


def test_the_pair_rejects_an_unsafe_table_name():
    with pytest.raises(HTTPException) as exc:
        dashboard_data.load_active_pair("../etc")
    assert exc.value.status_code == 400


def test_unsafe_table_names_are_rejected():
    with pytest.raises(HTTPException) as exc:
        dashboard_data.load_active_dataset("../etc")
    assert exc.value.status_code == 400


def test_listing_many_tables_does_not_evict_the_frame_being_worked_on(monkeypatch):
    names = [f"t{i}" for i in range(dashboard_data._FRAME_CACHE_MAX + 3)]
    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: names)
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())
    dashboard_data.load_active_dataset("working")
    assert list(dashboard_data._FRAME_CACHE) == ["working"]

    listed = dashboard_data.list_datasets(None)
    assert [d["name"] for d in listed] == sorted(names)
    assert all(d["records"] == 5 for d in listed)
    assert list(dashboard_data._FRAME_CACHE) == ["working"]


def test_listing_alone_leaves_the_frame_cache_empty(monkeypatch):
    names = [f"t{i}" for i in range(dashboard_data._FRAME_CACHE_MAX + 3)]
    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: names)
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())
    dashboard_data.list_datasets(None)
    assert dashboard_data._FRAME_CACHE == {}
    assert set(dashboard_data._PROFILE_CACHE) == set(names)


def test_profiles_are_read_once_per_cache_period(monkeypatch):
    calls = []
    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: ["sales"])
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: calls.append(name) or SALES.copy())
    dashboard_data.list_datasets(None)
    dashboard_data.list_datasets(None)
    assert dashboard_data.dataset_profile("sales")["rows"] == 5
    assert calls == ["sales"]


def test_dataset_profile_rejects_unsafe_table_names():
    with pytest.raises(HTTPException) as exc:
        dashboard_data.dataset_profile("../etc")
    assert exc.value.status_code == 400


def test_dataset_profile_reuses_a_fresh_cached_frame(monkeypatch):
    calls = []
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: calls.append(name) or SALES.copy())
    _, profile = dashboard_data.load_active_dataset("sales")
    assert dashboard_data.dataset_profile("sales") is profile
    assert calls == ["sales"]


def test_list_survives_an_elasticsearch_failure_and_logs_it(monkeypatch, caplog):
    class BrokenES(FakeES):
        def search(self, index, query, size=10, sort=None):
            raise RuntimeError("cluster is down")

    es = BrokenES()
    es.index("sdoqap_runs", "i1", {"table_name": "sales"})
    es.index("sdoqap_quality_runs", "q1", {"table_name": "sales"})
    monkeypatch.setattr(dashboard_data, "list_active_tables", lambda: ["sales"])
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: SALES.copy())

    with caplog.at_level("WARNING", logger=dashboard_data.logger.name):
        (sales,) = dashboard_data.list_datasets(es)
    assert sales["source"] is None and sales["last_updated"] is None and sales["quality"] is None
    assert sales["records"] == 5 and sales["error"] is None
    warnings = [r for r in caplog.records if r.levelname == "WARNING"]
    assert warnings and "sdoqap_runs" in warnings[0].getMessage() and "sales" in warnings[0].getMessage()
    assert warnings[0].exc_info is not None


# pandas 2.3.3 segfaults (killing the API process) in pd.to_numeric on a string such as an
# MD5 digest that starts like a float exponent. These tests must not reach that call.
CRASHING_DIGEST = "81e89603437810ef685f6a583c97074f"


def test_to_numeric_safe_survives_exponent_like_digest():
    out = dashboard_data.to_numeric_safe(pd.Series([CRASHING_DIGEST, "12", "1e3", "-4.5", "7 ชิ้น", None, "inf"]))
    assert out.iloc[1] == 12 and out.iloc[2] == 1000 and out.iloc[3] == -4.5
    assert out.iloc[[0, 4, 5]].isna().all()
    assert out.iloc[6] == float("inf")


def test_digest_column_is_not_numeric_and_does_not_crash():
    digests = pd.Series([CRASHING_DIGEST] + [f"{i:032x}" for i in range(40)])
    assert dashboard_data.classify_column(digests) != "numeric"


def test_prepare_frame_keeps_digest_column_as_text():
    frame = pd.DataFrame({"row_hash": [CRASHING_DIGEST, "000edb69bc4fda9776c3faf8e6f603f1"], "n": ["1", "2"]})
    df, profile = dashboard_data.prepare_frame(frame)
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    assert kinds["n"] == "numeric" and kinds["row_hash"] != "numeric"
    assert df["row_hash"].tolist() == frame["row_hash"].tolist()
