"""POST /api/v1/dashboards/export: the rows the dashboard is computed from, as a CSV file for the
BI team. Personal columns stay out unless the user asks for them, and every such export is logged."""
import csv
import io
import logging
import os
import re
import sys

import pandas as pd
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_export, dashboard_llm, dashboards, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

DF, PROFILE = dashboard_data.prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.5, -49.5, 150.0], "Profit": [10.0, 50.5, -4.5, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]}))
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
SPEC = {"filters": [{"column": "Region"}], "widgets": [{"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}]}
NORTH = {"Region": {"values": ["N"]}}


def store(es, columns):
    doc = {"table_name": "sales", "draft": None, "history": [],
           "approved": {"columns": columns, "metrics": [], "version": 1}}
    es.index(semantic.SEMANTIC_INDEX, "sales", semantic.encode_doc(doc))


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    store(fake, {"Total_Sales": USD})
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client(logged_in=True):
    app = FastAPI()
    app.include_router(dashboards.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


def export(**body):
    return client().post("/api/v1/dashboards/export", json={"table_name": "sales", **body})


def rows_of(res):
    text = res.content.decode("utf-8")
    assert text.startswith("﻿")
    return list(csv.reader(io.StringIO(text[1:], newline="")))


def test_the_export_needs_a_login(es):
    res = client(logged_in=False).post("/api/v1/dashboards/export", json={"table_name": "sales"})
    assert res.status_code == 401


def test_the_filtered_rows_are_a_csv_file_without_personal_columns(es):
    res = export(selections=NORTH)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert re.fullmatch(r'attachment; filename="sales_\d{8}\.csv"', res.headers["content-disposition"])
    assert rows_of(res) == [["Order_ID", "Region", "ยอดขาย", "Profit"],
                            ["o1", "N", "100", "10"], ["o3", "N", "-49.5", "-4.5"]]
    assert "Customer_Name" not in res.text and "Ann" not in res.text


def test_the_file_has_the_rows_the_dashboard_counts(es):
    rendered = client().post("/api/v1/dashboards/render",
                             json={"table_name": "sales", "spec": SPEC, "selections": NORTH}).json()
    assert len(rows_of(export(selections=NORTH))) - 1 == rendered["data"]["rows_after_filter"] == 2


def test_personal_columns_come_out_only_when_asked_and_the_export_is_logged(es, caplog):
    caplog.set_level(logging.INFO, logger="app.api.dashboards")
    res = export(selections=NORTH, include_personal=True)
    assert res.status_code == 200
    rows = rows_of(res)
    assert rows[0] == ["Order_ID", "Region", "ยอดขาย", "Profit", "Customer_Name"]
    assert [r[-1] for r in rows[1:]] == ["Ann", "Cid"]
    (record,) = [r for r in caplog.records if r.levelno == logging.WARNING]
    message = record.getMessage()
    assert "user=tester" in message and "table=sales" in message and "rows=2" in message
    assert "Customer_Name" in message and "Ann" not in message and "Cid" not in message


def test_an_export_without_personal_columns_is_logged_as_info(es, caplog):
    caplog.set_level(logging.INFO, logger="app.api.dashboards")
    export()
    assert [r.levelno for r in caplog.records if "Dashboard CSV export" in r.getMessage()] == [logging.INFO]


@pytest.mark.parametrize("value", ["true", "yes", 1])
def test_only_a_json_true_lets_personal_columns_out(es, value):
    assert export(include_personal=value).status_code == 422


def test_a_selection_on_a_hidden_column_is_ignored_as_render_ignores_it(es):
    personal = {"Customer_Name": {"values": ["Ann"]}}
    assert len(rows_of(export(selections=personal))) - 1 == 4
    assert len(rows_of(export(selections=personal, include_personal=True))) - 1 == 4


def test_malformed_selections_are_ignored_and_a_non_object_is_a_422(es):
    assert len(rows_of(export(selections={"Region": "N", "Nope": {"values": ["x"]}}))) - 1 == 4
    assert export(selections=["Region"]).status_code == 422


def test_a_column_the_approved_meaning_marks_personal_stays_out(es):
    store(es, {"Total_Sales": USD, "Region": {**USD, "role": "dimension", "label": "ภาค", "unit": None,
                                               "currency": None, "default_agg": None, "pii": True}})
    assert rows_of(export())[0] == ["Order_ID", "ยอดขาย", "Profit"]


def test_without_elasticsearch_the_name_rules_still_hide_personal_columns(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)
    assert rows_of(export())[0] == ["Order_ID", "Region", "Total_Sales", "Profit"]


def test_a_filtered_result_above_the_cap_is_refused_with_a_thai_message(es, monkeypatch):
    monkeypatch.setattr(dashboard_export, "MAX_EXPORT_ROWS", 3)
    res = export()
    assert res.status_code == 413
    assert res.json()["detail"] == "ข้อมูลหลังกรองมี 4 แถว เกินที่ส่งออกได้ 3 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่"
    assert export(selections=NORTH).status_code == 200


def test_an_unknown_dataset_is_a_404(es, monkeypatch):
    def missing(name):
        raise HTTPException(status_code=404, detail=f"ไม่พบชุดข้อมูล {name}")
    monkeypatch.setattr(dashboard_data, "load_active_dataset", missing)
    res = export()
    assert res.status_code == 404 and res.json()["detail"] == "ไม่พบชุดข้อมูล sales"


def test_a_dataset_with_only_personal_columns_has_nothing_to_export(es, monkeypatch):
    only = dashboard_data.prepare_frame(pd.DataFrame({"Customer_Name": ["Ann", "Bob"]}))
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: only)
    res = export()
    assert res.status_code == 422 and res.json()["detail"] == "ไม่มีคอลัมน์ที่ส่งออกได้ ทุกคอลัมน์เป็นข้อมูลส่วนบุคคล"
    assert rows_of(export(include_personal=True)) == [["Customer_Name"], ["Ann"], ["Bob"]]


def test_one_export_reads_the_semantic_view_once_and_never_calls_the_ai(es, monkeypatch):
    calls = []
    real = semantic.load_view

    def counting(*args):
        calls.append(args[0])
        return real(*args)

    def never(*args, **kwargs):
        raise AssertionError("the export must not call the AI")
    monkeypatch.setattr(semantic, "load_view", counting)
    monkeypatch.setattr(dashboard_llm, "call_groq", never)
    assert export(selections=NORTH, include_personal=True).status_code == 200
    assert calls == ["sales"]
