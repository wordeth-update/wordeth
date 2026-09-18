'use strict';

const config = require('../../config');

/**
 * Splits a generated question into the public shape (safe for the client)
 * and the private answer key persisted server-side.
 */
function formatQuestion(generated, { expiresAt } = {}) {
    const t = generated.track;
    const trackPublic = {
        id: String(t._id),
        title: t.title,
        artist: t.artist,
        album: t.album || '',
        artwork: t.artwork || null,
        genre: t.primaryGenre,
        decade: t.decade,
        releaseYear: t.releaseYear,
        synthetic: !!t.synthetic
    };
    const revealTrack = generated.skill === 'RECALL'; // recall questions may show the song; recognition hides it
    return {
        template: generated.template,
        skill: generated.skill,
        answerType: generated.answerType,
        prompt: {
            kind: generated.prompt.kind,
            lines: generated.prompt.lines,
            instruction: generated.prompt.instruction,
            blankLength: generated.hiddenWordCount
        },
        choices: generated.answerType === 'MULTIPLE_CHOICE' ? generated.choices : [],
        difficulty: generated.difficulty,
        difficultyBand: generated.difficultyBand,
        trackId: t._id,
        trackPublic,
        revealTrack,
        answerKey: {
            canonical: generated.answer.canonical,
            accepted: generated.answer.accepted,
            choiceIndex: generated.answerType === 'MULTIPLE_CHOICE' ? generated.choiceIndex : null
        },
        questionVersion: 1,
        expiresAt: expiresAt || new Date(Date.now() + config.session.questionTtlMs),
        generation: generated.generation
    };
}

module.exports = { formatQuestion };
