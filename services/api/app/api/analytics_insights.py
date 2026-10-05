"""Per-table diagnostics for the Query & Metrics page, built from the latest quality run.

Pure functions (no Elasticsearch calls) except the small helpers at the bottom, so the rules
that turn a run into causes and recommendations can be unit tested.
"""
import re

DEFAULT_QUALITY_THRESHOLD = 90.0
LOW_SCORE_FOR_BACKUP = 70.0
MAX_QUALITY_RECOMMENDATIONS = 3

_SPLIT = re.compile(r"[;|]")


def normalize_reason(reason):
    """A stored breakdown key -> a key without data values.

    Older runs stored outlier text with the value in it ("study_hours=40_0 (expected [...])"),
    one key per value. They collapse to one key per column, like the engine does now."""
    reason = str(reason).strip()
    if "=" in reason:
        name = reason.split("=", 1)[0].strip()
        if name.endswith("_zscore"):
            return f"zscore_{name[:-len('_zscore')]}"
        return f"outlier_{name}"
    return reason


def classify_reason(key):
    """normalized reason -> (category label in Thai, column or None)."""
    prefixes = (
        ("outlier_", "ค่าผิดปกติ (IQR)"),
        ("zscore_", "ค่าผิดปกติ (Z-score)"),
        ("out_of_range_", "ค่านอกช่วงที่กำหนด"),
        ("null_value_in_", "ค่าว่าง"),
        ("invalid_type_", "ชนิดข้อมูลไม่ถูกต้อง"),
    )
    for prefix, label in prefixes:
        if key.startswith(prefix):
            return label, key[len(prefix):]
    exact = {
        "missing_primary_key": "คีย์หลักว่าง",
        "missing_date": "วันที่ว่าง",
        "induced_tree_rule_match": "ตรงกฎที่ระบบเรียนรู้",
        "other_reasons": "เหตุผลอื่น ๆ",
    }
    if key in exact:
        return exact[key], None
    if key.startswith("duplicate"):
        return "ข้อมูลซ้ำ", None
    if "drift" in key:
        return "โครงสร้างข้อมูลเปลี่ยน", None
    if key.startswith("quarantined_"):
        return "ถูกกักกัน (ไม่ระบุเหตุผล)", None
    return "อื่น ๆ", None


def run_causes(run):
    """latest run -> [{category, column, pattern, count}] sorted by count, values merged."""
    breakdown = run.get("quarantine_breakdown") or {}
    merged = {}
    for reason, count in breakdown.items():
        key = normalize_reason(reason)
        merged[key] = merged.get(key, 0) + int(count or 0)
    if not merged and run.get("quarantined_records"):
        merged[f"quarantined_{run.get('table_name', 'unknown')}"] = int(run["quarantined_records"])
    causes = []
    for key, count in merged.items():
        category, column = classify_reason(key)
        causes.append({"category": category, "column": column, "pattern": key, "count": count})
    causes.sort(key=lambda c: c["count"], reverse=True)
    return causes


def build_clusters(run):
    """The error-pattern list: honest categories and columns, no guessed source system."""
    causes = run_causes(run)
    total = sum(c["count"] for c in causes)
    clusters = []
    for idx, c in enumerate(causes, start=1):
        label = f"{c['category']} · {c['column']}" if c["column"] else c["category"]
        clusters.append({
            "id": idx,
            "source": c["category"],
            "column": c["column"],
            "label": label,
            "pattern": c["pattern"],
            "errors_count": c["count"],
            "percentage": round(c["count"] / total * 100, 1) if total else 0.0,
        })
    if clusters:
        top = clusters[0]
        correlation = f"{top['percentage']}% ของเหตุผลที่กักกันมาจาก {top['label']} ({top['errors_count']:,} รายการ)"
    else:
        correlation = "ไม่พบเหตุผลการกักกันในรอบล่าสุดของตารางนี้"
    return {"clusters": clusters, "correlation_analysis": correlation}


def _columns_text(items, limit=3):
    names = [i["column"] for i in items if i["column"]]
    shown = names[:limit]
    more = f" และอีก {len(names) - limit} คอลัมน์" if len(names) > limit else ""
    return ", ".join(shown) + more


