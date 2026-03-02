const mongoose = require('mongoose');

/**
 * PestStation — one Rat Trap Station (RTS)
 * Matches rows in the Rat Trap Surveillance Report spreadsheet.
 */
const PestStationSchema = new mongoose.Schema({
  rtsNo:               { type: Number, required: true, unique: true },
  locationDescription: { type: String, required: true, trim: true },
  unit:                { type: String, required: true, trim: true }, // e.g. '05-27'
  isActive:            { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('PestStation', PestStationSchema);
