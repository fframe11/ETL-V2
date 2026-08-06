import os
import json
import uuid
import yaml
from typing import Dict, Any, Union

def load_rules_registry(table_name: str) -> Dict[str, Any]:
    """Loads current rules configuration from rules_config.json for category dictionaries."""
    candidates = [
        # 1. Mount directory path
        "/opt/spark-apps/rules_config.json",
        # 2. Local relative path
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "rules_config.json"),
        # 3. Project root path
        os.path.join(os.getcwd(), "spark", "rules_config.json"),
        # 4. In CWD
        "rules_config.json"
    ]
    
    config_path = None
    for candidate in candidates:
        if os.path.isfile(candidate):
            config_path = candidate
            break
            
    if not config_path:
        print(f"[DSL PARSER] Warning: rules_config.json not found in search paths. Using empty categories registry.")
        return {}
        
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            full_config = json.load(f)
            table_rules = full_config.get(table_name)
            if table_rules:
                return table_rules
    except Exception as e:
        print(f"[DSL PARSER] Error loading rules config from {config_path}: {e}")
        
    return {}

def parse_yaml_config(yaml_input: Union[str, Dict[str, Any]], table_name: str = None) -> Dict[str, Any]:
    """Parses a YAML string or dict configuration and maps it into the internal engine schema."""
    if isinstance(yaml_input, str):
        # Could be a path or a YAML string
        if os.path.isfile(yaml_input):
            with open(yaml_input, "r", encoding="utf-8") as f:
                config_data = yaml.safe_load(f)
        else:
            config_data = yaml.safe_load(yaml_input)
    else:
        config_data = yaml_input
        
    if not config_data:
        raise ValueError("Invalid YAML configuration: Configuration is empty.")
        
    dsl_version = config_data.get("dsl_version", config_data.get("version"))
    if dsl_version is None:
        raise ValueError("[DSL PARSER] [ERROR] Invalid YAML configuration: 'dsl_version' field is missing.")
    
    # Enforce version compatibility (currently supporting version 1.0)
    supported_versions = [1.0, "1.0"]
    if dsl_version not in supported_versions:
        print(f"[DSL PARSER] [WARN] Unsupported DSL version '{dsl_version}'. Supported versions are {supported_versions}. Running with best-effort backward compatibility.")
        
    config_version = config_data.get("config_version", "unknown")
    global_cfg = config_data.get("global", {})
    columns_cfg = config_data.get("columns", {})
    
    schema_mode = global_cfg.get("schema_mode", "strict")
    execution_id_raw = global_cfg.get("execution_id", "auto")
    dry_run = global_cfg.get("dry_run", False)
    
    if execution_id_raw == "auto":
        execution_id = str(uuid.uuid4())
    else:
        execution_id = execution_id_raw
        
    # Attempt to load categories from local table rules if table name is known
    registry_rules = {}
    if table_name:
        registry_rules = load_rules_registry(table_name)
        
    remediation_rules = []
    
    for col_name, col_cfg in columns_cfg.items():
        # 1. Check for Semantic Rule
        if "semantic" in col_cfg:
            sem_cfg = col_cfg["semantic"]
            if sem_cfg.get("enabled", False):
                # Retrieve categories from registry or directly from config
                categories = sem_cfg.get("categories")
                if not categories and registry_rules:
                    # Look for existing semantic standardize rule for this column
                    for r in registry_rules.get("remediation_rules", []):
                        if r.get("column") == col_name and r.get("type") == "semantic_standardize":
                            categories = r.get("categories")
                            break
                            
                if not categories:
                    print(f"[DSL PARSER] Warning: No category dictionary found for column '{col_name}'. Using empty mapping.")
                    categories = {}
                    
                threshold = sem_cfg.get("threshold", 0.85)
                model_version = sem_cfg.get("model_version", "v1.0")
                dictionary_version = sem_cfg.get("dictionary_version", "v1")
                low_confidence_policy = sem_cfg.get("low_confidence_policy", "map_to_fallback")
                semantic_type = sem_cfg.get("semantic_type", "rule_based")
                fallback = sem_cfg.get("fallback", "original")
                
                output_cfg = col_cfg.get("output", {})
                output_mode = output_cfg.get("mode", "enriched")
                enriched_format = output_cfg.get("enriched_format", "struct")
                preserve_raw = output_cfg.get("preserve_raw", True)
                lineage_mode = output_cfg.get("lineage_mode", "full")
                enabled_lineage_fields = output_cfg.get("enabled_lineage_fields", ["category", "confidence", "method", "version", "processed_at", "semantic_type"])
                
                remediation_rules.append({
                    "column": col_name,
                    "type": "semantic_standardize",
                    "categories": categories,
                    "threshold": threshold,
                    "fallback": fallback,
                    "version": f"{model_version}+{dictionary_version}",
                    "output_mode": output_mode,
                    "enriched_format": enriched_format,
                    "preserve_raw": preserve_raw,
                    "lineage_mode": lineage_mode,
                    "enabled_lineage_fields": enabled_lineage_fields,
                    "low_confidence_policy": low_confidence_policy,
                    "semantic_type": semantic_type
                })
                
        # 2. Check for Cleaning / Strategy Rule
        elif "cleaning" in col_cfg:
            clean_cfg = col_cfg["cleaning"]
            c_type = clean_cfg.get("type")
            if c_type == "numeric":
                remediation_rules.append({
                    "column": col_name,
                    "type": "auto_strategy",
                    "strategies": ["clean"],
                    "confidence_threshold": 0.80,
                    "fallback": "original"
                })
            else:
                # Custom strategy or cast
                to_type = clean_cfg.get("cast_to")
                if to_type:
                    remediation_rules.append({
                        "column": col_name,
                        "type": "cast",
                        "to": to_type
                    })
                    
        # 3. Check for Fallback fillna rule
        elif "fillna" in col_cfg:
            remediation_rules.append({
                "column": col_name,
                "type": "fillna",
                "value": col_cfg["fillna"]
            })
            
    return {
        "schema_mode": schema_mode,
        "execution_id": execution_id,
        "dry_run": dry_run,
        "config_version": config_version,
        "table_name": table_name or registry_rules.get("table_name", "unknown"),
        "remediation_rules": remediation_rules
    }
