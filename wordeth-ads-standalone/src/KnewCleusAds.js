/**
 * Knew-Cleus Ads SDK
 * A lightweight, standalone advertising system that can be embedded on any website
 * 
 * @version 1.0.0
 * @author Knew-Cleus Team
 * @license MIT
 */

class KnewCleusAds {
    constructor(config = {}) {
        this.config = {
            siteId: config.siteId || 'default',
            apiUrl: config.apiUrl || 'https://api.wordeth.com/ads',
            userId: config.userId || null,
            autoInject: config.autoInject !== false,
            targeting: config.targeting || {},
            adTypes: config.adTypes || ['banner', 'interstitial'],
            debug: config.debug || false,
            ...config
        };
        
        this.adSlots = {};
        this.userProfile = this.getUserProfile();
        this.adInventory = [];
        this.cookieConsent = this.getCookieConsent();
        this.isInitialized = false;
        this.interstitialShown = false;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.injectAds = this.injectAds.bind(this);
        this.createAdSlot = this.createAdSlot.bind(this);
        
        if (this.config.debug) {
            console.log('KnewCleusAds initialized with config:', this.config);
        }
    }
    
    /**
     * Initialize the ad system
     */
    async init() {
        if (this.isInitialized) return;
        
        try {
            if (this.config.debug) {
                console.log('Initializing KnewCleusAds...');
            }
            
            // Load ad inventory
            await this.loadAdInventory();
            
            // Setup ad slots
            this.setupAdSlots();
            
            // Initialize tracking
            this.initializeTracking();
            
            // Auto-inject ads if enabled
            if (this.config.autoInject) {
                this.injectAds();
            }
            
            this.isInitialized = true;
            
            if (this.config.debug) {
                console.log('KnewCleusAds initialized successfully');
            }
            
            // Dispatch ready event
            this.dispatchEvent('knewCleusAdsReady', { sdk: this });
            
        } catch (error) {
            console.error('Failed to initialize KnewCleusAds:', error);
        }
    }
    
    /**
     * Load ad inventory from API
     */
    async loadAdInventory() {
        try {
            const response = await fetch(`${this.config.apiUrl}/inventory`);
            if (response.ok) {
                const inventory = await response.json();
                this.adInventory = Object.values(inventory).flat();
                
                if (this.config.debug) {
                    console.log('Loaded ad inventory:', this.adInventory.length, 'ads');
                }
            } else {
                throw new Error('Failed to load ad inventory');
            }
        } catch (error) {
            if (this.config.debug) {
                console.warn('Using fallback ad inventory');
            }
            this.adInventory = this.getFallbackInventory();
        }
    }
    
    /**
     * Get fallback ad inventory for offline/demo use
     */
    getFallbackInventory() {
        return [
            {
                id: 'demo_ice_cream',
                type: 'banner',
                title: 'Local Ice Cream Shop',
                description: 'Cool treats for hot days!',
                image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400',
                link: 'https://example.com/ice-cream',
                category: 'ice cream',
                targeting: ['dessert', 'sweet', 'treat'],
                cpm: 2.50
            },
            {
                id: 'demo_car',
                type: 'banner',
                title: 'Premium Auto Sales',
                description: 'Drive your dreams today',
                image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400',
                link: 'https://example.com/cars',
                category: 'car',
                targeting: ['automotive', 'vehicle', 'driving'],
                cpm: 3.00
            },
            {
                id: 'demo_tech',
                type: 'interstitial',
                title: 'Smart Tech Solutions',
                description: 'Innovation at your fingertips',
                image: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400',
                link: 'https://example.com/tech',
                category: 'tech',
                targeting: ['technology', 'innovation', 'smart'],
                cpm: 3.50
            }
        ];
    }
    
    /**
     * Setup ad slots on the page
     */
    setupAdSlots() {
        // Create ad slots based on configuration
        this.config.adTypes.forEach(type => {
            this.createAdSlot(type);
        });
    }
    
