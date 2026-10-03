/**
 * Confirming an email: the link is minted and mailed, works once, and
 * nothing is sent when no mail provider is configured. No database: the
 * user is a stand-in with a save().
 */
const verification = require('../services/emailVerification');
const mailer = require('../services/mailer');

function fakeUser(extra = {}) {
    return { _id: 'a'.repeat(24), name: 'Tess <b>', email: 'tess@example.com', saved: 0, async save() { this.saved++; }, ...extra };
}
const realFetch = global.fetch;
afterEach(() => { delete process.env.RESEND_API_KEY; global.fetch = realFetch; });

test('with no mail provider nothing is sent and nothing is stored', async () => {
    const user = fakeUser();
    expect(await verification.start(user)).toEqual({ sent: false, reason: 'not_configured' });
    expect(user.saved).toBe(0);
    expect(mailer.configured()).toBe(false);
});

test('a link is mailed, and only the hash of its token is kept', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let sent = null;
    global.fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body), auth: init.headers.authorization }; return { ok: true, json: async () => ({ id: 'm1' }) }; };
    const user = fakeUser();
    const r = await verification.start(user);
    expect(r.sent).toBe(true);
    expect(sent.url).toBe('https://api.resend.com/emails');
    expect(sent.body.to).toEqual(['tess@example.com']);
    const token = sent.body.text.match(/token=([A-Za-z0-9_-]+)/)[1];
    expect(user.emailVerification.tokenHash).toBe(verification.hash(token));
    expect(JSON.stringify(user.emailVerification)).not.toContain(token);
    // The name is escaped in the HTML version.
    expect(sent.body.html).toContain('Tess &lt;b&gt;');
    expect(sent.body.html).not.toContain('Tess <b>');
});

test('asking again within a minute sends nothing', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    global.fetch = async () => ({ ok: true, json: async () => ({}) });
    const user = fakeUser();
    await verification.start(user);
    expect(await verification.start(user)).toEqual({ sent: false, reason: 'too_soon' });
});

test('the link verifies once; a wrong, expired or reused one does not', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let text = '';
    global.fetch = async (url, init) => { text = JSON.parse(init.body).text; return { ok: true, json: async () => ({}) }; };
    const user = fakeUser({ emailVerified: false });
    await verification.start(user);
    const token = text.match(/token=([A-Za-z0-9_-]+)/)[1];
    const User = { findById: () => ({ select: async () => user }) };

    expect(await verification.finish(User, user._id, 'x'.repeat(43))).toBe('invalid');
    expect(user.emailVerified).toBe(false);
    expect(await verification.finish(User, user._id, token)).toBe('verified');
    expect(user.emailVerified).toBe(true);
    expect(await verification.finish(User, user._id, token)).toBe('already');

    const late = fakeUser({ emailVerified: false, emailVerification: { tokenHash: verification.hash(token), expiresAt: new Date(Date.now() - 1000) } });
    expect(await verification.finish({ findById: () => ({ select: async () => late }) }, late._id, token)).toBe('invalid');
    expect(await verification.finish(User, 'not-an-id', token)).toBe('invalid');
});
