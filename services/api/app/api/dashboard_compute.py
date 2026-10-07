"""Chart-ready numbers for a validated dashboard spec (pandas, in the API process).

Every column and aggregation reaching this module was accepted by validate_spec(), so
the work here is plain group-by arithmetic over the active-layer DataFrame."""
import logging
import math
import operator

import pandas as pd

from .dashboard_data import to_numeric_safe
from .data_export import _records_json_safe

logger = logging.getLogger(__name__)

EMPTY = "(ว่าง)"
OTHER = "อื่นๆ"
MAX_SERIES = 8
MAX_POINTS = 500
MAX_FILTER_OPTIONS = 100
_PERIODS = {"day": "D", "week": "W", "month": "M", "quarter": "Q", "year": "Y"}
_REDUCERS = {"sum": "sum", "avg": "mean", "min": "min", "max": "max"}


def _value(v):
    if v is None or pd.isna(v) or not math.isfinite(float(v)):
        return None  # JSON cannot carry nan or inf
    return round(float(v), 4)


def _day(v):
    return None if pd.isna(v) else pd.Timestamp(v).date().isoformat()


def _labels(series):
    if pd.api.types.is_datetime64_any_dtype(series):
        # pandas formats datetimes array-wide ("2025-01-01" or "2025-01-01 00:00:00" depending on
        # the other values), so a filtered subset would stop matching the label the chart showed.
        return series.dt.strftime("%Y-%m-%d %H:%M:%S").astype("string").fillna(EMPTY)
    return series.astype("string").fillna(EMPTY)


def _bucket(series, grain):
    return series.dt.to_period(_PERIODS[grain]).dt.start_time


def _bucket_labels(series, grain):
    return _bucket(series, grain).map(_day).astype("string").fillna(EMPTY)


def _x_labels(df, w):
    """The category of each row for a bar or pie: the raw label, or the time bucket of a date x."""
    grain = w.get("time_grain")
    if grain in _PERIODS and pd.api.types.is_datetime64_any_dtype(df[w["x"]]):
        return _bucket_labels(df[w["x"]], grain)
    return _labels(df[w["x"]])


def _aggregate(frame, metric):
    agg, column = metric["agg"], metric["column"]
    if agg == "count":
        return len(frame)
    if agg == "count_distinct":
        return int(frame[column].nunique())
    if agg == "count_missing":
        return int(frame[column].isna().sum())
    numbers = to_numeric_safe(frame[column])
    return _value(getattr(numbers, _REDUCERS[agg])())


def _grouped(frame, keys, metric):
    groups = frame.groupby(keys, sort=False)
    agg, column = metric["agg"], metric["column"]
    if agg == "count":
        return groups.size()
    if agg == "count_distinct":
        return groups[column].nunique()
    if agg == "count_missing":
        return frame.assign(_missing=frame[column].isna()).groupby(keys, sort=False)["_missing"].sum()
    return groups[column].agg(_REDUCERS[agg])


_COMPARE = {"gt": operator.gt, "gte": operator.ge, "lt": operator.lt, "lte": operator.le}


def _matches(series, values):
    if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
        numbers = pd.to_numeric(pd.Series(list(values), dtype="object"), errors="coerce").dropna().tolist()
        return series.isin(numbers).fillna(False).astype(bool)
    return _labels(series).isin([str(v) for v in values]).astype(bool)


def _naive(value):
    stamp = pd.Timestamp(value)
    return stamp.tz_convert(None) if stamp.tzinfo else stamp


def _date_matches(series, values):
    """A date value without a time part matches the whole calendar day, otherwise the exact instant."""
    days, mask = series.dt.normalize(), pd.Series(False, index=series.index)
    for value in values:
        stamp = _naive(value)
        mask |= (days == stamp) if stamp == stamp.normalize() else (series == stamp)
    return mask


def where_mask(frame, where):
    """Rows matching one metric condition (semantic_layer.WHERE_OPS). Text comparisons use
    the labels the charts show, so "(ว่าง)" matches empty values."""
    series, op, value = frame[where["column"]], where["op"], where["value"]
    if op in ("eq", "ne", "in"):
        values = value if op == "in" else [value]
        if pd.api.types.is_datetime64_any_dtype(series):
            mask = _date_matches(series, values)
        else:
            mask = _matches(series, values)
        return ~mask if op == "ne" else mask
    if pd.api.types.is_datetime64_any_dtype(series):
        bound = _naive(value)
    else:
        series, bound = pd.to_numeric(series, errors="coerce"), value
    return _COMPARE[op](series, bound).fillna(False).astype(bool)


