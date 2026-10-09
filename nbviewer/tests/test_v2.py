import json
import re

import requests

from .base import NBViewerTestCase


class V2TestCase(NBViewerTestCase):
    def test_shell(self):
        # an unresolvable host: the server must not try to fetch it
        r = requests.get(self.url("/v2/url/example.invalid/dir/My%20Notebook.ipynb"))
        r.raise_for_status()
        html = r.text
        self.assertIn('id="nbviewer-v2"', html)
        self.assertIn("/static/v2/nbviewer-v2.js", html)
        self.assertIn('href="/url/example.invalid/dir/My%20Notebook.ipynb"', html)
        config = re.search(
            r'<script id="nbviewer-v2-config" type="application/json">(.*?)</script>',
            html,
        )
        assert config is not None
        self.assertEqual(
            json.loads(config.group(1)),
            {
                "viewerBase": "/v2/",
                "classicBase": "/",
                "binderBaseUrl": "https://mybinder.org/v2",
            },
        )

    def test_csp(self):
        r = requests.get(self.url("/v2/urls/example.invalid/notebook.ipynb"))
        r.raise_for_status()
        csp = r.headers["Content-Security-Policy"]
        self.assertIn("https:", csp)
        self.assertNotIn("connect-src 'none'", csp)
        # v1 pages keep their own policy
        r = requests.get(self.url("/faq"))
        r.raise_for_status()
        self.assertIn("connect-src 'none'", r.headers["Content-Security-Policy"])

    def test_cache_control(self):
        r = requests.get(self.url("/v2/urls/example.invalid/notebook.ipynb"))
        r.raise_for_status()
        self.assertIn("max-age=", r.headers["Cache-Control"])

    def test_landing(self):
        r = requests.get(self.url("/v2"))
        r.raise_for_status()
        self.assertEqual(r.url, self.url("/v2/"))
        self.assertIn('id="nbviewer-v2"', r.text)

    def test_escaping(self):
        r = requests.get(self.url("/v2/urls/example.invalid/%3Cscript%3Ealert(1)"))
        r.raise_for_status()
        self.assertNotIn("<script>alert", r.text)


class V2DisabledTestCase(NBViewerTestCase):
    @classmethod
    def get_server_cmd(cls):
        return super().get_server_cmd() + ["--NBViewer.enable_v2=False"]

    def test_disabled(self):
        r = requests.get(self.url("/v2/urls/example.invalid/notebook.ipynb"))
        self.assertEqual(r.status_code, 404)
