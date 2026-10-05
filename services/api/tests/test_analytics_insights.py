import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import analytics  # noqa: E402
from app.api import analytics_insights as insights  # noqa: E402

OLIST_RUN = {
    "table_name": "olist_products_dataset",
    "run_id": "r1",
    "timestamp": "2026-10-05T18:05:14+00:00",
    "quality_score": 66.06,
    "effective_quality_threshold": 90.0,
    "total_records": 32951,
    "quarantined_records": 11184,
    "quarantine_breakdown": {
        "outlier_product_weight_g": 4648,
        "outlier_product_height_cm": 2338,
        "zscore_product_weight_g": 593,
        "null_value_in_product_category_name": 610,
    },
}


def test_old_value_keys_collapse_to_one_key_per_column():
    assert insights.normalize_reason("study_hours=40_0 (expected [-2_0000, 12_0000])") == "outlier_study_hours"
    assert insights.normalize_reason("study_hours=60_0 (expected [-2_0000, 12_0000])") == "outlier_study_hours"
    assert insights.normalize_reason("price_zscore=4_12 (val=price deviates > 3_0σ)") == "zscore_price"
    assert insights.normalize_reason("missing_date") == "missing_date"


def test_reasons_are_classified_with_their_column():
    assert insights.classify_reason("outlier_a") == ("ค่าผิดปกติ (IQR)", "a")
    assert insights.classify_reason("null_value_in_b") == ("ค่าว่าง", "b")
    assert insights.classify_reason("duplicate_records") == ("ข้อมูลซ้ำ", None)
    assert insights.classify_reason("missing_primary_key") == ("คีย์หลักว่าง", None)
    assert insights.classify_reason("something_new")[0] == "อื่น ๆ"


def test_clusters_merge_old_value_keys_and_name_no_invented_source():
    run = {"quarantine_breakdown": {
        "study_hours=40_0 (expected [-2_0000, 12_0000])": 10,
        "study_hours=30_0 (expected [-2_0000, 12_0000])": 5,
        "null_value_in_score": 5,
    }}
    out = insights.build_clusters(run)
    top = out["clusters"][0]
    assert (top["pattern"], top["errors_count"], top["percentage"]) == ("outlier_study_hours", 15, 75.0)
    assert top["label"] == "ค่าผิดปกติ (IQR) · study_hours"
    assert all(c["source"] != "Unknown" for c in out["clusters"])
    assert "75.0%" in out["correlation_analysis"]


def test_low_score_run_gets_a_summary_and_causes_with_numbers():
    recs = insights.build_quality_recommendations(OLIST_RUN)
    assert recs[0]["status"] == "CRITICAL" and "66.06%" in recs[0]["title"] and "90%" in recs[0]["title"]
    assert "11,184 จาก 32,951" in recs[0]["description"]
    by_type = {r["action_type"]: r for r in recs}
    assert "product_weight_g" in by_type["TUNE_OUTLIER_RULE"]["title"]
    assert by_type["TUNE_OUTLIER_RULE"]["link"] == "/rules"
    assert "610" in by_type["FIX_SOURCE_NULLS"]["description"]
    assert "ไม่ช่วย" in by_type["RESTORE_BACKUP"]["description"]  # 66% < 70%: offered, with its limit stated


def test_backup_is_offered_only_below_70_and_explains_when_it_does_not_help():
    run = dict(OLIST_RUN, quality_score=40.0)
    recs = insights.build_quality_recommendations(run)
    backup = [r for r in recs if r["action_type"] == "RESTORE_BACKUP"]
    assert len(backup) == 1 and "ไม่ช่วย" in backup[0]["description"]


def test_passing_run_only_gets_an_ok_summary():
    run = dict(OLIST_RUN, quality_score=95.0)
    recs = insights.build_quality_recommendations(run)
    assert [r["status"] for r in recs] == ["OK"]


def test_recommendations_are_limited_and_run_without_score_has_none():
    assert insights.build_quality_recommendations({"table_name": "t"}) == []
    many = dict(OLIST_RUN, quality_score=85.0, quarantine_breakdown={
        "outlier_a": 5, "null_value_in_b": 4, "duplicate_records": 3, "missing_primary_key": 2, "out_of_range_c": 1,
    })
    recs = insights.build_quality_recommendations(many)
    assert len(recs) == 1 + insights.MAX_QUALITY_RECOMMENDATIONS


