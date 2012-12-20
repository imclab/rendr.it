"""
Utility methods for CollectdClient
"""

import re
import struct

from constants import *

def sanitize(s):
    """Sanitizes a metric name."""
    return re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_")

def pack_numeric(type_code, number):
    return struct.pack("!HHq", type_code, 12, number)

def pack_string(type_code, string):
    return struct.pack("!HH", type_code, 5 + len(string)) + string + "\0"

def pack_value(name, value):
    return "".join([
        pack(TYPE_TYPE_INSTANCE, name),
        struct.pack("!HHH", TYPE_VALUES, 15, 1),
        struct.pack("<Bd", VALUE_GAUGE, value)
    ])

def pack(id, value):
    if isinstance(id, basestring):
        return pack_value(id, value)
    elif id in LONG_INT_CODES:
        return pack_numeric(id, value)
    elif id in STRING_CODES:
        return pack_string(id, value)
    else:
        raise AssertionError("invalid type code " + str(id))

