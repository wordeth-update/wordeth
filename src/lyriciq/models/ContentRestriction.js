'use strict';

const mongoose = require('mongoose');

/**
 * Content safety switch. A restriction removes matching content from gameplay
 * without a deploy. `value` semantics depend on `type`:
 *   TRACK      → Track _id
 *   ARTIST     → artistKey (slug)
 *   ALBUM      → album title slug
 *   PROVIDER   → provider name
 *   TERRITORY  → ISO country code (matched against request territory)
 *   GAME_MODE  → game mode key (disables the mode)
 *   EXPLICIT   → 'true' disables all explicit tracks
 * `gameModes` optionally narrows the restriction to specific modes.
 */
const contentRestrictionSchema = new mongoose.Schema({
    type: { type: String, enum: ['TRACK', 'ARTIST', 'ALBUM', 'PROVIDER', 'TERRITORY', 'GAME_MODE', 'EXPLICIT'], required: true },
    value: { type: String, required: true, trim: true },
    gameModes: { type: [String], default: [] },
    reason: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: String, default: 'system' }
}, { timestamps: true });

contentRestrictionSchema.index({ type: 1, value: 1 }, { unique: true });

module.exports = mongoose.models.ContentRestriction || mongoose.model('ContentRestriction', contentRestrictionSchema);
