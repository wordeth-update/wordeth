const crypto = require('crypto');
const express = require('express');
const ApliiqEvent = require('../models/ApliiqEvent');
const ApliiqProduct = require('../models/ApliiqProduct');
const ApliiqWarehouseShipment = require('../models/ApliiqWarehouseShipment');
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

router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    next();
});
router.use(parseApliiqJson);

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
        if (!product) {
            product = await ApliiqProduct.findOne({
                'variants.sku': { $in: variants.map(variant => variant.sku) }
            });
        }

        const skuIdentity = variants.map(variant => variant.sku).sort().join('|');
        const identityKey = product
            ? product.identityKey
            : (suppliedStoreProductId
                ? `store:${suppliedStoreProductId}`
                : `skus:${payloadHash(skuIdentity)}`);
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

        product = await ApliiqProduct.findOneAndUpdate(
            { identityKey },
            {
                $set: productData,
                $setOnInsert: { identityKey, storeProductId, status: 'pending' }
            },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

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
    return items.slice(0, 500).map(item => ({
        itemId: stringValue(item.ID ?? item.Id ?? item.id, 200),
        inventoryId: stringValue(item.InventoryId ?? item.inventoryId, 200),
        name: stringValue(item.Name ?? item.name, 250),
        type: stringValue(item.Type ?? item.type, 100),
        quantityExpected: numberValue(item.Quantity ?? item.quantity),
        quantityReceived: numberValue(item.Quantity_Received ?? item.quantity_received),
        isActivated: Boolean(item.IsActivated ?? item.isActivated),
        receivingErrors: stringValue(item.Receiving_Errors ?? item.receiving_errors, 1000)
    }));
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

                await ApliiqWarehouseShipment.findOneAndUpdate(
                    { shipmentId },
                    {
                        $set: {
                            name: stringValue(shipment.Name ?? shipment.name, 250),
                            items,
                            hasDiscrepancies,
                            completedAt: new Date(),
                            lastPayloadHash: received.hash
                        }
                    },
                    { upsert: true, runValidators: true, setDefaultsOnInsert: true }
                );
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

module.exports = router;