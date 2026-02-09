const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const partnerUserSchema = new mongoose.Schema({
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
    name: {
        type: String,
        required: true,
        trim: true
    },
    labelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Label',
        required: true
    },
    role: {
        type: String,
        enum: ['owner', 'manager', 'viewer'],
        default: 'viewer'
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    lastLogin: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

partnerUserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

partnerUserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

partnerUserSchema.methods.getPublicProfile = function() {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

module.exports = mongoose.model('PartnerUser', partnerUserSchema);
