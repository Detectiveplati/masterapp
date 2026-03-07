'use strict';
/**
 * Equipment Temperature Monitoring — API Routes
 * Base: /api/tempmon
 *
 * Covers: units, devices, ingest (IoT gateway), alerts,
 *         corrective actions, calibrations, dashboard, reports,
 *         sample-data generator.
 */
const express  = require('express');
const router   = express.Router();

const TempMonUnit             = require('../models/TempMonUnit');
const TempMonDevice           = require('../models/TempMonDevice');
const TempMonReading          = require('../models/TempMonReading');
const TempMonAlert            = require('../models/TempMonAlert');
const TempMonCorrectiveAction = require('../models/TempMonCorrectiveAction');
const TempMonCalibration      = require('../models/TempMonCalibration');

const { requireAuth } = require('../services/auth-middleware');
const { memUpload, uploadBufferToCloudinary } = require('../services/cloudinary-upload');

// Lazily resolve sendPushToPermission from the push router (avoids circular-at-load issues)
function sendPush(title, message, url) {
  try {
    const pushRouter = require('./push');
    if (typeof pushRouter.sendPushToPermission === 'function') {
      pushRouter.sendPushToPermission('tempmon', { title, message, url }).catch(() => {});
    }
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════
// GATEWAY INGEST AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════
function requireGatewayKey(req, res, next) {
  const key = process.env.GATEWAY_API_KEY;
  if (!key) return next(); // key not configured — allow (dev mode)
  if (req.headers['x-gateway-key'] === key) return next();
  return res.status(401).json({ error: 'Invalid or missing gateway API key' });
}

// ═══════════════════════════════════════════════════════════════════
// UNITS
// ═══════════════════════════════════════════════════════════════════

// GET /api/tempmon/units — all active units with last reading + open alert count
router.get('/units', requireAuth, async (req, res) => {
  try {
    const units = await TempMonUnit.find({ active: true }).sort({ name: 1 }).lean();

    // Attach latest reading and open alert count to each unit
    const unitIds = units.map(u => u._id);
    const [latestReadings, alertCounts] = await Promise.all([
      TempMonReading.aggregate([
        { $match: { unit: { $in: unitIds } } },
        { $sort: { recordedAt: -1 } },
        { $group: { _id: '$unit', value: { $first: '$value' }, recordedAt: { $first: '$recordedAt' }, flagged: { $first: '$flagged' } } }
      ]),
      TempMonAlert.aggregate([
        { $match: { unit: { $in: unitIds }, status: { $in: ['open', 'acknowledged'] } } },
        { $group: { _id: '$unit', count: { $sum: 1 } } }
      ])
    ]);

    const readingMap = {};
    latestReadings.forEach(r => { readingMap[r._id.toString()] = r; });
    const alertMap = {};
    alertCounts.forEach(a => { alertMap[a._id.toString()] = a.count; });

    const result = units.map(u => ({
      ...u,
      latestReading: readingMap[u._id.toString()] || null,
      openAlerts:    alertMap[u._id.toString()] || 0
    }));

    res.json(result);
  } catch (err) {
    console.error('✗ [TempMon] GET /units:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tempmon/units/:id — unit detail
router.get('/units/:id', requireAuth, async (req, res) => {
  try {
    const unit = await TempMonUnit.findById(req.params.id).lean();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const devices = await TempMonDevice.find({ unit: unit._id, active: true }).sort({ label: 1 }).lean();
    res.json({ ...unit, devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tempmon/units
router.post('/units', requireAuth, async (req, res) => {
  try {
    const { name, type, location, criticalMin, criticalMax, warningBuffer, targetTemp, notes } = req.body;
    const unit = new TempMonUnit({ name, type, location, criticalMin, criticalMax, warningBuffer, targetTemp, notes });
    await unit.save();
    console.log('✓ [TempMon] Created unit:', name);
    res.status(201).json(unit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/tempmon/units/:id
router.put('/units/:id', requireAuth, async (req, res) => {
  try {
    const fields = ['name', 'type', 'location', 'criticalMin', 'criticalMax', 'warningBuffer', 'targetTemp', 'notes', 'active'];
    const update = {};
    fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    const unit = await TempMonUnit.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json(unit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/tempmon/units/:id — soft delete
router.delete('/units/:id', requireAuth, async (req, res) => {
  try {
    const unit = await TempMonUnit.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DEVICES
// ═══════════════════════════════════════════════════════════════════

// GET /api/tempmon/devices
router.get('/devices', requireAuth, async (req, res) => {
  try {
    const devices = await TempMonDevice.find().populate('unit', 'name type').sort({ label: 1 }).lean();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tempmon/devices
router.post('/devices', requireAuth, async (req, res) => {
  try {
    const { unit, deviceId, label, firmware, expectedIntervalMinutes, calibrationIntervalDays } = req.body;
    const device = new TempMonDevice({ unit, deviceId, label, firmware, expectedIntervalMinutes, calibrationIntervalDays });
    await device.save();
    console.log('✓ [TempMon] Registered device:', deviceId);
    res.status(201).json(device);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Device ID already registered' });
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/tempmon/devices/:id
router.put('/devices/:id', requireAuth, async (req, res) => {
  try {
    const fields = ['label', 'firmware', 'unit', 'active', 'expectedIntervalMinutes', 'calibrationIntervalDays'];
    const update = {};
    fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    const device = await TempMonDevice.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/tempmon/devices/:id — soft decommission
router.delete('/devices/:id', requireAuth, async (req, res) => {
  try {
    const device = await TempMonDevice.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// INGEST — IoT gateway endpoint
// Auth: X-Gateway-Key header (not a user JWT)
// ═══════════════════════════════════════════════════════════════════

router.post('/ingest', requireGatewayKey, async (req, res) => {
  try {
    const { gatewayId = '', readings: rawReadings } = req.body;
    if (!Array.isArray(rawReadings) || rawReadings.length === 0) {
      return res.status(400).json({ error: 'readings array is required and must not be empty' });
    }

    const results = { saved: 0, skipped: 0, alerts: 0 };

    for (const raw of rawReadings) {
      const { deviceId, value, recordedAt, batteryPct } = raw;
      if (typeof value !== 'number' || !deviceId) { results.skipped++; continue; }

      const device = await TempMonDevice.findOne({ deviceId, active: true }).populate('unit');
      if (!device || !device.unit) { results.skipped++; continue; }

      const unit = device.unit;
      const ts   = recordedAt ? new Date(recordedAt) : new Date();

      // Determine if reading is flagged
      const flagged = value < unit.criticalMin || value > unit.criticalMax;

      // Save reading
      const reading = new TempMonReading({
        device:     device._id,
        unit:       unit._id,
        value,
        recordedAt: ts,
        receivedAt: new Date(),
        gatewayId,
        flagged
      });
      await reading.save();
      results.saved++;

      // Update device heartbeat
      device.lastSeenAt = new Date();
      if (batteryPct !== undefined) device.batteryPct = batteryPct;
      await device.save();

      // Close any open device_offline alert for this device
      await closeOfflineAlertIfOpen(device._id);

      // Alert logic
      const alertType = evaluateAlertType(value, unit);
      if (alertType) {
        const created = await maybeCreateAlert(unit, device, reading._id, alertType, value);
        if (created) results.alerts++;
      } else {
        // Value back in range — auto-resolve open warning/critical alerts for this unit
        await autoResolveAlerts(unit._id);
      }
    }

    res.json({ ok: true, ...results });
  } catch (err) {
    console.error('✗ [TempMon] Ingest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Alert helpers ────────────────────────────────────────────────────────────

function evaluateAlertType(value, unit) {
  const { criticalMin, criticalMax, warningBuffer = 2 } = unit;
  if (value < criticalMin)                     return 'critical_low';
  if (value > criticalMax)                     return 'critical_high';
  if (value < criticalMin + warningBuffer)     return 'warning_low';
  if (value > criticalMax - warningBuffer)     return 'warning_high';
  return null;
}

async function maybeCreateAlert(unit, device, readingId, type, value) {
  // Avoid duplicate open alerts — one per type per unit
  const existing = await TempMonAlert.findOne({ unit: unit._id, type, status: { $in: ['open', 'acknowledged'] } });
  if (existing) return false;

  const alert = new TempMonAlert({ unit: unit._id, device: device._id, reading: readingId, type, value });
  await alert.save();

  const isCritical = type.startsWith('critical_');
  const emoji = isCritical ? '🔴' : '🟡';
  const label = type === 'critical_high' ? `CRITICAL HIGH — ${value}°C (max ${unit.criticalMax}°C)`
              : type === 'critical_low'  ? `CRITICAL LOW — ${value}°C (min ${unit.criticalMin}°C)`
              : type === 'warning_high'  ? `Warning — temperature rising to ${value}°C`
              :                            `Warning — temperature dropping to ${value}°C`;

  sendPush(`${emoji} ${unit.name}: ${label}`, `Check the unit immediately. Alert created.`, '/tempmon/alerts.html');
  console.log(`✓ [TempMon] Alert created: ${type} for "${unit.name}" at ${value}°C`);
  return true;
}

async function autoResolveAlerts(unitId) {
  await TempMonAlert.updateMany(
    { unit: unitId, type: { $in: ['critical_high', 'critical_low', 'warning_high', 'warning_low'] }, status: 'open' },
    { $set: { status: 'resolved', resolvedAt: new Date(), resolveNote: 'Temperature returned to normal range automatically' } }
  );
}

async function closeOfflineAlertIfOpen(deviceId) {
  await TempMonAlert.updateMany(
    { device: deviceId, type: 'device_offline', status: 'open' },
    { $set: { status: 'resolved', resolvedAt: new Date(), resolveNote: 'Device resumed reporting' } }
  );
}

// ═══════════════════════════════════════════════════════════════════
// READINGS
// ═══════════════════════════════════════════════════════════════════

// GET /api/tempmon/readings/:unitId?from=&to=&limit=&includeSample=
router.get('/readings/:unitId', requireAuth, async (req, res) => {
  try {
    const { from, to, limit = 500, includeSample = 'true' } = req.query;
    const query = { unit: req.params.unitId };
    if (from || to) {
      query.recordedAt = {};
      if (from) query.recordedAt.$gte = new Date(from);
      if (to)   query.recordedAt.$lte = new Date(to);
    }
    if (includeSample === 'false') query.isSample = false;

    const readings = await TempMonReading.find(query)
      .sort({ recordedAt: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json(readings.reverse()); // return in ascending order for charts
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tempmon/readings/:unitId/export — CSV download
router.get('/readings/:unitId/export', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const unit = await TempMonUnit.findById(req.params.unitId).lean();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const query = { unit: req.params.unitId };
    if (from || to) {
      query.recordedAt = {};
      if (from) query.recordedAt.$gte = new Date(from);
      if (to)   query.recordedAt.$lte = new Date(to);
    }

    const readings = await TempMonReading.find(query).sort({ recordedAt: 1 }).populate('device', 'deviceId label').lean();

    const lines = ['Timestamp,Device ID,Device Label,Temp (°C),Flagged,Sample'];
    for (const r of readings) {
      lines.push([
        new Date(r.recordedAt).toISOString(),
        r.device?.deviceId || '',
        `"${r.device?.label || ''}"`,
        r.value,
        r.flagged ? 'YES' : 'NO',
        r.isSample ? 'YES' : 'NO'
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tempmon-${unit.name.replace(/\s+/g, '_')}-${Date.now()}.csv"`);
    res.send(lines.join('\r\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/tempmon/alerts?status=&unitId=&from=&to=&limit=
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const { status, unitId, from, to, limit = 100 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (unitId) query.unit   = unitId;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to)   query.createdAt.$lte = new Date(to);
    }
    const alerts = await TempMonAlert.find(query)
      .populate('unit', 'name type criticalMin criticalMax')
      .populate('device', 'deviceId label')
      .populate('correctiveAction')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tempmon/alerts/:id
router.get('/alerts/:id', requireAuth, async (req, res) => {
  try {
    const alert = await TempMonAlert.findById(req.params.id)
      .populate('unit')
      .populate('device')
      .populate('correctiveAction')
      .lean();
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tempmon/alerts/:id/acknowledge
router.put('/alerts/:id/acknowledge', requireAuth, async (req, res) => {
  try {
    const { acknowledgedBy } = req.body;
    const alert = await TempMonAlert.findOneAndUpdate(
      { _id: req.params.id, status: 'open' },
      { $set: { status: 'acknowledged', acknowledgedBy: acknowledgedBy || req.user?.displayName || '', acknowledgedAt: new Date() } },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: 'Alert not found or not in open state' });
    res.json(alert);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/tempmon/alerts/:id/resolve
router.put('/alerts/:id/resolve', requireAuth, async (req, res) => {
  try {
    const { resolvedBy, resolveNote } = req.body;
    const alert = await TempMonAlert.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['open', 'acknowledged'] } },
      { $set: { status: 'resolved', resolvedBy: resolvedBy || req.user?.displayName || '', resolvedAt: new Date(), resolveNote: resolveNote || '' } },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: 'Alert not found or already resolved' });
    res.json(alert);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CORRECTIVE ACTIONS
// ═══════════════════════════════════════════════════════════════════

// POST /api/tempmon/corrective-actions
router.post('/corrective-actions', requireAuth, async (req, res) => {
  try {
    const { alert: alertId, actionTaken, takenBy, rootCause, preventiveMeasure,
            productDisposalRequired, productDisposalDetails, outcome } = req.body;

    const alert = await TempMonAlert.findById(alertId);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const ca = new TempMonCorrectiveAction({
      alert: alertId, unit: alert.unit,
      actionTaken, takenBy, rootCause, preventiveMeasure,
      productDisposalRequired, productDisposalDetails, outcome
    });
    await ca.save();

    // Link CA back to the alert and resolve it
    alert.correctiveAction = ca._id;
    if (alert.status !== 'resolved') {
      alert.status     = 'resolved';
      alert.resolvedBy = takenBy || '';
      alert.resolvedAt = new Date();
      alert.resolveNote = 'Closed by corrective action';
    }
    await alert.save();

    console.log('✓ [TempMon] Corrective action logged for alert', alertId);
    res.status(201).json(ca);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/tempmon/corrective-actions/:id
router.get('/corrective-actions/:id', requireAuth, async (req, res) => {
  try {
    const ca = await TempMonCorrectiveAction.findById(req.params.id)
      .populate('alert').populate('unit', 'name type').lean();
    if (!ca) return res.status(404).json({ error: 'Corrective action not found' });
    res.json(ca);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tempmon/corrective-actions/:id
router.put('/corrective-actions/:id', requireAuth, async (req, res) => {
  try {
    const fields = ['actionTaken', 'takenBy', 'takenAt', 'rootCause', 'preventiveMeasure',
                    'productDisposalRequired', 'productDisposalDetails', 'verifiedBy', 'verifiedAt', 'outcome'];
    const update = {};
    fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    const ca = await TempMonCorrectiveAction.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!ca) return res.status(404).json({ error: 'Corrective action not found' });
    res.json(ca);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CALIBRATIONS
// ═══════════════════════════════════════════════════════════════════

// GET /api/tempmon/calibrations?deviceId=
router.get('/calibrations', requireAuth, async (req, res) => {
  try {
    const query = req.query.deviceId ? { device: req.query.deviceId } : {};
    const cals = await TempMonCalibration.find(query)
      .populate('device', 'deviceId label unit')
      .sort({ calibratedAt: -1 })
      .lean();
    res.json(cals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tempmon/calibrations/due — devices due within next 30 days
router.get('/calibrations/due', requireAuth, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const devices = await TempMonDevice.find({
      active: true,
      $or: [
        { calibrationDue: { $lte: cutoff } },
        { calibrationDue: null }
      ]
    }).populate('unit', 'name type').lean();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tempmon/calibrations (multipart — optional cert upload)
router.post('/calibrations', requireAuth, memUpload('certificate'), async (req, res) => {
  try {
    const { deviceId, calibratedBy, calibratedAt, referenceTemp, readingBefore,
            readingAfter, offsetApplied, nextDueDate, notes } = req.body;

    let certificate = '';
    let certificateId = '';
    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, {
        folder: 'tempmon/calibrations',
        resource_type: 'auto'
      });
      certificate   = result.secure_url;
      certificateId = result.public_id;
    }

    const cal = new TempMonCalibration({
      device: deviceId, calibratedBy, calibratedAt: new Date(calibratedAt),
      referenceTemp: referenceTemp !== '' ? Number(referenceTemp) : null,
      readingBefore: readingBefore !== '' ? Number(readingBefore) : null,
      readingAfter:  readingAfter  !== '' ? Number(readingAfter)  : null,
      offsetApplied: offsetApplied !== '' ? Number(offsetApplied) : 0,
      nextDueDate:   nextDueDate   ? new Date(nextDueDate)        : null,
      notes, certificate, certificateId
    });
    await cal.save();

    // Update device calibration fields
    const updateData = { lastCalibratedAt: new Date(calibratedAt) };
    if (nextDueDate) updateData.calibrationDue = new Date(nextDueDate);
    await TempMonDevice.findByIdAndUpdate(deviceId, { $set: updateData });

    console.log('✓ [TempMon] Calibration logged for device', deviceId);
    res.status(201).json(cal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const [totalUnits, openAlerts, offlineDevices, dueCalibrations] = await Promise.all([
      TempMonUnit.countDocuments({ active: true }),
      TempMonAlert.countDocuments({ status: { $in: ['open', 'acknowledged'] } }),
      TempMonDevice.countDocuments({
        active: true,
        lastSeenAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) } // not seen in 15 min
      }),
      TempMonDevice.countDocuments({
        active: true,
        $or: [
          { calibrationDue: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
          { calibrationDue: null }
        ]
      })
    ]);

    // Units currently out of range (have an open critical alert)
    const unitsOutOfRange = await TempMonAlert.distinct('unit', {
      status: { $in: ['open', 'acknowledged'] },
      type:   { $in: ['critical_high', 'critical_low'] }
    });

    res.json({ totalUnits, openAlerts, offlineDevices, dueCalibrations, unitsOutOfRange: unitsOutOfRange.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/tempmon/reports/daily?from=&to=&unitId=
router.get('/reports/daily', requireAuth, async (req, res) => {
  try {
    const { from, to, unitId } = req.query;
    const match = {};
    if (unitId)      match.unit = require('mongoose').Types.ObjectId.createFromHexString(unitId);
    if (from || to) {
      match.recordedAt = {};
      if (from) match.recordedAt.$gte = new Date(from);
      if (to)   match.recordedAt.$lte = new Date(to);
    }
    match.isSample = false; // exclude sample data from reports

    const data = await TempMonReading.aggregate([
      { $match: match },
      { $group: {
          _id: {
            unit: '$unit',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$recordedAt' } }
          },
          min: { $min: '$value' },
          max: { $max: '$value' },
          avg: { $avg: '$value' },
          count: { $sum: 1 },
          excursions: { $sum: { $cond: ['$flagged', 1, 0] } }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tempmon/reports/compliance?from=&to=
router.get('/reports/compliance', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = { isSample: false };
    if (from || to) {
      match.recordedAt = {};
      if (from) match.recordedAt.$gte = new Date(from);
      if (to)   match.recordedAt.$lte = new Date(to);
    }

    const data = await TempMonReading.aggregate([
      { $match: match },
      { $group: {
          _id: '$unit',
          total:      { $sum: 1 },
          excursions: { $sum: { $cond: ['$flagged', 1, 0] } }
        }
      },
      { $lookup: { from: 'tempmonunits', localField: '_id', foreignField: '_id', as: 'unitInfo' } },
      { $unwind: { path: '$unitInfo', preserveNullAndEmptyArrays: true } },
      { $project: {
          unitName: '$unitInfo.name',
          unitType: '$unitInfo.type',
          total: 1, excursions: 1,
          compliancePct: {
            $multiply: [
              { $divide: [{ $subtract: ['$total', '$excursions'] }, '$total'] },
              100
            ]
          }
        }
      },
      { $sort: { compliancePct: 1 } }
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SAMPLE DATA GENERATOR
// ═══════════════════════════════════════════════════════════════════

// POST /api/tempmon/sample-data — admin only
router.post('/sample-data', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { unitId, hours = 72, intervalMinutes = 5 } = req.body;
    const units = unitId
      ? await TempMonUnit.find({ _id: unitId, active: true })
      : await TempMonUnit.find({ active: true });

    if (units.length === 0) return res.status(404).json({ error: 'No active units found' });

    let totalInserted = 0;

    for (const unit of units) {
      const devices = await TempMonDevice.find({ unit: unit._id, active: true });
      if (devices.length === 0) continue;

      const now       = new Date();
      const startTime = new Date(now - hours * 60 * 60 * 1000);
      const steps     = Math.floor((hours * 60) / intervalMinutes);
      const target    = unit.targetTemp != null ? unit.targetTemp : (unit.criticalMin + unit.criticalMax) / 2;
      const range     = (unit.criticalMax - unit.criticalMin) / 6; // natural variance

      // Delete existing sample readings for this unit in this time window
      await TempMonReading.deleteMany({ unit: unit._id, isSample: true, recordedAt: { $gte: startTime } });

      // Plan excursion windows (2–4 events, each 15–30 min long)
      const numExcursions = 2 + Math.floor(Math.random() * 3);
      const excursions = [];
      for (let e = 0; e < numExcursions; e++) {
        const startStep = Math.floor(Math.random() * (steps - 30));
        const duration  = 3 + Math.floor(Math.random() * 6); // in steps
        excursions.push({ start: startStep, end: startStep + duration });
      }

      const readings = [];
      for (let i = 0; i < steps; i++) {
        const ts        = new Date(startTime.getTime() + i * intervalMinutes * 60 * 1000);
        const inExcursion = excursions.some(ex => i >= ex.start && i <= ex.end);
        let value;

        if (inExcursion) {
          // Push outside critical limits
          const breach = unit.type === 'warmer'
            ? unit.criticalMax + 1 + Math.random() * 4
            : unit.criticalMin - 1 - Math.random() * 4;
          value = Math.round(breach * 10) / 10;
        } else {
          // Normal distribution around target
          const u1 = Math.random(), u2 = Math.random();
          const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          value = Math.round((target + z * range) * 10) / 10;
          // Clamp to within warning zone (not normal to be at exact limit during stable operation)
          const lo = unit.criticalMin + unit.warningBuffer + 0.5;
          const hi = unit.criticalMax - unit.warningBuffer - 0.5;
          value = Math.max(lo, Math.min(hi, value));
        }

        const flagged = value < unit.criticalMin || value > unit.criticalMax;

        for (const device of devices) {
          readings.push({
            device:     device._id,
            unit:       unit._id,
            value,
            recordedAt: ts,
            receivedAt: ts,
            gatewayId:  'SAMPLE_GENERATOR',
            flagged,
            isSample:   true
          });
        }
      }

      await TempMonReading.insertMany(readings, { ordered: false });
      totalInserted += readings.length;
    }

    console.log('✓ [TempMon] Sample data generated:', totalInserted, 'readings');
    res.json({ ok: true, inserted: totalInserted });
  } catch (err) {
    console.error('✗ [TempMon] Sample data error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tempmon/sample-data/:unitId — purge sample readings for a unit
router.delete('/sample-data/:unitId', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await TempMonReading.deleteMany({ unit: req.params.unitId, isSample: true });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DEVICE-OFFLINE CRON
// Checks every 5 minutes for devices that have stopped reporting.
// Called once at server startup via module-level setInterval.
// ═══════════════════════════════════════════════════════════════════

async function checkOfflineDevices() {
  try {
    const devices = await TempMonDevice.find({ active: true }).populate('unit', 'name').lean();
    for (const device of devices) {
      if (!device.lastSeenAt) continue;
      const cutoff = new Date(Date.now() - device.expectedIntervalMinutes * 2 * 60 * 1000);
      if (device.lastSeenAt < cutoff) {
        // Check if offline alert already open for this device
        const existing = await TempMonAlert.findOne({ device: device._id, type: 'device_offline', status: 'open' });
        if (!existing) {
          await TempMonAlert.create({
            unit:   device.unit._id,
            device: device._id,
            type:   'device_offline',
            status: 'open'
          });
          sendPush(
            `⚫ ${device.label || device.deviceId} offline`,
            `Device on "${device.unit.name}" has stopped reporting.`,
            '/tempmon/alerts.html'
          );
          console.log('✓ [TempMon] Device offline alert created for:', device.deviceId);
        }
      }
    }
  } catch (err) {
    console.error('✗ [TempMon] Offline check error:', err.message);
  }
}

// Start the cron only once (guard against hot-reload double-start)
if (!global._tempmonOfflineCronStarted) {
  global._tempmonOfflineCronStarted = true;
  setInterval(checkOfflineDevices, 5 * 60 * 1000);
  console.log('✓ [TempMon] Device offline cron started (5-min interval)');
}

module.exports = router;
