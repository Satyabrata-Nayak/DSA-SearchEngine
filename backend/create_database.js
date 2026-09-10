const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');

// Resolve .env next to this file, not from the working directory, so these
// scripts work when run from the repo root as well as from backend/.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const questionSchema = require('./App/models/questionSchema');

// Extract question metadata from each .txt file
async function getContent(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const difficulty = (lines[0] || '').trim();
  const tags = (lines[1] || '').split(',').map(tag => tag.trim()).filter(Boolean);
  const description = lines.slice(2).join('\n').trim();

  return { difficulty, tags, description };
}

// Read names and URLs line-by-line
const name_path = path.join(__dirname, '../precompute/names.txt');
const url_path = path.join(__dirname, '../precompute/url.txt');
const dataPath = path.join(__dirname, '../precompute/data');

// names.txt is ISO-8859-1, not UTF-8. Reading it as UTF-8 mangles every title
// containing a non-ASCII byte, and would leave the stored titles disagreeing
// with the ones baked into the search index.
async function getNames() {
  const content = await fs.readFile(name_path, 'latin1');
  return content.split(/\r?\n/).map(line => line.trim());
}

async function getUrls() {
  const content = await fs.readFile(url_path, 'utf8');
  return content.split(/\r?\n/).map(line => line.trim());
}

async function main() {
  const names = await getNames();
  const urls = await getUrls();

  let files = await fs.readdir(dataPath);
  files = files
    .filter(file => file.endsWith('.txt'))
    .sort((a, b) => parseInt(a) - parseInt(b));

  const operations = [];
  const skipped = [];

  for (const file of files) {
    const id = parseInt(path.basename(file, '.txt'), 10);
    const title = names[id];
    const url = urls[id];

    // title and url are required by the schema; a blank line in either source
    // file would otherwise fail mid-import with a validation error.
    if (!title || !url) {
      skipped.push(file);
      continue;
    }

    const { difficulty, tags, description } = await getContent(path.join(dataPath, file));

    // Upsert on id rather than insert, so re-running after a partial or failed
    // import updates existing rows instead of throwing duplicate key errors.
    operations.push({
      updateOne: {
        filter: { id },
        update: { $set: { id, title, description, difficulty, tags, url, platform: 'LeetCode' } },
        upsert: true
      }
    });
  }

  // One bulk round trip per chunk instead of one save() per problem: the
  // original loop made 515 sequential round trips to Atlas.
  const CHUNK = 100;
  let upserted = 0, modified = 0;

  for (let i = 0; i < operations.length; i += CHUNK) {
    const chunk = operations.slice(i, i + CHUNK);
    const res = await questionSchema.bulkWrite(chunk, { ordered: false });
    upserted += res.upsertedCount || 0;
    modified += res.modifiedCount || 0;
    console.log(`  ${Math.min(i + CHUNK, operations.length)}/${operations.length}`);
  }

  console.log('\nImport complete.');
  console.log('  inserted:', upserted);
  console.log('  updated: ', modified);
  if (skipped.length) console.log('  skipped (missing title or url):', skipped.join(', '));
  console.log('  total in collection:', await questionSchema.countDocuments());
}

// Connect to MongoDB and run the importer
mongoose.connect(process.env.MONGOOSE_URL)
  .then(async () => {
    console.log('MongoDB connected');
    try {
      await main();
    } catch (err) {
      console.error('Error processing files:', err);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
