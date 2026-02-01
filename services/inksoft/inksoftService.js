const axios = require('axios');
const crypto = require('crypto');

class InksoftService {
    constructor() {
        this.baseURL = process.env.INKSFOT_API_URL || 'https://api.inksoft.com/v1';
        this.apiKey = process.env.INKSFOT_API_KEY;
        this.companyId = process.env.INKSFOT_COMPANY_ID;
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Cache for performance optimization
        this.productCache = new Map();
        this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Get products with caching for performance
     */
    async getProducts(category = null, limit = 50) {
        const cacheKey = `products_${category}_${limit}`;
        const cached = this.productCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            const params = {
                companyId: this.companyId,
                limit: limit,
                includeVariants: true,
                includePricing: true
            };
            
            if (category) {
                params.category = category;
            }

            const response = await this.client.get('/products', { params });
            
            // Cache the results
            this.productCache.set(cacheKey, {
                data: response.data,
                timestamp: Date.now()
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching Inksoft products:', error);
            throw new Error('Failed to fetch products');
        }
    }

    /**
     * Create a custom design with lyrics
     */
    async createLyricsDesign(productId, lyrics, options = {}) {
        const {
            font = 'Arial',
            fontSize = 24,
            color = '#000000',
            position = { x: 50, y: 50 },
            maxWidth = 300,
            textAlign = 'center'
        } = options;

        try {
            // Truncate lyrics if too long for product
            const truncatedLyrics = this.truncateLyrics(lyrics, maxWidth, fontSize);
            
            const designData = {
                productId: productId,
                elements: [{
                    type: 'text',
                    content: truncatedLyrics,
                    font: font,
                    fontSize: fontSize,
                    color: color,
                    position: position,
                    textAlign: textAlign,
                    maxWidth: maxWidth
                }],
                metadata: {
                    source: 'wordeth',
                    lyrics: lyrics,
                    timestamp: new Date().toISOString()
                }
            };

            const response = await this.client.post('/designs', designData);
            return response.data;
        } catch (error) {
            console.error('Error creating lyrics design:', error);
            throw new Error('Failed to create design');
        }
    }

    /**
     * Create order with design
     */
    async createOrder(designId, productId, quantity, customerInfo, shippingInfo) {
        try {
            const orderData = {
                companyId: this.companyId,
                items: [{
                    designId: designId,
                    productId: productId,
                    quantity: quantity
                }],
                customer: customerInfo,
                shipping: shippingInfo,
                metadata: {
                    source: 'wordeth',
                    timestamp: new Date().toISOString()
                }
            };

            const response = await this.client.post('/orders', orderData);
            return response.data;
        } catch (error) {
            console.error('Error creating order:', error);
            throw new Error('Failed to create order');
        }
    }

    /**
     * Get order status
     */
    async getOrderStatus(orderId) {
        try {
            const response = await this.client.get(`/orders/${orderId}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching order status:', error);
            throw new Error('Failed to fetch order status');
        }
    }

    /**
     * Get available fonts
     */
    async getFonts() {
        try {
            const response = await this.client.get('/fonts');
            return response.data;
        } catch (error) {
            console.error('Error fetching fonts:', error);
            throw new Error('Failed to fetch fonts');
        }
    }

    /**
     * Get product variants (sizes, colors)
     */
    async getProductVariants(productId) {
        try {
            const response = await this.client.get(`/products/${productId}/variants`);
            return response.data;
        } catch (error) {
            console.error('Error fetching product variants:', error);
            throw new Error('Failed to fetch product variants');
        }
    }

    /**
     * Calculate shipping costs
     */
    async calculateShipping(productId, quantity, zipCode, country = 'US') {
        try {
            const response = await this.client.post('/shipping/calculate', {
                productId: productId,
                quantity: quantity,
                zipCode: zipCode,
                country: country
            });
            return response.data;
        } catch (error) {
            console.error('Error calculating shipping:', error);
            throw new Error('Failed to calculate shipping');
        }
    }

    /**
     * Generate design preview URL
     */
    async generatePreviewUrl(designId) {
        try {
            const response = await this.client.get(`/designs/${designId}/preview`);
            return response.data.previewUrl;
        } catch (error) {
            console.error('Error generating preview:', error);
            throw new Error('Failed to generate preview');
        }
    }

    /**
     * Utility: Truncate lyrics to fit product
     */
    truncateLyrics(lyrics, maxWidth, fontSize) {
        const words = lyrics.split(' ');
        const avgCharWidth = fontSize * 0.6; // Approximate character width
        const maxChars = Math.floor(maxWidth / avgCharWidth);
        
        if (lyrics.length <= maxChars) {
            return lyrics;
        }

        // Try to break at word boundaries
        let truncated = '';
        for (const word of words) {
            if ((truncated + ' ' + word).length <= maxChars) {
                truncated += (truncated ? ' ' : '') + word;
            } else {
                break;
            }
        }

        return truncated + (truncated.length < lyrics.length ? '...' : '');
    }

    /**
     * Clear cache (useful for admin operations)
     */
    clearCache() {
        this.productCache.clear();
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await this.client.get('/health');
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                apiVersion: response.data.version
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = InksoftService;

