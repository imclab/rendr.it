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
    def __init__(self, collectd_hostname, **kwargs):
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
        self._queue.append((metric, value, cumm_func))

    def start(self):
        self._timer.start()

    def stop(self):
        self._timer.stop()

    def _process_queue(self):
        summed_values = self._summarize_queue()
        sent_values = self._send_values(summed_values)
        return sent_values

    def _summarize_queue(self):
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
            summed_values[metric] = functions[metric](values)
        return summed_values

    def _send_values(self, values):
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
