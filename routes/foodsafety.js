const express = require('express');
const router = express.Router();
const FoodSafetyNC = require('../models/FoodSafetyNC');
const { memUpload, uploadBufferToCloudinary } = require('../services/cloudinary-upload');

// Create new NC report
router.post('/report', (req, res, next) => {
  memUpload('photo')(req, res, (err) => {
    if (err) console.error('[FoodSafety] Multipart parse error:', err.message);
    next();
  });
}, async (req, res) => {
  try {
    let photoUrl = null;
    if (req.file) {
      photoUrl = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, 'foodsafety/nc');
    }
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
    let photoUrl = null;
    if (req.file) {
      photoUrl = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, 'foodsafety/resolution');
    }
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

module.exports = router;
