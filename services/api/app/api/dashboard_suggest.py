"""Suggestions for the Create Dashboard tab, derived from a dataset's column profile alone.

suggest_from_profile() reads the profile that dashboard_data.profile_dataframe() builds (names,
kinds, distinct counts, missing %, numeric and date ranges) and returns what the dataset can
answer. Every suggestion carries a widget that validate_spec() accepts for that profile, so a
suggestion never asks for something the builder cannot draw. suggest_refinements() does the same
for a dashboard that already exists: from its spec and the profile it lists what the dashboard
still lacks, under the same rules. Both are pure functions: no rows, no LLM, no I/O."""
from datetime import datetime, timedelta

from .dashboard_spec import MAX_FILTERS

CATEGORY_MIN_DISTINCT = 2
CATEGORY_MAX_DISTINCT = 200  # a top-10 stays readable far beyond the 50 values a donut or filter can take
DONUT_MAX_DISTINCT = 8
SPLIT_MAX_DISTINCT = 20  # most values an x axis can carry before a stacked split becomes unreadable
TOP_N = 10
MAX_MISSING_PCT = 50
DEFAULT_LIMIT = 6
KEY_LIKE_RATIO = 0.9  # a column with at least this share of distinct values per row probably identifies a row
HEALTH_KEYS, HEALTH_GAPS, HEALTH_RANGES = 2, 3, 2  # how many columns each data-health check names
HEALTH_FIRST = 3  # health cards that lead the list for a steward
GAP_LIMIT = 5
MAX_FILTER_DISTINCT = 50  # a select box stays usable up to about this many values

# Column-name hints, English and Thai, in priority order: the first group names the main measure.
_MEASURE_HINTS = (("sales", "revenue", "ยอดขาย", "รายได้"), ("total", "amount", "รวม"),
                  ("profit", "กำไร"), ("score", "คะแนน"), ("price", "ราคา"))
# Quantities whose total is meaningful. Anything else (scores, prices, sizes) is averaged.
_ADDITIVE_HINTS = ("sales", "revenue", "amount", "total", "profit", "quantity", "qty", "ยอดขาย", "รายได้", "รวม", "กำไร", "จำนวน")

_COMPARE_GRAINS = ("year", "month", "week", "day")  # quarters are skipped: rarely what a reader means
_GRAIN_LABEL = {"year": "รายปี", "quarter": "รายไตรมาส", "month": "รายเดือน", "week": "รายสัปดาห์", "day": "รายวัน"}
_LATEST_LABEL = {"year": "ปีล่าสุด", "quarter": "ไตรมาสล่าสุด", "month": "เดือนล่าสุด", "week": "สัปดาห์ล่าสุด", "day": "วันล่าสุด"}

# Which rules come first for each kind of reader (the picker's audience values).
_RULE_ORDER = {"business": ("R2", "R1", "R3", "R4", "R5", "R7"),
               "analyst": ("R5", "R2", "R1", "R4", "R3", "R7"),
               "management": ("R4", "R1", "R3", "R2", "R5", "R7"),
               "steward": ("R8", "R1", "R4", "R2", "R3", "R5", "R7")}

# Gaps in a finished dashboard, most visible first: a missing trend and a missing comparison before a missing filter.
_GAP_ORDER = ("G3", "G4", "G1", "G2", "G5", "G6")


def is_identifier(column, rows):
    """A column the semantic layer marks as an identifier, or a whole-number column that is
    (nearly) unique or has 9+ digit values: an id, account or phone number, whose min and max
    are real records."""
    if column.get("role") == "identifier":
        return True
    low, high = column.get("min"), column.get("max")
    if low is None or high is None or float(low) != int(low) or float(high) != int(high):
        return False
    digits = len(str(int(max(abs(low), abs(high)))))
    return digits >= 9 or bool(rows and column["distinct"] / rows >= KEY_LIKE_RATIO)


def key_like_columns(profile, limit=HEALTH_KEYS):
    """Columns that probably identify a row: about one value per row, not a date, and if numeric a
    whole-number id (a price or an amount is nearly unique too, but a repeat there is not a duplicate row)."""
    rows = profile["rows"]
    return [c for c in profile["columns"]
            if rows and c["kind"] != "date" and c["distinct"] >= KEY_LIKE_RATIO * rows
            and (c["kind"] != "numeric" or is_identifier(c, rows))][:limit]


