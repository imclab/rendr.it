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
import cgi
import json
import uuid
import stat
import time
import email
import Image
import base64
import slimit
import cssmin
import urllib
import hashlib
import httplib
import pystache
import tempfile
import datetime
import cStringIO
import subprocess
import tornado.web
import logging as log
import tornado.ioloop
import tornado.template
from tornado import gen
from rendr import asyncs3
from rendr import pycollectd
from rendr import asyncprocess


ASSET_MANIFEST = {
    "styles": [
        "/static/css/normalize.css",
        "/static/css/foundation.css",
        "/static/css/font-awesome.css",
        "/static/css/rendr.it.css"
    ],
    "body_js": [
        "/static/js/mustache.js",
        "/static/js/jquery.js",
        "/static/js/jquery.textchange.js",
        "/static/js/jquery.debounce.js",
        "/static/js/jquery.splitter.js",
        "/static/js/jquery.hoverIntent.js",
        "/static/js/jquery.farbtastic.js",
        "/static/js/jquery.tipsy.js",
        "/static/js/jquery.foundation.forms.js",
        "/static/js/jquery.foundation.reveal.js",
        "/static/js/jquery.foundation.tabs.js",
        "/static/js/jquery.foundation.buttons.js",
        "/static/js/ace/ace.js",
        "/static/js/ace/mode-css.js",
        "/static/js/ace/mode-javascript.js",
        "/static/js/ace/mode-json.js",
        "/static/js/ace/mode-markdown.js",
        "/static/js/ace/mode-html.js",
        "/static/js/ace/worker-javascript.js",
        "/static/js/ace/theme-rendr.js",
        "/static/js/ace/ext-searchbox.js",
        "/static/js/angular.js",
        "/static/js/rendr.it.js"
    ]
}


def delete_files(folder, max, lifetime):
    """
    folder: str
        the folder whose files are to be deleted
    max: int
        the maximum number of files to be deleted
    lifetime: int
        the time (secs) each file allowed to exist before deleted

    Deletes up to max number of files older than the lifetime.
    """
    count = 0
    now = time.time()
    for (root, _, names) in os.walk(folder, topdown=False):
        for name in names:
            if name.lower().rpartition(".")[2] not in ("png", "jpg", "gif"):
                continue

            target = os.path.join(root, name)
            diff = now - os.path.getctime(target)
            if diff > lifetime:
                os.remove(target)
                count += 1
                if count == max:
                    return


class LibraryManager(tornado.web.RequestHandler):
    def initialize(self, db=None):
        self.db = db

    @tornado.web.asynchronous
    @gen.engine
    def post(self, library_id=None):
        if self.request.headers.get("x-forwarded-proto") == "http":
            raise tornado.web.HTTPError(400)

        result = yield gen.Task(self.db.create_library,
            self.get_argument("name"))
        if not result or "error" in result:
            raise tornado.web.HTTPError(500)

        self.set_header("Content-Type", "application/json")
        self.write(result)
        self.finish()

    @tornado.web.asynchronous
    @gen.engine
    def get(self, library_id):
        if self.request.headers.get("x-forwarded-proto") == "http":
            raise tornado.web.HTTPError(400)

        library_key = self.get_argument("key")

        result = yield gen.Task(self.db.read_library, library_id)
        if not result or "error" in result:
            raise tornado.web.HTTPError(404)

        # Validate the library against the library key hash
        if not asyncs3.pwd_context.verify(library_key, result["keyHash"]):
            raise tornado.web.HTTPError(403)

        # Retrieve the rendrs for this library
        rendrs = yield gen.Task(self.db.list_rendrs, library_id)
        if not result or "error" in result:
            raise tornado.web.HTTPError(404)

        del result["keyHash"]
        result["rendrs"] = rendrs

        self.set_header("Content-Type", "application/json")
        self.write(result)
        self.finish()


