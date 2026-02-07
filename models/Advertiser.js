const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const advertiserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    companyName: {
        type: String,
        required: true,
        trim: true
    },
    contactName: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    website: {
        type: String,
        trim: true
    },
    accountType: {
        type: String,
        enum: ['self-serve', 'managed', 'partner'],
        default: 'self-serve'
    },
    role: {
        type: String,
        enum: ['advertiser', 'admin'],
        default: 'advertiser'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'suspended'],
        default: 'pending'
    },
    application: {
        businessType: { type: String, trim: true },
        businessTypeOther: { type: String, trim: true },
        businessDescription: { type: String, trim: true },
        monthlyBudget: { type: String, trim: true },
        campaignGoals: [{ type: String }],
        campaignGoalsOther: { type: String, trim: true },
        targetAudience: { type: String, trim: true },
        targetGenres: [{ type: String }],
        previousAdvertising: { type: String, trim: true },
        expectedStartDate: { type: String, trim: true },
        additionalNotes: { type: String, trim: true },
        adminReferralCode: { type: String, trim: true }
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Advertiser'
    },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, trim: true },
    billing: {
        balance: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 }
    },
    settings: {
        emailNotifications: { type: Boolean, default: true },
        weeklyReports: { type: Boolean, default: true }
    }
}, {
    timestamps: true
});

advertiserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

advertiserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

advertiserSchema.statics.isAdmin = async function(advertiserId) {
    const advertiser = await this.findById(advertiserId);
    return advertiser && advertiser.role === 'admin';
};

module.exports = mongoose.model('Advertiser', advertiserSchema);
