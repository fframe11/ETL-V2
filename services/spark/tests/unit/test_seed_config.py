import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts"))

from seed_config_to_es import plan_seed


def test_only_missing_docs_are_seeded():
    file_docs = {"a": {"x": 1}, "b": {"x": 2}, "_comment": "ignore me"}
    assert plan_seed(file_docs, existing_ids={"a"}) == {"b": {"x": 2}}


def test_non_dict_entries_are_skipped():
    assert plan_seed({"_comment": "text", "t": {"k": 1}}, existing_ids=set()) == {"t": {"k": 1}}
