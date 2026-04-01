const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const { COLLECTIONS } = require('../config/databaseLayout');

const UserSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName:  { type: String, required: true },
  position:     { type: String, default: '', trim: true },
  role:         { type: String, enum: ['admin', 'user'], default: 'user' },
  active:       { type: Boolean, default: true },
  permissions: {
    maintenance:  { type: Boolean, default: false },
    foodsafety:   { type: Boolean, default: false },
    foodsafetyforms: { type: Boolean, default: false },
    templog:      { type: Boolean, default: false },
    procurement:  { type: Boolean, default: false },
    pest:         { type: Boolean, default: false },
    tempmon:      { type: Boolean, default: false },
    iso:          { type: Boolean, default: false }
  },
  notificationPreferences: {
    pushEnabled: { type: Boolean, default: false },
    maintenance: {
      enabled:       { type: Boolean, default: true },
      overdue:       { type: Boolean, default: true },
      upcoming:      { type: Boolean, default: true },
      issueReported: { type: Boolean, default: true },
      resolved:      { type: Boolean, default: false },
    },
    foodsafety: {
      enabled:      { type: Boolean, default: true },
      ncReported:   { type: Boolean, default: true },
      ncResolved:   { type: Boolean, default: false },
      certExpiring: { type: Boolean, default: true },
    },
    tempmon: {
      enabled:       { type: Boolean, default: true },
      tempAlert:     { type: Boolean, default: true },
      tempCritical:  { type: Boolean, default: true },
      deviceOffline: { type: Boolean, default: true },
    },
    procurement: {
      enabled:          { type: Boolean, default: true },
      requestSubmitted: { type: Boolean, default: true },
      requestApproved:  { type: Boolean, default: true },
      requestRejected:  { type: Boolean, default: true },
    },
    pest: {
      enabled:         { type: Boolean, default: true },
      findingReported: { type: Boolean, default: true },
      criticalFinding: { type: Boolean, default: true },
    },
    iso: {
      enabled:       { type: Boolean, default: true },
      recordDue:     { type: Boolean, default: true },
      recordOverdue: { type: Boolean, default: true },
    },
  }
}, { timestamps: true });

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  // If it already looks like a bcrypt hash, skip
  if (this.passwordHash.startsWith('$2')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// Compare password
UserSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema, COLLECTIONS.core.USERS);