def emptiest_columns(profile, limit=HEALTH_GAPS):
    """The columns with the most empty cells, worst first (by percentage)."""
    return sorted((c for c in profile["columns"] if c["missing"] > 0), key=lambda c: -c["missing_pct"])[:limit]


def _hint_rank(name):
    lowered = name.lower()
    for rank, words in enumerate(_MEASURE_HINTS):
        if any(w in lowered for w in words):
            return rank
    return len(_MEASURE_HINTS)


def _is_additive(name):
    lowered = name.lower()
    return any(w in lowered for w in _ADDITIVE_HINTS)


_AGG_LABEL = {"sum": "ผลรวม", "avg": "ค่าเฉลี่ย", "min": "ต่ำสุด", "max": "สูงสุด", "count_distinct": "จำนวนค่าไม่ซ้ำ"}


def _metric(column):
    """(metric, label): the aggregation the semantic layer gives the column (default_agg); without
    one, a total for quantities that add up and an average for the rest, guessed from the name.
    The label keeps the column name: the AI ranking checks reworded texts against it."""
    name = column["name"]
    agg = column.get("default_agg") if column.get("default_agg") in _AGG_LABEL else ("sum" if _is_additive(name) else "avg")
    return {"agg": agg, "column": name}, f"{_AGG_LABEL[agg]} {name}"


