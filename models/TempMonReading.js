'use strict';
const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

/**
 * TempMonReading — a single temperature data point from an IoT probe.
 * High-volume collection — kept lean intentionally (no virtual getters, minimal populate).
 *
 * Indexes:
 *   { unit: 1, recordedAt: -1 }  — for dashboard / chart queries
 *   { device: 1, recordedAt: -1 } — for per-device history
 */
const TempMonReadingSchema = new mongoose.Schema({
  device:     { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonDevice', required: true },
  unit:       { type: mongoose.Schema.Types.ObjectId, ref: 'TempMonUnit',   required: true }, // denormalised
  value:      { type: Number, required: true },          // °C
  humidity:   { type: Number, default: null },           // %RH (TAG08B only; null for temp-only probes)
  rssi:       { type: Number, default: null },           // dBm signal strength
  battery:    { type: Number, default: null },           // V battery voltage (TAG08B)
  recordedAt: { type: Date,   required: true },          // gateway timestamp (authoritative for HACCP)
  receivedAt: { type: Date,   default: Date.now },       // server receipt time
  gatewayId:  { type: String, default: '' },
  flagged:    { type: Boolean, default: false }          // true if outside criticalMin/Max at ingest
}); // no timestamps:true — receivedAt fills that role; keep the collection lean

TempMonReadingSchema.index({ unit:   1, recordedAt: -1 });
TempMonReadingSchema.index({ device: 1, recordedAt: -1 });
// Unique constraint: a device cannot emit the same temp value at the exact same timestamp.
// Guards against duplicate ingest (gateway retries, double-delivery).
TempMonReadingSchema.index({ device: 1, recordedAt: 1, value: 1 }, { unique: true });

module.exports = mongoose.model('TempMonReading', TempMonReadingSchema, COLLECTIONS.core.TEMP_MON_READINGS);
