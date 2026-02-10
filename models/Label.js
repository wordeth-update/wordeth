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
        artistId: {
            type: String,
            required: true,
            unique: false
        },
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, lowercase: true, trim: true },
        imageUrl: { type: String, default: '' },
        genre: { type: String, default: '' },
        templateArtwork: [{
            url: { type: String, required: true },
            objectPath: { type: String, required: true },
            filename: { type: String, required: true },
            format: { type: String, enum: ['png', 'svg', 'pdf', 'eps', 'ai', 'psd'], required: true },
            fileSize: { type: Number, default: 0 },
            width: { type: Number, default: 0 },
            height: { type: Number, default: 0 },
            uploadedAt: { type: Date, default: Date.now }
        }],
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
