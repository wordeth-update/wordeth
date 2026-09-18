'use strict';

const mongoose = require('mongoose');
const { unavailable } = require('../utilities/errors');

/** Gameplay needs persistence; fail fast with a clear 503 when Mongo is down. */
function requireDatabase(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        return next(unavailable('DATABASE_UNAVAILABLE', 'The game is temporarily unavailable. Please try again in a moment.'));
    }
    next();
}

module.exports = { requireDatabase };
