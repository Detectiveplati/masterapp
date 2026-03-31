'use strict';
const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

/**
 * TempMonDevice — an IoT-enabled thermometer/probe registered to a TempMonUnit.
 * The hardware sends its deviceId in every ingest payload.
 */
const TempMonDeviceSchema = new mongoose.Schema({
  unit:                    { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonUnit', required: true, index: true },
  deviceId:                { type: String, required: true, unique: true, trim: true }, // hardware MAC / token
  label:                   { type: String, default: '', trim: true },  // "Probe A — Top shelf"
  firmware:                { type: String, default: '', trim: true },
  batteryPct:              { type: Number, default: null },            // last reported battery %
  expectedIntervalMinutes: { type: Number, default: 5 },              // how often it should report
  lastSeenAt:              { type: Date,   default: null },            // updated on every ingest
  lastCalibratedAt:        { type: Date,   default: null },
  calibrationDue:          { type: Date,   default: null },            // auto-warn when approaching
  calibrationIntervalDays: { type: Number, default: 180 },
  active:                  { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('TempMonDevice', TempMonDeviceSchema, COLLECTIONS.core.TEMP_MON_DEVICES);
