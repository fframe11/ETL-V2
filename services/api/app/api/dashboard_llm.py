"""LLM side of the Create Dashboard tab (Groq, OpenAI-compatible chat completions).

The prompt carries the dataset's column profile (names, kinds, distinct and missing
counts, numeric and date ranges) and the user's request. It never carries rows or
category labels, so dataset values do not leave the system. The LLM answers with a
spec (dashboard_spec.py) that is validated before anything is computed. Without a key,
or when Groq fails, generation uses a rule-based spec and refinement reports that the AI
is unavailable."""
import json
import logging
import os
import re
import time

import requests

from .dashboard_spec import (AGGREGATIONS, AUDIENCES, FORMATS, GRID_COLUMNS, MAX_ROW_SPAN, TIME_GRAINS,
                             WIDGET_TYPES, SpecError, diff_specs, validate_spec)
from .dashboard_suggest import emptiest_columns, is_identifier, key_like_columns, suggest_refinements
from .system import get_system_settings
from .whitebox import _get_groq_api_key

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"
TIMEOUT_S = 20          # per Groq call; the front proxy gives up on a request after 60 s
RETRY_BUDGET_S = 25     # a bad first answer is retried only if it came back within this many seconds


class LLMUnavailable(RuntimeError):
    """No key, Groq unreachable, or Groq answered with an error."""


SYSTEM_PROMPT = f"""You design business-intelligence dashboards in the style of Power BI and Databricks.
Reply with ONE JSON object and nothing else, following this schema:
{{
  "title": string,
  "description": string (one sentence),
  "audience": one of {json.dumps(list(AUDIENCES))},
  "filters": [{{"id": string, "column": string, "label": string}}],
  "widgets": [{{
    "id": string,
    "type": one of {json.dumps(list(WIDGET_TYPES))},
    "title": string,
    "metric": {{"agg": one of {json.dumps(list(AGGREGATIONS))}, "column": string or null}} or {{"metric_id": string}},
    "format": one of {json.dumps(list(FORMATS))},
    "x": string,
    "group_by": string or null,
    "stacked": boolean,
    "time_grain": one of {json.dumps(list(TIME_GRAINS))},
    "sort": "desc" | "asc" | "x",
    "limit": integer,
    "compare": {{"date_column": string, "time_grain": string}},
    "columns": [string],
    "order_by": {{"column": string, "desc": boolean}},
    "layout": {{"x": integer, "y": integer, "w": 1-{GRID_COLUMNS}, "h": 1-{MAX_ROW_SPAN}}}
  }}]
}}
Fields by widget type:
- kpi: metric, format, optional compare (change of the latest period against the one before).
- bar: x, metric, optional group_by and stacked, sort, limit (max 20).
- line, area: x must be a date or numeric column; time_grain for dates; optional group_by and stacked.
- pie, donut: x with few distinct values, metric, limit (max 8).
- table: columns, optional order_by, limit (max 200).
Rules:
- Use column names exactly as they appear in the profile. Never invent columns.
- sum, avg, min and max need a numeric column; count takes "column": null; count_distinct and count_missing take any column.
- When the user message lists "metrics", they are the dataset's approved definitions: use {{"metric_id": "<id>"}} for kpi cards and charts of that measure instead of rebuilding the formula.
- Columns with role "identifier" are codes: never sum, average, min or max them and never put them on a chart axis or group_by; count_distinct them instead.
- When a column has a "label", use it in widget titles and filter labels.
- The grid has {GRID_COLUMNS} columns. Put 3-4 kpi cards (w 3, h 2) on the first row, charts below (w 4 or 6, h 4) and a table last (w 12, h 5).
- Use 5-10 widgets and 1-3 filters on the most useful categorical or date columns.
- audience "management": headline kpis with compare and trends, no wide tables. "analyst": more breakdowns and a detail table. "business": balanced.
- audience "steward" reads data health, not business results: kpis of count, of count_distinct over key-like columns (read against the row count they expose duplicates), of count_missing over columns with missing values, of min and max over numeric columns, and a detail table. For the quality-run history (columns quality_score and quarantined_records) trend the score and rank tables by it.
- Write the title, description, widget titles and filter labels in the language of the user's request."""

