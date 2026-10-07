"""Groq draft of a dataset's semantic layer (column meaning + metrics).

Same privacy rule as the dashboard prompt: column names, kinds and ranges only, never a
cell value, and never the name of a column that is currently hidden as personal data.
Hidden columns keep their rule guess and stay flagged as personal."""
import json
import logging
import time

from . import dashboard_llm
from .dashboard_spec import SpecError
from .semantic_layer import (DEFAULT_AGGS, DURATION_UNITS, METRIC_AGGS, METRIC_FORMATS, ROLES, UNITS, WHERE_OPS,
                             SemanticError, metric_columns, rule_draft, validate_semantic)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = f"""You are a data steward. Describe what each column of a dataset means for business dashboards.
Reply with ONE JSON object and nothing else, following this schema:
{{
  "columns": {{"<column name>": {{
    "role": one of {json.dumps(list(ROLES))},
    "label": short display name in Thai,
    "description": one sentence in Thai,
    "unit": one of {json.dumps(list(UNITS))} or null,
    "currency": ISO 4217 code or null,
    "duration_unit": one of {json.dumps(list(DURATION_UNITS))} or null,
    "default_agg": one of {json.dumps(list(DEFAULT_AGGS))} or null,
    "pii": boolean
  }}}},
  "metrics": [{{
    "id": snake_case string, "label": string, "description": string,
    "type": "simple" | "ratio",
    "measure": {{"agg": one of {json.dumps(list(METRIC_AGGS))}, "column": string or null,
                "where": null or {{"column": string, "op": one of {json.dumps(list(WHERE_OPS))}, "value": any}}}},
    "numerator": same shape as measure, "denominator": same shape as measure,
    "format": one of {json.dumps(list(METRIC_FORMATS))}, "currency": ISO 4217 code or null,
    "higher_is_better": boolean
  }}]
}}
Rules:
- Describe every column in the profile using its exact name; "hint_role" and "hint_pii" are guesses from the name you may correct.
- measure needs kind numeric; time needs kind date; identifier means codes and keys (never summed).
- unit applies to measures only; percent means values from 0 to 100.
- pii is true for data about a person: names, contacts, addresses, national ids, birth dates.
- Set currency only when the column name makes it clear; otherwise null.
- Propose 3 to 8 business metrics, including ratios where they make sense (margin, average order value, rates).
  Use count_distinct of an identifier for "number of orders" or "number of customers". Never use a pii column."""


def build_messages(table_name, profile):
    """The prompt: dataset name, row count and the column profile with the rule guesses.
    `profile` must already be without the hidden columns."""
    hints = rule_draft(profile)["columns"]
    columns = [{**c, "hint_role": hints[c["name"]]["role"], "hint_pii": hints[c["name"]]["pii"]}
               for c in dashboard_llm.profile_for_prompt(profile)["columns"]]
    user = {"dataset": table_name, "rows": profile["rows"], "columns": columns}
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def _accept(content, profile):
    try:
        raw = dashboard_llm.parse_json_object(content)
    except SpecError as exc:
        raise SemanticError(str(exc)) from exc
    semantic, warnings = validate_semantic(raw, profile)
    if not semantic["columns"]:
        raise SemanticError("ไม่มีคอลัมน์ที่ใช้ได้")
    return semantic, warnings


def _ask(messages, profile):
    """(semantic, warnings, model). One retry that tells the LLM why it was rejected, only
    when the first answer came back within dashboard_llm.RETRY_BUDGET_S."""
    started = time.monotonic()
    key, model = dashboard_llm.groq_settings()
    if not key:
        raise dashboard_llm.LLMUnavailable("ยังไม่ได้ตั้งค่า Groq API key")
    content = dashboard_llm.call_groq(messages, key, model)
    try:
        semantic, warnings = _accept(content, profile)
    except SemanticError as exc:
        if time.monotonic() - started > dashboard_llm.RETRY_BUDGET_S:
            raise  # no time left for a second call before the proxy gives up on the request
        retry = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": f"That answer was rejected: {exc}. Reply again with the corrected JSON object only."},
        ]
        semantic, warnings = _accept(dashboard_llm.call_groq(retry, key, model), profile)
    return semantic, warnings, model


def draft_semantic(table_name, profile, hidden=()):
    """{"semantic": {"columns", "metrics"}, "warnings", "engine": "groq" | "rules", "model"}.
    columns cover every column of the profile; hidden columns are never sent and stay personal."""
    hidden = set(hidden)
    rules = rule_draft(profile)
    visible = {**profile, "columns": [c for c in profile["columns"] if c["name"] not in hidden]}
    try:
        drafted, warnings, model = _ask(build_messages(table_name, visible), visible)
        engine = "groq"
    except (dashboard_llm.LLMUnavailable, SemanticError) as exc:
        logger.warning("Semantic draft fell back to rules: %s", exc)
        drafted, warnings, model, engine = rules, [f"ใช้ร่างแบบกฎแทน AI: {exc}"], None, "rules"

    columns = {}
    for c in profile["columns"]:
        name = c["name"]
        meta = drafted["columns"].get(name) or rules["columns"][name]
        if name in hidden:
            meta = {**meta, "pii": True}
        elif rules["columns"][name]["pii"] and not meta["pii"]:
            meta = {**meta, "pii": True}
            warnings.append(f"{name}: ชื่อคอลัมน์บ่งว่าเป็นข้อมูลส่วนบุคคล จึงติดไว้ก่อน ให้คนตรวจอีกครั้ง")
        columns[name] = meta

    private = {n for n, m in columns.items() if m["pii"]}
    metrics = []
    for metric in drafted["metrics"]:
        if set(metric_columns(metric)) & private:
            warnings.append(f"ตัด metric '{metric['label']}': อ้างคอลัมน์ข้อมูลส่วนบุคคล")
        else:
            metrics.append(metric)
    return {"semantic": {"columns": columns, "metrics": metrics}, "warnings": warnings, "engine": engine, "model": model}
