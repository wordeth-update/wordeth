const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'trialing', 'past_due', 'canceled', 'expired', 'paused'],
        default: 'active',
        index: true
    },
    billingCycle: {
        type: String,
        enum: ['monthly', 'yearly', 'lifetime', 'free'],
        default: 'free'
    },
    currentPeriodStart: {
        type: Date,
        default: Date.now
    },
    currentPeriodEnd: {
        type: Date,
        default: null
    },
    trialEndsAt: {
        type: Date,
        default: null
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false
    },
    canceledAt: {
        type: Date,
        default: null
    },
    gracePeriodEndsAt: {
        type: Date,
        default: null
    },
    paymentMethodId: {
        type: String,
        default: null
    },
    lastPaymentAt: {
        type: Date,
        default: null
    },
    lastPaymentAmount: {
        type: Number,
        default: 0
    },
    nextBillingAmount: {
        type: Number,
        default: 0
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

subscriptionSchema.index({ userId: 1, status: 1 });

subscriptionSchema.methods.isActive = function() {
    if (this.status === 'active' || this.status === 'trialing') return true;
    if (this.status === 'canceled' && this.currentPeriodEnd && this.currentPeriodEnd > new Date()) return true;
    if (this.status === 'past_due' && this.gracePeriodEndsAt && this.gracePeriodEndsAt > new Date()) return true;
    return false;
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
