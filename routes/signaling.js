const { saveRoom, deleteRoom, loadAllRooms, loadRoom, getClient } = require('../services/redisClient');
const User = require('../models/User');
const TokenLedger = require('../models/TokenLedger');
const EventsLedger = require('../models/EventsLedger');
const Replay = require('../models/Replay');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');
const {
    authorizePaidRoomEntry,
    finishWildcardPeek
} = require('../services/userAccess');

let rooms = new Map();
const connectedUsers = new Map();
let isShuttingDown = false;
let _io = null;
const roomDeletionTimers = new Map();
const ROOM_EMPTY_GRACE_PERIOD = 10 * 60 * 1000;

async function authenticatedSocketUser(token) {
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.userId) return null;
        return User.findById(decoded.userId);
    } catch (error) {
        return null;
    }
}

function scheduleRoomDeletion(roomId, reason) {
    if (roomDeletionTimers.has(roomId)) return;
    const room = rooms.get(roomId);
    if (room) {
        room.lastActivity = Date.now();
        saveRoom(roomId, room);
    }
    console.log(`Room ${roomId} empty (${reason}) — will delete in ${ROOM_EMPTY_GRACE_PERIOD / 60000} min if no one rejoins`);
    const timer = setTimeout(async () => {
        roomDeletionTimers.delete(roomId);
        const r = rooms.get(roomId);
        if (r && r.participants.size === 0) {
            const durationSeconds = Math.round((Date.now() - (r.createdAt || Date.now())) / 1000);
            const durationMinutes = durationSeconds / 60;
            const shouldSaveReplay = (r.tokenPrice > 0 || durationMinutes > 5) && r.creatorUserId;

            if (shouldSaveReplay) {
                try {
                    const participantHistoryArray = r.participantHistory ? Array.from(r.participantHistory) : [];
                    const replay = await Replay.create({
                        roomId: roomId,
                        creatorUserId: r.creatorUserId,
                        title: r.name || 'Untitled Room',
                        genre: r.genre || '',
                        duration: durationSeconds,
                        participantCount: r.peakParticipants || 0,
                        participantHistory: participantHistoryArray,
                        tokenPrice: r.tokenPrice || 0,
                        status: 'available'
                    });
                    console.log(`[Replay] Auto-saved replay ${replay._id} for room ${roomId} (duration: ${Math.round(durationMinutes)}min, peak: ${r.peakParticipants || 0})`);

                    if (r.creatorUserId && connectedUsers.has(r.creatorUserId) && _io) {
                        const creatorSockets = connectedUsers.get(r.creatorUserId);
                        if (creatorSockets && creatorSockets.size > 0) {
                            for (const sid of creatorSockets) {
                                const creatorSocket = _io.sockets.sockets.get(sid);
                                if (creatorSocket && creatorSocket.connected) {
                                    creatorSocket.emit('replay-saved', {
                                        replayId: replay._id,
                                        roomId: roomId,
                                        title: replay.title,
                                        duration: durationSeconds,
                                        participantCount: r.peakParticipants || 0
                                    });
                                }
                            }
                        }
                    }
                } catch (replayErr) {
                    console.error(`[Replay] Error auto-saving replay for room ${roomId}:`, replayErr.message);
                }
            }

            rooms.delete(roomId);
            if (!isShuttingDown) {
                deleteRoom(roomId);
            }
            console.log(`Room ${roomId} deleted after grace period (${reason})`);

            // Settle the tip pool (idempotent + crash-safe; recovery sweep
            // finishes it if this process dies mid-settlement)
            try {
                const { closeAndSettleRoom } = require('../services/settlement');
                const result = await closeAndSettleRoom(roomId);
                if (result.settled) {
                    console.log(`[Settlement] Room ${roomId} pool settled (${result.balance} tokens)`);
                }
            } catch (settleErr) {
                console.error(`[Settlement] Error settling room ${roomId}:`, settleErr.message);
            }

            // If this room came from a schedule, mark it completed
            try {
                const ScheduledRoom = require('../models/ScheduledRoom');
                await ScheduledRoom.updateOne(
                    { liveRoomId: roomId, status: 'live' },
                    { $set: { status: 'completed' } }
                );
            } catch (srErr) {
                console.error(`[Settlement] Error completing scheduled room for ${roomId}:`, srErr.message);
            }
        } else if (r) {
            console.log(`Room ${roomId} deletion skipped — ${r.participants.size} participant(s) present`);
        }
    }, ROOM_EMPTY_GRACE_PERIOD);
    roomDeletionTimers.set(roomId, timer);
}

function cancelRoomDeletion(roomId) {
    if (roomDeletionTimers.has(roomId)) {
        clearTimeout(roomDeletionTimers.get(roomId));
        roomDeletionTimers.delete(roomId);
        console.log(`Room ${roomId} deletion cancelled — someone rejoined`);
    }
}

function touchRoom(roomId) {
    const room = rooms.get(roomId);
    if (room) {
        room.lastActivity = Date.now();
    }
}

async function initRooms() {
    getClient();
    const restored = await loadAllRooms();
    if (restored.size > 0) {
        let kept = 0;
        const now = Date.now();
        const MAX_RESTORE_AGE = 5 * 60 * 1000;
        for (const [roomId, room] of restored.entries()) {
            room.participants = new Map();
            room.activeVideos = new Set();
            room.hostId = null;
            const age = now - (room.lastActivity || room.createdAt || now);
            if (age > MAX_RESTORE_AGE) {
                deleteRoom(roomId);
                console.log(`[Signaling] Cleaned stale room ${roomId} (${Math.round(age / 60000)} min old)`);
                continue;
            }
            rooms.set(roomId, room);
            const roomAge = now - (room.lastActivity || room.createdAt || now);
            const isRecent = roomAge < 30 * 60 * 1000;
            if (isRecent) {
                scheduleRoomDeletion(roomId, 'restored-empty');
            } else {
                setTimeout(() => {
                    const r = rooms.get(roomId);
                    if (r && r.participants.size === 0) {
                        rooms.delete(roomId);
                        deleteRoom(roomId);
                        console.log(`[Signaling] Cleaned old restored room ${roomId}`);
                    }
                }, 2 * 60 * 1000);
            }
            kept++;
        }
        if (kept > 0) console.log(`[Signaling] ${kept} recent room(s) restored from Redis`);
    }
}

