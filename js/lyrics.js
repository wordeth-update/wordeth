// DOM Elements
const searchInput = document.getElementById('lyrics-search');
const searchBtn = document.getElementById('search-btn');
const resultsSection = document.getElementById('results-section');
const resultsTitle = document.getElementById('results-title');
const resultsSubtitle = document.getElementById('results-subtitle');
const resultsGrid = document.getElementById('results-grid');
const loading = document.getElementById('loading');
const noResults = document.getElementById('no-results');
const lyricsModal = document.getElementById('lyrics-modal');
const modalOverlay = document.getElementById('modal-overlay');
const closeModal = document.getElementById('close-modal');
const popularTags = document.querySelectorAll('.popular-tag');

// Modal elements
const modalSongTitle = document.getElementById('modal-song-title');
const modalSongArtist = document.getElementById('modal-song-artist');
const modalSongImage = document.getElementById('modal-song-image');
const modalSongAlbum = document.getElementById('modal-song-album');
const modalSongRelease = document.getElementById('modal-song-release');
const modalLyricsText = document.getElementById('modal-lyrics-text');

// Search state
let searchTimeout;
let currentSearchResults = [];

// Real-time search functionality
function setupRealTimeSearch() {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            hideResults();
            return;
        }
        
        // Show loading immediately
        showLoading();
        
        // Debounce the search
        searchTimeout = setTimeout(() => {
            performSearch(query);
        }, 300);
    });
}

// Search functionality using Genius API
async function performSearch(query) {
    if (!query.trim()) {
        hideResults();
        return;
    }

    try {
        console.log('Searching for:', query);
        const response = await fetch(`/api/lyrics/search?q=${encodeURIComponent(query)}`);
        console.log('Search response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Search results:', data);
        
        hideLoading();
        
        if (data.hits && data.hits.length > 0) {
            currentSearchResults = data.hits;
            showResults(data.hits, query);
            
            // Trigger contextual ads based on search
            const adTargets = analyzeSearchForAds(query, data.hits[0]);
            if (adTargets.length > 0 && window.wordethAds) {
                window.wordethAds.triggerContextualAds(adTargets);
            }
        } else {
            showNoResults();
        }
    } catch (error) {
        console.error('Search error:', error);
        hideLoading();
        showNoResults();
    }
}

function showLoading() {
    loading.style.display = 'block';
    resultsSection.style.display = 'none';
    noResults.style.display = 'none';
}

function hideLoading() {
    loading.style.display = 'none';
}

function showResults(results, query) {
    resultsTitle.textContent = `Search Results for "${query}"`;
    resultsSubtitle.textContent = `Found ${results.length} song${results.length !== 1 ? 's' : ''} matching your search`;
    
    resultsGrid.innerHTML = results.map(song => `
        <div class="result-card" data-song-id="${song.id}">
            <div class="result-image">
                <img src="${song.image || '/images/logo.png'}" alt="${escapeHtml(song.title)} cover" onerror="this.onerror=null; this.src='/images/logo.png'; this.classList.add('fallback-logo');">
            </div>
            <div class="result-content">
                <h3>${escapeHtml(song.title)}</h3>
                <p class="artist">${escapeHtml(song.artist)}</p>
                <p class="album">${escapeHtml(song.release_date || 'Release date not available')}</p>
            </div>
            <button class="view-lyrics-btn" data-song-id="${song.id}">
                <i class="fas fa-music"></i>
                View Lyrics
            </button>
        </div>
    `).join('');
    
    resultsSection.style.display = 'block';
    noResults.style.display = 'none';
}

function showNoResults() {
    resultsSection.style.display = 'none';
    noResults.style.display = 'block';
}

function hideResults() {
    resultsSection.style.display = 'none';
    noResults.style.display = 'none';
}

