// DOM Elements
const searchInput = document.querySelector('.search-input');
const searchButton = document.querySelector('.search-button');

const API_BASE_URL = window.location.origin;

async function searchLyrics(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/lyrics/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        return data.hits || [];
    } catch (err) {
        console.error('Error searching lyrics:', err);
        return [];
    }
}

async function getSongDetails(songId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/lyrics/song/${songId}`);
        const data = await response.json();
        return data;
    } catch (err) {
        console.error('Error fetching song details:', err);
        return null;
    }
}

// Search Functionality
let searchTimeout;
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const query = e.target.value;
            if (query.length < 3) return;

            const existing = searchInput.parentElement.querySelector('.search-results');
            if (existing) existing.remove();

            const searchResults = document.createElement('div');
            searchResults.classList.add('search-results');
            searchResults.innerHTML = '<div class="loading"></div>';
            searchInput.parentElement.style.position = 'relative';
            searchInput.parentElement.appendChild(searchResults);
            
            const results = await searchLyrics(query);
            if (!results || !results.length) {
                searchResults.remove();
                return;
            }
            searchResults.innerHTML = results.map(track => `
                <div class="search-result" data-track-id="${escapeHtml(String(track.track.track_id))}">
                    <h4>${escapeHtml(track.track.track_name)}</h4>
                    <p>${escapeHtml(track.track.artist_name)}</p>
                </div>
            `).join('');

            searchResults.querySelectorAll('.search-result').forEach(el => {
                el.addEventListener('click', () => {
                    const name = el.querySelector('h4').textContent;
                    const artist = el.querySelector('p').textContent;
                    window.location.href = `/lyrics.html?q=${encodeURIComponent(name + ' ' + artist)}`;
                });
            });
        }, 300);
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        const sr = document.querySelector('.search-container .search-results');
        if (sr) sr.remove();
    }
});

// Page Transitions
function navigateTo(url) {
    const transition = document.createElement('div');
    transition.classList.add('page-transition');
    document.body.appendChild(transition);

    setTimeout(() => {
        window.location.href = url;
    }, 500);
}

// Initialize Carousel
function initCarousel() {
    const carousel = document.querySelector('.video-carousel');
    if (!carousel) return;
    const prevBtn = carousel.querySelector('.prev');
    const nextBtn = carousel.querySelector('.next');
    const videoGrid = carousel.querySelector('.video-grid');
    if (!prevBtn || !nextBtn || !videoGrid) return;

    let scrollPosition = 0;
    const scrollAmount = 300;

    prevBtn.addEventListener('click', () => {
        scrollPosition = Math.max(scrollPosition - scrollAmount, 0);
        videoGrid.style.transform = `translateX(-${scrollPosition}px)`;
    });

    nextBtn.addEventListener('click', () => {
        const maxScroll = videoGrid.scrollWidth - videoGrid.clientWidth;
        scrollPosition = Math.min(scrollPosition + scrollAmount, maxScroll);
        videoGrid.style.transform = `translateX(-${scrollPosition}px)`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initCarousel();
    
    // Mobile Menu Toggle
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuClose = document.getElementById('mobileMenuClose');

    if (menuToggle && mobileMenu && mobileMenuClose) {
        menuToggle.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            menuToggle.classList.add('active');
            document.body.classList.add('menu-open');
        });

        mobileMenuClose.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            menuToggle.classList.remove('active');
            document.body.classList.remove('menu-open');
        });

        // Close menu when clicking outside
        mobileMenu.addEventListener('click', (e) => {
            if (e.target === mobileMenu) {
                mobileMenu.classList.remove('active');
                menuToggle.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
                mobileMenu.classList.remove('active');
                menuToggle.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        });
    }
});

(function() {
    var mq = window.matchMedia('(max-width: 768px)');
    document.querySelectorAll('.footer-heading').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (!mq.matches) return;
            var expanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', String(!expanded));
            this.nextElementSibling.classList.toggle('open');
        });
    });
    function syncAccordions() {
        if (!mq.matches) {
            document.querySelectorAll('.footer-links.open').forEach(function(el) {
                el.classList.remove('open');
            });
            document.querySelectorAll('.footer-heading').forEach(function(btn) {
                btn.setAttribute('aria-expanded', 'false');
            });
        }
    }
    mq.addEventListener('change', syncAccordions);
})();