const express = require('express');
const router = express.Router();
const youtubeController = require('../controllers/youtubeController');

// Search YouTube Music
router.get('/search/:query', youtubeController.searchSongs);

// Get stream URL for a YouTube video (mobile-friendly)
router.get('/stream/:id', youtubeController.getStreamUrl);

// Proxy stream endpoint (web-friendly, no CORS)
router.get('/proxy/:id', youtubeController.proxyStream);

// Get trending music
router.get('/trending', youtubeController.getTrending);

module.exports = router;