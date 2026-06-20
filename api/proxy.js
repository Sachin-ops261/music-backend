// api/proxy.js

export const config = {
  runtime: 'edge', // This allows infinite file size and prevents timeouts
};

export default async function handler(req) {
  // 1. Handle CORS Preflight (Important for Web/Mobile)
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
  if (!targetUrl) return new Response("No URL", { status: 400 });

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Range': req.headers.get('range') || 'bytes=0-',
    'Connection': 'keep-alive',
      },
    });

    // 2. Dynamically get the content type from the source (e.g., YouTube)
    const contentType = response.headers.get('content-type') || 'audio/mpeg';

    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Content-Range': response.headers.get('content-range'),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (e) {
    console.error("Proxy Error:", e);
    return new Response("Error", { status: 500 });
  }
}