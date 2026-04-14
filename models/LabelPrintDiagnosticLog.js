const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const LabelPrintDiagnosticLogSchema = new mongoose.Schema({
  source: { type: String, default: 'client', trim: true },
  level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
  eventType: { type: String, default: 'runtime', trim: true },
  message: { type: String, default: '', trim: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  device: {
    sessionId: { type: String, default: '', trim: true },
    userAgent: { type: String, default: '', trim: true },
    origin: { type: String, default: '', trim: true },
    href: { type: String, default: '', trim: true },
    displayMode: { type: String, default: '', trim: true }
  },
  runtime: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestedBy: {
    id: { type: String, default: '' },
    username: { type: String, default: '' },
    displayName: { type: String, default: '' }
  }
}, { timestamps: true });

LabelPrintDiagnosticLogSchema.index({ createdAt: -1 });
LabelPrintDiagnosticLogSchema.index({ 'device.sessionId': 1, createdAt: -1 });
LabelPrintDiagnosticLogSchema.index({ eventType: 1, createdAt: -1 });

module.exports = mongoose.model(
  'LabelPrintDiagnosticLog',
  LabelPrintDiagnosticLogSchema,
  COLLECTIONS.core.LABEL_PRINT_DIAGNOSTIC_LOGS
);
