'use strict';
const mongoose = require('mongoose');
const { COLLECTIONS } = require('../config/databaseLayout');

const FoodSafetyFormAssignmentSchema = new mongoose.Schema({
  userId:       { type: String, required: true, trim: true, index: true },
  username:     { type: String, default: '', trim: true },
  displayName:  { type: String, default: '', trim: true },
  position:     { type: String, default: '', trim: true },
  templateCode: { type: String, required: true, trim: true, index: true },
  unitCode:     { type: String, required: true, trim: true },
  active:       { type: Boolean, default: true }
}, { timestamps: true });

FoodSafetyFormAssignmentSchema.index({ userId: 1, templateCode: 1, unitCode: 1 }, { unique: true });

module.exports = mongoose.model(
  'FoodSafetyFormAssignment',
  FoodSafetyFormAssignmentSchema,
  COLLECTIONS.core.FOOD_SAFETY_FORM_ASSIGNMENTS || 'core_food_safety_form_assignments'
);
