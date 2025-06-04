let express = require('express');
let mongoose = require('mongoose');
require('dotenv').config();

let problemSchema = require('./App/models/questionSchema');
let {search} = require("../precompute/app");
const cors = require('cors');

const app = express();  
app.use(cors());



app.use(express.json());
app.get('/api/search', async (req, res) => {
  try {
    const { user_query, difficulty, tags } = req.query;

    const results = search(user_query);
    // console.log(`Search results for query: "${user_query}"`);
    // results.forEach((x) => {
    //   console.log(`${x.file} - score: ${x.score.toFixed(4)}`);
    // });
    // console.log(results.length, " number of results found for query:", user_query);
    if (!results || results.length === 0) {
      return res.status(200).json({
        status: 0,
        message: 'No problems found matching the search criteria'
      });
    }

    const filterTags = tags ? tags.split(',').map(tag => tag.trim().toLowerCase()) : [];

    let results_to_send = await Promise.all(
      results.map(async (result) => {
        const id = parseInt(result.file.split(".")[0]);
        const obj = await problemSchema.findOne({ id });

        if (!obj) return null;

        // Difficulty filter
        if (difficulty && obj.difficulty !== difficulty) return null;

        // Tags filter (all tags must be present)
        if (filterTags.length > 0) {
          const problemTags = obj.tags.map(t => t.toLowerCase());
          const hasAllTags = filterTags.every(tag => problemTags.includes(tag));
          if (!hasAllTags) return null;
        }

        return {
          id: obj.id,
          title: obj.title,
          description: obj.description,
          difficulty: obj.difficulty,
          tags: obj.tags,
          url: obj.url,
          platform: obj.platform,
        };
      })
    );

    results_to_send = results_to_send.filter(Boolean);

    res.status(200).json({
      status: 1,
      total: results_to_send.length,
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

mongoose.connect(process.env.MONGOOSE_URL).then(() => {
    console.log('Connected to MongoDB');
    app.listen(process.env.PORT || 3000, () => {
        console.log(`Server is running on port ${process.env.PORT || 3000}`);
    });
})