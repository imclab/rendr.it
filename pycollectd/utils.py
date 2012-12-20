"""
Utility methods for CollectdClient
"""

import re
import struct

import pycollectd.constants as constants


def sanitize(s):
    """Sanitizes a metric name."""
    return re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_")


def pack_numeric(type_code, number):
    return struct.pack("!HHq", type_code, 12, number)


def pack_string(type_code, string):
    return struct.pack("!HH", type_code, 5 + len(string)) + string + "\0"


def pack_value(name, value):
    return "".join([
        pack(constants.TYPE_TYPE_INSTANCE, name),
        struct.pack("!HHH", constants.TYPE_VALUES, 15, 1),
        struct.pack("<Bd", constants.VALUE_GAUGE, value)
    ])


def pack(id, value):
    if isinstance(id, basestring):
        return pack_value(id, value)
    elif id in constants.LONG_INT_CODES:
        return pack_numeric(id, value)
    elif id in constants.STRING_CODES:
        return pack_string(id, value)
    else:
        raise AssertionError("invalid type code " + str(id))
