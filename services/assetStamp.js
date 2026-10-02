'use strict';

/**
 * Give every script and stylesheet a page loads the current build's
 * version, so a browser never pairs a new page with an older copy of a
 * script it kept.
 *
 * Scripts are cached by browsers for hours; pages are not cached at all.
 * Only files whose tag already carried "?v=<number>" used to be stamped,
 * which left the shared ones (utils.js, cookie-consent.js) free to be
 * hours stale: a page deployed expecting something new in them ran against
 * the old file until the cache ran out. Every local .js and .css reference
 * is stamped now, whether or not it had a version to begin with.
 */
function stampAssets(html, buildId) {
    return String(html)
        // Already versioned: replace whatever version it had.
        .replace(/(\.(?:js|css))\?v=[A-Za-z0-9_-]+/g, `$1?v=${buildId}`)
        // Local and unversioned: add one. Other hosts' files are left alone.
        .replace(/\b(src|href)="(?!https?:|\/\/|data:)([^"?#]+\.(?:js|css))"/g, `$1="$2?v=${buildId}"`);
}

module.exports = { stampAssets };
