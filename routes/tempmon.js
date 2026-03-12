'use strict';
/**
 * Equipment Temperature Monitoring — API Routes
 * Base: /api/tempmon
 *
 * Covers: units, devices, ingest (IoT gateway), alerts,
 *         corrective actions, calibrations, dashboard, reports.
 */
const express  = require('express');
const router   = express.Router();

const TempMonUnit             = require('../models/TempMonUnit');
const TempMonDevice           = require('../models/TempMonDevice');
const TempMonReading          = require('../models/TempMonReading');
const TempMonAlert            = require('../models/TempMonAlert');
const TempMonCorrectiveAction = require('../models/TempMonCorrectiveAction');
const TempMonCalibration      = require('../models/TempMonCalibration');
const TempMonConfig           = require('../models/TempMonConfig');

const { requireAuth, requireAdmin } = require('../services/auth-middleware');
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
    const { name, type, location, area, criticalMin, criticalMax, warningBuffer, targetTemp, notes, alertThresholdMinutes } = req.body;
    const unit = new TempMonUnit({ name, type, location, area, criticalMin, criticalMax, warningBuffer, targetTemp, notes, alertThresholdMinutes });
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
    const fields = ['name', 'type', 'location', 'area', 'criticalMin', 'criticalMax', 'warningBuffer', 'targetTemp', 'notes', 'active', 'inUse', 'inUseComment', 'alertThresholdMinutes'];
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

      // Skip duplicate — same device + same sensor timestamp + same value already stored
      const exists = await TempMonReading.exists({ device: device._id, recordedAt: ts, value });
      if (exists) { results.skipped++; continue; }

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

      // Update warmer power state (on/off/fault detection) — no-op for non-warmer units
      await updateWarmerState(unit, value, ts);

      // Alert logic
      const alertType = evaluateAlertType(value, unit);
      if (alertType) {
        const created = await maybeCreateOrNotifyAlert(unit, device, reading._id, alertType, value, ts);
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

async function maybeCreateOrNotifyAlert(unit, device, readingId, type, value, readingTs) {
  // Skip alert creation entirely when unit is marked as not in use
  if (unit.inUse === false) return;

  // Check if there is already an open/acknowledged alert for this unit+type
  // (covers restarts where in-memory state is lost)
  const existing = await TempMonAlert.findOne({ unit: unit._id, type, status: { $in: ['open', 'acknowledged'] } });
  if (existing) return false; // already alerted — no duplicate

  // Load push delays from DB config (cached 5 min)
  const cfg = await getPushConfig();
  const thresholdMs = type.startsWith('critical_')
    ? (cfg.pushDelayCriticalMinutes || 60) * 60 * 1000
    : (cfg.pushDelayWarningMinutes  || 120) * 60 * 1000;
  const thresholdLabel = type.startsWith('critical_')
    ? `${cfg.pushDelayCriticalMinutes || 60} min`
    : `${cfg.pushDelayWarningMinutes  || 120} min`;

  // Use the reading's own recordedAt timestamp so buffered readings from distant
  // sensors are evaluated against sensor-time, not server-arrival-time.
  const ts = (readingTs instanceof Date ? readingTs : new Date(readingTs || Date.now())).getTime();

  // In-memory excursion tracker: only raise the alert after the full threshold period
  if (!global._tempmonExcursionStart) global._tempmonExcursionStart = {};
  const key = `${unit._id}_${type}`;

  if (!global._tempmonExcursionStart[key]) {
    // First reading out of range for this unit+type — record the sensor timestamp
    global._tempmonExcursionStart[key] = ts;
    console.log(`⏱  [TempMon] Excursion started (${thresholdLabel} required): ${type} for "${unit.name}" at ${value}°C`);
    return false;
  }

  const elapsedMs = ts - global._tempmonExcursionStart[key];
  if (elapsedMs < thresholdMs) return false; // still within grace period

  // Threshold exceeded — create alert record and send push immediately
  const alert = new TempMonAlert({
    unit: unit._id, device: device._id, reading: readingId, type, value,
    pushSentAt:       new Date(),
    notificationSent: true
  });
  await alert.save();

  const isCritical = type.startsWith('critical_');
  const emoji = isCritical ? '🔴' : '🟡';
  const label = buildAlertLabel(type, value, unit);
  sendPush(`${emoji} ${unit.name}: ${label}`,
    `Temperature has been out of range for ${thresholdLabel}. Check the unit.`,
    '/tempmon/alerts.html');
  console.log(`✓ [TempMon] Alert raised + push sent after ${thresholdLabel}: ${type} for "${unit.name}" at ${value}°C`);

  // Keep the key so further readings don't re-trigger; cleared when temp returns to normal
  return true;
}

function buildAlertLabel(type, value, unit) {
  return type === 'critical_high' ? `CRITICAL HIGH — ${value}°C (max ${unit.criticalMax}°C)`
       : type === 'critical_low'  ? `CRITICAL LOW — ${value}°C (min ${unit.criticalMin}°C)`
       : type === 'warning_high'  ? `Warning — temperature rising to ${value}°C`
       :                            `Warning — temperature dropping to ${value}°C`;
}

async function autoResolveAlerts(unitId) {
  // Clear in-memory excursion timers for this unit so the next excursion starts a fresh countdown
  if (global._tempmonExcursionStart) {
    const prefix = String(unitId) + '_';
    Object.keys(global._tempmonExcursionStart).forEach(k => {
      if (k.startsWith(prefix)) delete global._tempmonExcursionStart[k];
    });
  }
  await TempMonAlert.updateMany(
    { unit: unitId, type: { $in: ['critical_high', 'critical_low', 'warning_high', 'warning_low'] }, status: { $in: ['open', 'acknowledged'] } },
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
    const { from, to, limit = 2500 } = req.query;
    const query = { unit: req.params.unitId };
    if (from || to) {
      query.recordedAt = {};
      if (from) query.recordedAt.$gte = new Date(from);
      if (to)   query.recordedAt.$lte = new Date(to);
    }

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

    const lines = ['Timestamp,Device ID,Device Label,Temp (°C),RH (%),Battery (V),RSSI (dBm),Flagged'];
    for (const r of readings) {
      lines.push([
        new Date(r.recordedAt).toISOString(),
        r.device?.deviceId || '',
        `"${r.device?.label || ''}"`,
        r.value,
        r.humidity != null ? r.humidity : '',
        r.battery  != null ? r.battery  : '',
        r.rssi     != null ? r.rssi     : '',
        r.flagged ? 'YES' : 'NO'
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
    // 'active' = open + acknowledged (excludes resolved)
    if (status) query.status = status === 'active' ? { $in: ['open', 'acknowledged'] } : status;
    if (unitId) query.unit   = unitId;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to)   query.createdAt.$lte = new Date(to);
    }
    const alerts = await TempMonAlert.find(query)
      .populate('unit', 'name type criticalMin criticalMax alertThresholdMinutes')
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
    const match = {};
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

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

// GET /api/tempmon/config
router.get('/config', requireAuth, async (req, res) => {
  try {
    const cfg = await TempMonConfig.findOneAndUpdate(
      { key: 'global' },
      { $setOnInsert: { key: 'global' } },
      { upsert: true, new: true }
    );
    res.json(cfg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tempmon/config
router.put('/config', requireAuth, async (req, res) => {
  try {
    const { pushDelayCriticalMinutes, pushDelayWarningMinutes } = req.body;
    const update = {};
    if (pushDelayCriticalMinutes !== undefined) update.pushDelayCriticalMinutes = Math.max(0, parseInt(pushDelayCriticalMinutes) || 0);
    if (pushDelayWarningMinutes  !== undefined) update.pushDelayWarningMinutes  = Math.max(0, parseInt(pushDelayWarningMinutes)  || 0);
    const cfg = await TempMonConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: update },
      { upsert: true, new: true }
    );
    // Invalidate in-memory cache
    _pushConfigCache = null;
    res.json(cfg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── In-memory push config cache (TTL 5 min) ────────────────────────
let _pushConfigCache = null;
let _pushConfigCacheTs = 0;
async function getPushConfig() {
  const now = Date.now();
  if (_pushConfigCache && now - _pushConfigCacheTs < 5 * 60 * 1000) return _pushConfigCache;
  const cfg = await TempMonConfig.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global' } },
    { upsert: true, new: true }
  );
  _pushConfigCache = cfg;
  _pushConfigCacheTs = now;
  return cfg;
}

// POST /api/tempmon/test-push — send a test push notification to all tempmon subscribers
router.post('/test-push', requireAuth, async (req, res) => {
  try {
    const { unitId } = req.body;
    let title   = '🔔 Test Push Notification';
    let message = 'This is a test alert from Equipment Temp Monitor.';
    if (unitId) {
      const unit = await TempMonUnit.findById(unitId).lean();
      if (unit) {
        title   = `🔔 Test: ${unit.name}`;
        message = `Push notifications are working for ${unit.name}.`;
      }
    }
    sendPush(title, message, '/tempmon/alerts.html');
    res.json({ ok: true });
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
      const cutoff = new Date(Date.now() - 30 * 60 * 1000); // alert after 30 min of no readings
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

// Start offline-check cron only once (guard against hot-reload double-start)
if (!global._tempmonOfflineCronStarted) {
  global._tempmonOfflineCronStarted = true;
  setInterval(checkOfflineDevices, 5 * 60 * 1000);
  console.log('✓ [TempMon] Device offline cron started (5-min interval)');
}

// Also run a periodic check for pending push notifications (alerts waiting on threshold)
// Runs every 60 seconds so threshold-based pushes fire within ~1 min of being due.
async function checkPendingPushes() {
  try {
    // Find open alerts that haven't had a push sent yet
    const pending = await TempMonAlert.find({
      pushSentAt: null,
      status:     { $in: ['open', 'acknowledged'] },
      type:       { $in: ['critical_high', 'critical_low', 'warning_high', 'warning_low'] }
    }).populate('unit').lean();

    if (!pending.length) return;

    // Load global push config once for the whole batch
    const cfg = await getPushConfig();
    const criticalMs = (cfg.pushDelayCriticalMinutes || 60)  * 60 * 1000;
    const warningMs  = (cfg.pushDelayWarningMinutes  || 120) * 60 * 1000;

    for (const alert of pending) {
      const unit = alert.unit;
      if (!unit) continue;
      if (unit.inUse === false) continue; // skip paused units

      const thresholdMs = alert.type.startsWith('critical_') ? criticalMs : warningMs;
      const alertAgeMs  = Date.now() - new Date(alert.createdAt).getTime();

      if (alertAgeMs >= thresholdMs) {
        await TempMonAlert.updateOne({ _id: alert._id }, { pushSentAt: new Date(), notificationSent: true });
        const isCritical = alert.type.startsWith('critical_');
        const emoji = isCritical ? '🔴' : '🟡';
        const label = buildAlertLabel(alert.type, alert.value, unit);
        const delayLabel = isCritical
          ? `${cfg.pushDelayCriticalMinutes || 60} min`
          : `${cfg.pushDelayWarningMinutes  || 120} min`;
        sendPush(`${emoji} ${unit.name}: ${label}`,
          `Temperature has been out of range for ${delayLabel}. Check the unit.`,
          '/tempmon/alerts.html');
        console.log(`✓ [TempMon] Pending push fired (${delayLabel} threshold): ${alert.type} for "${unit.name}"`);
      }
    }
  } catch (err) {
    console.error('✗ [TempMon] Pending push check error:', err.message);
  }
}

if (!global._tempmonPushCronStarted) {
  global._tempmonPushCronStarted = true;
  setInterval(checkPendingPushes, 60 * 1000); // every minute
  console.log('✓ [TempMon] Pending push cron started (1-min interval)');
}

// ═══════════════════════════════════════════════════════════════════
// WARMER STATE MACHINE
// ═══════════════════════════════════════════════════════════════════
// Temperature zones (relative to unit.criticalMin as targetLow, e.g. 60°C):
//   Room   : temp ≤ roomTempCeiling (35°C)      → off or cooling down
//   Low    : roomCeiling < temp ≤ warmupStart   → ambiguous, treated as cooling
//   Mid    : warmupStart < temp < targetLow     → warming up (or fault if too long)
//   Active : temp ≥ targetLow (criticalMin)     → warmer working normally
//
// State transitions:
//   off        → warming_up : temp enters Mid zone (turned on)
//   warming_up → active     : temp reaches Active zone
//   warming_up → fault      : stuck in Mid zone for faultMinutes without reaching target
//   active     → cooling    : temp drops below Active zone
//   cooling    → off        : sustained at Room temp for offConfirmMinutes
//   fault      → active     : temp finally reaches Active zone (self-resolved)
//   fault      → cooling    : temp drops to Room zone
// ───────────────────────────────────────────────────────────────────
async function updateWarmerState(unit, value, readingTs) {
  if (unit.type !== 'warmer') return;

  const cfg          = unit.warmerStateConfig || {};
  const roomCeiling  = cfg.roomTempCeiling   ?? 35;
  const warmupStart  = cfg.warmupStartTemp   ?? 40;
  const targetLow    = unit.criticalMin;              // e.g. 60°C
  const offConfirmMs = (cfg.offConfirmMinutes ?? 20) * 60000;
  const faultMs      = (cfg.faultMinutes      ?? 30) * 60000;

  const ts = (readingTs instanceof Date ? readingTs : new Date(readingTs || Date.now())).getTime();

  if (!global._warmerState) global._warmerState = {};

  // Bootstrap in-memory tracker from DB on first reading after server start
  if (!global._warmerState[unit._id]) {
    global._warmerState[unit._id] = {
      state: unit.warmerState?.state || 'unknown',
      since: unit.warmerState?.since ? new Date(unit.warmerState.since).getTime() : ts
    };
  }

  const current = global._warmerState[unit._id];
  const state   = current.state;
  const since   = current.since;
  const elapsed = ts - since;
  let   newState = state;

  if (value >= targetLow) {
    // Active zone — warmer is maintaining temperature
    newState = 'active';
  } else if (value <= roomCeiling) {
    // Room temp zone
    if (state === 'off') {
      newState = 'off';
    } else if (state === 'cooling') {
      newState = elapsed >= offConfirmMs ? 'off' : 'cooling';
    } else {
      // Dropped to room temp from any other state → start cooling timer
      newState = 'cooling';
    }
  } else if (value > warmupStart) {
    // Mid zone: warmupStart < temp < targetLow (e.g. 40–60°C)
    if (state === 'fault') {
      newState = 'fault'; // stays faulted until temp reaches target or cools completely
    } else if (state === 'warming_up') {
      newState = elapsed >= faultMs ? 'fault' : 'warming_up';
    } else {
      // Coming from off / cooling / active — start warmup timer
      newState = 'warming_up';
    }
  } else {
    // Low zone: roomCeiling < temp ≤ warmupStart (35–40°C)
    // Ambiguous — keep existing off, treat everything else as cooling
    newState = (state === 'off') ? 'off' : 'cooling';
  }

  if (newState !== state) {
    const prev = state;
    global._warmerState[unit._id] = { state: newState, since: ts };
    await TempMonUnit.findByIdAndUpdate(unit._id, {
      $set: { 'warmerState.state': newState, 'warmerState.since': new Date(ts) }
    });
    console.log(`🔥 [TempMon] Warmer "${unit.name}": ${prev} → ${newState} at ${value}°C`);
    if (newState === 'fault' && unit.inUse !== false) {
      sendPush(
        `⚠️ ${unit.name}: Warmer may be faulty`,
        `Temperature stuck at ${value}°C for ${cfg.faultMinutes ?? 30} min — not reaching target of ${targetLow}°C. Check the warmer.`,
        '/tempmon/unit.html?id=' + String(unit._id)
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// DEBUG / TEST — admin only
// POST /api/tempmon/debug/inject
// Inject a simulated reading for any warmer unit (bypasses gateway key).
// Body: { unitId, temp, minsAgo? }
// ═══════════════════════════════════════════════════════════════════
router.post('/debug/inject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { unitId, temp, minsAgo = 0 } = req.body;
    if (!unitId || temp === undefined) {
      return res.status(400).json({ error: 'unitId and temp are required' });
    }

    const unit = await TempMonUnit.findById(unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    if (unit.type !== 'warmer') return res.status(400).json({ error: 'Unit is not a warmer' });

    // Find a device linked to this unit (prefer the test device, fall back to first)
    const device = await TempMonDevice.findOne({ unit: unitId, active: true }).sort({ createdAt: 1 });
    if (!device) return res.status(404).json({ error: 'No active device linked to this unit. Add one in Setup first.' });

    const ts = new Date(Date.now() - minsAgo * 60000);
    const flagged = temp < unit.criticalMin || temp > unit.criticalMax;

    const reading = new TempMonReading({
      device:     device._id,
      unit:       unit._id,
      value:      temp,
      recordedAt: ts,
      receivedAt: new Date(),
      gatewayId:  'debug-inject',
      flagged
    });
    await reading.save();

    // Reload unit so warmerState is fresh from DB
    const freshUnit = await TempMonUnit.findById(unitId);
    // Reset in-memory tracker so state machine re-evaluates from DB state
    if (global._warmerState) delete global._warmerState[String(unitId)];
    const previousState = freshUnit.warmerState?.state || 'unknown';

    await updateWarmerState(freshUnit, temp, ts);

    const updated = await TempMonUnit.findById(unitId);
    res.json({
      ok: true,
      temp,
      minsAgo,
      recordedAt: ts,
      previousState,
      newState: updated.warmerState?.state,
      since: updated.warmerState?.since,
      readingId: reading._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PURGE ALERTS — admin only
// DELETE /api/tempmon/alerts?from=&to=
// Deletes RESOLVED alerts only. Optional createdAt date range.
// ═══════════════════════════════════════════════════════════════════
router.delete('/alerts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = { status: 'resolved' };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to)   query.createdAt.$lte = new Date(to);
    }
    const result = await TempMonAlert.deleteMany(query);
    console.log(`[TempMon] Purge alerts by admin (${req.user?.email}): deleted=${result.deletedCount}, range=${from||'*'}→${to||'*'}`);
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PURGE READINGS — admin only
// DELETE /api/tempmon/readings/:unitId?from=&to=
// Deletes readings for a unit. Optional date range params.
// ═══════════════════════════════════════════════════════════════════
router.delete('/readings/:unitId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const unit = await TempMonUnit.findById(req.params.unitId).lean();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const { from, to } = req.query;
    const query = { unit: req.params.unitId };
    if (from || to) {
      query.recordedAt = {};
      if (from) query.recordedAt.$gte = new Date(from);
      if (to)   query.recordedAt.$lte = new Date(to);
    }

    const result = await TempMonReading.deleteMany(query);
    console.log(`[TempMon] Purge by admin (${req.user?.email}): unit="${unit.name}", deleted=${result.deletedCount}, range=${from || '*'} → ${to || '*'}`);
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.updateWarmerState = updateWarmerState;
