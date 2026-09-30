import time

import run_support as rs
import trigger_core


def test_exit_code_constants_agree_with_daemon():
    assert rs.EXIT_SKIPPED == trigger_core.EXIT_SKIPPED == 75
    assert rs.EXIT_OK == trigger_core.EXIT_OK == 0


def test_ingest_run_reads_only_its_own_folder():
    path, recursive = rs.raw_read_path("hdfs://nn:9000", "scores", "i1", exists=lambda p: True)
    assert path == "hdfs://nn:9000/data/raw/scores/i1"
    assert recursive is False


def test_reprocessing_reads_the_archived_copy():
    existing = {"/data/archive/scores/i1"}
    path, _ = rs.raw_read_path("hdfs://nn:9000", "scores", "i1", exists=lambda p: p in existing)
    assert path == "hdfs://nn:9000/data/archive/scores/i1"


def test_legacy_run_reads_whole_table_recursively():
    assert rs.raw_read_path("hdfs://nn:9000", "scores") == ("hdfs://nn:9000/data/raw/scores", True)


def test_archive_paths():
    assert rs.archive_paths("scores", "i1") == ("/data/raw/scores/i1", "/data/archive/scores/i1")


def test_optimize_cadence():
    assert rs.should_optimize(10, 10) is True
    assert rs.should_optimize(11, 10) is False
    assert rs.should_optimize(0, 10) is False
    assert rs.should_optimize(10, 0) is False


def test_heartbeat_beats_until_stopped():
    beats = []
    hb = rs.Heartbeat(0.01, lambda: beats.append(1)).start()
    time.sleep(0.1)
    hb.stop()
    count = len(beats)
    time.sleep(0.05)
    assert count >= 3
    assert len(beats) == count


def test_heartbeat_survives_a_failing_beat():
    calls = []

    def beat():
        calls.append(1)
        raise RuntimeError("es down")

    hb = rs.Heartbeat(0.01, beat).start()
    time.sleep(0.05)
    hb.stop()
    assert len(calls) >= 2
