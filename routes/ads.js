const express = require('express');
const router = express.Router();

// Mock ad inventory database
let adInventory = {
    inVideo: [
        {
            id: 'ice_cream_1',
            type: 'in_video',
            title: 'Local Ice Cream Shop',
            description: 'Cool treats for hot days!',
            image: '/images/ads/ice-cream-ad.jpg',
            link: 'https://example.com/ice-cream',
            category: 'ice cream',
            targeting: ['dessert', 'sweet', 'treat', 'ice cream'],
            cpm: 2.50,
            active: true,
            impressions: 0,
            clicks: 0
        },
        {
            id: 'car_dealership_1',
            type: 'in_video',
            title: 'Premium Auto Sales',
            description: 'Drive your dreams today',
            image: '/images/ads/car-ad.jpg',
            link: 'https://example.com/cars',
            category: 'car',
            targeting: ['automotive', 'vehicle', 'driving', 'car'],
            cpm: 3.00,
            active: true,
            impressions: 0,
            clicks: 0
        }
    ],
    interstitial: [
        {
            id: 'fashion_brand_1',
            type: 'interstitial',
            title: 'Trending Fashion',
            description: 'Latest styles for music lovers',
            image: '/images/ads/fashion-ad.jpg',
            link: 'https://example.com/fashion',
            category: 'fashion',
            targeting: ['style', 'fashion', 'trendy', 'clothing'],
            cpm: 3.00,
            active: true,
            impressions: 0,
            clicks: 0
        },
        {
            id: 'tech_company_1',
            type: 'interstitial',
            title: 'Smart Tech Solutions',
            description: 'Innovation at your fingertips',
            image: '/images/ads/tech-ad.jpg',
            link: 'https://example.com/tech',
            category: 'tech',
            targeting: ['technology', 'innovation', 'smart', 'tech'],
            cpm: 3.50,
            active: true,
            impressions: 0,
            clicks: 0
        }
    ],
    hero: [
        {
            id: 'music_store_1',
            type: 'hero',
            title: 'Premium Music Store',
            description: 'Instruments and gear for every musician',
            image: '/images/ads/music-store-ad.jpg',
            link: 'https://example.com/music-store',
            category: 'music',
            targeting: ['music', 'instrument', 'gear', 'musician'],
            cpm: 4.00,
            active: true,
            impressions: 0,
            clicks: 0
        }
    ],
    skyscraper: [
        {
            id: 'concert_tickets_1',
            type: 'skyscraper',
            title: 'Live Concert Tickets',
            description: 'Get tickets to the hottest shows',
            image: '/images/ads/concert-ad.jpg',
            link: 'https://example.com/concerts',
            category: 'entertainment',
            targeting: ['concert', 'live', 'tickets', 'music'],
            cpm: 3.50,
            active: true,
            impressions: 0,
            clicks: 0
        }
    ]
};

// Mock analytics data
let analytics = {
    impressions: [],
    clicks: [],
    pageViews: []
};

// Get ad inventory
router.get('/inventory', (req, res) => {
    try {
        // Filter active ads only
        const activeInventory = {};
        Object.keys(adInventory).forEach(type => {
            activeInventory[type] = adInventory[type].filter(ad => ad.active);
        });
        
        res.json(activeInventory);
    } catch (error) {
        console.error('Error fetching ad inventory:', error);
        res.status(500).json({ error: 'Failed to fetch ad inventory' });
    }
});

// Track ad impression
router.post('/impression', (req, res) => {
    try {
        const { adId, adType, target, timestamp, userId } = req.body;
        
        // Find and update ad impression count
        Object.values(adInventory).flat().forEach(ad => {
            if (ad.id === adId) {
                ad.impressions++;
            }
        });
        
        // Store analytics data
        analytics.impressions.push({
            adId,
            adType,
            target,
            timestamp,
            userId,
            sessionId: req.sessionID
        });
        
        res.json({ success: true, message: 'Impression tracked' });
    } catch (error) {
        console.error('Error tracking impression:', error);
        res.status(500).json({ error: 'Failed to track impression' });
    }
});

// Track ad click
router.post('/click', (req, res) => {
    try {
        const { adId, adType, target, timestamp, userId } = req.body;
        
        // Find and update ad click count
        Object.values(adInventory).flat().forEach(ad => {
            if (ad.id === adId) {
                ad.clicks++;
            }
        });
        
        // Store analytics data
        analytics.clicks.push({
            adId,
            adType,
            target,
            timestamp,
            userId,
            sessionId: req.sessionID
        });
        
        res.json({ success: true, message: 'Click tracked' });
    } catch (error) {
        console.error('Error tracking click:', error);
        res.status(500).json({ error: 'Failed to track click' });
    }
});

// Track page view
router.post('/pageview', (req, res) => {
    try {
        const { page, timestamp, userId } = req.body;
        
        analytics.pageViews.push({
            page,
            timestamp,
            userId,
            sessionId: req.sessionID,
            userAgent: req.get('User-Agent'),
            referrer: req.get('Referrer')
        });
        
        res.json({ success: true, message: 'Page view tracked' });
    } catch (error) {
        console.error('Error tracking page view:', error);
        res.status(500).json({ error: 'Failed to track page view' });
    }
});

