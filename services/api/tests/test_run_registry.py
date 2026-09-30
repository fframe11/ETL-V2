import os
import re
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import run_registry as rr
from fakes import FakeES


def test_ingest_ids_are_unique_and_path_safe():
    ids = {rr.new_ingest_id() for _ in range(50)}
    assert len(ids) == 50
    assert all(re.fullmatch(r"[A-Za-z0-9_-]{1,128}", i) for i in ids)


def test_checksum_is_stable_sha256():
    assert rr.checksum(b"abc") == rr.checksum(b"abc")
    assert len(rr.checksum(b"abc")) == 64


def test_raw_dir_is_per_ingestion():
    assert rr.raw_ingest_dir("scores", "20260930T101500-ab12cd34") == "/data/raw/scores/20260930T101500-ab12cd34"


def test_created_run_is_queued_and_readable():
    es = FakeES()
    rr.create_run(es, "scores", "i1", "sha", "file", 42)
    run = rr.get_run(es, "i1")
    assert run["state"] == "QUEUED"
    assert run["raw_path"] == "/data/raw/scores/i1"
    assert run["size_bytes"] == 42


def test_get_run_without_index_returns_none():
    assert rr.get_run(FakeES(), "missing") is None


def test_duplicate_found_only_for_same_table_and_live_state():
    es = FakeES()
    rr.create_run(es, "scores", "i1", "sha", "file", 1)
    assert rr.find_duplicate(es, "scores", "sha")["ingest_id"] == "i1"
    assert rr.find_duplicate(es, "other", "sha") is None
    rr.update_run(es, "i1", "FAILED", error="boom")
    assert rr.find_duplicate(es, "scores", "sha") is None
    assert rr.get_run(es, "i1")["error"] == "boom"
