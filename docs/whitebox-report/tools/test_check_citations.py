"""Run from the repo root: python docs/whitebox-report/tools/test_check_citations.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from check_citations import check, check_excerpts  # noqa: E402

ROOT = Path.cwd()
SRC = "api/app/api/whitebox.py"
src_lines = (ROOT / SRC).read_text(encoding="utf-8").splitlines()


def write_md(text):
    f = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
    f.write(text)
    f.close()
    return Path(f.name)


def fence(header, body_lines):
    return "```python\n" + header + "\n" + "\n".join(body_lines) + "\n```\n"


def test_verbatim_excerpt_passes():
    md = write_md(fence(f"# {SRC}:1-3", src_lines[0:3]))
    problems, count = check_excerpts(md, ROOT)
    assert count == 1 and problems == [], problems


def test_edited_excerpt_fails():
    body = list(src_lines[0:3])
    body[1] = body[1] + " edited"
    md = write_md(fence(f"# {SRC}:1-3", body))
    problems, count = check_excerpts(md, ROOT)
    assert count == 1 and len(problems) == 1, problems


def test_wrong_range_fails():
    md = write_md(fence(f"# {SRC}:2-4", src_lines[0:3]))
    problems, _ = check_excerpts(md, ROOT)
    assert len(problems) == 1, problems


def test_js_comment_header_is_recognised():
    js = "ui/src/utils/currency.js"
    js_lines = (ROOT / js).read_text(encoding="utf-8").splitlines()
    md = write_md("```js\n// " + js + ":1-2\n" + "\n".join(js_lines[0:2]) + "\n```\n")
    problems, count = check_excerpts(md, ROOT)
    assert count == 1 and problems == [], problems


def test_plain_code_block_is_ignored():
    md = write_md("```python\nprint('not an excerpt')\n```\n")
    problems, count = check_excerpts(md, ROOT)
    assert count == 0 and problems == []


def test_citation_check_still_works():
    md = write_md(f"see `{SRC}:1` and `{SRC}:999999`")
    problems, count = check(md, ROOT)
    assert count == 2 and len(problems) == 1, problems


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"{len(tests)} passed")
