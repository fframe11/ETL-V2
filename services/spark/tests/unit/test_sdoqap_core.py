import os
import zipfile

from sdoqap.common.es import es_base_and_auth
from sdoqap.common.names import clean_column_name, normalize_name
from sdoqap.common.settings import load_env_file
from sdoqap.pipeline import registry
from sdoqap.pipeline.context import RunContext


def test_es_url_split_into_base_and_auth():
    assert es_base_and_auth("http://elastic:pw@es:9200") == ("http://es:9200", ("elastic", "pw"))
    assert es_base_and_auth("http://es:9200") == ("http://es:9200", None)


def test_column_name_helpers_match_engine_behaviour():
    assert clean_column_name("Order (ID)") == "Order_ID"
    assert clean_column_name("a,,b") == "a_b"
    assert normalize_name("Student ID") == normalize_name("student_id") == "studentid"


def test_env_file_loaded_without_overriding(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("SDOQAP_T1=from_file\nSDOQAP_T2=from_file\n# c=d\n")
    nested = tmp_path / "a" / "b"
    nested.mkdir(parents=True)
    monkeypatch.setenv("SDOQAP_T2", "from_env")
    monkeypatch.delenv("SDOQAP_T1", raising=False)
    load_env_file(str(nested))
    assert os.environ["SDOQAP_T1"] == "from_file"
    assert os.environ["SDOQAP_T2"] == "from_env"


def test_run_stages_runs_in_order_and_times_each(monkeypatch):
    monkeypatch.setattr(registry, "STAGES", {})
    seen = []

    @registry.stage("one", "หนึ่ง", "transform")
    def one(ctx):
        seen.append("one")
        return ctx

    @registry.stage("two", "สอง", "transform")
    def two(ctx):
        seen.append("two")
        return ctx

    ctx = RunContext(spark=None, table_name="t", run_id="r", primary_key="id", date_column=None, schema_spec={}, rules={})
    registry.run_stages(["two", "one"], ctx)
    assert seen == ["two", "one"]
    assert set(ctx.metrics["stage_seconds"]) == {"one", "two"}


def test_pk_cols_normalises_single_and_composite_keys():
    base = dict(spark=None, table_name="t", run_id="r", date_column=None, schema_spec={}, rules={})
    assert RunContext(primary_key="id", **base).pk_cols == ["id"]
    assert RunContext(primary_key=["a", "b"], **base).pk_cols == ["a", "b"]


def test_ship_package_zips_sdoqap(spark):
    from sdoqap.common.ship import ship_package
    path = ship_package(spark)
    with zipfile.ZipFile(path) as z:
        assert "sdoqap/__init__.py" in z.namelist()
        assert "sdoqap/pipeline/context.py" in z.namelist()