function setupSignaling(io) {
    _io = io;
    global._io = io;
    global._connectedUsers = connectedUsers;
    let roomsReady = false;
    const roomsReadyPromise = initRooms()
        .then(() => {
            roomsReady = true;
            if (rooms.size > 0) {
                io.emit('rooms-updated', getActiveRooms());
                console.log('[Signaling] Broadcasted restored rooms to connected clients');
            }
        })
        .catch(err => {
            console.error('[Signaling] Room restore failed:', err.message);
            roomsReady = true;
        });
    setRoomsReadyPromise(roomsReadyPromise);

    setInterval(() => {
        if (rooms.size === 0) return;
        let saved = 0;
        for (const [roomId, room] of rooms.entries()) {
            saveRoom(roomId, room);
            saved++;
        }
        if (saved > 0) console.log(`[Heartbeat] Refreshed ${saved} room(s) in Redis`);
    }, 5 * 60 * 1000);

    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on('register-user', async ({ authToken } = {}) => {
            const verifiedUser = await authenticatedSocketUser(authToken);
            if (verifiedUser) {
                const userId = String(verifiedUser._id);
                const userName = verifiedUser.name || 'User';
                socket.registeredUserId = userId;
                socket.registeredUserName = userName;
                if (!connectedUsers.has(userId)) {
                    connectedUsers.set(userId, new Set());
                }
                const userSockets = connectedUsers.get(userId);
                userSockets.add(socket.id);
                if (userSockets.size > 1) {
                    const stale = [];
                    for (const sid of userSockets) {
                        if (sid === socket.id) continue;
                        const oldSock = io.sockets.sockets.get(sid);
                        if (!oldSock || !oldSock.connected || !oldSock.roomId) {
                            stale.push(sid);
                        }
                    }
                    for (const sid of stale) {
                        userSockets.delete(sid);
                        const oldSock = io.sockets.sockets.get(sid);
                        if (oldSock) oldSock.disconnect(true);
                    }
                }
                console.log(`User registered: ${userName} (${userId}) on socket ${socket.id} (${userSockets.size} connections)`);
            } else {
                socket.emit('registration-error', { message: 'Sign in again to register this connection.' });
            }
        });

        socket.on('room-invite', async ({ targetUserId, roomId, roomName, inviterName }) => {
            if (!socket.registeredUserId) {
                socket.emit('invite-sent', { targetUserId, success: false, reason: 'not_registered' });
                return;
            }

            if (!socket.inviteTimestamps) socket.inviteTimestamps = [];
            const now = Date.now();
            socket.inviteTimestamps = socket.inviteTimestamps.filter(t => now - t < 60000);
            if (socket.inviteTimestamps.length >= 10) {
                socket.emit('invite-sent', { targetUserId, success: false, reason: 'rate_limited' });
                return;
            }
            socket.inviteTimestamps.push(now);

            // Attach the entry price so invitees see the cost up front.
            // Free passes are GRANTED only via the authenticated HTTP endpoint
            // (POST /api/rooms/:roomId/grant-pass) — the socket layer merely
            // reports whether the target already holds one, since socket
            // identity is client-asserted and must not authorize payments.
            const inviteRoom = rooms.get(roomId);
            const tokenPrice = inviteRoom ? (inviteRoom.tokenPrice || 0) : 0;
            const freePass = !!(inviteRoom && targetUserId &&
                Array.isArray(inviteRoom.freeEntryUserIds) &&
                inviteRoom.freeEntryUserIds.includes(String(targetUserId)));

            try {
                // Paid rooms: cap invites per sender→recipient pair at 10/day
                // so nobody gets pestered to pay by the same person.
                if (tokenPrice > 0 && !freePass) {
                    try {
                        const redis = getClient();
                        if (redis) {
                            const day = new Date().toISOString().slice(0, 10);
                            const capKey = `invitecap:${socket.registeredUserId}:${targetUserId}:${day}`;
                            const count = await redis.incr(capKey);
                            if (count === 1) await redis.expire(capKey, 86400);
                            if (count > 10) {
                                socket.emit('invite-sent', { targetUserId, success: false, reason: 'daily_cap' });
                                return;
                            }
                        }
                    } catch (e) { /* Redis down — don't block invites */ }
                }

                // Popup vs quiet: the interruptive popup is reserved for
                // people the RECIPIENT has a relationship with — someone they
                // follow, or the room's creator/host. Everyone else's invite
                // lands quietly in the bell notifications instead.
                let allowPopup = true;
                if (tokenPrice > 0 && !freePass) {
                    const isRoomCreator = inviteRoom && inviteRoom.creatorUserId &&
                        String(inviteRoom.creatorUserId) === String(socket.registeredUserId);
                    if (!isRoomCreator) {
                        const followed = await User.exists({
                            _id: targetUserId,
                            following: socket.registeredUserId
                        }).catch(() => null);
                        allowPopup = !!followed;
                    }
                }

                const targetSockets = connectedUsers.get(targetUserId);
                const online = targetSockets && targetSockets.size > 0;

                if (allowPopup && online) {
                    const socketIds = Array.from(targetSockets);
                    const latestSocketId = socketIds[socketIds.length - 1];
                    io.to(latestSocketId).emit('room-invite', {
                        roomId,
                        roomName: roomName || roomId,
                        inviterName: inviterName || socket.registeredUserName || 'Someone',
                        inviterId: socket.registeredUserId,
                        tokenPrice,
                        freePass,
                        timestamp: now
                    });
                    socket.emit('invite-sent', { targetUserId, success: true });
                } else if (!allowPopup) {
                    // Quiet path: store a bell notification (works online or
                    // offline) — no screen takeover from strangers.
                    try {
                        await Notification.create({
                            userId: targetUserId,
                            type: 'room_invite',
                            fromUserId: socket.registeredUserId,
                            fromUserName: inviterName || socket.registeredUserName || 'Someone',
                            roomId,
                            roomName: roomName || roomId
                        });
                        if (online) {
                            for (const sid of targetSockets) {
                                io.to(sid).emit('notification', { type: 'room_invite' });
                            }
                        }
                        socket.emit('invite-sent', { targetUserId, success: true, quiet: true });
                    } catch (e) {
                        console.warn('[Invite] quiet notification error:', e.message);
                        socket.emit('invite-sent', { targetUserId, success: false, reason: 'error' });
                    }
                } else {
                    socket.emit('invite-sent', { targetUserId, success: false, reason: 'offline' });
                }
            } catch (err) {
                console.error('[Invite] error:', err);
                socket.emit('invite-sent', { targetUserId, success: false, reason: 'error' });
            }
        });

        socket.on('ping-check', (data, cb) => {
            if (typeof cb === 'function') cb({ ok: true, socketId: socket.id, ts: Date.now() });
        });

        socket.on('join-room', async (joinRequest, ackCallback) => {
          try {
            let {
                roomId,
                userId,
                userName,
                isHost: requestedHost,
                roomName,
                avatar,
                authToken,
                useWildcard
            } = joinRequest || {};
            console.log(`[join-room] Received from ${socket.id}: roomId=${roomId}, userName=${userName}, isHost=${requestedHost}`);
            if (!roomsReady) {
                console.log('[join-room] Waiting for rooms to restore from Redis...');
                await roomsReadyPromise;
            }
            const verifiedUser = await authenticatedSocketUser(authToken);
            if (verifiedUser) {
                userId = String(verifiedUser._id);
                userName = verifiedUser.name;
                avatar = verifiedUser.avatar || null;
                socket.registeredUserId = userId;
                socket.registeredUserName = userName;
            } else {
                userId = null;
                userName = 'Guest';
                avatar = null;
                if (requestedHost) {
                    socket.emit('room-error', { message: 'Please sign in to create a room.', code: 'AUTH_REQUIRED' });
                    if (typeof ackCallback === 'function') ackCallback({ success: false, message: 'Please sign in to create a room.', code: 'AUTH_REQUIRED' });
                    return;
                }
            }
            let isHost = requestedHost;
            if (socket.roomId && socket.roomId !== roomId && rooms.has(socket.roomId)) {
                const prevRoom = rooms.get(socket.roomId);
                prevRoom.participants.delete(socket.id);
                socket.leave(socket.roomId);

                const prevParticipantList = Array.from(prevRoom.participants.values());
                socket.to(socket.roomId).emit('participant-left', {
                    socketId: socket.id,
                    userId: socket.userId,
                    userName: socket.userName,
                    participants: prevParticipantList
                });

                if (prevRoom.participants.size === 0) {
                    scheduleRoomDeletion(socket.roomId, 'room switch');
                } else if (socket.id === prevRoom.hostId) {
                    const firstParticipant = prevRoom.participants.values().next().value;
                    if (firstParticipant) {
                        prevRoom.hostId = firstParticipant.socketId;
                        firstParticipant.isHost = true;
                        io.to(socket.roomId).emit('room-event', {
                            event: 'host-changed',
                            data: { newHostId: firstParticipant.socketId, newHostName: firstParticipant.userName }
                        });
                    }
                    saveRoom(socket.roomId, prevRoom);
                } else {
                    saveRoom(socket.roomId, prevRoom);
                }

                io.emit('rooms-updated', getActiveRooms());
            }

            socket.join(roomId);
            socket.roomId = roomId;
            socket.userId = userId || socket.id;
            socket.userName = userName || 'Anonymous';
            socket.avatar = avatar || null;

            cancelRoomDeletion(roomId);
            touchRoom(roomId);

            if (!rooms.has(roomId)) {
                const redisRoom = await loadRoom(roomId);
                if (redisRoom) {
                    console.log(`[Join] Room "${roomId}" restored from Redis into memory`);
                    redisRoom.participants = new Map();
                    redisRoom.activeVideos = new Set();
                    rooms.set(roomId, redisRoom);
                }
            }

            if (!rooms.has(roomId)) {
                if (!isHost) {
                    let matchedRoom = null;
                    for (const [rid, r] of rooms.entries()) {
                        if (rid === roomId) continue;
                        if (r.name && roomId && r.name.toLowerCase().trim() === roomId.toLowerCase().trim()) {
                            matchedRoom = { id: rid, room: r };
                            break;
                        }
                    }

                    if (matchedRoom) {
                        console.log(`[Join] Room ID "${roomId}" not found, but matched room by name: "${matchedRoom.id}"`);
                        socket.leave(roomId);
                        roomId = matchedRoom.id;
                        socket.join(roomId);
                        socket.roomId = roomId;
                    } else {
                        socket.emit('room-error', { message: 'This room is no longer live.' });
                        if (typeof ackCallback === 'function') ackCallback({ success: false, message: 'This room is no longer live.' });
                        socket.leave(roomId);
                        socket.roomId = null;
                        return;
                    }
                } else {
                    if (!roomName) {
                        socket.emit('room-error', { message: 'This room has expired. Please create a new one.' });
                        if (typeof ackCallback === 'function') ackCallback({ success: false, message: 'This room has expired. Please create a new one.' });
                        socket.leave(roomId);
                        socket.roomId = null;
                        return;
                    }
                    rooms.set(roomId, {
                        id: roomId,
                        name: roomName,
                        hostId: socket.id,
                        creatorUserId: socket.userId,
                        participants: new Map(),
                        karaokeEnabled: false,
                        videoMode: 'off',
                        activeVideos: new Set(),
                        isLocked: false,
                        stageAccess: 'invite-only',
                        tokenPrice: 0,
                        createdAt: Date.now(),
                        participantHistory: new Set(),
                        peakParticipants: 0
                    });
                }
            }

            const room = rooms.get(roomId);
            if (roomName && isHost) {
                room.name = roomName;
            }

            const isCreatorOfRoom = room.creatorUserId && socket.userId && room.creatorUserId === socket.userId;
            // Entry-fee exemptions are derived server-side: the creator, anyone
            // on the room's free-entry list (collaborators / host guest passes).
            // The client's isHost flag is only honored for legacy rooms that
            // have no recorded creator.
            const hasFreePass = Array.isArray(room.freeEntryUserIds) && socket.userId &&
                room.freeEntryUserIds.includes(String(socket.userId));
            let paidEntryAccess = null;
            if (room.tokenPrice > 0 && !isCreatorOfRoom && !hasFreePass) {
                if (!verifiedUser) {
                    const message = 'Paid rooms are available to signed-in User+ members.';
                    socket.emit('room-error', { message, code: 'USER_PLUS_REQUIRED' });
                    if (typeof ackCallback === 'function') ackCallback({ success: false, message, code: 'USER_PLUS_REQUIRED' });
                    socket.leave(roomId);
                    socket.roomId = null;
                    return;
                }
                paidEntryAccess = await authorizePaidRoomEntry({
                    userId: socket.userId,
                    roomId,
                    useWildcard: Boolean(useWildcard)
                });
                if (!paidEntryAccess.allowed) {
                    socket.emit('room-error', paidEntryAccess);
                    if (typeof ackCallback === 'function') ackCallback({ success: false, ...paidEntryAccess });
                    socket.leave(roomId);
                    socket.roomId = null;
                    return;
                }
                if (paidEntryAccess.chargeTokens) {
                try {
                    const deductResult = await User.findOneAndUpdate(
                        { _id: socket.userId, tokenBalance: { $gte: room.tokenPrice } },
                        { $inc: { tokenBalance: -room.tokenPrice } },
                        { new: true }
                    );

                    if (!deductResult) {
                        const checkUser = await User.findById(socket.userId);
                        if (!checkUser) {
                            socket.emit('room-error', { message: 'User not found. Please sign in again.' });
                            if (typeof ackCallback === 'function') ackCallback({ success: false, message: 'User not found.' });
                        } else {
                            socket.emit('room-error', { message: `Insufficient tokens. This room costs ${room.tokenPrice} tokens but you only have ${checkUser.tokenBalance}.`, code: 'INSUFFICIENT_TOKENS', required: room.tokenPrice, balance: checkUser.tokenBalance });
                            if (typeof ackCallback === 'function') ackCallback({ success: false, message: `Insufficient tokens.`, code: 'INSUFFICIENT_TOKENS', required: room.tokenPrice, balance: checkUser.tokenBalance });
                        }
                        socket.leave(roomId);
                        socket.roomId = null;
                        return;
                    }

                    const balanceAfter = deductResult.tokenBalance;
                    const balanceBefore = balanceAfter + room.tokenPrice;

                    await TokenLedger.create({
                        userId: deductResult._id,
                        type: 'room_entry',
                        amount: -room.tokenPrice,
                        balanceBefore: balanceBefore,
                        balanceAfter: balanceAfter,
                        relatedUserId: room.creatorUserId,
                        roomId: roomId,
                        metadata: { roomName: room.name }
                    });

                    if (room.creatorUserId) {
                        const creatorUpdate = await User.findOneAndUpdate(
                            { _id: room.creatorUserId },
                            { $inc: { tokenEarnings: room.tokenPrice } },
                            { new: true }
                        );

                        if (creatorUpdate) {
                            await TokenLedger.create({
                                userId: creatorUpdate._id,
                                type: 'room_earning',
                                amount: room.tokenPrice,
                                balanceBefore: creatorUpdate.tokenEarnings - room.tokenPrice,
                                balanceAfter: creatorUpdate.tokenEarnings,
                                relatedUserId: deductResult._id,
                                roomId: roomId,
                                metadata: { roomName: room.name }
                            });
                        }
                    }

                    EventsLedger.create({
                        actorId: deductResult._id,
                        actorType: 'user',
                        eventType: 'token_room_entry',
                        amount: room.tokenPrice,
                        metadata: { roomId, roomName: room.name, creatorUserId: room.creatorUserId, tokenPrice: room.tokenPrice }
                    }).catch(e => console.warn('[Token Gate] EventsLedger error:', e.message));

                    console.log(`[Token Gate] ${socket.userName} paid ${room.tokenPrice} tokens to enter room ${roomId}`);
                } catch (tokenErr) {
                    console.error('[Token Gate] Error processing token payment:', tokenErr);
                    socket.emit('room-error', { message: 'Error processing token payment. Please try again.' });
                    if (typeof ackCallback === 'function') ackCallback({ success: false, message: 'Error processing token payment.' });
                    socket.leave(roomId);
                    socket.roomId = null;
                    return;
                }
                }
            }

            if (socket.userId && socket.userId !== socket.id) {
                for (const [sid, p] of room.participants.entries()) {
                    if (p.userId === socket.userId && sid !== socket.id) {
                        const wasHost = (sid === room.hostId);
                        room.participants.delete(sid);
                        if (room.activeVideos) room.activeVideos.delete(sid);
                        if (wasHost) {
                            room.hostId = socket.id;
                            isHost = true;
                        }
                        console.log(`[Dedup] Removed stale participant ${p.userName} (old socket ${sid}) for userId ${p.userId}`);
                        socket.to(roomId).emit('participant-left', {
                            socketId: sid,
                            userId: p.userId,
                            userName: p.userName,
                            participants: Array.from(room.participants.values())
                        });
                    }
                }
            }

            const isOriginalCreator = room.creatorUserId && socket.userId && room.creatorUserId === socket.userId;
            // Host authority is derived server-side: when the room has a known
            // creator, only that creator may claim host. Client-requested
            // isHost is honored only for legacy rooms without a creator.
            const shouldBeHost = room.creatorUserId ? isOriginalCreator : (isHost || isOriginalCreator);

            if (shouldBeHost) {
                const currentHostId = room.hostId;
                if (currentHostId && currentHostId !== socket.id && room.participants.has(currentHostId)) {
                    const prevHost = room.participants.get(currentHostId);
                    prevHost.isHost = false;
                }
                room.hostId = socket.id;
            }

            room.participants.set(socket.id, {
                socketId: socket.id,
                userId: socket.userId,
                userName: socket.userName,
                avatar: socket.avatar || null,
                isHost: shouldBeHost,
                isSpeaker: shouldBeHost,
                isMuted: !shouldBeHost,
                joinedAt: Date.now(),
                peekExpiresAt: paidEntryAccess?.wildcard ? paidEntryAccess.expiresAt : null
            });

            if (paidEntryAccess?.wildcard && paidEntryAccess.expiresAt) {
                if (socket.wildcardTimer) clearTimeout(socket.wildcardTimer);
                const remainingMs = Math.max(0, new Date(paidEntryAccess.expiresAt).getTime() - Date.now());
                socket.wildcardTimer = setTimeout(async () => {
                    const activeRoom = rooms.get(roomId);
                    if (!activeRoom || socket.roomId !== roomId || !activeRoom.participants.has(socket.id)) return;
                    const participant = activeRoom.participants.get(socket.id);
                    activeRoom.participants.delete(socket.id);
                    socket.leave(roomId);
                    socket.roomId = null;
                    await finishWildcardPeek(socket.userId, roomId).catch(() => {});
                    socket.emit('peek-expired', {
                        message: 'Your one-time 3-minute Wildcard peek has ended.',
                        roomId
                    });
                    socket.to(roomId).emit('participant-left', {
                        socketId: socket.id,
                        userId: participant.userId,
                        userName: participant.userName,
                        participants: Array.from(activeRoom.participants.values())
                    });
                    saveRoom(roomId, activeRoom);
                    io.emit('rooms-updated', getActiveRooms());
                }, remainingMs);
                socket.wildcardTimer.unref?.();
            }

            if (socket.userId && socket.userId !== socket.id) {
                if (!room.participantHistory) room.participantHistory = new Set();
                room.participantHistory.add(socket.userId);

                const hostParticipant = Array.from(room.participants.values()).find(p => p.isHost);
                const safeRoomName = (room.name || '').slice(0, 200);
                const safeHostName = (hostParticipant?.userName || '').slice(0, 100);
                User.findOneAndUpdate(
                    {
                        _id: socket.userId,
                        $or: [
                            { 'roomHistory.0.roomId': { $ne: roomId } },
                            { roomHistory: { $size: 0 } },
                            { roomHistory: { $exists: false } }
                        ]
                    },
                    { $push: { roomHistory: { $each: [{
                        roomId,
                        roomName: safeRoomName,
                        hostName: safeHostName,
                        hostId: room.creatorUserId || '',
                        tokenPrice: room.tokenPrice || 0,
                        joinedAt: new Date()
                    }], $position: 0, $slice: 50 } } }
                ).catch(err => {
                    if (err) console.error('[roomHistory] Failed to record:', err);
                });
            }
            if (!room.peakParticipants) room.peakParticipants = 0;
            if (room.participants.size > room.peakParticipants) {
                room.peakParticipants = room.participants.size;
            }

            const participantList = Array.from(room.participants.values());

            const joinData = {
                roomId,
                roomName: room.name || null,
                participants: participantList,
                isHost: shouldBeHost,
                karaokeEnabled: room.karaokeEnabled,
                videoMode: room.videoMode || 'off',
                activeVideos: Array.from(room.activeVideos || []),
                isLocked: room.isLocked,
                stageAccess: room.stageAccess || 'invite-only',
                tokenPrice: room.tokenPrice || 0,
                wildcardExpiresAt: paidEntryAccess?.wildcard ? paidEntryAccess.expiresAt : null
            };
            socket.emit('room-joined', joinData);
            if (typeof ackCallback === 'function') ackCallback({ success: true, ...joinData });

            socket.to(roomId).emit('participant-joined', {
                socketId: socket.id,
                userId: socket.userId,
                userName: socket.userName,
                avatar: socket.avatar || null,
                isHost: shouldBeHost,
                isSpeaker: shouldBeHost,
                participants: participantList
            });

            if (isOriginalCreator && !isHost) {
                io.to(roomId).emit('room-event', {
                    event: 'host-changed',
                    data: { newHostId: socket.id, newHostName: socket.userName }
                });
            }

            console.log(`${socket.userName} joined room ${roomId} (${room.participants.size} participants)`);

            if (socket.userId && socket.userId !== socket.id) {
                const notifType = shouldBeHost ? 'follower_created_room' : 'follower_joined_room';
                User.findById(socket.userId).select('followers name avatar').lean().then(joiner => {
                    if (!joiner || !joiner.followers || joiner.followers.length === 0) return;
                    const bulkNotifs = joiner.followers.map(followerId => ({
                        userId: followerId,
                        type: notifType,
                        fromUserId: joiner._id,
                        fromUserName: joiner.name || '',
                        fromUserAvatar: joiner.avatar || '',
                        roomId,
                        roomName: room.name || ''
                    }));
                    Notification.insertMany(bulkNotifs).then(docs => {
                        for (const doc of docs) {
                            const followerSockets = connectedUsers.get(doc.userId.toString());
                            if (followerSockets && followerSockets.size > 0) {
                                for (const sid of followerSockets) {
                                    io.to(sid).emit('notification', {
                                        _id: doc._id,
                                        type: doc.type,
                                        fromUserName: doc.fromUserName,
                                        fromUserAvatar: doc.fromUserAvatar,
                                        roomId: doc.roomId,
                                        roomName: doc.roomName,
                                        createdAt: doc.createdAt
                                    });
                                }
                            }
                        }
                    }).catch(err => console.error('[Notification] room notify error:', err));
                }).catch(err => console.error('[Notification] lookup error:', err));
            }

            saveRoom(roomId, room);
            io.emit('rooms-updated', getActiveRooms());
          } catch (err) {
            console.error('[join-room] Unhandled error:', err);
            socket.emit('room-error', { message: 'Server error while joining room. Please try again.' });
            if (typeof ackCallback === 'function') ackCallback({ success: false, message: 'Server error while joining room.' });
          }
        });

        socket.on('agora-uid-map', ({ roomId, agoraUid }) => {
            const room = rooms.get(roomId);
            if (room && room.participants.has(socket.id)) {
                const participant = room.participants.get(socket.id);
                if (participant.agoraUid && Number(participant.agoraUid) !== Number(agoraUid)) {
                    console.warn(`[Agora] Rejected mismatched UID map from ${socket.id}`);
                    return;
                }
                participant.agoraUid = Number(agoraUid);
                socket.to(roomId).emit('agora-uid-mapped', {
                    socketId: socket.id,
                    agoraUid: agoraUid
                });
            }
        });


        socket.on('leave-room', ({ roomId }) => {
            if (socket.wildcardTimer) {
                clearTimeout(socket.wildcardTimer);
                socket.wildcardTimer = null;
            }
            if (!roomId || !rooms.has(roomId)) return;
            const room = rooms.get(roomId);
            if (!room.participants.has(socket.id)) return;

            const participant = room.participants.get(socket.id);
            if (room.activeVideos) room.activeVideos.delete(socket.id);
            room.participants.delete(socket.id);
            socket.leave(roomId);

            const participantList = Array.from(room.participants.values());
            socket.to(roomId).emit('participant-left', {
                socketId: socket.id,
                userId: participant.userId,
                userName: participant.userName,
                participants: participantList
            });

            if (room.participants.size === 0) {
                scheduleRoomDeletion(roomId, 'explicit leave');
            } else if (socket.id === room.hostId) {
                const firstParticipant = room.participants.values().next().value;
                if (firstParticipant) {
                    room.hostId = firstParticipant.socketId;
                    firstParticipant.isHost = true;
                    io.to(roomId).emit('room-event', {
                        event: 'host-changed',
                        data: { newHostId: firstParticipant.socketId, newHostName: firstParticipant.userName }
                    });
                }
                saveRoom(roomId, room);
            } else {
                saveRoom(roomId, room);
            }

            socket.roomId = null;
            socket.userId = null;
            socket.userName = null;
            io.emit('rooms-updated', getActiveRooms());
            console.log(`${participant.userName} left room ${roomId} (${room.participants.size} remaining)`);
        });

        socket.on('chat-message', ({ roomId, message, sender }) => {
            socket.to(roomId).emit('chat-message', {
                sender: socket.userName,
                message,
                timestamp: Date.now()
            });
        });

        socket.on('request-participants', ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            const participantList = Array.from(room.participants.values());
            socket.emit('participants-list', {
                roomId,
                participants: participantList,
                roomName: room.name || null,
                isLocked: room.isLocked,
                karaokeEnabled: room.karaokeEnabled,
                videoMode: room.videoMode || 'off',
                activeVideos: Array.from(room.activeVideos || []),
                stageAccess: room.stageAccess || 'invite-only'
            });
        });

        socket.on('kick-participant', ({ roomId, targetSocketId, action }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            if (socket.id !== room.hostId) return;

            const targetParticipant = room.participants.get(targetSocketId);
            if (!targetParticipant) return;

            if (action === 'remove') {
                io.to(targetSocketId).emit('kicked-from-room', {
                    action: 'remove',
                    reason: 'The host has removed you from the room.'
                });

                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.leave(roomId);
                    targetSocket.roomId = null;
                }

                room.participants.delete(targetSocketId);
                const participantList = Array.from(room.participants.values());
                io.to(roomId).emit('participant-left', {
                    socketId: targetSocketId,
                    userId: targetParticipant.userId,
                    userName: targetParticipant.userName,
                    participants: participantList
                });
                io.to(roomId).emit('room-event', {
                    event: 'participant-kicked',
                    data: { userName: targetParticipant.userName, action: 'remove' }
                });
                saveRoom(roomId, room);
                io.emit('rooms-updated', getActiveRooms());
            } else if (action === 'move-to-crowd') {
                targetParticipant.isSpeaker = false;
                targetParticipant.isMuted = true;

                io.to(targetSocketId).emit('kicked-from-room', {
                    action: 'move-to-crowd',
                    reason: 'The host has moved you to the crowd.'
                });

                const updatedList = Array.from(room.participants.values());
                io.to(roomId).emit('room-event', {
                    event: 'participant-moved-to-crowd',
                    data: {
                        socketId: targetSocketId,
                        userId: targetParticipant.userId,
                        userName: targetParticipant.userName,
                        avatar: targetParticipant.avatar || null
                    }
                });
                io.to(roomId).emit('participants-list', {
                    roomId,
                    participants: updatedList,
                    roomName: room.name || null,
                    isLocked: room.isLocked,
                    karaokeEnabled: room.karaokeEnabled,
                    stageAccess: room.stageAccess || 'invite-only'
                });
                saveRoom(roomId, room);
            }
        });

        socket.on('promote-to-speaker', ({ roomId, targetSocketId }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            if (socket.id !== room.hostId) return;

            const targetParticipant = room.participants.get(targetSocketId);
            if (!targetParticipant) return;
            if (targetParticipant.isSpeaker) return;

            targetParticipant.isSpeaker = true;
            targetParticipant.isMuted = true;

            io.to(targetSocketId).emit('promoted-to-speaker');

            io.to(roomId).emit('participant-promoted', {
                socketId: targetSocketId,
                userId: targetParticipant.userId,
                userName: targetParticipant.userName,
                avatar: targetParticipant.avatar || null
            });

            const updatedList = Array.from(room.participants.values());
            io.to(roomId).emit('participants-list', {
                roomId,
                participants: updatedList,
                roomName: room.name || null,
                isLocked: room.isLocked,
                karaokeEnabled: room.karaokeEnabled,
                videoMode: room.videoMode || 'off',
                activeVideos: room.activeVideos || [],
                stageAccess: room.stageAccess || 'invite-only'
            });

            io.to(roomId).emit('room-event', {
                event: 'participant-promoted',
                data: {
                    socketId: targetSocketId,
                    userName: targetParticipant.userName
                }
            });
            saveRoom(roomId, room);
        });

        socket.on('request-stage', ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            const participant = room.participants.get(socket.id);
            if (!participant || participant.isSpeaker) return;

            io.to(room.hostId).emit('stage-request', {
                socketId: socket.id,
                userId: participant.userId,
                userName: participant.userName,
                avatar: participant.avatar || null
            });

            io.to(roomId).emit('room-event', {
                event: 'hand-raise',
                data: { raised: true, userId: participant.userId, userName: participant.userName }
            });
        });

        socket.on('self-promote-to-stage', ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            if (room.stageAccess !== 'open') return;

            const participant = room.participants.get(socket.id);
            if (!participant || participant.isSpeaker) return;

            participant.isSpeaker = true;
            participant.isMuted = true;

            io.to(socket.id).emit('promoted-to-speaker');

            io.to(roomId).emit('participant-promoted', {
                socketId: socket.id,
                userId: participant.userId,
                userName: participant.userName,
                avatar: participant.avatar || null
            });

            const updatedList = Array.from(room.participants.values());
            io.to(roomId).emit('participants-list', {
                roomId,
                participants: updatedList,
                roomName: room.name || null,
                isLocked: room.isLocked,
                karaokeEnabled: room.karaokeEnabled,
                videoMode: room.videoMode || 'off',
                activeVideos: Array.from(room.activeVideos || []),
                stageAccess: room.stageAccess || 'invite-only'
            });

            io.to(roomId).emit('room-event', {
                event: 'participant-promoted',
                data: { socketId: socket.id, userName: participant.userName }
            });
            saveRoom(roomId, room);
        });

        socket.on('set-stage-access', ({ roomId, mode }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            if (socket.id !== room.hostId) return;
            if (mode !== 'open' && mode !== 'invite-only') return;

            room.stageAccess = mode;
            saveRoom(roomId, room);

            io.to(roomId).emit('room-event', {
                event: 'stage-access-changed',
                data: { stageAccess: mode }
            });
        });

        socket.on('room-event', ({ roomId, event, data }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            touchRoom(roomId);

            switch (event) {
                case 'room-lock':
                    if (socket.id === room.hostId) {
                        room.isLocked = data.locked;
                        socket.to(roomId).emit('room-event', { event, data });
                        saveRoom(roomId, room);
                    }
                    break;

                case 'topic-change':
                    if (socket.id === room.hostId) {
                        socket.to(roomId).emit('room-event', { event, data });
                    }
                    break;

                case 'karaoke-permission':
                    if (socket.id === room.hostId) {
                        room.karaokeEnabled = data.enabled;
                        socket.to(roomId).emit('room-event', { event, data });
                        saveRoom(roomId, room);
                    }
                    break;


                case 'video-mode':
                    if (socket.id === room.hostId) {
                        room.videoMode = data.mode || 'off';
                        if (data.mode === 'off') {
                            room.activeVideos.clear();
                        }
                        socket.to(roomId).emit('room-event', { event, data });
                        saveRoom(roomId, room);
                    }
                    break;

                case 'video-start':
                    if (room.videoMode !== 'off' && room.activeVideos.size < 6) {
                        room.activeVideos.add(socket.id);
                        socket.to(roomId).emit('room-event', { event, data: { ...data, socketId: socket.id, userName: socket.userName, userId: socket.userId } });
                        saveRoom(roomId, room);
                    }
                    break;

                case 'video-stop':
                    room.activeVideos.delete(socket.id);
                    socket.to(roomId).emit('room-event', { event, data: { ...data, socketId: socket.id, userName: socket.userName, userId: socket.userId } });
                    saveRoom(roomId, room);
                    break;

                case 'video-request':
                    if (room.hostId) {
                        io.to(room.hostId).emit('room-event', {
                            event,
                            data: { ...data, requesterId: socket.id, userName: socket.userName }
                        });
                    }
                    break;

                case 'video-approved':
                    if (socket.id === room.hostId && data.targetSocketId) {
                        io.to(data.targetSocketId).emit('room-event', { event, data });
                    }
                    break;

                case 'video-denied':
                    if (socket.id === room.hostId && data.targetSocketId) {
                        io.to(data.targetSocketId).emit('room-event', { event, data });
                    }
                    break;

                case 'mute-all':
                    if (socket.id === room.hostId) {
                        room.participants.forEach((p) => {
                            if (p.socketId !== socket.id) {
                                p.isMuted = true;
                            }
                        });
                        socket.to(roomId).emit('room-event', { event, data: { hostName: socket.userName } });
                    }
                    break;

                case 'close-room':
                    if (socket.id === room.hostId) {
                        cancelRoomDeletion(roomId);
                        io.to(roomId).emit('room-event', { event, data: { hostName: socket.userName } });
                        room.participants.forEach((p, sid) => {
                            const s = io.sockets.sockets.get(sid);
                            if (s) {
                                s.leave(roomId);
                                s.roomId = null;
                            }
                        });
                        room.participants.clear();
                        rooms.delete(roomId);
                        deleteRoom(roomId);
                        io.emit('rooms-updated', getActiveRooms());
                        console.log(`Room ${roomId} closed by host ${socket.userName}`);
                    }
                    break;

                case 'permission-request':
                    if (room.hostId) {
                        io.to(room.hostId).emit('room-event', {
                            event,
                            data: { ...data, requesterId: socket.id, userName: socket.userName }
                        });
                    }
                    break;

                case 'permission-approved':
                case 'permission-denied':
                    socket.to(roomId).emit('room-event', { event, data });
                    break;

                case 'karaoke-start':
                case 'karaoke-stop':
                case 'karaoke-song':
                    socket.to(roomId).emit('room-event', { event, data: { ...data, userId: socket.userId, userName: socket.userName } });
                    break;

                case 'youtube-embed':
                    socket.to(roomId).emit('room-event', { event, data: { ...data, userId: socket.userId, userName: socket.userName } });
                    break;


                case 'hand-raise':
                    socket.to(roomId).emit('room-event', { event, data: { ...data, userId: socket.userId, userName: socket.userName } });
                    break;

                case 'mute-status':
                    const participant = room.participants.get(socket.id);
                    if (participant) participant.isMuted = data.muted;
                    socket.to(roomId).emit('room-event', { event, data: { ...data, userId: socket.userId } });
                    break;

                default:
                    socket.to(roomId).emit('room-event', { event, data });
            }
        });

        socket.on('room-image', ({ roomId, imageData }) => {
            if (!roomId || !imageData) return;
            if (imageData.length > 14 * 1024 * 1024) return;
            const room = rooms.get(roomId);
            if (!room || !room.participants.has(socket.id)) return;
            socket.to(roomId).emit('room-image', {
                sender: socket.userName || 'Someone',
                imageData
            });
        });

        socket.on('music-stream-status', ({ roomId, songTitle, artistName, playing }) => {
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room || !room.participants.has(socket.id)) return;
            socket.to(roomId).emit('music-stream-status', {
                sender: socket.userName || 'Someone',
                senderId: socket.userId,
                songTitle: songTitle || 'Untitled Track',
                artistName: artistName || 'Unknown Artist',
                playing: !!playing
            });
        });

        socket.on('audio-mix-status', ({ roomId, mixing, videoId }) => {
            socket.to(roomId).emit('audio-mix-status', {
                userId: socket.userId,
                userName: socket.userName,
                mixing,
                videoId
            });
        });

        socket.on('disconnect', () => {
            if (socket.wildcardTimer) clearTimeout(socket.wildcardTimer);
            if (socket.registeredUserId && connectedUsers.has(socket.registeredUserId)) {
                const userSockets = connectedUsers.get(socket.registeredUserId);
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    connectedUsers.delete(socket.registeredUserId);
                }
            }

            if (socket.roomId && rooms.has(socket.roomId)) {
                const room = rooms.get(socket.roomId);
                if (room.activeVideos) room.activeVideos.delete(socket.id);
                room.participants.delete(socket.id);

                const participantList = Array.from(room.participants.values());

                socket.to(socket.roomId).emit('participant-left', {
                    socketId: socket.id,
                    userId: socket.userId,
                    userName: socket.userName,
                    participants: participantList
                });

                if (room.participants.size === 0) {
                    if (isShuttingDown) {
                        console.log(`Room ${socket.roomId} emptied during shutdown — preserved in Redis for restore`);
                    } else {
                        scheduleRoomDeletion(socket.roomId, 'disconnect');
                    }
                } else if (socket.id === room.hostId) {
                    const firstParticipant = room.participants.values().next().value;
                    if (firstParticipant) {
                        room.hostId = firstParticipant.socketId;
                        firstParticipant.isHost = true;
                        io.to(socket.roomId).emit('room-event', {
                            event: 'host-changed',
                            data: { newHostId: firstParticipant.socketId, newHostName: firstParticipant.userName }
                        });
                    }
                    saveRoom(socket.roomId, room);
                } else {
                    saveRoom(socket.roomId, room);
                }

                io.emit('rooms-updated', getActiveRooms());

                console.log(`${socket.userName} left room ${socket.roomId} (${room.participants.size} remaining)`);
            }
        });
    });

    return { rooms };
}

