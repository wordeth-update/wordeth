const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
