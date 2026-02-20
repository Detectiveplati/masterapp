const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
    equipmentId: {
        type: String,
        unique: true
    },
    qrCode: {
        type: String,
        default: ''
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        required: true,
        trim: true
    },
    brand: {
        type: String,
        trim: true,
        default: ''
    },
    modelNumber: {
        type: String,
        trim: true,
        default: ''
    },
    serialNumber: {
        type: String,
        trim: true,
        default: ''
    },
    location: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        required: true,
        enum: ['operational', 'needs_action'],
        default: 'operational'
    },
    purchaseDate: {
        type: Date,
        default: null
    },
    warrantyExpiry: {
        type: Date,
        default: null
    },
    installationDate: {
        type: Date,
        default: null
    },
    expectedLifespan: {
        type: Number,
        default: null,
        comment: 'Expected lifespan in years'
    },
    maintenanceFrequency: {
        type: Number,
        required: true,
        default: 90,
        comment: 'Maintenance frequency in days'
    },
    lastServiceDate: {
        type: Date,
        default: null
    },
    nextServiceDate: {
        type: Date,
        default: null
    },
    operatingInstructions: {
        type: String,
        default: ''
    },
    safetyNotes: {
        type: String,
        default: ''
    },
    photos: [{
        type: String
    }],
    purchaseCost: {
        type: Number,
        default: null
    },
    supplierContact: {
        type: String,
        trim: true,
        default: ''
    },
    assignedTechnician: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

const typePath = equipmentSchema.path('type');
if (typePath) {
    typePath.enumValues = [];
    typePath.validators = typePath.validators.filter(validator => validator.type !== 'enum');
}

// Auto-generate equipmentId before saving
equipmentSchema.pre('save', async function(next) {
    if (this.isNew && !this.equipmentId) {
        const count = await mongoose.model('Equipment').countDocuments();
        this.equipmentId = `EQ${String(count + 1).padStart(5, '0')}`;
    }
    
    // Calculate next service date if lastServiceDate is set
    if (this.lastServiceDate && this.maintenanceFrequency) {
        const nextDate = new Date(this.lastServiceDate);
        nextDate.setDate(nextDate.getDate() + this.maintenanceFrequency);
        this.nextServiceDate = nextDate;
    }
    
    next();
});

// Index for faster queries
equipmentSchema.index({ equipmentId: 1 });
equipmentSchema.index({ status: 1 });
equipmentSchema.index({ nextServiceDate: 1 });

if (mongoose.models.Equipment) {
    mongoose.deleteModel('Equipment');
}

const Equipment = mongoose.model('Equipment', equipmentSchema);

module.exports = Equipment;
