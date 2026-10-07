import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import semantic_layer as sl  # noqa: E402

KINDS = ("numeric", "categorical", "date", "text")


def profile_of(*columns):
    cols = [{"name": n, "kind": k, "distinct": 5, "missing_pct": 0.0, "min": 0.0, "max": 500.0} for n, k in columns]
    return {"rows": 10, "column_count": len(cols), "columns": cols,
            "kind_counts": {k: sum(c["kind"] == k for c in cols) for k in KINDS}}


PROFILE = profile_of(("Order_ID", "text"), ("Customer_Name", "text"), ("Country", "categorical"),
                     ("Total_Sales", "numeric"), ("Profit", "numeric"))
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio",
         "numerator": {"agg": "sum", "column": "Profit"}, "denominator": {"agg": "sum", "column": "Total_Sales"},
         "format": "percent"}


def approved(columns, metrics=(), version=3):
    return {"columns": columns, "metrics": list(metrics), "version": version, "approved_by": "admin",
            "approved_at": "2026-10-02T00:00:00Z"}


def all_columns(**overrides):
    base = sl.rule_draft(PROFILE)["columns"]
    return {**base, **overrides}


def test_nothing_stored_uses_the_rules():
    view = sl.resolve("sales", None, PROFILE)
    assert view["status"] == "none" and view["version"] == 0 and view["pending_draft"] is False
    assert view["effective"]["columns"]["Total_Sales"]["unit"] == "currency"
    assert [m["id"] for m in view["effective"]["metrics"]] == ["row_count", "total_total_sales", "total_profit"]
    assert view["hidden_columns"] == ["Customer_Name"]
    assert view["drift"] == {"new_columns": [], "missing_columns": []}


def test_a_draft_is_used_until_something_is_approved():
    doc = {"draft": {"columns": all_columns(Total_Sales=USD), "metrics": [GROSS]}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "draft"
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert [m["id"] for m in view["effective"]["metrics"]] == ["gross_margin"]


def test_the_approved_version_wins_and_a_newer_draft_is_pending():
    doc = {"approved": approved(all_columns(Total_Sales=USD), [GROSS]),
           "draft": {"columns": all_columns(Total_Sales=dict(USD, currency="THB")), "metrics": []}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "approved" and view["version"] == 3 and view["pending_draft"] is True
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"


def test_structure_changes_make_the_approved_version_outdated():
    stored = {n: m for n, m in all_columns().items() if n != "Profit"}
    stored["Old_Column"] = {"role": "text", "pii": False}
    doc = {"approved": approved(stored, [GROSS]),
           "draft": {"columns": {"Profit": dict(USD, label="กำไร")}, "metrics": []}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "approved_outdated"
    assert view["drift"] == {"new_columns": ["Profit"], "missing_columns": ["Old_Column"]}
    assert view["effective"]["columns"]["Profit"]["label"] == "กำไร"  # new column taken from the draft
    assert "Old_Column" not in view["effective"]["columns"]


def test_a_person_unhides_a_column_only_by_approving_it():
    unhidden = sl.resolve("sales", {"approved": approved(all_columns(Customer_Name={"role": "text", "pii": False}))}, PROFILE)
    assert "Customer_Name" not in unhidden["hidden_columns"]
    drafted = sl.resolve("sales", {"draft": {"columns": all_columns(Customer_Name={"role": "text", "pii": False}), "metrics": []}}, PROFILE)
    assert drafted["hidden_columns"] == ["Customer_Name"]  # the name rule still hides it
    flagged = sl.resolve("sales", {"draft": {"columns": all_columns(Country={"role": "dimension", "pii": True}), "metrics": []}}, PROFILE)
    assert flagged["hidden_columns"] == ["Customer_Name", "Country"]
    assert flagged["effective"]["columns"]["Country"]["pii"] is True


def test_metrics_that_cannot_be_computed_are_reported_not_used():
    lost = dict(GROSS, id="aov", label="AOV", denominator={"agg": "count_distinct", "column": "Invoice_No"})
    personal = {"id": "buyers", "label": "ผู้ซื้อ", "type": "simple", "measure": {"agg": "count_distinct", "column": "Customer_Name"}}
    view = sl.resolve("sales", {"approved": approved(all_columns(), [GROSS, lost, personal])}, PROFILE)
    assert [m["id"] for m in view["effective"]["metrics"]] == ["gross_margin"]
    reasons = {m["id"]: m["reason"] for m in view["invalid_metrics"]}
    assert "Invoice_No" in reasons["aov"]
    assert "ข้อมูลส่วนบุคคล" in reasons["buyers"]


def test_stored_meaning_that_no_longer_fits_the_column_is_repaired_with_a_warning():
    doc = {"approved": approved(all_columns(Country={"role": "measure", "unit": "currency", "pii": False}))}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["effective"]["columns"]["Country"]["role"] == "dimension"
    assert any("Country" in w for w in view["warnings"])


def test_without_elasticsearch_the_rules_still_hide_personal_columns():
    view = sl.resolve("sales", None, PROFILE, available=False)
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]


def test_apply_to_profile_removes_hidden_columns_and_adds_meaning():
    view = sl.resolve("sales", {"approved": approved(all_columns(Total_Sales=USD))}, PROFILE)
    applied = sl.apply_to_profile(PROFILE, view)
    names = [c["name"] for c in applied["columns"]]
    assert "Customer_Name" not in names and applied["column_count"] == 4
    sales = next(c for c in applied["columns"] if c["name"] == "Total_Sales")
    assert (sales["role"], sales["label"], sales["unit"], sales["currency"]) == ("measure", "ยอดขาย", "currency", "USD")
    country = next(c for c in applied["columns"] if c["name"] == "Country")
    assert country["label"] == "Country" and country["role"] == "dimension"
    assert applied["kind_counts"]["text"] == 1
    assert len(PROFILE["columns"]) == 5  # the original profile is untouched
