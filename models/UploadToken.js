const mongoose = require('mongoose');
const crypto = require('crypto');

const uploadTokenSchema = new mongoose.Schema({
    tokenHash: {
        type: String,
        required: true,
        unique: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    maxUses: {
        type: Number,
        default: 50
    },
    usedCount: {
        type: Number,
        default: 0
    },
    revoked: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

uploadTokenSchema.index({ tokenHash: 1 });

uploadTokenSchema.statics.hashToken = function(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = mongoose.model('UploadToken', uploadTokenSchema);
