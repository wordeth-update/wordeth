const { yearlyPrice, priceFor } = require('../services/planPrice');

describe('plan prices', () => {
    test('a plan with its own yearly price has one', () => {
        expect(yearlyPrice({ priceMonthly: 3.99, priceYearly: 39 })).toBe(39);
        expect(priceFor({ priceMonthly: 3.99, priceYearly: 39 }, 'yearly')).toBe(39);
        expect(priceFor({ priceMonthly: 3.99, priceYearly: 39 }, 'monthly')).toBe(3.99);
    });
    test('a plan stored with a yearly price of zero is not sold by the year', () => {
        expect(yearlyPrice({ priceMonthly: 199, priceYearly: 0 })).toBeNull();
        expect(priceFor({ priceMonthly: 199, priceYearly: 0 }, 'yearly')).toBeNull();
        expect(priceFor({ priceMonthly: 199, priceYearly: 0 }, 'monthly')).toBe(199);
    });
    test('a free plan has no price either way', () => {
        expect(priceFor({ priceMonthly: 0, priceYearly: 0 }, 'monthly')).toBeNull();
        expect(priceFor(null, 'yearly')).toBeNull();
    });
});
