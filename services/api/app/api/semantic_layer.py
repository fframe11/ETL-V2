"""Semantic layer: what each column of a dataset means (role, label, unit, currency, PII)
and the dataset's metric definitions.

Pure functions only (no Elasticsearch, no LLM) so every rule can be tested on its own:
semantic.py stores the documents and semantic_llm.py drafts them with Groq. Whatever a
person or the LLM sends goes through validate_semantic() before it is stored or used."""
import re
from datetime import datetime

ROLES = ("measure", "dimension", "time", "identifier", "text")
UNITS = ("currency", "percent", "count", "duration", "number")
DURATION_UNITS = ("seconds", "minutes", "hours", "days")
DEFAULT_AGGS = ("sum", "avg", "min", "max", "count_distinct")
METRIC_TYPES = ("simple", "ratio")
METRIC_AGGS = ("count", "count_distinct", "sum", "avg", "min", "max")
NUMERIC_AGGS = ("sum", "avg", "min", "max")
WHERE_OPS = ("eq", "ne", "in", "gt", "gte", "lt", "lte")
METRIC_FORMATS = ("number", "currency", "percent")
MAX_METRICS = 20
MAX_IN_VALUES = 50
MAX_RULE_MONEY_METRICS = 5

_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_METRIC_ID_RE = re.compile(r"^[a-z0-9_]{1,40}$")

# Name rules compare whole words: "CustomerName" and "customer_name" both give
# ["customer", "name"], so "Hotel" never matches "tel" and "Paid" never matches "id".
PII_WORDS = {"email", "phone", "mobile", "tel", "telephone", "address", "passport", "ssn", "birth",
             "birthday", "birthdate", "dob"}
PII_JOINED = ("email", "idcard", "citizen", "nationalid", "dateofbirth")
PERSON_WORDS = {"customer", "first", "last", "full", "user", "contact", "person", "employee", "owner", "member",
                "client", "patient", "student", "given", "family", "middle", "sender", "receiver", "recipient"}
PERSON_NAMES = {"name", "username", "fullname", "firstname", "lastname", "customername", "surname"}
THAI_PII = ("ชื่อลูกค้า", "ชื่อผู้", "ชื่อจริง", "นามสกุล", "ชื่อ-สกุล", "อีเมล", "เบอร์โทร", "ที่อยู่",
            "บัตรประชาชน", "เลขบัตร")
IDENTIFIER_WORDS = {"id", "code", "no", "uuid", "sku", "key"}
PERCENT_WORDS = {"pct", "percent", "percentage", "rate", "ratio", "score", "margin"}
MONEY_WORDS = {"sales", "revenue", "amount", "price", "cost", "profit", "income", "value", "spend"}
AGE_WORDS = {"age"}
COUNT_WORDS = {"qty", "quantity", "count", "records", "rows", "units", "items"}
DURATION_WORDS = {"seconds": "seconds", "secs": "seconds", "sec": "seconds", "duration": "seconds",
                  "minutes": "minutes", "mins": "minutes", "hours": "hours", "hrs": "hours", "lag": "hours",
                  "days": "days"}
THAI_MONEY = ("ยอด", "ราคา", "ต้นทุน", "กำไร")
THAI_AGE = ("อายุ",)
THAI_COUNT = ("จำนวน",)


class SemanticError(ValueError):
    """The input is not a semantic-layer object at all."""


def tokens(name):
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(name))
    return [t for t in re.split(r"[^a-z0-9฀-๿]+", spaced.lower()) if t]


def is_pii_name(name):
    words = tokens(name)
    joined = "".join(words)
    if PII_WORDS & set(words) or any(part in joined for part in PII_JOINED) or joined in PERSON_NAMES:
        return True
    if "name" in words:
        i = words.index("name")
        if i > 0 and words[i - 1] in PERSON_WORDS:
            return True
    return any(part in str(name) for part in THAI_PII)


def _has(words, name, english, thai=()):
    return bool(english & set(words)) or any(part in str(name) for part in thai)


def rule_column(col):
    """What a column most likely means, from its name and profiled kind alone."""
    name, kind = col["name"], col["kind"]
    words = tokens(name)
    meta = {"role": "text", "label": "", "description": "", "unit": None, "currency": None,
            "duration_unit": None, "default_agg": None, "pii": is_pii_name(name)}

    def measure(unit, agg, duration_unit=None):
        meta.update(role="measure", unit=unit, default_agg=agg, duration_unit=duration_unit)

    low, high = col.get("min"), col.get("max")
    if words and (words[-1] in IDENTIFIER_WORDS or words[0] == "id"):
        meta["role"] = "identifier"
    elif kind == "date":
        meta["role"] = "time"
    elif kind == "numeric":
        in_0_100 = low is not None and high is not None and 0 <= low and high <= 100
        if _has(words, name, PERCENT_WORDS) and in_0_100:
            measure("percent", "avg")
        elif _has(words, name, MONEY_WORDS, THAI_MONEY):
            measure("currency", "sum")
        elif _has(words, name, AGE_WORDS, THAI_AGE):
            measure("number", "avg")
        elif _has(words, name, COUNT_WORDS, THAI_COUNT):
            measure("count", "sum")
        elif set(words) & set(DURATION_WORDS):
            measure("duration", "avg", next(DURATION_WORDS[w] for w in words if w in DURATION_WORDS))
        else:
            measure("number", "sum")
    elif kind == "categorical":
        meta["role"] = "dimension"
    return meta


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")[:40] or "metric"


