// api/proxy.js
export const config = {
  runtime: 'edge', // This allows infinite file size and prevents timeouts
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) return new Response("Missing URL", { status: 400 });

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Range': req.headers.get('range') || 'bytes=0-', 
      },
    });

    // Create a new response to stream the audio directly to the phone
    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Content-Range': response.headers.get('content-range'),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (e) {
    return new Response("Proxy Error", { status: 500 });
  }
}