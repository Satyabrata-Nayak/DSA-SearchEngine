const path = require('path');
let express = require('express');
let mongoose = require('mongoose');
// Resolve .env next to this file, not from the working directory, so these
// scripts work when run from the repo root as well as from backend/.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

let problemSchema = require('./App/models/questionSchema');
let {search} = require("../precompute/app");
const cors = require('cors');

const app = express();  
app.use(cors());



app.use(express.json());

// Serve the client from the same origin as the API. script.js points at its own
// origin when that origin is localhost, so `npm start` gives a complete working
// app on http://localhost:3000 rather than an API with no page in front of it.
app.use(express.static(path.join(__dirname, '..', 'Frontend')));
app.get('/api/search', async (req, res) => {
  try {
    const { user_query, difficulty, tags } = req.query;

    if (!user_query || !user_query.trim()) {
      return res.status(400).json({
        status: 0,
        message: 'A search query is required'
      });
    }

    const filterTags = tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];

    // Filters are passed into the ranker so they apply before the top-K cut.
    // Filtering the top 30 afterwards discarded most of them: the best 30
    // problems overall are rarely the best 30 of a single difficulty.
    const results = search(user_query, {
      topK: 30,
      difficulty: difficulty || '',
      tags: filterTags
    });

    if (!results || results.length === 0) {
      return res.status(200).json({
        status: 0,
        message: 'No problems found matching the search criteria'
      });
    }

    // One query for every hit instead of one query per hit. .lean() skips
    // Mongoose document hydration, and .select() stops Mongo shipping fields
    // the response drops anyway.
    const ids = results.map(r => r.id);
    const docs = await problemSchema
      .find({ id: { $in: ids } })
      .select('id title description difficulty tags url platform -_id')
      .lean();

    // $in does not preserve the order of the input list, so relevance order is
    // restored here from the ranked results.
    const byId = new Map(docs.map(d => [d.id, d]));
    const results_to_send = results
      .map(r => byId.get(r.id))
      .filter(Boolean);

    res.status(200).json({
      status: 1,
      total: results_to_send.length,
      // 'exact' | 'prefix' | 'fuzzy' | 'approximate' | 'fallback' -- lets the UI
      // say when it is showing near matches rather than implying relevance.
      matchType: results[0].matchType,
      data: results_to_send
    });

  } catch (error) {
    res.status(500).json({
      status: 0,
      message: 'Search failed',
      error: error.message
    });
  }
});

app.post('/api/problems-insert', async (req, res) => {
    try {
        const { title, description, difficulty, tags, url, platform } = req.body;

        if (!title || !description || !url) {
            return res.status(400).json({ 
          status: 0,
          error: 'Title, Description and URL fields are required'
        });
        }

        const newProblem = new problemSchema({
            title,
            description,
            difficulty,
            tags: tags || [],
            url,
            platform
        });

        let savemsg = await newProblem.save();
        res.status(200).json({
          status:1,
          message: 'Problem added successfully',
          data: savemsg
        });
    } catch (error) {
        res.send({
          status: 0,
          message: 'Error adding problem',
          error: error
        });
    }
});

if (!process.env.MONGOOSE_URL) {
    console.error('MONGOOSE_URL is not set. On Render, set it under the service\'s Environment tab.');
    process.exit(1);
}

mongoose.connect(process.env.MONGOOSE_URL).then(() => {
    console.log('Connected to MongoDB');
    const port = process.env.PORT || 3000;
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server is running on port ${port}`);
    });
}).catch(err => {
    // Without this the connection promise rejects unhandled, the server never
    // listens, and the platform reports only a health-check timeout rather than
    // the actual cause.
    console.error('MongoDB connection failed:', err.message);
    if (/authentication failed|bad auth/i.test(err.message)) {
        console.error('  -> wrong username or password in MONGOOSE_URL.');
    } else if (/timed out|ETIMEDOUT|ServerSelection/i.test(err.message)) {
        console.error('  -> reachable but no response; check the Atlas Network Access allowlist.');
    }
    process.exit(1);
});
