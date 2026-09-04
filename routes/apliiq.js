const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const ApliiqEvent = require('../models/ApliiqEvent');
const ApliiqProduct = require('../models/ApliiqProduct');
const ApliiqWarehouseShipment = require('../models/ApliiqWarehouseShipment');
const {
    approvedSnapshot,
    materialReviewHash,
    registerWordethProductIntent
} = require('../services/apliiqProductReview');
const {
    applyFulfillmentPayload,
    extractFulfillment,
    reconcilePendingFulfillmentEvent
} = require('../services/apliiqFulfillment');
const {
    parseApliiqJson,
    requireFulfillmentSignature,
    requireWarehouseAppId
} = require('../middleware/apliiq');

const router = express.Router();
const MAX_PRODUCTS_PER_SEARCH = 50;
const MAX_VARIANTS = 500;
const MAX_WAREHOUSE_SHIPMENTS = 100;
const EVENT_LEASE_MS = 5 * 60 * 1000;
const WORDETH_PRODUCTS = ['tshirt', 'hoodie', 'tank', 'longsleeve', 'sweatshirt', 'hat'];

router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    next();
});
router.use(parseApliiqJson);

function requireAdmin(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(header.substring(7), process.env.JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.adminId = stringValue(decoded.advertiserId, 200);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function stringValue(value, maxLength = 500) {
    if (value === null || value === undefined) return '';
    return String(value).trim().substring(0, maxLength);
}

function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function stringArray(value, maxItems = 100, maxLength = 500) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, maxItems).map(item => stringValue(item, maxLength)).filter(Boolean);
}

function httpsUrl(value) {
    const candidate = stringValue(value, 2000);
    if (!candidate) return '';
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'https:' ? parsed.toString() : '';
    } catch (error) {
        return '';
    }
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((result, key) => {
            result[key] = stableValue(value[key]);
            return result;
        }, {});
    }
    return value;
}

function payloadHash(payload) {
    return crypto.createHash('sha256')
        .update(JSON.stringify(stableValue(payload)))
        .digest('hex');
}

function eventKey(type, hash) {
    return `${type}:${hash}`;
}

async function claimEvent(type, payload) {
    const hash = payloadHash(payload);
    const key = eventKey(type, hash);
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + EVENT_LEASE_MS);
    const leaseId = crypto.randomUUID();

    try {
        const event = await ApliiqEvent.create({
            eventKey: key,
            type,
            payloadHash: hash,
            status: 'processing',
            payload,
            attempts: 1,
            lastReceivedAt: now,
            leaseId,
            leaseUntil
        });
        return { event, hash, claimed: true };
    } catch (error) {
        if (error && error.code !== 11000) throw error;
    }

    const event = await ApliiqEvent.findOneAndUpdate(
        {
            eventKey: key,
            $or: [
                { status: { $in: ['received', 'failed'] } },
                { status: 'processing', leaseUntil: { $lt: now } }
            ]
        },
        {
            $set: {
                status: 'processing',
                payload,
                lastReceivedAt: now,
                leaseId,
                leaseUntil,
                error: ''
            },
            $inc: { attempts: 1 }
        },
        { new: true }
    );

    if (event) return { event, hash, claimed: true };

    const existing = await ApliiqEvent.findOneAndUpdate(
        { eventKey: key },
        {
            $set: { lastReceivedAt: now },
            $inc: { attempts: 1 }
        },
        { new: true }
    );
    return { event: existing, hash, claimed: false };
}

async function waitForEventResult(key) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        const event = await ApliiqEvent.findOne({ eventKey: key }).lean();
        if (event && event.status !== 'processing') return event;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    return ApliiqEvent.findOne({ eventKey: key }).lean();
}

async function duplicateResult(received) {
    if (received.claimed) return null;
    if (received.event?.result) return received.event.result;
    const completed = await waitForEventResult(received.event.eventKey);
    return completed && completed.result;
}

