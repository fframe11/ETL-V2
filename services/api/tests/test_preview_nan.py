import json
import os
import sys

import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")

from app.api import data_export  # noqa: E402


@pytest.fixture
def client(monkeypatch):
    # Quarantined rows are the ones with missing values, so NaN is the normal case.
    frame = pd.DataFrame({"student_id": [1, 2, 3], "score": [80.5, np.nan, np.inf],
                          "course": ["DW", None, "ML"],
                          "updated_at": pd.to_datetime(["2026-09-15 10:00:00", None, "2026-09-16 11:00:00"])})
    monkeypatch.setattr(data_export, "read_parquet_folder_to_df", lambda folder: frame)
    app = FastAPI()
    app.include_router(data_export.router)
    return TestClient(app)


@pytest.mark.parametrize("layer", ["active", "quarantine"])
def test_preview_with_missing_values_is_valid_json(client, layer):
    r = client.get(f"/api/v1/export/preview/{layer}/scores")
    assert r.status_code == 200
    body = json.loads(r.text)  # would raise on NaN / Infinity tokens
    assert body["columns"] == ["student_id", "score", "course", "updated_at"]
    assert body["rows"][0]["score"] == 80.5
    assert body["rows"][1]["score"] is None and body["rows"][1]["course"] is None
    assert body["rows"][2]["score"] is None
    assert body["rows"][0]["updated_at"].startswith("2026-09-15T10:00:00")


def test_reddit_preview_with_missing_values_is_valid_json(client):
    r = client.get("/api/v1/export/preview/reddit/python")
    assert r.status_code == 200
    assert json.loads(r.text)["rows"][1]["score"] is None
