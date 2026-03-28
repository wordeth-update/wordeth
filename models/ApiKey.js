const mongoose = require('mongoose');
const crypto = require('crypto');

const apiKeySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    organization: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    keyHash: {
        type: String,
        required: true,
        unique: true
    },
    keyPrefix: {
        type: String,
        required: true
    },
    permissions: [{
        type: String,
        enum: ['audiobank:submit', 'audiobank:update', 'audiobank:read'],
        default: ['audiobank:submit', 'audiobank:read']
    }],
    rateLimit: {
        type: Number,
        default: 100
    },
    active: {
        type: Boolean,
        default: true,
        index: true
    },
    lastUsed: {
        type: Date
    },
    totalRequests: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

apiKeySchema.statics.generateKey = function() {
    const key = 'wdth_' + crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const prefix = key.substring(0, 12);
    return { key, hash, prefix };
};

apiKeySchema.statics.hashKey = function(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
