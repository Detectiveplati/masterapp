'use strict';
const express     = require('express');
const router      = express.Router();
const mongoose    = require('mongoose');
const IsoEmployee = require('../models/IsoEmployee');
const { requireAuth } = require('../services/auth-middleware');

// Protect all ISO Employees routes
router.use(requireAuth);

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /api/iso-employees
router.get('/', async (req, res) => {
  try {
    const employees = await IsoEmployee.find().sort({ name: 1 }).lean();
    res.json(employees);
  } catch (err) {
    console.error('✗ [ISO Employees] GET /:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/iso-employees
router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Employee name is required' });
    const employee = new IsoEmployee({ name });
    const saved = await employee.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('✗ [ISO Employees] POST /:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/iso-employees/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid employee ID' });
    const employee = await IsoEmployee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    console.error('✗ [ISO Employees] DELETE /:id:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
