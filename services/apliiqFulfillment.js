const mongoose = require('mongoose');
const ApliiqEvent = require('../models/ApliiqEvent');
const MerchOrder = require('../models/MerchOrder');

function stringValue(value, maxLength = 500) {
    if (value === null || value === undefined) return '';
    return String(value).trim().substring(0, maxLength);
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

function extractFulfillment(payload) {
    const fulfillment = payload && payload.fulfillment;
    const orderId = stringValue(
        fulfillment && (fulfillment.order_id || fulfillment.orderId),
        200
    );
    return { fulfillment, orderId };
}

async function findOrder(orderId) {
    const matches = [{ 'apliiq.orderId': orderId }];
    if (mongoose.isValidObjectId(orderId)) matches.push({ _id: orderId });
    return MerchOrder.findOne({ $or: matches });
}

async function applyFulfillmentPayload(payload) {
    const { fulfillment, orderId } = extractFulfillment(payload);
    if (!fulfillment || !orderId) return { matched: false, orderId };

    const order = await findOrder(orderId);
    if (!order) return { matched: false, orderId };

    const trackingNumbers = stringArray(
        fulfillment.tracking_numbers || fulfillment.trackingNumbers,
        20,
        200
    );
    const trackingUrls = stringArray(
        fulfillment.tracking_urls || fulfillment.trackingUrls,
        20,
        2000
    ).map(httpsUrl).filter(Boolean);
    const trackingCompany = stringValue(
        fulfillment.tracking_company || fulfillment.trackingCompany,
        100
    );
    const lineItems = Array.isArray(fulfillment.line_items)
        ? fulfillment.line_items.slice(0, 200)
        : [];

    await MerchOrder.updateOne(
        { _id: order._id },
        {
            $set: {
                'apliiq.orderId': order.apliiq?.orderId || orderId,
                'apliiq.status': 'shipped',
                'apliiq.lastEventAt': new Date()
            },
            $addToSet: {
                'apliiq.trackingNumbers': { $each: trackingNumbers },
                'apliiq.trackingUrls': { $each: trackingUrls },
                'apliiq.lineItems': { $each: lineItems }
            }
        }
    );

    if (trackingNumbers[0]) {
        await MerchOrder.updateOne(
            {
                _id: order._id,
                $or: [
                    { trackingNumber: { $exists: false } },
                    { trackingNumber: null },
                    { trackingNumber: '' }
                ]
            },
            {
                $set: {
                    trackingNumber: trackingNumbers[0],
                    'apliiq.trackingCompany': trackingCompany,
                    'apliiq.primaryTracking': {
                        number: trackingNumbers[0],
                        company: trackingCompany,
                        url: trackingUrls[0] || ''
                    }
                }
            }
        );
    }

    await MerchOrder.updateOne(
        {
            _id: order._id,
            $or: [
                { 'apliiq.shippedAt': { $exists: false } },
                { 'apliiq.shippedAt': null }
            ]
        },
        { $set: { 'apliiq.shippedAt': new Date() } }
    );
    await MerchOrder.updateOne(
        { _id: order._id, status: { $nin: ['delivered', 'cancelled'] } },
        { $set: { status: 'shipped' } }
    );

    return { matched: true, orderId, order: await MerchOrder.findById(order._id) };
}

async function reconcilePendingFulfillmentsForOrder(order) {
    const references = [order._id.toString()];
    if (order.apliiq?.orderId) references.push(order.apliiq.orderId);

    const events = await ApliiqEvent.find({
        type: 'fulfillment',
        status: 'pending_reconciliation',
        referenceIds: { $in: references }
    }).sort({ createdAt: 1 });

    let reconciled = 0;
    for (const event of events) {
        if (await reconcilePendingFulfillmentEvent(event._id)) reconciled += 1;
    }

    return reconciled;
}

async function reconcilePendingFulfillmentEvent(eventId) {
    const event = await ApliiqEvent.findOne({
        _id: eventId,
        type: 'fulfillment',
        status: 'pending_reconciliation'
    });
    if (!event) return false;

    const result = await applyFulfillmentPayload(event.payload);
    if (!result.matched) return false;

    const update = await ApliiqEvent.updateOne(
        { _id: event._id, status: 'pending_reconciliation' },
        {
            $set: {
                status: 'processed',
                result: { success: true, matched: true, reconciled: true },
                referenceIds: [result.orderId, result.order._id.toString()],
                processedAt: new Date(),
                leaseId: '',
                leaseUntil: null,
                error: ''
            }
        }
    );
    return update.modifiedCount === 1;
}

async function sweepPendingFulfillments(limit = 100) {
    await ApliiqEvent.updateMany(
        {
            type: 'fulfillment',
            status: 'processing',
            leaseUntil: { $lt: new Date() }
        },
        {
            $set: {
                status: 'pending_reconciliation',
                leaseId: '',
                leaseUntil: null,
                error: 'Recovered after an expired processing lease'
            }
        }
    );

    const events = await ApliiqEvent.find({
        type: 'fulfillment',
        status: 'pending_reconciliation'
    })
        .sort({ createdAt: 1 })
        .limit(limit)
        .select('_id')
        .lean();

    let reconciled = 0;
    for (const event of events) {
        if (await reconcilePendingFulfillmentEvent(event._id)) reconciled += 1;
    }
    return reconciled;
}

function startFulfillmentRecoverySweep() {
    const run = async () => {
        try {
            const reconciled = await sweepPendingFulfillments();
            if (reconciled > 0) {
                console.log(`[Apliiq] Reconciled ${reconciled} pending fulfillment event(s)`);
            }
        } catch (error) {
            console.error('[Apliiq] Fulfillment recovery sweep failed:', error.message);
        }
    };

    const initial = setTimeout(run, 10000);
    initial.unref?.();
    const interval = setInterval(run, 5 * 60 * 1000);
    interval.unref?.();
    return interval;
}

module.exports = {
    applyFulfillmentPayload,
    extractFulfillment,
    reconcilePendingFulfillmentEvent,
    reconcilePendingFulfillmentsForOrder,
    startFulfillmentRecoverySweep,
    sweepPendingFulfillments
};