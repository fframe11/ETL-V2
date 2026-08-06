import json
import requests

def main():
    print("--- Updating Elasticsearch Rules Registry for grocery_sales ---")
    
    es_url = "http://localhost:9200/sdoqap_rules_registry/_doc/grocery_sales"
    auth = ("elastic", "sdoqap_secure")
    
    # 1. Fetch current rules
    r = requests.get(es_url, auth=auth)
    if r.status_code == 200:
        doc = r.json()["_source"]
    else:
        print(f"Error fetching doc: {r.text}")
        return
        
    # 2. Append/Update semantic_standardize rule to remediation_rules list
    remediation_rules = [
        # Fillna for ยอดขายรวม (if missing, but we also calculate it)
        {
            "column": "ยอดขายรวม",
            "type": "fillna",
            "value": 0.0
        },
        # Calculate rule for ยอดขายรวม if null
        {
            "column": "ยอดขายรวม",
            "type": "calculate",
            "expression": "จำนวน * ราคาต่อหน่วย",
            "condition": "ยอดขายรวม IS NULL"
        },
        # Semantic standardize rule for รายการสินค้า
        {
            "column": "รายการสินค้า",
            "type": "auto_strategy",
            "strategies": ["clean", "categorize", "semantic_expand"],
            "confidence_threshold": 0.50,
            "keep_original": True,
            "output_column": "หมวด_semantic",
            "categories": {
                "coke": "น้ำอัดลม",
                "pepsi": "น้ำอัดลม",
                "น้ำเปล่า": "น้ำดื่ม",
                "ยาสีฟัน": "ของใช้ส่วนตัว",
                "แปรงสีฟัน": "ของใช้ส่วนตัว",
                "สบู่": "ของใช้ส่วนตัว"
            },
            "fallback": "อื่นๆ"
        }
    ]
    
    doc["remediation_rules"] = remediation_rules
    
    # 3. Save back to Elasticsearch
    r_save = requests.post(es_url, json=doc, auth=auth)
    if r_save.status_code in (200, 201):
        print("Successfully updated rules in Elasticsearch:")
        print(json.dumps(remediation_rules, indent=2, ensure_ascii=False))
    else:
        print(f"Error saving rules: {r_save.text}")

if __name__ == "__main__":
    main()
