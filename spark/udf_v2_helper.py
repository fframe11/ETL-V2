def create_dsl_v2_udf(steps: list, categories: dict, default_fallback: str = "unknown"):
    """Compiles the pipeline steps of a column into a single optimized cascading PySpark worker UDF."""
    from pyspark.sql.types import StructType, StructField, StringType, DoubleType
    from pyspark.sql.functions import udf
    import json
    
    norm_categories = {str(k).lower().strip(): str(v) for k, v in categories.items()}
    
    steps_json = json.dumps(steps)
    categories_json = json.dumps(norm_categories)
    
    schema = StructType([
        StructField("category", StringType(), True),
        StructField("confidence", DoubleType(), True),
        StructField("method", StringType(), True)
    ])
    
    def execute_pipeline(val):
        import json
        
        def hybrid_similarity(s1, s2):
            s1_clean = str(s1).lower().strip()
            s2_clean = str(s2).lower().strip()
            if s1_clean == s2_clean:
                return 1.0
            sub_score = 1.0 if (s2_clean in s1_clean or s1_clean in s2_clean) else 0.0
            tokens1 = set(s1_clean.split())
            tokens2 = set(s2_clean.split())
            overlap = len(tokens1.intersection(tokens2)) / min(len(tokens1), len(tokens2)) if (tokens1 and tokens2) else 0.0
            return (sub_score * 0.5) + (overlap * 0.5)
            
        try:
            local_steps = json.loads(steps_json)
            local_categories = json.loads(categories_json)
            
            if val is None:
                return (default_fallback, 0.0, "fallback")
                
            norm_val = str(val).lower().strip()
            
            for step in local_steps:
                s_type = step.get("type")
                
                # 1. Exact Match Step
                if s_type == "exact":
                    if norm_val in local_categories:
                        return (local_categories[norm_val], 1.0, "exact")
                        
                # 2. Fuzzy Match Step
                elif s_type == "fuzzy":
                    threshold = float(step.get("threshold", 0.85))
                    best_key = None
                    best_score = 0.0
                    for cat_key in local_categories.keys():
                        score = hybrid_similarity(norm_val, cat_key)
                        if score > best_score:
                            best_score = score
                            best_key = cat_key
                            
                    if best_score >= threshold and best_key:
                        return (local_categories[best_key], best_score, "fuzzy")
                        
                # 3. Simulated ML Model Inference Step
                elif s_type == "ml_model":
                    model_name = step.get("model_name", "")
                    
                    if "mbti" in model_name:
                        if "int" in norm_val or "think" in norm_val:
                            return ("Introverted Intuitive Thinking Judging", 0.92, "ml_model")
                        elif "inf" in norm_val or "feel" in norm_val:
                            return ("Introverted Intuitive Feeling Perceiving", 0.88, "ml_model")
                    elif "classifier" in model_name:
                        if "coke" in norm_val or "pepsi" in norm_val:
                            return ("น้ำอัดลม", 0.95, "ml_model")
                        elif "สิงห์" in norm_val or "water" in norm_val:
                            return ("น้ำดื่ม", 0.90, "ml_model")
                            
                # 4. Fallback Default Step
                elif s_type == "fallback":
                    return (step.get("value", default_fallback), 0.0, "fallback")
                    
            return (default_fallback, 0.0, "fallback")
        except Exception as udf_err:
            import traceback
            with open("C:/DataEngProj/udf_error_v2.log", "a", encoding="utf-8") as f_err:
                f_err.write(f"ERROR on val={val}: {udf_err}\n")
                traceback.print_exc(file=f_err)
            raise udf_err
            
    return udf(execute_pipeline, schema)
