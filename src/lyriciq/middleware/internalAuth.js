'use strict';

const crypto = require('crypto');
const config = require('../config');
const auth = require('../../../middleware/auth');
const { requireRole } = require('../../../middleware/rbac');
const { unauthorized } = require('../utilities/errors');

function safeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Internal content-control routes accept either the shared internal API key
 * (for tooling) or an admin user's JWT.
 */
function internalAuth(req, res, next) {
    const key = req.header('X-Internal-Key');
    if (key && config.internal.apiKey && safeEqual(key, config.internal.apiKey)) {
        req.internalActor = 'internal-key';
        return next();
    }
    if (!req.header('Authorization')) return next(unauthorized('INTERNAL_AUTH_REQUIRED', 'Internal credentials required'));
    return auth(req, res, (err) => {
        if (err) return next(err);
        return requireRole('ADMIN')(req, res, (err2) => {
            if (err2) return next(err2);
            req.internalActor = `admin:${req.user?._id}`;
            next();
        });
    });
}

module.exports = { internalAuth };
