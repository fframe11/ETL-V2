"""
End-to-End Verification Tests for Generic Data Profiling & Profile-Driven Rule Recommendation
=============================================================================================
Tests the full White-Box lifecycle across 5 distinct domains:
1. Student: (student_id, course, score, study_hours)
2. Customer: (customer_id, age, gender, income)
3. Employee: (employee_id, department, salary, hire_date)
4. Product: (product_id, category, price, stock)
5. IoT: (device_id, temperature, humidity, timestamp)

Verifies:
- Profiling starts at Data Import and is 100% generic.
- Profile acts as the empirical evidence layer (observed data != business truth).
- Rule recommendations are profile-driven and adapt to the actual dataset.
- No Student-specific rules appear on non-student datasets.
- Clean / Review / Quarantine 3-way segregation works generically.
- Full White-Box traceability: Data -> Profile -> Evidence -> Rule -> Decision.
"""

import os
import sys
import io
import pytest
import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("SESSION_SECRET_KEY", "test-generic-profiling-session")
os.environ.setdefault("ELASTICSEARCH_PASSWORD", "mock")

from app.api import whitebox
from app.api.auth import require_session


@pytest.fixture
def client(tmp_path, monkeypatch):
    out = tmp_path / "out"
    out.mkdir()
    working_csv = str(out / "working_dataset.csv")
    state_json = str(tmp_path / "workflow_state.json")

    monkeypatch.setattr(whitebox, "OUTPUT_DIR", str(out))
    monkeypatch.setattr(whitebox, "WORKING_DATASET_PATH", working_csv)
    monkeypatch.setattr(whitebox, "_WORKFLOW_STATE_PATH", state_json)

    # Reset in-memory caches
    whitebox._LATEST_PROFILING.clear()
    whitebox._LATEST_USER_CONTEXT.clear()
    whitebox._LATEST_RECOMMENDATIONS.clear()
    whitebox._LATEST_EXECUTION_RESULTS.clear()

    app = FastAPI()
    app.include_router(whitebox.router)
    app.dependency_overrides[require_session] = lambda: "test-user"
    c = TestClient(app)
    yield c
    whitebox._LATEST_PROFILING.clear()


