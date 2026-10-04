'use strict';

/**
 * The number a person is known by on the audio network, for one room.
 *
 * It used to be derived from the socket, and a socket is replaced every
 * time a phone's connection blinks. The audio engine on that phone does not
 * reconnect with it, so it kept the old number while the room was told a
 * new one — and everything keyed on the number stopped matching that
 * person: the ring that lights when they speak, their video tile, and in
 * the worst case the pass that lets them stay in the audio at all.
 *
 * It is now derived from the room and the account, so it is the same
 * before and after a reconnect, and it is known the moment somebody joins
 * rather than when their phone first asks for a pass. A guest with no
 * account still gets one from their socket.
 */
const crypto = require('crypto');

function agoraUidFor(channelName, participant) {
    if (Number.isInteger(participant.agoraUid) && participant.agoraUid > 0) return participant.agoraUid;
    const who = participant.userId && String(participant.userId) !== String(participant.socketId)
        ? `user:${participant.userId}`
        : `socket:${participant.socketId}`;
    const digest = crypto.createHash('sha256').update(`${channelName}:${who}`).digest();
    participant.agoraUid = digest.readUInt32BE(0) || 1;
    return participant.agoraUid;
}

module.exports = { agoraUidFor };
