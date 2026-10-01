"""Report, and where it can, create the keys this stack reads from .env.

The local shared secrets (session signing, webhook, service and trigger keys) are random
strings, so an empty or absent one is generated here. GROQ_API_KEY is issued by Groq and
can only be reported. Values are never printed.

Usage: python scripts/dev/ensure_env_keys.py [--check] [path/to/.env]"""
import argparse
import os
import secrets
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL_SECRETS = ("SESSION_SECRET_KEY", "ALERT_WEBHOOK_SECRET", "INGEST_SERVICE_KEY", "TRIGGER_SHARED_SECRET")
EXTERNAL_KEYS = {"GROQ_API_KEY": "https://console.groq.com/keys"}


def read_values(text):
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            name, _, value = line.partition("=")
            values[name.strip()] = value.strip()
    return values


def ensure(text, generate=lambda: secrets.token_urlsafe(32)):
    """Returns (new_text, created, missing_external). Only empty or absent local secrets
    change; every other line is kept as it is."""
    values = read_values(text)
    created = [name for name in LOCAL_SECRETS if not values.get(name)]
    cr = "\r" if "\r\n" in text else ""
    lines = text.split("\n")
    for name in created:
        new_line = f"{name}={generate()}{cr}"
        for i, line in enumerate(lines):
            if line.split("=", 1)[0].strip() == name:
                lines[i] = new_line
                break
        else:
            lines.insert(len(lines) - 1 if lines[-1] == "" else len(lines), new_line)
    missing_external = [name for name in EXTERNAL_KEYS if not values.get(name)]
    return "\n".join(lines), created, missing_external


def main(argv=None):
    parser = argparse.ArgumentParser(description="Report and create the keys this stack reads from .env")
    parser.add_argument("env_file", nargs="?", default=os.path.join(REPO_ROOT, ".env"))
    parser.add_argument("--check", action="store_true", help="report only, never write")
    args = parser.parse_args(argv)

    with open(args.env_file, encoding="utf-8", newline="") as fh:
        text = fh.read()
    new_text, created, missing_external = ensure(text)

    for name in LOCAL_SECRETS:
        state = "ok" if name not in created else ("MISSING" if args.check else "created")
        print(f"{state:8} {name}")
    for name, where in EXTERNAL_KEYS.items():
        if name in missing_external:
            print(f"{'MISSING':8} {name}  (the owner creates it at {where})")
        else:
            print(f"{'ok':8} {name}")

    if created and not args.check:
        with open(args.env_file, "w", encoding="utf-8", newline="") as fh:
            fh.write(new_text)
    return 1 if missing_external or (created and args.check) else 0


if __name__ == "__main__":
    sys.exit(main())
