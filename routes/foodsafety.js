const express = require('express');
const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const FoodSafetyNC = require('../models/FoodSafetyNC');
const { memUpload, uploadBufferToCloudinary } = require('../services/cloudinary-upload');

// Local uploads folder fallback (used when Cloudinary is not configured)
const UPLOADS_DIR = path.join(__dirname, '..', 'foodsafety', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

async function savePhoto(req, folder) {
  if (!req.file) return null;
  // Try Cloudinary first
  const url = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, folder);
  if (url) return url;
  // Fallback: save to local disk
  const ext  = req.file.originalname.split('.').pop().toLowerCase() || 'jpg';
  const name = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), req.file.buffer);
  return '/foodsafety/uploads/' + name;
}

// Create new NC report
router.post('/report', (req, res, next) => {
  memUpload('photo')(req, res, (err) => {
    if (err) console.error('[FoodSafety] Multipart parse error:', err.message);
    next();
  });
}, async (req, res) => {
  try {
    let photoUrl = await savePhoto(req, 'foodsafety/nc');
    const nc = new FoodSafetyNC({
      unit: req.body.unit,
      specificLocation: req.body.specificLocation,
      description: req.body.description,
      priority: req.body.priority || 'Normal',
      reportedBy: req.body.reportedBy,
      photo: photoUrl || undefined
    });
    await nc.save();
    res.status(201).json(nc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List NC reports (with optional filters)
router.get('/list', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unit) filter.unit = req.query.unit;
    if (req.query.status) filter.status = req.query.status;
    const ncs = await FoodSafetyNC.find(filter).sort({ createdAt: -1 });
    res.json(ncs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get NC detail
router.get('/:id', async (req, res) => {
  try {
    const nc = await FoodSafetyNC.findById(req.params.id);
    if (!nc) return res.status(404).json({ error: 'Not found' });
    res.json(nc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve NC
router.post('/:id/resolve', (req, res, next) => {
  memUpload('resolutionPhoto')(req, res, (err) => {
    if (err) console.error('[FoodSafety] Multipart parse error:', err.message);
    next();
  });
}, async (req, res) => {
  try {
    const nc = await FoodSafetyNC.findById(req.params.id);
    if (!nc) return res.status(404).json({ error: 'Not found' });
    let photoUrl = await savePhoto(req, 'foodsafety/resolution');
    nc.status = 'Resolved';
    nc.resolution = {
      resolver: req.body.resolver,
      notes: req.body.notes,
      photo: photoUrl || undefined,
      resolvedAt: new Date()
    };
    await nc.save();
    res.json(nc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete NC report
router.delete('/:id', async (req, res) => {
  try {
    const nc = await FoodSafetyNC.findByIdAndDelete(req.params.id);
    if (!nc) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