REFINE_RULES = """
You are EDITING the dashboard in "current_spec". Change only what "instruction" asks for.
Keep every other widget and filter exactly as it is, with the same id. Give new widgets new ids.
Return the complete updated spec.
"suggested_changes" lists what this dashboard still lacks. Use it only to read a vague instruction against what the data supports; never apply a suggested change the instruction did not ask for."""


def groq_settings():
    """(api_key, model): the key in the same order as the other LLM features (the setting
    saved on the Rules page, then GROQ_API_KEY), the model from that setting or GROQ_MODEL."""
    key = _get_groq_api_key()
    try:
        model = get_system_settings().get("groq_model") or DEFAULT_MODEL
    except Exception:
        model = os.getenv("GROQ_MODEL", "").strip() or DEFAULT_MODEL
    return key, model


def call_groq(messages, api_key, model):
    try:
        res = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
                     "User-Agent": "SDOQAP-Dashboard-Builder/1.0"},
            json={"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 8192,
                  "response_format": {"type": "json_object"}},
            timeout=TIMEOUT_S,
        )
    except requests.RequestException as exc:
        raise LLMUnavailable(f"เชื่อมต่อ Groq ไม่ได้ ({exc.__class__.__name__})") from exc
    if res.status_code != 200:
        logger.warning("Groq returned HTTP %s: %s", res.status_code, res.text[:300])
        raise LLMUnavailable(f"Groq ตอบกลับ HTTP {res.status_code}")
    try:
        return res.json()["choices"][0]["message"]["content"] or ""
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise LLMUnavailable("Groq ตอบกลับในรูปแบบที่อ่านไม่ได้") from exc


def profile_for_prompt(profile):
    """The column profile without any cell value except numeric and date ranges (and not
    even the range of a numeric column that looks like an identifier), plus the column's
    meaning when the profile carries it (semantic_layer.apply_to_profile). Hidden personal
    columns never reach this function: apply_to_profile has already removed them."""
    columns = []
    for c in profile["columns"]:
        item = {"name": c["name"], "kind": c["kind"], "distinct": c["distinct"], "missing_pct": c["missing_pct"]}
        identifier = c["kind"] == "numeric" and is_identifier(c, profile["rows"])
        if c["kind"] in ("numeric", "date") and not identifier:
            item["min"], item["max"] = c.get("min"), c.get("max")
        for key in ("role", "label", "unit", "currency"):
            if c.get(key):
                item[key] = c[key]
        columns.append(item)
    return {"rows": profile["rows"], "columns": columns}


def _metrics_for_prompt(metrics):
    """The approved metric definitions the LLM may name by id (no formula, no value)."""
    return [{k: m.get(k) for k in ("id", "label", "description", "format")} for m in metrics]


def build_generate_messages(table_name, profile, context, audience, metrics=None):
    user = {"dataset": table_name, "audience": audience, "request": context, "profile": profile_for_prompt(profile)}
    if metrics:
        user["metrics"] = _metrics_for_prompt(metrics)
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def build_refine_messages(table_name, profile, spec, instruction, metrics=None):
    user = {"dataset": table_name, "profile": profile_for_prompt(profile), "current_spec": spec,
            "suggested_changes": [s["text"] for s in suggest_refinements(profile, spec, metrics=metrics)],
            "instruction": instruction}
    if metrics:
        user["metrics"] = _metrics_for_prompt(metrics)
    return [{"role": "system", "content": SYSTEM_PROMPT + REFINE_RULES},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def parse_json_object(text):
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise SpecError("คำตอบของ AI ไม่มี JSON")
    try:
        return json.loads(text[start:end + 1])
    except ValueError as exc:
        raise SpecError(f"JSON จาก AI อ่านไม่ได้: {exc}") from exc


def _ask(messages, profile, metrics=None):
    """(spec, warnings, model). One retry that tells the LLM why its answer was rejected."""
    started = time.monotonic()
    key, model = groq_settings()
    if not key:
        raise LLMUnavailable("ยังไม่ได้ตั้งค่า Groq API key")
    content = call_groq(messages, key, model)
    try:
        spec, warnings = validate_spec(parse_json_object(content), profile, metrics)
    except SpecError as exc:
        if time.monotonic() - started > RETRY_BUDGET_S:
            raise  # no time left for a second call before the proxy gives up on the request
        retry = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": f"That answer was rejected: {exc}. Reply again with the corrected JSON object only."},
        ]
        spec, warnings = validate_spec(parse_json_object(call_groq(retry, key, model)), profile, metrics)
    return spec, warnings, model


