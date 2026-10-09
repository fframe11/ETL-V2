"""
SDOQAP Live End-to-End Demo & Verification Script
==================================================
Tests Demo A (Interactive White-Box Workflow) and Demo B (Generic Datasets: Customer & Product)
over the live Public HTTPS Cloudflare Tunnel.
"""

import os
import io
import json
import requests
import pandas as pd
import numpy as np

PUBLIC_BASE = os.getenv("TEST_API_URL", "https://indices-cornell-burlington-physician.trycloudflare.com").rstrip("/")
print(f"[*] Targeting Live Public API: {PUBLIC_BASE}")

session = requests.Session()

# 1. Test Public Health Check
print("\n--- TEST 1: Public Health Check ---")
r_health = session.get(f"{PUBLIC_BASE}/", timeout=15)
print(f"Health Check HTTP {r_health.status_code}: {r_health.json()}")
assert r_health.status_code == 200, "Health check failed"

# 2. Test Authentication (HttpOnly Session Cookie)
print("\n--- TEST 2: Authentication & Session Issuance ---")
login_payload = {"username": "admin", "password": "admin"}
r_login = session.post(f"{PUBLIC_BASE}/api/v1/auth/login", json=login_payload, timeout=15)
print(f"Login HTTP {r_login.status_code}: {r_login.json()}")
assert r_login.status_code == 200, f"Login failed: {r_login.text}"
print(f"Cookies received: {dict(session.cookies)}")

# 3. Test Cluster Services Status
print("\n--- TEST 3: Cluster Services Status ---")
r_services = session.get(f"{PUBLIC_BASE}/api/v1/services/status", timeout=15)
print(f"Services Status HTTP {r_services.status_code}: {json.dumps(r_services.json(), indent=2)}")

# 4. Demo A: Interactive White-Box Workflow on Student Score Dataset
print("\n--- DEMO A: Interactive White-Box Pipeline (Student Scores) ---")
# 4a. Get Profile
r_profile = session.get(f"{PUBLIC_BASE}/api/v1/whitebox/profile", timeout=30)
assert r_profile.status_code == 200, f"Profile failed: {r_profile.text}"
prof_data = r_profile.json()
print(f"[+] Total Rows Profiled: {prof_data.get('total_rows')}")
print(f"[+] Schema: {prof_data.get('schema')}")
print(f"[+] Duplicates Detected: {prof_data.get('duplicate_analysis', {}).get('duplicate_rows_detected')}")

# 4b. Recommend Rules from Evidence
context_payload = {
    "profile": prof_data,
    "context": {
        "dataset_name": "student_scores_demo.csv",
        "domain": "Education",
        "criticality": "HIGH",
        "purpose": "Academic evaluation and progression analytics"
    }
}
r_rules = session.post(f"{PUBLIC_BASE}/api/v1/whitebox/recommend-rules", json=context_payload, timeout=30)
assert r_rules.status_code == 200, f"Recommend rules failed: {r_rules.text}"
rules_data = r_rules.json()
recommendations = rules_data.get("recommendations", [])
print(f"[+] Rules Recommended: {len(recommendations)}")
for i, rec in enumerate(recommendations[:4]):
    print(f"    - [{rec.get('rule_type')}] on {rec.get('field')}: {rec.get('recommended_rule')} (Why: {rec.get('rationale')[0] if rec.get('rationale') else ''})")

# 4c. Execute Transformation, Validation & 3-Way Segregation
exec_payload = {
    "dataset_name": "student_scores_demo.csv",
    "rules": recommendations,
    "apply_reviewer_decisions": False,
    "persist_outputs": True
}
r_exec = session.post(f"{PUBLIC_BASE}/api/v1/whitebox/execute", json=exec_payload, timeout=45)
assert r_exec.status_code == 200, f"Execution failed: {r_exec.text}"
exec_res = r_exec.json()
print(f"[+] Execution Complete (Time: {exec_res.get('execution_time_ms', 0):.2f} ms):")
print(f"    • Total Ingested:      {exec_res.get('total_rows_ingested', 0):,}")
print(f"    • Clean Records:       {exec_res.get('clean_rows', 0):,}")
print(f"    • Review Queue:        {exec_res.get('review_rows', 0):,}")
print(f"    • Quarantine Lake:     {exec_res.get('quarantine_rows', 0):,}")
print(f"    • Raw Quality Score:   {exec_res.get('raw_quality_score_pct', 0):.2f}%")
print(f"    • Post-Clean Score:    {exec_res.get('post_clean_quality_score_pct', 0):.2f}%")
print(f"    • Saved Artifacts:     {exec_res.get('saved_artifacts')}")

