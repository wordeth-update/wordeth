const mongoose = require('mongoose');

const waitlistSignupSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    source: {
        type: String,
        default: 'coming-soon'
    },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    referrer: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true }
}, { collection: 'waitlist_signups' });

module.exports = mongoose.model('WaitlistSignup', waitlistSignupSchema);
