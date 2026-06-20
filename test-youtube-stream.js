
require('dotenv').config();
const { getStreamFromYTStream, extractStreamInfo } = require('./server/controllers/youtubeController');

async function test() {
    console.log("Testing YouTube stream extraction...");
    // Test with a known YouTube video ID
    const testVideoId = "dQw4w9WgXcQ";
    
    try {
        const streamInfo = await extractStreamInfo(testVideoId);
        console.log("\n✅ Success! Stream info:");
        console.log("Title:", streamInfo.title);
        console.log("Artist:", streamInfo.artist);
        console.log("Stream URL:", streamInfo.streamUrl);
        console.log("MIME Type:", streamInfo.mimeType);
        
        // Check if the stream URL works
        const testFetch = await fetch(streamInfo.streamUrl, { method: 'HEAD' });
        console.log("\nStream URL status:", testFetch.status, testFetch.statusText);
        
    } catch (err) {
        console.error("\n❌ Error:", err.message);
        console.error(err.stack);
    }
}

test();
