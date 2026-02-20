const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// Get all notifications (unread first)
router.get('/', async (req, res) => {
    try {
        const { read } = req.query;
        let query = {};
        
        if (read !== undefined) {
            query.read = read === 'true';
        }
        
        const notifications = await Notification.find(query)
            .populate('relatedEquipment')
            .populate('relatedIssue')
            .sort({ read: 1, createdAt: -1 })
            .limit(50);
            
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get unread count
router.get('/unread-count', async (req, res) => {
    try {
        const count = await Notification.countDocuments({ read: false });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Mark notification as read
router.post('/mark-read/:id', async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        
        notification.read = true;
        await notification.save();
        
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Mark all notifications as read
router.post('/mark-all-read', async (req, res) => {
    try {
        await Notification.updateMany({ read: false }, { read: true });
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete notification
router.delete('/:id', async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        await notification.deleteOne();
        res.json({ message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
