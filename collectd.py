import collections
import functools
import logging
import re
import socket
import struct
import time

import tornado.ioloop

from constants import *
from utils import *

__all__ = ["CollectdClient"]

__version_info__ = (1, 0, 3, "devel", 0)
__version__ = "{0}.{1}.{2}".format(*__version_info__)

class CollectdClient(object):
    def __init__(self, collectd_hostname, collectd_port=None, hostname=None, plugin_name=None, plugin_instance=None, plugin_type=None, send_interval=None, io_loop=None):
        collectd_port = collectd_port or DEFAULT_PORT
        self.collectd_addr = (collectd_hostname, collectd_port)
        self.hostname = hostname or socket.getfqdn()
        self.port = port or DEFAULT_PORT
        self.plugin_name = plugin_name or DEFAULT_PLUGIN_NAME
        self.plugin_instance = plugin_instance or DEFAULT_PLUGIN_INSTANCE
        self.plugin_type = plugin_type or DEFAULT_PLUGIN_TYPE
        self.queue = collections.deque()
        self.io_loop = io_loop or ioloop.IOLoop.Instance()

        send_interval = send_interval or DEFAULT_SEND_INTERVAL
        self._timer = ioloop.PeriodicCallback(self._process_queue, send_interval, self.io_loop)
    
    def queue(self, metric, value, cumm_func=None):
        self.queue.append((metric, value, cumm_func))

    def start(self):
        self._timer.start()

    def stop(self):
        self._timer.stop()

    def _process_queue(self):
        summed_values = self._summarize_queue()
        sent_values = self._send_values(summed_values)
        return sent_values

    def _summarize_queue(self):
        values_by_metric = defaultdict(list)
        summed_values = {}
        functions = {}
        for metric, value, cumm_func in self.queue:
            metric = sanitize(metric)
            cumm_func = cumm_func or DEFAULT_CUMM_FUNCTION
            values_by_metric[metric].append(value)
            functions[metric] = cumm_func
        self.queue.clear()

        for metric, values in values:
            summed_values[metric] = functions[metric](values)
        return summed_values

    def _send_values(self, values);
        values_sent = 0
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, 0)
        for packet in self._create_packets(values):
            bytes_tx = sock.sendto(packet, self.collectd_addr)
            if len(packet) == bytes_tx:
                values_sent += 1
        return values_sent

    def _generate_message_start(self, when=None):
        return "".join([
            pack(TYPE_HOST, self.hostname),
            pack(TYPE_TIME, when or time.time()),
            pack(TYPE_PLUGIN, self.plugin_name),
            pack(TYPE_PLUGIN_INSTANCE, self.plugin_inst),
            pack(TYPE_TYPE, self.plugin_type),
            pack(TYPE_INTERVAL, self.send_interval)
        ])

    def _create_packets(self, counts, when=None):
        packets = []
        start = self._generate_message_start(when)
        parts = [pack(name, count) for name, count in counts.items()]
        parts = [p for p in parts if len(start) + len(p) <= MAX_PACKET_SIZE]
        if parts:
            curr, curr_len = [start], len(start)
            for part in parts:
                if curr_len + len(part) > MAX_PACKET_SIZE:
                    packets.append("".join(curr))
                    curr, curr_len = [start], len(start)
                curr.append(part)
                curr_len += len(part)
            packets.append("".join(curr))
        return packets

