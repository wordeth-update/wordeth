// Wordeth Advertising System
// Handles contextual ads, user targeting, and ad placement

class WordethAds {
    constructor() {
        this.adSlots = {};
        this.userProfile = this.getUserProfile();
        this.adInventory = this.loadAdInventory();
        this.cookieConsent = this.getCookieConsent();
        
        this.init();
    }
    
    init() {
        this.setupAdSlots();
        this.loadUserPreferences();
        this.initializeAdTracking();
    }
    
    // Get user profile from cookies/localStorage
    getUserProfile() {
        const profile = localStorage.getItem('wordeth_user_profile');
        return profile ? JSON.parse(profile) : {
            interests: [],
            location: null,
            age: null,
            gender: null,
            searchHistory: [],
            adPreferences: {}
        };
    }
    
    // Load ad inventory from server
    async loadAdInventory() {
        try {
            const response = await fetch(apiUrl('/api/ads/inventory'));
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.log('Using mock ad inventory');
        }
        
        // Mock ad inventory for development
        return {
            inVideo: [
                {
                    id: 'ice_cream_1',
                    type: 'in_video',
                    title: 'Local Ice Cream Shop',
                    description: 'Cool treats for hot days!',
                    image: '/images/ads/ice-cream-ad.jpg',
                    link: 'https://example.com/ice-cream',
                    category: 'ice cream',
                    targeting: ['dessert', 'sweet', 'treat'],
                    cpm: 2.50
                }
            ],
            interstitial: [
                {
                    id: 'car_dealership_1',
                    type: 'interstitial',
                    title: 'Premium Auto Sales',
                    description: 'Drive your dreams today',
                    image: '/images/ads/car-ad.jpg',
                    link: 'https://example.com/cars',
                    category: 'car',
                    targeting: ['automotive', 'vehicle', 'driving'],
                    cpm: 3.00
                }
            ],
            hero: [
                {
                    id: 'fashion_brand_1',
                    type: 'hero',
                    title: 'Trending Fashion',
                    description: 'Latest styles for music lovers',
                    image: '/images/ads/fashion-ad.jpg',
                    link: 'https://example.com/fashion',
                    category: 'fashion',
                    targeting: ['style', 'fashion', 'trendy'],
                    cpm: 4.00
                }
            ],
            skyscraper: [
                {
                    id: 'tech_company_1',
                    type: 'skyscraper',
                    title: 'Smart Tech Solutions',
                    description: 'Innovation at your fingertips',
                    image: '/images/ads/tech-ad.jpg',
                    link: 'https://example.com/tech',
                    category: 'tech',
                    targeting: ['technology', 'innovation', 'smart'],
                    cpm: 3.50
                }
            ]
        };
    }
    
    // Setup ad slots on the page
    setupAdSlots() {
        // In-video ad slot
        this.adSlots.inVideo = document.getElementById('in-video-ad-slot');
        
        // Interstitial ad slot
        this.adSlots.interstitial = document.getElementById('interstitial-ad-slot');
        
        // Hero ad slot
        this.adSlots.hero = document.getElementById('hero-ad-slot');
        
        // Skyscraper ad slot
        this.adSlots.skyscraper = document.getElementById('skyscraper-ad-slot');
        
        // Create ad slots if they don't exist
        this.createAdSlots();
    }
    
    // Create ad slots dynamically
    createAdSlots() {
        // Create in-video ad slot
        if (!this.adSlots.inVideo) {
            const videoContainer = document.querySelector('.video-room');
            if (videoContainer) {
                const adSlot = document.createElement('div');
                adSlot.id = 'in-video-ad-slot';
                adSlot.className = 'in-video-ad-slot';
                videoContainer.appendChild(adSlot);
                this.adSlots.inVideo = adSlot;
            }
        }
        
        // Create interstitial ad slot
        if (!this.adSlots.interstitial) {
            const adSlot = document.createElement('div');
            adSlot.id = 'interstitial-ad-slot';
            adSlot.className = 'interstitial-ad-slot';
            document.body.appendChild(adSlot);
            this.adSlots.interstitial = adSlot;
        }
        
        // Create hero ad slot on homepage
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            if (!this.adSlots.hero) {
                const heroSection = document.querySelector('.hero-section');
                if (heroSection) {
                    const adSlot = document.createElement('div');
                    adSlot.id = 'hero-ad-slot';
                    adSlot.className = 'hero-ad-slot';
                    heroSection.appendChild(adSlot);
                    this.adSlots.hero = adSlot;
                }
            }
        }
        
