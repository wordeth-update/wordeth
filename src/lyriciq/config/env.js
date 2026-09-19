'use strict';

/**
 * Startup validation for the Lyric IQ subsystem.
 *
 * Fails loudly on missing critical configuration and warns about degraded
 * modes (e.g. no Musixmatch key → synthetic catalog only, which is fine in
 * development but is a misconfiguration in production).
 */

const config = require('./index');

function validateLyricIqEnv({ exitOnFailure = true, log = console } = {}) {
    const errors = [];
    const warnings = [];
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (!process.env.JWT_SECRET) {
        errors.push('JWT_SECRET is required (guest and user identity tokens are signed with it).');
    } else if (process.env.JWT_SECRET.length < 32) {
        warnings.push('JWT_SECRET is shorter than 32 characters; use a long random value in production.');
    }

    if (config.provider.name === 'musixmatch' && !config.provider.musixmatch.apiKey) {
        errors.push('LYRICIQ_LYRIC_PROVIDER=musixmatch but MUSIXMATCH_API_KEY is missing.');
    }

    if (!['musixmatch', 'synthetic'].includes(config.provider.name)) {
        errors.push(`Unknown LYRICIQ_LYRIC_PROVIDER "${config.provider.name}" (expected musixmatch or synthetic).`);
    }

    if (nodeEnv === 'production') {
        if (config.provider.name === 'synthetic') {
            warnings.push('Production is running on the synthetic lyric catalog (TEST CONTENT). Set MUSIXMATCH_API_KEY.');
        }
        if (!config.internal.apiKey) {
            warnings.push('LYRICIQ_INTERNAL_API_KEY not set; internal content routes accept admin JWTs only.');
        }
        if (config.daily.seedSalt === 'wordeth-daily-v1') {
            warnings.push('LYRICIQ_DAILY_SEED_SALT is the default; set a private salt so daily sets cannot be precomputed.');
        }
    }

    for (const w of warnings) log.warn(`[lyriciq:env] WARNING: ${w}`);
    for (const e of errors) log.error(`[lyriciq:env] ERROR: ${e}`);

    if (errors.length && exitOnFailure) {
        log.error('[lyriciq:env] Lyric IQ configuration invalid — refusing to start.');
        process.exit(1);
    }
    return { ok: errors.length === 0, errors, warnings };
}

module.exports = { validateLyricIqEnv };
