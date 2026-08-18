const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const User = require('../models/User');
const ScheduledRoom = require('../models/ScheduledRoom');
const RoomInterest = require('../models/RoomInterest');
const RoomPool = require('../models/RoomPool');
const nudges = require('../services/nudgeScheduler');

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

// Public shape for listings. PRIVACY: only interestCount + caller's own
// isInterested flag — never the roster of interested users or participants.
function publicShape(sr, isInterested = false) {
    return {
        id: sr._id,
        title: sr.title,
        genre: sr.genre || '',
        topic: sr.topic || '',
        description: sr.description || '',
        hostName: sr.hostName || '',
        hostUserId: sr.hostUserId,
        collaborators: sr.collaborators.map(c => ({
            userName: c.userName,
            avatar: c.avatar || '',
            status: c.status
        })),
        approvalMode: sr.approvalMode,
        tokenPrice: sr.tokenPrice || 0,
        startTime: sr.startTime,
        status: sr.status,
        liveRoomId: sr.liveRoomId,
        interestCount: sr.interestCount || 0,
        isInterested: !!isInterested
    };
}

async function attachInterestFlags(list, user) {
    if (!user || !list.length) return list.map(sr => publicShape(sr));
    const mine = await RoomInterest.find({
        userId: user._id,
        scheduledRoomId: { $in: list.map(sr => sr._id) }
    }).select('scheduledRoomId');
    const mineSet = new Set(mine.map(i => String(i.scheduledRoomId)));
    return list.map(sr => publicShape(sr, mineSet.has(String(sr._id))));
}