# ---------------------------------------------------------------------------
# Test 1: Student Dataset (Existing Benchmark Schema)
# ---------------------------------------------------------------------------
def test_student_dataset_profiling_and_recommendations(client):
    csv_data = (
        "student_id,course,semester,score,study_hours,updated_at\n"
        "65001,Math,1/2026,85,4.5,2026-10-01 10:00:00\n"
        "65002,Physics,1/2026,,3.0,2026-10-01 10:00:00\n"
        "65003,Math,1/2026,120,5.0,2026-10-01 10:00:00\n"
        "65004,Math,1/2026,75,45.0,2026-10-01 10:00:00\n"
        "65001,Math,1/2026,85,4.5,2026-10-01 10:00:00\n"  # Duplicate
    ).encode("utf-8")

    # 1. Ingest via Upload
    res = client.post(
        "/api/v1/whitebox/upload-csv",
        files={"file": ("student_data.csv", csv_data, "text/csv")},
        data={"table_name": "student_data"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["rows_ingested"] == 5

    # 2. Verify Profile is established
    profile = body["profile"]
    assert profile["total_rows"] == 5
    assert profile["schema"]["score"] == "Float"
    assert profile["schema"]["study_hours"] == "Float"
    assert profile["columns_profile"]["score"]["null_count"] == 1
    assert profile["duplicate_analysis"]["has_duplicates"] is True

    # 3. Verify Rule Recommendations
    recs = body["recommendations"]
    rec_types = [r["rule_type"] for r in recs]
    rec_fields = [r["field"] for r in recs]

    assert "null_check" in rec_types
    assert "range_check" in rec_types
    assert "auto_iqr" in rec_types
    assert "study_hours" in rec_fields

    # 4. Execute Rules and Verify 3-Way Segregation
    exec_res = client.post(
        "/api/v1/whitebox/execute",
        json={"dataset_name": "student_data", "rules": recs}
    ).json()

    assert exec_res["total_rows_ingested"] == 5
    assert exec_res["quarantine_rows"] >= 2  # Duplicate + Null/Range
    assert exec_res["review_rows"] >= 1      # Study hours outlier (45h)
    assert exec_res["clean_rows"] >= 1       # Row 1 is clean


# ---------------------------------------------------------------------------
# Test 2: Customer Dataset (customer_id, age, gender, income)
# ---------------------------------------------------------------------------
def test_customer_dataset_generic_profiling_and_recommendations(client):
    csv_data = (
        "customer_id,age,gender,income\n"
        "C-101,28,Female,55000\n"
        "C-102,34,Male,62000\n"
        "C-103,,Female,48000\n"              # Missing age
        "C-104,145,Male,75000\n"             # Age domain anomaly (145)
        "C-105,42,Female,3500000\n"          # Extreme income outlier
        "C-106,31,Non-Binary,58000\n"
        "C-101,28,Female,55000\n"            # Duplicate customer_id
    ).encode("utf-8")

    # 1. Ingest via Data Import
    res = client.post(
        "/api/v1/whitebox/upload-csv",
        files={"file": ("customers.csv", csv_data, "text/csv")},
        data={"table_name": "customers"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["rows_ingested"] == 7

    # 2. Verify Profiling is 100% Generic (NO student assumptions)
    profile = body["profile"]
    assert "score" not in profile["schema"]
    assert "study_hours" not in profile["schema"]
    assert profile["schema"]["customer_id"] == "Identifier"
    assert profile["schema"]["age"] in ("Integer", "Float")
    assert profile["schema"]["gender"] == "Categorical"
    assert profile["schema"]["income"] in ("Integer", "Float")

    # Check evidence layer
    age_prof = profile["columns_profile"]["age"]
    assert age_prof["null_count"] == 1
    assert age_prof["max"] == 145.0

    income_prof = profile["columns_profile"]["income"]
    assert income_prof["outlier_count"] >= 1
    assert profile["duplicate_analysis"]["has_duplicates"] is True

    # 3. Verify Rule Recommendations are Profile-Driven
    recs = body["recommendations"]
    rec_fields = [r["field"] for r in recs]
    rec_types = [r["rule_type"] for r in recs]

    # Must NOT have student rules
    assert "score" not in rec_fields
    assert "study_hours" not in rec_fields

    # Must recommend relevant generic rules based on evidence
    assert any("customer_id" in f for f in rec_fields)  # Uniqueness
    assert "age" in rec_fields                          # Null check or Range check
    assert "income" in rec_fields                       # Outlier / Range check
    assert "gender" in rec_fields                       # Category consistency

    # 4. Verify White-Box Traceability & Rationale
    income_rec = next(r for r in recs if r["field"] == "income" and r["rule_type"] == "auto_iqr")
    assert income_rec["action"] == "review"  # Outliers routed to review, not silent delete
    assert any("Tukey" in line for line in income_rec["rationale"])

    # 5. Confirm User Business Context: Customer age must be 18–100
    user_context_payload = {
        "dataset_name": "customers",
        "data_purpose": "Customer Lifetime Value Analytics",
        "criticality": "Critical",
        "update_frequency": "Daily Batch (<= 24h)",
        "field_contexts": {
            "customer_id": {"business_meaning": "Primary Customer ID", "required": True, "known_domain": False},
            "age": {"business_meaning": "Customer Age", "required": True, "known_domain": True, "min_domain": 18.0, "max_domain": 100.0},
            "gender": {"business_meaning": "Customer Gender", "required": False, "known_domain": False},
            "income": {"business_meaning": "Annual Salary", "required": True, "known_domain": False}
        }
    }
    recs_after_context = client.post("/api/v1/whitebox/recommend-rules", json=user_context_payload).json()["recommendations"]

    # Verify age rule now reflects user business context [18, 100]
    age_range_rule = next(r for r in recs_after_context if r["field"] == "age" and r["rule_type"] == "range_check")
    assert age_range_rule["parameters"]["min"] == 18.0
    assert age_range_rule["parameters"]["max"] == 100.0

    # 6. Execute Rules & Verify 3-Way Segregation
    exec_res = client.post(
        "/api/v1/whitebox/execute",
        json={"dataset_name": "customers", "rules": recs_after_context}
    ).json()

    assert exec_res["total_rows_ingested"] == 7
    assert exec_res["quarantine_rows"] >= 2  # Duplicate customer_id, age 145, null age
    assert exec_res["review_rows"] >= 1      # Income outlier
    assert exec_res["clean_rows"] >= 2       # Valid customers


# ---------------------------------------------------------------------------
# Test 3: Employee Dataset (employee_id, department, salary, hire_date)
# ---------------------------------------------------------------------------
def test_employee_dataset_generic_profiling_and_recommendations(client):
    csv_data = (
        "employee_id,department,salary,hire_date\n"
        "EMP001,Engineering,85000,2021-03-15\n"
        "EMP002,Marketing,62000,2022-06-01\n"
        "EMP003,HR,,2020-01-10\n"               # Null salary
        "EMP004,Engineering,950000,2023-08-20\n"  # Extreme executive salary outlier
        "EMP005,Sales,54000,2024-02-01\n"
        "EMP001,Engineering,85000,2021-03-15\n"  # Duplicate employee
    ).encode("utf-8")

    res = client.post(
        "/api/v1/whitebox/upload-csv",
        files={"file": ("employees.csv", csv_data, "text/csv")},
        data={"table_name": "employees"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["rows_ingested"] == 6

    # Verify profiling
    profile = body["profile"]
    assert profile["schema"]["employee_id"] == "Identifier"
    assert profile["schema"]["department"] == "Categorical"
    assert profile["schema"]["salary"] in ("Integer", "Float")
    assert profile["schema"]["hire_date"] == "Date"

    # Verify recommendations
    recs = body["recommendations"]
    rec_fields = [r["field"] for r in recs]
    assert "score" not in rec_fields
    assert any("employee_id" in f for f in rec_fields)
    assert "salary" in rec_fields
    assert "department" in rec_fields
    assert "hire_date" in rec_fields

    # Execute and verify segregation
    exec_res = client.post(
        "/api/v1/whitebox/execute",
        json={"dataset_name": "employees", "rules": recs}
    ).json()

    assert exec_res["quarantine_rows"] >= 2  # Duplicate + Null salary
    assert exec_res["review_rows"] >= 1      # Salary outlier
    assert exec_res["clean_rows"] >= 2


# ---------------------------------------------------------------------------
# Test 4: Product Dataset (product_id, category, price, stock)
# ---------------------------------------------------------------------------
def test_product_dataset_generic_profiling_and_recommendations(client):
    csv_data = (
        "product_id,category,price,stock\n"
        "PRD-01,Electronics,299.99,45\n"
        "PRD-02,Clothing,49.50,-10\n"           # Negative stock anomaly
        "PRD-03,Books,,120\n"                   # Missing price
        "PRD-04,Electronics,45000.00,2\n"       # Luxury price outlier
        "PRD-05,Home,89.00,60\n"
        "PRD-01,Electronics,299.99,45\n"       # Duplicate product ID
    ).encode("utf-8")

    res = client.post(
        "/api/v1/whitebox/upload-csv",
        files={"file": ("products.csv", csv_data, "text/csv")},
        data={"table_name": "products"}
    )
    assert res.status_code == 200
    body = res.json()

    profile = body["profile"]
    assert profile["schema"]["product_id"] == "Identifier"
    assert profile["schema"]["category"] == "Categorical"
    assert profile["schema"]["price"] == "Float"
    assert profile["schema"]["stock"] == "Integer"

    recs = body["recommendations"]
    rec_fields = [r["field"] for r in recs]
    assert "score" not in rec_fields
    assert any("product_id" in f for f in rec_fields)
    assert "price" in rec_fields
    assert "stock" in rec_fields

    # Execute
    exec_res = client.post(
        "/api/v1/whitebox/execute",
        json={"dataset_name": "products", "rules": recs}
    ).json()
    assert exec_res["quarantine_rows"] >= 2
    assert exec_res["clean_rows"] >= 2


# ---------------------------------------------------------------------------
# Test 5: IoT Telemetry Dataset (device_id, temperature, humidity, timestamp)
# ---------------------------------------------------------------------------
def test_iot_dataset_generic_profiling_and_recommendations(client):
    csv_data = (
        "device_id,temperature,humidity,timestamp\n"
        "DEV-01,24.5,60.2,2026-10-05 12:00:00\n"
        "DEV-02,999.0,55.0,2026-10-05 12:01:00\n"  # Extreme sensor temperature error
        "DEV-03,22.1,,2026-10-05 12:02:00\n"        # Null humidity
        "DEV-04,23.0,150.0,2026-10-05 12:03:00\n"  # Out of range humidity (> 100%)
        "DEV-05,25.2,62.0,2026-10-05 12:04:00\n"
        "DEV-01,24.5,60.2,2026-10-05 12:00:00\n"   # Duplicate packet
    ).encode("utf-8")

    res = client.post(
        "/api/v1/whitebox/upload-csv",
        files={"file": ("iot_telemetry.csv", csv_data, "text/csv")},
        data={"table_name": "iot_telemetry"}
    )
    assert res.status_code == 200
    body = res.json()

    profile = body["profile"]
    assert profile["schema"]["device_id"] == "Identifier"
    assert profile["schema"]["temperature"] == "Float"
    assert profile["schema"]["humidity"] == "Float"
    assert profile["schema"]["timestamp"] == "Date"

    recs = body["recommendations"]
    rec_fields = [r["field"] for r in recs]
    assert "score" not in rec_fields
    assert any("device_id" in f for f in rec_fields)
    assert "temperature" in rec_fields
    assert "humidity" in rec_fields
    assert "timestamp" in rec_fields

    # Execute
    exec_res = client.post(
        "/api/v1/whitebox/execute",
        json={"dataset_name": "iot_telemetry", "rules": recs}
    ).json()

    assert exec_res["quarantine_rows"] >= 2
    assert exec_res["review_rows"] >= 1
    assert exec_res["clean_rows"] >= 2


# ---------------------------------------------------------------------------
# Test 6: Evidence vs Business Context Separation Invariant
# ---------------------------------------------------------------------------
def test_evidence_vs_business_context_separation(client):
    """
    Observed data is evidence, not business truth.
    Profiling finding min=17, max=94 must NOT automatically set hard rule 0-100
    without user business context confirmation.
    """
    csv_data = (
        "customer_id,age\n"
        "C1,17\n"
        "C2,25\n"
        "C3,40\n"
        "C4,94\n"
    ).encode("utf-8")

    res = client.post(
        "/api/v1/whitebox/upload-csv",
        files={"file": ("cust_age.csv", csv_data, "text/csv")},
        data={"table_name": "cust_age"}
    )
    body = res.json()
    profile = body["profile"]

    # 1. WHAT THE DATA SHOWS = Profiling Evidence
    age_stat = profile["columns_profile"]["age"]
    assert age_stat["min"] == 17.0
    assert age_stat["max"] == 94.0

    # 2. WHAT THE SYSTEM RECOMMENDS = Rule Recommendation
    recs = body["recommendations"]
    age_rec = next(r for r in recs if r["field"] == "age" and r["rule_type"] == "range_check")
    # Must be marked as suggested pending user business context confirmation
    assert age_rec["parameters"].get("is_suggested") is True
    assert any("evidence, not business truth" in line.lower() for line in age_rec["rationale"])

    # 3. WHAT THE USER WANTS = Business Context (e.g. Adult Customers 18 - 100)
    user_context = {
        "dataset_name": "cust_age",
        "data_purpose": "Adult Banking",
        "criticality": "Critical",
        "field_contexts": {
            "age": {"business_meaning": "Customer Age", "required": True, "known_domain": True, "min_domain": 18.0, "max_domain": 100.0}
        }
    }
    updated_recs = client.post("/api/v1/whitebox/recommend-rules", json=user_context).json()["recommendations"]

    # 4. WHAT THE USER CONFIRMS = Active Rule (age BETWEEN 18 AND 100)
    confirmed_age_rule = next(r for r in updated_recs if r["field"] == "age" and r["rule_type"] == "range_check")
    assert confirmed_age_rule["parameters"]["min"] == 18.0
    assert confirmed_age_rule["parameters"]["max"] == 100.0

    # 5. WHAT HAPPENED TO THE DATA = Validation Decision (Age 17 is quarantined because < 18)
    exec_res = client.post("/api/v1/whitebox/execute", json={"dataset_name": "cust_age", "rules": [confirmed_age_rule]}).json()
    assert exec_res["quarantine_rows"] == 1  # 17 is quarantined
    assert exec_res["clean_rows"] == 3       # 25, 40, 94 are valid
