const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['USER_FAN', 'DESIGNER', 'ARTIST', 'LABEL_ADMIN', 'LABEL_MANAGER', 'ADMIN'],
        default: 'USER_FAN',
        index: true
    },
    accountType: {
        type: String,
        enum: ['fan', 'designer', 'artist', 'label'],
        default: 'fan',
        index: true
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        default: null
    },
    creatorProfile: {
        displayName: { type: String, default: '' },
        handle: { type: String, default: '', lowercase: true, trim: true },
        genres: [{ type: String }],
        socialLinks: {
            instagram: { type: String, default: '' },
            twitter: { type: String, default: '' },
            spotify: { type: String, default: '' },
            youtube: { type: String, default: '' },
            website: { type: String, default: '' }
        },
        revenueShare: { type: Number, default: 0.85, min: 0, max: 1 },
        storageUsedBytes: { type: Number, default: 0 },
        templateCount: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 },
        totalSales: { type: Number, default: 0 },
        monthsActive: { type: Number, default: 0 },
        firstActiveAt: { type: Date, default: null }
    },
    labelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Label',
        default: null
    },
    entitlementOverrides: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    tokenBalance: {
        type: Number,
        default: 0,
        min: 0
    },
    tokenEarnings: {
        type: Number,
        default: 0,
        min: 0
    },
    bio: {
        type: String,
        default: ''
    },
    avatar: {
        type: String,
        default: 'assets/default-avatar.png'
    },
    searchHistory: [{
        songTitle: String,
        artist: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    customMerch: [{
        name: String,
        type: String,
        image: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    agreedToTerms: {
        type: Boolean,
        default: false
    },
    termsAgreedAt: {
        type: Date,
        default: null
    },
    termsVersion: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getPublicProfile = function() {
    return {
        _id: this._id,
        name: this.name,
        email: this.email,
        bio: this.bio || '',
        avatar: this.avatar || '',
        accountType: this.accountType || 'fan',
        role: this.role,
        createdAt: this.createdAt,
        creatorProfile: this.creatorProfile ? {
            displayName: this.creatorProfile.displayName,
            handle: this.creatorProfile.handle,
            genres: this.creatorProfile.genres,
            socialLinks: this.creatorProfile.socialLinks
        } : null
    };
};

userSchema.methods.getSensitiveProfile = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.__v;
    return obj;
};

module.exports = mongoose.model('User', userSchema); 