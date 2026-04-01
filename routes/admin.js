const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const FoodSafetyFormAssignment = require('../models/FoodSafetyFormAssignment');
const { TEMPLATES, getUnit } = require('../config/foodSafetyChecklistTemplate');
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
    const { username, displayName, position, role, password, permissions } = req.body;
    if (!username || !displayName || !password)
      return res.status(400).json({ error: 'username, displayName and password are required' });
    const user = new User({
      username,
      displayName,
      position: position || '',
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
    const { displayName, position, role, active, permissions } = req.body;
    const update = {};
    if (displayName  !== undefined) update.displayName  = displayName;
    if (position     !== undefined) update.position     = position;
    if (role         !== undefined) update.role         = role;
    if (active       !== undefined) update.active       = active;
    if (permissions  !== undefined) update.permissions  = permissions;
    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, select: '-passwordHash' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await FoodSafetyFormAssignment.updateMany(
      { userId: String(user._id) },
      { $set: { username: user.username, displayName: user.displayName, position: user.position || '', active: user.active } }
    );
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

router.get('/foodsafety-form-templates', async (_req, res) => {
  res.json(TEMPLATES.map((template) => ({
    code: template.code,
    formType: template.formType,
    revision: template.revision,
    title: template.title,
    unitOptions: (template.unitOptions || []).map((unit) => ({
      code: unit.code,
      label: getUnit(template, unit.code).label
    }))
  })));
});

router.get('/foodsafety-form-assignments', async (_req, res) => {
  try {
    const assignments = await FoodSafetyFormAssignment.find({}).sort({ createdAt: -1 }).lean();
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/foodsafety-form-assignments', async (req, res) => {
  try {
    const { userId, templateCode, unitCode } = req.body;
    if (!userId || !templateCode || !unitCode) return res.status(400).json({ error: 'userId, templateCode and unitCode are required' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const template = TEMPLATES.find((entry) => entry.code === templateCode);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const unit = (template.unitOptions || []).find((entry) => entry.code === unitCode);
    if (!unit) return res.status(404).json({ error: 'Unit option not found for template' });
    const assignment = await FoodSafetyFormAssignment.findOneAndUpdate(
      { userId: String(user._id), templateCode, unitCode },
      {
        $set: {
          username: user.username,
          displayName: user.displayName,
          position: user.position || '',
          unitCode,
          active: true
        },
        $setOnInsert: { userId: String(user._id), templateCode, unitCode }
      },
      { upsert: true, new: true, runValidators: true }
    );
    res.status(201).json(assignment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/foodsafety-form-assignments/:id', async (req, res) => {
  try {
    const deleted = await FoodSafetyFormAssignment.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
