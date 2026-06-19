const cloudinary = require('../config/cloudinary');
const db = require('../config/db');

exports.getAllSongs = async (req, res) => {
  try {
    const limit = 100;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';

    let query, params;

    if (search) {
      query = `SELECT * FROM songs WHERE title ILIKE $1 OR artist ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
      params = [`%${search}%`, limit, offset];
    } else {
      query = `SELECT * FROM songs ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
      params = [limit, offset];
    }

    const result = await db.query(query, params);
    const countResult = await db.query(
      search
        ? `SELECT COUNT(*) FROM songs WHERE title ILIKE $1 OR artist ILIKE $1`
        : `SELECT COUNT(*) FROM songs`,
      search ? [`%${search}%`] : []
    );

    res.json({
      songs: result.rows,
      total: parseInt(countResult.rows[0].count),
      offset,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get songs' });
  }
};

exports.uploadSong = async (req, res) => {
  try {
    const { title, artist, album, genre, duration } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!title) return res.status(400).json({ error: 'Title is required' });

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video', // Cloudinary uses 'video' for audio files
          folder: 'music-app',
          public_id: `${Date.now()}-${title.replace(/\s+/g, '-')}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(file.buffer);
    });

    // Save metadata to PostgreSQL
    const result = await db.query(
      `INSERT INTO songs (title, artist, album, genre, duration, file_key, file_url, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        title,
        artist || null,
        album || null,
        genre || null,
        duration || null,
        uploadResult.public_id,
        uploadResult.secure_url,
        file.size,
      ]
    );

    res.status(201).json({ message: 'Song uploaded successfully', song: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
};

exports.streamSong = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM songs WHERE id = $1', [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Song not found' });

    const song = result.rows[0];

    // Deliver optimized audio URL via Cloudinary
    const optimizedUrl = song.file_url.replace('/upload/', '/upload/q_auto/');

    res.json({ url: optimizedUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Streaming failed' });
  }
};

exports.deleteSong = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM songs WHERE id = $1', [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Song not found' });

    const song = result.rows[0];

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(song.file_key, { resource_type: 'video' });

    // Delete from database
    await db.query('DELETE FROM songs WHERE id = $1', [id]);

    res.json({ message: 'Song deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
};