const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');

require('dotenv').config();

const questionSchema = require('./App/models/questionSchema');

// Extract question metadata from each .txt file
async function getContent(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  
  const difficulty = lines[0].trim();
  const tags = lines[1].split(',').map(tag => tag.trim()).filter(tag => tag);
  const description = lines.slice(2).join('\n');
  
  return { difficulty, tags, description };
}

// Read names and URLs line-by-line
const name_path = path.join(__dirname, '../precompute/names.txt');
const url_path = path.join(__dirname, '../precompute/url.txt');
const dataPath = path.join(__dirname, '../precompute/data');

async function getNames() {
  const content = await fs.readFile(name_path, 'utf8');
  return content.split('\n').map(line => line.trim()).filter(Boolean);
}

async function getUrls() {
  const content = await fs.readFile(url_path, 'utf8');
  return content.split('\n').map(line => line.trim()).filter(Boolean);
}

async function main() {
  const names = await getNames();
  const urls = await getUrls();
  

  try {
    let files = await fs.readdir(dataPath);

    // Filter and sort numerically
    files = files
      .filter(file => file.endsWith('.txt'))
      .sort((a, b) => parseInt(a) - parseInt(b));

    for (const file of files) {
      const index = parseInt(path.basename(file, '.txt'));
      const title = names[index];
      const url = urls[index];
      const id = index; 
      const { difficulty, tags, description } = await getContent(path.join(dataPath, file));

      const problem = new questionSchema({
        id,
        title,
        description,
        difficulty,
        tags,
        url,
        platform: 'LeetCode'
      });

      await problem.save();
      console.log(`Saved: ${title}`);
    }

  } catch (err) {
    console.error("Error processing files:", err);
  }
}

// Connect to MongoDB and run the importer
mongoose.connect(process.env.MONGOOSE_URL)
  .then(() => {
    console.log('MongoDB connected');
    main();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });
