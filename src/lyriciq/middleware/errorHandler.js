'use strict';

const { AppError, ProviderError } = require('../utilities/errors');
const logger = require('../utilities/logger');

/** Centralised error → JSON. Never leaks stack traces or provider internals. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
        const body = { error: { code: err.code, message: err.message } };
        if (err.details) body.error.details = err.details;
        return res.status(err.status).json(body);
    }
    if (err instanceof ProviderError) {
        logger.error('provider_error', { provider: err.provider, code: err.code, message: err.message, path: req.originalUrl });
        const status = err.code === 'RATE_LIMITED' ? 429 : 503;
        return res.status(status).json({ error: { code: 'LYRICS_PROVIDER_UNAVAILABLE', message: 'Lyric content is temporarily unavailable. Please try again shortly.' } });
    }
    if (err && err.name === 'CastError') {
        return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Malformed identifier' } });
    }
    if (err && err.name === 'ValidationError') {
        return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: err.message } });
    }
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
    }
    if (err && (err.name === 'MongoServerError' || err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError')) {
        logger.error('database_error', { message: err.message, path: req.originalUrl });
        return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'The game is temporarily unavailable. Please try again in a moment.' } });
    }
    logger.error('unhandled_error', { message: err && err.message, name: err && err.name, path: req.originalUrl });
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' } });
}

/** Wrap async route handlers so rejections reach the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, asyncHandler };
