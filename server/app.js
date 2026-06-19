const express = require('express');
const cors = require('cors');
const songRoutes = require('./routes/songs');
const youtubeRoutes = require('./routes/youtube');

const app = express();

// Explicit CORS config — required for Vercel serverless
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return cors(corsOptions)(req, res, next);
  }
  next();
});

app.use(express.json());

// Block unwanted wrappers
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || '';
  if (referer.includes('appsgeyser') || userAgent.includes('AppMaker')) {
    return res.status(403).send('Access denied');
  }
  next();
});

app.use('/api/songs', songRoutes);
app.use('/api/youtube', youtubeRoutes);

module.exports = app;