import subprocess
import sys

from sdoqap.pipeline import plan
from sdoqap.pipeline.registry import STAGES, list_stages
import sdoqap.stages  # noqa: F401


def test_every_planned_stage_is_registered_once():
    names = plan.ALIGN + plan.TRANSFORM + plan.POST_LOAD
    assert len(names) == len(set(names))
    assert all(n in STAGES for n in names)


def test_list_stages_has_titles_and_phases():
    stages = list_stages()
    assert stages[0]["name"] == "schema_align"
    assert stages[-1]["name"] == "report"
    assert all(s["title"] and s["phase"] in {"align", "transform", "post_load"} for s in stages)


def test_cli_lists_stages():
    out = subprocess.run([sys.executable, "-m", "sdoqap.pipeline"], capture_output=True, text=True, check=True).stdout
    assert "schema_drift" in out and "total:" in out