async function finishEvent(event, status, referenceIds = [], error = '', result = null) {
    return ApliiqEvent.updateOne(
        { _id: event._id, status: 'processing', leaseId: event.leaseId },
        {
            $set: {
                status,
                referenceIds: referenceIds.map(value => stringValue(value, 200)).filter(Boolean),
                processedAt: new Date(),
                leaseId: '',
                leaseUntil: null,
                error: stringValue(error, 1000),
                result
            }
        }
    );
}

function eventBusyResponse(res) {
    return res.status(503).json({
        success: false,
        message: 'A matching Apliiq callback is still processing'
    });
}

/*
 * Add-to-Store and Product Search currently have no documented authentication
 * header. Imported records remain pending and never publish merchandise.
 */
async function receiveProductEvent(payload) {
    return claimEvent('product_upsert', payload);
}

async function receiveFulfillmentEvent(payload) {
    return claimEvent('fulfillment', payload);
}

async function receiveWarehouseEvent(payload) {
    return claimEvent('warehouse_shipment_complete', payload);
}

function normalizeVariants(variants) {
    if (!Array.isArray(variants)) return [];

    const seen = new Set();
    return variants.slice(0, MAX_VARIANTS).reduce((result, variant) => {
        const sku = stringValue(variant && variant.sku, 200);
        if (!sku || seen.has(sku)) return result;
        seen.add(sku);
        result.push({
            sku,
            price: numberValue(variant.price),
            color: stringValue(variant.color, 100),
            size: stringValue(variant.size, 50),
            imageUrl: httpsUrl(variant.imageUrl),
            weight: numberValue(variant.weight),
            weightUnit: stringValue(variant.weightUnit, 20),
            isDefault: Boolean(variant.default),
            width: numberValue(variant.width),
            height: numberValue(variant.height),
            length: numberValue(variant.length),
            dimensionUnit: stringValue(variant.dimensionUnit, 20)
        });
        return result;
    }, []);
}

