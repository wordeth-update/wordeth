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
        /**
         * How this account pays.
         *
         * 'prepaid' is the default and the safe one: money arrives before
         * delivery and ads stop the moment the balance is gone, so nobody
         * can owe anything. 'invoiced' is for major clients who will not
         * prepay: they accrue against a credit limit and are billed on
         * terms, which is a deliberate decision to extend credit and is set
         * by an administrator, never by the advertiser.
         */
        mode: { type: String, enum: ['prepaid', 'invoiced'], default: 'prepaid' },
        balance: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        /** Invoiced accounts only: how much may accrue before delivery stops. */
        creditLimit: { type: Number, default: 0 },
        /** Invoiced accounts only: delivered but not yet paid for. */
        outstanding: { type: Number, default: 0 },
        /** Days to pay once an invoice is issued. Thirty unless agreed otherwise. */
        termsDays: { type: Number, default: 30 },
        billingEmail: { type: String, default: null },
        /** Set when an invoice passes its due date unpaid; clears when settled. */
        pastDue: { type: Boolean, default: false }
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
