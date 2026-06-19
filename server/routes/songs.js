const express = require('express');
const router = express.Router();
const songController = require('../controllers/songController');
const multer = require('multer');

const upload = multer({storage: multer.memoryStorage()});

router.get('/', songController.getAllSongs);
router.post('/upload', upload.single('song'), songController.uploadSong);
router.get('/stream/:id', songController.streamSong);
router.delete('/:id', songController.deleteSong);

module.exports = router;