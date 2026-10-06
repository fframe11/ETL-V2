"""Suggestions for the Create Dashboard tab, derived from a dataset's column profile alone.

suggest_from_profile() reads the profile that dashboard_data.profile_dataframe() builds (names,
kinds, distinct counts, missing %, numeric and date ranges) and returns what the dataset can
answer. Every suggestion carries a widget that validate_spec() accepts for that profile, so a
suggestion never asks for something the builder cannot draw. It is a pure function: no rows, no
LLM, no I/O."""
from datetime import datetime

CATEGORY_MIN_DISTINCT = 2
CATEGORY_MAX_DISTINCT = 200  # a top-10 stays readable far beyond the 50 values a donut or filter can take
DONUT_MAX_DISTINCT = 8
TOP_N = 10
MAX_MISSING_PCT = 50
DEFAULT_LIMIT = 6

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
               "management": ("R4", "R1", "R3", "R2", "R5", "R7")}


def is_identifier(column, rows):
    """A whole-number column that is (nearly) unique or has 9+ digit values: an id, account or
    phone number, whose min and max are real records."""
    low, high = column.get("min"), column.get("max")
    if low is None or high is None or float(low) != int(low) or float(high) != int(high):
        return False
    digits = len(str(int(max(abs(low), abs(high)))))
    return digits >= 9 or bool(rows and column["distinct"] / rows >= 0.9)


def _hint_rank(name):
    lowered = name.lower()
    for rank, words in enumerate(_MEASURE_HINTS):
        if any(w in lowered for w in words):
            return rank
    return len(_MEASURE_HINTS)


def _is_additive(name):
    lowered = name.lower()
    return any(w in lowered for w in _ADDITIVE_HINTS)


def _metric(name):
    """(metric, label): a total for quantities that add up, an average for the rest."""
    if _is_additive(name):
        return {"agg": "sum", "column": name}, f"ผลรวม {name}"
    return {"agg": "avg", "column": name}, f"ค่าเฉลี่ย {name}"


def _periods(low, high, grain):
    """How many periods of this grain the date range touches."""
    if grain == "year":
        return high.year - low.year + 1
    if grain == "quarter":
        return (high.year * 4 + (high.month - 1) // 3) - (low.year * 4 + (low.month - 1) // 3) + 1
    if grain == "month":
        return (high.year * 12 + high.month) - (low.year * 12 + low.month) + 1
    days = (high.date() - low.date()).days
    return days // 7 + 2 if grain == "week" else days + 1


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
        if c["missing_pct"] > MAX_MISSING_PCT:
            continue
        if c["kind"] == "numeric" and not is_identifier(c, rows):
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
    main = _metric(measures[0]["name"]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
    by_rule = {rule: [] for rule in ("R1", "R2", "R3", "R4", "R5", "R7")}

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
    if main[0]["agg"] != "sum" and long_lists:  # an average ranks differently from how common each value is
        name = long_lists[0]
        by_rule["R2"].append(_suggestion("R2", f"{name}:count", f"{TOP_N} {name} ที่มีจำนวนแถวมากที่สุด",
                                         {"type": "bar", "x": name, "metric": {"agg": "count", "column": None}, "sort": "desc", "limit": TOP_N}))

    share = main if main[0]["agg"] == "sum" else ({"agg": "count", "column": None}, "จำนวนแถว")
    for c in ranked:
        if c["distinct"] <= DONUT_MAX_DISTINCT:
            by_rule["R3"].append(_suggestion("R3", c["name"], f"สัดส่วน {share[1]} ตาม {c['name']}",
                                             {"type": "donut", "x": c["name"], "metric": share[0]}))

    small = sorted((c for c in categories if c["distinct"] <= DONUT_MAX_DISTINCT), key=lambda c: c["distinct"])
    wide = sorted((c for c in categories if c["distinct"] <= 20), key=lambda c: -c["distinct"])
    pair = next(((x, g) for x in wide for g in small if g["name"] != x["name"]), None)
    if pair:
        x, group = pair[0]["name"], pair[1]["name"]
        by_rule["R5"].append(_suggestion("R5", f"{x}:{group}", f"{main[1]} ตาม {x} แยกตาม {group}",
                                         {"type": "bar", "x": x, "group_by": group, "stacked": True, "metric": main[0]}))

    if measures and not dates and not categories:
        for c in measures[:3]:
            metric, label = _metric(c["name"])
            by_rule["R7"].append(_suggestion("R7", c["name"], f"ดู{label}", {"type": "kpi", "metric": metric}))

    order = _RULE_ORDER.get(audience, _RULE_ORDER["business"])
    picked, depth = [], 0
    while len(picked) < limit and any(len(by_rule[r]) > depth for r in order):
        for rule in order:  # one from every rule first, then second picks, so the list stays varied
            if len(by_rule[rule]) > depth and len(picked) < limit:
                picked.append(by_rule[rule][depth])
        depth += 1
    return picked
