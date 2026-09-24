import re
from fastapi import HTTPException

_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def validate_table_name(name: str, field_name: str = "table_name") -> str:
    """Root Cause Fix: table/subreddit names were interpolated directly into HDFS and
    local file paths across pipeline.py, data_export.py, and whitebox.py with no
    validation, allowing path-traversal sequences (e.g. "../../etc") in a name that
    ends up in a WebHDFS URL or os.path.join() call. Raises 400 on anything outside a
    plain alphanumeric/underscore/hyphen name; returns the name unchanged otherwise."""
    if not name or not _SAFE_NAME_RE.match(name):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name} '{name}': only letters, digits, underscore and hyphen are allowed (1-128 chars)."
        )
    return name
