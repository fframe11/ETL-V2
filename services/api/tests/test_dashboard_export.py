"""The CSV writer of the dashboard export (dashboard_export.py): a UTF-8 BOM for Excel, RFC 4180
quoting, plain values a BI tool can type, and no cell a spreadsheet would run as a formula."""
import csv
import io
import os
import sys
from datetime import date

import numpy as np
import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_export import (  # noqa: E402
    BOM, CHUNK_ROWS, MAX_EXPORT_ROWS, csv_chunks, export_filename, header_labels, safe_text)


def written(df, columns=None, headers=None, chunk_rows=CHUNK_ROWS):
    columns = list(df.columns) if columns is None else columns
    headers = columns if headers is None else headers
    return b"".join(csv_chunks(df, columns, headers, chunk_rows)).decode("utf-8")


def rows_of(text):
    assert text.startswith(BOM)
    return list(csv.reader(io.StringIO(text[len(BOM):], newline="")))


def column(values, dtype=None):
    """The cells of a one-column export, without the header."""
    return [r[0] for r in rows_of(written(pd.DataFrame({"c": pd.Series(values, dtype=dtype)})))[1:]]


def test_the_file_has_a_bom_crlf_rows_and_thai_text():
    df = pd.DataFrame({"ภูมิภาค": ["เหนือ", "ใต้"], "amount": [1.5, 2.0]})
    raw = b"".join(csv_chunks(df, ["ภูมิภาค", "amount"], ["ภูมิภาค", "ยอดขาย"]))
    assert raw.startswith(b"\xef\xbb\xbf")
    assert raw.decode("utf-8") == "﻿ภูมิภาค,ยอดขาย\r\nเหนือ,1.5\r\nใต้,2\r\n"


def test_commas_quotes_and_line_breaks_are_quoted_as_rfc_4180_says():
    values = ["a,b", 'say "hi"', "two\nlines", "plain"]
    text = written(pd.DataFrame({"c": values}))
    assert '"say ""hi"""' in text and '"a,b"' in text
    assert [r[0] for r in rows_of(text)[1:]] == values


def test_cells_a_spreadsheet_would_run_get_an_apostrophe():
    values = ["=SUM(A1:A2)", "+1+1", "-2+3", "@cmd", "\tx", "\rx", "-", "safe", "a=b"]
    assert column(values) == ["'=SUM(A1:A2)", "'+1+1", "'-2+3", "'@cmd", "'\tx", "'\rx", "'-", "safe", "a=b"]


def test_negative_numbers_stay_numbers():
    assert column([-5.0, -0.25, 3.0]) == ["-5", "-0.25", "3"]
    assert column([-7, None], dtype="Int64") == ["-7", ""]
    # a text column holding plain numbers keeps them as numbers too
    assert column(["-12.5", "+66", "-1e3", "+66 81 234 5678"]) == ["-12.5", "+66", "-1e3", "'+66 81 234 5678"]


def test_numbers_are_written_without_an_exponent_and_missing_values_are_empty():
    assert column([1e16, 1.5e-7, 0.1 + 0.2, np.nan, np.inf, -np.inf]) == [
        "10000000000000000", "0.00000015", "0.30000000000000004", "", "", ""]
    assert column([None, "x"]) == ["", "x"]


def test_booleans_are_true_and_false():
    assert column([True, False]) == ["TRUE", "FALSE"]
    assert column([True, None], dtype="boolean") == ["TRUE", ""]


def test_dates_are_iso_and_a_column_of_midnights_has_no_time():
    days = pd.to_datetime(pd.Series(["2025-01-05", None, "2025-02-28"]))
    assert column(days) == ["2025-01-05", "", "2025-02-28"]
    moments = pd.to_datetime(pd.Series(["2025-01-05 10:30:00", "2025-01-06 00:00:00"]))
    assert column(moments) == ["2025-01-05 10:30:00", "2025-01-06 00:00:00"]


def test_a_column_is_written_the_same_way_in_every_chunk():
    moments = pd.to_datetime(pd.Series(["2025-01-05", "2025-01-06", "2025-01-07 08:15:00"]), format="mixed")
    text = written(pd.DataFrame({"t": moments}), chunk_rows=1)
    assert [r[0] for r in rows_of(text)[1:]] == ["2025-01-05 00:00:00", "2025-01-06 00:00:00", "2025-01-07 08:15:00"]


