'use strict';

/**
 * play.wordeth.com — the game's own front door on the shared server.
 *
 *   On the play host:  "/" and "/play" serve the Lyric IQ page (no main-site chrome).
 *   On other hosts:    "/play" redirects to the play host in production, or serves the
 *                      page directly when no play host is configured (local dev).
 *
 * The API, static assets and every other page keep working on both hosts, so
 * sign-in pages are reachable from the game origin as well.
 */
function normalizeHost(value) {
    return String(value || '').toLowerCase().split(':')[0];
}

function createPlayHostMiddleware({ playHost = process.env.LYRICIQ_PLAY_HOST || '', gamePath = '/lyric-iq.html', redirect = process.env.NODE_ENV === 'production' } = {}) {
    const hosts = new Set(String(playHost).split(',').map(normalizeHost).filter(Boolean));
    hosts.add('play.localhost');

    function isPlayHost(req) {
        return hosts.has(normalizeHost(req.hostname || req.headers.host));
    }

    return function playHostMiddleware(req, res, next) {
        const onPlayHost = isPlayHost(req);
        req.isPlayHost = onPlayHost;
        const path = req.path.replace(/\/+$/, '') || '/';

        if (onPlayHost && (path === '/' || path === '/play' || path === '/index.html')) {
            req.url = gamePath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
            return next();
        }
        if (!onPlayHost && path === '/play') {
            const primary = playHost ? normalizeHost(playHost.split(',')[0]) : '';
            if (primary && redirect) {
                const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
                return res.redirect(302, `https://${primary}/${query}`);
            }
            req.url = gamePath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
            return next();
        }
        return next();
    };
}

module.exports = { createPlayHostMiddleware, normalizeHost };
