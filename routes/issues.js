const express = require('express');
const router = express.Router();
const AreaIssue = require('../models/AreaIssue');
const { createIssueReportedNotification } = require('../services/notification-service');
const { memUpload, uploadBufferToCloudinary } = require('../services/cloudinary-upload');

// Get all issues with optional filters
router.get('/', async (req, res) => {
    try {
        const { area, category, priority, status, search } = req.query;
        let query = {};
        
        if (area) query.area = area;
        if (category) query.category = category;
        if (priority) query.priority = priority;
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { issueId: { $regex: search, $options: 'i' } }
            ];
        }
        
        const issues = await AreaIssue.find(query)
            .populate('relatedMaintenanceRecords')
            .sort({ reportedDate: -1 });
            
        res.json(issues);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get open issues
router.get('/open', async (req, res) => {
    try {
        const issues = await AreaIssue.find({ 
            status: { $in: ['Open', 'In Progress'] } 
        })
        .populate('relatedMaintenanceRecords')
        .sort({ priority: 1, reportedDate: -1 });
        
        res.json(issues);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get issues for specific area
router.get('/area/:area', async (req, res) => {
    try {
        const issues = await AreaIssue.find({ area: req.params.area })
            .populate('relatedMaintenanceRecords')
            .sort({ reportedDate: -1 });
            
        res.json(issues);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get single issue
router.get('/:id', async (req, res) => {
    try {
        const issue = await AreaIssue.findById(req.params.id)
            .populate('relatedMaintenanceRecords');
            
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }
        res.json(issue);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new issue (report issue)
router.post('/', (req, res, next) => {
    memUpload('image')(req, res, (err) => {
        if (err) console.error('[Area Issues] Multipart parse error:', err.message);
        next();
    });
}, async (req, res) => {
    try {
        // Upload image first (with timeout) so it's included from the start
        const photos = req.body.photos ? (Array.isArray(req.body.photos) ? req.body.photos : [req.body.photos]) : [];
        if (req.file) {
            const url = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, 'maintenance/area-issues');
            if (url) photos.push(url);
        }

        const issue = new AreaIssue({
            area: req.body.area,
            category: req.body.category,
            title: req.body.title,
            description: req.body.description,
            priority: req.body.priority || 'Medium',
            status: req.body.status || 'Open',
            photos,
            reportedBy: req.body.reportedBy,
            contactNumber: req.body.contactNumber,
            reportedDate: req.body.reportedDate || Date.now(),
            specificLocation: req.body.specificLocation,
            assignedTo: req.body.assignedTo
        });

        const newIssue = await issue.save();
        await createIssueReportedNotification(newIssue);
        res.status(201).json(newIssue);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update issue (status, assignment, resolution, etc.)
router.put('/:id', async (req, res) => {
    try {
        const issue = await AreaIssue.findById(req.params.id);
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        // Update fields
        const fieldsToUpdate = [
            'area', 'category', 'title', 'description', 'priority', 'status',
            'photos', 'reportedBy', 'contactNumber', 'specificLocation', 
            'assignedTo', 'resolutionNotes', 'resolvedDate', 'relatedMaintenanceRecords'
        ];
        
        fieldsToUpdate.forEach(field => {
            if (req.body[field] !== undefined) {
                issue[field] = req.body[field];
            }
        });
        
        // Auto-set resolvedDate if status changed to Resolved
        if (req.body.status === 'Resolved' && !issue.resolvedDate) {
            issue.resolvedDate = new Date();
        }

        const updatedIssue = await issue.save();
        const populatedIssue = await AreaIssue.findById(updatedIssue._id)
            .populate('relatedMaintenanceRecords');
            
        res.json(populatedIssue);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete issue
router.delete('/:id', async (req, res) => {
    try {
        const issue = await AreaIssue.findById(req.params.id);
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }
        await issue.deleteOne();
        res.json({ message: 'Issue deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
