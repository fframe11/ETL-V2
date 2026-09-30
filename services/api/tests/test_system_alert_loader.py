import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.system import _load_route_alert


def test_route_alert_is_loaded_from_spark_code():
    route_alert = _load_route_alert()
    assert callable(route_alert)
    assert route_alert.__module__ == "alert_router"
