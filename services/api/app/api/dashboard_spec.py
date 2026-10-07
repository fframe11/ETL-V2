"""Dashboard spec v1: the JSON the LLM writes and the UI draws.

validate_spec() is the only way from LLM (or browser) JSON to the query engine. It keeps
known widget types, columns that exist in the dataset profile and whitelisted
aggregations, clamps sizes and limits, assigns ids and packs the layout. Anything else
is dropped with a warning; nothing in a spec is ever executed as code or SQL."""
import re

SPEC_VERSION = 1
GRID_COLUMNS = 12
MAX_ROW_SPAN = 8
MAX_WIDGETS = 16
MAX_FILTERS = 6
MAX_TABLE_COLUMNS = 12
WIDGET_TYPES = ("kpi", "bar", "line", "area", "pie", "donut", "table")
AGGREGATIONS = ("count", "count_distinct", "count_missing", "sum", "avg", "min", "max")
NUMERIC_AGGREGATIONS = ("sum", "avg", "min", "max")
TIME_GRAINS = ("day", "week", "month", "quarter", "year")
FORMATS = ("number", "currency", "percent")
AUDIENCES = ("business", "analyst", "management", "steward")
BAR_SORTS = ("desc", "asc", "x")
DEFAULT_SIZE = {"kpi": (3, 2), "bar": (6, 4), "line": (6, 4), "area": (6, 4),
                "pie": (4, 4), "donut": (4, 4), "table": (12, 5)}
LIMITS = {"bar": (10, 20), "pie": (6, 8), "donut": (6, 8), "table": (50, 200)}  # (default, max)
_LAST = 10_000
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


class SpecError(ValueError):
    """Nothing usable is left in the spec."""


def _text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def _int(value, default, low, high):
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return default
    return max(low, min(high, number))


def _known(value, kinds):
    """True when value names a profile column. Lists and dicts from bad JSON are never columns."""
    return isinstance(value, str) and value in kinds


def _metric(raw, kinds, columns, by_id):
    """(metric, problem). count takes no column; sum/avg/min/max need a numeric column that is
    not an identifier; {"metric_id"} must name a usable metric of the semantic layer."""
    if not isinstance(raw, dict):
        return None, "ไม่มี metric"
    if "metric_id" in raw:
        metric_id = raw["metric_id"]
        if not isinstance(metric_id, str) or metric_id not in by_id:
            return None, f"ไม่มี metric {metric_id}"
        return {"metric_id": metric_id}, None
    agg, column = raw.get("agg"), raw.get("column")
    if agg not in AGGREGATIONS:
        return None, f"ไม่รองรับการคำนวณ {agg}"
    if agg == "count":
        return {"agg": "count", "column": None}, None
    if not _known(column, kinds):
        return None, f"ไม่มีคอลัมน์ {column}"
    if agg in NUMERIC_AGGREGATIONS and kinds[column] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    if agg in NUMERIC_AGGREGATIONS and columns[column].get("role") == "identifier":
        return None, f"{agg} ใช้กับคอลัมน์รหัสไม่ได้ ({column})"
    return {"agg": agg, "column": column}, None


def _label(columns, name):
    """The display name of a column: its semantic label, or the column name."""
    return columns[name].get("label") or name


def _presentation(metric, raw, columns, by_id):
    """(format, currency, higher_is_better). The semantic layer decides; the format the LLM
    sent is used only when the semantic layer says nothing about the column."""
    if "metric_id" in metric:
        definition = by_id[metric["metric_id"]]
        return definition["format"], definition.get("currency"), definition.get("higher_is_better", True)
    if metric["agg"] in ("count", "count_distinct", "count_missing"):
        return "number", None, True
    meta = columns[metric["column"]]
    if meta.get("role") == "measure":
        if meta.get("unit") == "currency":
            return "currency", meta.get("currency"), True
        if meta.get("unit") == "percent" and metric["agg"] != "sum":
            return "percent", None, True
        # A plain number unit may just be the rules' guess for a rate (nobody approved it), so the
        # LLM's percent stays; a sum of rates is not a rate.
        if meta.get("unit") == "number" and raw.get("format") == "percent" and metric["agg"] != "sum":
            return "percent", None, True
        return "number", None, True
    return (raw.get("format") if raw.get("format") in FORMATS else "number"), None, True


