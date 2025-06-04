const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
    unique: true // Ensure ID is unique
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
  },
  tags: {
    type: [String], // Array of strings
    default: []
  },
  url: {
    type: String,
    trim : true,
    required: true,
    unique: true // Ensure URL is unique
  },
  platform: {
    type: String,
  }
});
problemSchema.index({
  title: 'text',
  description: 'text',
  tags: 'text'
});

module.exports = mongoose.model('questions', problemSchema);
