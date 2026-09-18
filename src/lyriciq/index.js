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
const { createSharePagesRouter } = require('./routes/sharePages');
const cardRenderer = require('./services/share/cardRenderer');
const catalogService = require('./services/content/catalogService');
const sessionService = require('./services/game/sessionService');
const QuestionTemplate = require('./models/QuestionTemplate');
const { templates } = require('./engines/question/templates');

function mount(app, basePath = '/api') {
    app.use(basePath, createLyricIqRouter());
    app.use(createSharePagesRouter()); // /s/:id and /s/:id/card.png at the site root
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
let refreshTimer = null;

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
    // Keep the licensed catalog moving: new chart / genre tracks and warmed lyrics on a schedule.
    if (!refreshTimer && process.env.NODE_ENV !== 'test' && config.provider.name !== 'synthetic' && config.catalog.refreshHours > 0) {
        const every = Math.max(1, config.catalog.refreshHours) * 60 * 60 * 1000;
        refreshTimer = setInterval(() => catalogService.refreshCatalog().catch((err) => logger.error('catalog_refresh_failed', { message: err.message })), every);
        refreshTimer.unref();
        logger.info('catalog_refresh_scheduled', { everyHours: config.catalog.refreshHours });
    }
    return { ok: true, catalog };
}

function stop() {
    if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    cardRenderer.stop().catch(() => {});
}

module.exports = { mount, bootstrap, stop, ensureTemplates };
