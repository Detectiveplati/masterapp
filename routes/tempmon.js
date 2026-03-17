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

    // Check if this deviceId is already registered (possibly under a different unit)
    const existing = await TempMonDevice.findOne({ deviceId });
    if (existing) {
      const oldUnitId = existing.unit ? existing.unit.toString() : null;
      const newUnitId = unit ? unit.toString() : null;

      if (oldUnitId && newUnitId && oldUnitId !== newUnitId) {
        // Migrate all readings and alerts from old unit to new unit
        const [readingsMigrated, alertsMigrated] = await Promise.all([
          TempMonReading.updateMany({ device: existing._id, unit: existing.unit }, { $set: { unit: newUnitId } }),
          TempMonAlert.updateMany({ device: existing._id, unit: existing.unit }, { $set: { unit: newUnitId } })
        ]);
        console.log(`✓ [TempMon] Migrated ${readingsMigrated.modifiedCount} readings, ${alertsMigrated.modifiedCount} alerts from unit ${oldUnitId} → ${newUnitId}`);

        // Reactivate and re-link the existing device record
        existing.unit   = newUnitId;
        existing.active = true;
        if (label    !== undefined) existing.label    = label;
        if (firmware !== undefined) existing.firmware = firmware;
        if (expectedIntervalMinutes !== undefined) existing.expectedIntervalMinutes = expectedIntervalMinutes;
        if (calibrationIntervalDays !== undefined) existing.calibrationIntervalDays = calibrationIntervalDays;
        await existing.save();

        // Auto-deactivate old unit if it has no more active devices
        const remainingDevices = await TempMonDevice.countDocuments({ unit: oldUnitId, active: true });
        if (remainingDevices === 0) {
          await TempMonUnit.findByIdAndUpdate(oldUnitId, { active: false });
          console.log(`✓ [TempMon] Auto-deactivated orphaned unit ${oldUnitId} (no devices remaining)`);
        }

        return res.status(201).json(existing);
      }

      // Same unit or no unit change — just reactivate
      existing.active = true;
      if (unit     !== undefined) existing.unit     = unit;
      if (label    !== undefined) existing.label    = label;
      if (firmware !== undefined) existing.firmware = firmware;
      if (expectedIntervalMinutes !== undefined) existing.expectedIntervalMinutes = expectedIntervalMinutes;
      if (calibrationIntervalDays !== undefined) existing.calibrationIntervalDays = calibrationIntervalDays;
      await existing.save();
      console.log('✓ [TempMon] Re-activated device:', deviceId);
      return res.status(201).json(existing);
    }

    const device = new TempMonDevice({ unit, deviceId, label, firmware, expectedIntervalMinutes, calibrationIntervalDays });
    await device.save();
    console.log('✓ [TempMon] Registered device:', deviceId);
    res.status(201).json(device);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/tempmon/devices/:id
