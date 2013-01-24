"""
pycollect implements `collectd`s binary protocol[1], using Tornado's `IOLoop`
and `PeriodicCallback` classes.

By default, metrics are `sum()`ed and passed to to configured `collectd`
instance every 60 seconds. The summation function can be defined on a
per-metric basis (see `CollectdClient.queue()` and
`CollectdClient._summarize_queue()`), and the interval can be set on a
per-client basis.

[1] https://collectd.org/wiki/index.php/Binary_protocol
"""

import collections
import functools
import logging
import re
import socket
import struct
import time

from tornado import ioloop

__all__ = [
    "CollectdClient", "PycollectdException",
    "sanitize", "count_to_value_part",
    "part_type_to_data_type", "value_to_part"
    "PART_TYPE", "VALUE_TYPE", "MAX_PACKET_LENGTH", "DEFAULT_PLUGIN_NAME",
    "DEFAULT_PLUGIN_INSTANCE", "DEFAULT_PLUGIN_TYPE", "DEFAULT_SEND_INTERVAL",
    "DEFAULT_PORT", "DEFAULT_CUMM_FUNCTION",
]

# Constants

PART_TYPE = {
    'HOST': 0x0000,
    'TIME': 0x0001,
    'PLUGIN': 0x0002,
    'PLUGIN_INSTANCE': 0x0003,
    'TYPE': 0x0004,
    'TYPE_INSTANCE': 0x0005,
    'VALUES': 0x0006,
    'INTERVAL': 0x0007,
    'TIME_HR': 0x0008,
    'INTERVAL_HR': 0x0009,
    'MESSAGE': 0x0100,
    'SEVERITY': 0x0101,
    'SIGNATURE': 0x0200,
    'ENCRYPTION': 0x0210
}

VALUE_TYPE = {
    'COUNTER': (0x00, '>Q'),
    'GAUGE': (0x01, '<d'),
    'DERIVE': (0x02, '>q'),
    'ABSOLUTE': (0x03, '>Q')
}

MAX_PACKET_LENGTH = 1024

DEFAULT_PLUGIN_NAME = "any"
DEFAULT_PLUGIN_INSTANCE = ""
DEFAULT_PLUGIN_TYPE = "gauge"
DEFAULT_SEND_INTERVAL = 60  # seconds
DEFAULT_PORT = 25826
DEFAULT_CUMM_FUNCTION = sum


#
# Utility Functions
#


def sanitize(name):
    """Sanitizes a metric name."""
    return re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_")


def count_to_value_part(name, count, value_type='GAUGE'):
    """
    Converts a metric name and value into 2 collectd packet parts:
        * a type instance part, setting the metric name as the type instance
          name for subsequent values
        * a value part containing a single value: the provided count
    """
    data_type, pack_format = VALUE_TYPE[value_type]
    count_value = struct.pack(pack_format, count)
    return ''.join([
        value_to_part(PART_TYPE['TYPE_INSTANCE'], name),
        struct.pack(
            '>HHHB',
            PART_TYPE['VALUES'], len(count_value) + 7, 1, data_type
        ),
        count_value
    ])


def part_type_to_data_type(part_type):
    """Returns the appropriate data type -- either numeric or string -- for a
    collectd part type"""
    if part_type in (
            PART_TYPE['TIME'], PART_TYPE['TIME_HR'],
            PART_TYPE['INTERVAL'], PART_TYPE['INTERVAL_HR']):
        return 'numeric'
    elif part_type in (
            PART_TYPE['HOST'], PART_TYPE['PLUGIN'],
            PART_TYPE['PLUGIN_INSTANCE'], PART_TYPE['TYPE'],
            PART_TYPE['TYPE_INSTANCE']):
        return 'string'
    else:
        raise PycollectdException(
                "Unknown or unimplemented part_type {}".format(part_type)
        )


def value_to_part(part_type, value):
    """Returns a collectd packet part for the provided value"""
    # part_type(2), length(2), payload
    data_type = part_type_to_data_type(part_type)
    if data_type == 'numeric':
        return struct.pack('>HHq', part_type, 12, value)
    elif data_type == 'string':
        return struct.pack('>HH', part_type, len(value) + 5) + value + '\0'
    else:
        raise PycollectdException("Invalid data_type {}".format(data_type))


#
# Classes
#


class PycollectdException(Exception):
    pass