def test_a_mixed_column_writes_each_value_by_its_type():
    values = [1, 2.5, True, None, pd.Timestamp("2025-01-05 08:00"), date(2025, 1, 6), "=x"]
    assert column(values, dtype="object") == ["1", "2.5", "TRUE", "", "2025-01-05 08:00:00", "2025-01-06", "'=x"]


def test_long_exports_are_streamed_in_chunks():
    df = pd.DataFrame({"n": [float(i) for i in range(25)]})
    pieces = list(csv_chunks(df, ["n"], ["n"], chunk_rows=10))
    assert len(pieces) == 4  # the header, then 10 + 10 + 5 rows
    rows = rows_of(b"".join(pieces).decode("utf-8"))
    assert rows[0] == ["n"] and len(rows) == 26 and rows[-1] == ["24"]


def test_only_the_named_columns_are_written_in_the_given_order():
    df = pd.DataFrame({"a": [1.5], "secret": ["Ann"], "b": ["x"]})
    text = written(df, ["b", "a"], ["B", "A"])
    assert rows_of(text) == [["B", "A"], ["x", "1.5"]]
    assert "Ann" not in text


def test_a_header_a_spreadsheet_would_run_is_neutralised():
    text = written(pd.DataFrame({"c": [1.5]}), ["c"], ['=HYPERLINK("http://x")'])
    assert rows_of(text)[0] == ['\'=HYPERLINK("http://x")']


def test_headers_use_the_label_and_tell_shared_labels_apart():
    names = ["Total_Sales", "Net_Sales", "Region", "Order_ID"]
    labels = {"Total_Sales": "ยอดขาย", "Net_Sales": "ยอดขาย", "Region": "", "Order_ID": None}
    assert header_labels(names, labels) == ["ยอดขาย [Total_Sales]", "ยอดขาย [Net_Sales]", "Region", "Order_ID"]
    # a label equal to another column's name: the column that owns the name keeps it
    assert header_labels(["Region", "Area"], {"Region": "", "Area": "Region"}) == ["Region", "Region [Area]"]
    # a clash the brackets cannot settle gets a number
    assert header_labels(["A", "B", "C"], {"A": "X [B]", "B": "X", "C": "X"}) == ["X [B]", "X [B] (2)", "X [C]"]


def test_safe_text_leaves_ordinary_text_alone():
    assert safe_text("ยอดขาย") == "ยอดขาย" and safe_text("") == ""


def test_the_file_name_is_the_table_and_the_day():
    assert export_filename("global_ecommerce_sales", date(2026, 10, 8)) == "global_ecommerce_sales_20261008.csv"
    assert export_filename("_quality_runs", date(2026, 10, 8)) == "quality_runs_20261008.csv"
    assert export_filename('bad name/../x"', date(2026, 1, 2)) == "bad_name_x_20260102.csv"
    assert export_filename("ยอดขาย", date(2026, 1, 2)) == "dataset_20260102.csv"


def test_the_row_cap_stays_below_what_excel_can_open():
    assert MAX_EXPORT_ROWS < 1_048_576


def test_unicode_digits_are_not_plain_numbers():
    assert column(["-١٢", "-１２", "+１", "-12"]) == ["'-١٢", "'-１２", "'+１", "-12"]


def test_a_label_is_neutralised_before_labels_are_told_apart():
    assert header_labels(["a", "b"], {"a": "=x", "b": "'=x"}) == ["'=x [a]", "'=x [b]"]
    assert header_labels(["=x", "b"], {"=x": None, "b": "'=x"}) == ["'=x", "'=x [b]"]


def test_a_writer_that_cannot_be_built_fails_when_it_is_created_not_after_the_response_started():
    df = pd.DataFrame({"a": [1.5], "b": ["x"]})
    with pytest.raises(ValueError):
        csv_chunks(df, ["a", "b"], ["A"])  # two columns, one header: nothing is iterated
    with pytest.raises(KeyError):
        csv_chunks(df, ["a", "nope"], ["A", "N"])
