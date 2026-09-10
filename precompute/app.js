'use strict';

const fs = require('fs');
const path = require('path');
const { analyzeQuery } = require('./text');

const INDEX_DIR = path.join(__dirname, 'index');

// BM25 parameters. k1 controls term-frequency saturation, b controls how much
// document length is normalised away. These are the standard defaults.
const K1 = 1.2;
const B = 0.75;

// Documents scoring below this fraction of the top hit are dropped, so a query
// with one weak incidental match does not pad the results with noise.
const MIN_SCORE_RATIO = 0.05;

// Speculative matches score lower than a term the user actually typed.
const PREFIX_WEIGHT = 0.7;
const FUZZY_WEIGHT = 0.5;

const MAX_EXPANSIONS = 25;   // cap per token, so a short prefix cannot pull in the vocabulary
const MIN_PREFIX_LEN = 2;

function trigrams(text) {
  const padded = ' ' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const grams = new Set();
  for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

function loadIndex() {
  const raw = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, 'index.json'), 'utf-8'));

  // Lowercase each document's tags once, so filtering does not redo it per query.
  const tagSets = raw.docs.map(d => new Set(d.tags.map(t => t.toLowerCase())));
  const difficulties = raw.docs.map(d => (d.difficulty || '').toLowerCase());

  // Precompute each term's IDF: it depends only on the corpus, never the query.
  const idf = Object.create(null);
  for (const term in raw.df) {
    const df = raw.df[term];
    idf[term] = Math.log(1 + (raw.N - df + 0.5) / (df + 0.5));
  }

  // Sorted vocabulary, so a prefix is a contiguous range found by binary search.
  const terms = Object.keys(raw.df).sort();

  // Character trigrams of each title, for the last-resort closest-title match.
  const titleGrams = raw.docs.map(d => trigrams(d.title || ''));

  return { ...raw, idf, tagSets, difficulties, terms, titleGrams };
}

