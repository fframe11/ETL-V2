"""Checks that every `path:line` / `path:start-end` citation in the report
points at lines that exist. Run from the repo root.

Usage: python docs/whitebox-report/tools/check_citations.py docs/whitebox-report/*.md
"""
import re
import sys
from pathlib import Path

CITATION = re.compile(
    r"`((?:api|spark|ui|tests|docs|scripts)/[\w./-]+\.(?:py|jsx|js|json|css|yml|md)):(\d+)(?:-(\d+))?`"
)

EXCERPT_HEADER = re.compile(
    r"^(?:#|//)\s*((?:api|spark|ui|tests|scripts)/[\w./-]+\.(?:py|jsx|js|yml|css)):(\d+)-(\d+)\s*$"
)


def check_excerpts(md_path: Path, root: Path):
    """A fenced block whose first line is `# path:a-b` or `// path:a-b` must
    contain exactly source lines a..b (trailing whitespace ignored).

    Per CommonMark: a fence with N backticks opens a block; only a line with
    N or more backticks (and only backticks+whitespace) closes it."""
    problems, count = [], 0
    lines = md_path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        # Check if line starts a fence: count leading backticks
        stripped = lines[i].lstrip()
        if not stripped.startswith("```"):
            i += 1
            continue
        # Count backticks in the opening fence
        fence_len = 0
        for ch in stripped:
            if ch == "`":
                fence_len += 1
            else:
                break
        # Find closing fence: must have at least fence_len backticks and only backticks+whitespace
        j = i + 1
        while j < len(lines):
            close_stripped = lines[j].lstrip()
            if close_stripped.startswith("`"):
                # Count backticks
                close_fence_len = 0
                for ch in close_stripped:
                    if ch == "`":
                        close_fence_len += 1
                    else:
                        break
                # Check if this closes the fence: must have >= fence_len and only backticks+whitespace after
                remainder = close_stripped[close_fence_len:].lstrip()
                if close_fence_len >= fence_len and not remainder:
                    # This is the closing fence
                    break
            j += 1
        # Check for excerpt header on first line of content
        header = EXCERPT_HEADER.match(lines[i + 1].strip()) if i + 1 < j else None
        if header:
            count += 1
            rel, start, end = header.group(1), int(header.group(2)), int(header.group(3))
            target = root / rel
            if not target.is_file():
                problems.append(f"BAD {md_path}: excerpt {rel}:{start}-{end} — file not found")
            else:
                src = target.read_text(encoding="utf-8", errors="replace").splitlines()[start - 1:end]
                body = lines[i + 2:j]
                if [s.rstrip() for s in body] != [s.rstrip() for s in src]:
                    problems.append(f"BAD {md_path}: excerpt {rel}:{start}-{end} does not match the source")
        i = j + 1
    return problems, count


def check(md_path: Path, root: Path):
    problems, count = [], 0
    for match in CITATION.finditer(md_path.read_text(encoding="utf-8")):
        count += 1
        rel, start, end = match.group(1), int(match.group(2)), match.group(3)
        end = int(end) if end else start
        target = root / rel
        if not target.is_file():
            problems.append(f"BAD {md_path}: {match.group(0)} — file not found")
            continue
        total = len(target.read_text(encoding="utf-8", errors="replace").splitlines())
        if start < 1 or end < start or end > total:
            problems.append(f"BAD {md_path}: {match.group(0)} — file has {total} lines")
    return problems, count


def main(argv):
    root = Path.cwd()
    files = [Path(a) for a in argv[1:]]
    if not files:
        print("usage: check_citations.py <markdown files>")
        return 2
    all_problems, total, excerpts = [], 0, 0
    for f in files:
        problems, count = check(f, root)
        e_problems, e_count = check_excerpts(f, root)
        all_problems += problems + e_problems
        total += count
        excerpts += e_count
    for p in all_problems:
        print(p)
    if all_problems:
        return 1
    print(f"OK ({total} citations, {excerpts} excerpts)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
