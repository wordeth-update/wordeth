/**
 * Scheduled rooms route tests — split validation, approval gates, and the
 * privacy requirement: public listing endpoints return only an interest count
 * plus the caller's own isInterested flag, never rosters of user IDs.
 */
require('./setup');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const ScheduledRoom = require('../models/ScheduledRoom');
const RoomInterest = require('../models/RoomInterest');
const Notification = require('../models/Notification');
const scheduledRoomsRouter = require('../routes/scheduledRooms');

let mongod, app;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    app = express();
    app.use(express.json());
    app.use('/api/scheduled-rooms', scheduledRoomsRouter);
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

afterEach(async () => {
    await Promise.all([
        User.deleteMany({}), ScheduledRoom.deleteMany({}),
        RoomInterest.deleteMany({}), Notification.deleteMany({})
    ]);
});

async function makeUser(name) {
    const user = await User.create({ name, email: `${name}@test.com`, password: 'password123' });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    return { user, token };
}

const futureTime = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe('create validation', () => {
    test('rejects splits that do not total 100%', async () => {
        const { token } = await makeUser('host');
        const { user: c1 } = await makeUser('collab1');
        const res = await request(app).post('/api/scheduled-rooms')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Jam', startTime: futureTime(), hostSplitPercent: 50,
                collaborators: [{ userId: c1._id, splitPercent: 40 }]
            });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/100%/);
    });

    test('accepts valid splits and invites collaborators', async () => {
        const { token } = await makeUser('host');
        const { user: c1 } = await makeUser('collab1');
        const res = await request(app).post('/api/scheduled-rooms')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Jam <script>', startTime: futureTime(), hostSplitPercent: 60,
                approvalMode: 'real-time',
                collaborators: [{ userId: c1._id, splitPercent: 40 }]
            });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('scheduled'); // real-time schedules immediately
        expect(await Notification.countDocuments({ userId: c1._id, type: 'collab_invite' })).toBe(1);
    });

    test('rejects more than 5 collaborators', async () => {
        const { token } = await makeUser('host');
        const collabs = [];
        for (let i = 0; i < 6; i++) {
            const { user } = await makeUser(`c${i}`);
            collabs.push({ userId: user._id, splitPercent: 10 });
        }
        const res = await request(app).post('/api/scheduled-rooms')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Crowd', startTime: futureTime(), collaborators: collabs });
        expect(res.status).toBe(400);
    });

    test('pre-schedule mode starts as pending_approval', async () => {
        const { token } = await makeUser('host');
        const { user: c1 } = await makeUser('collab1');
        const res = await request(app).post('/api/scheduled-rooms')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Strict', startTime: futureTime(), approvalMode: 'pre-schedule',
                collaborators: [{ userId: c1._id, splitPercent: 25 }]
            });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('pending_approval');
    });

    test('rejects busy collaborators (already committed to a scheduled room)', async () => {
        const { user: busyUser } = await makeUser('busy');
        await ScheduledRoom.create({
            title: 'Existing', hostUserId: busyUser._id, hostName: 'busy',
            hostSplitPercent: 100, startTime: new Date(Date.now() + 3600000), status: 'scheduled'
        });
        const { token } = await makeUser('host');
        const res = await request(app).post('/api/scheduled-rooms')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Conflict', startTime: futureTime(),
                collaborators: [{ userId: busyUser._id, splitPercent: 50 }]
            });
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/busy/i);
    });
});

describe('approval gates', () => {
    test('pre-schedule room becomes scheduled only after all approve', async () => {
        const { token: hostToken } = await makeUser('host');
        const a = await makeUser('collabA');
        const b = await makeUser('collabB');
        const create = await request(app).post('/api/scheduled-rooms')
            .set('Authorization', `Bearer ${hostToken}`)
            .send({
                title: 'Gate', startTime: futureTime(), approvalMode: 'pre-schedule',
                collaborators: [
                    { userId: a.user._id, splitPercent: 20 },
                    { userId: b.user._id, splitPercent: 20 }
                ]
            });
        const id = create.body.id;

        await request(app).post(`/api/scheduled-rooms/${id}/respond`)
            .set('Authorization', `Bearer ${a.token}`).send({ action: 'approve' });
        expect((await ScheduledRoom.findById(id)).status).toBe('pending_approval');

        await request(app).post(`/api/scheduled-rooms/${id}/respond`)
            .set('Authorization', `Bearer ${b.token}`).send({ action: 'approve' });
        expect((await ScheduledRoom.findById(id)).status).toBe('scheduled');
    });

    test('open is blocked until every collaborator approves (real-time mode)', async () => {
        const { user: host, token: hostToken } = await makeUser('host');
        const a = await makeUser('collabA');
        const sr = await ScheduledRoom.create({
            title: 'RT', hostUserId: host._id, hostName: 'host', hostSplitPercent: 70,
            approvalMode: 'real-time', startTime: new Date(Date.now() + 5 * 60 * 1000),
            status: 'scheduled',
            collaborators: [{ userId: a.user._id, userName: 'collabA', splitPercent: 30, status: 'pending' }]
        });

        const blocked = await request(app).post(`/api/scheduled-rooms/${sr._id}/open`)
            .set('Authorization', `Bearer ${hostToken}`);
        expect(blocked.status).toBe(409);
        expect(blocked.body.message).toMatch(/approval/i);
    });

    test('only the host can open', async () => {
        const { user: host } = await makeUser('host');
        const outsider = await makeUser('outsider');
        const sr = await ScheduledRoom.create({
            title: 'Mine', hostUserId: host._id, hostName: 'host', hostSplitPercent: 100,
            startTime: new Date(Date.now() + 5 * 60 * 1000), status: 'scheduled'
        });
        const res = await request(app).post(`/api/scheduled-rooms/${sr._id}/open`)
            .set('Authorization', `Bearer ${outsider.token}`);
        expect(res.status).toBe(403);
    });

    test('open is blocked when too early (more than 15 min before start)', async () => {
        const { user: host, token } = await makeUser('host');
        const sr = await ScheduledRoom.create({
            title: 'Early', hostUserId: host._id, hostName: 'host', hostSplitPercent: 100,
            startTime: new Date(Date.now() + 2 * 60 * 60 * 1000), status: 'scheduled'
        });
        const res = await request(app).post(`/api/scheduled-rooms/${sr._id}/open`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/early/i);
    });
});

