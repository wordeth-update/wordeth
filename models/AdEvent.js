'use strict';

const mongoose = require('mongoose');

/**
 * Every impression and click actually counted, one row each.
 *
 * The unique index on (nonce, type) is what makes a ticket single-use: a
 * page that retries, or a script replaying a captured ticket, writes
 * nothing the second time. Rows expire on their own after an hour, which is
 * long past a ticket's life, so this stays small no matter the traffic.
 */
const adEventSchema = new mongoose.Schema({
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true, index: true },
    advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Advertiser', required: true, index: true },
    type: { type: String, enum: ['impression', 'click'], required: true },
    nonce: { type: String, required: true },
    slot: { type: String, default: null },
    viewer: { type: String, required: true, index: true },
    /** What this event cost the advertiser, in dollars. */
    charged: { type: Number, default: 0 },
    at: { type: Date, default: Date.now }
}, { timestamps: false });

adEventSchema.index({ nonce: 1, type: 1 }, { unique: true });
adEventSchema.index({ adId: 1, viewer: 1, type: 1, at: -1 });
adEventSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 });

module.exports = mongoose.models.AdEvent || mongoose.model('AdEvent', adEventSchema);