_QUALITY_RUN_COLUMNS = {"timestamp", "table_name", "quality_score", "quarantined_records"}
_SCORE = {"agg": "avg", "column": "quality_score"}
_COUNT = {"agg": "count", "column": None}


def _quality_run_spec(profile):
    """The quality-run history (one row per Quality Gate run): score trend, worst tables, quarantined rows."""
    names = {c["name"] for c in profile["columns"]}
    widgets = [
        {"type": "kpi", "title": "คะแนนคุณภาพเฉลี่ย", "metric": _SCORE, "format": "percent"},
        {"type": "kpi", "title": "แถวที่ถูกกักกัน", "metric": {"agg": "sum", "column": "quarantined_records"}},
        {"type": "kpi", "title": "จำนวนรอบที่ตรวจ", "metric": _COUNT},
        {"type": "line", "title": "แนวโน้มคะแนนคุณภาพ", "x": "timestamp", "time_grain": "day", "metric": _SCORE},
        {"type": "bar", "title": "ตารางที่คะแนนต่ำสุด", "x": "table_name", "sort": "asc", "limit": 10, "metric": _SCORE}]
    if "gate_result" in names:
        widgets.append({"type": "donut", "title": "ผลผ่านเกณฑ์", "x": "gate_result", "metric": _COUNT})
    shown = [c for c in ("timestamp", "table_name", "total_records", "quarantined_records", "quality_score", "gate_result") if c in names]
    widgets.append({"type": "table", "title": "รอบที่ตรวจล่าสุด", "columns": shown,
                    "order_by": {"column": "timestamp", "desc": True}, "limit": 20})
    return {"widgets": widgets, "filters": [{"column": "table_name"}, {"column": "timestamp"}]}


def _health_spec(profile):
    """Data health from the profile: duplicates in key-like columns, empty cells, value ranges."""
    columns, rows = profile["columns"], profile["rows"]
    if _QUALITY_RUN_COLUMNS <= {c["name"] for c in columns}:
        return _quality_run_spec(profile)
    widgets = [{"type": "kpi", "title": "จำนวนแถว", "metric": _COUNT}]
    keys = key_like_columns(profile)
    widgets += [{"type": "kpi", "title": f"ค่าไม่ซ้ำของ {c['name']}", "metric": {"agg": "count_distinct", "column": c["name"]}} for c in keys]
    gaps = emptiest_columns(profile)
    widgets += [{"type": "kpi", "title": f"ค่าว่างของ {c['name']}", "metric": {"agg": "count_missing", "column": c["name"]}} for c in gaps]
    for c in [c for c in columns if c["kind"] == "numeric" and not is_identifier(c, rows)][:2]:
        widgets.append({"type": "kpi", "title": f"ต่ำสุด {c['name']}", "metric": {"agg": "min", "column": c["name"]}})
        widgets.append({"type": "kpi", "title": f"สูงสุด {c['name']}", "metric": {"agg": "max", "column": c["name"]}})
    widgets.append({"type": "table", "title": "ตัวอย่างข้อมูล", "columns": [c["name"] for c in columns[:8]]})
    categories = sorted((c for c in columns if c["kind"] == "categorical"), key=lambda c: c["distinct"])
    dates = [c["name"] for c in columns if c["kind"] == "date"]
    return {"widgets": widgets, "filters": [{"column": c["name"]} for c in categories[:2]] + [{"column": d} for d in dates[:1]]}


AGG_WORDS = {"sum": "ผลรวม", "avg": "ค่าเฉลี่ย", "min": "ต่ำสุด", "max": "สูงสุด", "count_distinct": "จำนวนค่าไม่ซ้ำ"}
MAX_FALLBACK_KPIS = 4


def _label(column):
    return column.get("label") or column["name"]


