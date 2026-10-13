const t = require('../services/tokenPacks');

describe('token packs', () => {
    test('every pack is findable by id and by store product id, and carries dollars and cents', () => {
        for (const p of t.TOKEN_PACKS) {
            expect(t.packById(p.id)).toBe(p);
            expect(t.packByProductId(p.storeProductId)).toBe(p);
            expect(p.price).toBeCloseTo(p.priceCents / 100, 2);
        }
    });
    test('retired packs still credit by product id but are not for sale', () => {
        expect(t.packByProductId('com.wordeth.app.tokens.100').tokens).toBe(100);
        expect(t.packById('pack_100')).toBeNull();
        expect(t.publicPacks().map((p) => p.id)).not.toContain('pack_100');
    });
    test('price per token falls as the pack grows', () => {
        const per = t.TOKEN_PACKS.map((p) => p.priceCents / p.tokens);
        for (let i = 1; i < per.length; i++) expect(per[i]).toBeLessThan(per[i - 1]);
    });
    test('the payout floor is $25, 834 tokens at 3 cents', () => {
        expect(t.CASHOUT_RATE).toBe(0.03);
        expect(t.MIN_PAYOUT_TOKENS).toBe(834);
        expect(t.dollarsFor(834)).toBe(25.02);
    });
});
