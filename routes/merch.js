const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const MerchOrder = require('../models/MerchOrder');
const { reconcilePendingFulfillmentsForOrder } = require('../services/apliiqFulfillment');
const { getStripeClient } = require('../services/stripeClient');

const VIEWS_BY_PRODUCT = {
    tshirt: ['front','back','left','right'],
    hoodie: ['front','back','left','right'],
    longsleeve: ['front','back','left','right'],
    sweatshirt: ['front','back','left','right'],
    hat: ['front','back','left','right'],
    tank: ['front','back']
};

const PRINT_AREAS = {
    tshirt:     { front: { x: 30, y: 18, w: 40, h: 45 }, back: { x: 30, y: 18, w: 40, h: 45 }, left: { x: 15, y: 20, w: 25, h: 35 }, right: { x: 60, y: 20, w: 25, h: 35 } },
    hoodie:     { front: { x: 28, y: 22, w: 44, h: 42 }, back: { x: 28, y: 18, w: 44, h: 45 }, left: { x: 12, y: 22, w: 28, h: 35 }, right: { x: 60, y: 22, w: 28, h: 35 } },
    tank:       { front: { x: 25, y: 15, w: 50, h: 50 }, back: { x: 25, y: 15, w: 50, h: 50 } },
    longsleeve: { front: { x: 30, y: 18, w: 40, h: 45 }, back: { x: 30, y: 18, w: 40, h: 45 }, left: { x: 10, y: 20, w: 22, h: 40 }, right: { x: 68, y: 20, w: 22, h: 40 } },
    sweatshirt: { front: { x: 28, y: 20, w: 44, h: 44 }, back: { x: 28, y: 18, w: 44, h: 46 }, left: { x: 12, y: 22, w: 28, h: 35 }, right: { x: 60, y: 22, w: 28, h: 35 } },
    hat:        { front: { x: 20, y: 25, w: 60, h: 40 }, back: { x: 20, y: 25, w: 60, h: 40 }, left: { x: 10, y: 25, w: 35, h: 40 }, right: { x: 55, y: 25, w: 35, h: 40 } }
};

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
const SHIPPING_OPTIONS = [
    { code: 'standard', label: 'Standard shipping', amount: 599, minDays: 3, maxDays: 7 },
    { code: 'upgraded', label: 'Upgraded shipping', amount: 1299, minDays: 2, maxDays: 4 },
    { code: 'rush', label: 'Rush shipping', amount: 2499, minDays: 1, maxDays: 2 }
];

function checkoutDomain() {
    return process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : process.env.CLIENT_URL || 'http://localhost:5000';
}

