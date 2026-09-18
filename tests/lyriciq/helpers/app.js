'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { createLyricIqRouter } = require('../../../src/lyriciq/routes');
const lyricIq = require('../../../src/lyriciq');
const catalogService = require('../../../src/lyriciq/services/content/catalogService');
const { cache } = require('../../../src/lyriciq/services/content/providerCache');
const { bank } = require('../../../src/lyriciq/engines/distractor/vocabularyBank');
const QuestionInstance = require('../../../src/lyriciq/models/QuestionInstance');
const User = require('../../../models/User');

function buildApp() {
    const app = express();
    app.use(express.json({ limit: '100kb' }));
    app.use('/api', createLyricIqRouter());
    return app;
}

/** Seed the synthetic catalog and templates. */
async function seed() {
    cache.clear();
    bank.clear();
    await lyricIq.ensureTemplates();
    await catalogService.seedSyntheticCatalog();
}

async function makeUser(name, extra = {}) {
    const user = await User.create({ name, email: `${name}@test.com`, password: 'password123', ...extra });
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return { user, token };
}

/** Read the private answer key directly (the API must never expose it). */
async function answerKeyFor(questionId) {
    const q = await QuestionInstance.findById(questionId).select('+answerKey').lean();
    return q.answerKey;
}

/** Build a correct or incorrect submission for a public question. */
async function submissionFor(question, { correct = true } = {}) {
    const key = await answerKeyFor(question.id);
    if (question.answerType === 'MULTIPLE_CHOICE') {
        if (correct) return { questionId: question.id, choiceIndex: key.choiceIndex };
        const wrong = question.choices.findIndex((c, i) => i !== key.choiceIndex);
        return { questionId: question.id, choiceIndex: wrong };
    }
    return { questionId: question.id, answer: correct ? key.canonical : 'zzzz-not-the-answer-zzzz' };
}

/** Assert a status and include the response body in the failure message. */
function expectStatus(res, status) {
    if (res.status !== status) throw new Error(`expected ${status} got ${res.status}: ${JSON.stringify(res.body)}`);
    return res;
}

module.exports = { buildApp, seed, makeUser, answerKeyFor, submissionFor, expectStatus, db };
