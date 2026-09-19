const express = require('express');
const request = require('supertest');
const { createPlayHostMiddleware } = require('../../../src/lyriciq/middleware/playHost');
const { setAuthCookie, clearAuthCookie } = require('../../../services/authCookie');

function appWith(opts) {
    const app = express();
    app.use(createPlayHostMiddleware(opts));
    app.get('/lyric-iq.html', (req, res) => res.send('GAME' + (req.isPlayHost ? ':play' : ':main') + ' ' + (req.query.challenge || '')));
    app.get('/', (req, res) => res.send('HOME'));
    app.get('/api/health', (req, res) => res.send('OK'));
    return app;
}

describe('play.wordeth.com front door', () => {
    test('serves the game at / on the play host and the site home elsewhere', async () => {
        const app = appWith({ playHost: 'play.wordeth.com', redirect: true });
        expect((await request(app).get('/').set('Host', 'play.wordeth.com')).text).toBe('GAME:play ');
        expect((await request(app).get('/play').set('Host', 'play.wordeth.com')).text).toBe('GAME:play ');
        expect((await request(app).get('/').set('Host', 'wordeth.com')).text).toBe('HOME');
        expect((await request(app).get('/').set('Host', 'www.wordeth.com')).text).toBe('HOME');
    });
    test('keeps the query string (challenge links) and the API on both hosts', async () => {
        const app = appWith({ playHost: 'play.wordeth.com', redirect: true });
        expect((await request(app).get('/?challenge=abc').set('Host', 'play.wordeth.com')).text).toBe('GAME:play abc');
        expect((await request(app).get('/api/health').set('Host', 'play.wordeth.com')).text).toBe('OK');
    });
    test('/play on the main site redirects to the play host in production', async () => {
        const app = appWith({ playHost: 'play.wordeth.com', redirect: true });
        const res = await request(app).get('/play?challenge=x').set('Host', 'wordeth.com');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('https://play.wordeth.com/?challenge=x');
    });
    test('/play serves the page directly when no play host is configured (local dev)', async () => {
        const app = appWith({ playHost: '', redirect: false });
        expect((await request(app).get('/play').set('Host', 'localhost:5000')).text).toBe('GAME:main ');
        expect((await request(app).get('/').set('Host', 'play.localhost:5000')).text).toBe('GAME:play ');
    });
    test('host matching ignores port and case', async () => {
        const app = appWith({ playHost: 'Play.Wordeth.com', redirect: true });
        expect((await request(app).get('/').set('Host', 'PLAY.wordeth.com:443')).text).toBe('GAME:play ');
    });
});

describe('shared auth cookie', () => {
    const original = process.env.AUTH_COOKIE_DOMAIN;
    afterEach(() => { if (original === undefined) delete process.env.AUTH_COOKIE_DOMAIN; else process.env.AUTH_COOKIE_DOMAIN = original; });
    function fakeRes() { const calls = []; return { calls, cookie: (n, v, o) => calls.push(['set', n, v, o]), clearCookie: (n, o) => calls.push(['clear', n, o]) }; }
    test('does nothing without AUTH_COOKIE_DOMAIN', () => {
        delete process.env.AUTH_COOKIE_DOMAIN;
        const res = fakeRes();
        expect(setAuthCookie(res, 't')).toBe(false);
        expect(clearAuthCookie(res)).toBe(false);
        expect(res.calls).toHaveLength(0);
    });
    test('sets and clears a domain-scoped, SameSite=Lax cookie when configured', () => {
        process.env.AUTH_COOKIE_DOMAIN = '.wordeth.com';
        const res = fakeRes();
        expect(setAuthCookie(res, 'jwt')).toBe(true);
        expect(res.calls[0]).toEqual(['set', 'wordeth_token', 'jwt', expect.objectContaining({ domain: '.wordeth.com', path: '/', sameSite: 'lax', httpOnly: false, maxAge: 7 * 24 * 60 * 60 * 1000 })]);
        expect(clearAuthCookie(res)).toBe(true);
        expect(res.calls[1][0]).toBe('clear');
    });
});
