/**
 * Pest Control Module API Routes
 * Base: /api/pest
 */
const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const PestStation = require('../models/PestStation');
const PestSession = require('../models/PestSession');
const PestFinding = require('../models/PestFinding');
const { memUpload, uploadBufferToCloudinary } = require('../services/cloudinary-upload');

// ── Cloudinary delete helper ─────────────────────────────────────────────────
let cloudinary = null;
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary = require('cloudinary').v2;
}

async function deleteFromCloudinary(publicId) {
    if (cloudinary && publicId) {
        try { await cloudinary.uploader.destroy(publicId); } catch (_) {}
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/pest/stations — list all (active-first, sorted by rtsNo)
router.get('/stations', async (req, res) => {
    try {
        const stations = await PestStation.find().sort({ isActive: -1, rtsNo: 1 });
        res.json(stations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/pest/stations — add new station
router.post('/stations', async (req, res) => {
    try {
        const { rtsNo, locationDescription, unit } = req.body;
        if (!rtsNo || !locationDescription || !unit)
            return res.status(400).json({ error: 'rtsNo, locationDescription and unit are required' });
        const station = new PestStation({ rtsNo, locationDescription, unit });
        await station.save();
        res.status(201).json(station);
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ error: 'RTS number already exists' });
        res.status(400).json({ error: err.message });
    }
});

// PUT /api/pest/stations/:id — edit station
router.put('/stations/:id', async (req, res) => {
    try {
        const { locationDescription, unit, isActive } = req.body;
        const update = {};
        if (locationDescription !== undefined) update.locationDescription = locationDescription;
        if (unit                !== undefined) update.unit                = unit;
        if (isActive            !== undefined) update.isActive            = isActive;
        const station = await PestStation.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
        if (!station) return res.status(404).json({ error: 'Station not found' });
        res.json(station);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/pest/sessions — list sessions (newest first)
router.get('/sessions', async (req, res) => {
    try {
        const sessions = await PestSession.find().sort({ date: -1 });
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/pest/sessions — create new session + auto-create a blank finding for every active station
router.post('/sessions', async (req, res) => {
    try {
        const { date, conductedBy, notes } = req.body;
        if (!date || !conductedBy) return res.status(400).json({ error: 'date and conductedBy are required' });
        const session = new PestSession({ date: new Date(date), conductedBy, notes: notes || '' });
        await session.save();
        // Auto-scaffold findings for every active station
        const stations = await PestStation.find({ isActive: true }, '_id');
        if (stations.length) {
            const docs = stations.map(s => ({ sessionId: session._id, stationId: s._id }));
            await PestFinding.insertMany(docs, { ordered: false });
        }
        res.status(201).json(session);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET /api/pest/sessions/:id — session detail with all findings (populated)
router.get('/sessions/:id', async (req, res) => {
    try {
        const session = await PestSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const findings = await PestFinding.find({ sessionId: session._id })
            .populate('stationId', 'rtsNo locationDescription unit');
        res.json({ session, findings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/pest/sessions/:id/submit — mark session submitted
router.put('/sessions/:id/submit', async (req, res) => {
    try {
        const session = await PestSession.findByIdAndUpdate(req.params.id, { $set: { status: 'submitted' } }, { new: true });
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE /api/pest/sessions/:id — delete session and all its findings
router.delete('/sessions/:id', async (req, res) => {
    try {
        const session = await PestSession.findByIdAndDelete(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        await PestFinding.deleteMany({ sessionId: req.params.id });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINDINGS
// ═══════════════════════════════════════════════════════════════════════════════

// PUT /api/pest/findings/:id — update counts / trapStatus / remarks
router.put('/findings/:id', async (req, res) => {
    try {
        const { cockroach, others, newCockroaches, trapStatus, remarks } = req.body;
        const update = {};
        if (cockroach      !== undefined) update.cockroach      = cockroach;
        if (others         !== undefined) update.others         = others;
        if (newCockroaches !== undefined) update.newCockroaches = newCockroaches;
        if (trapStatus     !== undefined) update.trapStatus     = trapStatus;
        if (remarks        !== undefined) update.remarks        = remarks;
        const finding = await PestFinding.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
        if (!finding) return res.status(404).json({ error: 'Finding not found' });
        res.json(finding);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/pest/findings/:id/photos — upload one photo (multipart form-data, field: "photo")
router.post('/findings/:id/photos', (req, res, next) => {
    memUpload('photo')(req, res, (err) => {
        if (err) { console.error('[Pest] Upload parse error:', err.message); }
        next();
    });
}, async (req, res) => {
    try {
        const finding = await PestFinding.findById(req.params.id);
        if (!finding) return res.status(404).json({ error: 'Finding not found' });
        if (!req.file)  return res.status(400).json({ error: 'No photo provided' });

        // Try Cloudinary; fall back to base64 data URL stored in url field
        let url      = null;
        let publicId = '';
        const uploadedUrl = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, 'pest/findings');
        if (uploadedUrl) {
            url      = uploadedUrl;
            // Extract publicId from Cloudinary URL if possible
            try {
                const parts = uploadedUrl.split('/upload/');
                if (parts.length === 2) {
                    publicId = parts[1].replace(/^v\d+\//, '').replace(/\.[^.]+$/, '');
                }
            } catch (_) {}
        } else {
            // Fallback: encode as data URL to store locally
            const b64 = req.file.buffer.toString('base64');
            url = `data:${req.file.mimetype};base64,${b64}`;
        }

        finding.photos.push({ url, publicId, uploadedAt: new Date() });
        await finding.save();
        res.status(201).json({ url, photoIndex: finding.photos.length - 1, photos: finding.photos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/pest/findings/:id/photos/:photoIdx — remove photo by index
router.delete('/findings/:id/photos/:photoIdx', async (req, res) => {
    try {
        const finding = await PestFinding.findById(req.params.id);
        if (!finding) return res.status(404).json({ error: 'Finding not found' });
        const idx = parseInt(req.params.photoIdx, 10);
        if (isNaN(idx) || idx < 0 || idx >= finding.photos.length)
            return res.status(400).json({ error: 'Invalid photo index' });
        const [removed] = finding.photos.splice(idx, 1);
        await findDeleteFromCloudinary(removed.publicId);
        await finding.save();
        res.json({ ok: true, photos: finding.photos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function findDeleteFromCloudinary(publicId) {
    await deleteFromCloudinary(publicId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT (grid view — sessions × stations)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/pest/report?limit=10 — latest N sessions full grid
router.get('/report', async (req, res) => {
    try {
        const limit    = Math.min(parseInt(req.query.limit, 10) || 10, 52);
        const sessions = await PestSession.find({ status: 'submitted' })
            .sort({ date: -1 }).limit(limit);
        const stations = await PestStation.find({ isActive: true }).sort({ rtsNo: 1 });
        if (!sessions.length || !stations.length) return res.json({ sessions: [], stations, findings: [] });

        const sessionIds = sessions.map(s => s._id);
        const findings   = await PestFinding.find({ sessionId: { $in: sessionIds } })
            .populate('stationId', 'rtsNo');
        res.json({ sessions, stations, findings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEED — pre-load stations from spreadsheet
// ═══════════════════════════════════════════════════════════════════════════════
const SEED_STATIONS = [
    { rtsNo:  1, locationDescription: 'Outside Packaging Room',          unit: '05-27' },
    { rtsNo:  2, locationDescription: 'Under DV Box',                    unit: '05-27' },
    { rtsNo:  3, locationDescription: 'Packaging Store',                 unit: '06-17' },
    { rtsNo:  4, locationDescription: 'Laundry In dark area',            unit: '06-08' },
    { rtsNo:  5, locationDescription: 'Laundry DV Box',                  unit: '06-08' },
    { rtsNo:  6, locationDescription: 'Dry Store',                       unit: '06-27' },
    { rtsNo:  7, locationDescription: 'Dry Store',                       unit: '06-27' },
    { rtsNo:  8, locationDescription: 'Office corridor',                 unit: '06-27' },
    { rtsNo:  9, locationDescription: 'Outside cooling room',            unit: '06-15' },
    { rtsNo: 10, locationDescription: 'Old sauce kitchen',               unit: '06-15' },
    { rtsNo: 11, locationDescription: 'Dry Store 2',                     unit: '06-16' },
    { rtsNo: 12, locationDescription: 'PanFry Area',                     unit: '06-16' },
    { rtsNo: 13, locationDescription: 'Packing area inner door',         unit: '06-17' },
    { rtsNo: 14, locationDescription: 'Packing Area warmer',             unit: '06-17' },
    { rtsNo: 15, locationDescription: 'Packing area outer door',         unit: '06-17' },
    { rtsNo: 16, locationDescription: 'Bakery outside cold room',        unit: '06-19' },
    { rtsNo: 17, locationDescription: 'Bakery dual chiller/freezer',     unit: '06-19' },
    { rtsNo: 18, locationDescription: 'Bakery Outside Toilet',           unit: '06-19' },
    { rtsNo: 19, locationDescription: '06-24 store area',                unit: '06-24' },
    { rtsNo: 20, locationDescription: '06-24 behind',                    unit: '06-24' },
    { rtsNo: 21, locationDescription: 'Exit Towards City Satay',         unit: '05-26' },
    { rtsNo: 22, locationDescription: 'Outside storing room',            unit: '05-26' },
    { rtsNo: 23, locationDescription: 'Outside storing room kitchen side', unit: '05-26' },
];

router.post('/seed-stations', async (req, res) => {
    try {
        let created = 0;
        let skipped = 0;
        for (const s of SEED_STATIONS) {
            const exists = await PestStation.findOne({ rtsNo: s.rtsNo });
            if (!exists) {
                await PestStation.create(s);
                created++;
            } else {
                skipped++;
            }
        }
        res.json({ ok: true, created, skipped });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
