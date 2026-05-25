#!/usr/bin/env python3
"""
Local dev server: serves static files + proxies /api/* to the OCR API.
"""

import http.server
import urllib.request
import urllib.error
import sys
import os

API_URL = "https://platform-api-prod-933489661561.asia-east1.run.app/api/v1/execute/ocr-demo-bKVEbB2J"
API_KEY = "pk_aR6Jw0go_5UBw27kh_g8PkWyWtJ6XfAgfixB12VNW"
ACCESS_TOKEN = "ocr-x7k9q2pnmw5r3a8b"

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404)
        return None

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
        content_type = self.headers.get("Content-Type", "")

        req = urllib.request.Request(
            API_URL,
            data=body,
            headers={
                "X-API-Key": API_KEY,
                "Content-Type": content_type,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self._cors_headers()
                self.send_header("Content-Type", resp.headers.get("Content-Type", "text/plain"))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self._cors_headers()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(str(e).encode())

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.HTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"Server running at http://localhost:{port}")
    server.serve_forever()
