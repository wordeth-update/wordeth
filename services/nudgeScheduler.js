const mongoose = require('mongoose');
const ScheduledRoom = require('../models/ScheduledRoom');
const RoomInterest = require('../models/RoomInterest');
const Notification = require('../models/Notification');

/**
 * Nudges for scheduled rooms:
 *  - 5 minutes before start and at start time, notify the host, every
 *    collaborator, and every interested user.
 *  - Delivered via Socket.IO when online; always stored as in-app
 *    Notification docs so offline users see them.
 *  - Claims are atomic (findOneAndUpdate on an unclaimed field), so even with
 *    multiple server instances a nudge fires exactly once.
 */

let _deps = { io: null, connectedUsers: null };
let timer = null;

function init({ io, connectedUsers }) {
    _deps = { io, connectedUsers };
}

function emitToUser(userId, event, payload) {
    const { io, connectedUsers } = _deps;
    if (!io || !connectedUsers) return;
    const sockets = connectedUsers.get(String(userId));
    if (!sockets) return;
    for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (s && s.connected) s.emit(event, payload);
    }
}

/** Store an in-app notification AND push it in real time when online. */
async function notifyUser(userId, { type, fromUserId, fromUserName, roomId, roomName }) {
    try {
        const doc = await Notification.create({
            userId, type,
            fromUserId: fromUserId || userId,
            fromUserName: fromUserName || '',
            roomId: roomId || null,
            roomName: roomName || null
        });
        emitToUser(userId, 'notification', {
            id: doc._id, type, fromUserName: doc.fromUserName,
            roomId: doc.roomId, roomName: doc.roomName, createdAt: doc.createdAt
        });
    } catch (err) {
        console.error('[Nudge] notify error:', err.message);
    }
}

/** All parties for a scheduled room: host + collaborators + interested users. */
async function recipientsFor(sr, { includeInterested = true } = {}) {
    const ids = new Set([String(sr.hostUserId)]);
    for (const c of sr.collaborators) ids.add(String(c.userId));
    if (includeInterested) {
        const interests = await RoomInterest.find({ scheduledRoomId: sr._id }).select('userId');
        for (const i of interests) ids.add(String(i.userId));
    }
    return [...ids];
}

async function fireNudge(sr, type) {
    const recipients = await recipientsFor(sr);
    await Promise.all(recipients.map(uid => notifyUser(uid, {
        type,
        fromUserId: sr.hostUserId,
        fromUserName: sr.hostName,
        roomId: sr.liveRoomId || String(sr._id),
        roomName: sr.title
    })));
    console.log(`[Nudge] ${type} fired for "${sr.title}" -> ${recipients.length} recipient(s)`);
}

async function tick() {
    if (mongoose.connection.readyState !== 1) return;
    const now = new Date();
    const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // 5-minute nudges: startTime within the next 5 minutes, unclaimed
    // (atomic claim — findOneAndUpdate only succeeds for one caller)
    for (;;) {
        const sr = await ScheduledRoom.findOneAndUpdate(
            {
                status: 'scheduled',
                startTime: { $lte: fiveMinFromNow, $gt: now },
                nudgeFiveMinClaimedAt: null
            },
            { $set: { nudgeFiveMinClaimedAt: now } },
            { new: true }
        );
        if (!sr) break;
        await fireNudge(sr, 'room_nudge_5min');
    }

    // Start-time nudges: startTime has passed (within the last 30 min), unclaimed
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    for (;;) {
        const sr = await ScheduledRoom.findOneAndUpdate(
            {
                status: { $in: ['scheduled', 'live'] },
                startTime: { $lte: now, $gt: thirtyMinAgo },
                nudgeStartClaimedAt: null
            },
            { $set: { nudgeStartClaimedAt: now } },
            { new: true }
        );
        if (!sr) break;
        await fireNudge(sr, 'room_nudge_start');
    }
}

function start(intervalMs = 30 * 1000) {
    if (timer) return;
    timer = setInterval(() => {
        tick().catch(err => console.error('[Nudge] tick error:', err.message));
    }, intervalMs);
    timer.unref();
}
function stop() {
    if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { init, start, stop, tick, notifyUser, emitToUser, fireNudge, recipientsFor };