// Index of the first term >= prefix.
function lowerBound(terms, prefix) {
  let lo = 0, hi = terms.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (terms[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function prefixMatches(terms, prefix) {
  const out = [];
  for (let i = lowerBound(terms, prefix); i < terms.length; i++) {
    if (!terms[i].startsWith(prefix)) break;
    out.push(terms[i]);
  }
  return out;
}

// Bounded Levenshtein: returns a distance, or maxDist + 1 once it is exceeded.
function editDistance(a, b, maxDist) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[b.length];
}

function fuzzyMatches(terms, token) {
  if (token.length < 4) return [];
  const maxDist = token.length <= 5 ? 1 : 2;

  const scored = [];
  for (const term of terms) {
    if (Math.abs(term.length - token.length) > maxDist) continue;
    const d = editDistance(token, term, maxDist);
    if (d <= maxDist) scored.push([term, d]);
  }
  scored.sort((a, b) => a[1] - b[1]);
  return scored.slice(0, MAX_EXPANSIONS).map(entry => entry[0]);
}

// Loaded once, at require() time -- not on every search() call.
const INDEX = loadIndex();

// Each query token becomes a group of candidate index terms. A token the user
// typed exactly is its own group; an unknown token is expanded by prefix, then
// by edit distance, so a half-typed word can still reach a real term.
function buildTermGroups(tokens) {
  const { df, terms } = INDEX;
  const groups = [];

  for (const token of tokens) {
    if (token in df) {
      groups.push({ token, variants: [[token, 1]], kind: 'exact' });
      continue;
    }

    if (token.length >= MIN_PREFIX_LEN) {
      const matches = prefixMatches(terms, token);
      if (matches.length) {
        // Prefer the commonest completions when a short prefix matches many.
        matches.sort((a, b) => df[b] - df[a]);
        groups.push({
          token,
          variants: matches.slice(0, MAX_EXPANSIONS).map(t => [t, PREFIX_WEIGHT]),
          kind: 'prefix'
        });
        continue;
      }
    }

    const fuzzy = fuzzyMatches(terms, token);
    if (fuzzy.length) {
      groups.push({ token, variants: fuzzy.map(t => [t, FUZZY_WEIGHT]), kind: 'fuzzy' });
    }
  }

  return groups;
}

// Rank by trigram overlap with the title. This always produces an ordering, so
// it is the last resort when nothing in the query matched the index at all.
function titleSimilarityRanking(query, allowed, topK) {
  const { docs, titleGrams } = INDEX;
  const queryGrams = trigrams(query);
  if (queryGrams.size === 0) return [];

  const scored = [];
  for (let d = 0; d < docs.length; d++) {
    if (!allowed(d)) continue;
    const grams = titleGrams[d];
    let shared = 0;
    for (const g of queryGrams) if (grams.has(g)) shared++;
    if (shared === 0) continue;
    scored.push({ docIdx: d, score: shared / (queryGrams.size + grams.size - shared) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// Absolute last resort: a query with no term, trigram or title overlap at all
// still has to return something when alwaysReturn is set. There is no signal
// left to rank on here, so this is a plain listing, and the caller is told as
// much via matchType so the UI can say so rather than implying relevance.
function defaultListing(allowed, topK) {
  const { docs } = INDEX;
  const out = [];
  for (let d = 0; d < docs.length && out.length < topK; d++) {
    if (allowed(d)) out.push({ docIdx: d, score: 0 });
  }
  return out;
}

function search(query, options = {}) {
  // Tolerate the old search(query, topK) numeric signature.
  const opts = typeof options === 'number' ? { topK: options } : (options || {});
  const topK = opts.topK || 30;
  // When true, a query matching nothing still returns the closest titles rather
  // than an empty list.
  const alwaysReturn = opts.alwaysReturn !== false;
  const difficulty = (opts.difficulty || '').toLowerCase();
  const filterTags = (opts.tags || [])
    .map(t => String(t).trim().toLowerCase())
    .filter(Boolean);

  const { avgdl, docs, postings, idf, tagSets, difficulties } = INDEX;

  // Filters are checked while scoring, before the top-K cut. Applying them
  // afterwards silently starves the result list: the best 30 documents overall
  // are usually not the best 30 documents *of a given difficulty*.
  function allowed(docIdx) {
    if (difficulty && difficulties[docIdx] !== difficulty) return false;
    if (filterTags.length) {
      const docTags = tagSets[docIdx];
      for (const tag of filterTags) if (!docTags.has(tag)) return false;
    }
    return true;
  }

  const tokens = analyzeQuery(query);
  const groups = buildTermGroups(tokens);
  const matchKinds = new Set(groups.map(g => g.kind));

  const scores = new Map();

  for (const group of groups) {
    // Within a group the variants are alternative spellings of one intent, so
    // take the best-matching variant per document rather than summing them --
    // otherwise a document containing minimum, minimize and minimal would score
    // three times over for the single token "mini".
    const groupBest = new Map();

    for (const [term, weight] of group.variants) {
      const list = postings[term];
      if (!list) continue;
      const termIdf = idf[term];

      for (let i = 0; i < list.length; i++) {
        const docIdx = list[i][0];
        const tf = list[i][1];
        if (!allowed(docIdx)) continue;

        const norm = tf + K1 * (1 - B + B * (docs[docIdx].len / avgdl));
        const contribution = weight * termIdf * ((tf * (K1 + 1)) / norm);

        const best = groupBest.get(docIdx);
        if (best === undefined || contribution > best) groupBest.set(docIdx, contribution);
      }
    }

    for (const [docIdx, contribution] of groupBest) {
      scores.set(docIdx, (scores.get(docIdx) || 0) + contribution);
    }
  }

  let ranked;
  let matchType;

  if (scores.size > 0) {
    const scored = [];
    for (const [docIdx, score] of scores) scored.push({ docIdx, score });
    scored.sort((a, b) => b.score - a.score);

    const cutoff = scored[0].score * MIN_SCORE_RATIO;
    ranked = scored.filter(r => r.score >= cutoff).slice(0, topK);
    matchType = matchKinds.has('exact') ? 'exact'
      : matchKinds.has('prefix') ? 'prefix'
        : 'fuzzy';
  } else if (alwaysReturn) {
    ranked = titleSimilarityRanking(query, allowed, topK);
    matchType = 'approximate';

    if (ranked.length === 0) {
      ranked = defaultListing(allowed, topK);
      matchType = 'fallback';
    }
  } else {
    return [];
  }

  return ranked.map(r => {
    const doc = docs[r.docIdx];
    return {
      file: doc.file,
      id: doc.id,
      title: doc.title,
      difficulty: doc.difficulty,
      tags: doc.tags,
      score: r.score,
      matchType
    };
  });
}

module.exports = { search };
