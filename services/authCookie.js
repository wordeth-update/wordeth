'use strict';

/**
 * Shared sign-in across wordeth.com and play.wordeth.com.
 *
 * The browser keeps the JWT in localStorage per origin, which does not cross
 * subdomains. When AUTH_COOKIE_DOMAIN is set (e.g. ".wordeth.com") the token
 * is also placed in a cookie scoped to that domain so both origins can pick it
 * up. The cookie is readable by page scripts on purpose: clients send the token
 * as a Bearer header exactly as they do from localStorage, so exposure is the
 * same as today. Without AUTH_COOKIE_DOMAIN nothing changes.
 */
const COOKIE_NAME = 'wordeth_token';

function cookieOptions() {
    const domain = process.env.AUTH_COOKIE_DOMAIN;
    if (!domain) return null;
    return {
        domain,
        path: '/',
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    };
}

function setAuthCookie(res, token, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const opts = cookieOptions();
    if (!opts) return false;
    res.cookie(COOKIE_NAME, token, { ...opts, maxAge: maxAgeMs });
    return true;
}

function clearAuthCookie(res) {
    const opts = cookieOptions();
    if (!opts) return false;
    res.clearCookie(COOKIE_NAME, opts);
    return true;
}

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie, cookieOptions };
