'use strict';
const mongoose = require('mongoose');

/**
 * TempMonUnit — a piece of temperature-controlled equipment (freezer, chiller, warmer).
 * Each unit has one or more TempMonDevice probes and defined critical temperature limits.
 */
const TempMonUnitSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },      // "Blast Freezer 1"
  type:           { type: String, enum: ['freezer', 'chiller', 'warmer', 'ambient'], required: true },
  location:       { type: String, default: '', trim: true },         // "Prep Kitchen — Cold Room A"
  criticalMin:    { type: Number, required: true },                  // °C lower limit
  criticalMax:    { type: Number, required: true },                  // °C upper limit
  warningBuffer:  { type: Number, default: 2 },                      // degrees inside limits → warning zone
  targetTemp:     { type: Number },                                   // ideal operating temp (display only)
  active:              { type: Boolean, default: true },
  notes:               { type: String, default: '', trim: true },
  // Minutes a unit must stay at critical temperature before a push notification fires.
  // 0 = notify immediately. Recommended: 20–30 min for kitchen equipment.
  alertThresholdMinutes: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('TempMonUnit', TempMonUnitSchema);
