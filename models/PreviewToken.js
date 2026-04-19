const mongoose = require('mongoose');

const previewTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: '' },
    ttlSeconds: { type: Number, required: true, min: 60, max: 60 * 60 * 24 * 365 },
    tokenExpiresAt: { type: Date, default: null, index: true },
    maxUses: { type: Number, default: 0, min: 0 },
    useCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
    revoked: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
}, { collection: 'preview_tokens' });

previewTokenSchema.methods.isUsable = function () {
    if (this.revoked) return false;
    if (this.tokenExpiresAt && this.tokenExpiresAt.getTime() < Date.now()) return false;
    if (this.maxUses > 0 && this.useCount >= this.maxUses) return false;
    return true;
};

module.exports = mongoose.model('PreviewToken', previewTokenSchema);
