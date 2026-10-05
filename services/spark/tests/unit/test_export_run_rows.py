import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts"))

from export_run_rows import select_run_rows


def test_only_this_runs_rows_without_meta_columns(spark):
    df = spark.createDataFrame(
        [("1", "r1", "x", "t"), ("2", "r2", "y", "t")],
        ["dirty_row_id", "run_id", "reject_reason", "processed_at"],
    )
    out = select_run_rows(df, "r1")
    assert out.columns == ["dirty_row_id", "reject_reason"]
    assert [r["dirty_row_id"] for r in out.collect()] == ["1"]
