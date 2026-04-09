const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../services/auth-middleware');

const BYPASS_AUTH = process.env.BYPASS_AUTH === 'true';
const BYPASS_USER = {
  id: 'bypass', username: 'bypass', displayName: 'Test Admin',
  position: 'Administrator',
  role: 'admin',
  permissions: { maintenance: true, foodsafety: true, foodsafetyforms: true, labelprint: true, templog: true, procurement: true, pest: true, tempmon: true, iso: true }
};

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required' });

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user || !user.active)
      return res.status(401).json({ error: 'Invalid username or password' });

    const valid = await user.verifyPassword(password);
    if (!valid)
      return res.status(401).json({ error: 'Invalid username or password' });

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({
      ok: true,
      user: {
        id:          user._id,
        username:    user.username,
        displayName: user.displayName,
        position:    user.position || '',
        role:        user.role,
        permissions: user.permissions
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me  — returns current user (always fresh from DB)
router.get('/me', (req, res, next) => {
  if (BYPASS_AUTH) return res.json({ ok: true, user: BYPASS_USER });
  return requireAuth(req, res, next);
}, async (req, res) => {
  try {
    const dbUser = await User.findById(req.user.id, '-passwordHash');
    if (!dbUser || !dbUser.active)
      return res.status(401).json({ error: 'User not found or inactive' });
    res.json({
      ok: true,
      user: {
        id:          dbUser._id,
        username:    dbUser.username,
        displayName: dbUser.displayName,
        position:    dbUser.position || '',
        role:        dbUser.role,
        permissions: dbUser.permissions
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/notification-preferences — returns current user's preferences
router.get('/notification-preferences', (req, res, next) => {
  if (BYPASS_AUTH) return res.json({ ok: true, preferences: {} });
  return requireAuth(req, res, next);
}, async (req, res) => {
  try {
    const dbUser = await User.findById(req.user.id, 'notificationPreferences');
    if (!dbUser) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, preferences: dbUser.notificationPreferences || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/notification-preferences — update current user's preferences
const ALLOWED_MODULES = ['maintenance', 'foodsafety', 'tempmon', 'procurement', 'pest', 'iso'];
const ALLOWED_EVENTS = {
  maintenance:  ['enabled', 'overdue', 'upcoming', 'issueReported', 'resolved'],
  foodsafety:   ['enabled', 'ncReported', 'ncResolved', 'certExpiring'],
  tempmon:      ['enabled', 'tempAlert', 'tempCritical', 'deviceOffline'],
  procurement:  ['enabled', 'requestSubmitted', 'requestApproved', 'requestRejected'],
  pest:         ['enabled', 'findingReported', 'criticalFinding'],
  iso:          ['enabled', 'recordDue', 'recordOverdue'],
};

router.patch('/notification-preferences', (req, res, next) => {
  if (BYPASS_AUTH) return res.json({ ok: true });
  return requireAuth(req, res, next);
}, async (req, res) => {
  try {
    const dbUser = await User.findById(req.user.id);
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    const body = req.body;
    if (!dbUser.notificationPreferences) dbUser.notificationPreferences = {};

    // Top-level pushEnabled flag
    if (typeof body.pushEnabled === 'boolean') {
      dbUser.notificationPreferences.pushEnabled = body.pushEnabled;
    }

    // Per-module event toggles
    for (const mod of ALLOWED_MODULES) {
      if (body[mod] && typeof body[mod] === 'object') {
        if (!dbUser.notificationPreferences[mod]) dbUser.notificationPreferences[mod] = {};
        for (const evt of ALLOWED_EVENTS[mod]) {
          if (typeof body[mod][evt] === 'boolean') {
            dbUser.notificationPreferences[mod][evt] = body[mod][evt];
          }
        }
      }
    }

    dbUser.markModified('notificationPreferences');
    await dbUser.save();
    res.json({ ok: true, preferences: dbUser.notificationPreferences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
