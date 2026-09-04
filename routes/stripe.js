const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getStripeClient, getStripePublishableKey } = require('../services/stripeClient');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const EventsLedger = require('../models/EventsLedger');
const TokenLedger = require('../models/TokenLedger');

const MerchOrder = require('../models/MerchOrder');
const { grantTokensForPlan } = require('./subscriptions');

const TOKEN_PACKS = [
    { id: 'pack_25', tokens: 25, price: 199 },
    { id: 'pack_50', tokens: 50, price: 349 },
    { id: 'pack_100', tokens: 100, price: 599 }
];

router.get('/config', (req, res) => {
    try {
        res.json({ publishableKey: getStripePublishableKey() });
    } catch (err) {
        res.status(500).json({ message: 'Stripe not configured' });
    }
});

router.post('/create-checkout-session', auth, async (req, res) => {
    try {
        const { planSlug, billingCycle, packId } = req.body;
        const stripe = getStripeClient();

        const domain = process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
            : process.env.CLIENT_URL || 'http://localhost:5000';

        let customerId = req.user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: req.user.email,
                name: req.user.name,
                metadata: {
                    wordethUserId: req.user._id.toString(),
                    accountType: req.user.accountType
                }
            });
            customerId = customer.id;
            await User.findByIdAndUpdate(req.user._id, { stripeCustomerId: customerId });
        }

        if (packId) {
            const pack = TOKEN_PACKS.find(p => p.id === packId);
            if (!pack) {
                return res.status(400).json({ message: 'Invalid token pack' });
            }

            const session = await stripe.checkout.sessions.create({
                customer: customerId,
                mode: 'payment',
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${pack.tokens} Wordeth Tokens`,
                            description: `Token pack — ${pack.tokens} tokens for your Wordeth account`
                        },
                        unit_amount: pack.price
                    },
                    quantity: 1
                }],
                metadata: {
                    type: 'token_pack',
                    packId: pack.id,
                    tokens: pack.tokens.toString(),
                    userId: req.user._id.toString()
                },
                success_url: `${domain}/verses.html?payment=success&pack=${pack.id}`,
                cancel_url: `${domain}/verses.html?payment=canceled`
            });

            return res.json({ url: session.url, sessionId: session.id });
        }

        if (!planSlug) {
            return res.status(400).json({ message: 'planSlug or packId is required' });
        }

        const plan = await Plan.findOne({ slug: planSlug, active: true });
        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        if (plan.priceMonthly === 0 && plan.priceYearly === 0) {
            return res.status(400).json({ message: 'Cannot checkout a free plan' });
        }

        const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
        const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
        const interval = cycle === 'yearly' ? 'year' : 'month';

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{
                price_data: {
                    currency: plan.currency?.toLowerCase() || 'usd',
                    product_data: {
                        name: plan.name,
                        description: plan.description || `${plan.name} — ${cycle} subscription`
                    },
                    unit_amount: Math.round(amount * 100),
                    recurring: { interval }
                },
                quantity: 1
            }],
            metadata: {
                type: 'subscription',
                planSlug: plan.slug,
                billingCycle: cycle,
                userId: req.user._id.toString()
            },
            subscription_data: {
                metadata: {
                    planSlug: plan.slug,
                    billingCycle: cycle,
                    userId: req.user._id.toString()
                }
            },
            success_url: `${domain}/pricing.html?payment=success&plan=${plan.slug}`,
            cancel_url: `${domain}/pricing.html?payment=canceled`
        });

        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        res.status(500).json({ message: 'Failed to create checkout session' });
    }
});

router.post('/create-portal-session', auth, async (req, res) => {
    try {
        if (!req.user.stripeCustomerId) {
            return res.status(400).json({ message: 'No billing account found' });
        }

        const stripe = getStripeClient();
        const domain = process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
            : process.env.CLIENT_URL || 'http://localhost:5000';

        const session = await stripe.billingPortal.sessions.create({
            customer: req.user.stripeCustomerId,
            return_url: `${domain}/pricing.html`
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('Portal session error:', error);
        res.status(500).json({ message: 'Failed to create billing portal session' });
    }
});

const processedEvents = new Set();
const PROCESSED_EVENTS_MAX = 5000;

function isEventProcessed(eventId) {
    if (processedEvents.has(eventId)) return true;
    if (processedEvents.size >= PROCESSED_EVENTS_MAX) {
        const first = processedEvents.values().next().value;
        processedEvents.delete(first);
    }
    processedEvents.add(eventId);
    return false;
}

function createWebhookHandler(webhookSecret) {
    return async (req, res) => {
        const sig = req.headers['stripe-signature'];
        if (!webhookSecret) {
            console.error('[Stripe] STRIPE_WEBHOOK_SECRET is not configured — rejecting unverified webhook');
            return res.status(503).json({ error: 'Webhook verification is not configured' });
        }
        const stripe = getStripeClient();

        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error('[Stripe] Webhook signature verification failed:', err.message);
            return res.status(400).json({ error: 'Invalid signature' });
        }

        if (isEventProcessed(event.id)) {
            console.log(`[Stripe] Duplicate event ${event.id} skipped`);
            return res.json({ received: true });
        }

        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    await handleCheckoutComplete(event.data.object);
                    break;

                case 'checkout.session.async_payment_succeeded':
                    await handleCheckoutComplete(event.data.object);
                    break;

                case 'checkout.session.expired':
                    await closeUnpaidMerchOrder(event.data.object, 'cancelled');
                    break;

                case 'checkout.session.async_payment_failed':
                    await closeUnpaidMerchOrder(event.data.object, 'cancelled');
                    break;

                case 'charge.refunded':
                    await handleMerchRefund(event.data.object);
                    break;

                case 'invoice.payment_succeeded':
                    await handleInvoicePayment(event.data.object);
                    break;

                case 'customer.subscription.updated':
                    await handleSubscriptionUpdate(event.data.object);
                    break;

                case 'customer.subscription.deleted':
                    await handleSubscriptionCanceled(event.data.object);
                    break;

                default:
                    break;
            }
            res.json({ received: true });
        } catch (err) {
            console.error(`[Stripe] Error handling ${event.type}:`, err);
            processedEvents.delete(event.id);
            res.status(500).json({ error: 'Webhook handler failed' });
        }
    };
}

async function handleCheckoutComplete(session) {
    const metadata = session.metadata || {};

    if (metadata.type === 'merch_order') {
        await handleMerchCheckoutComplete(session);
        return;
    }

    const existing = await EventsLedger.findOne({ 'metadata.stripeSessionId': session.id });
    if (existing) {
        console.log(`[Stripe] Session ${session.id} already processed, skipping`);
        return;
    }

    if (metadata.type === 'token_pack') {
        const userId = metadata.userId;
        const packId = metadata.packId;
        const tokens = parseInt(metadata.tokens, 10);

        const user = await User.findOneAndUpdate(
            { _id: userId },
            { $inc: { tokenBalance: tokens } },
            { new: true }
        );
        if (!user) {
            console.error('[Stripe] Token pack: user not found', userId);
            return;
        }

        const balanceAfter = user.tokenBalance;
        const balanceBefore = balanceAfter - tokens;

        await TokenLedger.create({
            userId: user._id,
            type: 'pack_purchase',
            amount: tokens,
            balanceBefore,
            balanceAfter,
            metadata: { packId, price: session.amount_total / 100, stripeSessionId: session.id }
        });

        await EventsLedger.create({
            actorId: user._id,
            actorType: 'user',
            eventType: 'token_pack_purchase',
            resourceType: 'token_pack',
            amount: session.amount_total / 100,
            description: `Purchased ${tokens} tokens via Stripe`,
            metadata: { packId, tokens, stripeSessionId: session.id }
        });

        console.log(`[Stripe] Token pack ${packId} (${tokens} tokens) credited to user ${userId}`);
        return;
    }

    if (metadata.type === 'subscription') {
        const userId = metadata.userId;
        const planSlug = metadata.planSlug;
        const billingCycle = metadata.billingCycle;

        const user = await User.findById(userId);
        if (!user) {
            console.error('[Stripe] Subscription: user not found', userId);
            return;
        }

        const plan = await Plan.findOne({ slug: planSlug, active: true });
        if (!plan) {
            console.error('[Stripe] Subscription: plan not found', planSlug);
            return;
        }

        const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
        const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;

        const now = new Date();
        const periodEnd = new Date(now);
        if (cycle === 'yearly') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        if (user.subscriptionId) {
            const existingSub = await Subscription.findById(user.subscriptionId);
            if (existingSub && existingSub.isActive()) {
                const oldPlan = await Plan.findById(existingSub.planId);
                existingSub.planId = plan._id;
                existingSub.billingCycle = cycle;
                existingSub.currentPeriodStart = now;
                existingSub.currentPeriodEnd = periodEnd;
                existingSub.nextBillingAmount = amount;
                existingSub.status = 'active';
                existingSub.cancelAtPeriodEnd = false;
                existingSub.canceledAt = null;
                existingSub.stripeSubscriptionId = session.subscription || null;
                existingSub.lastPaymentAt = now;
                existingSub.lastPaymentAmount = amount;
                await existingSub.save();

                const isUpgrade = plan.tier > (oldPlan?.tier || 0);

                await EventsLedger.create({
                    actorId: user._id,
                    actorType: 'user',
                    eventType: isUpgrade ? 'subscription_upgraded' : 'subscription_downgraded',
                    resourceType: 'subscription',
                    resourceId: existingSub._id,
                    amount,
                    metadata: { planSlug, billingCycle: cycle, previousPlan: oldPlan?.slug, stripeSessionId: session.id }
                });

                user.customerAudience = 'USER_PLUS';
                await user.save();

                await grantTokensForPlan(user, planSlug);
                console.log(`[Stripe] Subscription updated for user ${userId} to ${planSlug}`);
                return;
            }
        }

        const subscription = new Subscription({
            userId: user._id,
            planId: plan._id,
            status: 'active',
            billingCycle: cycle,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            nextBillingAmount: amount,
            stripeSubscriptionId: session.subscription || null,
            lastPaymentAt: now,
            lastPaymentAmount: amount
        });
        await subscription.save();

        user.subscriptionId = subscription._id;
        user.customerAudience = 'USER_PLUS';
        await user.save();

        await EventsLedger.create({
            actorId: user._id,
            actorType: 'user',
            eventType: 'subscription_created',
            resourceType: 'subscription',
            resourceId: subscription._id,
            amount,
            metadata: { planSlug, billingCycle: cycle, stripeSessionId: session.id }
        });

        await grantTokensForPlan(user, planSlug);
        console.log(`[Stripe] New subscription created for user ${userId}: ${planSlug}`);
    }
}

function clean(value, max = 500) {
    return value == null ? '' : String(value).trim().substring(0, max);
}
async function handleInvoicePayment(invoice) {
    if (!invoice.subscription) return;

    const existingEvent = await EventsLedger.findOne({ 'metadata.stripeInvoiceId': invoice.id });
    if (existingEvent) {
        console.log(`[Stripe] Invoice ${invoice.id} already processed, skipping`);
        return;
    }

    const sub = await Subscription.findOne({ stripeSubscriptionId: invoice.subscription });
    if (!sub) return;

    sub.lastPaymentAt = new Date();
    sub.lastPaymentAmount = (invoice.amount_paid || 0) / 100;
    sub.status = 'active';
    await sub.save();

    const isFirstInvoice = invoice.billing_reason === 'subscription_create';
    if (!isFirstInvoice) {
        const user = await User.findById(sub.userId);
        if (user) {
            const plan = await Plan.findById(sub.planId);
            if (plan) {
                await grantTokensForPlan(user, plan.slug);
            }
        }
    }

    await EventsLedger.create({
        actorId: sub.userId,
        actorType: 'system',
        eventType: 'payment_succeeded',
        resourceType: 'subscription',
        resourceId: sub._id,
        amount: (invoice.amount_paid || 0) / 100,
        metadata: { stripeInvoiceId: invoice.id, stripeSubscriptionId: invoice.subscription, billingReason: invoice.billing_reason }
    });

    console.log(`[Stripe] Invoice payment succeeded for subscription ${invoice.subscription}`);
}

async function handleSubscriptionUpdate(stripeSub) {
    const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSub.id });
    if (!sub) return;

    const statusMap = {
        active: 'active',
        trialing: 'trialing',
        past_due: 'past_due',
        canceled: 'canceled',
        unpaid: 'past_due',
        incomplete: 'past_due',
        incomplete_expired: 'expired',
        paused: 'paused'
    };

    sub.status = statusMap[stripeSub.status] || sub.status;
    if (stripeSub.cancel_at_period_end) {
        sub.cancelAtPeriodEnd = true;
    }
    if (stripeSub.current_period_end) {
        sub.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
    }
    if (stripeSub.current_period_start) {
        sub.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
    }
    await sub.save();

    console.log(`[Stripe] Subscription ${stripeSub.id} updated to status: ${stripeSub.status}`);
}

async function handleSubscriptionCanceled(stripeSub) {
    const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSub.id });
    if (!sub) return;

    sub.status = 'canceled';
    sub.canceledAt = new Date();
    await sub.save();

    await EventsLedger.create({
        actorId: sub.userId,
        actorType: 'system',
        eventType: 'subscription_canceled',
        resourceType: 'subscription',
        resourceId: sub._id,
        metadata: { stripeSubscriptionId: stripeSub.id, reason: stripeSub.cancellation_details?.reason || 'unknown' }
    });

    console.log(`[Stripe] Subscription ${stripeSub.id} canceled`);
}

module.exports = router;
module.exports.createWebhookHandler = createWebhookHandler;
module.exports.handleCheckoutComplete = handleCheckoutComplete;
module.exports.handleMerchRefund = handleMerchRefund;

async function closeUnpaidMerchOrder(session, status) {
    if (session.metadata?.type !== 'merch_order') return;
    await MerchOrder.updateOne(
        {
            _id: session.metadata.merchOrderId,
            'payment.stripeCheckoutSessionId': session.id,
            'payment.status': 'unpaid'
        },
        {
            $set: {
                status,
                'payment.status': 'cancelled',
                'payment.closedAt': new Date(),
                'apliiq.submissionStatus': 'cancelled',
                'apliiq.nextAttemptAt': null
            }
        }
    );
}

async function handleMerchRefund(charge) {
    const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (!paymentIntentId) return;
    const amountRefunded = Math.max(0, Number(charge.amount_refunded) || 0);
    const chargeAmount = Math.max(0, Number(charge.amount) || 0);
    const fullyRefunded = charge.refunded === true
        || (chargeAmount > 0 && amountRefunded >= chargeAmount);

    if (!fullyRefunded) {
        await MerchOrder.updateOne(
            {
                'payment.stripePaymentIntentId': paymentIntentId,
                'payment.status': 'paid'
            },
            {
                $set: {
                    'payment.amountRefunded': amountRefunded / 100,
                    'payment.lastRefundAt': new Date()
                }
            }
        );
        return;
    }

    await MerchOrder.updateOne(
        {
            'payment.stripePaymentIntentId': paymentIntentId,
            'payment.status': 'paid',
            'apliiq.orderId': { $in: ['', null] }
        },
        {
            $set: {
                status: 'refunded',
                'payment.status': 'refunded',
                'payment.amountRefunded': amountRefunded / 100,
                'payment.lastRefundAt': new Date(),
                'payment.closedAt': new Date(),
                'apliiq.submissionStatus': 'cancelled',
                'apliiq.nextAttemptAt': null,
                'apliiq.lastError': 'Refunded before fulfillment submission completed'
            }
        }
    );
    await MerchOrder.updateOne(
        {
            'payment.stripePaymentIntentId': paymentIntentId,
            'payment.status': 'paid',
            'apliiq.orderId': { $nin: ['', null] }
        },
        {
            $set: {
                status: 'refunded',
                'payment.status': 'refunded',
                'payment.amountRefunded': amountRefunded / 100,
                'payment.lastRefundAt': new Date(),
                'payment.closedAt': new Date(),
                'apliiq.lastError': 'Refunded after the order was submitted; staff review required'
            }
        }
    );
}

const { submitApliiqOrder } = require('../services/apliiqOrders');

async function handleMerchCheckoutComplete(session) {
    if (session.payment_status !== 'paid') {
        throw new Error(`Merch checkout ${session.id} is not paid`);
    }
    const orderId = session.metadata?.merchOrderId;
    if (!orderId) throw new Error('Merch checkout is missing its order ID');

    const stripe = getStripeClient();
    const shipping = session.shipping_details
        || session.collected_information?.shipping_details
        || session.customer_details?.shipping
        || {};
    const address = shipping.address || session.customer_details?.address || {};
    const order = await MerchOrder.findOne({
        _id: orderId,
        'payment.stripeCheckoutSessionId': session.id
    }).select('totalPrice payment.status').lean();
    if (!order) throw new Error(`Merch order ${orderId} not found`);
    if (session.amount_subtotal !== Math.round(order.totalPrice * 100)) {
        throw new Error(`Merch checkout ${session.id} amount does not match the order`);
    }
    let rate = null;
    const rateId = typeof session.shipping_cost?.shipping_rate === 'string'
        ? session.shipping_cost.shipping_rate
        : session.shipping_cost?.shipping_rate?.id;
    if (rateId) rate = await stripe.shippingRates.retrieve(rateId);
    const shippingCode = clean(rate?.metadata?.wordethShippingCode, 20);
    if (!['standard', 'upgraded', 'rush'].includes(shippingCode)) {
        throw new Error(`Merch checkout ${session.id} has an invalid shipping choice`);
    }
    const fullName = clean(shipping.name || session.customer_details?.name, 200);
    const pieces = fullName.split(/\s+/).filter(Boolean);
    const firstName = clean(pieces.shift(), 100);
    const lastName = clean(pieces.join(' '), 100);
    if (!firstName || !lastName || !address.line1 || !address.city || !address.postal_code || !address.country) {
        throw new Error(`Merch checkout ${session.id} has an incomplete shipping address`);
    }

    const update = await MerchOrder.updateOne(
        {
            _id: orderId,
            'payment.stripeCheckoutSessionId': session.id,
            'payment.status': 'unpaid',
            status: 'pending'
        },
        {
            $set: {
                shippingAddress: {
                    name: fullName,
                    firstName,
                    lastName,
                    company: clean(shipping.company, 200),
                    phone: clean(shipping.phone || session.customer_details?.phone, 100),
                    line1: clean(address.line1, 300),
                    line2: clean(address.line2, 300),
                    city: clean(address.city, 150),
                    state: clean(address.state, 100),
                    postalCode: clean(address.postal_code, 50),
                    countryCode: clean(address.country, 2).toUpperCase()
                },
                shippingChoice: {
                    code: shippingCode,
                    label: clean(rate?.display_name, 100),
                    amount: (session.shipping_cost?.amount_total || 0) / 100,
                    currency: clean(session.currency || 'usd', 10).toLowerCase(),
                    stripeShippingRateId: clean(rateId, 200)
                },
                'payment.status': 'paid',
                'payment.stripePaymentIntentId': clean(session.payment_intent, 200),
                'payment.amountPaid': (session.amount_total || 0) / 100,
                'payment.currency': clean(session.currency || 'usd', 10).toLowerCase(),
                'payment.paidAt': new Date(),
                'apliiq.submissionStatus': 'pending',
                'apliiq.nextAttemptAt': new Date()
            }
        }
    );
    if (update.modifiedCount === 0) {
        const existing = await MerchOrder.findById(orderId).select('payment.status').lean();
        if (existing.payment?.status !== 'paid') {
            throw new Error(`Merch order ${orderId} is closed and cannot be fulfilled`);
        }
    }

    const result = await submitApliiqOrder(orderId);
    if (result.failed) {
        console.error(`[Apliiq] Order ${orderId} requires staff attention: ${result.error}`);
    }
}
