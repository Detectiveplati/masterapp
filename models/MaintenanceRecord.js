const mongoose = require('mongoose');

const maintenanceRecordSchema = new mongoose.Schema({
    equipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Equipment',
        required: true
    },
    maintenanceType: {
        type: String,
        required: true,
        enum: ['Routine Check', 'Repair', 'Emergency', 'Preventive', 'Cleaning', 'Part Replacement', 'Calibration'],
        default: 'Routine Check'
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    activityDescription: {
        type: String,
        trim: true,
        default: ''
    },
    issuesFound: {
        type: String,
        trim: true,
        default: ''
    },
    actionsTaken: {
        type: String,
        trim: true,
        default: ''
    },
    partsReplaced: [{
        type: String,
        trim: true
    }],
    partsCost: {
        type: Number,
        default: 0
    },
    laborHours: {
        type: Number,
        default: 0
    },
    laborCost: {
        type: Number,
        default: 0
    },
    totalCost: {
        type: Number,
        default: 0
    },
    performedBy: {
        type: String,
        trim: true,
        default: ''
    },
    beforePhotos: [{
        type: String
    }],
    afterPhotos: [{
        type: String
    }],
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    nextScheduledDate: {
        type: Date,
        default: null
    },
    equipmentStatusAfter: {
        type: String,
        enum: ['operational', 'needs_action'],
        default: 'operational'
    },
    // Legacy field for backwards compatibility
    activity: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Calculate total cost before saving
maintenanceRecordSchema.pre('save', function(next) {
    this.totalCost = (this.partsCost || 0) + (this.laborCost || 0);
    next();
});

// Index for faster queries
maintenanceRecordSchema.index({ equipmentId: 1 });
maintenanceRecordSchema.index({ date: -1 });
maintenanceRecordSchema.index({ maintenanceType: 1 });

const MaintenanceRecord = mongoose.model('MaintenanceRecord', maintenanceRecordSchema);

module.exports = MaintenanceRecord;
