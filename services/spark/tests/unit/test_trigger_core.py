import trigger_core as tc


def test_auth_requires_configured_secret():
    assert tc.is_authorized({}, "") is False
    assert tc.is_authorized({"X-Trigger-Secret": ""}, "") is False
    assert tc.is_authorized({"X-Trigger-Secret": "abc"}, "abc") is True
    assert tc.is_authorized({"X-Trigger-Secret": "abd"}, "abc") is False


def test_names_are_validated():
    assert tc.valid_name("student_scores")
    assert tc.valid_name("20260930T101500-ab12cd34")
    assert not tc.valid_name("../etc")
    assert not tc.valid_name("")
    assert not tc.valid_name(None)


def test_submit_cmd_uses_baked_jars_and_passes_ingest_id():
    cmd = tc.build_submit_cmd("scores", "i1")
    assert "--packages" not in cmd
    assert cmd[-4:] == [tc.ENGINE_SCRIPT, "scores", "--ingest-id", "i1"]
    assert tc.build_submit_cmd("scores")[-2:] == [tc.ENGINE_SCRIPT, "scores"]


def test_exit_codes_map_to_states():
    assert tc.state_for_exit(0) == "SUCCEEDED"
    assert tc.state_for_exit(75) == "SKIPPED"
    assert tc.state_for_exit(1) == "FAILED"


def test_queue_runs_one_job_per_table_in_fifo_order():
    q = tc.TableJobQueue()
    assert q.submit("a", "i1") is True
    assert q.submit("a", "i2") is False
    assert q.submit("a", "i3") is False
    assert q.submit("b", "j1") is True
    assert q.pending("a") == 2
    assert q.next_or_release("a") == (True, "i2")
    assert q.next_or_release("a") == (True, "i3")
    assert q.next_or_release("a") == (False, None)
    assert q.submit("a", "i4") is True


class Resp:
    def __init__(self, status_code, body=None):
        self.status_code = status_code
        self._body = body or {}

    def json(self):
        return self._body


def test_update_run_state_posts_partial_doc(monkeypatch):
    monkeypatch.setenv("ELASTICSEARCH_HOST", "es")
    monkeypatch.setenv("ELASTICSEARCH_PORT", "9200")
    monkeypatch.setenv("ELASTICSEARCH_USER", "elastic")
    monkeypatch.setenv("ELASTICSEARCH_PASSWORD", "pw")
    sent = {}

    def post(url, json=None, auth=None, timeout=None):
        sent.update(url=url, json=json, auth=auth)
        return Resp(200)

    assert tc.update_run_state("i1", "RUNNING", post=post, started_at="t") is True
    assert sent["url"] == "http://es:9200/sdoqap_runs/_update/i1"
    assert sent["json"]["doc"]["state"] == "RUNNING"
    assert sent["json"]["doc"]["started_at"] == "t"
    assert sent["auth"] == ("elastic", "pw")
    assert tc.update_run_state(None, "RUNNING", post=post) is False


def test_find_quality_run_filters_by_ingest_id():
    seen = {}

    def post(url, json=None, auth=None, timeout=None):
        seen["query"] = json["query"]
        return Resp(200, {"hits": {"hits": [{"_source": {"run_id": "r1", "quarantined_records": 3}}]}})

    assert tc.find_quality_run("i1", post=post)["run_id"] == "r1"
    assert seen["query"] == {"term": {"ingest_id.keyword": "i1"}}
