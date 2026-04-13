const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const LabelPrintTemplateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  printerTemplateNumber: { type: Number, required: true, min: 1, max: 255 },
  mediaWidthMm: { type: Number, default: 62 },
  printWidthMm: { type: Number, default: 58 },
  heightMm: { type: Number, enum: [29, 62, 100], required: true },
  supportedOptions: {
    autoCut: { type: Boolean, default: true },
    noCut: { type: Boolean, default: true }
  },
  fieldSchema: [{
    key: { type: String, required: true, trim: true },
    label: { type: String, default: '', trim: true },
    type: { type: String, default: 'text', trim: true },
    required: { type: Boolean, default: false }
  }],
  preview: {
    widthMm: { type: Number, default: 58 },
    heightMm: { type: Number, default: 62 }
  },
  departmentCode: { type: String, default: '', trim: true },
  departmentName: { type: String, default: '', trim: true },
  departmentSignature: { type: String, default: '', trim: true },
  departmentSignaturePlacement: { type: String, default: '', trim: true },
  departmentSignatureEmbeddedInTemplate: { type: Boolean, default: false },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('LabelPrintTemplate', LabelPrintTemplateSchema, COLLECTIONS.core.LABEL_PRINT_TEMPLATES);