router.post('/products', async (req, res) => {
    let event;
    try {
        const payload = req.body || {};
        const name = stringValue(payload.name, 250);
        const variants = normalizeVariants(payload.variants);

        if (!name || variants.length === 0) {
            return res.status(400).json({
                storeProductId: stringValue(payload.store_ProductId, 200) || null,
                hasError: true,
                errorMessages: ['Product name and at least one variant SKU are required']
            });
        }

        const received = await receiveProductEvent(payload);
        event = received.event;
        const priorResult = await duplicateResult(received);
        if (!received.claimed) {
            return priorResult ? res.json(priorResult) : eventBusyResponse(res);
        }

        const suppliedStoreProductId = stringValue(payload.store_ProductId, 200);
        let product = null;
        if (suppliedStoreProductId) {
            product = await ApliiqProduct.findOne({ storeProductId: suppliedStoreProductId });
        }
        if (!product && !suppliedStoreProductId) {
            const skuMatches = await ApliiqProduct.find({
                'variants.sku': { $in: variants.map(variant => variant.sku) }
            }).limit(2);
            if (skuMatches.length === 1) {
                const match = skuMatches[0];
                const incomingReviewHash = materialReviewHash({
                    shippingProfileId: stringValue(payload.shippingProfileId, 200),
                    taxonomyId: stringValue(payload.taxonomyId, 200),
                    type: stringValue(payload.type, 100),
                    name,
                    currency: stringValue(payload.currency || 'USD', 10),
                    description: stringValue(payload.description, 10000),
                    imageUrls: stringArray(payload.imageUrls, 20, 2000).map(httpsUrl).filter(Boolean),
                    sizes: stringArray(payload.sizes, 100, 50),
                    colors: stringArray(payload.colors, 100, 100),
                    variants,
                    replaceProduct: Boolean(payload.replaceProduct)
                });
                const exactVerifiedIntent =
                    match.wordethIntent?.verified === true &&
                    match.wordethIntent.expectedReviewHash === incomingReviewHash;
                if (match.status !== 'approved' || exactVerifiedIntent) product = match;
            }
        }

        const skuIdentity = variants.map(variant => variant.sku).sort().join('|');
        let identityKey = product
            ? product.identityKey
            : (suppliedStoreProductId
                ? `store:${suppliedStoreProductId}`
                : `skus:${payloadHash(skuIdentity)}`);
        if (!product && await ApliiqProduct.exists({ identityKey })) {
            identityKey = `quarantine:${payloadHash(`${identityKey}:${received.hash}`)}`;
        }
        const storeProductId = product
            ? product.storeProductId
            : (suppliedStoreProductId || crypto.randomUUID());
        const productData = {
            shippingProfileId: stringValue(payload.shippingProfileId, 200),
            taxonomyId: stringValue(payload.taxonomyId, 200),
            type: stringValue(payload.type, 100),
            name,
            currency: stringValue(payload.currency || 'USD', 10),
            description: stringValue(payload.description, 10000),
            imageUrls: stringArray(payload.imageUrls, 20, 2000).map(httpsUrl).filter(Boolean),
            sizes: stringArray(payload.sizes, 100, 50),
            colors: stringArray(payload.colors, 100, 100),
            variants,
            replaceProduct: Boolean(payload.replaceProduct),
            lastPayloadHash: received.hash,
            lastSyncedAt: new Date()
        };
        productData.reviewHash = materialReviewHash(productData);

        if (!product) {
            product = await ApliiqProduct.findOneAndUpdate(
                { identityKey },
                {
                    $set: productData,
                    $setOnInsert: { identityKey, storeProductId, status: 'pending' }
                },
                { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
            );
        } else {
            let currentProduct = product;
            product = null;
            for (let attempt = 0; attempt < 5 && !product; attempt += 1) {
                const currentReviewHash =
                    currentProduct.reviewHash || materialReviewHash(currentProduct);
                const verifiedWordethProduct =
                    currentProduct.status !== 'archived' &&
                    currentProduct.wordethIntent?.verified === true &&
                    currentProduct.wordethIntent.expectedReviewHash === productData.reviewHash &&
                    WORDETH_PRODUCTS.includes(currentProduct.wordethIntent.wordethProduct) &&
                    (
                        suppliedStoreProductId === currentProduct.storeProductId ||
                        !suppliedStoreProductId
                    );
                const callbackChangedApprovedProduct =
                    currentProduct.status === 'approved' &&
                    currentReviewHash !== productData.reviewHash &&
                    !verifiedWordethProduct;
                const productUpdate = {
                    $set: {
                        ...productData,
                        ...(callbackChangedApprovedProduct ? {
                            status: 'pending',
                            approvedSnapshot:
                                currentProduct.approvedSnapshot ||
                                approvedSnapshot(currentProduct),
                            approvedReviewHash:
                                currentProduct.approvedReviewHash || currentReviewHash
                        } : {}),
                        ...(verifiedWordethProduct ? {
                            status: 'approved',
                            wordethProduct: currentProduct.wordethIntent.wordethProduct,
                            approvedSnapshot: approvedSnapshot(productData),
                            approvedReviewHash: productData.reviewHash,
                            'wordethIntent.verified': false,
                            'wordethIntent.expectedReviewHash': ''
                        } : {})
                    }
                };
                if (callbackChangedApprovedProduct) {
                    productUpdate.$push = {
                        reviewHistory: {
                            action: 'changes_received',
                            actorId: 'apliiq-callback',
                            note: 'Material supplier changes require review; the last approved version remains live.',
                            at: new Date()
                        }
                    };
                } else if (verifiedWordethProduct && currentProduct.status !== 'approved') {
                    productUpdate.$push = {
                        reviewHistory: {
                            action: 'auto_approved',
                            actorId: 'wordeth-verification',
                            note: 'Auto-approved because the callback exactly matched a verified Wordeth product intent.',
                            at: new Date()
                        }
                    };
                }
                product = await ApliiqProduct.findOneAndUpdate({
                    $and: [{
                        _id: currentProduct._id,
                        status: currentProduct.status,
                        lastPayloadHash: currentProduct.lastPayloadHash
                    }, currentProduct.reviewHash
                        ? { reviewHash: currentProduct.reviewHash }
                        : { $or: [{ reviewHash: '' }, { reviewHash: { $exists: false } }] }]
                },
                    productUpdate,
                    { new: true, runValidators: true }
                );
                if (!product) currentProduct = await ApliiqProduct.findById(currentProduct._id);
            }
            if (!product) throw new Error('Product changed repeatedly while processing callback');
        }

        const result = {
            storeProductId: product.storeProductId,
            stepsCompleted: ['DraftCreated', 'InventoryCreated', 'ImagesUploaded', 'Completed'],
            hasError: false,
            errorMessages: []
        };
        await finishEvent(event, 'processed', [product.storeProductId], '', result);
        res.json(result);
    } catch (error) {
        if (event) await finishEvent(event, 'failed', [], error.message).catch(() => {});
        console.error('[Apliiq] Product callback failed:', error.message);
        res.status(500).json({
            storeProductId: null,
            hasError: true,
            errorMessages: ['Unable to save product']
        });
    }
});

router.get('/products/search', async (req, res) => {
    try {
        const search = stringValue(req.query.search, 200);
        const filter = { status: { $ne: 'archived' } };

        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(escaped, 'i');
            filter.$or = [
                { storeProductId: pattern },
                { name: pattern },
                { type: pattern },
                { 'variants.sku': pattern }
            ];
        }

        const products = await ApliiqProduct.find(filter)
            .sort({ updatedAt: -1 })
            .limit(MAX_PRODUCTS_PER_SEARCH)
            .select('storeProductId name imageUrls')
            .lean();

        res.json(products.map(product => ({
            store_ProductId: product.storeProductId,
            name: product.name,
            imageUrls: product.imageUrls || []
        })));
    } catch (error) {
        console.error('[Apliiq] Product search failed:', error.message);
        res.status(500).json({ error: 'Unable to search products' });
    }
});

