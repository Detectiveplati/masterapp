const mongoose = require('mongoose');

const PushSubscriptionSchema = new mongoose.Schema({
  endpoint:   { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true }
  },
  // Optional: link to a user ID for targeted pushes later
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  userAgent:  { type: String, default: '' },
  createdAt:  { type: Date, default: Date.now }
});

// Auto-clean stale subscriptions (TTL fallback — browser handles removal too)
PushSubscriptionSchema.index({ createdAt: 1 });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
