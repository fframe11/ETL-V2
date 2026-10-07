"""In-memory stand-in for the parts of the elasticsearch client the API uses."""
from elastic_transport import ApiResponseMeta, HttpHeaders, NodeConfig
from elasticsearch import ConflictError, NotFoundError


class NotFound(Exception):
    pass


def _api_error(cls, status, message):
    """The exception the real elasticsearch-py 8 client raises for an HTTP error status."""
    meta = ApiResponseMeta(status=status, http_version="1.1", headers=HttpHeaders(), duration=0.0,
                           node=NodeConfig("http", "localhost", 9200))
    return cls(message, meta, {"error": {"type": message}})


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
        self._seq = 0
        self._cas = {}  # (index, id) -> (_seq_no, _primary_term), like a real shard

    def index(self, index, id, document, refresh=None, op_type=None, if_seq_no=None, if_primary_term=None):
        exists = id in self.docs.get(index, {})
        if op_type == "create" and exists:
            raise _api_error(ConflictError, 409, "version_conflict_engine_exception")
        if if_seq_no is not None and (not exists or self._cas.get((index, id), (0, 1)) != (if_seq_no, if_primary_term)):
            raise _api_error(ConflictError, 409, "version_conflict_engine_exception")
        self._seq += 1
        self._cas[(index, id)] = (self._seq, 1)
        self.docs.setdefault(index, {})[id] = dict(document)

    def update(self, index, id, doc, refresh=None):
        self.docs[index][id].update(doc)

    def delete(self, index, id, refresh=None):
        try:
            del self.docs[index][id]
        except KeyError as exc:
            raise NotFound(id) from exc

    def get(self, index, id):
        try:
            source = dict(self.docs[index][id])
        except KeyError as exc:
            raise _api_error(NotFoundError, 404, "not_found") from exc
        seq_no, primary_term = self._cas.get((index, id), (0, 1))
        return {"_id": id, "_source": source, "_seq_no": seq_no, "_primary_term": primary_term}

    def search(self, index, query, size=10, sort=None):
        hits = [{"_id": k, "_source": dict(v)} for k, v in self.docs.get(index, {}).items() if _matches(v, query)]
        hits.sort(key=lambda h: h["_source"].get("created_at", ""), reverse=True)
        return {"hits": {"hits": hits[:size]}}
