import os
import sys

SPARK_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if SPARK_ROOT not in sys.path:
    sys.path.insert(0, SPARK_ROOT)
