import io
import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.whitebox import _read_uploaded_table


def test_reads_csv_bytes():
    content = b"a,b\n1,2\n3,4\n"
    df = _read_uploaded_table("data.csv", content)
    assert list(df.columns) == ["a", "b"]
    assert len(df) == 2


def test_reads_xlsx_bytes():
    buf = io.BytesIO()
    pd.DataFrame({"student_id": ["S1", "S2"], "score": [80, 90]}).to_excel(buf, index=False)
    df = _read_uploaded_table("grocery_raw_sales_data.xlsx", buf.getvalue())
    assert list(df.columns) == ["student_id", "score"]
    assert len(df) == 2


def test_xlsx_bytes_never_go_through_read_csv():
    # Regression check: previously pd.read_csv() ran on Excel's binary zip bytes
    # regardless of extension, raising an unhandled UnicodeDecodeError -> 500.
    buf = io.BytesIO()
    pd.DataFrame({"x": [1]}).to_excel(buf, index=False)
    df = _read_uploaded_table("sheet.xlsx", buf.getvalue())
    assert list(df.columns) == ["x"]


def test_bad_csv_raises_value_error_not_a_raw_exception():
    with pytest.raises(ValueError):
        _read_uploaded_table("broken.csv", b"\xff\xfe\x00not-real-csv")


def test_foreign_schema_profile_is_not_confused_with_the_fixed_dataset():
    # Regression: /upload-csv's non-student-schema branch used to call
    # get_dataset_profile(clean_tbl), which falls back to reading
    # DIRTY_DATASET_PATH (the unrelated, fixed student dataset) on a cache
    # miss -> 404, or worse, an unrelated dataset's numbers. The route now
    # profiles the DataFrame it actually parsed via _compute_profile directly
    # (verified live: uploading a real grocery_raw_sales_data.xlsx with columns
    # ['วันที่', 'รายการสินค้า', 'จำนวน', 'ราคาต่อหน่วย', 'ยอดขายรวม'] now
    # returns HTTP 200 with a profile whose total_rows/total_columns match the
    # uploaded file, not a 404 or the student dataset's shape).
    from app.api.whitebox import _compute_profile

    df = pd.DataFrame({
        "วันที่": ["22-7-2569", "20/07/2026"],
        "รายการสินค้า": ["น้ำตาล 1 กก.", "โค้ก"],
        "จำนวน": [2, 3],
        "ราคาต่อหน่วย": [25, 25],
        "ยอดขายรวม": [50, 75],
    })
    profile = _compute_profile(df, "grocery_raw_sales_data")
    assert profile["total_rows"] == 2
    assert profile["total_columns"] == 5
    assert set(profile["columns_profile"].keys()) == set(df.columns)
