"""Use the cleaned (active) rows of one run for analysis (Evaluation Guideline Step 10):
average score per course, pass/fail rate, score distribution, students needing follow-up.
Usage: python scripts/evaluation/utilization_report.py <active.csv> <out.md> <out.json>"""
import csv
import json
import sys
from collections import defaultdict

BUCKETS = (("0-49", 0, 50), ("50-59", 50, 60), ("60-69", 60, 70), ("70-79", 70, 80), ("80-89", 80, 90), ("90-100", 90, 100.0001))


def _score(row):
    try:
        return float(row.get("score"))
    except (TypeError, ValueError):
        return None


def summarize(rows, pass_mark=50.0):
    scored = [(r, _score(r)) for r in rows]
    scored = [(r, s) for r, s in scored if s is not None]
    per_course = defaultdict(list)
    for r, s in scored:
        per_course[r["course"]].append(s)
    passed = sum(1 for _, s in scored if s >= pass_mark)
    n = len(scored)
    return {
        "rows": n,
        "students": len({r["student_id"] for r, _ in scored}),
        "by_course": [
            {"course": c, "n": len(v), "avg_score": round(sum(v) / len(v), 2),
             "pass_rate": round(sum(1 for s in v if s >= pass_mark) / len(v), 4)}
            for c, v in sorted(per_course.items())
        ],
        "pass_rate": round(passed / n, 4) if n else 0.0,
        "fail_rate": round((n - passed) / n, 4) if n else 0.0,
        "distribution": {name: sum(1 for _, s in scored if lo <= s < hi) for name, lo, hi in BUCKETS},
        "follow_up_students": sorted({r["student_id"] for r, s in scored if s < pass_mark}),
        "pass_mark": pass_mark,
    }


def render_markdown(s):
    lines = [
        "# การใช้ประโยชน์จากข้อมูลที่ผ่าน ETL",
        "",
        f"ข้อมูลสะอาด {s['rows']:,} แถว จากนักศึกษา {s['students']:,} คน (เกณฑ์ผ่าน {s['pass_mark']:g} คะแนน)",
        "",
        f"- อัตราผ่าน: {s['pass_rate']:.2%} · อัตราไม่ผ่าน: {s['fail_rate']:.2%}",
        f"- นักศึกษาที่ต้องติดตาม (มีวิชาที่ต่ำกว่าเกณฑ์): {len(s['follow_up_students']):,} คน",
        "",
        "## คะแนนเฉลี่ยรายวิชา",
        "",
        "| วิชา | จำนวนแถว | คะแนนเฉลี่ย | อัตราผ่าน |",
        "|---|---:|---:|---:|",
    ]
    lines += [f"| {c['course']} | {c['n']:,} | {c['avg_score']:.2f} | {c['pass_rate']:.2%} |" for c in s["by_course"]]
    lines += ["", "## การกระจายของคะแนน", "", "| ช่วงคะแนน | จำนวน |", "|---|---:|"]
    lines += [f"| {k} | {v:,} |" for k, v in s["distribution"].items()]
    return "\n".join(lines) + "\n"


def main(argv):
    with open(argv[1], newline="", encoding="utf-8") as f:
        summary = summarize(list(csv.DictReader(f)))
    with open(argv[2], "w", encoding="utf-8") as f:
        f.write(render_markdown(summary))
    with open(argv[3], "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"{summary['rows']} rows, {len(summary['by_course'])} courses")


if __name__ == "__main__":
    main(sys.argv)
