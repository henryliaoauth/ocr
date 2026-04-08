import https from 'node:https';

const API_URL = 'https://platform-api-prod-933489661561.asia-east1.run.app/api/v1/execute/ocr-demo-bKVEbB2J';
const API_KEY = 'pk_aR6Jw0go_5UBw27kh_g8PkWyWtJ6XfAgfixB12VNW';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(API_URL);

  const proxyReq = https.request(
    {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': req.headers['content-type'],
      },
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode);
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'text/plain');
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    res.status(502).json({ error: err.message });
  });

  req.pipe(proxyReq);
}
