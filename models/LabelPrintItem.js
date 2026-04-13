const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const LabelPrintItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  category: { type: String, default: 'Uncategorized', trim: true },
  templateKey: { type: String, required: true, trim: true },
  sku: { type: String, default: '', trim: true },
  barcode: { type: String, default: '', trim: true },
  departmentCode: { type: String, default: '', trim: true },
  departmentName: { type: String, default: '', trim: true },
  defaultQuantity: { type: Number, default: 1, min: 1, max: 999 },
  defaultCutMode: { type: String, enum: ['auto-cut', 'no-cut'], default: 'auto-cut' },
  defaultFieldValues: { type: mongoose.Schema.Types.Mixed, default: {} },
  allowedOptions: {
    allowCutOverride: { type: Boolean, default: true }
  },
  active: { type: Boolean, default: true }
}, { timestamps: true });

LabelPrintItemSchema.index({ category: 1, name: 1 });

module.exports = mongoose.model('LabelPrintItem', LabelPrintItemSchema, COLLECTIONS.core.LABEL_PRINT_ITEMS);
