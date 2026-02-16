const mongoose = require('mongoose');

const sponsorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logoUrl: { type: String, default: '' },
    ctaUrl: { type: String, default: '' },
    ctaText: { type: String, default: 'Learn More' },
    category: {
        type: String,
        enum: ['brand', 'label', 'media', 'tech', 'lifestyle', 'other'],
        default: 'brand'
    },
    audioStingUrl: { type: String, default: '' },
    audioStingDurationMs: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    contactEmail: { type: String, default: '' },
    notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Sponsor', sponsorSchema);
