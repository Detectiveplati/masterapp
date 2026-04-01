'use strict';
const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const ActorSchema = new mongoose.Schema({
  userId: { type: String, default: '' },
  name:   { type: String, default: '' },
  at:     { type: Date, default: null }
}, { _id: false });

const SignatureSchema = new mongoose.Schema({
  userId:         { type: String, default: '' },
  name:           { type: String, default: '' },
  position:       { type: String, default: '' },
  roleLabel:      { type: String, default: '' },
  typedSignature: { type: String, default: '' },
  signatureDataUrl: { type: String, default: '' },
  confirmed:      { type: Boolean, default: false },
  at:             { type: Date, default: null }
}, { _id: false });

const ReportArchiveSchema = new mongoose.Schema({
  fileName:    { type: String, default: '' },
  contentType: { type: String, default: 'application/pdf' },
  size:        { type: Number, default: 0 },
  generatedAt: { type: Date, default: null },
  data:        { type: Buffer, default: null }
}, { _id: false });

const FoodSafetyChecklistMonthSchema = new mongoose.Schema({
  templateCode:    { type: String, required: true, trim: true },
  templateVersion: { type: String, default: '01', trim: true },
  formType:        { type: String, default: 'matrix_monthly', trim: true },
  periodType:      { type: String, default: 'monthly', trim: true },
  unitCode:        { type: String, required: true, trim: true },
  unitLabel:       { type: String, required: true, trim: true },
  monthKey:        { type: String, required: true, trim: true },
  year:            { type: Number, required: true },
  month:           { type: Number, required: true },
  daysInMonth:     { type: Number, required: true },
  status:          { type: String, enum: ['draft', 'finalized', 'verified'], default: 'draft' },
  data:            { type: mongoose.Schema.Types.Mixed, default: {} },
  progress: {
    completedCells: { type: Number, default: 0 },
    totalCells:     { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 }
  },
  lastEditedBy: { type: ActorSchema, default: () => ({}) },
  finalizedBy:  { type: ActorSchema, default: () => ({}) },
  finalization: { type: SignatureSchema, default: () => ({ roleLabel: 'Filled By' }) },
  verification: { type: SignatureSchema, default: () => ({ roleLabel: 'Verified By' }) },
  reportArchive: { type: ReportArchiveSchema, default: () => ({}) }
}, { timestamps: true });

FoodSafetyChecklistMonthSchema.index(
  { templateCode: 1, unitCode: 1, monthKey: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'FoodSafetyChecklistMonth',
  FoodSafetyChecklistMonthSchema,
  COLLECTIONS.core.FOOD_SAFETY_CHECKLIST_MONTHS || 'core_food_safety_checklist_months'
);