// ---------------------------------------------------------------------------
// CREATE (host). Validates splits server-side; busy collaborators rejected.
// ---------------------------------------------------------------------------
router.post('/', auth, async (req, res) => {
    try {
        const { title, genre, topic, description, startTime, tokenPrice,
                approvalMode, collaborators } = req.body || {};

        if (!title || !String(title).trim()) {
            return res.status(400).json({ message: 'Title is required' });
        }
        const start = new Date(startTime);
        if (!startTime || isNaN(start.getTime()) || start.getTime() < Date.now() + 60 * 1000) {
            return res.status(400).json({ message: 'Start time must be in the future' });
        }
        const mode = approvalMode === 'pre-schedule' ? 'pre-schedule' : 'real-time';

        // --- Collaborators & splits ---
        const collabInput = Array.isArray(collaborators) ? collaborators : [];
        if (collabInput.length > 5) {
            return res.status(400).json({ message: 'Maximum 5 collaborators' });
        }
        const ids = collabInput.map(c => String(c.userId || ''));
        if (ids.some(id => !isValidObjectId(id))) {
            return res.status(400).json({ message: 'Invalid collaborator' });
        }
        if (new Set(ids).size !== ids.length || ids.includes(String(req.user._id))) {
            return res.status(400).json({ message: 'Duplicate or self collaborator' });
        }

        // Splits must be positive numbers and, with host share, total exactly 100
        let collabTotal = 0;
        for (const c of collabInput) {
            const pct = Number(c.splitPercent);
            if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
                return res.status(400).json({ message: 'Each split must be between 0 and 100' });
            }
            collabTotal = Math.round((collabTotal + pct) * 100) / 100;
        }
        const hostSplit = Math.round((100 - collabTotal) * 100) / 100;
        if (collabTotal > 100 || (collabInput.length && hostSplit < 0)) {
            return res.status(400).json({ message: 'Splits must total exactly 100%' });
        }
        // Client sends hostSplitPercent for explicit validation when provided
        if (req.body.hostSplitPercent !== undefined) {
            const claimed = Number(req.body.hostSplitPercent);
            if (Math.round((claimed + collabTotal) * 100) / 100 !== 100) {
                return res.status(400).json({ message: 'Host + collaborator splits must total exactly 100%' });
            }
        }

        // Load collaborator users & reject busy ones
        const users = await User.find({ _id: { $in: ids } }).select('name avatar');
        if (users.length !== ids.length) {
            return res.status(400).json({ message: 'Collaborator not found' });
        }
        const busyMap = await getBusyMap(ids);
        const busyNames = users.filter(u => busyMap.get(String(u._id))).map(u => u.name);
        if (busyNames.length) {
            return res.status(409).json({ message: `Busy collaborator(s): ${busyNames.join(', ')}` });
        }

        const userById = new Map(users.map(u => [String(u._id), u]));
        const collabDocs = collabInput.map(c => ({
            userId: c.userId,
            userName: userById.get(String(c.userId)).name,
            avatar: userById.get(String(c.userId)).avatar || '',
            splitPercent: Number(c.splitPercent),
            status: 'pending'
        }));

        // pre-schedule: cannot be scheduled until all approve
        const initialStatus = (mode === 'pre-schedule' && collabDocs.length)
            ? 'pending_approval' : 'scheduled';

        const sr = await ScheduledRoom.create({
            title: String(title).trim(),
            genre: genre ? String(genre).trim() : '',
            topic: topic ? String(topic).trim() : '',
            description: description ? String(description).trim() : '',
            hostUserId: req.user._id,
            hostName: req.user.name,
            hostSplitPercent: collabDocs.length ? hostSplit : 100,
            collaborators: collabDocs,
            approvalMode: mode,
            tokenPrice: Math.max(0, parseInt(tokenPrice, 10) || 0),
            startTime: start,
            status: initialStatus
        });

        // Invite notifications to collaborators
        await Promise.all(collabDocs.map(c => nudges.notifyUser(c.userId, {
            type: 'collab_invite',
            fromUserId: req.user._id,
            fromUserName: req.user.name,
            roomId: String(sr._id),
            roomName: sr.title
        })));

        res.status(201).json(publicShape(sr));
    } catch (err) {
        console.error('[ScheduledRooms] create error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// A user is "busy" if they are currently in a live room, or committed
// (host or approved/pending collaborator) to an upcoming scheduled room.
async function getBusyMap(userIds) {
    const busy = new Map(userIds.map(id => [String(id), false]));
    // Live now — check the in-memory rooms map
    try {
        const { getRoomsMap } = require('./signaling');
        for (const room of getRoomsMap().values()) {
            for (const p of room.participants.values()) {
                if (p.userId && busy.has(String(p.userId))) busy.set(String(p.userId), true);
            }
        }
    } catch (e) { /* signaling not initialized (tests) */ }
    // Committed to an upcoming scheduled room
    const upcoming = await ScheduledRoom.find({
        status: { $in: ['pending_approval', 'scheduled', 'live'] },
        startTime: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
        $or: [
            { hostUserId: { $in: userIds } },
            { collaborators: { $elemMatch: { userId: { $in: userIds }, status: { $in: ['pending', 'approved'] } } } }
        ]
    }).select('hostUserId collaborators.userId collaborators.status');
    for (const sr of upcoming) {
        if (busy.has(String(sr.hostUserId))) busy.set(String(sr.hostUserId), true);
        for (const c of sr.collaborators) {
            if (c.status !== 'declined' && busy.has(String(c.userId))) busy.set(String(c.userId), true);
        }
    }
    return busy;
}

// ---------------------------------------------------------------------------
// COLLABORATOR SEARCH — by name or collab ID (WRD-XXXXXX), with busy flags
// ---------------------------------------------------------------------------
router.get('/collaborator-search', auth, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) return res.json([]);
        let users;
        if (/^WRD-/i.test(q)) {
            users = await User.find({ collabId: q.toUpperCase() }).select('name avatar collabId').limit(5);
        } else {
            const term = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            users = await User.find({ name: { $regex: term, $options: 'i' } })
                .select('name avatar collabId').limit(10);
        }
        users = users.filter(u => String(u._id) !== String(req.user._id));
        const busyMap = await getBusyMap(users.map(u => String(u._id)));
        res.json(users.map(u => ({
            _id: u._id,
            name: u.name,
            avatar: u.avatar || 'assets/default-avatar.png',
            collabId: u.collabId || null,
            busy: !!busyMap.get(String(u._id))
        })));
    } catch (err) {
        console.error('[ScheduledRooms] search error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// My collab ID (lazily assigned for pre-existing accounts)
router.get('/my-collab-id', auth, async (req, res) => {
    try {
        const collabId = await User.ensureCollabId(req.user._id);
        res.json({ collabId });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ---------------------------------------------------------------------------
// COMING UP (public, optional auth for isInterested).
// Ordered by popularity (interest count), then soonest start.
// ---------------------------------------------------------------------------
router.get('/coming-up', optionalAuth, async (req, res) => {
    try {
        const list = await ScheduledRoom.find({
            status: 'scheduled',
            startTime: { $gte: new Date(Date.now() - 15 * 60 * 1000) }
        }).sort({ interestCount: -1, startTime: 1 }).limit(50);
        res.json(await attachInterestFlags(list, req.user));
    } catch (err) {
        console.error('[ScheduledRooms] coming-up error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Creator's next planned rooms (public, for profile cards)
router.get('/by-creator/:userId', optionalAuth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.userId)) return res.status(400).json({ message: 'Invalid user' });
        const list = await ScheduledRoom.find({
            status: { $in: ['scheduled', 'pending_approval'] },
            startTime: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
            $or: [
                { hostUserId: req.params.userId },
                { collaborators: { $elemMatch: { userId: req.params.userId, status: 'approved' } } }
            ]
        }).sort({ startTime: 1 }).limit(5);
        // Hide pending_approval rooms from everyone except the host
        const visible = list.filter(sr =>
            sr.status !== 'pending_approval' ||
            (req.user && String(req.user._id) === String(sr.hostUserId)));
        res.json(await attachInterestFlags(visible, req.user));
    } catch (err) {
        console.error('[ScheduledRooms] by-creator error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// My invites (rooms where I'm a pending collaborator) + my hosted upcoming rooms
router.get('/mine', auth, async (req, res) => {
    try {
        const [invites, hosting] = await Promise.all([
            ScheduledRoom.find({
                status: { $in: ['pending_approval', 'scheduled'] },
                collaborators: { $elemMatch: { userId: req.user._id, status: 'pending' } }
            }).sort({ startTime: 1 }).limit(20),
            ScheduledRoom.find({
                status: { $in: ['pending_approval', 'scheduled'] },
                hostUserId: req.user._id
            }).sort({ startTime: 1 }).limit(20)
        ]);
        const myShape = sr => ({
            ...publicShape(sr),
            // The involved parties may see their own split
            mySplit: String(sr.hostUserId) === String(req.user._id)
                ? sr.hostSplitPercent
                : (sr.collaborators.find(c => String(c.userId) === String(req.user._id)) || {}).splitPercent,
            collaboratorsDetailed: String(sr.hostUserId) === String(req.user._id)
                ? sr.collaborators.map(c => ({ userId: c.userId, userName: c.userName, splitPercent: c.splitPercent, status: c.status }))
                : undefined
        });
        res.json({ invites: invites.map(myShape), hosting: hosting.map(myShape) });
    } catch (err) {
        console.error('[ScheduledRooms] mine error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ---------------------------------------------------------------------------
// APPROVE / DECLINE a collab invite
// ---------------------------------------------------------------------------
router.post('/:id/respond', auth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid room' });
        const action = req.body && req.body.action;
        if (!['approve', 'decline'].includes(action)) {
            return res.status(400).json({ message: 'Action must be approve or decline' });
        }
        const newStatus = action === 'approve' ? 'approved' : 'declined';

        // Atomic: only flips this user's own pending entry
        const sr = await ScheduledRoom.findOneAndUpdate(
            {
                _id: req.params.id,
                status: { $in: ['pending_approval', 'scheduled'] },
                collaborators: { $elemMatch: { userId: req.user._id, status: 'pending' } }
            },
            { $set: { 'collaborators.$.status': newStatus, 'collaborators.$.respondedAt': new Date() } },
            { new: true }
        );
        if (!sr) return res.status(404).json({ message: 'No pending invite found' });

        if (newStatus === 'declined' && sr.status === 'pending_approval') {
            // A declined split breaks the 100% total — room cannot proceed as configured
            await ScheduledRoom.updateOne({ _id: sr._id, status: 'pending_approval' }, { $set: { status: 'cancelled' } });
        } else if (sr.status === 'pending_approval' && sr.allApproved()) {
            // pre-schedule gate satisfied — room becomes scheduled
            await ScheduledRoom.updateOne(
                { _id: sr._id, status: 'pending_approval' },
                { $set: { status: 'scheduled' } }
            );
        }

        await nudges.notifyUser(sr.hostUserId, {
            type: 'collab_response',
            fromUserId: req.user._id,
            fromUserName: req.user.name,
            roomId: String(sr._id),
            roomName: sr.title
        });
        const fresh = await ScheduledRoom.findById(sr._id);
        res.json(publicShape(fresh));
    } catch (err) {
        console.error('[ScheduledRooms] respond error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ---------------------------------------------------------------------------
// "REMIND ME" interest toggle (signed-in users)
// ---------------------------------------------------------------------------
router.post('/:id/interest', auth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid room' });
        const sr = await ScheduledRoom.findOne({ _id: req.params.id, status: { $in: ['scheduled', 'live'] } });
        if (!sr) return res.status(404).json({ message: 'Room not found' });

        let isInterested;
        try {
            await RoomInterest.create({ scheduledRoomId: sr._id, userId: req.user._id });
            isInterested = true;
            await ScheduledRoom.updateOne({ _id: sr._id }, { $inc: { interestCount: 1 } });
        } catch (err) {
            if (err.code !== 11000) throw err;
            await RoomInterest.deleteOne({ scheduledRoomId: sr._id, userId: req.user._id });
            isInterested = false;
            await ScheduledRoom.updateOne({ _id: sr._id, interestCount: { $gt: 0 } }, { $inc: { interestCount: -1 } });
        }
        const fresh = await ScheduledRoom.findById(sr._id).select('interestCount');
        res.json({ isInterested, interestCount: fresh ? fresh.interestCount : 0 });
    } catch (err) {
        console.error('[ScheduledRooms] interest error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ---------------------------------------------------------------------------
// GO LIVE — host opens the scheduled room (server-side host + approval gates)
// ---------------------------------------------------------------------------
router.post('/:id/open', auth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid room' });
        const sr = await ScheduledRoom.findById(req.params.id);
        if (!sr) return res.status(404).json({ message: 'Room not found' });
        if (String(sr.hostUserId) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Only the host can open this room' });
        }
        if (sr.status === 'live' && sr.liveRoomId) {
            return res.json({ roomId: sr.liveRoomId, alreadyLive: true });
        }
        if (sr.status !== 'scheduled') {
            return res.status(409).json({ message: `Room is ${sr.status.replace('_', ' ')}` });
        }
        // Backend gate: cannot open until every collaborator has approved
        const activeCollabs = sr.collaborators.filter(c => c.status !== 'declined');
        if (!activeCollabs.every(c => c.status === 'approved')) {
            return res.status(409).json({ message: 'Waiting on collaborator approvals before going live' });
        }
        if (sr.collaborators.some(c => c.status === 'declined')) {
            return res.status(409).json({ message: 'A collaborator declined — update the room before going live' });
        }
        // Near start time: within 15 minutes before start (or any time after)
        if (sr.startTime.getTime() - Date.now() > 15 * 60 * 1000) {
            return res.status(409).json({ message: 'Too early — you can go live 15 minutes before start' });
        }

        // Create the live room in the signaling layer
        const { getRoomsMap, waitForRoomsReady } = require('./signaling');
        const { saveRoom } = require('../services/redisClient');
        await waitForRoomsReady();
        const roomId = generateRoomId();
        const now = Date.now();
        getRoomsMap().set(roomId, {
            id: roomId,
            name: sr.title,
            hostId: String(req.user._id),
            creatorUserId: String(req.user._id),
            participants: new Map(),
            karaokeEnabled: false,
            videoMode: 'off',
            activeVideos: new Set(),
            isLocked: false,
            stageAccess: 'invite-only',
            tokenPrice: sr.tokenPrice || 0,
            genre: sr.genre || '',
            // Host and approved collaborators enter their own room free
            freeEntryUserIds: [String(req.user._id)].concat(activeCollabs.map(c => String(c.userId))),
            createdAt: now,
            lastActivity: now,
            participantHistory: new Set(),
            peakParticipants: 0
        });
        saveRoom(roomId, getRoomsMap().get(roomId)).catch(() => {});

        // Snapshot splits into the tip pool BEFORE exposing the live
        // transition, so settlement can never run without the splits.
        const splits = [{ userId: sr.hostUserId, splitPercent: sr.hostSplitPercent }]
            .concat(activeCollabs.map(c => ({ userId: c.userId, splitPercent: c.splitPercent })));
        try {
            await RoomPool.create({
                roomId,
                scheduledRoomId: sr._id,
                hostUserId: sr.hostUserId,
                splits,
                status: 'open'
            });
        } catch (err) {
            if (err.code !== 11000) {
                getRoomsMap().delete(roomId);
                throw err;
            }
        }

        // Atomic transition scheduled -> live (double-open safe)
        const flipped = await ScheduledRoom.findOneAndUpdate(
            { _id: sr._id, status: 'scheduled' },
            { $set: { status: 'live', liveRoomId: roomId, openedAt: new Date() } },
            { new: true }
        );
        if (!flipped) {
            getRoomsMap().delete(roomId);
            await RoomPool.deleteOne({ roomId, balance: 0 });
            const current = await ScheduledRoom.findById(sr._id);
            return res.json({ roomId: current.liveRoomId, alreadyLive: true });
        }

        // Nudge collaborators + interested users that the room is live
        // (claimed atomically so it never fires twice)
        const claimed = await ScheduledRoom.findOneAndUpdate(
            { _id: sr._id, nudgeLiveClaimedAt: null },
            { $set: { nudgeLiveClaimedAt: new Date() } }
        );
        if (claimed) {
            const recipients = (await nudges.recipientsFor(flipped)).filter(uid => uid !== String(req.user._id));
            await Promise.all(recipients.map(uid => nudges.notifyUser(uid, {
                type: 'room_live',
                fromUserId: sr.hostUserId,
                fromUserName: sr.hostName,
                roomId,
                roomName: sr.title
            })));
        }

        res.json({ roomId, joined: false });
    } catch (err) {
        console.error('[ScheduledRooms] open error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Cancel (host only, before it opens)
router.post('/:id/cancel', auth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid room' });
        const sr = await ScheduledRoom.findOneAndUpdate(
            { _id: req.params.id, hostUserId: req.user._id, status: { $in: ['pending_approval', 'scheduled'] } },
            { $set: { status: 'cancelled' } },
            { new: true }
        );
        if (!sr) return res.status(404).json({ message: 'Room not found or already live' });
        res.json({ cancelled: true });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(18);
    let id = '';
    for (let i = 0; i < 18; i++) id += chars[bytes[i] % chars.length];
    return id.slice(0, 8) + '_' + id.slice(8);
}

module.exports = router;
