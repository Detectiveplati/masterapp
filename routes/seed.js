const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const MaintenanceRecord = require('../models/MaintenanceRecord');
const AreaIssue = require('../models/AreaIssue');
const Area = require('../models/Area');
const { generateEquipmentQRCode, generateAreaQRCode } = require('../services/qr-service');

// Seed sample data
router.post('/all', async (req, res) => {
    try {
        // Clear existing data
        await Equipment.deleteMany({});
        await MaintenanceRecord.deleteMany({});
        await AreaIssue.deleteMany({});
        await Area.deleteMany({});
        
        const baseUrl = process.env.QR_BASE_URL || `${req.protocol}://${req.get('host')}`;
        
        // Create Areas
        const areas = [
            { name: 'Vegetable Preparation Room', description: 'Area for vegetable prep and washing', assignedSupervisor: 'John Doe' },
            { name: 'Main Kitchen', description: 'Main cooking and food preparation area', assignedSupervisor: 'Jane Smith' },
            { name: 'Cold Storage', description: 'Refrigerated storage area', assignedSupervisor: 'Mike Wilson' },
            { name: 'Dishwashing Area', description: 'Commercial dishwashing and cleaning', assignedSupervisor: 'Sarah Brown' },
            { name: 'Dry Storage', description: 'Dry goods and supplies storage', assignedSupervisor: 'Tom Johnson' }
        ];
        
        const createdAreas = [];
        for (const areaData of areas) {
            const area = new Area(areaData);
            await area.save();
            area.qrCode = await generateAreaQRCode(area.areaId, baseUrl);
            await area.save();
            createdAreas.push(area);
        }
        
        // Create Equipment
        const equipmentData = [
            { name: 'Walk-in Freezer #1', type: 'Freezer', brand: 'ThermoKing', modelNumber: 'TK-500', location: 'Cold Storage', status: 'operational', maintenanceFrequency: 90, purchaseCost: 15000 },
            { name: 'Industrial Chiller #1', type: 'Chiller', brand: 'CoolMaster', modelNumber: 'CM-300', location: 'Cold Storage', status: 'operational', maintenanceFrequency: 60, purchaseCost: 8000 },
            { name: 'Commercial Oven #1', type: 'Oven', brand: 'HotPoint', modelNumber: 'HP-700', location: 'Main Kitchen', status: 'operational', maintenanceFrequency: 30, purchaseCost: 12000 },
            { name: 'Deep Fryer #1', type: 'Fryer', brand: 'FryMaster', modelNumber: 'FM-450', location: 'Main Kitchen', status: 'maintenance', maintenanceFrequency: 30, purchaseCost: 5000 },
            { name: 'Industrial Mixer #1', type: 'Mixer', brand: 'MixPro', modelNumber: 'MP-200', location: 'Main Kitchen', status: 'operational', maintenanceFrequency: 45, purchaseCost: 7000 },
            { name: 'Dishwasher #1', type: 'Dishwasher', brand: 'CleanTech', modelNumber: 'CT-800', location: 'Dishwashing Area', status: 'operational', maintenanceFrequency: 30, purchaseCost: 10000 },
            { name: 'Hood Ventilation System', type: 'Hood System', brand: 'AirFlow', modelNumber: 'AF-1000', location: 'Main Kitchen', status: 'operational', maintenanceFrequency: 90, purchaseCost: 20000 },
            { name: 'Warmer Cabinet #1', type: 'Warmer', brand: 'HeatKeep', modelNumber: 'HK-300', location: 'Main Kitchen', status: 'broken', maintenanceFrequency: 60, purchaseCost: 3000 }
        ];
        
        const createdEquipment = [];
        for (const eqData of equipmentData) {
            const equipment = new Equipment(eqData);
            
            // Set some realistic dates
            const daysAgo = Math.floor(Math.random() * 90) + 1;
            equipment.lastServiceDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
            equipment.purchaseDate = new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000); // 2 years ago
            equipment.installationDate = equipment.purchaseDate;
            equipment.expectedLifespan = 10;
            
            await equipment.save();
            equipment.qrCode = await generateEquipmentQRCode(equipment.equipmentId, baseUrl);
            await equipment.save();
            createdEquipment.push(equipment);
        }
        
        // Create Maintenance Records
        const maintenanceTypes = ['Routine Check', 'Repair', 'Preventive', 'Cleaning', 'Part Replacement'];
        
        for (let i = 0; i < 15; i++) {
            const randomEquipment = createdEquipment[Math.floor(Math.random() * createdEquipment.length)];
            const daysAgo = Math.floor(Math.random() * 60) + 1;
            
            const record = new MaintenanceRecord({
                equipmentId: randomEquipment._id,
                maintenanceType: maintenanceTypes[Math.floor(Math.random() * maintenanceTypes.length)],
                date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
                activityDescription: `Performed ${maintenanceTypes[Math.floor(Math.random() * maintenanceTypes.length)].toLowerCase()} on ${randomEquipment.name}`,
                actionsTaken: 'Inspected all components, cleaned filters, tested functionality',
                partsReplaced: Math.random() > 0.7 ? ['Filter', 'Gasket'] : [],
                partsCost: Math.random() > 0.7 ? Math.floor(Math.random() * 500) + 50 : 0,
                laborHours: Math.floor(Math.random() * 4) + 1,
                laborCost: (Math.floor(Math.random() * 4) + 1) * 50,
                performedBy: ['John Technician', 'Mike Mechanic', 'Sarah Service'][Math.floor(Math.random() * 3)],
                equipmentStatusAfter: 'operational'
            });
            
            await record.save();
        }
        
        // Create Area Issues
        const issueCategories = ['Plumbing', 'Electrical', 'HVAC', 'Structural', 'Cleaning', 'Safety Hazard'];
        const priorities = ['Low', 'Medium', 'High', 'Critical'];
        const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
        
        const issues = [
            { area: 'Vegetable Preparation Room', category: 'Plumbing', title: 'Leaking faucet near sink #2', description: 'Water dripping from faucet handle, needs replacement', priority: 'Medium', status: 'Open' },
            { area: 'Main Kitchen', category: 'Electrical', title: 'Outlet not working', description: 'Power outlet near prep station is not functioning', priority: 'High', status: 'In Progress' },
            { area: 'Cold Storage', category: 'HVAC', title: 'Temperature fluctuation', description: 'Cold storage temperature varying between 2-6°C', priority: 'Critical', status: 'Open' },
            { area: 'Dishwashing Area', category: 'Plumbing', title: 'Drain clogged', description: 'Floor drain backing up during peak hours', priority: 'High', status: 'Resolved' },
            { area: 'Dry Storage', category: 'Structural', title: 'Damaged shelf', description: 'Middle shelf on west wall is sagging', priority: 'Low', status: 'Open' },
            { area: 'Main Kitchen', category: 'Safety Hazard', title: 'Wet floor near dishwasher', description: 'Constant puddle forming, slip hazard', priority: 'High', status: 'In Progress' }
        ];
        
        for (const issueData of issues) {
            const daysAgo = Math.floor(Math.random() * 30) + 1;
            const issue = new AreaIssue({
                ...issueData,
                reportedBy: ['Staff A', 'Staff B', 'Chef C', 'Manager D'][Math.floor(Math.random() * 4)],
                contactNumber: '+1234567890',
                reportedDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
                specificLocation: 'Near main entrance'
            });
            
            await issue.save();
        }
        
        res.json({
            message: 'Sample data created successfully',
            data: {
                areas: createdAreas.length,
                equipment: createdEquipment.length,
                maintenanceRecords: 15,
                issues: issues.length
            }
        });
    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Clear all data
router.delete('/all', async (req, res) => {
    try {
        await Equipment.deleteMany({});
        await MaintenanceRecord.deleteMany({});
        await AreaIssue.deleteMany({});
        await Area.deleteMany({});
        
        res.json({ message: 'All data cleared successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
