'use strict';

/**
 * Who may run a room: the host, and anyone the host has shared the controls
 * with. A co-host can bring people up and move them, lock the room, set the
 * topic, the stage and the video rules, and answer requests. Recording,
 * sponsor breaks, closing the room and choosing co-hosts stay with the host.
 */
function runsRoom(room, socket) {
    if (!room || !socket) return false;
    if (socket.id === room.hostId) return true;
    const p = room.participants.get(socket.id);
    return !!(p && p.isCoHost);
}
/** Who takes the room when the host goes: a co-host if there is one, else whoever has been here longest. */
function nextHost(room) {
    for (const p of room.participants.values()) if (p.isCoHost) return p;
    return room.participants.values().next().value;
}
/** Socket ids of everyone who should see a request: the host and the co-hosts. */
function managersOf(room) {
    const ids = new Set();
    if (room.hostId) ids.add(room.hostId);
    for (const [sid, p] of room.participants.entries()) if (p.isCoHost) ids.add(sid);
    return Array.from(ids);
}

module.exports = { runsRoom, nextHost, managersOf };
