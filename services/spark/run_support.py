"""Run-level helpers for spark_quality_engine.py that need no SparkSession: exit codes,
raw/archive path resolution, the lock heartbeat and the Delta maintenance cadence."""
import threading

EXIT_OK = 0
EXIT_SKIPPED = 75  # must match trigger_core.EXIT_SKIPPED


def raw_read_path(hdfs_url, table, ingest_id=None, exists=None):
    """Where this run reads its input, as (path, recursive).
    With an ingest_id: only that ingestion's folder, or its archived copy when it was
    already processed (retry / re-validation after remediation). Without one (manual
    CLI run): every file under the table folder."""
    if ingest_id:
        raw, archived = archive_paths(table, ingest_id)
        if exists is not None and not exists(raw) and exists(archived):
            return f"{hdfs_url}{archived}", False
        return f"{hdfs_url}{raw}", False
    return f"{hdfs_url}/data/raw/{table}", True


def archive_paths(table, ingest_id):
    return f"/data/raw/{table}/{ingest_id}", f"/data/archive/{table}/{ingest_id}"


def should_optimize(delta_version: int, every: int) -> bool:
    return every > 0 and delta_version > 0 and delta_version % every == 0


class Heartbeat:
    """Calls beat() every interval_seconds on a daemon thread until stop()."""

    def __init__(self, interval_seconds, beat):
        self.interval = interval_seconds
        self.beat = beat
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.wait(self.interval):
            try:
                self.beat()
            except Exception as e:
                print(f"[LOCK] Heartbeat failed: {e}")

    def start(self):
        self._thread.start()
        return self

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=5)
