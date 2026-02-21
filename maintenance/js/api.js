/**
 * API Client for Maintenance Dashboard
 * Handles all communication with the backend MongoDB database
 * Provides methods for managing equipment, maintenance records, issues, and areas
 * @file api.js
 */

// API client for communicating with the backend MongoDB database

const API_BASE_URL = '';
// Dynamically resolve — works on LAN (:3000), ngrok (no port), or any other host
const _port = window.location.port;
const _base = (_port && _port !== '80' && _port !== '443')
    ? `${window.location.protocol}//${window.location.hostname}:${_port}`
    : `${window.location.protocol}//${window.location.hostname}`;
const API_BASE = `${_base}/api`;

// ========== EQUIPMENT API ==========

/**
 * Fetch all equipment from the database
 * @returns {Promise<Array>} Array of equipment objects
 * @throws {Error} If the fetch fails
 */
async function getAllEquipment() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/equipment`);
        if (!response.ok) throw new Error('Failed to fetch equipment');
        return await response.json();
    } catch (error) {
        console.error('Error fetching equipment:', error);
        throw error;
    }
}

async function getEquipment(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/equipment/${id}`);
        if (!response.ok) throw new Error('Failed to fetch equipment');
        return await response.json();
    } catch (error) {
        console.error('Error fetching equipment:', error);
        throw error;
    }
}

async function createEquipment(name, type, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/equipment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, type, status })
        });
        if (!response.ok) throw new Error('Failed to create equipment');
        return await response.json();
    } catch (error) {
        console.error('Error creating equipment:', error);
        throw error;
    }
}

async function updateEquipment(id, updates) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/equipment/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error('Failed to update equipment');
        return await response.json();
    } catch (error) {
        console.error('Error updating equipment:', error);
        throw error;
    }
}

async function deleteEquipment(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/equipment/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete equipment');
        return await response.json();
    } catch (error) {
        console.error('Error deleting equipment:', error);
        throw error;
    }
}

// ========== MAINTENANCE RECORDS API ==========

async function getAllMaintenanceRecords() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/records`);
        if (!response.ok) throw new Error('Failed to fetch maintenance records');
        return await response.json();
    } catch (error) {
        console.error('Error fetching maintenance records:', error);
        throw error;
    }
}

async function getMaintenanceRecordsByEquipment(equipmentId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/records/equipment/${equipmentId}`);
        if (!response.ok) throw new Error('Failed to fetch maintenance records');
        return await response.json();
    } catch (error) {
        console.error('Error fetching maintenance records:', error);
        throw error;
    }
}

async function getMaintenanceRecord(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/records/${id}`);
        if (!response.ok) throw new Error('Failed to fetch maintenance record');
        return await response.json();
    } catch (error) {
        console.error('Error fetching maintenance record:', error);
        throw error;
    }
}

async function createMaintenanceRecord(equipmentId, activity, date, notes = '', performedBy = '') {
    try {
        const response = await fetch(`${API_BASE_URL}/api/records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ equipmentId, activity, date, notes, performedBy })
        });
        if (!response.ok) throw new Error('Failed to create maintenance record');
        return await response.json();
    } catch (error) {
        console.error('Error creating maintenance record:', error);
        throw error;
    }
}

async function updateMaintenanceRecord(id, updates) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/records/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error('Failed to update maintenance record');
        return await response.json();
    } catch (error) {
        console.error('Error updating maintenance record:', error);
        throw error;
    }
}

async function deleteMaintenanceRecord(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/records/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete maintenance record');
        return await response.json();
    } catch (error) {
        console.error('Error deleting maintenance record:', error);
        throw error;
    }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getAllEquipment,
        getEquipment,
        createEquipment,
        updateEquipment,
        deleteEquipment,
        getAllMaintenanceRecords,
        getMaintenanceRecordsByEquipment,
        getMaintenanceRecord,
        createMaintenanceRecord,
        updateMaintenanceRecord,
        deleteMaintenanceRecord
    };
}
