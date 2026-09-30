import re


def normalize_name(name):
    if not name:
        return ""
    return re.sub(r'[\s\-_]', '', name).lower()


def clean_column_name(name):
    if not name:
        return ""
    cleaned = re.sub(r'[ ,;{}()\n\t=]', '_', name)
    cleaned = re.sub(r'_{2,}', '_', cleaned)
    return cleaned.strip('_')
