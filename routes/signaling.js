const rooms = new Map();
const connectedUsers = new Map();

function setupSignaling(io) {
    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on('register-user', ({ userId, userName }) => {
            if (userId) {
                socket.registeredUserId = userId;
                socket.registeredUserName = userName || 'User';
                if (!connectedUsers.has(userId)) {
                    connectedUsers.set(userId, new Set());
                }
                connectedUsers.get(userId).add(socket.id);
                console.log(`User registered: ${userName} (${userId}) on socket ${socket.id}`);
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
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit('room-invite', {
                        roomId,
                        roomName: roomName || roomId,
                        inviterName: inviterName || socket.registeredUserName || 'Someone',
                        inviterId: socket.registeredUserId,
                        timestamp: now
                    });
                });
                socket.emit('invite-sent', { targetUserId, success: true });
            } else {
                socket.emit('invite-sent', { targetUserId, success: false, reason: 'offline' });
            }
        });

        socket.on('join-room', ({ roomId, userId, userName, isHost, roomName }) => {
            socket.join(roomId);
            socket.roomId = roomId;
            socket.userId = userId || socket.id;
            socket.userName = userName || 'Anonymous';

            if (!rooms.has(roomId)) {
                rooms.set(roomId, {
                    id: roomId,
                    name: roomName || null,
                    hostId: isHost ? socket.id : null,
                    participants: new Map(),
                    karaokeEnabled: false,
                    screenshareEnabled: false,
                    isLocked: false,
                    createdAt: Date.now()
                });
            }

            const room = rooms.get(roomId);
            if (roomName && isHost) {
                room.name = roomName;
            }

            room.participants.set(socket.id, {
                socketId: socket.id,
                userId: socket.userId,
                userName: socket.userName,
                isHost: isHost || false,
                isMuted: false,
                joinedAt: Date.now()
            });

            if (isHost) {
                room.hostId = socket.id;
            }

            const participantList = Array.from(room.participants.values());

            socket.emit('room-joined', {
                roomId,
                roomName: room.name || null,
                participants: participantList,
                isHost: isHost || false,
                karaokeEnabled: room.karaokeEnabled,
                screenshareEnabled: room.screenshareEnabled,
                isLocked: room.isLocked
            });

            socket.to(roomId).emit('participant-joined', {
                socketId: socket.id,
                userId: socket.userId,
                userName: socket.userName,
                isHost: isHost || false,
                participants: participantList
            });

            console.log(`${socket.userName} joined room ${roomId} (${room.participants.size} participants)`);

            io.emit('rooms-updated', getActiveRooms());
        });

        socket.on('webrtc-offer', ({ targetId, offer }) => {
            io.to(targetId).emit('webrtc-offer', {
                senderId: socket.id,
                senderName: socket.userName,
                offer
            });
        });

        socket.on('webrtc-answer', ({ targetId, answer }) => {
            io.to(targetId).emit('webrtc-answer', {
                senderId: socket.id,
                answer
            });
        });

        socket.on('webrtc-ice-candidate', ({ targetId, candidate }) => {
            io.to(targetId).emit('webrtc-ice-candidate', {
                senderId: socket.id,
                candidate
            });
        });

        socket.on('chat-message', ({ roomId, message, sender }) => {
            socket.to(roomId).emit('chat-message', {
                sender: socket.userName,
                message,
                timestamp: Date.now()
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
                    }
                    break;

                case 'screenshare-permission':
                    if (socket.id === room.hostId) {
                        room.screenshareEnabled = data.enabled;
                        socket.to(roomId).emit('room-event', { event, data });
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

                case 'screenshare-start':
                case 'screenshare-stop':
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
                isHost: p.isHost
            })),
            isLocked: room.isLocked,
            karaokeEnabled: room.karaokeEnabled,
            createdAt: room.createdAt
        });
    });
    return activeRooms;
}

module.exports = { setupSignaling, getActiveRooms };
