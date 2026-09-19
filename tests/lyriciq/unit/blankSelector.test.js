const { selectBlank, scoreWord } = require('../../../src/lyriciq/engines/question/BlankSelector');
const { tokenizeLine, isStopword } = require('../../../src/lyriciq/utilities/text');

const rng = () => 0; // always pick the top candidate

describe('BlankSelector', () => {
    test('chooses a meaningful word, never a stopword', () => {
        const tokens = tokenizeLine('Walking through the city tonight');
        const blank = selectBlank(tokens, { mode: 'word', rng });
        expect(blank).toBeTruthy();
        expect(isStopword(blank.tokens[0].word)).toBe(false);
        expect(['walking', 'city', 'tonight']).toContain(blank.tokens[0].word);
    });
    test('stopwords score below content words', () => {
        const tokens = tokenizeLine('Running through the alley with a golden ticket');
        const the = scoreWord(tokens[2], 2, tokens);
        const golden = scoreWord(tokens[6], 6, tokens);
        expect(the.score).toBeLessThan(golden.score);
    });
    test('end mode hides the final word(s) and never ends on a bare stopword', () => {
        const tokens = tokenizeLine('Say my name like a secret in the wind');
        const blank = selectBlank(tokens, { mode: 'end', rng });
        expect(blank.start + blank.length).toBe(tokens.length);
        expect(isStopword(tokens[tokens.length - 1].word)).toBe(false);
        expect(selectBlank(tokenizeLine('walk into the room with me'), { mode: 'end', rng })).toBeNull();
    });
    test('phrase mode hides 2–3 words containing at least one content word', () => {
        const tokens = tokenizeLine('Trophies in the trunk beside the jumper cables');
        const blank = selectBlank(tokens, { mode: 'phrase', rng });
        expect(blank.length).toBeGreaterThanOrEqual(2);
        expect(blank.length).toBeLessThanOrEqual(3);
        expect(blank.tokens.some((tok) => !isStopword(tok.word))).toBe(true);
    });
    test('rejects lines that are too short', () => {
        expect(selectBlank(tokenizeLine('oh yeah'), { mode: 'word', rng })).toBeNull();
    });
    test('penalises words that would leak (repeated in the line)', () => {
        const tokens = tokenizeLine('Velvet hour, velvet hour, stay a little longer');
        const blank = selectBlank(tokens, { mode: 'word', rng });
        expect(['velvet', 'hour']).not.toContain(blank.tokens[0].word);
    });
});
