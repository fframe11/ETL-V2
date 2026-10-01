import os
import sys

from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import whitebox  # noqa: E402
from fakes import FakeES  # noqa: E402


def saved(doc):
    es = FakeES()
    es.index("sdoqap_settings", "global", doc)
    return lambda: es


def test_key_saved_from_the_rules_page_is_used(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setattr(whitebox, "get_es_client", saved({"groq_api_key": "gsk_saved", "groq_enabled": True}))
    assert whitebox._get_groq_api_key() == "gsk_saved"


def test_disabling_the_saved_key_turns_the_llm_off(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_env")
    monkeypatch.setattr(whitebox, "get_es_client", saved({"groq_api_key": "gsk_saved", "groq_enabled": False}))
    assert whitebox._get_groq_api_key() == ""


def test_env_key_is_used_when_nothing_is_saved(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_env")
    monkeypatch.setattr(whitebox, "get_es_client", FakeES)
    assert whitebox._get_groq_api_key() == "gsk_env"


def test_env_key_is_used_when_elasticsearch_is_down(monkeypatch):
    def offline():
        raise HTTPException(status_code=503, detail="Elasticsearch service is offline")

    monkeypatch.setenv("GROQ_API_KEY", "gsk_env")
    monkeypatch.setattr(whitebox, "get_es_client", offline)
    assert whitebox._get_groq_api_key() == "gsk_env"
