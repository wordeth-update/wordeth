'use strict';

/**
 * Impression and click handshake.
 *
 * A counter that anyone can increment by guessing an id is not a counter,
 * it is an invitation. So the server never accepts a bare ad id. When an ad
 * is handed to a page it comes with a ticket: a short-lived value signed
 * here, naming that one ad, that one slot and that one viewer. The page
 * gives the ticket back to record what happened.
 *
 * A ticket cannot be minted by a client, cannot be moved to a different ad,
 * cannot outlive its window, and cannot be spent twice. A click is only
 * accepted on a ticket whose impression was already recorded, because
 * nobody clicks an ad they were never shown.
 */

const crypto = require('crypto');

/** Signing key. Falls back to the app secret so a fresh deploy still works. */
function secret() {
    return process.env.AD_TICKET_SECRET || process.env.JWT_SECRET || 'wordeth-ad-tickets';
}

/** How long a ticket is good for: long enough to read a page, short enough to be useless later. */
const TICKET_TTL_MS = 10 * 60 * 1000;

/**
 * Who is looking, without storing who they are. IP and user agent are
 * hashed with the signing key, so the value identifies a viewer for
 * counting and cannot be read back into an address.
 */
function viewerHash(req) {
    const ip = req.headers['cf-connecting-ip'] || req.ip || '';
    const ua = req.headers['user-agent'] || '';
    return crypto.createHmac('sha256', secret()).update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

function sign(body) {
    return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}

/**
 * Mint a ticket for one ad in one slot for one viewer.
 * Shape: adId.slot.issuedAt.nonce.signature
 */
function issue(adId, slot, req) {
    const nonce = crypto.randomBytes(9).toString('base64url');
    const issuedAt = Date.now();
    const viewer = viewerHash(req);
    const body = `${adId}.${slot}.${issuedAt}.${nonce}.${viewer}`;
    return `${adId}.${slot}.${issuedAt}.${nonce}.${sign(body)}`;
}

/**
 * Check a ticket and say what it is for.
 * Returns { ok: true, adId, slot, nonce } or { ok: false, reason }.
 */
function verify(ticket, req) {
    if (typeof ticket !== 'string' || ticket.length > 300) return { ok: false, reason: 'MALFORMED' };
    const parts = ticket.split('.');
    if (parts.length !== 5) return { ok: false, reason: 'MALFORMED' };
    const [adId, slot, issuedAtRaw, nonce, signature] = parts;
    if (!/^[a-f0-9]{24}$/i.test(adId)) return { ok: false, reason: 'MALFORMED' };

    const issuedAt = Number(issuedAtRaw);
    if (!Number.isFinite(issuedAt)) return { ok: false, reason: 'MALFORMED' };
    // A ticket from the future is a clock lie; one past its window is stale.
    if (issuedAt > Date.now() + 60 * 1000) return { ok: false, reason: 'NOT_YET' };
    if (Date.now() - issuedAt > TICKET_TTL_MS) return { ok: false, reason: 'EXPIRED' };

    const expected = sign(`${adId}.${slot}.${issuedAt}.${nonce}.${viewerHash(req)}`);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    // Length-safe constant-time compare: a mismatch must not be readable from timing.
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'BAD_SIGNATURE' };

    return { ok: true, adId, slot, nonce };
}

module.exports = { issue, verify, viewerHash, TICKET_TTL_MS };
