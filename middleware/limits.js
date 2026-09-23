const rateLimit = require('express-rate-limit');

/**
 * Per-person limits for the routes that cost something: a push to a
 * phone, a megabyte in memory, a room in Redis. Keyed by the signed-in
 * account so a shared office IP is not one bucket, and by IP when there
 * is no account. The global limiter (server.js) still applies on top.
 */
function userLimiter(windowMs, max, message) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => (req.user && req.user._id ? `u:${req.user._id}` : `ip:${req.headers['cf-connecting-ip'] || req.ip}`),
        message: { message: message || 'Too many requests. Please wait a little.' },
    });
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

module.exports = {
    userLimiter,
    applePurchase: userLimiter(MIN, 20, 'Too many purchase checks. Give it a minute.'),
    // Ad counters are unauthenticated by nature, so these are keyed by address
    // and sized for a person reading pages, not a script in a loop.
    adImpression: userLimiter(MIN, 60, 'Too many ad events.'),
    adClick: userLimiter(MIN, 20, 'Too many ad clicks.'),
    adTopUp: userLimiter(HOUR, 20, 'Too many payment attempts. Try again shortly.'),
    messages: userLimiter(MIN, 30, 'Slow down: thirty messages a minute.'),
    messagesDaily: userLimiter(DAY, 500, 'That is enough messages for one day.'),
    pushToken: userLimiter(HOUR, 20),
    replayMedia: userLimiter(HOUR, 5, 'Five recordings an hour.'),
    upload: userLimiter(HOUR, 10, 'Ten uploads an hour.'),
    heartbeat: userLimiter(MIN, 4),
    rotateCollab: userLimiter(DAY, 5, 'Five new ids a day.'),
    createRoom: userLimiter(HOUR, 10, 'Ten rooms an hour.'),
    joinRoom: userLimiter(15 * MIN, 60),
    agoraToken: userLimiter(MIN, 30),
    grant: userLimiter(HOUR, 30),
    search: userLimiter(MIN, 60),
};
