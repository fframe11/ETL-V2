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


def test_four_backtick_wrapper_content_is_not_an_excerpt():
    # Per CommonMark: a ````markdown block (4 backticks) closes only at a line
    # with 4+ backticks and only backticks+whitespace. A ``` inside is content.
    # This test has a ````markdown wrapper containing an inner ```python block
    # with an excerpt header followed by WRONG lines. The wrapper is NOT closed
    # until the final ````, so the inner block is content, not checked. Result: count=0.
    text = (
        "````markdown\n"
        "```python\n"
        "# " + SRC + ":1-3\n"
        "wrong line 1\n"
        "wrong line 2\n"
        "wrong line 3\n"
        "```\n"
        "````\n"  # Closes the 4-backtick wrapper (4 backticks, nothing else)
    )
    md = write_md(text)
    problems, count = check_excerpts(md, ROOT)
    # Fixed code: wrapper stays open until final ````, inner ``` is content, count=0
    # Broken code: would close wrapper at inner ```, wrongly extract as excerpt, count=1
    assert count == 0 and problems == [], f"count={count}, problems={problems}"


def test_real_excerpt_after_wrapper_is_still_checked():
    # Same wrapper as test 1, but followed by a REAL ```python excerpt after the wrapper closes.
    # The real excerpt has one line edited, so it should fail the check.
    text = (
        "````markdown\n"
        "```python\n"
        "# " + SRC + ":1-3\n"
        "wrong line 1\n"
        "wrong line 2\n"
        "wrong line 3\n"
        "```\n"
        "````\n"  # Closes the wrapper
    )
    real_block_lines = list(src_lines[0:3])
    real_block_lines[0] = real_block_lines[0] + " edited"
    text += (
        "```python\n"
        "# " + SRC + ":1-3\n"
        + "\n".join(real_block_lines) + "\n"
        "```\n"
    )
    md = write_md(text)
    problems, count = check_excerpts(md, ROOT)
    # After wrapper closes, the real excerpt is found and checked
    # count=1 (one real excerpt), len(problems)=1 (one content mismatch due to "edited")
    assert count == 1 and len(problems) == 1, f"count={count}, problems={problems}"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"{len(tests)} passed")
