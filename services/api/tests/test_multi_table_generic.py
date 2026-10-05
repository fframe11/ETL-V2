import os
import sys

import pandas as pd
import pytest
from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import whitebox  # noqa: E402
from app.api.whitebox import (  # noqa: E402
    MultiTableAnalyzePayload, MultiTableJoinPayload, analyze_multi_table_relationship,
    execute_multi_table_join, find_candidate_keys, list_multi_table_candidates, preview_multi_tables, run_all_stages,
)

ORDERS = pd.DataFrame({
    "order_id": [1, 2, 3, 4, 5, 6],
    "customerId": [10, 10, 11, 12, 12, 99],
    "amount": [5.0, 6.0, 7.0, 8.0, 9.0, 1.0],
})
CUSTOMERS = pd.DataFrame({
    "customer_id": [10, 11, 12, 13],
    "name": ["A", "B", "C", "D"],
    "since": ["01/02/2025", "15/03/2025", "20/04/2025", "05/05/2025"],
})
UNRELATED = pd.DataFrame({"sku": ["x", "y", "z"], "price": [1.5, 2.5, 3.5]})


@pytest.fixture
def two_tables(monkeypatch, tmp_path):
    monkeypatch.setitem(whitebox._UPLOADED_DATASETS, "orders", ORDERS.copy())
    monkeypatch.setitem(whitebox._UPLOADED_DATASETS, "customers", CUSTOMERS.copy())
    monkeypatch.setitem(whitebox._UPLOADED_DATASETS, "unrelated", UNRELATED.copy())
    monkeypatch.setitem(whitebox._WORKFLOW_STATE, "dataset_name", "orders")
    monkeypatch.setitem(whitebox._WORKFLOW_STATE, "dataset_source", "upload")
    monkeypatch.setattr(whitebox, "UNIFIED_DATASET_PATH", str(tmp_path / "unified_test.csv"))  # never the real output folder


def test_key_is_found_in_tables_that_have_nothing_to_do_with_students():
    pairs = find_candidate_keys(ORDERS, CUSTOMERS)
    assert (pairs[0]["key_a"], pairs[0]["key_b"]) == ("customerId", "customer_id")  # equal names and a unique side
    assert pairs[0]["overlap"] == 3 and pairs[0]["unique_b"] is True


def test_no_shared_key_is_an_answer_not_an_error(two_tables):
    out = analyze_multi_table_relationship(MultiTableAnalyzePayload(table_a_name="orders", table_b_name="unrelated"))
    assert out["status"] == "NO_CANDIDATE_KEY"
    assert out["candidate_relationship"] is None and out["human_confirmation_required"] is False
    assert "orders" in out["message"] and "unrelated" in out["message"]


def test_analysis_names_the_real_tables_keys_cardinality_and_dates(two_tables):
    out = analyze_multi_table_relationship(MultiTableAnalyzePayload(table_a_name="orders", table_b_name="customers"))
    rel = out["candidate_relationship"]
    assert out["status"] == "ANALYSIS_COMPLETE"
    assert (rel["candidate_key_a"], rel["candidate_key_b"]) == ("customerId", "customer_id")
    assert rel["base_table"] == "orders" and rel["lookup_table"] == "customers"   # customers has the unique key
    assert "1:N" in rel["suggested_cardinality"]
    assert rel["match_rate_pct"] == pytest.approx(75.0)   # 3 of orders' 4 distinct customers exist
    assert any(m["source_a_column"] == "customerId" and m["source_b_column"] == "customer_id" for m in out["schema_differences"])


def test_join_keeps_every_row_of_the_many_side_and_standardizes_dates(two_tables):
    out = execute_multi_table_join(MultiTableJoinPayload(
        table_a_name="orders", table_b_name="customers", join_key_a="customerId", join_key_b="customer_id"))
    assert out["status"] == "JOIN_COMPLETED" and out["total_rows"] == 6
    assert out["matched_rows"] == 5 and out["unmatched_rows"] == 1   # customer 99 has no row
    assert out["unified_table_name"] == "orders_customers_joined"
    assert {"name", "since"} <= set(out["columns"]) and "customer_id" not in out["columns"]
    unified = pd.read_csv(whitebox.UNIFIED_DATASET_PATH)
    assert unified.loc[unified["order_id"] == 1, "since"].iloc[0] == "2025-02-01"   # DD/MM/YYYY -> ISO
    assert out["profile"]["total_rows"] == 6


def test_join_does_not_change_the_cached_profile_of_the_loaded_dataset(two_tables):
    whitebox._LATEST_PROFILING.pop("student_course_score", None)
    whitebox._LATEST_PROFILING.pop("orders", None)
    execute_multi_table_join(MultiTableJoinPayload(
        table_a_name="orders", table_b_name="customers", join_key_a="customerId", join_key_b="customer_id"))
    assert "student_course_score" not in whitebox._LATEST_PROFILING and "orders" not in whitebox._LATEST_PROFILING


def test_join_rejects_a_key_that_is_not_a_column(two_tables):
    with pytest.raises(HTTPException) as err:
        execute_multi_table_join(MultiTableJoinPayload(
            table_a_name="orders", table_b_name="customers", join_key_a="nope", join_key_b="customer_id"))
    assert err.value.status_code == 400


def test_the_join_step_lists_only_tables_the_user_loaded(two_tables):
    names = [t["name"] for t in list_multi_table_candidates()["tables"]]
    assert names[0] == "orders" and {"customers", "unrelated"} <= set(names)
    assert "student_demographics" not in names   # the bundled demo is offered only with the student dataset


def test_preview_describes_the_chosen_tables(two_tables):
    out = preview_multi_tables(table_a="customers", table_b="orders")
    assert out["table_a"]["name"] == "customers" and out["table_b"]["name"] == "orders"
    assert out["table_b"]["total_rows"] == 6 and "customerId" in out["table_b"]["columns"]


def test_run_all_on_another_dataset_does_not_rewrite_the_result_files_or_fail(two_tables, tmp_path, monkeypatch):
    monkeypatch.setattr(whitebox, "OUTPUT_DIR", str(tmp_path))
    out = run_all_stages()
    assert out["dataset_name"] == "orders"
    assert out["execution_result"] is not None and out["profile_data"]["total_rows"] == 6
    assert out["stages"]["benchmark"]["status"] == "NOT_APPLICABLE"
    assert out["stages"]["analytics"]["status"] == "NOT_APPLICABLE"
    assert out["multi_table_analysis"] is None and out["join_result"] is None
    for name in ("clean_dataset_run.csv", "review_queue_run.csv", "quarantine_lake_run.csv"):
        assert not (tmp_path / name).exists()   # persist_outputs=False
