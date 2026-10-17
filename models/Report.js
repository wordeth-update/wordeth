const mongoose = require('mongoose');

/**
 * Somebody saying something is wrong: a person, a message, a room, a
 * photo, a replay. Reviewed by Wordeth and acted on within a day, which
 * the terms promise and the store requires.
 */
const reportSchema = new mongoose.Schema({
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: ['user', 'message', 'room', 'photo', 'replay'], required: true },
    targetId: { type: String, default: '' },
    /** The account responsible, when known: the sender, the host, the owner of the photo. */
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reason: { type: String, enum: ['harassment', 'hate', 'sexual', 'violence', 'spam', 'impersonation', 'other'], required: true },
    details: { type: String, default: '', maxlength: 1000 },
    /** What was said, captured at the time, so it can be judged after deletion. */
    excerpt: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open', index: true },
    action: { type: String, default: '' },
    note: { type: String, default: '' },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
