export const config = {
  supportsResponseStreaming: true,
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const API_URL = 'https://platform-api-prod-933489661561.asia-east1.run.app/api/v1/execute/ocr-demo-bKVEbB2J';
  const API_KEY = process.env.OCR_API_KEY || 'pk_aR6Jw0go_5UBw27kh_g8PkWyWtJ6XfAgfixB12VNW';

  try {
    const body = await request.arrayBuffer();

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': request.headers.get('content-type'),
      },
      body: body,
    });

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': response.headers.get('content-type') || 'text/plain',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
