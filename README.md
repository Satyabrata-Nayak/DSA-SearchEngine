# DSA Question Search Engine

Full-text search over a corpus of LeetCode problems, ranked with a hand-built
BM25 implementation over a sparse inverted index. MERN stack.

## Layout

```
precompute/     corpus, indexer and ranking engine
  data/*.txt    one problem per file: line 0 difficulty, line 1 tags, rest description
  names.txt     problem titles, line N corresponds to data/N.txt  (ISO-8859-1)
  url.txt       problem URLs, same line-to-file correspondence
  text.js       shared analyzer: tokenize, stem, synonym expansion
  indexer.js    builds index/index.json
  app.js        BM25 query engine
  eval.js       relevance regression harness
backend/        Express API + MongoDB (Mongoose) for problem metadata
Frontend/       static client
```

## Search engine

The index is a sparse inverted index built ahead of time:

```
index.json = { version, N, avgdl, docs[], df{}, postings{ term: [[docIdx, tf], ...] } }
```

Scoring is BM25 (`k1 = 1.2`, `b = 0.75`), accumulated by walking only the postings
lists of the query's terms, so a query touches a few hundred documents rather
than the whole corpus. Terms are weighted by field at index time — title ×3,
tags ×2, description ×1 — so a title match outranks an incidental mention.

`text.js` is imported by both the indexer and the query path. This is deliberate:
if the two sides ever tokenized differently, queries would silently stop matching
documents. Do not inline a second copy of the analyzer.

Filters (difficulty, tags) are applied *during* scoring, before the top-K cut.
Filtering after ranking starves the result list, because the best 30 documents
overall are rarely the best 30 of a single difficulty.

### Matching cascade

A query never dead-ends. Each token is resolved through the first tier that
produces a hit, and the tier used is reported back as `matchType` so the UI can
say what it is showing instead of implying relevance:

| tier | when | example | weight |
|---|---|---|---|
| `exact` | token is in the vocabulary | `path` | 1.0 |
| `prefix` | token is a prefix of real terms | `mini` -> minimum, minimize | 0.7 |
| `fuzzy` | within edit distance 1-2 of a term | `maxium` -> maximum | 0.5 |
| `approximate` | no term matched; rank by title trigram overlap | `knapsack` | - |
| `fallback` | nothing overlaps at all | `zzzqqq` | - |

Expansions of one token are alternatives, not separate terms: the best-scoring
variant per document is taken, not the sum. Otherwise a document containing
minimum, minimize *and* minimal would score three times over for one typed
token. Filters still apply in every tier, including the fallback.

Pass `alwaysReturn: false` to `search()` to opt out and get an empty list.

### Rebuilding the index

```
cd precompute && npm run reindex
```

`precompute/index/index.json` is a build artifact but **is committed on purpose**:
the backend loads it at boot and the deployment has no build step. It is 0.31 MB
and regenerates deterministically, so re-committing it after a reindex is expected.

### Relevance testing

```
cd precompute && npm run eval
```

Known-item search: each document's own title is used as a query, and a correct
ranker returns that document first. Run it after any change to the analyzer,
index format, or scoring — relevance regressions are invisible otherwise, since
wrong results still look plausible.

Current: **top-1 94.4%, top-5 99.0%, MRR 0.964** over 515 queries.

## Corpus

515 LeetCode problems. Every problem in the current scrape carries the
"Dynamic Programming" tag, so that tag has an IDF near zero and is not a useful
query term or filter; 48 other tags are present and do discriminate.

The scraper that produced `data/`, `names.txt` and `url.txt` is not in this
repository — only its output is. Adding it would make the corpus reproducible.

## Running locally

### Without MongoDB (quickest way to see it working)

```
node backend/dev-server.js      # then open http://localhost:3000
```

Serves the frontend and the search API from one origin, using the real ranking
engine. Only the metadata source differs: titles/difficulty/tags come from the
prebuilt index, descriptions from `precompute/data/`, URLs from
`precompute/url.txt`. No database or `.env` required.

### With MongoDB

`backend/.env` needs:

```
MONGOOSE_URL=<mongodb connection string>
PORT=3000
```

```
cd backend && npm install && npm start
node create_database.js      # one-time: load problem metadata into MongoDB
```

Verify the connection with `node backend/check-db.js`. It reports which database
the URI selects and how many problems are in it, which separates bad credentials
from an IP-allowlist block from an empty collection.

Note the URI has no database path (`.../?appName=...`), so Mongo uses the default
`test` database. The initial import ran against that same URI, so the data lives
in `test` -- adding an explicit database name to the URI points at an empty one.

Atlas credentials cannot be recovered, only reset (Atlas > Database Access >
Edit Password). Passwords containing `@ : / ? # [ ] %` must be URL-encoded in the
URI. If connections time out rather than failing auth, check Atlas > Network
Access: Render's egress IPs are not fixed, so it needs `0.0.0.0/0`.

Then open `Frontend/index.html` (set `API_BASE` in `script.js` to your local
backend while developing).