def unique_id(text, used):
    base = slug(text)
    candidate, n = base, 2
    while candidate in used:
        suffix = f"_{n}"
        candidate = base[: 40 - len(suffix)] + suffix
        n += 1
    return candidate


def rule_draft(profile):
    """The semantic layer guessed from names and kinds, used before anything is drafted
    or approved, when Groq is unavailable, and for columns the stored versions lack."""
    columns = {c["name"]: rule_column(c) for c in profile["columns"]}
    metrics = [{"id": "row_count", "label": "จำนวนแถว", "description": "", "type": "simple",
                "measure": {"agg": "count", "column": None, "where": None},
                "format": "number", "currency": None, "higher_is_better": True}]
    used = {"row_count"}
    money = [n for n, m in columns.items() if m["role"] == "measure" and m["unit"] == "currency" and not m["pii"]]
    for name in money[:MAX_RULE_MONEY_METRICS]:
        metric_id = unique_id(f"total_{name}", used)
        used.add(metric_id)
        metrics.append({"id": metric_id, "label": f"ผลรวม {name}", "description": "", "type": "simple",
                        "measure": {"agg": "sum", "column": name, "where": None},
                        "format": "currency", "currency": None, "higher_is_better": True})
    return {"columns": columns, "metrics": metrics}


def metric_columns(metric):
    parts = [metric.get("measure")] if metric.get("type") == "simple" else [metric.get("numerator"), metric.get("denominator")]
    names = []
    for part in parts:
        if isinstance(part, dict):
            names += [part.get("column"), (part.get("where") or {}).get("column")]
    return sorted({n for n in names if n})


def _text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def _role_fits(role, kind):
    return (role != "measure" or kind == "numeric") and (role != "time" or kind == "date")


def _currency(value, owner, warnings):
    if value in (None, ""):
        return None
    code = str(value).strip().upper()
    if _CURRENCY_RE.match(code):
        return code
    warnings.append(f"{owner}: รหัสสกุลเงิน {value} ไม่ถูกต้อง")
    return None


def clean_column(item, col, warnings):
    """One column's metadata with every field valid for the column's profiled kind; an
    unusable value falls back to the rule guess for that column."""
    base = rule_column(col)
    item = item if isinstance(item, dict) else {}
    name, kind = col["name"], col["kind"]
    role = item.get("role", base["role"])
    if role not in ROLES or not _role_fits(role, kind):
        warnings.append(f"{name}: ใช้บทบาท {role} กับคอลัมน์ชนิด {kind} ไม่ได้ ใช้ {base['role']} แทน")
        role = base["role"]
    meta = {"role": role, "label": _text(item.get("label"), 60), "description": _text(item.get("description"), 300),
            "unit": None, "currency": None, "duration_unit": None, "default_agg": None,
            "pii": None}
    raw_pii = item.get("pii", base["pii"])
    if isinstance(raw_pii, bool):
        meta["pii"] = raw_pii
    else:
        meta["pii"] = base["pii"]
        warnings.append(f"{name}: pii ต้องเป็น true หรือ false ใช้ {base['pii']} แทน")
    if role != "measure":
        return meta
    fallback = base if base["role"] == "measure" else {"unit": "number", "default_agg": "sum", "duration_unit": None}
    unit = item.get("unit", fallback["unit"])
    if unit not in UNITS:
        warnings.append(f"{name}: ไม่รู้จักหน่วย {unit} ใช้ {fallback['unit']} แทน")
        unit = fallback["unit"]
    agg = item.get("default_agg", fallback["default_agg"])
    if agg not in DEFAULT_AGGS:
        warnings.append(f"{name}: ไม่รู้จักการรวม {agg} ใช้ {fallback['default_agg']} แทน")
        agg = fallback["default_agg"]
    meta.update(unit=unit, default_agg=agg)
    if unit == "currency":
        meta["currency"] = _currency(item.get("currency"), name, warnings)
    if unit == "duration":
        duration_unit = item.get("duration_unit") or fallback["duration_unit"] or "seconds"
        if duration_unit not in DURATION_UNITS:
            warnings.append(f"{name}: ไม่รู้จักหน่วยเวลา {duration_unit} ใช้ seconds แทน")
            duration_unit = "seconds"
        meta["duration_unit"] = duration_unit
    return meta


def _is_iso(value):
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _scalar(value):
    return isinstance(value, (str, int, float, bool))


