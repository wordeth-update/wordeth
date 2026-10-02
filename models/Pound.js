'use strict';

const mongoose = require('mongoose');

/**
 * A pound: a person and a retailer, connected for a while.
 *
 * A dap up is between people and lasts. A pound is what a person gives a
 * retailer from an ad when they want to talk: it opens a conversation both
 * ways, and it is temporary by design. It ends on its own when its time
 * runs out, or the moment either side ends it, and once it has ended the
 * retailer can no longer write to that person or read the thread.
 *
 * Nothing sweeps these. "Active" is always computed — status active AND
 * not yet past expiresAt — so a pound is over at the instant it expires,
 * not whenever a job next runs.
 */
const poundSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Advertiser', required: true },
    /** The advertiser's chat account at the time; the other end of the thread. */
    retailerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** The ad the person opted in from. */
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', default: null },
    status: { type: String, enum: ['active', 'ended'], default: 'active' },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    endedBy: { type: String, enum: ['user', 'retailer', null], default: null }
}, { timestamps: true });

poundSchema.index({ userId: 1, retailerUserId: 1, status: 1 });

/** How long a pound lasts unless somebody ends it sooner. */
poundSchema.statics.HOURS = Number(process.env.POUND_HOURS) > 0 ? Number(process.env.POUND_HOURS) : 72;

/** The live pound between a person and a retailer account, in either order, or null. */
poundSchema.statics.between = function(a, b) {
    return this.findOne({
        status: 'active',
        expiresAt: { $gt: new Date() },
        $or: [{ userId: a, retailerUserId: b }, { userId: b, retailerUserId: a }]
    });
};

module.exports = mongoose.models.Pound || mongoose.model('Pound', poundSchema);
