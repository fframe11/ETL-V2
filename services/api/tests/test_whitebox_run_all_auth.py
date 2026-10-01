import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import whitebox  # noqa: E402


def client():
    app = FastAPI()
    app.include_router(whitebox.router)
    return TestClient(app)


def test_run_all_needs_a_session_for_get_as_well_as_post():
    # It runs the whole pipeline and writes the output files, so an anonymous GET must not.
    c = client()
    assert c.get("/api/v1/whitebox/run-all").status_code == 401
    assert c.post("/api/v1/whitebox/run-all").status_code == 401
