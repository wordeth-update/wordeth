'use strict';

/**
 * An avatar, as something small enough to send.
 *
 * Older accounts keep their picture inside the user record as a data URL:
 * the whole image, in base64, megabytes of it. Sent as-is it rode along in
 * every room update, rooms list, message and notification — to every phone,
 * every time. Anything that large is replaced here by the address that
 * serves the same picture (GET /api/user/avatar/:userId), which a browser
 * or the app fetches once and caches. Short values — a path, a URL, the
 * default — pass through untouched.
 */
const MAX_INLINE = 300;

function avatarRef(userId, avatar, fallback = '') {
    if (typeof avatar !== 'string' || !avatar) return fallback;
    if ((avatar.startsWith('data:') || avatar.length > MAX_INLINE) && userId) return `/api/user/avatar/${userId}`;
    if (avatar.length > MAX_INLINE) return fallback;
    return avatar;
}

module.exports = { avatarRef, MAX_INLINE };
