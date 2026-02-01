# 🚀 Knew-Cleus Ads SDK

A lightweight, standalone advertising system that can be embedded on any website to deliver contextual, targeted advertisements.

## ✨ Features

- **🎯 Contextual Targeting** - Ads automatically match your content and user behavior
- **📊 Real-time Analytics** - Track impressions, clicks, and revenue
- **🔒 Privacy Compliant** - GDPR-ready with cookie consent
- **📱 Mobile Optimized** - Responsive ad units for all devices
- **⚡ Lightweight** - Minimal impact on page load times
- **💰 Revenue Sharing** - Earn money from every ad impression

## 🚀 Quick Start

### 1. Download the SDK

```bash
# Option 1: Download from CDN (recommended)
# Add this to your HTML head section
<script src="https://cdn.knew-cleus.com/knew-cleus-ads.min.js"></script>

# Option 2: Download and host locally
# Download knew-cleus-ads.min.js and add to your project
```

### 2. Initialize

```html
<script>
    const knewCleusAds = new KnewCleusAds({
        siteId: 'your-site-id',
        apiUrl: 'https://api.knew-cleus.com/ads'
    });
    knewCleusAds.init();
</script>
```

### 3. That's it! 🎉

Ads will automatically appear on your website based on your content and user behavior.

## 📦 Installation

### CDN (Recommended)

```html
<script src="https://cdn.knew-cleus.com/knew-cleus-ads.min.js"></script>
```

### Local Installation

1. Download `knew-cleus-ads.min.js`
2. Add to your project directory
3. Include in your HTML:

```html
<script src="path/to/knew-cleus-ads.min.js"></script>
```

### NPM (Coming Soon)

```bash
npm install knew-cleus-ads
```

## 📖 Configuration

### Basic Configuration

```javascript
const wordethAds = new WordethAds({
    // Required: Unique identifier for your site
    siteId: 'your-site-id',
    
    // Required: Wordeth Ads API endpoint
    apiUrl: 'https://api.wordeth.com/ads',
    
    // Optional: User ID for personalized targeting
    userId: 'user-123',
    
    // Optional: Auto-inject ads (default: true)
    autoInject: true,
    
    // Optional: Ad types to display
    adTypes: ['banner', 'interstitial'],
    
    // Optional: Enable debug mode
    debug: false
});
```

### Advanced Configuration

```javascript
const wordethAds = new WordethAds({
    siteId: 'my-blog',
    apiUrl: 'https://api.wordeth.com/ads',
    
    // Custom targeting
    targeting: {
        category: 'technology',
        keywords: ['software', 'development'],
        location: 'US',
        audience: 'developers'
    },
    
    // Specific ad types
    adTypes: ['banner', 'interstitial', 'skyscraper'],
    
    // Custom user profile
    userProfile: {
        interests: ['programming', 'tech'],
        age: 25,
        location: 'San Francisco'
    }
});
```

## 🎯 Ad Types

### Banner Ads
- **Size**: 728x90, 300x250
- **Placement**: In-content, header, footer
- **Best for**: General monetization

### Interstitial Ads
- **Size**: 300x250, 320x480
- **Placement**: Full-screen overlay
- **Best for**: High engagement, premium content

### Skyscraper Ads
- **Size**: 160x600, 300x600
- **Placement**: Sidebar, fixed position
- **Best for**: Continuous visibility

## 📊 Analytics & Reporting

### Real-time Statistics

```javascript
// Get current stats
const stats = wordethAds.getStats();

console.log('Impressions:', stats.impressions);
console.log('Clicks:', stats.clicks);
console.log('CTR:', (stats.clicks / stats.impressions * 100).toFixed(2) + '%');
```

### Dashboard Access

Visit your Wordeth Ads dashboard at `https://wordeth.com/ads/dashboard` to view:

- Detailed performance metrics
- Revenue reports
- Audience insights
- Ad performance by type
- Geographic distribution

## 🔒 Privacy & Compliance

### Cookie Consent

The SDK automatically handles cookie consent:

```javascript
// Check consent status
const hasConsent = wordethAds.getCookieConsent();

// Set consent programmatically
wordethAds.setCookieConsent(true);
```

### GDPR Compliance

- Automatic cookie consent banner
- Transparent data collection
- User opt-out functionality
- Data retention controls

## 🛠️ API Reference

### Methods

