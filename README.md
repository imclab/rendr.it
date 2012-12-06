rendr.it
========

`rendr` generates an image (JPG, PNG or GIF) from an HTML5+CSS3 snippet using
PhantomJS. It's designed for email templates, and other situations where
visual effects easily created in a modern browser are only attainable using
images.

Query-string parameters are passed through to the HTML5 snippet via keys in
the `window.params` object, so the images can be customized/personalized.

`rendr` uses a very simple distribution-based authentication system; when you
first create a distribution, you're given its ID and a secret key. Every time
you create a new rendr, pass the distribution ID and secret key in.

Distribution IDs always appear in `rendr.it` URLs, so it's easy to set up a
CDN to proxy your images, while excluding everyone else's.


Dependencies
------------

To run `rendr`, you need the PhantomJS binary, and compiling it takes a very
very long time. A compiled version for CentOS 32-bit is available in `bin`.
If you want to run `rendr` on a different architecture, you need to build
PhantomJS yourself. Obtain the source code from the links at
http://phantomjs.org and run:
```
sudo yum install gcc gcc-c++ make git openssl-devel freetype-devel fontconfig-devel
./build.sh --jobs 1
```
After that, move the compiled PhantomJS binary to `/usr/bin/phantomjs`, or
pass the path to the `server` script via the `--phantomjs` option.

For more information about building PhantomJS, visit
http://phantomjs.org/build.html.


Development
-----------

    virtualenv rendr.it
    source rendr.it/bin/activate
    mkdir rendr.it/src
    git clone git@github.com:taguchimail/rendr.it.git rendr.it/src/rendr.it
    cd rendr.it/src/rendr.it
    python setup.py develop


Running
-------

    AWS_ACCESS_KEY_ID="..." AWS_SECRET_ACCESS_KEY="..." python bin/server --port 8080 --debug your.bucket.name


Testing
-------

    AWS_ACCESS_KEY_ID="..." AWS_SECRET_ACCESS_KEY="..." python -m tornado.testing rendr.test.asyncs3


Licence
-------

MIT
