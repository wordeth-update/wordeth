const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    text: {
        type: String,
        default: '',
        maxlength: 2000
    },
    audioUrl: {
        type: String,
        default: null
    },
    audioExpiry: {
        type: Date,
        default: null
    },
    read: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, read: 1 });
messageSchema.index({ audioExpiry: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { audioExpiry: { $exists: true, $ne: null } } });

module.exports = mongoose.model('Message', messageSchema);
