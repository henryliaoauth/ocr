import https from 'node:https';

// Async execution: submit with `X-Execution-Mode: async`, then poll the returned
// statusUrl until completed. This runs the workflow in the background and is the
// ONLY mode that avoids the platform's 30s synchronous-execution timeout
// (both sync and /stream are capped at 30s). The downside is no partial output —
// the status poll returns output:null until the run is fully completed.
//
// Polling is driven by the BROWSER (GET /api/ocr?status=...), not held open
// inside one long proxy call, so each request stays well under Vercel's
// per-invocation limit.
const API_ORIGIN = 'https://platform-api-933489661561.asia-east1.run.app';
const EXEC_PATH = '/api/v1/execute/-u2H7HRyN';
const API_KEY = 'pk_qjS9dIU5_3ayWVzapFnrUw80WwyO7Qotjt43owEUk';
const ACCESS_TOKEN = 'ocr-x7k9q2pnmw5r3a8b';

const SUBMIT_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;   // per HTTP call to the platform

export const config = {
  api: { bodyParser: false },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Only allow polling the platform's status routes (prevents using the proxy +
// API key as an open SSRF proxy to arbitrary upstream paths). The status path
// looks like /api/v1/execute/status/<workflowId>/<orgId>/<runId>.
function isValidStatusPath(p) {
  return typeof p === 'string'
    && p.startsWith('/api/v1/execute/status/')
    && !p.includes('..')
    && !p.includes('://');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Minimal promise-based HTTPS request returning { status, body }.
function httpsRequest(method, fullUrl, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(fullUrl);
    const reqOpts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    };
    const r = https.request(reqOpts, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () =>
        resolve({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8') })
      );
      resp.on('error', reject);
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('upstream_timeout')));
    if (body) r.write(body);
    r.end();
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

  // ----- Poll: GET /api/ocr?status=<statusPath> -----
  if (req.method === 'GET') {
    const statusPath = req.query?.status;
    if (!isValidStatusPath(statusPath)) {
      return res.status(400).json({ error: 'invalid_status_path', message: 'bad or missing status path' });
    }
    let poll;
    try {
      poll = await httpsRequest('GET', API_ORIGIN + statusPath, { 'X-API-Key': API_KEY });
    } catch (e) {
      return res.status(502).json({ error: 'poll_failed', message: e.message });
    }
    let data;
    try { data = JSON.parse(poll.body)?.data; } catch {}
    if (!data) {
      return res.status(502).json({ error: 'poll_unparsable', message: poll.body.slice(0, 300) });
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(data));
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ----- Submit: POST /api/ocr { images, category } -> { statusPath } -----
  let rawBody;
  try {
    rawBody = await readBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'read_body_failed', message: e.message });
  }

  let payload;
  try {
    const parsed = JSON.parse(rawBody.toString('utf8'));
    // Accept either `images` (array, new multi-image flow) or a single `image`.
    const images = Array.isArray(parsed.images)
      ? parsed.images.filter(Boolean)
      : (parsed.image ? [parsed.image] : []);
    if (!images.length) throw new Error('missing images');
    payload = Buffer.from(
      JSON.stringify({ input: { images, category: parsed.category || 'salaried' } })
    );
  } catch (e) {
    return res.status(400).json({ error: 'invalid_body', message: e.message });
  }

  let submit, lastErr;
  for (let attempt = 1; attempt <= SUBMIT_ATTEMPTS; attempt++) {
    try {
      submit = await httpsRequest('POST', API_ORIGIN + EXEC_PATH, {
        'X-API-Key': API_KEY,
        'X-Execution-Mode': 'async',
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      }, payload);
      if (submit.status >= 200 && submit.status < 300) break;
      lastErr = new Error(`submit HTTP ${submit.status}: ${submit.body.slice(0, 200)}`);
      submit = null;
    } catch (e) {
      lastErr = e;
      submit = null;
    }
    if (attempt < SUBMIT_ATTEMPTS) await sleep(500 * attempt);
  }
  if (!submit) {
    return res.status(502).json({ error: 'submit_failed', message: lastErr?.message || 'unknown' });
  }

  let statusUrl;
  try {
    statusUrl = JSON.parse(submit.body)?.data?.statusUrl;
  } catch {}
  if (!statusUrl) {
    return res.status(502).json({ error: 'no_status_url', message: submit.body.slice(0, 300) });
  }

  return res.status(200).json({ statusPath: statusUrl });
}
