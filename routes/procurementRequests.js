const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const { memUpload, uploadBufferToCloudinary } = require('../services/cloudinary-upload');
const ProcurementRequest = require('../models/ProcurementRequest');

/**
 * POST /api/requests
 * Parses multipart instantly (memoryStorage), responds 201 immediately,
 * then uploads photo to Cloudinary in the background.
 */
router.post('/', (req, res, next) => {
    memUpload('image')(req, res, (err) => {
        if (err) console.error('[Procurement] Multipart parse error:', err.message);
        next();
    });
}, async (req, res) => {
    try {
        const data = { ...req.body };

        // Strip empty strings for enum fields so Mongoose defaults apply correctly.
        // Empty string fails enum validation; undefined triggers the default.
        ['category', 'priority', 'status'].forEach(field => {
            if (data[field] === '' || data[field] === undefined) delete data[field];
        });

        // Parse checklist if sent as JSON string
        if (typeof data.checklist === 'string') {
            try { data.checklist = JSON.parse(data.checklist); } catch (_) {}
        }

        // Upload image first (with timeout) so imagePath is set from the start
        if (req.file) {
            console.log(`[Procurement] Image received: ${req.file.originalname} (${req.file.size} bytes), uploading to Cloudinary...`);
            const url = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, 'procurement');
            if (url) {
                data.imagePath = url;
                console.log(`[Procurement] Image uploaded: ${url}`);
            } else {
                console.warn('[Procurement] Cloudinary upload returned null — check CLOUDINARY_* env vars in Railway dashboard');
            }
        }

        const request = new ProcurementRequest(data);
        await request.save();
        res.status(201).json(request);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message });
    }
});

/**
 * GET /api/requests
 * Get all requests — optional ?status=Pending&priority=High&search=...
 */
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.status)   filter.status   = req.query.status;
        if (req.query.priority) filter.priority  = req.query.priority;
        if (req.query.category) filter.category  = req.query.category;
        if (req.query.search) {
            const rx = new RegExp(req.query.search, 'i');
            filter.$or = [{ itemNameEn: rx }, { itemNameZh: rx }, { requestorName: rx }, { department: rx }];
        }
        const requests = await ProcurementRequest.find(filter).sort({ createdAt: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/requests/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const r = await ProcurementRequest.findById(req.params.id);
        if (!r) return res.status(404).json({ error: 'Not found' });
        res.json(r);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /api/requests/:id
 * Update status, checklist, purchaser notes
 */
router.patch('/:id', async (req, res) => {
    try {
        const updates = { ...req.body, updatedAt: new Date() };
        if (req.body.status === 'Done') {
            updates.completedAt = new Date();
        } else if (req.body.status && req.body.status !== 'Done') {
            updates.completedAt = null;
        }
        const r = await ProcurementRequest.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );
        if (!r) return res.status(404).json({ error: 'Not found' });
        res.json(r);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * DELETE /api/requests/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const r = await ProcurementRequest.findByIdAndDelete(req.params.id);
        if (!r) return res.status(404).json({ error: 'Not found' });
        // Delete uploaded image if exists
        if (r.imagePath) {
            const imgFile = path.join(__dirname, '..', r.imagePath);
            fs.unlink(imgFile, () => {});
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
