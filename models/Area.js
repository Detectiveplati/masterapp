const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema({
    areaId: {
        type: String,
        unique: true,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    qrCode: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    assignedSupervisor: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

// Auto-generate areaId before saving
areaSchema.pre('save', async function(next) {
    if (this.isNew && !this.areaId) {
        const count = await mongoose.model('Area').countDocuments();
        this.areaId = `AREA${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

// Index for faster queries
areaSchema.index({ areaId: 1 });
areaSchema.index({ name: 1 });

const Area = mongoose.model('Area', areaSchema);

module.exports = Area;