def fallback_spec(profile, context="", audience="business", metrics=None):
    """A sensible dashboard from the column kinds alone, used when the LLM is unavailable.
    The reader type shapes it: management gets no detail table and a period comparison, an analyst a
    wider table, a data steward a data-health view. With a semantic layer, the approved metrics lead
    the kpi cards (at most 4), measures use their default aggregation and identifiers are never
    summed or charted."""
    if audience == "steward":
        return {"title": "แดชบอร์ดสุขภาพข้อมูล", "description": context[:300], **_health_spec(profile)}
    columns = profile["columns"]
    usable = [c for c in columns if c.get("role") != "identifier"]
    numeric = [c for c in usable if c["kind"] == "numeric" and c.get("role") in (None, "measure")]
    dates = [c for c in usable if c["kind"] == "date"]
    categories = sorted((c for c in usable if c["kind"] == "categorical"), key=lambda c: c["distinct"])

    def measure_metric(c):
        agg = c.get("default_agg") if c.get("default_agg") in AGG_WORDS else "sum"
        return {"agg": agg, "column": c["name"]}

    main = measure_metric(numeric[0]) if numeric else {"agg": "count", "column": None}
    metrics = metrics or []
    covered = {(m["measure"]["agg"], m["measure"]["column"]) for m in metrics
               if m["type"] == "simple" and not m["measure"].get("where")}
    widgets = [{"type": "kpi", "title": m["label"], "metric": {"metric_id": m["id"]}} for m in metrics[:MAX_FALLBACK_KPIS]]
    if not widgets:
        widgets.append({"type": "kpi", "title": "จำนวนแถว", "metric": {"agg": "count", "column": None}})
    for c in numeric:
        metric = measure_metric(c)
        if len(widgets) >= MAX_FALLBACK_KPIS:
            break
        if (metric["agg"], metric["column"]) not in covered:
            widgets.append({"type": "kpi", "title": f"{AGG_WORDS[metric['agg']]} {_label(c)}", "metric": metric})
    if audience == "management" and dates:
        widgets[0]["compare"] = {"date_column": dates[0]["name"], "time_grain": "month"}
    if dates:
        widgets.append({"type": "line", "title": f"แนวโน้มรายเดือนตาม {_label(dates[0])}", "x": dates[0]["name"],
                        "time_grain": "month", "metric": main})
    if categories:
        widest = categories[-1]
        widgets.append({"type": "bar", "title": f"แยกตาม {_label(widest)}", "x": widest["name"], "metric": main})
        if len(categories) > 1 and categories[0]["distinct"] <= 8:
            narrow = categories[0]
            widgets.append({"type": "donut", "title": f"สัดส่วนตาม {_label(narrow)}", "x": narrow["name"], "metric": main})
    if audience != "management" or len(widgets) == 1:
        widgets.append({"type": "table", "title": "ตัวอย่างข้อมูล", "columns": [c["name"] for c in columns[:12 if audience == "analyst" else 8]]})
    filters = [{"column": c["name"]} for c in categories[:2]] + [{"column": d["name"]} for d in dates[:1]]
    title = "แดชบอร์ดผู้บริหาร" if audience == "management" else "แดชบอร์ดภาพรวม"
    return {"title": title, "description": context[:300], "widgets": widgets, "filters": filters}


def generate_spec(table_name, profile, context, audience, metrics=None):
    try:
        messages = build_generate_messages(table_name, profile, context, audience, metrics)
        spec, warnings, model = _ask(messages, profile, metrics)
        engine = "groq"
    except (LLMUnavailable, SpecError) as exc:
        logger.warning("Dashboard generation fell back to rules: %s", exc)
        spec, warnings = validate_spec(fallback_spec(profile, context, audience, metrics), profile, metrics)
        warnings = [f"ใช้แดชบอร์ดอัตโนมัติแบบกฎแทน AI: {exc}"] + warnings
        engine, model = "rules", None
    spec["audience"] = audience
    return {"spec": spec, "warnings": warnings, "engine": engine, "model": model}


