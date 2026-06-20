// api/proxy.mjs
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');
  if (!targetUrl) return new Response('No URL', { status: 400 });

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Range': req.headers.get('range') || 'bytes=0-',
        'Connection': 'keep-alive',
      },
    });

    const headers = {
      'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
    };
    const contentRange = response.headers.get('content-range');
    if (contentRange) headers['Content-Range'] = contentRange;

    return new Response(response.body, { status: response.status, headers });
  } catch (e) {
    console.error('Proxy Error:', e);
    return new Response('Error', { status: 500 });
  }
}