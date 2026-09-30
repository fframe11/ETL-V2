import sys
import os
import json
import io

# Reconfigure stdout/stderr to UTF-8 to handle Thai characters in Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

# Add parent path to import spark_quality_engine
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from pyspark.sql import SparkSession
from spark_quality_engine import apply_dsl_remediation_rules

def main():
    print("--- Starting Semantic Standardize Rule Verification Test ---")
    
    # Initialize Spark Session locally (standalone client match)
    spark = SparkSession.builder \
        .appName("Test-Semantic-Standardize-Rule") \
        .master("local[*]") \
        .config("spark.sql.execution.pyspark.udf.faulthandler.enabled", "true") \
        .config("spark.python.worker.faulthandler.enabled", "true") \
        .config("spark.executorEnv.PYTHONUTF8", "1") \
        .config("spark.executorEnv.PYTHONIOENCODING", "utf-8") \
        .getOrCreate()
        
    try:
        # 1. Create a dummy DataFrame with target test values
        data = [
            ("2026-08-05", "Coke Zero", 10.0),
            ("2026-08-05", "Pepsi Max", 12.0),
            ("2026-08-05", "น้ำเปล่าสิงห์", 5.0),
            ("2026-08-05", "Unknown Brand x123", 20.0),
            ("2026-08-05", None, 15.0)
        ]
        columns = ["วันที่", "รายการสินค้า", "ราคา"]
        df = spark.createDataFrame(data, columns)
        print("Original DataFrame:")
        df.show()
        
        # 2. Define the semantic standardized rules payload
        rules = {
            "schema_mode": "evolve",
            "remediation_rules": [
                {
                    "column": "รายการสินค้า",
                    "type": "semantic_standardize",
                    "categories": {
                        "coke": "น้ำอัดลม",
                        "pepsi": "น้ำอัดลม",
                        "น้ำเปล่า": "น้ำดื่ม"
                    },
                    "threshold": 0.85,
                    "fallback": "อื่นๆ",
                    "output_mode": "full"
                }
            ]
        }
        
        # 3. Apply the compiler rules
        df_clean = apply_dsl_remediation_rules(df, rules)
        
        # 4. Fetch results by capturing show() stdout to bypass Java 25 collect() and file-writing limitations
        import io
        from contextlib import redirect_stdout
        
        print("Capturing show() output...")
        f_capture = io.StringIO()
        with redirect_stdout(f_capture):
            df_clean.show(truncate=False)
        output_str = f_capture.getvalue()
        
        print("Standardized DataFrame results:")
        print(output_str)
        
        # 5. Parse the ascii table output and assert correctness
        expected_mapped = {
            "coke zero": "น้ำอัดลม",
            "pepsi max": "น้ำอัดลม",
            "น้ำเปล่าสิงห์": "น้ำดื่ม",
            "unknown brand x123": "อื่นๆ",
            "none": "อื่นๆ"
        }
        
        # Simple ASCII table parser
        lines = [line.strip() for line in output_str.splitlines() if line.strip()]
        headers = []
        rows = []
        for line in lines:
            if line.startswith("+"):
                continue
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if not headers:
                headers = parts
            else:
                rows.append(dict(zip(headers, parts)))
                
        for row in rows:
            orig_val = row.get("รายการสินค้า")
            mapped_val = row.get("รายการสินค้า_semantic")
            score_val = row.get("รายการสินค้า_semantic_score")
            method_val = row.get("รายการสินค้า_semantic_method")
            version_val = row.get("รายการสินค้า_semantic_version")
            processed_at_val = row.get("รายการสินค้า_semantic_processed_at")
            
            orig_key = "none" if not orig_val or orig_val.lower() in ("null", "") else orig_val.lower()
            expected_val = expected_mapped.get(orig_key)
            
            print(f"Asserting: Raw={orig_key} -> Got={mapped_val} (Expected={expected_val})")
            assert mapped_val == expected_val, f"Assertion failed: raw={orig_key}, expected={expected_val}, got={mapped_val}"
            
            # Verify lineage columns are present and populated
            assert score_val is not None, f"Missing score for raw={orig_key}"
            assert method_val in ("exact", "fuzzy_token", "fuzzy_ngram", "fallback"), f"Invalid method '{method_val}' for raw={orig_key}"
            assert version_val == "v1.0", f"Invalid version '{version_val}' for raw={orig_key}"
            assert processed_at_val is not None and len(processed_at_val) > 0, f"Missing timestamp for raw={orig_key}"
            print(f"   Lineage OK: score={score_val}, method={method_val}, version={version_val}, ts={processed_at_val}")
            
        print("--- All Semantic Standardize Rule Compiler Assertions PASSED ---")

        # Test Case 2: Clean Only Mode (Verify it cleans syntax in-place and bypasses semantic category matching)
        print("\n--- Starting Clean Only Mode Verification Test ---")
        rules_clean = {
            "remediation_rules": [
                {
                    "column": "รายการสินค้า",
                    "type": "semantic_standardize",
                    "categories": {
                        "coke": "น้ำอัดลม",
                        "pepsi": "น้ำอัดลม",
                        "น้ำเปล่า": "น้ำดื่ม"
                    },
                    "threshold": 0.85,
                    "fallback": "อื่นๆ",
                    "output_mode": "clean_only"
                }
            ]
        }
        df_clean_only = apply_dsl_remediation_rules(df, rules_clean)
        
        print(f"Clean Only Columns: {df_clean_only.columns}")
        assert len(df_clean_only.columns) == 3, f"Clean only mode should keep exactly 3 columns, got {df_clean_only.columns}"
        assert "รายการสินค้า" in df_clean_only.columns
        assert "รายการสินค้า_semantic" not in df_clean_only.columns
        
        # Verify values are cleaned syntactically in-place, but meaning is not converted
        cleaned_rows = df_clean_only.select("รายการสินค้า").collect()
        cleaned_vals = [r["รายการสินค้า"] for r in cleaned_rows]
        print(f"Cleaned In-Place Values: {cleaned_vals}")
        assert "coke zero" in cleaned_vals, "Values should be lowercase and trimmed"
        assert "น้ำอัดลม" not in cleaned_vals, "Clean only mode must NOT map categories semantically"
        print("--- Clean Only Mode Verification PASSED ---")

        # Test Case 3: Semantic Overwrite Mode (Verify it clean meaning in-place, explicit opt-in)
        print("\n--- Starting Semantic Overwrite Mode Verification Test ---")
        rules_overwrite = {
            "remediation_rules": [
                {
                    "column": "รายการสินค้า",
                    "type": "semantic_standardize",
                    "categories": {
                        "coke": "น้ำอัดลม",
                        "pepsi": "น้ำอัดลม",
                        "น้ำเปล่า": "น้ำดื่ม"
                    },
                    "threshold": 0.85,
                    "fallback": "อื่นๆ",
                    "output_mode": "semantic_overwrite"
                }
            ]
        }
        df_overwrite = apply_dsl_remediation_rules(df, rules_overwrite)
        
        print(f"Semantic Overwrite Columns: {df_overwrite.columns}")
        assert len(df_overwrite.columns) == 3, f"Semantic overwrite mode should keep exactly 3 columns, got {df_overwrite.columns}"
        assert "รายการสินค้า" in df_overwrite.columns
        assert "รายการสินค้า_semantic" not in df_overwrite.columns
        
        # Verify values are mapped semantically in-place
        overwrite_rows = df_overwrite.select("รายการสินค้า").collect()
        overwrite_vals = [r["รายการสินค้า"] for r in overwrite_rows]
        print(f"Overwrite In-Place Values: {overwrite_vals}")
        assert "น้ำอัดลม" in overwrite_vals, "Semantic overwrite mode must map categories in-place"
        print("--- Semantic Overwrite Mode Verification PASSED ---")

        # Test Case 4: Schema Guard Override Test (schema_mode=strict, output_mode=full)
        print("\n--- Starting Schema Guard Override Verification Test ---")
        rules_strict_override = {
            "schema_mode": "strict",
            "remediation_rules": [
                {
                    "column": "รายการสินค้า",
                    "type": "semantic_standardize",
                    "categories": {
                        "coke": "น้ำอัดลม",
                        "pepsi": "น้ำอัดลม",
                        "น้ำเปล่า": "น้ำดื่ม"
                    },
                    "threshold": 0.85,
                    "fallback": "อื่นๆ",
                    "output_mode": "full"  # Should be overridden to semantic_overwrite by Schema Guard
                }
            ]
        }
        df_strict_override = apply_dsl_remediation_rules(df, rules_strict_override)
        
        print(f"Strict Override Columns: {df_strict_override.columns}")
        assert len(df_strict_override.columns) == 3, f"Schema Guard should override to keep exactly 3 columns under strict mode, got {df_strict_override.columns}"
        assert "รายการสินค้า" in df_strict_override.columns
        assert "รายการสินค้า_semantic" not in df_strict_override.columns
        
        # Verify values are semantically mapped in-place (because of override to semantic_overwrite)
        override_rows_strict = df_strict_override.select("รายการสินค้า").collect()
        override_vals_strict = [r["รายการสินค้า"] for r in override_rows_strict]
        print(f"Strict Override Values: {override_vals_strict}")
        assert "น้ำอัดลม" in override_vals_strict, "Semantic mapping should have occurred via semantic_overwrite fallback"
        print("--- Schema Guard Override Verification PASSED ---")

        # Test Case 5: Enterprise Features Test (preserve_raw, lineage_mode=minimal, and detailed _meta)
        print("\n--- Starting Enterprise Features Verification Test ---")
        rules_enterprise = {
            "schema_mode": "evolve",
            "execution_id": "test-uuid-9999",
            "remediation_rules": [
                {
                    "column": "รายการสินค้า",
                    "type": "semantic_standardize",
                    "categories": {
                        "coke": "น้ำอัดลม",
                        "pepsi": "น้ำอัดลม",
                        "น้ำเปล่า": "น้ำดื่ม"
                    },
                    "threshold": 0.85,
                    "fallback": "อื่นๆ",
                    "output_mode": "semantic_overwrite",
                    "preserve_raw": True,
                    "version": "v2.5"
                }
            ]
        }
        df_enterprise = apply_dsl_remediation_rules(df, rules_enterprise)
        
        print(f"Enterprise Columns: {df_enterprise.columns}")
        # Columns should be: วันที่, รายการสินค้า (overwritten), ราคา, _raw_รายการสินค้า, _meta (evolve adds _meta) -> total 5 columns
        assert len(df_enterprise.columns) == 5, f"Expected 5 columns, got {df_enterprise.columns}"
        assert "_raw_รายการสินค้า" in df_enterprise.columns
        assert "_meta" in df_enterprise.columns
        
        # Verify raw values backup
        raw_vals = [r["_raw_รายการสินค้า"] for r in df_enterprise.select("_raw_รายการสินค้า").collect()]
        print(f"Backed up Raw Values: {raw_vals}")
        # original values are: Coke Zero, Pepsi Max, น้ำเปล่าสิงห์, etc.
        assert "Coke Zero" in raw_vals or "coke zero" in raw_vals, "Raw values should be preserved in _raw column"
        
        # Verify overwritten semantic values
        semantic_vals = [r["รายการสินค้า"] for r in df_enterprise.select("รายการสินค้า").collect()]
        print(f"Overwritten Values: {semantic_vals}")
        assert "น้ำอัดลม" in semantic_vals, "Original column should contain mapped categories"
        
        # Verify metadata struct details
        meta_row = df_enterprise.select("_meta.*").first()
        print(f"Metadata Struct: schema_mode={meta_row.schema_mode}, contract_enforced={meta_row.contract_enforced}, fallback_columns={meta_row.fallback_columns}, processed_columns={meta_row.processed_columns}, semantic_version={meta_row.semantic_version}, execution_id={meta_row.execution_id}")
        assert meta_row.schema_mode == "evolve"
        assert meta_row.contract_enforced is True
        assert "รายการสินค้า" in meta_row.fallback_columns
        assert "รายการสินค้า" in meta_row.processed_columns
        assert meta_row.semantic_version == "v2.5"
        assert meta_row.execution_id == "test-uuid-9999"
        print("--- Enterprise Features Verification PASSED ---")
        
    finally:
        spark.stop()

if __name__ == "__main__":
    main()
