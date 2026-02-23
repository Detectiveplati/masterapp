const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const MaintenanceRecord = require('../models/MaintenanceRecord');
const { generateEquipmentQRCode, generateQRCodeBuffer, getPublicBaseUrl } = require('../services/qr-service');
const { isMaintenanceOverdue, isMaintenanceDueWithin } = require('../services/maintenance-calculator');

// Get all equipment with optional filters
router.get('/', async (req, res) => {
    try {
        const { type, status, location, search } = req.query;
        let query = {};
        
        if (type) query.type = type;
        if (status) {
            if (status === 'needs_action') {
                query.status = { $in: ['needs_action', 'maintenance', 'broken', 'offline'] };
            } else {
                query.status = status;
            }
        }
        if (location) query.location = location;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { equipmentId: { $regex: search, $options: 'i' } }
            ];
        }
        
        const equipment = await Equipment.find(query).sort({ createdAt: -1 });
        res.json(equipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const totalCount = await Equipment.countDocuments();
        const operationalCount = await Equipment.countDocuments({ status: 'operational' });
        const needsActionCount = await Equipment.countDocuments({
            status: { $in: ['needs_action', 'maintenance', 'broken', 'offline'] }
        });
        
        // Get equipment with next service dates
        const equipmentWithDates = await Equipment.find({ nextServiceDate: { $ne: null } });
        
        // Count overdue and due within 7 days
        let overdueCount = 0;
        let dueThisWeekCount = 0;
        
        equipmentWithDates.forEach(eq => {
            if (isMaintenanceOverdue(eq.nextServiceDate)) {
                overdueCount++;
            } else if (isMaintenanceDueWithin(eq.nextServiceDate, 7)) {
                dueThisWeekCount++;
            }
        });
        
        res.json({
            totalCount,
            operationalCount,
            needsActionCount,
            overdueCount,
            dueThisWeekCount
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get equipment due for maintenance
router.get('/due-maintenance', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const equipment = await Equipment.find({ nextServiceDate: { $ne: null } });
        
        const dueEquipment = equipment.filter(eq => {
            return isMaintenanceDueWithin(eq.nextServiceDate, parseInt(days));
        });
        
        res.json(dueEquipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get overdue equipment
router.get('/overdue', async (req, res) => {
    try {
        const equipment = await Equipment.find({ nextServiceDate: { $ne: null } });
        
        const overdueEquipment = equipment.filter(eq => {
            return isMaintenanceOverdue(eq.nextServiceDate);
        });
        
        // Sort by most overdue first
        overdueEquipment.sort((a, b) => {
            return new Date(a.nextServiceDate) - new Date(b.nextServiceDate);
        });
        
        res.json(overdueEquipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get single equipment by equipmentId
router.get('/:equipmentId', async (req, res) => {
    try {
        const equipment = await Equipment.findOne({ equipmentId: req.params.equipmentId });
        if (!equipment) {
            return res.status(404).json({ message: 'Equipment not found' });
        }
        res.json(equipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new equipment
router.post('/', async (req, res) => {
    try {
        const incomingEquipmentId = req.body.equipmentId ? req.body.equipmentId.trim() : '';
        if (incomingEquipmentId) {
            const existing = await Equipment.findOne({ equipmentId: incomingEquipmentId });
            if (existing) {
                return res.status(400).json({ message: 'Equipment ID already in use' });
            }
        }

        const incomingStatus = req.body.status ? req.body.status.trim() : '';
        const normalizedStatus = incomingStatus ? (incomingStatus === 'operational' ? 'operational' : 'needs_action') : 'operational';

        const equipment = new Equipment({
            equipmentId: incomingEquipmentId || undefined,
            name: req.body.name,
            type: req.body.type,
            brand: req.body.brand,
            modelNumber: req.body.modelNumber,
            serialNumber: req.body.serialNumber,
            location: req.body.location,
            status: normalizedStatus,
            purchaseDate: req.body.purchaseDate,
            warrantyExpiry: req.body.warrantyExpiry,
            installationDate: req.body.installationDate,
            expectedLifespan: req.body.expectedLifespan,
            maintenanceFrequency: req.body.maintenanceFrequency || 90,
            lastServiceDate: req.body.lastServiceDate,
            operatingInstructions: req.body.operatingInstructions,
            safetyNotes: req.body.safetyNotes,
            purchaseCost: req.body.purchaseCost,
            supplierContact: req.body.supplierContact,
            assignedTechnician: req.body.assignedTechnician
        });

        const newEquipment = await equipment.save();
        
        // Generate QR code
        const baseUrl = await getPublicBaseUrl(req);
        const qrCode = await generateEquipmentQRCode(newEquipment.equipmentId, baseUrl);
        newEquipment.qrCode = qrCode;
        await newEquipment.save();
        
        res.status(201).json(newEquipment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Bulk import equipment from CSV (JSON array)
// Query param: ?replace=true  → update existing records (match by equipmentId, then name)
router.post('/bulk-import', async (req, res) => {
    try {
        const rows = req.body;
        const replace = req.query.replace === 'true';
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ message: 'Request body must be a non-empty array of equipment objects.' });
        }

        let imported = 0, updated = 0, skipped = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;
            try {
                if (!row.name || !row.type) {
                    errors.push({ row: rowNum, reason: 'Missing required field(s): name, type' });
                    skipped++;
                    continue;
                }

                const status = row.status === 'operational' ? 'operational' : (row.status ? 'needs_action' : 'operational');

                const fields = {
                    name:               row.name.trim(),
                    type:               row.type.trim(),
                    ...(row.brand            && { brand: row.brand }),
                    ...(row.modelNumber      && { modelNumber: row.modelNumber }),
                    ...(row.serialNumber     && { serialNumber: row.serialNumber }),
                    ...(row.location         && { location: row.location.trim() }),
                    status,
                    ...(row.purchaseDate     && { purchaseDate: row.purchaseDate }),
                    ...(row.warrantyExpiry   && { warrantyExpiry: row.warrantyExpiry }),
                    ...(row.installationDate && { installationDate: row.installationDate }),
                    ...(row.expectedLifespan && { expectedLifespan: Number(row.expectedLifespan) }),
                    maintenanceFrequency: row.maintenanceFrequency ? Number(row.maintenanceFrequency) : 90,
                    ...(row.lastServiceDate  && { lastServiceDate: row.lastServiceDate }),
                    ...(row.nextServiceDate  && { nextServiceDate: row.nextServiceDate }),
                    ...(row.operatingInstructions && { operatingInstructions: row.operatingInstructions }),
                };

                // Try to find existing record
                let existing = null;
                if (row.equipmentId) existing = await Equipment.findOne({ equipmentId: row.equipmentId.trim() });
                if (!existing) existing = await Equipment.findOne({ name: fields.name });

                if (existing) {
                    if (!replace) {
                        errors.push({ row: rowNum, reason: `"${fields.name}" already exists — skipped (enable Replace to update)` });
                        skipped++;
                        continue;
                    }
                    // Update existing
                    Object.assign(existing, fields);
                    await existing.save();
                    updated++;
                } else {
                    // Create new
                    const equipment = new Equipment({
                        ...(row.equipmentId && { equipmentId: row.equipmentId.trim() }),
                        ...fields
                    });
                    await equipment.save();
                    imported++;
                }
            } catch (err) {
                errors.push({ row: rowNum, reason: err.message });
                skipped++;
            }
        }

        res.json({ imported, updated, skipped, errors });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update equipment
router.put('/:equipmentId', async (req, res) => {
    try {
        const equipment = await Equipment.findOne({ equipmentId: req.params.equipmentId });
        if (!equipment) {
            return res.status(404).json({ message: 'Equipment not found' });
        }

        const incomingEquipmentId = req.body.equipmentId ? req.body.equipmentId.trim() : '';
        if (incomingEquipmentId && incomingEquipmentId !== equipment.equipmentId) {
            const existing = await Equipment.findOne({ equipmentId: incomingEquipmentId });
            if (existing && existing._id.toString() !== equipment._id.toString()) {
                return res.status(400).json({ message: 'Equipment ID already in use' });
            }
            equipment.equipmentId = incomingEquipmentId;

            const baseUrl = await getPublicBaseUrl(req);
            equipment.qrCode = await generateEquipmentQRCode(equipment.equipmentId, baseUrl);
        }

        if (req.body.status !== undefined) {
            req.body.status = req.body.status === 'operational' ? 'operational' : 'needs_action';
        }

        // Update fields
        const fieldsToUpdate = [
            'name', 'type', 'brand', 'modelNumber', 'serialNumber', 'location', 'status',
            'purchaseDate', 'warrantyExpiry', 'installationDate', 'expectedLifespan',
            'maintenanceFrequency', 'lastServiceDate', 'nextServiceDate', 'operatingInstructions',
            'safetyNotes', 'purchaseCost', 'supplierContact', 'assignedTechnician'
        ];
        
        fieldsToUpdate.forEach(field => {
            if (req.body[field] !== undefined) {
                equipment[field] = req.body[field];
            }
        });

        const updatedEquipment = await equipment.save();
        res.json(updatedEquipment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Generate or regenerate QR code for equipment
router.post('/:equipmentId/generate-qr', async (req, res) => {
    try {
        const equipment = await Equipment.findOne({ equipmentId: req.params.equipmentId });
        if (!equipment) {
            return res.status(404).json({ message: 'Equipment not found' });
        }
        
        const baseUrl = await getPublicBaseUrl(req);
        const qrCode = await generateEquipmentQRCode(equipment.equipmentId, baseUrl);
        equipment.qrCode = qrCode;
        await equipment.save();
        
        res.json({ qrCode: qrCode, equipmentId: equipment.equipmentId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Download QR code as PNG
router.get('/:equipmentId/download-qr', async (req, res) => {
    try {
        const equipment = await Equipment.findOne({ equipmentId: req.params.equipmentId });
        if (!equipment) {
            return res.status(404).json({ message: 'Equipment not found' });
        }
        
        const baseUrl = await getPublicBaseUrl(req);
        const url = `${baseUrl}/equipment-details.html?id=${equipment.equipmentId}`;
        const buffer = await generateQRCodeBuffer(url);
        
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="QR_${equipment.equipmentId}_${equipment.name.replace(/\s/g, '_')}.png"`
        });
        
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete equipment
router.delete('/:equipmentId', async (req, res) => {
    try {
        const equipment = await Equipment.findOne({ equipmentId: req.params.equipmentId });
        if (!equipment) {
            return res.status(404).json({ message: 'Equipment not found' });
        }
        
        // Also delete all maintenance records for this equipment
        await MaintenanceRecord.deleteMany({ equipmentId: equipment._id });
        
        await equipment.deleteOne();
        res.json({ message: 'Equipment and related records deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
