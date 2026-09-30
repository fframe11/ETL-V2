import os
import tempfile
import zipfile

PACKAGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ship_package(spark) -> str:
    """Zip the sdoqap package and add it to the SparkContext so executors can import
    it (UDFs that reference sdoqap functions are pickled by reference)."""
    fd, path = tempfile.mkstemp(prefix="sdoqap-", suffix=".zip")
    os.close(fd)
    root = os.path.dirname(PACKAGE_DIR)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for folder, _, files in os.walk(PACKAGE_DIR):
            for name in files:
                if name.endswith(".py"):
                    full = os.path.join(folder, name)
                    z.write(full, os.path.relpath(full, root).replace(os.sep, "/"))
    spark.sparkContext.addPyFile(path)
    return path
