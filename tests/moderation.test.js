const { suspension } = require('../services/moderation');

/** The filter module reads WORD_FILTER when it loads, so each case loads it fresh. */
function filterWith(env) {
    jest.resetModules();
    const before = process.env.WORD_FILTER;
    if (env === undefined) delete process.env.WORD_FILTER; else process.env.WORD_FILTER = env;
    const { cleanText } = require('../services/moderation');
    if (before === undefined) delete process.env.WORD_FILTER; else process.env.WORD_FILTER = before;
    return cleanText;
}

describe('the word filter', () => {
    test('is off by default: what is said goes through as said', () => {
        const cleanText = filterWith(undefined);
        const r = cleanText('yo KYS and go, said the sniggering spic');
        expect(r.flagged).toBe(false);
        expect(r.text).toBe('yo KYS and go, said the sniggering spic');
    });
    test('switched on, masks slurs and threats as whole words and keeps the rest', () => {
        const cleanText = filterWith('on');
        const r = cleanText('yo KYS and go, said the sniggering spic');
        expect(r.flagged).toBe(true);
        expect(r.text).toBe('yo K** and go, said the sniggering s***');
        expect(cleanText('that verse was fucking fire, no cap').flagged).toBe(false);
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
