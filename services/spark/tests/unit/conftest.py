import os
import sys

SPARK_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if SPARK_ROOT not in sys.path:
    sys.path.insert(0, SPARK_ROOT)


import pytest


@pytest.fixture(scope="session")
def spark():
    from pyspark.sql import SparkSession
    session = (SparkSession.builder.master("local[1]").appName("sdoqap-unit")
               .config("spark.sql.shuffle.partitions", "1")
               .config("spark.ui.enabled", "false")
               .getOrCreate())
    yield session
    session.stop()
