'use strict';

const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, required: true, default: false },
    description: { type: String, default: '' },
    updatedBy: { type: String, default: 'system' }
}, { timestamps: true });

module.exports = mongoose.models.FeatureFlag || mongoose.model('FeatureFlag', featureFlagSchema);
