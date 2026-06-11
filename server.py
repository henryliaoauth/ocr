#!/usr/bin/env python3
"""
Local dev server: serves static files + proxies /api/ocr to the OCR workflow.
Mirrors the Vercel function (api/ocr.js): POSTs to the platform's /stream
endpoint and pipes the Server-Sent Events straight back to the browser.
"""

import http.server
import urllib.request
import urllib.error
import json
import sys
import os

# Streaming execution: POST to the platform's /stream endpoint and pipe the SSE
# response straight back to the client so it can render progress / results live.
# NOTE: the platform caps /stream (and sync) at 30s — longer runs get cut off
# upstream. The async submit+poll mode avoids that cap but shows no partial output.
API_ORIGIN = "https://platform-api-933489661561.asia-east1.run.app"
STREAM_PATH = "/api/v1/execute/manual-switch-vJtCm3RN/stream"
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
            self._stream_ocr()
        else:
            self.send_error(404)

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key, X-Access-Token")

    # Open the upstream SSE stream and pipe it through to the client unbuffered.
    def _stream_ocr(self):
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
            API_ORIGIN + STREAM_PATH,
            data=payload,
            headers={
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=295)
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "stream_failed", "message": f"HTTP {e.code}: {e.read()[:200]!r}"})
            return
        except Exception as e:
            self._json(502, {"error": "stream_failed", "message": str(e)})
            return

        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", resp.headers.get("Content-Type") or "text/event-stream; charset=utf-8")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        try:
            while True:
                chunk = resp.read(512)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception:
            # Client disconnected or upstream dropped — just stop.
            pass
        finally:
            resp.close()

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
