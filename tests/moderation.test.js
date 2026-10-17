const { cleanText, suspension } = require('../services/moderation');

describe('the word filter', () => {
    test('masks slurs and threats as whole words, keeps the rest', () => {
        const r = cleanText('yo KYS and go, said the sniggering spic');
        expect(r.flagged).toBe(true);
        expect(r.text).toBe('yo K** and go, said the sniggering s***');
    });
    test('leaves ordinary talk, and swearing, alone', () => {
        const r = cleanText('that verse was fucking fire, no cap');
        expect(r.flagged).toBe(false);
        expect(r.text).toBe('that verse was fucking fire, no cap');
    });
    test('matches a phrase across spacing', () => {
        expect(cleanText('kill   yourself').flagged).toBe(true);
        expect(cleanText('skill yourself').flagged).toBe(false);
    });
});

describe('suspension', () => {
    test('none, a date, or closed for good', () => {
        expect(suspension({})).toBeNull();
        expect(suspension({ suspendedUntil: new Date(Date.now() - 1000) })).toBeNull();
        expect(suspension({ suspendedUntil: new Date(Date.now() + 86400000) })).toMatch(/suspended until/);
        expect(suspension({ suspendedUntil: new Date('2999-01-01') })).toMatch(/closed/);
    });
});
