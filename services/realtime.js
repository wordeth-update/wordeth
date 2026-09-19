/**
 * A line to one person's open apps.
 *
 * Rooms talk to sockets by room; this talks to a person: every socket the
 * account holds, wherever they are in the app. Used for things that are
 * theirs rather than the room's — a token balance changing while they
 * sit in a room, say. Silent when they are not connected; the app asks
 * again when it comes back.
 */
function emitToUser(userId, event, payload) {
    const io = global._io;
    const connected = global._connectedUsers;
    if (!io || !connected) return 0;
    const sockets = connected.get(String(userId));
    if (!sockets || sockets.size === 0) return 0;
    let n = 0;
    for (const sid of sockets) { io.to(sid).emit(event, payload); n++; }
    return n;
}

module.exports = { emitToUser };
