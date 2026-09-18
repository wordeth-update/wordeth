'use strict';

const mongoose = require('mongoose');
const ContentRestriction = require('../../models/ContentRestriction');
const { cache } = require('./providerCache');
const { buildRestrictionSnapshot, emptyRestrictions } = require('./eligibility');
const logger = require('../../utilities/logger');

const SNAPSHOT_KEY = 'snapshot';

/** Returns the cached restriction snapshot, refreshing from Mongo when stale. */
async function getSnapshot() {
    const hit = cache.get('restrictions', SNAPSHOT_KEY);
    if (hit) return hit;
    if (mongoose.connection.readyState !== 1) return emptyRestrictions();
    const docs = await ContentRestriction.find({ active: true }).lean();
    const snapshot = buildRestrictionSnapshot(docs);
    cache.set('restrictions', SNAPSHOT_KEY, snapshot);
    return snapshot;
}

function invalidate() {
    cache.del('restrictions', SNAPSHOT_KEY);
}

async function addRestriction({ type, value, gameModes = [], reason = '', createdBy = 'system' }) {
    const doc = await ContentRestriction.findOneAndUpdate(
        { type, value: String(value) },
        { $set: { active: true, gameModes, reason, createdBy } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    invalidate();
    logger.event('content_restricted', { type, value: String(value), gameModes, reason, createdBy });
    return doc;
}

async function removeRestriction({ type, value }) {
    const doc = await ContentRestriction.findOneAndUpdate(
        { type, value: String(value) },
        { $set: { active: false } },
        { new: true }
    );
    invalidate();
    return doc;
}

module.exports = { getSnapshot, invalidate, addRestriction, removeRestriction };
