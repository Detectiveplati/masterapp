'use strict';
const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

/**
 * TempMonUnit — a piece of temperature-controlled equipment (freezer, chiller, warmer).
 * Each unit has one or more TempMonDevice probes and defined critical temperature limits.
 */
const TempMonUnitSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },      // "Blast Freezer 1"
  type:           { type: String, enum: ['freezer', 'chiller', 'warmer', 'ambient'], required: true },
  location:       { type: String, default: '', trim: true },         // "Prep Kitchen — Cold Room A"
  area:           { type: String, default: '', trim: true },         // area from maintenance module (dashboard grouping)
  criticalMin:    { type: Number, required: true },                  // °C lower limit
  criticalMax:    { type: Number, required: true },                  // °C upper limit
  warningBuffer:  { type: Number, default: 2 },                      // degrees inside limits → warning zone
  targetTemp:     { type: Number },                                   // ideal operating temp (display only)
  active:              { type: Boolean, default: true },
  inUse:               { type: Boolean, default: true },          // false = monitoring paused (no alerts)
  inUseComment:        { type: String, default: '', trim: true }, // reason for being out of use
  notes:               { type: String, default: '', trim: true },
  // Minutes a unit must stay at critical temperature before a push notification fires.
  // 0 = notify immediately. Recommended: 20–30 min for kitchen equipment.
  alertThresholdMinutes: { type: Number, default: 0 },
  // Warmer-specific: configurable thresholds for the on/off/fault state machine
  warmerStateConfig: {
    roomTempCeiling:   { type: Number, default: 35 },  // ≤ this °C = off / room temperature
    warmupStartTemp:   { type: Number, default: 40 },  // > this °C = warmer considered switched on
    offConfirmMinutes: { type: Number, default: 20 },  // minutes at room temp before confirming OFF
    faultMinutes:      { type: Number, default: 30 }   // minutes stuck below target before FAULT
  },
  // Persisted warmer on/off/fault state — updated on each reading, survives server restarts
  warmerState: {
    state: { type: String, enum: ['off', 'warming_up', 'active', 'cooling', 'fault', 'unknown'], default: 'unknown' },
    since: { type: Date }
  }
}, { timestamps: true });

module.exports = mongoose.model('TempMonUnit', TempMonUnitSchema, COLLECTIONS.core.TEMP_MON_UNITS);
