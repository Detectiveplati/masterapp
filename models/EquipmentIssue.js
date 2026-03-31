const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const equipmentIssueSchema = new mongoose.Schema({
    equipmentId: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    reportedBy: {
        type: String,
        trim: true,
        default: 'Anonymous'
    },
    status: {
        type: String,
        enum: ['open', 'resolved'],
        default: 'open'
    },
    reportedDate: {
        type: Date,
        default: Date.now
    },
    resolvedDate: {
        type: Date,
        default: null
    },
    resolvedBy: {
        type: String,
        trim: true,
        default: ''
    },
    imagePath: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

equipmentIssueSchema.index({ equipmentId: 1 });
equipmentIssueSchema.index({ status: 1 });

const EquipmentIssue = mongoose.model('EquipmentIssue', equipmentIssueSchema, COLLECTIONS.core.EQUIPMENT_ISSUES);

module.exports = EquipmentIssue;
