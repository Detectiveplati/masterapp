const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

/**
 * PestSession — one weekly inspection round.
 * All findings for the same inspection date belong to one session.
 */
const PestSessionSchema = new mongoose.Schema({
  date:         { type: Date,   required: true },          // inspection date
  conductedBy:  { type: String, required: true, trim: true },
  notes:        { type: String, default: '' },
  status:       { type: String, enum: ['draft','submitted'], default: 'draft' },
  periodLabel:  { type: String, default: '' }              // '' = current period, set = archived
}, { timestamps: true });

module.exports = mongoose.model('PestSession', PestSessionSchema, COLLECTIONS.core.PEST_SESSIONS);
