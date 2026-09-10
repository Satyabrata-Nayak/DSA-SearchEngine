// script.js

// Served from a local dev server, talk to that same origin; otherwise use the
// deployed backend. Avoids a local page silently querying production.
const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? location.origin
  : 'https://dsa-searchengine-backend.onrender.com';
const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

const form = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const difficultyInput = document.querySelector('#difficultyInput');
const tagsInput = document.querySelector('#tagsInput');
const resultsContainer = document.querySelector('#results');
const statusMessage = document.querySelector('#status-message');
const loadMoreButton = document.querySelector('#load-more');
const loader = document.querySelector('#loader');
const modal = document.querySelector('#modal');
const modalTitle = document.querySelector('#modal-title');
const modalDescription = document.querySelector('#modal-description');
const modalLink = document.querySelector('#modal-link');
const closeButton = document.querySelector('.close-button');

let allResults = [];
let rendered = 0;
let debounceTimer = null;
// Responses can arrive out of order once searching is debounced; only the most
// recent request is allowed to render.
let requestId = 0;

function setStatus(text, isError) {
  statusMessage.textContent = text || '';
  statusMessage.classList.toggle('error', Boolean(isError));
}

function runSearch() {
  const query = searchInput.value.trim();

  resultsContainer.replaceChildren();
  loadMoreButton.hidden = true;
  allResults = [];
  rendered = 0;

  if (!query) {
    setStatus('');
    return;
  }

  const currentRequest = ++requestId;
  loader.style.display = 'block';
  setStatus('Searching\u2026');

  const queryParams = new URLSearchParams({
    user_query: query,
    difficulty: difficultyInput.value || '',
    tags: tagsInput.value || ''
  });

  fetch(`${API_BASE}/api/search?${queryParams}`)
    .then(response => {
      if (!response.ok) throw new Error(`Search failed (${response.status})`);
      return response.json();
    })
    .then(data => {
      if (currentRequest !== requestId) return;   // a newer search superseded this one
      if (data.status === 1 && Array.isArray(data.data) && data.data.length) {
        allResults = data.data;
        setStatus(describeResults(data.total, data.matchType));
        renderNextPage();
      } else {
        setStatus('No problems matched that search.');
      }
    })
    .catch(err => {
      if (currentRequest !== requestId) return;
      console.error('Error:', err);
      setStatus(`Something went wrong while searching: ${err.message}`, true);
    })
    .finally(() => {
      if (currentRequest === requestId) loader.style.display = 'none';
    });
}

// The API never returns an empty list, so the quality of the match has to be
// stated instead -- otherwise a fallback listing reads as a confident answer.
function describeResults(total, matchType) {
  const count = `${total} result${total === 1 ? '' : 's'}`;
  switch (matchType) {
    case 'prefix':
      return `${count} — completing what you typed`;
    case 'fuzzy':
      return `${count} — no exact match, showing close spellings`;
    case 'approximate':
      return `${count} — no match found, showing the closest titles`;
    case 'fallback':
      return `Nothing matched that search. Showing ${total} problems to browse.`;
    default:
      return count;
  }
}

function renderNextPage() {
  const slice = allResults.slice(rendered, rendered + PAGE_SIZE);
  for (const result of slice) resultsContainer.appendChild(buildCard(result));
  rendered += slice.length;
  loadMoreButton.hidden = rendered >= allResults.length;
}

// Built with createElement/textContent rather than innerHTML: titles and tags
// come from a scraper, so they are untrusted and must not be parsed as HTML.
function buildCard(result) {
  const card = document.createElement('div');
  card.classList.add('result-card');

  const heading = document.createElement('h3');
  heading.textContent = result.title || 'Untitled';
  card.appendChild(heading);

  card.appendChild(buildField('Difficulty: ', result.difficulty || 'Unknown'));
  card.appendChild(buildField('Tags: ', (result.tags || []).join(', ') || 'None'));
  card.appendChild(buildField('Platform: ', result.platform || 'Unknown'));

  card.addEventListener('click', () => openModal(result));
  return card;
}

function buildField(label, value) {
  const p = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = label;
  p.appendChild(strong);
  p.appendChild(document.createTextNode(value));
  return p;
}

function openModal(result) {
  modal.style.display = 'block';
  modalTitle.textContent = result.title || 'Untitled';
  modalDescription.textContent = result.description || 'No description available.';
  modalLink.href = result.url || '#';
}

form.addEventListener('submit', function (e) {
  e.preventDefault();
  clearTimeout(debounceTimer);
  runSearch();
});

// Live search: queries are sub-millisecond server-side, so waiting for an
// explicit submit is unnecessary. Debounced so typing sends one request, not one
// per keystroke.
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSearch, DEBOUNCE_MS);
});

// Changing a filter re-runs immediately; there is no typing to wait for.
difficultyInput.addEventListener('change', runSearch);
tagsInput.addEventListener('change', runSearch);

loadMoreButton.addEventListener('click', renderNextPage);

closeButton.addEventListener('click', () => {
  modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === modal) modal.style.display = 'none';
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') modal.style.display = 'none';
});
