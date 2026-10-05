import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sdoqap.common.types import ENGINE_TYPES, producible_type, registrable_type


def test_types_the_engine_handles_are_registered_as_they_are():
    for t in ENGINE_TYPES:
        assert registrable_type(t) == t
        assert producible_type(t) == t


def test_boolean_is_registered_as_text_because_the_engine_reads_it_as_text():
    assert registrable_type("BooleanType") == "StringType"


def test_other_inferred_types_map_to_one_the_engine_can_produce():
    assert registrable_type("LongType") == "DoubleType"      # IntegerType would overflow
    assert registrable_type("DecimalType") == "DoubleType"
    assert registrable_type("FloatType") == "DoubleType"
    assert registrable_type("DateType") == "TimestampType"
    assert registrable_type("BinaryType") == "StringType"
    for inferred in ("BooleanType", "LongType", "DecimalType", "DateType", "BinaryType", "MapType"):
        assert registrable_type(inferred) in ENGINE_TYPES


def test_an_old_boolean_registry_entry_compares_against_text():
    # What the drift check compares the file's type with: BooleanType can only ever be read as text.
    assert producible_type("BooleanType") == "StringType"
    assert producible_type("LongType") == "StringType"
    assert producible_type("IntegerType") == "IntegerType"
