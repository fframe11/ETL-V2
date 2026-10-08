"""Keep identifying values out of anything sent to an external LLM.

Quarantined rows are shown to a model so it can see the defect pattern, not the person.
Values of identifying columns (by name) and of the table's primary key are replaced with a
placeholder. Column names and non-identifying values are left alone."""
import re

IDENTIFIER_COLUMN = re.compile(r"(^|_)(id|uuid|name|email|phone|mobile|tel|address|ssn)(_|$)", re.I)
PLACEHOLDER = "<redacted>"


def primary_key_columns(primary_key):
    """Column names from a primary key given as a list, or as a comma separated string."""
    if isinstance(primary_key, (list, tuple, set)):
        parts = [str(k) for k in primary_key]
    else:
        parts = str(primary_key or "").split(",")
    return {p.strip() for p in parts if p.strip() and p.strip() != "unknown"}


def redact_identifiers(rows, primary_key=None):
    keys = primary_key_columns(primary_key)
    redacted = []
    for row in rows:
        if not isinstance(row, dict):
            redacted.append(row)
            continue
        redacted.append({
            col: (PLACEHOLDER if (col in keys or IDENTIFIER_COLUMN.search(str(col))) and val is not None else val)
            for col, val in row.items()
        })
    return redacted