# 5. Demo B1: Generic Customer Domain Dataset
print("\n--- DEMO B1: Generic Customer Dataset Profiling ---")
customer_csv = (
    "customer_id,name,age,gender,income\n"
    "C101,Alice Smith,29,Female,55000.0\n"
    "C102,Bob Jones,45,Male,82000.0\n"
    "C103,Charlie Brown,35,Male,67000.0\n"
    "C104,Diana Prince,,Female,95000.0\n"
    "C105,Evan Wright,140,Male,42000.0\n"
    "C106,Fiona Gallagher,31,Female,-5000.0\n"
    "C101,Alice Smith,29,Female,55000.0\n"
)
files = {"file": ("customers.csv", customer_csv.encode("utf-8"), "text/csv")}
r_cust_upload = session.post(f"{PUBLIC_BASE}/api/v1/whitebox/profile/upload", files=files, timeout=30)
assert r_cust_upload.status_code == 200, f"Customer upload failed: {r_cust_upload.text}"
cust_prof = r_cust_upload.json()
print(f"[+] Customer Rows Profiled: {cust_prof.get('total_rows')}")
print(f"[+] Detected Types: {cust_prof.get('schema')}")
print(f"[+] Duplicates: {cust_prof.get('duplicate_analysis', {}).get('duplicate_rows_detected')} (Expected: 1)")

# Recommend rules on Customer
r_cust_rules = session.post(
    f"{PUBLIC_BASE}/api/v1/whitebox/recommend-rules",
    json={"profile": cust_prof, "context": {"dataset_name": "customers.csv", "domain": "CRM"}},
    timeout=30
)
assert r_cust_rules.status_code == 200
cust_recs = r_cust_rules.json().get("recommendations", [])
print(f"[+] Customer Rules Recommended: {len(cust_recs)}")
for r in cust_recs:
    print(f"    - {r.get('rule_type')} on {r.get('field')}: {r.get('recommended_rule')}")

# 6. Demo B2: Generic Product Inventory Dataset
print("\n--- DEMO B2: Generic Product Inventory Dataset Profiling ---")
product_csv = (
    "sku,product_name,category,price,stock_qty,updated_at\n"
    "SKU-001,Wireless Mouse,Electronics,29.99,150,2026-01-10\n"
    "SKU-002,Mechanical Keyboard,Electronics,89.50,45,2026-01-11\n"
    "SKU-003,Ergonomic Chair,Furniture,249.00,-10,2026-01-12\n"
    "SKU-004,USB-C Cable,Electronics,,500,2026-01-12\n"
    "SKU-005,Standing Desk,Furniture,499.00,20,2026-01-13\n"
)
files = {"file": ("products.csv", product_csv.encode("utf-8"), "text/csv")}
r_prod_upload = session.post(f"{PUBLIC_BASE}/api/v1/whitebox/profile/upload", files=files, timeout=30)
assert r_prod_upload.status_code == 200, f"Product upload failed: {r_prod_upload.text}"
prod_prof = r_prod_upload.json()
print(f"[+] Product Rows Profiled: {prod_prof.get('total_rows')}")
print(f"[+] Detected Types: {prod_prof.get('schema')}")

r_prod_rules = session.post(
    f"{PUBLIC_BASE}/api/v1/whitebox/recommend-rules",
    json={"profile": prod_prof, "context": {"dataset_name": "products.csv", "domain": "Retail"}},
    timeout=30
)
assert r_prod_rules.status_code == 200
prod_recs = r_prod_rules.json().get("recommendations", [])
print(f"[+] Product Rules Recommended: {len(prod_recs)}")
for r in prod_recs:
    print(f"    - {r.get('rule_type')} on {r.get('field')}: {r.get('recommended_rule')}")

print("\n==============================================")
print("ALL LIVE PUBLIC VERIFICATION TESTS PASSED 100%")
print("==============================================")
