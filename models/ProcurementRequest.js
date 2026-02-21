const mongoose = require('mongoose');

const ProcurementRequestSchema = new mongoose.Schema({
    // ── Item details ─────────────────────────────────────────────────────────
    itemNameEn:     { type: String, required: true, trim: true },
    itemNameZh:     { type: String, default: '', trim: true },      // Mandarin
    category:       { type: String, enum: ['Equipment', 'Ingredient', 'Consumable', 'Cleaning', 'Other'], default: 'Equipment' },
    quantity:       { type: String, default: '' },
    unit:           { type: String, default: '' },                  // kg, pcs, box…
    estimatedPrice: { type: String, default: '' },
    supplier:       { type: String, default: '' },
    priority:       { type: String, enum: ['Low', 'High', 'Urgent'], default: 'Low' },
    dateNeeded:     { type: String, default: '' },

    // ── Requester info ────────────────────────────────────────────────────────
    requestorName:  { type: String, required: true, trim: true },
    department:     { type: String, default: '' },
    comments:       { type: String, default: '' },

    // ── Image ─────────────────────────────────────────────────────────────────
    imagePath:      { type: String, default: '' },                  // relative /uploads/filename

    // ── Status & purchaser checklist ──────────────────────────────────────────
    status: {
        type: String,
        enum: ['Pending', 'Done', 'Approved', 'Ordered', 'Received', 'Cancelled'],
        default: 'Pending'
    },
    checklist: {
        quoteObtained:     { type: Boolean, default: false },
        managerApproved:   { type: Boolean, default: false },
        orderPlaced:       { type: Boolean, default: false },
        paymentProcessed:  { type: Boolean, default: false },
        itemReceived:      { type: Boolean, default: false },
        invoiceFiled:      { type: Boolean, default: false }
    },

    purchaserNotes:  { type: String, default: '' },

    // ── Timestamps ────────────────────────────────────────────────────────────
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now },
    completedAt: { type: Date, default: null }
});

// Auto-update updatedAt on save
ProcurementRequestSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('ProcurementRequest', ProcurementRequestSchema);
