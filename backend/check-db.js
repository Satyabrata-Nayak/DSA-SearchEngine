'use strict';

// Connection smoke test:  node backend/check-db.js
//
// Reports whether MONGOOSE_URL authenticates, which database the URI actually
// selects, and how many problems are in it. Useful after a credential reset,
// when "no results" could equally mean bad auth, the wrong database, or an
// empty collection.

// Resolve .env next to this file, not from the working directory, so these
// scripts work when run from the repo root as well as from backend/.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const questions = require('./App/models/questionSchema');

const url = process.env.MONGOOSE_URL;

if (!url) {
  console.error('MONGOOSE_URL is not set. Create backend/.env with:');
  console.error('  MONGOOSE_URL=mongodb+srv://user:password@host/?appName=...');
  process.exit(1);
}

// Never print the password, only the shape of the URI.
console.log('URI:', url.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@'));

mongoose.connect(url, { serverSelectionTimeoutMS: 10000 })
  .then(async () => {
    const db = mongoose.connection;
    console.log('connected OK');
    console.log('database:  ', db.name, db.name === 'test' ? '(default -- URI has no database path)' : '');

    const collections = await db.db.listCollections().toArray();
    console.log('collections:', collections.length ? collections.map(c => c.name).join(', ') : '(none)');

    const count = await questions.estimatedDocumentCount();
    console.log('questions: ', count);

    if (count === 0) {
      console.log('\nCollection is empty. Populate it with:  node backend/create_database.js');
    } else {
      const sample = await questions.findOne().select('id title difficulty -_id').lean();
      console.log('sample:    ', JSON.stringify(sample));
    }

    await mongoose.disconnect();
  })
  .catch(err => {
    console.error('\nconnection FAILED:', err.message);
    if (/authentication failed|bad auth/i.test(err.message)) {
      console.error('  -> wrong username or password. Reset it in Atlas > Database Access.');
      console.error('     If the password contains @ : / ? # [ ] %, it must be URL-encoded.');
    } else if (/ENOTFOUND|querySrv/i.test(err.message)) {
      console.error('  -> hostname could not be resolved. Check the cluster address.');
    } else if (/timed out|ETIMEDOUT|ServerSelection/i.test(err.message)) {
      console.error('  -> reachable but no response. Usually the IP allowlist:');
      console.error('     Atlas > Network Access > add your IP, or 0.0.0.0/0 for Render.');
    }
    process.exit(1);
  });
