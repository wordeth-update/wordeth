'use strict';

/**
 * Who has already paid at a room's door.
 *
 * A ticket is bought once. The room remembers everyone who paid, and the
 * ledger remembers it even if the room was rebuilt after a restart, so a
 * dropped connection, a phone restart or a step outside never costs a
 * second entry.
 */
const TokenLedger = require('../models/TokenLedger');

function remembered(room, userId) {
    return !!(room && userId && Array.isArray(room.paidUserIds) && room.paidUserIds.includes(String(userId)));
}

async function alreadyPaid(room, roomId, userId) {
    if (!userId) return false;
    if (remembered(room, userId)) return true;
    const paid = await TokenLedger.exists({ userId, roomId: String(roomId), type: 'room_entry' });
    if (paid && room) remember(room, userId);
    return !!paid;
}

function remember(room, userId) {
    if (!room || !userId) return;
    if (!Array.isArray(room.paidUserIds)) room.paidUserIds = [];
    const id = String(userId);
    if (!room.paidUserIds.includes(id)) room.paidUserIds.push(id);
}

module.exports = { alreadyPaid, remember, remembered };