def _default_title(w, columns, by_id):
    if w["type"] == "table":
        return "ตารางข้อมูล"
    metric = w["metric"]
    if "metric_id" in metric:
        label = by_id[metric["metric_id"]]["label"]
    elif metric["agg"] == "count":
        label = "จำนวนแถว"
    else:
        label = f"{metric['agg']}({_label(columns, metric['column'])})"
    return f"{label} ตาม {_label(columns, w['x'])}" if w.get("x") else label


def _layout(raw, wtype):
    """(size, reading order). The LLM's x/y only decide the order; _pack() places widgets."""
    width, height = DEFAULT_SIZE[wtype]
    raw = raw if isinstance(raw, dict) else {}
    size = {"w": _int(raw.get("w"), width, 1, GRID_COLUMNS), "h": _int(raw.get("h"), height, 1, MAX_ROW_SPAN)}
    return size, (_int(raw.get("y"), _LAST, 0, _LAST), _int(raw.get("x"), 0, 0, GRID_COLUMNS))


def _widget(raw, kinds, warnings, columns, by_id):
    """(widget, reading order) or None when the widget cannot be drawn."""
    if not isinstance(raw, dict):
        return None
    wtype = raw.get("type")
    title = _text(raw.get("title"), 80)
    name = title or str(wtype)

    def drop(problem):
        warnings.append(f"ตัดวิดเจ็ต '{name}': {problem}")
        return None

    if wtype not in WIDGET_TYPES:
        return drop(f"ไม่รองรับชนิด {wtype}")
    w = {"id": raw.get("id"), "type": wtype, "title": title}
    if wtype == "table":
        listed = raw.get("columns") if isinstance(raw.get("columns"), list) else []
        unknown = [c for c in listed if isinstance(c, str) and c not in kinds]
        if unknown:
            warnings.append(f"'{name}': ตัดคอลัมน์ {', '.join(unknown)} ออกจากตาราง เพราะไม่มีในชุดข้อมูลหรือเป็นข้อมูลส่วนบุคคล")
        w["columns"] = list(dict.fromkeys(c for c in listed if _known(c, kinds)))[:MAX_TABLE_COLUMNS] or list(kinds)[:8]
        order = raw.get("order_by")
        if isinstance(order, dict) and order.get("column") in w["columns"]:
            w["order_by"] = {"column": order["column"], "desc": bool(order.get("desc", True))}
    else:
        metric, problem = _metric(raw.get("metric"), kinds, columns, by_id)
        if problem:
            return drop(problem)
        w["metric"] = metric
        w["format"], w["currency"], w["higher_is_better"] = _presentation(metric, raw, columns, by_id)
    if wtype == "kpi" and isinstance(raw.get("compare"), dict):
        compare = raw["compare"]
        if _known(compare.get("date_column"), kinds) and kinds[compare["date_column"]] == "date":
            grain = compare.get("time_grain") if compare.get("time_grain") in TIME_GRAINS else "month"
            w["compare"] = {"date_column": compare["date_column"], "time_grain": grain}
        else:
            warnings.append(f"'{name}': ไม่เปรียบเทียบช่วงเวลา เพราะ {compare.get('date_column')} ไม่ใช่คอลัมน์วันที่")
    if wtype in ("bar", "line", "area", "pie", "donut"):
        x = raw.get("x")
        if not _known(x, kinds):
            return drop(f"ไม่มีคอลัมน์ {x}")
        if columns[x].get("role") == "identifier":
            return drop(f"ใช้คอลัมน์รหัส {x} เป็นแกนกราฟไม่ได้")
        if wtype in ("line", "area") and kinds[x] not in ("date", "numeric"):
            return drop(f"กราฟเส้นต้องใช้แกน X เป็นวันที่หรือตัวเลข ({x})")
        w["x"] = x
    if wtype in ("bar", "pie", "donut") and kinds[w["x"]] == "date":
        # a date on a category axis is grouped into time buckets, not into raw timestamps
        w["time_grain"] = raw.get("time_grain") if raw.get("time_grain") in TIME_GRAINS else "month"
    if wtype in ("bar", "line", "area"):
        group = raw.get("group_by")
        usable = _known(group, kinds) and group != w["x"] and columns[group].get("role") != "identifier"
        w["group_by"] = group if usable else None
        w["stacked"] = bool(raw.get("stacked")) and w["group_by"] is not None
    if wtype in ("line", "area"):
        grain = raw.get("time_grain") if raw.get("time_grain") in TIME_GRAINS else "month"
        w["time_grain"] = grain if kinds[w["x"]] == "date" else None
    if wtype == "bar":
        w["sort"] = raw.get("sort") if raw.get("sort") in BAR_SORTS else "desc"
    if wtype in LIMITS:
        default, high = LIMITS[wtype]
        w["limit"] = _int(raw.get("limit"), default, 1, high)
    if not w["title"]:
        w["title"] = _default_title(w, columns, by_id)
    w["layout"], order = _layout(raw.get("layout"), wtype)
    return w, order


