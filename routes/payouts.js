const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const TokenLedger = require('../models/TokenLedger');
const EventsLedger = require('../models/EventsLedger');
const PayoutRequest = require('../models/PayoutRequest');
const { getStripeClient } = require('../services/stripeClient');
const { CASHOUT_RATE, MIN_PAYOUT_USD, MIN_PAYOUT_TOKENS, dollarsFor } = require('../services/tokenPacks');
const { authenticateAdvertiser, requireAdmin } = require('./ads');

/**
 * Token earnings becoming money.
 *
 *   1. The creator sets up payouts once. Stripe's own pages take their
 *      identity, bank account and tax details (Stripe Connect Express);
 *      none of it touches Wordeth. Stripe tells us when the account may
 *      receive money (account.updated webhook → payoutsEnabled).
 *   2. The creator asks for a payout. The tokens leave their earnings at
 *      once, so they cannot be asked for twice, and a request is written.
 *   3. An admin approves it in w-admin. That is a Stripe transfer from
 *      Wordeth's Stripe balance to the creator's connected account, keyed
 *      by the request id so a retry never pays twice. Stripe then pays the
 *      creator's bank on its own schedule and files their tax forms.
 *   4. Turned down, the tokens go back.
 *
 * Anyone who has earned tokens may ask: a host charging at the door as
 * much as an artist or a designer.
 */

function siteUrl() {
    return process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : process.env.CLIENT_URL || 'http://localhost:5000';
}

function shape(r) {
    return {
        id: r._id, tokens: r.tokens, amountUsd: r.amountUsd, status: r.status, note: r.note,
        requestedAt: r.createdAt, decidedAt: r.decidedAt, paidAt: r.paidAt, error: r.error || ''
    };
}

/** Where the creator stands: earnings, what they are worth, whether payouts are set up, open and past requests. */
router.get('/status', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('tokenEarnings stripeConnectId payoutsEnabled');
        const requests = await PayoutRequest.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20);
        const open = requests.find((r) => r.status === 'requested') || null;
        res.json({
            tokenEarnings: user.tokenEarnings || 0,
            earningsValue: dollarsFor(user.tokenEarnings || 0),
            rate: CASHOUT_RATE,
            minimumUsd: MIN_PAYOUT_USD,
            minimumTokens: MIN_PAYOUT_TOKENS,
            connected: !!user.stripeConnectId,
            payoutsEnabled: !!user.payoutsEnabled,
            canRequest: !!user.payoutsEnabled && !open && (user.tokenEarnings || 0) >= MIN_PAYOUT_TOKENS,
            open: open ? shape(open) : null,
            history: requests.filter((r) => r.status !== 'requested').map(shape)
        });
    } catch (error) {
        console.error('[Payouts] status:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/** Begin, or resume, setting up where payouts go. Answers with a Stripe page to send the creator to. */
router.post('/connect/start', auth, async (req, res) => {
    try {
        const stripe = getStripeClient();
        const user = await User.findById(req.user._id);
        if (!user.stripeConnectId) {
            const account = await stripe.accounts.create({
                type: 'express',
                email: user.email,
                capabilities: { transfers: { requested: true } },
                business_type: 'individual',
                metadata: { userId: user._id.toString() }
            });
            user.stripeConnectId = account.id;
            await user.save();
        }
        const link = await stripe.accountLinks.create({
            account: user.stripeConnectId,
            type: 'account_onboarding',
            refresh_url: `${siteUrl()}/creator-dashboard.html?payouts=again`,
            return_url: `${siteUrl()}/creator-dashboard.html?payouts=done`
        });
        res.json({ url: link.url });
    } catch (error) {
        console.error('[Payouts] connect:', error.message);
        const notOn = /Connect|platform/i.test(error.message || '');
        res.status(notOn ? 503 : 500).json({
            message: notOn
                ? 'Payouts are not switched on at Stripe yet. Please check back soon.'
                : 'Stripe could not start the setup. Nothing was changed; please try again.'
        });
    }
});

/** Ask Stripe where the account stands and remember it. Also runs from the webhook. */
async function syncConnected(user) {
    if (!user.stripeConnectId) return false;
    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(user.stripeConnectId);
    const ok = !!account.payouts_enabled && account.capabilities?.transfers === 'active';
    if (user.payoutsEnabled !== ok) {
        user.payoutsEnabled = ok;
        await user.save();
    }
    return ok;
}

/** Back from Stripe's pages: look again rather than wait for the webhook. */
router.post('/connect/refresh', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({ payoutsEnabled: await syncConnected(user) });
    } catch (error) {
        console.error('[Payouts] refresh:', error.message);
        res.status(500).json({ message: 'Stripe did not answer. Try again in a moment.' });
    }
});