// HTML escaping function
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal functionality using Genius API
async function showLyricsModal(songId) {
    showLoading();
    
    try {
        console.log('Fetching lyrics for song ID:', songId);
        const response = await fetch(`/api/lyrics/lyrics/${songId}`);
        console.log('Lyrics response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const song = await response.json();
        console.log('Lyrics data:', song);
        
        hideLoading();
        
        modalSongTitle.textContent = song.title;
        modalSongArtist.textContent = song.artist;
        modalSongImage.src = song.image || song.album_image || '/images/logo.png';
        modalSongImage.onerror = function() { this.onerror=null; this.src='/images/logo.png'; this.classList.add('fallback-logo'); };
        modalSongAlbum.textContent = song.album || 'Album not available';
        modalSongRelease.textContent = song.release_date || 'Release date not available';
        
        // Properly format lyrics with HTML encoding
        const formattedLyrics = formatLyricsForDisplay(song.lyrics);
        modalLyricsText.innerHTML = formattedLyrics;

        lyricsModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    } catch (error) {
        console.error('Error fetching lyrics:', error);
        hideLoading();
        
        // Show error in modal
        modalSongTitle.textContent = 'Error Loading Lyrics';
        modalSongArtist.textContent = 'Please try again';
        modalSongImage.src = '/images/logo.png';
        modalSongAlbum.textContent = '';
        modalSongRelease.textContent = '';
        modalLyricsText.innerHTML = 'There was an error loading the lyrics. Please try again.';

        lyricsModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

// Enhanced lyrics formatting without HTML codes
function formatLyricsForDisplay(lyrics) {
    if (!lyrics) return '<p class="lyrics-paragraph">No lyrics available</p>';
    
    // Split lyrics into paragraphs and format naturally
    const paragraphs = lyrics.split('\n\n').filter(p => p.trim());
    
    return paragraphs.map(paragraph => {
        // Clean up the paragraph and handle apostrophes naturally
        const cleanParagraph = paragraph
            .replace(/\n/g, '<br>')
            .trim();
        
        return `<p class="lyrics-paragraph">${cleanParagraph}</p>`;
    }).join('');
}

// Ad targeting analysis based on lyrics search
function analyzeSearchForAds(searchTerm, songData = null) {
    const adTargets = [];
    
    // Convert search to lowercase for analysis
    const searchLower = searchTerm.toLowerCase();
    
    // Brand/Product Keywords
    const brandKeywords = {
        'ice cream': ['ice cream shop', 'dessert', 'frozen treat', 'sweet treat'],
        'car': ['automotive', 'vehicle', 'transportation', 'driving'],
        'phone': ['mobile', 'smartphone', 'communication', 'tech'],
        'shoes': ['footwear', 'sneakers', 'fashion', 'style'],
        'food': ['restaurant', 'dining', 'cuisine', 'meal'],
        'drink': ['beverage', 'refreshment', 'bar', 'cocktail'],
        'money': ['finance', 'banking', 'investment', 'wealth'],
        'love': ['dating', 'romance', 'relationship', 'dating app'],
        'party': ['entertainment', 'nightlife', 'events', 'celebration'],
        'work': ['job', 'career', 'professional', 'business']
    };
    
    // Analyze search term for brand opportunities
    for (const [keyword, relatedTerms] of Object.entries(brandKeywords)) {
        if (searchLower.includes(keyword) || relatedTerms.some(term => searchLower.includes(term))) {
            adTargets.push({
                category: keyword,
                intent: 'brand_awareness',
                confidence: 0.8,
                searchTerm: searchTerm
            });
        }
    }
    
    // Analyze song data if available
    if (songData) {
        // Artist-based targeting
        if (songData.artist) {
            adTargets.push({
                category: 'artist_merch',
                intent: 'purchase',
                confidence: 0.9,
                artist: songData.artist,
                searchTerm: searchTerm
            });
        }
        
        // Genre-based targeting
        if (songData.genre) {
            adTargets.push({
                category: 'genre_specific',
                intent: 'discovery',
                confidence: 0.7,
                genre: songData.genre,
                searchTerm: searchTerm
            });
        }
    }
    
    // Emotional/contextual targeting
    const emotionalKeywords = {
        'sad': ['mental health', 'therapy', 'wellness'],
        'happy': ['celebration', 'events', 'entertainment'],
        'angry': ['fitness', 'workout', 'stress relief'],
        'romantic': ['dating', 'jewelry', 'flowers'],
        'nostalgic': ['vintage', 'retro', 'collectibles']
    };
    
    for (const [emotion, relatedTerms] of Object.entries(emotionalKeywords)) {
        if (searchLower.includes(emotion) || relatedTerms.some(term => searchLower.includes(term))) {
            adTargets.push({
                category: 'emotional_targeting',
                intent: 'emotional_response',
                confidence: 0.6,
                emotion: emotion,
                searchTerm: searchTerm
            });
        }
    }
    
    return adTargets;
}

function hideLyricsModal() {
    lyricsModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Event listeners
function setupEventListeners() {
    // Real-time search
    setupRealTimeSearch();

    // Search button (for immediate search)
    searchBtn.addEventListener('click', () => {
        performSearch(searchInput.value);
    });

    // Enter key for immediate search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            performSearch(searchInput.value);
        }
    });

    // Popular tags
    popularTags.forEach(tag => {
        tag.addEventListener('click', () => {
            const searchTerm = tag.getAttribute('data-search');
            searchInput.value = searchTerm;
            performSearch(searchTerm);
        });
    });

    // Results grid click
    resultsGrid.addEventListener('click', (e) => {
        if (e.target.closest('.view-lyrics-btn')) {
            const songId = parseInt(e.target.closest('.view-lyrics-btn').getAttribute('data-song-id'));
            showLyricsModal(songId);
        }
    });

    // Close modal
    closeModal.addEventListener('click', hideLyricsModal);
    modalOverlay.addEventListener('click', hideLyricsModal);

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lyricsModal.style.display === 'block') {
            hideLyricsModal();
        }
    });

    // Clear search when clicking outside results
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.lyrics-search-container') && 
            !e.target.closest('.results-section') && 
            !e.target.closest('.lyrics-modal')) {
            // Don't hide results immediately, but could add logic here if needed
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', setupEventListeners); 