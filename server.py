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
import time

# Async execution: submit with `X-Execution-Mode: async`, then poll the returned
# statusUrl. This runs the workflow in the background and is the only mode that
# avoids the platform's 30s synchronous-execution timeout (sync and /stream both
# cap at 30s).
API_ORIGIN = "https://platform-api-933489661561.asia-east1.run.app"
EXEC_PATH = "/api/v1/execute/manual-switch-vJtCm3RN"
API_KEY = "pk_dYA1rGzN_tXFx15j7OG6Sg94wTSq0JMtp9VwRq_q6"
ACCESS_TOKEN = "ocr-x7k9q2pnmw5r3a8b"

POLL_INTERVAL_S = 2
MAX_POLL_S = 280


class _ProxyError(Exception):
    def __init__(self, code, error, message):
        super().__init__(message)
        self.code = code
        self.error = error
        self.message = message


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

        try:
            output = self._run_async(payload)
        except _ProxyError as e:
            self._json(e.code, {"error": e.error, "message": e.message})
            return
        self._json(200, output)

    def _run_async(self, payload):
        # 1) Submit (async).
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
            raise _ProxyError(502, "submit_failed", f"HTTP {e.code}: {e.read()[:200]!r}")
        except Exception as e:
            raise _ProxyError(502, "submit_failed", str(e))

        status_url = (submit.get("data") or {}).get("statusUrl")
        if not status_url:
            raise _ProxyError(502, "no_status_url", json.dumps(submit)[:300])

        # 2) Poll until finished.
        deadline = time.time() + MAX_POLL_S
        while time.time() < deadline:
            try:
                preq = urllib.request.Request(API_ORIGIN + status_url, headers={"X-API-Key": API_KEY})
                with urllib.request.urlopen(preq, timeout=30) as r:
                    data = json.loads(r.read()).get("data") or {}
            except Exception:
                time.sleep(POLL_INTERVAL_S)
                continue

            status = data.get("status")
            if status == "completed":
                return data.get("output", data)
            if status in ("failed", "cancelled"):
                err = data.get("error")
                raise _ProxyError(502, "workflow_" + status, err if isinstance(err, str) else json.dumps(err))
            time.sleep(POLL_INTERVAL_S)

        raise _ProxyError(504, "poll_timeout", f"背景執行超過 {MAX_POLL_S} 秒仍未完成")

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