class RendrManager(tornado.web.RequestHandler):
    """APIs to work work rendr objects."""
    def initialize(self, db=None):
        self.db = db

    @tornado.web.asynchronous
    @gen.engine
    def put(self, library_id, rendr_id):
        if self.request.headers.get("x-forwarded-proto") == "http":
            raise tornado.web.HTTPError(400)

        """Updates the rendr and returns the id to the client."""
        req = json.loads(self.request.body)

        # Retrieve the library file
        library_data = yield gen.Task(self.db.read_library,
            library_id)
        if not library_data or "error" in library_data:
            raise tornado.web.HTTPError(404)

        # Validate the library against the library key
        if not asyncs3.pwd_context.verify(req["libraryKey"], library_data["keyHash"]):
            raise tornado.web.HTTPError(403)

        # The key matches, so update the rendr.
        result = yield gen.Task(self.db.write_rendr, library_id,
            rendr_id, {
                "rendrId": rendr_id,
                "libraryId": library_id,
                "css": req["css"],
                "body": req["body"],
                "testPath": req["testPath"],
                "testParams": req["testParams"]
            }
        )

        if not result or "error" in result:
            raise tornado.web.HTTPError(500)

        self.set_header("Content-Type", "application/json")
        self.write(result)
        self.finish()


class Renderer(tornado.web.RequestHandler):
    _rendr_failure_times = {}

    def initialize(self, db=None, timeout=None, phantomjs=None,
            rasterize=None, port=None, static_subdomains=None):
        self.db = db
        self.timeout = timeout or 10
        self.phantomjs = phantomjs
        self.rasterize = rasterize
        self.port = port
        self.static_subdomains = static_subdomains

    def write_error(self, status_code, **args):
        if "message" in args:
            args["message"] = "<pre>%s</pre>" % cgi.escape(args["message"])

        self.finish("<html><title>%(code)d: %(status)s</title>"
                    "<body>%(code)d: %(status)s<br/>%(message)s</body></html>"
                    % {
                        "code": status_code,
                        "status": httplib.responses[status_code],
                        "message": args.get("message", ""),
                    })

    @tornado.web.asynchronous
    @gen.engine
    def get(self, format):
        t = time.time()

        rendr_desc, _, format = self.request.path[1:].rpartition('.')

        if self.request.host.partition('.')[0] in self.static_subdomains:
            # Invalid hostname -- don't serve rendrs on static domains
            raise tornado.web.HTTPError(404)
        elif self.request.host.startswith('l') and \
                len(self.request.host.split('.')) > 2:
            # Library ID is in hostname
            library_id = self.request.host.partition('.')[0][1:]
            rendr_id, _, param = rendr_desc.partition('/')
        else:
            # Library ID is first parameter
            library_id, _, rendr_desc = rendr_desc.partition('/')
            rendr_id, _, param = rendr_desc.partition('/')

        library_id = urllib.unquote(library_id)
        rendr_id = urllib.unquote(rendr_id)

        log.debug("%s %s" % (library_id, rendr_id))

        # Assemble parameter set
        data = dict((k, v if len(v) != 1 else v[0])
                for k, v in self.request.arguments.iteritems())
        data["params"] = [urllib.unquote(p) for p in param.split('/')]

        format = format.lower()

        if format in ("jpg", "gif", "png"):
            # Check recency of last total failure -- if less than timeout * 10,
            # throw an error immediately. This prevents infinite rendr loops,
            # provided there are fewer than 8 or so rendrs in the loop.
            if t - Renderer._rendr_failure_times.get((library_id, rendr_id), 0) \
                    < self.timeout * 10:
                raise tornado.web.HTTPError(503)

            query_uri = "http://127.0.0.1:%s/%s/%s.html%s" % (self.port,
                library_id, rendr_desc,
                "?" + self.request.query if self.request.query else "")
            fd, output_path = tempfile.mkstemp(suffix=".png")
            os.close(fd) # not using it yet

            result = yield gen.Task(asyncprocess.run_cmd,
                [self.phantomjs, "--disk-cache=yes",
                "--max-disk-cache-size=524288", self.rasterize, query_uri,
                output_path],
                self.timeout)

            # Track the last failure
            if not result[0][0].startswith("success"):
                log.error("Renderer.get failure (%s): %s" % (self.request.uri,
                    result[0][0]))
                # Any rendr failures caused by timeouts will trigger a lockout
                # for 10 times the timeout duration
                if time.time() - t > self.timeout - 1.0:
                    Renderer._rendr_failure_times[(library_id, rendr_id)] = t
                self.send_error(504, message='\n'.join(
                    l for l in result[0][0].split('\n')
                        if not l.startswith('success: written')))
                return

            # Serve output path
            self.set_header("Date", datetime.datetime.utcnow())
            self.set_header("Expires", datetime.datetime.utcnow() +
                datetime.timedelta(seconds=3600))
            self.set_header("Cache-Control", "public, max-age=" +
                str(3600))
            self.set_header("Content-Type",
                "image/" + ("jpeg" if format == "jpg" else format))
            # Use PIL to convert image to the desired output format, if it's
            # not PNG
            if format == "png":
                with open(output_path, "rb") as f:
                    self.write(f.read())
            else:
                img = Image.open(output_path, "r")
                buf = cStringIO.StringIO()
                if format == "jpg":
                    try:
                        quality = int(data["q"])
                    except Exception:
                        quality = 70
                    img = img.convert("RGB")
                    img.save(buf, "jpeg", quality=quality)
                elif format == "gif":
                    # Convert to GIF while maintaining transparency
                    img.load()
                    alpha = img.split()[3]
                    img = img.convert("RGB").convert("P",
                        palette=Image.ADAPTIVE, colors=255)
                    # Set all pixel values below 128 to 255, and the rest to 0
                    mask = Image.eval(alpha, lambda a: 255 if a <=128 else 0)
                    img.paste(255, mask)
                    # The transparency index is 255
                    img.save(buf, "png", transparency=255)

                self.write(buf.getvalue())

            self.finish()

            # Delete upto 2 files older than 60 seconds
            delete_files(os.path.dirname(output_path), 2, 60)
        elif format in ("html", "json"):
            # Retrieve the rendr file
            rendr = yield gen.Task(self.db.read_rendr, library_id,
                rendr_id)
            if not rendr or "error" in rendr:
                raise tornado.web.HTTPError(404)

            # Render the rendr
            if format == "json":
                self.set_header("Content-Type", "application/json")
                self.write(rendr)
            elif format == "html":
                self.set_header("Content-Type", "text/html")
                self.write(pystache.render("""
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <style>{{{css}}}</style>
                            <script>
                                window.query = {{{data}}};
                                window.decodeBase64UrlSafe = function (s) {
                                    s = s.replace(/-/g, '+').replace(/_/g, '/');
                                    return decodeURIComponent(escape(atob(s)));
                                };
                            </script>
                        </head>
                        <body style="margin:0;padding:0;overflow:hidden">
                            {{{html}}}
                        </body>
                    </html>
                """, {
                    "css": pystache.render(rendr["css"], data),
                    "html": pystache.render(rendr["body"], data),
                    "data": json.dumps(data),
                }))

            self.finish()
        else:
            raise tornado.web.HTTPError(400)


