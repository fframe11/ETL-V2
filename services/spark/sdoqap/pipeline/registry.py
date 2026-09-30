import time
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class StageInfo:
    name: str
    title: str
    phase: str
    fn: Callable


STAGES = {}


def stage(name: str, title: str, phase: str):
    def register(fn):
        STAGES[name] = StageInfo(name, title, phase, fn)
        return fn
    return register


def run_stages(names, ctx):
    """Run stages in the given order; record wall-clock seconds per stage (includes the
    Spark actions a stage triggers) in ctx.metrics['stage_seconds']."""
    timings = ctx.metrics.setdefault("stage_seconds", {})
    for name in names:
        started = time.perf_counter()
        ctx = STAGES[name].fn(ctx)
        timings[name] = round(time.perf_counter() - started, 3)
    return ctx


def list_stages():
    import sdoqap.stages  # noqa: F401  (registers every stage)
    from sdoqap.pipeline.plan import ALIGN, POST_LOAD, TRANSFORM
    order = ALIGN + TRANSFORM + POST_LOAD
    return [{"order": i + 1, "name": n, "title": STAGES[n].title, "phase": STAGES[n].phase}
            for i, n in enumerate(order) if n in STAGES]
