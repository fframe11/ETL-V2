import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utilization_report import render_markdown, summarize

ROWS = [
    {"student_id": "1", "course": "Python", "score": "80"},
    {"student_id": "2", "course": "Python", "score": "40"},
    {"student_id": "1", "course": "Stats", "score": "95"},
    {"student_id": "3", "course": "Stats", "score": "59.5"},
    {"student_id": "4", "course": "Stats", "score": ""},
]


def test_summary_numbers():
    s = summarize(ROWS)
    assert s["rows"] == 4 and s["students"] == 3
    py = next(c for c in s["by_course"] if c["course"] == "Python")
    assert py == {"course": "Python", "n": 2, "avg_score": 60.0, "pass_rate": 0.5}
    assert s["pass_rate"] == 0.75 and s["fail_rate"] == 0.25
    assert s["distribution"] == {"0-49": 1, "50-59": 1, "60-69": 0, "70-79": 0, "80-89": 1, "90-100": 1}
    assert s["follow_up_students"] == ["2"]


def test_markdown_mentions_every_course():
    md = render_markdown(summarize(ROWS))
    assert "Python" in md and "Stats" in md and "90-100" in md
