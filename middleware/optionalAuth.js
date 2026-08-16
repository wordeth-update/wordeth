const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Like middleware/auth.js, but never rejects: sets req.user when a valid
// Bearer token is present, otherwise leaves it undefined. Used by public
// listing endpoints that only need the caller's own flags (e.g. isInterested).
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) return next();
        const token = authHeader.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.userId) {
            const user = await User.findById(decoded.userId);
            if (user) {
                req.token = token;
                req.user = user;
            }
        }
    } catch (err) {
        // Invalid/expired token on a public endpoint — treat as anonymous
    }
    next();
};

module.exports = optionalAuth;
