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
        enum: ['USER_FAN', 'DESIGNER', 'ARTIST', 'CREATOR', 'LABEL_ADMIN', 'LABEL_MANAGER', 'ADMIN'],
        default: 'USER_FAN',
        index: true
    },
    accountType: {
        type: String,
        enum: ['fan', 'designer', 'artist', 'creator', 'label'],
        default: 'fan',
        index: true
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        default: null
    },
    customerAudience: {
        type: String,
        enum: ['USER', 'USER_PLUS'],
        default: 'USER',
        index: true
    },
    customerAccess: {
        activeUserSeconds: { type: Number, default: 0, min: 0 },
        lastHeartbeatAt: { type: Date, default: null },
        wildcardStatus: {
            type: String,
            enum: ['locked', 'available', 'active', 'used'],
            default: 'locked'
        },
        wildcardGrantedAt: { type: Date, default: null },
        wildcardRoomId: { type: String, default: '' },
        wildcardStartedAt: { type: Date, default: null },
        wildcardExpiresAt: { type: Date, default: null },
        wildcardUsedAt: { type: Date, default: null },
        wildcardEmailStatus: {
            type: String,
            enum: ['none', 'pending', 'sent', 'failed'],
            default: 'none'
        },
        wildcardEmailEventId: { type: String, default: '' }
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
    creatorRating: {
        average: { type: Number, default: 0 },
        count: { type: Number, default: 0 }
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
    roomHistory: [{
        roomId: { type: String, required: true },
        roomName: { type: String, default: '' },
        hostName: { type: String, default: '' },
        hostId: { type: String, default: '' },
        tokenPrice: { type: Number, default: 0 },
        joinedAt: { type: Date, default: Date.now }
    }],
    showRoomHistory: {
        type: Boolean,
        default: false
    },
    extendedBio: {
        type: String,
        default: '',
        maxlength: 2000
    },
    profilePhotos: [{
        url: { type: String, required: true },
        caption: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now }
    }],
    musicSnippet: {
        url: { type: String, default: null },
        title: { type: String, default: '' },
        artist: { type: String, default: '' },
        isRented: { type: Boolean, default: false },
        rentedFromId: { type: mongoose.Schema.Types.ObjectId, ref: 'AudioBank', default: null },
        expiresAt: { type: Date, default: null },
        uploadedAt: { type: Date, default: null }
    },
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
    },
    stripeCustomerId: {
        type: String,
        default: null,
        index: true
    },
    // Shareable collab ID (format WRD-XXXXXX), auto-assigned
    collabId: {
        type: String,
        default: null,
        unique: true,
        sparse: true,
        index: true
    },
    // Idempotency markers for room settlement payouts. A payout is applied to
    // the balance and pushed here in ONE atomic update, so retries are no-ops.
    settledPayoutIds: {
        type: [String],
        default: []
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    if (!this.collabId) {
        this.collabId = generateCollabId();
    }
    next();
});

function generateCollabId() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusable 0/O/1/I/L
    let suffix = '';
    for (let i = 0; i < 6; i++) {
        suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    return `WRD-${suffix}`;
}

// Lazily assign collabId for pre-existing users (retries on rare collision)
userSchema.statics.ensureCollabId = async function(userId) {
    const user = await this.findById(userId).select('collabId');
    if (!user) return null;
    if (user.collabId) return user.collabId;
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateCollabId();
        try {
            const updated = await this.findOneAndUpdate(
                { _id: userId, collabId: null },
                { $set: { collabId: candidate } },
                { new: true }
            ).select('collabId');
            return updated ? updated.collabId : (await this.findById(userId).select('collabId')).collabId;
        } catch (err) {
            if (err.code !== 11000) throw err; // duplicate collabId — retry
        }
    }
    throw new Error('Could not assign collab ID');
};

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
        customerAudience: this.customerAudience || 'USER',
        role: this.role,
        createdAt: this.createdAt,
        showRoomHistory: this.showRoomHistory || false,
        extendedBio: this.extendedBio || '',
        profilePhotos: this.profilePhotos || [],
        musicSnippet: this.musicSnippet && this.musicSnippet.url ? {
            url: this.musicSnippet.url,
            title: this.musicSnippet.title,
            artist: this.musicSnippet.artist,
            isRented: this.musicSnippet.isRented
        } : null,
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