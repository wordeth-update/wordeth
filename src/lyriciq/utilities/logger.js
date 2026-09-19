'use strict';

/**
 * Structured JSON-lines logger for Lyric IQ.
 *
 * Never pass secrets or full lyric bodies into `props`. The `redact` step strips
 * obviously sensitive keys defensively.
 */

const SENSITIVE_KEYS = new Set(['apikey', 'api_key', 'apiKey', 'password', 'token', 'authorization', 'secret', 'lyricsBody', 'body']);

function redact(props) {
    if (!props || typeof props !== 'object') return props;
    const out = {};
    for (const [k, v] of Object.entries(props)) {
        if (SENSITIVE_KEYS.has(k)) {
            out[k] = '[redacted]';
        } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            out[k] = redact(v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

const silent = process.env.NODE_ENV === 'test' && !process.env.LYRICIQ_TEST_LOGS;

function write(level, event, props) {
    if (silent) return;
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        subsystem: 'lyriciq',
        event,
        ...redact(props || {})
    });
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
}

const logger = {
    info: (event, props) => write('info', event, props),
    warn: (event, props) => write('warn', event, props),
    error: (event, props) => write('error', event, props),
    debug: (event, props) => { if (process.env.LYRICIQ_DEBUG) write('debug', event, props); },
    /** Domain event helper – the observability event vocabulary lives in one place. */
    event: (name, props) => write('info', name, props)
};

module.exports = logger;
