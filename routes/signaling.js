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

        socket.on('join-room', ({ roomId, userId, userName, isHost, roomName, avatar }) => {
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
                }

                io.emit('rooms-updated', getActiveRooms());
            }

            socket.join(roomId);
            socket.roomId = roomId;
            socket.userId = userId || socket.id;
            socket.userName = userName || 'Anonymous';
            socket.avatar = avatar || null;

            if (!rooms.has(roomId)) {
                if (!isHost) {
                    socket.emit('room-error', { message: 'This room is no longer live.' });
                    socket.leave(roomId);
                    socket.roomId = null;
                    return;
                }
                rooms.set(roomId, {
                    id: roomId,
                    name: roomName || null,
                    hostId: socket.id,
                    creatorUserId: socket.userId,
                    participants: new Map(),
                    karaokeEnabled: false,
                    screenshareEnabled: false,
                    videoMode: 'off',
                    activeVideos: new Set(),
                    isLocked: false,
                    createdAt: Date.now()
                });
            }

            const room = rooms.get(roomId);
            if (roomName && isHost) {
                room.name = roomName;
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
                isSpeaker: true,
                isMuted: false,
                joinedAt: Date.now()
            });

            const participantList = Array.from(room.participants.values());

            socket.emit('room-joined', {
                roomId,
                roomName: room.name || null,
                participants: participantList,
                isHost: shouldBeHost,
                karaokeEnabled: room.karaokeEnabled,
                screenshareEnabled: room.screenshareEnabled,
                videoMode: room.videoMode || 'off',
                activeVideos: Array.from(room.activeVideos || []),
                isLocked: room.isLocked
            });

            socket.to(roomId).emit('participant-joined', {
                socketId: socket.id,
                userId: socket.userId,
                userName: socket.userName,
                avatar: socket.avatar || null,
                isHost: shouldBeHost,
                participants: participantList
            });

            if (isOriginalCreator && !isHost) {
                io.to(roomId).emit('room-event', {
                    event: 'host-changed',
                    data: { newHostId: socket.id, newHostName: socket.userName }
                });
            }

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
                screenshareEnabled: room.screenshareEnabled,
                videoMode: room.videoMode || 'off',
                activeVideos: Array.from(room.activeVideos || [])
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
                    screenshareEnabled: room.screenshareEnabled
                });
            }
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

                case 'video-mode':
                    if (socket.id === room.hostId) {
                        room.videoMode = data.mode || 'off';
                        if (data.mode === 'off') {
                            room.activeVideos.clear();
                        }
                        socket.to(roomId).emit('room-event', { event, data });
                    }
                    break;

                case 'video-start':
                    if (room.videoMode !== 'off' && room.activeVideos.size < 6) {
                        room.activeVideos.add(socket.id);
                        socket.to(roomId).emit('room-event', { event, data: { ...data, socketId: socket.id, userName: socket.userName, userId: socket.userId } });
                    }
                    break;

                case 'video-stop':
                    room.activeVideos.delete(socket.id);
                    socket.to(roomId).emit('room-event', { event, data: { ...data, socketId: socket.id, userName: socket.userName, userId: socket.userId } });
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