router.put('/devices/:id', requireAuth, async (req, res) => {
  try {
    const fields = ['label', 'firmware', 'unit', 'active', 'expectedIntervalMinutes', 'calibrationIntervalDays'];
    const update = {};
    fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    // If unit is being changed, migrate readings + alerts and clean up old unit
    if (update.unit) {
      const device = await TempMonDevice.findById(req.params.id);
      if (device && device.unit && device.unit.toString() !== update.unit.toString()) {
        const oldUnitId = device.unit.toString();
        const newUnitId = update.unit.toString();
        const [readingsMigrated, alertsMigrated] = await Promise.all([
          TempMonReading.updateMany({ device: device._id, unit: device.unit }, { $set: { unit: newUnitId } }),
          TempMonAlert.updateMany({ device: device._id, unit: device.unit }, { $set: { unit: newUnitId } })
        ]);
        console.log(`✓ [TempMon] Migrated ${readingsMigrated.modifiedCount} readings, ${alertsMigrated.modifiedCount} alerts from unit ${oldUnitId} → ${newUnitId}`);

        // Auto-deactivate old unit if no active devices remain
        const remainingDevices = await TempMonDevice.countDocuments({ unit: oldUnitId, active: true, _id: { $ne: device._id } });
        if (remainingDevices === 0) {
          await TempMonUnit.findByIdAndUpdate(oldUnitId, { active: false });
          console.log(`✓ [TempMon] Auto-deactivated orphaned unit ${oldUnitId} (no devices remaining)`);
        }
      }
    }

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
      await updateWarmerState(unit, device, value, ts);

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
  // Warmers are monitored exclusively by the fault-state machine — no temperature range alerts
  if (unit.type === 'warmer') return null;
  const { criticalMin, criticalMax } = unit;
  if (value < criticalMin) return 'critical_low';
  if (value > criticalMax) return 'critical_high';
  return null;
}

async function maybeCreateOrNotifyAlert(unit, device, readingId, type, value, readingTs) {
  // Skip alert creation entirely when unit is marked as not in use
  if (unit.inUse === false) return false;

  // Check if there is already an open/acknowledged alert for this unit+type
  const existing = await TempMonAlert.findOne({ unit: unit._id, type, status: { $in: ['open', 'acknowledged'] } });
  if (existing) return false;

  // Per-unit threshold: temperature must remain out of range for this many minutes before alerting
  const thresholdMs = (unit.alertThresholdMinutes || 0) * 60 * 1000;

  // Use the reading's own recordedAt timestamp so buffered gateway readings are evaluated
  // against sensor-time, not server-arrival-time.
  const ts = (readingTs instanceof Date ? readingTs : new Date(readingTs || Date.now())).getTime();

  if (!global._tempmonExcursionStart) global._tempmonExcursionStart = {};
  const key = `${unit._id}_${type}`;

  if (!global._tempmonExcursionStart[key]) {
    global._tempmonExcursionStart[key] = ts;
    if (thresholdMs > 0) {
      console.log(`⏱  [TempMon] Excursion started (${unit.alertThresholdMinutes} min required): ${type} for "${unit.name}" at ${value}°C`);
      return false;
    }
    // threshold = 0: fall through and raise immediately (requires a second reading though)
  }

  const elapsedMs = ts - global._tempmonExcursionStart[key];
  if (elapsedMs < thresholdMs) return false;

  // Threshold met — create alert and send push
  const alert = new TempMonAlert({
    unit: unit._id, device: device._id, reading: readingId, type, value,
    pushSentAt:       new Date(),
    notificationSent: true
  });
  await alert.save();

  const label = buildAlertLabel(type, value, unit);
  const threshLabel = unit.alertThresholdMinutes > 0 ? ` after ${unit.alertThresholdMinutes} min out of range` : '';
  sendPush(`🔴 ${unit.name}: ${label}`,
    `Temperature alert raised${threshLabel}. Check the unit immediately.`,
    '/tempmon/alerts.html');
  console.log(`✓ [TempMon] Critical alert raised: ${type} for "${unit.name}" at ${value}°C (threshold: ${unit.alertThresholdMinutes || 0} min)`);

  return true;
}

function buildAlertLabel(type, value, unit) {
  const v = value != null ? Number(value).toFixed(1) : '—';
  return type === 'critical_high' ? `CRITICAL HIGH — ${v}°C (limit ${unit.criticalMax}°C)`
       : type === 'critical_low'  ? `CRITICAL LOW — ${v}°C (limit ${unit.criticalMin}°C)`
       : type === 'warmer_fault'  ? `Warmer Fault — stuck at ${v}°C (target ≥${unit.criticalMin}°C)`
       : type === 'warning_high'  ? `Warning High — ${v}°C`
       : type === 'warning_low'   ? `Warning Low — ${v}°C`
       :                            type;
}

async function autoResolveAlerts(unitId) {
  // Clear in-memory excursion timers for this unit so the next excursion starts a fresh countdown
  if (global._tempmonExcursionStart) {
    const prefix = String(unitId) + '_';
    Object.keys(global._tempmonExcursionStart).forEach(k => {
      if (k.startsWith(prefix)) delete global._tempmonExcursionStart[k];
    });
  }
  // Resolve all open critical and legacy warning alerts for this unit
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
      .populate('unit', 'name type criticalMin criticalMax alertThresholdMinutes warmerStateConfig')
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
    const devices = await TempMonDevice.find({ active: true }).populate('unit', 'name inUse').lean();
    for (const device of devices) {
      if (!device.lastSeenAt) continue;
      if (device.unit?.inUse === false) continue; // suppress offline alerts for units not in use
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // alert after 2 hours of no readings
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
    // Safety-net: find open critical alerts that somehow have no push sent yet.
    // Under normal flow alerts are created with pushSentAt already set, so this rarely fires.
    const pending = await TempMonAlert.find({
      pushSentAt: null,
      status:     { $in: ['open', 'acknowledged'] },
      type:       { $in: ['critical_high', 'critical_low'] }
    }).populate('unit').lean();

    if (!pending.length) return;

    for (const alert of pending) {
      const unit = alert.unit;
      if (!unit) continue;
      if (unit.inUse === false) continue;

      // Use per-unit threshold
      const thresholdMs = (unit.alertThresholdMinutes || 0) * 60 * 1000;
      const alertAgeMs  = Date.now() - new Date(alert.createdAt).getTime();

      if (alertAgeMs >= thresholdMs) {
        await TempMonAlert.updateOne({ _id: alert._id }, { pushSentAt: new Date(), notificationSent: true });
        const label = buildAlertLabel(alert.type, alert.value, unit);
        const delayLabel = unit.alertThresholdMinutes > 0 ? `${unit.alertThresholdMinutes} min` : 'immediately';
        sendPush(`🔴 ${unit.name}: ${label}`,
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

// ── One-time startup cleanup ─────────────────────────────────────────────────
// Auto-resolve any open warning_high / warning_low alerts belonging to warmer
// units — these are stale records from before the new alert logic was deployed.
if (!global._tempmonWarmerWarnCleaned) {
  global._tempmonWarmerWarnCleaned = true;
  (async () => {
    try {
      const warmerUnits = await TempMonUnit.find({ type: 'warmer', active: true }).select('_id').lean();
      if (warmerUnits.length) {
        const ids = warmerUnits.map(u => u._id);
        const result = await TempMonAlert.updateMany(
          { unit: { $in: ids }, type: { $in: ['warning_high', 'warning_low', 'critical_high', 'critical_low'] }, status: { $in: ['open', 'acknowledged'] } },
          { $set: { status: 'resolved', resolvedAt: new Date(), resolveNote: 'Auto-closed: warmer temperature range alerts are no longer used (fault detection only)' } }
        );
        if (result.modifiedCount > 0)
          console.log(`✓ [TempMon] Startup cleanup: resolved ${result.modifiedCount} stale warmer range alert(s)`);
      }
    } catch (e) { console.error('✗ [TempMon] Startup cleanup error:', e.message); }
  })();
}

// ── Startup: seed excursion timers from DB ───────────────────────────────────
// On every deploy global._tempmonExcursionStart is wiped. Re-seed it from
// recent readings so units that were already out of range don't lose their
// threshold countdown.
if (!global._tempmonExcursionStart) global._tempmonExcursionStart = {};
(async () => {
  try {
    // Find all non-warmer active units with a threshold > 0 and no open alert
    const units = await TempMonUnit.find({ active: true, type: { $ne: 'warmer' }, alertThresholdMinutes: { $gt: 0 } }).lean();
    for (const unit of units) {
      if (unit.inUse === false) continue;
      const openAlert = await TempMonAlert.findOne({ unit: unit._id, type: { $in: ['critical_high', 'critical_low'] }, status: { $in: ['open', 'acknowledged'] } });
      if (openAlert) continue; // alert already exists, nothing to seed

      // Get the most recent reading for this unit
      const latest = await TempMonReading.findOne({ unit: unit._id }).sort({ recordedAt: -1 }).lean();
      if (!latest) continue;
      const alertType = evaluateAlertType(latest.value, unit);
      if (!alertType) continue; // currently in range

      // Find when the excursion started: walk back readings until we find one in range
      const lookback = new Date(Date.now() - 24 * 60 * 60 * 1000); // look back up to 24h
      const recentReadings = await TempMonReading.find({ unit: unit._id, recordedAt: { $gte: lookback } })
        .sort({ recordedAt: 1 }).lean();

      let excursionStart = latest.recordedAt;
      for (let i = recentReadings.length - 1; i >= 0; i--) {
        const t = evaluateAlertType(recentReadings[i].value, unit);
        if (!t) break; // found an in-range reading — excursion started after this
        excursionStart = recentReadings[i].recordedAt;
      }

      const key = `${unit._id}_${alertType}`;
      global._tempmonExcursionStart[key] = new Date(excursionStart).getTime();

      const thresholdMs = unit.alertThresholdMinutes * 60 * 1000;
      const elapsedMs   = Date.now() - global._tempmonExcursionStart[key];

      if (elapsedMs >= thresholdMs) {
        // Threshold already exceeded — fire the alert immediately
        const alert = new TempMonAlert({
          unit: unit._id, type: alertType, value: latest.value,
          pushSentAt: new Date(), notificationSent: true
        });
        await alert.save();
        const label = buildAlertLabel(alertType, latest.value, unit);
        sendPush(`🔴 ${unit.name}: ${label}`,
          `Temperature has been out of range for over ${unit.alertThresholdMinutes} min. Check the unit immediately.`,
          '/tempmon/alerts.html');
        console.log(`✓ [TempMon] Startup: fired overdue alert for "${unit.name}" (out of range since ${excursionStart})`);
      } else {
        console.log(`✓ [TempMon] Startup: seeded excursion timer for "${unit.name}" — ${Math.round(elapsedMs / 60000)} of ${unit.alertThresholdMinutes} min elapsed`);
      }
    }
  } catch (e) { console.error('✗ [TempMon] Startup excursion seed error:', e.message); }
})();

// ═══════════════════════════════════════════════════════════════════
// WARMER STATE MACHINE
// ═══════════════════════════════════════════════════════════════════
// Uses a rolling temperature window to compute a reliable slope (°C/min).
// Slope direction in the mid zone determines state — not just elapsed time:
//
//   Rising slope  → warming_up  (warmer switched on, heating toward target)
//   Falling slope → cooling     (warmer switched off, passively cooling)
//   Flat slope    → potential fault (warmer is on but STUCK below target)
//
// Temperature zones:
//   Active  : temp ≥ criticalMin (targetLow)     → warmer holding target
//   Mid     : roomCeiling < temp < targetLow     → slope determines intent
//   Room    : temp ≤ roomCeiling                 → cold / off
//
// State transitions:
//   any         → active     : temp ≥ targetLow
//   active      → warming_up : temp drops to mid/room with RISING slope (shouldn't happen but handled)
//   active      → cooling    : temp drops to mid zone with FALLING slope (turned off)
//   active      → fault      : temp drops to mid zone and goes FLAT for faultMinutes
//   warming_up  → active     : temp reaches targetLow
//   warming_up  → fault      : slope goes flat/negative in mid zone for faultMinutes
//   warming_up  → cooling    : slope turns negative (switched off mid warm-up)
//   cooling     → warming_up : slope turns positive (switched back on)
//   cooling     → off        : sustained at room temp for offConfirmMinutes
//   off         → warming_up : slope turns positive from room temp
//   fault       → active     : temp finally reaches targetLow
//   fault       → cooling    : slope turns consistently negative (switched off)
// ───────────────────────────────────────────────────────────────────
async function updateWarmerState(unit, device, value, readingTs) {
  if (unit.type !== 'warmer') return;

  const cfg          = unit.warmerStateConfig || {};
  const roomCeiling  = cfg.roomTempCeiling    ?? 35;   // °C — confirmed off below this
  const targetLow    = unit.criticalMin;               // e.g. 63°C — active zone floor
  const offConfirmMs = (cfg.offConfirmMinutes ?? 20) * 60000;
  const faultMs      = (cfg.faultMinutes      ?? 30) * 60000;
  const windowSize   = cfg.slopeWindowReadings ?? 8;   // readings used for slope calc
  // Slope thresholds (°C/min) — tunable via unit.warmerStateConfig
  const riseThresh   = cfg.riseMinPerMin      ?? 0.10; // above this → heating up
  const fallThresh   = cfg.fallMinPerMin      ?? 0.08; // below -this → cooling / switched off

  const ts = (readingTs instanceof Date ? readingTs : new Date(readingTs || Date.now())).getTime();

  if (!global._warmerState) global._warmerState = {};

  // Bootstrap in-memory tracker from DB on first reading after server start
  if (!global._warmerState[unit._id]) {
    global._warmerState[unit._id] = {
      state:   unit.warmerState?.state || 'unknown',
      since:   unit.warmerState?.since ? new Date(unit.warmerState.since).getTime() : ts,
      history: []  // rolling window: [{ ts, value }, ...]
    };
  }

  const current = global._warmerState[unit._id];
  const state   = current.state;
  const since   = current.since;
  const elapsed = ts - since;

  // ── Rolling window: push latest reading, trim to windowSize ─────
  const history = current.history;
  history.push({ ts, value });
  if (history.length > windowSize) history.shift();

  // ── Slope (°C/min) over full window span ─────────────────────────
  // Using oldest → newest gives a smoothed trend that ignores per-reading noise.
  let slopePerMin = 0;
  if (history.length >= 2) {
    const oldest = history[0];
    const latest = history[history.length - 1];
    const dtMin  = (latest.ts - oldest.ts) / 60000;
    if (dtMin > 0) slopePerMin = (latest.value - oldest.value) / dtMin;
  }

  const rising  = slopePerMin >  riseThresh;
  const falling = slopePerMin < -fallThresh;
  // flat = neither rising nor falling (warmer fighting to hold or failing to heat)

  let newState = state;

  // ── Zone: Active (temp ≥ targetLow) ─────────────────────────────
  if (value >= targetLow) {
    newState = 'active';

  // ── Zone: Room temperature (temp ≤ roomCeiling) ──────────────────
  } else if (value <= roomCeiling) {
    if (rising) {
      // Slope turning positive from cold → warmer just switched on
      newState = 'warming_up';
    } else if (state === 'off') {
      newState = 'off';
    } else {
      // cooling, fault, warming_up, or unknown → confirm off after grace period
      newState = elapsed >= offConfirmMs ? 'off' : 'cooling';
    }

  // ── Zone: Mid (roomCeiling < temp < targetLow) ───────────────────
  // THIS is where we distinguish between fault and normal cool-down:
  //   Rising  → warmer is heating up normally → warming_up (not a fault)
  //   Falling → warmer was switched off, passively cooling → cooling (not a fault)
  //   Flat    → warmer is on but STUCK below target → fault after faultMinutes
  } else {
    if (rising) {
      if (state === 'fault') {
        // Remain faulted until temp actually reaches target — rising in mid zone alone is ambiguous
        newState = 'fault';
      } else {
        newState = 'warming_up';
      }
    } else if (falling) {
      // Consistent negative slope → switched off, passively cooling — never a fault
      newState = 'cooling';
    } else {
      // Flat slope in mid zone
      if (state === 'warming_up') {
        // Was heating but slope stalled → fault if stuck long enough
        newState = elapsed >= faultMs ? 'fault' : 'warming_up';
      } else if (state === 'active') {
        // Just dropped below target and is flat → give faultMs grace before declaring fault
        newState = elapsed >= faultMs ? 'fault' : state;
      } else if (state === 'fault') {
        newState = 'fault';
      } else {
        // cooling/off/unknown with flat slope in mid zone → still cooling slowly
        newState = 'cooling';
      }
    }
  }

  if (newState !== state) {
    const prev = state;
    global._warmerState[unit._id].state = newState;
    global._warmerState[unit._id].since = ts;
    await TempMonUnit.findByIdAndUpdate(unit._id, {
      $set: { 'warmerState.state': newState, 'warmerState.since': new Date(ts) }
    });
    const slopeStr = ` (slope ${slopePerMin >= 0 ? '+' : ''}${slopePerMin.toFixed(2)}°C/min)`;
    console.log(`🔥 [TempMon] Warmer "${unit.name}": ${prev} → ${newState} at ${value.toFixed(1)}°C${slopeStr}`);

    // ── Fault detected: create alert + send push ──────────────────
    if (newState === 'fault' && unit.inUse !== false) {
      const existingFault = await TempMonAlert.findOne({
        unit: unit._id, type: 'warmer_fault', status: { $in: ['open', 'acknowledged'] }
      });
      if (!existingFault) {
        await TempMonAlert.create({
          unit:             unit._id,
          device:           device._id,
          type:             'warmer_fault',
          value,
          pushSentAt:       new Date(),
          notificationSent: true
        });
        sendPush(
          `⚠️ ${unit.name}: Warmer Fault Detected`,
          `Temperature stuck at ${value.toFixed(1)}°C for ${cfg.faultMinutes ?? 30} min — failed to reach/maintain target of ${targetLow}°C.`,
          '/tempmon/alerts.html'
        );
        console.log(`⚠️ [TempMon] Warmer fault alert created: "${unit.name}" at ${value.toFixed(1)}°C`);
      }
    }

    // ── Recovery from fault: auto-resolve open fault alert ───────
    if (prev === 'fault' && newState !== 'fault') {
      await TempMonAlert.updateMany(
        { unit: unit._id, type: 'warmer_fault', status: { $in: ['open', 'acknowledged'] } },
        { $set: { status: 'resolved', resolvedAt: new Date(),
                  resolveNote: `Warmer recovered — state changed to '${newState}' at ${value.toFixed(1)}°C` } }
      );
      console.log(`✓ [TempMon] Warmer fault auto-resolved: "${unit.name}" → ${newState}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// DEBUG / TEST — admin only
// POST /api/tempmon/debug/inject
// Inject a simulated reading for ANY unit type (bypasses gateway key).
// Body: { unitId, temp, minsAgo? }
// ═══════════════════════════════════════════════════════════════════
router.post('/debug/inject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { unitId, temp, minsAgo = 0, forceAlert = false } = req.body;
    if (!unitId || temp === undefined) {
      return res.status(400).json({ error: 'unitId and temp are required' });
    }

    const unit = await TempMonUnit.findById(unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    // Find or auto-create a test device linked to this unit
    let device = await TempMonDevice.findOne({ unit: unitId, active: true }).sort({ createdAt: 1 });
    if (!device) {
      device = await TempMonDevice.create({
        unit:      unit._id,
        deviceId:  `test-device-${unit._id}`,
        label:     `Test Device — ${unit.name}`,
        active:    true
      });
    }

    const ts      = new Date(Date.now() - minsAgo * 60000);
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

    // Run the same alert pipeline as a real ingest
    if (unit.type === 'warmer') {
      // Reset in-memory tracker so state machine re-evaluates from DB
      if (global._warmerState) delete global._warmerState[String(unitId)];
      const freshUnit = await TempMonUnit.findById(unitId);
      await updateWarmerState(freshUnit, device, temp, ts);
    }

    const alertType = evaluateAlertType(temp, unit);
    let alertCreated = false;
    if (alertType) {
      if (forceAlert) {
        // Force mode: close any existing open alert for this type first (clears dedup guard),
        // then directly create the alert + push without going through the threshold timer logic.
        await TempMonAlert.updateMany(
          { unit: unit._id, type: alertType, status: { $in: ['open', 'acknowledged'] } },
          { $set: { status: 'resolved', resolvedAt: new Date(), resolveNote: 'Closed by dev-test force inject' } }
        );
        // Also clear the excursion timer so production logic is clean afterward
        if (!global._tempmonExcursionStart) global._tempmonExcursionStart = {};
        delete global._tempmonExcursionStart[`${unit._id}_${alertType}`];

        await TempMonAlert.create({
          unit:             unit._id,
          device:           device._id,
          reading:          reading._id,
          type:             alertType,
          value:            temp,
          pushSentAt:       new Date(),
          notificationSent: true
        });
        const label      = buildAlertLabel(alertType, temp, unit);
        const threshLabel = unit.alertThresholdMinutes > 0 ? ` after ${unit.alertThresholdMinutes} min out of range` : '';
        sendPush(`🔴 ${unit.name}: ${label}`,
          `[TEST] Temperature alert raised${threshLabel}. Check the unit immediately.`,
          '/tempmon/alerts.html');
        console.log(`⚡ [TempMon] Force-injected alert: ${alertType} for "${unit.name}" at ${temp}°C`);
        alertCreated = true;
      } else {
        alertCreated = await maybeCreateOrNotifyAlert(unit, device, reading._id, alertType, temp, ts);
      }
    } else {
      await autoResolveAlerts(unit._id);
    }

    const updated = await TempMonUnit.findById(unitId).lean();
    res.json({
      ok: true,
      unitName:  unit.name,
      unitType:  unit.type,
      temp,
      minsAgo,
      forceAlert,
      recordedAt: ts,
      flagged,
      alertType:    alertType || null,
      alertCreated,
      warmerState:  updated.warmerState || null,
      readingId:    reading._id
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