def _clean_where(raw, by_name):
    if raw is None:
        return None, None
    if not isinstance(raw, dict):
        return None, "เงื่อนไขไม่ถูกต้อง"
    column, op, value = raw.get("column"), raw.get("op"), raw.get("value")
    if not isinstance(column, str) or column not in by_name:
        return None, f"เงื่อนไขอ้างคอลัมน์ {column} ที่ไม่มี"
    if op not in WHERE_OPS:
        return None, f"ไม่รองรับเงื่อนไข {op}"
    kind = by_name[column]["kind"]
    if op == "in":
        if not isinstance(value, list) or not 1 <= len(value) <= MAX_IN_VALUES or not all(_scalar(v) for v in value):
            return None, f"เงื่อนไข in ต้องเป็นรายการ 1 ถึง {MAX_IN_VALUES} ค่า"
    elif op in ("gt", "gte", "lt", "lte"):
        if kind == "numeric":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return None, f"{op} บน {column} ต้องเทียบกับตัวเลข"
        elif kind == "date":
            if not _is_iso(value):
                return None, f"{op} บน {column} ต้องเทียบกับวันที่ ISO"
        else:
            return None, f"{op} ใช้ได้กับคอลัมน์ตัวเลขหรือวันที่เท่านั้น ({column})"
    elif not _scalar(value):
        return None, "ค่าของเงื่อนไขไม่ถูกต้อง"
    return {"column": column, "op": op, "value": value}, None


def _clean_part(raw, by_name):
    if not isinstance(raw, dict):
        return None, "ไม่มีส่วนการคำนวณ"
    agg, column = raw.get("agg"), raw.get("column")
    if agg not in METRIC_AGGS:
        return None, f"ไม่รองรับการคำนวณ {agg}"
    if agg == "count":
        column = None
    elif not isinstance(column, str) or column not in by_name:
        return None, f"ไม่มีคอลัมน์ {column}"
    elif agg in NUMERIC_AGGS and by_name[column]["kind"] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    where, problem = _clean_where(raw.get("where"), by_name)
    if problem:
        return None, problem
    return {"agg": agg, "column": column, "where": where}, None


def clean_metric(item, by_name, used, warnings=None):
    """(metric, None) or (None, reason). used holds ids already taken in this dataset."""
    if warnings is None:
        warnings = []
    if not isinstance(item, dict):
        return None, "ไม่ใช่ object"
    label = _text(item.get("label"), 60)
    if not label:
        return None, "ไม่มีชื่อ"
    metric_type = item.get("type")
    if metric_type not in METRIC_TYPES:
        return None, f"ไม่รองรับชนิด {metric_type}"
    metric = {"id": None, "label": label, "description": _text(item.get("description"), 300), "type": metric_type}
    if metric_type == "simple":
        part, problem = _clean_part(item.get("measure"), by_name)
        if problem:
            return None, problem
        metric["measure"] = part
    else:
        for key, title in (("numerator", "ตัวตั้ง"), ("denominator", "ตัวหาร")):
            part, problem = _clean_part(item.get(key), by_name)
            if problem:
                return None, f"{title}: {problem}"
            metric[key] = part
    format_val = item.get("format")
    if format_val not in METRIC_FORMATS:
        if format_val is not None:
            warnings.append(f"metric '{label}': รูปแบบ {format_val} ไม่รู้จัก ใช้ number แทน")
        metric["format"] = "number"
    else:
        metric["format"] = format_val
    metric["currency"] = _currency(item.get("currency"), label, warnings) if metric["format"] == "currency" else None
    higher_val = item.get("higher_is_better", True)
    if isinstance(higher_val, bool):
        metric["higher_is_better"] = higher_val
    else:
        warnings.append(f"metric '{label}': higher_is_better ต้องเป็น true หรือ false ใช้ true แทน")
        metric["higher_is_better"] = True
    given = item.get("id")
    ok = isinstance(given, str) and _METRIC_ID_RE.match(given) and given not in used
    metric["id"] = given if ok else unique_id(label, used)
    return metric, None


def validate_semantic(raw, profile):
    """({"columns", "metrics"}, warnings). Unknown columns are dropped, unusable values
    fall back to the rule guess, unusable metrics are dropped, each with a warning."""
    if not isinstance(raw, dict):
        raise SemanticError("ข้อมูลความหมายคอลัมน์ต้องเป็น JSON object")
    by_name = {c["name"]: c for c in profile["columns"]}
    warnings = []
    raw_columns = raw.get("columns") if isinstance(raw.get("columns"), dict) else {}
    columns = {}
    for name, item in raw_columns.items():
        if name not in by_name:
            warnings.append(f"ตัดคอลัมน์ {name}: ไม่มีในชุดข้อมูล")
            continue
        columns[name] = clean_column(item, by_name[name], warnings)
    metrics, used = [], set()
    for item in raw.get("metrics") if isinstance(raw.get("metrics"), list) else []:
        label = item.get("label") if isinstance(item, dict) else None
        metric, problem = clean_metric(item, by_name, used, warnings)
        if problem:
            warnings.append(f"ตัด metric '{label or '?'}': {problem}")
            continue
        if len(metrics) >= MAX_METRICS:
            warnings.append(f"ใช้ {MAX_METRICS} metric แรก")
            break
        metrics.append(metric)
        used.add(metric["id"])
    return {"columns": columns, "metrics": metrics}, warnings