class UI(tornado.web.RequestHandler):
    _cache_time = 1800  # 30 minutes

    def initialize(self, environment=None):
        self.environment = environment

    # Stupid override to stop Tornado removing whitespace from the template
    def create_template_loader(self, template_path):
        if "template_loader" in self.application.settings:
            return self.application.settings["template_loader"]

        opts = {}
        if "autoescape" in self.application.settings:
            opts["autoescape"] = self.application.settings["autoescape"]

        class Loader(tornado.template.Loader):
            def _create_template(self, name):
                with open(os.path.join(self.root, name), "rb") as f:
                    template = tornado.template.Template(f.read(), name=name,
                        loader=self, compress_whitespace=False)
                return template

        return Loader(template_path, **opts)

    def get(self, rendr_id=None):
        if self.request.headers.get("x-forwarded-proto") == "http":
            self.redirect("https://%s/" % self.request.host)
        else:
            self.set_header("Date", datetime.datetime.utcnow())
            self.set_header("Vary", "Accept-Encoding")
            self.set_header("Expires", datetime.datetime.utcnow() +
                datetime.timedelta(seconds=UI._cache_time))
            self.set_header("Cache-Control", "public, max-age=" +
                str(UI._cache_time))
            self.render("manage.html", environment=self.environment)


class StaticBuild(tornado.web.RequestHandler):
    _bundles = {}
    _cache_time = 86400*365*10  # 10 years

    @classmethod
    def build(cls, basepath, bundle_key, ext):
        bundle = {}

        # Iterate over files in bundle; determine last modified time and
        # assemble content
        last_mtime = 0
        contents = ""
        for path in ASSET_MANIFEST[bundle_key]:
            path = os.path.join(os.path.abspath(basepath),
                path[len('/static/'):])
            last_mtime = max(last_mtime, os.stat(path)[stat.ST_MTIME])
            contents += open(path, "rb").read() + "\n"

        if ext == "js":
            bundle["contents"] = slimit.minify(contents, mangle=True,
                mangle_toplevel=True)
        elif ext == "css":
            bundle["contents"] = cssmin.cssmin(contents)
        else:
            assert False

        bundle["sha1"] = hashlib.sha1(bundle["contents"]).hexdigest()
        bundle["last_modified"] = datetime.datetime.fromtimestamp(last_mtime)
        bundle["mime_type"] = "text/javascript" if ext == "js" else "text/css"

        StaticBuild._bundles[bundle_key] = bundle

    def head(self, resource, bundle):
        self.get(resource, bundle, include_body=False)

    def get(self, resource, bundle, include_body=True):
        key, _, ext = bundle.partition(".")
        if key not in ASSET_MANIFEST or ext not in ("css", "js"):
            raise tornado.web.HTTPError(404)

        if key not in StaticBuild._bundles:
            StaticBuild.build(self.require_setting("static_path"), key, ext)

        bundle = StaticBuild._bundles[key]

        ims_value = self.request.headers.get("If-Modified-Since")
        if ims_value is not None:
            if_since = datetime.datetime.fromtimestamp(
                time.mktime(email.utils.parsedate(ims_value)))
            if if_since >= bundle["last_modified"]:
                self.set_status(304)
                return

        self.set_header("Etag", '"%s"' % bundle["sha1"])
        self.set_header("Date", datetime.datetime.utcnow())
        self.set_header("Last-Modified", bundle["last_modified"])
        self.set_header("Content-Type", bundle["mime_type"])
        self.set_header("Expires", datetime.datetime.utcnow() +
            datetime.timedelta(seconds=StaticBuild._cache_time))
        self.set_header("Cache-Control", "public, max-age=" +
            str(StaticBuild._cache_time))
        self.set_header("Vary", "Accept-Encoding")

        if include_body:
            self.write(bundle["contents"])
        else:
            assert self.request.method == "HEAD"
            self.set_header("Content-Length", len(bundle["contents"]))


