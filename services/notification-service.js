const Notification = require('../models/Notification');

/**
 * Create a notification
 * @param {Object} notificationData - The notification data
 * @returns {Promise<Object>} - The created notification
 */
async function createNotification(notificationData) {
    try {
        const notification = new Notification(notificationData);
        await notification.save();
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
}

/**
 * Create overdue maintenance notification
 * @param {Object} equipment - The equipment object
 * @returns {Promise<Object>} - The created notification
 */
async function createOverdueNotification(equipment) {
    const daysOverdue = Math.abs(getDaysUntilMaintenance(equipment.nextServiceDate));
    
    return await createNotification({
        type: 'overdue',
        title: 'Maintenance Overdue',
        message: `Equipment "${equipment.name}" is ${daysOverdue} days overdue for maintenance.`,
        relatedEquipment: equipment._id
    });
}

/**
 * Create upcoming maintenance notification
 * @param {Object} equipment - The equipment object
 * @returns {Promise<Object>} - The created notification
 */
async function createUpcomingNotification(equipment) {
    const daysUntil = getDaysUntilMaintenance(equipment.nextServiceDate);
    
    return await createNotification({
        type: 'upcoming',
        title: 'Maintenance Due Soon',
        message: `Equipment "${equipment.name}" is due for maintenance in ${daysUntil} days.`,
        relatedEquipment: equipment._id
    });
}

/**
 * Create issue reported notification
 * @param {Object} issue - The area issue object
 * @returns {Promise<Object>} - The created notification
 */
async function createIssueReportedNotification(issue) {
    const type = issue.priority === 'Critical' ? 'critical' : 'issue-reported';
    
    return await createNotification({
        type: type,
        title: `${issue.priority} Issue Reported`,
        message: `New issue in ${issue.area}: ${issue.title}`,
        relatedIssue: issue._id
    });
}

/**
 * Helper function to calculate days until maintenance
 */
function getDaysUntilMaintenance(nextServiceDate) {
    if (!nextServiceDate) {
        return null;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const serviceDate = new Date(nextServiceDate);
    serviceDate.setHours(0, 0, 0, 0);
    
    const diffTime = serviceDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

module.exports = {
    createNotification,
    createOverdueNotification,
    createUpcomingNotification,
    createIssueReportedNotification
};
