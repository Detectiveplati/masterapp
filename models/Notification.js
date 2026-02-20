const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['overdue', 'upcoming', 'issue-reported', 'critical', 'resolved', 'assigned'],
        default: 'upcoming'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    relatedEquipment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Equipment',
        default: null
    },
    relatedIssue: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AreaIssue',
        default: null
    },
    read: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for faster queries
notificationSchema.index({ read: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
