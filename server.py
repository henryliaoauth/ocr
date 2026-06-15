#!/usr/bin/env python3
"""
Local dev server: serves static files + proxies /api/ocr to the OCR workflow.
Mirrors the Vercel function (api/ocr.js): async execution — submit with
`X-Execution-Mode: async`, then let the browser poll the returned statusUrl via
GET /api/ocr?status=... until the background run completes. This is the only mode
that escapes the platform's 30s synchronous-execution cap.
"""

import http.server
import urllib.request
import urllib.error
import urllib.parse
import json
import sys
import os

API_ORIGIN = "https://platform-api-933489661561.asia-east1.run.app"
EXEC_PATH = "/api/v1/execute/-u2H7HRyN"
API_KEY = "pk_qjS9dIU5_3ayWVzapFnrUw80WwyO7Qotjt43owEUk"
ACCESS_TOKEN = "ocr-x7k9q2pnmw5r3a8b"

REQUEST_TIMEOUT = 30  # per HTTP call to the platform


# Only allow polling the platform's status routes (prevents using the proxy +
# API key as an open SSRF proxy to arbitrary upstream paths).
def is_valid_status_path(p):
    return (
        isinstance(p, str)
        and p.startswith("/api/v1/execute/status/")
        and ".." not in p
        and "://" not in p
    )


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        # Dev server: never cache static assets so script.js/style.css edits show
        # up on a plain reload instead of serving a stale copy.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/ocr":
            if self.headers.get("X-Access-Token") != ACCESS_TOKEN:
                self.send_error(404)
                return
            self._poll(urllib.parse.parse_qs(parsed.query))
            return
        # Everything else: static file serving.
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/ocr":
            if self.headers.get("X-Access-Token") != ACCESS_TOKEN:
                self.send_error(404)
                return
            self._submit()
        else:
            self.send_error(404)

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key, X-Access-Token")

    # ----- Poll: GET /api/ocr?status=<statusPath> -----
    def _poll(self, query):
        status_path = (query.get("status") or [None])[0]
        if not is_valid_status_path(status_path):
            self._json(400, {"error": "invalid_status_path", "message": "bad or missing status path"})
            return
        req = urllib.request.Request(
            API_ORIGIN + status_path,
            headers={"X-API-Key": API_KEY},
            method="GET",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT)
            raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "poll_failed", "message": f"HTTP {e.code}: {e.read()[:200]!r}"})
            return
        except Exception as e:
            self._json(502, {"error": "poll_failed", "message": str(e)})
            return
        try:
            data = json.loads(raw).get("data")
        except Exception:
            data = None
        if not data:
            self._json(502, {"error": "poll_unparsable", "message": raw[:300]})
            return
        self._json(200, data)

    # ----- Submit: POST /api/ocr { images, category } -> { statusPath } -----
    def _submit(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
        except Exception:
            self._json(400, {"error": "invalid_body", "message": "invalid JSON body"})
            return

        # Accept either `images` (array, new multi-image flow) or a single `image`.
        images = data.get("images")
        if isinstance(images, list):
            images = [i for i in images if i]
        elif data.get("image"):
            images = [data.get("image")]
        else:
            images = []
        if not images:
            self._json(400, {"error": "missing_images", "message": "missing images"})
            return

        payload = json.dumps({
            "input": {
                "images": images,
                "category": data.get("category") or "salaried",
            }
        }).encode()

        req = urllib.request.Request(
            API_ORIGIN + EXEC_PATH,
            data=payload,
            headers={
                "X-API-Key": API_KEY,
                "X-Execution-Mode": "async",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT)
            raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "submit_failed", "message": f"HTTP {e.code}: {e.read()[:200]!r}"})
            return
        except Exception as e:
            self._json(502, {"error": "submit_failed", "message": str(e)})
            return

        try:
            status_url = json.loads(raw).get("data", {}).get("statusUrl")
        except Exception:
            status_url = None
        if not status_url:
            self._json(502, {"error": "no_status_url", "message": raw[:300]})
            return

        self._json(200, {"statusPath": status_url})

    def _json(self, code, obj):
        self.send_response(code)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"Server running at http://localhost:{port}")
    server.serve_forever()
