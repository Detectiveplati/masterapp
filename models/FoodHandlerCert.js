const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const FoodHandlerCertSchema = new mongoose.Schema({
  businessEntity:     { type: String, required: true, trim: true },
  employeeName:       { type: String, required: true, trim: true },
  previousCertDate:   { type: Date, default: null },
  startDate:          { type: Date, required: true },
  expiryDate:         { type: Date, required: true },
  isRefresher:        { type: Boolean, default: false },
  isCancelled:        { type: Boolean, default: false },
  cancellationReason: { type: String, trim: true, default: '' },
  remarks:            { type: String, trim: true, default: '' },
}, { timestamps: true });

// Virtual: computed validity status
// Not stored — calculated at query time (see routes/fhc.js addValidity helper)
FoodHandlerCertSchema.virtual('validityStatus').get(function () {
  if (this.isCancelled) return 'invalid';
  const now  = new Date();
  const soon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  if (this.expiryDate < now)   return 'invalid';
  if (this.expiryDate < soon)  return 'expiring';
  return 'valid';
});

module.exports = mongoose.model('FoodHandlerCert', FoodHandlerCertSchema, COLLECTIONS.core.FOOD_HANDLER_CERTS);
