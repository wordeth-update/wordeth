const mongoose = require('mongoose');

const designTemplateSchema = new mongoose.Schema({
    templateId: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    designerName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    designerEmail: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 200
    },
    uploadToken: {
        type: String,
        default: ''
    },
    designerUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    genre: {
        type: String,
        required: true,
        trim: true
    },
    artistName: {
        type: String,
        trim: true,
        default: ''
    },
    artistId: {
        type: String,
        default: ''
    },
    labelName: {
        type: String,
        trim: true,
        default: ''
    },
    labelId: {
        type: String,
        default: ''
    },
    albumName: {
        type: String,
        trim: true,
        maxlength: 150,
        default: ''
    },
    songTitle: {
        type: String,
        trim: true,
        maxlength: 150,
        default: ''
    },
    lyricsSnippet: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    },
    products: [{
        type: String,
        enum: ['tshirt', 'hoodie', 'tank', 'longsleeve', 'sweatshirt', 'hat']
    }],
    defaultProduct: {
        type: String,
        enum: ['tshirt', 'hoodie', 'tank', 'longsleeve', 'sweatshirt', 'hat'],
        default: 'tshirt'
    },
    defaultColor: {
        type: String,
        default: 'black'
    },
    frontDesign: {
        type: String,
        required: true
    },
    backDesign: {
        type: String,
        default: null
    },
    leftDesign: {
        type: String,
        default: null
    },
    rightDesign: {
        type: String,
        default: null
    },
    previewImageUrl: {
        type: String,
        default: ''
    },
    previewObjectPath: {
        type: String,
        default: ''
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'archived'],
        default: 'pending'
    },
    featured: {
        type: Boolean,
        default: false
    },
    featuredAt: {
        type: Date,
        default: null
    },
    activatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    activatedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    salesCount: {
        type: Number,
        default: 0
    },
    weekSalesCount: {
        type: Number,
        default: 0
    },
    weekSalesResetAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

designTemplateSchema.index({ status: 1, createdAt: -1 });
designTemplateSchema.index({ genre: 1, status: 1 });
designTemplateSchema.index({ artistName: 1, status: 1 });
designTemplateSchema.index({ labelName: 1, status: 1 });
designTemplateSchema.index({ featured: 1, status: 1 });
designTemplateSchema.index({ uploadToken: 1 });
designTemplateSchema.index({ templateId: 1 });
designTemplateSchema.index({ weekSalesCount: -1, status: 1 });

module.exports = mongoose.model('DesignTemplate', designTemplateSchema);
