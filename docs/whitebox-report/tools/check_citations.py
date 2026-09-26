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
    all_problems, total = [], 0
    for f in files:
        problems, count = check(f, root)
        all_problems += problems
        total += count
    for p in all_problems:
        print(p)
    if all_problems:
        return 1
    print(f"OK ({total} citations)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
