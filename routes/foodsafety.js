const express = require('express');
const router = express.Router();
const FoodSafetyNC = require('../models/FoodSafetyNC');

// Create new NC report
router.post('/report', async (req, res) => {
  try {
    const nc = new FoodSafetyNC(req.body);
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
router.post('/:id/resolve', async (req, res) => {
  try {
    const nc = await FoodSafetyNC.findById(req.params.id);
    if (!nc) return res.status(404).json({ error: 'Not found' });
    nc.status = 'Resolved';
    nc.resolution = {
      resolver: req.body.resolver,
      notes: req.body.notes,
      photo: req.body.photo,
      resolvedAt: new Date()
    };
    await nc.save();
    res.json(nc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
