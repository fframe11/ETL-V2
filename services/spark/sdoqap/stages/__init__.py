"""Importing this package registers every stage."""
from sdoqap.stages import schema  # noqa: F401
from sdoqap.stages import cleansing, standardize  # noqa: F401
from sdoqap.stages import anomaly, assembly  # noqa: F401
from sdoqap.stages import metrics, advisory, report  # noqa: F401
from sdoqap.stages import rules  # noqa: F401