router.get('/storefront/products', async (req, res) => {
    try {
        const products = await ApliiqProduct.find({
            status: { $ne: 'archived' },
            wordethProduct: { $in: WORDETH_PRODUCTS }
        })
            .sort({ updatedAt: -1 })
            .select([
                'storeProductId', 'wordethProduct', 'shippingProfileId', 'taxonomyId',
                'type', 'name', 'currency', 'description', 'imageUrls', 'sizes',
                'colors', 'variants', 'replaceProduct', 'status', 'approvedSnapshot', 'updatedAt'
            ].join(' '))
            .lean();
        res.json({
            success: true,
            products: products.reduce((published, product) => {
                if (product.status === 'approved') {
                    published.push(product);
                } else if (product.approvedSnapshot) {
                    published.push({
                        _id: product._id,
                        storeProductId: product.storeProductId,
                        wordethProduct: product.wordethProduct,
                        ...product.approvedSnapshot,
                        updatedAt: product.updatedAt,
                        updatePendingReview: true
                    });
                }
                return published;
            }, [])
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Unable to load products' });
    }
});

router.get('/admin/products', requireAdmin, async (req, res) => {
    try {
        const status = stringValue(req.query.status, 20);
        const filter = ['pending', 'approved', 'archived'].includes(status) ? { status } : {};
        const products = await ApliiqProduct.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Unable to load Apliiq products' });
    }
});

router.post('/admin/products/intents', requireAdmin, async (req, res) => {
    try {
        const payload = req.body.product || req.body;
        const wordethProduct = stringValue(req.body.wordethProduct || payload.wordethProduct, 30);
        const name = stringValue(payload.name, 250);
        const variants = normalizeVariants(payload.variants);
        if (!WORDETH_PRODUCTS.includes(wordethProduct)) {
            return res.status(400).json({ error: 'A valid Wordeth product mapping is required' });
        }
        if (!name || variants.length === 0) {
            return res.status(400).json({ error: 'Product name and at least one variant SKU are required' });
        }

        const storeProductId = stringValue(payload.store_ProductId || payload.storeProductId, 200) || crypto.randomUUID();
        const productData = {
            shippingProfileId: stringValue(payload.shippingProfileId, 200),
            taxonomyId: stringValue(payload.taxonomyId, 200),
            type: stringValue(payload.type, 100),
            name,
            currency: stringValue(payload.currency || 'USD', 10),
            description: stringValue(payload.description, 10000),
            imageUrls: stringArray(payload.imageUrls, 20, 2000).map(httpsUrl).filter(Boolean),
            sizes: stringArray(payload.sizes, 100, 50),
            colors: stringArray(payload.colors, 100, 100),
            variants,
            replaceProduct: Boolean(payload.replaceProduct)
        };
        const registration = await registerWordethProductIntent({
            storeProductId,
            wordethProduct,
            productData
        });

        res.status(registration.created ? 201 : 200).json({
            success: true,
            storeProductId: registration.product.storeProductId,
            expectedReviewHash: registration.expectedReviewHash
        });
    } catch (error) {
        if (error?.code === 'INTENT_CONFLICT') {
            return res.status(409).json({ error: 'This Wordeth product intent changed or conflicts with an existing product' });
        }
        res.status(500).json({ error: 'Unable to register Wordeth product intent' });
    }
});

router.patch('/admin/products/:id', requireAdmin, async (req, res) => {
    try {
        const action = stringValue(req.body.action, 20);
        const wordethProduct = stringValue(req.body.wordethProduct, 30);
        const expectedPayloadHash = stringValue(req.body.expectedPayloadHash, 100);
        const expectedReviewHash = stringValue(req.body.expectedReviewHash, 100);
        const note = stringValue(req.body.note, 1000);
        if (!['approve', 'archive', 'map'].includes(action)) {
            return res.status(400).json({ error: 'Invalid product action' });
        }
        if ((action === 'approve' || action === 'map') && !WORDETH_PRODUCTS.includes(wordethProduct)) {
            return res.status(400).json({ error: 'A valid Wordeth product mapping is required' });
        }
        if (action === 'approve' && !expectedReviewHash && !expectedPayloadHash) {
            return res.status(400).json({ error: 'The reviewed product version is required' });
        }

        const currentProduct = await ApliiqProduct.findById(req.params.id);
        if (!currentProduct) return res.status(404).json({ error: 'Product not found' });
        const currentReviewHash =
            currentProduct.reviewHash || materialReviewHash(currentProduct);
        const reviewedVersionMatches = expectedReviewHash
            ? expectedReviewHash === currentReviewHash
            : expectedPayloadHash === currentProduct.lastPayloadHash;
        if (action === 'approve' && !reviewedVersionMatches) {
            return res.status(409).json({ error: 'This product changed after it was loaded. Review the latest version before approving.' });
        }

        const update = {
            $push: {
                reviewHistory: {
                    action: action === 'approve' ? 'approved' : (action === 'archive' ? 'archived' : 'mapped'),
                    actorId: req.adminId,
                    note,
                    at: new Date()
                }
            }
        };
        if (action === 'approve') {
            update.$set = {
                status: 'approved',
                wordethProduct,
                approvedReviewHash: currentReviewHash,
                approvedSnapshot: approvedSnapshot(currentProduct)
            };
        }
        if (action === 'archive') update.$set = { status: 'archived' };
        if (action === 'map') update.$set = { wordethProduct };

        const versionFilter = action === 'approve'
            ? {
                $and: [
                    { _id: req.params.id },
                    currentProduct.reviewHash
                        ? { reviewHash: currentReviewHash }
                        : { $or: [
                            { reviewHash: currentReviewHash },
                            { reviewHash: '' },
                            { reviewHash: { $exists: false } }
                        ] }
                ]
            }
            : { _id: req.params.id };
        const product = await ApliiqProduct.findOneAndUpdate(versionFilter, update, {
            new: true,
            runValidators: true
        });
        if (!product && action === 'approve') {
            return res.status(409).json({ error: 'This product changed after it was loaded. Review the latest version before approving.' });
        }
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ success: true, product });
    } catch (error) {
        res.status(error.name === 'CastError' ? 404 : 500).json({ error: 'Unable to update product' });
    }
});

