'use strict';
const express = require('express');
const router  = express.Router();
const FoodHandlerCert = require('../models/FoodHandlerCert');
const { requireAuth } = require('../services/auth-middleware');

/** Attach computed validityStatus to a plain object */
function addValidity(doc) {
  const obj  = doc.toObject ? doc.toObject() : { ...doc };
  const now  = new Date();
  const soon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  if (obj.isCancelled)         obj.validityStatus = 'invalid';
  else if (obj.expiryDate < now)  obj.validityStatus = 'invalid';
  else if (obj.expiryDate < soon) obj.validityStatus = 'expiring';
  else                            obj.validityStatus = 'valid';
  return obj;
}

/**
 * GET /api/fhc
 * All records — optional ?validity=valid|expiring|invalid&search=&entity=
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.entity) filter.businessEntity = req.query.entity;

    let docs = await FoodHandlerCert.find(filter).sort({ employeeName: 1 }).lean();

    // Compute validity on each record
    const now  = new Date();
    const soon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    docs = docs.map(d => {
      if (d.isCancelled)        d.validityStatus = 'invalid';
      else if (d.expiryDate < now)  d.validityStatus = 'invalid';
      else if (d.expiryDate < soon) d.validityStatus = 'expiring';
      else                          d.validityStatus = 'valid';
      return d;
    });

    // Filter by validity after computing
    if (req.query.validity) {
      docs = docs.filter(d => d.validityStatus === req.query.validity);
    }

    // Full-text search on name
    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      docs = docs.filter(d => d.employeeName.toLowerCase().includes(q));
    }

    console.log(`✓ [FHC] GET / — ${docs.length} records`);
    res.json(docs);
  } catch (err) {
    console.error('✗ [FHC] GET /:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/fhc/entities
 * Distinct list of business entities — for populating the filter dropdown
 */
router.get('/entities', requireAuth, async (req, res) => {
  try {
    const entities = await FoodHandlerCert.distinct('businessEntity');
    res.json(entities.sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/fhc/:id
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await FoodHandlerCert.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Record not found' });
    res.json(addValidity(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fhc
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const data = { ...req.body };
    ['cancellationReason', 'remarks', 'previousCertDate'].forEach(f => {
      if (data[f] === '') delete data[f];
    });
    const doc = await FoodHandlerCert.create(data);
    console.log(`✓ [FHC] Created: ${doc.employeeName}`);
    res.status(201).json(addValidity(doc));
  } catch (err) {
    console.error('✗ [FHC] POST /:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/fhc/import-csv
 * Bulk import — array of records parsed client-side from CSV
 */
router.post('/import-csv', requireAuth, async (req, res) => {
  try {
    const rows = req.body.records;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'No records provided' });
    }

    let inserted = 0;
    let skipped  = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const data = { ...row };
        ['cancellationReason', 'remarks', 'previousCertDate'].forEach(f => {
          if (data[f] === '' || data[f] === null) delete data[f];
        });
        await FoodHandlerCert.create(data);
        inserted++;
      } catch (e) {
        skipped++;
        errors.push({ row: row.employeeName || '?', error: e.message });
      }
    }

    console.log(`✓ [FHC] CSV import: ${inserted} inserted, ${skipped} skipped`);
    res.json({ inserted, skipped, errors });
  } catch (err) {
    console.error('✗ [FHC] import-csv:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/fhc/:id
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await FoodHandlerCert.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Record not found' });
    console.log(`✓ [FHC] Updated: ${doc.employeeName}`);
    res.json(addValidity(doc));
  } catch (err) {
    console.error('✗ [FHC] PATCH:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/fhc/:id
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await FoodHandlerCert.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Record not found' });
    console.log(`✓ [FHC] Deleted: ${doc.employeeName}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('✗ [FHC] DELETE:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
