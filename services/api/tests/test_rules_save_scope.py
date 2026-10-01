import json
import os
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dynamic_rules  # noqa: E402

ON_DISK = {
    "_comment": "Dynamic Rules Configuration v2.0",
    "_default": {"quality_score_threshold": {"mode": "adaptive", "base_value": 90.0}},
    "t1": {"quality_score_threshold": {"mode": "adaptive", "base_value": 90.0}},
    "t2": {"quality_score_threshold": {"mode": "static", "base_value": 85.0}},
}


class RegistryES:
    """The rules registry index: what the API reads as the source of truth."""

    def __init__(self):
        self.docs = {}
        self.indices = self

    def exists(self, index):
        return True

    def create(self, index):
        pass

    def index(self, index, id, document):
        self.docs[id] = document


@pytest.fixture
def env(tmp_path, monkeypatch):
    path = tmp_path / "rules_config.json"
    path.write_text(json.dumps(ON_DISK, indent=2) + "\n", encoding="utf-8")
    es = RegistryES()
    monkeypatch.setattr(dynamic_rules, "_resolve_rules_path", lambda: str(path))
    monkeypatch.setattr(dynamic_rules, "_get_es", lambda: es)
    return path, es


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def registry_view():
    # What _load_rules_config returns: the registry (Elasticsearch) holds more tables than the file.
    config = json.loads(json.dumps({k: v for k, v in ON_DISK.items() if k != "_comment"}))
    config["es_only_table"] = {"quality_score_threshold": {"mode": "adaptive", "base_value": 80.0}}
    return config


def test_saving_one_table_leaves_the_rest_of_the_file_alone(env):
    path, es = env
    config = registry_view()
    config["t1"]["quality_score_threshold"] = {"mode": "static", "base_value": 97.0}
    dynamic_rules._save_rules_config(config, tables=["t1"])
    saved = read(path)
    assert saved["t1"]["quality_score_threshold"]["base_value"] == 97.0
    assert saved["_comment"] == ON_DISK["_comment"]
    assert saved["t2"] == ON_DISK["t2"]
    assert "es_only_table" not in saved  # tables that live only in Elasticsearch are not copied into the file


def test_only_the_saved_table_is_written_to_the_registry(env):
    _, es = env
    config = registry_view()
    config["t1"]["quality_score_threshold"]["base_value"] = 93.0
    dynamic_rules._save_rules_config(config, tables=["t1"])
    assert list(es.docs) == ["t1"]
    assert es.docs["t1"]["quality_score_threshold"]["base_value"] == 93.0


def test_a_deleted_table_is_removed_from_the_file_and_nothing_else_changes(env):
    path, es = env
    config = registry_view()
    del config["t2"]
    dynamic_rules._save_rules_config(config, tables=["t2"])
    saved = read(path)
    assert "t2" not in saved and saved["t1"] == ON_DISK["t1"] and saved["_comment"] == ON_DISK["_comment"]
    assert es.docs == {}


def test_a_new_table_is_added_to_the_file(env):
    path, _ = env
    config = registry_view()
    config["t3"] = {"quality_score_threshold": {"mode": "static", "base_value": 99.0}}
    dynamic_rules._save_rules_config(config, tables=["t3"])
    assert read(path)["t3"]["quality_score_threshold"]["base_value"] == 99.0


def test_without_a_table_list_the_whole_config_is_written_as_before(env):
    # Rollback restores a complete snapshot, so it still replaces everything.
    path, es = env
    config = registry_view()
    dynamic_rules._save_rules_config(config)
    assert set(read(path)) == set(config)
    assert set(es.docs) == set(config)


def test_an_unreadable_file_is_replaced_by_the_full_config(env):
    path, _ = env
    path.write_text("{not json", encoding="utf-8")
    config = registry_view()
    dynamic_rules._save_rules_config(config, tables=["t1"])
    assert set(read(path)) == set(config)
