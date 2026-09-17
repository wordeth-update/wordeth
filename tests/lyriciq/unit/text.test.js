const t = require('../../../src/lyriciq/utilities/text');

describe('text utilities', () => {
    test('normalizeText handles case, whitespace, punctuation, apostrophes and unicode', () => {
        expect(t.normalizeText('  Don’t   STOP, believin’!! ')).toBe('dont stop believin');
        expect(t.normalizeText("Don't")).toBe(t.normalizeText('Don’t'));
        expect(t.normalizeText('Café')).toBe('cafe');
        expect(t.normalizeText('ｆｕｌｌ')).toBe('full');
        expect(t.normalizeText(null)).toBe('');
    });
    test('stopwords and rhyme keys', () => {
        expect(t.isStopword('The')).toBe(true);
        expect(t.isStopword('rooftop')).toBe(false);
        expect(t.rhymeKey('tonight')).toBe(t.rhymeKey('light'));
        expect(t.rhymeKey('rooftop')).not.toBe(t.rhymeKey('light'));
    });
    test('edit distance and phrase containment', () => {
        expect(t.editDistance('kitten', 'sitting')).toBe(3);
        expect(t.editDistance('', 'abc')).toBe(3);
        expect(t.containsWholePhrase('walking through the city tonight', 'the city')).toBe(true);
        expect(t.containsWholePhrase('walking through the city tonight', 'cit')).toBe(false);
    });
});
