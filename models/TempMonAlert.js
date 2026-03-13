'use strict';
const mongoose = require('mongoose');

/**
 * TempMonAlert — auto-created by the ingest handler when a reading violates
 * a critical or warning limit, or when a device goes offline.
 * Lifecycle: open → acknowledged → resolved
 */
const TempMonAlertSchema = new mongoose.Schema({
  unit:             { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonUnit',    required: true, index: true },
  device:           { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonDevice',  required: true },
  reading:          { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonReading', default: null }, // null for device_offline
  type:             { type: String, enum: ['critical_high', 'critical_low', 'warning_high', 'warning_low', 'device_offline', 'warmer_fault'], required: true },
  value:            { type: Number, default: null },   // °C at time of alert (null for offline)
  status:           { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open', index: true },
  acknowledgedBy:   { type: String, default: '' },
  acknowledgedAt:   { type: Date,   default: null },
  resolvedBy:       { type: String, default: '' },
  resolvedAt:       { type: Date,   default: null },
  resolveNote:      { type: String, default: '' },     // e.g. "Temperature returned to normal range automatically"
  correctiveAction: { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonCorrectiveAction', default: null },
  notificationSent: { type: Boolean, default: false },
  pushSentAt:       { type: Date,    default: null }   // null = push not yet sent (pending threshold)
}, { timestamps: true });

TempMonAlertSchema.index({ status: 1, unit: 1 });

module.exports = mongoose.model('TempMonAlert', TempMonAlertSchema);
