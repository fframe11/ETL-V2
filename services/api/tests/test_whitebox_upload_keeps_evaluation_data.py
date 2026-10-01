import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import whitebox  # noqa: E402
from app.api.auth import require_session  # noqa: E402

HEADER = "dirty_row_id,record_id,student_id,course,score,semester,study_hours,updated_at\n"
EVALUATION = (HEADER + "".join(f"{i},{i},{65000 + i},Python,{60 + i},1/2026,4,2026-09-15 10:00:00\n" for i in range(1, 6))).encode()
UPLOADED = ("student_id,course,semester,score,study_hours,updated_at\n"
            "91001,Python,2/2026,70,3,2026-09-20 10:00:00\n"
            "91002,Python,2/2026,,4,2026-09-20 10:00:00\n"
            "91003,Python,2/2026,75,5,2026-09-20 10:00:00\n").encode()


@pytest.fixture
def client(tmp_path, monkeypatch):
    evaluation = tmp_path / "dirty_dataset.csv"
    evaluation.write_bytes(EVALUATION)
    out = tmp_path / "out"
    out.mkdir()
    monkeypatch.setattr(whitebox, "DIRTY_DATASET_PATH", str(evaluation))
    monkeypatch.setattr(whitebox, "OUTPUT_DIR", str(out))
    monkeypatch.setattr(whitebox, "WORKING_DATASET_PATH", str(out / "working_dataset.csv"))
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE_PATH", str(tmp_path / "state.json"))
    for key, value in (("dataset_source", "evaluation"), ("dataset_name", "student_course_score"),
                       ("source_type", "FILE_UPLOAD"), ("connection_uri", "")):
        monkeypatch.setitem(whitebox._WORKFLOW_STATE, key, value)
    whitebox._LATEST_PROFILING.clear()
    app = FastAPI()
    app.include_router(whitebox.router)
    app.dependency_overrides[require_session] = lambda: "test"
    c = TestClient(app)
    c.evaluation = evaluation
    yield c
    whitebox._LATEST_PROFILING.clear()


def upload(client, content=UPLOADED):
    return client.post("/api/v1/whitebox/upload-csv", files={"file": ("mine.csv", content, "text/csv")},
                       data={"table_name": "mine"})


def test_uploading_a_file_never_overwrites_the_evaluation_dataset(client):
    r = upload(client)
    assert r.status_code == 200 and r.json()["rows_ingested"] == 3
    assert client.evaluation.read_bytes() == EVALUATION


def test_the_engine_works_on_the_uploaded_file_after_an_upload(client):
    upload(client)
    assert whitebox._dataset_path() == whitebox.WORKING_DATASET_PATH
    assert client.get("/api/v1/whitebox/profile").json()["total_rows"] == 3
    assert client.get("/api/v1/whitebox/state").json()["metrics"]["total_rows"] == 3


def test_state_can_switch_back_to_the_evaluation_dataset(client):
    upload(client)
    state = client.post("/api/v1/whitebox/state", json={"dataset_source": "evaluation"}).json()
    assert state["metrics"]["total_rows"] == 5
    assert client.get("/api/v1/whitebox/profile").json()["total_rows"] == 5


def test_an_unknown_dataset_source_is_ignored(client):
    upload(client)
    client.post("/api/v1/whitebox/state", json={"dataset_source": "../../etc/passwd"})
    assert whitebox._WORKFLOW_STATE["dataset_source"] == "upload"


def test_a_missing_working_file_falls_back_to_the_evaluation_dataset(client):
    upload(client)
    os.remove(whitebox.WORKING_DATASET_PATH)
    assert whitebox._dataset_path() == whitebox.DIRTY_DATASET_PATH


def test_benchmark_says_it_does_not_apply_to_an_uploaded_dataset(client):
    upload(client)
    body = client.get("/api/v1/whitebox/benchmark").json()
    assert body["status"] == "NOT_APPLICABLE"
    assert "ground truth" in body["message"].lower()
