const { validateQuestion, BLANK_MARKER } = require('../../../src/lyriciq/engines/validation/QuestionValidator');

const base = () => ({
    template: 'MISSING_WORD', answerType: 'MULTIPLE_CHOICE',
    prompt: { kind: 'BLANK', lines: [`Walking through the ${BLANK_MARKER} tonight`] },
    answer: { canonical: 'city', accepted: ['city'] },
    choices: ['city', 'river', 'alley', 'valley'], choiceIndex: 0,
    track: { _id: 't1' }, eligibility: { eligible: true }
});

describe('validateQuestion', () => {
    test('accepts a well-formed question', () => {
        expect(validateQuestion(base())).toEqual({ valid: true, reasons: [] });
    });
    test('rejects malformed prompts', () => {
        const q = base(); q.prompt.lines = [];
        expect(validateQuestion(q).reasons).toContain('PROMPT_MALFORMED');
        const q2 = base(); q2.prompt.lines = ['no blank here at all'];
        expect(validateQuestion(q2).reasons).toContain('PROMPT_MISSING_BLANK');
    });
    test('rejects empty answers', () => {
        const q = base(); q.answer.canonical = '  ';
        expect(validateQuestion(q).reasons).toContain('ANSWER_EMPTY');
    });
    test('rejects answers visible in the prompt', () => {
        const q = base(); q.prompt.lines = [`Walking through the ${BLANK_MARKER} city tonight`];
        expect(validateQuestion(q).reasons).toContain('ANSWER_IN_PROMPT');
        const song = base(); song.template = 'GUESS_THE_SONG'; song.prompt = { kind: 'EXCERPT', lines: ['Neon rooftop keep me till the morning'] }; song.answer = { canonical: 'Neon Rooftop' }; song.choices = ['Neon Rooftop', 'a', 'b', 'c']; 
        expect(validateQuestion(song).reasons).toContain('ANSWER_IN_PROMPT');
    });
    test('rejects duplicate distractors and distractors equal to the answer', () => {
        const q = base(); q.choices = ['city', 'river', 'river', 'valley'];
        expect(validateQuestion(q).reasons).toContain('DISTRACTOR_DUPLICATE');
        const q2 = base(); q2.choices = ['city', 'City', 'alley', 'valley'];
        const r = validateQuestion(q2).reasons;
        expect(r).toContain('DISTRACTOR_EQUALS_ANSWER');
    });
    test('rejects wrong choice counts and bad choice index', () => {
        const q = base(); q.choices = ['city', 'river'];
        expect(validateQuestion(q).reasons).toContain('CHOICE_COUNT_INVALID');
        const q2 = base(); q2.choiceIndex = 2;
        expect(validateQuestion(q2).reasons).toContain('CHOICE_INDEX_INVALID');
    });
    test('rejects trivial blanks', () => {
        const q = base(); q.prompt.lines = [`Walking through ${BLANK_MARKER} city tonight`]; q.answer = { canonical: 'the' }; q.choices = ['the', 'a', 'an', 'my'];
        expect(validateQuestion(q).reasons).toContain('BLANK_TRIVIAL');
    });
    test('rejects ambiguous questions where a distractor appears in the prompt', () => {
        const q = base(); q.choices = ['city', 'tonight', 'alley', 'valley'];
        expect(validateQuestion(q).reasons).toContain('QUESTION_AMBIGUOUS');
    });
    test('rejects unusable excerpts and restricted tracks', () => {
        const q = base(); q.prompt.lines = [`${BLANK_MARKER} yeah`];
        expect(validateQuestion(q).reasons).toContain('EXCERPT_UNUSABLE');
        const q2 = base(); q2.eligibility = { eligible: false, reason: 'ARTIST_RESTRICTED' };
        expect(validateQuestion(q2).reasons).toContain('TRACK_RESTRICTED');
        const q3 = base(); q3.prompt.lines = ['a', 'b', 'c'];
        expect(validateQuestion(q3).reasons).toContain('EXCERPT_TOO_LONG');
    });
    test('typed answers may not be long phrases', () => {
        const q = base(); q.answerType = 'TYPED'; q.choices = []; q.answer = { canonical: 'one two three four' };
        expect(validateQuestion(q).reasons).toContain('ANSWER_TOO_LONG_FOR_TYPED');
    });
});
