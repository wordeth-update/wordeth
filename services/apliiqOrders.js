const crypto = require('crypto');
const axios = require('axios');
const MerchOrder = require('../models/MerchOrder');
const ApliiqProduct = require('../models/ApliiqProduct');
const { reconcilePendingFulfillmentsForOrder } = require('./apliiqFulfillment');

const LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const RETRY_BASE_MS = 60 * 1000;

function clean(value, max = 500) {
    return value == null ? '' : String(value).trim().substring(0, max);
}

function signature(body, timestamp, state) {
    const appId = process.env.APLIIQ_APP_KEY;
    const secret = process.env.APLIIQ_SHARED_SECRET;
    if (!appId || !secret) throw new Error('Apliiq credentials are not configured');
    const encoded = Buffer.from(JSON.stringify(body)).toString('base64');
    const sig = crypto.createHmac('sha256', secret)
        .update(`${appId}${timestamp}${state}${encoded}`)
        .digest('base64');
    return `${timestamp}:${sig}:${appId}:${state}`;
}

async function resolveSku(order) {
    if (order.apliiq?.sku) return order.apliiq.sku;
    const product = await ApliiqProduct.findOne({
        status: 'approved',
        wordethProduct: order.product,
        variants: {
            $elemMatch: {
                color: new RegExp(`^${clean(order.color).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                size: new RegExp(`^${clean(order.size).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
            }
        }
    }).lean();
    const variant = product?.variants?.find(item =>
        clean(item.color).toLowerCase() === clean(order.color).toLowerCase()
        && clean(item.size).toLowerCase() === clean(order.size).toLowerCase()
    );
    return clean(variant?.sku, 200);
}

function nameParts(address) {
    const name = clean(address.name, 200);
    const pieces = name.split(/\s+/).filter(Boolean);
    return {
        firstName: clean(address.firstName || pieces.shift(), 100),
        lastName: clean(address.lastName || pieces.join(' '), 100)
    };
}

async function buildPayload(order) {
    const sku = await resolveSku(order);
    if (!sku) {
        const error = new Error('No approved Apliiq SKU matches this product, color, and size');
        error.permanent = true;
        throw error;
    }
    const address = order.shippingAddress || {};
    const names = nameParts(address);
    const countryNames = {
        US: 'United States',
        CA: 'Canada',
        GB: 'United Kingdom',
        AU: 'Australia',
        NZ: 'New Zealand'
    };
    const countryCode = clean(address.countryCode, 2).toUpperCase();
    return {
        id: order._id.toString(),
        number: order._id.toString(),
        name: `#${order._id}`,
        order_number: order._id.toString(),
        line_items: [{
            id: `${order._id}-1`,
            title: order.productName,
            name: `${order.productName} - ${order.size} / ${order.colorName || order.color}`,
            quantity: order.quantity,
            price: Number(order.unitPrice).toFixed(2),
            grams: 0,
            sku
        }],
        shipping_address: {
            first_name: names.firstName,
            last_name: names.lastName,
            company: clean(address.company, 200),
            address1: clean(address.line1, 300),
            address2: clean(address.line2, 300),
            phone: clean(address.phone, 100),
            city: clean(address.city, 150),
            zip: clean(address.postalCode, 50),
            province: clean(address.state, 100),
            province_code: clean(address.state, 10),
            country: countryNames[countryCode] || countryCode,
            country_code: countryCode
        },
        shipping_lines: [{ code: order.shippingChoice?.code || 'standard' }]
    };
}

async function claimOrder(orderId) {
    const now = new Date();
    const leaseId = crypto.randomUUID();
    const order = await MerchOrder.findOneAndUpdate(
        {
            _id: orderId,
            'payment.status': 'paid',
            status: { $nin: ['cancelled', 'refunded'] },
            'apliiq.orderId': { $in: ['', null] },
            $or: [
                { 'apliiq.submissionStatus': { $in: ['pending', 'retry'] }, 'apliiq.nextAttemptAt': { $lte: now } },
                { 'apliiq.submissionStatus': 'pending', 'apliiq.nextAttemptAt': null }
            ]
        },
        {
            $set: {
                'apliiq.submissionStatus': 'submitting',
                'apliiq.leaseId': leaseId,
                'apliiq.leaseUntil': new Date(now.getTime() + LEASE_MS),
                'apliiq.lastAttemptAt': now,
                'apliiq.lastError': ''
            },
            $inc: { 'apliiq.attempts': 1 }
        },
        { new: true }
    );
    return order && { order, leaseId };
}

async function submitApliiqOrder(orderId) {
    const claim = await claimOrder(orderId);
    if (!claim) return { submitted: false, skipped: true };
    const { order, leaseId } = claim;
    try {
        const payload = await buildPayload(order);
        const activeClaim = await MerchOrder.exists({
            _id: order._id,
            'apliiq.leaseId': leaseId,
            'payment.status': 'paid',
            status: { $nin: ['cancelled', 'refunded'] }
        });
        if (!activeClaim) {
            await MerchOrder.updateOne(
                { _id: order._id, 'apliiq.leaseId': leaseId },
                {
                    $set: {
                        'apliiq.submissionStatus': 'cancelled',
                        'apliiq.nextAttemptAt': null,
                        'apliiq.leaseId': '',
                        'apliiq.leaseUntil': null
                    }
                }
            );
            return { submitted: false, skipped: true, cancelled: true };
        }
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const state = crypto.randomUUID();
        const response = await axios.post(
            process.env.APLIIQ_ORDER_API_URL || 'https://api.apliiq.com/v1/Order',
            payload,
            {
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'x-apliiq-auth': signature(payload, timestamp, state)
                },
                timeout: 20000,
                validateStatus: () => true
            }
        );
        const providerOrderId = clean(response.data?.id, 200);
        if (response.status !== 200 || !providerOrderId) {
            const error = new Error(clean(response.data?.message || `Apliiq returned HTTP ${response.status}`, 1000));
            error.status = response.status;
            error.permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
            throw error;
        }
        const updated = await MerchOrder.findOneAndUpdate(
            { _id: order._id, 'apliiq.leaseId': leaseId },
            {
                $set: {
                    'apliiq.orderId': providerOrderId,
                    'apliiq.status': 'submitted',
                    'apliiq.submissionStatus': 'submitted',
                    'apliiq.submittedAt': new Date(),
                    'apliiq.responseStatus': response.status,
                    'apliiq.leaseId': '',
                    'apliiq.leaseUntil': null,
                    'apliiq.nextAttemptAt': null,
                    'apliiq.lastError': ''
                }
            },
            { new: true }
        );
        await MerchOrder.updateOne(
            { _id: order._id, 'payment.status': 'paid', status: 'pending' },
            { $set: { status: 'confirmed' } }
        );
        if (updated) await reconcilePendingFulfillmentsForOrder(updated);
        return { submitted: Boolean(updated), orderId: providerOrderId };
    } catch (error) {
        const attempts = order.apliiq?.attempts || 1;
        // A transport error has an ambiguous outcome: Apliiq may have accepted
        // the stable external order ID before the connection failed. Never
        // automatically POST it again. Explicit provider errors are retryable.
        const ambiguous = !error.status && !error.permanent;
        const permanent = Boolean(error.permanent) || ambiguous || attempts >= MAX_ATTEMPTS;
        const delay = Math.min(RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)), 60 * 60 * 1000);
        await MerchOrder.updateOne(
            { _id: order._id, 'apliiq.leaseId': leaseId },
            {
                $set: {
                    'apliiq.submissionStatus': permanent ? 'failed' : 'retry',
                    'apliiq.nextAttemptAt': permanent ? null : new Date(Date.now() + delay),
                    'apliiq.responseStatus': error.status || 0,
                    'apliiq.lastError': clean(
                        ambiguous
                            ? `Apliiq delivery outcome is unknown; staff review required: ${error.message}`
                            : error.message,
                        1000
                    ),
                    'apliiq.leaseId': '',
                    'apliiq.leaseUntil': null
                }
            }
        );
        if (permanent) return { submitted: false, failed: true, error: error.message };
        throw error;
    }
}

