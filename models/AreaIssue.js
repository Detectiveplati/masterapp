const mongoose = require('mongoose');

const areaIssueSchema = new mongoose.Schema({
    issueId: {
        type: String,
        unique: true,
        required: true
    },
    area: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Plumbing', 'Electrical', 'HVAC', 'Structural', 'Cleaning', 'Safety Hazard', 'Pest Control', 'Other'],
        default: 'Other'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    priority: {
        type: String,
        required: true,
        enum: ['Low', 'Normal', 'Medium', 'Urgent', 'High', 'Critical'],
        default: 'Normal'
    },
    status: {
        type: String,
        required: true,
        enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
        default: 'Open'
    },
    photos: [{
        type: String
    }],
    reportedBy: {
        type: String,
        required: true,
        trim: true
    },
    contactNumber: {
        type: String,
        trim: true,
        default: ''
    },
    reportedDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    specificLocation: {
        type: String,
        trim: true,
        default: ''
    },
    assignedTo: {
        type: String,
        trim: true,
        default: ''
    },
    resolutionNotes: {
        type: String,
        trim: true,
        default: ''
    },
    resolvedDate: {
        type: Date,
        default: null
    },
    relatedMaintenanceRecords: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MaintenanceRecord'
    }]
}, {
    timestamps: true
});

// Auto-generate issueId before validation (must run before required check)
areaIssueSchema.pre('validate', async function(next) {
    if (this.isNew && !this.issueId) {
        const count = await mongoose.model('AreaIssue').countDocuments();
        this.issueId = `ISS${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

// Index for faster queries
areaIssueSchema.index({ issueId: 1 });
areaIssueSchema.index({ status: 1 });
areaIssueSchema.index({ priority: 1 });
areaIssueSchema.index({ area: 1 });

const AreaIssue = mongoose.model('AreaIssue', areaIssueSchema);

module.exports = AreaIssue;
