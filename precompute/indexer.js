'use strict';

const fs = require('fs');
const path = require('path');
const { analyze } = require('./text');

const DATA_DIR = path.join(__dirname, 'data');
const INDEX_DIR = path.join(__dirname, 'index');
const NAMES_PATH = path.join(__dirname, 'names.txt');

// Field weights: a term in the title is far more indicative than the same term
// buried in a paragraph of problem statement.
const W_TITLE = 3;
const W_TAGS = 2;
const W_BODY = 1;

// names.txt is ISO-8859-1, not UTF-8; decoding it as UTF-8 mangles the titles
// that contain non-ASCII bytes.
function readTitles() {
  return fs.readFileSync(NAMES_PATH, 'latin1')
    .split(/\r?\n/)
    .map(line => line.trim());
}

// data/N.txt is: line 0 = difficulty, line 1 = comma-separated tags, rest = description
function parseDoc(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  return {
    difficulty: (lines[0] || '').trim(),
    tags: (lines[1] || '').split(',').map(t => t.trim()).filter(Boolean),
    description: lines.slice(2).join('\n')
  };
}

function addWeighted(counts, tokens, weight) {
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + weight);
  }
}

function main() {
  if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR);

  const titles = readTitles();
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.txt'))
    .sort((a, b) => parseInt(a) - parseInt(b));

  const docs = [];
  const postings = new Map();   // term -> [docIdx, weightedTf, ...]
  let totalLen = 0;

  files.forEach((file, docIdx) => {
    const id = parseInt(path.basename(file, '.txt'), 10);
    const { difficulty, tags, description } = parseDoc(path.join(DATA_DIR, file));
    const title = titles[id] || '';

    const counts = new Map();
    addWeighted(counts, analyze(title), W_TITLE);
    addWeighted(counts, analyze(tags.join(' ')), W_TAGS);
    addWeighted(counts, analyze(description), W_BODY);

    let len = 0;
    for (const [term, tf] of counts) {
      let list = postings.get(term);
      if (!list) postings.set(term, (list = []));
      list.push([docIdx, tf]);
      len += tf;
    }

    totalLen += len;
    // Metadata travels with the index so filters can be applied during ranking
    // rather than after the top-K cut.
    docs.push({ file, id, title, len, difficulty, tags });
  });

  const df = {};
  const postingsOut = {};
  for (const [term, list] of postings) {
    df[term] = list.length;
    postingsOut[term] = list;
  }

  const index = {
    version: 2,
    N: files.length,
    avgdl: totalLen / (files.length || 1),
    docs,
    df,
    postings: postingsOut
  };

  const outPath = path.join(INDEX_DIR, 'index.json');
  fs.writeFileSync(outPath, JSON.stringify(index), 'utf-8');

  const sizeMB = fs.statSync(outPath).size / 1048576;
  console.log('Indexing complete.');
  console.log('  documents:  ', index.N);
  console.log('  vocabulary: ', Object.keys(df).length);
  console.log('  avg doc len:', index.avgdl.toFixed(1));
  console.log('  index size: ', sizeMB.toFixed(2), 'MB ->', outPath);
}

main();
