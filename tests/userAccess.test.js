const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const EmailOutboxEvent = require('../models/EmailOutboxEvent');
const {
    USER,
    USER_PLUS,
    WILDCARD_EARN_SECONDS,
    authorizePaidRoomEntry,
    finishWildcardPeek,
    getUserAccess,
    recordActiveHeartbeat,
    resolveCustomerAudience
} = require('../services/userAccess');

let mongo;
let userCount = 0;

async function createUser(overrides = {}) {
    userCount += 1;
    return User.create({
        name: `Access User ${userCount}`,
        email: `access${userCount}@example.com`,
        password: 'password123',
        ...overrides
    });
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
});

test('only a genuinely active paid subscription resolves to User+', async () => {
    const user = await createUser();
    const userPlusPlan = await Plan.create({
        name: 'User+',
        slug: 'fan-plus',
        category: 'fan',
        tier: 1,
        priceMonthly: 3.99,
        priceYearly: 39
    });
    const expiredPlan = await Subscription.create({
        userId: user._id,
        planId: userPlusPlan._id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(Date.now() - 40 * 86400000),
        currentPeriodEnd: new Date(Date.now() - 10 * 86400000)
    });

    expect(await resolveCustomerAudience(user)).toBe(USER);

    expiredPlan.currentPeriodEnd = new Date(Date.now() + 10 * 86400000);
    await expiredPlan.save();
    expect(await resolveCustomerAudience(user)).toBe(USER_PLUS);
});

test('visibility heartbeats cap elapsed time and grant one pending Wildcard email event at eight hours', async () => {
    const now = new Date('2026-09-04T16:00:00.000Z');
    const user = await createUser({
        customerAccess: {
            activeUserSeconds: WILDCARD_EARN_SECONDS - 30,
            lastHeartbeatAt: new Date(now.getTime() - 60 * 1000),
            wildcardStatus: 'locked'
        }
    });

    const access = await recordActiveHeartbeat(user._id, now);
    expect(access.customerAudience).toBe(USER);
    expect(access.activeUserSeconds).toBe(WILDCARD_EARN_SECONDS + 30);
    expect(access.wildcard.status).toBe('available');
    expect(access.wildcard.emailStatus).toBe('pending');
    expect(access.wildcard.emailEventId).toBeTruthy();
    expect(await EmailOutboxEvent.countDocuments({
        eventId: access.wildcard.emailEventId,
        status: 'pending'
    })).toBe(1);

    const next = await recordActiveHeartbeat(user._id, new Date(now.getTime() + 5 * 60 * 1000));
    expect(next.activeUserSeconds).toBe(WILDCARD_EARN_SECONDS + 120);
    expect(await Notification.countDocuments({ userId: user._id, type: 'wildcard_peek_available' })).toBe(1);
    expect(await EmailOutboxEvent.countDocuments({ userId: user._id, type: 'wildcard_peek_available' })).toBe(1);
});

test('status access repairs a missing Wildcard email outbox row without creating duplicates', async () => {
    const user = await createUser({
        customerAccess: {
            activeUserSeconds: WILDCARD_EARN_SECONDS,
            wildcardStatus: 'available',
            wildcardEmailStatus: 'pending',
            wildcardEmailEventId: 'wildcard-event-fixed-id'
        }
    });

    await getUserAccess(user._id);
    await getUserAccess(user._id);

    expect(await EmailOutboxEvent.countDocuments({ eventId: 'wildcard-event-fixed-id' })).toBe(1);
});

test('a User explicitly spends the Wildcard once for one three-minute paid-room peek', async () => {
    const now = new Date('2026-09-04T16:00:00.000Z');
    const user = await createUser({
        customerAccess: {
            activeUserSeconds: WILDCARD_EARN_SECONDS,
            wildcardStatus: 'available',
            wildcardEmailStatus: 'pending'
        }
    });

    const beforeClaim = await authorizePaidRoomEntry({ userId: user._id, roomId: 'paid-a', now });
    expect(beforeClaim).toMatchObject({ allowed: false, wildcardAvailable: true });

    const claim = await authorizePaidRoomEntry({
        userId: user._id,
        roomId: 'paid-a',
        useWildcard: true,
        now
    });
    expect(claim).toMatchObject({ allowed: true, chargeTokens: false, wildcard: true });
    expect(new Date(claim.expiresAt).getTime()).toBe(now.getTime() + 3 * 60 * 1000);

    const reconnect = await authorizePaidRoomEntry({
        userId: user._id,
        roomId: 'paid-a',
        now: new Date(now.getTime() + 60 * 1000)
    });
    expect(reconnect.allowed).toBe(true);

    const otherRoom = await authorizePaidRoomEntry({
        userId: user._id,
        roomId: 'paid-b',
        useWildcard: true,
        now: new Date(now.getTime() + 60 * 1000)
    });
    expect(otherRoom.allowed).toBe(false);

    await finishWildcardPeek(user._id, 'paid-a', new Date(now.getTime() + 3 * 60 * 1000));
    const finalAccess = await getUserAccess(user._id, new Date(now.getTime() + 3 * 60 * 1000));
    expect(finalAccess.wildcard.status).toBe('used');
});

test('User+ is authorized for paid entry but still owes the room token price', async () => {
    const user = await createUser();
    const plan = await Plan.create({
        name: 'User+',
        slug: 'fan-plus',
        category: 'fan',
        tier: 1,
        priceMonthly: 3.99,
        priceYearly: 39
    });
    await Subscription.create({
        userId: user._id,
        planId: plan._id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(Date.now() - 86400000),
        currentPeriodEnd: new Date(Date.now() + 10 * 86400000)
    });

    await expect(authorizePaidRoomEntry({
        userId: user._id,
        roomId: 'paid-room'
    })).resolves.toMatchObject({
        allowed: true,
        chargeTokens: true,
        customerAudience: USER_PLUS
    });
});