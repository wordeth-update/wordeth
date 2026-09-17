'use strict';

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const config = require('../config');
const { randomId } = require('../utilities/random');
const { unauthorized } = require('../utilities/errors');

/**
 * Resolves the acting player for a request.
 *
 *   Authorization: Bearer <user jwt>   → registered user  (playerKey user:<id>)
 *   X-Guest-Token: <guest jwt>         → guest            (playerKey guest:<id>)
 *
 * Guest tokens are server-signed so a guest identity cannot be forged or
 * hijacked by guessing an id. `createGuest: true` mints a new guest identity
 * when neither credential is present (used only where play may begin).
 */
function signGuestToken(guestId) {
    return jwt.sign({ guestId, typ: 'guest' }, process.env.JWT_SECRET, { expiresIn: config.session.guestTokenTtl });
}

function verifyGuestToken(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.typ === 'guest' && typeof decoded.guestId === 'string') return decoded.guestId;
    } catch (err) { /* invalid guest token → anonymous */ }
    return null;
}

async function resolveUser(req) {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) return null;
    try {
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        if (!decoded.userId || mongoose.connection.readyState !== 1) return null;
        const user = await User.findById(decoded.userId).select('name role customerAudience').lean();
        return user || null;
    } catch (err) {
        return null;
    }
}

function playerIdentity({ createGuest = false, required = true } = {}) {
    return async function resolvePlayer(req, res, next) {
        try {
            const user = await resolveUser(req);
            if (user) {
                req.player = { key: `user:${user._id}`, userId: user._id, guestId: null, displayName: user.name, role: user.role, isGuest: false };
                return next();
            }
            const guestHeader = req.header('X-Guest-Token');
            const guestId = guestHeader ? verifyGuestToken(guestHeader) : null;
            if (guestId) {
                req.player = { key: `guest:${guestId}`, userId: null, guestId, displayName: 'Guest', isGuest: true };
                return next();
            }
            if (createGuest) {
                const newId = randomId(12);
                const token = signGuestToken(newId);
                req.player = { key: `guest:${newId}`, userId: null, guestId: newId, displayName: 'Guest', isGuest: true, newGuestToken: token };
                res.setHeader('X-Guest-Token', token);
                return next();
            }
            if (!required) { req.player = null; return next(); }
            return next(unauthorized('PLAYER_REQUIRED', 'Start a game first to get a player identity.'));
        } catch (err) {
            return next(err);
        }
    };
}

module.exports = { playerIdentity, signGuestToken, verifyGuestToken };
