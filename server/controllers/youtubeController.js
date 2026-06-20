// controllers/youtubeController.js
require("dotenv").config();
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const WEB_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.youtube.com",
  Referer: "https://www.youtube.com/",
};

function extractVideos(items) {
  const results = [];
  for (const item of items) {
    const vr = item.videoRenderer || item.compactVideoRenderer;
    if (!vr || !vr.videoId) continue;
    const title =
      vr.title?.runs?.[0]?.text || vr.title?.simpleText || "Unknown Title";
    const artist =
      vr.ownerText?.runs?.[0]?.text ||
      vr.shortBylineText?.runs?.[0]?.text ||
      "Unknown Artist";
    const durationText =
      vr.lengthText?.simpleText || vr.lengthText?.runs?.[0]?.text || "0:00";
    const parts = durationText.split(":").map(Number);
    const durationSeconds =
      parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts.length === 2
          ? parts[0] * 60 + parts[1]
          : 0;
    const thumbnails = vr.thumbnail?.thumbnails || [];
    const thumbnail =
      thumbnails[thumbnails.length - 1]?.url || thumbnails[0]?.url || "";
    results.push({
      id: vr.videoId,
      title,
      artist,
      duration: durationSeconds,
      thumbnail,
      type: "youtube",
    });
  }
  return results;
}

function walkContents(obj, results = []) {
  if (Array.isArray(obj)) {
    for (const item of obj) walkContents(item, results);
  } else if (obj && typeof obj === "object") {
    if (obj.videoRenderer || obj.compactVideoRenderer) {
      results.push(obj);
    } else {
      for (const val of Object.values(obj)) walkContents(val, results);
    }
  }
  return results;
}

async function searchYouTubeWeb(query) {
  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/search?key=${YT_API_KEY}`,
    {
      method: "POST",
      headers: WEB_HEADERS,
      body: JSON.stringify({
        query,
        params: "EgIQAQ%3D%3D",
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20231121.09.00",
            hl: "en",
            gl: "US",
          },
        },
      }),
    },
  );
  const data = await response.json();
  const rawItems = walkContents(
    data?.contents || data?.onResponseReceivedCommands || {},
  );
  return extractVideos(rawItems).slice(0, 20);
}

// New function to get stream URL from YTStream API
async function getStreamFromYTStream(videoId) {
  const url = `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com",
      "x-rapidapi-key": RAPIDAPI_KEY,
    },
  });

  if (!response.ok) {
    console.error("YTStream API error:", response.status, response.statusText);
    throw new Error("Failed to fetch from YTStream");
  }

  return await response.json();
}

// Helper function to extract stream info (reused by both endpoints)
async function extractStreamInfo(videoId) {
  const data = await getStreamFromYTStream(videoId);

  let streamUrl = null;
  let mimeType = "audio/mp4";

  // 1. Prioritize itag 140 or any mp4 audio (Best for Mobile)
  if (data && data.adaptiveFormats) {
    const audioOnly = data.adaptiveFormats.find((f) =>
      f.mimeType.includes("audio/mp4"),
    );
    if (audioOnly) {
      streamUrl = audioOnly.url;
      mimeType = audioOnly.mimeType;
    }
  }

  // 2. Fallback to standard formats
  if (!streamUrl && data.formats) {
    const standard = data.formats.find((f) => f.url);
    if (standard) streamUrl = standard.url;
  }

  // 3. Last resort
  if (!streamUrl) streamUrl = data.url || data.link;

  if (!streamUrl) throw new Error("No stream URL found");

  return {
    streamUrl,
    mimeType,
    title: data.title || "Unknown",
    artist: data.author || "Unknown Artist",
    duration: data.lengthSeconds || 0,
    thumbnail: data.thumbnail || "",
  };
}

exports.searchSongs = async (req, res) => {
  try {
    const { query } = req.params;
    if (!query)
      return res.status(400).json({ error: "Search query is required" });
    const songs = await searchYouTubeWeb(query);
    res.json({ songs });
  } catch (err) {
    console.error("YouTube search error:", err.message);
    res.status(500).json({ error: "Search failed: " + err.message });
  }
};

exports.getTrending = async (req, res) => {
  try {
    const songs = await searchYouTubeWeb("top music hits 2025");
    res.json({ songs });
  } catch (err) {
    console.error("YouTube trending error:", err.message);
    res.status(500).json({ error: "Trending failed: " + err.message });
  }
};

// Original endpoint - returns URL (good for mobile)
exports.getStreamUrl = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Video ID required" });

    console.log("[YTStream] Fetching stream URL for video:", id);
    const { streamUrl, mimeType, title, artist, duration, thumbnail } =
      await extractStreamInfo(id);

    res.json({
      url: streamUrl,
      mimeType,
      title,
      artist,
      duration,
      thumbnail,
    });
  } catch (err) {
    console.error("YTStream error:", err.message);
    res.status(500).json({ error: "Stream failed: " + err.message });
  }
};

// New proxy endpoint - streams audio directly (good for web)
exports.proxyStream = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Video ID required" });

    console.log("[YTStream Proxy] Starting proxy request for video:", id);

    const { streamUrl, mimeType, title } = await extractStreamInfo(id);
    console.log("[YTStream Proxy] Got stream URL:", streamUrl);

    // Prepare headers for the upstream request
    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://www.youtube.com/",
      Origin: "https://www.youtube.com",
    };

    // Forward range request if present
    if (req.headers.range) {
      upstreamHeaders["Range"] = req.headers.range;
    }

    // Fetch the audio from Google with proper headers
    console.log(
      "[YTStream Proxy] Fetching audio from:",
      streamUrl,
      "with headers:",
      upstreamHeaders,
    );
    const audioResponse = await fetch(streamUrl, {
      headers: upstreamHeaders,
    });

    if (!audioResponse.ok && audioResponse.status !== 206) {
      const errorText = await audioResponse.text().catch(() => "No error text");
      console.error(
        "[YTStream Proxy] Failed to fetch audio:",
        audioResponse.status,
        audioResponse.statusText,
        errorText,
      );
      throw new Error(
        `Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`,
      );
    }

    console.log(
      "[YTStream Proxy] Audio response ok, status:",
      audioResponse.status,
    );

    // Set appropriate headers for streaming
    res.status(audioResponse.status);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(title)}.mp3"`,
    );

    // Forward relevant headers from upstream
    const contentLength = audioResponse.headers.get("content-length");
    const contentRange = audioResponse.headers.get("content-range");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    if (contentRange) {
      res.setHeader("Content-Range", contentRange);
    }

    // Stream the response directly to the client
    if (audioResponse.body) {
      // Use Node.js stream for better performance
      const body = Buffer.from(await audioResponse.arrayBuffer());
      res.send(body);
    } else {
      // Fallback to arrayBuffer
      const arrayBuffer = await audioResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    }

    console.log("[YTStream Proxy] Stream completed successfully");
  } catch (err) {
    console.error("[YTStream Proxy] Full error:", err);
    res.status(500).json({
      error: "Proxy stream failed: " + err.message,
      details: err.stack || "No stack trace available",
    });
  }
};
