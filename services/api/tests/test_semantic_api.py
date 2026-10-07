import json
import os
import sys

import pandas as pd
import pytest
from elastic_transport import ConnectionError as TransportConnectionError
from elasticsearch import ApiError, ConflictError
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_llm, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES, _api_error  # noqa: E402

RAW = pd.DataFrame({"Order_ID": ["A", "B", "C"], "Customer_Name": ["x", "y", "z"], "Region": ["N", "S", "N"],
                    "Total_Sales": [10.0, 20.0, 30.0], "Profit": [1.0, 2.0, 3.0]})
DF, PROFILE = dashboard_data.prepare_frame(RAW.copy())
BASE = "/api/v1/semantic/sales"
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "usd", "default_agg": "sum", "pii": False}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent"}
BODY = {"columns": {"Total_Sales": USD}, "metrics": [GROSS]}


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    monkeypatch.setattr(semantic, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client(logged_in=True):
    app = FastAPI()
    app.include_router(semantic.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


def test_every_route_needs_a_login(es):
    c = client(logged_in=False)
    assert c.get(BASE).status_code == 401
    assert c.post(f"{BASE}/draft").status_code == 401
    assert c.put(f"{BASE}/draft", json=BODY).status_code == 401
    assert c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}).status_code == 401


def test_first_look_is_the_rule_guess_with_current_values(es):
    view = client().get(BASE).json()
    assert view["status"] == "none" and view["version"] == 0
    assert view["hidden_columns"] == ["Customer_Name"]
    assert view["effective"]["columns"]["Order_ID"]["role"] == "identifier"
    assert view["metric_values"] == {"row_count": 3, "total_total_sales": 60.0, "total_profit": 6.0}


def test_ai_draft_without_a_key_saves_the_rule_draft(es):
    view = client().post(f"{BASE}/draft").json()
    assert view["engine"] == "rules" and view["status"] == "draft"
    assert view["warnings"][0].startswith("ใช้ร่างแบบกฎแทน AI")
    stored = es.docs[semantic.SEMANTIC_INDEX]["sales"]["draft"]
    assert isinstance(stored["content_json"], str) and "columns" not in stored
    assert client().get(BASE).json()["status"] == "draft"


def test_ai_draft_with_groq(es, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", lambda messages, key, model: json.dumps(BODY, ensure_ascii=False))
    view = client().post(f"{BASE}/draft").json()
    assert view["engine"] == "groq" and view["model"] == "openai/gpt-oss-120b"
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert view["metric_values"]["gross_margin"] == 10.0
    assert view["hidden_columns"] == ["Customer_Name"]


def test_saving_edits_as_a_draft(es):
    body = {"columns": {"Profit": {"role": "measure", "unit": "dollars"}}, "metrics": []}
    view = client().put(f"{BASE}/draft", json=body).json()
    assert view["draft"]["generated_by"] == "user" and view["draft"]["updated_by"] == "tester"
    assert any("dollars" in w for w in view["warnings"])
    assert set(view["draft"]["columns"]) == {c["name"] for c in PROFILE["columns"]}


def test_approval_versions_clears_the_draft_and_refuses_a_stale_base(es):
    c = client()
    c.put(f"{BASE}/draft", json=BODY)
    first = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}).json()
    assert first["status"] == "approved" and first["version"] == 1 and first["draft"] is None
    assert first["approved"]["approved_by"] == "tester" and len(first["history"]) == 1
    assert set(first["approved"]["columns"]) == {c["name"] for c in PROFILE["columns"]}
    assert first["metric_values"]["gross_margin"] == 10.0
    stale = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    assert stale.status_code == 409 and "โหลดใหม่" in stale.json()["detail"]
    second = c.post(f"{BASE}/approve", json={**BODY, "base_version": 1}).json()
    assert second["version"] == 2 and len(second["history"]) == 2


def test_a_new_column_makes_the_approval_outdated(es, monkeypatch):
    client().post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    df, profile = dashboard_data.prepare_frame(RAW.assign(Coupon=["a", "b", "c"]))
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (df, profile))
    view = client().get(BASE).json()
    assert view["status"] == "approved_outdated" and view["drift"]["new_columns"] == ["Coupon"]


def test_without_elasticsearch_reading_still_hides_personal_columns_and_writing_is_refused(es, monkeypatch):
    def offline():
        raise HTTPException(status_code=503, detail="Elasticsearch service is offline")

    monkeypatch.setattr(semantic, "get_es_client", offline)
    view = client().get(BASE).json()
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]
    assert client().put(f"{BASE}/draft", json=BODY).status_code == 503


def test_unknown_dataset_is_404(es, monkeypatch):
    def missing(name):
        raise HTTPException(status_code=404, detail="Delta log not found")

    monkeypatch.setattr(dashboard_data, "load_active_dataset", missing)
    assert client().get(BASE).status_code == 404


def test_a_failing_read_counts_as_unavailable_and_still_hides():
    class Broken(FakeES):
        def search(self, *args, **kwargs):
            raise ConnectionError("es down")

    broken = Broken()
    broken.index(semantic.SEMANTIC_INDEX, "sales", {"table_name": "sales"})
    view = semantic.load_view("sales", PROFILE, broken)
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]