def _part_value(frame, part):
    """A ratio part before rounding; only the final result goes through _value."""
    if part.get("where"):
        frame = frame[where_mask(frame, part["where"])]
    if part["agg"] in ("count", "count_distinct", "count_missing"):
        return _aggregate(frame, part)
    value = getattr(to_numeric_safe(frame[part["column"]]), _REDUCERS[part["agg"]])()
    return None if pd.isna(value) else float(value)


def evaluate_metric(frame, metric):
    """One number for a semantic-layer metric over frame; ratios in percent are x100 and a
    zero or empty denominator gives None."""
    if metric["type"] == "simple":
        value = _part_value(frame, metric["measure"])
    else:
        numerator = _part_value(frame, metric["numerator"])
        denominator = _part_value(frame, metric["denominator"])
        value = None if numerator is None or not denominator else numerator / denominator
        if value is not None and metric.get("format") == "percent":
            value *= 100
    return _value(value)


def _grouped_part(frame, keys, part, index):
    subset = frame[where_mask(frame, part["where"])] if part.get("where") else frame
    values = _grouped(subset, keys, part).reindex(index)
    return values.fillna(0) if part["agg"] in ("count", "count_distinct", "count_missing", "sum") else values


def grouped_metric(frame, keys, metric):
    """A metric per group of keys; every group present in frame gets a value (or NaN)."""
    index = frame.groupby(keys, sort=False).size().index
    if metric["type"] == "simple":
        return _grouped_part(frame, keys, metric["measure"], index)
    numerator = _grouped_part(frame, keys, metric["numerator"], index)
    denominator = _grouped_part(frame, keys, metric["denominator"], index)
    values = numerator / denominator.where(denominator != 0)
    return values * 100 if metric.get("format") == "percent" else values


def metric_values(df, metrics):
    """{id: value} for the semantic-layer panel; a metric that cannot be computed gives None."""
    values = {}
    for metric in metrics:
        try:
            values[metric["id"]] = evaluate_metric(df, metric)
        except Exception:  # one broken definition must not hide the others
            logger.warning("Metric %s could not be computed", metric.get("id"), exc_info=True)
            values[metric["id"]] = None
    return values


def _top(totals, limit, ascending=False):
    return list(totals.sort_values(ascending=ascending, kind="stable").index[:limit])


def _pivot_rows(frame, keys, metric, group):
    """rows [{"x": key, <series>: value}] for the given x keys, and the series names."""
    if not group:
        totals = _grouped(frame, ["_x"], metric)
        return [{"x": k, "value": _value(totals.get(k))} for k in keys], ["value"]
    frame = frame.assign(_g=_labels(frame[group]))
    totals = _grouped(frame, ["_g"], metric)
    names = _top(totals, MAX_SERIES)
    if len(totals) > MAX_SERIES:
        frame = frame.assign(_g=frame["_g"].where(frame["_g"].isin(names), OTHER))
        names = names + [OTHER]
    cells = _grouped(frame, ["_x", "_g"], metric)
    return [{"x": k, **{s: _value(cells.get((k, s))) for s in names}} for k in keys], names


def _kpi(df, w):
    out = {"value": _value(_aggregate(df, w["metric"]))}
    compare = w.get("compare")
    if compare:
        buckets = _bucket(df[compare["date_column"]], compare["time_grain"])
        periods = sorted(buckets.dropna().unique())
        if len(periods) >= 2:
            current = _aggregate(df[buckets == periods[-1]], w["metric"])
            previous = _aggregate(df[buckets == periods[-2]], w["metric"])
            change = round((current - previous) / abs(previous) * 100, 1) if previous and current is not None else None
            out.update(current=_value(current), previous=_value(previous),
                       period=_day(periods[-1]), change_pct=change)
    return out


def _bar(df, w):
    frame = df.assign(_x=_x_labels(df, w))
    totals = _grouped(frame, ["_x"], w["metric"])
    if w["sort"] == "x":
        keys = sorted(totals.index)[: w["limit"]]
    else:
        keys = _top(totals, w["limit"], ascending=(w["sort"] == "asc"))
    rows, series = _pivot_rows(frame[frame["_x"].isin(keys)], keys, w["metric"], w["group_by"])
    return {"rows": rows, "series": series}