router.post('/orders', auth, async (req, res) => {
    try {
        const { product, color, size, quantity, artistName, artistId, frontDesign, backDesign, leftDesign, rightDesign, designPreview, templateId } = req.body;

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
        var leftStr = typeof leftDesign === 'string' ? leftDesign.substring(0, MAX_DESIGN_BYTES) : null;
        var rightStr = typeof rightDesign === 'string' ? rightDesign.substring(0, MAX_DESIGN_BYTES) : null;
        var previewStr = typeof designPreview === 'string' ? designPreview.substring(0, MAX_DESIGN_BYTES) : null;

        var allowedViews = VIEWS_BY_PRODUCT[product] || ['front','back'];
        if (leftStr && !allowedViews.includes('left')) leftStr = null;
        if (rightStr && !allowedViews.includes('right')) rightStr = null;

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
            leftDesign: leftStr,
            rightDesign: rightStr,
            designPreview: previewStr,
            templateId: templateId ? String(templateId).substring(0, 100) : null,
            status: 'pending',
            payment: { status: 'unpaid' },
            apliiq: { submissionStatus: 'not_ready' }
        });

        const stripe = getStripeClient();
        const domain = checkoutDomain();
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: req.user.email,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${catalogItem.name} — ${order.colorName} / ${size}`,
                        description: 'Custom Wordeth merchandise'
                    },
                    unit_amount: Math.round(unitPrice * 100)
                },
                quantity: qty
            }],
            shipping_address_collection: {
                allowed_countries: ['US', 'CA', 'GB', 'AU', 'NZ']
            },
            phone_number_collection: { enabled: true },
            shipping_options: SHIPPING_OPTIONS.map(option => ({
                shipping_rate_data: {
                    type: 'fixed_amount',
                    fixed_amount: { amount: option.amount, currency: 'usd' },
                    display_name: option.label,
                    metadata: { wordethShippingCode: option.code },
                    delivery_estimate: {
                        minimum: { unit: 'business_day', value: option.minDays },
                        maximum: { unit: 'business_day', value: option.maxDays }
                    }
                }
            })),
            metadata: {
                type: 'merch_order',
                merchOrderId: order._id.toString(),
                userId: req.user.id.toString()
            },
            payment_intent_data: {
                metadata: {
                    type: 'merch_order',
                    merchOrderId: order._id.toString(),
                    userId: req.user.id.toString()
                }
            },
            success_url: `${domain}/merch.html?payment=success&order=${order._id}`,
            cancel_url: `${domain}/merch.html?payment=canceled&order=${order._id}`
        });
        order.payment.stripeCheckoutSessionId = session.id;
        await order.save();

        await reconcilePendingFulfillmentsForOrder(order).catch(error => {
            console.error('[Apliiq] Pending fulfillment reconciliation failed:', error.message);
        });

        res.json({
            success: true,
            data: { orderId: order._id, status: order.status, checkoutUrl: session.url, sessionId: session.id },
            message: 'Checkout created'
        });
    } catch (error) {
        console.error('Error creating merch order:', error);
        res.status(500).json({ success: false, message: 'Failed to place order' });
    }
});

router.get('/orders', auth, async (req, res) => {
    try {
        const orders = await MerchOrder.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).select('-frontDesign -backDesign -leftDesign -rightDesign -designPreview');
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

router.get('/orders/:orderId/fulfillment', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const order = await MerchOrder.findById(req.params.orderId).populate('userId', 'username email');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        var allowedViews = VIEWS_BY_PRODUCT[order.product] || ['front','back'];
        var printAreas = PRINT_AREAS[order.product] || {};

        var designViews = [];
        if (order.frontDesign) {
            try {
                var fd = JSON.parse(order.frontDesign);
                designViews.push({
                    view: 'front',
                    printArea: printAreas.front || null,
                    objectCount: fd.objects ? fd.objects.length : 0,
                    fabricJson: fd
                });
            } catch(e) { /* skip malformed */ }
        }
        if (order.backDesign) {
            try {
                var bd = JSON.parse(order.backDesign);
                designViews.push({
                    view: 'back',
                    printArea: printAreas.back || null,
                    objectCount: bd.objects ? bd.objects.length : 0,
                    fabricJson: bd
                });
            } catch(e) { /* skip malformed */ }
        }
        if (order.leftDesign && allowedViews.includes('left')) {
            try {
                var ld = JSON.parse(order.leftDesign);
                designViews.push({
                    view: 'left',
                    printArea: printAreas.left || null,
                    objectCount: ld.objects ? ld.objects.length : 0,
                    fabricJson: ld
                });
            } catch(e) { /* skip malformed */ }
        }
        if (order.rightDesign && allowedViews.includes('right')) {
            try {
                var rd = JSON.parse(order.rightDesign);
                designViews.push({
                    view: 'right',
                    printArea: printAreas.right || null,
                    objectCount: rd.objects ? rd.objects.length : 0,
                    fabricJson: rd
                });
            } catch(e) { /* skip malformed */ }
        }

        var specSheet = {
            orderId: order._id,
            orderDate: order.createdAt,
            status: order.status,
            customer: order.userId ? { username: order.userId.username, email: order.userId.email } : null,
            product: {
                type: order.product,
                name: order.productName,
                color: order.color,
                colorName: order.colorName,
                size: order.size,
                quantity: order.quantity
            },
            pricing: {
                unitPrice: order.unitPrice,
                totalPrice: order.totalPrice
            },
            templateId: order.templateId || null,
            artistName: order.artistName || null,
            availableViews: allowedViews,
            designViews: designViews,
            printSpecs: {
                resolution: '300 DPI',
                format: 'Fabric.js JSON (render to PNG at print resolution)',
                colorMode: 'CMYK conversion required for DTG',
                notes: 'Each designView contains Fabric.js canvas JSON. Render at target print dimensions using node-canvas or headless browser. printArea values are percentages relative to garment dimensions.'
            }
        };

        res.json({ success: true, data: specSheet });
    } catch (error) {
        console.error('Error generating fulfillment spec:', error);
        res.status(500).json({ success: false, message: 'Failed to generate fulfillment spec' });
    }
});

router.get('/fulfillment/queue', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        var statusFilter = req.query.status || 'pending';
        var validStatuses = ['pending', 'confirmed', 'production', 'shipped', 'delivered', 'cancelled', 'refunded'];
        if (!validStatuses.includes(statusFilter)) {
            return res.status(400).json({ success: false, message: 'Invalid status filter' });
        }

        var page = Math.max(1, parseInt(req.query.page) || 1);
        var limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        var skip = (page - 1) * limit;

        var [orders, total] = await Promise.all([
            MerchOrder.find({ status: statusFilter })
                .populate('userId', 'username email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-frontDesign -backDesign -leftDesign -rightDesign -designPreview'),
            MerchOrder.countDocuments({ status: statusFilter })
        ]);

        var queue = orders.map(function(o) {
            var views = VIEWS_BY_PRODUCT[o.product] || ['front','back'];
            return {
                orderId: o._id,
                orderDate: o.createdAt,
                status: o.status,
                customer: o.userId ? { username: o.userId.username, email: o.userId.email } : null,
                product: o.productName,
                productType: o.product,
                color: o.colorName,
                size: o.size,
                quantity: o.quantity,
                totalPrice: o.totalPrice,
                templateId: o.templateId || null,
                paymentStatus: o.payment?.status || 'unpaid',
                apliqSubmission: {
                    status: o.apliiq?.submissionStatus || 'not_ready',
                    attempts: o.apliiq?.attempts || 0,
                    orderId: o.apliiq?.orderId || '',
                    lastError: o.apliiq?.lastError || ''
                },
                availableViews: views,
                fulfillmentUrl: '/api/merch/orders/' + o._id + '/fulfillment'
            };
        });

        res.json({
            success: true,
            data: queue,
            pagination: { page: page, limit: limit, total: total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Error fetching fulfillment queue:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch fulfillment queue' });
    }
});

router.patch('/orders/:orderId/status', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        var { status, trackingNumber, notes } = req.body;
        var validStatuses = ['pending', 'confirmed', 'production', 'shipped', 'delivered', 'cancelled', 'refunded'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        var update = { status: status };
        if (trackingNumber) update.trackingNumber = String(trackingNumber).substring(0, 200);
        if (notes) update.notes = String(notes).substring(0, 1000);

        if (status === 'cancelled' || status === 'refunded') {
            update['payment.status'] = status === 'refunded' ? 'refunded' : 'cancelled';
            update['payment.closedAt'] = new Date();
            update['apliiq.submissionStatus'] = 'cancelled';
            update['apliiq.nextAttemptAt'] = null;
        }

        var order = await MerchOrder.findByIdAndUpdate(req.params.orderId, { $set: update }, { new: true })
            .select('-frontDesign -backDesign -leftDesign -rightDesign -designPreview');

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.json({ success: true, data: order, message: 'Order status updated' });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Failed to update order status' });
    }
});

module.exports = router;
