'use strict';

// Known-item search evaluation.
//
// Each document's own title is used as a query; a correct ranker puts that
// document first. Run this after touching the analyzer, the index format or the
// scoring function -- relevance regressions are otherwise invisible, since the
// results always look plausible.
//
//   npm run eval

const fs = require('fs');
const path = require('path');
const { search } = require('./app');

const titles = fs.readFileSync(path.join(__dirname, 'names.txt'), 'latin1')
  .split(/\r?\n/)
  .map(line => line.trim());

const files = fs.readdirSync(path.join(__dirname, 'data')).filter(f => f.endsWith('.txt'));

let top1 = 0, top5 = 0, mrr = 0, evaluated = 0, notFound = 0;

for (const file of files) {
  const title = titles[parseInt(file, 10)];
  if (!title) continue;
  evaluated++;

  const results = search(title, { topK: 30 });
  const rank = results.findIndex(r => r.file === file) + 1;

  if (rank === 0) { notFound++; continue; }
  if (rank === 1) top1++;
  if (rank <= 5) top5++;
  mrr += 1 / rank;
}

const pct = n => ((100 * n) / evaluated).toFixed(1) + '%';

console.log('Known-item search over ' + evaluated + ' queries');
console.log('  top-1:     ', pct(top1));
console.log('  top-5:     ', pct(top5));
console.log('  MRR:       ', (mrr / evaluated).toFixed(3));
console.log('  not found: ', notFound);
