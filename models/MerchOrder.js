const mongoose = require('mongoose');

const merchOrderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: String, required: true },
    productName: { type: String, required: true },
    color: { type: String, required: true },
    colorName: { type: String },
    size: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    artistName: String,
    artistId: String,
    frontDesign: String,
    backDesign: String,
    leftDesign: String,
    rightDesign: String,
    designPreview: String,
    templateId: String,
    status: {
        type: String,
        default: 'pending',
        enum: ['pending', 'confirmed', 'production', 'shipped', 'delivered', 'cancelled', 'refunded']
    },
    shippingAddress: {
        name: { type: String, default: '' },
        firstName: { type: String, default: '' },
        lastName: { type: String, default: '' },
        company: { type: String, default: '' },
        phone: { type: String, default: '' },
        line1: { type: String, default: '' },
        line2: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        postalCode: { type: String, default: '' },
        countryCode: { type: String, default: '' }
    },
    shippingChoice: {
        code: { type: String, enum: ['', 'standard', 'upgraded', 'rush'], default: '' },
        label: { type: String, default: '' },
        amount: { type: Number, default: 0 },
        currency: { type: String, default: 'usd' },
        stripeShippingRateId: { type: String, default: '' }
    },
    payment: {
        status: {
            type: String,
            enum: ['unpaid', 'paid', 'refunded', 'cancelled'],
            default: 'unpaid',
            index: true
        },
        stripeCheckoutSessionId: { type: String, default: '', index: true },
        stripePaymentIntentId: { type: String, default: '', index: true },
        amountPaid: { type: Number, default: 0 },
        amountRefunded: { type: Number, default: 0 },
        currency: { type: String, default: 'usd' },
        paidAt: { type: Date, default: null },
        lastRefundAt: { type: Date, default: null },
        closedAt: { type: Date, default: null }
    },
    trackingNumber: String,
    notes: String,
    apliiq: {
        orderId: { type: String, default: '', index: true },
        sku: { type: String, default: '' },
        status: { type: String, default: '' },
        trackingCompany: { type: String, default: '' },
        trackingNumbers: [{ type: String }],
        trackingUrls: [{ type: String }],
        primaryTracking: {
            number: { type: String, default: '' },
            company: { type: String, default: '' },
            url: { type: String, default: '' }
        },
        lineItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
        submissionStatus: {
            type: String,
            enum: ['not_ready', 'pending', 'submitting', 'submitted', 'retry', 'failed', 'cancelled'],
            default: 'not_ready',
            index: true
        },
        attempts: { type: Number, default: 0 },
        nextAttemptAt: { type: Date, default: null, index: true },
        leaseId: { type: String, default: '' },
        leaseUntil: { type: Date, default: null },
        lastAttemptAt: { type: Date, default: null },
        submittedAt: { type: Date, default: null },
        lastError: { type: String, default: '' },
        responseStatus: { type: Number, default: 0 },
        shippedAt: { type: Date, default: null },
        lastEventAt: { type: Date, default: null }
    }
}, { timestamps: true });

merchOrderSchema.index(
    { 'payment.stripeCheckoutSessionId': 1 },
    { unique: true, partialFilterExpression: { 'payment.stripeCheckoutSessionId': { $gt: '' } } }
);
merchOrderSchema.index(
    { 'payment.stripePaymentIntentId': 1 },
    { unique: true, partialFilterExpression: { 'payment.stripePaymentIntentId': { $gt: '' } } }
);

module.exports = mongoose.models.MerchOrder || mongoose.model('MerchOrder', merchOrderSchema);