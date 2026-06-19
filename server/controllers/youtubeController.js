// controllers/youtubeController.js
const YT_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

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

// Single, well-formed ANDROID client request. The ANDROID client returns
// direct, non-throttled URLs without needing signature deciphering, and
// does not require the extra embed/thirdParty fields the TV/WEB embedded
// clients need — which is what was likely causing every previous fallback
// attempt to silently return no streamingData.
async function fetchStreamingData(videoId) {
  const body = {
    videoId,
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
        platform: 'MOBILE',
      },
    },
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: 'HTML5_PREF_WANTS',
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '19.09.37',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  console.log('[YouTube debug] playabilityStatus:', JSON.stringify(data?.playabilityStatus));
  return data?.streamingData ? data : null;
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

    const data = await fetchStreamingData(id);

    if (!data) {
      return res.status(404).json({ error: 'No streaming data found' });
    }

    const audioFormats = (data.streamingData.adaptiveFormats || [])
      .filter(f => f.mimeType?.startsWith('audio/') && f.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    const regularFormats = (data.streamingData.formats || [])
      .filter(f => f.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    const format = audioFormats[0] || regularFormats[0];

    if (!format?.url) {
      return res.status(404).json({ error: 'No playable audio stream found' });
    }

    const basicInfo = data.videoDetails || {};
    const thumbnail = basicInfo.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

    res.json({
      url: format.url,
      mimeType: format.mimeType || 'audio/mp4',
      title: basicInfo.title || 'Unknown Title',
      artist: basicInfo.author || 'Unknown Artist',
      duration: parseInt(basicInfo.lengthSeconds || '0', 10),
      thumbnail,
    });
  } catch (err) {
    console.error('YouTube stream error:', err.message);
    res.status(500).json({ error: 'Stream failed: ' + err.message });
  }
};