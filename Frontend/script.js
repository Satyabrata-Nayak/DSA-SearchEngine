// script.js

const form = document.querySelector('form');
const searchInput = document.querySelector('#search-input');
const resultsContainer = document.querySelector('#results');
const modal = document.querySelector('#modal');
const modalTitle = document.querySelector('#modal-title');
const modalDescription = document.querySelector('#modal-description');
const modalTags = document.querySelector('#modal-tags');
const modalLink = document.querySelector('#modal-link');
const closeButton = document.querySelector('.close-button');

form.addEventListener('submit', function (e) {
  e.preventDefault();
  resultsContainer.innerHTML = '';
  const query = searchInput.value.trim();
  if (!query){
    alert("Please enter a search query.");
    return;
  }

  document.getElementById('loader').style.display = 'block';

  // Construct the query string
  const difficulty = document.getElementById('difficultyInput')?.value || "";
  const tags = document.getElementById('tagsInput')?.value || "";

  const queryParams = new URLSearchParams({
    user_query: query,
    difficulty,
    tags
  });
  const searchUrl = `https://dsa-searchengine-backend.onrender.com/api/search?${queryParams}`;
  fetch(searchUrl)
    .then(response => {
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    })
    .then(data => {
      if (data.status === 1) {
        displayResults(data.data); // show actual results
      } else {
        alert("No results found.");
      }
    })
    .catch(err => {
      console.error("Error:", err);
      alert(`Something went wrong while searching: ${err}`);
    })
    .finally(() => {
      document.getElementById('loader').style.display = 'none';
    });
});


function displayResults(results) {
  

  results.forEach(result => {
    const card = document.createElement('div');
    card.classList.add('result-card');
    card.innerHTML = `
      <h3>${result.title}</h3>
      <p><strong>Difficulty: </strong> ${result.difficulty}</p>
      <p><strong>Tags: </strong> ${result.tags.join(', ')}</p>
      <p><strong>Platform: </strong> ${result.platform}</p>
    `;

    card.addEventListener('click', () => {
      modal.style.display = 'block'; // Ensure the modal is shown
      modalTitle.textContent = result.title;
      modalDescription.textContent = result.description;
      modalLink.href = result.url;
    });

    resultsContainer.appendChild(card);
  });
}

closeButton.addEventListener('click', () => {
  modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.style.display = 'none';
  }
});
