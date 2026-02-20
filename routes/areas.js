const express = require('express');
const router = express.Router();
const Area = require('../models/Area');
const { generateAreaQRCode, generateQRCodeBuffer, getPublicBaseUrl } = require('../services/qr-service');

// Get all areas
router.get('/', async (req, res) => {
    try {
        const areas = await Area.find().sort({ name: 1 });
        res.json(areas);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get single area
router.get('/:id', async (req, res) => {
    try {
        const area = await Area.findById(req.params.id);
        if (!area) {
            return res.status(404).json({ message: 'Area not found' });
        }
        res.json(area);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new area
router.post('/', async (req, res) => {
    const area = new Area({
        name: req.body.name,
        description: req.body.description,
        assignedSupervisor: req.body.assignedSupervisor
    });

    try {
        const newArea = await area.save();
        
        // Generate QR code
        const baseUrl = await getPublicBaseUrl(req);
        const qrCode = await generateAreaQRCode(newArea.areaId, newArea.name, baseUrl);
        newArea.qrCode = qrCode;
        await newArea.save();
        
        res.status(201).json(newArea);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update area
router.put('/:id', async (req, res) => {
    try {
        const area = await Area.findById(req.params.id);
        if (!area) {
            return res.status(404).json({ message: 'Area not found' });
        }

        if (req.body.name !== undefined) area.name = req.body.name;
        if (req.body.description !== undefined) area.description = req.body.description;
        if (req.body.assignedSupervisor !== undefined) area.assignedSupervisor = req.body.assignedSupervisor;

        const updatedArea = await area.save();
        res.json(updatedArea);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Generate or regenerate QR code for area
router.post('/:id/generate-qr', async (req, res) => {
    try {
        const area = await Area.findById(req.params.id);
        if (!area) {
            return res.status(404).json({ message: 'Area not found' });
        }
        
        const baseUrl = process.env.QR_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const qrCode = await generateAreaQRCode(area.areaId, baseUrl);
        area.qrCode = qrCode;
        await area.save();
        
        res.json({ qrCode: qrCode, areaId: area.areaId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Download QR code as PNG
router.get('/:id/download-qr', async (req, res) => {
    try {
        const area = await Area.findById(req.params.id);
        if (!area) {
            return res.status(404).json({ message: 'Area not found' });
        }
        
        const baseUrl = process.env.QR_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const url = `${baseUrl}/area-maintenance.html?area=${encodeURIComponent(area.areaId)}`;
        const buffer = await generateQRCodeBuffer(url);
        
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="QR_${area.areaId}_${area.name.replace(/\s/g, '_')}.png"`
        });
        
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete area
router.delete('/:id', async (req, res) => {
    try {
        const area = await Area.findById(req.params.id);
        if (!area) {
            return res.status(404).json({ message: 'Area not found' });
        }
        await area.deleteOne();
        res.json({ message: 'Area deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
