'use strict';
const mongoose = require('mongoose');

/**
 * TempMonCorrectiveAction — HACCP corrective action record linked to a TempMonAlert.
 * Records what was done, root cause, whether product was affected, and verification.
 */
const TempMonCorrectiveActionSchema = new mongoose.Schema({
  alert:                   { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonAlert', required: true, unique: true },
  unit:                    { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonUnit',  required: true, index: true },
  actionTaken:             { type: String, required: true, trim: true },
  takenBy:                 { type: String, required: true, trim: true },
  takenAt:                 { type: Date,   default: Date.now },
  rootCause:               { type: String, default: '', trim: true },
  preventiveMeasure:       { type: String, default: '', trim: true },
  productDisposalRequired: { type: Boolean, default: false },
  productDisposalDetails:  { type: String, default: '', trim: true },
  verifiedBy:              { type: String, default: '', trim: true },
  verifiedAt:              { type: Date,   default: null },
  outcome:                 { type: String, enum: ['product_safe', 'product_discarded', 'equipment_repaired', 'other', ''], default: '' }
}, { timestamps: true });

module.exports = mongoose.model('TempMonCorrectiveAction', TempMonCorrectiveActionSchema);