def _periods(low, high, grain):
    """How many periods of this grain the date range touches."""
    if grain == "year":
        return high.year - low.year + 1
    if grain == "quarter":
        return (high.year * 4 + (high.month - 1) // 3) - (low.year * 4 + (low.month - 1) // 3) + 1
    if grain == "month":
        return (high.year * 12 + high.month) - (low.year * 12 + low.month) + 1
    if grain == "week":  # pandas "W" periods run Monday to Sunday
        return (high.date() - (low.date() - timedelta(days=low.weekday()))).days // 7 + 1
    return (high.date() - low.date()).days + 1


def _grain(column, wanted, order):
    """The first grain in `order` that splits the date range into at least `wanted` periods."""
    try:
        low, high = datetime.fromisoformat(column["min"]), datetime.fromisoformat(column["max"])
    except (TypeError, ValueError):
        return None
    return next((g for g in order if _periods(low, high, g) >= wanted), None)


def _usable(profile):
    """(measures, categories, dates): the columns worth putting on a chart."""
    rows = profile["rows"]
    measures, categories, dates = [], [], []
    for c in profile["columns"]:
        # role is present only when the profile went through semantic_layer.apply_to_profile
        role = c.get("role")
        if c["missing_pct"] > MAX_MISSING_PCT or role == "identifier":
            continue
        if c["kind"] == "numeric" and role in (None, "measure") and not is_identifier(c, rows):
            measures.append(c)
        elif c["kind"] == "categorical" and CATEGORY_MIN_DISTINCT <= c["distinct"] <= CATEGORY_MAX_DISTINCT:
            categories.append(c)
        elif c["kind"] == "date" and c["distinct"] > 1:
            dates.append(c)
    measures.sort(key=lambda c: _hint_rank(c["name"]))  # stable: ties keep the column order
    return measures, categories, dates


def _suggestion(rule, key, text, widget):
    return {"id": f"{rule}:{key}", "rule": rule, "text": text, "widget": {"title": text, **widget}}


def suggest_from_profile(profile, audience="business", limit=DEFAULT_LIMIT):
    measures, categories, dates = _usable(profile)
    main = _metric(measures[0]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
    by_rule = {rule: [] for rule in ("R1", "R2", "R3", "R4", "R5", "R7", "R8")}

    if dates:
        date = dates[0]["name"]
        grain = _grain(dates[0], 6, ("month", "week", "day")) if dates[0]["distinct"] >= 3 else None
        if grain:
            by_rule["R1"].append(_suggestion(
                "R1", f"{main[0]['column']}:{date}", f"แนวโน้ม {main[1]} {_GRAIN_LABEL[grain]} ตาม {date}",
                {"type": "line", "x": date, "time_grain": grain, "metric": main[0]}))
        grain = _grain(dates[0], 2, _COMPARE_GRAINS)
        if grain:
            by_rule["R4"].append(_suggestion(
                "R4", f"{main[0]['column']}:{date}", f"{main[1]} {_LATEST_LABEL[grain]} เทียบช่วงก่อนหน้า",
                {"type": "kpi", "metric": main[0], "compare": {"date_column": date, "time_grain": grain}}))

    # A ranking over a long list says more than a split of 3 values, so longer lists come first.
    ranked = sorted(categories, key=lambda c: -c["distinct"])
    for c in ranked:
        name, many = c["name"], c["distinct"] > TOP_N
        text = f"{TOP_N} {name} ที่ {main[1]} สูงสุด" if many else f"{main[1]} ตาม {name}"
        by_rule["R2"].append(_suggestion("R2", name, text, {"type": "bar", "x": name, "metric": main[0], "sort": "desc", "limit": TOP_N}))
    long_lists = [c["name"] for c in ranked if c["distinct"] > TOP_N]
    if main[0]["agg"] == "avg" and long_lists:  # an average ranks differently from how common each value is
        name = long_lists[0]
        by_rule["R2"].append(_suggestion("R2", f"{name}:count", f"{TOP_N} {name} ที่มีจำนวนแถวมากที่สุด",
                                         {"type": "bar", "x": name, "metric": {"agg": "count", "column": None}, "sort": "desc", "limit": TOP_N}))

    share = main if main[0]["agg"] == "sum" else ({"agg": "count", "column": None}, "จำนวนแถว")
    for c in ranked:
        if c["distinct"] <= DONUT_MAX_DISTINCT:
            by_rule["R3"].append(_suggestion("R3", c["name"], f"สัดส่วน {share[1]} ตาม {c['name']}",
                                             {"type": "donut", "x": c["name"], "metric": share[0], "limit": DONUT_MAX_DISTINCT}))

    small = sorted((c for c in categories if c["distinct"] <= DONUT_MAX_DISTINCT), key=lambda c: c["distinct"])
    wide = sorted((c for c in categories if c["distinct"] <= SPLIT_MAX_DISTINCT), key=lambda c: -c["distinct"])
    pair = next(((x, g) for x in wide for g in small if g["name"] != x["name"]), None)
    if pair:
        x, group = pair[0]["name"], pair[1]["name"]
        by_rule["R5"].append(_suggestion("R5", f"{x}:{group}", f"{main[1]} ตาม {x} แยกตาม {group}",
                                         {"type": "bar", "x": x, "group_by": group, "stacked": True, "metric": main[0]}))

    if measures and not dates and not categories:
        for c in measures[:3]:
            metric, label = _metric(c)
            by_rule["R7"].append(_suggestion("R7", c["name"], f"ดู{label}", {"type": "kpi", "metric": metric}))

    by_rule["R8"] = _health_checks(profile)
    order = _RULE_ORDER.get(audience, _RULE_ORDER["business"])
    if audience == "steward":  # the health checks lead: that is what this reader opens the page for
        lead = by_rule["R8"][:min(HEALTH_FIRST, limit)]
        return lead + _interleave({**by_rule, "R8": by_rule["R8"][len(lead):]}, order, limit - len(lead))
    return _interleave(by_rule, order, limit)


def _health_checks(profile):
    """What a data steward looks at first: duplicates in key-like columns, empty cells, value ranges.
    Every column counts here, including the identifiers and sparse columns that the charts leave out."""
    columns, rows = profile["columns"], profile["rows"]
    checks = []
    for c in key_like_columns(profile):
        checks.append(_suggestion("R8", f"duplicates:{c['name']}", f"ตรวจแถวซ้ำของ {c['name']}",
                                  {"type": "kpi", "metric": {"agg": "count_distinct", "column": c["name"]}}))
    for c in emptiest_columns(profile):
        checks.append(_suggestion("R8", f"missing:{c['name']}", f"ตรวจค่าว่างของ {c['name']} ({c['missing_pct']:g}%)",
                                  {"type": "kpi", "metric": {"agg": "count_missing", "column": c["name"]}}))
    for c in [c for c in columns if c["kind"] == "numeric" and not is_identifier(c, rows)][:HEALTH_RANGES]:
        # the widget is only a validity fragment: /suggestions never returns it and generation reads only the text,
        # so a single max kpi is enough here
        checks.append(_suggestion("R8", f"range:{c['name']}", f"ตรวจช่วงค่าต่ำสุดและสูงสุดของ {c['name']}",
                                  {"type": "kpi", "metric": {"agg": "max", "column": c["name"]}}))
    return checks


def _interleave(by_rule, order, limit):
    """One pick from every rule first, then second picks, so the list stays varied."""
    picked, depth = [], 0
    while len(picked) < limit and any(len(by_rule[r]) > depth for r in order):
        for rule in order:
            if len(by_rule[rule]) > depth and len(picked) < limit:
                picked.append(by_rule[rule][depth])
        depth += 1
    return picked


def _change(gap, key, text):
    return {"id": f"{gap}:{key}", "rule": gap, "text": text}


def _kpi_columns(widgets, metrics):
    """The columns the kpi cards already show, directly or through a simple semantic-layer metric."""
    by_id = {m["id"]: m for m in metrics or []}
    columns = set()
    for w in widgets:
        if w["type"] != "kpi":
            continue
        definition = by_id.get(w["metric"].get("metric_id"))
        if definition is None:
            columns.add(w["metric"].get("column"))
        elif definition["type"] == "simple":
            columns.add(definition["measure"]["column"])
    return columns


def suggest_refinements(profile, spec, limit=GAP_LIMIT, metrics=None):
    """What the current dashboard does not use yet, as instructions the refine box understands.

    `spec` is a spec that validate_spec() produced for this profile; the suggestions are the gaps
    between it and the columns the profile says are worth charting. Same rules as above: profile and
    spec only, no rows, no LLM. `metrics` are the semantic-layer definitions that {"metric_id"}
    widgets name."""
    measures, categories, dates = _usable(profile)
    widgets, filters = spec["widgets"], spec["filters"]
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    distinct = {c["name"]: c["distinct"] for c in profile["columns"]}
    main = _metric(measures[0]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
    by_gap = {gap: [] for gap in _GAP_ORDER}

    if dates and not any(w["type"] in ("line", "area") for w in widgets):
        grain = _grain(dates[0], 6, ("month", "week", "day")) if dates[0]["distinct"] >= 3 else None
        if grain:
            by_gap["G3"].append(_change("G3", dates[0]["name"], f"เพิ่มแนวโน้ม {main[1]} {_GRAIN_LABEL[grain]} ตาม {dates[0]['name']}"))

    plain_kpi = next((w for w in widgets if w["type"] == "kpi" and not w.get("compare")), None)
    if dates and plain_kpi and _grain(dates[0], 2, _COMPARE_GRAINS):
        by_gap["G4"].append(_change("G4", plain_kpi["id"], f"แสดง {plain_kpi['title']} เทียบช่วงก่อนหน้า"))

    if len(filters) < MAX_FILTERS:
        filtered = {f["column"] for f in filters}
        open_columns = [c for c in categories if c["distinct"] <= MAX_FILTER_DISTINCT and c["name"] not in filtered]
        for c in sorted(open_columns, key=lambda c: c["distinct"]):
            by_gap["G1"].append(_change("G1", c["name"], f"เพิ่มตัวกรอง {c['name']}"))

    in_kpi = _kpi_columns(widgets, metrics)
    for c in measures:
        if c["name"] not in in_kpi:
            by_gap["G2"].append(_change("G2", c["name"], f"เพิ่ม KPI {_metric(c)[1]}"))

    for w in widgets:  # a share only reads well over a few values, and only for totals and counts
        few_values = kinds.get(w.get("x")) == "categorical" and distinct[w["x"]] <= DONUT_MAX_DISTINCT
        if w["type"] == "bar" and few_values and not w["group_by"] and w["metric"].get("agg") in ("sum", "count"):
            by_gap["G5"].append(_change("G5", w["id"], f"เปลี่ยน '{w['title']}' เป็นกราฟสัดส่วน"))

    if spec.get("audience") == "management" and any(w["type"] == "table" for w in widgets):
        by_gap["G6"].append(_change("G6", "table", "ลบตารางรายละเอียดให้เหมาะกับผู้บริหาร"))

    return _interleave(by_gap, _GAP_ORDER, limit)
