import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api import system  # noqa: E402
from fakes import FakeES  # noqa: E402

CURRENT = "openai/gpt-oss-120b"
RETIRED = "llama-3.3-70b-versatile"


def saved(doc):
    es = FakeES()
    es.index("sdoqap_settings", "global", doc)
    return lambda: es


def test_default_model_is_one_groq_still_serves(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    monkeypatch.setattr(system, "get_es_client", FakeES)
    assert system.get_system_settings()["groq_model"] == CURRENT
    assert system.SettingsPayload(groq_api_key="x").groq_model == CURRENT


def test_a_saved_retired_model_is_reported_as_the_current_one(monkeypatch):
    monkeypatch.setattr(system, "get_es_client",
                        saved({"groq_api_key": "gsk_saved", "groq_model": RETIRED, "groq_enabled": True}))
    assert system.get_system_settings()["groq_model"] == CURRENT


def test_other_saved_models_are_left_alone(monkeypatch):
    monkeypatch.setattr(system, "get_es_client",
                        saved({"groq_api_key": "gsk_saved", "groq_model": "openai/gpt-oss-20b", "groq_enabled": True}))
    assert system.get_system_settings()["groq_model"] == "openai/gpt-oss-20b"
