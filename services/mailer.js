'use strict';

/**
 * Sending email, through Resend's HTTP API.
 *
 * Nothing here is installed: it is one POST. Without RESEND_API_KEY the
 * server sends nothing and says so, which is the state it starts in — the
 * key is set on Railway by whoever owns the Resend account, once the
 * sending domain has been verified there. EMAIL_FROM is the address mail
 * comes from and must be on that domain.
 */

const ENDPOINT = 'https://api.resend.com/emails';

function configured() {
    return !!process.env.RESEND_API_KEY;
}

function from() {
    return process.env.EMAIL_FROM || 'Wordeth <hello@wordeth.com>';
}

/** Returns { sent: true, id } or { sent: false, reason }. Never throws. */
async function send({ to, subject, html, text }) {
    if (!configured()) return { sent: false, reason: 'not_configured' };
    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
            body: JSON.stringify({ from: from(), to: [to], subject, html, text }),
            signal: AbortSignal.timeout(10000)
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.warn('[Mail] refused:', res.status, body && body.message ? body.message : '');
            return { sent: false, reason: `refused_${res.status}` };
        }
        return { sent: true, id: body.id || null };
    } catch (error) {
        console.warn('[Mail] send error:', error.message);
        return { sent: false, reason: 'error' };
    }
}

module.exports = { send, configured, from };
