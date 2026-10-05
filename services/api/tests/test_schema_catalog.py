import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import analytics, schema  # noqa: E402


def _drift(col="arrest", expected="BooleanType", actual="StringType", error="type_mismatch"):
    return {col: {"error": error, "expected": expected, "actual": actual, "action": "coerced_to_string"}}


def _proposal(pid, table, proposed_at, status="PENDING", drift=None):
    return {"_id": pid, "_source": {
        "table_name": table, "status": status, "proposed_at": proposed_at, "run_id": f"run_{pid}",
        "drift_details": drift or _drift(), "proposed_schema": {"id": "IntegerType", "arrest": "StringType"},
    }}


class _Indices:
    def exists(self, index):
        return True


class _FakeEs:
    def __init__(self, proposals, registry=None, runs=None):
        self.proposals = {p["_id"]: p for p in proposals}
        self.registry = dict(registry or {})
        self.runs = list(runs or [])
        self.indices = _Indices()

    # --- reads
    def get(self, index, id):
        p = self.proposals[id]
        return {"_source": dict(p["_source"]), "_seq_no": 1, "_primary_term": 1, "_id": id}

    def exists(self, index, id):
        return id in self.registry

    def search(self, index, body):
        if index == "sdoqap_schema_proposals":
            query = body.get("query", {})
            terms = []
            if "term" in query:
                terms = [query["term"]]
            elif "bool" in query:
                terms = [m["term"] for m in query["bool"]["must"]]
            wanted = {}
            for t in terms:
                (field, value), = t.items()
                wanted[field.split(".")[0]] = value
            hits = [p for p in self.proposals.values()
                    if all(p["_source"].get(k) == v for k, v in wanted.items())]
            hits.sort(key=lambda p: p["_source"]["proposed_at"], reverse=True)
            return {"hits": {"hits": hits}}
        if index == "sdoqap_schema_registry":
            return {"hits": {"hits": [{"_id": k, "_source": v} for k, v in self.registry.items()]}}
        if index == "sdoqap_quality_runs":  # tables aggregation used by the catalog
            buckets = []
            for name in {r["table_name"] for r in self.runs}:
                rs = sorted([r for r in self.runs if r["table_name"] == name], key=lambda r: r["timestamp"], reverse=True)
                buckets.append({"key": name, "doc_count": len(rs), "last": {"hits": {"hits": [{"_source": {
                    "quality_score": rs[0]["quality_score"], "timestamp": rs[0]["timestamp"]}}]}}})
            return {"aggregations": {"t": {"buckets": buckets}}}
        return {"hits": {"hits": []}}

    # --- writes
    def update(self, index, id, body, **_):
        self.proposals[id]["_source"].update(body["doc"])

    def index(self, index, id, document):
        self.registry[id] = document


def _use(monkeypatch, fake, tmp_path):
    monkeypatch.setattr(schema, "get_es", lambda: fake)
    monkeypatch.setattr(analytics, "get_es_client", lambda: fake)
    monkeypatch.setattr(schema, "SCHEMA_REGISTRY_PATH", str(tmp_path / "schema_registry.json"))  # never the repo file


def test_same_finding_found_by_several_runs_is_listed_once_with_its_count(monkeypatch, tmp_path):
    fake = _FakeEs([
        _proposal("a", "ijzp", "2026-10-01T18:24:00+00:00"),
        _proposal("b", "ijzp", "2026-10-01T18:41:00+00:00"),
        _proposal("c", "ijzp", "2026-10-02T09:00:00+00:00", drift=_drift("domestic")),  # a different finding
        _proposal("d", "other", "2026-10-03T09:00:00+00:00"),                            # other table
    ])
    _use(monkeypatch, fake, tmp_path)
    out = schema.list_proposals(status="PENDING")
    assert out["total"] == 3
    by_id = {p["id"]: p for p in out["proposals"]}
    assert by_id["b"]["occurrences"] == 2 and by_id["b"]["duplicate_ids"] == ["a"]
    assert by_id["b"]["first_seen"].startswith("2026-10-01T18:24") and by_id["b"]["last_seen"].startswith("2026-10-01T18:41")
    assert by_id["c"]["occurrences"] == 1 and by_id["d"]["occurrences"] == 1


def test_approving_one_closes_its_repeats_and_nothing_else(monkeypatch, tmp_path):
    fake = _FakeEs([
        _proposal("a", "ijzp", "2026-10-01T18:24:00+00:00"),
        _proposal("b", "ijzp", "2026-10-01T18:41:00+00:00"),
        _proposal("c", "ijzp", "2026-10-02T09:00:00+00:00", drift=_drift("domestic")),
    ])
    _use(monkeypatch, fake, tmp_path)
    out = schema.approve_proposal("b", user="admin")
    assert out["closed_duplicates"] == 1
    status = {pid: p["_source"]["status"] for pid, p in fake.proposals.items()}
    assert status == {"a": "APPROVED", "b": "APPROVED", "c": "PENDING"}
    assert fake.proposals["a"]["_source"]["superseded_by"] == "b"
    assert fake.registry["ijzp"]["schema_spec"] == {"id": "IntegerType", "arrest": "StringType"}


def test_rejecting_closes_repeats_and_leaves_the_registry_alone(monkeypatch, tmp_path):
    fake = _FakeEs([_proposal("a", "ijzp", "2026-10-01T18:24:00+00:00"),
                    _proposal("b", "ijzp", "2026-10-01T18:41:00+00:00")], registry={"ijzp": {"primary_key": "id"}})
    _use(monkeypatch, fake, tmp_path)
    out = schema.reject_proposal("a", user="admin")
    assert out["closed_duplicates"] == 1
    assert {p["_source"]["status"] for p in fake.proposals.values()} == {"REJECTED"}
    assert fake.registry == {"ijzp": {"primary_key": "id"}}


def test_catalog_lists_registered_tables_newest_run_first_with_columns_and_pending(monkeypatch, tmp_path):
    fake = _FakeEs(
        [_proposal("a", "ijzp", "2026-10-01T18:24:00+00:00"), _proposal("b", "ijzp", "2026-10-01T18:41:00+00:00")],
        registry={
            "olist": {"primary_key": "product_id", "date_column": None, "schema_spec": {"product_id": "StringType", "w": "IntegerType"}},
            "ijzp": {"primary_key": "id", "date_column": "date", "schema_spec": {"id": "IntegerType"}},
            "never_ran": {"primary_key": "id", "schema_spec": {}},
        },
        runs=[{"table_name": "olist", "timestamp": "2026-10-05T18:05:00+00:00", "quality_score": 66.06},
              {"table_name": "ijzp", "timestamp": "2026-10-01T18:41:00+00:00", "quality_score": 99.0}],
    )
    _use(monkeypatch, fake, tmp_path)
    out = schema.list_catalog_tables()
    assert [t["name"] for t in out["tables"]] == ["olist", "ijzp", "never_ran"]
    olist = out["tables"][0]
    assert olist["primary_key"] == "product_id" and olist["column_count"] == 2
    assert olist["columns"][1] == {"name": "w", "type": "IntegerType"}
    assert olist["latest_score"] == 66.06 and olist["pending_proposals"] == 0
    ijzp = out["tables"][1]
    assert ijzp["pending_proposals"] == 1  # two repeats of one finding count once
    assert out["pending_total"] == 1
    assert out["tables"][2]["latest_at"] is None
