const express = require('express');
const router = express.Router();
const youtubeController = require('../controllers/youtubeController');

// Search YouTube Music
router.get('/search/:query', youtubeController.searchSongs);

// Get stream URL for a YouTube video
router.get('/stream/:id', youtubeController.getStreamUrl);

// Get trending music
router.get('/trending', youtubeController.getTrending);

module.exports = router;