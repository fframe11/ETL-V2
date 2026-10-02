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
AGGREGATIONS = ("count", "count_distinct", "sum", "avg", "min", "max")
NUMERIC_AGGREGATIONS = ("sum", "avg", "min", "max")
TIME_GRAINS = ("day", "week", "month", "quarter", "year")
FORMATS = ("number", "currency", "percent")
AUDIENCES = ("business", "analyst", "management")
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
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def _metric(raw, kinds):
    """(metric, problem). count takes no column; sum/avg/min/max need a numeric one."""
    if not isinstance(raw, dict):
        return None, "ไม่มี metric"
    agg, column = raw.get("agg"), raw.get("column")
    if agg not in AGGREGATIONS:
        return None, f"ไม่รองรับการคำนวณ {agg}"
    if agg == "count":
        return {"agg": "count", "column": None}, None
    if column not in kinds:
        return None, f"ไม่มีคอลัมน์ {column}"
    if agg in NUMERIC_AGGREGATIONS and kinds[column] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    return {"agg": agg, "column": column}, None


def _default_title(w):
    if w["type"] == "table":
        return "ตารางข้อมูล"
    metric = w["metric"]
    label = "จำนวนแถว" if metric["agg"] == "count" else f"{metric['agg']}({metric['column']})"
    return f"{label} ตาม {w['x']}" if w.get("x") else label


def _layout(raw, wtype):
    """(size, reading order). The LLM's x/y only decide the order; _pack() places widgets."""
    width, height = DEFAULT_SIZE[wtype]
    raw = raw if isinstance(raw, dict) else {}
    size = {"w": _int(raw.get("w"), width, 1, GRID_COLUMNS), "h": _int(raw.get("h"), height, 1, MAX_ROW_SPAN)}
    return size, (_int(raw.get("y"), _LAST, 0, _LAST), _int(raw.get("x"), 0, 0, GRID_COLUMNS))


def _widget(raw, kinds, warnings):
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
        w["columns"] = [c for c in listed if c in kinds][:MAX_TABLE_COLUMNS] or list(kinds)[:8]
        order = raw.get("order_by")
        if isinstance(order, dict) and order.get("column") in w["columns"]:
            w["order_by"] = {"column": order["column"], "desc": bool(order.get("desc", True))}
    else:
        metric, problem = _metric(raw.get("metric"), kinds)
        if problem:
            return drop(problem)
        w["metric"] = metric
        w["format"] = raw.get("format") if raw.get("format") in FORMATS else "number"
    if wtype == "kpi" and isinstance(raw.get("compare"), dict):
        compare = raw["compare"]
        if kinds.get(compare.get("date_column")) == "date":
            grain = compare.get("time_grain") if compare.get("time_grain") in TIME_GRAINS else "month"
            w["compare"] = {"date_column": compare["date_column"], "time_grain": grain}
        else:
            warnings.append(f"'{name}': ไม่เปรียบเทียบช่วงเวลา เพราะ {compare.get('date_column')} ไม่ใช่คอลัมน์วันที่")
    if wtype in ("bar", "line", "area", "pie", "donut"):
        x = raw.get("x")
        if x not in kinds:
            return drop(f"ไม่มีคอลัมน์ {x}")
        if wtype in ("line", "area") and kinds[x] not in ("date", "numeric"):
            return drop(f"กราฟเส้นต้องใช้แกน X เป็นวันที่หรือตัวเลข ({x})")
        w["x"] = x
    if wtype in ("bar", "line", "area"):
        group = raw.get("group_by")
        w["group_by"] = group if group in kinds and group != w["x"] else None
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
        w["title"] = _default_title(w)
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


def _filters(raw_filters, kinds, warnings):
    out, seen = [], set()
    for raw in raw_filters if isinstance(raw_filters, list) else []:
        if not isinstance(raw, dict):
            continue
        column = raw.get("column")
        if column not in kinds:
            warnings.append(f"ตัดตัวกรอง: ไม่มีคอลัมน์ {column}")
            continue
        if column in seen or len(out) >= MAX_FILTERS:
            continue
        seen.add(column)
        out.append({"id": raw.get("id"), "column": column,
                    "type": "date_range" if kinds[column] == "date" else "select",
                    "label": _text(raw.get("label"), 40) or column})
    return out


def validate_spec(raw, profile):
    """(spec, warnings). Raises SpecError when raw is not an object or no widget survives."""
    if not isinstance(raw, dict):
        raise SpecError("สเปกต้องเป็น JSON object")
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    warnings = []
    raw_widgets = raw.get("widgets") if isinstance(raw.get("widgets"), list) else []
    if len(raw_widgets) > MAX_WIDGETS:
        warnings.append(f"ใช้ {MAX_WIDGETS} วิดเจ็ตแรก จาก {len(raw_widgets)}")
    placed = []
    for index, item in enumerate(raw_widgets[:MAX_WIDGETS]):
        result = _widget(item, kinds, warnings)
        if result:
            widget, order = result
            placed.append((order, index, widget))
    if not placed:
        raise SpecError("ไม่มีวิดเจ็ตที่ใช้ได้")
    widgets = [w for _, _, w in sorted(placed, key=lambda p: (p[0], p[1]))]
    _assign_ids(widgets, "w")
    _pack(widgets)
    filters = _filters(raw.get("filters"), kinds, warnings)
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
