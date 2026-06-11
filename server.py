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

# /stream avoids the platform's 30s sync timeout (SYSTEM_TIMEOUT) for long OCR jobs.
# (/async is not deployed on this platform — returns 404.)
API_URL = "https://platform-api-933489661561.asia-east1.run.app/api/v1/execute/manual-switch-vJtCm3RN/stream"
API_KEY = "pk_tGg7VSAg_XhLgZIXTzH3VHAez1fL2wF2R5bt6sgox"
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
            self._proxy_ocr()
        else:
            self.send_error(404)

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key, X-Access-Token")

    def _proxy_ocr(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        # Frontend sends JSON { image: <data URL>, category }.
        try:
            data = json.loads(body)
        except Exception:
            self.send_response(400)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"invalid JSON body"}')
            return

        image = data.get("image")
        if not image:
            self.send_response(400)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"missing image"}')
            return

        payload = json.dumps({
            "input": {
                "image": image,
                "category": data.get("category") or "income",
            }
        }).encode()

        req = urllib.request.Request(
            API_URL,
            data=payload,
            headers={
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req) as resp:
                resp_body = resp.read()
                self.send_response(resp.status)
                self._cors_headers()
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.end_headers()
                self.wfile.write(resp_body)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.HTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"Server running at http://localhost:{port}")
    server.serve_forever()
