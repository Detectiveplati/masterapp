'use strict';
const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const TempMonRuntimeLogSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['debug', 'info', 'warn', 'error'],
    default: 'info',
    index: true
  },
  eventType: { type: String, required: true, trim: true, index: true },
  message: { type: String, default: '', trim: true },
  gatewayId: { type: String, default: '', trim: true, index: true },
  sensorId: { type: String, default: '', trim: true, index: true },
  unitId: { type: String, default: '', trim: true },
  deviceId: { type: String, default: '', trim: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

TempMonRuntimeLogSchema.index({ createdAt: -1 });
TempMonRuntimeLogSchema.index({ eventType: 1, createdAt: -1 });
TempMonRuntimeLogSchema.index({ gatewayId: 1, createdAt: -1 });
TempMonRuntimeLogSchema.index({ sensorId: 1, createdAt: -1 });

module.exports = mongoose.model('TempMonRuntimeLog', TempMonRuntimeLogSchema, COLLECTIONS.core.TEMP_MON_RUNTIME_LOGS);
