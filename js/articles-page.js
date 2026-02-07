class ArticlesPageManager {
    constructor() {
        this.articles = [];
        this.filteredArticles = [];
        this.currentPage = 1;
        this.articlesPerPage = 12;
        this.currentCategory = '';
        this.currentSort = 'date';
        this.currentSearch = '';
        
        this.init();
    }

    async init() {
        await this.loadArticles();
        this.setupEventListeners();
        this.populateCategories();
    }

    async loadArticles() {
        try {
            this.showLoading(true);
            
            // Try to get all articles first
            const response = await fetch(apiUrl('/api/articles'));
            if (!response.ok) {
                throw new Error('Failed to load articles');
            }
            
            const data = await response.json();
            this.articles = data.articles || [];
            
            if (this.articles.length === 0) {
                // Fallback to featured articles if no articles found
                const featuredResponse = await fetch(apiUrl('/api/articles/featured'));
                if (featuredResponse.ok) {
                    const featuredData = await featuredResponse.json();
                    this.articles = featuredData.articles || [];
                }
            }
            
            this.filteredArticles = [...this.articles];
            this.displayArticles();
            this.showLoadMoreButton();
            
        } catch (error) {
            console.error('Error loading articles:', error);
            this.showError('Failed to load articles. Please try again later.');
        } finally {
            this.showLoading(false);
        }
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentSearch = e.target.value;
                this.filterArticles();
            });
        }

        // Debounced search
        let searchTimeout;
        searchInput?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.currentSearch = e.target.value;
                this.filterArticles();
            }, 300);
        });
    }

    populateCategories() {
        const categories = [...new Set(this.articles.map(article => article.category).filter(Boolean))];
        const categoryFilter = document.getElementById('category-filter');
        
        if (categoryFilter) {
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = this.capitalizeFirst(category);
                categoryFilter.appendChild(option);
            });
        }
    }

    filterArticles() {
        this.currentCategory = document.getElementById('category-filter')?.value || '';
        this.currentSort = document.getElementById('sort-filter')?.value || 'date';
        
        // Filter by category and search
        this.filteredArticles = this.articles.filter(article => {
            const matchesCategory = !this.currentCategory || article.category === this.currentCategory;
            const matchesSearch = !this.currentSearch || 
                article.title.toLowerCase().includes(this.currentSearch.toLowerCase()) ||
                article.excerpt.toLowerCase().includes(this.currentSearch.toLowerCase()) ||
                article.tags?.some(tag => tag.toLowerCase().includes(this.currentSearch.toLowerCase()));
            
            return matchesCategory && matchesSearch;
        });

        // Sort articles
        this.sortArticles();
        
        // Reset pagination
        this.currentPage = 1;
        this.displayArticles();
        this.showLoadMoreButton();
    }

    sortArticles() {
        switch (this.currentSort) {
            case 'title':
                this.filteredArticles.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'readTime':
                this.filteredArticles.sort((a, b) => (a.readTime || 0) - (b.readTime || 0));
                break;
            case 'views':
                this.filteredArticles.sort((a, b) => (b.views || 0) - (a.views || 0));
                break;
            case 'date':
            default:
                this.filteredArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
                break;
        }
    }

    displayArticles() {
        const grid = document.getElementById('articles-grid');
        const startIndex = 0;
        const endIndex = this.currentPage * this.articlesPerPage;
        const articlesToShow = this.filteredArticles.slice(startIndex, endIndex);

        if (articlesToShow.length === 0) {
            this.showNoArticles();
            return;
        }

        grid.innerHTML = articlesToShow.map(article => this.createArticleElement(article)).join('');
        this.hideNoArticles();
    }

    createArticleElement(article) {
        const imageUrl = article.imageUrl || this.getCategoryImage(article.category);
        const formattedDate = this.formatDate(article.date);
        const tags = this.renderTags(article.tags || []);
        
        return `
            <article class="article-card" data-id="${article._id || article.id}">
                <div class="article-image">
                    <img src="${imageUrl}" alt="${article.title}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiM5NTE0ODI7c3RvcC1vcGFjaXR5OjEiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiM5NkM1QjA7c3RvcC1vcGFjaXR5OjEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2cpIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4='">
                    <div class="article-overlay"></div>
                    <div class="article-meta">
                        <span class="article-category">${this.capitalizeFirst(article.category || 'Music')}</span>
                        <span class="article-read-time">${article.readTime || 3} min read</span>
                    </div>
                </div>
                <div class="article-content">
                    <h3>${article.title}</h3>
                    <p>${this.truncateText(article.excerpt || article.content, 120)}</p>
                    <div class="article-footer">
                        <div class="article-author">
                            <span class="author-name">${article.author || 'Hal O. Tip'}</span>
                            <span class="article-date">${formattedDate}</span>
                        </div>
                        <div class="article-tags">
                            ${tags}
                        </div>
                    </div>
                    <a href="#" class="read-more" onclick="openArticle('${article._id || article.id}')">
                        Read More
                        <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            </article>
        `;
    }

    getCategoryImage(category) {
        const categoryImages = {
            'music': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=400&fit=crop&crop=center',
            'culture': 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=600&h=400&fit=crop&crop=center',
            'news': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&h=400&fit=crop&crop=center',
            'lifestyle': 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=400&fit=crop&crop=center',
            'interviews': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=400&fit=crop&crop=center'
        };
        
        return categoryImages[category?.toLowerCase()] || categoryImages['music'];
    }

    renderTags(tags) {
        if (!tags || tags.length === 0) return '';
        
        return tags.slice(0, 3).map(tag => 
            `<span class="article-tag">${this.capitalizeFirst(tag)}</span>`
        ).join('');
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    formatDate(dateString) {
        if (!dateString) return 'Recently';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }

    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    showLoading(show) {
        const loading = document.getElementById('loading-articles');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    showNoArticles() {
        const noArticles = document.getElementById('no-articles');
        const grid = document.getElementById('articles-grid');
        if (noArticles) noArticles.style.display = 'flex';
        if (grid) grid.innerHTML = '';
    }

    hideNoArticles() {
        const noArticles = document.getElementById('no-articles');
        if (noArticles) noArticles.style.display = 'none';
    }

    showLoadMoreButton() {
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            const hasMore = this.currentPage * this.articlesPerPage < this.filteredArticles.length;
            loadMoreBtn.style.display = hasMore ? 'flex' : 'none';
        }
    }

    showError(message) {
        const grid = document.getElementById('articles-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Oops!</h3>
                    <p>${message}</p>
                </div>
            `;
        }
    }
}

// Global functions for HTML onclick handlers
function searchArticles() {
    const searchInput = document.querySelector('.search-input');
    if (searchInput && articlesPageManager) {
        articlesPageManager.currentSearch = searchInput.value;
        articlesPageManager.filterArticles();
    }
}

function filterArticles() {
    if (articlesPageManager) {
        articlesPageManager.filterArticles();
    }
}

function loadMoreArticles() {
    if (articlesPageManager) {
        articlesPageManager.currentPage++;
        articlesPageManager.displayArticles();
        articlesPageManager.showLoadMoreButton();
    }
}

function openArticle(articleId) {
    // For now, just log the article ID
    // In the future, this could open a modal or navigate to a detail page
    console.log('Opening article:', articleId);
    alert(`Article ${articleId} would open here. This feature is coming soon!`);
}

// Initialize the articles page manager when DOM is loaded
let articlesPageManager;
document.addEventListener('DOMContentLoaded', () => {
    articlesPageManager = new ArticlesPageManager();
});
