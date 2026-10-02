/**
 * The relevance rule for ads in the app, without a database: what counts as
 * a fit, what a run-of-app ad is, and that a targeted ad never shows where
 * nothing about the moment or the person matches it.
 */
const { score, fits, normalise, interestsOf } = require('../services/appAds');

const ad = (keywords) => ({ keywords });
const none = normalise('');

test('a keyword fits as whole words, not as a fragment', () => {
    const ctx = normalise('Get Money — Lil Baby');
    expect(fits('lil baby', ctx)).toBe(true);
    expect(fits('money', ctx)).toBe(true);
    expect(fits('mon', ctx)).toBe(false);
    expect(fits('baby boy', ctx)).toBe(false);
});

test('punctuation and case do not hide a fit', () => {
    expect(fits('T.I.', normalise('whatever you like t.i.'))).toBe(true);
    expect(fits('Jay-Z', normalise('JAY-Z – Empire State'))).toBe(true);
});

test('what is on screen counts double what the person looked up', () => {
    const onScreen = score(ad(['sneakers']), normalise('sneakers room'), none);
    const inHistory = score(ad(['sneakers']), normalise('late night verses'), normalise('Sneakers Remix'));
    expect(onScreen).toBe(2);
    expect(inHistory).toBe(1);
});

test('a targeted ad with no fit is not shown at all', () => {
    expect(score(ad(['ice cream', 'dessert']), normalise('Get Money Lil Baby'), normalise('Superman Eminem'))).toBe(-1);
});

test('an ad with no keywords is run-of-app: eligible everywhere, and outranked by any fit', () => {
    expect(score(ad([]), normalise('anything'), none)).toBe(0);
    expect(score(ad(['money']), normalise('Get Money'), none)).toBeGreaterThan(0);
});

test('common words are not interests', () => {
    expect(fits('the', normalise('the way you move'))).toBe(false);
    expect(fits('feat', normalise('superman feat dina rae'))).toBe(false);
});

test('interests come from the songs and artists somebody opened', () => {
    const text = interestsOf({ searchHistory: [{ songTitle: 'Money', artist: 'Lil Baby' }, { songTitle: 'Superman', artist: 'Eminem' }] });
    expect(fits('eminem', normalise(text))).toBe(true);
    expect(interestsOf(null)).toBe('');
});
