const express = require('express');
const router = express.Router();

// Demo articles data
const demoArticles = [
    {
        id: '1',
        title: 'The Evolution of Hip-Hop: From the Bronx to Global Dominance',
        excerpt: 'Explore the incredible journey of hip-hop music from its humble beginnings in the Bronx to becoming the world\'s most influential cultural movement.',
        content: 'Hip-hop has transcended its musical origins to become a global cultural phenomenon. From the block parties of the Bronx in the 1970s to today\'s streaming era, the genre has continuously evolved while maintaining its core values of authenticity, creativity, and community.',
        author: 'Hal O. Tip',
        category: 'culture',
        tags: ['hip-hop', 'history', 'culture'],
        imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=400&fit=crop&crop=center',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        readTime: 5
    },
    {
        id: '2',
        title: 'Breaking Down the Latest Album Releases: What\'s Hot This Week',
        excerpt: 'Your weekly guide to the hottest new hip-hop releases, featuring in-depth reviews and must-listen tracks.',
        content: 'This week brings us an eclectic mix of hip-hop releases that showcase the genre\'s incredible diversity. From trap bangers to conscious rap, there\'s something for every hip-hop fan.',
        author: 'Hal O. Tip',
        category: 'music',
        tags: ['new releases', 'album reviews', 'hip-hop'],
        imageUrl: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=600&h=400&fit=crop&crop=center',
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        readTime: 4
    },
    {
        id: '3',
        title: 'Behind the Scenes: The Making of a Hip-Hop Classic',
        excerpt: 'Discover the untold stories behind some of hip-hop\'s most iconic albums and the creative processes that brought them to life.',
        content: 'Every classic hip-hop album has a story. From late-night studio sessions to chance encounters that changed everything, these behind-the-scenes tales reveal the human side of hip-hop\'s greatest works.',
        author: 'Hal O. Tip',
        category: 'music',
        tags: ['classics', 'studio', 'behind the scenes'],
        imageUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&h=400&fit=crop&crop=center',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        readTime: 6
    },
    {
        id: '4',
        title: 'Hip-Hop Fashion: How Street Style Became High Fashion',
        excerpt: 'From baggy jeans to luxury streetwear, explore how hip-hop culture revolutionized fashion and continues to influence global style.',
        content: 'Hip-hop fashion has always been about more than just clothes. It\'s a form of self-expression, cultural identity, and social commentary that has influenced everything from streetwear to haute couture.',
        author: 'Hal O. Tip',
        category: 'lifestyle',
        tags: ['fashion', 'streetwear', 'culture'],
        imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=400&fit=crop&crop=center',
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
        readTime: 4
    },
    {
        id: '5',
        title: 'Exclusive Interview: Rising Star Talks New Album and Future Plans',
        excerpt: 'We sit down with one of hip-hop\'s most promising new artists to discuss their journey, influences, and what\'s next.',
        content: 'In this exclusive interview, we dive deep into the mind of a rising hip-hop star who\'s making waves in the industry. From their musical influences to their creative process, get to know the artist behind the music.',
        author: 'Hal O. Tip',
        category: 'interviews',
        tags: ['interview', 'rising star', 'new artist'],
        imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=400&fit=crop&crop=center',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        readTime: 7
    },
    {
        id: '6',
        title: 'The Business of Hip-Hop: How Artists Are Building Empires',
        excerpt: 'Beyond the music, discover how hip-hop artists are creating business empires and changing the industry landscape.',
        content: 'Today\'s hip-hop artists are more than just musicians—they\'re entrepreneurs, brand builders, and cultural influencers. This article explores how the business of hip-hop has evolved and what it means for the future.',
        author: 'Hal O. Tip',
        category: 'news',
        tags: ['business', 'entrepreneurship', 'industry'],
        imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=400&fit=crop&crop=center',
        date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 days ago
        readTime: 5
    }
];

// Get featured articles (first 6)
router.get('/featured', (req, res) => {
    try {
        const featuredArticles = demoArticles.slice(0, 6);
        res.json({
            success: true,
            articles: featuredArticles
        });
    } catch (error) {
        console.error('Error fetching featured articles:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch featured articles'
        });
    }
});

// Get all articles
router.get('/', (req, res) => {
    try {
        const { category, limit, page } = req.query;
        let articles = [...demoArticles];

        // Filter by category if specified
        if (category) {
            articles = articles.filter(article => 
                article.category.toLowerCase() === category.toLowerCase()
            );
        }

        // Pagination
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedArticles = articles.slice(startIndex, endIndex);

        res.json({
            success: true,
            articles: paginatedArticles,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(articles.length / limitNum),
                totalArticles: articles.length,
                hasNextPage: endIndex < articles.length,
                hasPrevPage: pageNum > 1
            }
        });
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch articles'
        });
    }
});

// Get single article by ID
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const article = demoArticles.find(article => article.id === id);
        
        if (!article) {
            return res.status(404).json({
                success: false,
                message: 'Article not found'
            });
        }

        res.json({
            success: true,
            article: article
        });
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch article'
        });
    }
});

// Get articles by category
router.get('/category/:category', (req, res) => {
    try {
        const { category } = req.params;
        const articles = demoArticles.filter(article => 
            article.category.toLowerCase() === category.toLowerCase()
        );

        res.json({
            success: true,
            articles: articles,
            category: category
        });
    } catch (error) {
        console.error('Error fetching articles by category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch articles by category'
        });
    }
});

// Search articles
router.get('/search/:query', (req, res) => {
    try {
        const { query } = req.params;
        const searchTerm = query.toLowerCase();
        
        const articles = demoArticles.filter(article => 
            article.title.toLowerCase().includes(searchTerm) ||
            article.excerpt.toLowerCase().includes(searchTerm) ||
            article.content.toLowerCase().includes(searchTerm) ||
            article.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );

        res.json({
            success: true,
            articles: articles,
            searchQuery: query
        });
    } catch (error) {
        console.error('Error searching articles:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search articles'
        });
    }
});

module.exports = router;