async function sweepApliiqOrders(limit = 25) {
    const now = new Date();
    await MerchOrder.updateMany(
        {
            'apliiq.submissionStatus': 'submitting',
            'apliiq.leaseUntil': { $lt: now },
            'apliiq.orderId': { $in: ['', null] }
        },
        {
            $set: {
                'apliiq.submissionStatus': 'failed',
                'apliiq.nextAttemptAt': null,
                'apliiq.leaseId': '',
                'apliiq.leaseUntil': null,
                'apliiq.lastError': 'Apliiq delivery outcome is unknown after an interrupted submission; staff review required'
            }
        }
    );
    const orders = await MerchOrder.find({
        'payment.status': 'paid',
        status: { $nin: ['cancelled', 'refunded'] },
        'apliiq.orderId': { $in: ['', null] },
        $or: [
            { 'apliiq.submissionStatus': { $in: ['pending', 'retry'] }, 'apliiq.nextAttemptAt': { $lte: now } },
            { 'apliiq.submissionStatus': 'pending', 'apliiq.nextAttemptAt': null }
        ]
    }).sort({ 'apliiq.nextAttemptAt': 1 }).limit(limit).select('_id').lean();
    for (const order of orders) {
        await submitApliiqOrder(order._id).catch(error => {
            console.error(`[Apliiq] Order ${order._id} submission failed:`, error.message);
        });
    }
    return orders.length;
}

function startApliiqOrderRecoverySweep() {
    const run = () => sweepApliiqOrders().catch(error => {
        console.error('[Apliiq] Order recovery sweep failed:', error.message);
    });
    const initial = setTimeout(run, 15000);
    initial.unref?.();
    const interval = setInterval(run, 60 * 1000);
    interval.unref?.();
    return interval;
}

module.exports = {
    buildPayload,
    submitApliiqOrder,
    sweepApliiqOrders,
    startApliiqOrderRecoverySweep
};