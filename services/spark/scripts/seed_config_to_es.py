"""Seed sdoqap_rules_registry and sdoqap_schema_registry from the JSON files, without
overwriting anything already in Elasticsearch. After seeding, ES is the source of truth;
the JSON files are only the defaults for a fresh install."""
import json
import os
import sys

import requests

SPARK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SPARK_DIR)

SEEDS = (("rules_config.json", "sdoqap_rules_registry"), ("schema_registry.json", "sdoqap_schema_registry"))


def plan_seed(file_docs: dict, existing_ids: set) -> dict:
    return {k: v for k, v in file_docs.items() if isinstance(v, dict) and k not in existing_ids}


def _existing_ids(base, auth, index):
    r = requests.post(f"{base}/{index}/_search", json={"size": 1000, "_source": False, "query": {"match_all": {}}},
                      auth=auth, timeout=10)
    if r.status_code == 404:
        return set()
    r.raise_for_status()
    return {h["_id"] for h in r.json()["hits"]["hits"]}


def main():
    from sdoqap.common.es import es_base_and_auth
    url = os.getenv("ELASTICSEARCH_URL") or "http://{}:{}@{}:{}".format(
        os.getenv("ELASTICSEARCH_USER", "elastic"), os.environ["ELASTICSEARCH_PASSWORD"],
        os.getenv("ELASTICSEARCH_HOST", "elasticsearch"), os.getenv("ELASTICSEARCH_PORT", "9200"))
    base, auth = es_base_and_auth(url)
    for filename, index in SEEDS:
        with open(os.path.join(SPARK_DIR, filename), encoding="utf-8") as f:
            docs = json.load(f)
        todo = plan_seed(docs, _existing_ids(base, auth, index))
        for doc_id, doc in todo.items():
            requests.put(f"{base}/{index}/_doc/{doc_id}", json=doc, auth=auth, timeout=10).raise_for_status()
        print(f"[SEED] {index}: {len(todo)} new, {len(docs) - len(todo)} kept")


if __name__ == "__main__":
    main()
