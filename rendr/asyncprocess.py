#Copyright (C) 2012 TaguchiMarketing Pty Ltd
#
#Permission is hereby granted, free of charge, to any person obtaining a copy
#of this software and associated documentation files (the "Software"), to deal
#in the Software without restriction, including without limitation the rights
#to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
#copies of the Software, and to permit persons to whom the Software is
#furnished to do so, subject to the following conditions:
#
#The above copyright notice and this permission notice shall be included in
#all copies or substantial portions of the Software.
#
#THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
#IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
#FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
#AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
#LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
#OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
#SOFTWARE.

import os
import time
import fcntl
import logging
import tornado
import traceback
import subprocess
import tornado.ioloop
import tornado.stack_context


def _nonblocking(f):
    fd = f.fileno()
    fl = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)


def _exception_handler(exc_type, exc_value, exc_traceback):
    logging.exception(
        "AsyncProcess.exception_handler(type=%s, value=%s, traceback=%s)"
            % (str(exc_type), str(exc_value),
                "".join(traceback.format_tb(exc_traceback)))
        )
    return True


class AsyncProcess(object):
    """
    Manages an asynchronous worker process.

    Messages written to stdin and read from stderr are not required to be in
    any specific format, while responses read from stdout are expected to be
    LF-terminated.

    The process is terminated after `timeout` seconds, unless it exits
    earlier.

    Internally, messages are written from the stdin queue to the process,
    and placed in an in-flight queue until the corresponding stdout message
    is read, whereupon the callback associated with the stdin message is
    called.

    If the process terminates without writing to stderr, it is restarted and
    any requests in the in-flight queue are re-issued. If the process has
    written to stderr before it terminates, it is not restarted and the
    callbacks associated with any outstanding requests are called with an
    error message.
    """
    def __init__(self, command=None, timeout=None, io_loop=None):
        self.command = command
        self.process = None
        self.timeout = timeout or 60
        self.io_loop = io_loop or tornado.ioloop.IOLoop.instance()

        self._stdout_buf = ""
        self._stderr_buf = ""

        self._terminate_timeout = None
        self._terminate_cb = None
        self._terminated = True

    def is_running(self):
        """
        Returns the current process status
        """
        return not self._terminated

    def terminate(self):
        """
        Terminates the subprocess.
        """
        self._on_close()

    def run(self, callback=None):
        """
        Runs the async process and callback if specified -- see _on_close()
        for more info.
        """
        logging.debug("AsyncProcess.run(cmd=%s)" % repr(self.command))

        self._terminate_cb = tornado.stack_context.wrap(callback)

        self.process = subprocess.Popen(self.command, stdout=subprocess.PIPE,
            stdin=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True,
            shell=False)

        _nonblocking(self.process.stdin)
        _nonblocking(self.process.stdout)
        _nonblocking(self.process.stderr)

        with tornado.stack_context.NullContext():
            self.io_loop.add_handler(self.process.stdout.fileno(),
                self._on_read_stdout, self.io_loop.READ)
            self.io_loop.add_handler(self.process.stderr.fileno(),
                self._on_read_stderr, self.io_loop.READ)

        self._terminated = False

        # terminate after timeout
        self._terminate_timeout = self.io_loop.add_timeout(time.time() +
            self.timeout, self._on_close)

    def _on_read_stdout(self, fd, events):
        """
        Called when the worker has a response available.
        """
        if self._terminated:
            return

        buf = self.process.stdout.read()

        try:
            self._stdout_buf += buf or ""

            if self.process.poll() is not None or not buf:
                logging.warning(
                    "AsyncProcess._on_read_stdout(command=%s): exit!" % \
                    repr(self.command))
                self._on_close()
                return
        except Exception:
            logging.exception(
                "AsyncProcess._on_read_stdout(command=%s): failure!" % \
                repr(self.command))
            self._on_close()

    def _on_read_stderr(self, fd, events):
        """
        Called when the worker has error output available.
        """
        if self._terminated:
            return

        buf = self.process.stderr.read()

        try:
            self._stderr_buf += buf or ""

            if self.process.poll() is not None or not buf:
                logging.warning(
                    "AsyncProcess._on_read_stderr(cmd=%s): exit!" % \
                    repr(self.command))
                self._on_close()
        except Exception:
            logging.exception(
                "AsyncProcess._on_read_stderr(cmd=%s): failure!" % \
                repr(self.command))

    def _on_close(self):
        """
        Called when the worker terminates.
        """
        if self._terminated:
            return

        self._terminated = True

        try:
            self.io_loop.remove_handler(self.process.stdout.fileno())
        except KeyError:
            pass
        try:
            self.io_loop.remove_handler(self.process.stderr.fileno())
        except KeyError:
            pass

        # close fds
        self.process.stdout.close()
        self.process.stderr.close()
        self.process.stdin.close()

        # terminate with SIGTERM
        try:
            self.process.terminate()
            if self.process.poll() is not None:  # Try harder - SIGKILL
                self.process.kill()
            self.process.wait()
        except OSError:
            logging.info(
                "AsyncProcess.terminate(cmd=%s): exited" % repr(self.command))
        else:
            logging.info(
                "AsyncProcess.terminate(cmd=%s): killed" % repr(self.command))

        # notify terminate listener
        if self._terminate_cb:
            with tornado.stack_context.NullContext():
                self._terminate_cb(self._stdout_buf, self._stderr_buf)


def run_cmd(cmd, timeout=60, callback=None, io_loop=None):
    """
    Run a command until completion (or until timeout seconds have elapsed,
    defaulting to 60), and pass stdout, stderr to callback.
    """
    proc = AsyncProcess(command=cmd, timeout=timeout, io_loop=io_loop)
    proc.run(callback=callback)
