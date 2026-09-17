const { evaluateAnswer } = require('../../../src/lyriciq/services/game/answerService');

const typed = (canonical, accepted) => ({ answerType: 'TYPED', answerKey: { canonical, accepted: accepted || [canonical.toLowerCase()] }, choices: [] });

describe('answer evaluation', () => {
    test('case, whitespace, punctuation, apostrophes and unicode are normalised', () => {
        expect(evaluateAnswer(typed('Tonight'), { answer: '  TONIGHT!! ' }).correct).toBe(true);
        expect(evaluateAnswer(typed("Don't stop", ['dont stop']), { answer: 'Don’t   Stop' }).correct).toBe(true);
        expect(evaluateAnswer(typed('Café', ['cafe']), { answer: 'cafe' }).correct).toBe(true);
        const r = evaluateAnswer(typed('Tonight'), { answer: '  TONIGHT!! ' });
        expect(r.normalizedInput).toBe('tonight');
        expect(r.canonicalAnswer).toBe('Tonight');
    });
    test('incorrect, empty and materially different answers are rejected', () => {
        expect(evaluateAnswer(typed('tonight'), { answer: 'today' }).correct).toBe(false);
        expect(evaluateAnswer(typed('tonight'), { answer: '' }).matchType).toBe('EMPTY');
        expect(evaluateAnswer(typed('tonight'), {}).correct).toBe(false);
        expect(evaluateAnswer(typed('city'), { answer: 'cite' }).correct).toBe(false); // short words: exact only
        expect(evaluateAnswer(typed('rooftop'), { answer: 'roof' }).correct).toBe(false);
    });
    test('small typos on longer words are tolerated, but not a distractor', () => {
        expect(evaluateAnswer(typed('rooftop'), { answer: 'rooftip' }).matchType).toBe('FUZZY');
        expect(evaluateAnswer(typed('streetlight'), { answer: 'streetligt' }).correct).toBe(true);
        expect(evaluateAnswer(typed('streetlight'), { answer: 'streetlite' }).correct).toBe(false); // three edits is a different spelling
        const withChoices = { ...typed('rooftop'), choices: ['rooftop', 'rooftops', 'hilltop', 'laptop'] };
        expect(evaluateAnswer(withChoices, { answer: 'rooftops' }).correct).toBe(false);
    });
    test('multiple choice accepts an index or the choice text', () => {
        const q = { answerType: 'MULTIPLE_CHOICE', answerKey: { canonical: 'city', choiceIndex: 2 }, choices: ['river', 'alley', 'city', 'valley'] };
        expect(evaluateAnswer(q, { choiceIndex: 2 }).correct).toBe(true);
        expect(evaluateAnswer(q, { choiceIndex: 1 }).correct).toBe(false);
        expect(evaluateAnswer(q, { choiceIndex: 9 }).choiceIndex).toBeNull();
        expect(evaluateAnswer(q, { answer: 'City' }).correct).toBe(true);
    });
});
