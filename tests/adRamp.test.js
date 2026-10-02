/**
 * The on-ramp: a started or resumed ad climbs from a quarter of its weight
 * to all of it over a day, and equal-fit ads share a slot by bid × strength.
 */
const ramp = require('../services/adRamp');

const HOUR = 60 * 60 * 1000;
const now = Date.parse('2026-10-02T12:00:00Z');
const ad = (cpm, startedHoursAgo) => ({
    pricing: { cpm },
    ...(startedHoursAgo === null ? {} : { rampStartedAt: new Date(now - startedHoursAgo * HOUR) })
});

afterEach(() => { delete process.env.AD_RAMP_HOURS; });

test('an ad starts at a quarter strength and reaches full after a day', () => {
    expect(ramp.strength(ad(2, 0), now)).toBeCloseTo(0.25);
    expect(ramp.strength(ad(2, 12), now)).toBeCloseTo(0.625);
    expect(ramp.strength(ad(2, 24), now)).toBe(1);
    expect(ramp.strength(ad(2, 500), now)).toBe(1);
});

test('an ad from before on-ramps existed is at full strength', () => {
    expect(ramp.strength(ad(2, null), now)).toBe(1);
    expect(ramp.fullAt(ad(2, null), now)).toBeNull();
});

test('fullAt says when the climb ends, and nothing once it has', () => {
    expect(ramp.fullAt(ad(2, 6), now).getTime()).toBe(now + 18 * HOUR);
    expect(ramp.fullAt(ad(2, 30), now)).toBeNull();
});

test('an ad alone in a slot is always the one shown, however new', () => {
    const only = ad(2, 0);
    for (const r of [0, 0.5, 0.999]) expect(ramp.share([only], now, () => r)).toBe(only);
});

test('equal bids: a just-resumed ad gets a fifth of the slot against an established one', () => {
    const established = ad(2, 100), resumed = ad(2, 0);
    // weights 2 and 0.5: the resumed ad owns the last fifth of the draw
    expect(ramp.share([established, resumed], now, () => 0.79)).toBe(established);
    expect(ramp.share([established, resumed], now, () => 0.81)).toBe(resumed);
});

test('once both are established the slot is shared by bid', () => {
    const three = ad(3, 100), one = ad(1, 100);
    expect(ramp.share([three, one], now, () => 0.74)).toBe(three);
    expect(ramp.share([three, one], now, () => 0.76)).toBe(one);
});

test('a house ad at no bid gives way almost entirely to a paid one, and still rotates among house ads', () => {
    const house = ad(0, 100), paid = ad(2, 100), house2 = ad(0, 100);
    expect(ramp.weight(house, now) / (ramp.weight(house, now) + ramp.weight(paid, now))).toBeLessThan(0.01);
    expect(ramp.share([house, house2], now, () => 0.49)).toBe(house);
    expect(ramp.share([house, house2], now, () => 0.51)).toBe(house2);
});

test('AD_RAMP_HOURS=0 switches the on-ramp off', () => {
    process.env.AD_RAMP_HOURS = '0';
    expect(ramp.strength(ad(2, 0), now)).toBe(1);
});
