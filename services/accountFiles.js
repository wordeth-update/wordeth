/**
 * The files an account leaves behind, and how to take them with it.
 *
 * Deleting an account used to remove the records that pointed at files
 * and leave the files themselves in storage under their random URLs. Now
 * the flush takes the files too. Most are keyed by the account id, so a
 * prefix finds them; replay audio is keyed by room, and a voice note in a
 * conversation belongs to whoever sent it, so those are listed by URL from
 * the records before the records go.
 */
const fileStorage = require('./fileStorage');

/** Where each kind of file an account owns is kept, by key prefix. */
function prefixesFor(userId) {
    const id = String(userId);
    return [
        `avatars/${id}.`,
        `profile-photos/${id}-`,
        `music-snippets/${id}-`,
        `audio-messages/${id}-`,
        `board/${id}/`,
        `designs/${id}/`,
    ];
}

/** The storage key behind a stored URL (or a bare key), or null if it is not ours. */
function keyFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const marker = '/api/files/';
    const at = url.indexOf(marker);
    if (at >= 0) {
        try { return decodeURIComponent(url.slice(at + marker.length).split('?')[0]) || null; } catch { return null; }
    }
    // A bare key, the way an avatar is stored.
    if (/^[a-z-]+\//.test(url) && !/^https?:/.test(url)) return url;
    return null;
}

/**
 * Remove the files. Never throws: a file that will not go is logged, and
 * the account deletion carries on, because a stuck file must not keep an
 * account alive. Returns counts for the log.
 */
async function flushAccountFiles({ userId, urls = [] }) {
    const out = { byPrefix: 0, byUrl: 0, failed: 0 };
    for (const prefix of prefixesFor(userId)) {
        try { out.byPrefix += await fileStorage.deleteByPrefix(prefix); }
        catch (e) { out.failed++; console.error('[Delete] files under', prefix, e.message); }
    }
    const keys = new Set(urls.map(keyFromUrl).filter(Boolean));
    for (const key of keys) {
        try { if (await fileStorage.deleteByKey(key)) out.byUrl++; }
        catch (e) { out.failed++; console.error('[Delete] file', key, e.message); }
    }
    return out;
}

module.exports = { prefixesFor, keyFromUrl, flushAccountFiles };
