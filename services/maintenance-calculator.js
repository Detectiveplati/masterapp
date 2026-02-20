/**
 * Calculate next maintenance date
 * @param {Date} lastServiceDate - The last service date
 * @param {number} frequencyInDays - Maintenance frequency in days
 * @returns {Date} - The next scheduled maintenance date
 */
function calculateNextMaintenanceDate(lastServiceDate, frequencyInDays) {
    if (!lastServiceDate || !frequencyInDays) {
        return null;
    }
    
    const nextDate = new Date(lastServiceDate);
    nextDate.setDate(nextDate.getDate() + frequencyInDays);
    return nextDate;
}

/**
 * Check if equipment is overdue for maintenance
 * @param {Date} nextServiceDate - The next scheduled service date
 * @returns {boolean} - True if overdue
 */
function isMaintenanceOverdue(nextServiceDate) {
    if (!nextServiceDate) {
        return false;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const serviceDate = new Date(nextServiceDate);
    serviceDate.setHours(0, 0, 0, 0);
    
    return serviceDate < today;
}

/**
 * Get days until next maintenance
 * @param {Date} nextServiceDate - The next scheduled service date
 * @returns {number} - Days until maintenance (negative if overdue)
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

/**
 * Check if maintenance is due within specified days
 * @param {Date} nextServiceDate - The next scheduled service date
 * @param {number} withinDays - Number of days to check
 * @returns {boolean} - True if maintenance is due within the specified days
 */
function isMaintenanceDueWithin(nextServiceDate, withinDays) {
    const daysUntil = getDaysUntilMaintenance(nextServiceDate);
    if (daysUntil === null) {
        return false;
    }
    
    return daysUntil >= 0 && daysUntil <= withinDays;
}

module.exports = {
    calculateNextMaintenanceDate,
    isMaintenanceOverdue,
    getDaysUntilMaintenance,
    isMaintenanceDueWithin
};