function getActiveRooms() {
    const activeRooms = [];
    const seen = new Set();
    rooms.forEach((room, roomId) => {
        if (room.participants.size === 0) return;
        const nameKey = (room.name || '').toLowerCase().trim();
        if (nameKey && seen.has(nameKey)) return;
        if (nameKey) seen.add(nameKey);
        activeRooms.push({
            id: roomId,
            name: room.name || null,
            participantCount: room.participants.size,
            participants: Array.from(room.participants.values()).map(p => ({
                userId: p.userId,
                userName: p.userName,
                isHost: p.isHost,
                avatar: p.avatar || null
            })),
            isLocked: room.isLocked,
            karaokeEnabled: room.karaokeEnabled,
            videoMode: room.videoMode || 'off',
            tokenPrice: room.tokenPrice || 0,
            createdAt: room.createdAt
        });
    });
    return activeRooms;
}

function setShuttingDown() {
    isShuttingDown = true;
    console.log('[Signaling] Shutdown flag set — rooms will be preserved in Redis');
}

let _roomsReadyPromise = null;

function setRoomsReadyPromise(p) { _roomsReadyPromise = p; }

async function waitForRoomsReady() {
    if (_roomsReadyPromise) {
        await Promise.race([
            _roomsReadyPromise,
            new Promise(resolve => setTimeout(resolve, 8000))
        ]);
    }
}

