const card = require('../services/inviteCard');

describe('the invite card', () => {
    test('wears the look the app gives the same room', () => {
        // The app hashes the id the same way, so these must never drift.
        const h = (id) => { let x = 0; for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) >>> 0; return card.LOOKS[x % 6]; };
        for (const id of ['room0', 'AbCd1234_eFgHiJkLmN', 'x', '']) expect(card.lookFor(id)).toBe(h(id));
    });
    test('escapes the room name, keeps the emoji, and shows the host and the door', () => {
        const html = card.html({ roomId: 'room3', roomName: '<b>Writing</b> 🔥', hostName: 'Cal & Co', participantCount: 12, tokenPrice: 10, participants: [{ userName: 'Cal & Co', isHost: true }] });
        expect(html).toContain('&lt;b&gt;Writing&lt;/b&gt;');
        expect(html).toContain('<span class="emoji">🔥</span>');
        expect(html).toContain('HOSTED BY CAL &amp; CO');
        expect(html).toContain('10 TOKENS');
        expect(html).toContain("@font-face{font-family:'Shrikhand'");
    });
});
