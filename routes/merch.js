const express = require('express');
const router = express.Router();
const InksoftService = require('../services/inksoft/inksoftService');
const auth = require('../middleware/auth');

const inksoftService = new InksoftService();

// Get all products
router.get('/products', async (req, res) => {
    try {
        const { category, limit } = req.query;
        const products = await inksoftService.getProducts(category, limit);
        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
});

// Get product details
router.get('/products/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const variants = await inksoftService.getProductVariants(productId);
        res.json({
            success: true,
            data: variants
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product details'
        });
    }
});

// Get available fonts
router.get('/fonts', async (req, res) => {
    try {
        const fonts = await inksoftService.getFonts();
        res.json({
            success: true,
            data: fonts
        });
    } catch (error) {
        console.error('Error fetching fonts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch fonts'
        });
    }
});

// Create custom design with lyrics
router.post('/designs', auth, async (req, res) => {
    try {
        const { productId, lyrics, options } = req.body;
        
        if (!productId || !lyrics) {
            return res.status(400).json({
                success: false,
                message: 'Product ID and lyrics are required'
            });
        }

        const design = await inksoftService.createLyricsDesign(productId, lyrics, options);
        
        res.json({
            success: true,
            data: design
        });
    } catch (error) {
        console.error('Error creating design:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create design'
        });
    }
});

// Generate design preview
router.get('/designs/:designId/preview', async (req, res) => {
    try {
        const { designId } = req.params;
        const previewUrl = await inksoftService.generatePreviewUrl(designId);
        
        res.json({
            success: true,
            data: { previewUrl }
        });
    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate preview'
        });
    }
});

// Calculate shipping
router.post('/shipping/calculate', async (req, res) => {
    try {
        const { productId, quantity, zipCode, country } = req.body;
        
        if (!productId || !quantity || !zipCode) {
            return res.status(400).json({
                success: false,
                message: 'Product ID, quantity, and zip code are required'
            });
        }

        const shipping = await inksoftService.calculateShipping(productId, quantity, zipCode, country);
        
        res.json({
            success: true,
            data: shipping
        });
    } catch (error) {
        console.error('Error calculating shipping:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate shipping'
        });
    }
});

// Create order
router.post('/orders', auth, async (req, res) => {
    try {
        const { designId, productId, quantity, customerInfo, shippingInfo } = req.body;
        
        if (!designId || !productId || !quantity || !customerInfo || !shippingInfo) {
            return res.status(400).json({
                success: false,
                message: 'All order information is required'
            });
        }

        const order = await inksoftService.createOrder(designId, productId, quantity, customerInfo, shippingInfo);
        
        res.json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
});

// Get order status
router.get('/orders/:orderId', auth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const orderStatus = await inksoftService.getOrderStatus(orderId);
        
        res.json({
            success: true,
            data: orderStatus
        });
    } catch (error) {
        console.error('Error fetching order status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order status'
        });
    }
});

// Get user's order history
router.get('/orders', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        // This would need to be implemented based on how you store order references
        // For now, returning a placeholder
        res.json({
            success: true,
            data: [],
            message: 'Order history feature coming soon'
        });
    } catch (error) {
        console.error('Error fetching order history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order history'
        });
    }
});

// Health check
router.get('/health', async (req, res) => {
    try {
        const health = await inksoftService.healthCheck();
        res.json({
            success: true,
            data: health
        });
    } catch (error) {
        console.error('Error checking health:', error);
        res.status(500).json({
            success: false,
            message: 'Health check failed'
        });
    }
});

module.exports = router;

