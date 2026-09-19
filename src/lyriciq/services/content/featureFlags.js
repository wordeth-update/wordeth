'use strict';

const mongoose = require('mongoose');
const FeatureFlag = require('../../models/FeatureFlag');
const config = require('../../config');
const { cache } = require('./providerCache');

const KEY = 'all';

/** Merge code defaults with database overrides (cached briefly). */
async function getFlags() {
    const hit = cache.get('featureFlags', KEY);
    if (hit) return hit;
    const flags = { ...config.featureFlags.defaults };
    if (mongoose.connection.readyState === 1) {
        const docs = await FeatureFlag.find({}).lean();
        for (const d of docs) flags[d.key] = !!d.enabled;
    }
    cache.set('featureFlags', KEY, flags);
    return flags;
}

async function isEnabled(key) {
    const flags = await getFlags();
    return flags[key] !== false;
}

async function setFlag(key, enabled, { updatedBy = 'system', description } = {}) {
    const update = { $set: { enabled: !!enabled, updatedBy } };
    if (description !== undefined) update.$set.description = description;
    const doc = await FeatureFlag.findOneAndUpdate({ key }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
    cache.del('featureFlags', KEY);
    return doc;
}

function invalidate() { cache.del('featureFlags', KEY); }

/** Game mode → flag key. QUICK_PLAY has no flag: it is the product. */
const MODE_FLAGS = { DAILY_10: 'dailyChallenge', RAPID_FIRE: 'rapidFire', STREAK: 'streakMode' };

module.exports = { getFlags, isEnabled, setFlag, invalidate, MODE_FLAGS };
