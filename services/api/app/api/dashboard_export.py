"""CSV export of the rows a dashboard is computed from, for the BI team (Excel, Power BI).

Pure functions, no I/O: dashboards.export_dashboard_rows picks the rows and the columns and
streams what csv_chunks yields. The file is UTF-8 with a BOM (so Excel reads Thai), rows end
in CRLF and the csv module quotes fields as RFC 4180 describes."""
import csv
import io
import math
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

BOM = "﻿"
# Excel opens at most 1,048,576 rows per sheet; a longer file would be cut off without a word.
MAX_EXPORT_ROWS = 1_000_000
CHUNK_ROWS = 10_000  # rows written per piece of the streamed response
BANGKOK = timezone(timedelta(hours=7))  # the day in the file name; Thailand has no daylight saving time
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
_PLAIN_NUMBER = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
_UNSAFE_NAME = re.compile(r"[^A-Za-z0-9_-]+")
_NESTED = (list, tuple, dict, set, np.ndarray)


def safe_text(text: str) -> str:
    """Text a spreadsheet shows instead of running: a leading = + - @ tab or CR gets an
    apostrophe in front (CSV injection), except a plain number such as -12.5, which is
    never a formula and must stay a number."""
    if text.startswith(_FORMULA_START) and not _PLAIN_NUMBER.fullmatch(text):
        return "'" + text
    return text


def _missing(value) -> bool:
    if isinstance(value, _NESTED):
        return False
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def _number(value) -> str:
    """Digits without an exponent: 1e16 is 10000000000000000 and 3.0 is 3; inf is empty."""
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    number = float(value)
    if not math.isfinite(number):
        return ""
    return np.format_float_positional(number, trim="-")


def cell(value) -> str:
    """One value of a column whose values have mixed types (object dtype)."""
    if _missing(value):
        return ""
    if isinstance(value, (bool, np.bool_)):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float, np.integer, np.floating)):
        return _number(value)
    if isinstance(value, (datetime, np.datetime64)):
        return pd.Timestamp(value).isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, bytes):
        value = value.decode("utf-8", "replace")
    return safe_text(str(value))


def column_formatter(series: pd.Series):
    """The function that writes one value of this column, chosen once from the whole column
    so every chunk of a long export writes it the same way. A date column whose values all
    fall at midnight is written as days (2025-01-05), otherwise as day and time."""
    if pd.api.types.is_bool_dtype(series):
        return lambda v: "" if _missing(v) else ("TRUE" if v else "FALSE")
    if pd.api.types.is_datetime64_any_dtype(series):
        values = series.dropna()
        if (values == values.dt.normalize()).all():
            return lambda v: "" if _missing(v) else v.date().isoformat()
        return lambda v: "" if _missing(v) else v.isoformat(sep=" ")
    if pd.api.types.is_numeric_dtype(series):
        return lambda v: "" if _missing(v) else _number(v)
    return cell


def header_labels(names, labels) -> list:
    """The header row: each column's display label, else its name. Columns that share a label
    are told apart by their name in brackets ("ยอดขาย [Net_Sales]"), except a column whose
    label is its own name; a clash that is still left gets " (2)", " (3)", ..."""
    first = [labels.get(name) or name for name in names]
    counts = Counter(first)
    out, used = [], set()
    for name, label in zip(names, first):
        text = f"{label} [{name}]" if counts[label] > 1 and label != name else label
        candidate, n = text, 2
        while candidate in used:
            candidate, n = f"{text} ({n})", n + 1
        used.add(candidate)
        out.append(candidate)
    return out


def export_filename(table_name: str, day: date) -> str:
    """<table>_<YYYYMMDD>.csv; anything but letters, digits, _ and - in the name becomes _."""
    base = _UNSAFE_NAME.sub("_", table_name).strip("_") or "dataset"
    return f"{base}_{day:%Y%m%d}.csv"


def _drain(buffer: io.StringIO) -> bytes:
    text = buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)
    return text.encode("utf-8")


def csv_chunks(df: pd.DataFrame, columns, headers, chunk_rows: int = CHUNK_ROWS):
    """The CSV file as pieces of bytes: the BOM and the header row, then chunk_rows rows at a
    time, so a long export never holds the whole file in memory. Only `columns` are written,
    in that order, under `headers`."""
    formatters = [column_formatter(df[c]) for c in columns]
    buffer = io.StringIO()
    buffer.write(BOM)
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([safe_text(str(h)) for h in headers])
    yield _drain(buffer)
    for start in range(0, len(df), chunk_rows):
        part = df.iloc[start:start + chunk_rows]
        cells = [[fmt(v) for v in part[c]] for c, fmt in zip(columns, formatters)]
        writer.writerows(zip(*cells))
        yield _drain(buffer)