# ---- endpoints with a fake Elasticsearch

class _FakeIndices:
    def exists(self, index):
        return True


class _FakeEs:
    def __init__(self, runs, drifts=()):
        self.runs = runs
        self.drifts = list(drifts)
        self.indices = _FakeIndices()

    def _runs_for(self, body):
        term = (body.get("query") or {}).get("term", {}).get("table_name.keyword")
        runs = [r for r in self.runs if not term or r["table_name"].lower() == term["value"].lower()]
        return sorted(runs, key=lambda r: r["timestamp"], reverse=True)

    def count(self, index, body):
        return {"count": len(self._runs_for(body))}

    def search(self, index, body):
        if index == "sdoqap_schema_drifts":
            return {"hits": {"hits": [{"_source": d} for d in self.drifts]}}
        if body.get("size") == 0:  # tables aggregation
            buckets = []
            for name in {r["table_name"] for r in self.runs}:
                rs = self._runs_for({"query": {"term": {"table_name.keyword": {"value": name}}}})
                buckets.append({"key": name, "doc_count": len(rs),
                                "last": {"hits": {"hits": [{"_source": {
                                    "quality_score": rs[0]["quality_score"], "timestamp": rs[0]["timestamp"]}}]}}})
            return {"aggregations": {"t": {"buckets": buckets}}}
        runs = self._runs_for(body)[: body.get("size", 10)]
        return {"hits": {"hits": [{"_source": r} for r in runs]}}


def _patch(monkeypatch, runs, drifts=()):
    monkeypatch.setattr(analytics, "get_es_client", lambda: _FakeEs(runs, drifts))


def test_tables_endpoint_lists_newest_run_first(monkeypatch):
    _patch(monkeypatch, [
        {"table_name": "old", "timestamp": "2026-10-01T00:00:00+00:00", "quality_score": 99.0},
        OLIST_RUN,
    ])
    names = [t["name"] for t in analytics.list_analytics_tables()["tables"]]
    assert names == ["olist_products_dataset", "old"]


def test_projection_reports_run_count_so_the_page_can_explain_an_empty_forecast(monkeypatch):
    _patch(monkeypatch, [OLIST_RUN])
    out = analytics.get_quality_projection(table_name="olist_products_dataset")
    assert out["table_name"] == "olist_products_dataset" and out["runs_count"] == 1
    assert out["projected_scores"] == []  # one run is not enough to forecast


def test_clustering_and_recommendations_follow_the_chosen_table(monkeypatch):
    other = {"table_name": "other_tbl", "timestamp": "2026-10-06T00:00:00+00:00", "quality_score": 50.0,
             "total_records": 10, "quarantined_records": 5, "quarantine_breakdown": {"duplicate_records": 5}}
    _patch(monkeypatch, [OLIST_RUN, other])
    clusters = analytics.get_diagnostic_clustering(table_name="olist_products_dataset")
    assert clusters["table_name"] == "olist_products_dataset"
    assert clusters["clusters"][0]["pattern"] == "outlier_product_weight_g"

    recs = analytics.get_actionable_recommendations(table_name="olist_products_dataset")
    assert recs["latest_run"]["quality_score"] == 66.06
    scopes = [r["scope"] for r in recs["recommendations"]]
    assert scopes == sorted(scopes, key=lambda s: 0 if s == "table" else 1)  # chosen table first
    assert any(r["scope"] == "other" and r["table"] == "other_tbl" for r in recs["recommendations"])
    assert not any(r["scope"] == "table" and r["table"] != "olist_products_dataset" for r in recs["recommendations"])


def test_table_defaults_to_the_newest_run_when_none_is_given(monkeypatch):
    other = {"table_name": "newer_tbl", "timestamp": "2026-10-07T00:00:00+00:00", "quality_score": 91.0,
             "total_records": 4, "quarantined_records": 0}
    _patch(monkeypatch, [OLIST_RUN, other])
    assert analytics.get_actionable_recommendations()["table_name"] == "newer_tbl"
