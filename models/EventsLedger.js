const mongoose = require('mongoose');

const eventsLedgerSchema = new mongoose.Schema({
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    actorType: {
        type: String,
        enum: ['user', 'partner', 'admin', 'system'],
        required: true
    },
    eventType: {
        type: String,
        required: true,
        index: true,
        enum: [
            'subscription_created',
            'subscription_upgraded',
            'subscription_downgraded',
            'subscription_canceled',
            'subscription_renewed',
            'subscription_expired',
            'payment_succeeded',
            'payment_failed',
            'invoice_created',
            'invoice_paid',
            'pack_purchased',
            'pack_subscribed',
            'pack_canceled',
            'addon_purchased',
            'template_created',
            'template_deleted',
            'gmv_order',
            'platform_fee_recorded',
            'graduation_triggered',
            'entitlement_override',
            'account_created',
            'account_type_changed'
        ]
    },
    resourceType: {
        type: String,
        default: null
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    amount: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    description: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

eventsLedgerSchema.index({ createdAt: -1 });
eventsLedgerSchema.index({ actorId: 1, eventType: 1 });

module.exports = mongoose.model('EventsLedger', eventsLedgerSchema);
