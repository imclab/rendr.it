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
import re
import sys
import json
import hmac
import uuid
import base64
import urllib
import hashlib
import tempfile
import urlparse
import itertools
import subprocess
import email.utils
import tornado.web
import tornado.ioloop
import tornado.template
import tornado.httpclient
from tornado import gen
from xml.dom import minidom
from passlib.apps import custom_app_context as pwd_context


SIG_HEADERS = ("content-type", "content-md5", "date")
SIG_HEADER_PREFIX = "x-amz-"
SIG_REQUEST_PARAMS = ("acl", "logging", "torrent", "versionid", "versioning")


def sign_request(uri, secret_key, method, headers, expires=None):
    path = urlparse.urlunsplit(("", "") + urlparse.urlsplit(uri)[2:])
    canonical_headers = canonicalize_headers(method, path, headers, expires)
    digest = hmac.new(secret_key, canonical_headers, hashlib.sha1).digest()
    return base64.encodestring(digest).strip()


def canonicalize_headers(method, path, headers, expires=None):
    canonical = dict((h, "\n") for h in SIG_HEADERS)

    for header, value in headers.iteritems():
        header = header.lower()
        value = str(value).strip()

        if header in SIG_HEADERS:
            canonical[header] = value + "\n"
        elif header.startswith(SIG_HEADER_PREFIX):
            canonical[header] = "%s:%s\n" % (header, value)
        elif header == "host":
            # http://docs.amazonwebservices.com/AmazonS3/latest/dev/index.html?VirtualHosting.html
            re_endpoint = re.compile(r"\.?s3[^.]*\.amazonaws\.com$")
            if re_endpoint.search(value):
                bucket = re_endpoint.sub("", value, 1)
            else:
                # Remove non-host part
                bucket = re.sub(r"[^.\-0-9A-Za-z].*$", "", value, 1)

            if bucket:
                path = "/" + bucket.lower() + path

    if expires is not None:
        canonical["date"] = str(expires)
    elif "x-amz-date" in canonical:
        canonical["date"] = ""

    url = urlparse.urlsplit(path)
    params = "&".join(
        q for q in url.query.split("&") if q in SIG_REQUEST_PARAMS)

    return "".join(itertools.chain([method.upper(), "\n"],
        [canonical[h] for h in sorted(canonical)],
        [url.path, "?" + params if params else ""]))


class S3DB(object):
    "Asynchronous S3 client"
    def __init__(self, key_id=None, key=None, bucket=None, io_loop=None):
        self.key_id = key_id
        self.key = key
        self.bucket = bucket
        self.io_loop = io_loop or tornado.ioloop.IOLoop.instance()

    def _get_file(self, filename, query="", callback=None):
        uri = "https://s3.amazonaws.com/%s/%s%s" % (
            urllib.quote(self.bucket), urllib.quote(filename), query)
        headers = {
            "Date": email.utils.formatdate(None, False, True),
            "Content-Type": "",
        }
        signed = sign_request(uri, self.key, "GET", headers)
        headers["Authorization"] = "AWS %s:%s" % (self.key_id, signed)
        request = tornado.httpclient.HTTPRequest(uri, method="GET",
            headers=headers, validate_cert=False)
        http_client = tornado.httpclient.AsyncHTTPClient(self.io_loop)
        http_client.fetch(request, callback=callback)

    def _put_file(self, filename, content, callback=None):
        uri = "https://s3.amazonaws.com/%s/%s" % (
            urllib.quote(self.bucket), urllib.quote(filename))
        headers = {
            "Date": email.utils.formatdate(None, False, True),
            "Content-Type": "text/plain",
            "Content-MD5": base64.b64encode(hashlib.md5(content).digest())
        }
        signed = sign_request(uri, self.key, "PUT", headers)
        headers["Authorization"] = "AWS %s:%s" % (self.key_id, signed)
        request = tornado.httpclient.HTTPRequest(uri, method="PUT",
            headers=headers, body=content, validate_cert=False)
        http_client = tornado.httpclient.AsyncHTTPClient(self.io_loop)
        http_client.fetch(request, callback=callback)

    @gen.engine
    def read_library(self, library_id, callback=None):
        response = yield gen.Task(self._get_file,
            library_id + "/dist.json")
        if response.code != 200:
            callback({"error": response.code})
        else:
            callback(json.loads(response.body))

    @gen.engine
    def create_library(self, name, callback=None):
        library_id = base64.b32encode(
            uuid.uuid4().bytes[0:8]).strip("=").lower()
        library_key = base64.urlsafe_b64encode(hashlib.sha512(
            uuid.uuid4().bytes + uuid.uuid4().bytes).digest())[:-2]
        library_data = {
            "libraryId": library_id,
            "name": name,
            "keyHash":pwd_context.encrypt(library_key)
        }

        # Check to make sure the library ID is not currently in use
        response = yield gen.Task(self._get_file, library_id + "/dist.json")
        if response.code == 200:
            callback({"error": 500})

        # All clear, create the new library
        response = yield gen.Task(self._put_file,
            library_id + "/dist.json", json.dumps(library_data))
        if response.code != 200:
            callback({"error": response.code})
        else:
            # Return the unencrypted key the first time
            library_data["key"] = library_key
            callback(library_data)

    @gen.engine
    def list_rendrs(self, library_id, callback=None):
        response = yield gen.Task(self._get_file, "",
            query="?prefix=" + urllib.quote(library_id) + "/rendrs/")
        if response.code != 200:
            callback({"error": response.code})
        else:
            rendrs = []
            pre_len = len(library_id + "/rendrs/")
            post_len = len(".json")
            dom = minidom.parseString(response.body)
            for key in dom.getElementsByTagName("Key"):
                fname = key.childNodes[0].nodeValue[pre_len:-post_len]
                if fname:
                    rendrs.append(fname)
            callback(rendrs)

    @gen.engine
    def read_rendr(self, library_id, rendr_id, callback=None):
        "Returns a rendr object with the given ID."
        response = yield gen.Task(self._get_file,
            library_id + "/rendrs/" + rendr_id + ".json")
        if response.code != 200:
            callback({"error": response.code})
        else:
            callback(json.loads(response.body))

    @gen.engine
    def write_rendr(self, library_id, rendr_id, rendr, callback=None):
        "Writes the rendr to the database."
        response = yield gen.Task(self._put_file,
            library_id + "/rendrs/" + rendr_id + ".json",
            json.dumps(rendr))
        if response.code != 200:
            callback({"error": response.code})
        else:
            callback(rendr)
