'use strict';
const mongoose = require('mongoose');

const IsoRecordSchema = new mongoose.Schema(
  {
    recordName:      { type: String, required: true },
    department:      { type: String, default: 'General' },
    category:        { type: String, default: 'Others' },
    personInCharge:  { type: String, default: '' },
    frequency:       { type: String, enum: ['Daily', 'Monthly'], required: true },
    latestDateFiled: { type: Date, default: null },
    comment:         { type: String, default: '' },
    commentResolved: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('IsoRecord', IsoRecordSchema);
