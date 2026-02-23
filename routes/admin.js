const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const { requireAuth, requireAdmin } = require('../services/auth-middleware');

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// GET /api/admin/users  — list all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, '-passwordHash').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users  — create user
router.post('/users', async (req, res) => {
  try {
    const { username, displayName, role, password, permissions } = req.body;
    if (!username || !displayName || !password)
      return res.status(400).json({ error: 'username, displayName and password are required' });
    const user = new User({
      username,
      displayName,
      role:        role || 'user',
      passwordHash: password, // pre-save hook will hash it
      permissions: permissions || {}
    });
    await user.save();
    const saved = user.toObject();
    delete saved.passwordHash;
    res.status(201).json(saved);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already exists' });
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id  — edit user (not password)
router.put('/users/:id', async (req, res) => {
  try {
    const { displayName, role, active, permissions } = req.body;
    const update = {};
    if (displayName  !== undefined) update.displayName  = displayName;
    if (role         !== undefined) update.role         = role;
    if (active       !== undefined) update.active       = active;
    if (permissions  !== undefined) update.permissions  = permissions;
    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, select: '-passwordHash' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/password  — reset password
router.put('/users/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password is required' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.passwordHash = password; // pre-save hook hashes it
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/permissions  — bulk update permissions for all users
// Body: { userId: { maintenance, foodsafety, templog, procurement } }
router.put('/permissions', async (req, res) => {
  try {
    const updates = req.body; // { [userId]: { maintenance: true, ... } }
    const ops = Object.entries(updates).map(([id, perms]) =>
      User.findByIdAndUpdate(id, { $set: { permissions: perms } })
    );
    await Promise.all(ops);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
