'use strict';

/**
 * Proving an email address belongs to whoever signed up with it.
 *
 * A new account is sent one link. The link carries a random token; only
 * its hash is stored, so the database alone cannot be used to verify
 * anyone. The link is good for two days and for one use. Nothing in the
 * app is locked until it is used — verification is a mark on the account,
 * shown to its owner until it is done.
 */

const crypto = require('crypto');
const mailer = require('./mailer');

const LINK_HOURS = 48;
/** At most one email a minute per account, however often Resend is pressed. */
const RESEND_AFTER_MS = 60 * 1000;

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function siteUrl() {
    return (process.env.PUBLIC_URL || 'https://www.wordeth.com').replace(/\/+$/, '');
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Mint a link for this account and email it.
 * Returns { sent, reason? }; reason 'too_soon' when one went out under a minute ago.
 */
async function start(user) {
    const last = user.emailVerification && user.emailVerification.sentAt;
    if (last && Date.now() - new Date(last).getTime() < RESEND_AFTER_MS) return { sent: false, reason: 'too_soon' };
    if (!mailer.configured()) return { sent: false, reason: 'not_configured' };

    const token = crypto.randomBytes(32).toString('base64url');
    user.emailVerification = {
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + LINK_HOURS * 60 * 60 * 1000),
        sentAt: new Date()
    };
    await user.save();

    const link = `${siteUrl()}/api/auth/verify-email?id=${user._id}&token=${token}`;
    const name = escapeHtml(user.name || 'there');
    return mailer.send({
        to: user.email,
        subject: 'Confirm your email for Wordeth',
        text: `Hi ${user.name || 'there'},\n\nConfirm this is your email address for Wordeth:\n${link}\n\nThe link works once and for ${LINK_HOURS} hours. If you did not make a Wordeth account, ignore this email.`,
        html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1033;">
<p style="font-size:16px;">Hi ${name},</p>
<p style="font-size:16px;">Confirm this is your email address for Wordeth.</p>
<p style="margin:28px 0;"><a href="${link}" style="background:#5F0E82;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:700;display:inline-block;">Confirm my email</a></p>
<p style="font-size:13px;color:#555;">The link works once and for ${LINK_HOURS} hours. If you did not make a Wordeth account, ignore this email.</p>
</div>`
    });
}

/** Use a link. Returns 'verified', 'already', or 'invalid'. */
async function finish(User, id, token) {
    if (!/^[a-f0-9]{24}$/i.test(String(id || '')) || typeof token !== 'string' || token.length < 20 || token.length > 200) return 'invalid';
    const user = await User.findById(id).select('emailVerified emailVerification');
    if (!user) return 'invalid';
    if (user.emailVerified === true) return 'already';
    const v = user.emailVerification;
    if (!v || !v.tokenHash || !v.expiresAt || new Date(v.expiresAt).getTime() < Date.now()) return 'invalid';
    const a = Buffer.from(hash(token));
    const b = Buffer.from(v.tokenHash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'invalid';
    user.emailVerified = true;
    user.emailVerification = { tokenHash: null, expiresAt: null, sentAt: v.sentAt, verifiedAt: new Date() };
    await user.save();
    return 'verified';
}

module.exports = { start, finish, hash, LINK_HOURS };
