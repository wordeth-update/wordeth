const crypto = require('crypto');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const EmailOutboxEvent = require('../models/EmailOutboxEvent');

const USER = 'USER';
const USER_PLUS = 'USER_PLUS';
const WILDCARD_EARN_SECONDS = 8 * 60 * 60;
const WILDCARD_PEEK_MS = 3 * 60 * 1000;
const HEARTBEAT_MAX_SECONDS = 90;

async function ensureWildcardEmailEvent(user) {
    const eventId = user?.customerAccess?.wildcardEmailEventId;
    if (!eventId || user.customerAccess.wildcardEmailStatus !== 'pending') return;
    await EmailOutboxEvent.findOneAndUpdate(
        { eventId },
        {
            $setOnInsert: {
                eventId,
                userId: user._id,
                type: 'wildcard_peek_available',
                status: 'pending',
                payload: {
                    activeHours: 8,
                    peekMinutes: 3,
                    lifetimeUses: 1
                }
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function resolveCustomerAudience(userOrId) {
    const userId = userOrId?._id || userOrId;
    if (!userId) return USER;

    const subscriptions = await Subscription.find({
        userId,
        status: { $in: ['active', 'trialing', 'past_due', 'canceled'] }
    })
        .sort({ updatedAt: -1 })
        .populate('planId');

    const paid = subscriptions.find(subscription => {
        if (!subscription.isActive() || subscription.billingCycle === 'free') return false;
        if (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) <= new Date()) return false;
        const plan = subscription.planId;
        return Boolean(plan && plan.active !== false && (
            plan.tier > 0 ||
            plan.priceMonthly > 0 ||
            plan.priceYearly > 0 ||
            plan.isCustomPricing
        ));
    });
    return paid ? USER_PLUS : USER;
}

async function expireWildcardIfNeeded(userId, now = new Date()) {
    return User.findOneAndUpdate({
        _id: userId,
        'customerAccess.wildcardStatus': 'active',
        'customerAccess.wildcardExpiresAt': { $lte: now }
    }, {
        $set: {
            'customerAccess.wildcardStatus': 'used',
            'customerAccess.wildcardUsedAt': now
        }
    }, { new: true });
}

function accessShape(user, audience, now = new Date()) {
    const access = user.customerAccess || {};
    const activeSeconds = Math.max(0, Number(access.activeUserSeconds) || 0);
    const expiresAt = access.wildcardExpiresAt || null;
    const wildcardStatus = access.wildcardStatus || 'locked';
    return {
        customerAudience: audience,
        isUserPlus: audience === USER_PLUS,
        canCreatePaidRooms: audience === USER_PLUS,
        canEnterPaidRooms: audience === USER_PLUS,
        activeUserSeconds: activeSeconds,
        wildcard: {
            status: wildcardStatus,
            eligible: wildcardStatus === 'available',
            secondsUntilEligible: Math.max(0, WILDCARD_EARN_SECONDS - activeSeconds),
            roomId: access.wildcardRoomId || '',
            expiresAt,
            remainingSeconds: wildcardStatus === 'active' && expiresAt
                ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 1000))
                : 0,
            emailStatus: access.wildcardEmailStatus || 'none',
            emailEventId: access.wildcardEmailEventId || ''
        }
    };
}

async function getUserAccess(userOrId, now = new Date()) {
    const userId = userOrId?._id || userOrId;
    await expireWildcardIfNeeded(userId, now);
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const audience = await resolveCustomerAudience(user);
    if (user.customerAudience !== audience) {
        await User.updateOne({ _id: user._id }, { $set: { customerAudience: audience } });
        user.customerAudience = audience;
    }
    await ensureWildcardEmailEvent(user);
    return accessShape(user, audience, now);
}

async function recordActiveHeartbeat(userId, now = new Date()) {
    let updated;
    let audience = USER;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const user = await User.findById(userId).select('customerAudience customerAccess');
        if (!user) throw new Error('User not found');
        audience = await resolveCustomerAudience(userId);
        const last = user.customerAccess?.lastHeartbeatAt || null;
        const elapsed = last
            ? Math.max(0, Math.min(
                HEARTBEAT_MAX_SECONDS,
                Math.floor((now.getTime() - new Date(last).getTime()) / 1000)
            ))
            : 0;
        const filter = { _id: userId };
        filter['customerAccess.lastHeartbeatAt'] = last || null;
        const update = {
            $set: {
                customerAudience: audience,
                'customerAccess.lastHeartbeatAt': now
            }
        };
        if (audience === USER && elapsed > 0) {
            update.$inc = { 'customerAccess.activeUserSeconds': elapsed };
        }
        updated = await User.findOneAndUpdate(filter, update, { new: true });
        if (updated) break;
    }
    if (!updated) throw new Error('Could not record active time');

    const access = updated.customerAccess || {};
    if (
        audience === USER &&
        Number(access.activeUserSeconds) >= WILDCARD_EARN_SECONDS &&
        (access.wildcardStatus === 'locked' || !access.wildcardStatus)
    ) {
        const eventId = crypto.randomUUID();
        const grant = await User.findOneAndUpdate({
            _id: userId,
            'customerAccess.activeUserSeconds': { $gte: WILDCARD_EARN_SECONDS },
            $or: [
                { 'customerAccess.wildcardStatus': 'locked' },
                { 'customerAccess.wildcardStatus': { $exists: false } }
            ]
        }, {
            $set: {
                'customerAccess.wildcardStatus': 'available',
                'customerAccess.wildcardGrantedAt': now,
                'customerAccess.wildcardEmailStatus': 'pending',
                'customerAccess.wildcardEmailEventId': eventId
            }
        }, { new: true });
        if (grant) {
            updated = grant;
            await ensureWildcardEmailEvent(grant);
            await Notification.create({
                userId,
                type: 'wildcard_peek_available',
                fromUserId: userId,
                fromUserName: 'Wordeth'
            }).catch(error => console.warn('[Access] Wildcard notification failed:', error.message));
        }
    }

    await ensureWildcardEmailEvent(updated);

    return accessShape(updated, audience, now);
}

