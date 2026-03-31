'use strict';
const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

/**
 * TempMonConfig — singleton global config document (key: 'global').
 * Stores server-side configurable alert push delays.
 */
const schema = new mongoose.Schema({
  key:                       { type: String, default: 'global', unique: true },
  pushDelayCriticalMinutes:  { type: Number, default: 60 },   // push after N min of sustained critical
  pushDelayWarningMinutes:   { type: Number, default: 120 },  // push after N min of sustained warning
}, { timestamps: true });

module.exports = mongoose.model('TempMonConfig', schema, COLLECTIONS.core.TEMP_MON_CONFIGS);