/** Ask for everything earned so far, as money. The tokens are held from this moment. */
router.post('/request', auth, async (req, res) => {
    try {
        const open = await PayoutRequest.findOne({ userId: req.user._id, status: 'requested' });
        if (open) return res.status(409).json({ message: 'You already have a payout on its way. One at a time.' });
        const user = await User.findById(req.user._id);
        if (!user.payoutsEnabled) return res.status(400).json({ message: 'Set up where payouts go first.', code: 'NOT_CONNECTED' });
        const tokens = Math.floor(user.tokenEarnings || 0);
        if (tokens < MIN_PAYOUT_TOKENS) {
            return res.status(400).json({ message: `Payouts start at $${MIN_PAYOUT_USD} (${MIN_PAYOUT_TOKENS} tokens). You have ${tokens}.`, code: 'BELOW_MINIMUM' });
        }
        // Take the tokens out of play in one atomic step; a race cannot take them twice.
        const held = await User.findOneAndUpdate(
            { _id: user._id, tokenEarnings: { $gte: tokens } },
            { $inc: { tokenEarnings: -tokens } },
            { new: true }
        );
        if (!held) return res.status(409).json({ message: 'Your earnings changed just now. Look again and retry.' });
        const request = await PayoutRequest.create({
            userId: user._id, tokens, amountUsd: dollarsFor(tokens), rate: CASHOUT_RATE, stripeAccountId: user.stripeConnectId
        });
        await TokenLedger.create({
            userId: user._id, type: 'payout_request', amount: -tokens,
            balanceBefore: held.tokenEarnings + tokens, balanceAfter: held.tokenEarnings,
            metadata: { requestId: request._id.toString(), amountUsd: request.amountUsd }
        });
        res.json({ message: `Asked for $${request.amountUsd.toFixed(2)}. You will hear when it is sent.`, request: shape(request) });
    } catch (error) {
        console.error('[Payouts] request:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/** Put a request's tokens back into the creator's earnings. */
async function giveBack(request, type, note) {
    const user = await User.findOneAndUpdate({ _id: request.userId }, { $inc: { tokenEarnings: request.tokens } }, { new: true });
    if (user) {
        await TokenLedger.create({
            userId: user._id, type, amount: request.tokens,
            balanceBefore: user.tokenEarnings - request.tokens, balanceAfter: user.tokenEarnings,
            metadata: { requestId: request._id.toString(), note }
        });
    }
}

/** Change of mind before it is paid. */
router.post('/request/:id/cancel', auth, async (req, res) => {
    try {
        const request = await PayoutRequest.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id, status: 'requested' },
            { $set: { status: 'cancelled', decidedAt: new Date(), decidedBy: 'creator' } },
            { new: true }
        );
        if (!request) return res.status(404).json({ message: 'No open request to cancel.' });
        await giveBack(request, 'payout_refund', 'cancelled by creator');
        res.json({ message: 'Cancelled. The tokens are back in your earnings.' });
    } catch (error) {
        console.error('[Payouts] cancel:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ── Admin ──────────────────────────────────────────────────────────────

router.get('/admin/requests', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const status = ['requested', 'paid', 'rejected', 'failed', 'cancelled'].includes(req.query.status) ? req.query.status : 'requested';
        const list = await PayoutRequest.find({ status }).sort({ createdAt: status === 'requested' ? 1 : -1 }).limit(200)
            .populate('userId', 'name email accountType payoutsEnabled');
        res.json({
            minimumUsd: MIN_PAYOUT_USD, rate: CASHOUT_RATE,
            requests: list.map((r) => ({
                ...shape(r),
                user: r.userId ? { id: r.userId._id, name: r.userId.name, email: r.userId.email, accountType: r.userId.accountType, payoutsEnabled: r.userId.payoutsEnabled } : null
            }))
        });
    } catch (error) {
        console.error('[Payouts] admin list:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/** Pay it: a transfer to the creator's connected account, keyed by the request so a retry cannot pay twice. */
router.post('/admin/requests/:id/pay', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const request = await PayoutRequest.findOne({ _id: req.params.id, status: { $in: ['requested', 'failed'] } });
        if (!request) return res.status(404).json({ message: 'No payable request with that id.' });
        const user = await User.findById(request.userId);
        if (!user || !user.stripeConnectId) return res.status(400).json({ message: 'This creator has no connected account.' });
        if (!(await syncConnected(user))) {
            return res.status(400).json({ message: 'Stripe has not finished enabling payouts for this creator. Ask them to complete the setup.' });
        }
        const stripe = getStripeClient();
        let transfer;
        try {
            transfer = await stripe.transfers.create({
                amount: Math.round(request.amountUsd * 100),
                currency: 'usd',
                destination: user.stripeConnectId,
                description: `Wordeth payout: ${request.tokens} tokens`,
                metadata: { requestId: request._id.toString(), userId: user._id.toString(), tokens: String(request.tokens) }
            }, { idempotencyKey: `payout-${request._id.toString()}` });
        } catch (stripeErr) {
            request.status = 'failed';
            request.error = stripeErr.message || 'Stripe refused the transfer';
            request.decidedAt = new Date();
            request.decidedBy = String(req.advertiserId || 'admin');
            await request.save();
            return res.status(502).json({ message: `Stripe refused: ${request.error}. Nothing was paid; the request is marked failed and can be retried.` });
        }
        request.status = 'paid';
        request.stripeTransferId = transfer.id;
        request.stripeAccountId = user.stripeConnectId;
        request.paidAt = new Date();
        request.decidedAt = new Date();
        request.decidedBy = String(req.advertiserId || 'admin');
        request.error = '';
        await request.save();
        await TokenLedger.create({
            userId: user._id, type: 'creator_payout', amount: 0,
            balanceBefore: user.tokenEarnings || 0, balanceAfter: user.tokenEarnings || 0,
            metadata: { requestId: request._id.toString(), tokens: request.tokens, amountUsd: request.amountUsd, stripeTransferId: transfer.id }
        });
        await EventsLedger.create({
            actorId: user._id, actorType: 'user', eventType: 'token_payout', resourceType: 'payout_request', resourceId: request._id,
            amount: request.amountUsd, description: `Paid $${request.amountUsd.toFixed(2)} for ${request.tokens} tokens to ${user.name}`,
            metadata: { stripeTransferId: transfer.id, rate: CASHOUT_RATE }
        }).catch(() => {});
        res.json({ message: `Sent $${request.amountUsd.toFixed(2)} to ${user.name}.`, request: shape(request) });
    } catch (error) {
        console.error('[Payouts] pay:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/admin/requests/:id/reject', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const note = String(req.body?.note || '').slice(0, 300);
        const request = await PayoutRequest.findOneAndUpdate(
            { _id: req.params.id, status: { $in: ['requested', 'failed'] } },
            { $set: { status: 'rejected', note, decidedAt: new Date(), decidedBy: String(req.advertiserId || 'admin') } },
            { new: true }
        );
        if (!request) return res.status(404).json({ message: 'No open request with that id.' });
        await giveBack(request, 'payout_refund', note || 'declined');
        res.json({ message: 'Declined. The tokens are back in their earnings.' });
    } catch (error) {
        console.error('[Payouts] reject:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/** Stripe says a connected account changed: remember whether it may be paid. */
async function onAccountUpdated(account) {
    const user = await User.findOne({ stripeConnectId: account.id });
    if (!user) return;
    const ok = !!account.payouts_enabled && account.capabilities?.transfers === 'active';
    if (user.payoutsEnabled !== ok) {
        user.payoutsEnabled = ok;
        await user.save();
    }
}

module.exports = router;
module.exports.onAccountUpdated = onAccountUpdated;
