const ArticleScraper = require('./agents/articleScraper');
const ArticleRewriter = require('./agents/articleRewriter');

async function demoArticles() {
    console.log('🎭 Demo: Article Rewriting System\n');
    
    const scraper = new ArticleScraper();
    const rewriter = new ArticleRewriter();
    
    try {
        // Scrape articles
        console.log('📰 Scraping articles from AllHipHop...');
        const scrapedArticles = await scraper.scrapeArticles(6);
        
        if (scrapedArticles.length === 0) {
            console.log('❌ No articles scraped');
            return;
        }
        
        console.log(`✅ Scraped ${scrapedArticles.length} articles\n`);
        
        // Rewrite articles
        console.log('🔄 Rewriting articles for Wordeth...');
        const rewrittenArticles = [];
        
        for (const article of scrapedArticles) {
            const enriched = await scraper.enrichArticle(article);
            const rewritten = await rewriter.rewriteArticle(enriched);
            
            if (rewritten) {
                rewrittenArticles.push(rewritten);
                console.log(`✅ "${article.title}" → "${rewritten.title}"`);
            }
        }
        
        console.log(`\n🎉 Successfully rewritten ${rewrittenArticles.length} articles!`);
        
        // Display sample articles
        console.log('\n📝 Sample Rewritten Articles:');
        console.log('=' .repeat(80));
        
        rewrittenArticles.slice(0, 3).forEach((article, index) => {
            console.log(`\n${index + 1}. ${article.title}`);
            console.log(`   Author: ${article.author}`);
            console.log(`   Source: ${article.source}`);
            console.log(`   Category: ${article.category}`);
            console.log(`   Read Time: ${article.readTime} min`);
            console.log(`   Featured: ${article.featured ? 'Yes' : 'No'}`);
            console.log(`   Tags: ${article.tags.join(', ')}`);
            console.log(`   Excerpt: ${article.excerpt.substring(0, 100)}...`);
            console.log(`   Content Preview: ${article.content.substring(0, 150)}...`);
        });
        
        // Show statistics
        console.log('\n📊 Demo Statistics:');
        const categories = [...new Set(rewrittenArticles.map(a => a.category))];
        const tags = [...new Set(rewrittenArticles.flatMap(a => a.tags))];
        const featuredCount = rewrittenArticles.filter(a => a.featured).length;
        
        console.log(`   - Total Articles: ${rewrittenArticles.length}`);
        console.log(`   - Categories: ${categories.length} (${categories.join(', ')})`);
        console.log(`   - Unique Tags: ${tags.length}`);
        console.log(`   - Featured Articles: ${featuredCount}`);
        console.log(`   - Average Read Time: ${Math.round(rewrittenArticles.reduce((sum, a) => sum + a.readTime, 0) / rewrittenArticles.length)} min`);
        
        console.log('\n✨ All articles now credited to "Hal O. Tip" for Wordeth!');
        console.log('🚀 This content is ready to be displayed on your homepage!');
        
    } catch (error) {
        console.error('❌ Demo failed:', error.message);
    }
}

// Run the demo
demoArticles();
