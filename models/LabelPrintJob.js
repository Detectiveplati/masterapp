const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const LabelPrintJobSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'LabelPrintItem', default: null },
  itemSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  printer: { type: mongoose.Schema.Types.ObjectId, ref: 'LabelPrintPrinter', default: null },
  templateKey: { type: String, required: true, trim: true },
  printerTemplateNumber: { type: Number, required: true, min: 1, max: 255 },
  quantity: { type: Number, required: true, min: 1, max: 999 },
  cutMode: { type: String, enum: ['auto-cut', 'no-cut'], default: 'auto-cut' },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestedBy: {
    id: { type: String, default: '' },
    username: { type: String, default: '' },
    displayName: { type: String, default: '' }
  },
  status: {
    type: String,
    enum: ['queued', 'success', 'failed', 'bridge_unavailable', 'test'],
    default: 'queued'
  },
  bridgeResult: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: '' },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

LabelPrintJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LabelPrintJob', LabelPrintJobSchema, COLLECTIONS.core.LABEL_PRINT_JOBS);
