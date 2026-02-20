const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const MaintenanceRecord = require('../models/MaintenanceRecord');
const AreaIssue = require('../models/AreaIssue');
const { isMaintenanceOverdue, getDaysUntilMaintenance } = require('../services/maintenance-calculator');

// Get maintenance cost summary
router.get('/costs', async (req, res) => {
    try {
        const { startDate, endDate, equipmentId, groupBy = 'month' } = req.query;
        
        let query = {};
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        if (equipmentId) query.equipmentId = equipmentId;
        
        const records = await MaintenanceRecord.find(query).populate('equipmentId');
        
        // Calculate totals
        let totalCost = 0;
        let totalPartsCost = 0;
        let totalLaborCost = 0;
        let totalLaborHours = 0;
        
        const costByEquipment = {};
        const costByType = {};
        const costByMonth = {};
        
        records.forEach(record => {
            totalCost += record.totalCost || 0;
            totalPartsCost += record.partsCost || 0;
            totalLaborCost += record.laborCost || 0;
            totalLaborHours += record.laborHours || 0;
            
            // By equipment
            if (record.equipmentId) {
                const eqName = record.equipmentId.name;
                if (!costByEquipment[eqName]) {
                    costByEquipment[eqName] = 0;
                }
                costByEquipment[eqName] += record.totalCost || 0;
            }
            
            // By maintenance type
            const type = record.maintenanceType;
            if (!costByType[type]) {
                costByType[type] = 0;
            }
            costByType[type] += record.totalCost || 0;
            
            // By month
            const date = new Date(record.date);
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!costByMonth[monthYear]) {
                costByMonth[monthYear] = 0;
            }
            costByMonth[monthYear] += record.totalCost || 0;
        });
        
        res.json({
            totals: {
                totalCost,
                totalPartsCost,
                totalLaborCost,
                totalLaborHours,
                recordCount: records.length
            },
            costByEquipment,
            costByType,
            costByMonth
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get equipment downtime report
router.get('/downtime', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let query = {};
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        
        const records = await MaintenanceRecord.find(query).populate('equipmentId');
        
        const downtimeByEquipment = {};
        
        records.forEach(record => {
            if (record.equipmentId) {
                const eqName = record.equipmentId.name;
                const eqId = record.equipmentId._id.toString();
                
                if (!downtimeByEquipment[eqId]) {
                    downtimeByEquipment[eqId] = {
                        name: eqName,
                        type: record.equipmentId.type,
                        totalDowntimeHours: 0,
                        incidentCount: 0,
                        emergencyCount: 0
                    };
                }
                
                // Approximate downtime based on labor hours
                downtimeByEquipment[eqId].totalDowntimeHours += record.laborHours || 0;
                downtimeByEquipment[eqId].incidentCount += 1;
                
                if (record.maintenanceType === 'Emergency') {
                    downtimeByEquipment[eqId].emergencyCount += 1;
                }
            }
        });
        
        // Convert to array and sort by downtime
        const downtimeArray = Object.values(downtimeByEquipment)
            .sort((a, b) => b.totalDowntimeHours - a.totalDowntimeHours);
        
        res.json(downtimeArray);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get maintenance compliance report
router.get('/compliance', async (req, res) => {
    try {
        const equipment = await Equipment.find({ nextServiceDate: { $ne: null } });
        
        let totalEquipment = equipment.length;
        let onSchedule = 0;
        let dueWithin7Days = 0;
        let dueWithin30Days = 0;
        let overdue = 0;
        
        const overdueList = [];
        const dueList = [];
        
        equipment.forEach(eq => {
            const daysUntil = getDaysUntilMaintenance(eq.nextServiceDate);
            
            if (daysUntil < 0) {
                overdue++;
                overdueList.push({
                    name: eq.name,
                    type: eq.type,
                    daysOverdue: Math.abs(daysUntil),
                    nextServiceDate: eq.nextServiceDate
                });
            } else if (daysUntil <= 7) {
                dueWithin7Days++;
                dueList.push({
                    name: eq.name,
                    type: eq.type,
                    daysUntil: daysUntil,
                    nextServiceDate: eq.nextServiceDate
                });
            } else if (daysUntil <= 30) {
                dueWithin30Days++;
            } else {
                onSchedule++;
            }
        });
        
        const complianceRate = totalEquipment > 0 
            ? ((totalEquipment - overdue) / totalEquipment * 100).toFixed(2)
            : 100;
        
        res.json({
            summary: {
                totalEquipment,
                onSchedule,
                dueWithin7Days,
                dueWithin30Days,
                overdue,
                complianceRate: parseFloat(complianceRate)
            },
            overdueList: overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue),
            dueList: dueList.sort((a, b) => a.daysUntil - b.daysUntil)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get dashboard statistics (comprehensive)
router.get('/dashboard-stats', async (req, res) => {
    try {
        // Equipment stats
        const totalEquipment = await Equipment.countDocuments();
        const operationalCount = await Equipment.countDocuments({ status: 'operational' });
        const needsActionCount = await Equipment.countDocuments({
            status: { $in: ['needs_action', 'maintenance', 'broken', 'offline'] }
        });
        
        // Issue stats
        const openIssues = await AreaIssue.countDocuments({ status: { $in: ['Open', 'In Progress'] } });
        const criticalIssues = await AreaIssue.countDocuments({ priority: 'Critical', status: { $ne: 'Closed' } });
        
        // Recent issues (last 24 hours)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const recentIssues = await AreaIssue.countDocuments({ 
            reportedDate: { $gte: yesterday } 
        });
        
        // Maintenance due counts
        const equipmentWithDates = await Equipment.find({ nextServiceDate: { $ne: null } });
        let overdueCount = 0;
        let dueThisWeekCount = 0;
        let dueThisMonthCount = 0;
        
        equipmentWithDates.forEach(eq => {
            const daysUntil = getDaysUntilMaintenance(eq.nextServiceDate);
            if (daysUntil < 0) {
                overdueCount++;
            } else if (daysUntil <= 7) {
                dueThisWeekCount++;
            } else if (daysUntil <= 30) {
                dueThisMonthCount++;
            }
        });
        
        // Recent maintenance activities (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const recentMaintenanceCount = await MaintenanceRecord.countDocuments({
            date: { $gte: weekAgo }
        });
        
        res.json({
            equipment: {
                total: totalEquipment,
                operational: operationalCount,
                needsAction: needsActionCount
            },
            maintenance: {
                overdue: overdueCount,
                dueThisWeek: dueThisWeekCount,
                dueThisMonth: dueThisMonthCount,
                completedLastWeek: recentMaintenanceCount
            },
            issues: {
                open: openIssues,
                critical: criticalIssues,
                reportedLast24Hours: recentIssues
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