router.post('/fulfillment', requireFulfillmentSignature, async (req, res) => {
    let event;
    try {
        const { fulfillment, orderId } = extractFulfillment(req.body);
        if (!fulfillment || !orderId) {
            return res.status(400).json({ success: false, message: 'Missing fulfillment order ID' });
        }

        const received = await receiveFulfillmentEvent(req.body);
        event = received.event;
        const priorResult = await duplicateResult(received);
        if (!received.claimed) {
            return priorResult ? res.json(priorResult) : eventBusyResponse(res);
        }
        const applied = await applyFulfillmentPayload(req.body);
        if (!applied.matched) {
            const result = { success: true, matched: false, pendingReconciliation: true };
            await finishEvent(event, 'pending_reconciliation', [orderId], 'Order not found', result);
            const reconciled = await reconcilePendingFulfillmentEvent(event._id);
            return res.json(reconciled
                ? { success: true, matched: true, reconciled: true }
                : result);
        }

        const result = { success: true, matched: true };
        await finishEvent(
            event,
            'processed',
            [orderId, applied.order._id.toString()],
            '',
            result
        );
        res.json(result);
    } catch (error) {
        if (event) await finishEvent(event, 'failed', [], error.message).catch(() => {});
        console.error('[Apliiq] Fulfillment callback failed:', error.message);
        res.status(500).json({ success: false, message: 'Unable to process fulfillment' });
    }
});

