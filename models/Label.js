const mongoose = require('mongoose');

const labelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    logoUrl: {
        type: String,
        default: ''
    },
    artists: [{
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, lowercase: true, trim: true },
        imageUrl: { type: String, default: '' },
        genre: { type: String, default: '' },
        active: { type: Boolean, default: true }
    }],
    revenueShare: {
        type: Number,
        default: 0.15,
        min: 0,
        max: 1
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    contactEmail: {
        type: String,
        trim: true,
        lowercase: true
    }
}, {
    timestamps: true
});

labelSchema.index({ slug: 1 });

module.exports = mongoose.model('Label', labelSchema);
