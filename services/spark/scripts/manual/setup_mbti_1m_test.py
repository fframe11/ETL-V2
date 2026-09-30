import requests

def main():
    print("--- Registering mbti_1M Schema and Rules in Elasticsearch ---")
    
    es_auth = ("elastic", "sdoqap_secure")
    
    # 1. Register Schema
    schema_url = "http://localhost:9200/sdoqap_schema_registry/_doc/mbti_1M"
    schema_doc = {
        "table_name": "mbti_1M",
        "primary_key": "row_hash",
        "date_column": None,
        "schema_spec": {
            "author": "string",
            "text": "string",
            "label": "string",
            "EI": "string",
            "NS": "string",
            "TF": "string",
            "JP": "string"
        }
    }
    r_schema = requests.post(schema_url, json=schema_doc, auth=es_auth)
    if r_schema.status_code in (200, 201):
        print("Successfully registered mbti_1M Schema.")
    else:
        print(f"Error registering schema: {r_schema.text}")
        
    # 2. Register Rules
    rules_url = "http://localhost:9200/sdoqap_rules_registry/_doc/mbti_1M"
    rules_doc = {
        "null_primary_key": {
            "enabled": True,
            "severity": "critical",
            "mode": "strict"
        },
        "duplicate_check": {
            "enabled": False,
            "severity": "critical",
            "mode": "strict"
        },
        "null_checks": {
            "mode": "adaptive",
            "default_tolerance": 0.05,
            "learn_from_history": True,
            "column_overrides": {}
        },
        "schema_evolution": {
            "allow_new_columns": False,
            "max_columns": 50,
            "require_approval": True
        },
        "ingestion_guard": {
            "strict_csv_guard": False
        },
        "value_range": {
            "mode": "auto",
            "method": "iqr",
            "iqr_multiplier": 1.5,
            "column_overrides": {}
        },
        "freshness_threshold_hours": {
            "mode": "strict",
            "base_value": None,
            "learn_from_history": False
        },
        "quality_score_threshold": {
            "mode": "adaptive",
            "base_value": 90.0,
            "min_value": 70.0,
            "adjustment_window_runs": 15
        },
        "ai_advisor": {
            "enabled": False,
            "trigger": "on_anomaly",
            "model": "llama-3.3-70b-versatile",
            "max_rows_to_analyze": 50,
            "confidence_threshold": 0.7
        },
        "remediation_rules": [
            # Auto Strategy rule for label (should match categorical_mapping because cardinality is 16 < 50)
            {
                "column": "label",
                "type": "auto_strategy",
                "strategies": ["clean", "categorize", "semantic_expand"],
                "confidence_threshold": 0.50,
                "keep_original": True,
                "output_column": "label_semantic",
                "categories": {
                    "isfp": "Introverted Sensing Feeling Perceiving",
                    "intj": "Introverted Intuitive Thinking Judging",
                    "infp": "Introverted Intuitive Feeling Perceiving",
                    "infj": "Introverted Intuitive Feeling Judging"
                },
                "fallback": "อื่นๆ"
            },
            # Auto Strategy rule for author (should match preserve_mode because cardinality is huge)
            {
                "column": "author",
                "type": "auto_strategy",
                "strategies": ["clean", "categorize", "semantic_expand"],
                "confidence_threshold": 0.50,
                "keep_original": True,
                "output_column": "author_semantic",
                "categories": {},
                "fallback": "unknown_author"
            }
        ]
    }
    r_rules = requests.post(rules_url, json=rules_doc, auth=es_auth)
    if r_rules.status_code in (200, 201):
        print("Successfully registered mbti_1M Rules.")
    else:
        print(f"Error registering rules: {r_rules.text}")

if __name__ == "__main__":
    main()
