#!/usr/bin/env python3
"""
Local dev server: serves static files + proxies /api/ocr to the OCR workflow
(synchronous JSON; same endpoint as the Vercel function).
"""

import http.server
import urllib.request
import urllib.error
import json
import sys
import os

# Async execution: submit with `X-Execution-Mode: async`, then poll the returned
# statusUrl. This runs the workflow in the background and is the only mode that
# avoids the platform's 30s synchronous-execution timeout (sync and /stream both
# cap at 30s). The client drives the poll loop; the proxy just submits once and
# forwards one status check per request.
API_ORIGIN = "https://platform-api-933489661561.asia-east1.run.app"
EXEC_PATH = "/api/v1/execute/manual-switch-vJtCm3RN"
API_KEY = "pk_dYA1rGzN_tXFx15j7OG6Sg94wTSq0JMtp9VwRq_q6"
ACCESS_TOKEN = "ocr-x7k9q2pnmw5r3a8b"


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

    def do_POST(self):
        if self.path == "/api/ocr":
            if self.headers.get("X-Access-Token") != ACCESS_TOKEN:
                self.send_error(404)
                return
            self._submit_ocr()
        else:
            self.send_error(404)

    def do_GET(self):
        # Poll endpoint: /api/ocr?status=<statusPath>. Everything else = static.
        if self.path.split("?", 1)[0] == "/api/ocr":
            if self.headers.get("X-Access-Token") != ACCESS_TOKEN:
                self.send_error(404)
                return
            self._poll_ocr()
            return
        super().do_GET()

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key, X-Access-Token")

    # Submit the workflow async, return { statusPath } for the client to poll.
    def _submit_ocr(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
        except Exception:
            self._json(400, {"error": "invalid_body", "message": "invalid JSON body"})
            return

        image = data.get("image")
        if not image:
            self._json(400, {"error": "missing_image", "message": "missing image"})
            return

        payload = json.dumps({
            "input": {
                "image": image,
                "category": data.get("category") or "income",
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
            with urllib.request.urlopen(req, timeout=30) as resp:
                submit = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "submit_failed", "message": f"HTTP {e.code}: {e.read()[:200]!r}"})
            return
        except Exception as e:
            self._json(502, {"error": "submit_failed", "message": str(e)})
            return

        status_url = (submit.get("data") or {}).get("statusUrl")
        if not status_url:
            self._json(502, {"error": "no_status_url", "message": json.dumps(submit)[:300]})
            return
        self._json(200, {"statusPath": status_url})

    # Forward one poll for the run status.
    def _poll_ocr(self):
        from urllib.parse import urlparse, parse_qs, unquote
        qs = parse_qs(urlparse(self.path).query)
        status_path = unquote((qs.get("status") or [""])[0])
        if not (status_path.startswith("/api/v1/execute/status/")
                and ".." not in status_path and "://" not in status_path):
            self._json(400, {"error": "invalid_status_path", "message": "bad or missing status path"})
            return
        try:
            preq = urllib.request.Request(API_ORIGIN + status_path, headers={"X-API-Key": API_KEY})
            with urllib.request.urlopen(preq, timeout=30) as r:
                data = json.loads(r.read()).get("data") or {}
        except Exception as e:
            self._json(502, {"error": "poll_failed", "message": str(e)})
            return
        self._json(200, data)

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
    server = http.server.HTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"Server running at http://localhost:{port}")
    server.serve_forever()
