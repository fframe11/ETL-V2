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

RAW = pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.5, -49.5, 150.0], "Profit": [10.0, 50.5, -4.5, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]})
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
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: RAW.copy())
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    dashboard_data._FRAME_CACHE.clear()
    yield fake
    dashboard_data._FRAME_CACHE.clear()


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
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
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


UNREADABLE = "ยังอ่านความหมายคอลัมน์ไม่ได้ จึงส่งออกไม่ได้ในตอนนี้ กรุณาลองใหม่"


def test_without_elasticsearch_a_default_export_is_refused_and_writes_nothing(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)

    def never(*args, **kwargs):
        raise AssertionError("no CSV may be written when the meaning of the columns is unknown")
    monkeypatch.setattr(dashboard_export, "csv_chunks", never)
    res = export()
    assert res.status_code == 503 and res.json()["detail"] == UNREADABLE
    assert "Order_ID" not in res.text


def test_an_unreadable_semantic_document_also_refuses_a_default_export(es, monkeypatch):
    def broken(*args):
        raise RuntimeError("stored document cannot be read")
    monkeypatch.setattr(semantic, "_read_source", broken)
    res = export()
    assert res.status_code == 503 and res.json()["detail"] == UNREADABLE


def test_without_elasticsearch_an_export_that_asks_for_personal_columns_is_refused_too(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)

    def never(*args, **kwargs):
        raise AssertionError("no CSV may be written when the meaning of the columns is unknown")
    monkeypatch.setattr(dashboard_export, "csv_chunks", never)
    res = export(include_personal=True)
    assert res.status_code == 503 and res.json()["detail"] == UNREADABLE
    assert "Customer_Name" not in res.text and "Ann" not in res.text


def test_a_filtered_result_above_the_cap_is_refused_with_a_thai_message(es, monkeypatch):
    monkeypatch.setattr(dashboard_export, "MAX_EXPORT_ROWS", 3)
    res = export()
    assert res.status_code == 413
    assert res.json()["detail"] == "ข้อมูลหลังกรองมี 4 แถว เกินที่ส่งออกได้ 3 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่"
    assert export(selections=NORTH).status_code == 200


def test_an_unknown_dataset_is_a_404(es, monkeypatch):
    def missing(name):
        raise HTTPException(status_code=404, detail=f"ไม่พบชุดข้อมูล {name}")
    monkeypatch.setattr(dashboard_data, "_read_active", missing)
    res = export()
    assert res.status_code == 404 and res.json()["detail"] == "ไม่พบชุดข้อมูล sales"


def test_a_dataset_with_only_personal_columns_has_nothing_to_export(es, monkeypatch):
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: pd.DataFrame({"Customer_Name": ["Ann", "Bob"]}))
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


def messy(monkeypatch):
    """A table whose text columns hold what the dashboard cannot read as numbers or dates: the
    dashboard blanks those cells in its prepared copy, the file must carry them as stored."""
    frame = pd.DataFrame({
        "Region": ["N" if i % 3 == 0 else "S" for i in range(20)],
        "Qty": ["10"] * 18 + ["N/A", "12A"],
        "Seen": ["2025-01-05 10:00:00+07:00"] * 18 + ["unknown", "2025-01-06 00:00:00+07:00"],
        "Note": ["=1+1", "-49.5"] * 10})
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: frame.copy())
    return frame


def test_the_file_carries_the_stored_values_not_the_ones_the_dashboard_could_read(es, monkeypatch):
    prepared, _ = dashboard_data.prepare_frame(messy(monkeypatch))
    assert prepared["Qty"].isna().sum() == 2 and prepared["Seen"].isna().sum() == 1  # what the dashboard blanks
    rows = rows_of(export())
    assert len(rows) == 21
    assert rows[1] == ["N", "10", "2025-01-05 10:00:00+07:00", "'=1+1"]
    assert rows[19] == ["N", "N/A", "unknown", "'=1+1"]
    assert rows[20] == ["S", "12A", "2025-01-06 00:00:00+07:00", "-49.5"]


def test_filtered_rows_are_taken_from_the_stored_values_by_position(es, monkeypatch):
    messy(monkeypatch)
    spec = {"filters": [{"column": "Region"}], "widgets": [{"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}]}
    for region, last in (("N", ["N", "N/A", "unknown"]), ("S", ["S", "12A", "2025-01-06 00:00:00+07:00"])):
        picked = {"Region": {"values": [region]}}
        rendered = client().post("/api/v1/dashboards/render",
                                 json={"table_name": "sales", "spec": spec, "selections": picked}).json()
        rows = rows_of(export(selections=picked))[1:]
        assert len(rows) == rendered["data"]["rows_after_filter"]
        assert [r[0] for r in rows] == [region] * len(rows)
        assert [rows[-1][0], rows[-1][1], rows[-1][2]] == last
    assert len(rows_of(export(selections={"Region": {"values": ["N"]}}))) - 1 == 7


def test_the_stored_values_are_still_without_personal_columns_and_ignore_hidden_selections(es, monkeypatch):
    raw = messy(monkeypatch).assign(Customer_Name=[f"person{i}" for i in range(20)])
    monkeypatch.setattr(dashboard_data, "_read_active", lambda name: raw.copy())
    assert rows_of(export())[0] == ["Region", "Qty", "Seen", "Note"]
    assert "person3" not in export().text
    ignored = {"Customer_Name": {"values": ["person3"]}}
    assert len(rows_of(export(selections=ignored))) - 1 == 20
    assert rows_of(export(include_personal=True))[0][-1] == "Customer_Name"


def test_a_stored_text_number_stays_a_number_and_a_stored_formula_is_neutralised(es, monkeypatch):
    messy(monkeypatch)
    notes = [r[3] for r in rows_of(export())[1:]]
    assert notes[:2] == ["'=1+1", "-49.5"]
