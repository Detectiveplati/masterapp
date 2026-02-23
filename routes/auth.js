const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../services/auth-middleware');

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

// GET /api/auth/me  — returns current user from token
router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

module.exports = router;