class CollectdClient(object):  # pylint: disable=R0902
    """
    Provides an  API for sending metrics to a `collectd` instance.

    Basic example:
        collectd = CollectdClient("collectd.example.com")
        collectd.queue('summed_random', random.randrange(100))
        collectd.queue('summed_random', random.randrange(100))
        collectd.queue('summed_random', random.randrange(100))

        def avg(values):
            return sum(values)/float(len(values))

        collectd.queue('avg_values', 1, avg)
        collectd.queue('avg_values', 2, avg)
        collectd.queue('avg_values', 3, avg)

        collectd.start()
        ioloop.IOLoop.instance().start()

    """

    def __init__(self, collectd_hostname, **kwargs):
        """
        Creates a `CollectdClient` for communicating with the `collectd`
        endpoint at `collectd_hostname`.

        Valid kwargs:
            * `collectd_port`: The UDP port to talk to collectd on.
            * `hostname`: The hostname of this machine. Defaults to
                `socket.getfqdn()`
            * `plugin_name`: The name of the collectd-plugin we are reporting
                stats for. Defaults to "any".
            * `plugin_instance`: The instance of the plugin we are reporting
                stats for. Defaults to ""
            * `plugin_type`: The data-type for this plugin.
            * `send_interval`: Seconds between each data send.
            * `io_loop`: The tornado.ioloop.IOLoop instance to use. Defaults to
                `ioloop.IOLoop.instance()`
        """

        collectd_port = kwargs.pop("collectd_port", DEFAULT_PORT)
        self.collectd_addr = (collectd_hostname, collectd_port)
        self.hostname = kwargs.pop("hostname", socket.getfqdn())
        self.plugin_name = kwargs.pop(
            "plugin_name", DEFAULT_PLUGIN_NAME)
        self.plugin_instance = kwargs.pop(
            "plugin_instance", DEFAULT_PLUGIN_INSTANCE)
        self.plugin_type = kwargs.pop(
            "plugin_type", DEFAULT_PLUGIN_TYPE)
        self.send_interval = kwargs.pop(
            "send_interval", DEFAULT_SEND_INTERVAL)
        self.io_loop = kwargs.pop("io_loop", ioloop.IOLoop.instance())

        self._queue = collections.deque()

        self._timer = ioloop.PeriodicCallback(
            self._process_queue,
            self.send_interval * 1000,
            self.io_loop
        )

        if(len(kwargs) != 0):
            raise ValueError("Unkown keys for {}: {}".format(
                self.__class__.__name__,
                ",".join(kwargs.keys())
            ))

    def queue(self, metric, value, cumm_func=None):
        """
        Records a metric to be summarized and sent to `collectd`.

        The `cumm_func` argument should be a function that takes a sequence
        of values, returning their summarized form -- if none is defined,
        `sum()` will be used.

        If you pass mutliple different `cumm_func`s for a single `metric`,
        the most recent `cumm_func` will be used. E.g., calling:

            collectd.queue('foo', 1, f1)
            collectd.queue('foo', 2)
            collectd.queue('bar', 3, f2)
            collectd.queue('foo', 4, f3)

        would result in `f3` being used to summarize "foo" values, and `f2`
        being used for summarizing "bar" values.

        """
        self._queue.append((metric, value, cumm_func))

    def start(self):
        """
        Starts the periodic loop.
        """
        self._timer.start()

    def stop(self):
        """
        Stops the periodic loop.
        """
        self._timer.stop()

    def _process_queue(self):
        """
        Creates summaries of the metrics queued so far, and sends them to
        `collectd`.

        Called automatically by `self._timer` every `self.send_interval`
        seconds.
        """
        summed_values = self._summarize_queue()
        sent_values = self._send_values(summed_values)
        return sent_values

    def _summarize_queue(self):
        """
        Generates summaries of the queued metrics.
        """
        values_by_metric = collections.defaultdict(list)
        summed_values = {}
        functions = {}
        for metric, value, cumm_func in self._queue:
            metric = sanitize(metric)
            values_by_metric[metric].append(value)
            if cumm_func is not None:
                functions[metric] = cumm_func
        self._queue.clear()

        for metric, values in values_by_metric.iteritems():
            cumm_func = functions.get(metric, DEFAULT_CUMM_FUNCTION)
            summed_values[metric] = cumm_func(values)
        return summed_values

    def _send_values(self, values):
        """
        Sends the summarized values to the `collectd` instance.

        Returns the number of packets sent successfully.
        """
        values_sent = 0
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, 0)
        for packet in self.counts_to_packets(values):
            bytes_tx = sock.sendto(packet, self.collectd_addr)
            if len(packet) == bytes_tx:
                values_sent += 1

        sock.close()
        return values_sent

    def counts_to_packets(self, counts, timestamp=None):
        """
        Given a dict of { metric: value }, yields collectd UDP packets
        """
        packet = self.head_part(timestamp)
        for name, count in counts.iteritems():
            count_part = count_to_value_part(name, count)
            if len(packet) + len(count_part) >= MAX_PACKET_LENGTH:
                yield packet
                packet = self.head_part(timestamp)
            packet += count_part
        yield packet

    def head_part(self, timestamp=None):
        """
        Returns a sequence of parts to use as a header for a collectd packet.

        These header parts provide the context for any subsequent value parts.
        """
        timestamp = timestamp or time.time()

        return ''.join([
            value_to_part(PART_TYPE['HOST'], self.hostname),
            value_to_part(PART_TYPE['TIME'], timestamp),
            value_to_part(PART_TYPE['PLUGIN'], self.plugin_name),
            value_to_part(PART_TYPE['PLUGIN_INSTANCE'], self.plugin_instance),
            value_to_part(PART_TYPE['TYPE'], self.plugin_type),
            value_to_part(PART_TYPE['INTERVAL'], self.send_interval)
        ])

    # Predefined summarizing functions
    @staticmethod
    def average(values):
        """
        Returns the average of the provided values.
        """
        return sum(values) / float(len(values))

