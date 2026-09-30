import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import whitebox


def test_connector_is_labelled_simulated_and_invents_no_row_count(monkeypatch):
    monkeypatch.setattr(whitebox, "get_dataset_profile", lambda name: {"total_columns": 3})
    monkeypatch.setattr(whitebox, "_recompute_interactive_state", lambda: {})
    monkeypatch.setattr(whitebox, "_save_workflow_state", lambda: None)
    res = whitebox.ingest_from_connector({"source_type": "RDBMS", "table_name": "t", "host": "db"})
    assert res["simulated"] is True
    assert res["rows_ingested"] is None


def test_connector_reports_real_profile_row_count(monkeypatch):
    monkeypatch.setattr(whitebox, "get_dataset_profile", lambda name: {"total_rows": 1030})
    monkeypatch.setattr(whitebox, "_recompute_interactive_state", lambda: {})
    monkeypatch.setattr(whitebox, "_save_workflow_state", lambda: None)
    res = whitebox.ingest_from_connector({"source_type": "REST_API", "table_name": "t"})
    assert res["rows_ingested"] == 1030
