const express = require('express');
const router = express.Router();
const EquipmentIssue = require('../models/EquipmentIssue');

// Get all issues for a specific equipment
router.get('/equipment/:equipmentId', async (req, res) => {
    try {
        const issues = await EquipmentIssue.find({ equipmentId: req.params.equipmentId })
            .sort({ reportedDate: -1 });
        res.json(issues);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get open issue counts for all equipment (for list view badges)
router.get('/counts', async (req, res) => {
    try {
        const counts = await EquipmentIssue.aggregate([
            { $match: { status: 'open' } },
            { $group: { _id: '$equipmentId', count: { $sum: 1 } } }
        ]);
        // Convert to { equipmentId: count } map
        const result = {};
        counts.forEach(c => { result[c._id] = c.count; });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get all open issues (for all-issues page)
router.get('/all-open', async (req, res) => {
    try {
        const issues = await EquipmentIssue.find({ status: 'open' })
            .sort({ reportedDate: -1 });
        res.json(issues);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Report a new issue
router.post('/', async (req, res) => {
    try {
        const issue = new EquipmentIssue({
            equipmentId: req.body.equipmentId,
            description: req.body.description,
            reportedBy: req.body.reportedBy || 'Anonymous'
        });
        const saved = await issue.save();
        res.status(201).json(saved);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Mark issue as resolved
router.patch('/:id/resolve', async (req, res) => {
    try {
        const issue = await EquipmentIssue.findById(req.params.id);
        if (!issue) return res.status(404).json({ message: 'Issue not found' });

        issue.status = 'resolved';
        issue.resolvedDate = new Date();
        issue.resolvedBy = req.body.resolvedBy || '';
        await issue.save();
        res.json(issue);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete an issue
router.delete('/:id', async (req, res) => {
    try {
        await EquipmentIssue.findByIdAndDelete(req.params.id);
        res.json({ message: 'Issue deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
