import os

os.environ.setdefault("ELASTICSEARCH_PASSWORD", "mock")
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret-key-whitebox")


import pytest


@pytest.fixture(autouse=True)
def _isolated_whitebox_state(tmp_path, monkeypatch):
    """Keep tests off the live workflow state and working dataset of a running app.

    The app (or a Docker container sharing the data folder) persists the loaded dataset in
    output_runs/; without this, a test would run against whatever was last uploaded.
    """
    from app.api import whitebox

    out = tmp_path / "whitebox_out"
    out.mkdir()
    monkeypatch.setattr(whitebox, "OUTPUT_DIR", str(out))
    monkeypatch.setattr(whitebox, "WORKING_DATASET_PATH", str(out / "working_dataset.csv"))
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE_PATH", str(tmp_path / "workflow_state.json"))
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE", {
        "dataset_name": "student_course_score",
        "dataset_source": "evaluation",
        **whitebox._dataset_scoped_defaults(),
    })
    caches = (whitebox._LATEST_PROFILING, whitebox._LATEST_RECOMMENDATIONS,
              whitebox._LATEST_USER_CONTEXT, whitebox._LATEST_EXECUTION_RESULTS, whitebox._UPLOADED_DATASETS)
    saved = [dict(c) for c in caches]
    for c in caches:
        c.clear()
    yield
    for c, old in zip(caches, saved):
        c.clear()
        c.update(old)
