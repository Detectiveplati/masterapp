// This file serves as the main JavaScript entry point for the maintenance dashboard.
// It initializes the application, sets up event listeners, and manages the overall functionality of the dashboard.

// Auto-detect API base URL: uses current origin for both local and production
// Local: http://localhost:3000/api
// Production: https://your-app.railway.app/api
const API_BASE = `${window.location.origin}/api`;

// Store chart instances
let statusChart = null;
let typeChart = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Maintenance Dashboard is ready.');

    // Initialize application
    initDashboard();

    // Set up event listeners
    setupEventListeners();
});

async function initDashboard() {
    await initializeCharts();
}

async function loadEquipmentList() {
    try {
        const response = await fetch(`${API_BASE}/equipment`);
        const equipment = await response.json();
        
        const listEl = document.getElementById('equipment-list');
        
        if (!equipment || equipment.length === 0) {
            listEl.innerHTML = `
                <p>No equipment found. <a href="api-test.html">Create sample data</a> to get started.</p>
            `;
            return;
        }
        
        listEl.innerHTML = equipment.map(item => `
            <div class="equipment-card">
                <h3>${escapeHtml(item.name)}</h3>
                <p><strong>Type:</strong> ${escapeHtml(item.type)}</p>
                <p><strong>Location:</strong> ${escapeHtml(item.location)}</p>
                ${item.nextServiceDate ? `<p><strong>Next Service:</strong> ${new Date(item.nextServiceDate).toLocaleDateString()}</p>` : ''}
                <p><strong>Equipment ID:</strong> ${escapeHtml(item.equipmentId)}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading equipment:', error);
        document.getElementById('equipment-list').innerHTML = '<p>Error loading equipment data.</p>';
    }
}


function setupEventListeners() {
    const addEquipmentButton = document.getElementById('add-equipment-btn');
        if (addEquipmentButton) {
            addEquipmentButton.addEventListener('click', handleAddEquipment);
        }
    
}

function handleAddEquipment() {
    window.location.href = 'add-equipment.html';

function escapeHtml(value) {
    if (!value) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeStatus(status) {
    if (!status) return 'operational';
    return status === 'operational' ? 'operational' : 'needs_action';
}

function formatStatus(status) {
    const statusMap = {
        'operational': 'Operational',
        'needs_action': 'Needs Action'
    };
    return statusMap[status] || status;
}

async function initializeCharts() {
    try {
        // Fetch equipment data
        const equipmentResponse = await fetch(`${API_BASE}/equipment`);
        const equipment = await equipmentResponse.json();
        
        if (!equipment || equipment.length === 0) {
            console.log('No equipment data available for charts');
            return;
        }

        // Process equipment data for charts
        const chartData = DashboardCharts.processEquipmentData(equipment);
        
        // Destroy existing charts if they exist
        if (statusChart) statusChart.destroy();
        if (typeChart) typeChart.destroy();
        
        // Create type bar chart
        typeChart = DashboardCharts.createTypeBarChart('typeChart', chartData.typeCounts);
        
        console.log('Charts initialized successfully');
    } catch (error) {
        console.error('Error initializing charts:', error);
    }
}
