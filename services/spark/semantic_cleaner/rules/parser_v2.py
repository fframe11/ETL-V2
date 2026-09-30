import os
import yaml
from typing import Dict, Any, List

def parse_yaml_config_v2(yaml_input: str) -> Dict[str, Any]:
    """Prototype parser for DSL Schema v2.0 supporting Hybrid Graph Pipelines."""
    if os.path.isfile(yaml_input):
        with open(yaml_input, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f)
    else:
        config_data = yaml.safe_load(yaml_input)
        
    if not config_data:
        raise ValueError("Configuration is empty.")
        
    dsl_version = config_data.get("dsl_version")
    if str(dsl_version) != "2.0":
        raise ValueError(f"Unsupported DSL version '{dsl_version}'. Expected '2.0'")
        
    config_version = config_data.get("config_version", "unknown")
    global_cfg = config_data.get("global", {})
    pipeline_cfg = config_data.get("pipeline", {})
    
    models = config_data.get("models", [])
    dictionaries = config_data.get("dictionaries", [])
    columns = config_data.get("columns", [])
    
    compiled_columns = []
    
    for col in columns:
        col_name = col.get("name")
        steps = col.get("pipeline", [])
        post_process = col.get("post_process", [])
        
        compiled_steps = []
        for step in steps:
            step_type = step.get("step")
            if step_type == "exact_match":
                compiled_steps.append({
                    "type": "exact",
                    "source": step.get("source"),
                    "output": step.get("output")
                })
            elif step_type == "fuzzy_match":
                compiled_steps.append({
                    "type": "fuzzy",
                    "threshold": step.get("threshold", 0.85),
                    "output": step.get("output")
                })
            elif step_type == "model_inference":
                compiled_steps.append({
                    "type": "ml_model",
                    "model_name": step.get("model"),
                    "output": step.get("output"),
                    "condition": step.get("condition", {})
                })
            elif step_type == "fallback":
                compiled_steps.append({
                    "type": "fallback",
                    "value": step.get("value")
                })
                
        compiled_columns.append({
            "column": col_name,
            "strategy": pipeline_cfg.get("default_strategy", "cascade"),
            "steps": compiled_steps,
            "post_process": post_process
        })
        
    return {
        "dsl_version": dsl_version,
        "config_version": config_version,
        "schema_mode": global_cfg.get("schema_mode", "strict"),
        "dry_run": global_cfg.get("dry_run", False),
        "models": models,
        "dictionaries": dictionaries,
        "columns": compiled_columns
    }