if __name__ == "__main__":
    import string
    import unittest

    class PyCollectdClientTest(unittest.TestCase):
        def setUp(self):
            self.client = CollectdClient("localhost", hostname="hostname")

        def test_header(self):
            expected = "".join(chr(x) for x in [
                0x00, 0x00, 0x00, 0x0d, 0x68, 0x6f, 0x73, 0x74,
                0x6e, 0x61, 0x6d, 0x65, 0x00, 0x00, 0x01, 0x00,
                0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x01, 0x00, 0x02, 0x00, 0x08, 0x61, 0x6e, 0x79,
                0x00, 0x00, 0x03, 0x00, 0x05, 0x00, 0x00, 0x04,
                0x00, 0x0a, 0x67, 0x61, 0x75, 0x67, 0x65, 0x00,
                0x00, 0x07, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x3c
            ])

            header = self.client.head_part(1)
            self.assertEqual(header, expected)

        def test_sanitize(self):
            self.assertEqual(
                    sanitize(string.ascii_letters), string.ascii_letters
            )
            self.assertEqual(sanitize(string.digits), string.digits)
            self.assertEqual(sanitize("`~!@#$%^&*()-_=+[{]};:'\",<.>/? "), "")
            self.assertEqual(
                    sanitize("~~this~~is~~a~~test~~string~~"),
                    "this_is_a_test_string"
            )

        def test_pack_numeric(self):
            self.assertEqual(value_to_part(PART_TYPE['TIME'], -1),
                "".join(chr(x) for x in [
                    0x00, 0x01, 0x00, 0x0c, 0xff, 0xff, 0xff, 0xff,
                    0xff, 0xff, 0xff, 0xff
                ]))
            self.assertEqual(value_to_part(PART_TYPE['TIME'], 1),
                "".join(chr(x) for x in [
                    0x00, 0x01, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x01
                ]))

        def test_pack_string(self):
            self.assertEqual(value_to_part(PART_TYPE['HOST'], "hostname"),
                    "".join(chr(x) for x in [
                        0x00, 0x00, 0x00, 0x0d, 0x68, 0x6f, 0x73, 0x74,
                        0x6e, 0x61, 0x6d, 0x65, 0x00
                ]))
            self.assertEqual(value_to_part(PART_TYPE['PLUGIN'], "plugin"),
                    "".join(chr(x) for x in [
                        0x00, 0x02, 0x00, 0x0b, 0x70, 0x6c, 0x75, 0x67,
                        0x69, 0x6e, 0x00
                ]))

        def test_pack_value(self):
            self.assertEqual(count_to_value_part("value", 1),
                    "".join(chr(x) for x in [
                        0x00, 0x05, 0x00, 0x0a, 0x76, 0x61, 0x6c, 0x75,
                        0x65, 0x00, 0x00, 0x06, 0x00, 0x0f, 0x00, 0x01,
                        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0,
                        0x3f
                ]))
            self.assertEqual(count_to_value_part("value", -1),
                    "".join(chr(x) for x in [
                        0x00, 0x05, 0x00, 0x0a, 0x76, 0x61, 0x6c, 0x75,
                        0x65, 0x00, 0x00, 0x06, 0x00, 0x0f, 0x00, 0x01,
                        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0,
                        0xbf
                ]))
            self.assertEqual(count_to_value_part("value", 0),
                    "".join(chr(x) for x in [
                        0x00, 0x05, 0x00, 0x0a, 0x76, 0x61, 0x6c, 0x75,
                        0x65, 0x00, 0x00, 0x06, 0x00, 0x0f, 0x00, 0x01,
                        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                        0x00
                ]))
            self.assertEqual(count_to_value_part("value", 12345),
                    "".join(chr(x) for x in [
                        0x00, 0x05, 0x00, 0x0a, 0x76, 0x61, 0x6c, 0x75,
                        0x65, 0x00, 0x00, 0x06, 0x00, 0x0f, 0x00, 0x01,
                        0x01, 0x00, 0x00, 0x00, 0x00, 0x80, 0x1c, 0xc8,
                        0x40
                ]))

    unittest.main()