function normalizeWarehouseItems(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    return items.slice(0, 500).map((item, index) => {
        const itemId = stringValue(item.ID ?? item.Id ?? item.id, 200);
        const inventoryId = stringValue(item.InventoryId ?? item.inventoryId, 200);
        const baseIssueKey = itemId || inventoryId || `item-${index}`;
        const issueKey = seen.has(baseIssueKey) ? `${baseIssueKey}-${index}` : baseIssueKey;
        seen.add(issueKey);
        return {
        issueKey,
        itemId,
        inventoryId,
        name: stringValue(item.Name ?? item.name, 250),
        type: stringValue(item.Type ?? item.type, 100),
        quantityExpected: numberValue(item.Quantity ?? item.quantity),
        quantityReceived: numberValue(item.Quantity_Received ?? item.quantity_received),
        isActivated: Boolean(item.IsActivated ?? item.isActivated),
        receivingErrors: stringValue(item.Receiving_Errors ?? item.receiving_errors, 1000),
        presentInLatestReport: true
    }; });
}

function addMissingIssueKeys(items) {
    const seen = new Set();
    let changed = false;
    const normalized = (items || []).map((item, index) => {
        const existingKey = stringValue(item.issueKey, 200);
        const baseIssueKey = existingKey ||
            stringValue(item.itemId, 200) ||
            stringValue(item.inventoryId, 200) ||
            `legacy-item-${index}`;
        const issueKey = seen.has(baseIssueKey) ? `${baseIssueKey}-${index}` : baseIssueKey;
        seen.add(issueKey);
        if (issueKey !== existingKey) changed = true;
        return { ...item, issueKey };
    });
    return { changed, items: normalized };
}

