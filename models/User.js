const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName:  { type: String, required: true },
  role:         { type: String, enum: ['admin', 'user'], default: 'user' },
  active:       { type: Boolean, default: true },
  permissions: {
    maintenance:  { type: Boolean, default: false },
    foodsafety:   { type: Boolean, default: false },
    templog:      { type: Boolean, default: false },
    procurement:  { type: Boolean, default: false }
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

module.exports = mongoose.model('User', UserSchema);