def _pie(df, w):
    frame = df.assign(_x=_x_labels(df, w))
    totals = _grouped(frame, ["_x"], w["metric"])
    keys = _top(totals, w["limit"])
    if len(totals) > len(keys):
        frame = frame.assign(_x=frame["_x"].where(frame["_x"].isin(keys), OTHER))
        totals = _grouped(frame, ["_x"], w["metric"])
        keys = keys + [OTHER]
    return {"rows": [{"x": k, "value": _value(totals.get(k))} for k in keys], "series": ["value"]}


def _time(df, w):
    x = w["x"]
    frame = df.assign(_t=_bucket(df[x], w["time_grain"]) if w["time_grain"] else df[x]).dropna(subset=["_t"])
    points = sorted(frame["_t"].unique())[-MAX_POINTS:]
    label = _day if w["time_grain"] else _value
    frame = frame[frame["_t"].isin(points)]
    frame = frame.assign(_x=frame["_t"].map(label))
    rows, series = _pivot_rows(frame, [label(t) for t in points], w["metric"], w["group_by"])
    return {"rows": rows, "series": series}


def _table(df, w):
    frame = df[w["columns"]]
    order = w.get("order_by")
    if order:
        frame = frame.sort_values(order["column"], ascending=not order["desc"], na_position="last", kind="stable")
    return {"columns": w["columns"], "rows": _records_json_safe(frame.head(w["limit"])), "total_rows": len(df)}


_COMPUTE = {"kpi": _kpi, "bar": _bar, "line": _time, "area": _time, "pie": _pie, "donut": _pie, "table": _table}


def _timestamp(value):
    if not value:
        return None
    try:
        ts = pd.Timestamp(value)
        if pd.isna(ts):
            return None
        if ts.tzinfo is not None:  # frame columns are tz-naive UTC wall time
            ts = ts.tz_convert(None)
        return ts.as_unit("ns")  # raises when outside the datetime64[ns] range
    except (TypeError, ValueError, OverflowError, pd.errors.OutOfBoundsDatetime):
        return None


def apply_filters(df, selections, kinds):
    """Rows matching the viewer's choices. {"values": [...]} matches the labels the charts
    show, so a drill-down click on "(ว่าง)" works; {"from", "to"} on a date column includes
    both days. Unknown columns and malformed selections are ignored."""
    for column, selection in (selections or {}).items():
        if column not in kinds or not isinstance(selection, dict):
            continue
        values = selection.get("values")
        if isinstance(values, list) and values:
            grain = selection.get("grain")
            if kinds[column] == "date" and isinstance(grain, str) and grain in _PERIODS:
                labels = _bucket_labels(df[column], grain)  # the label of a bucketed bar or slice
            else:
                labels = _labels(df[column])
            df = df[labels.isin([str(v) for v in values])]
        if kinds[column] == "date":
            start, end = _timestamp(selection.get("from")), _timestamp(selection.get("to"))
            if start is not None:
                df = df[df[column] >= start]
            if end is not None:
                try:
                    end = end + pd.Timedelta(days=1)
                except (OverflowError, pd.errors.OutOfBoundsDatetime):
                    end = None  # no representable upper bound: treat as unbounded
                if end is not None:
                    df = df[df[column] < end]
    return df


def filter_options(df, spec):
    options = {}
    for f in spec["filters"]:
        column = df[f["column"]]
        if f["type"] == "date_range":
            options[f["column"]] = {"min": _day(column.min()), "max": _day(column.max())}
        else:
            values = sorted(column.dropna().astype("string").unique().tolist())
            options[f["column"]] = {"values": values[:MAX_FILTER_OPTIONS]}
    return options


def compute_dashboard(df, spec, profile, selections=None):
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    filtered = apply_filters(df, selections, kinds)
    widgets = {}
    for w in spec["widgets"]:
        try:
            widgets[w["id"]] = _COMPUTE[w["type"]](filtered, w)
        except Exception as exc:  # one broken widget must not blank the whole dashboard
            logger.exception("Dashboard widget %s (%s) could not be computed", w["id"], w["type"])
            widgets[w["id"]] = {"error": f"คำนวณวิดเจ็ตนี้ไม่ได้: {exc}"}
    return {"widgets": widgets, "filter_options": filter_options(df, spec),
            "rows_total": len(df), "rows_after_filter": len(filtered)}
