import json
import sys

from sdoqap.pipeline.registry import list_stages

if __name__ == "__main__":
    stages = list_stages()
    if "--json" in sys.argv:
        print(json.dumps(stages, ensure_ascii=False, indent=2))
    else:
        for s in stages:
            print(f"{s['order']:>2}. [{s['phase']}] {s['name']} — {s['title']}")
        print(f"total: {len(stages)} stages")
