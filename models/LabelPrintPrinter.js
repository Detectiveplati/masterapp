const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const LabelPrintPrinterSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  model: { type: String, default: 'QL-820NWB', trim: true },
  androidClientId: { type: String, default: '', trim: true },
  connectionType: { type: String, default: 'web-serial-bluetooth', trim: true },
  host: { type: String, default: '', trim: true },
  port: { type: Number, default: 9100, min: 1, max: 65535 },
  serialBaudRate: { type: Number, default: 9600, min: 1, max: 921600 },
  status: { type: String, enum: ['unavailable', 'ready', 'printing', 'error'], default: 'unavailable' },
  bridgeAvailable: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  lastSeenAt: { type: Date, default: null },
  objectNameMap: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('LabelPrintPrinter', LabelPrintPrinterSchema, COLLECTIONS.core.LABEL_PRINT_PRINTERS);
