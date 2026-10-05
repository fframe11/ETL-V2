"""Column types the engine can actually read and produce.

The align stage casts columns to Integer, Double and Timestamp; every other registered type
(Boolean, Long, Decimal, Date, ...) is left as the string read from the CSV. Registering a type
the engine cannot produce made every later run report a "type mismatch" (expected BooleanType,
found StringType) and open a schema proposal for a table that had not changed.
"""

ENGINE_TYPES = ("StringType", "IntegerType", "DoubleType", "TimestampType")

# What to register for a type Spark inferred, so the engine can handle it.
_REGISTRABLE = {
    "LongType": "DoubleType",       # IntegerType would overflow past 2^31
    "FloatType": "DoubleType",
    "DecimalType": "DoubleType",
    "DateType": "TimestampType",    # the timestamp parser reads plain dates
}


def registrable_type(inferred_type):
    """Type to store in the schema registry for a column Spark inferred as `inferred_type`."""
    if inferred_type in ENGINE_TYPES:
        return inferred_type
    return _REGISTRABLE.get(inferred_type, "StringType")


def producible_type(registered_type):
    """Type the engine produces for a registered type; compare the file's type against this."""
    return registered_type if registered_type in ENGINE_TYPES else "StringType"
