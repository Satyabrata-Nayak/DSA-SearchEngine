const fs = require('fs');
let path = require('path');
const stopwords= new Set([
  "a", "an", "the", "and", "or", "but", "if", "while", "with", "of", "at", "by",
  "for", "to", "in", "on", "from", "up", "down", "out", "over", "under", "again",
  "further", "then", "once", "here", "there", "all", "any", "both", "each", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "can", "will", "just"
]);

const INDEX_DIR = path.join(__dirname, 'index');

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[.,?!;()"'-]/g, ' ')
    .split(/\s+/)
    .filter(word => word && !stopwords.has(word));
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

function multiplyTfIdf(tfVec, idfVec) {
  return tfVec.map((tfVal, idx) => tfVal * idfVec[idx]);
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadIndex() {
  const vocab = JSON.parse(fs.readFileSync(INDEX_DIR + '/vocabulary.json', 'utf-8'));
  const idfVec = JSON.parse(fs.readFileSync(INDEX_DIR + '/idf.json', 'utf-8'));
  const docsTfIdf = JSON.parse(fs.readFileSync(INDEX_DIR + '/docs_tf_idf.json', 'utf-8'));
  return { vocab, idfVec, docsTfIdf };
}

function search(query, topK = 30) {
  const { vocab, idfVec, docsTfIdf } = loadIndex();

  const tokens = tokenize(query);
  const tfQuery = computeTf(tokens, vocab);
  const tfidfQuery = multiplyTfIdf(tfQuery, idfVec);

  // Calculate similarity for each document
  const scoredDocs = docsTfIdf.map(doc => {
    const sim = cosineSimilarity(tfidfQuery, doc.tfidf);
    return { file: doc.file, score: sim };
  });

  // Sort descending by similarity and take topK
  scoredDocs.sort((a, b) => b.score - a.score);

  return scoredDocs.filter(a=>a.score>0.1).slice(0, topK);
}


module.exports = {search}