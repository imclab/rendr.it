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

import pycollectd.constants as constants
import pycollectd.utils as utils

__all__ = ["CollectdClient"]

__version_info__ = (1, 0, 3, "devel", 0)
__version__ = "{0}.{1}.{2}".format(*__version_info__)


class CollectdClient(object):
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
            `collectd_port`: The UDP port to talk to collectd on.
            `hostname`: The hostname of this machine. Defaults to `socket.getfqdn()`
            `plugin_name`: The name of the collectd-plugin we are reporting stats for. Defaults to "any".
            `plugin_instance`: The instance of the plugin we are reporting stats for. Defaults to ""
            `plugin_type`: The data-type for this plugin.
            `send_interval`: Seconds between each data send.
            `io_loop`: The tornado.ioloop.IOLoop instance to use. Defaults to
                       `ioloop.IOLoop.instance()`
        """

        collectd_port = kwargs.pop("collectd_port", constants.DEFAULT_PORT)
        self.collectd_addr = (collectd_hostname, collectd_port)
        self.hostname = kwargs.pop("hostname", socket.getfqdn())
        self.plugin_name = kwargs.pop(
            "plugin_name", constants.DEFAULT_PLUGIN_NAME)
        self.plugin_instance = kwargs.pop(
            "plugin_instance", constants.DEFAULT_PLUGIN_INSTANCE)
        self.plugin_type = kwargs.pop(
            "plugin_type", constants.DEFAULT_PLUGIN_TYPE)
        self.send_interval = kwargs.pop(
            "send_interval", constants.DEFAULT_SEND_INTERVAL)
        self.io_loop = kwargs.pop("io_loop", ioloop.IOLoop.instance())

        self._queue = collections.deque()

        self._timer = ioloop.PeriodicCallback(
            self._process_queue,
            self.send_interval,
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
            metric = utils.sanitize(metric)
            values_by_metric[metric].append(value)
            if cumm_func is not None:
                functions[metric] = cumm_func
        self._queue.clear()

        for metric, values in values_by_metric.iteritems():
            cumm_func = functions.get(metric, constants.DEFAULT_CUMM_FUNCTION)
            summed_values[metric] = cumm_func(values)
        return summed_values

    def _send_values(self, values):
        """
        Sends the summarized values to the `collectd` instance.

        Returns the number of packets sent successfully.
        """
        values_sent = 0
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, 0)
        for packet in self._create_packets(values):
            bytes_tx = sock.sendto(packet, self.collectd_addr)
            if len(packet) == bytes_tx:
                values_sent += 1
        return values_sent

    def _generate_message_start(self, when=None):
        return "".join([
            utils.pack(constants.TYPE_HOST, self.hostname),
            utils.pack(constants.TYPE_TIME, when or time.time()),
            utils.pack(constants.TYPE_PLUGIN, self.plugin_name),
            utils.pack(constants.TYPE_PLUGIN_INSTANCE, self.plugin_instance),
            utils.pack(constants.TYPE_TYPE, self.plugin_type),
            utils.pack(constants.TYPE_INTERVAL, self.send_interval)
        ])

    def _create_packets(self, counts, when=None):
        packets = []
        start = self._generate_message_start(when)
        parts = [utils.pack(name, count) for name, count in counts.items()]
        parts = [
            p for p in parts
            if len(start) + len(p) <= constants.MAX_PACKET_SIZE
        ]
        if parts:
            curr, curr_len = [start], len(start)
            for part in parts:
                if curr_len + len(part) > constants.MAX_PACKET_SIZE:
                    packets.append("".join(curr))
                    curr, curr_len = [start], len(start)
                curr.append(part)
                curr_len += len(part)
            packets.append("".join(curr))
        return packets