def refine_spec(table_name, profile, spec, instruction, metrics=None):
    """Raises LLMUnavailable or SpecError; there is no rule-based refinement."""
    messages = build_refine_messages(table_name, profile, spec, instruction, metrics)
    new_spec, warnings, model = _ask(messages, profile, metrics)
    return {"spec": new_spec, "warnings": warnings, "engine": "groq", "model": model,
            "changes": diff_specs(spec, new_spec)}


RANK_CANDIDATES = 12  # how many rule-made suggestions the model may choose from
RANK_LIMIT = 6        # how many it may return
RANK_TEXT_MAX = 200
_NUMBER = re.compile(r"\d+(?:\.\d+)?")

# Built once at import from RANK_LIMIT (the braces of the JSON example stay literal, so substitute, not format).
RANK_PROMPT = """You choose and reword requests for a dashboard builder.
Reply with ONE JSON object and nothing else: {"suggestions": [{"id": string, "text": string}]}
- "candidates" are requests the builder can already fulfil. Choose at most {limit} of them, by "id", and put the most useful first for the reader named in "audience".
- Reword each "text" as one short, plain sentence in the language of the candidate text, the way that reader would ask for it. Keep every column name exactly as it is written in the candidate text.
- Never add a request that is not a candidate. Never invent columns or numbers.
- audience "business": what sells or what is largest. "analyst": breakdowns and comparisons. "management": headline numbers, trends and period comparisons. "steward": data health, duplicates, empty cells and value ranges.""".replace("{limit}", str(RANK_LIMIT))


def _columns_of(widget):
    """The column names a suggestion's widget draws on."""
    names = [widget.get("x"), widget.get("group_by"), (widget.get("metric") or {}).get("column"),
             (widget.get("compare") or {}).get("date_column")]
    return [n for n in names if isinstance(n, str)]


def _validate_ranking(raw, candidates):
    """The model's choice, checked: only candidate ids, each once, at most RANK_LIMIT. A reworded text is
    kept only when it still names every column the candidate's own text names; otherwise the candidate's
    text stands. Nothing the model adds on its own survives."""
    by_id = {c["id"]: c for c in candidates}
    items = raw.get("suggestions") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        raise SpecError("คำตอบของ AI ไม่มีรายการคำแนะนำ")
    ranked, seen = [], set()
    for item in items:
        cid = item.get("id") if isinstance(item, dict) else None
        if not isinstance(cid, str) or cid not in by_id or cid in seen:
            continue
        candidate = by_id[cid]
        seen.add(cid)
        text = " ".join(item["text"].split()) if isinstance(item.get("text"), str) else ""
        anchors = [n for n in _columns_of(candidate["widget"]) if n in candidate["text"]]
        keeps = (5 <= len(text) <= RANK_TEXT_MAX and all(n in text for n in anchors)
                 and sorted(_NUMBER.findall(text)) == sorted(_NUMBER.findall(candidate["text"])))
        ranked.append({"id": candidate["id"], "rule": candidate["rule"], "text": text if keeps else candidate["text"]})
        if len(ranked) == RANK_LIMIT:
            break
    if not ranked:
        raise SpecError("AI ไม่ได้เลือกคำแนะนำที่ใช้ได้")
    return ranked


def rank_suggestions(table_name, profile, audience, candidates):
    """The suggestions in the order and wording the model prefers for this reader. Raises LLMUnavailable or SpecError;
    the caller keeps the rule-made list in that case. The prompt carries the column profile and the candidate texts
    (which name columns), never a cell value."""
    key, model = groq_settings()
    if not key:
        raise LLMUnavailable("ยังไม่ได้ตั้งค่า Groq API key")
    # Ranking does not need a range (a maximum salary or a date of birth is a real record value), so none is sent.
    columns = [{k: c[k] for k in ("name", "kind", "distinct", "missing_pct")} for c in profile_for_prompt(profile)["columns"]]
    user = {"dataset": table_name, "audience": audience, "profile": {"rows": profile["rows"], "columns": columns},
            "candidates": [{"id": c["id"], "rule": c["rule"], "text": c["text"]} for c in candidates]}
    messages = [{"role": "system", "content": RANK_PROMPT},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]
    ranked = _validate_ranking(parse_json_object(call_groq(messages, key, model)), candidates)
    return {"suggestions": ranked, "engine": "groq", "model": model}