async function ensureShipmentIssueKeys(shipmentId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const shipment = await ApliiqWarehouseShipment.findOne({ shipmentId }).lean();
        if (!shipment) return null;
        const normalized = addMissingIssueKeys(shipment.items);
        if (!normalized.changed) return shipment;
        const updated = await ApliiqWarehouseShipment.findOneAndUpdate(
            { _id: shipment._id, __v: shipment.__v || 0 },
            { $set: { items: normalized.items }, $inc: { __v: 1 } },
            { new: true, runValidators: true }
        ).lean();
        if (updated) return updated;
    }
    throw new Error(`Shipment ${shipmentId} changed repeatedly while assigning issue keys`);
}

router.post(
    '/warehouse/shipments/complete',
    requireWarehouseAppId,
    async (req, res) => {
        let event;
        try {
            const shipments = Array.isArray(req.body)
                ? req.body
                : (Array.isArray(req.body && req.body.shipments) ? req.body.shipments : []);
            if (shipments.length === 0 || shipments.length > MAX_WAREHOUSE_SHIPMENTS) {
                return res.status(400).json({ success: false, message: 'Invalid warehouse shipment payload' });
            }

            const received = await receiveWarehouseEvent(req.body);
            event = received.event;
            const priorResult = await duplicateResult(received);
            if (!received.claimed) {
                return priorResult ? res.json(priorResult) : eventBusyResponse(res);
            }
            const storedIds = [];

            for (const shipment of shipments) {
                const shipmentId = stringValue(shipment.Id ?? shipment.ID ?? shipment.id, 200);
                if (!shipmentId) continue;
                const items = normalizeWarehouseItems(shipment.Items ?? shipment.items);
                const hasDiscrepancies = items.some(item =>
                    item.quantityExpected !== item.quantityReceived || Boolean(item.receivingErrors)
                );

                let savedShipment = null;
                for (let attempt = 0; attempt < 5 && !savedShipment; attempt += 1) {
                    const existingShipment = await ApliiqWarehouseShipment.findOne({ shipmentId }).lean();
                    const existingItems = (existingShipment?.items || []).map((item, index) => ({
                        ...item,
                        issueKey: item.issueKey || item.itemId || item.inventoryId || `legacy-item-${index}`
                    }));
                    const priorIssues = new Map(existingItems.map(item => [item.issueKey, item]));
                    const itemsWithAudit = items.map(item => {
                        const prior = priorIssues.get(item.issueKey);
                        const detailsChanged = prior && (
                            prior.quantityExpected !== item.quantityExpected ||
                            prior.quantityReceived !== item.quantityReceived ||
                            prior.receivingErrors !== item.receivingErrors
                        );
                        return {
                            ...item,
                            issueStatus: detailsChanged ? 'open' : (prior?.issueStatus || 'open'),
                            issueAudit: prior?.issueAudit || []
                        };
                    });
                    const incomingKeys = new Set(items.map(item => item.issueKey));
                    const retainedItems = existingItems
                        .filter(item => !incomingKeys.has(item.issueKey))
                        .map(item => ({ ...item, presentInLatestReport: false }));
                    try {
                        savedShipment = await ApliiqWarehouseShipment.findOneAndUpdate(
                            existingShipment
                                ? { shipmentId, __v: existingShipment.__v || 0 }
                                : { shipmentId },
                            {
                                $set: {
                                    name: stringValue(shipment.Name ?? shipment.name, 250),
                                    items: [...itemsWithAudit, ...retainedItems],
                                    hasDiscrepancies,
                                    completedAt: new Date(),
                                    lastPayloadHash: received.hash
                                },
                                $inc: { __v: 1 }
                            },
                            {
                                new: true,
                                upsert: !existingShipment,
                                runValidators: true,
                                setDefaultsOnInsert: true
                            }
                        );
                    } catch (error) {
                        if (error.code !== 11000) throw error;
                    }
                }
                if (!savedShipment) throw new Error(`Shipment ${shipmentId} changed repeatedly`);
                storedIds.push(shipmentId);
            }

            if (storedIds.length === 0) {
                await finishEvent(event, 'failed', [], 'No valid shipment IDs');
                return res.status(400).json({ success: false, message: 'No valid warehouse shipment IDs' });
            }

            const result = { success: true, shipmentsProcessed: storedIds.length };
            await finishEvent(event, 'processed', storedIds, '', result);
            res.json(result);
        } catch (error) {
            if (event) await finishEvent(event, 'failed', [], error.message).catch(() => {});
            console.error('[Apliiq] Warehouse callback failed:', error.message);
            res.status(500).json({ success: false, message: 'Unable to process warehouse shipments' });
        }
    }
);

