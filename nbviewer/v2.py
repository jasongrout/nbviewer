# -----------------------------------------------------------------------------
#  Copyright (C) Jupyter Development Team
#
#  Distributed under the terms of the BSD License.  The full license is in
#  the file COPYING, distributed as part of this software.
# -----------------------------------------------------------------------------
"""Client-side rendered viewer, served under /v2/

Every /v2/ URL gets the same page shell. The browser fetches and renders the
notebook (see client/), so these handlers never make upstream requests.
"""
from tornado import web

from .providers.base import AddSlashHandler
from .providers.base import BaseHandler
from .utils import url_path_join

V2_BUNDLE = "v2/nbviewer-v2.js"


class V2Handler(BaseHandler):
    """Serve the /v2/ page shell"""

    def set_default_headers(self):
        self.add_header(
            "Content-Security-Policy", self.settings["v2_content_security_policy"]
        )

    def bundle_url(self):
        url = self.static_url(V2_BUNDLE)
        # versioned URLs get long-lived cache headers from the static handler
        version = self.settings["static_handler_class"].get_version(
            self.settings, V2_BUNDLE
        )
        if version:
            url += "?v=" + version
        else:
            self.log.warning(
                "%s not found; build it with `invoke build-client`", V2_BUNDLE
            )
        return url

    @web.authenticated
    def get(self, path):
        classic_base = url_path_join(self.base_url, "/")
        viewer_base = url_path_join(classic_base, "v2/")
        # use the raw path: `path` is already url-decoded
        raw_path = self.request.path[len(viewer_base) :]
        html = self.render_template(
            "v2.html",
            bundle_url=self.bundle_url(),
            classic_url=classic_base + raw_path,
            v2_config={
                "viewerBase": viewer_base,
                "classicBase": classic_base,
                "binderBaseUrl": self.binder_base_url or None,
            },
        )
        # rendering a shell costs nothing upstream, so cache it for the maximum
        self.set_header("Cache-Control", "max-age=%i" % self.cache_expiry_max)
        self.finish(html)


def v2_handlers():
    """Tornado handlers for /v2/"""
    return [
        (r"/v2", AddSlashHandler, {}),
        (r"/v2/(.*)", V2Handler, {}),
    ]