WRITES = [("post", "/draft", None), ("put", "/draft", BODY), ("post", "/approve", {**BODY, "base_version": 0})]


def send(c, verb, suffix, body):
    return getattr(c, verb)(BASE + suffix, **({"json": body} if body is not None else {}))


@pytest.mark.parametrize("error", [ConnectionError("es down"), TransportConnectionError("es down"), TimeoutError("slow")])
@pytest.mark.parametrize("failing,verb,suffix,body", [
    ("search", *WRITES[0]),  # only the AI draft reads with a search (read_doc)
    *[(failing, *write) for failing in ("get", "index") for write in WRITES],
])
def test_an_es_failure_after_the_client_is_warm_is_a_503(es, monkeypatch, failing, error, verb, suffix, body):
    def boom(*args, **kwargs):
        raise error

    es.index(semantic.SEMANTIC_INDEX, "sales", {"table_name": "sales"})  # the index exists, so read_doc searches
    monkeypatch.setattr(es, failing, boom)
    r = send(client(), verb, suffix, body)
    assert r.status_code == 503 and r.json()["detail"] == "Elasticsearch service is offline"


def test_an_es_api_error_is_a_503_too(es, monkeypatch):
    def boom(*args, **kwargs):
        raise _api_error(ApiError, 500, "boom")

    monkeypatch.setattr(es, "index", boom)
    assert client().put(f"{BASE}/draft", json=BODY).status_code == 503


def test_a_corrupt_stored_document_is_not_reported_as_elasticsearch_being_down(es):
    es.index(semantic.SEMANTIC_INDEX, "sales", {"table_name": "sales", "draft": {"content_json": "{not json"}})
    with pytest.raises(ValueError):
        client().put(f"{BASE}/draft", json=BODY)


def race_once(es, monkeypatch, other_writer):
    """The first read of the next request sees the document as it was, then another
    writer changes it before the request writes (the lost-update window)."""
    real_get = es.get
    state = {"armed": True}

    def get(index, id):
        try:
            return real_get(index=index, id=id)
        finally:
            if state["armed"]:
                state["armed"] = False
                other_writer()

    monkeypatch.setattr(es, "get", get)


def test_a_stale_draft_save_does_not_revert_an_approval(es, monkeypatch):
    c = client()
    c.put(f"{BASE}/draft", json=BODY)
    race_once(es, monkeypatch, lambda: c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}))
    view = c.put(f"{BASE}/draft", json={"columns": {"Profit": {"role": "measure", "unit": "dollars"}}, "metrics": []}).json()
    assert view["version"] == 1 and view["approved"]["approved_by"] == "tester"
    stored = semantic.decode_doc(es.docs[semantic.SEMANTIC_INDEX]["sales"])
    assert stored["approved"]["version"] == 1 and stored["draft"]["generated_by"] == "user"
    assert "_cas" not in es.docs[semantic.SEMANTIC_INDEX]["sales"]


def test_two_approvals_from_the_same_base_give_one_winner(es, monkeypatch):
    c = client()
    c.put(f"{BASE}/draft", json=BODY)
    race_once(es, monkeypatch, lambda: c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}))
    loser = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    assert loser.status_code == 409 and loser.json()["detail"] == "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่"
    assert semantic.decode_doc(es.docs[semantic.SEMANTIC_INDEX]["sales"])["approved"]["version"] == 1


def test_a_second_conflict_gives_up_with_409(es, monkeypatch):
    def conflict(*args, **kwargs):
        raise _api_error(ConflictError, 409, "version_conflict_engine_exception")

    monkeypatch.setattr(es, "index", conflict)
    assert client().put(f"{BASE}/draft", json=BODY).status_code == 409
    assert client().post(f"{BASE}/approve", json={**BODY, "base_version": 0}).status_code == 409


def test_the_first_write_only_creates(es, monkeypatch):
    c = client()
    race_once(es, monkeypatch, lambda: es.index(semantic.SEMANTIC_INDEX, "sales", {"table_name": "sales", "history": []}))
    assert c.put(f"{BASE}/draft", json=BODY).status_code == 200
    assert semantic.decode_doc(es.docs[semantic.SEMANTIC_INDEX]["sales"])["draft"]["updated_by"] == "tester"


def test_a_body_that_is_an_object_with_wrong_typed_parts_is_repaired(es):
    r = client().post(f"{BASE}/approve", json={"columns": [], "metrics": "x", "base_version": 0})
    assert r.status_code == 200
    view = r.json()
    assert view["version"] == 1 and set(view["approved"]["columns"]) == {c["name"] for c in PROFILE["columns"]}
    assert client().put(f"{BASE}/draft", json={"columns": "x"}).status_code == 200


def test_a_body_that_is_not_an_object_is_422(es):
    assert client().put(f"{BASE}/draft", json=[]).status_code == 422
    assert client().post(f"{BASE}/approve", json=[1]).status_code == 422