router.get('/admin/warehouse/issues', requireAdmin, async (req, res) => {
    try {
        const shipmentRows = await ApliiqWarehouseShipment.find({
            $or: [
                { hasDiscrepancies: true },
                { 'items.issueAudit.0': { $exists: true } }
            ]
        })
            .sort({ completedAt: -1 }).limit(200).lean();
        const shipments = await Promise.all(
            shipmentRows.map(shipment => ensureShipmentIssueKeys(shipment.shipmentId))
        );
        res.json({
            success: true,
            shipments: shipments.map(shipment => ({
                ...shipment,
                items: shipment.items.filter(item =>
                    (
                        item.presentInLatestReport !== false &&
                        (item.quantityExpected !== item.quantityReceived || Boolean(item.receivingErrors))
                    ) ||
                    (item.issueAudit || []).length > 0
                )
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Unable to load warehouse issues' });
    }
});

router.patch('/admin/warehouse/shipments/:shipmentId/issues/:issueKey', requireAdmin, async (req, res) => {
    try {
        const action = stringValue(req.body.action, 20);
        const note = stringValue(req.body.note, 1000);
        if (!['acknowledge', 'resolve'].includes(action)) {
            return res.status(400).json({ error: 'Invalid issue action' });
        }
        const status = action === 'acknowledge' ? 'acknowledged' : 'resolved';
        await ensureShipmentIssueKeys(req.params.shipmentId);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const currentShipment = await ApliiqWarehouseShipment.findOne({
                shipmentId: req.params.shipmentId,
                'items.issueKey': req.params.issueKey
            }).lean();
            const currentIssue = currentShipment?.items.find(item => item.issueKey === req.params.issueKey);
            if (!currentIssue) return res.status(404).json({ error: 'Warehouse issue not found' });
            const isCurrentDiscrepancy = currentIssue.presentInLatestReport !== false &&
                (currentIssue.quantityExpected !== currentIssue.quantityReceived || Boolean(currentIssue.receivingErrors));
            if (!isCurrentDiscrepancy) {
                return res.status(409).json({ error: 'This item is not a current warehouse discrepancy' });
            }
            if (currentIssue.issueStatus === status) {
                return res.json({ success: true, shipment: currentShipment });
            }
            if (action === 'acknowledge' && currentIssue.issueStatus !== 'open') {
                return res.status(409).json({ error: 'Only open issues can be acknowledged' });
            }
            const updatedShipment = await ApliiqWarehouseShipment.findOneAndUpdate(
                {
                    shipmentId: req.params.shipmentId,
                    __v: currentShipment.__v || 0,
                    items: {
                        $elemMatch: {
                            issueKey: req.params.issueKey,
                            issueStatus: currentIssue.issueStatus,
                            quantityExpected: currentIssue.quantityExpected,
                            quantityReceived: currentIssue.quantityReceived,
                            receivingErrors: currentIssue.receivingErrors,
                            presentInLatestReport: { $ne: false }
                        }
                    }
                },
                {
                    $set: { 'items.$.issueStatus': status },
                    $push: {
                        'items.$.issueAudit': {
                            action: status,
                            actorId: req.adminId,
                            note,
                            at: new Date()
                        }
                    },
                    $inc: { __v: 1 }
                },
                { new: true, runValidators: true }
            );
            if (updatedShipment) return res.json({ success: true, shipment: updatedShipment });
        }
        res.status(409).json({ error: 'The warehouse issue changed. Reload and try again.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Unable to update warehouse issue' });
    }
});

module.exports = router;