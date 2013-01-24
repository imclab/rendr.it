from setuptools import setup

setup(
    name='rendr.it',
    version='1.0dev1',
    packages=['rendr', 'rendr.test'],
    scripts=['bin/server'],
    package_data={'rendr': ['script/rasterize', 'template/*.html',
        'static/css/*.css', 'static/font/*', 'static/img/*',
        'static/js/ace/*.js', 'static/js/*.js', 'static/robots.txt',
        'static/favicon.ico']},
    install_requires=['tornado>=2.1', 'pystache', 'slimit==dev', 'cssmin',
        "passlib", "pil>=1.1.7"],
    dependency_links=['git+https://github.com/rspivak/slimit.git#egg=slimit-dev'],

    # meta
    author='TaguchiMarketing Pty Ltd',
    author_email='support@taguchimail.com',
    url='https://github.com/taguchimail/rendr.it',
    license='LICENSE',
    description='HTML/CSS to image converter',
    long_description=open('README.md').read(),
)