        // Create skyscraper ad slot
        if (!this.adSlots.skyscraper) {
            const sidebar = document.querySelector('.sidebar') || document.querySelector('aside');
            if (sidebar) {
                const adSlot = document.createElement('div');
                adSlot.id = 'skyscraper-ad-slot';
                adSlot.className = 'skyscraper-ad-slot';
                sidebar.appendChild(adSlot);
                this.adSlots.skyscraper = adSlot;
            }
        }
    }
    
    // Trigger contextual ads based on search/lyrics
    triggerContextualAds(adTargets) {
        if (!this.cookieConsent) return;
        
        adTargets.forEach(target => {
            const matchingAds = this.findMatchingAds(target);
            
            if (matchingAds.length > 0) {
                const selectedAd = this.selectBestAd(matchingAds, target);
                this.displayAd(selectedAd, target);
            }
        });
    }
    
    // Find ads matching the targeting criteria
    findMatchingAds(target) {
        const matchingAds = [];
        
        Object.values(this.adInventory).flat().forEach(ad => {
            let matchScore = 0;
            
            // Category matching
            if (ad.category === target.category) {
                matchScore += 0.8;
            }
            
            // Keyword matching
            if (ad.targeting && target.searchTerm) {
                const searchLower = target.searchTerm.toLowerCase();
                ad.targeting.forEach(keyword => {
                    if (searchLower.includes(keyword.toLowerCase())) {
                        matchScore += 0.6;
                    }
                });
            }
            
            // Intent matching
            if (ad.intent === target.intent) {
                matchScore += 0.4;
            }
            
            if (matchScore > 0.3) {
                matchingAds.push({ ...ad, matchScore });
            }
        });
        
        return matchingAds;
    }
    
    // Select the best ad based on targeting and performance
    selectBestAd(matchingAds, target) {
        // Sort by match score and CPM
        matchingAds.sort((a, b) => {
            const scoreA = a.matchScore * a.cpm;
            const scoreB = b.matchScore * b.cpm;
            return scoreB - scoreA;
        });
        
        return matchingAds[0];
    }
    
    // Display ad in appropriate slot
    displayAd(ad, target) {
        const adSlot = this.getAdSlot(ad.type);
        if (!adSlot) return;
        
        const adElement = this.createAdElement(ad, target);
        adSlot.innerHTML = '';
        adSlot.appendChild(adElement);
        
        // Track ad impression
        this.trackAdImpression(ad, target);
        
        // Show ad with animation
        adElement.style.opacity = '0';
        setTimeout(() => {
            adElement.style.opacity = '1';
        }, 100);
    }
    
    // Get appropriate ad slot
    getAdSlot(adType) {
        switch (adType) {
            case 'in_video':
                return this.adSlots.inVideo;
            case 'interstitial':
                return this.adSlots.interstitial;
            case 'hero':
                return this.adSlots.hero;
            case 'skyscraper':
                return this.adSlots.skyscraper;
            default:
                return null;
        }
    }
    
    // Create ad HTML element
    createAdElement(ad, target) {
        const adDiv = document.createElement('div');
        adDiv.className = `wordeth-ad-unit wordeth-ad-${ad.type}`;
        adDiv.innerHTML = `
            <div class="wordeth-ad-content">
                <div class="wordeth-ad-header">
                    <span class="wordeth-ad-label">Sponsored</span>
                    <button class="wordeth-ad-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
                </div>
                <div class="wordeth-ad-body">
                    <img src="${ad.image}" alt="${ad.title}" class="wordeth-ad-image">
                    <div class="wordeth-ad-text">
                        <h3 class="wordeth-ad-title">${ad.title}</h3>
                        <p class="wordeth-ad-description">${ad.description}</p>
                    </div>
                </div>
                <a href="${ad.link}" class="wordeth-ad-link" target="_blank" rel="noopener">
                    Learn More
                </a>
            </div>
        `;
        
        // Add click tracking
        adDiv.querySelector('.wordeth-ad-link').addEventListener('click', () => {
            this.trackAdClick(ad, target);
        });
        
        return adDiv;
    }
    
    // Track ad impression
    trackAdImpression(ad, target) {
        const impressionData = {
            adId: ad.id,
            adType: ad.type,
            target: target,
            timestamp: new Date().toISOString(),
            userId: this.userProfile.id || 'anonymous'
        };
        
        if (!this.getCookieConsent()) return;
        fetch(apiUrl('/api/ads/impression'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(impressionData)
        }).catch(console.error);
        
        this.storeAdInteraction('impression', impressionData);
    }
    
    // Track ad click
    trackAdClick(ad, target) {
        const clickData = {
            adId: ad.id,
            adType: ad.type,
            target: target,
            timestamp: new Date().toISOString(),
            userId: this.userProfile.id || 'anonymous'
        };
        
        if (!this.getCookieConsent()) return;
        fetch(apiUrl('/api/ads/click'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clickData)
        }).catch(console.error);
        
        this.storeAdInteraction('click', clickData);
    }
    
    // Store ad interactions locally
    storeAdInteraction(type, data) {
        const interactions = JSON.parse(localStorage.getItem('ad_interactions') || '[]');
        interactions.push({ type, ...data });
        localStorage.setItem('ad_interactions', JSON.stringify(interactions.slice(-100))); // Keep last 100
    }
    
    // Load user preferences
    loadUserPreferences() {
        const preferences = localStorage.getItem('ad_preferences');
        if (preferences) {
            this.userProfile.adPreferences = JSON.parse(preferences);
        }
    }
    
    // Initialize ad tracking
    initializeAdTracking() {
        // Track page views
        this.trackPageView();
        
        // Track scroll depth for interstitial ads
        this.trackScrollDepth();
    }
    
    // Track page view
    trackPageView() {
        const pageData = {
            page: window.location.pathname,
            timestamp: new Date().toISOString(),
            userId: this.userProfile.id || 'anonymous'
        };
        
        fetch(apiUrl('/api/ads/pageview'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pageData)
        }).catch(console.error);
    }
    
    // Track scroll depth for interstitial ads
    trackScrollDepth() {
        let maxScroll = 0;
        
        window.addEventListener('scroll', () => {
            const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
            
            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent;
                
                // Show interstitial ad after first scroll
                if (maxScroll > 10 && !this.interstitialShown) {
                    this.showInterstitialAd();
                    this.interstitialShown = true;
                }
            }
        });
    }
    
    // Show interstitial ad
    showInterstitialAd() {
        const interstitialAds = this.adInventory.interstitial || [];
        if (interstitialAds.length === 0) return;
        
        const randomAd = interstitialAds[Math.floor(Math.random() * interstitialAds.length)];
        this.displayAd(randomAd, { category: 'general', intent: 'awareness' });
    }
    
    // Get cookie consent status
    getCookieConsent() {
        try {
            const consent = JSON.parse(localStorage.getItem('wordeth_cookie_consent') || '{}');
            return consent.accepted === true;
        } catch { return false; }
    }
    
    setCookieConsent(consent) {
        this.cookieConsent = consent;
    }
}

// Initialize advertising system
const wordethAds = new WordethAds();

// Export for use in other modules
window.wordethAds = wordethAds;
