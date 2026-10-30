describe('the press', () => {
    const load = (v) => { jest.resetModules(); if (v === undefined) delete process.env.MERCH_ORDERING; else process.env.MERCH_ORDERING = v; return require('../services/press'); };
    afterAll(() => { delete process.env.MERCH_ORDERING; });
    test('is closed unless the setting says on', () => {
        expect(load(undefined).isOpen()).toBe(false);
        expect(load('off').isOpen()).toBe(false);
        expect(load('on').isOpen()).toBe(true);
        expect(load('true').isOpen()).toBe(true);
    });
});
