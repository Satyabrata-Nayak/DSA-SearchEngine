const fs = require('fs');
const path = require('path');
const stopwords = new Set([
  "a", "an", "the", "and", "or", "but", "if", "while", "with", "of", "at", "by",
  "for", "to", "in", "on", "from", "up", "down", "out", "over", "under", "again",
  "further", "then", "once", "here", "there", "all", "any", "both", "each", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "can", "will", "just"
]);

const DATA_DIR = path.join(__dirname, 'data');
const INDEX_DIR = path.join(__dirname, 'index');

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[.,?!;()"'-]/g, ' ')
    .split(/\s+/)
    .filter(word => word && !stopwords.has(word));
}

function buildVocabulary(docsTokens) {
  const vocab = {};
  let idx = 0;
  docsTokens.forEach(tokens => {
    tokens.forEach(word => {
      if (!(word in vocab)) {
        vocab[word] = idx++;
      }
    });
  });
  return vocab;
}

function computeTf(tokens, vocab) {
  const tf = new Array(Object.keys(vocab).length).fill(0);
  const counts = {};
  tokens.forEach(word => {
    if (word in vocab) {
      counts[word] = (counts[word] || 0) + 1;
    }
  });
  const totalFreq = tokens.length || 1;
  Object.entries(counts).forEach(([word, count]) => {
    tf[vocab[word]] = count / totalFreq;   // <-- changed here
  });
  return tf;
}

function computeIdf(docsTf, vocab) {
  const nDocs = docsTf.length;
  const df = new Array(Object.keys(vocab).length).fill(0);

  docsTf.forEach(tfVec => {
    tfVec.forEach((val, idx) => {
      if (val > 0) df[idx]++;
    });
  });

  // IDF with smoothing
  return df.map(dfi => Math.log((nDocs + 1) / (dfi + 1)) + 1);
}

function multiplyTfIdf(tfVec, idfVec) {
  return tfVec.map((tfVal, idx) => tfVal * idfVec[idx]);
}

function saveJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
}

async function main() {
  if (!fs.existsSync(INDEX_DIR)) {
    fs.mkdirSync(INDEX_DIR);
  }

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.txt'));
  const docsTokens = files.map(file => {
    const text = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
    return tokenize(text);
  });

  const vocab = buildVocabulary(docsTokens);
  const vocabSize = Object.keys(vocab).length;

  // Compute TF vectors for each doc
  const docsTf = docsTokens.map(tokens => computeTf(tokens, vocab));

  // Compute IDF vector
  const idfVec = computeIdf(docsTf, vocab);

  // Compute TF-IDF vectors
  const docsTfIdf = docsTf.map(tfVec => multiplyTfIdf(tfVec, idfVec));

  // Save vocabulary and idf
  saveJSON(path.join(INDEX_DIR, 'vocabulary.json'), vocab);
  saveJSON(path.join(INDEX_DIR, 'idf.json'), idfVec);

  // Save docs info with tf-idf vectors
  const docsIndex = files.map((file, i) => ({
    file,
    tfidf: docsTfIdf[i]
  }));
  saveJSON(path.join(INDEX_DIR, 'docs_tf_idf.json'), docsIndex);

  console.log('Indexing complete. Vocabulary size:', vocabSize);
}

main();
