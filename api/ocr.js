import https from 'node:https';

const API_URL = 'https://platform-api-prod-933489661561.asia-east1.run.app/api/v1/execute/ocr-demo-bKVEbB2J';
const API_KEY = 'pk_aR6Jw0go_5UBw27kh_g8PkWyWtJ6XfAgfixB12VNW';
const ACCESS_TOKEN = 'ocr-x7k9q2pnmw5r3a8b';
const MAX_ATTEMPTS = 3;
const UPSTREAM_TIMEOUT_MS = 270_000;

export const config = {
  api: { bodyParser: false },
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function callUpstream(body, contentType) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL);
    const upstream = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': contentType,
          'Content-Length': body.length,
        },
        timeout: UPSTREAM_TIMEOUT_MS,
      },
      (resp) => {
        const chunks = [];
        resp.on('data', (c) => chunks.push(c));
        resp.on('end', () =>
          resolve({
            status: resp.statusCode,
            contentType: resp.headers['content-type'] || 'text/plain',
            body: Buffer.concat(chunks),
          })
        );
        resp.on('error', reject);
      }
    );
    upstream.on('error', reject);
    upstream.on('timeout', () => upstream.destroy(new Error('upstream_timeout')));
    upstream.write(body);
    upstream.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (req.headers['x-access-token'] !== ACCESS_TOKEN) {
    return res.status(404).json({ error: 'Not found' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'read_body_failed', detail: e.message });
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callUpstream(body, req.headers['content-type']);
      res.status(result.status);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('X-Upstream-Attempt', String(attempt));
      return res.end(result.body);
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  res.status(502).json({
    error: 'upstream_unreachable',
    detail: lastErr?.message || 'unknown',
    attempts: MAX_ATTEMPTS,
  });
}
