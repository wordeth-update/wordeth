const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

const merchOrderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: String, required: true },
    productName: { type: String, required: true },
    color: { type: String, required: true },
    colorName: { type: String },
    size: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    artistName: String,
    artistId: String,
    frontDesign: String,
    backDesign: String,
    designPreview: String,
    status: { type: String, default: 'pending', enum: ['pending', 'confirmed', 'production', 'shipped', 'delivered', 'cancelled'] },
    trackingNumber: String,
    notes: String
}, { timestamps: true });

const MerchOrder = mongoose.models.MerchOrder || mongoose.model('MerchOrder', merchOrderSchema);

const PRODUCT_CATALOG = {
    tshirt:     { name: 'T-Shirt',     price: 29.99 },
    hoodie:     { name: 'Hoodie',      price: 54.99 },
    tank:       { name: 'Tank Top',    price: 24.99 },
    longsleeve: { name: 'Long Sleeve', price: 34.99 },
    sweatshirt: { name: 'Sweatshirt',  price: 44.99 },
    hat:        { name: 'Cap',         price: 24.99 }
};

const VALID_COLORS = ['black','white','navy','gray','forest','burgundy','sand','slate'];
const VALID_SIZES = ['XS','S','M','L','XL','2XL','3XL'];
const MAX_DESIGN_BYTES = 500000;

router.post('/orders', auth, async (req, res) => {
    try {
        const { product, color, size, quantity, artistName, artistId, frontDesign, backDesign, designPreview } = req.body;

        const catalogItem = PRODUCT_CATALOG[product];
        if (!catalogItem) {
            return res.status(400).json({ success: false, message: 'Invalid product type' });
        }

        if (!VALID_COLORS.includes(color)) {
            return res.status(400).json({ success: false, message: 'Invalid color' });
        }

        if (!VALID_SIZES.includes(size)) {
            return res.status(400).json({ success: false, message: 'Invalid size' });
        }

        var qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty < 1 || qty > 50) {
            return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 50' });
        }

        var unitPrice = catalogItem.price;
        var totalPrice = +(unitPrice * qty).toFixed(2);

        var frontStr = typeof frontDesign === 'string' ? frontDesign.substring(0, MAX_DESIGN_BYTES) : null;
        var backStr = typeof backDesign === 'string' ? backDesign.substring(0, MAX_DESIGN_BYTES) : null;
        var previewStr = typeof designPreview === 'string' ? designPreview.substring(0, MAX_DESIGN_BYTES) : null;

        const order = await MerchOrder.create({
            userId: req.user.id,
            product,
            productName: catalogItem.name,
            color,
            colorName: color.charAt(0).toUpperCase() + color.slice(1),
            size,
            quantity: qty,
            unitPrice,
            totalPrice,
            artistName: artistName ? String(artistName).substring(0, 200) : null,
            artistId: artistId ? String(artistId).substring(0, 100) : null,
            frontDesign: frontStr,
            backDesign: backStr,
            designPreview: previewStr,
            status: 'pending'
        });

        res.json({ success: true, data: { orderId: order._id, status: order.status }, message: 'Order placed successfully' });
    } catch (error) {
        console.error('Error creating merch order:', error);
        res.status(500).json({ success: false, message: 'Failed to place order' });
    }
});

router.get('/orders', auth, async (req, res) => {
    try {
        const orders = await MerchOrder.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).select('-frontDesign -backDesign -designPreview');
        res.json({ success: true, data: orders });
    } catch (error) {
        console.error('Error fetching order history:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch order history' });
    }
});

router.get('/orders/:orderId', auth, async (req, res) => {
    try {
        const order = await MerchOrder.findOne({ _id: req.params.orderId, userId: req.user.id }).select('-designPreview');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        res.json({ success: true, data: order });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch order' });
    }
});

module.exports = router;
