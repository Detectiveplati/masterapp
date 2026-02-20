const equipmentSelect = document.getElementById('equipmentId');
const form = document.getElementById('maintenance-form');
const notice = document.getElementById('notice');
const cancelButton = document.getElementById('cancel-btn');

const summaryContainer = document.getElementById('equipment-summary');
const summaryName = document.getElementById('summary-name');
const summaryId = document.getElementById('summary-id');
const summaryType = document.getElementById('summary-type');
const summaryLocation = document.getElementById('summary-location');
const summaryStatus = document.getElementById('summary-status');

const dateInput = document.getElementById('date');

const statusClassMap = {
    operational: 'pill-operational',
    needs_action: 'pill-broken'
};

function showNotice(message, type) {
    notice.textContent = message;
    notice.className = `notice ${type}`;
    notice.style.display = 'block';
}

function hideNotice() {
    notice.style.display = 'none';
}

function formatStatus(value) {
    if (!value) return 'Unknown';
    if (value === 'needs_action') return 'Needs Action';
    return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function getQueryParam(key) {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
}

function setDefaultDate() {
    const today = new Date();
    const isoDate = today.toISOString().split('T')[0];
    dateInput.value = isoDate;
}

async function loadEquipmentOptions(selectedId) {
    const response = await fetch(`${API_BASE}/equipment`);
    if (!response.ok) {
        throw new Error('Failed to load equipment list');
    }
    const equipment = await response.json();

    if (!equipment || equipment.length === 0) {
        equipmentSelect.innerHTML = '<option value="">No equipment found</option>';
        equipmentSelect.disabled = true;
        return;
    }

    const options = equipment.map(item => {
        const label = `${item.name} (${item.equipmentId || 'No ID'})`;
        return `<option value="${item.equipmentId}">${label}</option>`;
    });

    equipmentSelect.innerHTML = options.join('');

    if (selectedId) {
        equipmentSelect.value = selectedId;
        equipmentSelect.dispatchEvent(new Event('change'));
    }
}

async function loadEquipmentSummary(equipmentId) {
    if (!equipmentId) {
        summaryContainer.style.display = 'none';
        return;
    }

    const response = await fetch(`${API_BASE}/equipment/${equipmentId}`);
    if (!response.ok) {
        summaryContainer.style.display = 'none';
        return;
    }

    const equipment = await response.json();
    summaryName.textContent = equipment.name || 'Equipment';
    summaryId.textContent = equipment.equipmentId || '-';
    summaryType.textContent = equipment.type || '-';
    summaryLocation.textContent = equipment.location || '-';

    const statusValue = equipment.status === 'operational' ? 'operational' : 'needs_action';
    summaryStatus.textContent = formatStatus(statusValue);
    summaryStatus.className = `status-pill ${statusClassMap[statusValue] || 'pill-operational'}`;

    summaryContainer.style.display = 'block';
}

async function handleSubmit(event) {
    event.preventDefault();
    hideNotice();

    const payload = {
        equipmentId: equipmentSelect.value,
        maintenanceType: document.getElementById('maintenanceType').value,
        date: document.getElementById('date').value,
        performedBy: document.getElementById('performedBy').value.trim(),
        activityDescription: document.getElementById('activityDescription').value.trim(),
        actionsTaken: document.getElementById('actionsTaken').value.trim(),
        issuesFound: document.getElementById('issuesFound').value.trim(),
        notes: document.getElementById('notes').value.trim()
    };

    if (!payload.equipmentId) {
        showNotice('Please select equipment before saving.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/maintenance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save maintenance record');
        }

        showNotice('Maintenance record saved successfully.', 'success');

        const redirectId = payload.equipmentId;
        setTimeout(() => {
            window.location.href = `equipment-details.html?id=${redirectId}`;
        }, 1200);
    } catch (error) {
        showNotice(error.message, 'error');
    }
}

async function initializePage() {
    setDefaultDate();

    const equipmentIdParam = getQueryParam('equipmentId');

    try {
        await loadEquipmentOptions(equipmentIdParam);
        if (equipmentIdParam) {
            await loadEquipmentSummary(equipmentIdParam);
        }
    } catch (error) {
        showNotice(error.message, 'error');
    }
}

equipmentSelect.addEventListener('change', event => {
    loadEquipmentSummary(event.target.value);
});

form.addEventListener('submit', handleSubmit);

cancelButton.addEventListener('click', () => {
    const equipmentIdParam = getQueryParam('equipmentId');
    if (equipmentIdParam) {
        window.location.href = `equipment-details.html?id=${equipmentIdParam}`;
        return;
    }
    window.location.href = 'index.html';
});

initializePage();
