'use strict';

// Shared text analysis for both indexing and querying.
//
// The indexer and the query path MUST produce tokens the same way -- if they
// drift, queries silently stop matching documents. Keeping the analyzer in one
// module is what guarantees that, so import from here rather than copying.

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "while", "with", "of", "at", "by",
  "for", "to", "in", "on", "from", "up", "down", "out", "over", "under", "again",
  "further", "then", "once", "here", "there", "all", "any", "both", "each", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "can", "will", "just",
  // frequent in problem statements, carry no discriminating signal
  "given", "return", "you", "your", "are", "is", "be", "that", "this", "it",
  "as", "we", "may", "must", "should", "where", "which", "also", "no"
]);

// Problem statements are full of arr[i], i < j, nums[left], O(n log n).
// Splitting on every non-alphanumeric run keeps the identifiers and drops the
// punctuation noise that the original tokenizer left attached to words.
function tokenize(text) {
  const out = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    if (raw.length < 2) continue;          // "i", "j", "n" -- index variables
    if (/^\d+$/.test(raw)) continue;       // bare numerals from constraints
    if (STOPWORDS.has(raw)) continue;
    out.push(raw);
  }
  return out;
}

// Deliberately conservative suffix stripping. A full Porter stemmer
// over-conflates on a corpus this small; this only needs to unify the plural
// and participle forms that actually differ between a query and a statement
// ("arrays"/"array", "sorting"/"sort", "sorted"/"sort").
function stem(word) {
  if (word.length <= 3) return word;

  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('us') || word.endsWith('is')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);

  if (word.endsWith('ing') && word.length > 5) {
    const base = word.slice(0, -3);
    // "running" -> "runn" -> "run"
    return /(.)\1$/.test(base) ? base.slice(0, -1) : base;
  }
  if (word.endsWith('ed') && word.length > 4) {
    const base = word.slice(0, -2);
    return /(.)\1$/.test(base) ? base.slice(0, -1) : base;
  }
  return word;
}

// Query-time only: abbreviations people actually type into a DSA search box.
// Applied to the query alone so the index stays a faithful record of the corpus.
const SYNONYMS = {
  dp: 'dynamic programming',
  bst: 'binary search tree',
  bfs: 'breadth first search queue',
  dfs: 'depth first search recursion',
  ll: 'linked list',
  dsu: 'union find disjoint set',
  lru: 'least recently used cache',
  lfu: 'least frequently used cache',
  lis: 'longest increasing subsequence',
  lcs: 'longest common subsequence',
  bit: 'binary indexed tree fenwick',
  pq: 'priority queue heap',
  bt: 'binary tree',
  mst: 'minimum spanning tree',
  scc: 'strongly connected components',
  kmp: 'string pattern matching',
  gcd: 'greatest common divisor',
  matrix: 'matrix grid',
  grid: 'grid matrix',
  palindrome: 'palindrome palindromic',
  substring: 'substring subarray',
  duplicate: 'duplicate repeated repeating'
};

function analyze(text) {
  return tokenize(text).map(stem);
}

function analyzeQuery(text) {
  const expanded = [];
  for (const token of tokenize(text)) {
    expanded.push(token);
    const syn = SYNONYMS[token];
    if (syn) expanded.push(...tokenize(syn));
  }
  return expanded.map(stem);
}

module.exports = { STOPWORDS, SYNONYMS, tokenize, stem, analyze, analyzeQuery };
