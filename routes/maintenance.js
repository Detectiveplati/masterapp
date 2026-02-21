const express = require('express');
const router = express.Router();
const MaintenanceRecord = require('../models/MaintenanceRecord');
const Equipment = require('../models/Equipment');
const { calculateNextMaintenanceDate } = require('../services/maintenance-calculator');
const { createUpload } = require('../services/cloudinary-upload');
const upload = createUpload('maintenance/records');

// Get all maintenance records with optional filters
router.get('/', async (req, res) => {
    try {
        const { equipmentId, maintenanceType, startDate, endDate, performedBy } = req.query;
        let query = {};
        
        if (equipmentId) query.equipmentId = equipmentId;
        if (maintenanceType) query.maintenanceType = maintenanceType;
        if (performedBy) query.performedBy = { $regex: performedBy, $options: 'i' };
        
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        
        const records = await MaintenanceRecord.find(query)
            .populate('equipmentId')
            .sort({ date: -1 });
            
        res.json(records);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get single maintenance record
router.get('/:id', async (req, res) => {
    try {
        const record = await MaintenanceRecord.findById(req.params.id).populate('equipmentId');
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }
        res.json(record);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get maintenance history for specific equipment
router.get('/equipment/:equipmentId', async (req, res) => {
    try {
        const equipment = await Equipment.findOne({ equipmentId: req.params.equipmentId });
        if (!equipment) {
            return res.status(404).json({ message: 'Equipment not found' });
        }

        const records = await MaintenanceRecord.find({ equipmentId: equipment._id })
            .populate('equipmentId')
            .sort({ date: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new maintenance record
router.post('/', upload.single('image'), async (req, res) => {
    let equipment = null;
    if (req.body.equipmentId) {
        equipment = await Equipment.findOne({ equipmentId: req.body.equipmentId });
    }

    if (!equipment) {
        return res.status(400).json({ message: 'Valid equipment ID is required' });
    }

    const record = new MaintenanceRecord({
        equipmentId: equipment._id,
        maintenanceType: req.body.maintenanceType || 'Routine Check',
        date: req.body.date || Date.now(),
        activityDescription: req.body.activityDescription || '',
        issuesFound: req.body.issuesFound || '',
        actionsTaken: req.body.actionsTaken || '',
        partsReplaced: req.body.partsReplaced || [],
        partsCost: req.body.partsCost || 0,
        laborHours: req.body.laborHours || 0,
        laborCost: req.body.laborCost || 0,
        performedBy: req.body.performedBy || '',
        beforePhotos: req.file ? [req.file.path] : (req.body.beforePhotos || []),
        afterPhotos: req.body.afterPhotos || [],
        notes: req.body.notes || '',
        nextScheduledDate: req.body.nextScheduledDate || null,
        equipmentStatusAfter: req.body.equipmentStatusAfter || (equipment ? equipment.status : 'operational'),
        // Legacy support
        activity: req.body.activityDescription || req.body.activity
    });

    try {
        const newRecord = await record.save();
        
        // Update equipment with new maintenance information
        if (equipment) {
            equipment.lastServiceDate = record.date;
            if (req.body.equipmentStatusAfter) {
                equipment.status = record.equipmentStatusAfter;
            }
            
            // Calculate next service date if not provided
            if (req.body.nextScheduledDate) {
                equipment.nextServiceDate = req.body.nextScheduledDate;
            } else if (equipment.maintenanceFrequency) {
                equipment.nextServiceDate = calculateNextMaintenanceDate(
                    record.date,
                    equipment.maintenanceFrequency
                );
            }
            
            await equipment.save();
        }
        
        const populatedRecord = await MaintenanceRecord.findById(newRecord._id).populate('equipmentId');
        res.status(201).json(populatedRecord);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update maintenance record
router.put('/:id', async (req, res) => {
    try {
        const record = await MaintenanceRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        // Update fields
        const fieldsToUpdate = [
            'equipmentId', 'maintenanceType', 'date', 'activityDescription', 'issuesFound',
            'actionsTaken', 'partsReplaced', 'partsCost', 'laborHours', 'laborCost',
            'performedBy', 'beforePhotos', 'afterPhotos', 'notes', 'nextScheduledDate',
            'equipmentStatusAfter', 'activity'
        ];
        
        fieldsToUpdate.forEach(field => {
            if (req.body[field] !== undefined) {
                record[field] = req.body[field];
            }
        });

        const updatedRecord = await record.save();
        const populatedRecord = await MaintenanceRecord.findById(updatedRecord._id).populate('equipmentId');
        res.json(populatedRecord);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete maintenance record
router.delete('/:id', async (req, res) => {
    try {
        const record = await MaintenanceRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }
        await record.deleteOne();
        res.json({ message: 'Record deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