    /**
     * Create an ad slot of specified type
     */
    createAdSlot(type) {
        const slotId = `knew-cleus-ad-${type}-${Date.now()}`;
        const slot = document.createElement('div');
        slot.id = slotId;
        slot.className = `knew-cleus-ad-slot knew-cleus-ad-slot-${type}`;
        
        // Add slot to page
        document.body.appendChild(slot);
        this.adSlots[type] = slot;
        
        if (this.config.debug) {
            console.log('Created ad slot:', slotId);
        }
        
        return slot;
    }
    
    /**
     * Inject ads into available slots
     */
    injectAds() {
        if (!this.cookieConsent) {
            this.showCookieConsent();
            return;
        }
        
        Object.entries(this.adSlots).forEach(([type, slot]) => {
            const ads = this.getAdsForType(type);
            if (ads.length > 0) {
                const selectedAd = this.selectBestAd(ads);
                this.displayAd(selectedAd, slot, type);
            }
        });
    }
    
    /**
     * Get ads for specific type
     */
    getAdsForType(type) {
        return this.adInventory.filter(ad => ad.type === type);
    }
    
    /**
     * Select best ad based on targeting and performance
     */
    selectBestAd(ads) {
        // Simple selection for now - can be enhanced with ML
        return ads[Math.floor(Math.random() * ads.length)];
    }
    
    /**
     * Display ad in specified slot
     */
    displayAd(ad, slot, type) {
        const adElement = this.createAdElement(ad, type);
        slot.innerHTML = '';
        slot.appendChild(adElement);
        
        // Track impression
        this.trackImpression(ad);
        
        // Show with animation
        adElement.style.opacity = '0';
        setTimeout(() => {
            adElement.style.opacity = '1';
        }, 100);
        
        if (this.config.debug) {
            console.log('Displayed ad:', ad.id, 'in slot:', slot.id);
        }
    }
    
    /**
     * Create ad HTML element
     */
    createAdElement(ad, type) {
        const adDiv = document.createElement('div');
        adDiv.className = `knew-cleus-ad-unit knew-cleus-ad-${type}`;
        adDiv.innerHTML = `
            <div class="knew-cleus-ad-content">
                <div class="knew-cleus-ad-header">
                    <span class="knew-cleus-ad-label">Sponsored by Knew-Cleus</span>
                    <button class="knew-cleus-ad-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
                </div>
                <div class="knew-cleus-ad-body">
                    <img src="${ad.image}" alt="${ad.title}" class="knew-cleus-ad-image">
                    <div class="knew-cleus-ad-text">
                        <h3 class="knew-cleus-ad-title">${ad.title}</h3>
                        <p class="knew-cleus-ad-description">${ad.description}</p>
                    </div>
                </div>
                <a href="${ad.link}" class="knew-cleus-ad-link" target="_blank" rel="noopener">
                    Learn More
                </a>
            </div>
        `;
        
        // Add click tracking
        adDiv.querySelector('.knew-cleus-ad-link').addEventListener('click', () => {
            this.trackClick(ad);
        });
        
        return adDiv;
    }
    
    /**
     * Track ad impression
     */
    trackImpression(ad) {
        const data = {
            adId: ad.id,
            adType: ad.type,
            siteId: this.config.siteId,
            userId: this.config.userId,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent
        };
        
        // Send to API
        fetch(`${this.config.apiUrl}/impression`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).catch(console.error);
        
        // Store locally
        this.storeInteraction('impression', data);
        
        // Dispatch event
        this.dispatchEvent('knewCleusAdImpression', data);
    }
    
