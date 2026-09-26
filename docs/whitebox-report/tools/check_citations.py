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
    contain exactly source lines a..b (trailing whitespace ignored)."""
    problems, count = [], 0
    lines = md_path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        if not lines[i].startswith("```"):
            i += 1
            continue
        j = i + 1
        while j < len(lines) and not lines[j].startswith("```"):
            j += 1
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
