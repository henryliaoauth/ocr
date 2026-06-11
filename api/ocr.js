import https from 'node:https';

// Streaming execution: POST to the platform's /stream endpoint and pipe the
// Server-Sent Events straight back to the browser as they arrive, so the client
// can render progress / results live. NOTE: the platform caps /stream (and sync)
// at 30s — runs longer than that are cut off upstream. The async submit+poll
// mode (git history) avoids that cap but cannot show partial output.
const API_ORIGIN = 'https://platform-api-933489661561.asia-east1.run.app';
const STREAM_PATH = '/api/v1/execute/manual-switch-vJtCm3RN/stream';
const API_KEY = 'pk_dYA1rGzN_tXFx15j7OG6Sg94wTSq0JMtp9VwRq_q6';
const ACCESS_TOKEN = 'ocr-x7k9q2pnmw5r3a8b';

const REQUEST_TIMEOUT_MS = 295_000; // generous; platform cuts /stream at 30s anyway

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-access-token'] !== ACCESS_TOKEN) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ----- Parse the request body { image, category } -----
  let payload;
  try {
    const rawBody = await readBody(req);
    const parsed = JSON.parse(rawBody.toString('utf8'));
    if (!parsed.image) throw new Error('missing image');
    payload = Buffer.from(
      JSON.stringify({ input: { image: parsed.image, category: parsed.category || 'income' } })
    );
  } catch (e) {
    return res.status(400).json({ error: 'invalid_body', message: e.message });
  }

  // ----- Open the upstream SSE stream and pipe it through -----
  const url = new URL(API_ORIGIN + STREAM_PATH);
  const upstream = https.request(
    {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Content-Length': payload.length,
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
    (up) => {
      res.statusCode = up.statusCode || 502;
      res.setHeader('Content-Type', up.headers['content-type'] || 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no'); // disable any proxy buffering
      up.on('data', (c) => res.write(c));
      up.on('end', () => res.end());
      up.on('error', () => res.end());
    }
  );

  upstream.on('error', (e) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'stream_failed', message: e.message });
    } else {
      res.end();
    }
  });
  upstream.on('timeout', () => upstream.destroy(new Error('upstream_timeout')));

  // If the client goes away, tear down the upstream request.
  req.on('close', () => upstream.destroy());

  upstream.write(payload);
  upstream.end();
}
