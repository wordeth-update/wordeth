const mongoose = require('mongoose');
const crypto = require('crypto');

const dashboardShareSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    labelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Label',
        required: true
    },
    scope: {
        type: String,
        enum: ['label', 'artist'],
        default: 'label'
    },
    artistSlug: {
        type: String,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PartnerUser',
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    permissions: {
        revenue: { type: Boolean, default: true },
        skuDetails: { type: Boolean, default: true },
        geoData: { type: Boolean, default: true }
    },
    accessCount: {
        type: Number,
        default: 0
    },
    active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

dashboardShareSchema.statics.generateToken = function() {
    return crypto.randomBytes(32).toString('hex');
};

module.exports = mongoose.model('DashboardShare', dashboardShareSchema);