def build_quality_recommendations(run):
    """What to do about the latest run of one table, from what actually got quarantined."""
    table = run.get("table_name", "unknown")
    score = run.get("quality_score")
    threshold = run.get("effective_quality_threshold") or DEFAULT_QUALITY_THRESHOLD
    total = int(run.get("total_records") or 0)
    quarantined = int(run.get("quarantined_records") or 0)
    run_id = run.get("run_id")
    if score is None:
        return []

    causes = run_causes(run)
    top_text = ", ".join(
        f"{c['category']}{' ' + c['column'] if c['column'] else ''} ({c['count']:,})" for c in causes[:3]
    )
    passed = score >= threshold
    share = f"{quarantined / total * 100:.1f}%" if total else "-"
    recs = [{
        "id": "REC-Q-001",
        "scope": "table",
        "table": table,
        "run_id": run_id,
        "title": f"คะแนน {score:.2f}% {'ผ่าน' if passed else 'ต่ำกว่า'}เกณฑ์ {threshold:g}%",
        "description": (
            f"กักกัน {quarantined:,} จาก {total:,} แถว ({share})"
            + (f" สาเหตุหลัก: {top_text}" if top_text else "")
        ),
        "action_type": "SUMMARY",
        "status": "OK" if passed else "CRITICAL",
    }]
    if passed:
        return recs

    outliers = [c for c in causes if c["category"].startswith("ค่าผิดปกติ")]
    nulls = [c for c in causes if c["category"] == "ค่าว่าง"]
    duplicates = [c for c in causes if c["category"] == "ข้อมูลซ้ำ"]
    missing_key = [c for c in causes if c["category"] == "คีย์หลักว่าง"]
    out_of_range = [c for c in causes if c["category"] == "ค่านอกช่วงที่กำหนด"]

    candidates = []
    if outliers:
        columns = {c["column"] for c in outliers if c["column"]}
        candidates.append((sum(c["count"] for c in outliers), {
            "title": f"ผ่อนกฎค่าผิดปกติ: {_columns_text(outliers)}",
            "description": (
                f"ค่าผิดปกติทำให้ถูกกักกันมากที่สุด ({sum(c['count'] for c in outliers):,} รายการใน {len(columns)} คอลัมน์) "
                "ข้อมูลที่กระจายแบบหางยาว (เช่น น้ำหนัก ราคา) มักถูกจับเกินจริง "
                "ลองเพิ่ม iqr_multiplier ของตารางนี้ (เช่น 1.5 เป็น 3.0) หรือกำหนดช่วงที่ยอมรับเอง แล้วรันซ้ำ"
            ),
            "action_type": "TUNE_OUTLIER_RULE",
            "link": "/rules",
        }))
    if nulls:
        candidates.append((sum(c["count"] for c in nulls), {
            "title": f"ตรวจต้นทางค่าว่าง: {_columns_text(nulls)}",
            "description": (
                f"มีค่าว่าง {sum(c['count'] for c in nulls):,} รายการ ถ้าคอลัมน์ไหนว่างได้ตามปกติ "
                "ให้ปรับค่าความคลาดเคลื่อนของค่าว่างในกฎ ถ้าไม่ได้ ให้แก้ที่ระบบต้นทาง"
            ),
            "action_type": "FIX_SOURCE_NULLS",
            "link": "/rules",
        }))
    if duplicates:
        candidates.append((sum(c["count"] for c in duplicates), {
            "title": "ตรวจแถวซ้ำและคีย์หลัก",
            "description": f"พบข้อมูลซ้ำ {sum(c['count'] for c in duplicates):,} รายการ ตรวจว่าคีย์หลักที่ระบบเดาไว้ถูกต้องและต้นทางไม่ส่งซ้ำ",
            "action_type": "REVIEW_KEY",
        }))
    if missing_key:
        candidates.append((sum(c["count"] for c in missing_key), {
            "title": "คอลัมน์คีย์หลักมีค่าว่าง",
            "description": f"{sum(c['count'] for c in missing_key):,} แถวไม่มีคีย์หลักจึงรวมเข้าตารางไม่ได้ ตรวจที่ต้นทาง",
            "action_type": "FIX_SOURCE_KEY",
        }))
    if out_of_range:
        candidates.append((sum(c["count"] for c in out_of_range), {
            "title": f"ค่านอกช่วงที่กำหนด: {_columns_text(out_of_range)}",
            "description": f"{sum(c['count'] for c in out_of_range):,} รายการอยู่นอกช่วงที่ตั้งไว้ ตรวจว่าช่วงในกฎตรงกับความจริงของข้อมูล",
            "action_type": "REVIEW_RANGE",
            "link": "/rules",
        }))

    candidates.sort(key=lambda pair: pair[0], reverse=True)
    for n, (_, rec) in enumerate(candidates[:MAX_QUALITY_RECOMMENDATIONS], start=2):
        recs.append({"id": f"REC-Q-{n:03d}", "scope": "table", "table": table, "run_id": run_id,
                     "status": "RECOMMENDED", **rec})

    if score < LOW_SCORE_FOR_BACKUP:
        recs.append({
            "id": "REC-Q-BAK",
            "scope": "table",
            "table": table,
            "run_id": run_id,
            "title": "คืนค่าจาก snapshot ล่าสุด (ถ้าเป็นข้อมูลที่เคยดี)",
            "description": (
                f"คะแนนต่ำกว่า {LOW_SCORE_FOR_BACKUP:g}% ถ้าข้อมูลชุดนี้เคยผ่านเกณฑ์มาก่อน การย้อนกลับช่วยได้ "
                "แต่ถ้าสาเหตุคือกฎเข้มเกินไป การย้อนกลับไม่ช่วย"
            ),
            "action_type": "RESTORE_BACKUP",
            "status": "AVAILABLE",
        })
    return recs
