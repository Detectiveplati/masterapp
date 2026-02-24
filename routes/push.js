const express   = require('express');
const router    = express.Router();
const webpush   = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Configure VAPID once — reads from env
webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || 'admin@example.com'),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ─── GET /api/push/vapid-public-key ─────────────────────────────────────────
// Returns the public key so the browser can subscribe
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// ─── POST /api/push/subscribe ────────────────────────────────────────────────
// Save a new push subscription (upsert by endpoint)
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        endpoint,
        keys,
        userAgent: req.headers['user-agent'] || '',
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/push/unsubscribe ────────────────────────────────────────────
// Remove a subscription (user opted out)
router.delete('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    await PushSubscription.deleteOne({ endpoint });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/push/test ─────────────────────────────────────────────────────
// Send a test push to ALL subscribed devices
router.post('/test', async (req, res) => {
  const title   = req.body.title   || '🔔 Test Notification';
  const message = req.body.message || 'This is a test push from Central Kitchen.';
  const results = await sendPushToAll({ title, message, url: '/' });
  res.json({ sent: results.sent, failed: results.failed });
});

// ─── POST /api/push/send ─────────────────────────────────────────────────────
// Internal helper — send a push to all devices  (also exported)
async function sendPushToAll({ title, message, url = '/' }) {
  const payload = JSON.stringify({ title, message, url });
  const subs    = await PushSubscription.find();
  let sent = 0, failed = 0;

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 3600 }
      );
      sent++;
    } catch (err) {
      failed++;
      // 404 / 410 = subscription expired — clean it up
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id });
      }
    }
  }));

  return { sent, failed };
}

// ─── GET /api/push/subscriptions ────────────────────────────────────────────
// List all subscriptions (for the test UI)
router.get('/subscriptions', async (req, res) => {
  try {
    const subs = await PushSubscription.find({}, 'endpoint userAgent createdAt');
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.sendPushToAll = sendPushToAll;
