'use strict';

const mongoose = require('mongoose');

/**
 * What a tester told us after using the app.
 *
 * Written whether or not they were signed in: an opinion with no account
 * behind it is still worth having. When there is an account we keep the
 * link, because the useful question is rarely "what did they say" on its
 * own but "what did they say, and what were they doing at the time".
 */
const feedbackSchema = new mongoose.Schema({
    /** Set when the person was signed in; null for an anonymous reply. */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: { type: String, default: '', maxlength: 120 },
    email: { type: String, default: '', maxlength: 200, index: true },

    /** Which round of testing this belongs to, so one event can be read on its own. */
    event: { type: String, default: 'general', index: true, maxlength: 60 },

    device: { type: String, default: '', maxlength: 120 },
    network: { type: String, enum: ['wifi', 'cellular', 'both', 'unsure', ''], default: '' },

    /** Could the room hear people on stage, and when did it fail. */
    audioWorked: { type: String, enum: ['yes', 'mostly', 'no', 'did-not-try', ''], default: '' },
    audioDetail: { type: String, default: '', maxlength: 4000 },

    worstMoment: { type: String, default: '', maxlength: 4000 },
    bestMoment: { type: String, default: '', maxlength: 4000 },

    /** The question that actually matters: would they come back unprompted. */
    wouldReturn: { type: String, enum: ['yes', 'no', 'maybe', ''], default: '' },
    wouldReturnWhy: { type: String, default: '', maxlength: 4000 },

    anythingElse: { type: String, default: '', maxlength: 4000 },

    /** Captured rather than asked, so the answers stay short. */
    userAgent: { type: String, default: '', maxlength: 500 },
    createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: false });

feedbackSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
