/** A picture stored as megabytes of base64 goes out as the short address that serves it. */
const { avatarRef } = require('../services/avatarRef');

test('a data URL becomes the address of the avatar endpoint', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(2_000_000);
    expect(avatarRef('698339b693034bdc0eccb926', big)).toBe('/api/user/avatar/698339b693034bdc0eccb926');
});

test('short values pass through: a path, a URL, the default', () => {
    expect(avatarRef('u1', 'assets/default-avatar.png')).toBe('assets/default-avatar.png');
    expect(avatarRef('u1', '/api/files/avatars/u1.jpg')).toBe('/api/files/avatars/u1.jpg');
    expect(avatarRef('u1', 'https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
});

test('nothing stored gives the fallback', () => {
    expect(avatarRef('u1', '')).toBe('');
    expect(avatarRef('u1', null, null)).toBeNull();
    expect(avatarRef('u1', undefined, 'assets/default-avatar.png')).toBe('assets/default-avatar.png');
});

test('an oversized value with nobody to attribute it to is dropped, never sent', () => {
    expect(avatarRef(null, 'data:image/png;base64,' + 'A'.repeat(5000), '')).toBe('');
});
