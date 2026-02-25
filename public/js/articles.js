class ArticlesManager {
    constructor() {
        this.articles = [];
        this.init();
    }

    async init() {
        await this.loadFeaturedArticles();
    }

    async loadFeaturedArticles() {
        try {
            // Try to get featured articles first
            let response = await fetch(apiUrl('/api/articles/featured'));
            if (!response.ok) {
                // Fallback to all articles if featured endpoint doesn't exist
                response = await fetch(apiUrl('/api/articles'));
            }
            
            if (!response.ok) {
                throw new Error('Failed to load articles');
            }
            
            const data = await response.json();
            this.articles = data.articles || data || [];
            
            // Take only the first 6 articles for featured section
            this.articles = this.articles.slice(0, 6);
            
            this.displayFeaturedArticles();
            
        } catch (error) {
            console.error('Error loading featured articles:', error);
            this.showError('Failed to load articles. Please try again later.');
        }
    }

    displayFeaturedArticles() {
        const container = document.getElementById('featured-articles');
        if (!container) return;

        if (this.articles.length === 0) {
            this.showNoArticles(container);
            return;
        }

        const articlesHTML = this.articles.map((article, index) => 
            this.createArticleElement(article, index === 0)
        ).join('');

        container.innerHTML = articlesHTML;
        this.addViewAllButton(container);
    }

    createArticleElement(article, isMain = false) {
        const imageUrl = article.imageUrl || this.getCategoryImage(article.category);
        const formattedDate = this.formatDate(article.date);
        const tags = this.renderTags(article.tags || []);
        
        return `
            <article class="featured-article ${isMain ? 'main-article' : ''}" data-id="${article._id || article.id}">
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
                    <p>${this.truncateText(article.excerpt || article.content, isMain ? 200 : 120)}</p>
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

    addViewAllButton(container) {
        const viewAllDiv = document.createElement('div');
        viewAllDiv.className = 'view-all-articles';
        viewAllDiv.innerHTML = `
            <a href="articles.html" class="view-all-btn">
                <i class="fas fa-newspaper"></i>
                View All Articles
            </a>
        `;
        container.appendChild(viewAllDiv);
    }

    showError(message) {
        const container = document.getElementById('featured-articles');
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Oops!</h3>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    showNoArticles(container) {
        container.innerHTML = `
            <div class="no-articles">
                <i class="fas fa-newspaper"></i>
                <h3>No articles available</h3>
                <p>Check back soon for the latest hip-hop news and culture updates.</p>
            </div>
        `;
    }
}

// Global function for article opening
function openArticle(articleId) {
    console.log('Opening article:', articleId);
    alert(`Article ${articleId} would open here. This feature is coming soon!`);
}

// Initialize the articles manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ArticlesManager();
});
