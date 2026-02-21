// This file manages the maintenance records. It exports functions to log maintenance activities, retrieve records, and display them on the dashboard.

const maintenanceRecords = [];

// Function to log a maintenance activity
function logMaintenance(equipmentId, activity, date) {
    const record = {
        id: maintenanceRecords.length + 1,
        equipmentId,
        activity,
        date: new Date(date).toISOString().split('T')[0] // Format date as YYYY-MM-DD
    };
    maintenanceRecords.push(record);
}

// Function to retrieve all maintenance records
function getMaintenanceRecords() {
    return maintenanceRecords;
}

// Function to display maintenance records on the dashboard
function displayRecords() {
    const recordsContainer = document.getElementById('records-container');
    recordsContainer.innerHTML = ''; // Clear existing records

    maintenanceRecords.forEach(record => {
        const recordElement = document.createElement('div');
        recordElement.className = 'record';
        recordElement.innerHTML = `
            <p><strong>Equipment ID:</strong> ${record.equipmentId}</p>
            <p><strong>Activity:</strong> ${record.activity}</p>
            <p><strong>Date:</strong> ${record.date}</p>
        `;
        recordsContainer.appendChild(recordElement);
    });
}

// Exporting functions for use in other modules
export { logMaintenance, getMaintenanceRecords, displayRecords };