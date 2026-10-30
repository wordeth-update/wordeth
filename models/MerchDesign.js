const mongoose = require('mongoose');

/**
 * A design someone saved before the press opened (or any time after).
 * The views are the same Fabric JSON an order carries, so a saved design
 * becomes an order with nothing redrawn. The preview is a file in storage,
 * keyed by the account so it goes when the account does.
 */
const merchDesignSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    product: { type: String, required: true },
    color: { type: String, required: true },
    size: { type: String, default: 'M' },
    templateId: { type: String, default: null },
    artistName: { type: String, default: null },
    frontDesign: { type: String, default: '' },
    backDesign: { type: String, default: '' },
    leftDesign: { type: String, default: '' },
    rightDesign: { type: String, default: '' },
    previewUrl: { type: String, default: '' },
}, { timestamps: true });

merchDesignSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('MerchDesign', merchDesignSchema);
