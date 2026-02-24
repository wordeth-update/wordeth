const { saveRoom, deleteRoom, loadAllRooms, loadRoom, getClient } = require('../services/redisClient');

let rooms = new Map();
const connectedUsers = new Map();

async function initRooms() {
    getClient();
    const restored = await loadAllRooms();
    if (restored.size > 0) {
        rooms = restored;
        console.log(`[Signaling] ${restored.size} room(s) restored from Redis`);
    }
}

function setupSignaling(io) {
    let roomsReady = false;
    const roomsReadyPromise = initRooms()
        .then(() => { roomsReady = true; })
        .catch(err => {
            console.error('[Signaling] Room restore failed:', err.message);
            roomsReady = true;
        });

    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on('register-user', ({ userId, userName }) => {
            if (userId) {
                socket.registeredUserId = userId;
                socket.registeredUserName = userName || 'User';
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
            }
        });

        socket.on('room-invite', ({ targetUserId, roomId, roomName, inviterName }) => {
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

            const targetSockets = connectedUsers.get(targetUserId);
            if (targetSockets && targetSockets.size > 0) {
                const socketIds = Array.from(targetSockets);
                const latestSocketId = socketIds[socketIds.length - 1];
                io.to(latestSocketId).emit('room-invite', {
                    roomId,
                    roomName: roomName || roomId,
                    inviterName: inviterName || socket.registeredUserName || 'Someone',
                    inviterId: socket.registeredUserId,
                    timestamp: now
                });
                socket.emit('invite-sent', { targetUserId, success: true });
            } else {
                socket.emit('invite-sent', { targetUserId, success: false, reason: 'offline' });
            }
        });

        socket.on('join-room', async ({ roomId, userId, userName, isHost: requestedHost, roomName, avatar }) => {
            if (!roomsReady) await roomsReadyPromise;
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
                    rooms.delete(socket.roomId);
                    deleteRoom(socket.roomId);
                    console.log(`Room ${socket.roomId} removed (empty after room switch)`);
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
                        socket.leave(roomId);
                        socket.roomId = null;
                        return;
                    }
                } else {
                    if (!roomName) {
                        socket.emit('room-error', { message: 'This room has expired. Please create a new one.' });
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
                        createdAt: Date.now()
                    });
                }
            }

            const room = rooms.get(roomId);
            if (roomName && isHost) {
                room.name = roomName;
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
            const shouldBeHost = isHost || isOriginalCreator;

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
                joinedAt: Date.now()
            });

            const participantList = Array.from(room.participants.values());

            socket.emit('room-joined', {
                roomId,
                roomName: room.name || null,
                participants: participantList,
                isHost: shouldBeHost,
                karaokeEnabled: room.karaokeEnabled,
                videoMode: room.videoMode || 'off',
                activeVideos: Array.from(room.activeVideos || []),
                isLocked: room.isLocked,
                stageAccess: room.stageAccess || 'invite-only'
            });

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

            saveRoom(roomId, room);
            io.emit('rooms-updated', getActiveRooms());
        });

        socket.on('agora-uid-map', ({ roomId, agoraUid }) => {
            const room = rooms.get(roomId);
            if (room && room.participants.has(socket.id)) {
                const participant = room.participants.get(socket.id);
                participant.agoraUid = agoraUid;
                socket.to(roomId).emit('agora-uid-mapped', {
                    socketId: socket.id,
                    agoraUid: agoraUid
                });
            }
        });


        socket.on('leave-room', ({ roomId }) => {
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
                rooms.delete(roomId);
                deleteRoom(roomId);
                console.log(`Room ${roomId} removed (empty after leave)`);
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
                    rooms.delete(socket.roomId);
                    deleteRoom(socket.roomId);
                    console.log(`Room ${socket.roomId} removed (empty)`);
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
    rooms.forEach((room, roomId) => {
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
            createdAt: room.createdAt
        });
    });
    return activeRooms;
}

module.exports = { setupSignaling, getActiveRooms };
