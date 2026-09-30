"""In-memory stand-in for the parts of the elasticsearch client the API uses."""


class NotFound(Exception):
    pass


class _Indices:
    def __init__(self, es):
        self._es = es

    def exists(self, index):
        return index in self._es.docs


def _matches(doc, query):
    for clause in query.get("bool", {}).get("filter", []):
        (kind, body), = clause.items()
        (field, value), = body.items()
        field = field[: -len(".keyword")] if field.endswith(".keyword") else field
        if kind == "term" and doc.get(field) != value:
            return False
        if kind == "terms" and doc.get(field) not in value:
            return False
    return True


class FakeES:
    def __init__(self):
        self.docs = {}
        self.indices = _Indices(self)

    def index(self, index, id, document, refresh=None):
        self.docs.setdefault(index, {})[id] = dict(document)

    def update(self, index, id, doc, refresh=None):
        self.docs[index][id].update(doc)

    def get(self, index, id):
        try:
            return {"_id": id, "_source": dict(self.docs[index][id])}
        except KeyError as exc:
            raise NotFound(id) from exc

    def search(self, index, query, size=10, sort=None):
        hits = [{"_id": k, "_source": dict(v)} for k, v in self.docs.get(index, {}).items() if _matches(v, query)]
        hits.sort(key=lambda h: h["_source"].get("created_at", ""), reverse=True)
        return {"hits": {"hits": hits[:size]}}
