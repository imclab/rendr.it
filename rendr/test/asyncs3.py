import os
import tornado.testing
from rendr import asyncs3
from xml.dom import minidom

class S3DBTestCase(tornado.testing.AsyncTestCase):
    def setUp(self):
        super(S3DBTestCase, self).setUp()
        self.s3db_client = asyncs3.S3DB(key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            key=os.getenv('AWS_SECRET_ACCESS_KEY'), bucket='it.rendr.test',
            io_loop=self.io_loop)

    def test_file_roundtrip(self):
        # Save a test file to S3
        self.s3db_client._put_file('testing/dist.json', '{"valid": true}',
            callback=self.stop)
        response = self.wait()
        # Check that this completes successfully
        self.assertEqual(200, response.code)
        self.assertEqual('', response.body)

        # Read the test file back
        self.s3db_client._get_file('testing/dist.json', callback=self.stop)
        response = self.wait()
        # Check file contents
        self.assertEqual(200, response.code)
        self.assertEqual('{"valid": true}', response.body)

    def test_bucket_list(self):
        # Save a test file to S3
        self.s3db_client._put_file('testing/dist.json', '{"valid": true}',
            self.stop)
        response = self.wait()
        # Check that this completes successfully
        self.assertEqual(200, response.code)
        self.assertEqual('', response.body)

        # Retrieve the list
        self.s3db_client._get_file('', query='?prefix=testing/',
            callback=self.stop)
        response = self.wait()
        # Check the result
        dom = minidom.parseString(response.body)
        self.assertEqual(200, response.code)
        self.assertEqual('testing/dist.json',
            dom.getElementsByTagName('Key')[0].childNodes[0].nodeValue)

    def test_library(self):
        # Test creation of a new library
        self.s3db_client.create_library("test", self.stop)
        library1 = self.wait()
        self.assertEqual("test", library1["name"])

        # Test reading that library
        self.s3db_client.read_library(library1["libraryId"], self.stop)
        library2 = self.wait()
        self.assertEqual("test", library2["name"])

        # Ensure values are the same
        self.assertEqual(str(library1["libraryId"]),
            str(library2["libraryId"]))
        self.assertEqual(str(library1["key"]), str(library2["key"]))

    def test_rendr(self):
        # Create a new library for the rendrs
        self.s3db_client.create_library("test2", self.stop)
        library1 = self.wait()

        # Create a new rendr
        rendr1 = {
            "libraryId": library1["libraryId"],
            "rendrId": "rendr1",
            "css": "/* Some CSS content */",
            "body": "<div>Some HTML</div>"
        }
        self.s3db_client.write_rendr(rendr1["libraryId"],
            rendr1["rendrId"], rendr1, self.stop)
        result = self.wait()
        self.assertEqual("rendr1", result["rendrId"])

        # Create another
        rendr2 = {
            "libraryId": library1["libraryId"],
            "rendrId": "rendr2",
            "css": "/* Some CSS content */",
            "body": "<div>Some HTML</div>"
        }
        self.s3db_client.write_rendr(rendr2["libraryId"],
            rendr2["rendrId"], rendr2, self.stop)
        result = self.wait()
        self.assertEqual("rendr2", result["rendrId"])

        # Make sure both rendrs can be read
        self.s3db_client.read_rendr(rendr1["libraryId"],
            rendr1["rendrId"], self.stop)
        result = self.wait()
        self.assertEqual(rendr1["rendrId"], result["rendrId"])

        self.s3db_client.read_rendr(rendr2["libraryId"],
            rendr2["rendrId"], self.stop)
        result = self.wait()
        self.assertEqual(rendr2["rendrId"], result["rendrId"])

        # Make sure listing works
        self.s3db_client.list_rendrs(library1["libraryId"], self.stop)
        result = self.wait()
        self.assertEqual([rendr1["rendrId"], rendr2["rendrId"]], result)

    def tearDown(self):
        # TODO: delete everything in the it.rendr.test bucket
        super(S3DBTestCase, self).tearDown()