// Get contextual ads based on search
router.post('/contextual', (req, res) => {
    try {
        const { searchTerm, songData, userProfile } = req.body;
        
        // Analyze search for targeting
        const adTargets = analyzeSearchForAds(searchTerm, songData);
        
        // Find matching ads
        const matchingAds = [];
        Object.values(adInventory).flat().forEach(ad => {
            if (!ad.active) return;
            
            let matchScore = 0;
            
            // Category matching
            adTargets.forEach(target => {
                if (ad.category === target.category) {
                    matchScore += 0.8;
                }
            });
            
            // Keyword matching
            if (ad.targeting && searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                ad.targeting.forEach(keyword => {
                    if (searchLower.includes(keyword.toLowerCase())) {
                        matchScore += 0.6;
                    }
                });
            }
            
            // User profile matching
            if (userProfile && userProfile.interests) {
                userProfile.interests.forEach(interest => {
                    if (ad.targeting.includes(interest.toLowerCase())) {
                        matchScore += 0.4;
                    }
                });
            }
            
            if (matchScore > 0.3) {
                matchingAds.push({ ...ad, matchScore });
            }
        });
        
        // Sort by match score and CPM
        matchingAds.sort((a, b) => {
            const scoreA = a.matchScore * a.cpm;
            const scoreB = b.matchScore * b.cpm;
            return scoreB - scoreA;
        });
        
        res.json({
            ads: matchingAds.slice(0, 3), // Return top 3 matches
            targets: adTargets
        });
    } catch (error) {
        console.error('Error getting contextual ads:', error);
        res.status(500).json({ error: 'Failed to get contextual ads' });
    }
});

// Admin: Get analytics
router.get('/analytics', (req, res) => {
    try {
        const analyticsSummary = {
            totalImpressions: analytics.impressions.length,
            totalClicks: analytics.clicks.length,
            totalPageViews: analytics.pageViews.length,
            ctr: analytics.impressions.length > 0 ? 
                (analytics.clicks.length / analytics.impressions.length * 100).toFixed(2) : 0,
            adPerformance: {}
        };
        
        // Calculate performance by ad
        Object.values(adInventory).flat().forEach(ad => {
            analyticsSummary.adPerformance[ad.id] = {
                title: ad.title,
                impressions: ad.impressions,
                clicks: ad.clicks,
                ctr: ad.impressions > 0 ? (ad.clicks / ad.impressions * 100).toFixed(2) : 0,
                revenue: (ad.impressions / 1000) * ad.cpm
            };
        });
        
        res.json(analyticsSummary);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Admin: Add new ad
router.post('/admin/ad', (req, res) => {
    try {
        const { type, title, description, image, link, category, targeting, cpm } = req.body;
        
        const newAd = {
            id: `${category}_${Date.now()}`,
            type,
            title,
            description,
            image,
            link,
            category,
            targeting,
            cpm: parseFloat(cpm),
            active: true,
            impressions: 0,
            clicks: 0
        };
        
        if (!adInventory[type]) {
            adInventory[type] = [];
        }
        
        adInventory[type].push(newAd);
        
        res.json({ success: true, ad: newAd });
    } catch (error) {
        console.error('Error adding ad:', error);
        res.status(500).json({ error: 'Failed to add ad' });
    }
});

// Admin: Update ad
router.put('/admin/ad/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        let adFound = false;
        Object.values(adInventory).flat().forEach(ad => {
            if (ad.id === id) {
                Object.assign(ad, updates);
                adFound = true;
            }
        });
        
        if (!adFound) {
            return res.status(404).json({ error: 'Ad not found' });
        }
        
        res.json({ success: true, message: 'Ad updated' });
    } catch (error) {
        console.error('Error updating ad:', error);
        res.status(500).json({ error: 'Failed to update ad' });
    }
});

// Admin: Delete ad
router.delete('/admin/ad/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        let adFound = false;
        Object.keys(adInventory).forEach(type => {
            adInventory[type] = adInventory[type].filter(ad => {
                if (ad.id === id) {
                    adFound = true;
                    return false;
                }
                return true;
            });
        });
        
        if (!adFound) {
            return res.status(404).json({ error: 'Ad not found' });
        }
        
        res.json({ success: true, message: 'Ad deleted' });
    } catch (error) {
        console.error('Error deleting ad:', error);
        res.status(500).json({ error: 'Failed to delete ad' });
    }
});

// Helper function to analyze search for ads
function analyzeSearchForAds(searchTerm, songData = null) {
    const adTargets = [];
    
    if (!searchTerm) return adTargets;
    
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
        if (songData.artist) {
            adTargets.push({
                category: 'artist_merch',
                intent: 'purchase',
                confidence: 0.9,
                artist: songData.artist,
                searchTerm: searchTerm
            });
        }
        
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
    
    return adTargets;
}

module.exports = router;