```javascript
// Initialize the SDK
wordethAds.init();

// Refresh ads
wordethAds.refreshAds();

// Pause ads
wordethAds.pauseAds();

// Resume ads
wordethAds.resumeAds();

// Get statistics
const stats = wordethAds.getStats();
```

### Events

```javascript
// Listen for SDK ready event
window.addEventListener('wordethAdsReady', (event) => {
    console.log('SDK ready:', event.detail);
});

// Listen for ad impressions
window.addEventListener('wordethAdImpression', (event) => {
    console.log('Ad impression:', event.detail);
});

// Listen for ad clicks
window.addEventListener('wordethAdClick', (event) => {
    console.log('Ad click:', event.detail);
});
```

## 🚀 Performance Optimization

### Lazy Loading

```javascript
// Initialize ads only when needed
const wordethAds = new WordethAds({
    autoInject: false // Disable auto-injection
});

// Inject ads when user scrolls
window.addEventListener('scroll', () => {
    if (!wordethAds.isInitialized) {
        wordethAds.init();
    }
});
```

### Preloading

```javascript
// Preload ad inventory
wordethAds.loadAdInventory().then(() => {
    console.log('Ads preloaded successfully');
});
```

## 🔧 Troubleshooting

### Common Issues

**Ads not showing:**
- Check browser console for errors
- Verify `siteId` is correct
- Ensure `apiUrl` is accessible
- Check cookie consent status

**Performance issues:**
- Enable lazy loading
- Reduce number of ad types
- Optimize ad images
- Use CDN for SDK

### Debug Mode

```javascript
const wordethAds = new WordethAds({
    siteId: 'your-site-id',
    apiUrl: 'https://api.wordeth.com/ads',
    debug: true // Enable debug logging
});
```

## 📈 Revenue Optimization

### Best Practices

1. **Strategic Placement** - Place ads in high-visibility areas
2. **Content Relevance** - Ensure ads match your content
3. **User Experience** - Don't overwhelm users with too many ads
4. **Mobile First** - Optimize for mobile users
5. **A/B Testing** - Test different ad placements and formats

### Revenue Calculator

```javascript
// Calculate potential revenue
const impressions = 10000;
const cpm = 2.50; // Cost per thousand impressions
const revenue = (impressions / 1000) * cpm;
console.log('Potential revenue: $' + revenue.toFixed(2));
```

## 🌟 Examples

### Basic Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
    <script src="https://cdn.wordeth.com/wordeth-ads.min.js"></script>
</head>
<body>
    <h1>Welcome to My Site</h1>
    <p>Content goes here...</p>
    
    <script>
        const wordethAds = new WordethAds({
            siteId: 'my-website',
            apiUrl: 'https://api.wordeth.com/ads'
        });
        wordethAds.init();
    </script>
</body>
</html>
```

### Advanced Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>Tech Blog</title>
    <script src="https://cdn.wordeth.com/wordeth-ads.min.js"></script>
</head>
<body>
    <header>
        <h1>Tech Blog</h1>
    </header>
    
    <main>
        <article>
            <h2>Latest in AI Technology</h2>
            <p>Content about artificial intelligence...</p>
        </article>
    </main>
    
    <script>
        const wordethAds = new WordethAds({
            siteId: 'tech-blog',
            apiUrl: 'https://api.wordeth.com/ads',
            targeting: {
                category: 'technology',
                keywords: ['AI', 'machine learning', 'tech']
            },
            adTypes: ['banner', 'interstitial'],
            debug: true
        });
        
        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', () => {
            wordethAds.init();
        });
        
        // Track custom events
        window.addEventListener('wordethAdImpression', (event) => {
            console.log('Ad shown:', event.detail);
        });
    </script>
</body>
</html>
```

## 🤝 Support

- **Documentation**: https://docs.wordeth.com/ads
- **API Reference**: https://api.wordeth.com/ads/docs
- **Support**: support@wordeth.com
- **Community**: https://community.wordeth.com
- **GitHub**: https://github.com/wordeth/wordeth-ads

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🚀 Roadmap

- [ ] Advanced targeting algorithms
- [ ] A/B testing framework
- [ ] Real-time bidding
- [ ] Video ad support
- [ ] Native ad formats
- [ ] Programmatic buying

---

**Ready to start monetizing your website?** [Get started with Wordeth Ads](https://wordeth.com/ads) today! 🚀
