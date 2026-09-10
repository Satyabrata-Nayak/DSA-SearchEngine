'use strict';

// Local development server -- run the whole app without MongoDB.
//
//   node backend/dev-server.js     then open http://localhost:3000
//
// The ranking engine is the real one (precompute/app.js). Only the metadata
// source differs: title/difficulty/tags come from the prebuilt index, the
// description from precompute/data/*.txt and the URL from precompute/url.txt,
// instead of from Atlas. Use backend/index.js for the real thing.

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { search } = require('../precompute/app');

const PRECOMPUTE = path.join(__dirname, '..', 'precompute');
const index = require(path.join(PRECOMPUTE, 'index', 'index.json'));

const urls = fs.readFileSync(path.join(PRECOMPUTE, 'url.txt'), 'utf-8')
  .split(/\r?\n/)
  .map(line => line.trim());

const descriptionCache = new Map();
function readDescription(file) {
  if (!descriptionCache.has(file)) {
    const raw = fs.readFileSync(path.join(PRECOMPUTE, 'data', file), 'utf-8');
    descriptionCache.set(file, raw.split(/\r?\n/).slice(2).join('\n').trim());
  }
  return descriptionCache.get(file);
}

const byId = new Map(index.docs.map(d => [d.id, d]));

const app = express();
app.use(cors());
app.use(express.json());

// Mirrors the /api/search contract in backend/index.js.
app.get('/api/search', (req, res) => {
  try {
    const { user_query, difficulty, tags } = req.query;

    if (!user_query || !user_query.trim()) {
      return res.status(400).json({ status: 0, message: 'A search query is required' });
    }

    const filterTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    const results = search(user_query, {
      topK: 30,
      difficulty: difficulty || '',
      tags: filterTags
    });

    if (!results.length) {
      return res.status(200).json({
        status: 0,
        message: 'No problems found matching the search criteria'
      });
    }

    const data = results.map(r => {
      const doc = byId.get(r.id);
      return {
        id: doc.id,
        title: doc.title,
        description: readDescription(doc.file),
        difficulty: doc.difficulty,
        tags: doc.tags,
        url: urls[doc.id] || '#',
        platform: 'LeetCode'
      };
    });

    res.status(200).json({
      status: 1,
      total: data.length,
      matchType: results[0].matchType,
      data
    });
  } catch (error) {
    res.status(500).json({ status: 0, message: 'Search failed', error: error.message });
  }
});

app.use(express.static(path.join(__dirname, '..', 'Frontend')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Dev server (no MongoDB) running: http://localhost:${port}`);
});