    /**
     * Track ad click
     */
    trackClick(ad) {
        const data = {
            adId: ad.id,
            adType: ad.type,
            siteId: this.config.siteId,
            userId: this.config.userId,
            timestamp: new Date().toISOString(),
            url: window.location.href
        };
        
        // Send to API
        fetch(`${this.config.apiUrl}/click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).catch(console.error);
        
        // Store locally
        this.storeInteraction('click', data);
        
        // Dispatch event
        this.dispatchEvent('knewCleusAdClick', data);
    }
    
    /**
     * Store interaction locally
     */
    storeInteraction(type, data) {
        const interactions = JSON.parse(localStorage.getItem('knew_cleus_ad_interactions') || '[]');
        interactions.push({ type, ...data });
        localStorage.setItem('knew_cleus_ad_interactions', JSON.stringify(interactions.slice(-100)));
    }
    
    /**
     * Initialize tracking
     */
    initializeTracking() {
        // Track page view
        this.trackPageView();
        
        // Track scroll depth for interstitial ads
        this.trackScrollDepth();
    }
    
    /**
     * Track page view
     */
    trackPageView() {
        const data = {
            siteId: this.config.siteId,
            userId: this.config.userId,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };
        
        fetch(`${this.config.apiUrl}/pageview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).catch(console.error);
    }
    
    /**
     * Track scroll depth for interstitial ads
     */
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
    
    /**
     * Show interstitial ad
     */
    showInterstitialAd() {
        const interstitialAds = this.getAdsForType('interstitial');
        if (interstitialAds.length === 0) return;
        
        const ad = this.selectBestAd(interstitialAds);
        const slot = this.createAdSlot('interstitial');
        this.displayAd(ad, slot, 'interstitial');
    }
    
    /**
     * Show cookie consent banner
     */
    showCookieConsent() {
        const banner = document.createElement('div');
        banner.className = 'knew-cleus-cookie-consent-banner';
        banner.innerHTML = `
            <div class="knew-cleus-cookie-consent-content">
                <div class="knew-cleus-cookie-consent-text">
                    This site uses cookies and similar technologies to deliver personalized ads. 
                    By continuing to use this site, you consent to our use of cookies.
                </div>
                <div class="knew-cleus-cookie-consent-buttons">
                    <button class="knew-cleus-cookie-consent-btn accept">Accept</button>
                    <button class="knew-cleus-cookie-consent-btn decline">Decline</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Add event listeners
        banner.querySelector('.accept').addEventListener('click', () => {
            this.setCookieConsent(true);
            banner.remove();
            this.injectAds();
        });
        
        banner.querySelector('.decline').addEventListener('click', () => {
            this.setCookieConsent(false);
            banner.remove();
        });
        
        // Show banner
        setTimeout(() => banner.classList.add('show'), 1000);
    }
    
    /**
     * Get user profile from localStorage
     */
    getUserProfile() {
        const profile = localStorage.getItem('knew_cleus_user_profile');
        return profile ? JSON.parse(profile) : {
            interests: [],
            location: null,
            age: null,
            gender: null,
            searchHistory: [],
            adPreferences: {}
        };
    }
    
    /**
     * Get cookie consent status
     */
    getCookieConsent() {
        return localStorage.getItem('knew_cleus_cookie_consent') === 'true';
    }
    
    /**
     * Set cookie consent
     */
    setCookieConsent(consent) {
        localStorage.setItem('knew_cleus_cookie_consent', consent.toString());
        this.cookieConsent = consent;
    }
    
    /**
     * Dispatch custom events
     */
    dispatchEvent(name, detail) {
        const event = new CustomEvent(name, { detail });
        window.dispatchEvent(event);
    }
    
    /**
     * Public API methods
     */
    refreshAds() {
        this.injectAds();
    }
    
    pauseAds() {
        Object.values(this.adSlots).forEach(slot => {
            slot.style.display = 'none';
        });
    }
    
    resumeAds() {
        Object.values(this.adSlots).forEach(slot => {
            slot.style.display = 'block';
        });
    }
    
    getStats() {
        const interactions = JSON.parse(localStorage.getItem('knew_cleus_ad_interactions') || '[]');
        return {
            impressions: interactions.filter(i => i.type === 'impression').length,
            clicks: interactions.filter(i => i.type === 'click').length,
            interactions: interactions
        };
    }
}

export default KnewCleusAds;
