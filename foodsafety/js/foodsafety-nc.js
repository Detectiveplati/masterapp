// Food Safety NC Frontend Logic

// --- Report NC Form Submission ---
if (document.getElementById('ncForm')) {
  document.getElementById('ncForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      unit: form.unit.value,
      specificLocation: form.specificLocation.value,
      description: form.description.value,
      priority: form.priority.value,
      reportedBy: form.reportedBy.value
    };
    // TODO: handle photo upload
    try {
      const res = await fetch('/api/foodsafety/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to submit');
      alert('NC report submitted!');
      window.location.href = 'nc-list.html';
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

// --- List NCs ---
if (document.getElementById('ncList')) {
  async function loadNCs() {
    const unit = document.getElementById('filterUnit').value;
    const status = document.getElementById('filterStatus').value;
    let url = '/api/foodsafety/list?';
    if (unit) url += 'unit=' + encodeURIComponent(unit) + '&';
    if (status) url += 'status=' + encodeURIComponent(status);
    const res = await fetch(url);
    const ncs = await res.json();
    const list = document.getElementById('ncList');
    list.innerHTML = ncs.length ? ncs.map(nc => `
      <div class="nc-card">
        <div><b>Area:</b> ${nc.unit}</div>
        <div><b>Description:</b> ${nc.description}</div>
        <div><b>Status:</b> ${nc.status}</div>
        <div><a href="nc-detail.html?id=${nc._id}">View / Resolve</a></div>
      </div>
    `).join('') : '<p>No NC reports found.</p>';
  }
  document.getElementById('filterUnit').addEventListener('change', loadNCs);
  document.getElementById('filterStatus').addEventListener('change', loadNCs);
  loadNCs();
}

// --- NC Detail & Resolution ---
if (document.getElementById('ncDetail')) {
  async function loadDetail() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;
    const res = await fetch('/api/foodsafety/' + id);
    const nc = await res.json();
    document.getElementById('ncDetail').innerHTML = `
      <div><b>Area:</b> ${nc.unit}</div>
      <div><b>Location:</b> ${nc.specificLocation || '-'}</div>
      <div><b>Description:</b> ${nc.description}</div>
      <div><b>Priority:</b> ${nc.priority}</div>
      <div><b>Status:</b> ${nc.status}</div>
      <div><b>Reported By:</b> ${nc.reportedBy}</div>
      <div><b>Reported At:</b> ${new Date(nc.createdAt).toLocaleString()}</div>
      ${nc.photo ? `<div><img src="${nc.photo}" style="max-width:200px;"></div>` : ''}
      ${nc.status === 'Resolved' && nc.resolution ? `
        <div style="margin-top:18px;"><b>Resolution:</b></div>
        <div><b>By:</b> ${nc.resolution.resolver || '-'}</div>
        <div><b>Notes:</b> ${nc.resolution.notes || '-'}</div>
        <div><b>At:</b> ${nc.resolution.resolvedAt ? new Date(nc.resolution.resolvedAt).toLocaleString() : '-'}</div>
        ${nc.resolution.photo ? `<div><img src="${nc.resolution.photo}" style="max-width:200px;"></div>` : ''}
      ` : ''}
    `;
    if (nc.status === 'Resolved') document.getElementById('resolutionForm').style.display = 'none';
  }
  loadDetail();
  // --- Resolution form ---
  document.getElementById('resolutionForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const data = {
      resolver: this.resolver.value,
      notes: this.resolutionNotes.value
      // TODO: handle photo upload
    };
    try {
      const res = await fetch('/api/foodsafety/' + id + '/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to resolve');
      alert('Marked as resolved!');
      window.location.reload();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}