async function authorizePaidRoomEntry({ userId, roomId, useWildcard = false, now = new Date() }) {
    await expireWildcardIfNeeded(userId, now);
    const audience = await resolveCustomerAudience(userId);
    if (audience === USER_PLUS) {
        return { allowed: true, chargeTokens: true, customerAudience: USER_PLUS };
    }

    const user = await User.findById(userId).select('customerAccess');
    if (!user) return { allowed: false, code: 'AUTH_REQUIRED' };
    const access = user.customerAccess || {};
    if (
        access.wildcardStatus === 'active' &&
        access.wildcardRoomId === roomId &&
        access.wildcardExpiresAt &&
        new Date(access.wildcardExpiresAt) > now
    ) {
        return {
            allowed: true,
            chargeTokens: false,
            wildcard: true,
            expiresAt: access.wildcardExpiresAt,
            customerAudience: USER
        };
    }

    if (useWildcard) {
        const expiresAt = new Date(now.getTime() + WILDCARD_PEEK_MS);
        const claimed = await User.findOneAndUpdate({
            _id: userId,
            'customerAccess.wildcardStatus': 'available'
        }, {
            $set: {
                'customerAccess.wildcardStatus': 'active',
                'customerAccess.wildcardRoomId': roomId,
                'customerAccess.wildcardStartedAt': now,
                'customerAccess.wildcardExpiresAt': expiresAt
            }
        }, { new: true });
        if (claimed) {
            return {
                allowed: true,
                chargeTokens: false,
                wildcard: true,
                expiresAt,
                customerAudience: USER
            };
        }
    }

    return {
        allowed: false,
        code: 'USER_PLUS_REQUIRED',
        customerAudience: USER,
        wildcardAvailable: access.wildcardStatus === 'available',
        message: access.wildcardStatus === 'available'
            ? 'Use your one-time 3-minute Wildcard to peek into this paid room.'
            : 'Paid rooms are available to User+ members.'
    };
}

async function finishWildcardPeek(userId, roomId, now = new Date()) {
    return User.updateOne({
        _id: userId,
        'customerAccess.wildcardStatus': 'active',
        'customerAccess.wildcardRoomId': roomId
    }, {
        $set: {
            'customerAccess.wildcardStatus': 'used',
            'customerAccess.wildcardUsedAt': now
        }
    });
}

module.exports = {
    HEARTBEAT_MAX_SECONDS,
    USER,
    USER_PLUS,
    WILDCARD_EARN_SECONDS,
    WILDCARD_PEEK_MS,
    authorizePaidRoomEntry,
    finishWildcardPeek,
    getUserAccess,
    recordActiveHeartbeat,
    resolveCustomerAudience
};