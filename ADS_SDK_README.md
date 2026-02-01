# 🚀 Wordeth Ads SDK

A lightweight, standalone advertising system that can be embedded on any website to deliver contextual, targeted advertisements.

## ✨ Features

- **🎯 Contextual Targeting** - Ads automatically match your content and user behavior
- **📊 Real-time Analytics** - Track impressions, clicks, and revenue
- **🔒 Privacy Compliant** - GDPR-ready with cookie consent
- **📱 Mobile Optimized** - Responsive ad units for all devices
- **⚡ Lightweight** - Minimal impact on page load times
- **💰 Revenue Sharing** - Earn money from every ad impression

## 🚀 Quick Start

### 1. Include the SDK

```html
<script src="https://cdn.wordeth.com/wordeth-ads-sdk.js"></script>
```

### 2. Initialize

```javascript
const wordethAds = new WordethAds({
    siteId: 'your-site-id',
    apiUrl: 'https://api.wordeth.com/ads'
});
wordethAds.init();
```

### 3. That's it! 🎉

Ads will automatically appear on your website based on your content and user behavior.

## 📖 Full Documentation

### Configuration Options

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
    adTypes: ['banner', 'interstitial', 'skyscraper'],
    
    // Optional: Custom targeting parameters
    targeting: {
        category: 'technology',
        keywords: ['software', 'development'],
        location: 'US'
    }
});
```

### Available Ad Types

- **`banner`** - Standard banner ads (728x90, 300x250)
- **`interstitial`** - Full-screen ads shown on scroll
- **`skyscraper`** - Sidebar ads (160x600, 300x600)
- **`in_video`** - Overlay ads for video content

### Public API Methods

```javascript
// Refresh ads
wordethAds.refreshAds();

// Pause ads
wordethAds.pauseAds();

// Resume ads
wordethAds.resumeAds();

// Get statistics
const stats = wordethAds.getStats();
console.log(stats.impressions, stats.clicks);
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

## 🎯 Advanced Targeting

### Content-Based Targeting

The SDK automatically analyzes your page content to serve relevant ads:

```javascript
// The SDK will detect keywords like "ice cream" and serve relevant ads
<h1>Best Ice Cream Shops in NYC</h1>
<p>Looking for sweet treats and frozen desserts...</p>
```

### Custom Targeting

```javascript
const wordethAds = new WordethAds({
    siteId: 'food-blog',
    apiUrl: 'https://api.wordeth.com/ads',
    targeting: {
        category: 'food',
        keywords: ['restaurant', 'dining', 'cuisine'],
        audience: 'food-enthusiasts',
        location: 'New York'
    }
});
```

## 📊 Analytics & Reporting

### Real-time Statistics

```javascript
// Get current stats
const stats = wordethAds.getStats();

// Access individual metrics
console.log('Impressions:', stats.impressions);
console.log('Clicks:', stats.clicks);
console.log('CTR:', (stats.clicks / stats.impressions * 100).toFixed(2) + '%');
console.log('Revenue:', '$' + ((stats.impressions / 1000) * 2.5).toFixed(2));
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

## 📱 Mobile Optimization

The SDK automatically optimizes for mobile devices:

- Responsive ad units
- Touch-friendly interactions
- Optimized loading times
- Mobile-specific ad formats

## 🛠️ Customization

### Custom Ad Styling

```css
/* Override default styles */
.wordeth-ad-unit {
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

.wordeth-ad-title {
    font-family: 'Your Font', sans-serif;
    color: #your-brand-color;
}
```

### Custom Ad Slots

```javascript
// Create custom ad slot
const customSlot = document.createElement('div');
customSlot.id = 'my-custom-ad-slot';
document.body.appendChild(customSlot);

// Inject ad into custom slot
wordethAds.displayAd(ad, customSlot, 'banner');
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

## 🤝 Support

- **Documentation**: https://docs.wordeth.com/ads
- **API Reference**: https://api.wordeth.com/ads/docs
- **Support**: support@wordeth.com
- **Community**: https://community.wordeth.com

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Ready to start monetizing your website?** [Get started with Wordeth Ads](https://wordeth.com/ads) today! 🚀

