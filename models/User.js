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

// Get public profile
userSchema.methods.getPublicProfile = function() {
    const userObject = this.toObject();
    delete userObject.password;
    delete userObject.socialId;
    return userObject;
};

module.exports = mongoose.model('User', userSchema); 