'use strict';

/** Error carrying an HTTP status and machine-readable code. Never exposes stacks. */
class AppError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.expose = true;
    }
}

const badRequest = (code, message, details) => new AppError(400, code, message, details);
const unauthorized = (code = 'UNAUTHORIZED', message = 'Authentication required') => new AppError(401, code, message);
const forbidden = (code = 'FORBIDDEN', message = 'Not allowed') => new AppError(403, code, message);
const notFound = (code = 'NOT_FOUND', message = 'Not found') => new AppError(404, code, message);
const conflict = (code, message, details) => new AppError(409, code, message, details);
const unavailable = (code = 'SERVICE_UNAVAILABLE', message = 'Service temporarily unavailable') => new AppError(503, code, message);

/** Error raised by lyric providers. `code` is normalised across providers. */
class ProviderError extends Error {
    constructor(code, message, { provider, retryable = false, cause } = {}) {
        super(message);
        this.name = 'ProviderError';
        this.code = code; // TIMEOUT | RATE_LIMITED | NOT_FOUND | BAD_PAYLOAD | RESTRICTED | UNAVAILABLE | UNAUTHORIZED
        this.provider = provider;
        this.retryable = retryable;
        if (cause) this.cause = cause;
    }
}

module.exports = { AppError, ProviderError, badRequest, unauthorized, forbidden, notFound, conflict, unavailable };
