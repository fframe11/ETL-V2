"""
E2E Test: Generic Rule Engine — 100% Profile-Driven (No Presets)
Tests: upload -> profile -> recommend -> execute for diverse datasets.
"""
import requests, os, json, sys, time

BASE = "http://localhost:8002/api/v1/whitebox"
LOGIN = "http://localhost:8002/api/v1/auth/login"
ENV_FILE = r"c:\DataEngProj\.env"

def get_creds():
    creds = {}
    with open(ENV_FILE) as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                creds[k.strip()] = v.strip()
    return creds

def login():
    creds = get_creds()
    s = requests.Session()
    # Wait for API to be ready
    for attempt in range(10):
        try:
            r = s.post(LOGIN, json={
                "username": creds.get("ADMIN_USERNAME", "admin"),
                "password": creds.get("ADMIN_PASSWORD", "admin")
            })
            if r.status_code == 200:
                return s
        except Exception:
            time.sleep(1)
    print("FAIL: Could not log in after multiple attempts")
    sys.exit(1)

def test_dataset(s, csv_path, ds_name, expected_issues_min=1):
    print(f"\n{'='*65}")
    print(f"Dataset: {ds_name} ({os.path.basename(csv_path)})")
    print(f"{'='*65}")

    # 1. Upload & Profile
    with open(csv_path, "rb") as f:
        r = s.post(f"{BASE}/profile/upload",
                   files={"file": (os.path.basename(csv_path), f, "text/csv")},
                   data={"dataset_name": ds_name})
    if r.status_code != 200:
        print(f"  FAIL profile ({r.status_code}): {r.text[:300]}")
        return False
    profile = r.json()
    cols = list(profile.get("schema", {}).keys())
    print(f"  Profile: {profile['total_rows']} rows, {profile['total_columns']} cols")
    print(f"  Schema:  {cols}")

    col_profiles = profile.get("columns_profile", {})
    for c, s_ in col_profiles.items():
        if s_.get("data_type") in ("Integer", "Float"):
            print(f"    {c}: {s_['data_type']} min={s_.get('min')} max={s_.get('max')} null={s_.get('null_count')} outliers={s_.get('outlier_count')}")

    # 2. Recommend rules
    r = s.post(f"{BASE}/recommend-rules", json={"dataset_name": ds_name})
    if r.status_code != 200:
        print(f"  FAIL recommend ({r.status_code}): {r.text[:300]}")
        return False
    recs = r.json()
    rules = recs.get("recommendations", [])
    print(f"  Recommendations: {len(rules)} rules")
    for rule in rules:
        print(f"    [{rule['rule_type']}] {rule['field']}: {rule.get('recommended_rule','')} -> {rule['action']}")

    # Verify no student-specific rules leaked
    student_kw = ["student_id", "course", "semester", "study_hours"]
    leaked = [kw for kw in student_kw if any(kw in json.dumps(rule).lower() for rule in rules) and kw not in [c.lower() for c in cols]]
    if leaked:
        print(f"  FAIL: Student keywords leaked: {leaked}")
        return False
    print(f"  OK: No student-specific rules leaked into recommendations")

    # 3. Execute rules on actual dataset
    r = s.post(f"{BASE}/execute", json={"dataset_name": ds_name, "rules": rules})
    if r.status_code != 200:
        print(f"  FAIL execute ({r.status_code}): {r.text[:300]}")
        return False
    res = r.json()
    total_eval = res['clean_rows'] + res['review_rows'] + res['quarantine_rows']
    print(f"  Execution: total={total_eval} clean={res['clean_rows']} review={res['review_rows']} quarantine={res['quarantine_rows']}")
    print(f"  Quality:   {res['raw_quality_score_pct']}%")
    if res.get("error_distribution"):
        print(f"  Errors:    {res['error_distribution']}")

    # Verify row count matches uploaded file
    if total_eval != profile['total_rows']:
        print(f"  FAIL: Execution evaluated {total_eval} rows, expected {profile['total_rows']} rows!")
        return False
    print(f"  OK: Evaluated exactly {total_eval} rows (matches uploaded file)")

    issues = res['review_rows'] + res['quarantine_rows']
    if issues < expected_issues_min:
        print(f"  FAIL: Detected {issues} issues, expected at least {expected_issues_min}")
        return False
    print(f"  OK: Rules successfully caught {issues} data quality issues!")
    return True

if __name__ == "__main__":
    print("E2E Generic Rule Engine Verification Suite")
    print("="*65)
    s = login()
    print("Login successful")

    datasets = [
        (r"c:\DataEngProj\data\test_customer.csv", "customer_data", 2),
        (r"c:\DataEngProj\data\test_employee.csv", "employee_data", 2),
        (r"c:\DataEngProj\data\test_product.csv", "product_data", 2),
        (r"c:\DataEngProj\data\test_iot.csv", "iot_sensor_data", 2),
    ]

    results = {}
    for path, name, min_issues in datasets:
        if os.path.exists(path):
            results[name] = test_dataset(s, path, name, min_issues)
        else:
            print(f"\nSKIP: {path} not found")

    print(f"\n{'='*65}")
    print("TEST SUMMARY")
    all_passed = True
    for n, ok in results.items():
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_passed = False
        print(f"  {n:<20}: {status}")

    print(f"\nOverall Result: {'ALL PASS' if all_passed else 'SOME FAILED'}")
    sys.exit(0 if all_passed else 1)
