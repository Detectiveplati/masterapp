const mongoose = require('mongoose');

/**
 * PestSession — one weekly inspection round.
 * All findings for the same inspection date belong to one session.
 */
const PestSessionSchema = new mongoose.Schema({
  date:         { type: Date,   required: true },          // inspection date
  conductedBy:  { type: String, required: true, trim: true },
  notes:        { type: String, default: '' },
  status:       { type: String, enum: ['draft','submitted'], default: 'draft' }
}, { timestamps: true });

module.exports = mongoose.model('PestSession', PestSessionSchema);
