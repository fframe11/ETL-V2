from pyspark.sql import functions as F

from sdoqap.pipeline.registry import stage


@stage("standardize_dates", "ปรับรูปแบบวันที่ (รวม พ.ศ.)", "transform")
def standardize_dates(ctx):
    clean_df = ctx.clean_df
    # ─── STANDARDIZATION LAYER (Date and Product categorization) ─────────────
    # Date standardization:
    date_col_candidates = [c for c in clean_df.columns if c in ("วันที่", "date", "Date")]
    if date_col_candidates:
        from pyspark.sql.functions import udf
        from pyspark.sql.types import StringType
        
        def parse_and_standardize_date(date_str):
            if not date_str:
                return None
            date_str = str(date_str).strip()
            import re
            date_str = re.sub(r'\s+', ' ', date_str)
            
            # Pattern A: 21 Jul 2026 or 21 July 2026
            match_eng = re.search(r'(\d+)\s+([A-Za-z]+)\s+(\d+)', date_str)
            if match_eng:
                day = int(match_eng.group(1))
                month_str = match_eng.group(2)[:3].lower()
                year = int(match_eng.group(3))
                months = {'jan':1, 'feb':2, 'mar':3, 'apr':4, 'may':5, 'jun':6, 'jul':7, 'aug':8, 'sep':9, 'oct':10, 'nov':11, 'dec':12}
                month = months.get(month_str, 1)
                if year > 2500:
                    year -= 543
                return f"{year:04d}-{month:02d}-{day:02d}"
                
            # Pattern B: split by - or /
            parts = re.split(r'[-/]', date_str)
            if len(parts) == 3:
                try:
                    p0 = int(parts[0])
                    p1 = int(parts[1])
                    p2 = int(parts[2])
                    if p0 > 1000: # yyyy-mm-dd
                        year, month, day = p0, p1, p2
                    else: # dd-mm-yyyy
                        day, month, year = p0, p1, p2
                    if year > 2500:
                        year -= 543
                    return f"{year:04d}-{month:02d}-{day:02d}"
                except ValueError:
                    pass
            return date_str
            
        std_date_udf = udf(parse_and_standardize_date, StringType())
        for dc in date_col_candidates:
            clean_df = clean_df.withColumn(dc, std_date_udf(F.col(dc)))
    ctx.clean_df = clean_df
    return ctx


@stage("standardize_categories", "จัดหมวดค่าตามคำสำคัญ", "transform")
def standardize_categories(ctx):
    clean_df, table_name = ctx.clean_df, ctx.table_name
    _load_standardization_rules = ctx.load_std_rules
    # ─── GENERIC DATA-DRIVEN STANDARDIZATION (from Schema Registry) ──────────
    # Reads `standardization_rules` from the schema registry document in ES.
    # Format in ES doc: "standardization_rules": { "column_name": { "categories": { "CategoryA": ["keyword1", "keyword2"], ... }, "fallback": "Other" } }
    # Zero hardcoding — all rules are stored as data in Elasticsearch.
    try:
        std_rules = _load_standardization_rules(table_name)
        if std_rules:
            from pyspark.sql.functions import udf
            from pyspark.sql.types import StringType
            for col_name, rule_def in std_rules.items():
                if col_name not in clean_df.columns:
                    continue
                categories = rule_def.get("categories", {})
                fallback = rule_def.get("fallback", None)
                if not categories:
                    continue
                # Build a serializable lookup for the UDF closure
                cat_keywords = [(cat_name, [kw.lower() for kw in kws]) for cat_name, kws in categories.items()]
                fb = fallback  # capture for closure

                def make_standardize_udf(cat_kw_list, fallback_val):
                    def standardize_value(val):
                        if not val:
                            return fallback_val
                        v = str(val).strip().lower()
                        if not v:
                            return fallback_val
                        for cat_name, keywords in cat_kw_list:
                            if any(kw in v for kw in keywords):
                                return cat_name
                        return fallback_val if fallback_val else val
                    return standardize_value

                std_udf = udf(make_standardize_udf(cat_keywords, fb), StringType())
                clean_df = clean_df.withColumn(col_name, std_udf(F.col(col_name)))
                print(f"[STANDARDIZATION] Applied data-driven rules for column '{col_name}' ({len(categories)} categories, fallback='{fallback}')")
    except Exception as std_err:
        print(f"[STANDARDIZATION] Warning: Could not apply standardization rules: {std_err}")
    ctx.clean_df = clean_df
    return ctx