describe('privacy: public listings never leak interested users', () => {
    async function seedRoomWithInterest() {
        const { user: host } = await makeUser('host');
        const fanA = await makeUser('fanA');
        const fanB = await makeUser('fanB');
        const sr = await ScheduledRoom.create({
            title: 'Popular', hostUserId: host._id, hostName: 'host', hostSplitPercent: 100,
            startTime: new Date(Date.now() + 3600000), status: 'scheduled', interestCount: 2
        });
        await RoomInterest.create({ scheduledRoomId: sr._id, userId: fanA.user._id });
        await RoomInterest.create({ scheduledRoomId: sr._id, userId: fanB.user._id });
        return { sr, fanA, fanB, host };
    }

    test('anonymous coming-up: interestCount + isInterested=false, no roster fields', async () => {
        await seedRoomWithInterest();
        const res = await request(app).get('/api/scheduled-rooms/coming-up');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        const room = res.body[0];
        expect(room.interestCount).toBe(2);
        expect(room.isInterested).toBe(false);
        // No roster of interested users or participants, under any key
        const json = JSON.stringify(room).toLowerCase();
        expect(json).not.toContain('interestedusers');
        expect(json).not.toContain('participants');
        expect(room.interested).toBeUndefined();
        expect(room.interestedUserIds).toBeUndefined();
    });

    test('signed-in caller sees ONLY their own isInterested flag', async () => {
        const { fanA } = await seedRoomWithInterest();
        const res = await request(app).get('/api/scheduled-rooms/coming-up')
            .set('Authorization', `Bearer ${fanA.token}`);
        expect(res.body[0].isInterested).toBe(true);
        expect(res.body[0].interestCount).toBe(2);
        // Response must not contain the other fan's user id anywhere
        const { user: fanBUser } = { user: null };
        const ids = (await RoomInterest.find({})).map(i => String(i.userId));
        const otherId = ids.find(id => id !== String(fanA.user._id));
        expect(JSON.stringify(res.body)).not.toContain(otherId);
    });

    test('by-creator listing is equally roster-free', async () => {
        const { sr, fanA } = await seedRoomWithInterest();
        const res = await request(app).get(`/api/scheduled-rooms/by-creator/${sr.hostUserId}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].interestCount).toBe(2);
        expect(JSON.stringify(res.body)).not.toContain(String(fanA.user._id));
    });

    test('coming-up orders by interest count then soonest start', async () => {
        const { user: host } = await makeUser('host2');
        const mk = (title, interestCount, offsetMin) => ScheduledRoom.create({
            title, hostUserId: host._id, hostName: 'host2', hostSplitPercent: 100,
            startTime: new Date(Date.now() + offsetMin * 60000), status: 'scheduled', interestCount
        });
        await mk('low-late', 1, 300);
        await mk('high', 9, 200);
        await mk('low-early', 1, 100);
        const res = await request(app).get('/api/scheduled-rooms/coming-up');
        expect(res.body.map(r => r.title)).toEqual(['high', 'low-early', 'low-late']);
    });
});

describe('interest toggle', () => {
    test('toggles on and off and keeps count consistent', async () => {
        const { user: host } = await makeUser('host');
        const fan = await makeUser('fan');
        const sr = await ScheduledRoom.create({
            title: 'Toggle', hostUserId: host._id, hostName: 'host', hostSplitPercent: 100,
            startTime: new Date(Date.now() + 3600000), status: 'scheduled'
        });
        const on = await request(app).post(`/api/scheduled-rooms/${sr._id}/interest`)
            .set('Authorization', `Bearer ${fan.token}`);
        expect(on.body).toEqual({ isInterested: true, interestCount: 1 });
        const off = await request(app).post(`/api/scheduled-rooms/${sr._id}/interest`)
            .set('Authorization', `Bearer ${fan.token}`);
        expect(off.body).toEqual({ isInterested: false, interestCount: 0 });
    });

    test('requires auth', async () => {
        const res = await request(app).post(`/api/scheduled-rooms/${new mongoose.Types.ObjectId()}/interest`);
        expect(res.status).toBe(401);
    });
});
