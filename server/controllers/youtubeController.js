// controllers/youtubeController.js
require('dotenv').config();
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const WEB_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.youtube.com',
  'Referer': 'https://www.youtube.com/',
};

function extractVideos(items) {
  const results = [];
  for (const item of items) {
    const vr = item.videoRenderer || item.compactVideoRenderer;
    if (!vr || !vr.videoId) continue;
    const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Unknown Title';
    const artist = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'Unknown Artist';
    const durationText = vr.lengthText?.simpleText || vr.lengthText?.runs?.[0]?.text || '0:00';
    const parts = durationText.split(':').map(Number);
    const durationSeconds =
      parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] :
      parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
    const thumbnails = vr.thumbnail?.thumbnails || [];
    const thumbnail = thumbnails[thumbnails.length - 1]?.url || thumbnails[0]?.url || '';
    results.push({ id: vr.videoId, title, artist, duration: durationSeconds, thumbnail, type: 'youtube' });
  }
  return results;
}

function walkContents(obj, results = []) {
  if (Array.isArray(obj)) {
    for (const item of obj) walkContents(item, results);
  } else if (obj && typeof obj === 'object') {
    if (obj.videoRenderer || obj.compactVideoRenderer) {
      results.push(obj);
    } else {
      for (const val of Object.values(obj)) walkContents(val, results);
    }
  }
  return results;
}

async function searchYouTubeWeb(query) {
  const response = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${YT_API_KEY}`, {
    method: 'POST',
    headers: WEB_HEADERS,
    body: JSON.stringify({
      query,
      params: 'EgIQAQ%3D%3D',
      context: { client: { clientName: 'WEB', clientVersion: '2.20231121.09.00', hl: 'en', gl: 'US' } },
    }),
  });
  const data = await response.json();
  const rawItems = walkContents(data?.contents || data?.onResponseReceivedCommands || {});
  return extractVideos(rawItems).slice(0, 20);
}

// New function to get stream URL from YTStream API
async function getStreamFromYTStream(videoId) {
  const url = `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': 'ytstream-download-youtube-videos.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY
    }
  });
  
  if (!response.ok) {
    console.error('YTStream API error:', response.status, response.statusText);
    throw new Error('Failed to fetch from YTStream');
  }
  
  return await response.json();
}

exports.searchSongs = async (req, res) => {
  try {
    const { query } = req.params;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    const songs = await searchYouTubeWeb(query);
    res.json({ songs });
  } catch (err) {
    console.error('YouTube search error:', err.message);
    res.status(500).json({ error: 'Search failed: ' + err.message });
  }
};

exports.getTrending = async (req, res) => {
  try {
    const songs = await searchYouTubeWeb('top music hits 2025');
    res.json({ songs });
  } catch (err) {
    console.error('YouTube trending error:', err.message);
    res.status(500).json({ error: 'Trending failed: ' + err.message });
  }
};

exports.getStreamUrl = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Video ID required' });

    console.log('[YTStream] Fetching stream for video:', id);
    const data = await getStreamFromYTStream(id);
    console.log('[YTStream] Response:', JSON.stringify(data, null, 2));

    // Find the best audio format or use the direct link
    let streamUrl = null;
    let mimeType = 'audio/mp4';
    let thumbnail = '';
    let title = 'Unknown Title';
    let artist = 'Unknown Artist';
    let duration = 0;

    // Try to extract audio stream from YTStream response
    if (data && data.link) {
      streamUrl = data.link;
    } else if (data && data.url) {
      streamUrl = data.url;
    } else if (data && data.formats) {
      // Look for audio-only formats first
      const audioFormat = data.formats.find(f => f.mimeType?.includes('audio') || f.audioQuality);
      if (audioFormat && audioFormat.url) {
        streamUrl = audioFormat.url;
        mimeType = audioFormat.mimeType || mimeType;
      } else {
        // Fallback to any format
        const firstFormat = data.formats.find(f => f.url);
        if (firstFormat) {
          streamUrl = firstFormat.url;
          mimeType = firstFormat.mimeType || mimeType;
        }
      }
    } else if (data && data.adaptiveFormats) {
      const audioFormat = data.adaptiveFormats.find(f => f.mimeType?.startsWith('audio') && f.url);
      if (audioFormat) {
        streamUrl = audioFormat.url;
        mimeType = audioFormat.mimeType || mimeType;
      }
    }

    // Get metadata
    if (data && data.title) title = data.title;
    if (data && data.author) artist = data.author;
    if (data && data.thumbnail) thumbnail = data.thumbnail;
    if (data && data.lengthSeconds) duration = parseInt(data.lengthSeconds, 10);
    if (data && data.thumbnails && data.thumbnails.length > 0) {
      thumbnail = data.thumbnails[data.thumbnails.length - 1]?.url || data.thumbnails[0]?.url;
    }

    if (!streamUrl) {
      console.error('[YTStream] No stream URL found in response:', data);
      return res.status(404).json({ error: 'No playable audio stream found' });
    }

    res.json({
      url: streamUrl,
      mimeType,
      title,
      artist,
      duration,
      thumbnail,
    });
  } catch (err) {
    console.error('YTStream error:', err.message);
    res.status(500).json({ error: 'Stream failed: ' + err.message });
  }
};
