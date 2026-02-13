const mongoose = require('mongoose');

const inkSoftSyncSchema = new mongoose.Schema({
    storeUrl: { type: String, required: true },
    lastPollAt: { type: Date, default: null },
    pollIntervalMinutes: { type: Number, default: 15 },
    enabled: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'paused', 'error', 'setup'], default: 'setup' },
    lastError: { type: String, default: null },
    lastErrorAt: { type: Date, default: null },
    stats: {
        totalOrdersSynced: { type: Number, default: 0 },
        totalItemsSynced: { type: Number, default: 0 },
        totalUnmatched: { type: Number, default: 0 },
        duplicatesSkipped: { type: Number, default: 0 },
        lastSyncDuration: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.model('InkSoftSync', inkSoftSyncSchema);
