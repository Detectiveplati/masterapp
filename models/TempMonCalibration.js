'use strict';
const mongoose = require('mongoose');

/**
 * TempMonCalibration — calibration event log for an IoT probe.
 * Supports Cloudinary-hosted calibration certificate upload.
 */
const TempMonCalibrationSchema = new mongoose.Schema({
  device:        { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonDevice', required: true, index: true },
  calibratedBy:  { type: String, required: true, trim: true },
  calibratedAt:  { type: Date,   required: true },
  referenceTemp: { type: Number, default: null },  // °C of reference standard
  readingBefore: { type: Number, default: null },  // device reading before calibration
  readingAfter:  { type: Number, default: null },  // device reading after calibration
  offsetApplied: { type: Number, default: 0 },     // correction offset recorded
  certificate:   { type: String, default: '' },    // Cloudinary secure_url
  certificateId: { type: String, default: '' },    // Cloudinary public_id
  nextDueDate:   { type: Date,   default: null },
  notes:         { type: String, default: '', trim: true }
}, { timestamps: true });

module.exports = mongoose.model('TempMonCalibration', TempMonCalibrationSchema);
