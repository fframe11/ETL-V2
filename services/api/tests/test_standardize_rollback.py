import json
import os
import sys

import pytest
from fastapi import HTTPException

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
os.environ.setdefault("ELASTICSEARCH_URL", "http://elastic:test@localhost:9200")

from app.api import dynamic_rules, standardize  # noqa: E402


@pytest.fixture
def rules_file(tmp_path, monkeypatch):
    path = tmp_path / "rules_config.json"
    path.write_text(json.dumps({"tables": {"current": {}}}), encoding="utf-8")
    monkeypatch.setattr(dynamic_rules, "_resolve_rules_path", lambda: str(path))
    return path


def test_rollback_without_backup_folder_is_a_400(rules_file):
    with pytest.raises(HTTPException) as err:
        standardize.rollback_rules_config()
    assert err.value.status_code == 400
    assert "No backups available" in err.value.detail


def test_rollback_with_empty_backup_folder_is_a_400(rules_file):
    (rules_file.parent / "backups").mkdir()
    with pytest.raises(HTTPException) as err:
        standardize.rollback_rules_config()
    assert err.value.status_code == 400
    assert "No backups found" in err.value.detail


def test_rollback_restores_latest_backup_and_consumes_it(rules_file, monkeypatch):
    backups = rules_file.parent / "backups"
    backups.mkdir()
    (backups / "rules_config_20260101.json").write_text(json.dumps({"tables": {"old": {}}}), encoding="utf-8")
    (backups / "rules_config_20260102.json").write_text(json.dumps({"tables": {"newer": {}}}), encoding="utf-8")
    saved = []
    monkeypatch.setattr(dynamic_rules, "_save_rules_config", saved.append)
    result = standardize.rollback_rules_config()
    assert saved == [{"tables": {"newer": {}}}]
    assert result["restored_from"] == "rules_config_20260102.json"
    assert not (backups / "rules_config_20260102.json").exists()
    assert (backups / "rules_config_20260101.json").exists()


def test_rollback_real_failure_is_still_a_500(rules_file, monkeypatch):
    backups = rules_file.parent / "backups"
    backups.mkdir()
    (backups / "rules_config_20260101.json").write_text("not json", encoding="utf-8")
    with pytest.raises(HTTPException) as err:
        standardize.rollback_rules_config()
    assert err.value.status_code == 500
