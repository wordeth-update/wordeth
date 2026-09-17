'use strict';

/**
 * Lyric IQ subsystem entry point. server.js calls `mount(app)` and, once Mongo
 * is connected, `bootstrap()`.
 */
const mongoose = require('mongoose');
const config = require('./config');
const { validateLyricIqEnv } = require('./config/env');
const logger = require('./utilities/logger');
const { createLyricIqRouter } = require('./routes');
const catalogService = require('./services/content/catalogService');
const sessionService = require('./services/game/sessionService');
const QuestionTemplate = require('./models/QuestionTemplate');
const { templates } = require('./engines/question/templates');

function mount(app, basePath = '/api') {
    app.use(basePath, createLyricIqRouter());
    return app;
}

/** Mirror code-defined templates into the database so they can be toggled. */
async function ensureTemplates() {
    for (const tpl of Object.values(templates)) {
        await QuestionTemplate.updateOne(
            { key: tpl.key },
            { $setOnInsert: { key: tpl.key, name: tpl.name, skill: tpl.skill, answerTypes: tpl.answerTypes, baseDifficulty: config.difficulty.templateBase[tpl.key] || 30, enabled: true } },
            { upsert: true }
        );
    }
}

let sweepTimer = null;

async function bootstrap({ exitOnFailure = process.env.NODE_ENV !== 'test' } = {}) {
    validateLyricIqEnv({ exitOnFailure });
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => {
            const done = () => resolve();
            mongoose.connection.once('connected', done);
            setTimeout(done, 15000);
        });
    }
    if (mongoose.connection.readyState !== 1) {
        logger.warn('bootstrap_skipped_no_database', {});
        return { ok: false };
    }
    await ensureTemplates();
    const catalog = await catalogService.ensureCatalog();
    logger.info('lyriciq_ready', { provider: config.provider.name, catalog });
    if (!sweepTimer && process.env.NODE_ENV !== 'test') {
        sweepTimer = setInterval(() => sessionService.expireStaleSessions().catch((err) => logger.error('sweep_failed', { message: err.message })), 5 * 60 * 1000);
        sweepTimer.unref();
    }
    return { ok: true, catalog };
}

function stop() {
    if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
}

module.exports = { mount, bootstrap, stop, ensureTemplates };