def _pack(widgets):
    """Left-to-right rows on the 12-column grid, in reading order; no overlaps."""
    x = y = row_height = 0
    for w in widgets:
        width, height = w["layout"]["w"], w["layout"]["h"]
        if x + width > GRID_COLUMNS:
            x, y, row_height = 0, y + row_height, 0
        w["layout"] = {"x": x, "y": y, "w": width, "h": height}
        x += width
        row_height = max(row_height, height)


def _assign_ids(items, prefix):
    used = set()
    for item in items:
        valid = isinstance(item["id"], str) and _ID_RE.match(item["id"])
        if valid and item["id"] not in used:
            used.add(item["id"])
        else:
            item["id"] = None
    n = 1
    for item in items:
        if item["id"] is None:
            while f"{prefix}{n}" in used:
                n += 1
            item["id"] = f"{prefix}{n}"
            used.add(item["id"])


def _filters(raw_filters, kinds, warnings, columns):
    out, seen = [], set()
    for raw in raw_filters if isinstance(raw_filters, list) else []:
        if not isinstance(raw, dict):
            continue
        column = raw.get("column")
        if not _known(column, kinds):
            warnings.append(f"ตัดตัวกรอง: ไม่มีคอลัมน์ {column}")
            continue
        if column in seen or len(out) >= MAX_FILTERS:
            continue
        seen.add(column)
        out.append({"id": raw.get("id"), "column": column,
                    "type": "date_range" if kinds[column] == "date" else "select",
                    "label": _text(raw.get("label"), 40) or _label(columns, column)})
    return out


def validate_spec(raw, profile, metrics=None):
    """(spec, warnings). Raises SpecError when raw is not an object or no widget survives.
    profile may carry the semantic fields of each column (semantic_layer.apply_to_profile:
    role, label, unit, currency) and metrics are the dataset's usable metric definitions."""
    if not isinstance(raw, dict):
        raise SpecError("สเปกต้องเป็น JSON object")
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    columns = {c["name"]: c for c in profile["columns"]}
    by_id = {m["id"]: m for m in metrics or []}
    warnings = []
    raw_widgets = raw.get("widgets") if isinstance(raw.get("widgets"), list) else []
    if len(raw_widgets) > MAX_WIDGETS:
        warnings.append(f"ใช้ {MAX_WIDGETS} วิดเจ็ตแรก จาก {len(raw_widgets)}")
    placed = []
    for index, item in enumerate(raw_widgets[:MAX_WIDGETS]):
        result = _widget(item, kinds, warnings, columns, by_id)
        if result:
            widget, order = result
            placed.append((order, index, widget))
    if not placed:
        raise SpecError("ไม่มีวิดเจ็ตที่ใช้ได้")
    widgets = [w for _, _, w in sorted(placed, key=lambda p: (p[0], p[1]))]
    _assign_ids(widgets, "w")
    _pack(widgets)
    filters = _filters(raw.get("filters"), kinds, warnings, columns)
    _assign_ids(filters, "f")
    return {"version": SPEC_VERSION, "title": _text(raw.get("title"), 120) or "แดชบอร์ด",
            "description": _text(raw.get("description"), 300),
            "audience": raw.get("audience") if raw.get("audience") in AUDIENCES else "business",
            "filters": filters, "widgets": widgets}, warnings


def diff_specs(old, new):
    """What a refinement changed, by widget id; titles are what the user sees."""
    before = {w["id"]: w for w in old["widgets"]}
    after = {w["id"]: w for w in new["widgets"]}
    common = [i for i in after if i in before]

    def content(w):
        return {k: v for k, v in w.items() if k != "layout"}

    old_filters = {f["column"] for f in old["filters"]}
    new_filters = {f["column"] for f in new["filters"]}
    return {"added": [after[i]["title"] for i in after if i not in before],
            "removed": [before[i]["title"] for i in before if i not in after],
            "changed": [after[i]["title"] for i in common if content(after[i]) != content(before[i])],
            "layout_changed": any(after[i]["layout"] != before[i]["layout"] for i in common),
            "filters_added": sorted(new_filters - old_filters),
            "filters_removed": sorted(old_filters - new_filters)}