async function joinRoomHTTP({ roomId, userId, userName, isHost, roomName, avatar }) {
    await waitForRoomsReady();
    if (!roomId) return { success: false, message: 'Missing roomId' };

    console.log(`[HTTP Join] Looking for room ${roomId} — in-memory: ${rooms.has(roomId)}, total rooms: ${rooms.size}`);

    if (!rooms.has(roomId)) {
        try {
            console.log(`[HTTP Join] Room ${roomId} not in memory, checking Redis...`);
            const redisRoom = await Promise.race([
                loadRoom(roomId),
                new Promise(resolve => setTimeout(() => resolve(null), 5000))
            ]);
            if (redisRoom) {
                console.log(`[HTTP Join] Room "${roomId}" restored from Redis: "${redisRoom.name}"`);
                redisRoom.participants = new Map();
                redisRoom.activeVideos = new Set();
                rooms.set(roomId, redisRoom);
            } else {
                console.log(`[HTTP Join] Room ${roomId} not found in Redis either`);
            }
        } catch (e) {
            console.warn('[HTTP Join] Redis fallback error:', e.message);
        }
    }

    if (!rooms.has(roomId)) {
        if (isHost && roomName) {
            const now = Date.now();
            rooms.set(roomId, {
                id: roomId,
                name: roomName,
                hostId: null,
                creatorUserId: userId,
                participants: new Map(),
                karaokeEnabled: false,
                videoMode: 'off',
                activeVideos: new Set(),
                isLocked: false,
                stageAccess: 'invite-only',
                tokenPrice: 0,
                createdAt: now,
                lastActivity: now,
                participantHistory: new Set(),
                peakParticipants: 0
            });
            console.log(`[HTTP Join] Room created: ${roomId} "${roomName}" by ${userName}`);
        } else {
            return { success: false, message: 'This room is no longer live.' };
        }
    }

    const room = rooms.get(roomId);
    cancelRoomDeletion(roomId);
    room.lastActivity = Date.now();
    // Host authority derived server-side: rooms with a known creator only
    // grant host to that creator, regardless of the client's isHost flag.
    if (room.creatorUserId && String(room.creatorUserId) !== String(userId || '')) {
        isHost = false;
    }
    if (room.isLocked && !isHost) {
        return { success: false, message: 'This room is currently locked.' };
    }

    saveRoom(roomId, room).catch(e => console.warn('[HTTP Join] saveRoom error:', e.message));

    return {
        success: true,
        roomId,
        roomName: room.name || null,
        participants: Array.from(room.participants.values()),
        isHost: isHost || false,
        karaokeEnabled: room.karaokeEnabled,
        videoMode: room.videoMode || 'off',
        activeVideos: Array.from(room.activeVideos || []),
        isLocked: room.isLocked,
        stageAccess: room.stageAccess || 'invite-only',
        tokenPrice: room.tokenPrice || 0
    };
}

function getRoomsMap() {
    return rooms;
}

function getRoomById(roomId) {
    return rooms.get(roomId) || null;
}

module.exports = { setupSignaling, getActiveRooms, setShuttingDown, joinRoomHTTP, getRoomsMap, waitForRoomsReady, getRoomById };
