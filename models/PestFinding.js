const mongoose = require('mongoose');

/**
 * PestFinding — the actual observation recorded for one station in one session.
 *
 * trapStatus values:
 *   'normal'   — regular inspection (default)
 *   'new-trap' — a new trap was placed this week  → display "New" in report
 *   'gone'     — trap was missing / removed        → display "Gone" in report
 */
const PhotoSchema = new mongoose.Schema({
  url:        { type: String, required: true },  // Cloudinary secure_url or local path
  publicId:   { type: String, default: '' },      // Cloudinary public_id (for deletion)
  uploadedAt: { type: Date,   default: Date.now }
}, { _id: false });

const PestFindingSchema = new mongoose.Schema({
  sessionId:      { type: mongoose.Schema.Types.ObjectId, ref: 'PestSession', required: true, index: true },
  stationId:      { type: mongoose.Schema.Types.ObjectId, ref: 'PestStation', required: true, index: true },
  cockroach:      { type: Number, default: 0, min: 0 },
  others:         { type: Number, default: 0, min: 0 },   // e.g. ants, flies
  newCockroaches: { type: Number, default: 0, min: 0 },   // "New Cockroaches" column
  trapStatus:     { type: String, enum: ['normal','new-trap','gone'], default: 'normal' },
  remarks:        { type: String, default: '' },
  photos:         { type: [PhotoSchema], default: [] }
}, { timestamps: true });

// One finding per station per session
PestFindingSchema.index({ sessionId: 1, stationId: 1 }, { unique: true });

module.exports = mongoose.model('PestFinding', PestFindingSchema);