# Custom static file handler because CloudFront requires a Date header to do
# any caching based on Expires or Cache-Contro: max-age. Also include a Vary
# header because it makes PageSpeed happy.

class StaticFile(tornado.web.StaticFileHandler):
    def set_extra_headers(self, path):
        self.set_header("Date", datetime.datetime.utcnow())
        self.set_header("Vary", "Accept-Encoding")
        self.set_header("Cache-Control", "public, max-age=" +
            str(StaticBuild._cache_time))


class CollectdLoggingApplication(tornado.web.Application):
    """
    Overrides `log_request` to push request information (timing, handler, etc.)
    to a specified collectd instance.
    """

    def __init__(self, handlers=None, default_hosts="", transforms=None,
            wsgi=False, **settings):
        super(CollectdLoggingApplication, self).__init__(
                handlers, default_hosts, transforms, wsgi, **settings
        )

        self._collectd_loggers = {}
        if settings.get("collectd_server"):
            self._collectd_name = settings.get("collectd_name", "tornado")
            self.send_interval = settings.get("send_interval",
                pycollectd.DEFAULT_SEND_INTERVAL)
            collectd_server = settings['collectd_server']
            if ':' in collectd_server:
                hostname, port = collectd_server.split(':')
                self._connect_collectd(hostname, port)
            else:
                self._connect_collectd(collectd_server)

    def _connect_collectd(self, hostname, port=25826):
        for logger_name in [
                "rendrit_request",
                "rendrit_processing_time",
                "rendrit_error_rate"
            ]:
            collectd_logger = pycollectd.CollectdClient(
                    hostname,
                    collectd_port=port,
                    plugin_name=logger_name,
                    send_interval=self.send_interval
            )
            collectd_logger.start()
            self._collectd_loggers[logger_name] = collectd_logger

    def log_request(self, handler):
        super(CollectdLoggingApplication, self).log_request(handler)
        if self._collectd_loggers:
            handler_name = handler.__class__.__name__
            response_code = handler.get_status()
            request_time = handler.request.request_time()

            for metric in ['total', handler_name]:
                self._collectd_loggers['rendrit_request'].queue(
                    metric, 1,
                    lambda values: sum(values) / float(self.send_interval)
                )
                self._collectd_loggers['rendrit_error_rate'].queue(
                    "%s_%s" % (metric, response_code), 1,
                    lambda values: sum(values) / float(self.send_interval)
                )
                self._collectd_loggers['rendrit_processing_time'].queue(
                    metric, request_time,
                    pycollectd.CollectdClient.average
                )
